export class IngestionError extends Error {
  constructor(httpStatus, code, retryable = false) {
    super('Sync operation unavailable.');
    this.httpStatus = httpStatus; this.code = code; this.retryable = retryable;
  }
}
export const invalid = (code = 'invalid_fact') => new IngestionError(422, code);
export const conflict = (code = 'source_conflict') => new IngestionError(409, code);
export const deferred = () => new IngestionError(409, 'dependency_missing', true);
export const unavailable = () => new IngestionError(503, 'storage_unavailable', true);
