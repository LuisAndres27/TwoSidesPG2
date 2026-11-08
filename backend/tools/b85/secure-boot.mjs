// Applied only to the newly created B85 application volume; no existing Windows ACLs.
import {docker,names} from './runtime.mjs';
const boot=`set -eu\numask 077\nfor key in encryption-key session-key; do if [ ! -f /metabase-data/$key ]; then head -c 32 /dev/urandom | base64 > /metabase-data/$key; fi; done\nexport MB_ENCRYPTION_SECRET_KEY="$(cat /metabase-data/encryption-key)"\nexport MB_SESSION_SECRET_KEY="$(cat /metabase-data/session-key)"\nexec /app/run_metabase.sh\n`;
await docker(['exec','-u','0','-i',names.metabase,'sh','-c','umask 077; cat > /metabase-data/boot.sh'],boot);
console.log('B85_BOOT_PREPARED_REQUIRES_AUTHORIZED_RESTART');
