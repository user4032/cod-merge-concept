-- Player accounts
CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activision_id VARCHAR UNIQUE NOT NULL,
  platform VARCHAR NOT NULL CHECK (platform IN ('xbox', 'steam', 'psn', 'battlenet')),
  username VARCHAR NOT NULL,
  level INT DEFAULT 1,
  cod_points INT DEFAULT 0,
  status VARCHAR DEFAULT 'active' CHECK (status IN ('active', 'deactivated')),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Cosmetic items (skins, blueprints, camos)
CREATE TABLE inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
  item_id VARCHAR NOT NULL,
  item_name VARCHAR NOT NULL,
  item_type VARCHAR NOT NULL CHECK (item_type IN ('operator_skin', 'weapon_blueprint', 'camo', 'emblem', 'calling_card')),
  platform_exclusive BOOLEAN DEFAULT FALSE,
  acquired_at TIMESTAMP DEFAULT NOW()
);

-- Progress tracking
CREATE TABLE progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
  category VARCHAR NOT NULL,
  key VARCHAR NOT NULL,
  value JSONB NOT NULL,
  UNIQUE(account_id, category, key)
);

-- Battle pass state
CREATE TABLE battle_pass (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
  season INT NOT NULL,
  tier INT DEFAULT 0,
  owned BOOLEAN DEFAULT FALSE
);

-- Merge history log
CREATE TABLE merge_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  main_account_id UUID REFERENCES accounts(id),
  secondary_account_id UUID REFERENCES accounts(id),
  config JSONB NOT NULL,
  status VARCHAR DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);
