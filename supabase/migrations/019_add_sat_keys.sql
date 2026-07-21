-- Add SAT key catalog and optional product assignment.

CREATE TABLE IF NOT EXISTS public.sat_keys (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT,
  updated_by TEXT,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT sat_keys_code_not_blank CHECK (BTRIM(code) <> ''),
  CONSTRAINT sat_keys_description_not_blank CHECK (BTRIM(description) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sat_keys_code_unique_active
  ON public.sat_keys (LOWER(BTRIM(code)))
  WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_sat_keys_code ON public.sat_keys(code);
CREATE INDEX IF NOT EXISTS idx_sat_keys_is_deleted ON public.sat_keys(is_deleted);

ALTER TABLE public.sat_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated read access to sat keys" ON public.sat_keys;
CREATE POLICY "Allow authenticated read access to sat keys" ON public.sat_keys
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow authenticated insert to sat keys" ON public.sat_keys;
CREATE POLICY "Allow authenticated insert to sat keys" ON public.sat_keys
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated update to sat keys" ON public.sat_keys;
CREATE POLICY "Allow authenticated update to sat keys" ON public.sat_keys
  FOR UPDATE TO authenticated USING (true);

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS sat_key_id TEXT REFERENCES public.sat_keys(id) ON UPDATE CASCADE ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_products_sat_key_id ON public.products(sat_key_id);

GRANT ALL ON public.sat_keys TO authenticated;
