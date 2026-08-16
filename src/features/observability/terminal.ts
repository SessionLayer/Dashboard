import type { Asciicast, CastEvent } from '../../crypto/asciicast';

export interface CellStyle {
  fg?: string;
  bg?: string;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
  inverse?: boolean;
}

interface Cell {
  ch: string;
  style: CellStyle;
}

export interface Run {
  text: string;
  style: CellStyle;
}

export interface TerminalSnapshot {
  cols: number;
  rows: number;
  lines: Run[][];
  cursor: { row: number; col: number };
}

const BASE_COLORS: readonly string[] = [
  '#000000',
  '#cd3131',
  '#0dbc79',
  '#e5e510',
  '#2472c8',
  '#bc3fbc',
  '#11a8cd',
  '#e5e5e5',
  '#666666',
  '#f14c4c',
  '#23d18b',
  '#f5f543',
  '#3b8eea',
  '#d670d6',
  '#29b8db',
  '#f5f5f5',
];

const EMPTY_STYLE: CellStyle = {};
const BLANK: Cell = { ch: ' ', style: EMPTY_STYLE };

function clampDim(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(1000, Math.floor(n)));
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function color256(n: number): string | undefined {
  const i = clamp(Math.floor(n), 0, 255);
  if (i < 16) return BASE_COLORS[i];
  if (i < 232) {
    const c = i - 16;
    const to = (v: number) => (v === 0 ? 0 : 55 + 40 * v);
    return `rgb(${String(to(Math.floor(c / 36)))}, ${String(to(Math.floor((c % 36) / 6)))}, ${String(to(c % 6))})`;
  }
  const v = 8 + (i - 232) * 10;
  return `rgb(${String(v)}, ${String(v)}, ${String(v)})`;
}

function truecolor(r: number, g: number, b: number): string {
  const c = (v: number) => clamp(Math.floor(v), 0, 255);
  return `rgb(${String(c(r))}, ${String(c(g))}, ${String(c(b))})`;
}

type State = 'ground' | 'esc' | 'csi' | 'osc' | 'charset';

export class Terminal {
  cols: number;
  rows: number;
  private grid: Cell[][];
  private cRow = 0;
  private cCol = 0;
  private style: CellStyle = EMPTY_STYLE;
  private saved = { row: 0, col: 0 };
  private state: State = 'ground';
  private params = '';

  constructor(cols = 80, rows = 24) {
    this.cols = clampDim(cols);
    this.rows = clampDim(rows);
    this.grid = this.blankGrid(this.rows, this.cols);
  }

  private blankRow(): Cell[] {
    return new Array<Cell>(this.cols).fill(BLANK);
  }

  private blankGrid(rows: number, cols: number): Cell[][] {
    const g: Cell[][] = [];
    for (let r = 0; r < rows; r++) g.push(new Array<Cell>(cols).fill(BLANK));
    return g;
  }

  write(data: string): void {
    for (const ch of data) {
      const code = ch.codePointAt(0) ?? 0;
      switch (this.state) {
        case 'ground':
          this.ground(ch, code);
          break;
        case 'esc':
          this.esc(ch);
          break;
        case 'csi':
          this.csi(ch, code);
          break;
        case 'osc':
          this.osc(ch, code);
          break;
        case 'charset':
          this.state = 'ground';
          break;
      }
    }
  }

  private ground(ch: string, code: number): void {
    switch (code) {
      case 0x1b:
        this.state = 'esc';
        return;
      case 0x0a:
        this.lineFeed();
        return;
      case 0x0d:
        this.cCol = 0;
        return;
      case 0x08:
        this.cCol = Math.max(0, this.cCol - 1);
        return;
      case 0x09:
        this.cCol = Math.min(
          this.cols - 1,
          (Math.floor(this.cCol / 8) + 1) * 8,
        );
        return;
      default:
        if (code < 0x20 || code === 0x7f) return;
        this.putChar(ch);
    }
  }

  private esc(ch: string): void {
    switch (ch) {
      case '[':
        this.state = 'csi';
        this.params = '';
        return;
      case ']':
        this.state = 'osc';
        return;
      case '7':
        this.saved = { row: this.cRow, col: this.cCol };
        this.state = 'ground';
        return;
      case '8':
        this.cRow = clamp(this.saved.row, 0, this.rows - 1);
        this.cCol = clamp(this.saved.col, 0, this.cols - 1);
        this.state = 'ground';
        return;
      case '(':
      case ')':
      case '*':
      case '+':
        this.state = 'charset';
        return;
      default:
        this.state = 'ground';
    }
  }

  private csi(ch: string, code: number): void {
    if (code >= 0x30 && code <= 0x3f) {
      this.params += ch;
      return;
    }
    if (code >= 0x20 && code <= 0x2f) return;
    if (code >= 0x40 && code <= 0x7e) {
      this.dispatch(ch);
    }
    this.state = 'ground';
  }

  private osc(_ch: string, code: number): void {
    if (code === 0x07 || code === 0x1b) this.state = 'ground';
  }

  private parseParams(): number[] {
    const body = this.params.replace(/^[?<=>!]/, '');
    if (body === '') return [0];
    return body.split(';').map((p) => (p === '' ? 0 : Number(p)));
  }

  private dispatch(final: string): void {
    const priv = /^[?<=>!]/.test(this.params);
    const n = this.parseParams();
    const p0 = n[0] ?? 0;
    const at = (i: number): number => n[i] ?? 0;
    switch (final) {
      case 'm':
        if (!priv) this.applySgr(n);
        return;
      case 'H':
      case 'f':
        this.cursorTo((p0 || 1) - 1, (at(1) || 1) - 1);
        return;
      case 'A':
        this.cursorTo(this.cRow - (p0 || 1), this.cCol);
        return;
      case 'B':
        this.cursorTo(this.cRow + (p0 || 1), this.cCol);
        return;
      case 'C':
        this.cursorTo(this.cRow, this.cCol + (p0 || 1));
        return;
      case 'D':
        this.cursorTo(this.cRow, this.cCol - (p0 || 1));
        return;
      case 'E':
        this.cursorTo(this.cRow + (p0 || 1), 0);
        return;
      case 'F':
        this.cursorTo(this.cRow - (p0 || 1), 0);
        return;
      case 'G':
      case '`':
        this.cursorTo(this.cRow, (p0 || 1) - 1);
        return;
      case 'd':
        this.cursorTo((p0 || 1) - 1, this.cCol);
        return;
      case 'J':
        if (!priv) this.eraseDisplay(p0);
        return;
      case 'K':
        if (!priv) this.eraseLine(p0);
        return;
      case 's':
        this.saved = { row: this.cRow, col: this.cCol };
        return;
      case 'u':
        this.cRow = clamp(this.saved.row, 0, this.rows - 1);
        this.cCol = clamp(this.saved.col, 0, this.cols - 1);
        return;
      default:
        return;
    }
  }

  private applySgr(nums: number[]): void {
    let s: CellStyle = { ...this.style };
    for (let i = 0; i < nums.length; i++) {
      const p = nums[i] ?? 0;
      if (p === 0) s = {};
      else if (p === 1) s.bold = true;
      else if (p === 2) s.dim = true;
      else if (p === 3) s.italic = true;
      else if (p === 4) s.underline = true;
      else if (p === 7) s.inverse = true;
      else if (p === 22) {
        s.bold = false;
        s.dim = false;
      } else if (p === 23) s.italic = false;
      else if (p === 24) s.underline = false;
      else if (p === 27) s.inverse = false;
      else if (p >= 30 && p <= 37) s.fg = BASE_COLORS[p - 30];
      else if (p === 38) i = this.extColor(nums, i, s, 'fg');
      else if (p === 39) s.fg = undefined;
      else if (p >= 40 && p <= 47) s.bg = BASE_COLORS[p - 40];
      else if (p === 48) i = this.extColor(nums, i, s, 'bg');
      else if (p === 49) s.bg = undefined;
      else if (p >= 90 && p <= 97) s.fg = BASE_COLORS[8 + (p - 90)];
      else if (p >= 100 && p <= 107) s.bg = BASE_COLORS[8 + (p - 100)];
    }
    this.style = s;
  }

  private extColor(
    nums: number[],
    start: number,
    s: CellStyle,
    slot: 'fg' | 'bg',
  ): number {
    const mode = nums[start + 1] ?? 0;
    if (mode === 5) {
      s[slot] = color256(nums[start + 2] ?? 0);
      return start + 2;
    }
    if (mode === 2) {
      s[slot] = truecolor(
        nums[start + 2] ?? 0,
        nums[start + 3] ?? 0,
        nums[start + 4] ?? 0,
      );
      return start + 4;
    }
    return start + 1;
  }

  private putChar(ch: string): void {
    if (this.cCol >= this.cols) {
      this.cCol = 0;
      this.lineFeed();
    }
    const row = this.grid[this.cRow];
    if (row) row[this.cCol] = { ch, style: this.style };
    this.cCol++;
  }

  private lineFeed(): void {
    if (this.cRow + 1 >= this.rows) {
      this.grid.shift();
      this.grid.push(this.blankRow());
      this.cRow = this.rows - 1;
    } else {
      this.cRow++;
    }
  }

  private cursorTo(row: number, col: number): void {
    this.cRow = clamp(row, 0, this.rows - 1);
    this.cCol = clamp(col, 0, this.cols - 1);
  }

  private eraseLine(mode: number): void {
    const row = this.grid[this.cRow];
    if (!row) return;
    const [from, to] =
      mode === 1
        ? [0, this.cCol]
        : mode === 2
          ? [0, this.cols - 1]
          : [this.cCol, this.cols - 1];
    for (let c = from; c <= to; c++) row[c] = BLANK;
  }

  private eraseDisplay(mode: number): void {
    if (mode === 2 || mode === 3) {
      this.grid = this.blankGrid(this.rows, this.cols);
      return;
    }
    this.eraseLine(mode);
    if (mode === 0) {
      for (let r = this.cRow + 1; r < this.rows; r++)
        this.grid[r] = this.blankRow();
    } else if (mode === 1) {
      for (let r = 0; r < this.cRow; r++) this.grid[r] = this.blankRow();
    }
  }

  resize(cols: number, rows: number): void {
    const nc = clampDim(cols);
    const nr = clampDim(rows);
    const next = this.blankGrid(nr, nc);
    for (let r = 0; r < Math.min(nr, this.rows); r++) {
      const src = this.grid[r];
      const dst = next[r];
      if (!src || !dst) continue;
      for (let c = 0; c < Math.min(nc, this.cols); c++) {
        const cell = src[c];
        if (cell) dst[c] = cell;
      }
    }
    this.grid = next;
    this.cols = nc;
    this.rows = nr;
    this.cRow = clamp(this.cRow, 0, nr - 1);
    this.cCol = clamp(this.cCol, 0, nc - 1);
  }

  snapshot(): TerminalSnapshot {
    return {
      cols: this.cols,
      rows: this.rows,
      lines: this.grid.map(coalesce),
      cursor: { row: this.cRow, col: this.cCol },
    };
  }
}

function sameStyle(a: CellStyle, b: CellStyle): boolean {
  return (
    a.fg === b.fg &&
    a.bg === b.bg &&
    a.bold === b.bold &&
    a.dim === b.dim &&
    a.italic === b.italic &&
    a.underline === b.underline &&
    a.inverse === b.inverse
  );
}

function isDefault(s: CellStyle): boolean {
  return sameStyle(s, EMPTY_STYLE);
}

function coalesce(row: Cell[]): Run[] {
  let end = row.length;
  while (end > 0) {
    const c = row[end - 1];
    if (c === undefined) {
      end -= 1;
      continue;
    }
    if (c.ch === ' ' && isDefault(c.style)) {
      end -= 1;
      continue;
    }
    break;
  }
  const runs: Run[] = [];
  for (let i = 0; i < end; i++) {
    const cell = row[i];
    if (!cell) continue;
    const last = runs[runs.length - 1];
    if (last && sameStyle(last.style, cell.style)) last.text += cell.ch;
    else runs.push({ text: cell.ch, style: cell.style });
  }
  return runs;
}

export function applyEvent(
  term: Terminal,
  ev: CastEvent,
  includeInput: boolean,
): void {
  if (ev.code === 'o') term.write(ev.data);
  else if (ev.code === 'i' && includeInput) term.write(ev.data);
  else if (ev.code === 'r') {
    const m = /^(\d+)\s*[x,]\s*(\d+)$/.exec(ev.data.trim());
    if (m) term.resize(Number(m[1]), Number(m[2]));
  }
}

export function buildSnapshot(
  cast: Asciicast,
  timeSec: number,
  includeInput: boolean,
): TerminalSnapshot {
  const term = new Terminal(cast.header.width, cast.header.height);
  for (const ev of cast.events) {
    if (ev.time > timeSec) break;
    applyEvent(term, ev, includeInput);
  }
  return term.snapshot();
}
