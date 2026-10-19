import {KINDS,readTemplates,saveTemplates,searchTemplates,makePayload,rankTemplates,requestReply} from './cs-core.mjs';
const $=id=>document.getElementById(id),status=$('csStatus');
let templates=[],editing=null,storageReady=true,version=0,busy=false;
const say=message=>{status.textContent=message;};
try{templates=readTemplates(localStorage);}catch{storageReady=false;say('저장된 문구를 읽을 수 없습니다. 기존 저장값은 보존했습니다. 브라우저 저장소 설정을 확인해주세요.');}
function persist(next){try{saveTemplates(localStorage,next);templates=next;render();return true;}catch{say('문구를 저장하지 못했습니다. 저장소 용량과 브라우저 설정을 확인해주세요.');return false;}}
async function copy(text){try{await navigator.clipboard.writeText(text);say('답변을 복사했습니다.');}catch{say('복사 권한을 확인해주세요. 문구를 선택해 직접 복사하실 수 있습니다.');}}
function button(label,handler){const b=document.createElement('button');b.type='button';b.className='secondary-button';b.textContent=label;b.addEventListener('click',handler);return b;}
function render(){
  const list=$('csTemplates');list.replaceChildren();
  const found=searchTemplates(templates,$('csSearch').value);$('csCount').textContent=templates.length+'개';
  if(!found.length){const p=document.createElement('p');p.className='help';p.textContent=templates.length?'검색 결과가 없습니다.':'회사에서 사용하는 문구를 추가해주세요.';list.append(p);}
  for(const t of found){const card=document.createElement('article');card.className='cs-template';const title=document.createElement('strong');title.textContent=t.name+' · '+t.kind;const body=document.createElement('p');body.textContent=t.content;
    const actions=document.createElement('div');actions.className='toolbar';actions.append(button('복사',()=>copy(t.content)),button('수정',()=>{editing=t.id;$('csName').value=t.name;$('csKind').value=t.kind;$('csContent').value=t.content;$('csSave').textContent='수정 저장';$('csName').focus();}),button('삭제',()=>{if(confirm('이 문구를 삭제하시겠습니까?')&&persist(templates.filter(x=>x.id!==t.id))){if(editing===t.id)resetForm();say('문구를 삭제했습니다.');}}));card.append(title,body,actions);list.append(card);
  }
  updateMatches();
}
function resetForm(){editing=null;$('csTemplateForm').reset();$('csSave').textContent='문구 저장';}
function updateMatches(){const names=rankTemplates(templates,$('csQuestion').value,$('csNote').value).map(t=>t.name);$('csMatches').textContent=names.length?'관련 저장 문구: '+names.join(', '):'관련 저장 문구가 없습니다.';}
function clearResult(){$('csReply').value='';$('csCopy').disabled=true;$('csReferences').textContent='';$('csChecks').textContent='';}
for(const id of ['csQuestion','csNote'])$(id).addEventListener('input',()=>{version++;clearResult();updateMatches();});
$('csSearch').addEventListener('input',render);
$('csTemplateForm').addEventListener('submit',e=>{e.preventDefault();if(!storageReady)return;const t={id:editing||crypto.randomUUID(),name:$('csName').value.trim(),kind:$('csKind').value,content:$('csContent').value.trim()};if(!t.name||!t.content)return;const next=editing?templates.map(x=>x.id===editing?t:x):[...templates,t];if(persist(next)){resetForm();say('문구를 저장했습니다.');}});
$('csCancel').addEventListener('click',resetForm);
$('csReply').addEventListener('input',()=>{$('csCopy').disabled=!$('csReply').value.trim();});
$('csCopy').addEventListener('click',()=>{if($('csReply').value.trim())copy($('csReply').value);});
$('csClear').addEventListener('click',()=>{version++;$('csQuestion').value='';$('csNote').value='';$('csPassword').value='';clearResult();updateMatches();say('현재 문의와 답변을 지웠습니다.');});
const endpoint=window.ORDER_CLEANER_CS_ENDPOINT;
$('csConnection').textContent=endpoint?'AI 연결 준비됨 · 전송 전 개인정보를 확인해주세요.':'AI 서버 연결 전입니다. 저장 문구 등록·검색·복사는 바로 사용할 수 있습니다.';
$('csPasswordRow').hidden=!endpoint;
$('csGenerate').disabled=!endpoint;
$('csGenerate').addEventListener('click',async()=>{
  if(busy)return;let payload;try{payload=makePayload($('csQuestion').value,$('csNote').value,templates);}catch(e){say(e.message);return;}
  if(!$('csPassword').value){say('AI 연결 암호를 입력해주세요. 암호는 저장되지 않습니다.');return;}
  const current=version;busy=true;$('csGenerate').disabled=true;clearResult();say('추천 답변을 만들고 있습니다.');
  try{const result=await requestReply(endpoint,$('csPassword').value,payload);if(current!==version)return;$('csReply').value=result.reply;$('csCopy').disabled=false;$('csReferences').textContent='참고한 CS 문구: '+(result.usedTemplateIds.map(id=>payload.templates.find(t=>t.id===id).name).join(', ')||'없음');$('csChecks').textContent=result.checks.length?'확인 필요한 사항\n'+result.checks.map(x=>'• '+x).join('\n'):'';say('추천 답변을 만들었습니다. 사실관계를 확인한 뒤 복사해주세요.');}catch(e){if(current===version)say(e.name==='TimeoutError'?'응답 시간이 초과됐습니다. 다시 시도해주세요.':e.message);}finally{busy=false;$('csGenerate').disabled=!endpoint;}
});
$('csSave').disabled=!storageReady;render();
