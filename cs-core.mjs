export const STORAGE_KEY = 'orderCleaner.csTemplates.v1';
export const KINDS = ['머릿말', '꼬릿말', '일반', '안내'];
export function validateTemplate(t) {
  if (!t || typeof t.id !== 'string' || !t.id || typeof t.name !== 'string' || !t.name.trim() || t.name.length > 100 || !KINDS.includes(t.kind) || typeof t.content !== 'string' || !t.content.trim() || t.content.length > 6000) throw new Error('문구 이름(100자 이내), 구분, 내용(6,000자 이내)을 확인해주세요.');
  return {id:t.id,name:t.name.trim(),kind:t.kind,content:t.content.trim()};
}
export function readTemplates(storage) {
  const raw=storage.getItem(STORAGE_KEY);
  if(raw===null)return [];
  const data=JSON.parse(raw);
  if(!Array.isArray(data))throw new Error('저장된 문구를 읽을 수 없습니다. 원본은 보존됩니다.');
  const result=data.map(validateTemplate);
  if(new Set(result.map(t=>t.id)).size!==result.length)throw new Error('저장 문구 ID가 중복됩니다. 원본은 보존됩니다.');
  return result;
}
export function saveTemplates(storage,templates){storage.setItem(STORAGE_KEY,JSON.stringify(templates.map(validateTemplate)));}
export function searchTemplates(templates,query){const q=query.trim().toLowerCase();return templates.filter(t=>(t.name+' '+t.content).toLowerCase().includes(q));}
const topics=[['배송','출고','택배','도착'],['사이즈','크기','치수','단면'],['반품','환불','회수','수거'],['교환'],['재입고','입고','품절','재고'],['불량','고장','AS','오링'],['오배송','다른상품','잘못'],['포장','꼼꼼']];
export function rankTemplates(templates,question,note){
  const input=(question+' '+note).toLowerCase();
  const groups=topics.filter(g=>g.some(w=>input.includes(w.toLowerCase())));
  const tokens=input.match(/[가-힣a-z0-9]{2,}/g)||[];
  return templates.map(t=>{const hay=(t.name+' '+t.content).toLowerCase();let score=tokens.reduce((n,w)=>n+(hay.includes(w)?2:0),0);for(const g of groups)if(g.some(w=>hay.includes(w.toLowerCase())))score+=5;return {template:t,score};}).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,6).map(x=>x.template);
}
export function maskPII(text){return text.replace(/\b01[016789][- .]?\d{3,4}[- .]?\d{4}\b/g,'[전화번호]').replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[이메일]').replace(/\b\d{6}[- ]?[1-4]\d{6}\b/g,'[주민번호]').replace(/((?:주문|운송장|송장)\s*번호\s*[:：]?\s*)[A-Za-z0-9-]{6,}/g,'$1[번호]');}
export function makePayload(question,note,templates){
  if(!question.trim()&&!note.trim())throw new Error('고객 문의 또는 내부 전달내용을 입력해주세요.');
  if(question.length>6000||note.length>6000)throw new Error('입력은 각 6,000자 이내로 작성해주세요.');
  return {question:maskPII(question),note:maskPII(note),templates:rankTemplates(templates,question,note).map(t=>({...t,name:maskPII(t.name),content:maskPII(t.content)}))};
}
export function validateResult(data,templates){
  if(!data||typeof data.reply!=='string'||!data.reply.trim()||data.reply.length>10000||!Array.isArray(data.usedTemplateIds)||!Array.isArray(data.checks)||data.checks.some(x=>typeof x!=='string'||x.length>1000)||data.checks.length>20)throw new Error('추천답변 형식이 올바르지 않습니다. 다시 시도해주세요.');
  return {reply:data.reply,checks:data.checks,usedTemplateIds:data.usedTemplateIds.filter(id=>templates.some(t=>t.id===id))};
}
export async function requestReply(endpoint,password,payload,fetcher=fetch){
  const url=new URL(endpoint);if(url.protocol!=='https:')throw new Error('HTTPS AI 서버만 사용할 수 있습니다.');
  const res=await fetcher(url,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+password},body:JSON.stringify(payload),signal:AbortSignal.timeout(35000),cache:'no-store',credentials:'omit',redirect:'error'});
  if(!res.ok)throw new Error(res.status===401?'AI 연결 암호를 확인해주세요.':res.status===429?'요청이 많습니다. 잠시 후 다시 시도해주세요.':'AI 서버에 연결하지 못했습니다. 저장 문구는 계속 사용할 수 있습니다.');
  return validateResult(await res.json(),payload.templates);
}
