import { Pool, PoolClient } from 'pg';

export type MergeAction = 'merge' | 'main' | 'skip';

export interface MergeConfig {
  skins:    MergeAction;
  level:    MergeAction;
  weapons:  MergeAction;
  battlePass: MergeAction;
  codPoints: MergeAction;
  stats:    MergeAction;
}

export interface MergePreview {
  mainAccount:      Account;
  secondaryAccount: Account;
  diff: {
    uniqueSkinsToAdd:    number;
    uniqueWeaponsToAdd:  number;
    levelAfterMerge:     number;
    codPointsAfterMerge: number;
    battlePassAfterMerge: { season: number; tier: number };
  };
}

interface Account {
  id: string;
  username: string;
  platform: string;
  level: number;
  cod_points: number;
}

// Preview — reads data only, no changes
export async function previewMerge(
  mainId: string,
  secondaryId: string,
  config: MergeConfig,
  db: Pool
): Promise<MergePreview> {
  const [main, secondary] = await Promise.all([
    db.query('SELECT * FROM accounts WHERE id = $1', [mainId]),
    db.query('SELECT * FROM accounts WHERE id = $1', [secondaryId])
  ]);

  const [mainSkins, secSkins] = await Promise.all([
    db.query(`SELECT item_id FROM inventory WHERE account_id = $1 AND item_type = 'operator_skin'`, [mainId]),
    db.query(`SELECT item_id FROM inventory WHERE account_id = $1 AND item_type = 'operator_skin'`, [secondaryId])
  ]);

  const [mainWeapons, secWeapons] = await Promise.all([
    db.query(`SELECT item_id FROM inventory WHERE account_id = $1 AND item_type = 'weapon_blueprint'`, [mainId]),
    db.query(`SELECT item_id FROM inventory WHERE account_id = $1 AND item_type = 'weapon_blueprint'`, [secondaryId])
  ]);

  const mainSkinIds = new Set(mainSkins.rows.map((r: any) => r.item_id));
  const mainWeaponIds = new Set(mainWeapons.rows.map((r: any) => r.item_id));

  const uniqueSkins = secSkins.rows.filter((r: any) => !mainSkinIds.has(r.item_id));
  const uniqueWeapons = secWeapons.rows.filter((r: any) => !mainWeaponIds.has(r.item_id));

  const mainAcc = main.rows[0];
  const secAcc = secondary.rows[0];

  const [mainBP, secBP] = await Promise.all([
    db.query('SELECT * FROM battle_pass WHERE account_id = $1 ORDER BY season DESC LIMIT 1', [mainId]),
    db.query('SELECT * FROM battle_pass WHERE account_id = $1 ORDER BY season DESC LIMIT 1', [secondaryId])
  ]);

  const bestBP = (mainBP.rows[0]?.season > secBP.rows[0]?.season)
    ? mainBP.rows[0]
    : secBP.rows[0];

  return {
    mainAccount: mainAcc,
    secondaryAccount: secAcc,
    diff: {
      uniqueSkinsToAdd:    uniqueSkins.length,
      uniqueWeaponsToAdd:  uniqueWeapons.length,
      levelAfterMerge:     Math.max(mainAcc.level, secAcc.level),
      codPointsAfterMerge: mainAcc.cod_points + secAcc.cod_points,
      battlePassAfterMerge: { season: bestBP?.season ?? 0, tier: bestBP?.tier ?? 0 }
    }
  };
}

// Execute — runs inside a single transaction
export async function executeMerge(
  mainId: string,
  secondaryId: string,
  config: MergeConfig,
  db: Pool
): Promise<void> {
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    // 1. Inventory — merge unique items only
    if (config.skins === 'merge' || config.weapons === 'merge') {
      const types: string[] = [];
      if (config.skins === 'merge')   types.push('operator_skin');
      if (config.weapons === 'merge') types.push('weapon_blueprint', 'camo');

      await client.query(`
        INSERT INTO inventory (id, account_id, item_id, item_name, item_type, platform_exclusive)
        SELECT gen_random_uuid(), $1, item_id, item_name, item_type, platform_exclusive
        FROM inventory
        WHERE account_id = $2
          AND item_type = ANY($3::text[])
          AND platform_exclusive = FALSE
          AND item_id NOT IN (
            SELECT item_id FROM inventory WHERE account_id = $1
          )
      `, [mainId, secondaryId, types]);
    }

    // 2. Level — take the higher value
    if (config.level === 'merge') {
      await client.query(`
        UPDATE accounts
        SET level = GREATEST(
          (SELECT level FROM accounts WHERE id = $1),
          (SELECT level FROM accounts WHERE id = $2)
        )
        WHERE id = $1
      `, [mainId, secondaryId]);
    }

    // 3. CoD Points — sum both accounts
    if (config.codPoints === 'merge') {
      await client.query(`
        UPDATE accounts a1
        SET cod_points = a1.cod_points + a2.cod_points
        FROM accounts a2
        WHERE a1.id = $1 AND a2.id = $2
      `, [mainId, secondaryId]);
    }

    // 4. Battle Pass — take the highest season/tier
    if (config.battlePass === 'merge') {
      await client.query(`
        INSERT INTO battle_pass (id, account_id, season, tier, owned)
        SELECT gen_random_uuid(), $1, season, tier, owned
        FROM battle_pass
        WHERE account_id = $2
          AND season NOT IN (SELECT season FROM battle_pass WHERE account_id = $1)
      `, [mainId, secondaryId]);
    }

    // 5. Stats — sum numeric values
    if (config.stats === 'merge') {
      await client.query(`
        INSERT INTO progress (id, account_id, category, key, value)
        SELECT gen_random_uuid(), $1, p2.category, p2.key,
               to_jsonb(COALESCE((p1.value::text)::int, 0) + (p2.value::text)::int)
        FROM progress p2
        LEFT JOIN progress p1
          ON p1.account_id = $1 AND p1.key = p2.key AND p1.category = p2.category
        WHERE p2.account_id = $2 AND p2.category = 'stats'
        ON CONFLICT (account_id, category, key)
          DO UPDATE SET value = EXCLUDED.value
      `, [mainId, secondaryId]);
    }

    // 6. Log the merge
    await client.query(`
      INSERT INTO merge_logs (main_account_id, secondary_account_id, config, status, completed_at)
      VALUES ($1, $2, $3, 'completed', NOW())
    `, [mainId, secondaryId, JSON.stringify(config)]);

    // 7. Deactivate secondary account
    await client.query(
      `UPDATE accounts SET status = 'deactivated' WHERE id = $1`,
      [secondaryId]
    );

    await client.query('COMMIT');

  } catch (err) {
    await client.query('ROLLBACK');
    await db.query(`
      INSERT INTO merge_logs (main_account_id, secondary_account_id, config, status, error_message)
      VALUES ($1, $2, $3, 'failed', $4)
    `, [mainId, secondaryId, JSON.stringify(config), (err as Error).message]);
    throw err;
  } finally {
    client.release();
  }
}
