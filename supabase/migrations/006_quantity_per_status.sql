-- Add per-status quantity columns to products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS available_qty INTEGER DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS sold_qty INTEGER DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS donated_qty INTEGER DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS lost_qty INTEGER DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS expired_qty INTEGER DEFAULT 0;

-- Migrate existing data based on current status
UPDATE products SET available_qty = quantity WHERE status = 'available';
UPDATE products SET available_qty = quantity WHERE status IN ('reserved', 'promotional');
UPDATE products SET sold_qty = quantity WHERE status = 'sold';
UPDATE products SET donated_qty = quantity WHERE status = 'donated';
UPDATE products SET lost_qty = quantity WHERE status = 'lost';
UPDATE products SET expired_qty = quantity WHERE status = 'expired';
-- status='review': all qtys stay 0, reviewQty = quantity - 0 = quantity
