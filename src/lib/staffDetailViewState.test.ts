import { describe, it, expect } from 'vitest';
import { resolveStaffDetailViewState, type StaffIdentity } from './staffDetailViewState';

const directIdentity: StaffIdentity = {
  name: 'Direct Dana',
  role_id: 1,
  role_name: 'RDA',
  location_id: 'loc-1',
  location_name: 'Main St',
  group_name: 'Alcan',
};

const rpcIdentity: StaffIdentity = {
  name: 'RPC Rita',
  role_id: 2,
  role_name: 'DA',
  location_id: 'loc-2',
  location_name: 'Oak Ave',
  group_name: 'Alcan',
};

const base = {
  loading: false,
  staffInfoLoading: false,
  error: null,
  staffInfoError: null,
  directStaffInfo: null,
  rpcDerivedStaffInfo: null,
} as const;

describe('resolveStaffDetailViewState', () => {
  it('shows loading while either source is still loading', () => {
    expect(resolveStaffDetailViewState({ ...base, loading: true })).toEqual({ kind: 'loading' });
    expect(resolveStaffDetailViewState({ ...base, staffInfoLoading: true })).toEqual({ kind: 'loading' });
  });

  it('prefers the direct lookup when both sources have an identity', () => {
    expect(
      resolveStaffDetailViewState({
        ...base,
        directStaffInfo: directIdentity,
        rpcDerivedStaffInfo: rpcIdentity,
      })
    ).toEqual({ kind: 'ready', staffInfo: directIdentity });
  });

  it('falls back to the RPC-derived identity when the direct lookup is empty (P1: coach_scopes authorization mismatch)', () => {
    expect(
      resolveStaffDetailViewState({
        ...base,
        directStaffInfo: null,
        rpcDerivedStaffInfo: rpcIdentity,
      })
    ).toEqual({ kind: 'ready', staffInfo: rpcIdentity });
  });

  it('reports not-found only when both sources are empty and neither errored', () => {
    expect(resolveStaffDetailViewState(base)).toEqual({ kind: 'not-found' });
  });

  it('reports the identity-lookup error on its own, never as not-found (P2)', () => {
    const err = new Error('identity lookup failed');
    expect(
      resolveStaffDetailViewState({
        ...base,
        staffInfoError: err,
        rpcDerivedStaffInfo: rpcIdentity,
      })
    ).toEqual({ kind: 'error', message: 'identity lookup failed' });
  });

  it('reports the RPC error even when the direct lookup succeeded', () => {
    const err = new Error('rpc failed');
    expect(
      resolveStaffDetailViewState({
        ...base,
        error: err,
        directStaffInfo: directIdentity,
      })
    ).toEqual({ kind: 'error', message: 'rpc failed' });
  });

  it('shows a single error state when both sources errored', () => {
    const rpcErr = new Error('rpc failed');
    const identityErr = new Error('identity failed');
    const result = resolveStaffDetailViewState({
      ...base,
      error: rpcErr,
      staffInfoError: identityErr,
    });
    expect(result.kind).toBe('error');
  });

  it('errors take precedence over a would-be not-found result', () => {
    const err = new Error('rpc failed');
    expect(
      resolveStaffDetailViewState({
        ...base,
        error: err,
        directStaffInfo: null,
        rpcDerivedStaffInfo: null,
      })
    ).toEqual({ kind: 'error', message: 'rpc failed' });
  });
});
