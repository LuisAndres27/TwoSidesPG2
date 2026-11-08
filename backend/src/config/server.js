export const HOST = '127.0.0.1';

export function readPort(value = process.env.PORT) {
  if (value === undefined) return 3000;
  if (!/^\d+$/.test(value)) throw new Error('Invalid PORT configuration');
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 0 || port > 65535) {
    throw new Error('Invalid PORT configuration');
  }
  return port;
}
