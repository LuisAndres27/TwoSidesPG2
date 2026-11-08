// Orderly start and stop of an HTTP listener. No environment reads, no logging, no outbound connections.
const LOOPBACK = Object.freeze(['127.0.0.1', '::1', 'localhost']);

export class StartupError extends Error {
  constructor(code) { super('Server startup unavailable.'); this.name = 'StartupError'; this.code = code; }
}

function checkResources(resources) {
  if (!Array.isArray(resources) || resources.some(r => typeof r?.name !== 'string' || !r.name || typeof r.close !== 'function'))
    throw new StartupError('INVALID_RESOURCES');
  return [...resources];
}

// Resolves once the socket is listening. `resources` close in reverse order of registration, after the listener has stopped.
export function startServer(app, { host = '127.0.0.1', port = 0, resources = [], allowedHosts = LOOPBACK } = {}) {
  if (typeof app !== 'function' || !allowedHosts.includes(host)) throw new StartupError('HOST_REJECTED');
  if (!Number.isSafeInteger(port) || port < 0 || port > 65535) throw new StartupError('PORT_REJECTED');
  const owned = checkResources(resources);
  return new Promise((resolve, reject) => {
    const server = app.listen(port, host);
    server.once('error', () => reject(new StartupError('LISTEN_FAILED')));
    server.once('listening', () => {
      let closing = null;
      // Stop accepting, let in-flight requests finish for `graceMs`, then cut what is left, then release resources.
      const close = ({ graceMs = 5000 } = {}) => closing ??= (async () => {
        let forced = false;
        await new Promise(done => {
          const timer = setTimeout(() => { forced = true; server.closeAllConnections(); }, graceMs);
          timer.unref?.();
          server.once('close', () => { clearTimeout(timer); done(); });
          server.close();
          server.closeIdleConnections();
        });
        let resourceErrors = 0;
        for (const resource of [...owned].reverse()) {
          try { await resource.close(); } catch { resourceErrors += 1; }
        }
        return Object.freeze({ closed: true, forced, resourceErrors });
      })();
      resolve(Object.freeze({ host, port: server.address().port, server, close }));
    });
  });
}
