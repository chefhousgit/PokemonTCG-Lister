CREATE TABLE IF NOT EXISTS accounts (
  id SERIAL PRIMARY KEY,
  external_key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  in_game_handle TEXT,
  friend_id TEXT,
  emulator_instance TEXT,
  friend_slots_total INTEGER NOT NULL DEFAULT 10,
  friend_slots_used INTEGER NOT NULL DEFAULT 0,
  trade_currency INTEGER NOT NULL DEFAULT 0,
  packs_opened INTEGER NOT NULL DEFAULT 0,
  health TEXT NOT NULL DEFAULT 'active' CHECK (health IN ('active', 'cooldown', 'flagged', 'retired')),
  priority_weight INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  last_heartbeat_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cards (
  id SERIAL PRIMARY KEY,
  card_id TEXT NOT NULL UNIQUE,
  set_code TEXT,
  number TEXT,
  name TEXT NOT NULL,
  rarity TEXT NOT NULL DEFAULT 'unknown',
  variant TEXT NOT NULL DEFAULT '00',
  tradeable BOOLEAN NOT NULL DEFAULT TRUE,
  trade_cost INTEGER NOT NULL DEFAULT 0,
  image_ref TEXT
);

CREATE TABLE IF NOT EXISTS inventory_items (
  id SERIAL PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  card_id INTEGER NOT NULL REFERENCES cards(id),
  qty INTEGER NOT NULL DEFAULT 0,
  reserved_qty INTEGER NOT NULL DEFAULT 0,
  acquired_at TIMESTAMPTZ,
  source TEXT,
  UNIQUE (account_id, card_id)
);

CREATE TABLE IF NOT EXISTS listings (
  id SERIAL PRIMARY KEY,
  card_id INTEGER NOT NULL REFERENCES cards(id),
  title TEXT NOT NULL,
  description TEXT,
  price NUMERIC,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'reserved', 'sold', 'cancelled')),
  max_quantity INTEGER NOT NULL DEFAULT 1,
  external_id TEXT,
  adapter_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  listing_id INTEGER REFERENCES listings(id),
  buyer_handle TEXT,
  buyer_friend_id TEXT,
  price_paid NUMERIC,
  marketplace_ref TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory_reservations (
  id SERIAL PRIMARY KEY,
  inventory_item_id INTEGER NOT NULL REFERENCES inventory_items(id),
  listing_id INTEGER REFERENCES listings(id),
  order_id INTEGER REFERENCES orders(id),
  qty INTEGER NOT NULL DEFAULT 1,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trade_jobs (
  id SERIAL PRIMARY KEY,
  order_id INTEGER REFERENCES orders(id),
  source_account_id INTEGER REFERENCES accounts(id),
  target_friend_id TEXT,
  card_id INTEGER REFERENCES cards(id),
  expected_return TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  claimed_by_agent TEXT,
  claimed_at TIMESTAMPTZ,
  heartbeat_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS friend_links (
  id SERIAL PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  buyer_friend_id TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'requested' CHECK (state IN ('requested', 'accepted', 'traded', 'removed')),
  job_id INTEGER REFERENCES trade_jobs(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS job_events (
  id SERIAL PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES trade_jobs(id),
  ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor TEXT NOT NULL,
  type TEXT NOT NULL,
  payload_json TEXT,
  screenshot_ref TEXT
);

CREATE TABLE IF NOT EXISTS ptcgpb_paths (
  id SERIAL PRIMARY KEY,
  label TEXT NOT NULL,
  folder_path TEXT NOT NULL UNIQUE,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS import_previews (
  id SERIAL PRIMARY KEY,
  diff_json TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS trade_jobs_status_account_idx ON trade_jobs (status, source_account_id);
CREATE INDEX IF NOT EXISTS job_events_job_ts_idx ON job_events (job_id, ts);
