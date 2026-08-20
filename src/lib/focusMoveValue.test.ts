import { describe, it, expect } from 'vitest';
import { selectFocusMoveValueTier } from './focusMoveValue';

describe('selectFocusMoveValueTier', () => {
  it('picks the script tier when a script is present, regardless of what else exists', () => {
    const result = selectFocusMoveValueTier({
      script: 'Ask the patient how their day is going.',
      audioUrl: 'https://example.com/audio.mp3',
      description: 'A long description.',
      actionStatement: 'Greet every patient by name.',
    });
    expect(result).toEqual({ tier: 'script', label: 'Read the script' });
  });

  it('falls back to audio when there is no script', () => {
    const result = selectFocusMoveValueTier({
      script: null,
      audioUrl: 'https://example.com/audio.mp3',
      description: 'A long description.',
      actionStatement: 'Greet every patient by name.',
    });
    expect(result).toEqual({ tier: 'audio', label: 'Listen' });
  });

  it('falls back to the description when there is no script or audio', () => {
    const result = selectFocusMoveValueTier({
      script: null,
      audioUrl: null,
      description: 'A long description of how to do this move well.',
      actionStatement: 'Greet every patient by name.',
    });
    expect(result).toEqual({ tier: 'description', label: 'How to do this move' });
  });

  it('falls back to the action statement when nothing else exists (the ~100%-coverage floor)', () => {
    const result = selectFocusMoveValueTier({
      script: null,
      audioUrl: null,
      description: null,
      actionStatement: 'Greet every patient by name.',
    });
    expect(result).toEqual({ tier: 'statement', label: 'How to do this move' });
  });

  it('never promises "Listen" or "Read the script" for a text-only tier', () => {
    const descriptionResult = selectFocusMoveValueTier({
      description: 'A long description.',
      actionStatement: 'Greet every patient by name.',
    });
    const statementResult = selectFocusMoveValueTier({
      actionStatement: 'Greet every patient by name.',
    });
    expect(descriptionResult?.label).not.toMatch(/listen|script/i);
    expect(statementResult?.label).not.toMatch(/listen|script/i);
  });

  it('treats whitespace-only strings as empty and keeps falling back', () => {
    const result = selectFocusMoveValueTier({
      script: '   ',
      audioUrl: '',
      description: '\n\t',
      actionStatement: 'Greet every patient by name.',
    });
    expect(result).toEqual({ tier: 'statement', label: 'How to do this move' });
  });

  it('returns null when every field is empty (never renders an empty shell — caller must hide the card)', () => {
    const result = selectFocusMoveValueTier({
      script: null,
      audioUrl: null,
      description: null,
      actionStatement: null,
    });
    expect(result).toBeNull();
  });

  it('returns null for a fully undefined input', () => {
    expect(selectFocusMoveValueTier({})).toBeNull();
  });

  it('prefers script over audio when both are present', () => {
    const result = selectFocusMoveValueTier({
      script: 'Say this exact line.',
      audioUrl: 'https://example.com/audio.mp3',
    });
    expect(result?.tier).toBe('script');
  });
});
