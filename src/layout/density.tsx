import { useCallback, useEffect, useState } from 'react';

export type Density = 'comfortable' | 'dense';
const STORAGE_KEY = 'sl.density';

function readDensity(): Density {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'comfortable' || v === 'dense') return v;
  } catch {
    /* storage unavailable — fall through to the default */
  }
  return 'comfortable';
}

function applyDensity(density: Density): void {
  document.documentElement.setAttribute('data-density', density);
}

export function useDensity(): [Density, (d: Density) => void] {
  const [density, setDensity] = useState<Density>(readDensity);

  useEffect(() => {
    applyDensity(density);
    try {
      localStorage.setItem(STORAGE_KEY, density);
    } catch {
      /* ignore */
    }
  }, [density]);

  const set = useCallback((d: Density) => {
    setDensity(d);
  }, []);

  return [density, set];
}

export function DensityToggle() {
  const [density, setDensity] = useDensity();
  return (
    <div className="density-toggle" role="group" aria-label="Table density">
      <button
        type="button"
        aria-pressed={density === 'comfortable'}
        onClick={() => {
          setDensity('comfortable');
        }}
      >
        comfortable
      </button>
      <button
        type="button"
        aria-pressed={density === 'dense'}
        onClick={() => {
          setDensity('dense');
        }}
      >
        dense
      </button>
    </div>
  );
}
