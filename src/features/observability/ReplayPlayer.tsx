import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '../../ui';
import type { Asciicast } from '../../crypto/asciicast';
import { formatClock } from './format';
import { TerminalView } from './TerminalView';
import { applyEvent, Terminal, type TerminalSnapshot } from './terminal';

const SPEEDS = [0.5, 1, 2] as const;

interface Engine {
  term: Terminal;
  idx: number;
  appliedTime: number;
  includeInput: boolean;
}

function freshEngine(cast: Asciicast, includeInput: boolean): Engine {
  return {
    term: new Terminal(cast.header.width, cast.header.height),
    idx: 0,
    appliedTime: 0,
    includeInput,
  };
}

/**
 * asciinema-style player over a decrypted asciicast. Advances a real terminal
 * emulator incrementally while playing and rebuilds from the start only on a
 * backward seek or an input-visibility toggle. No external player library.
 */
export function ReplayPlayer({ cast }: { cast: Asciicast }) {
  const duration = cast.duration;
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<number>(1);
  const [showInput, setShowInput] = useState(false);

  const engineRef = useRef<Engine | null>(null);
  engineRef.current ??= freshEngine(cast, showInput);
  const [snapshot, setSnapshot] = useState<TerminalSnapshot>(() =>
    new Terminal(cast.header.width, cast.header.height).snapshot(),
  );
  const timeRef = useRef(0);

  const render = useCallback(
    (target: number, input: boolean) => {
      let eng = engineRef.current ?? freshEngine(cast, input);
      if (eng.includeInput !== input || target < eng.appliedTime) {
        eng = freshEngine(cast, input);
      }
      engineRef.current = eng;
      const events = cast.events;
      while (
        eng.idx < events.length &&
        (events[eng.idx]?.time ?? Infinity) <= target
      ) {
        const ev = events[eng.idx];
        if (ev) applyEvent(eng.term, ev, input);
        eng.idx += 1;
      }
      eng.appliedTime = target;
      setSnapshot(eng.term.snapshot());
    },
    [cast],
  );

  const seek = useCallback(
    (t: number) => {
      const clamped = Math.max(0, Math.min(duration, t));
      timeRef.current = clamped;
      setTime(clamped);
      render(clamped, showInput);
    },
    [duration, render, showInput],
  );

  const toggleInput = useCallback(() => {
    setShowInput((prev) => {
      const next = !prev;
      render(timeRef.current, next);
      return next;
    });
  }, [render]);

  useEffect(() => {
    if (!playing) return;
    let handle = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      let next = timeRef.current + dt * speed;
      let done = false;
      if (next >= duration) {
        next = duration;
        done = true;
      }
      timeRef.current = next;
      setTime(next);
      render(next, showInput);
      if (done) {
        setPlaying(false);
        return;
      }
      handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(handle);
    };
  }, [playing, speed, duration, render, showInput]);

  const togglePlay = useCallback(() => {
    setPlaying((prev) => {
      if (!prev && timeRef.current >= duration) {
        // Restart from the top when replaying a finished recording.
        timeRef.current = 0;
        setTime(0);
        render(0, showInput);
      }
      return !prev;
    });
  }, [duration, render, showInput]);

  return (
    <div className="player">
      <TerminalView snapshot={snapshot} />

      <div className="player-controls">
        <Button variant="primary" size="sm" onClick={togglePlay}>
          {playing ? 'Pause' : 'Play'}
        </Button>

        <div className="scrubber">
          <input
            type="range"
            className="scrubber-range"
            min={0}
            max={duration || 0.0001}
            step={0.01}
            value={time}
            aria-label="Seek recording"
            onChange={(e) => {
              seek(Number(e.target.value));
            }}
          />
          {cast.markers.length > 0 && duration > 0 && (
            <div className="scrubber-markers" aria-hidden="true">
              {cast.markers.map((m, i) => (
                <span
                  key={i}
                  className="scrubber-marker"
                  style={{ left: `${String((m.time / duration) * 100)}%` }}
                  title={m.label}
                />
              ))}
            </div>
          )}
        </div>

        <span className="player-clock" aria-live="off">
          {formatClock(time)} / {formatClock(duration)}
        </span>

        <div className="player-speeds" role="group" aria-label="Playback speed">
          {SPEEDS.map((s) => (
            <Button
              key={s}
              size="sm"
              variant={speed === s ? 'primary' : 'ghost'}
              aria-pressed={speed === s}
              onClick={() => {
                setSpeed(s);
              }}
            >
              {s}×
            </Button>
          ))}
        </div>

        <label className="player-toggle">
          <input type="checkbox" checked={showInput} onChange={toggleInput} />
          Show keystrokes
        </label>
      </div>

      {cast.markers.length > 0 && (
        <div className="markers-panel">
          <p className="markers-title">File-transfer &amp; audit markers</p>
          <ul className="markers-list">
            {cast.markers.map((m, i) => (
              <li key={i}>
                <button
                  type="button"
                  className="marker-jump"
                  onClick={() => {
                    seek(m.time);
                  }}
                >
                  {formatClock(m.time)}
                </button>
                <span className="marker-label">{m.label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
