import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { http } from 'msw';
import { describe, expect, it } from 'vitest';

import { cp, ok, problem } from '../../test/msw';
import { server } from '../../test/server';
import { renderWithProviders } from '../../test/utils';
import type {
  PlatformPermission,
  RecordingCustomerKey,
  SetRecordingCustomerKeyRequest,
} from '../../api/types';
import { RecordingCustomerKeyPanel } from './RecordingCustomerKeyPanel';

// Real keys, generated with openssl. The panel's whole job is to tell a public
// key from a private one, so the fixtures have to be the real encodings.
const P256_SPKI =
  'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE9gAjXBubG6rVrDkl3jQdd2dgR8Mb6MrtwRqfNqWns4Ps9JbpOG4yvBZ56RD6f4kZa6MOhv5QjUcyFGdNc/aUCA==';
const P384_SPKI =
  'MHYwEAYHKoZIzj0CAQYFK4EEACIDYgAEF7G4ocFrLeOQxNLbUI8Ql1YqlXAXyL4hF2nzSYFoV03hvHN17v8RMNnn32cVQx52HpTswupEvt0v2dlmqqpbIsYd/IxGBDBuh6+UiPuHAP36yuHCYVlNviF0tNzAJhSb';
const SEC1_PRIVATE =
  'MHcCAQEEIGG+eMMlmwc759MGgI16uokbFypZngefT0K3653hm8nuoAoGCCqGSM49AwEHoUQDQgAE9gAjXBubG6rVrDkl3jQdd2dgR8Mb6MrtwRqfNqWns4Ps9JbpOG4yvBZ56RD6f4kZa6MOhv5QjUcyFGdNc/aUCA==';

const CURRENT_FINGERPRINT =
  'aa11bb22cc33dd44ee55ff6607788990aa11bb22cc33dd44ee55ff6607788990';

const unprovisioned: RecordingCustomerKey = {
  configured: false,
  sealAlgorithm: 'ecies_p256',
};

const provisioned: RecordingCustomerKey = {
  configured: true,
  sealAlgorithm: 'ecies_p256',
  publicKey: P256_SPKI,
  keyRef: 'safe://hq/recording-key',
  fingerprintSha256: CURRENT_FINGERPRINT,
  updatedAt: '2026-07-01T00:00:00Z',
};

function mount(
  key: RecordingCustomerKey,
  permissions: PlatformPermission[] = ['rbac:read', 'recording:key-manage'],
) {
  server.use(
    http.get(cp('/v1/operator-settings/recording-customer-key'), () => ok(key)),
  );
  renderWithProviders(
    <RecordingCustomerKeyPanel
      settingsVersion={7}
      configured={key.configured}
      recordingRetentionDays={180}
    />,
    { authenticated: true, permissions },
  );
}

function capturePut(): { body?: SetRecordingCustomerKeyRequest } {
  const captured: { body?: SetRecordingCustomerKeyRequest } = {};
  server.use(
    http.put(
      cp('/v1/operator-settings/recording-customer-key'),
      async ({ request }) => {
        captured.body =
          (await request.json()) as SetRecordingCustomerKeyRequest;
        return ok({ ...provisioned, fingerprintSha256: 'b'.repeat(64) });
      },
    ),
  );
  return captured;
}

async function openDialog(name: RegExp): Promise<HTMLElement> {
  fireEvent.click(await screen.findByRole('button', { name }));
  return screen.getByRole('dialog');
}

describe('RecordingCustomerKeyPanel', () => {
  it('says a fresh install is refusing sessions until the key is set', async () => {
    mount(unprovisioned);
    expect(await screen.findByText('Not configured')).toBeInTheDocument();
    expect(
      screen.getByText(/refuses every session until one is set/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Provision key/ }),
    ).toBeInTheDocument();
  });

  it('shows the fingerprint and public key once provisioned', async () => {
    mount(provisioned);
    expect(await screen.findByText(CURRENT_FINGERPRINT)).toBeInTheDocument();
    expect(screen.getByText('Configured')).toBeInTheDocument();
    expect(screen.getByLabelText('Customer public key')).toHaveTextContent(
      P256_SPKI.slice(0, 24),
    );
    expect(
      screen.getByRole('button', { name: 'Copy fingerprint' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/refuses every session until one is set/),
    ).not.toBeInTheDocument();
  });

  it('refuses pasted private key material without contacting the server', async () => {
    mount(unprovisioned);
    const put = capturePut();
    const dialog = await openDialog(/Provision key/);
    fireEvent.change(within(dialog).getByLabelText(/^Public key/), {
      target: { value: SEC1_PRIVATE },
    });

    expect(
      await within(dialog).findByText(/Only the public half is ever stored/),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(/Nothing was sent to the Control Plane/),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole('button', { name: 'Provision key' }),
    ).toBeDisabled();
    expect(put.body).toBeUndefined();
  });

  it('refuses a PEM private key on the marker alone', async () => {
    mount(unprovisioned);
    const put = capturePut();
    const dialog = await openDialog(/Provision key/);
    fireEvent.change(within(dialog).getByLabelText(/^Public key/), {
      target: {
        value: `-----BEGIN PRIVATE KEY-----\n${P256_SPKI}\n-----END PRIVATE KEY-----`,
      },
    });

    expect(
      await within(dialog).findByText(/Nothing was sent to the Control Plane/),
    ).toBeInTheDocument();
    expect(put.body).toBeUndefined();
  });

  it('refuses a P-384 key submitted as ecies_p256, before submit', async () => {
    mount(unprovisioned);
    const put = capturePut();
    const dialog = await openDialog(/Provision key/);
    fireEvent.change(within(dialog).getByLabelText(/^Public key/), {
      target: { value: P384_SPKI },
    });

    expect(
      await within(dialog).findByText(/not an EC public key on P-256/),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole('button', { name: 'Provision key' }),
    ).toBeDisabled();
    expect(put.body).toBeUndefined();
  });

  it('provisions a valid P-256 key and shows its fingerprint first', async () => {
    mount(unprovisioned);
    const put = capturePut();
    const dialog = await openDialog(/Provision key/);
    fireEvent.change(within(dialog).getByLabelText(/^Public key/), {
      target: { value: P256_SPKI },
    });
    fireEvent.change(within(dialog).getByLabelText(/^Key reference/), {
      target: { value: 'safe://hq/recording-key' },
    });

    expect(
      await within(dialog).findByText(/Fingerprint of the key you pasted/),
    ).toBeInTheDocument();

    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Provision key' }),
    );
    await waitFor(() => {
      expect(put.body).toBeDefined();
    });
    expect(put.body).toEqual({
      publicKey: P256_SPKI,
      sealAlgorithm: 'ecies_p256',
      keyRef: 'safe://hq/recording-key',
      version: 7,
    });
  });

  // Sending the rotation fields when nothing is configured is itself a 422, so
  // first provisioning must not collect or send them.
  it('asks for no acknowledgement on first provisioning', async () => {
    mount(unprovisioned);
    const dialog = await openDialog(/Provision key/);
    expect(
      within(dialog).queryByLabelText(/Fingerprint of the key being replaced/),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).queryByLabelText(/I understand that recordings/),
    ).not.toBeInTheDocument();
  });

  it('states the cost of a rotation precisely', async () => {
    mount(provisioned);
    const dialog = await openDialog(/Rotate key/);
    expect(
      within(dialog).getByText(
        /stays readable only by the outgoing private key/,
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(/at least as long as those recordings/),
    ).toBeInTheDocument();
  });

  it('blocks a rotation until the current fingerprint is echoed and acknowledged', async () => {
    mount(provisioned);
    const put = capturePut();
    const dialog = await openDialog(/Rotate key/);
    fireEvent.change(within(dialog).getByLabelText(/^Public key/), {
      target: { value: P256_SPKI },
    });
    await within(dialog).findByText(/Fingerprint of the key you pasted/);

    const rotate = within(dialog).getByRole('button', { name: 'Rotate key' });
    expect(rotate).toBeDisabled();

    fireEvent.change(
      within(dialog).getByLabelText(/Fingerprint of the key being replaced/),
      { target: { value: 'f'.repeat(64) } },
    );
    expect(
      within(dialog).getByText(/not the fingerprint of the key configured/),
    ).toBeInTheDocument();
    expect(rotate).toBeDisabled();

    fireEvent.change(
      within(dialog).getByLabelText(/Fingerprint of the key being replaced/),
      { target: { value: CURRENT_FINGERPRINT } },
    );
    expect(rotate).toBeDisabled();

    fireEvent.click(
      within(dialog).getByLabelText(/I understand that recordings/),
    );
    expect(rotate).toBeEnabled();
    expect(put.body).toBeUndefined();

    fireEvent.click(rotate);
    await waitFor(() => {
      expect(put.body).toBeDefined();
    });
    expect(put.body?.expectedFingerprintSha256).toBe(CURRENT_FINGERPRINT);
    expect(put.body?.acknowledgeExistingRecordingsUndecryptable).toBe(true);
    expect(put.body?.version).toBe(7);
  });

  it('surfaces a server refusal in the dialog', async () => {
    mount(unprovisioned);
    server.use(
      http.put(cp('/v1/operator-settings/recording-customer-key'), () =>
        problem(422, 'Invalid key', 'Not a SubjectPublicKeyInfo.'),
      ),
    );
    const dialog = await openDialog(/Provision key/);
    fireEvent.change(within(dialog).getByLabelText(/^Public key/), {
      target: { value: P256_SPKI },
    });
    await within(dialog).findByText(/Fingerprint of the key you pasted/);
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Provision key' }),
    );

    expect(await screen.findByText('Invalid key')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('surfaces a racing rotation as a conflict', async () => {
    mount(provisioned);
    server.use(
      http.put(cp('/v1/operator-settings/recording-customer-key'), () =>
        problem(409, 'Fingerprint mismatch', 'Someone rotated first.'),
      ),
    );
    const dialog = await openDialog(/Rotate key/);
    fireEvent.change(within(dialog).getByLabelText(/^Public key/), {
      target: { value: P256_SPKI },
    });
    await within(dialog).findByText(/Fingerprint of the key you pasted/);
    fireEvent.change(
      within(dialog).getByLabelText(/Fingerprint of the key being replaced/),
      { target: { value: CURRENT_FINGERPRINT } },
    );
    fireEvent.click(
      within(dialog).getByLabelText(/I understand that recordings/),
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Rotate key' }));

    expect(await screen.findByText('Fingerprint mismatch')).toBeInTheDocument();
  });

  it('refuses key material pasted into the key reference', async () => {
    mount(unprovisioned);
    const dialog = await openDialog(/Provision key/);
    fireEvent.change(within(dialog).getByLabelText(/^Public key/), {
      target: { value: P256_SPKI },
    });
    fireEvent.change(within(dialog).getByLabelText(/^Key reference/), {
      target: { value: '-----BEGIN PRIVATE KEY-----' },
    });
    expect(
      await within(dialog).findByText(/not a place to paste key material/),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole('button', { name: 'Provision key' }),
    ).toBeDisabled();
  });

  it('offers no control to a caller without recording:key-manage', async () => {
    mount(unprovisioned, ['rbac:read', 'settings:write']);
    await screen.findByText('Not configured');
    expect(
      screen.queryByRole('button', { name: /Provision key/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/requires the/)).toHaveTextContent(
      'recording:key-manage',
    );
  });
});
