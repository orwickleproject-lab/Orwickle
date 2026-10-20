export class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export function createApi(fetcher = fetch) {
  let csrf;
  async function token() {
    csrf = (await call('/csrf')).csrfToken;
  }
  async function call(path, body, method = body === undefined ? 'GET' : 'POST') {
    if (method !== 'GET' && !csrf) await token();
    let response;
    try {
      response = await fetcher(`/api${path}`, {
        method,
        credentials: 'same-origin',
        headers: {
          ...(body !== undefined && { 'Content-Type': 'application/json' }),
          ...(method !== 'GET' && { 'X-CSRF-Token': csrf }),
        },
        ...(body !== undefined && { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(30000),
      });
    } catch {
      throw new ApiError('Cannot connect. Check your connection and try again.', 0);
    }
    let data;
    try {
      data = await response.json();
    } catch {
      throw new ApiError('The service is unavailable. Try again shortly.', response.status);
    }
    if (!response.ok) {
      if (response.status === 401 || data.error?.code === 'CSRF_INVALID') csrf = undefined;
      throw new ApiError(
        data.error?.message || 'The request could not be completed.',
        response.status,
        data.error?.code,
      );
    }
    if (data.csrfToken) csrf = data.csrfToken;
    return data;
  }
  return { call };
}
