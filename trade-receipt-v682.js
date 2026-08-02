(function () {
  const $ = (selector) => document.querySelector(selector);
  const params = new URLSearchParams(location.search);
  if (params.get('syncTrade') !== '1') return;

  const receipt = {
    id: String(params.get('receipt') || '').trim(),
    symbol: String(params.get('symbol') || '').trim().toUpperCase(),
    side: String(params.get('side') || '').trim().toUpperCase(),
    quantity: Number(params.get('quantity')),
    price: Number(params.get('price')),
    beforeQuantity: Number(params.get('before')),
    stopLoss: Number(params.get('stop')),
    target1: Number(params.get('target1')),
    target2: Number(params.get('target2')),
    reason: String(params.get('reason') || 'جني أرباح جزئي').trim()
  };

  const valid = receipt.id && /^[A-Z0-9._-]{6,80}$/.test(receipt.id)
    && /^[A-Z.]{1,12}$/.test(receipt.symbol)
    && receipt.side === 'SELL'
    && receipt.quantity > 0
    && receipt.price > 0
    && receipt.beforeQuantity > receipt.quantity;
  if (!valid) return;

  function fmt(value, digits = 2) {
    return Number(value).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }

  function safe(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
  }

  function ensureUi() {
    if ($('#asiriTradeReceiptV682')) return;
    const remaining = receipt.beforeQuantity - receipt.quantity;
    const realized = (receipt.price - 8.96) * receipt.quantity;
    document.body.insertAdjacentHTML('beforeend', `
      <div id="asiriTradeReceiptV682" class="asiri-trade-receipt-v682" role="dialog" aria-modal="true">
        <section class="asiri-trade-card-v682">
          <span class="eyebrow">EXECUTION RECEIPT · v6.8.2</span>
          <h2>مزامنة صفقة ${safe(receipt.symbol)}</h2>
          <p>سيتم تحديث محفظتك الحالية فقط بعد التحقق من جلسة Supabase والكمية المسجلة، ولن يتم إرسال أي أمر تداول.</p>
          <div class="asiri-trade-grid-v682">
            <div><span>العملية</span><b>بيع جزئي</b></div>
            <div><span>الكمية المنفذة</span><b>${fmt(receipt.quantity)} سهم</b></div>
            <div><span>سعر التنفيذ</span><b>$${fmt(receipt.price)}</b></div>
            <div><span>الكمية المتوقعة بعد البيع</span><b>${fmt(remaining)} سهم</b></div>
            <div><span>الهدف القادم</span><b>$${fmt(receipt.target1)}</b></div>
            <div><span>الهدف التالي</span><b>$${fmt(receipt.target2)}</b></div>
            <div><span>حماية الربح</span><b>$${fmt(receipt.stopLoss)}</b></div>
            <div><span>الربح المحقق التقريبي</span><b>+$${fmt(realized)}</b></div>
          </div>
          <label class="asiri-fee-v682">رسوم التنفيذ بالدولار
            <input id="asiriTradeFeeV682" type="number" min="0" step="0.01" value="0">
          </label>
          <button id="asiriApplyTradeV682" type="button">تأكيد وتحديث الموقع</button>
          <button id="asiriCancelTradeV682" class="secondary" type="button">إلغاء دون تغيير</button>
          <p id="asiriTradeStatusV682" class="status"></p>
        </section>
      </div>`);
    $('#asiriApplyTradeV682').onclick = applyReceipt;
    $('#asiriCancelTradeV682').onclick = () => {
      const clean = new URL(location.href);
      ['syncTrade','receipt','symbol','side','quantity','price','before','stop','target1','target2','reason'].forEach((key) => clean.searchParams.delete(key));
      location.assign(clean.toString());
    };
  }

  function setStatus(message, kind = '') {
    const node = $('#asiriTradeStatusV682');
    if (!node) return;
    node.textContent = message;
    node.className = `status ${kind}`.trim();
  }

  async function getClient() {
    const config = await fetch('/api/config', { cache: 'no-store' }).then((response) => response.json());
    if (!config.supabase?.enabled || !window.supabase) throw new Error('Supabase غير جاهز.');
    const client = window.supabase.createClient(config.supabase.url, config.supabase.publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    if (!data.session) throw new Error('سجّل الدخول إلى حساب Asiri Capital الثابت أولًا.');
    return { client, session: data.session };
  }

  async function applyReceipt() {
    const button = $('#asiriApplyTradeV682');
    button.disabled = true;
    setStatus('جارٍ التحقق من المركز وتسجيل الصفقة…');
    try {
      const { client, session } = await getClient();
      const fee = Math.max(0, Number($('#asiriTradeFeeV682').value || 0));
      const remaining = Number((receipt.beforeQuantity - receipt.quantity).toFixed(8));
      const { data: positions, error: positionError } = await client.from('portfolio').select('*').eq('symbol', receipt.symbol).limit(2);
      if (positionError) throw positionError;
      if (!positions?.length) throw new Error(`لا يوجد مركز ${receipt.symbol} في الحساب الحالي.`);
      if (positions.length > 1) throw new Error(`يوجد أكثر من مركز ${receipt.symbol}. أوقفنا المزامنة للمراجعة.`);
      const position = positions[0];
      const currentQty = Number(position.quantity);
      const tolerance = 0.011;
      if (Math.abs(currentQty - receipt.beforeQuantity) > tolerance && Math.abs(currentQty - remaining) > tolerance) {
        throw new Error(`الكمية الحالية ${fmt(currentQty)} لا تطابق ${fmt(receipt.beforeQuantity)} أو ${fmt(remaining)}. لم نغيّر البيانات.`);
      }

      const marker = `[receipt:${receipt.id}]`;
      const { data: existingTrades, error: existingError } = await client.from('trades')
        .select('id,quantity,price,notes')
        .eq('symbol', receipt.symbol)
        .in('action', ['SELL', 'CLOSE'])
        .ilike('notes', `%${marker}%`)
        .limit(1);
      if (existingError) throw existingError;

      if (Math.abs(currentQty - receipt.beforeQuantity) <= tolerance) {
        const note = `${String(position.notes || '').trim()}\nتم بيع ${receipt.quantity} سهم عند $${receipt.price.toFixed(2)} بتاريخ 21/07/2026. الخطة: حماية $${receipt.stopLoss.toFixed(2)}، هدف $${receipt.target1.toFixed(2)} ثم $${receipt.target2.toFixed(2)}.`.trim();
        const { error: updateError } = await client.from('portfolio').update({
          quantity: remaining,
          stop_loss: receipt.stopLoss || position.stop_loss,
          target1: receipt.target1 || position.target1,
          target2: receipt.target2 || position.target2,
          notes: note,
          updated_at: new Date().toISOString()
        }).eq('id', position.id);
        if (updateError) throw updateError;
      }

      if (!existingTrades?.length) {
        const realizedPnl = ((receipt.price - Number(position.avg_price)) * receipt.quantity) - fee;
        const { error: tradeError } = await client.from('trades').insert({
          user_id: session.user.id,
          position_id: position.id,
          symbol: receipt.symbol,
          action: remaining <= tolerance ? 'CLOSE' : 'SELL',
          quantity: receipt.quantity,
          price: receipt.price,
          reason: receipt.reason,
          notes: `${marker} بيع جزئي منفذ وتحديث خطة إدارة الربح.`,
          realized_pnl: realizedPnl,
          fees_usd: fee,
          exchange_rate_sar_per_usd: 3.75,
          gross_amount_usd: receipt.quantity * receipt.price,
          gross_amount_sar: ((receipt.quantity * receipt.price) - fee) * 3.75
        });
        if (tradeError) throw tradeError;
      }

      setStatus(`تمت المزامنة: ${receipt.symbol} أصبح ${fmt(remaining)} سهم، وسُجل البيع عند $${fmt(receipt.price)}.`, 'up');
      button.textContent = 'تم التحديث ✓';
      setTimeout(() => {
        const clean = new URL(location.href);
        ['syncTrade','receipt','symbol','side','quantity','price','before','stop','target1','target2','reason'].forEach((key) => clean.searchParams.delete(key));
        clean.searchParams.set('v', '6820');
        clean.searchParams.set('tradeSynced', receipt.id);
        location.assign(clean.toString());
      }, 1600);
    } catch (error) {
      setStatus(error.message || 'تعذر تسجيل الصفقة.', 'down');
      button.disabled = false;
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensureUi, { once: true });
  else ensureUi();
})();