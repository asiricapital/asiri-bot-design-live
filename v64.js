const $64 = (id) => document.getElementById(id);
const esc64 = (value) => String(value ?? '—').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
const num64 = (value, digits = 1) => Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : '—';

function voteLabel64(vote) {
  return ({ SUPPORT: 'مؤيد', OPPOSE: 'معترض', CAUTION: 'حذر', WAIT: 'انتظار', WATCH: 'مراقبة', CONDITIONAL_ENTRY: 'دخول مشروط', AVOID: 'تجنب' })[vote] || vote || '—';
}

function voteClass64(vote) {
  if (['SUPPORT', 'CONDITIONAL_ENTRY'].includes(vote)) return 'support';
  if (['OPPOSE', 'AVOID'].includes(vote)) return 'oppose';
  return 'caution';
}

function renderMember64(member) {
  const veto = member.veto ? '<span class="committee64-veto">اعتراض نافذ</span>' : '';
  return `<article class="committee64-member ${voteClass64(member.vote)}">
    <div class="committee64-member-head"><div><span>${esc64(member.role)}</span><h3>${esc64(member.label)}</h3></div><div class="committee64-score">${num64(member.score, 0)}<small>/100</small></div></div>
    <div class="committee64-vote">${esc64(voteLabel64(member.vote))}${veto}</div>
    <ul>${(member.reasons || []).map((reason) => `<li>${esc64(reason)}</li>`).join('')}</ul>
  </article>`;
}

function renderCommittee64(data) {
  const consensus = data.consensus || {};
  const manager = (data.members || []).find((member) => member.role === 'PORTFOLIO_MANAGER') || {};
  const gates = manager.gates || [];
  const plan = data.plan || {};

  $64('committee64Decision').textContent = consensus.decision || '—';
  $64('committee64Confidence').textContent = `${num64(consensus.confidence, 0)}/100`;
  $64('committee64Position').textContent = consensus.maxPositionPct ? `${consensus.maxPositionPct}% حد أقصى` : '—';
  $64('committee64Execution').textContent = data.tradingEnabled ? 'غير آمن' : 'محظور — مراجعة فقط';
  $64('committee64Members').innerHTML = (data.members || []).map(renderMember64).join('');
  $64('committee64Gates').innerHTML = gates.map((gate) => `<div class="committee64-gate ${String(gate.status).toLowerCase()}"><span>${esc64(gate.label)}</span><b>${esc64(gate.status)}</b></div>`).join('');
  $64('committee64Plan').innerHTML = [
    ['الدخول الأدنى', plan.entryLow == null ? '—' : `$${num64(plan.entryLow, 2)}`],
    ['الدخول الأعلى', plan.entryHigh == null ? '—' : `$${num64(plan.entryHigh, 2)}`],
    ['وقف الخسارة', plan.stopLoss == null ? '—' : `$${num64(plan.stopLoss, 2)}`],
    ['الهدف الأول', plan.target1 == null ? '—' : `$${num64(plan.target1, 2)}`],
    ['الهدف الثاني', plan.target2 == null ? '—' : `$${num64(plan.target2, 2)}`],
    ['العائد/المخاطرة', plan.riskReward == null ? '—' : `${num64(plan.riskReward, 1)}:1`]
  ].map(([label, value]) => `<div><span>${label}</span><b>${value}</b></div>`).join('');
  $64('committee64Result').classList.remove('committee64-hidden');
}

async function runCommittee64() {
  const symbol = String($64('committee64Symbol')?.value || '').trim().toUpperCase().replace(/[^A-Z0-9.-]/g, '').slice(0, 12);
  if (!symbol) return;
  const status = $64('committee64Status');
  status.textContent = `تجتمع اللجنة الآن لتحليل ${symbol}…`;
  status.className = 'status';
  $64('committee64Run').disabled = true;
  try {
    const response = await fetch(`/api/investment-committee/${encodeURIComponent(symbol)}`, { cache: 'no-store' });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'تعذر تشغيل لجنة الاستثمار.');
    renderCommittee64(payload);
    status.textContent = `اكتمل اجتماع لجنة ${symbol}. النتيجة استشارية ولا تنفذ أي صفقة.`;
    status.className = 'status up';
  } catch (error) {
    status.textContent = error.message;
    status.className = 'status down';
  } finally {
    $64('committee64Run').disabled = false;
  }
}

$64('committee64Run')?.addEventListener('click', runCommittee64);
$64('committee64Symbol')?.addEventListener('keydown', (event) => { if (event.key === 'Enter') runCommittee64(); });
