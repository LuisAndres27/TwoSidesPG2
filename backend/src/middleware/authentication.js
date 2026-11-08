import { ApiError } from '../utils/errors.js';

export const authenticate = service => async (request, _response, next) => {
  try {
    const count = request.rawHeaders.filter((_v, i, entries) => i % 2 === 0 && entries[i].toLowerCase() === 'authorization').length;
    const match = count === 1 && /^Bearer ([A-Za-z0-9_.-]+)$/.exec(request.headers.authorization ?? '');
    if (!match) throw new ApiError(401, 'authentication_required');
    request.principal = await service.authenticate(match[1]);
    next();
  } catch (error) { next(error instanceof ApiError && error.status === 503 ? error : new ApiError(401, 'authentication_required')); }
};
