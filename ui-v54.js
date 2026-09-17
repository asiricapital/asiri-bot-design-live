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
    bar.innerHTML=`
      <button type="button" class="researchModeBtn" data-rmode="quick">سريع<span>أقل زمن</span></button>
      <button type="button" class="researchModeBtn" data-rmode="deep">عميق<span>توازن</span></button>
      <button type="button" class="researchModeBtn" data-rmode="max">أقصى تغطية<span>الأشمل</span></button>
      <button type="button" class="researchModeBtn" data-rmode="live">مباشر<span>الأحدث أولًا</span></button>`;
    ask.insertAdjacentElement('beforebegin',bar);
    qsa('[data-rmode]',bar).forEach(b=>{
      b.classList.toggle('active',b.dataset.rmode===mode);
      b.onclick=()=>{mode=b.dataset.rmode;sessionStorage.setItem(MODE_KEY,mode);qsa('[data-rmode]',bar).forEach(x=>x.classList.toggle('active',x===b));updateModeBadge();};
    });
  }

  function updateModeBadge(){
    let badge=qs('#modeBadge');
    if(!badge){
      const live=qs('#asiriLiveBar');
      if(!live) return;
      badge=document.createElement('span');badge.id='modeBadge';badge.className='modeBadge';live.appendChild(badge);
    }
    badge.textContent=`البحث: ${modeLabel(mode)}`;
  }

  const nativeFetch=window.fetch.bind(window);
  window.fetch=async function(input,init={}){
    try{
      const url=typeof input==='string'?input:input?.url||'';
      if(/\/api\/deep-research(?:\?|$)/.test(url)&&String(init?.method||'GET').toUpperCase()==='POST'&&init.body){
        const body=JSON.parse(init.body); body.researchMode=mode; init={...init,body:JSON.stringify(body)};
      }
    }catch{}
    return nativeFetch(input,init);
  };

  function classifyX(d){
    const e=String(d?.x?.error||'').toLowerCase();
    if(!d?.x?.connected) return {kind:'bad',text:'X غير متصل'};
    if(/credit|deplet|quota|payment|usage/.test(e)) return {kind:'warn',text:'X متصل · الحصة/الرصيد غير متاح'};
    if(/401|unauthor|token|auth/.test(e)) return {kind:'bad',text:'X متصل · يحتاج إعادة تفويض'};
    if(/429|rate/.test(e)) return {kind:'warn',text:'X متصل · حد الطلبات مؤقتًا'};
    if(e) return {kind:'warn',text:'X متصل · المصدر متعثر'};
    return {kind:'ok',text:'X جاهز'};
  }

  function addBanner(d){
    qs('#systemBanner')?.remove();
    const target=qs('#meta')?.parentElement||qs('#result'); if(!target) return;
    const x=classifyX(d); const modelError=String(d?.modelError||'');
    if(x.kind==='ok'&&!modelError) return;
    const el=document.createElement('div');el.id='systemBanner';el.className=`systemBanner ${x.kind==='bad'?'bad':'warn'}`;
    let text=x.kind!=='ok'?`${x.text}. بقية المصادر والبحث العميق مستمران بشكل مستقل.`:'';
    if(modelError) text+=`${text?' ':''}AI متصل لكن التوليد تعثر في هذا التحقيق، لذلك تم استخدام Evidence Engine بدل اختلاق إجابة.`;
    el.textContent=text; target.insertAdjacentElement('afterend',el);
  }

  function coveragePanel(d){
    qs('#coveragePanel')?.remove();
    const meta=qs('#meta'); if(!meta) return;
    const c=d?.coverage||{};
    const read=Number(c.sourcesRead??(d.sourcesRead||[]).filter(x=>x.readStatus==='read').length||0);
    const strong=Number(c.strongClaims??(d.claims||[]).filter(x=>Number(x.independentSources||0)>=2&&Number(x.confidence||0)>=70).length||0);
    const panel=document.createElement('div');panel.id='coveragePanel';panel.className='coveragePanel';
    panel.innerHTML=`<div class="coverageTitle"><b>جودة التغطية</b><span>${esc(modeLabel(d.researchMode||c.mode||mode))}</span></div><div class="coverageStats">
      <div class="coverageStat"><b>${Number(c.passes||1)}</b><span>مسارات بحث</span></div>
      <div class="coverageStat"><b>${Number(d.results?.length||0)}</b><span>أدلة</span></div>
      <div class="coverageStat"><b>${Number(d.independence?.length||0)}</b><span>مصادر مستقلة</span></div>
      <div class="coverageStat"><b>${read}</b><span>مصادر مقروءة</span></div>
      <div class="coverageStat"><b>${strong}</b><span>ادعاءات قوية</span></div>
    </div>`;
    meta.parentElement?.appendChild(panel);
  }

  function updateLive(d){
    const x=classifyX(d); const liveX=qs('#liveX'), dot=qs('#liveXDot');
    if(liveX) liveX.textContent=x.text;
    if(dot) dot.className=`dot ${x.kind==='ok'?'ok':x.kind==='bad'?'bad':'warn'}`;
    const liveAI=qs('#liveAI'), aiDot=qs('#liveAIDot');
    const connected=!!sessionStorage.getItem('asiri_provider_key');
    if(liveAI) liveAI.textContent=d?.model?`AI: ${d.model}`:connected?(d?.modelError?'AI: متصل · تعثر':'AI: متصل'):'AI: Evidence';
    if(aiDot) aiDot.className=`dot ${d?.model?'ok':connected?'warn':'warn'}`;
    const src=qs('#liveSources');if(src)src.textContent=`الأدلة: ${Number(d.results?.length||0)} · مستقل ${Number(d.independence?.length||0)}`;
    updateModeBadge();
  }

  function decorateAnswer(d){
    const ans=qs('#answer'); if(!ans) return;
    ans.classList.toggle('aiUsed',!!d?.model);
    if(d?.x?.error){const err=qs('#error');if(err&&/credit|deplet|quota|payment|usage/i.test(d.x.error)){err.classList.add('quota');err.textContent='X متصل، لكن رصيد/حصة X API غير متاحة لهذا التحقيق. ASIRI أكمل البحث من بقية المصادر.';}}
  }

  function patchRender(){
    if(typeof window.render!=='function'||window.render.__v54) return false;
    const original=window.render;
    const wrapped=function(d){const out=original(d);try{coveragePanel(d);addBanner(d);updateLive(d);decorateAnswer(d);}catch{}return out;};
    wrapped.__v54=true;window.render=wrapped;return true;
  }

  function updateXPanelState(){
    const sub=qs('#xSub'); if(!sub) return;
    const feed=qs('#xFeed');
    const txt=feed?.textContent||'';
    if(/credit|deplet|quota/i.test(txt)){sub.textContent='الحساب متصل، لكن حصة X API منتهية حاليًا. بقية البحث تعمل.';sub.classList.add('warn');}
  }

  function init(){
    createModes();updateModeBadge();patchRender();setTimeout(patchRender,300);setTimeout(patchRender,1200);
    const observer=new MutationObserver(()=>updateXPanelState()); const feed=qs('#xFeed'); if(feed)observer.observe(feed,{childList:true,subtree:true,characterData:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
