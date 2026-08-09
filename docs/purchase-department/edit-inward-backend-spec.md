# Edit Inward — Backend Implementation Spec

Status: **implemented** (verified against `factory-management-backend`'s `updateInward` /
`approveInward` / `rejectInward` / `getPendingEditForInward` and the `db.render_arc.sql` migration
— `PENDING_UPDATE` status, `purchase_inward_pending_edits` staging, the consumption guard, the
role-guard fix, and `purchase_inward_status_history` are all in place). The frontend
(`factory-management-frontend`) was built against this contract; the edit-an-`APPROVED`-inward
path is now enabled (`EDIT_APPROVED_INWARD_ENABLED = true` in `InwardsPage.jsx`). §5a (rate-only
edits bypass the consumption guard) is also implemented, in `updateInward`'s `APPROVED` branch —
`detectRateOnlyEdit` / `applyRateOnlyEdit`, `purchaseDepartmentController.js`.

Repo/file references below are to `factory-management-backend` unless stated otherwise.

## 1. Why

The Purchase Department's Inwards (GRN) register needs an Edit action on every inward. The
existing `PATCH /purchase-department/inwards/:id` (`updateInward`,
`controllers/purchaseDepartmentController.js:1639-1788`) already exists but has the wrong
semantics for this: it mutates an `APPROVED` inward's stock **immediately**, with no re-approval
step, and it refuses to edit `REJECTED` inwards outright. This spec changes both behaviors and
adds a consumption guard that blocks editing when the received stock has already moved.

## 2. Status model

Add a fourth `approval_status` value: `PENDING_UPDATE`. It must be distinct from
`PENDING_APPROVAL` — the two need different reject-targets (`PENDING_APPROVAL` reject → terminal
`REJECTED`; `PENDING_UPDATE` reject → revert to `APPROVED`, original data untouched) and different
approve-time stock logic (first-time apply vs. reverse-then-reapply).

```sql
ALTER TABLE purchase_inwards DROP CONSTRAINT IF EXISTS purchase_inwards_approval_status_check;
ALTER TABLE purchase_inwards ADD CONSTRAINT purchase_inwards_approval_status_check
    CHECK (approval_status IN ('PENDING_APPROVAL','APPROVED','REJECTED','PENDING_UPDATE'));
```

State machine:

```
APPROVED  --(submit edit, passes guard)-->  PENDING_UPDATE
PENDING_UPDATE  --(approve)-->  APPROVED   (new items live, old stock reversed + new applied)
PENDING_UPDATE  --(reject)-->   APPROVED   (proposal discarded, original data/stock untouched)
REJECTED  --(submit edit)-->    PENDING_APPROVAL   (fresh submission, unchanged otherwise)
PENDING_APPROVAL  --(reject)--> REJECTED   (existing behavior, unchanged)
```

No other `purchase_inwards` columns change — `approved_by_user_id` / `approved_at` /
`rejection_notes` are reused as-is for the edit-approval event too, **except** that a
`REJECTED → PENDING_APPROVAL` resubmit must clear `rejection_notes`, `approved_by_user_id`, and
`approved_at` (stale rejection info shouldn't survive on a record that's back in the approval
queue).

## 3. Staging mechanism

New table, at most one open proposal per inward:

```sql
CREATE TABLE IF NOT EXISTS purchase_inward_pending_edits (
    id                   BIGSERIAL PRIMARY KEY,
    inward_id            BIGINT NOT NULL REFERENCES purchase_inwards(id) ON DELETE CASCADE,
    proposed_items       JSONB NOT NULL,       -- same `items[]` shape updateInward already parses
    proposed_header      JSONB,                -- { grn_number, received_date, condition, notes }
    proposed_scan_url    VARCHAR(500),
    submitted_by_user_id BIGINT REFERENCES factory_users(id),
    submitted_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (inward_id)
);
```

`proposed_items` stores exactly the client's `items[]` payload — the same shape
`buildItemsFromState` in the frontend's `inwardShared.js` already produces and `updateInward`
already parses via `parseMaybeJson(req.body.items)`. **No new payload shape for the frontend to
learn.**

While a row exists here, live `purchase_inward_items` and `fabric_rolls` for that inward are
**untouched**. On approve-of-edit, read this row, run the existing reverse/reinsert/reapply logic
`updateInward` already has today (`purchaseDepartmentController.js:1687-1751`) — but triggered
from the approval endpoint instead of immediately — then delete this row. On reject-of-edit, just
delete this row and flip status back to `APPROVED`; nothing else changes.

## 4. Endpoints

Reuse existing routes. Change internal branching only — no new create-style routes.

### `PATCH /purchase-department/inwards/:id`

Role: `purchase_manager`, `factory_admin`, `store_manager` (see §7 for why this needs adding, not
just reusing).

Branch on the inward's **current** `approval_status`:

| Current status | Behavior |
|---|---|
| `PENDING_APPROVAL` | Unchanged — in-place update, nothing posted yet. |
| `REJECTED` | **Currently refused — remove that refusal** (`purchaseDepartmentController.js:1671-1676`). In-place update, `approval_status → PENDING_APPROVAL`, clear `rejection_notes`/`approved_by_user_id`/`approved_at`, log history. |
| `APPROVED` | **New.** 409 if `inward.invoice_id IS NOT NULL` (§8) — checked first, applies regardless of what kind of edit this is. Then classify the edit via `detectRateOnlyEdit` (§5a): if it's rate-only, apply immediately in place and return — **the consumption guard never runs** for this case. Otherwise, run the consumption guard (§5) against the inward's *current live* items; if it fails, return 409 with the `blocked_by` shape. If it passes, `INSERT` into `purchase_inward_pending_edits`, `approval_status → PENDING_UPDATE`, log history. Do **not** touch `purchase_inward_items` or `fabric_rolls`. |
| `PENDING_UPDATE` | 409 — `"An edit is already pending approval for this inward."` (the table's `UNIQUE(inward_id)` backs this up defensively). |

### `PATCH /purchase-department/inwards/:id/approve`

Role unchanged: `purchase_manager`, `factory_admin`. Atomic guard extends to
`WHERE approval_status IN ('PENDING_APPROVAL','PENDING_UPDATE')`.

- Was `PENDING_APPROVAL` → unchanged existing logic (materialize `pending_rolls`, apply deltas,
  `source_kind = 'inward_approve'`).
- Was `PENDING_UPDATE` → **re-run the consumption guard (§5) against current live items** (state
  may have drifted since submission — a roll could have been assigned to production in the
  meantime). If it now fails, 409 and leave the `PENDING_UPDATE` proposal in place (don't discard
  it — let the submitter or approver retry/withdraw). If it passes, atomically: reverse old item
  deltas (`source_kind = 'inward_edit_reverse'`), drop old fabric rolls (reusing
  `dropInStockRollsForInward`'s delete logic — it will not fail here since the guard just passed),
  delete live `purchase_inward_items`, insert the new items from `proposed_items`, apply new
  deltas (`source_kind = 'inward_edit_apply'`), delete the `purchase_inward_pending_edits` row,
  `approval_status → APPROVED`, log history.

### `PATCH /purchase-department/inwards/:id/reject`

Role unchanged: `purchase_manager`, `factory_admin`. Atomic guard extends to
`WHERE approval_status IN ('PENDING_APPROVAL','PENDING_UPDATE')`.

- Was `PENDING_APPROVAL` → unchanged existing logic (`→ REJECTED`, `rejection_notes` set).
- Was `PENDING_UPDATE` → delete the `purchase_inward_pending_edits` row, `approval_status →
  APPROVED` (**not** `REJECTED` — the original approval stands). Store the rejection reason only
  on the `purchase_inward_status_history` row (§6); do **not** write it to
  `inward.rejection_notes`, which is reserved for a terminal original-creation rejection.

### Response shape (all three endpoints)

Include `{ approval_status, edit_outcome }` where `edit_outcome` is one of
`'first_approval' | 'edit_applied' | 'edit_discarded' | 'rate_corrected' | null`, so the frontend
can pick the right toast/copy from server state instead of re-deriving it client-side.
`rate_corrected` is returned only by `PATCH /inwards/:id` on the §5a fast path, alongside
`approval_status: 'APPROVED'` (unchanged) — `InwardReviewModal.jsx` reads it for its "Rate
corrected" success copy.

### New: `GET /purchase-department/inwards/:id/pending-edit`

Role: `purchase_manager`, `factory_admin`. Returns the raw `proposed_items` / `proposed_header`
for a `PENDING_UPDATE` inward (404 if none exists), so an approver can see what's being proposed
before approving — otherwise they're approving blind, since `InwardDetailModal` on the frontend
only ever shows the still-live original data while a `PENDING_UPDATE` is open.

## 5. Consumption guard

Runs at **two points**: (1) at edit-submission time (`PATCH /inwards/:id` when current status is
`APPROVED`) for fast feedback, and (2) again, atomically, inside the same transaction as the
reverse/reapply at edit-approval time, because state can drift in the window between submission
and approval. Both check the inward's **current live items** (never the proposed ones — the
question is always "is it safe to mutate what's currently live").

**Fabric — exact, per-roll status check** (generalizes the existing
`dropInStockRollsForInward`, `purchaseDepartmentController.js:3146-3169`):

```sql
SELECT fr.id AS roll_id, fr.status, fr.bale_no, pii.id AS inward_item_id
FROM fabric_rolls fr
JOIN purchase_inward_items pii ON pii.id = fr.purchase_inward_item_id
WHERE pii.inward_id = $1
```

Block the edit if **any** row has `status <> 'IN_STOCK'`.

**Trim / spare / general — heuristic, pooled-stock-floor check** (new — no existing precedent,
since these types aren't lot-tracked like fabric rolls):

```sql
-- trim
SELECT tiv.main_store_stock >= pii.qty_received AS ok, tiv.main_store_stock AS current_stock
FROM purchase_inward_items pii
JOIN trim_item_variants tiv ON tiv.id = COALESCE(pii.trim_item_variant_id, <resolved via requirement>)
WHERE pii.inward_id = $1 AND item_type resolves to 'trim'

-- spare
SELECT sp.current_stock >= pii.qty_received AS ok, sp.current_stock
FROM purchase_inward_items pii JOIN spare_parts sp ON sp.id = pii.spare_part_id
WHERE pii.inward_id = $1 AND pii.item_type = 'spare'

-- other/general
SELECT gi.current_stock >= pii.qty_received AS ok, gi.current_stock
FROM purchase_inward_items pii JOIN general_items gi ON gi.id = pii.general_item_id
WHERE pii.inward_id = $1 AND pii.item_type = 'other'
```

Block the edit if **any** line's check is false. This is intentionally conservative — it does not
trace which specific units came from which inward, only whether pooled stock has already dropped
below what this inward's line originally contributed. Reuse the same FK-resolution pattern
`loadInwardItemsDetailed` already uses (`COALESCE(pii.trim_item_variant_id, pr.trim_item_variant_id)`,
etc., `purchaseDepartmentController.js:3015-3080`) so the guard sees the same effective item the
UI displays.

**Error contract**, HTTP 409:

```json
{
  "error": "Cannot edit — some received stock has already been used.",
  "blocked_by": {
    "fabric_rolls": [
      { "inward_item_id": 501, "roll_id": 8842, "bale_no": "B-1029", "status": "ASSIGNED_TO_PRODUCTION" }
    ],
    "consumption_floor": [
      { "inward_item_id": 502, "item_type": "trim", "original_qty": 200, "current_stock": 140 }
    ]
  }
}
```

Do not attempt to resolve friendly labels server-side — the frontend already has this inward's own
`items[]` loaded (from the list endpoints) and matches `inward_item_id` / `roll_id` back to a
name/bale locally.

## 5a. Rate-only edits — safe bypass of the consumption guard

The consumption guard (§5) exists to protect **quantity-affecting** mutations: reversing a fabric
roll that's already `ASSIGNED_TO_PRODUCTION`, or pooled trim/spare/general stock that's already
been drawn down, is destructive — you can't put back what's physically gone. A **rate correction**
has no physical referent to reverse, so it's safe regardless of what happened to the stock
afterward. `updateInward`'s `APPROVED` branch special-cases this before the guard ever runs.

**Classification** (`detectRateOnlyEdit`, `purchaseDepartmentController.js`) — an edit is rate-only
when, comparing the submitted `items[]` against the inward's current live items (matched by
identity — `requirement_id` / `purchase_order_item_id` for linked lines, or
`item_type` + variant/part/general-item id for custom lines, since the payload never carries an
`inward_item_id`):

- The **line count and every line's identity are unchanged** — nothing added, removed, or
  re-linked to a different requirement/PO item/variant/part.
- Every line's `qty_received` is byte-identical to its live counterpart.
- **Fabric lines** additionally require the proposed `rolls[]` to match the live
  `fabric_rolls` for that item exactly, as a multiset of `(bale_no, meter)` (`rollsMatch`) — same
  total meter is not enough, since rolls map 1:1 onto real per-bale rows the guard checks
  individually. **`boxes[]`** (trim/spare/other) does *not* disqualify a line on its own — it never
  persists beyond the `qty_received` total it collapses into at submission (there's no `boxes`
  column on `purchase_inward_items`), so once `qty_received` is confirmed unchanged there's nothing
  further a box breakdown could have altered.
- At least one line's `unit_price` actually differs.

Any ambiguity (a duplicate identity key, a line that doesn't match, a line count mismatch, a
fabric line whose rolls don't match) makes `detectRateOnlyEdit` return `null`, and the request
falls through to the normal consumption-guard + `PENDING_UPDATE` staging path — this is a
conservative allow-list, not a deny-list.

**When classified as rate-only**, `applyRateOnlyEdit` runs instead of staging, inside the same
transaction:

1. `UPDATE purchase_inward_items SET unit_price = $1, updated_at = NOW()` per changed line.
2. Re-sync the master valuation column so `trim_item_variants.last_purchase_price` /
   `spare_parts.unit_cost` / `general_items.unit_cost` reflects the corrected rate — call
   `applyTrimDelta` / `applySpareDelta` / `applyGeneralDelta` with **delta = 0** and the new price.
   These helpers already accept that combination and run their `UPDATE ... unit_price =
   COALESCE(...)` unconditionally. Note this deliberately writes **no stock-ledger row**: every one
   of `log_trim_stock_change` / `log_spare_stock_change` / `log_general_stock_change`
   (`db.render_arc.sql`) early-returns on `v_delta = 0` — there's no stock movement to log, only a
   cost-basis correction. `purchase_inward_status_history` (next step) is the audit trail for this
   instead. Fabric has no per-roll price column at all (`fabric_rolls`, `db.render_arc.sql:243-251`)
   — the item-row update in step 1 is the entire fix for a fabric line, nothing to re-sync.
3. Header fields (`grn_number`/`received_date`/`condition`/`notes`/`scan_url`) apply in place via
   the same `COALESCE` pattern used elsewhere — a rate-only edit never stages, so there's no reason
   to defer these either.
4. `logInwardStatusChange(client, id, 'APPROVED', 'APPROVED', userId, notes)` — `from_status ===
   to_status` (no state transition), `notes` summarizing what changed (e.g. `"Rate corrected — trim
   item #502: 45.00 → 42.50"`), so there's still a durable record even though nothing transitioned.
5. Respond `{ approval_status: 'APPROVED', edit_outcome: 'rate_corrected' }` (§4) — **not**
   `PENDING_UPDATE` — and skip `purchase_inward_pending_edits` entirely.

**Still blocked regardless of rate-only-ness:** the §8 invoice guard. Changing the rate after a
three-way match still invalidates that match even though no `purchase_inward_items` row is
deleted/reinserted, so `inward.invoice_id IS NOT NULL` returns 409 before classification even runs.

New `source_kind`: `inward_rate_correction`, passed to the zero-delta delta-helper calls in step 2
above for consistency with the rest of the codebase's `source.kind` convention — but per the ledger
early-return note above, it never actually lands in a ledger row. It exists only so the calling
convention matches every other delta-helper call site; the real audit trail is
`purchase_inward_status_history`.

## 6. Audit trail

```sql
CREATE TABLE IF NOT EXISTS purchase_inward_status_history (
    id                 BIGSERIAL PRIMARY KEY,
    inward_id          BIGINT NOT NULL REFERENCES purchase_inwards(id) ON DELETE CASCADE,
    from_status        VARCHAR(20),          -- NULL on creation
    to_status          VARCHAR(20) NOT NULL,
    changed_by_user_id BIGINT REFERENCES factory_users(id),
    notes              TEXT,
    changed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pish_inward ON purchase_inward_status_history (inward_id, changed_at);
```

Mirrors `bom_status_history` (`db.render_arc.sql:2851-2860`) and the shared
`logStatusChange(client, bomId, fromStatus, toStatus, userId, notes)` helper pattern in
`bomController.js:896-901`. Add an equivalent `logInwardStatusChange()` helper in
`purchaseDepartmentController.js`, called at every transition: create, approve, reject,
edit-submit (`APPROVED → PENDING_UPDATE`), edit-approve (`PENDING_UPDATE → APPROVED`), edit-reject
(`PENDING_UPDATE → APPROVED`, with notes), reject-resubmit (`REJECTED → PENDING_APPROVAL`).

New ledger `source_kind` tags, extending the existing set (`inward_create`, `inward_approve`,
`inward_update_reverse`, `inward_update_apply`, `inward_delete`): add `inward_edit_apply` and
`inward_edit_reverse`, fired only from the edit-approval branch of `approveInward` (never at
edit-submission time, since nothing is applied until approval). Leave `inward_update_reverse` /
`inward_update_apply` as-is for the `REJECTED → PENDING_APPROVAL` resubmit path, since that's
still an immediate in-place update with no staging.

## 7. Role-guard gap fix (pre-existing bug, fix alongside this feature)

`routes/purchaseDepartmentRoutes.js` currently has **no role check at all** on:

- `POST /orders/:poId/inwards` (`createInward`, line ~92)
- `PATCH /inwards/:id` (`updateInward`, line ~111)
- `DELETE /inwards/:id` (`deleteInward`, line ~112)

Any authenticated user of any role can call these today. Add
`checkRole(['purchase_manager', 'factory_admin', 'store_manager'])` to all three, matching the
existing guard already on `POST /inwards` (line ~100-103). This is being fixed *because* the edit
feature makes the gap more consequential, not because it's new scope — flag it as such when
communicating this spec.

## 8. Invoice three-way-match guard

`purchase_invoices` line items key off `purchase_inward_item_id`
(`db.render_arc.sql:4320`, `ON DELETE SET NULL`). If an edit-approval deletes and reinserts
`purchase_inward_items`, any already-matched invoice's line FKs would go stale (silently set to
NULL). Simplest safe rule for v1: **block edit-submission with 409 if `inward.invoice_id IS NOT
NULL`**, mirroring the guard `deleteInward` already applies
(`purchaseDepartmentController.js:1802-1805`). Revisit proper invoice-relinking as a follow-up if
this proves too restrictive in practice (e.g. once three-way-match rematching after an edit is
actually needed).

## 9. REJECTED → edit → resubmit

No staging needed — nothing was ever posted to stock for a `REJECTED` inward (it was rejected
while still `PENDING_APPROVAL`, before any stock effects). `updateInward`'s existing in-place
item-replace logic (delete + reinsert `purchase_inward_items`, `stockApplied = false` since
`approval_status !== 'APPROVED'`) is correct as-is. The only changes needed: remove the current
refusal block (`purchaseDepartmentController.js:1671-1676`), set `approval_status =
'PENDING_APPROVAL'` on the header update, clear `rejection_notes` / `approved_by_user_id` /
`approved_at`, and log the `REJECTED → PENDING_APPROVAL` transition.

## 10. Summary of DB changes

1. Widen `purchase_inwards.approval_status` CHECK to include `PENDING_UPDATE`.
2. New table `purchase_inward_pending_edits`.
3. New table `purchase_inward_status_history`.
4. New `source_kind` values `inward_edit_apply` / `inward_edit_reverse` on the existing
   trigger-fed ledger tables (no schema change needed there — `source_kind` is a free-text column,
   just a new convention).

## 11. Summary of endpoint/behavior changes

1. `PATCH /inwards/:id` — new `APPROVED`/`PENDING_UPDATE` branches, `REJECTED` refusal removed,
   role guard added. Within the `APPROVED` branch: a rate-only edit (§5a) bypasses the consumption
   guard and applies immediately, no staging.
2. `PATCH /inwards/:id/approve` — atomic guard widened to include `PENDING_UPDATE`, new
   reverse+reapply branch.
3. `PATCH /inwards/:id/reject` — atomic guard widened to include `PENDING_UPDATE`, new
   discard-and-revert-to-APPROVED branch.
4. `POST /orders/:poId/inwards`, `DELETE /inwards/:id` — role guard added (§7).
5. New `GET /inwards/:id/pending-edit`.
