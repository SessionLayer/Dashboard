import { describe, expect, it } from 'vitest';

import { AsciicastError, parseAsciicast } from './asciicast';

describe('parseAsciicast', () => {
  it('parses the header, output/input/resize/marker events, and duration', () => {
    const text =
      '{"version":2,"width":100,"height":40,"timestamp":1700000000}\n' +
      '[0.1,"o","hi"]\n' +
      '[0.2,"i","x"]\n' +
      '[0.3,"r","120x50"]\n' +
      '[1.5,"m","sftp: PUT /tmp/x"]\n';
    const cast = parseAsciicast(text);
    expect(cast.header.width).toBe(100);
    expect(cast.header.height).toBe(40);
    expect(cast.events).toHaveLength(4);
    expect(cast.markers).toEqual([{ time: 1.5, label: 'sftp: PUT /tmp/x' }]);
    expect(cast.duration).toBe(1.5);
  });

  it('tolerates a blank/partial trailing line without failing the replay', () => {
    const text =
      '{"version":2,"width":80,"height":24}\n[0.1,"o","a"]\n[0.2,"o",\n';
    const cast = parseAsciicast(text);
    expect(cast.events).toHaveLength(1);
  });

  it('skips events with an unknown code', () => {
    const text =
      '{"version":2,"width":80,"height":24}\n[0.1,"z","nope"]\n[0.2,"o","ok"]\n';
    const cast = parseAsciicast(text);
    expect(cast.events).toEqual([{ time: 0.2, code: 'o', data: 'ok' }]);
  });

  it('throws on an empty recording', () => {
    expect(() => parseAsciicast('')).toThrow(AsciicastError);
  });
});
