import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { CP_BASE_URL } from '../api/client';
import { versionFixture } from '../test/handlers';
import { server } from '../test/server';
import { renderWithClient } from '../test/utils';
import { ControlPlaneVersion } from './ControlPlaneVersion';

describe('ControlPlaneVersion', () => {
  // 9.9.9 deliberately matches no real release: the fixture default and the
  // string this replaced were both `0.1.0`, so asserting that would have passed
  // against a hardcoded literal.
  it('reports the version the Control Plane actually advertises', async () => {
    server.use(
      http.get(`${CP_BASE_URL}/v1/version`, () =>
        HttpResponse.json({ ...versionFixture, version: '9.9.9' }),
      ),
    );

    renderWithClient(<ControlPlaneVersion />);

    // Poll the text, not the element: the span renders immediately with the
    // placeholder, so findByTestId would resolve before the probe answers and
    // assert against the pending state.
    await expect
      .poll(() => screen.getByTestId('sidebar-cp-version').textContent)
      .toBe('control-plane v9.9.9');
  });

  it('asserts no version at all while the probe is unanswered', () => {
    renderWithClient(<ControlPlaneVersion />);

    const el = screen.getByTestId('sidebar-cp-version');
    expect(el).toHaveTextContent('control-plane —');
    expect(el.textContent).not.toMatch(/v\d/);
  });

  it('asserts no version when the probe fails', async () => {
    server.use(
      http.get(`${CP_BASE_URL}/v1/version`, () =>
        HttpResponse.json(
          { type: 'about:blank', title: 'Service Unavailable', status: 503 },
          { status: 503 },
        ),
      ),
    );

    renderWithClient(<ControlPlaneVersion />);

    // Nothing to await on: the point is that no version is ever asserted, so
    // settle the failed query first and then confirm the placeholder held.
    await expect
      .poll(() => screen.getByTestId('sidebar-cp-version').textContent)
      .toBe('control-plane —');
    expect(screen.getByTestId('sidebar-cp-version').textContent).not.toMatch(
      /v\d/,
    );
  });
});
