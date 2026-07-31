import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { screen, fireEvent, waitFor } from '@testing-library/react';

import { renderWithProviders } from '../../test/utils';
import { server } from '../../test/server';
import { cp, page, ok, problem } from '../../test/msw';
import type { BreakglassPolicyResource } from '../../api/types';
import { BreakglassPoliciesScreen } from './BreakglassPoliciesScreen';

const PATH = '/v1/breakglass-policies';

function policy(
  over: Partial<BreakglassPolicyResource> = {},
): BreakglassPolicyResource {
  return {
    id: '018f0000-0000-7000-8000-0000000000b1',
    name: 'emergency',
    recordingStrict: true,
    alertTarget: '#security-alerts',
    reviewRequired: true,
    authPath: 'fido2',
    origin: 'default',
    version: 1,
    ...over,
  };
}

const WRITE = {
  authenticated: true,
  permissions: ['breakglass:manage' as const],
};

describe('BreakglassPoliciesScreen', () => {
  it('lists break-glass policies', async () => {
    server.use(http.get(cp(PATH), () => page([policy()])));
    renderWithProviders(<BreakglassPoliciesScreen />, WRITE);
    expect(await screen.findByText('emergency')).toBeInTheDocument();
    expect(screen.getByText('#security-alerts')).toBeInTheDocument();
  });

  it('renders an empty state', async () => {
    server.use(http.get(cp(PATH), () => page([])));
    renderWithProviders(<BreakglassPoliciesScreen />, WRITE);
    expect(
      await screen.findByText(/no break-glass policies/i),
    ).toBeInTheDocument();
  });

  it('shows a loading state before data', () => {
    server.use(
      http.get(cp(PATH), () => new Promise<Response>(() => undefined)),
    );
    renderWithProviders(<BreakglassPoliciesScreen />, WRITE);
    expect(screen.getAllByText(/loading/i).length).toBeGreaterThan(0);
  });

  it('surfaces an RFC 9457 error', async () => {
    server.use(http.get(cp(PATH), () => problem(500, 'Nope')));
    renderWithProviders(<BreakglassPoliciesScreen />, WRITE);
    expect(await screen.findByText('Nope')).toBeInTheDocument();
  });

  it('handles a 403 gracefully', async () => {
    server.use(http.get(cp(PATH), () => problem(403, 'Forbidden')));
    renderWithProviders(<BreakglassPoliciesScreen />, WRITE);
    expect(await screen.findByText('Not permitted')).toBeInTheDocument();
  });

  it('hides the New button without breakglass:manage', async () => {
    server.use(http.get(cp(PATH), () => page([policy()])));
    renderWithProviders(<BreakglassPoliciesScreen />, {
      authenticated: true,
      permissions: ['settings:write'],
    });
    await screen.findByText('emergency');
    expect(
      screen.queryByRole('button', { name: /new break-glass policy/i }),
    ).not.toBeInTheDocument();
  });

  it('creates a break-glass policy (auth path + toggles sent)', async () => {
    let body: unknown;
    server.use(
      http.get(cp(PATH), () => page([])),
      http.post(cp(PATH), async ({ request }) => {
        body = await request.json();
        return ok(policy({ name: 'red-button' }), 201);
      }),
    );
    renderWithProviders(<BreakglassPoliciesScreen />, WRITE);
    await screen.findByText(/no break-glass policies/i);

    fireEvent.click(
      screen.getByRole('button', { name: /new break-glass policy/i }),
    );
    fireEvent.change(screen.getByRole('textbox', { name: /^name/i }), {
      target: { value: 'red-button' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: /alert target/i }), {
      target: { value: 'pager://oncall' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: /auth path/i }), {
      target: { value: 'offline_code' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: /review required/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(body).toEqual({
        name: 'red-button',
        recordingStrict: true,
        alertTarget: 'pager://oncall',
        reviewRequired: false,
        authPath: 'offline_code',
      });
    });
  });

  it('keeps Save disabled without an alert target', async () => {
    server.use(http.get(cp(PATH), () => page([])));
    renderWithProviders(<BreakglassPoliciesScreen />, WRITE);
    await screen.findByText(/no break-glass policies/i);
    fireEvent.click(
      screen.getByRole('button', { name: /new break-glass policy/i }),
    );
    fireEvent.change(screen.getByRole('textbox', { name: /^name/i }), {
      target: { value: 'x' },
    });
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('edits a break-glass policy and sends the current version', async () => {
    let body: unknown;
    server.use(
      http.get(cp(PATH), () => page([policy({ version: 6 })])),
      http.put(cp(`${PATH}/:id`), async ({ request }) => {
        body = await request.json();
        return ok(policy({ version: 7 }));
      }),
    );
    renderWithProviders(<BreakglassPoliciesScreen />, WRITE);
    fireEvent.click(await screen.findByText('emergency'));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByRole('textbox', { name: /alert target/i }), {
      target: { value: '#new-channel' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(body).toMatchObject({ version: 6, alertTarget: '#new-channel' });
    });
  });

  it('confirms and deletes a break-glass policy', async () => {
    let deleted = false;
    server.use(
      http.get(cp(PATH), () => page([policy()])),
      http.delete(cp(`${PATH}/:id`), () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderWithProviders(<BreakglassPoliciesScreen />, WRITE);
    fireEvent.click(await screen.findByText('emergency'));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    await waitFor(() => {
      expect(deleted).toBe(true);
    });
  });
});
