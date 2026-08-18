import { describe, expect, it } from 'vitest';
import { isEditSaleRpcUnavailableError } from './transactionServiceErrors';

describe('isEditSaleRpcUnavailableError', () => {
  it('recognizes the PostgREST missing-function code and schema-cache failures', () => {
    expect(isEditSaleRpcUnavailableError({ code: 'PGRST202', message: 'missing' })).toBe(true);
    expect(isEditSaleRpcUnavailableError({ code: 'PGRST204', message: 'schema cache is stale' })).toBe(true);
  });

  it('does not hide database errors merely because they mention a function', () => {
    expect(isEditSaleRpcUnavailableError({
      code: 'P0001',
      message: 'error raised by internal function while validating stock',
    })).toBe(false);
    expect(isEditSaleRpcUnavailableError({
      code: '42501',
      message: 'insufficient_role in edit_sale_transaction_details',
    })).toBe(false);
  });
});
