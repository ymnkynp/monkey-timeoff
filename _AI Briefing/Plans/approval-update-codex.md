# Approval update (stand-in/substitute) – plan

## Context recap
- Current approval is single-approver: department boss or supervisors. `Leave.status` tracks state (new/approved/rejected/pended_revoke/canceled) and `approverId` stores the last actor. Approval actions live in `lib/route/calendar.js` (new request) and `lib/route/requests.js` (approve/reject/cancel/revoke). Approver discovery is via `promise_supervisors()` and `promise_leaves_to_be_processed()` in `lib/model/mixin/user/absence_aware.js`.
- Need a per-user default stand-in so Person B also approves Person A’s leave; leave is approved only after both stand-in and department manager approve.
- Screenshots available under `_AI Briefing/Screenshots` for reference to current UI look and feel.

## Proposed approach
- Data model
  - Add `stand_in_user_id` nullable FK on `users` (self-reference, same company validation).
  - Add `leave_approvals` table to track per-approver decisions: `leave_id`, `approver_id`, `role` (`manager`/`stand_in`), `status` (`pending`/`approved`/`rejected`), `decided_at`, timestamps. Keep `Leave.approverId` as “last actor” for backward compatibility but move logic to the new table.
  - Migration seeds a `manager` approval row for existing pending leaves; for already approved leaves, mark manager approval approved and set leave status as today. Stand-in rows only created for users that have one configured.
- Core flow changes
  - On leave creation, determine manager (current boss) and optional stand-in. Create `leave_approvals` rows for each distinct approver.
  - Approval/rejection acts on the specific `leave_approval` row, updates `Leave.approverId`, and recomputes aggregate `Leave.status`: rejected if any required approver rejects; approved only when all required approvers approved; otherwise keep `new`/`pended_revoke`.
  - `promise_leaves_to_be_processed` should surface leaves that have a pending `leave_approval` for the acting user (so stand-ins see them even if they are not supervisors). Decision endpoints should validate the acting user is an expected approver for that leave.
  - Revoke/cancel flows should either rehydrate the approval rows (e.g., approvals reset to pending for revoke) or short-circuit if auto-approve; needs explicit rules.
- UI/UX
  - Admin/user edit form: select “Default stand-in” (other active users in the same company). Show stand-in on user list/profile.
  - Requests/approvals UI: display both approvers and their statuses; ensure stand-ins can action from their Requests page. Consider labels/icons consistent with existing style.
  - Email/notification: send the same request emails to stand-ins; wording should clarify dual-approval requirement.
- Validation/guards
  - Prevent selecting self as stand-in; block cross-company stand-ins; handle when stand-in is inactive or missing (fallback to manager-only approval).
  - Handle duplicates when manager equals stand-in.
- Testing
  - Unit: approval aggregation rules, pending approval queries, migration defaulting.
  - Integration: creating leave with/without stand-in, approve/reject combinations, revoke/cancel paths, UI controllers showing pending items for stand-ins.
  - Data migration dry run on SQLite to validate schema.

## Open questions / decisions
1) Auto-approve users/leave types: still auto-approve; stand-in is not required if auto-approve triggers. ✅
2) Rejection handling: if either required approver rejects, the request is immediately rejected. ✅
3) Revoke flow: only managers approve revokes (stand-in not involved); define how to reset/seed approvals accordingly. ✅
4) Stand-in scope: any active user in the company (not limited to department); still must prevent self-selection. ✅
5) Visibility: show both approval statuses (e.g., “approved 1/2”) in employee Requests view and in emails. ✅
6) Reminders: when used, they should go to the approver(s) still pending. Need to decide whether to add a reminder job or keep manual.
