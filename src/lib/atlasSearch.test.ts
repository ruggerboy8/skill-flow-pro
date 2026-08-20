import { describe, it, expect } from 'vitest';
import { searchAtlasMoves } from './atlasSearch';
import type { AtlasCompetency } from '@/hooks/useCraftAtlas';
import type { ProMoveDetail } from '@/hooks/useDomainDetail';

function move(action_id: number, action_statement: string, description: string | null = null): ProMoveDetail {
  return {
    action_id,
    action_statement,
    description,
    lastPracticed: null,
    avgConfidence: null,
  } as ProMoveDetail;
}

function competency(overrides: Partial<AtlasCompetency> & { competency_id: number }): AtlasCompetency {
  return {
    competency_id: overrides.competency_id,
    domainId: overrides.domainId ?? 1,
    domainName: overrides.domainName ?? 'Clinical',
    title: overrides.title ?? 'Untitled competency',
    subtitle: overrides.subtitle ?? null,
    description: overrides.description ?? null,
    observerScore: overrides.observerScore ?? null,
    observerNote: overrides.observerNote ?? null,
    proMoves: overrides.proMoves ?? [],
  };
}

describe('searchAtlasMoves', () => {
  it('returns [] for an empty query (restores the structured band view)', () => {
    const corpus = [
      competency({ competency_id: 1, title: 'Chairside Manner', proMoves: [move(1, 'Greet the patient by name')] }),
    ];
    expect(searchAtlasMoves(corpus, '')).toEqual([]);
  });

  it('returns [] for a whitespace-only query', () => {
    const corpus = [
      competency({ competency_id: 1, title: 'Chairside Manner', proMoves: [move(1, 'Greet the patient by name')] }),
    ];
    expect(searchAtlasMoves(corpus, '   ')).toEqual([]);
  });

  it('matches a move by its action_statement', () => {
    const corpus = [
      competency({
        competency_id: 1,
        title: 'Chairside Manner',
        proMoves: [move(1, 'Greet the patient by name'), move(2, 'Confirm insurance details')],
      }),
    ];
    const results = searchAtlasMoves(corpus, 'greet');
    expect(results.map((r) => r.move.action_id)).toEqual([1]);
  });

  it('matches a move by its description', () => {
    const corpus = [
      competency({
        competency_id: 1,
        title: 'Chairside Manner',
        proMoves: [move(1, 'Say hello', 'Use a warm tone when greeting families at check-in.')],
      }),
    ];
    const results = searchAtlasMoves(corpus, 'warm tone');
    expect(results.map((r) => r.move.action_id)).toEqual([1]);
  });

  it('matching a competency title surfaces every move under it', () => {
    const corpus = [
      competency({
        competency_id: 1,
        title: 'Case Presentation',
        proMoves: [move(1, 'Explain the treatment plan'), move(2, 'Discuss financing options')],
      }),
      competency({
        competency_id: 2,
        title: 'Scheduling',
        proMoves: [move(3, 'Confirm the next appointment')],
      }),
    ];
    const results = searchAtlasMoves(corpus, 'Case Presentation');
    expect(results.map((r) => r.move.action_id).sort()).toEqual([1, 2]);
  });

  it('matching a competency subtitle or description surfaces its moves', () => {
    const corpus = [
      competency({
        competency_id: 1,
        title: 'Financial Conversations',
        subtitle: 'Talking through cost with confidence',
        proMoves: [move(1, 'Present the estimate')],
      }),
      competency({
        competency_id: 2,
        title: 'Financial Conversations Follow-up',
        description: 'How to talk through cost objections after the visit.',
        proMoves: [move(2, 'Follow up on unpaid balances')],
      }),
    ];
    expect(searchAtlasMoves(corpus, 'confidence').map((r) => r.move.action_id)).toEqual([1]);
    expect(searchAtlasMoves(corpus, 'objections').map((r) => r.move.action_id)).toEqual([2]);
  });

  it('matching a domain name surfaces moves across every competency in that domain', () => {
    const corpus = [
      competency({
        competency_id: 1,
        domainName: 'Cultural',
        title: 'Team Rituals',
        proMoves: [move(1, 'Run the morning huddle')],
      }),
      competency({
        competency_id: 2,
        domainName: 'Cultural',
        title: 'Onboarding',
        proMoves: [move(2, 'Welcome a new hire')],
      }),
      competency({
        competency_id: 3,
        domainName: 'Clinical',
        title: 'Sterilization',
        proMoves: [move(3, 'Log the autoclave cycle')],
      }),
    ];
    const results = searchAtlasMoves(corpus, 'Cultural');
    expect(results.map((r) => r.move.action_id).sort()).toEqual([1, 2]);
  });

  it('is case-insensitive', () => {
    const corpus = [
      competency({ competency_id: 1, title: 'Chairside Manner', proMoves: [move(1, 'Greet the patient by name')] }),
    ];
    expect(searchAtlasMoves(corpus, 'GREET').map((r) => r.move.action_id)).toEqual([1]);
    expect(searchAtlasMoves(corpus, 'GrEeT').map((r) => r.move.action_id)).toEqual([1]);
  });

  it('trims leading/trailing whitespace and collapses internal whitespace', () => {
    const corpus = [
      competency({
        competency_id: 1,
        title: 'Chairside Manner',
        proMoves: [move(1, 'Greet   the patient by name')],
      }),
    ];
    expect(searchAtlasMoves(corpus, '  greet the patient  ').map((r) => r.move.action_id)).toEqual([1]);
  });

  it('requires every token in a multi-word query to match (AND, not OR)', () => {
    const corpus = [
      competency({
        competency_id: 1,
        title: 'Chairside Manner',
        proMoves: [
          move(1, 'Confirm the appointment time with the patient'),
          move(2, 'Confirm insurance eligibility before the visit'),
        ],
      }),
    ];
    const results = searchAtlasMoves(corpus, 'confirm appointment');
    expect(results.map((r) => r.move.action_id)).toEqual([1]);
  });

  it('returns no results when no field matches', () => {
    const corpus = [
      competency({ competency_id: 1, title: 'Chairside Manner', proMoves: [move(1, 'Greet the patient by name')] }),
    ];
    expect(searchAtlasMoves(corpus, 'zzz-not-present')).toEqual([]);
  });

  it('excludes competencies with no domainName, mirroring the browse-view gap for null domain_id', () => {
    const corpus = [
      competency({
        competency_id: 1,
        domainName: '',
        title: 'Unmapped Competency',
        proMoves: [move(1, 'Do the unmapped thing')],
      }),
    ];
    expect(searchAtlasMoves(corpus, 'unmapped')).toEqual([]);
  });

  it('handles an empty corpus without throwing', () => {
    expect(searchAtlasMoves([], 'anything')).toEqual([]);
  });
});
