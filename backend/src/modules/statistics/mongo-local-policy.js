// No environment reads, connection strings, DNS, credentials, or default connection.
// B81.1: besides the native-process profile (replica set b81_<runId>), exactly ONE owner-prepared Docker container is recognised:
// 'twosides-b811-mongo' on 127.0.0.1:27028 with replica set 'rsB811'. Nothing else about the policy is relaxed: the marker is
// all-or-nothing and the container profile cannot be combined with any other port or replica-set name.
import {isPreparedConfiguration,assertPreparedDriverTarget} from './atlas-policy.js';
export const B81_OWNED_CONTAINER=Object.freeze({name:'twosides-b811-mongo',host:'127.0.0.1',port:27028,replicaSet:'rsB811',image:'mongo:8.0'});
export function b81LocalConfiguration(input){
 const keys=['enabled','runId','host','port','database','replicaSet','ownedContainer'];
 const container=input?.ownedContainer!==undefined;
 if(!input||Object.keys(input).some(k=>!keys.includes(k))||input.enabled!==true||
    !/^[a-f0-9]{32}$/.test(input.runId??'')||input.host!=='127.0.0.1'||
    !Number.isInteger(input.port)||input.port<1024||input.port>65535||
    input.database!=='twosides_statistics_b81_'+input.runId||
    (container?(input.ownedContainer!==B81_OWNED_CONTAINER.name||input.port!==B81_OWNED_CONTAINER.port||input.replicaSet!==B81_OWNED_CONTAINER.replicaSet):input.replicaSet!=='b81_'+input.runId))
  throw Error('B81 local configuration rejected');
 return Object.freeze({...input});
}
export function assertB81DriverTarget(client,db,config){
 const c=b81LocalConfiguration(config),o=client?.options;
 if(db?.databaseName!==c.database||o?.srvHost||o?.credentials||o?.proxyHost||o?.loadBalanced||
    o?.directConnection!==true||o?.replicaSet!==c.replicaSet||o?.hosts?.length!==1||
    o.hosts[0].host!==c.host||o.hosts[0].port!==c.port||o.tls===true)
  throw Error('B81 driver target rejected');
 return c;
}

// B86: the adapter validates its driver handle through this dispatcher. Atlas / authenticated-RBAC targets are accepted ONLY when they carry a
// configuration minted by atlas-policy.js; every other configuration keeps the unchanged B81 rules (loopback, no credentials, no TLS).
export function assertStatisticsDriverTarget(client,db,config){return isPreparedConfiguration(config)?assertPreparedDriverTarget(client,db,config):assertB81DriverTarget(client,db,config);}
