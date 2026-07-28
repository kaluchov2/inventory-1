import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../../supabase/migrations/025_edit_sale_notes_and_status.sql', import.meta.url),
  'utf8',
);

describe('sale edit notes and status migration', () => {
  it('wraps both sale edit paths and persists notes in the refund branch', () => {
    expect(migration).toContain(
      'CREATE OR REPLACE FUNCTION public.modify_sale_transaction(edit_payload jsonb)',
    );
    expect(migration).toContain(
      'CREATE OR REPLACE FUNCTION public.refund_sale_transaction_from_edit(edit_payload jsonb)',
    );
    expect(migration).toContain("IF edit_payload ? 'notes' THEN");
    expect(migration).toContain(
      "SET notes = NULLIF(BTRIM(edit_payload->>'notes'), '')",
    );
  });

  it('normalizes only products whose sale quantity changed and never assigns review', () => {
    expect(migration).toContain(
      'public.sale_edit_changed_product_ids(edit_payload)',
    );
    expect(migration).toContain('WHERE id = ANY(changed_product_ids)');

    const statusAssignments = migration.match(
      /SET status = CASE[\s\S]*?END\s+WHERE id = ANY\(changed_product_ids\)/g,
    );
    expect(statusAssignments).toHaveLength(2);
    for (const assignment of statusAssignments || []) {
      expect(assignment).not.toContain("THEN 'review'");
      expect(assignment).toContain("WHEN available_qty > 0 THEN 'available'");
      expect(assignment).toContain("WHEN sold_qty > 0 THEN 'sold'");
    }
  });
});
