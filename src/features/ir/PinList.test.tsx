import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { server } from '../../test/server';
import { cp, ok, problem } from '../../test/msw';
import { renderWithProviders } from '../../test/utils';
import { PinList } from './PinList';

function pin(overrides: Record<string, unknown> = {}) {
  return {
    id: '018f0000-0000-7000-8000-0000000000d1',
    fingerprint: 'SHA256:abcdef',
    identity: 'dev@corp.example',
    principals: ['deploy'],
    expiresAt: '2026-07-16T18:00:00Z',
    ...overrides,
  };
}

const MANAGE = ['user:manage'] as const;

describe('PinList', () => {
  it('prompts for an identity before listing', () => {
    renderWithProviders(<PinList />, {
      authenticated: true,
      permissions: [...MANAGE],
    });
    expect(
      screen.getByText('Enter an identity to list its pins.'),
    ).toBeInTheDocument();
  });

  it('lists pins for the entered identity', async () => {
    server.use(http.get(cp('/v1/pins'), () => ok({ pins: [pin()] })));
    renderWithProviders(<PinList />, {
      authenticated: true,
      permissions: [...MANAGE],
    });
    fireEvent.change(screen.getByLabelText('Identity', { exact: false }), {
      target: { value: 'dev@corp.example' },
    });
    expect(await screen.findByText('SHA256:abcdef')).toBeInTheDocument();
  });

  it('shows an empty state for an identity with no pins', async () => {
    server.use(http.get(cp('/v1/pins'), () => ok({ pins: [] })));
    renderWithProviders(<PinList />, {
      authenticated: true,
      permissions: [...MANAGE],
    });
    fireEvent.change(screen.getByLabelText('Identity', { exact: false }), {
      target: { value: 'ghost@corp.example' },
    });
    expect(
      await screen.findByText('No pins for "ghost@corp.example".'),
    ).toBeInTheDocument();
  });

  it('renders a 403 gracefully', async () => {
    server.use(http.get(cp('/v1/pins'), () => problem(403, 'Forbidden')));
    renderWithProviders(<PinList />, {
      authenticated: true,
      permissions: [...MANAGE],
    });
    fireEvent.change(screen.getByLabelText('Identity', { exact: false }), {
      target: { value: 'dev@corp.example' },
    });
    expect(await screen.findByText('Not permitted')).toBeInTheDocument();
  });

  it('creates a pin, then revokes it', async () => {
    let pins: ReturnType<typeof pin>[] = [];
    const created = pin();
    server.use(
      http.get(cp('/v1/pins'), () => ok({ pins })),
      http.post(cp('/v1/pins'), () => {
        pins = [created];
        return ok(created, 201);
      }),
      http.delete(cp('/v1/pins/:id'), () => {
        pins = [];
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderWithProviders(<PinList />, {
      authenticated: true,
      permissions: [...MANAGE],
    });

    fireEvent.change(screen.getByLabelText('Identity', { exact: false }), {
      target: { value: 'dev@corp.example' },
    });
    expect(
      await screen.findByText('No pins for "dev@corp.example".'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'New pin…' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(
      within(dialog).getByLabelText('Public-key fingerprint', {
        exact: false,
      }),
      { target: { value: 'SHA256:abcdef' } },
    );
    const principals = within(dialog).getByLabelText('Principals', {
      exact: false,
    });
    fireEvent.change(principals, { target: { value: 'deploy' } });
    fireEvent.keyDown(principals, { key: 'Enter' });
    fireEvent.change(
      within(dialog).getByLabelText('TTL (seconds)', { exact: false }),
      { target: { value: '3600' } },
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create pin' }));

    expect(await screen.findByText('SHA256:abcdef')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));
    const confirm = screen.getByRole('dialog');
    fireEvent.click(within(confirm).getByRole('button', { name: 'Revoke' }));

    await waitFor(() => {
      expect(
        screen.getByText('No pins for "dev@corp.example".'),
      ).toBeInTheDocument();
    });
  });

  it('hides create/revoke without user:manage', async () => {
    server.use(http.get(cp('/v1/pins'), () => ok({ pins: [pin()] })));
    renderWithProviders(<PinList />, {
      authenticated: true,
      permissions: ['lock:read'],
    });
    fireEvent.change(screen.getByLabelText('Identity', { exact: false }), {
      target: { value: 'dev@corp.example' },
    });
    await screen.findByText('SHA256:abcdef');
    expect(
      screen.queryByRole('button', { name: 'New pin…' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Revoke' }),
    ).not.toBeInTheDocument();
  });

  it('issues an OTP and reveals it exactly once', async () => {
    server.use(
      http.get(cp('/v1/pins'), () => ok({ pins: [] })),
      http.post(cp('/v1/otp'), () =>
        ok(
          {
            otpId: '018f0000-0000-7000-8000-0000000000e1',
            otp: '482913',
            expiresAt: '2026-07-16T18:05:00Z',
          },
          201,
        ),
      ),
    );
    renderWithProviders(<PinList />, {
      authenticated: true,
      permissions: [...MANAGE],
    });

    fireEvent.click(screen.getByRole('button', { name: 'Issue OTP…' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(
      within(dialog).getByLabelText('Identity', { exact: false }),
      { target: { value: 'dev@corp.example' } },
    );
    const principals = within(dialog).getByLabelText('Allowed principals', {
      exact: false,
    });
    fireEvent.change(principals, { target: { value: 'deploy' } });
    fireEvent.keyDown(principals, { key: 'Enter' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Issue OTP' }));

    expect(await screen.findByText('482913')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
  });

  it('hides Issue OTP without user:manage', () => {
    renderWithProviders(<PinList />, {
      authenticated: true,
      permissions: ['lock:read'],
    });
    expect(
      screen.queryByRole('button', { name: 'Issue OTP…' }),
    ).not.toBeInTheDocument();
  });
});
