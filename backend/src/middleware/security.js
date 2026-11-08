import { randomUUID } from 'node:crypto';
import express from 'express';
import { ApiError, invalidRequest } from '../utils/errors.js';

export function securityHeaders(_request, response, next) {
  response.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Content-Security-Policy': "default-src 'none'", 'Cache-Control': 'no-store' });
  next();
}

export function rejectQuery(request, _response, next) {
  if (request.originalUrl.includes('?')) return next(invalidRequest());
  next();
}

export function requireJson(request, _response, next) {
  if (!request.is('application/json') || !['identity', undefined].includes(request.headers['content-encoding'])) {
    return next(new ApiError(415, 'unsupported_media_type'));
  }
  next();
}

export const parseJson = express.json({ limit: 8192, strict: true, inflate: false, type: 'application/json' });

export function requireEmptyRequest(request, _response, next) {
  if (request.headers['transfer-encoding'] || Number(request.headers['content-length'] ?? 0) !== 0) return next(invalidRequest());
  next();
}

export function errorHandler(error, _request, response, _next) {
  if (response.headersSent) { response.destroy(); return; }
  let safe = error instanceof ApiError ? error : new ApiError(500, 'internal_error');
  if (error.type === 'entity.too.large') safe = new ApiError(413, 'payload_too_large');
  if (['entity.parse.failed', 'request.aborted', 'request.size.invalid'].includes(error.type)) safe = invalidRequest();
  if (['encoding.unsupported', 'charset.unsupported'].includes(error.type)) safe = new ApiError(415, 'unsupported_media_type');
  if (safe.retryAfter) response.set('Retry-After', String(safe.retryAfter));
  if (safe.status === 401) response.set('WWW-Authenticate', 'Bearer');
  response.status(safe.status).json({ schemaVersion: 1, error: { code: safe.code, message: safe.message }, requestId: randomUUID() });
}
