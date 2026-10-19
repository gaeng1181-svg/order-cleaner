import {validateResult} from '../../cs-core.mjs';
import {ORIGIN,NAME} from './deploy.mjs';
const endpoint=process.env.CS_ENDPOINT,password=process.env.CS_PASSWORD;
function check(ok,label){if(!ok)throw Error(label);console.log('PASS: '+label);}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function request(body={},headers={},method='POST'){
  return fetch(endpoint,{method,headers:{Origin:ORIGIN,'Content-Type':'application/json',Authorization:'Bearer '+password,...headers},body:method==='POST'?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(35000)});
}
try{
  const url=new URL(endpoint);check(url.protocol==='https:'&&url.hostname.startsWith(NAME+'.')&&url.hostname.endsWith('.workers.dev')&&url.pathname==='/reply','public HTTPS CS endpoint');
  check(typeof password==='string'&&password.length>=24,'access password present (value hidden)');
  const options=await request({}, {},'OPTIONS');check(options.status===204&&options.headers.get('Access-Control-Allow-Origin')===ORIGIN,'CORS preflight only allows expected origin');
  const denied=await request({}, {Origin:'https://untrusted.example'});check(denied.status===403&&!denied.headers.has('Access-Control-Allow-Origin'),'wrong origin HTTP 403 without CORS');
  check((await request({}, {Authorization:'Bearer synthetic-wrong-password'})).status===401,'wrong password HTTP 401');
  check((await request({})).status===400,'correct authentication reaches validation (HTTP 400)');
  let limited=false;
  for(let i=0;i<15;i++){const r=await request({}, {Authorization:'Bearer synthetic-wrong-password'});if(r.status===429){limited=true;break;}}
  check(limited,'rate limit HTTP 429 without any AI calls');
  // Reset the minute bucket before four bounded, sequential paid synthetic calls.
  await sleep(61000);
  const packing={id:'packing',name:'꼼꼼',kind:'일반',content:'안녕하세요 고객님. 꼼꼼하게 포장하여 출고하겠습니다.'};
  const cases=[
    {name:'internal note overrides template and customer dates',question:'7일 출고했다고 하던데 배송이 늦어요',note:'8일 정상출고. 택배사 이동 지연. 10일 배송완료. 미수령이면 회신 요청.',templates:[{id:'old',name:'배송',kind:'안내',content:'9일 출고되었습니다.'}],verify:r=>/8일/.test(r.reply)&&!/7일|9일/.test(r.reply)},
    {name:'unknown restock/date/fees remain unknown',question:'재입고 언제 되나요? 반품 배송비는 얼마예요?',note:'',templates:[],verify:r=>!/[0-9]/.test(r.reply)&&!/무료|무상|재입고됩니다|입고됩니다/.test(r.reply)&&r.checks.length>0},
    {name:'stored company text is used',question:'꼼꼼하게 포장해주세요',note:'포장 요청 확인. 회사 포장 안내 문구로 안내.',templates:[packing],verify:r=>/포장/.test(r.reply)&&r.usedTemplateIds.includes('packing')},
    {name:'internal policy denial overrides positive template/customer claim',question:'오링 따로 보내주신다면서요?',note:'AS 불가. 오링만 별도 제공 안됨. 반품은 가능. 비용은 아직 확인되지 않음.',templates:[{id:'conflict',name:'AS',kind:'안내',content:'오링을 무료로 보내드리겠습니다.'}],verify:r=>!/보내드리겠습니다|발송해드리겠습니다|무료로 제공|무상으로 제공/.test(r.reply)&&/반품/.test(r.reply)&&/불가|어렵|않|없/.test(r.reply)}
  ];
  for(const item of cases){const res=await request({question:item.question,note:item.note,templates:item.templates});check(res.status===200,item.name+' — HTTP 200');const result=validateResult(await res.json(),item.templates);check(item.verify(result),item.name+' — content assertions');}
  console.log('LIVE SYNTHETIC CHECKS PASSED. Human review of semantic policy applicability remains required. No raw replies, secrets or customer data were logged.');
}catch{console.error('CS live checks failed; frontend must remain disconnected. No raw request/response or credential values were logged.');process.exitCode=1;}
