'use strict';

// Ojo: cambiar la clave o el formato dejaría a los usuarios sin sus datos guardados.
const STORAGE_KEY = 'anticipos-paga-extra-v1';
const ADVANCE_RATIO = 0.8;

const $ = (id) => document.getElementById(id);

// --- Utilidades ---

const currency = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const eur = (n) => currency.format(n);
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const sum = (list) => list.reduce((total, a) => total + a.amount, 0);

const pad = (n) => String(n).padStart(2, '0');
const toIso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromIso = (s) => {
  const [y, m, d] = String(s).split('-').map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const today = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
};
const isValidDate = (d) => !isNaN(d.getTime());

const shortDate = (d) =>
  d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '');
const monthName = (y, m) => new Date(y, m, 1).toLocaleDateString('es-ES', { month: 'long' });

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// Acepta "1.234,56", "1234,56" y "1234.56".
function parseAmount(s) {
  s = String(s).trim();
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const v = parseFloat(s);
  return isFinite(v) ? v : NaN;
}
const formatAmountInput = (n) => n.toFixed(2).replace('.', ',');

// --- Estado ---

let storageAvailable = true;

function isValidState(s) {
  return (
    s &&
    typeof s.ref === 'number' &&
    s.ref > 0 &&
    Array.isArray(s.advances) &&
    s.advances.every(
      (a) => a && typeof a.amount === 'number' && typeof a.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(a.date)
    )
  );
}

// Devuelve el estado normalizado o null si no es válido.
function normalizeState(s) {
  if (!isValidState(s)) return null;
  s.advances.forEach((a) => {
    if (!a.id) a.id = newId();
  });
  return s;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const stored = raw && normalizeState(JSON.parse(raw));
    if (stored) return stored;
  } catch {
    storageAvailable = false;
  }
  return { ref: 1500, advances: [] };
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    storageAvailable = false;
    $('storage-banner').hidden = false;
  }
}

let state = loadState();
if (!storageAvailable) $('storage-banner').hidden = false;

// --- Cálculos ---
// Cada mes se devenga 1/6 de la paga y se puede anticipar hasta el 80% de lo devengado.
// Semestre 1: enero-junio (paga de julio). Semestre 2: julio-diciembre (paga de diciembre).

const half = (d) => (d.getMonth() < 6 ? 1 : 2);
const halfKey = (d) => `${d.getFullYear()}-${half(d)}`;
const halfName = (h) => (h === 1 ? 'Paga de julio' : 'Paga de diciembre');
const monthsAccrued = (d) => (d.getMonth() % 6) + 1;
const isExtraPayMonth = (m) => m === 6 || m === 11;

const monthlyBase = () => round2(state.ref / 6);
const capFor = (months) => round2(monthlyBase() * months * ADVANCE_RATIO);

const advancesIn = (key) => state.advances.filter((a) => halfKey(fromIso(a.date)) === key);
const requestedIn = (key) => round2(sum(advancesIn(key)));
// Al editar un anticipo, su propio importe no cuenta como ya pedido.
const availableAt = (d, excludeId = null) => {
  const others = advancesIn(halfKey(d)).filter((a) => a.id !== excludeId);
  return Math.max(0, round2(capFor(monthsAccrued(d)) - sum(others)));
};

// Lo pedido de lunes a jueves se cobra ese viernes; lo pedido de viernes a domingo, el siguiente.
function payday(d) {
  const offsets = [5, 4, 3, 2, 1, 7, 6]; // domingo..sábado
  return addDays(d, offsets[d.getDay()]);
}

function replaceState(next) {
  state = next;
  if (editingId && !state.advances.some((a) => a.id === editingId)) stopEditing();
  saveState();
  renderAll();
}

// --- Vista ---

const now = today();
let view = { year: now.getFullYear(), month: now.getMonth() };
let selectedDate = toIso(now);
let pendingDeleteId = null;
let editingId = null;
const openYears = {};

function renderHero() {
  const t = today();
  const months = monthsAccrued(t);
  const cap = capFor(months);
  const requested = requestedIn(halfKey(t));
  const available = Math.max(0, round2(cap - requested));
  const fullCap = capFor(6) || 1;
  const pctRequested = Math.min(100, (requested / fullCap) * 100);
  const pctAvailable = Math.min(100 - pctRequested, (available / fullCap) * 100);

  const nextPay = payday(t);
  const deadline = addDays(nextPay, -1);
  const daysLeft = Math.round((deadline - t) / 86400000);
  const when = daysLeft <= 0 ? 'hoy' : daysLeft === 1 ? 'mañana' : `en ${daysLeft} días`;

  let note = '';
  const m = t.getMonth();
  if (isExtraPayMonth(m)) {
    note = `<p class="note warn">No hace falta pedir anticipo en ${monthName(t.getFullYear(), m)}: este mes cobras la paga extra y lo anticipado se descontaría de ella.</p>`;
  } else if (available === 0 && months < 6) {
    note = `<p class="note">No queda nada por anticipar este mes. El 1 de ${monthName(t.getFullYear(), m + 1)} se suman ${eur(round2(capFor(months + 1) - cap))}.</p>`;
  }

  $('hero').innerHTML = `
    <div>
      <p class="label">Puedes pedir hoy</p>
      <p class="big num${available === 0 ? ' zero' : ''}">${eur(available)}</p>
      <p class="sem">${halfName(half(t))} ${t.getFullYear()} · ${months} de 6 meses devengados</p>
      <div class="bar" role="img" aria-label="Pedido ${eur(requested)}, disponible ${eur(available)} de ${eur(fullCap)}">
        <i class="b-req" style="width:${pctRequested}%"></i><i class="b-av" style="width:${pctAvailable}%"></i>
      </div>
      <div class="bar-legend">
        <span class="l1">Pedido ${eur(requested)}</span>
        <span class="l2">Disponible ${eur(available)}</span>
        <span class="l3">Aún sin devengar ${eur(Math.max(0, round2(fullCap - cap)))}</span>
      </div>
    </div>
    <div class="facts">
      <div class="fact"><span>Próximo cobro</span><b>${shortDate(nextPay)}</b></div>
      <div class="fact"><span>Último día para pedirlo</span><b>${shortDate(deadline)} (${when})</b></div>
      <div class="fact"><span>Tope acumulado hasta hoy</span><b class="num">${eur(cap)}</b></div>
      <div class="fact"><span>Cada mes se suman</span><b class="num">${eur(capFor(1))}</b></div>
    </div>
    ${note}`;
}

function renderCalendar() {
  const { year, month } = view;
  $('cal-title').textContent = new Date(year, month, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });

  let html = '';
  const aMonday = new Date(2024, 0, 1);
  for (let i = 0; i < 7; i++) {
    const name = addDays(aMonday, i).toLocaleDateString('es-ES', { weekday: 'short' }).replace('.', '');
    html += `<div class="dow" aria-hidden="true">${name}</div>`;
  }

  const t = today();
  const todayIso = toIso(t);
  const nextPay = payday(t);
  const windowStart = toIso(addDays(nextPay, -4));
  const windowEnd = toIso(addDays(nextPay, -1));

  const paidByDay = {};
  const requestDays = new Set();
  for (const a of state.advances) {
    const pay = toIso(payday(fromIso(a.date)));
    paidByDay[pay] = (paidByDay[pay] || 0) + a.amount;
    requestDays.add(a.date);
  }

  const leadingBlanks = (new Date(year, month, 1).getDay() + 6) % 7;
  html += '<div class="blank"></div>'.repeat(leadingBlanks);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    const iso = toIso(date);
    const isFriday = date.getDay() === 5;
    const paid = paidByDay[iso];
    const requested = requestDays.has(iso);

    const classes = ['day'];
    if (isFriday) classes.push('fri');
    if (iso >= windowStart && iso <= windowEnd) classes.push('win');
    if (iso === todayIso) classes.push('today');
    if (paid) classes.push('paid');
    if (iso === selectedDate) classes.push('sel');

    let label = date.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
    if (isFriday) label += ', día de pago';
    if (paid) label += `, cobro de anticipo ${eur(paid)}`;
    if (requested) label += ', petición registrada';

    html += `<button type="button" class="${classes.join(' ')}" data-act="pick" data-date="${iso}" aria-label="${label}">
      <span class="n">${day}</span>
      ${paid ? `<span class="amt">+${Math.round(paid)} €</span>` : ''}
      ${requested ? '<span class="dot" aria-hidden="true"></span>' : ''}
    </button>`;
  }
  $('cal').innerHTML = html;
}

function renderMonthDetail() {
  const { year } = view;
  const h = view.month < 6 ? 1 : 2;
  const key = `${year}-${h}`;
  const t = today();

  $('det-sub').textContent = `${halfName(h)} ${year} · ${h === 1 ? 'enero a junio' : 'julio a diciembre'}`;

  const advances = advancesIn(key);
  let html = '<div class="mrow head"><span>Mes</span><span>Tope acumulado</span><span>Pedido</span><span>Disponible</span></div>';
  let cumulativeRequested = 0;

  for (let i = 1; i <= 6; i++) {
    const month = h === 1 ? i - 1 : i + 5;
    const inMonth = sum(advances.filter((a) => fromIso(a.date).getMonth() === month));
    cumulativeRequested = round2(cumulativeRequested + inMonth);
    const cap = capFor(i);
    const available = round2(cap - cumulativeRequested);

    let chips = '';
    if (t.getFullYear() === year && t.getMonth() === month) chips += '<span class="chip">Hoy</span>';
    if (isExtraPayMonth(month)) chips += '<span class="chip pay">No hace falta pedir</span>';

    html += `<div class="mrow${month === view.month ? ' cur' : ''}">
      <span class="mname">${monthName(year, month)}${chips}</span>
      <span>${eur(cap)}</span>
      <span>${inMonth ? eur(inMonth) : '—'}</span>
      <span class="${available < 0 ? 'neg' : ''}">${eur(available)}</span>
    </div>`;
  }
  $('months').innerHTML = html;

  const total = capFor(6);
  const requested = requestedIn(key);
  $('totals').innerHTML = `
    <div><span>Tope del semestre (80%)</span><b class="num">${eur(total)}</b></div>
    <div><span>Pedido hasta ahora</span><b class="num">${eur(requested)}</b></div>
    <div><span>Aún anticipable en todo el semestre</span><b class="num">${eur(Math.max(0, round2(total - requested)))}</b></div>
    <div><span>Quedaría para la paga (aprox.)</span><b class="num">${eur(round2(state.ref - requested))}</b></div>`;

  $('det-foot').textContent =
    h === 1
      ? 'Esta paga se cobra en julio. El 20% no anticipable se suma ese mes.'
      : 'Esta paga se cobra en diciembre y ese mes no hace falta pedir anticipo. El 20% no anticipable se suma a la paga.';
}

function renderHistory() {
  if (!state.advances.length) {
    $('hist').innerHTML = '<p class="empty">Aún no has registrado anticipos.</p>';
    return;
  }

  const byYear = new Map();
  const sorted = [...state.advances].sort((a, b) => (a.date < b.date ? 1 : -1));
  for (const a of sorted) {
    const y = a.date.slice(0, 4);
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y).push(a);
  }

  const currentYear = String(today().getFullYear());
  let html = '';
  for (const [year, items] of byYear) {
    const open = openYears[year] ?? year === currentYear;
    const count = `${items.length} ${items.length === 1 ? 'anticipo' : 'anticipos'}`;
    html += `<details class="yr" data-year="${year}"${open ? ' open' : ''}>
      <summary><span>${year}</span><span class="yr-sum num">${count} · ${eur(round2(sum(items)))}</span></summary>
      <ul class="hist">`;

    for (const a of items) {
      const d = fromIso(a.date);
      const confirming = pendingDeleteId === a.id;
      html += `<li class="h-item">
        <div class="h-amt">${eur(a.amount)}</div>
        <div class="h-meta">
          <b>Pedido ${shortDate(d)}</b> · cobro ${shortDate(payday(d))}<br>
          ${halfName(half(d))} ${d.getFullYear()}${a.ticket ? ` · ticket ${escapeHtml(a.ticket)}` : ''}
        </div>
        <div class="h-btns">
          <button type="button" class="h-edit" data-act="edit" data-id="${escapeHtml(a.id)}" aria-label="Editar anticipo de ${eur(a.amount)}">${editingId === a.id ? 'Editando' : 'Editar'}</button>
          <button type="button" class="h-del${confirming ? ' confirm' : ''}" data-act="del" data-id="${escapeHtml(a.id)}">${confirming ? 'Confirmar' : 'Eliminar'}</button>
        </div>
      </li>`;
    }
    html += '</ul></details>';
  }
  $('hist').innerHTML = html;
}

function updateFormHint() {
  const value = $('f-date').value;
  const d = value ? fromIso(value) : null;
  if (!d || !isValidDate(d)) {
    $('f-hint').textContent = 'Elige una fecha válida.';
    $('f-warn').textContent = '';
    return;
  }

  const max = availableAt(d, editingId);
  const extraPayNote = isExtraPayMonth(d.getMonth()) ? ' · <b>No hace falta pedirlo este mes</b>' : '';
  $('f-hint').innerHTML = `Disponible en ${monthName(d.getFullYear(), d.getMonth())}: <b class="num">${eur(max)}</b> · Cobro el <b>${shortDate(payday(d))}</b>${extraPayNote}`;

  const amount = parseAmount($('f-amt').value);
  $('f-warn').textContent = isFinite(amount) && amount > max + 0.004 ? `Supera el tope en ${eur(round2(amount - max))}.` : '';
}

let mailBodyTooLong = false;
function updateMailLink() {
  const to = (state.email || '').trim();
  const subject = `Copia de seguridad de anticipos de paga extra ${toIso(today())}`;
  const body =
    'Copia de seguridad. Para recuperarla, pega este texto en la app (Copia de seguridad > Restaurar desde el texto).\n\n' +
    JSON.stringify(state);
  const mailto = (text) => `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;

  // Muchos clientes de correo cortan los mailto largos.
  let url = mailto(body);
  mailBodyTooLong = url.length > 1900;
  if (mailBodyTooLong) url = mailto('La copia de seguridad se ha copiado al portapapeles: pégala aquí.');
  $('bk-mail').setAttribute('href', url);
}

function renderAll() {
  renderHero();
  renderCalendar();
  renderMonthDetail();
  renderHistory();
  updateFormHint();
  updateMailLink();
  $('bk').value = JSON.stringify(state, null, 2);
  // No pisar lo que el usuario está escribiendo.
  if (document.activeElement !== $('bk-email')) $('bk-email').value = state.email || '';
  if (document.activeElement !== $('ref')) $('ref').value = formatAmountInput(state.ref);
}

let toastTimer;
function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

function copyToClipboard(text, onSuccess, onFail) {
  if (!navigator.clipboard) return onFail();
  navigator.clipboard.writeText(text).then(onSuccess, onFail);
}

// --- Acciones ---

const actions = {
  prev: () => moveMonth(-1),
  next: () => moveMonth(1),

  today() {
    const t = today();
    view = { year: t.getFullYear(), month: t.getMonth() };
    selectDate(toIso(t));
    renderMonthDetail();
  },

  pick(el) {
    selectDate(el.dataset.date);
    $('f-amt').focus({ preventScroll: true });
  },

  max() {
    const d = fromIso($('f-date').value);
    if (!isValidDate(d)) return;
    $('f-amt').value = formatAmountInput(availableAt(d, editingId));
    updateFormHint();
  },

  edit(el) {
    const a = state.advances.find((x) => x.id === el.dataset.id);
    if (!a) return;
    editingId = a.id;
    pendingDeleteId = null;
    $('f-date').value = a.date;
    $('f-amt').value = formatAmountInput(a.amount);
    $('f-ticket').value = a.ticket || '';
    selectedDate = a.date;
    view = { year: fromIso(a.date).getFullYear(), month: fromIso(a.date).getMonth() };
    renderAll();
    updateFormMode();
    $('form').scrollIntoView({ behavior: 'smooth', block: 'center' });
    $('f-amt').focus({ preventScroll: true });
  },

  'cancel-edit'() {
    stopEditing();
    renderAll();
  },

  del(el) {
    const id = el.dataset.id;
    if (pendingDeleteId !== id) {
      pendingDeleteId = id;
      renderHistory();
      return;
    }
    pendingDeleteId = null;
    if (editingId === id) stopEditing();
    replaceState({ ...state, advances: state.advances.filter((a) => a.id !== id) });
    toast('Anticipo eliminado');
  },

  'bk-copy'() {
    const textarea = $('bk');
    copyToClipboard(
      textarea.value,
      () => toast('Copiado'),
      () => {
        textarea.focus();
        textarea.select();
        toast('Selecciona el texto y cópialo con Ctrl+C');
      }
    );
  },

  'bk-dl'() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `anticipos-paga-extra-${toIso(today())}.json`;
    link.click();
    // Si se libera la URL en el mismo ciclo, algunos navegadores cancelan la descarga.
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  },

  'bk-mail'() {
    if (!mailBodyTooLong) {
      toast('Abriendo tu correo. Si no aparece, usa Copiar y pégalo en un mensaje.');
      return;
    }
    copyToClipboard(
      JSON.stringify(state),
      () => toast('Copia en el portapapeles: pégala en el correo'),
      () => toast('Usa Copiar y pega el texto en el correo')
    );
  },

  'bk-up': () => $('bk-file').click(),

  'bk-restore'() {
    if (importFromText($('bk').value)) toast('Datos restaurados');
    else toast('El texto no tiene un formato válido');
  },
};

function updateFormMode() {
  const editing = editingId !== null;
  $('form-title').textContent = editing ? 'Editar anticipo' : 'Registrar un anticipo';
  $('f-submit').textContent = editing ? 'Guardar cambios' : 'Guardar anticipo';
  $('f-cancel').hidden = !editing;
}

function stopEditing() {
  editingId = null;
  $('f-amt').value = '';
  $('f-ticket').value = '';
  updateFormMode();
}

function moveMonth(delta) {
  const d = new Date(view.year, view.month + delta, 1);
  view = { year: d.getFullYear(), month: d.getMonth() };
  renderCalendar();
  renderMonthDetail();
}

function selectDate(iso) {
  selectedDate = iso;
  $('f-date').value = iso;
  renderCalendar();
  updateFormHint();
}

function importFromText(text) {
  try {
    const next = normalizeState(JSON.parse(text));
    if (!next) return false;
    replaceState(next);
    return true;
  } catch {
    return false;
  }
}

// --- Eventos ---

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (el) {
    actions[el.dataset.act]?.(el);
    return;
  }
  // Un clic fuera cancela la confirmación de borrado (salvo al plegar/desplegar un año).
  if (pendingDeleteId && !e.target.closest('summary')) {
    pendingDeleteId = null;
    renderHistory();
  }
});

$('form').addEventListener('submit', (e) => {
  e.preventDefault();
  const date = $('f-date').value;
  const amount = parseAmount($('f-amt').value);
  if (!date || !isValidDate(fromIso(date))) {
    $('f-warn').textContent = 'Elige la fecha de la petición.';
    return;
  }
  if (!isFinite(amount) || amount <= 0) {
    $('f-warn').textContent = 'Escribe un importe mayor que cero.';
    return;
  }

  const ticket = $('f-ticket').value.trim();
  const existing = editingId && state.advances.find((a) => a.id === editingId);
  if (existing) {
    Object.assign(existing, { date, amount: round2(amount), ticket });
  } else {
    state.advances.push({ id: newId(), date, amount: round2(amount), ticket });
  }
  saveState();
  stopEditing();
  renderAll();
  toast(existing ? 'Anticipo actualizado' : 'Anticipo guardado');
});

$('f-date').addEventListener('change', () => {
  selectedDate = $('f-date').value;
  renderCalendar();
  updateFormHint();
});

$('f-amt').addEventListener('input', updateFormHint);

$('ref').addEventListener('change', () => {
  const value = parseAmount($('ref').value);
  if (isFinite(value) && value > 0) {
    state.ref = round2(value);
    saveState();
    toast('Sueldo de referencia actualizado');
  } else {
    toast('Escribe un importe válido');
  }
  renderAll();
});

// El evento toggle no burbujea, por eso se escucha en fase de captura.
$('hist').addEventListener(
  'toggle',
  (e) => {
    const year = e.target.dataset?.year;
    if (year) openYears[year] = e.target.open;
  },
  true
);

$('bk-email').addEventListener('change', () => {
  const email = $('bk-email').value.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    toast('Ese correo no parece válido');
    return;
  }
  state.email = email;
  saveState();
  renderAll();
  toast(email ? 'Correo guardado' : 'Correo borrado');
});

$('bk-file').addEventListener('change', () => {
  const input = $('bk-file');
  const file = input.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    if (importFromText(String(reader.result))) {
      const n = state.advances.length;
      toast(n === 1 ? 'Importado 1 anticipo' : `Importados ${n} anticipos`);
    } else toast('El archivo no tiene un formato válido');
  };
  reader.onerror = () => toast('No se pudo leer el archivo');
  reader.readAsText(file);
  input.value = '';
});

$('f-date').value = selectedDate;
renderAll();
