// Server-issued session controls ONLY. No creation from HTTP payloads.
// The identity implementation MUST mutate these same documents when revoking/changing epochs.
export function mongoAuthorizationFence(model, now=Date.now) {
  return async ({context:c,session})=>{
    const result=await model.updateOne({
      _id:c.sessionId,technicalAccountId:c.technicalAccountId,active:true,
      installationId:c.installationId,localPlayerId:c.localPlayerId,bindingGeneration:c.bindingGeneration,
      credentialVersion:c.credentialVersion,authzVersion:c.authzVersion,expiresAt:{$gt:now()},
    },{$inc:{revision:1}},{session});
    return result.matchedCount===1 && now()<c.expiresAt;
  };
}
