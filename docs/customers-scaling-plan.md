# Customers page — server-side data plan (deferred)

Status: **not needed yet.** At 950 customers the page loads the whole list once
(`/api/clients?limit=5000`, ~128 KB) plus `/api/customer-points` (~23 KB) and does
all search / filter / sort / pagination / totals / CSV **in the browser**. That is
fine today. This doc is the execution plan for when it stops being fine.

## When to do this

Trigger on the **first** of:
- customer count approaches **~3,000**, or
- `/api/clients` payload exceeds **~500 KB** / first paint feels slow, or
- users report lag while typing in search / sorting on lower-end devices.

At 950 the combined payload is ~150 KB and filtering is instant. Projected ~1.5 MB
at 10k, at which point in-browser filter/sort over 10k rows per keystroke is the
real problem (memory + main-thread work), not just payload.

## Why it's more than "add ?page="

Every one of these currently runs **client-side over the full in-memory list** and
must move server-side together, or they silently break (they'd only see one page):

- **Search** — name, ID, and phone. Phone uses digit-only normalization dropping a
  leading `998` (`utils/phone.ts` → `normalizePhone`). The SQL side must match the
  same way (compare `phone_norm`, and `id`/`full_name` with `ILIKE`).
- **Status filter** — `active` | `blocked` (the values, not `inactive`; see
  `_normalize_customer_status`).
- **Sort** — multi-column (full_name, total_points, earned, redeemed), asc/desc.
- **Totals** — the "Jami" footer sums over the **whole filtered set**, not the page.
- **CSV export** — exports the whole filtered set, not the page.
- **Points join** — points come from `/api/customer-points` (computed from the
  ledger) and are merged onto customers in the browser today. Server-side, the list
  query must LEFT JOIN the per-client bonus totals so sort/filter/totals on points
  work in SQL. Keep the `_ensure_ledger_holders_present` invariant intact so
  orphan-point holders still appear (see K5).

## Backend changes

Extend `GET /api/clients` (`backend/routers/customers.py`,
`backend/services/customers.py::get_clients_payload`,
`backend/core/dashboard.py::_build_clients` → `_load_customers_base`):

New query params (all optional, backward-compatible):
```
search: str = ""            # matches full_name ILIKE, id, phone_norm
status: str = "all"         # all | active | blocked
sort: str = "full_name"     # full_name | total_points | earned | redeemed
dir: str  = "asc"           # asc | desc
offset, limit               # already exist
```

Response shape — add the filtered total so the client can render pagination and the
"Jami" footer without downloading everything:
```json
{ "clients": [...], "total": 1234, "totals": { "totalPoints": 0, "earned": 0, "redeemed": 0 } }
```

Implementation notes:
- Build one SQL query: `customers` LEFT JOIN a `bonus_totals` subquery
  (`SELECT client_id, SUM(points) ... GROUP BY client_id`) so points are sortable/
  filterable/summable in SQL. `_load_customer_points` already computes these totals —
  reuse that logic as a joinable subquery.
- `search` on phone: normalize the query the same way as the client
  (`normalizePhone`) and compare against `customers.phone_norm` with a suffix/`LIKE`.
- Compute `total` and `totals` with the **same WHERE** as the page query (a second
  aggregate query, or window functions).
- Keep `_ensure_ledger_holders_present` running (it seeds orphan holders into
  `customers` before the query), so no ledger points go missing under pagination.
- A dedicated CSV endpoint (`/api/clients/export.csv?search=&status=&sort=&dir=`)
  that streams the full filtered set, since export must not be limited to one page.
- Add indexes if missing: `customers(phone_norm)`, `customers(status)`,
  `bonus_transactions(client_id)`.

## Frontend changes (`components/CustomersView.tsx`)

- Fetch one page at a time: `/api/clients?search=&status=&sort=&dir=&offset=&limit=50`.
- **Debounce** the search box (~300 ms) so typing doesn't fire a request per keystroke.
- Drive pagination from the response `total` (already the pattern after K6/K7).
- Render the "Jami" footer from response `totals`, not a client-side reduce.
- Delete the client-side `filteredAndSortedCustomers` pipeline (search/filter/sort);
  keep `utils/phone.ts` — its normalization now informs the server query param.
- Add loading states on the table body during fetch (skeleton/spinner) so page
  changes and searches don't flash empty.
- CSV export button calls the streaming export endpoint with the current filters.
- Keep the localStorage cache only as a first-paint hint for page 1, or drop it —
  with server paging it adds little.

## Risk / testing

This touches the K2 (phone search), K3 (status filter) and K5 (orphan totals) fixes —
re-verify all three after the change:
- phone search for `972473354` / `+998 97 247 33 54` returns the right rows;
- status filter `blocked` shows blocked customers and only those;
- the "Jami" total equals the full ledger total (currently 4,155,705), i.e. still
  counts orphan-point holders, not just the visible page.

Roll out behind the existing deploy flow (push both remotes → VPS `git pull` +
restart). The new params are additive, so the backend can ship first and the
frontend can follow.
