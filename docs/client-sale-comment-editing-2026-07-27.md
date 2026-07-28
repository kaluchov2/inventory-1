# Client Sale Comment Editing (July 27, 2026)

## What changed

The Clientes transaction detail already displayed `transactions.notes`, and the
Ventas SAT report already exposed the same value as `Comentarios`, but the
Modificar Venta modal did not provide an editable field or include `notes` in
its payload.

The client sale-edit modal now:

- initializes the comment from the selected transaction;
- sends an explicit `notes` property through both normal modify and refund
  branches;
- trims surrounding whitespace; and
- sends an empty string when cleared so PostgreSQL stores `NULL`.

After either RPC completes, the existing product, customer, and transaction
reload updates Clientes and Ventas SAT with the server-confirmed transaction.

## Inventory and product status

Migration `025_edit_sale_notes_and_status.sql` keeps the existing atomic
inventory and customer-balance RPCs. It identifies only product IDs whose
quantity changed between the old and edited sale.

After the base RPC succeeds, those changed products are normalized to:

1. `available` when stock remains available;
2. `sold` when no stock is available and sold quantity remains;
3. `donated`, `lost`, or `expired` when applicable; or
4. `available` as the empty fallback.

The wrapper never assigns `review`. Comment-only or price-only edits have no
quantity delta, so they do not update product inventory or status.

The refund edit wrapper also applies the edited comment to the source sale in
the same PostgreSQL transaction.

## Deployment

Migration `025_edit_sale_notes_and_status.sql` must be deployed before comment
editing through the refund branch and the product-status normalization are
active in production.
