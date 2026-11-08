import { ApiError } from '../utils/errors.js';

export const authorize = (...roles) => (request, _response, next) => {
  if (!request.principal) return next(new ApiError(401, 'authentication_required'));
  if (!roles.includes(request.principal.role)) return next(new ApiError(403, 'forbidden'));
  next();
};
export function authorizeOwner(request, _response, next) {
  if (!request.principal) return next(new ApiError(401, 'authentication_required'));
  if (request.params.id !== request.principal.id) return next(new ApiError(403, 'forbidden'));
  next();
}
