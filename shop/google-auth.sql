CREATE TABLE IF NOT EXISTS shop_sessions (
    id_hash TEXT PRIMARY KEY,
    google_sub TEXT NOT NULL,
    expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS shop_sessions_expiry ON shop_sessions (expires_at);

CREATE TABLE IF NOT EXISTS shop_orders (
    owner TEXT NOT NULL,
    request_id TEXT NOT NULL,
    order_id TEXT UNIQUE,
    order_token TEXT,
    plan TEXT NOT NULL,
    amount INTEGER NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (owner, request_id)
);
CREATE INDEX IF NOT EXISTS shop_orders_history ON shop_orders (owner, created_at DESC);
