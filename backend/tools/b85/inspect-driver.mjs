import {docker} from './runtime.mjs';
console.log(await docker(['exec','twosides-b85-metabase','sh','-c',"unzip -p /app/metabase.jar metabase/driver/mongo__init.class | strings | sed -n '300,540p'"]));
