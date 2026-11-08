// B82: an explicit experimental policy, never a product retention decision.
export const BOUNDED_RETENTION='bounded-v1';
export const B82_RUN_HYBRID='b82-run-hybrid-v1';
export const B82_SEMANTIC_MARKER='b82-run-semantic-v1';
export function assertRetentionPolicy(policy=BOUNDED_RETENTION){
 if(![BOUNDED_RETENTION,B82_RUN_HYBRID].includes(policy))throw Error('Statistics retention policy rejected');
 return policy;
}
export function usesRunSemanticMarkers(policy){return assertRetentionPolicy(policy)===B82_RUN_HYBRID;}
