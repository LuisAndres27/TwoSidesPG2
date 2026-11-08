// B87 — the hardening applied to the disposable Metabase in the real tests and written in the AWS guide. One source of truth, no imports (so the offline suite can read it).
// Verified on Metabase v0.65.2 (the B85 image): all of these are accepted at startup. NOT included on purpose: MB_PASSWORD_COMPLEXITY / MB_PASSWORD_LENGTH —
// tested and found NOT enforced (an administrator can create users with 8-character passwords whatever their value); password strength is enforced by the
// provisioning tool (15 characters minimum) and by procedure, and Metabase itself only refuses commonly used passwords.
export const HARDENED_ENV=Object.freeze([
 'MB_DISABLE_LEGACY_STARTUP_ENCRYPTION=true',
 'MB_SITE_URL=https://metabase.example.test',   // the real value in the guide is the public name
 'MB_REDIRECT_ALL_REQUESTS_TO_HTTPS=true',
 'MB_ENABLE_PUBLIC_SHARING=false',
 'MB_ENABLE_EMBEDDING=false',
]);
// The image's entrypoint creates/uses an unprivileged `metabase` user and needs exactly these capabilities to do it (with --cap-drop=ALL alone it exits:
// "adduser: Operation not permitted"). With this set Metabase starts and the Java process runs as the non-root user `metabase`.
export const REQUIRED_CAPS=Object.freeze(['CHOWN','SETUID','SETGID','DAC_OVERRIDE','FOWNER']);
export const HARDENED_FLAGS=Object.freeze(['--cap-drop=ALL',...REQUIRED_CAPS.map(c=>'--cap-add='+c),'--security-opt=no-new-privileges:true','--pids-limit=512']);
