(() => {
  if (window.__ASIRI_V54__) return;
  window.__ASIRI_V54__ = true;
  const qs=(s,r=document)=>r.querySelector(s), qsa=(s,r=document)=>[...r.querySelectorAll(s)];
  const esc=(v)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const MODE_KEY='asiri_research_mode_v54';
  let mode=sessionStorage.getItem(MODE_KEY)||'max';

  function modeLabel(v){return v==='quick'?'Quick':v==='deep'?'Deep':v==='live'?'Live':'Max Coverage';}
  function createModes(){
    if(qs('#researchModeBar')) return;
    const ask=qs('.ask'); if(!ask) return;
    const bar=document.createElement('div'); bar.id='researchModeBar'; bar.className='researchModeBar';
    bar.innerHTML=`<button type="button" class="researchModeBtn" data-rmode="quick">سريع<span>أقل زمن</span></button><button type="button" class="researchModeBtn" data-rmode="deep">عميق<span>توازن</span></button><button type="button" class="researchModeBtn" data-rmode="max">أقصى تغطية<span>الأشمل</span></button><button type="button" class="researchModeBtn" data-rmode="live">مباشر<span>الأحدث أولًا</span></button>`;
    ask.insertAdjacentElement('beforebegin',bar);
    qsa('[data-rmode]',bar).forEach(b=>{b.classList.toggle('active',b.dataset.rmode===mode);b.onclick=()=>{mode=b.dataset.rmode;sessionStorage.setItem(MODE_KEY,mode);qsa('[data-rmode]',bar).forEach(x=>x.classList.toggle('active',x===b));updateModeBadge();};});
  }
  function updateModeBadge(){let badge=qs('#modeBadge');if(!badge){const live=qs('#asiriLiveBar');if(!live)return;badge=document.createElement('span');badge.id='modeBadge';badge.className='modeBadge';live.appendChild(badge);}badge.textContent=`البحث: ${modeLabel(mode)}`;}
  const nativeFetch=window.fetch.bind(window);
  window.fetch=async function(input,init={}){try{const url=typeof input==='string'?input:input?.url||'';if(/\/api\/deep-research(?:\?|$)/.test(url)&&String(init?.method||'GET').toUpperCase()==='POST'&&init.body){const body=JSON.parse(init.body);body.researchMode=mode;init={...init,body:JSON.stringify(body)};}}catch{}return nativeFetch(input,init);};

  function classifyX(d){const e=String(d?.x?.error||'').toLowerCase();if(!d?.x?.connected)return{kind:'muted',text:'X: غير متصل'};if(/credit|deplet|quota|payment|usage/.test(e))return{kind:'warn',text:'X: إشارة متوقفة مؤقتًا'};if(/401|unauthor|token|auth/.test(e))return{kind:'warn',text:'X: يحتاج إعادة تفويض'};if(/429|rate/.test(e))return{kind:'warn',text:'X: حد مؤقت'};if(e)return{kind:'warn',text:'X: متعثر'};return{kind:'ok',text:'X: مساعد'};}

  function reframeXPanel(){const p=qs('.xpanel');if(!p||p.dataset.reframed)return;p.dataset.reframed='1';p.classList.add('xSignalPanel');const strong=qs('.xtitle strong',p);const sub=qs('#xSub',p)||qs('.xtitle small',p);if(strong)strong.textContent='إشارات X المساعدة';if(sub)sub.textContent='طبقة اكتشاف إضافية فقط. الأخبار والمصادر الرسمية والمستقلة هي أساس التحقيق، ولا يرفع X الثقة وحده.';const mark=qs('.xmark',p);if(mark)mark.title='X signal only';}

  function createSourcePriority(){if(qs('#sourcePriority'))return;const ask=qs('.ask');if(!ask)return;const box=document.createElement('section');box.id='sourcePriority';box.className='sourcePriority';box.innerHTML=`<div class="sourcePriorityHead"><b>محرك المصادر العالمي</b><span>الأساس أولًا · X مساعد فقط</span></div><div class="sourcePriorityFlow"><span class="tier tier1">1 · رسمي / أولي</span><span class="tier tier2">2 · وكالات وأخبار مستقلة</span><span class="tier tier3">3 · ويب / تخصصي / أبحاث</span><span class="tier tier4">4 · X إشارات اكتشاف</span></div>`;ask.insertAdjacentElement('afterend',box);}

  function addBanner(d){qs('#systemBanner')?.remove();const target=qs('#meta')?.parentElement||qs('#result');if(!target)return;const x=classifyX(d),modelError=String(d?.modelError||'');if((x.kind==='ok'||x.kind==='muted')&&!modelError)return;const el=document.createElement('div');el.id='systemBanner';el.className='systemBanner warn';let text=x.kind==='warn'?`${x.text}. هذا لا يوقف التحقيق؛ المصادر الرسمية والأخبار والويب تعمل بشكل مستقل.`:'';if(modelError)text+=`${text?' ':''}AI تعثر في التركيب، لذلك استمر Evidence Engine دون اختلاق معلومات.`;el.textContent=text;target.insertAdjacentElement('afterend',el);}

  function sourceMix(d){const rows=d?.results||[];let x=0,official=0,news=0,other=0;for(const r of rows){if(r.fromX||r.provider==='X Timeline')x++;else if(r.official||/gov|official|ministry|وزارة|هيئة/i.test(`${r.source||''} ${r.provider||''}`))official++;else if(/news|reuters|associated press|\bap\b|bbc|cnn|bloomberg|arabia|جزيرة|عربية/i.test(`${r.source||''} ${r.provider||''}`))news++;else other++;}return{official,news,other,x,nonX:rows.length-x};}
  function coveragePanel(d){qs('#coveragePanel')?.remove();const meta=qs('#meta');if(!meta)return;const c=d?.coverage||{},mix=sourceMix(d);const read=Number(c.sourcesRead??(d.sourcesRead||[]).filter(x=>x.readStatus==='read').length||0);const strong=Number(c.strongClaims??(d.claims||[]).filter(x=>Number(x.independentSources||0)>=2&&Number(x.confidence||0)>=70).length||0);const panel=document.createElement('div');panel.id='coveragePanel';panel.className='coveragePanel';panel.innerHTML=`<div class="coverageTitle"><b>جودة التغطية العالمية</b><span>${esc(modeLabel(d.researchMode||c.mode||mode))}</span></div><div class="coverageStats"><div class="coverageStat"><b>${mix.nonX}</b><span>أدلة خارج X</span></div><div class="coverageStat"><b>${Number(d.independence?.length||0)}</b><span>مصادر مستقلة</span></div><div class="coverageStat"><b>${read}</b><span>مصادر مقروءة</span></div><div class="coverageStat"><b>${strong}</b><span>ادعاءات قوية</span></div><div class="coverageStat xAssist"><b>${mix.x}</b><span>إشارات X مساعدة</span></div></div>`;meta.parentElement?.appendChild(panel);}

  function updateLive(d){const x=classifyX(d),liveX=qs('#liveX'),dot=qs('#liveXDot');if(liveX)liveX.textContent=x.text;if(dot)dot.className=`dot ${x.kind==='ok'?'ok':x.kind==='warn'?'warn':'muted'}`;const liveAI=qs('#liveAI'),aiDot=qs('#liveAIDot'),connected=!!sessionStorage.getItem('asiri_provider_key');if(liveAI)liveAI.textContent=d?.model?`AI: ${d.model}`:connected?(d?.modelError?'AI: متصل · تعثر':'AI: متصل'):'AI: Evidence';if(aiDot)aiDot.className=`dot ${d?.model?'ok':'warn'}`;const src=qs('#liveSources'),mix=sourceMix(d);if(src)src.textContent=`المصادر: ${mix.nonX} أساسية · X ${mix.x} مساعد`;updateModeBadge();}
  function decorateAnswer(d){const ans=qs('#answer');if(!ans)return;ans.classList.toggle('aiUsed',!!d?.model);const err=qs('#error');if(err&&d?.x?.error){err.classList.add('quota');err.textContent='تعذر استخدام إشارات X في هذا التحقيق. لم يتوقف البحث: ASIRI اعتمد على المصادر الرسمية والأخبار والويب والمصادر المستقلة.';}}
  function patchRender(){if(typeof window.render!=='function'||window.render.__v54)return false;const original=window.render;const wrapped=function(d){const out=original(d);try{coveragePanel(d);addBanner(d);updateLive(d);decorateAnswer(d);reframeXPanel();}catch{}return out;};wrapped.__v54=true;window.render=wrapped;return true;}
  function updateXPanelState(){reframeXPanel();const sub=qs('#xSub');if(!sub)return;const txt=qs('#xFeed')?.textContent||'';if(/credit|deplet|quota/i.test(txt)){sub.textContent='إشارات X غير متاحة مؤقتًا. التحقيق الأساسي لا يعتمد عليها ويستمر من المصادر الأخرى.';sub.classList.add('warn');}}
  function init(){createModes();createSourcePriority();reframeXPanel();updateModeBadge();patchRender();setTimeout(patchRender,300);setTimeout(patchRender,1200);const observer=new MutationObserver(()=>updateXPanelState());const feed=qs('#xFeed');if(feed)observer.observe(feed,{childList:true,subtree:true,characterData:true});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
