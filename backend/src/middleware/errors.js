export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function errorHandler(error, request, response, _next) {
  if (response.headersSent) {
    console.error('Request failed after response', { requestId: request.id });
    return response.destroy();
  }
  let status = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'An unexpected error occurred';
  if (error instanceof HttpError) {
    ({ status, code, message } = error);
  } else if (
    [
      'ECONNREFUSED',
      'ECONNRESET',
      'ETIMEDOUT',
      'ENOTFOUND',
      'EHOSTUNREACH',
      'ENETUNREACH',
      '28P01',
      'CERT_HAS_EXPIRED',
      'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
    ].includes(error.code) ||
    error.message === 'Connection terminated due to connection timeout'
  ) {
    status = 503;
    code = 'SERVICE_UNAVAILABLE';
    message = 'The service is temporarily unavailable. Please try again shortly.';
  } else if (error.type === 'entity.parse.failed') {
    status = 400;
    code = 'INVALID_JSON';
    message = 'Request body must be valid JSON';
  } else if (error.type === 'entity.too.large') {
    status = 413;
    code = 'BODY_TOO_LARGE';
    message = 'Request body exceeds the allowed size';
  } else if (error.type === 'encoding.unsupported' || error.type === 'charset.unsupported') {
    status = 415;
    code = 'UNSUPPORTED_ENCODING';
    message = 'Request encoding is not supported';
  }
  if (status === 500) console.error('Request failed', { requestId: request.id });
  response.status(status).json({ error: { code, message, requestId: request.id } });
}
