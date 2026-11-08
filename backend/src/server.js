import app from './app.js';
import { HOST, readPort } from './config/server.js';
import { assertNotProduction } from './config/jwt.js';
import { startServer } from './composition/lifecycle.js';

try {
  if(process.env.TWOSIDES_PROFILE==='main'){
    const {runMainFromProcess}=await import('./main/runtime.js');
    const backend=await runMainFromProcess();
    console.log('two-sides-backend main listening on loopback');
    let stopping=false;
    const stop=()=>{if(stopping)return;stopping=true;backend.close({graceMs:4000}).then(r=>{process.exitCode=r.resourceErrors?1:0;},()=>{process.exitCode=1;});setTimeout(()=>process.exit(1),5000).unref();};
    process.once('SIGINT',stop);process.once('SIGTERM',stop);
  }else{
  assertNotProduction();
  const handle = await startServer(app, { host: HOST, port: readPort() });
  console.log(`two-sides-backend listening at http://${HOST}:${handle.port}`);

  // Orderly stop: stop accepting, let in-flight requests finish, then cut what remains after the grace period.
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    handle.close({ graceMs: 4000 }).then(() => { process.exitCode = 0; }, () => { process.exitCode = 1; });
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  }
} catch (error) {
  // main failures carry a fixed-vocabulary code (never a path, URI or driver text): print it so a missing/invalid configuration can be diagnosed.
  const mainCode = error?.name === 'MainError' && /^main_[a-z_]{1,40}$/.test(error.code) ? ` [${error.code}]` : '';
  console.error(error?.code === 'LISTEN_FAILED' ? 'Unable to start two-sides-backend' : `Unable to start two-sides-backend: invalid configuration${mainCode}`);
  process.exitCode = 1;
}
