import { Schema } from 'mongoose';
import { atlasScopeState } from '../sync/atlas-policy.js';

export function identityCollectionNames(connection, atlasScope) {
  const scope = atlasScope ? atlasScopeState(atlasScope, connection) : null;
  const prefix = scope ? scope.prefix : 'sync';
  return Object.fromEntries(['identities','ownerGuards','identitySessions','revocations'].map(k => [k, `${prefix}_${k}`]));
}

// No connection, indexes, credentials or collections are created by this factory.
export function mongoIdentityModels(connection, { atlasScope } = {}) {
  const names = identityCollectionNames(connection, atlasScope);
  const options = {strict:'throw', versionKey:false, autoIndex:false, autoCreate:false, bufferCommands:false};
  const epoch = {type:Number, required:true, min:1, validate:Number.isSafeInteger};
  const identity = new Schema({
    _id:String, technicalAccountId:{type:String,required:true}, registrationId:{type:String,required:true},
    installationId:{type:String,required:true}, localPlayerId:{type:String,required:true},
    bindingGeneration:epoch, credentialVersion:epoch, authzVersion:epoch,
    credentialVerifier:{type:String,required:true}, credentialExpiresAt:{type:Number,default:null},
    active:{type:Boolean,required:true}, linked:{type:Boolean,required:true}, role:{type:String,enum:['player'],required:true},
    createdAt:String, updatedAt:String,
  }, options);
  identity.index({registrationId:1},{unique:true,name:'identity_registration_unique'});
  identity.index({installationId:1,localPlayerId:1},{unique:true,name:'identity_binding_unique'});
  const guard = new Schema({_id:String, revision:{type:Number,required:true,min:0,validate:Number.isSafeInteger}},options);
  const session = new Schema({
    _id:String, sessionId:String, technicalAccountId:{type:String,required:true}, tokenHash:{type:String,required:true},
    installationId:String,localPlayerId:String,bindingGeneration:epoch,credentialVersion:epoch,authzVersion:epoch,
    createdAt:Number,expiresAt:Number,revoked:{type:Boolean,required:true},
  },options);
  session.index({tokenHash:1},{unique:true,name:'identity_token_unique'});
  const revocation = new Schema({_id:String,technicalAccountId:String,commandId:String,kind:String,target:String,
    revision:Number,confirmedAtUtc:String},options);
  const schemas = {identities:identity,ownerGuards:guard,identitySessions:session,revocations:revocation};
  return Object.fromEntries(Object.entries(schemas).map(([key,schema]) => {
    const name = names[key];
    return [key, connection.models[name] ?? connection.model(name,schema,name)];
  }));
}
