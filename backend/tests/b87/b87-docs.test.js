// B87 documentation checks: the AWS guide, the IAM policy and the evaluator scope must agree with the tested hardening and must not allow what the owner forbade.
import {describe,it,expect} from 'vitest';
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {HARDENED_ENV,HARDENED_FLAGS,REQUIRED_CAPS} from './hardening.js';

const backend=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=file=>fs.readFileSync(path.join(backend,'docs',file),'utf8');
const guide=read('B87_GUIA_AWS_METABASE.md'),scope=read('B87_ALCANCE_EVALUADORES.md'),policyText=read('B87_iam-operator-policy.json'),policy=JSON.parse(policyText);
const B85_DIGEST='sha256:b62ac14872e9992d28218a2264d99484e0707064aae9fb594d8fbb3bc1518a9e',AWS_DIGEST='sha256:e8f38a6d846accfdd44cf8f31d9fb50648162ddf22daf469dac3a1e4727a7657';
const section=(text,from,to)=>{const a=text.indexOf(from),b=text.indexOf(to,a+from.length);expect(a,from).toBeGreaterThanOrEqual(0);return text.slice(a,b<0?undefined:b);};
const metabaseRun=(()=>{const a=guide.indexOf('sudo docker run -d --name metabase'),b=guide.indexOf('metabase/metabase@sha256:',a);return guide.slice(a,guide.indexOf('\n',b));})();

describe('B87 guide: the Metabase command is the hardened one that was tested',()=>{
 it('contains every tested flag and environment variable, and publishes only on loopback',()=>{
  const normal=text=>text.replace(/\s+\\\n\s+/g,' ').replace(/--(security-opt|pids-limit)[= ]/g,'--$1=').replace(/\s+/g,' ');
  const command=normal(metabaseRun);
  for(const flag of HARDENED_FLAGS)expect(command,flag).toContain(flag.replace('--security-opt=','--security-opt='));
  for(const variable of HARDENED_ENV)expect(command,variable).toContain(variable.startsWith('MB_SITE_URL=')?'MB_SITE_URL=https://NOMBRE':variable);
  expect(command).toContain('-p 127.0.0.1:3000:3000');expect(command).not.toMatch(/-p\s+(0\.0\.0\.0:)?3000:3000|--publish-all|-P\s|--network[= ]host|--privileged/);
  expect(command).toContain('--restart unless-stopped');expect(command).toContain('--env-file /opt/metabase.env');expect(command).toContain('MB_DB_FILE=/metabase-data/metabase');
  for(const cap of REQUIRED_CAPS)expect(command).toContain('--cap-add='+cap);
 });
 it('pins the image by digest, differs from B85 and says why; never uses a floating tag in a run command',()=>{
  expect(metabaseRun).toContain('metabase/metabase@'+AWS_DIGEST);expect(guide).toContain(B85_DIGEST);expect(AWS_DIGEST).not.toBe(B85_DIGEST);
  const s4=section(guide,'## 4. Imagen de Metabase','## 5.');expect(s4).toMatch(/Por qué cambiar/);expect(s4).toMatch(/Lo que NO puedo afirmar/);expect(s4).toMatch(/Escaneo de vulnerabilidades/);expect(s4).toMatch(/v0\.65\.3\.4/);
  expect(guide).not.toMatch(/docker run[^\n]*metabase\/metabase:(?!.*@)/);expect(guide).not.toMatch(/metabase\/metabase:latest/);
 });
 it('the secrets are generated on the server and never typed in a command line',()=>{
  expect(guide).toContain('openssl rand -base64 32');expect(guide).toContain('MB_ENCRYPTION_SECRET_KEY');expect(guide).toContain('MB_SESSION_SECRET_KEY');expect(guide).toContain('umask 077');
  const commandLines=guide.split('\n').filter(l=>/^\s*(sudo |docker |aws |curl |\.\\|read )/.test(l));
  for(const line of commandLines)expect(line,line).not.toMatch(/(password|passwd|secret)[a-z_]*=[^\s$"'<]{6,}/i);
 });
});

describe('B87 guide: exposure and access',()=>{
 it('says that only 443 is public, 80 is closed (CloudFront excepted), 3000 never and SSH does not exist',()=>{
  const s0=section(guide,'## 0.','## 1.');
  expect(s0).toMatch(/\*\*443\*\*[^\n]*Público/);expect(s0).toMatch(/\*\*80\*\*[^\n]*Cerrado/);expect(s0).toMatch(/\*\*3000\*\*[^\n]*Nunca expuesto/);expect(s0).toMatch(/\*\*22 \(SSH\)\*\*[^\n]*No existe/);expect(s0).toMatch(/\/32/);
  const s5=section(guide,'## 5.','## 6.');expect(s5).toMatch(/Inbound: ninguna regla/);expect(s5).toMatch(/Nunca\*\* reglas para 22 ni para 3000/);
  expect(guide).not.toMatch(/(HTTPS|HTTP|TCP|Custom|SSH)[^\n]*\b(22|3000)\b[^\n]*0\.0\.0\.0\/0/);expect(guide).not.toMatch(/(abre|añade|crea)[^\n]*(22|3000)[^\n]*0\.0\.0\.0\/0/i);
 });
 it('the access is opened only AFTER the checklist, and the checklist covers ports, version, scan, secrets, evaluator, sharing and the kill switch',()=>{
  const s11=section(guide,'## 11.','## 12.'),rows=s11.split('\n').filter(l=>/^\| \d+ \|/.test(l));
  expect(rows.length).toBeGreaterThanOrEqual(20);
  for(const need of [/ss -ltnp/,/docker port/,/Trivy/,/aviso/i,/Evaluador sin privilegios/,/enlaces públicos/i,/Única fuente/,/\/32/,/grep -cF/,/Alcance/i,/Cierre rápido/])expect(s11,String(need)).toMatch(need);
  expect(guide.indexOf('## 11.')).toBeLessThan(guide.indexOf('## 12.'));expect(section(guide,'## 12.','## 13.')).toMatch(/solo tras la lista/i);
  expect(section(guide,'## 12.','## 13.')).toMatch(/Test-NetConnection[^\n]*443/);expect(section(guide,'## 12.','## 13.')).toMatch(/22, 80, 3000, 5432, 27017/);
 });
 it('Atlas admits only the Elastic IP with /32, temporary, and the guide forbids 0.0.0.0/0 there',()=>{
  const s7=section(guide,'## 7.','## 8.');expect(s7).toMatch(/EIP\/32/);expect(s7).toMatch(/Temporary/);expect(s7).toMatch(/nunca `0\.0\.0\.0\/0`/);
 });
 it('compares the three ways to get HTTPS without own domain and states the risk of each; EC2 hostnames are ruled out',()=>{
  const s3=section(guide,'## 3.','## 4.');
  expect(s3).toMatch(/sslip\.io/);expect(s3).toMatch(/CloudFront/);expect(s3).toMatch(/Dominio propio/);expect(s3).toMatch(/Riesgos/);expect(s3).toMatch(/suplantación/);expect(s3).toMatch(/Let's Encrypt rechaza/);expect(s3).toMatch(/Recomendación:\*\* B-1/);
 });
 it('uses the TLS-ALPN challenge so that port 80 stays closed, and the Caddy container keeps no extra privileges',()=>{
  expect(guide).toContain('disable_http_challenge');expect(guide).toContain('auto_https disable_redirects');expect(guide).toMatch(/--cap-drop=ALL --cap-add=NET_BIND_SERVICE --security-opt no-new-privileges:true/);
  expect(guide).toContain('caddy validate');expect(guide).toMatch(/caddy@sha256:/);
 });
});

describe('B87 guide: the AWS account belongs to someone else',()=>{
 it('never works as root: MFA, no root keys, limited IAM operator, budget with alerts, cost anomaly detection',()=>{
  const s2=section(guide,'## 2.','## 3.');
  expect(s2).toMatch(/MFA/);expect(s2).toMatch(/sin claves de acceso|no hay claves de acceso/);expect(s2).toMatch(/no volverá a usar la raíz|no usarla más|no la uses/i);
  expect(s2).toMatch(/Budgets/);expect(s2).toMatch(/25 USD/);expect(s2).toMatch(/dos\*\* correos|dos correos/);expect(s2).toMatch(/Cost Anomaly Detection/);
  expect(s2).toMatch(/Nunca\*\* le asignes `AdministratorAccess`/);expect(s2).toMatch(/Policy simulator/);
 });
 it('has a one-minute kill switch, a pause and a complete teardown with the order and the final billing check',()=>{
  const s13=section(guide,'## 13.','## 14.');
  expect(s13).toMatch(/Botón rojo/);expect(s13).toMatch(/borra todas las reglas/);expect(s13).toMatch(/Terminate/);expect(s13).toMatch(/Release/);expect(s13).toMatch(/Snapshots/);expect(s13).toMatch(/twosides-operator/);expect(s13).toMatch(/Atlas/);expect(s13).toMatch(/Cost Explorer/);
 });
 it('includes costs with the honest warning that nothing stops by itself',()=>{
  const s14=section(guide,'## 14.','## 15.');expect(s14).toMatch(/t3\.small/);expect(s14).toMatch(/IPv4/);expect(s14).toMatch(/no se detiene solo/);
 });
});

describe('B87 IAM policy of the operator',()=>{
 const statements=policy.Statement,allowed=statements.filter(s=>s.Effect==='Allow'),actions=s=>[].concat(s.Action);
 it('is valid, has no wildcard administrator rights and denies everything without MFA',()=>{
  expect(policy.Version).toBe('2012-10-17');
  for(const s of allowed)for(const a of actions(s)){expect(a,a).not.toBe('*');expect(a,a).not.toMatch(/^(iam|organizations|account|sts|kms|s3|rds|lambda|cloudformation|route53|ssm):\*$|^\*:/);}
  const flat=allowed.flatMap(actions);for(const forbidden of ['iam:CreateUser','iam:CreateAccessKey','iam:AttachUserPolicy','iam:PutUserPolicy','iam:CreateRole','iam:AttachRolePolicy','iam:CreatePolicy','iam:CreateLoginProfile','organizations:*','ec2:*','ec2:ModifyVpcAttribute','ec2:CreateVpc'])expect(flat).not.toContain(forbidden);
  const deny=statements.find(s=>s.Effect==='Deny');expect(deny.Condition.BoolIfExists['aws:MultiFactorAuthPresent']).toBe('false');expect(deny.NotAction).toContain('iam:EnableMFADevice');
 });
 it('can change things only in us-east-1; the only wildcard-resource statements are read-only or region-bound',()=>{
  for(const s of allowed.filter(x=>x.Resource==='*')){
   const readOnly=actions(s).every(a=>/:(Describe|Get|List|View|Lookup)[A-Za-z*]*$/.test(a));
   const regionBound=s.Condition?.StringEquals?.['aws:RequestedRegion']==='us-east-1';
   expect(readOnly||regionBound,s.Sid).toBe(true);
  }
  expect(allowed.some(s=>actions(s).includes('ec2:TerminateInstances')&&s.Condition?.StringEquals?.['aws:RequestedRegion']==='us-east-1')).toBe(true);
 });
 it('can pass ONLY the Session Manager role, to EC2, and open sessions only on instances of that region',()=>{
  const pass=allowed.find(s=>actions(s).includes('iam:PassRole'));expect(pass.Resource).toBe('arn:aws:iam::<ACCOUNT_ID>:role/twosides-metabase-ssm');expect(pass.Condition.StringEquals['iam:PassedToService']).toBe('ec2.amazonaws.com');
  const session=allowed.find(s=>actions(s).includes('ssm:StartSession'));expect([].concat(session.Resource).some(r=>r.startsWith('arn:aws:ec2:us-east-1:<ACCOUNT_ID>:instance/'))).toBe(true);
  expect(policyText).not.toMatch(/AKIA[0-9A-Z]{16}|aws_secret/i);
 });
});

describe('B87 evaluator scope',()=>{
 it('defines scope, exclusions, rules, window, contacts and acceptance, with no secrets',()=>{
  for(const heading of ['## 1. Partes y contactos','## 3. Dentro del alcance','## 4. Fuera del alcance','## 5. Reglas de actuación','## 7. Aceptación'])expect(scope).toContain(heading);
  expect(scope).toMatch(/única\*\* dirección en alcance/);expect(scope).toMatch(/Ventana/);expect(scope).toMatch(/Denegación de servicio/);expect(scope).toMatch(/MongoDB Atlas/);expect(scope).toMatch(/cuenta y la consola de \*\*AWS\*\*/);
  expect(scope).toMatch(/cerrar el acceso en cualquier momento/);expect(scope).toMatch(/no tiene 2FA/);expect(scope).toMatch(/Detente y avisa/i);
  expect(scope).not.toMatch(/password\s*[:=]\s*\S{6,}|mongodb\+srv:\/\/\S+:\S+@|AKIA[0-9A-Z]{16}/i);
 });
 it('blocks the unauthenticated password-reset endpoints in Caddy (CVE-2026-72898 workaround), checks it before and after opening, and says what could NOT be confirmed',()=>{
  const caddy=guide.match(/**6.4 Caddy[sS]*?```
([sS]*?)
```/)[1];
  expect(caddy).toMatch(/@reset path_regexp reset (?i)(reset_password|forgot_password)/);expect(caddy).toMatch(/handle @reset {s*respond "Not found" 404/);
  expect(caddy.indexOf('handle @reset')).toBeLessThan(caddy.indexOf('reverse_proxy'));
  const s11=section(guide,'## 11.','## 12.');expect(s11).toMatch(/| 24 |[^
]*reset_password/);expect(s11).toMatch(/| 25 |[^
]*CVE-2026-72898/);
  const s12=section(guide,'## 12.','## 13.');expect(s12).toMatch(/api/session/reset_password/);expect(s12).toMatch(/forgot_password/);expect(s12).toMatch(/**404**/);
  const s4=section(guide,'## 4.','## 5.');expect(s4).toMatch(/no confirmado/i);expect(s4).toMatch(/ningún aviso dice que 0.65.3.4/i);expect(s4).toMatch(/Trivy 0.58.1/);
 });
});
