// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  tokenize,
  diceSimilarity,
  confidenceScore,
  passesQualityGate,
} from './quality';

/** Matches DEFAULT_CONFIDENCE_THRESHOLD in settings.ts. */
const DEFAULT_THRESHOLD = 50;

describe('tokenize', () => {
  it('lowercases, strips punctuation, and splits on whitespace', () => {
    expect(tokenize("I don't like it — really!")).toEqual(['i', 'dont', 'like', 'it', 'really']);
  });

  it('handles empty and whitespace-only input', () => {
    expect(tokenize('')).toEqual([]);
    expect(tokenize('   ')).toEqual([]);
  });
});

describe('diceSimilarity', () => {
  it('returns 1 for identical token lists (incl. duplicates)', () => {
    expect(diceSimilarity(['a', 'b', 'a'], ['a', 'b', 'a'])).toBe(1);
  });

  it('returns 0 for disjoint token lists', () => {
    expect(diceSimilarity(['a', 'b'], ['c', 'd'])).toBe(0);
  });

  it('counts shared tokens via multiset (duplicates consumed once)', () => {
    // a:[a,a,b] b:[a,c] → shared=1 → 2*1/(3+2)=0.4
    expect(diceSimilarity(['a', 'a', 'b'], ['a', 'c'])).toBeCloseTo(0.4);
  });

  it('returns 1 when both lists are empty', () => {
    expect(diceSimilarity([], [])).toBe(1);
  });
});

describe('confidenceScore', () => {
  it('scores a word-preserving rewrite high', () => {
    const score = confidenceScore(
      'I am very agree with your opinion about this matter entirely',
      'I completely agree with your opinion on this matter',
    );
    expect(score).toBeGreaterThanOrEqual(60);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('scores verbatim output 100', () => {
    expect(confidenceScore('already natural text here', 'already natural text here')).toBe(100);
  });

  it('scores punctuation-only differences 100', () => {
    expect(confidenceScore('That was a good movie, I liked it.', 'That was a good movie; I liked it.')).toBe(100);
  });

  it('scores disjoint output 0', () => {
    expect(confidenceScore('hello world', 'completely different topic')).toBe(0);
  });

  it('zeroes the score when length collapsed or exploded (out of bounds)', () => {
    expect(confidenceScore('a sentence that is long enough to matter', 'hi')).toBe(0);
    expect(confidenceScore('short', 'a '.repeat(50) + 'long')).toBe(0);
    // In-bounds length ratio does not zero an overlapping pair.
    expect(confidenceScore('hello world my friend', 'hello my friend')).toBeGreaterThan(0);
  });
});

describe('passesQualityGate', () => {
  it('admits a word-preserving rewrite at the default threshold', () => {
    expect(
      passesQualityGate(
        'I am very agree with your opinion about this matter entirely',
        'I completely agree with your opinion on this matter',
        DEFAULT_THRESHOLD,
      ),
    ).toBe(true);
  });

  it('rejects disjoint output', () => {
    expect(passesQualityGate('hello world', 'completely different topic', DEFAULT_THRESHOLD)).toBe(false);
  });

  it('rejects truncated output regardless of threshold', () => {
    expect(passesQualityGate('a sentence that is long enough to matter', 'hi', DEFAULT_THRESHOLD)).toBe(false);
  });

  it('is inclusive at the boundary (score === threshold passes)', () => {
    // tokenize('text one') ∩ tokenize('polished one') = {one} → dice 0.5 → 50.
    expect(confidenceScore('text one', 'polished one')).toBe(50);
    expect(passesQualityGate('text one', 'polished one', 50)).toBe(true);
    expect(passesQualityGate('text one', 'polished one', 51)).toBe(false);
  });

  it('threshold 0 admits everything; threshold 100 admits only near-verbatim', () => {
    expect(passesQualityGate('hello world', 'completely different', 0)).toBe(true);
    expect(passesQualityGate('hello world', 'hello world!', 100)).toBe(true);
    expect(passesQualityGate('hello world', 'hello my world', 100)).toBe(false);
  });
});
