import { Router, Request, Response } from 'express';
import { previewMerge, executeMerge, MergeConfig } from '../mergeService';
import { Pool } from 'pg';

const router = Router();
const db = new Pool({ connectionString: process.env.DATABASE_URL });

// Verify that both accounts belong to the authenticated user
async function checkOwnership(
  userId: string,
  accountIds: string[],
  db: Pool
): Promise<boolean> {
  const result = await db.query(
    `SELECT COUNT(*) FROM accounts
     WHERE id = ANY($1::uuid[]) AND owner_user_id = $2`,
    [accountIds, userId]
  );
  return parseInt(result.rows[0].count) === accountIds.length;
}

// Check if these two accounts were already merged
async function alreadyMerged(
  mainId: string,
  secondaryId: string,
  db: Pool
): Promise<boolean> {
  const result = await db.query(
    `SELECT id FROM merge_logs
     WHERE main_account_id = $1
       AND secondary_account_id = $2
       AND status = 'completed'`,
    [mainId, secondaryId]
  );
  return result.rows.length > 0;
}

// GET /merge/preview
router.post('/preview', async (req: Request, res: Response) => {
  try {
    const { mainId, secondaryId, config } = req.body;

    if (!mainId || !secondaryId || !config) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const owned = await checkOwnership(req.user.id, [mainId, secondaryId], db);
    if (!owned) {
      return res.status(403).json({ error: 'You do not own both accounts' });
    }

    const preview = await previewMerge(mainId, secondaryId, config, db);
    res.json(preview);

  } catch (err) {
    res.status(500).json({ error: 'Failed to generate preview' });
  }
});

// POST /merge/execute
router.post('/execute', async (req: Request, res: Response) => {
  try {
    const { mainId, secondaryId, config }: {
      mainId: string;
      secondaryId: string;
      config: MergeConfig;
    } = req.body;

    if (!mainId || !secondaryId || !config) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (mainId === secondaryId) {
      return res.status(400).json({ error: 'Cannot merge an account with itself' });
    }

    const owned = await checkOwnership(req.user.id, [mainId, secondaryId], db);
    if (!owned) {
      return res.status(403).json({ error: 'You do not own both accounts' });
    }

    const merged = await alreadyMerged(mainId, secondaryId, db);
    if (merged) {
      return res.status(400).json({ error: 'These accounts have already been merged' });
    }

    await executeMerge(mainId, secondaryId, config, db);
    res.json({ success: true, message: 'Accounts merged successfully' });

  } catch (err) {
    res.status(500).json({ error: 'Merge failed. No data was changed.' });
  }
});

export default router;
