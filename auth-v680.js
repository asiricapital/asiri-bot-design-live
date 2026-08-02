(function () {
  const state = { client: null, session: null, waitResolve: null, initialized: false };
  const $ = (selector) => document.querySelector(selector);
  const VERSION = '6.8.1';
  const CACHE_VERSION = '6810';
  const PENDING_RECOVERY_KEY = 'asiri_pending_recovery_from_user_id';

  function safe(text) {
    return String(text ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
  }

  function anonymous(user) {
    return user?.is_anonymous === true || !user?.email;
  }

  function ensureUi() {
    if ($('#asiriAuthGateV680')) return;
    document.body.insertAdjacentHTML('afterbegin', `
      <div id="asiriIdentityBarV680" class="asiri-idbar-v680 hidden">
        <div><b id="asiriIdentityTitleV680">الحساب</b><small id="asiriIdentitySubV680">—</small></div>
        <button id="asiriOpenAccountV680" type="button">إدارة الحساب</button>
      </div>
      <div id="asiriAuthGateV680" class="asiri-auth-gate-v680 hidden" role="dialog" aria-modal="true">
        <section class="asiri-auth-card-v680">
          <span class="eyebrow">ASIRI CAPITAL v${VERSION}</span>
          <h2>دخول آمن وثابت</h2>
          <p>استخدم بريدك لاستعادة نفس الحساب من أي جهاز وعدم فقدان المحفظة مرة أخرى.</p>
          <label>البريد الإلكتروني<input id="asiriLoginEmailV680" type="email" inputmode="email" autocomplete="email" placeholder="name@example.com"></label>
          <button id="asiriSendLoginV680" type="button">إرسال رابط الدخول الآمن</button>
          <button id="asiriTemporaryLoginV680" class="secondary" type="button">دخول مؤقت لهذا الجهاز</button>
          <p id="asiriLoginStatusV680" class="status"></p>
        </section>
      </div>
      <div id="asiriAccountPanelV680" class="asiri-account-panel-v680 hidden" role="dialog" aria-modal="true">
        <section class="asiri-account-card-v680">
          <button id="asiriCloseAccountV680" class="asiri-close-v680" type="button">×</button>
          <span class="eyebrow">ACCOUNT RECOVERY & STABLE AUTH · v${VERSION}</span>
          <h2>إدارة حساب Asiri Capital</h2>
          <div id="asiriAccountIdentityV680" class="asiri-account-identity-v680"></div>
          <div id="asiriLinkBoxV680" class="asiri-link-box-v680 hidden">
            <h3>ثبّت الحساب الحالي</h3>
            <p>اربط بريدًا جديدًا بنفس معرّف المستخدم الحالي، أو ادخل إلى الحساب الموجود إذا كان البريد مسجلًا مسبقًا.</p>
            <label>البريد الإلكتروني<input id="asiriLinkEmailV680" type="email" inputmode="email" autocomplete="email" placeholder="name@example.com"></label>
            <button id="asiriLinkEmailButtonV680" type="button">ربط بريد جديد بهذا الحساب</button>
            <button id="asiriExistingLoginButtonV681" class="secondary" type="button">البريد مسجل مسبقًا — تسجيل الدخول للحساب الموجود</button>
          </div>
          <div id="asiriRecoveryBoxV680" class="asiri-recovery-box-v680 hidden">
            <h3>استعادة الحساب القديم</h3>
            <p>بعد الدخول بالحساب الثابت، يمكن تجهيز استعادة البيانات من معرّف مؤقت سابق دون كشف المفاتيح.</p>
            <label>معرّف المستخدم القديم<input id="asiriOldUserIdV680" type="text" autocomplete="off" placeholder="00000000-0000-0000-0000-000000000000"></label>
            <button id="asiriPrepareRecoveryV680" type="button">تجهيز أمر الاستعادة</button>
            <div id="asiriRecoverySqlWrapV680" class="hidden">
              <textarea id="asiriRecoverySqlV680" rows="12" readonly></textarea>
              <button id="asiriCopyRecoverySqlV680" class="secondary" type="button">نسخ أمر SQL</button>
            </div>
          </div>
          <p id="asiriAccountStatusV680" class="status"></p>
          <button id="asiriSignOutV680" class="ghost" type="button">تسجيل الخروج من هذا الجهاز</button>
        </section>
      </div>`);

    $('#asiriOpenAccountV680').onclick = () => openPanel();
    $('#asiriCloseAccountV680').onclick = () => $('#asiriAccountPanelV680').classList.add('hidden');
    $('#asiriSendLoginV680').onclick = sendLoginLink;
    $('#asiriTemporaryLoginV680').onclick = temporaryLogin;
    $('#asiriLinkEmailButtonV680').onclick = linkEmail;
    $('#asiriExistingLoginButtonV681').onclick = sendExistingAccountLink;
    $('#asiriPrepareRecoveryV680').onclick = prepareRecoverySql;
    $('#asiriCopyRecoverySqlV680').onclick = copyRecoverySql;
    $('#asiriSignOutV680').onclick = signOut;
  }

  function status(target, message, kind = '') {
    const node = $(target);
    if (!node) return;
    node.textContent = message;
    node.className = `status ${kind}`.trim();
  }

  function renderIdentity() {
    ensureUi();
    const user = state.session?.user;
    if (!user) return;
    const isAnon = anonymous(user);
    const bar = $('#asiriIdentityBarV680');
    bar.classList.remove('hidden', 'temporary', 'stable');
    bar.classList.add(isAnon ? 'temporary' : 'stable');
    $('#asiriIdentityTitleV680').textContent = isAnon ? 'حساب مؤقت' : 'حساب ثابت وآمن';
    $('#asiriIdentitySubV680').textContent = isAnon ? 'ثبّته بالبريد قبل تغيير الجهاز' : user.email;
    $('#asiriAccountIdentityV680').innerHTML = `<p>الحالة: <b class="${isAnon ? 'down' : 'up'}">${isAnon ? 'مؤقت' : 'ثابت'}</b></p><p>البريد: <b>${safe(user.email || 'غير مربوط')}</b></p><p>معرّف المستخدم الحالي: <small>${safe(user.id)}</small></p>`;
    $('#asiriLinkBoxV680').classList.toggle('hidden', !isAnon);
    $('#asiriRecoveryBoxV680').classList.toggle('hidden', isAnon);

    const pendingOldId = localStorage.getItem(PENDING_RECOVERY_KEY);
    if (!isAnon && pendingOldId && pendingOldId !== user.id && validUuid(pendingOldId)) {
      $('#asiriOldUserIdV680').value = pendingOldId;
      $('#asiriRecoveryBoxV680').classList.remove('hidden');
      status('#asiriAccountStatusV680', 'تم تسجيل الدخول للحساب الموجود. احتفظنا بمعرّف الحساب المؤقت لعملية الاستعادة عند الحاجة.', 'up');
    }
  }

  async function sendLoginLink() {
    const email = $('#asiriLoginEmailV680').value.trim().toLowerCase();
    if (!email) return status('#asiriLoginStatusV680', 'أدخل بريدًا صحيحًا.', 'down');
    status('#asiriLoginStatusV680', 'جارٍ إرسال رابط الدخول…');
    const { error } = await state.client.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/?v=${CACHE_VERSION}&auth=confirmed`, shouldCreateUser: true }
    });
    if (error) return status('#asiriLoginStatusV680', error.message, 'down');
    status('#asiriLoginStatusV680', 'تم الإرسال. افتح الرسالة واضغط رابط الدخول، ثم ستعود إلى المنصة.', 'up');
  }

  async function temporaryLogin() {
    status('#asiriLoginStatusV680', 'جارٍ إنشاء جلسة مؤقتة…');
    const { data, error } = await state.client.auth.signInAnonymously({ options: { data: { app: 'Asiri Capital', version: VERSION } } });
    if (error) return status('#asiriLoginStatusV680', error.message, 'down');
    if (data.session) {
      state.session = data.session;
      $('#asiriAuthGateV680').classList.add('hidden');
      renderIdentity();
      state.waitResolve?.(data.session);
      state.waitResolve = null;
    }
  }

  async function sendExistingAccountLink() {
    const email = $('#asiriLinkEmailV680').value.trim().toLowerCase();
    const currentUser = state.session?.user;
    if (!email) return status('#asiriAccountStatusV680', 'أدخل البريد المسجل مسبقًا.', 'down');
    if (!currentUser || !anonymous(currentUser)) return status('#asiriAccountStatusV680', 'أنت داخل حساب ثابت بالفعل.', 'down');

    localStorage.setItem(PENDING_RECOVERY_KEY, currentUser.id);
    status('#asiriAccountStatusV680', 'جارٍ إرسال رابط الدخول إلى الحساب الموجود…');
    const { error } = await state.client.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/?v=${CACHE_VERSION}&auth=existing`, shouldCreateUser: false }
    });
    if (error) {
      localStorage.removeItem(PENDING_RECOVERY_KEY);
      return status('#asiriAccountStatusV680', error.message, 'down');
    }
    status('#asiriAccountStatusV680', 'تم إرسال رابط دخول للحساب الموجود. افتح الرسالة واضغط الرابط؛ لن يتم إنشاء مستخدم جديد.', 'up');
  }

  async function linkEmail() {
    const email = $('#asiriLinkEmailV680').value.trim().toLowerCase();
    if (!email) return status('#asiriAccountStatusV680', 'أدخل بريدًا صحيحًا.', 'down');
    status('#asiriAccountStatusV680', 'جارٍ ربط البريد بالحساب الحالي…');
    const { error } = await state.client.auth.updateUser(
      { email, data: { app: 'Asiri Capital', account_stabilized_at: new Date().toISOString() } },
      { emailRedirectTo: `${location.origin}/?v=${CACHE_VERSION}&auth=linked` }
    );
    if (error) {
      const message = String(error.message || '');
      if (/already.*registered|already.*exists|user.*email.*registered/i.test(message)) {
        return status('#asiriAccountStatusV680', 'هذا البريد مرتبط بحساب موجود. اضغط «تسجيل الدخول للحساب الموجود» بدل ربط بريد جديد.', 'down');
      }
      const manual = /manual|link|identity|anonymous/i.test(message);
      return status('#asiriAccountStatusV680', manual ? 'فعّل Allow manual linking في Supabase ثم أعد المحاولة. لم يتم تغيير بياناتك.' : message, 'down');
    }
    status('#asiriAccountStatusV680', 'أرسلنا رسالة تأكيد. افتحها واضغط الرابط لإكمال تثبيت الحساب مع بقاء نفس معرّف المستخدم.', 'up');
  }

  function validUuid(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  }

  function recoverySql(oldId, newId) {
    const tables = ['portfolio','watchlist','trades','closed_positions','cash_ledger','portfolio_reconciliations','planned_orders','portfolio_adjustments','position_plans','decision_journal','alerts','broker_snapshots','broker_sync_runs'];
    const tableList = tables.map((name) => `'${name}'`).join(',');
    return `begin;\n\ndo $$\ndeclare\n  old_user uuid := '${oldId}';\n  new_user uuid := '${newId}';\n  table_name text;\nbegin\n  if exists (select 1 from public.portfolio where user_id = new_user) then\n    raise exception 'Target user already has portfolio data. Recovery stopped.';\n  end if;\n\n  if to_regclass('public.alerts') is not null then\n    delete from public.alerts where user_id = new_user;\n  end if;\n\n  foreach table_name in array array[${tableList}] loop\n    if to_regclass('public.' || table_name) is not null then\n      execute format('update public.%I set user_id = $1 where user_id = $2', table_name) using new_user, old_user;\n    end if;\n  end loop;\n\n  if to_regclass('public.broker_connections') is not null then\n    delete from public.broker_connections where user_id = old_user and provider = 'saxo';\n  end if;\nend $$;\n\ncommit;\n\nselect symbol, quantity, avg_price from public.portfolio where user_id = '${newId}' order by created_at;`;
  }

  function prepareRecoverySql() {
    const oldId = $('#asiriOldUserIdV680').value.trim();
    const newId = state.session?.user?.id || '';
    if (!validUuid(oldId)) return status('#asiriAccountStatusV680', 'معرّف المستخدم القديم غير صحيح.', 'down');
    if (!validUuid(newId)) return status('#asiriAccountStatusV680', 'تعذر قراءة معرّف المستخدم الحالي.', 'down');
    if (oldId === newId) return status('#asiriAccountStatusV680', 'المعرّف القديم يطابق الحالي؛ لا يوجد نقل مطلوب.', 'down');
    $('#asiriRecoverySqlV680').value = recoverySql(oldId, newId);
    $('#asiriRecoverySqlWrapV680').classList.remove('hidden');
    status('#asiriAccountStatusV680', 'تم تجهيز الأمر. شغّله مرة واحدة في Supabase SQL Editor بعد مراجعة المعرّفين.', 'up');
  }

  async function copyRecoverySql() {
    const text = $('#asiriRecoverySqlV680').value;
    if (!text) return;
    await navigator.clipboard.writeText(text);
    status('#asiriAccountStatusV680', 'تم نسخ أمر الاستعادة.', 'up');
  }

  async function signOut() {
    if (!confirm('تسجيل الخروج من هذا الجهاز؟ تأكد أن الحساب مربوط بالبريد قبل المتابعة.')) return;
    await state.client.auth.signOut({ scope: 'local' });
    location.assign(`${location.origin}/?v=${CACHE_VERSION}&signedout=1`);
  }

  function openPanel() {
    renderIdentity();
    $('#asiriAccountPanelV680').classList.remove('hidden');
    $('#asiriRecoverySqlWrapV680').classList.add('hidden');
    if (!localStorage.getItem(PENDING_RECOVERY_KEY)) status('#asiriAccountStatusV680', '');
  }

  async function requireSession(client) {
    state.client = client;
    ensureUi();
    $('#asiriAuthGateV680').classList.remove('hidden');
    return new Promise((resolve) => { state.waitResolve = resolve; });
  }

  function mount(client, session) {
    state.client = client;
    state.session = session;
    ensureUi();
    $('#asiriAuthGateV680').classList.add('hidden');
    renderIdentity();
    if (!state.initialized) {
      state.initialized = true;
      client.auth.onAuthStateChange((_event, nextSession) => {
        if (!nextSession) return;
        state.session = nextSession;
        renderIdentity();
        state.waitResolve?.(nextSession);
        state.waitResolve = null;
      });
    }
  }

  window.AsiriStableAuthV680 = { requireSession, mount, openPanel };
})();
