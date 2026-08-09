# Mijozlar (Customers) Page — Functional Spec

For redesign. This documents **what the page does** (behavior, data, actions) — not the current styling. Language is **Uzbek-only**.

Route: `/customers` · Component: `components/CustomersView.tsx` · Auth: admin (`x-admin-key` header injected globally).

---

## 1. Purpose
Manage the loyalty program's customers (clients): view the full list, search/filter/sort, add/edit/delete, adjust points, start an order, and export — all backed by the Supabase `customers` table (no SmartUp).

---

## 2. Data shown per customer
| Field | Meaning |
|---|---|
| `id` | Client ID (e.g. `8516359` from ERP, or `CUST-0001` for manual) |
| `fullName` | Customer name |
| `phone` | Phone, displayed formatted `+998 90 123 45 67` |
| `totalPoints` | Current balance |
| `pointsEarned` | Lifetime earned |
| `pointsRedeemed` | Lifetime spent |
| `status` | `active` (Faol) / `inactive` (Nofaol) |

Most clients have **0 points** (loyalty is new). ~950 clients total; some are phone-less company/filial rows.

---

## 3. API endpoints used
- `GET /api/clients?limit=5000[&refresh=true]` — customer list
- `GET /api/customer-points` — points per client (merged into the list)
- `POST /api/clients` — create
- `PUT /api/clients/{id}` — update
- `DELETE /api/clients/{id}` — delete
- `POST /api/customers/{id}/bonus` — add bonus points

Client list has **no points fields**; the page merges `/api/customer-points` in (defaults to 0).

---

## 4. Features / functions

### Listing & navigation
- **Table** of all customers with the columns above + a **checkbox** column + an **actions/expand** column.
- **Pagination** (50 per page) with prev/next + "showing X–Y / total".
- **Totals row**: count, sum of totalPoints, earned, redeemed (over the filtered set).
- **Row expand**: clicking a row expands an inline detail panel with action buttons (Edit / Add points / New order / Delete).
- **Loading / empty ("Ma'lumot yo'q") / error** states.

### Search, filter, sort
- **Search box** — matches name/phone/ID.
- **Status filter** dropdown — Hammasi (all) / Faol / Nofaol.
- **Per-column filters** (popovers) on: Name (contains), Total points (min/max), Earned (min/max), Redeemed (min/max). A "reset filters" affordance appears when active.
- **Sort** by clicking column headers (ID, Name, points columns), asc/desc toggle.

### Customer CRUD
- **Add Customer** — modal form: name, phone, status. Validation: **name required**, **valid phone required (≥9 digits)**, **phone must be unique**. Errors show localized (UZ).
- **Edit Customer** — same modal, pre-filled; same validation.
- **Delete Customer** — opens a **confirmation modal** (customer name + a warning if they still have points) → Cancel / Delete.

### Points & orders
- **Add bonus points** — modal: points amount + note → `POST .../bonus`. Adjusts the balance and appears in the ledger.
- **New order** — opens the Create Order workflow for that customer (points redemption/order flow).

### Bulk actions
- **Select** individual rows (checkbox) or **select all** (header checkbox = all filtered).
- When ≥1 selected, a **selection bar** shows: "N tanlangan" + **Eksport** (CSV of selected) + **O'chirish** (bulk delete, with confirmation modal) + clear.

### Export & refresh
- **CSV export** (all filtered rows): ID, Name, Phone, Total, Earned, Redeemed.
- **Refresh** — re-fetches from the API (clears cache), re-syncs the list.

### Other behavior
- **Client-side cache** of the list (localStorage) for fast loads; refreshed on demand.
- **Uzbek-only** UI (no language switcher).

---

## 5. Modals
1. **Add/Edit customer** — form (name, phone, status) + inline validation errors.
2. **Add bonus points** — amount + note.
3. **Delete confirmation** (single) — name + optional points warning.
4. **Bulk delete confirmation** — count.
5. **Create Order** — full-screen workflow (separate component).

---

## 6. Known gaps / redesign opportunities
- **No per-customer history/ledger** view (a "where did these points come from" timeline) — data exists in `bonus_transactions`; could be added.
- **Phone-less company/filial rows** (~132) clutter the list — could be hidden/flagged by default.
- Table is dense; a card/detail layout or a right-side detail drawer could improve the per-customer view.
- Totals + status distribution could become summary stat tiles at the top.

---

## 7. Component state (for reference)
`customers`, `isLoading`, `loadError`, `isRefreshing`, `lastSyncedAt`, `selectedCustomer`, `expandedRowId`, `search`, `currentPage`, `sortConfig`, `filters` (name + points ranges), `statusFilter`, `selectedIds` (bulk), modal flags (`isCustomerModalOpen`, `isBonusModalOpen`, `customerToDelete`, `isBulkDeleteOpen`, `isCreatingOrder`), and submit/loading flags.
