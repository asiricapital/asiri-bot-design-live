(() => {
  if (window.__ASIRI_V53__) return;
  window.__ASIRI_V53__ = true;

  const qs = (s, root = document) => root.querySelector(s);
  const qsa = (s, root = document) => [...root.querySelectorAll(s)];
  const escapeHtml = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmtDate = (v) => { try { return new Intl.DateTimeFormat('ar-SA',{dateStyle:'short',timeStyle:'short'}).format(new Date(v)); } catch { return ''; } };
  const RECENT_KEY = 'asiri_recent_investigations_v53';
  let xPosts = [];
  let xTab = 'top';
  let lastResult = null;

  function readRecent() {
    try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]').filter(Boolean).slice(0, 10); } catch { return []; }
  }
  function writeRecent(items) { localStorage.setItem(RECENT_KEY, JSON.stringify(items.slice(0, 10))); }
  function saveRecent(question, result) {
    if (!question || !result) return;
    const old = readRecent().filter((x) => x.question !== question);
    old.unshift({
      question,
      at: Date.now(),
      confidence: Number(result.confidence || 0),
      evidence: Number(result.results?.length || 0),
      independent: Number(result.independence?.length || 0),
      xUsed: Number(result.x?.used || 0),
      summary: String(result.answer || '').replace(/[#*\[\]]/g,'').replace(/\s+/g,' ').trim().slice(0,180),
    });
    writeRecent(old);
    renderRecent();
  }

  function createLiveBar() {
    if (qs('#asiriLiveBar')) return;
    const header = qs('.header');
    if (!header) return;
    const el = document.createElement('div');
    el.className = 'livebar'; el.id = 'asiriLiveBar';
    el.innerHTML = `
      <span class="liveitem"><i class="dot" id="liveXDot"></i><b id="liveX">X: فحص...</b></span>
      <span class="liveitem"><i class="dot" id="liveAIDot"></i><b id="liveAI">AI: ${sessionStorage.getItem('asiri_provider_key') ? 'متصل' : 'غير متصل'}</b></span>
      <span class="liveitem"><i class="dot ok"></i><b id="liveSources">المصادر: جاهزة</b></span>
      <span class="liveitem"><i class="dot ok"></i><b id="liveUpdated">آخر تحديث: الآن</b></span>`;
    header.insertAdjacentElement('afterend', el);
    const aiDot = qs('#liveAIDot'); if (aiDot) aiDot.classList.add(sessionStorage.getItem('asiri_provider_key') ? 'ok' : 'warn');
  }

  async function refreshLiveStatus() {
    const liveX = qs('#liveX'), dot = qs('#liveXDot');
    try {
      const r = await fetch('/api/x/status', {cache:'no-store'}); const d = await r.json();
      if (liveX) liveX.textContent = d.connected ? `X: @${d.user?.username || 'متصل'}` : 'X: غير متصل';
      if (dot) { dot.className = `dot ${d.connected ? 'ok' : 'warn'}`; }
    } catch {
      if (liveX) liveX.textContent = 'X: غير متاح'; if (dot) dot.className = 'dot bad';
    }
    const ai = !!sessionStorage.getItem('asiri_provider_key');
    const liveAI = qs('#liveAI'), aiDot = qs('#liveAIDot');
    if (liveAI) liveAI.textContent = ai ? 'AI: متصل' : 'AI: Evidence';
    if (aiDot) aiDot.className = `dot ${ai ? 'ok' : 'warn'}`;
    const u = qs('#liveUpdated'); if (u) u.textContent = `آخر تحديث: ${new Intl.DateTimeFormat('ar-SA',{hour:'2-digit',minute:'2-digit'}).format(new Date())}`;
  }

  function createRecentPanel() {
    if (qs('#recentPanel')) return;
    const quick = qs('.quick'); if (!quick) return;
    const panel = document.createElement('section');
    panel.className = 'recentPanel'; panel.id = 'recentPanel';
    panel.innerHTML = `<div class="recentHead"><strong>التحقيقات الأخيرة</strong><span>فتح أو تحديث سريع</span></div><div class="recentList" id="recentList"></div>`;
    quick.insertAdjacentElement('afterend', panel);
    renderRecent();
  }
  function renderRecent() {
    const list = qs('#recentList'); if (!list) return;
    const rows = readRecent();
    if (!rows.length) { list.innerHTML = '<div class="empty">ستظهر هنا آخر تحقيقاتك بعد أول بحث.</div>'; return; }
    list.innerHTML = rows.slice(0,8).map((x,i) => `<div class="recentCard"><b>${escapeHtml(x.question)}</b><small>${escapeHtml(fmtDate(x.at))} · ثقة ${x.confidence}/100 · ${x.evidence} دليل</small><div class="recentActions"><button class="miniBtn" data-open-recent="${i}">فتح</button><button class="miniBtn primaryMini" data-refresh-recent="${i}">ما الجديد؟</button></div></div>`).join('');
    qsa('[data-open-recent]').forEach((b) => b.onclick = () => loadRecent(Number(b.dataset.openRecent), false));
    qsa('[data-refresh-recent]').forEach((b) => b.onclick = () => loadRecent(Number(b.dataset.refreshRecent), true));
  }
  function loadRecent(index, run) {
    const row = readRecent()[index]; if (!row) return;
    const ta = qs('#question'); if (!ta) return;
    ta.value = run ? `${row.question}\n\nما الجديد منذ آخر تحقيق؟ ركز فقط على التطورات الجديدة واذكر ما تغير.` : row.question;
    qs('.ask')?.scrollIntoView({behavior:'smooth',block:'center'});
    ta.focus();
    if (run) setTimeout(() => qs('#form')?.requestSubmit(), 420);
  }

  function createXTabs() {
    const panel = qs('.xpanel'); const feed = qs('#xFeed'); if (!panel || !feed || qs('#xTabs')) return;
    const tabs = document.createElement('div'); tabs.className='xtabs'; tabs.id='xTabs';
    tabs.innerHTML = `<button class="xtab active" data-xtab="top">الأهم</button><button class="xtab" data-xtab="latest">الأحدث</button><button class="xtab" data-xtab="trusted">موثوق</button><button class="xtab" data-xtab="unconfirmed">غير مؤكد</button>`;
    feed.insertAdjacentElement('beforebegin', tabs);
    qsa('[data-xtab]', tabs).forEach((b) => b.onclick = () => {
      xTab = b.dataset.xtab; qsa('[data-xtab]',tabs).forEach(x => x.classList.toggle('active', x===b)); renderXPosts();
    });
  }
  function engagement(p) { const m=p.metrics||{}; return Number(m.like_count||0)+Number(m.retweet_count||0)*2+Number(m.reply_count||0)+Number(m.quote_count||0)*2; }
  function sortXPosts(posts) {
    const rows=[...posts];
    if (xTab==='latest') return rows.sort((a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0));
    if (xTab==='trusted') return rows.filter(p=>p.author?.verified).sort((a,b)=>engagement(b)-engagement(a));
    if (xTab==='unconfirmed') return rows.filter(p=>!p.author?.verified).sort((a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0));
    return rows.sort((a,b)=>{const ar=(Date.now()-new Date(a.createdAt||0))/36e5, br=(Date.now()-new Date(b.createdAt||0))/36e5; const as=engagement(a)+Math.max(0,100-ar*4)+(a.author?.verified?80:0); const bs=engagement(b)+Math.max(0,100-br*4)+(b.author?.verified?80:0); return bs-as;});
  }
  function renderXPosts() {
    const feed=qs('#xFeed'); if(!feed) return;
    const rows=sortXPosts(xPosts).slice(0,12);
    if(!rows.length){ feed.innerHTML=`<div class="empty">${xTab==='trusted'?'لا توجد منشورات موثقة ضمن الدفعة الحالية.':'لا توجد منشورات في هذا التصنيف.'}</div>`; return; }
    feed.innerHTML=rows.map(p=>{const m=p.metrics||{}, user=p.author?.username||'x', name=p.author?.name||'', verified=!!p.author?.verified; const links=(p.links||[]).map(u=>`<div class="postlinks">${escapeHtml(u)}</div>`).join(''); const ini=(user.replace('@','').slice(0,2)||'X').toUpperCase(); return `<a class="xpost ${verified?'x-verified':'x-muted'}" href="${escapeHtml(p.url)}" target="_blank"><div class="posthead"><div class="postwho"><span class="avatar">${escapeHtml(ini)}</span><span class="who"><strong>@${escapeHtml(user)}${verified?'<i class="verifiedMark">✓</i>':''}</strong><span>${escapeHtml(name)}</span></span></div><span class="postdate">${escapeHtml(fmtDate(p.createdAt))}</span></div><p>${escapeHtml(p.text)}</p>${links}<div class="metrics"><span class="metric">♡ ${Number(m.like_count||0)}</span><span class="metric">↻ ${Number(m.retweet_count||0)}</span><span class="metric">◌ ${Number(m.reply_count||0)}</span></div></a>`}).join('');
  }
  async function enhancedXFeed() {
    const feed=qs('#xFeed'); if(feed) feed.innerHTML='<div class="empty">يتم جلب أحدث منشورات X...</div>';
    try { const r=await fetch('/api/x/feed?limit=60',{cache:'no-store'}), d=await r.json(); if(!r.ok) throw new Error(d.error||'تعذر X'); xPosts=d.posts||[]; renderXPosts(); refreshLiveStatus(); }
    catch(e){ if(feed) feed.innerHTML=`<div class="empty">${escapeHtml(e.message)}</div>`; }
  }

  function createStickySearch() {
    if(qs('#stickySearch')) return;
    const el=document.createElement('div'); el.id='stickySearch'; el.className='stickySearch';
    el.innerHTML='<button class="stickyAlt" id="stickyNew">سؤال جديد</button><button class="stickyMain" id="stickyRun">ابدأ التحقيق</button>';
    document.body.appendChild(el);
    qs('#stickyNew').onclick=()=>{const ta=qs('#question'); if(ta){ta.value=''; qs('.ask')?.scrollIntoView({behavior:'smooth',block:'center'}); setTimeout(()=>ta.focus(),350);}};
    qs('#stickyRun').onclick=()=>{const ta=qs('#question'); if(!ta) return; if(ta.value.trim().length<2){qs('.ask')?.scrollIntoView({behavior:'smooth',block:'center'}); setTimeout(()=>ta.focus(),350); return;} qs('#form')?.requestSubmit();};
  }

  function updateTrust(result) {
    if(!result) return;
    const answer=qs('#answer'); if(!answer) return;
    qs('#trustRow')?.remove(); qs('#trustPanel')?.remove();
    const row=document.createElement('div'); row.id='trustRow'; row.className='trustRow';
    row.innerHTML='<button class="trustBtn" id="trustBtn">لماذا أثق بهذه النتيجة؟</button><button class="trustBtn" id="refreshInvestigation">ما الجديد منذ الآن؟</button>';
    answer.insertAdjacentElement('afterend',row);
    const panel=document.createElement('div'); panel.id='trustPanel'; panel.className='trustPanel';
    const contradictions=Number(result.contradictions?.length||0), gaps=Number(result.gaps?.length||0), official=(result.results||[]).filter(x=>x.readStatus==='read'||/official|gov|reuters|ap/i.test(`${x.source||''} ${x.provider||''}`)).length;
    panel.innerHTML=`<div class="trustGrid"><div class="trustStat"><b>${Number(result.confidence||0)}/100</b><span>الثقة</span></div><div class="trustStat"><b>${Number(result.independence?.length||0)}</b><span>مصادر مستقلة</span></div><div class="trustStat"><b>${official}</b><span>مصادر قوية/مقروءة</span></div><div class="trustStat"><b>${contradictions}</b><span>تعارضات مكتشفة</span></div></div><div class="trustNote">ASIRI يرفع الثقة عندما تتفق مصادر مستقلة، ويخفضها عند وجود تعارضات أو فجوات. فجوات الدليل الحالية: ${gaps}. إشارات X المستخدمة: ${Number(result.x?.used||0)}.</div>`;
    row.insertAdjacentElement('afterend',panel);
    qs('#trustBtn').onclick=()=>panel.classList.toggle('show');
    qs('#refreshInvestigation').onclick=()=>{const ta=qs('#question'); if(!ta) return; ta.value=`${result.question||ta.value}\n\nما الجديد منذ هذا التحقيق؟ اعرض فقط التطورات الجديدة وما الذي تغير في درجة الثقة.`; qs('.ask')?.scrollIntoView({behavior:'smooth',block:'center'}); setTimeout(()=>qs('#form')?.requestSubmit(),420);};
  }

  function updateAfterResult(d) {
    lastResult=d; updateTrust(d);
    const sources=qs('#liveSources'); if(sources) sources.textContent=`الأدلة: ${Number(d.results?.length||0)} · مستقل ${Number(d.independence?.length||0)}`;
    const u=qs('#liveUpdated'); if(u) u.textContent='آخر تحديث: الآن';
    document.querySelector('.hero')?.classList.add('compact');
  }

  function wireExistingFunctions() {
    if(typeof window.render==='function' && !window.render.__v53){const original=window.render; const wrapped=function(d){const out=original(d); updateAfterResult(d); return out;}; wrapped.__v53=true; window.render=wrapped;}
    const form=qs('#form');
    if(form?.onsubmit && !form.onsubmit.__v53){const originalSubmit=form.onsubmit; const wrapped=async function(e){const q=qs('#question')?.value.trim()||''; const out=await originalSubmit.call(this,e); if(lastResult&&q) saveRecent(q,lastResult); return out;}; wrapped.__v53=true; form.onsubmit=wrapped;}
    const refresh=qs('#xRefresh'); if(refresh) refresh.onclick=enhancedXFeed;
    const aiConnect=qs('#aiConnect'); if(aiConnect){const old=aiConnect.onclick; aiConnect.addEventListener('click',()=>setTimeout(refreshLiveStatus,1500));}
    const aiDisconnect=qs('#aiDisconnect'); if(aiDisconnect) aiDisconnect.addEventListener('click',()=>setTimeout(refreshLiveStatus,100));
  }

  function compactOnScroll(){const hero=qs('.hero');if(!hero)return; const recent=readRecent().length>0; hero.classList.toggle('compact',recent||window.scrollY>190);}

  createLiveBar();
  createRecentPanel();
  createXTabs();
  createStickySearch();
  wireExistingFunctions();
  refreshLiveStatus();
  setTimeout(enhancedXFeed, 250);
  compactOnScroll();
  window.addEventListener('scroll',compactOnScroll,{passive:true});
  setInterval(refreshLiveStatus,60000);
})();
