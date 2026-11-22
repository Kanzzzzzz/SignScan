import { describe, expect, it } from 'vitest';
import { Stabilizer, TextComposer, type StableState } from '../src/lib/stabilizer';

const p = (label: string, confidence = 0.95) => ({ label, confidence });

describe('Stabilizer', () => {
  it('reports a letter once enough frames agree', () => {
    const s = new Stabilizer({ window: 5, threshold: 0.7, minAgree: 0.6 });
    expect(s.push(p('A')).kind).toBe('unsure');
    expect(s.push(p('A')).kind).toBe('unsure');
    const st = s.push(p('A'));
    expect(st).toMatchObject({ kind: 'letter', letter: 'A' });
  });

  it('ignores low-confidence frames', () => {
    const s = new Stabilizer({ window: 5, threshold: 0.7, minAgree: 0.6 });
    for (let i = 0; i < 5; i++) expect(s.push(p('A', 0.5)).kind).toBe('unsure');
  });

  it('does not flip on a single outlier frame', () => {
    const s = new Stabilizer({ window: 5, threshold: 0.7, minAgree: 0.6 });
    for (let i = 0; i < 5; i++) s.push(p('A'));
    expect(s.push(p('B'))).toMatchObject({ kind: 'letter', letter: 'A' });
  });

  it('reports no hand when the hand leaves', () => {
    const s = new Stabilizer({ window: 4, threshold: 0.7, minAgree: 0.6 });
    for (let i = 0; i < 4; i++) s.push(p('A'));
    s.push(null);
    expect(s.push(null).kind).toBe('nohand');
  });

  it('averages confidence of agreeing frames', () => {
    const s = new Stabilizer({ window: 2, threshold: 0.5, minAgree: 1 });
    s.push(p('C', 0.8));
    const st = s.push(p('C', 1.0));
    expect(st.kind === 'letter' && st.confidence).toBeCloseTo(0.9);
  });
});

describe('TextComposer', () => {
  const L = (letter: string): StableState => ({ kind: 'letter', letter, confidence: 0.9 });
  const none: StableState = { kind: 'nohand' };
  const unsure: StableState = { kind: 'unsure', best: null };

  it('types a letter after the hold time, once', () => {
    const c = new TextComposer({ holdMs: 800, spaceMs: 1500 });
    expect(c.update(L('A'), 0).committed).toBe('');
    expect(c.update(L('A'), 500).progress).toBeCloseTo(500 / 800);
    expect(c.update(L('A'), 800).committed).toBe('A');
    expect(c.update(L('A'), 2000).committed).toBe('');
    expect(c.text).toBe('A');
  });

  it('allows double letters after relaxing the hand', () => {
    const c = new TextComposer({ holdMs: 100, spaceMs: 1500 });
    c.update(L('L'), 0);
    c.update(L('L'), 100);
    c.update(unsure, 150);
    c.update(L('L'), 200);
    c.update(L('L'), 300);
    expect(c.text).toBe('LL');
  });

  it('switching letters restarts the hold', () => {
    const c = new TextComposer({ holdMs: 100, spaceMs: 1500 });
    c.update(L('M'), 0);
    c.update(L('N'), 90);
    expect(c.update(L('N'), 150).committed).toBe('');
    expect(c.update(L('N'), 190).committed).toBe('N');
  });

  it('adds one space after a pause with no hand', () => {
    const c = new TextComposer({ holdMs: 100, spaceMs: 1000 });
    c.update(L('H'), 0);
    c.update(L('H'), 100);
    c.update(none, 200);
    expect(c.update(none, 900).committed).toBe('');
    expect(c.update(none, 1200).committed).toBe(' ');
    expect(c.update(none, 5000).committed).toBe('');
    expect(c.text).toBe('H ');
  });

  it('never starts with a space', () => {
    const c = new TextComposer({ holdMs: 100, spaceMs: 100 });
    c.update(none, 0);
    c.update(none, 1000);
    expect(c.text).toBe('');
  });

  it('supports manual editing', () => {
    const c = new TextComposer();
    c.text = 'ANA';
    c.backspace();
    c.addSpace();
    c.addSpace();
    expect(c.text).toBe('AN ');
    c.clear();
    expect(c.text).toBe('');
  });
});
