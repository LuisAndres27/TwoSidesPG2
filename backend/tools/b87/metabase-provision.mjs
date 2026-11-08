// B87 — creates, on a NEW Metabase instance, the connection to the Atlas ANALYTICAL database (reader identity, SCRAM-SHA-1), the collection and the dashboard
// "Datos de prueba del propietario" with the 15 questions of B85, and turns query caching off. Owner only. Claude Code never runs it against AWS or Atlas.
// Input: ONE JSON line on stdin (the Run-B87-Metabase-Provision.ps1 wrapper builds it from HIDDEN prompts): never arguments, variables, files or the URL.
//   {"metabaseUrl":"https://…","admin":{"email":"…","password":"…"},"mode":"atlas","host":"<cluster>.<id>.mongodb.net","readerPassword":"…","viewer":{"email":"…","password":"…"}}
// Output: ids and booleans only. Exit 0 ok · 2 input/policy rejected (nothing contacted) · 3 input missing · 4 provisioning failed (sanitised code only).
import {MetabaseClient,provision,atlasConnectionDetails,localTestConnectionDetails,describeProvisionError,ProvisionError} from './metabase-lib.mjs';

const fail=(code,message)=>{process.stderr.write(message+'\n');process.exit(code);};
if(process.stdin.isTTY)fail(3,'Input must arrive through stdin (use Run-B87-Metabase-Provision.ps1).');
let raw='';for await(const chunk of process.stdin)raw+=chunk;
let input;try{input=JSON.parse(raw.trim());}catch{fail(3,'Input not supplied.');}
raw='';
const secrets=[input?.readerPassword,input?.admin?.password,input?.viewer?.password,input?.admin?.email,input?.viewer?.email,input?.host,'twosides_statistics_reader_v1'];
let client,connection;
try{
 if(!input||typeof input!=='object'||typeof input.admin?.email!=='string'||typeof input.admin?.password!=='string'||input.admin.password.length<15)throw new ProvisionError('admin_credentials_missing');
 client=new MetabaseClient({baseUrl:input.metabaseUrl});
 if(input.mode==='atlas')connection=atlasConnectionDetails({host:input.host,password:input.readerPassword});
 else if(input.mode==='local-test'&&process.env.B87_REAL_TESTS==='1')connection=localTestConnectionDetails({host:input.host,password:input.readerPassword});
 else throw new ProvisionError('mode_rejected');
}catch(e){fail(2,'Rejected: '+describeProvisionError(e,secrets).code);}
try{
 const {summary}=await provision({client,admin:input.admin,connection,viewer:input.viewer});
 process.stdout.write(JSON.stringify(summary,null,2)+'\n');process.exit(0);
}catch(e){
 const d=describeProvisionError(e,secrets);
 fail(4,'Provisioning failed: '+d.code+(d.detail?'\n  detail: '+d.detail:''));
}
