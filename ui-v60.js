(() => {
  if (window.__ASIRI_V60__) return;
  window.__ASIRI_V60__ = true;
  const qs=(s,r=document)=>r.querySelector(s), qsa=(s,r=document)=>[...r.querySelectorAll(s)];
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function collapseX(){
    const p=qs('.xpanel'); if(!p||qs('#xSignalToggle')) return;
    p.classList.add('v6XCollapsed');
    const btn=document.createElement('button'); btn.id='xSignalToggle'; btn.className='v6Toggle'; btn.type='button'; btn.textContent='عرض إشارات X المساعدة';
    p.insertAdjacentElement('beforebegin',btn);
    btn.onclick=()=>{p.classList.toggle('v6XCollapsed');btn.textContent=p.classList.contains('v6XCollapsed')?'عرض إشارات X المساعدة':'إخفاء إشارات X';};
  }

  function simplifyTechnicalPanels(){
    const claims=qs('#claims')?.closest('.panel');
    if(claims){claims.classList.add('v6Technical');const h=qs('h3',claims);if(h)h.textContent='تفاصيل الادعاءات المستخرجة';}
    const details=qs('details'); if(details) details.classList.add('v6Details');
  }

  function tierCounts(d){
    let official=0,news=0,special=0,x=0;
    for(const r of d?.results||[]){
      const h=`${r.source||''} ${r.provider||''} ${r.url||''}`.toLowerCase();
      if(r.fromX||r.provider==='X Timeline')x++;
      else if(r.official||/gov\.|gov\/|gov\.sa|sec\.gov|who\.int|un\.org|official|ministry|وزارة|هيئة/.test(h))official++;
      else if(/reuters|apnews|associated press|afp|bbc|bloomberg|financial times|aljazeera|alarabiya|العربية|الجزيرة/.test(h))news++;
      else special++;
    }
    x += Number(d?.x?.signals?.length||0);
    return {official,news,special,x};
  }

  function researchMap(d){
    qs('#v6ResearchMap')?.remove();
    const answer=qs('#answer'); if(!answer) return;
    const plan=d?.researchPlan||[];
    const c=tierCounts(d);
    const box=document.createElement('section'); box.id='v6ResearchMap'; box.className='v6ResearchMap';
    box.innerHTML=`
      <div class="v6MapHead"><div><b>ASIRI Research Orchestrator</b><span>Planner → Parallel Research → Verification → Publisher</span></div><strong>${esc(d?.researchMode||'max')}</strong></div>
      <div class="v6SourceGrid">
        <div><b>${c.official}</b><span>رسمي / أولي</span></div>
        <div><b>${c.news}</b><span>وكالات / صحافة</span></div>
        <div><b>${c.special}</b><span>ويب / تخصصي</span></div>
        <div class="xOnly"><b>${c.x}</b><span>X مساعد</span></div>
      </div>
      <div class="v6Plan">${plan.map((p,i)=>`<span><i>${i+1}</i>${esc(p.label||p.role||'مسار بحث')}</span>`).join('')}</div>
    `;
    answer.insertAdjacentElement('beforebegin',box);
  }

  function synthesisState(d){
    qs('#v6SynthesisState')?.remove();
    const answer=qs('#answer'); if(!answer)return;
    const el=document.createElement('div'); el.id='v6SynthesisState';
    if(d?.model){
      el.className='v6SynthesisState ok';
      el.innerHTML=`<b>✓ AI Synthesis + Challenge</b><span>تم تركيب الإجابة بواسطة ${esc(d.model)} ثم مراجعتها مقابل الأدلة.</span>`;
    }else{
      el.className='v6SynthesisState warn';
      el.innerHTML='<b>Evidence Engine</b><span>لم يُستخدم النموذج اللغوي في هذا التحقيق؛ النتيجة مبنية مباشرة على الأدلة المستخرجة.</span>';
    }
    answer.insertAdjacentElement('beforebegin',el);
  }

  function sourceFirstLabels(){
    const h=qs('#sources')?.closest('.panel')?.querySelector('h3'); if(h) h.textContent='المصادر الأساسية والأدلة';
    const ch=qs('#claims')?.closest('.panel')?.querySelector('h3'); if(ch) ch.textContent='سجل الادعاءات والأدلة';
    const domain=qs('#domainLabel'); if(domain) domain.textContent='GLOBAL DEEP RESEARCH';
  }

  function rewriteHero(){
    const eye=qs('.hero .eyebrow'); if(eye) eye.textContent='OFFICIAL + NEWS + WEB + RESEARCH + GITHUB · X SIGNALS';
    const p=qs('.hero p'); if(p) p.textContent='ASIRI يبدأ بالمصادر الرسمية والأولية، ثم الوكالات والمصادر المستقلة والويب والأبحاث. X يبقى طبقة اكتشاف مساعدة ولا يرفع الثقة وحده.';
    const mode=qs('.ask .mode'); if(mode) mode.textContent='Deep Research تلقائي · المصادر الأساسية أولًا · X مساعد فقط';
    const buttons=qsa('.quick [data-q]');
    const defs=[
      ['ما أهم الأخبار السياسية العالمية اليوم؟ استخدم وكالات الأنباء والمصادر الرسمية والمستقلة، وافصل المؤكد عن غير المؤكد.','السياسة اليوم'],
      ['ما آخر التطورات في اليمن؟ ابدأ بالمصادر الرسمية والوكالات والمصادر المستقلة، ثم استخدم X كإشارة مساعدة فقط.','اليمن الآن'],
      ['ما أهم تطورات التقنية والذكاء الاصطناعي اليوم؟ استخدم المصادر الرسمية والتقنية وGitHub والأبحاث.','تقنية وAI'],
      ['حلل $NVDA باستخدام إفصاحات الشركة وSEC والأخبار المستقلة وسياق السوق، واستخدم X كإشارة إضافية فقط.','تحليل سهم']
    ];
    buttons.slice(0,4).forEach((b,i)=>{if(defs[i]){b.dataset.q=defs[i][0];b.textContent=defs[i][1];}});
  }

  async function latestPolitics(){
    let box=qs('#v6Politics'); 
    if(!box){
      const anchor=qs('.quick')||qs('.ask');
      if(!anchor) return;
      box=document.createElement('section'); box.id='v6Politics'; box.className='v6Politics';
      box.innerHTML='<div class="v6PoliticsHead"><div><b>أحدث الأخبار السياسية</b><span>مباشر من وكالات ومصادر إخبارية · X ليس المصدر الأساسي</span></div><button type="button" id="v6PoliticsRefresh">تحديث</button></div><div class="v6PoliticsGrid" id="v6PoliticsGrid"><div class="v6PoliticsLoading">يتم جلب أحدث الأخبار...</div></div>';
      anchor.insertAdjacentElement('afterend',box);
      qs('#v6PoliticsRefresh').onclick=latestPolitics;
    }
    const grid=qs('#v6PoliticsGrid'); if(!grid)return;
    grid.innerHTML='<div class="v6PoliticsLoading">يتم تحديث الأخبار السياسية...</div>';
    try{
      const r=await fetch('/api/politics/latest',{cache:'no-store'});
      const d=await r.json();
      if(!r.ok) throw new Error(d.error||'تعذر التحديث');
      const rows=(d.results||[]).slice(0,8);
      grid.innerHTML=rows.length?rows.map(x=>{
        let when='';
        try{when=new Intl.DateTimeFormat('ar-SA',{dateStyle:'short',timeStyle:'short'}).format(new Date(x.publishedAt));}catch{}
        return '<a class="v6PoliticsCard" href="'+esc(x.url)+'" target="_blank" rel="noopener"><strong dir="auto">'+esc(x.title)+'</strong><span>'+esc(x.source||x.provider||'خبر')+(when?' · '+esc(when):'')+'</span><small>فتح المصدر ↗</small></a>';
      }).join(''):'<div class="v6PoliticsLoading">لم تظهر أخبار سياسية حديثة الآن.</div>';
    }catch(e){grid.innerHTML='<div class="v6PoliticsLoading bad">تعذر تحديث الأخبار الآن. اضغط «تحديث» للمحاولة مجددًا.</div>';}
  }

  function patch(){
    if(typeof window.render!=='function'||window.render.__v60)return false;
    const original=window.render;
    const wrapped=function(d){
      const out=original(d);
      try{researchMap(d);synthesisState(d);sourceFirstLabels();collapseX();simplifyTechnicalPanels();}catch{}
      return out;
    };
    wrapped.__v60=true; window.render=wrapped; return true;
  }
  function init(){rewriteHero();latestPolitics();collapseX();simplifyTechnicalPanels();sourceFirstLabels();patch();setTimeout(patch,250);setTimeout(patch,1100);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();