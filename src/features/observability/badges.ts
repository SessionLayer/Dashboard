import type { BadgeTone } from '../../ui';

/** Map a recording lifecycle status to a badge tone. */
export function statusTone(status: string | undefined): BadgeTone {
  switch (status) {
    case 'finalized':
      return 'pass';
    case 'recording':
      return 'info';
    case 'truncated':
      return 'warn';
    case 'failed':
      return 'fail';
    default:
      return 'neutral';
  }
}

/** Map a WORM mode to a badge tone (compliance is the stronger, un-deletable mode). */
export function wormTone(mode: string | undefined): BadgeTone {
  switch (mode) {
    case 'compliance':
      return 'accent';
    case 'governance':
      return 'neutral';
    default:
      return 'neutral';
  }
}

/** Map an audit outcome to a badge tone. */
export function outcomeTone(outcome: string | undefined): BadgeTone {
  const o = (outcome ?? '').toLowerCase();
  if (
    o.includes('deny') ||
    o.includes('fail') ||
    o.includes('error') ||
    o.includes('reject')
  )
    return 'fail';
  if (
    o.includes('allow') ||
    o.includes('success') ||
    o.includes('ok') ||
    o.includes('grant')
  )
    return 'pass';
  if (o.includes('warn') || o.includes('pending')) return 'warn';
  return 'neutral';
}
