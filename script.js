'use strict';
const KEY = 'finfuture-data';
const CATS = {
  income: ['Зарплата', 'Стипендия', 'Подработка', 'Другое'],
  expense: ['Еда', 'Транспорт', 'Жильё', 'Учёба', 'Развлечения', 'Здоровье', 'Другое']
};
const COLORS = ['#1b7fd4', '#e5484d', '#12a36b', '#f5a524', '#0ea5e9', '#d946ef', '#8b93b8'];
const TYPE_NAMES = { income: 'Доход', expense: 'Расход', saving: 'Накопление' };
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

const $ = id => document.getElementById(id);
const fmt = n => Math.round(n).toLocaleString('ru-RU') + ' сом';
const esc = s => String(s).replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';');
const pad = n => String(n).padStart(2, '0');
const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const sum = (list, type) => list.filter(t => t.type === type).reduce((s, t) => s + t.amount, 0);
const plural = (n, a, b, c) => { const m = n % 100, k = n % 10; return (m > 10 && m < 20) ? c : k === 1 ? a : (k > 1 && k < 5) ? b : c; };
const ru = d => d.slice(8, 10) + '.' + d.slice(5, 7) + '.' + d.slice(0, 4);

let data = { tx: [], goals: [], limit: 0, theme: '' };
try { Object.assign(data, JSON.parse(localStorage.getItem(KEY)) || {}); } catch (e) { /* пустые данные */ }
function saveData() { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* хранилище недоступно */ } }

let txType = 'expense';
const filt = { q: '', from: '', to: '' };

function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.id); toast.id = setTimeout(() => { t.hidden = true; }, 2400);
}

// ---------- Расчёты ----------
const calculateIncome = (list = data.tx) => sum(list, 'income');
const calculateExpenses = (list = data.tx) => sum(list, 'expense');
const calculateBalance = () => calculateIncome() - calculateExpenses() - sum(data.tx, 'saving');

function periodStart() {
  const p = $('period').value, d = new Date();
  if (p === 'week') d.setDate(d.getDate() - 6);
  else if (p === 'month') d.setDate(1);
  else if (p === 'year') d.setMonth(0, 1);
  else return '';
  return iso(d);
}

// ---------- Операции ----------
function addTransaction(type, amount, category, date, desc = '', goalId = null) {
  if (!(amount > 0) || !date) return false;
  data.tx.push({ id: uid(), type, amount, category, date, desc, goalId });
  saveData(); render();
  return true;
}
function deleteTransaction(id) { data.tx = data.tx.filter(t => t.id !== id); saveData(); render(); }

// ---------- Цели ----------
function addSavingsGoal(name, target, monthly) {
  if (!name || !(target > 0)) return;
  data.goals.push({ id: uid(), name, target, monthly });
  saveData(); render();
}

function renderGoals() {
  $('goalList').innerHTML = data.goals.map(g => {
    const saved = sum(data.tx.filter(t => t.goalId === g.id), 'saving');
    const left = Math.max(0, g.target - saved);
    const p = Math.min(100, saved / g.target * 100);
    let hint = '';
    if (!left) hint = '<span class="done">Цель достигнута!</span>';
    else if (g.monthly > 0) {
      const m = Math.ceil(left / g.monthly), d = new Date();
      d.setMonth(d.getMonth() + m);
      hint = `<small>Прогноз: ещё ${m} мес. при взносе ${fmt(g.monthly)} (${d.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })})</small>`;
    }
    return `<div class="goal">
      <header><b>${esc(g.name)}</b><button class="x" data-gdel="${g.id}" aria-label="Удалить цель">×</button></header>
      <div class="track"><div style="width:${p}%"></div></div>
      <small class="num">Накоплено ${fmt(saved)} из ${fmt(g.target)} (${Math.round(p)}%). Осталось ${fmt(left)}</small>
      ${hint}
      <div class="dep"><input type="number" min="1" inputmode="numeric" placeholder="Сумма взноса" aria-label="Сумма взноса"><button class="btn soft sm" data-dep="${g.id}" type="button">Внести</button></div>
      <div class="err"></div>
    </div>`;
  }).join('') || '<div class="empty" style="grid-column:1/-1">Создай первую цель, например «Новый компьютер»</div>';
}

// ---------- Графики ----------
function niceMax(v) {
  if (v <= 0) return 1000;
  const p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}
const short = n => n >= 1e6 ? +(n / 1e6).toFixed(1) + ' млн' : n >= 1000 ? +(n / 1000).toFixed(1) + 'к' : String(Math.round(n));

function buckets() {
  const p = $('period').value, now = new Date(), out = [];
  if (p === 'week' || p === 'month') {
    const start = new Date(now);
    let n;
    if (p === 'week') { start.setDate(now.getDate() - 6); n = 7; }
    else { start.setDate(1); n = now.getDate(); }
    for (let i = 0; i < n; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      out.push({ key: iso(d), label: p === 'week' ? pad(d.getDate()) + '.' + pad(d.getMonth() + 1) : String(d.getDate()), len: 10 });
    }
    return out.map(b => ({ ...b, test: t => t.date === b.key }));
  }
  const months = p === 'year' ? now.getMonth() + 1 : 12;
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = d.getFullYear() + '-' + pad(d.getMonth() + 1);
    out.push({ key, label: MONTHS[d.getMonth()], test: t => t.date.slice(0, 7) === key });
  }
  return out;
}

function renderBars(list) {
  const bs = buckets().map(b => ({
    label: b.label,
    inc: sum(list.filter(b.test), 'income'),
    exp: sum(list.filter(b.test), 'expense')
  }));
  const mx = niceMax(Math.max(...bs.map(b => Math.max(b.inc, b.exp))));
  if (!bs.some(b => b.inc || b.exp)) { $('bars').innerHTML = '<div class="empty">Нет операций за выбранный период. Добавь первую, чтобы увидеть график.</div>'; return; }
  const W = 640, H = 240, L = 44, B = 26, T = 8, R = 8, ph = H - B - T, pw = W - L - R, gw = pw / bs.length;
  const bw = Math.max(2, Math.min(18, gw * .32));
  let s = `<svg class="bars" viewBox="0 0 ${W} ${H}" role="img" aria-label="Доходы и расходы по периодам">`;
  for (let i = 0; i <= 4; i++) {
    const y = T + ph - ph * i / 4;
    s += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" stroke="var(--line)"/><text x="${L - 8}" y="${y + 4}" text-anchor="end">${short(mx * i / 4)}</text>`;
  }
  const step = Math.ceil(bs.length / 10);
  bs.forEach((b, i) => {
    const cx = L + gw * i + gw / 2, hi = ph * b.inc / mx, he = ph * b.exp / mx;
    if (b.inc) s += `<rect x="${cx - bw - 1}" y="${T + ph - hi}" width="${bw}" height="${hi}" rx="3" fill="var(--acc)"><title>${esc(b.label)}: доходы ${fmt(b.inc)}</title></rect>`;
    if (b.exp) s += `<rect x="${cx + 1}" y="${T + ph - he}" width="${bw}" height="${he}" rx="3" fill="#f0a3ae"><title>${esc(b.label)}: расходы ${fmt(b.exp)}</title></rect>`;
    if (i % step === 0) s += `<text x="${cx}" y="${H - 8}" text-anchor="middle">${esc(b.label)}</text>`;
  });
  $('bars').innerHTML = s + '</svg>';
}

function renderDonut(list) {
  const by = {};
  list.filter(t => t.type === 'expense').forEach(t => { by[t.category] = (by[t.category] || 0) + t.amount; });
  const entries = Object.entries(by).sort((a, b) => b[1] - a[1]), total = entries.reduce((s, e) => s + e[1], 0);
  if (!total) { $('donut').innerHTML = '<div class="empty">Пока нет расходов за выбранный период</div>'; return; }
  const r = 56, C = 2 * Math.PI * r;
  let off = 0, arcs = '';
  entries.forEach(([, v], i) => {
    const len = v / total * C;
    arcs += `<circle cx="80" cy="80" r="${r}" fill="none" stroke="${COLORS[i % COLORS.length]}" stroke-width="22" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}" transform="rotate(-90 80 80)"/>`;
    off += len;
  });
  $('donut').innerHTML = `<div class="donutwrap">
    <svg viewBox="0 0 160 160" role="img" aria-label="Расходы по категориям">${arcs}<text x="80" y="77" text-anchor="middle" style="font-size:10px">Всего</text><text x="80" y="94" text-anchor="middle" style="font-size:13px;font-weight:800;fill:var(--fg)">${short(total)}</text></svg>
    <ul class="cl">${entries.map(([k, v], i) => `<li><i style="background:${COLORS[i % COLORS.length]}"></i><span>${esc(k)}</span><b>${Math.round(v / total * 100)}%</b></li>`).join('')}</ul></div>`;
}

function renderBudget() {
  const monthStart = iso(new Date()).slice(0, 8) + '01';
  const spent = calculateExpenses(data.tx.filter(t => t.date >= monthStart));
  const pct = data.limit ? spent / data.limit * 100 : 0;
  $('bBar').style.width = Math.min(100, pct) + '%';
  $('bBar').className = pct >= 100 ? 'over' : '';
  $('bPct').textContent = Math.round(pct) + '%';
  $('bSpent').textContent = fmt(spent) + ' потрачено в этом месяце';
  $('bLim').textContent = data.limit ? 'Лимит ' + fmt(data.limit) : 'Лимит не задан';
  $('warn').textContent = pct >= 100 ? 'Лимит расходов превышен!' : pct >= 80 ? 'Ты близок к лимиту расходов.' : '';
}

// ---------- Таблица ----------
function filtered() {
  const q = filt.q.trim().toLowerCase();
  return data.tx.filter(t =>
    (!q || (t.category + ' ' + (t.desc || '')).toLowerCase().includes(q)) &&
    (!filt.from || t.date >= filt.from) && (!filt.to || t.date <= filt.to)
  ).sort((a, b) => b.date.localeCompare(a.date));
}

function renderRows() {
  const rows = filtered();
  $('rows').innerHTML = rows.map(t => `<tr>
    <td>${esc(t.desc || t.category)}</td><td class="cat">${esc(t.category)}</td><td class="num">${ru(t.date)}</td>
    <td><span class="pill ${t.type}">${TYPE_NAMES[t.type]}</span></td>
    <td><span class="amt num ${t.type}">${t.type === 'income' ? '+' : '−'}${fmt(t.amount)}</span><button class="x" data-del="${t.id}" aria-label="Удалить операцию">×</button></td></tr>`).join('')
    || `<tr><td colspan="5" class="empty">${data.tx.length ? 'Ничего не найдено. Измени фильтры.' : 'Операций пока нет. Добавь первую запись или <button class="btn soft sm" id="demo" type="button">загрузи пример</button>'}</td></tr>`;
  $('shown').textContent = `Показано ${rows.length} из ${data.tx.length} ${plural(data.tx.length, 'операции', 'операций', 'операций')}`;
}

// ---------- Отрисовка ----------
function render() {
  const start = periodStart(), list = data.tx.filter(t => t.date >= start);
  const nInc = list.filter(t => t.type === 'income').length, nExp = list.filter(t => t.type === 'expense').length;
  $('balance').textContent = fmt(calculateBalance());
  $('income').textContent = fmt(calculateIncome(list));
  $('expenses').textContent = fmt(calculateExpenses(list));
  $('savings').textContent = fmt(sum(data.tx, 'saving'));
  $('incN').textContent = nInc + ' ' + plural(nInc, 'операция', 'операции', 'операций');
  $('expN').textContent = nExp + ' ' + plural(nExp, 'операция', 'операции', 'операций');
  $('goalN').textContent = data.goals.length + ' ' + plural(data.goals.length, 'цель', 'цели', 'целей');
  $('incT').textContent = fmt(calculateIncome(list));
  $('expT').textContent = fmt(calculateExpenses(list));
  renderBars(list); renderDonut(list); renderBudget(); renderRows(); renderGoals();
}

function fillCats() {
  $('category').innerHTML = CATS[txType].map(c => `<option>${c}</option>`).join('');
  document.querySelectorAll('#seg button').forEach(b => b.classList.toggle('on', b.dataset.t === txType));
}

// ---------- Тема ----------
function applyTheme() {
  const root = document.documentElement;
  if (data.theme) root.dataset.theme = data.theme; else delete root.dataset.theme;
  const dark = data.theme ? data.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  $('themeTxt').textContent = dark ? 'Светлая тема' : 'Тёмная тема';
}

// ---------- Модальные окна ----------
function openModal(id, focusId) { $(id).hidden = false; setTimeout(() => $(focusId).focus(), 0); }
function closeModals() { document.querySelectorAll('.modal').forEach(m => { m.hidden = true; }); }

// ---------- События ----------
$('openTx').onclick = () => { $('txErr').textContent = ''; $('date').value = iso(new Date()); openModal('mTx', 'amount'); };
$('openGoal').onclick = () => openModal('mGoal', 'gName');
document.querySelectorAll('[data-close]').forEach(b => { b.onclick = closeModals; });
document.querySelectorAll('.modal').forEach(m => { m.addEventListener('mousedown', e => { if (e.target === m) closeModals(); }); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModals(); });

$('seg').onclick = e => { const t = e.target.dataset.t; if (t) { txType = t; fillCats(); } };
$('txForm').onsubmit = e => {
  e.preventDefault();
  const amount = +$('amount').value;
  if (!(amount > 0)) { $('txErr').textContent = 'Введи сумму больше нуля.'; return; }
  addTransaction(txType, amount, $('category').value, $('date').value, $('desc').value.trim());
  $('amount').value = ''; $('desc').value = '';
  closeModals(); toast('Операция добавлена');
};
$('goalForm').onsubmit = e => {
  e.preventDefault();
  addSavingsGoal($('gName').value.trim(), +$('gTarget').value, +$('gMonthly').value || 0);
  e.target.reset(); closeModals(); toast('Цель создана');
};
$('limitForm').onsubmit = e => { e.preventDefault(); data.limit = +$('limit').value || 0; saveData(); render(); toast(data.limit ? 'Лимит сохранён' : 'Лимит снят'); };
$('period').onchange = render;
$('q').oninput = e => { filt.q = e.target.value; renderRows(); };
$('df').onchange = e => { filt.from = e.target.value; renderRows(); };
$('dt').onchange = e => { filt.to = e.target.value; renderRows(); };
$('reset').onclick = () => { filt.q = filt.from = filt.to = ''; $('q').value = $('df').value = $('dt').value = ''; renderRows(); };
$('themeBtn').onclick = () => {
  const dark = data.theme ? data.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  data.theme = dark ? 'light' : 'dark'; applyTheme(); saveData();
};

$('csvBtn').onclick = async () => {
  const rows = [['Дата', 'Тип', 'Категория', 'Описание', 'Сумма, сом']]
    .concat(data.tx.map(t => [t.date, TYPE_NAMES[t.type], t.category, t.desc || '', t.amount]));
  const csv = rows.map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(';')).join('\n');
  try { await navigator.clipboard.writeText(csv); toast('CSV скопирован. Вставь в Excel или Google Таблицы'); }
  catch (e) { toast('Не удалось скопировать. Разреши доступ к буферу обмена'); }
};

document.addEventListener('click', e => {
  const el = e.target.closest('button'); if (!el) return;
  const d = el.dataset;
  if (d.del) deleteTransaction(d.del);
  if (d.gdel) {
    data.goals = data.goals.filter(g => g.id !== d.gdel);
    data.tx = data.tx.filter(t => t.goalId !== d.gdel);
    saveData(); render();
  }
  if (d.dep) {
    const box = el.closest('.goal'), amt = +box.querySelector('input').value, g = data.goals.find(x => x.id === d.dep);
    if (!(amt > 0)) { box.querySelector('.err').textContent = 'Введи сумму взноса.'; return; }
    if (amt > calculateBalance()) { box.querySelector('.err').textContent = 'Недостаточно средств на балансе.'; return; }
    addTransaction('saving', amt, 'Цель: ' + g.name, iso(new Date()), '', g.id);
    toast('Взнос внесён');
  }
  if (el.id === 'demo') {
    const now = new Date(), y = now.getFullYear(), m = now.getMonth();
    const day = n => iso(new Date(y, m, Math.min(n, now.getDate())));
    [['income', 45000, 'Зарплата', 1, 'Зарплата за месяц'], ['income', 6000, 'Подработка', 4, 'Репетиторство'],
     ['expense', 12000, 'Жильё', 2, 'Аренда комнаты'], ['expense', 4200, 'Еда', 3, 'Продукты'],
     ['expense', 1500, 'Транспорт', 5, 'Проездной'], ['expense', 2300, 'Развлечения', 6, 'Кино и кафе'],
     ['expense', 3100, 'Учёба', 7, 'Учебники']
    ].forEach(([t, a, c, dd, ds]) => data.tx.push({ id: uid(), type: t, amount: a, category: c, date: day(dd), desc: ds + ' (пример)', goalId: null }));
    saveData(); render(); toast('Добавлены примеры. Их можно удалить крестиком');
  }
});

// подсветка пункта меню при прокрутке
const links = [...document.querySelectorAll('#nav a')];
function markNav() {
  let cur = links[0];
  links.forEach(a => { const s = document.querySelector(a.getAttribute('href')); if (s && s.getBoundingClientRect().top < innerHeight * .4) cur = a; });
  links.forEach(a => a.classList.toggle('on', a === cur));
}
addEventListener('scroll', markNav, { passive: true });

// Пример данных при первом запуске: баланс, расходы и накопления по 1 000 000 сом, доходы 3 000 000.
function seedExample() {
  const now = new Date(), day = n => iso(new Date(now.getFullYear(), now.getMonth(), Math.min(n, now.getDate())));
  const g = { id: uid(), name: 'Новый компьютер', target: 1500000, monthly: 100000 };
  data.goals.push(g);
  const add = (type, amount, category, d, desc, goalId = null) =>
    data.tx.push({ id: uid(), type, amount, category, date: day(d), desc: desc + ' (пример)', goalId });
  add('income', 2500000, 'Зарплата', 1, 'Зарплата за месяц');
  add('income', 500000, 'Подработка', 3, 'Проект на заказ');
  add('expense', 400000, 'Жильё', 2, 'Аренда');
  add('expense', 250000, 'Еда', 4, 'Продукты');
  add('expense', 100000, 'Транспорт', 5, 'Такси и проезд');
  add('expense', 150000, 'Развлечения', 7, 'Отдых');
  add('expense', 100000, 'Учёба', 8, 'Курсы');
  add('saving', 1000000, 'Цель: ' + g.name, 9, 'Взнос в цель', g.id);
  data.limit = 1500000; data.seeded = true; saveData();
}
if (!data.seeded && !data.tx.length && !data.goals.length) seedExample();

$('kicker').textContent = 'Личные финансы / ' + new Date().getFullYear();
$('limit').value = data.limit || '';
applyTheme(); fillCats(); render(); markNav();
