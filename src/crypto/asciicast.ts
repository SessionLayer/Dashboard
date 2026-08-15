/**
 * asciicast v2 parser. A recording is a header line
 * (`{"version":2,"width":…,"height":…,"timestamp":…}`) followed by event lines
 * `[elapsed, "code", "data"]` where code ∈ o(output) i(input) r(resize)
 * m(marker). File-transfer audit surfaces as `m` markers (the recorder emits
 * an `m` for each SFTP/SCP operation).
 */

export type EventCode = 'o' | 'i' | 'r' | 'm';

export interface AsciicastHeader {
  version: number;
  width: number;
  height: number;
  timestamp?: number;
  title?: string;
}

export interface CastEvent {
  time: number;
  code: EventCode;
  data: string;
}

export interface Marker {
  time: number;
  label: string;
}

export interface Asciicast {
  header: AsciicastHeader;
  events: CastEvent[];
  markers: Marker[];
  duration: number;
}

export class AsciicastError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AsciicastError';
  }
}

const CODES = new Set<EventCode>(['o', 'i', 'r', 'm']);

function isCode(value: unknown): value is EventCode {
  return typeof value === 'string' && CODES.has(value as EventCode);
}

export function parseAsciicast(text: string): Asciicast {
  const lines = text.split('\n');
  let headerLine: string | undefined;
  let firstIndex = 0;
  for (let i = 0; i < lines.length; i++) {
    if ((lines[i] ?? '').trim() !== '') {
      headerLine = lines[i];
      firstIndex = i + 1;
      break;
    }
  }
  if (headerLine === undefined) {
    throw new AsciicastError('empty recording');
  }

  let rawHeader: unknown;
  try {
    rawHeader = JSON.parse(headerLine);
  } catch {
    throw new AsciicastError('invalid asciicast header');
  }
  if (typeof rawHeader !== 'object' || rawHeader === null) {
    throw new AsciicastError('invalid asciicast header');
  }
  const h = rawHeader as Record<string, unknown>;
  const header: AsciicastHeader = {
    version: typeof h.version === 'number' ? h.version : 2,
    width: typeof h.width === 'number' ? h.width : 80,
    height: typeof h.height === 'number' ? h.height : 24,
    timestamp: typeof h.timestamp === 'number' ? h.timestamp : undefined,
    title: typeof h.title === 'string' ? h.title : undefined,
  };

  const events: CastEvent[] = [];
  const markers: Marker[] = [];
  for (let i = firstIndex; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined || line.trim() === '') continue;
    let tuple: unknown;
    try {
      tuple = JSON.parse(line);
    } catch {
      continue; // tolerate a trailing/partial line rather than fail the replay
    }
    if (!Array.isArray(tuple) || tuple.length < 3) continue;
    const [time, code, data] = tuple as [unknown, unknown, unknown];
    if (typeof time !== 'number' || !isCode(code) || typeof data !== 'string') {
      continue;
    }
    events.push({ time, code, data });
    if (code === 'm') markers.push({ time, label: data });
  }

  const duration =
    events.length > 0 ? (events[events.length - 1]?.time ?? 0) : 0;
  return { header, events, markers, duration };
}
