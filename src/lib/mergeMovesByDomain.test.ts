import { describe, it, expect } from 'vitest';
import { mergeMovesByDomain, type DomainGroupable } from './mergeMovesByDomain';

interface TestMove extends DomainGroupable {
  id: string;
  isOrgCustom: boolean;
}

describe('mergeMovesByDomain', () => {
  it('orders by the canonical domain order (Clinical, Clerical, Cultural, Case Acceptance)', () => {
    const platform: TestMove[] = [
      { id: 'p1', isOrgCustom: false, domain_name: 'Case Acceptance', action_statement: 'Z' },
      { id: 'p2', isOrgCustom: false, domain_name: 'Clinical', action_statement: 'A' },
    ];
    const result = mergeMovesByDomain(platform, []);
    expect(result.map(r => r.id)).toEqual(['p2', 'p1']);
  });

  it('mixes org custom moves in with platform moves of the same domain, not in a separate block', () => {
    const platform: TestMove[] = [
      { id: 'p1', isOrgCustom: false, domain_name: 'Clinical', action_statement: 'B move' },
    ];
    const org: TestMove[] = [
      { id: 'o1', isOrgCustom: true, domain_name: 'Clinical', action_statement: 'A move' },
    ];
    const result = mergeMovesByDomain(platform, org);
    // 'A move' sorts before 'B move' within the same domain, regardless of
    // which array it came from.
    expect(result.map(r => r.id)).toEqual(['o1', 'p1']);
  });

  it('sorts unrecognized domains last', () => {
    const platform: TestMove[] = [
      { id: 'p1', isOrgCustom: false, domain_name: 'Unknown', action_statement: 'A' },
      { id: 'p2', isOrgCustom: false, domain_name: 'Cultural', action_statement: 'Z' },
    ];
    const result = mergeMovesByDomain(platform, []);
    expect(result.map(r => r.id)).toEqual(['p2', 'p1']);
  });

  it('returns platform moves unchanged when there are no org moves', () => {
    const platform: TestMove[] = [
      { id: 'p1', isOrgCustom: false, domain_name: 'Clerical', action_statement: 'A' },
    ];
    expect(mergeMovesByDomain(platform, [])).toEqual(platform);
  });

  it('returns org moves alone when there are no platform moves', () => {
    const org: TestMove[] = [
      { id: 'o1', isOrgCustom: true, domain_name: 'Clerical', action_statement: 'A' },
    ];
    expect(mergeMovesByDomain([], org)).toEqual(org);
  });
});
