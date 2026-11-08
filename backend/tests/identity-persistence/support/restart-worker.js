import { SyntheticIdentityRepository } from './synthetic-repository.js';
import { SyntheticKeyProvider } from './key-provider.js';
import { JwtService } from '../../../src/modules/auth/jwt-service.js';
import { CredentialHasher } from '../../../src/modules/auth/credential-hasher.js';
import { RateLimiter } from '../../../src/middleware/rate-limiter.js';
import { once } from 'node:events';
import { createApp } from '../../../src/app.js';
import { EncryptedStore } from './encrypted-store.js';

process.once('message', async input => {
  let server, stage = 'repository';
  try {
    const options = { directory: input.directory, masterKey: Buffer.from(input.masterKey, 'base64'), synthetic: true };
    const now = () => input.time;
    const repository = await SyntheticIdentityRepository.open({ ...options, initialize: !!input.initialize, now });
    const keys = new SyntheticKeyProvider(options);
    stage = 'keys';
    if (input.initialize) await keys.initialize();
    const config = await keys.load();
    const service = new JwtService({ config, repository, hasher: new CredentialHasher(), limiter: new RateLimiter({ now }), now, version: 2 });
    stage = 'listener';
    if (input.action === 'interrupt') {
      // Model interruption before atomic rename, preserving the old committed snapshot.
      const store = new EncryptedStore({ ...options, name: 'identities' });
      await store.exclusive(async () => {
        const state = await store.load(); state.accounts[0].active = false;
        process.send({ ok: true, interrupted: true }, () => process.exit(0));
        await new Promise(() => {}); // Abrupt exit leaves lock, never commits state.
      });
      return;
    }
    server = createApp({ persistentJwt: { config, repository }, now }).listen(0, '127.0.0.1');
    await once(server, 'listening');
    let output = { ok: true, pid: process.pid, kid: config.keyId, fingerprint: config.publicFingerprint };
    if (input.action === 'issue') {
      stage = 'registration';
      const registration = await service.register(input.registration, 'synthetic');
      const id = registration.body.technicalAccountId;
      stage = 'session';
      const session = await service.session({ ...input.registration, technicalAccountId: id }, 'synthetic');
      output = { ...output, id, token: session.accessToken };
    } else {
      if (input.action === 'revoke') await repository.revokeIdentity(input.id);
      try {
        const principal = await service.authenticate(input.token);
        const response = await fetch('http://127.0.0.1:' + server.address().port + '/api/v2/technical/me',
          { headers: { Authorization: 'Bearer ' + input.token } });
        output = { ...output, accepted: response.status === 200, id: principal.id, jti: principal.sessionId };
      } catch (error) { output = { ...output, accepted: false, status: error.status }; }
    }
    await new Promise(resolve => server.close(resolve)); server = null;
    process.send(output, () => process.disconnect());
  } catch {
    if (server) await new Promise(resolve => server.close(resolve));
    process.send({ ok: false, stage }, () => process.disconnect());
  }
});

