import { fireEvent, screen, waitFor } from '@testing-library/react';
import { http } from 'msw';
import { describe, expect, it } from 'vitest';

import { cp, ok, problem } from '../../test/msw';
import { server } from '../../test/server';
import { renderWithProviders } from '../../test/utils';
import type {
  DeploymentManagedField,
  OperatorSettings,
  PlatformPermission,
  RecordingCustomerKey,
  UpdateOperatorSettingsRequest,
} from '../../api/types';
import { OperatorSettingsScreen } from './OperatorSettingsScreen';

const baseSettings: OperatorSettings = {
  auditRetentionDays: 365,
  recordingRetentionDays: 180,
  defaultWormMode: 'governance',
  otpTtlSeconds: 120,
  defaultCaBackend: 'local',
  defaultMaxSessionSeconds: 28800,
  defaultIdleTimeoutSeconds: 900,
  defaultMaxConcurrentSessions: 5,
  deploymentManagedFields: [],
  recordingKeyConfigured: true,
  recordingKeySealAlgorithm: 'ecies_p256',
  origin: 'api',
  version: 7,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-07-01T00:00:00Z',
};

const provisionedKey: RecordingCustomerKey = {
  configured: true,
  sealAlgorithm: 'ecies_p256',
  fingerprintSha256:
    'aa11bb22cc33dd44ee55ff6607788990aa11bb22cc33dd44ee55ff6607788990',
};

function mount(
  overrides: Partial<OperatorSettings> = {},
  permissions: PlatformPermission[] = ['rbac:read', 'settings:write'],
) {
  server.use(
    http.get(cp('/v1/operator-settings'), () =>
      ok({ ...baseSettings, ...overrides }),
    ),
    http.get(cp('/v1/operator-settings/recording-customer-key'), () =>
      ok(provisionedKey),
    ),
  );
  renderWithProviders(<OperatorSettingsScreen />, {
    authenticated: true,
    permissions,
  });
}

/** Capture the body of the single PUT the form makes. */
function capturePut(): { body?: UpdateOperatorSettingsRequest } {
  const captured: { body?: UpdateOperatorSettingsRequest } = {};
  server.use(
    http.put(cp('/v1/operator-settings'), async ({ request }) => {
      captured.body = (await request.json()) as UpdateOperatorSettingsRequest;
      return ok({ ...baseSettings, version: baseSettings.version + 1 });
    }),
  );
  return captured;
}

describe('OperatorSettingsScreen', () => {
  it('renders the current settings', async () => {
    mount();
    expect(await screen.findByLabelText(/^Audit retention/)).toHaveValue(365);
    expect(screen.getByLabelText(/^Recording retention/)).toHaveValue(180);
    expect(screen.getByLabelText(/^OTP lifetime/)).toHaveValue(120);
    expect(
      screen.getByLabelText(/^Default max concurrent sessions/),
    ).toHaveValue(5);
  });

  it('shows the CA backend read-only, with the reason it governs nothing', async () => {
    mount();
    expect(await screen.findByText('read-only')).toBeInTheDocument();
    expect(screen.getByText('local')).toBeInTheDocument();
    expect(
      screen.getByText(/cold start provisions a CA kind that has no row yet/),
    ).toBeInTheDocument();
    // Read-only means no control at all, not a control that 400s on submit.
    expect(
      screen.queryByLabelText(/Default CA backend/),
    ).not.toBeInTheDocument();
  });

  // The ratchet has to be visible in the control, not discovered as a 422: the
  // Save button never becomes armed, so no request is made at all.
  it('refuses a retention decrease before submit', async () => {
    mount();
    const put = capturePut();
    const field = await screen.findByLabelText(/^Audit retention/);
    fireEvent.change(field, { target: { value: '30' } });

    expect(await screen.findByText(/only increases/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Save settings' }),
    ).toBeDisabled();
    expect(put.body).toBeUndefined();
  });

  it('accepts a retention increase', async () => {
    mount();
    const put = capturePut();
    fireEvent.change(await screen.findByLabelText(/^Audit retention/), {
      target: { value: '400' },
    });
    expect(screen.queryByText(/only increases/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));

    await waitFor(() => {
      expect(put.body?.auditRetentionDays).toBe(400);
    });
  });

  it('offers both WORM modes while in governance', async () => {
    mount();
    const select = await screen.findByLabelText(/^Default WORM mode/);
    expect(
      Array.from(select.querySelectorAll('option')).map((o) => o.value),
    ).toEqual(['governance', 'compliance']);
  });

  // Once compliance is in force the weakening direction is not reachable at any
  // scope, so it is not offered — and the field says why rather than leaving the
  // absence to be read as a bug.
  it('does not offer governance once compliance is in force', async () => {
    mount({ defaultWormMode: 'compliance' });
    const select = await screen.findByLabelText(/^Default WORM mode/);
    expect(
      Array.from(select.querySelectorAll('option')).map((o) => o.value),
    ).toEqual(['compliance']);
    expect(
      screen.getByText(/Returning to governance is not offered here/),
    ).toBeInTheDocument();
  });

  it('disables a deployment-pinned field and names the property that owns it', async () => {
    const pinned: DeploymentManagedField[] = ['defaultMaxSessionSeconds'];
    mount({ deploymentManagedFields: pinned });

    const field = await screen.findByLabelText(/^Default max session duration/);
    expect(field).toBeDisabled();
    expect(
      screen.getByText(
        /sessionlayer\.session-limits\.default-max-session-seconds/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/reverted at the next restart/),
    ).toBeInTheDocument();
    // The other two are untouched by one field being pinned.
    expect(screen.getByLabelText(/^Default idle timeout/)).toBeEnabled();
  });

  // Omitting a session-limit default CLEARS it, and clearing a pinned field is a
  // change to a pinned field — a 422 on a control the operator was told they
  // could not touch. The pinned value must ride along in the body.
  it('still sends a pinned field at its current value', async () => {
    mount({ deploymentManagedFields: ['defaultMaxSessionSeconds'] });
    const put = capturePut();
    await screen.findByLabelText(/^Default max session duration/);
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));

    await waitFor(() => {
      expect(put.body).toBeDefined();
    });
    expect(put.body?.defaultMaxSessionSeconds).toBe(28800);
  });

  // Same trap one level down: a body built from dirty fields only would clear
  // every session-limit default the operator did not happen to touch.
  it('sends every knob back, not just the edited one', async () => {
    mount();
    const put = capturePut();
    fireEvent.change(await screen.findByLabelText(/^OTP lifetime/), {
      target: { value: '300' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));

    await waitFor(() => {
      expect(put.body).toBeDefined();
    });
    expect(put.body).toEqual({
      auditRetentionDays: 365,
      recordingRetentionDays: 180,
      defaultWormMode: 'governance',
      otpTtlSeconds: 300,
      defaultMaxSessionSeconds: 28800,
      defaultIdleTimeoutSeconds: 900,
      defaultMaxConcurrentSessions: 5,
      version: 7,
    });
  });

  it('clears a session-limit default only when the operator blanks it', async () => {
    mount();
    const put = capturePut();
    fireEvent.change(
      await screen.findByLabelText(/^Default max concurrent sessions/),
      { target: { value: '' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));

    await waitFor(() => {
      expect(put.body).toBeDefined();
    });
    expect(put.body).not.toHaveProperty('defaultMaxConcurrentSessions');
    expect(put.body?.defaultIdleTimeoutSeconds).toBe(900);
  });

  // The save bumps the version, which reloads the form from the server — so a
  // confirmation owned by the form would be destroyed by the very refetch that
  // proves the save landed.
  it('still shows the save confirmation after the resource reloads', async () => {
    let version = 7;
    server.use(
      http.get(cp('/v1/operator-settings'), () =>
        ok({ ...baseSettings, version }),
      ),
      http.get(cp('/v1/operator-settings/recording-customer-key'), () =>
        ok(provisionedKey),
      ),
      http.put(cp('/v1/operator-settings'), () => {
        version += 1;
        return ok({ ...baseSettings, version });
      }),
    );
    renderWithProviders(<OperatorSettingsScreen />, {
      authenticated: true,
      permissions: ['rbac:read', 'settings:write'],
    });

    fireEvent.change(await screen.findByLabelText(/^OTP lifetime/), {
      target: { value: '300' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));

    expect(await screen.findByText(/^Saved\./)).toBeInTheDocument();
    // The reloaded resource is what the form now holds.
    await waitFor(() => {
      expect(screen.getByText('8')).toBeInTheDocument();
    });
    expect(screen.getByText(/^Saved\./)).toBeInTheDocument();
  });

  it('surfaces a version conflict with the reload guidance', async () => {
    mount();
    server.use(
      http.put(cp('/v1/operator-settings'), () =>
        problem(409, 'Version conflict', 'The stored version does not match.'),
      ),
    );
    fireEvent.change(await screen.findByLabelText(/^OTP lifetime/), {
      target: { value: '180' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));

    expect(await screen.findByText('Version conflict')).toBeInTheDocument();
    expect(
      await screen.findByText(/Someone else changed these settings/),
    ).toBeInTheDocument();
  });

  it('surfaces a 422 refusal from the server verbatim', async () => {
    mount();
    server.use(
      http.put(cp('/v1/operator-settings'), () =>
        problem(
          422,
          'Deployment-managed field',
          'defaultIdleTimeoutSeconds is pinned by sessionlayer.session-limits.default-idle-timeout-seconds.',
        ),
      ),
    );
    fireEvent.change(await screen.findByLabelText(/^OTP lifetime/), {
      target: { value: '180' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));

    expect(
      await screen.findByText('Deployment-managed field'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/default-idle-timeout-seconds/),
    ).toBeInTheDocument();
  });

  it('renders read-only without settings:write, offering no save', async () => {
    mount({}, ['rbac:read']);
    expect(await screen.findByLabelText(/^Audit retention/)).toBeDisabled();
    expect(screen.getByLabelText(/^Default WORM mode/)).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: 'Save settings' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Read-only view/)).toBeInTheDocument();
  });

  it('renders a 403 on the resource as a not-permitted message', async () => {
    server.use(
      http.get(cp('/v1/operator-settings'), () => problem(403, 'Nope')),
      http.get(cp('/v1/operator-settings/recording-customer-key'), () =>
        ok(provisionedKey),
      ),
    );
    renderWithProviders(<OperatorSettingsScreen />, {
      authenticated: true,
      permissions: ['audit:read'],
    });
    expect(await screen.findByText('Not permitted')).toBeInTheDocument();
  });
});
