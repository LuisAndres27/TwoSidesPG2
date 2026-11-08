const messages = Object.freeze({
  invalid_request: 'Solicitud no valida.',
  authentication_failed: 'No se pudo autenticar la identidad.',
  authentication_required: 'Se requiere autenticacion.',
  forbidden: 'Operacion no autorizada.',
  registration_conflict: 'No se pudo completar el registro.',
  payload_too_large: 'Solicitud demasiado grande.',
  unsupported_media_type: 'Formato no admitido.',
  rate_limited: 'Demasiadas solicitudes.',
  temporarily_unavailable: 'Servicio temporalmente no disponible.',
  internal_error: 'Error interno.',
});

export class ApiError extends Error {
  constructor(status, code, retryAfter) {
    super(messages[code] ?? messages.internal_error);
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

export const invalidRequest = () => new ApiError(400, 'invalid_request');
export const unavailable = () => new ApiError(503, 'temporarily_unavailable', 1);
