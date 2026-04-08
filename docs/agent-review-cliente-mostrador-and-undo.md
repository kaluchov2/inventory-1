# Agent Review: Walk-in Customer Alias + Safe Sale Undo + Customer Pagination

Date: 2026-04-07
Workspace: Inventory-MVP

## 1) Analysis: Why both Cliente de Paso and Cliente Mostrador exist

### Findings from current code
- Current sale UIs default to `es.customers.walkIn` when no customer is selected.
- `es.customers.walkIn` is currently `Cliente de Paso`.
- This fallback is used in:
  - `src/pages/Sales.tsx`
  - `src/pages/Scanner.tsx`
  - `src/components/products/SellProductModal.tsx`
  - `src/components/products/ResolveReviewModal.tsx`
- Transaction persistence (`src/lib/saleSync.ts`, `src/lib/syncManager.ts`) stores the provided `customerName` as-is; it does not rewrite to `Cliente Mostrador`.
- No active code path in the current repo writes `Cliente Mostrador` explicitly.

### Most likely scenarios for Cliente Mostrador
- Historical data from an older app version.
- Manual DB inserts/edits.
- Excel import path (`src/utils/excelImport.ts`, `processPagosSheet`) importing `Cliente` values literally, which can include `Cliente Mostrador`.

### Conclusion
- This is not caused by current online/offline sync fallback logic.
- It is data-shape drift across historical/imported rows, so both labels are treated as walk-in aliases.

## 2) Implemented changes

### A) Walk-in alias normalization
- Added `src/utils/customerNameUtils.ts`.
- New shared alias support:
  - `WALK_IN_CUSTOMER_LABELS = ['Cliente de Paso', 'Cliente Mostrador']`
  - `normalizeCustomerKey(...)`
  - `isWalkInCustomerName(...)`
  - `toCustomerMatchKey(...)`

### B) Customers page includes both walk-in labels
- Updated `src/pages/Customers.tsx`.
- Added virtual, read-only customer rows for walk-in labels not present as real customers.
- Aggregates `totalPurchases` from matching sale transactions using unpaid semantics:
  - `max(total - (cash + transfer + card), 0)` per sale
  - This matches current DB behavior for `customers.total_purchases`.
- Virtual rows are marked as walk-in and do not expose edit/delete/installment actions.

### C) Transaction queries treat both labels as walk-in
- Updated `src/services/transactionService.ts`:
  - `getWalkInSales(...)` fetches by null customer id plus alias name matches.
- Updated consumers:
  - `src/pages/Transactions.tsx`
  - `src/pages/Settings.tsx`
- Result: filtering/exporting walk-in sales includes both labels.

### D) Safe undo sale transaction (DB RPC + UI flow)
- Added migration: `supabase/migrations/011_undo_sale_transaction_rpc.sql`.
- New RPC: `undo_sale_transaction(undo_payload jsonb)`.
- RPC behavior:
  - Locks target transaction row (`FOR UPDATE`) and validates sale + not deleted.
  - Reverts stock from `transaction_items`:
    - `available_qty += qty`
    - `sold_qty -= qty`
    - Prevents sold underflow.
  - Recomputes product status and clears sold metadata when fully reverted.
  - Reverts customer unpaid impact only:
    - `unpaid_reverted = max(total - paid, 0)`
    - Decrements `customers.balance` and `customers.total_purchases` by that amount.
  - Soft-deletes transaction (`is_deleted`, `deleted_at`) and appends undo reason in notes.

- Added service API in `src/services/transactionService.ts`:
  - `undoSaleTransaction(payload)`
  - Typed request/response interfaces and parser.

- Updated `src/components/customers/CustomerTransactionDetails.tsx`:
  - Undo button (`FiRotateCcw`) on sale rows.
  - Confirmation modal (`ConfirmDialog`).
  - Safety gates before mutation:
    - Require online + Supabase connected.
    - Force `syncManager.syncPendingOperations()`.
    - Block when pending/dead-letter operations exist.
  - Post-success behavior:
    - Reload `products`, `customers`, and `transactions` from Supabase.
    - If refresh fails after RPC commit, show warning toast indicating undo succeeded but refresh was partial.

### E) Replace latest-10 with incremental pagination
- Updated `src/components/customers/CustomerTransactionDetails.tsx`:
  - Removed hard limit of 10.
  - Page size = 5.
  - Initial render 5 with `Cargar 5 mas` button.
  - Continues until all customer transactions are visible.

### F) i18n additions and wording fixes
- Updated `src/i18n/es.ts` with:
  - `actions.undo`
  - `transactions.loadMoreTransactions`
  - `transactions.undoConfirmTitle`
  - `transactions.undoConfirmMessage`
  - `success.transactionUndone`
  - Undo-specific error keys
  - Accent/wording improvements for `transacción` and `conexión` in relevant new strings

## 3) Validation status

- Build executed successfully:
  - `npm run build` passed (TypeScript + Vite production build).

## 4) Reviewer checklist

- Verify `undo_sale_transaction` migration applied in Supabase.
- Validate undo in real DB with:
  - fully paid sale
  - partially paid sale
  - insufficient sold_qty edge case
- Confirm Customers list shows both walk-in aliases (virtual rows) and details load correctly.
- Confirm customer exports and transaction filters include both aliases.
- Confirm toast behavior:
  - success when RPC + refresh succeed
  - warning when RPC succeeds but refresh fails

## 5) Notes / open risk

- Undo currently applies to sale transactions shown in customer detail history; it is not duplicate-detection automatic logic.
- If desired, next step can add duplicate heuristics (same items/amount/timestamp window) and a guided “undo suspected duplicate” workflow.
