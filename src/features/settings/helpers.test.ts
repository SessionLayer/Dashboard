import { describe, expect, it } from 'vitest';

import {
  keyRefError,
  pinnedBy,
  pinnedReason,
  retentionRatchetError,
  wormOptions,
  wormRatchetError,
} from './helpers';

describe('pinnedBy', () => {
  it('names the deployment property that owns a pinned field', () => {
    expect(
      pinnedBy('defaultMaxSessionSeconds', ['defaultMaxSessionSeconds']),
    ).toBe('sessionlayer.session-limits.default-max-session-seconds');
    expect(
      pinnedBy('defaultMaxConcurrentSessions', [
        'defaultMaxConcurrentSessions',
      ]),
    ).toBe('sessionlayer.session-limits.default-max-concurrent');
    expect(
      pinnedBy('defaultIdleTimeoutSeconds', ['defaultIdleTimeoutSeconds']),
    ).toBe('sessionlayer.session-limits.default-idle-timeout-seconds');
  });

  it('reports an unpinned field as writable', () => {
    expect(pinnedBy('defaultMaxSessionSeconds', [])).toBeUndefined();
    expect(pinnedBy('defaultMaxSessionSeconds', undefined)).toBeUndefined();
    expect(
      pinnedBy('defaultMaxSessionSeconds', ['defaultIdleTimeoutSeconds']),
    ).toBeUndefined();
  });

  // A field the API pins but this build has no property name for must still read
  // as pinned; silently treating it as writable would be the lie.
  it('still reports a pinned field it cannot name', () => {
    expect(pinnedBy('somethingNew', ['somethingNew'])).toBe(
      'a deployment property',
    );
  });

  it('explains that a write would be reverted on restart', () => {
    const reason = pinnedReason(
      'sessionlayer.session-limits.default-max-concurrent',
    );
    expect(reason).toMatch(
      /sessionlayer\.session-limits\.default-max-concurrent/,
    );
    expect(reason).toMatch(/reverted at the next restart/);
  });
});

describe('retentionRatchetError', () => {
  it('allows an increase', () => {
    expect(retentionRatchetError(90, 365)).toBeUndefined();
  });

  it('allows an unchanged value, so a read-modify-write still works', () => {
    expect(retentionRatchetError(90, 90)).toBeUndefined();
  });

  it('refuses a decrease and says where the destructive direction lives', () => {
    const error = retentionRatchetError(90, 30);
    expect(error).toMatch(/only increases/i);
    expect(error).toMatch(/90 days today/);
    expect(error).toMatch(/database-owner/);
  });

  it('has nothing to say about a blank field or an unknown current value', () => {
    expect(retentionRatchetError(90, '')).toBeUndefined();
    expect(retentionRatchetError(undefined, 30)).toBeUndefined();
  });
});

describe('wormRatchetError', () => {
  it('allows the strengthening direction', () => {
    expect(wormRatchetError('governance', 'compliance')).toBeUndefined();
  });

  it('allows an unchanged value', () => {
    expect(wormRatchetError('compliance', 'compliance')).toBeUndefined();
    expect(wormRatchetError('governance', 'governance')).toBeUndefined();
  });

  it('refuses compliance → governance', () => {
    const error = wormRatchetError('compliance', 'governance');
    expect(error).toMatch(/only strengthens/i);
    expect(error).toMatch(/database-owner/);
  });
});

describe('wormOptions', () => {
  it('offers both modes while still in governance', () => {
    expect(wormOptions('governance').map((o) => o.value)).toEqual([
      'governance',
      'compliance',
    ]);
  });

  // The one-way direction has to be visible before submit, not discovered as a
  // 422 afterwards: once in compliance, governance is not an offered option.
  it('drops governance once compliance is in force', () => {
    expect(wormOptions('compliance').map((o) => o.value)).toEqual([
      'compliance',
    ]);
  });
});

describe('keyRefError', () => {
  it('accepts an ordinary reference or none at all', () => {
    expect(keyRefError('kms://prod/recording-key-2026')).toBeUndefined();
    expect(keyRefError('')).toBeUndefined();
  });

  it('refuses key material pasted into the label', () => {
    expect(keyRefError('-----BEGIN PRIVATE KEY-----')).toMatch(/not a place/);
    expect(keyRefError('-----BEGIN PUBLIC KEY-----')).toMatch(/not a place/);
  });

  it('enforces the column length', () => {
    expect(keyRefError('x'.repeat(256))).toMatch(/255/);
    expect(keyRefError('x'.repeat(255))).toBeUndefined();
  });
});
