-- Seed curated general SAT keys and category suggestions.

CREATE TABLE IF NOT EXISTS public.sat_category_suggestions (
  id TEXT PRIMARY KEY,
  category_code TEXT NOT NULL,
  sat_key_id TEXT NOT NULL REFERENCES public.sat_keys(id) ON UPDATE CASCADE ON DELETE CASCADE,
  priority INTEGER NOT NULL DEFAULT 100,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  source_group TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sat_category_suggestions_category_not_blank CHECK (BTRIM(category_code) <> ''),
  CONSTRAINT sat_category_suggestions_priority_positive CHECK (priority > 0),
  CONSTRAINT sat_category_suggestions_unique_pair UNIQUE (category_code, sat_key_id)
);

CREATE INDEX IF NOT EXISTS idx_sat_category_suggestions_category
  ON public.sat_category_suggestions(category_code, priority);

CREATE INDEX IF NOT EXISTS idx_sat_category_suggestions_sat_key
  ON public.sat_category_suggestions(sat_key_id);

ALTER TABLE public.sat_category_suggestions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated read access to SAT category suggestions"
  ON public.sat_category_suggestions;
CREATE POLICY "Allow authenticated read access to SAT category suggestions"
  ON public.sat_category_suggestions
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow authenticated insert to SAT category suggestions"
  ON public.sat_category_suggestions;
CREATE POLICY "Allow authenticated insert to SAT category suggestions"
  ON public.sat_category_suggestions
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated update to SAT category suggestions"
  ON public.sat_category_suggestions;
CREATE POLICY "Allow authenticated update to SAT category suggestions"
  ON public.sat_category_suggestions
  FOR UPDATE TO authenticated USING (true);

GRANT ALL ON public.sat_category_suggestions TO authenticated;

INSERT INTO public.sat_keys (id, code, description, created_at, updated_at, is_deleted, deleted_at)
VALUES
  ('sat-10111300', '10111300', 'Accesorios, equipo y tratamientos para los animales domésticos', NOW(), NOW(), FALSE, NULL),
  ('sat-10121800', '10121800', 'Alimento para perros y gatos', NOW(), NOW(), FALSE, NULL),
  ('sat-11121900', '11121900', 'Productos de perfumería', NOW(), NOW(), FALSE, NULL),
  ('sat-26111700', '26111700', 'Baterías, pilas y accesorios', NOW(), NOW(), FALSE, NULL),
  ('sat-26121600', '26121600', 'Cables eléctricos y accesorios', NOW(), NOW(), FALSE, NULL),
  ('sat-27111700', '27111700', 'Llaves inglesas y guías', NOW(), NOW(), FALSE, NULL),
  ('sat-27112700', '27112700', 'Herramientas mecánicas', NOW(), NOW(), FALSE, NULL),
  ('sat-39111500', '39111500', 'Iluminación de interiores y artefactos', NOW(), NOW(), FALSE, NULL),
  ('sat-42132200', '42132200', 'Guantes y accesorios médicos', NOW(), NOW(), FALSE, NULL),
  ('sat-42142900', '42142900', 'Corrección de la visión o gafas cosméticas y productos relacionados', NOW(), NOW(), FALSE, NULL),
  ('sat-43191500', '43191500', 'Dispositivos de comunicación personal', NOW(), NOW(), FALSE, NULL),
  ('sat-43211600', '43211600', 'Accesorios de computador', NOW(), NOW(), FALSE, NULL),
  ('sat-43212100', '43212100', 'Impresoras de computador', NOW(), NOW(), FALSE, NULL),
  ('sat-44101800', '44101800', 'Máquinas calculadoras y accesorios', NOW(), NOW(), FALSE, NULL),
  ('sat-44111500', '44111500', 'Agendas y accesorios', NOW(), NOW(), FALSE, NULL),
  ('sat-44121600', '44121600', 'Suministros de escritorio', NOW(), NOW(), FALSE, NULL),
  ('sat-45121500', '45121500', 'Cámaras', NOW(), NOW(), FALSE, NULL),
  ('sat-51191900', '51191900', 'Suplementos dietéticos y productos de terapia alimenticia', NOW(), NOW(), FALSE, NULL),
  ('sat-52101500', '52101500', 'Alfombras y felpudos', NOW(), NOW(), FALSE, NULL),
  ('sat-52121500', '52121500', 'Ropa de cama', NOW(), NOW(), FALSE, NULL),
  ('sat-52121600', '52121600', 'Mantelerías de cocina y mesa y accesorios', NOW(), NOW(), FALSE, NULL),
  ('sat-52121700', '52121700', 'Toallas', NOW(), NOW(), FALSE, NULL),
  ('sat-52151600', '52151600', 'Utensilios de cocina domesticos', NOW(), NOW(), FALSE, NULL),
  ('sat-52151800', '52151800', 'Batería de cocina doméstica', NOW(), NOW(), FALSE, NULL),
  ('sat-52152100', '52152100', 'Cristalería de uso doméstico', NOW(), NOW(), FALSE, NULL),
  ('sat-52161500', '52161500', 'Equipos audiovisuales', NOW(), NOW(), FALSE, NULL),
  ('sat-53101600', '53101600', 'Faldas y blusas', NOW(), NOW(), FALSE, NULL),
  ('sat-53101700', '53101700', 'Suéteres', NOW(), NOW(), FALSE, NULL),
  ('sat-53101800', '53101800', 'Abrigos y chaquetas', NOW(), NOW(), FALSE, NULL),
  ('sat-53101900', '53101900', 'Trajes', NOW(), NOW(), FALSE, NULL),
  ('sat-53102300', '53102300', 'Ropa interior', NOW(), NOW(), FALSE, NULL),
  ('sat-53102400', '53102400', 'Medias y calcetines', NOW(), NOW(), FALSE, NULL),
  ('sat-53102600', '53102600', 'Ropa de dormir', NOW(), NOW(), FALSE, NULL),
  ('sat-53102800', '53102800', 'Trajes de baño', NOW(), NOW(), FALSE, NULL),
  ('sat-53102900', '53102900', 'Prendas de deporte', NOW(), NOW(), FALSE, NULL),
  ('sat-53103000', '53103000', 'Camisetas', NOW(), NOW(), FALSE, NULL),
  ('sat-53103100', '53103100', 'Chalecos', NOW(), NOW(), FALSE, NULL),
  ('sat-53111500', '53111500', 'Botas', NOW(), NOW(), FALSE, NULL),
  ('sat-53111600', '53111600', 'Zapatos', NOW(), NOW(), FALSE, NULL),
  ('sat-53111700', '53111700', 'Zapatillas', NOW(), NOW(), FALSE, NULL),
  ('sat-53111800', '53111800', 'Sandalias', NOW(), NOW(), FALSE, NULL),
  ('sat-53111900', '53111900', 'Calzado deportivo', NOW(), NOW(), FALSE, NULL),
  ('sat-53121500', '53121500', 'Maletas', NOW(), NOW(), FALSE, NULL),
  ('sat-53121600', '53121600', 'Monederos, bolsos de mano y bolsas', NOW(), NOW(), FALSE, NULL),
  ('sat-53121700', '53121700', 'Carteras', NOW(), NOW(), FALSE, NULL),
  ('sat-53121800', '53121800', 'Juegos y accesorios de viaje', NOW(), NOW(), FALSE, NULL),
  ('sat-53131600', '53131600', 'Bano y cuerpo', NOW(), NOW(), FALSE, NULL),
  ('sat-54101500', '54101500', 'Joyería fina', NOW(), NOW(), FALSE, NULL),
  ('sat-54101600', '54101600', 'Bisutería', NOW(), NOW(), FALSE, NULL),
  ('sat-54111500', '54111500', 'Relojes de pulsera o bolsillo', NOW(), NOW(), FALSE, NULL),
  ('sat-54111600', '54111600', 'Relojes de pared o de mesa', NOW(), NOW(), FALSE, NULL),
  ('sat-55101500', '55101500', 'Publicaciones impresas', NOW(), NOW(), FALSE, NULL),
  ('sat-56101500', '56101500', 'Muebles', NOW(), NOW(), FALSE, NULL),
  ('sat-56101800', '56101800', 'Accesorios y muebles de bebé y niño', NOW(), NOW(), FALSE, NULL),
  ('sat-60141000', '60141000', 'Juguetes', NOW(), NOW(), FALSE, NULL),
  ('sat-60141100', '60141100', 'Juegos', NOW(), NOW(), FALSE, NULL)
ON CONFLICT (id) DO UPDATE SET
  code = EXCLUDED.code,
  description = EXCLUDED.description,
  updated_at = NOW(),
  is_deleted = FALSE,
  deleted_at = NULL;

INSERT INTO public.sat_category_suggestions (
  id,
  category_code,
  sat_key_id,
  priority,
  is_default,
  source_group,
  updated_at
)
VALUES
  ('sat-suggestion-MASC-10111300', 'MASC', 'sat-10111300', 1, TRUE, 'Mascotas', NOW()),
  ('sat-suggestion-MASC-10121800', 'MASC', 'sat-10121800', 2, FALSE, 'Mascotas', NOW()),
  ('sat-suggestion-BLLZ-11121900', 'BLLZ', 'sat-11121900', 1, TRUE, 'Perfumes', NOW()),
  ('sat-suggestion-BLLZ-53131600', 'BLLZ', 'sat-53131600', 2, FALSE, 'Cosmeticos y belleza', NOW()),
  ('sat-suggestion-EL-26111700', 'EL', 'sat-26111700', 1, FALSE, 'Electronica', NOW()),
  ('sat-suggestion-EL-26121600', 'EL', 'sat-26121600', 2, FALSE, 'Electronica', NOW()),
  ('sat-suggestion-EL-52161500', 'EL', 'sat-52161500', 3, FALSE, 'Electronica', NOW()),
  ('sat-suggestion-EL-39111500', 'EL', 'sat-39111500', 4, FALSE, 'LEDS, Focos', NOW()),
  ('sat-suggestion-TOOL-27112700', 'TOOL', 'sat-27112700', 1, TRUE, 'Herramientas', NOW()),
  ('sat-suggestion-TOOL-27111700', 'TOOL', 'sat-27111700', 2, FALSE, 'Herramientas', NOW()),
  ('sat-suggestion-FERR-27112700', 'FERR', 'sat-27112700', 1, TRUE, 'Herramientas', NOW()),
  ('sat-suggestion-FERR-27111700', 'FERR', 'sat-27111700', 2, FALSE, 'Herramientas', NOW()),
  ('sat-suggestion-DOC-42132200', 'DOC', 'sat-42132200', 1, TRUE, 'Medico', NOW()),
  ('sat-suggestion-LT-42142900', 'LT', 'sat-42142900', 1, TRUE, 'Lentes', NOW()),
  ('sat-suggestion-CEL-43191500', 'CEL', 'sat-43191500', 1, TRUE, 'Celulares', NOW()),
  ('sat-suggestion-COMP-43211600', 'COMP', 'sat-43211600', 1, TRUE, 'Computadoras', NOW()),
  ('sat-suggestion-COMP-43212100', 'COMP', 'sat-43212100', 2, FALSE, 'Impresoras', NOW()),
  ('sat-suggestion-PAP-44121600', 'PAP', 'sat-44121600', 1, TRUE, 'Escuela', NOW()),
  ('sat-suggestion-PAP-44111500', 'PAP', 'sat-44111500', 2, FALSE, 'Escuela', NOW()),
  ('sat-suggestion-PAP-44101800', 'PAP', 'sat-44101800', 3, FALSE, 'Escuela', NOW()),
  ('sat-suggestion-PAP-43212100', 'PAP', 'sat-43212100', 4, FALSE, 'Impresoras', NOW()),
  ('sat-suggestion-CAM-45121500', 'CAM', 'sat-45121500', 1, TRUE, 'Camaras', NOW()),
  ('sat-suggestion-SAL-51191900', 'SAL', 'sat-51191900', 1, TRUE, 'Suplementos', NOW()),
  ('sat-suggestion-SAL-42132200', 'SAL', 'sat-42132200', 2, FALSE, 'Medico', NOW()),
  ('sat-suggestion-HG-52121500', 'HG', 'sat-52121500', 1, FALSE, 'Hogar', NOW()),
  ('sat-suggestion-HG-52121700', 'HG', 'sat-52121700', 2, FALSE, 'Hogar', NOW()),
  ('sat-suggestion-HG-52101500', 'HG', 'sat-52101500', 3, FALSE, 'Hogar', NOW()),
  ('sat-suggestion-HG-52152100', 'HG', 'sat-52152100', 4, FALSE, 'Hogar', NOW()),
  ('sat-suggestion-HG-39111500', 'HG', 'sat-39111500', 5, FALSE, 'LEDS, Focos', NOW()),
  ('sat-suggestion-HG-56101500', 'HG', 'sat-56101500', 6, FALSE, 'Muebles', NOW()),
  ('sat-suggestion-BL-52121500', 'BL', 'sat-52121500', 1, TRUE, 'Hogar', NOW()),
  ('sat-suggestion-BL-52121700', 'BL', 'sat-52121700', 2, FALSE, 'Hogar', NOW()),
  ('sat-suggestion-COC-52151600', 'COC', 'sat-52151600', 1, TRUE, 'Cocina', NOW()),
  ('sat-suggestion-COC-52151800', 'COC', 'sat-52151800', 2, FALSE, 'Cocina', NOW()),
  ('sat-suggestion-COC-52121600', 'COC', 'sat-52121600', 3, FALSE, 'Cocina', NOW()),
  ('sat-suggestion-COC-52152100', 'COC', 'sat-52152100', 4, FALSE, 'Hogar', NOW()),
  ('sat-suggestion-DAM-53101600', 'DAM', 'sat-53101600', 1, FALSE, 'Ropa', NOW()),
  ('sat-suggestion-DAM-53103000', 'DAM', 'sat-53103000', 2, FALSE, 'Ropa', NOW()),
  ('sat-suggestion-DAM-53101700', 'DAM', 'sat-53101700', 3, FALSE, 'Ropa', NOW()),
  ('sat-suggestion-DAM-53101800', 'DAM', 'sat-53101800', 4, FALSE, 'Ropa', NOW()),
  ('sat-suggestion-DAM-53101900', 'DAM', 'sat-53101900', 5, FALSE, 'Ropa', NOW()),
  ('sat-suggestion-DAM-53102300', 'DAM', 'sat-53102300', 6, FALSE, 'Ropa', NOW()),
  ('sat-suggestion-DAM-53102400', 'DAM', 'sat-53102400', 7, FALSE, 'Ropa', NOW()),
  ('sat-suggestion-DAM-53102600', 'DAM', 'sat-53102600', 8, FALSE, 'Ropa', NOW()),
  ('sat-suggestion-DAM-53102800', 'DAM', 'sat-53102800', 9, FALSE, 'Ropa', NOW()),
  ('sat-suggestion-DAM-53102900', 'DAM', 'sat-53102900', 10, FALSE, 'Ropa', NOW()),
  ('sat-suggestion-DAM-53103100', 'DAM', 'sat-53103100', 11, FALSE, 'Ropa', NOW()),
  ('sat-suggestion-CAB-53103000', 'CAB', 'sat-53103000', 1, FALSE, 'Ropa', NOW()),
  ('sat-suggestion-CAB-53101700', 'CAB', 'sat-53101700', 2, FALSE, 'Ropa', NOW()),
  ('sat-suggestion-CAB-53101800', 'CAB', 'sat-53101800', 3, FALSE, 'Ropa', NOW()),
  ('sat-suggestion-CAB-53101900', 'CAB', 'sat-53101900', 4, FALSE, 'Ropa', NOW()),
  ('sat-suggestion-CAB-53103100', 'CAB', 'sat-53103100', 5, FALSE, 'Ropa', NOW()),
  ('sat-suggestion-CAB-53102300', 'CAB', 'sat-53102300', 6, FALSE, 'Ropa', NOW()),
  ('sat-suggestion-CAB-53102400', 'CAB', 'sat-53102400', 7, FALSE, 'Ropa', NOW()),
  ('sat-suggestion-CAB-53102600', 'CAB', 'sat-53102600', 8, FALSE, 'Ropa', NOW()),
  ('sat-suggestion-CAB-53102800', 'CAB', 'sat-53102800', 9, FALSE, 'Ropa', NOW()),
  ('sat-suggestion-CAB-53102900', 'CAB', 'sat-53102900', 10, FALSE, 'Ropa', NOW()),
  ('sat-suggestion-CAB-53101600', 'CAB', 'sat-53101600', 11, FALSE, 'Ropa', NOW()),
  ('sat-suggestion-N-53103000', 'N', 'sat-53103000', 1, FALSE, 'Ropa', NOW()),
  ('sat-suggestion-N-53101600', 'N', 'sat-53101600', 2, FALSE, 'Ropa', NOW()),
  ('sat-suggestion-N-53101700', 'N', 'sat-53101700', 3, FALSE, 'Ropa', NOW()),
  ('sat-suggestion-N-53101800', 'N', 'sat-53101800', 4, FALSE, 'Ropa', NOW()),
  ('sat-suggestion-N-53102300', 'N', 'sat-53102300', 5, FALSE, 'Ropa', NOW()),
  ('sat-suggestion-N-53102400', 'N', 'sat-53102400', 6, FALSE, 'Ropa', NOW()),
  ('sat-suggestion-N-53102600', 'N', 'sat-53102600', 7, FALSE, 'Ropa', NOW()),
  ('sat-suggestion-N-53102800', 'N', 'sat-53102800', 8, FALSE, 'Ropa', NOW()),
  ('sat-suggestion-N-53102900', 'N', 'sat-53102900', 9, FALSE, 'Ropa', NOW()),
  ('sat-suggestion-N-53103100', 'N', 'sat-53103100', 10, FALSE, 'Ropa', NOW()),
  ('sat-suggestion-N-53111500', 'N', 'sat-53111500', 11, FALSE, 'Calzado', NOW()),
  ('sat-suggestion-N-53111600', 'N', 'sat-53111600', 12, FALSE, 'Calzado', NOW()),
  ('sat-suggestion-N-53111700', 'N', 'sat-53111700', 13, FALSE, 'Calzado', NOW()),
  ('sat-suggestion-N-53111800', 'N', 'sat-53111800', 14, FALSE, 'Calzado', NOW()),
  ('sat-suggestion-N-53111900', 'N', 'sat-53111900', 15, FALSE, 'Calzado', NOW()),
  ('sat-suggestion-RI-53102300', 'RI', 'sat-53102300', 1, TRUE, 'Ropa', NOW()),
  ('sat-suggestion-RI-53102400', 'RI', 'sat-53102400', 2, FALSE, 'Ropa', NOW()),
  ('sat-suggestion-RI-53102600', 'RI', 'sat-53102600', 3, FALSE, 'Ropa', NOW()),
  ('sat-suggestion-RI-53103000', 'RI', 'sat-53103000', 4, FALSE, 'Ropa', NOW()),
  ('sat-suggestion-DEP-53102900', 'DEP', 'sat-53102900', 1, TRUE, 'Ropa', NOW()),
  ('sat-suggestion-DEP-53111900', 'DEP', 'sat-53111900', 2, FALSE, 'Calzado', NOW()),
  ('sat-suggestion-DEP-60141100', 'DEP', 'sat-60141100', 3, FALSE, 'Jueguete', NOW()),
  ('sat-suggestion-ZPT-53111600', 'ZPT', 'sat-53111600', 1, TRUE, 'Calzado', NOW()),
  ('sat-suggestion-ZPT-53111500', 'ZPT', 'sat-53111500', 2, FALSE, 'Calzado', NOW()),
  ('sat-suggestion-ZPT-53111700', 'ZPT', 'sat-53111700', 3, FALSE, 'Calzado', NOW()),
  ('sat-suggestion-ZPT-53111800', 'ZPT', 'sat-53111800', 4, FALSE, 'Calzado', NOW()),
  ('sat-suggestion-ZPT-53111900', 'ZPT', 'sat-53111900', 5, FALSE, 'Calzado', NOW()),
  ('sat-suggestion-MOCH-53121500', 'MOCH', 'sat-53121500', 1, TRUE, 'Viaje', NOW()),
  ('sat-suggestion-MOCH-53121800', 'MOCH', 'sat-53121800', 2, FALSE, 'Viaje', NOW()),
  ('sat-suggestion-MOCH-53121600', 'MOCH', 'sat-53121600', 3, FALSE, 'Accesorios', NOW()),
  ('sat-suggestion-BLS-53121600', 'BLS', 'sat-53121600', 1, TRUE, 'Accesorios', NOW()),
  ('sat-suggestion-BLS-53121700', 'BLS', 'sat-53121700', 2, FALSE, 'Accesorios', NOW()),
  ('sat-suggestion-ACC-53121600', 'ACC', 'sat-53121600', 1, FALSE, 'Accesorios', NOW()),
  ('sat-suggestion-ACC-53121700', 'ACC', 'sat-53121700', 2, FALSE, 'Accesorios', NOW()),
  ('sat-suggestion-ACC-53121800', 'ACC', 'sat-53121800', 3, FALSE, 'Viaje', NOW()),
  ('sat-suggestion-ACC-54101500', 'ACC', 'sat-54101500', 4, FALSE, 'Accesorios', NOW()),
  ('sat-suggestion-ACC-54101600', 'ACC', 'sat-54101600', 5, FALSE, 'Accesorios', NOW()),
  ('sat-suggestion-ACC-54111500', 'ACC', 'sat-54111500', 6, FALSE, 'Accesorios', NOW()),
  ('sat-suggestion-ACC-54111600', 'ACC', 'sat-54111600', 7, FALSE, 'Accesorios', NOW()),
  ('sat-suggestion-JY-54101500', 'JY', 'sat-54101500', 1, TRUE, 'Accesorios', NOW()),
  ('sat-suggestion-JY-54101600', 'JY', 'sat-54101600', 2, FALSE, 'Accesorios', NOW()),
  ('sat-suggestion-REL-54111500', 'REL', 'sat-54111500', 1, TRUE, 'Accesorios', NOW()),
  ('sat-suggestion-REL-54111600', 'REL', 'sat-54111600', 2, FALSE, 'Accesorios', NOW()),
  ('sat-suggestion-LD-55101500', 'LD', 'sat-55101500', 1, TRUE, 'Libros', NOW()),
  ('sat-suggestion-MUE-56101500', 'MUE', 'sat-56101500', 1, TRUE, 'Muebles', NOW()),
  ('sat-suggestion-BB-56101800', 'BB', 'sat-56101800', 1, TRUE, 'Bebe', NOW()),
  ('sat-suggestion-JUG-60141000', 'JUG', 'sat-60141000', 1, TRUE, 'Jueguete', NOW()),
  ('sat-suggestion-JUG-60141100', 'JUG', 'sat-60141100', 2, FALSE, 'Jueguete', NOW())
ON CONFLICT (category_code, sat_key_id) DO UPDATE SET
  priority = EXCLUDED.priority,
  is_default = EXCLUDED.is_default,
  source_group = EXCLUDED.source_group,
  updated_at = NOW();
