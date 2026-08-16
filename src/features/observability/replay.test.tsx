import { delay, http, HttpResponse } from 'msw';
import { fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '../../test/utils';
import { server } from '../../test/server';
import { cp, ok, page } from '../../test/msw';
import {
  generateCustomerKeypair,
  sealAsciicast,
} from '../../test/recordingFixture';
import { importCustomerPrivateKey } from '../../crypto/slrec';
import type { RecordingResource } from '../../api/types';
import { RecordingsScreen } from './RecordingsScreen';
import { loadExportBytes } from './replay';

const CAST =
  '{"version":2,"width":80,"height":10,"timestamp":1700000000}\n' +
  '[0.10,"o","$ whoami\\r\\n"]\n' +
  '[0.20,"i","secretpw\\r"]\n' +
  '[0.30,"o","admin\\r\\n"]\n' +
  '[0.40,"m","sftp: GET /etc/hosts (312 bytes)"]\n';

const REC: RecordingResource = {
  id: '11111111-1111-1111-1111-111111111111',
  sessionId: '22222222-2222-2222-2222-222222222222',
  identity: 'alice',
  nodeId: '33333333-3333-3333-3333-333333333333',
  format: 'asciicast-v2',
  status: 'finalized',
  wormMode: 'governance',
  sizeBytes: 4096,
  legalHold: false,
  retentionUntil: '2027-01-01T00:00:00Z',
  startedAt: '2026-07-01T00:00:00Z',
  endedAt: '2026-07-01T00:05:00Z',
  createdAt: '2026-07-01T00:00:00Z',
};

const OBJ_URL = 'https://obj.test/rec';

function keyFile(pem: string): File {
  return new File([pem], 'customer.pem', { type: 'application/x-pem-file' });
}

async function loadKeyIntoScreen(pem: string): Promise<void> {
  const input = screen.getByLabelText(/Customer private key/i);
  fireEvent.change(input, { target: { files: [keyFile(pem)] } });
  await screen.findByText('Key loaded');
}

describe('recording replay (client-side decrypt)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('decrypts a sealed recording in the browser and plays the output + a marker', async () => {
    const { spki, privateKeyPem } = await generateCustomerKeypair();
    const object = await sealAsciicast(spki, CAST, [30, 25]);

    server.use(
      http.get(cp('/v1/recordings'), () =>
        page([{ ...REC, sizeBytes: object.length }]),
      ),
      http.post(cp('/v1/recordings/:id/replay'), () =>
        ok({ url: OBJ_URL, method: 'GET', expiresAt: '2030-01-01T00:00:00Z' }),
      ),
      http.get(OBJ_URL, () => HttpResponse.arrayBuffer(object.buffer)),
    );

    renderWithProviders(<RecordingsScreen />, {
      authenticated: true,
      permissions: ['recording:replay'],
    });

    await loadKeyIntoScreen(privateKeyPem);
    fireEvent.click(await screen.findByRole('button', { name: 'Replay' }));

    expect(
      await screen.findByText('sftp: GET /etc/hosts (312 bytes)'),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByRole('slider', { name: 'Seek recording' }), {
      target: { value: '999' },
    });
    expect(await screen.findByText('admin')).toBeInTheDocument();
  });

  it('shows a graceful error for the WRONG key and never crashes', async () => {
    const sealed = await generateCustomerKeypair();
    const other = await generateCustomerKeypair();
    const object = await sealAsciicast(sealed.spki, CAST);

    server.use(
      http.get(cp('/v1/recordings'), () =>
        page([{ ...REC, sizeBytes: object.length }]),
      ),
      http.post(cp('/v1/recordings/:id/replay'), () =>
        ok({ url: OBJ_URL, method: 'GET', expiresAt: '2030-01-01T00:00:00Z' }),
      ),
      http.get(OBJ_URL, () => HttpResponse.arrayBuffer(object.buffer)),
    );

    renderWithProviders(<RecordingsScreen />, {
      authenticated: true,
      permissions: ['recording:replay'],
    });

    await loadKeyIntoScreen(other.privateKeyPem);
    fireEvent.click(await screen.findByRole('button', { name: 'Replay' }));

    expect(
      await screen.findByText(/Wrong key or corrupt recording/i),
    ).toBeInTheDocument();
    expect(screen.queryByText('admin')).not.toBeInTheDocument();
  });

  it('NEVER sends the private key to the platform and NEVER persists it', async () => {
    const { spki, privateKeyPem } = await generateCustomerKeypair();
    const object = await sealAsciicast(spki, CAST);
    const secretMarker = privateKeyPem
      .replace(/-----[^-]+-----/g, '')
      .replace(/\s+/g, '')
      .slice(0, 40);

    const captured: string[] = [];
    const bodies: Promise<string>[] = [];
    const onStart = ({ request }: { request: Request }) => {
      captured.push(request.url);
      bodies.push(
        request
          .clone()
          .text()
          .catch(() => ''),
      );
    };
    server.events.on('request:start', onStart);

    server.use(
      http.get(cp('/v1/recordings'), () =>
        page([{ ...REC, sizeBytes: object.length }]),
      ),
      http.post(cp('/v1/recordings/:id/replay'), () =>
        ok({ url: OBJ_URL, method: 'GET', expiresAt: '2030-01-01T00:00:00Z' }),
      ),
      http.get(OBJ_URL, () => HttpResponse.arrayBuffer(object.buffer)),
    );

    renderWithProviders(<RecordingsScreen />, {
      authenticated: true,
      permissions: ['recording:replay'],
    });

    await loadKeyIntoScreen(privateKeyPem);
    fireEvent.click(await screen.findByRole('button', { name: 'Replay' }));
    await screen.findByText('sftp: GET /etc/hosts (312 bytes)');

    server.events.removeListener('request:start', onStart);
    const allBodies = await Promise.all(bodies);
    const haystack = [...captured, ...allBodies];
    for (const text of haystack) {
      expect(text).not.toContain(secretMarker);
      expect(text).not.toContain('PRIVATE KEY');
    }
    expect(captured).toContain(OBJ_URL);
    const dumpStorage = (s: Storage): string => {
      let out = '';
      for (let i = 0; i < s.length; i++) {
        const k = s.key(i);
        if (k !== null) out += `${k}=${s.getItem(k) ?? ''}\n`;
      }
      return out;
    };
    for (const dump of [
      dumpStorage(localStorage),
      dumpStorage(sessionStorage),
    ]) {
      expect(dump).not.toContain(secretMarker);
      expect(dump).not.toContain('PRIVATE KEY');
    }
  });

  it('exports the DECRYPTED asciicast bytes to a .cast download', async () => {
    const { spki, privateKeyPem } = await generateCustomerKeypair();
    const object = await sealAsciicast(spki, CAST);

    server.use(
      http.get(cp('/v1/recordings'), () =>
        page([{ ...REC, sizeBytes: object.length }]),
      ),
      http.post(cp('/v1/recordings/:id/export'), () =>
        ok({ url: OBJ_URL, method: 'GET', expiresAt: '2030-01-01T00:00:00Z' }),
      ),
      http.get(OBJ_URL, () => HttpResponse.arrayBuffer(object.buffer)),
    );

    const createUrl = vi.fn(() => 'blob:mock');
    const revokeUrl = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', {
      value: createUrl,
      configurable: true,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      value: revokeUrl,
      configurable: true,
    });
    let downloadName = '';
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloadName = this.download;
    });

    renderWithProviders(<RecordingsScreen />, {
      authenticated: true,
      permissions: ['recording:export'],
    });

    await loadKeyIntoScreen(privateKeyPem);
    fireEvent.click(await screen.findByRole('button', { name: 'Export' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Download .cast' }),
    );

    await screen.findByText(new RegExp(`Downloaded ${REC.id}`));
    expect(createUrl).toHaveBeenCalledTimes(1);
    expect(downloadName).toBe(`${REC.id}.cast`);
  });

  it('FAILS CLOSED on a size mismatch — tail-truncation guard', async () => {
    const { spki, privateKeyPem } = await generateCustomerKeypair();
    const object = await sealAsciicast(spki, CAST);

    server.use(
      // CP reports the true sealed size; the object store returns a body with a
      // dropped trailing byte (a frame SLREC1 alone would decrypt cleanly).
      http.get(cp('/v1/recordings'), () =>
        page([{ ...REC, sizeBytes: object.length }]),
      ),
      http.post(cp('/v1/recordings/:id/replay'), () =>
        ok({ url: OBJ_URL, method: 'GET', expiresAt: '2030-01-01T00:00:00Z' }),
      ),
      http.get(OBJ_URL, () =>
        HttpResponse.arrayBuffer(object.slice(0, object.length - 1).buffer),
      ),
    );

    renderWithProviders(<RecordingsScreen />, {
      authenticated: true,
      permissions: ['recording:replay'],
    });

    await loadKeyIntoScreen(privateKeyPem);
    fireEvent.click(await screen.findByRole('button', { name: 'Replay' }));

    expect(
      await screen.findByText(/Recording integrity check failed/i),
    ).toBeInTheDocument();
    expect(screen.queryByText('admin')).not.toBeInTheDocument();
  });

  it('loadExportBytes returns the exact decrypted asciicast bytes', async () => {
    const { spki, privateKeyPem } = await generateCustomerKeypair();
    const object = await sealAsciicast(spki, CAST, [10, 10, 40]);

    server.use(
      http.post(cp('/v1/recordings/:id/export'), () =>
        ok({ url: OBJ_URL, method: 'GET', expiresAt: '2030-01-01T00:00:00Z' }),
      ),
      http.get(OBJ_URL, () => HttpResponse.arrayBuffer(object.buffer)),
    );

    const key = await importCustomerPrivateKey(privateKeyPem);
    const bytes = await loadExportBytes(REC.id, key);
    expect(new TextDecoder().decode(bytes)).toBe(CAST);
  });

  it('FAILS CLOSED with a bounded timeout when the object store hangs', async () => {
    const { privateKeyPem } = await generateCustomerKeypair();

    server.use(
      http.post(cp('/v1/recordings/:id/export'), () =>
        ok({ url: OBJ_URL, method: 'GET', expiresAt: '2030-01-01T00:00:00Z' }),
      ),
      http.get(OBJ_URL, async () => {
        await delay(2000);
        return HttpResponse.arrayBuffer(new ArrayBuffer(0));
      }),
    );

    const key = await importCustomerPrivateKey(privateKeyPem);
    await expect(
      loadExportBytes(REC.id, key, undefined, { timeoutMs: 20 }),
    ).rejects.toThrow(/timed out/i);
  });
});
