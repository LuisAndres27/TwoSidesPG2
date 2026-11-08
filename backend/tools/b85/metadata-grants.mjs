// Packaged driver requires dbStats for connection and listCollections for discovery.
// No document read/write privileges added; strictly the B85-owned analytical DB.
import {mongoJs,authJs,names} from './runtime.mjs';
console.log(await mongoJs(`${authJs} db=db.getSiblingDB('${names.db}');db.grantPrivilegesToRole('b85_aggregates_read',[{resource:{db:'${names.db}',collection:''},actions:['dbStats','listCollections']}]);print(JSON.stringify({metadataGrant:['dbStats','listCollections'],database:'${names.db}'}));`));
