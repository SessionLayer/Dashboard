import createClient, { type Middleware } from 'openapi-fetch';

import type { paths } from './schema';
import { insecureEndpointError } from './prodBaseUrl';
import { endpoint } from '../config/runtime';
import { getBearer, notifyUnauthorized } from '../auth/tokenStore';

const configured = endpoint('CP_BASE_URL');
export const CP_BASE_URL: string = configured?.value ?? 'http://localhost:8080';

if (import.meta.env.PROD) {
  const insecure = insecureEndpointError(
    configured?.source ?? 'SL_CP_BASE_URL',
    CP_BASE_URL,
  );
  if (insecure !== undefined) {
    throw new Error(insecure);
  }
}

const authMiddleware: Middleware = {
  onRequest({ request }) {
    const token = getBearer();
    if (token !== undefined) {
      request.headers.set('Authorization', `Bearer ${token}`);
    }
    return request;
  },
  onResponse({ response }) {
    if (response.status === 401) {
      notifyUnauthorized();
    }
    return response;
  },
};

export const api = createClient<paths>({
  baseUrl: CP_BASE_URL,
  fetch: (request) => fetch(request),
});

api.use(authMiddleware);
