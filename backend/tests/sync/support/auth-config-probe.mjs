// Test-only child process. Runs the REAL launcher (main) with the REAL mongoose/driver, but every socket and DNS function is blocked and MongoClient.connect is
// intercepted: it records the normalized client options (what the driver would authenticate with) and aborts with an authentication-shaped error.
// The expected (fictitious) password comes from the parent through argv[3] and is only compared, never printed.
import net from 'node:net';
import dns from 'node:dns';
import { MongoClient } from 'mongodb';
net.Socket.prototype.connect = () => { throw new Error('NETWORK_BLOCKED'); };
for (const name of ['lookup', 'resolve', 'resolveSrv', 'resolve4', 'resolve6', 'resolveTxt', 'resolveAny']) dns[name] = () => { throw new Error('DNS_BLOCKED'); };
const [, , authorization, expected] = process.argv;
let seen = null, connectCalls = 0;
MongoClient.prototype.connect = async function () {
  connectCalls += 1;
  const o = this.options, c = o.credentials ?? {};
  seen = { username: c.username, source: c.source, mechanism: c.mechanism, mechanismProperties: c.mechanismProperties ?? null, passwordEquals: c.password === expected, passwordLength: c.password?.length ?? -1,
    srvHost: o.srvHost, dbName: o.dbName, tls: o.tls, tlsInsecure: o.tlsInsecure ?? false, tlsAllowInvalidCertificates: o.tlsAllowInvalidCertificates ?? false,
    tlsAllowInvalidHostnames: o.tlsAllowInvalidHostnames ?? false, directConnection: o.directConnection, retryWrites: o.retryWrites, appName: o.appName,
    serverSelectionTimeoutMS: o.serverSelectionTimeoutMS, connectTimeoutMS: o.connectTimeoutMS, maxPoolSize: o.maxPoolSize, readPreference: o.readPreference?.mode,
    writeConcern: o.writeConcern?.w, urlHasCredentials: /\/\/[^/]*@/.test(String(this.s?.url ?? '')), urlHasPassword: String(this.s?.url ?? '').includes(expected) };
  throw Object.assign(new Error('Authentication failed.'), { name: 'MongoServerError', code: 18, codeName: 'AuthenticationFailed' });
};
const { main, failureReport } = await import('../../../src/integration/launcher.js');
let failure = null;
try {
  await main({ argv: ['--enable-integration', '--authorization', authorization], stdin: process.stdin, stdout: { write() {} }, loadMongoose: async () => (await import('mongoose')).default });
} catch (error) { failure = { code: error.code, report: failureReport(error) }; }
console.log(JSON.stringify({ connectCalls, seen, failure }));
