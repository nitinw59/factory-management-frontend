# FE Brief — Trim Kit Custody Flow + Trim Loss (Lost Trim) Exception

Backend is live for both features (branch `main`). This brief covers: the **normal flow** (trim order → kit picking → loader verification → custody signing, incl. partial handovers), **what to remove/change in existing screens**, and the **lost-trim exception** (search → escalate → PM investigation → debit notes → PM approval → HR salary recovery → replacement).

All endpoints are JWT-guarded (`Authorization: Bearer <token>`); the roles listed per endpoint are enforced server-side. Errors come back as `{ error: string }` with meaningful 4xx codes — surface `error` verbatim, it is written for the user.

---

## Part 1 — Normal flow (trim kit custody)

### The lifecycle (drive all status badges/steppers from this)

```
PENDING ──(store picks/fulfills)──▶ COMPLETED ──mark-ready──▶ READY_FOR_PICKUP ──loader verify+sign──▶ ISSUED (terminal)
   ▲                                    ▲     ◀──unmark-ready──┘        │                                ▲
   │                                    │                                ├── MISMATCH → demoted, store    │
   └────── revert allocation ───────────┘                                │   corrects, re-ready          │
                                                                         └── partial sign → PARTIALLY_ISSUED
                                                                             (store picks remainder,
                                                                              repeat ready→verify→sign) ──┘
```

`trim_order_status` values: `PENDING`, `PREPARED` (legacy manual), `COMPLETED`, `READY_FOR_PICKUP`, `PARTIALLY_ISSUED`, `ISSUED`.

**Key business rule (drives all copy):** fulfillment = *allocation only*. **Stock is deducted exactly once — when the loader signs.** Billing never moves stock anymore; a FINALIZED valuation bill is auto-created at signing. Each sign produces one issue slip (`GIS-<n>`) + one bill. Partial kits are allowed: sign what's picked now, the remainder goes out on later handovers on the same order.

### 1A. Store manager screens (existing — modify)

Base: `/api/store-manager` (roles unchanged).

| Endpoint | Change for FE |
|---|---|
| `GET /trim-orders/kpis` | New response fields: `readyForPickup`, `issued`, `partiallyIssued`. Add tiles/badges. |
| `GET /trim-orders` | New statuses appear under the `active` tab. Add badge colors for `READY_FOR_PICKUP`, `PARTIALLY_ISSUED`, `ISSUED`. |
| `GET /trim-orders/:orderId` | Fulfillment-log rows now include `issue_id`. **When `issue_id` is set, disable/hide the Revert button** on that row (custody already transferred) and show a "handed over on slip" indicator. |
| `PUT /trim-orders/:orderId` | New errors to handle: **409** when `READY_FOR_PICKUP` ("unmark-ready first") or `ISSUED` (immutable); **400** when sending manual `status` on an order that has handovers (status is computed now — hide the status dropdown once `PARTIALLY_ISSUED`/`ISSUED`); **400** when reducing `quantity_required` below what was already issued; **409** with a friendly message when removing items that have allocations/handovers. Success response includes the recomputed `status` — refresh the badge from it (dismissing missing items / trimming qty can auto-promote to `ISSUED`). |
| `POST /trim-orders/fulfill-with-variant`, `POST .../auto-fulfill`, `POST .../auto-fulfill-substitutes` | New **409** when the order is `READY_FOR_PICKUP` ("kit locked for pickup — unmark-ready first") or `ISSUED`. Show as a blocking toast. |
| `DELETE /trim-fulfillments/:fulfillmentId` | **409** for rows already issued. Success message changed to "Fulfillment allocation reverted." — **remove any "stock returned to inventory" copy**; no stock moves here. Order may demote to `PENDING` or `PARTIALLY_ISSUED` — refetch. |
| **NEW** `POST /trim-orders/:orderId/mark-ready` (store_manager, factory_admin) | Button "Mark kit ready" — enabled whenever status is `PENDING`/`PREPARED`/`COMPLETED`/`PARTIALLY_ISSUED` **and** something is picked. 409s: nothing picked since last handover; legacy-fulfillment log inconsistency (show error, direct user to revert+refulfill). Success → status `READY_FOR_PICKUP`, loaders notified. |
| **NEW** `POST /trim-orders/:orderId/unmark-ready` | Button "Pull back kit" visible only on `READY_FOR_PICKUP`. Returns the computed demoted status. |
| `GET /trim-orders/:orderId/bills` + `POST .../bills` (saveTrimBill) | Manual billing still works but is **valuation-only**. See "What to remove". Auto-bills created at signing have `source_issue_id` set — render them read-only, labeled "Auto (kit handover — GIS-n)". |

### 1B. Loader screens (NEW) — base `/api/trim-kits`

Roles: verify/sign = `line_loader`, `factory_admin`; read = those + `store_manager`, `production_manager`.

**Pickup queue** — `GET /trim-kits/ready`
Rows: `{ id, batch_code, kit_ready_at, kit_ready_by_name, item_count, total_qty }`. `total_qty` is the **current** kit only (unissued), correct across partial cycles.

**Kit checklist** — `GET /trim-kits/orders/:orderId`
```jsonc
{
  "id", "status", "batch_code",
  "kit_ready_at", "kit_ready_by_name", "signed_at", "signed_by_name",
  "issue_id", "issue_number",             // LATEST slip
  "delivery_production_line_id", "delivery_line_name",
  "items": [{
    "id", "quantity_required", "quantity_fulfilled", "is_fulfilled",
    "unissued_qty",                        // ← what the loader must count THIS cycle
    "item_name", "item_code", "color_name", "color_number", "variant_size",
    "fulfilled_with": [{                   // actual picked variants (substitutes!)
      "variant_id", "qty", "unissued_qty", "is_substitute",
      "item_name", "color_name", "color_number", "variant_size"
    }]
  }],
  "latest_verification": { "result", "verified_by_name", "created_at", "notes" } | null,
  "missing_items": [...],
  "slips": [{ "id", "issue_number", "total_value", "created_at", "issued_to_name",
              "bill_number", "bill_amount" }]   // handover history, one per signed cycle
}
```
UI: one count row per item **where `unissued_qty > 0`**; show `fulfilled_with` beneath it and flag substitutes clearly (the loader checks article/colour/size against what was *actually* picked). Show `slips[]` as a "Previous handovers" section.

**Verify & sign** — `POST /trim-kits/orders/:orderId/verify`
```jsonc
// request
{
  "items": [ { "trim_order_item_id": 1, "counted_qty": 6,
               "issue_kind": "WRONG_ITEM" /* optional */, "notes": "…" } ],
  "sign": true,          // "I take custody" checkbox — signature = logged-in loader + timestamp
  "notes": "…"           // optional overall note
}
```
Rules for the form:
- Must include **exactly** the items with `unissued_qty > 0` (400 otherwise).
- `counted_qty` integer ≥ 0. If it differs from `unissued_qty`, the server auto-classifies `SHORT_QTY`/`EXCESS_QTY` — no need to send `issue_kind` for count problems. Send `issue_kind` explicitly only for `WRONG_ITEM` / `DAMAGED` (these force a mismatch even when counts match).

Responses:
- **MISMATCH** (200): `{ result:'MISMATCH', verification_id, discrepancies:[{item_name, issue_kind, expected_qty, counted_qty}], order_status }` — kit went back to the store (they were notified). Show discrepancy list; loader is done for now.
- **MATCHED, not signed** (200, `sign:false`): `{ result:'MATCHED', signed:false }` — rare "counted fine, can't take it now".
- **SIGNED** (201): `{ result:'MATCHED', signed:true, order_status: 'ISSUED'|'PARTIALLY_ISSUED', issue:{id, issue_number, total_value}, bill:{bill_number, total_amount}, delivery_production_line_id, warnings:[…] }`. Show success with slip number; if `PARTIALLY_ISSUED`, show "partial handover — remainder follows in a later kit". Display `warnings` (e.g. unpriced items valued at 0) non-blockingly.
- **409s** to handle: kit not awaiting pickup / already signed by a concurrent loader; *legacy bill* on the order (old-flow billing already deducted stock — show the message, store must resolve); **stock shortfall** `{ error, variant_id, available, needed }` — someone consumed stock after picking; kit goes back to the store to correct.

**History** — `GET /trim-kits/orders/:orderId/verifications` → verifications with per-item rows (mismatch → correction → match trail). Good for an audit tab.

### 1C. What to REMOVE / stop doing in FE

1. **Remove any "billing deducts stock" behavior/copy.** `saveTrimBill` no longer touches stock (create or update). Stock-on-hand displayed anywhere must not be adjusted after billing.
2. **Remove the manual bill step from the kit flow.** Bills are auto-created at signing. Keep manual billing only for exceptional/legacy cases — and warn: *a manual bill on an unsigned kit order will block signing* (legacy-bill guard).
3. **Remove any use of `POST /trim-orders/fulfill-item`** (deleted server-side; was already route-disabled).
4. **Remove manual status editing** (`status` in `PUT /trim-orders/:orderId`) for orders at/after their first handover — the server rejects it; hide the control when status is `PARTIALLY_ISSUED`/`ISSUED`.
5. **Remove "COMPLETED = done" assumptions.** COMPLETED now means "fully allocated, not yet handed over". The terminal state is `ISSUED`.

### 1D. Notifications (existing notification center — new link_to targets)

| Recipient | Event | link_to |
|---|---|---|
| store_manager | Trim order auto-created at cut completion (this was silently broken before — now fires) | `/store/trim-orders/:id` |
| line_loader | Kit ready for pickup | `/trim-kits/orders/:id` |
| store_manager | Loader verification failed (with discrepancy summary) | `/store/trim-orders/:id` |
| store_manager | Kit signed — custody transferred (notes partial vs full) | `/store/trim-orders/:id` |

Make sure FE routes exist for these paths (or map them).

---

## Part 2 — Lost trim exception (trim loss cases + debit notes)

Base: `/api/trim-loss`. Roles: **reporters** = line_loader, line_supervisor, line_manager, production_manager, factory_admin; **pm** = production_manager, factory_admin; **hr** = hr_manager, factory_admin; **second approvers** = factory_admin, purchase_manager; **readers** = all of the above + store_manager, accountant.

### Case lifecycle (stepper for the case detail page)

```
REPORTED ──found in full──▶ FOUND (terminal = near-miss)
    │
    └─not found / partial─▶ ESCALATED ─▶ UNDER_INVESTIGATION ─▶ RESPONSIBILITY_FIXED ─▶ DEBIT_APPROVED ─▶ CLOSED
                                 │                                                            (auto, when HR
                                 └────────────── CANCELLED (false alarm) ──────────────       recovers all notes)
```

Replacement runs **in parallel** (not part of the status stepper): in-stock = single PM approval; out-of-stock = double approval (PM + factory/purchase head) raising an URGENT purchase requirement.

### 2A. Report + search (loader / line supervisor)

**Report missing** — `POST /cases` (reporters)
```jsonc
{ "trim_item_variant_id": 123,          // XOR general_item_id — exactly one
  "missing_qty": 5,                      // whole number for trims
  "original_issue_id": 456,              // the kit slip's issue id — PREFILL THIS (see integration below)
  "production_line_id": 1, "production_batch_id": 3,   // optional context
  "search_deadline": "2026-07-14T14:00:00Z",           // optional, informational (same shift)
  "notes": "missing at line loading" }
→ 201 { "id", "case_number": "TLC-7", "message" }
```
Server validates against the slip when `original_issue_id` is given (item must be on the slip; `missing_qty` ≤ issued qty) and snapshots the unit cost.

**Integration point:** on the kit detail / order detail screens, add a **"Report missing/lost"** action on each slip line that opens this form with `original_issue_id`, variant, line and batch prefilled. This is how the PM later "checks the custody trail" — the case links to the signed slip.

**Record search outcome** — `PATCH /cases/:id/search-outcome` (reporters, only from REPORTED)
```jsonc
{ "outcome": "found" | "not_found", "found_qty": 3 /* optional */, "notes": "…" }
```
- Everything found → case `FOUND`, closed — appears in the **near-miss register**. Show "logged as near-miss".
- Partial/none → `ESCALATED`; PM is notified automatically. Partial finds record `found_qty`; the rest of the flow works on the **outstanding qty = missing − found**.

UI: after reporting, show the search checklist from the SOP as guidance copy ("search the line, trolleys, cartons, store receiving area, previous batch kits — within the shift") plus the two outcome buttons.

### 2B. PM screens (investigation → responsibility → debit approval)

PM lands from the notification or a queue: `GET /cases?status=ESCALATED,UNDER_INVESTIGATION,RESPONSIBILITY_FIXED`.

1. **Start investigation** — `PATCH /cases/:id/start-investigation` `{ notes? }` (from ESCALATED). The case detail already shows the original slip + its lines + who signed it (`GET /cases/:id`) — that is the custody trail the PM reviews, alongside hearing loader/operators/supervisor offline.

2. **Fix responsibility** — `POST /cases/:id/fix-responsibility`
```jsonc
{ "findings": "Loader kept custody of 2, operator had taken 3",   // required
  "debits": [                                                       // must SUM to outstanding qty
    { "employee_id": 22, "qty": 2, "reason": "custody not transferred (loader)" },
    { "employee_id": 31, "qty": 3, "reason": "had taken custody (operator)" }
  ],
  "write_off": false }                                              // true + empty debits = company absorbs
→ 201 { "status": "RESPONSIBILITY_FIXED", "debit_notes": [{ "id", "debit_note_number": "DN-4", "employee_name", "qty", "amount" }] }
```
Form rules: employee picker = Active employees (`employee_master`); qty split must equal the outstanding qty exactly (server 400s otherwise — validate client-side too); amount preview = qty × case `unit_cost`. Re-submitting replaces still-PENDING notes (allowed until approval). A **write-off** needs an explicit checkbox.

3. **Approve debit notes (PM approval)** — `PATCH /cases/:id/approve-debits` (from RESPONSIBILITY_FIXED)
→ all PENDING notes become APPROVED, case → `DEBIT_APPROVED`, **HR is notified automatically** (approval *is* the hand-off — there is no separate "send to HR" action; don't build one).

4. **Close / cancel** — `PATCH /cases/:id/close` `{notes}` (manual close, only for the write-off path once no notes are outstanding) and `PATCH /cases/:id/cancel` `{notes}` (false alarm/duplicate; only before responsibility is fixed).

### 2C. HR screen (salary recovery)

- **Pending recoveries queue** — `GET /debit-notes?status=APPROVED` (also filters: `employee_id`, `case_id`, `date_from/to`, `limit/offset`). Rows carry `debit_note_number`, `employee_name`, `case_number`, `item_name`, `qty`, `unit_cost`, `amount`, approver + timestamps.
- **Confirm recovery** — `PATCH /debit-notes/:id/confirm-recovery` `{ "recovery_notes": "Deducted from July 2026 salary" }`
  → note `RECOVERED`. When the **last** note on a case turns terminal, the case **auto-closes** (response includes `case_status: "CLOSED"`) and PM + reporter are notified. Show that in the success toast.

### 2D. Replacement (parallel track — buttons on the case detail, PM role)

Available once status is `RESPONSIBILITY_FIXED` / `DEBIT_APPROVED` (or later for issue-on-receipt):

1. **In stock — single approval:** `POST /cases/:id/replacement/issue-from-stock` `{ issued_to_employee_id? }` (defaults to the original slip's recipient; kit slips have none, so **require the picker when the case's original slip is a kit slip**).
   - 201 `{ issue_id, issue_number, qty }` — replacement slip issued, stock deducted, marked "(debit)" against the case, `recover_from_salary=false` (money is recovered via the debit note — never twice).
   - **409 `{ error, available }`** = insufficient stock → offer the purchase path.
2. **Out of stock — double approval:**
   - `POST /cases/:id/replacement/request-purchase` (PM) → 1st approval, notifies factory_admin + purchase_manager.
   - `POST /cases/:id/replacement/approve-purchase` (factory_admin/purchase_manager, **must be a different user than the requesting PM** — server 403s otherwise) → 201 `{ requirement_id }`: an URGENT standalone purchase requirement appears in the existing purchase-department screens. After goods arrive via the normal inward flow, the same **issue-from-stock** button links the actual replacement slip.

Render the replacement panel state from the case fields: `replacement_mode` (`STOCK`/`PURCHASE`), `replacement_pm_approved_by/at`, `replacement_second_approved_by/at`, `replacement_issue_id`/`replacement_issue_number`, `replacement_requirement_id`/`replacement_requirement_status`.

### 2E. Registers + case detail

- **Trim Loss Register** — `GET /cases?status=ESCALATED,UNDER_INVESTIGATION,RESPONSIBILITY_FIXED,DEBIT_APPROVED,CLOSED` (+ filters line/item/slip/date). Rows include `outstanding_qty`, `loss_value`, `note_count`, `debit_total`, `recovered_count`.
- **Near-miss Register** — `GET /cases/near-misses` (same row shape, status FOUND).
- **Case detail** — `GET /cases/:id`: everything for one page — case + item + original slip header & matching lines, full `status_history` (timeline component), `debit_notes` with employee names, replacement summaries, `sibling_cases` (other losses on the same slip).

### 2F. Notifications (trim loss)

| Recipient | Event | link_to |
|---|---|---|
| production_manager | Case escalated (not found after search) | `/trim-loss/cases/:id` |
| hr_manager | Debit notes approved — recover from salary | `/trim-loss/cases/:id` |
| factory_admin + purchase_manager | Urgent replacement purchase needs 2nd approval | `/trim-loss/cases/:id` |
| purchase_manager | URGENT requirement raised | `/purchase-department/requirements?standalone=true` |
| PM + reporter | Case closed after HR recovery | `/trim-loss/cases/:id` |
| store_manager | Replacement slip issued | `/trim-loss/cases/:id` |

---

## Suggested build order

1. Store: mark-ready / unmark-ready buttons + new status badges + KPI tiles + revert-button gating (`issue_id` on log rows) — small changes, unblocks the flow.
2. Loader: pickup queue + kit checklist + verify/sign form (the core new screen).
3. Handover history (slips[]) + verification history tabs.
4. Trim loss: report + search-outcome (loader), PM queue + investigation + debits + approval, HR recovery queue.
5. Replacement panel + registers.

## Role → screen map (quick reference)

| Role | Sees |
|---|---|
| store_manager | Trim orders (fulfill, mark-ready, bills read-only for auto-bills), mismatch notifications, trim-loss registers (read) |
| line_loader | Pickup queue, kit checklist, verify & sign, report-missing, search outcome |
| line_supervisor / line_manager | Report-missing, search outcome, case read |
| production_manager | Loss case queue, investigation, fix responsibility, approve debits, replacement (1st approval), close/cancel, registers |
| hr_manager | Debit-note recovery queue, confirm recovery |
| factory_admin / purchase_manager | Replacement 2nd approval; purchase requirement lands in existing purchase screens |
| accountant | Registers + debit notes (read) |
