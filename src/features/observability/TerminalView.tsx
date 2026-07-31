import type { CSSProperties } from 'react';

import type { CellStyle, TerminalSnapshot } from './terminal';

/**
 * Map a cell's style to inline CSS. Every value here is a fixed palette colour or
 * a numerically-derived `rgb(...)` string produced by the emulator — never a
 * string copied from the recording — so this cannot inject arbitrary CSS.
 */
function runStyle(s: CellStyle): CSSProperties {
  const style: CSSProperties = {};
  if (s.inverse) {
    style.color = s.bg ?? 'var(--term-bg)';
    style.background = s.fg ?? 'var(--term-fg)';
  } else {
    if (s.fg !== undefined) style.color = s.fg;
    if (s.bg !== undefined) style.background = s.bg;
  }
  if (s.bold) style.fontWeight = 700;
  if (s.dim) style.opacity = 0.7;
  if (s.italic) style.fontStyle = 'italic';
  if (s.underline) style.textDecoration = 'underline';
  return style;
}

/**
 * Render the terminal grid. Text is emitted as escaped React children only — no
 * `innerHTML`/`dangerouslySetInnerHTML` anywhere — so recorded output can never
 * execute or inject markup (the §15 XSS invariant).
 */
export function TerminalView({ snapshot }: { snapshot: TerminalSnapshot }) {
  return (
    <div
      className="term"
      aria-label="Recorded terminal output"
      style={{ '--term-cols': snapshot.cols } as CSSProperties}
    >
      {snapshot.lines.map((runs, r) => (
        <div className="term-row" key={r}>
          {runs.length === 0
            ? ' '
            : runs.map((run, i) => (
                <span key={i} style={runStyle(run.style)}>
                  {run.text}
                </span>
              ))}
        </div>
      ))}
    </div>
  );
}
