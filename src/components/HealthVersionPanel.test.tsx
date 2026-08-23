import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { CP_BASE_URL } from '../api/client';
import { server } from '../test/server';
import { renderWithClient } from '../test/utils';
import { HealthVersionPanel } from './HealthVersionPanel';

describe('HealthVersionPanel', () => {
  it('renders component name, version, and protocol ranges from the Control Plane', async () => {
    renderWithClient(<HealthVersionPanel />);

    expect(await screen.findByTestId('component')).toHaveTextContent(
      'SessionLayer Control Plane',
    );
    expect(screen.getByTestId('version')).toHaveTextContent('0.1.0');
    expect(
      screen.getByTestId('protocol-controlPlaneGatewayGrpc'),
    ).toHaveTextContent('1.0');
    expect(screen.getByTestId('protocol-agentGatewayWire')).toHaveTextContent(
      '1.0',
    );
    expect(screen.getByTestId('health-badge')).toHaveTextContent('Healthy');
  });

  it('surfaces an RFC 9457 problem when the version probe fails', async () => {
    server.use(
      http.get(`${CP_BASE_URL}/v1/version`, () =>
        HttpResponse.json(
          {
            type: 'about:blank',
            title: 'Service Unavailable',
            status: 503,
          },
          { status: 503 },
        ),
      ),
    );

    renderWithClient(<HealthVersionPanel />);

    expect(await screen.findByTestId('version-error')).toHaveTextContent(
      'Service Unavailable',
    );
  });
});
