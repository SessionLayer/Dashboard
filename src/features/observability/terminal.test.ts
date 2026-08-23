import { describe, expect, it } from 'vitest';

import { parseAsciicast } from '../../crypto/asciicast';
import { buildSnapshot, Terminal, type TerminalSnapshot } from './terminal';

function rowText(snap: TerminalSnapshot, r: number): string {
  return (snap.lines[r] ?? []).map((run) => run.text).join('');
}

describe('Terminal emulator', () => {
  it('lays printable text and honours CR / LF positioning', () => {
    const t = new Terminal(20, 4);
    t.write('hello\r\nworld');
    const s = t.snapshot();
    expect(rowText(s, 0)).toBe('hello');
    expect(rowText(s, 1)).toBe('world');
  });

  it('carriage return overwrites in place', () => {
    const t = new Terminal(20, 2);
    t.write('aaaaa\rbb');
    expect(rowText(t.snapshot(), 0)).toBe('bbaaa');
  });

  it('applies SGR colour to a run (fixed palette, no recording-derived CSS)', () => {
    const t = new Terminal(20, 2);
    t.write('\x1b[31mRED\x1b[0m.');
    const runs = t.snapshot().lines[0] ?? [];
    const red = runs.find((r) => r.text === 'RED');
    expect(red?.style.fg).toBe('#cd3131');
    const dot = runs.find((r) => r.text === '.');
    expect(dot?.style.fg).toBeUndefined();
  });

  it('parses 256-colour and truecolor into numeric rgb only', () => {
    const t = new Terminal(20, 2);
    t.write('\x1b[38;2;10;20;30mX\x1b[38;5;231mY');
    const runs = t.snapshot().lines[0] ?? [];
    expect(runs.find((r) => r.text === 'X')?.style.fg).toBe('rgb(10, 20, 30)');
    expect(runs.find((r) => r.text === 'Y')?.style.fg).toMatch(
      /^rgb\(\d+, \d+, \d+\)$/,
    );
  });

  it('erases in line (CSI K)', () => {
    const t = new Terminal(20, 2);
    t.write('abcdef\r\x1b[3C\x1b[K');
    expect(rowText(t.snapshot(), 0)).toBe('abc');
  });

  it('resizes on demand, preserving overlapping content', () => {
    const t = new Terminal(10, 3);
    t.write('kept');
    t.resize(40, 6);
    const s = t.snapshot();
    expect(s.cols).toBe(40);
    expect(s.rows).toBe(6);
    expect(rowText(s, 0)).toBe('kept');
  });

  it('DISCARDS OSC titles and private modes — never leaks escape bytes', () => {
    const t = new Terminal(20, 2);
    t.write('\x1b]0;evil-title\x07\x1b[?25lok');
    const text = rowText(t.snapshot(), 0);
    expect(text).toBe('ok');
    expect(text).not.toContain('\x1b');
    expect(text).not.toContain('evil-title');
  });

  it('tolerates an unknown CSI final without corrupting following text', () => {
    const t = new Terminal(20, 2);
    t.write('\x1b[99Zafter');
    expect(rowText(t.snapshot(), 0)).toBe('after');
  });

  it('scrolls when output exceeds the row count', () => {
    const t = new Terminal(10, 2);
    t.write('one\r\ntwo\r\nthree');
    const s = t.snapshot();
    expect(rowText(s, 0)).toBe('two');
    expect(rowText(s, 1)).toBe('three');
  });
});

describe('buildSnapshot', () => {
  const cast = parseAsciicast(
    '{"version":2,"width":40,"height":5}\n' +
      '[0.10,"o","hello"]\n' +
      '[0.50,"i","secret"]\n' +
      '[1.00,"o"," world"]\n',
  );

  it('renders only events at or before the given time', () => {
    expect(rowText(buildSnapshot(cast, 0.2, false), 0)).toBe('hello');
    expect(rowText(buildSnapshot(cast, 2, false), 0)).toBe('hello world');
  });

  it('omits keystroke input unless explicitly enabled', () => {
    expect(rowText(buildSnapshot(cast, 2, false), 0)).not.toContain('secret');
    expect(rowText(buildSnapshot(cast, 2, true), 0)).toBe('hellosecret world');
  });

  it('applies a resize event mid-stream', () => {
    const resized = parseAsciicast(
      '{"version":2,"width":80,"height":24}\n' +
        '[0.1,"o","x"]\n' +
        '[0.2,"r","20x6"]\n',
    );
    expect(buildSnapshot(resized, 1, false).cols).toBe(20);
    expect(buildSnapshot(resized, 1, false).rows).toBe(6);
  });
});
