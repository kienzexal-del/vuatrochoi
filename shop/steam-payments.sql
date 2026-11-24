CREATE TABLE IF NOT EXISTS steam_stock (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  username TEXT NOT NULL,
  password TEXT NOT NULL,
  order_id TEXT UNIQUE
);
CREATE TABLE IF NOT EXISTS steam_orders (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  product_id TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  status TEXT NOT NULL DEFAULT 'PENDING',
  request_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(owner, request_id)
);
CREATE TABLE IF NOT EXISTS steam_transactions (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL UNIQUE,
  amount INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER IF NOT EXISTS steam_payment_received
AFTER INSERT ON steam_transactions
BEGIN
  UPDATE steam_orders SET status = 'PAID'
    WHERE id = NEW.order_id AND amount = NEW.amount AND status = 'PENDING';
END;
DROP TRIGGER IF EXISTS steam_release_account;
CREATE TRIGGER steam_release_account
AFTER UPDATE OF status ON steam_orders
WHEN NEW.status = 'PAID' AND OLD.status = 'PENDING'
BEGIN
  UPDATE steam_stock SET order_id = NEW.id
    WHERE id = (SELECT s.id FROM steam_stock s
      WHERE s.product_id = NEW.product_id AND s.order_id IS NULL
      AND NOT EXISTS (SELECT 1 FROM steam_stock used
        WHERE used.username=s.username AND used.order_id IS NOT NULL)
      ORDER BY s.id LIMIT 1);
END;
