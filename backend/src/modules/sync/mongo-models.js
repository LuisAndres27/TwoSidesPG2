import { Schema } from 'mongoose';
import { atlasScopeState,assertAtlasModels } from './atlas-policy.js';

// No default connection, autoIndex or URI; models belong to an injected connection.
export function ingestionModels(connection,{atlasScope}={}) {
  const scope=atlasScope?atlasScopeState(atlasScope,connection):null;
  const names=scope?.collections??{operations:'sync_operations',facts:'sync_facts',fences:'sync_fences',authorization:'sync_authorization'};
  const suffix=scope?'_'+(scope.config.runId??scope.prefix):'';
  const options = { strict:'throw', versionKey:false, autoIndex:false,autoCreate:false, bufferCommands:false };
  const operation = new Schema({
    _id:{type:String,required:true}, technicalAccountId:{type:String,required:true},
    operationId:{type:String,required:true}, scope:{type:String,required:true},
    record:{type:Schema.Types.Mixed,required:true},
    authorizationDecision:{type:new Schema({owner:String,revision:Number},{_id:false,strict:'throw'}),required:true},
  }, options);
  operation.index({technicalAccountId:1,operationId:1},{unique:true,name:'owner_operation_unique'});
  const fact = new Schema({
    _id:{type:String,required:true}, scope:{type:String,required:true},
    sourceKey:{type:String,required:true}, record:{type:Schema.Types.Mixed,required:true},
  }, options);
  fact.index({scope:1,sourceKey:1},{unique:true,name:'scope_source_unique'});
  const fence = new Schema({ _id:String, revision:{type:Number,required:true} }, options);
  const authorization = new Schema({
    _id:String, technicalAccountId:{type:String,required:true}, installationId:{type:String,required:true},
    localPlayerId:{type:String,required:true}, bindingGeneration:{type:Number,required:true},
    credentialVersion:{type:Number,required:true},authzVersion:{type:Number,required:true},
    active:{type:Boolean,required:true},expiresAt:{type:Number,required:true},revision:{type:Number,required:true},
  }, options);
  // Only the explicitly authorized D.2 fixture carries cleanup ownership markers.
  if(['B05.4C.2D.2','B05.4C.2D.2E'].includes(scope?.config.persistenceTest))for(const schema of [operation,fact,fence,authorization])schema.add({
    integrationRunId:{type:String,required:true,default:scope.config.runId,immutable:true},
    syntheticOwnerId:{type:String,required:true,default:scope.config.runId,immutable:true},
  });
  const get=(name,schema,collection)=>connection.models[name+suffix]??connection.model(name+suffix,schema,collection);
  const models={operations:get('SyncOperation',operation,names.operations),facts:get('SyncFact',fact,names.facts),
    fences:get('SyncFence',fence,names.fences),authorization:get('SyncAuthorization',authorization,names.authorization)};
  if(scope)assertAtlasModels(atlasScope,connection,models);
  return models;
}

export async function prepareIngestionIndexes(models) {
  // Only on a NEW disposable test database, explicitly requested by the caller.
  for (const model of Object.values(models)) await model.createCollection();
  for (const model of Object.values(models)) await model.createIndexes();
  await models.fences.updateOne({_id:'ingestion-v1'},{$setOnInsert:{revision:0}},{upsert:true,writeConcern:{w:'majority',j:true}});
}
