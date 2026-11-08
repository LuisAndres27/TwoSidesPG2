// Test-only child process. Runs the REAL main opener and the REAL main connector with the REAL mongoose/driver, with every socket and DNS function blocked and
// MongoClient.connect intercepted: it records the normalized client options (what the driver would authenticate with), resolves the DEFAULT mechanism with the
// driver's own code for several advertised-mechanism lists, then aborts with an authentication-shaped error. The expected (fictitious) password comes from
// argv and is only compared, never printed.
import net from 'node:net';
import dns from 'node:dns';
import { MongoClient } from 'mongodb';
net.Socket.prototype.connect = () => { throw new Error('NETWORK_BLOCKED'); };
for (const name of ['lookup', 'resolve', 'resolveSrv', 'resolve4', 'resolve6', 'resolveTxt', 'resolveAny']) dns[name] = () => { throw new Error('DNS_BLOCKED'); };
const expected = process.argv[2];
let seen = null;
const resolveWith = (credentials, hello) => { try { return credentials.resolveAuthMechanism(hello).mechanism; } catch (error) { return 'error:' + error.name; } };
MongoClient.prototype.connect = async function () {
  const o = this.options, c = o.credentials ?? {};
  seen = { username: c.username, source: c.source, mechanism: c.mechanism, passwordEquals: c.password === expected, srvHost: o.srvHost, dbName: o.dbName, tls: o.tls,
    tlsInsecure: o.tlsInsecure ?? false, tlsAllowInvalidCertificates: o.tlsAllowInvalidCertificates ?? false, tlsAllowInvalidHostnames: o.tlsAllowInvalidHostnames ?? false,
    directConnection: o.directConnection, urlHasCredentials: /\/\/[^/]*@/.test(String(this.s?.url ?? '')), urlHasPassword: String(this.s?.url ?? '').includes(expected),
    urlHasMechanism: /authMechanism/i.test(String(this.s?.url ?? '')),
    resolved: {
      both: resolveWith(c, { saslSupportedMechs: ['SCRAM-SHA-256', 'SCRAM-SHA-1'] }), onlySha1: resolveWith(c, { saslSupportedMechs: ['SCRAM-SHA-1'] }),
      onlySha256: resolveWith(c, { saslSupportedMechs: ['SCRAM-SHA-256'] }), empty: resolveWith(c, { saslSupportedMechs: [] }),
      foreign: resolveWith(c, { saslSupportedMechs: ['PLAIN', 'MONGODB-X509', 'MONGODB-AWS', 'GSSAPI'] }), absent: resolveWith(c, {}),
    } };
  throw Object.assign(new Error('Authentication failed.'), { name: 'MongoServerError', code: 18, codeName: 'AuthenticationFailed' });
};
const { openMainProfile, MAIN_ACTIVATION } = await import('../../../src/main/profile.js');
const { mainConnector } = await import('../../../src/config/database.js');
const { temporaryAtlasCredential } = await import('../../../src/modules/sync/atlas-credentials.js');
const mongoose = (await import('mongoose')).default;
let failure = null;
try { await openMainProfile({ activation: MAIN_ACTIVATION, credential: temporaryAtlasCredential(Buffer.from(expected, 'utf8')), connector: mainConnector(mongoose) }); }
catch (error) { failure = { code: error.code }; }
console.log(JSON.stringify({ seen, failure }));
