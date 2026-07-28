import { describe, expect, it } from 'vitest';
import { getSaleEditNotesPayload } from './saleEditNotes';

describe('getSaleEditNotesPayload', () => {
  it('trims an edited client-sale comment', () => {
    expect(getSaleEditNotesPayload('  Entregar el viernes  ')).toEqual({
      notes: 'Entregar el viernes',
    });
  });

  it('keeps an explicit empty notes key so an existing comment can be cleared', () => {
    expect(getSaleEditNotesPayload('   ')).toEqual({ notes: '' });
  });
});
