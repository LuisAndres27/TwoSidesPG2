// Historical inspection/provisioning contract only. Never imported by the runtime policy or its opener.
// Existing administrative authorizations remain pinned to the OLD principal; they cannot activate the restricted application.
export const MAIN_TARGET=Object.freeze({host:'twosidescluster.fxqeo8o.mongodb.net',database:'two_sides_db',user:'twosides_backend'});
export const MAIN_URI=`mongodb+srv://${MAIN_TARGET.host}/${MAIN_TARGET.database}`;
export const MAIN_AUTH_MECHANISM='DEFAULT';
export const negotiatedScram=advertised=>!Array.isArray(advertised)?'unknown':advertised.includes('SCRAM-SHA-256')?'SCRAM-SHA-256':advertised.includes('SCRAM-SHA-1')?'SCRAM-SHA-1':'none';
