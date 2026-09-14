// Pure decision logic for the /coach/:staffId header identity + guard states
// (StaffDetailV2). Extracted so the identity/error/not-found precedence
// rules can be unit tested without rendering the page.
//
// Two independent sources feed the header:
//  - a direct lookup on the `staff` table (RLS-governed, no coach_scopes
//    branch)
//  - the get_staff_all_weekly_scores RPC, which authorizes viewers via
//    can_current_user_view_staff (this DOES have a coach_scopes branch, e.g.
//    a lead with is_lead + a scope row passes without can_view_submissions)
//
// A viewer can therefore be authorized for the RPC while the direct lookup
// legitimately returns null. See PR #112 Codex review (P1, P2).

export type StaffIdentity = {
  name: string;
  role_id: number;
  role_name: string;
  location_id: string | null;
  location_name: string;
  group_name: string;
};

export type StaffDetailViewState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'not-found' }
  | { kind: 'ready'; staffInfo: StaffIdentity };

export function resolveStaffDetailViewState(params: {
  loading: boolean;
  staffInfoLoading: boolean;
  error: Error | null | undefined;
  staffInfoError: Error | null | undefined;
  directStaffInfo: StaffIdentity | null | undefined;
  rpcDerivedStaffInfo: StaffIdentity | null | undefined;
}): StaffDetailViewState {
  const {
    loading,
    staffInfoLoading,
    error,
    staffInfoError,
    directStaffInfo,
    rpcDerivedStaffInfo,
  } = params;

  if (loading || staffInfoLoading) {
    return { kind: 'loading' };
  }

  // Errors take precedence over "not found": a transient failure in either
  // source must never claim the person does not exist. When both errored,
  // this still renders a single error state.
  const identityOrRpcError = error ?? staffInfoError ?? null;
  if (identityOrRpcError) {
    return { kind: 'error', message: identityOrRpcError.message };
  }

  // Prefer the direct staff-table lookup; fall back to the RPC-derived
  // identity only when the direct lookup came back empty. "Not found" is
  // reserved for when neither source produced an identity.
  const staffInfo = directStaffInfo ?? rpcDerivedStaffInfo ?? null;
  if (!staffInfo) {
    return { kind: 'not-found' };
  }

  return { kind: 'ready', staffInfo };
}
