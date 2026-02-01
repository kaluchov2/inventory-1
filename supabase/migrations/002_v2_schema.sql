-- ============================================
-- V2 Schema Migration
-- Adds: drops, staff tables
-- Updates: products with new columns
-- NOTE: Uses TEXT for IDs to match app's generateId() format
-- ============================================

-- ============================================
-- 1. Create DROPS table
-- ============================================
CREATE TABLE IF NOT EXISTS public.drops (
  id TEXT PRIMARY KEY,
  drop_number TEXT NOT NULL UNIQUE,
  arrival_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived')),

  -- Stats (computed from products)
  total_products INTEGER NOT NULL DEFAULT 0,
  total_units INTEGER NOT NULL DEFAULT 0,
  total_value DECIMAL(12,2) NOT NULL DEFAULT 0,
  sold_count INTEGER NOT NULL DEFAULT 0,
  available_count INTEGER NOT NULL DEFAULT 0,

  notes TEXT,

  -- Timestamps and audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT,
  updated_by TEXT,

  -- Soft delete
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMPTZ
);

-- Index for common queries
CREATE INDEX IF NOT EXISTS idx_drops_drop_number ON public.drops(drop_number);
CREATE INDEX IF NOT EXISTS idx_drops_status ON public.drops(status);
CREATE INDEX IF NOT EXISTS idx_drops_is_deleted ON public.drops(is_deleted);

-- RLS policies for drops
ALTER TABLE public.drops ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated read access to drops" ON public.drops;
CREATE POLICY "Allow authenticated read access to drops" ON public.drops
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow authenticated insert to drops" ON public.drops;
CREATE POLICY "Allow authenticated insert to drops" ON public.drops
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated update to drops" ON public.drops;
CREATE POLICY "Allow authenticated update to drops" ON public.drops
  FOR UPDATE TO authenticated USING (true);


-- ============================================
-- 2. Create STAFF table
-- ============================================
CREATE TABLE IF NOT EXISTS public.staff (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,

  -- Sales tracking
  total_sales INTEGER NOT NULL DEFAULT 0,
  total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,

  notes TEXT,

  -- Timestamps and audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT,
  updated_by TEXT,

  -- Soft delete
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMPTZ
);

-- Index for common queries
CREATE INDEX IF NOT EXISTS idx_staff_name ON public.staff(name);
CREATE INDEX IF NOT EXISTS idx_staff_is_active ON public.staff(is_active);
CREATE INDEX IF NOT EXISTS idx_staff_is_deleted ON public.staff(is_deleted);

-- RLS policies for staff
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated read access to staff" ON public.staff;
CREATE POLICY "Allow authenticated read access to staff" ON public.staff
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow authenticated insert to staff" ON public.staff;
CREATE POLICY "Allow authenticated insert to staff" ON public.staff
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated update to staff" ON public.staff;
CREATE POLICY "Allow authenticated update to staff" ON public.staff
  FOR UPDATE TO authenticated USING (true);


-- ============================================
-- 3. Alter PRODUCTS table - Add V2 columns
-- ============================================

-- V2 UPS fields
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS ups_raw TEXT,
  ADD COLUMN IF NOT EXISTS identifier_type TEXT CHECK (identifier_type IN ('legacy', 'numbered')),
  ADD COLUMN IF NOT EXISTS drop_number TEXT,
  ADD COLUMN IF NOT EXISTS product_number INTEGER,
  ADD COLUMN IF NOT EXISTS drop_sequence INTEGER;

-- V2 Tracking fields (TEXT to match app's ID format)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS sold_by TEXT,
  ADD COLUMN IF NOT EXISTS sold_to TEXT,
  ADD COLUMN IF NOT EXISTS sold_at TIMESTAMPTZ;

-- V2 Price tracking
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS original_price DECIMAL(10,2);

-- Update status constraint to allow 5 values
-- First drop the old constraint if it exists
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_status_check;

-- Add new constraint with 5 status values
ALTER TABLE public.products
  ADD CONSTRAINT products_status_check
  CHECK (status IN ('available', 'sold', 'reserved', 'promotional', 'donated'));

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS idx_products_drop_number ON public.products(drop_number);
CREATE INDEX IF NOT EXISTS idx_products_identifier_type ON public.products(identifier_type);
CREATE INDEX IF NOT EXISTS idx_products_sold_by ON public.products(sold_by);
CREATE INDEX IF NOT EXISTS idx_products_sold_to ON public.products(sold_to);


-- ============================================
-- 4. Add sold_by to transactions table
-- ============================================
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS sold_by TEXT;

CREATE INDEX IF NOT EXISTS idx_transactions_sold_by ON public.transactions(sold_by);


-- ============================================
-- 5. Migrate existing products data
-- Set default values for V2 fields
-- ============================================
UPDATE public.products
SET
  ups_raw = COALESCE(ups_raw, ups_batch::TEXT),
  identifier_type = COALESCE(identifier_type, 'legacy'),
  drop_number = COALESCE(drop_number, ups_batch::TEXT)
WHERE ups_raw IS NULL OR identifier_type IS NULL OR drop_number IS NULL;


-- ============================================
-- 6. Create helper function for drop stats
-- ============================================
CREATE OR REPLACE FUNCTION public.recalculate_drop_stats(p_drop_number TEXT)
RETURNS void AS $$
BEGIN
  UPDATE public.drops
  SET
    total_products = (
      SELECT COUNT(*) FROM public.products
      WHERE drop_number = p_drop_number AND is_deleted = FALSE
    ),
    total_units = (
      SELECT COALESCE(SUM(quantity), 0) FROM public.products
      WHERE drop_number = p_drop_number AND is_deleted = FALSE
    ),
    total_value = (
      SELECT COALESCE(SUM(quantity * unit_price), 0) FROM public.products
      WHERE drop_number = p_drop_number AND is_deleted = FALSE
    ),
    sold_count = (
      SELECT COUNT(*) FROM public.products
      WHERE drop_number = p_drop_number AND status = 'sold' AND is_deleted = FALSE
    ),
    available_count = (
      SELECT COUNT(*) FROM public.products
      WHERE drop_number = p_drop_number AND status = 'available' AND is_deleted = FALSE
    ),
    updated_at = NOW()
  WHERE drop_number = p_drop_number;
END;
$$ LANGUAGE plpgsql;


-- ============================================
-- 7. Create trigger to update drop stats
-- ============================================
CREATE OR REPLACE FUNCTION public.update_drop_stats_trigger()
RETURNS trigger AS $$
BEGIN
  -- Update stats for the affected drop
  IF TG_OP = 'DELETE' THEN
    IF OLD.drop_number IS NOT NULL THEN
      PERFORM public.recalculate_drop_stats(OLD.drop_number);
    END IF;
    RETURN OLD;
  ELSE
    IF NEW.drop_number IS NOT NULL THEN
      PERFORM public.recalculate_drop_stats(NEW.drop_number);
    END IF;
    -- If drop_number changed, update old drop stats too
    IF TG_OP = 'UPDATE' AND OLD.drop_number IS DISTINCT FROM NEW.drop_number AND OLD.drop_number IS NOT NULL THEN
      PERFORM public.recalculate_drop_stats(OLD.drop_number);
    END IF;
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on products table
DROP TRIGGER IF EXISTS tr_products_drop_stats ON public.products;
CREATE TRIGGER tr_products_drop_stats
  AFTER INSERT OR UPDATE OR DELETE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.update_drop_stats_trigger();


-- ============================================
-- 8. Create trigger to update staff stats
-- ============================================
CREATE OR REPLACE FUNCTION public.update_staff_stats_trigger()
RETURNS trigger AS $$
BEGIN
  -- When a product is sold, update staff stats
  IF TG_OP = 'UPDATE' AND NEW.status = 'sold' AND OLD.status != 'sold' AND NEW.sold_by IS NOT NULL THEN
    UPDATE public.staff
    SET
      total_sales = total_sales + 1,
      total_amount = total_amount + (NEW.quantity * NEW.unit_price),
      updated_at = NOW()
    WHERE id = NEW.sold_by;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_products_staff_stats ON public.products;
CREATE TRIGGER tr_products_staff_stats
  AFTER UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.update_staff_stats_trigger();


-- ============================================
-- 9. Grant necessary permissions
-- ============================================
GRANT ALL ON public.drops TO authenticated;
GRANT ALL ON public.staff TO authenticated;
