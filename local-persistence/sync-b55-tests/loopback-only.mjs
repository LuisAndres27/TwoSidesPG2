// Test-only preload. No configuration, credentials, environment files or Atlas imports.
// Also prevents DNS discovery / outgoing sockets if an offline dependency regresses.
import net from 'node:net';
import dns from 'node:dns';
import { syncBuiltinESMExports } from 'node:module';
const refuse = () => { throw new Error('B55_NON_LOOPBACK_NETWORK_BLOCKED'); };
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const a = Array.isArray(args[0]) ? args[0] : args;
  const options = typeof a[0] === 'object' ? a[0] : { port: a[0], host: a[1] };
  if (!options || options.path || !['127.0.0.1', '::1', 'localhost'].includes(options.host)) refuse();
  return connect.apply(this, args);
};
const lookup = dns.lookup;
dns.lookup = function (host, ...args) {
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) refuse();
  return lookup.call(this, host, ...args);
};
for (const key of Object.keys(dns)) if (key.startsWith('resolve') || key === 'reverse') dns[key] = refuse;
for (const key of Object.keys(dns.promises)) if (key.startsWith('resolve') || key === 'reverse' || key === 'lookup') dns.promises[key] = refuse;
syncBuiltinESMExports();
