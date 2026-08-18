export function isEditSaleRpcUnavailableError(error: { code?: string; message?: string }): boolean {
  return error.code === 'PGRST202' || /schema cache/i.test(error.message || '');
}
