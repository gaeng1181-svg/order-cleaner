import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
export const NAME='order-cleaner-cs';
export const ORIGIN='https://gaeng1181-svg.github.io';
const root=fileURLToPath(new URL('../../',import.meta.url));
export function validateConfig(config){
  if(config.name!==NAME||config.main!=='cs-worker.mjs'||config.workers_dev!==true||config.vars?.ALLOWED_ORIGIN!==ORIGIN||config.observability?.enabled!==false)throw Error('Unexpected CS Worker configuration');
  const allowed=new Set(['name','main','compatibility_date','workers_dev','vars','ratelimits','observability']);
  if(Object.keys(config).some(k=>!allowed.has(k))||Object.keys(config.vars).some(k=>k!=='ALLOWED_ORIGIN'))throw Error('Unsupported bindings or variables');
  if(config.ratelimits?.length!==1||config.ratelimits[0].name!=='CS_RATE_LIMITER'||config.ratelimits[0].simple?.limit!==10||config.ratelimits[0].simple?.period!==60)throw Error('Unexpected rate limit');
}
export function validateEnvironment(env){
  for(const key of ['CLOUDFLARE_API_TOKEN','CLOUDFLARE_ACCOUNT_ID','OPENAI_API_KEY','CS_PASSWORD','OPENAI_MODEL'])if(!env[key])throw Error('Missing '+key);
  if(!/^[a-f0-9]{32}$/i.test(env.CLOUDFLARE_ACCOUNT_ID))throw Error('Invalid CLOUDFLARE_ACCOUNT_ID');
  if(env.CS_PASSWORD.length<24||env.CS_PASSWORD.length>256||/[\r\n]/.test(env.CS_PASSWORD))throw Error('CS_PASSWORD must be 24–256 characters without line breaks');
  if(!/^[a-zA-Z0-9._-]{1,100}$/.test(env.OPENAI_MODEL))throw Error('Invalid OPENAI_MODEL');
  if(env.CS_FREE_PLAN_CONFIRMED!=='true'||env.CS_API_BUDGET_CONFIRMED!=='true')throw Error('Confirm existing Free plan and existing API budget before deployment');
  if(env.GITHUB_REF!=='refs/heads/main'||env.GITHUB_REPOSITORY!=='gaeng1181-svg/order-cleaner')throw Error('Deployment is restricted to this repository main');
  if(env.ACTIONS_STEP_DEBUG==='true'||env.ACTIONS_RUNNER_DEBUG==='true')throw Error('Disable Actions debug logging before deployment');
}
async function cf(env,suffix){
  const res=await fetch('https://api.cloudflare.com/client/v4/accounts/'+env.CLOUDFLARE_ACCOUNT_ID+suffix,{headers:{Authorization:'Bearer '+env.CLOUDFLARE_API_TOKEN},signal:AbortSignal.timeout(20000)});
  if(res.status===404)return null;
  if(!res.ok)throw Error('Cloudflare authentication or scoped read failed (HTTP '+res.status+')');
  const data=await res.json();if(!data.success)throw Error('Cloudflare request rejected');return data.result;
}
async function wrangler(args,cwd,env){
  const clean={...process.env,CLOUDFLARE_API_TOKEN:env.CLOUDFLARE_API_TOKEN,CLOUDFLARE_ACCOUNT_ID:env.CLOUDFLARE_ACCOUNT_ID,CI:'true',WRANGLER_SEND_METRICS:'false',CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV:'false'};
  for(const k of ['OPENAI_API_KEY','CS_PASSWORD'])delete clean[k];
  // Capture, never log raw CLI output: it can contain bindings/account metadata.
  return new Promise((resolve,reject)=>{const child=spawn(path.join(root,'node_modules/.bin/wrangler'),args,{cwd,env:clean,stdio:['ignore','pipe','pipe']});let bytes=0;const timer=setTimeout(()=>child.kill('SIGTERM'),120000);for(const stream of [child.stdout,child.stderr])stream.on('data',data=>{bytes+=data.length;if(bytes>4_000_000)child.kill('SIGTERM');});child.on('error',()=>{clearTimeout(timer);reject(Error('Wrangler could not start'));});child.on('close',code=>{clearTimeout(timer);code===0?resolve():reject(Error('Wrangler failed; no raw CLI output retained'));});});
}
export async function deploy(env=process.env){
  validateEnvironment(env);
  const config=JSON.parse(await fs.readFile(path.join(root,'worker/wrangler.json'),'utf8'));validateConfig(config);
  // Read only this Worker and the account's workers.dev subdomain. Never list other projects.
  const current=await cf(env,'/workers/scripts/'+NAME+'/settings');
  const sub=await cf(env,'/workers/subdomain');
  if(!/^[a-z0-9-]+$/i.test(sub?.subdomain||''))throw Error('An existing workers.dev subdomain is required; configure it in normal Chrome');
  const endpoint='https://'+NAME+'.'+sub.subdomain+'.workers.dev/reply';
  const model=await fetch('https://api.openai.com/v1/models/'+env.OPENAI_MODEL,{headers:{Authorization:'Bearer '+env.OPENAI_API_KEY},signal:AbortSignal.timeout(20000)});
  if(!model.ok)throw Error('Configured model is not accessible in the existing API project (HTTP '+model.status+')');
  const scratch=await fs.mkdtemp(path.join(os.tmpdir(),'cs-deploy-'));await fs.chmod(scratch,0o700);
  try{
    const cwd=path.join(root,'worker');const base=['deploy','--config','wrangler.json','--name',NAME];
    if(!current){
      // First deployment has no model or secrets and must fail closed before activation.
      await wrangler(base,cwd,env);
      const closed=await fetch(endpoint,{method:'POST',headers:{Origin:ORIGIN,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(30000)});
      if(closed.status!==503)throw Error('New Worker did not fail closed with HTTP 503');
      console.log('PASS: live missing-configuration HTTP 503');
    }else console.log('Existing CS Worker detected; destructive secret-removal test skipped. Missing-config behavior is covered locally.');
    const secretsPath=path.join(scratch,'runtime.json');
    await fs.writeFile(secretsPath,JSON.stringify({OPENAI_API_KEY:env.OPENAI_API_KEY,CS_PASSWORD:env.CS_PASSWORD}),{mode:0o600});
    await wrangler([...base,'--var','OPENAI_MODEL:'+env.OPENAI_MODEL,'--secrets-file',secretsPath],cwd,env);
    const settings=await cf(env,'/workers/scripts/'+NAME+'/settings');
    const bindings=settings?.bindings||[];
    for(const key of ['OPENAI_API_KEY','CS_PASSWORD'])if(!bindings.some(b=>b.name===key&&b.type==='secret_text'))throw Error('Runtime secret registration missing: '+key);
    if(bindings.some(b=>['CLOUDFLARE_API_TOKEN','CLOUDFLARE_ACCOUNT_ID'].includes(b.name)))throw Error('Deployment credentials must not be runtime bindings');
    if(settings?.observability?.enabled===true)throw Error('Worker observability must remain disabled');
    if(env.GITHUB_OUTPUT)await fs.appendFile(env.GITHUB_OUTPUT,'endpoint='+endpoint+'\n');
    console.log('PASS: CS-only Worker deployed; both runtime secret names confirmed');
    return endpoint;
  }finally{await fs.rm(scratch,{recursive:true,force:true});}
}
if(process.argv[1]===fileURLToPath(import.meta.url))deploy().catch(e=>{console.error(e.message.startsWith('Missing ')?e.message:'CS deployment failed. Check required names, scoped permissions, model access and Free-plan confirmation; secret values and provider bodies are not logged.');process.exitCode=1;});
