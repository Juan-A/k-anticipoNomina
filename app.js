(function () {
  'use strict';
  var KEY = 'anticipos-paga-extra-v1';
  var storageOK = true;
  var $ = function (id) { return document.getElementById(id); };
  var nf = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
  var eur = function (n) { return nf.format(n); };
  var r2 = function (n) { return Math.round((n + Number.EPSILON) * 100) / 100; };
  var pad = function (n) { return String(n).padStart(2, '0'); };
  var iso = function (d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  var parse = function (s) { var p = String(s).split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); };
  var addDays = function (d, n) { var x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); return x; };
  var today0 = function () { var n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); };
  var cap1 = function (s) { return s.charAt(0).toUpperCase() + s.slice(1); };
  var fd = function (d) { return d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', ''); };
  var fmonth = function (y, m) { return new Date(y, m, 1).toLocaleDateString('es-ES', { month: 'long' }); };
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var uid = function () { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); };
  var num = function (s) {
    s = String(s).trim();
    if (s.indexOf(',') > -1) s = s.replace(/\./g, '').replace(',', '.');
    var v = parseFloat(s);
    return isFinite(v) ? v : NaN;
  };
  var inputNum = function (n) { return String(n).replace('.', ','); };

  /* ---------- Estado ---------- */
  function seed() {
    return { ref: 1500.00, advances: [] };
  }
  function valid(s) {
    return s && typeof s.ref === 'number' && s.ref > 0 && Array.isArray(s.advances) && s.advances.every(function (a) {
      return a && typeof a.amount === 'number' && typeof a.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(a.date);
    });
  }
  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) { var s = JSON.parse(raw); if (valid(s)) { s.advances.forEach(function (a) { if (!a.id) a.id = uid(); }); return s; } }
    } catch (e) { storageOK = false; }
    return seed();
  }
  var state = load();
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { storageOK = false; $('storage-banner').hidden = false; }
  }
  if (!storageOK) $('storage-banner').hidden = false;

  /* ---------- Cálculo ---------- */
  var base = function () { return r2(state.ref / 6); };
  var capFor = function (n) { return r2(base() * n * 0.8); };
  var semKey = function (d) { return d.getFullYear() + '-' + (d.getMonth() < 6 ? 1 : 2); };
  var monthsAccrued = function (d) { return d.getMonth() < 6 ? d.getMonth() + 1 : d.getMonth() - 5; };
  var requestedIn = function (key, excludeId) {
    return r2(state.advances.filter(function (a) { return a.id !== excludeId && semKey(parse(a.date)) === key; })
      .reduce(function (s, a) { return s + a.amount; }, 0));
  };
  var availableAt = function (d, excludeId) {
    return Math.max(0, r2(capFor(monthsAccrued(d)) - requestedIn(semKey(d), excludeId)));
  };
  function payFriday(d) {
    var dow = d.getDay(), add;
    if (dow >= 1 && dow <= 4) add = 5 - dow;
    else if (dow === 5) add = 7;
    else if (dow === 6) add = 6;
    else add = 5;
    return addDays(d, add);
  }
  var semName = function (h) { return h === 1 ? 'Paga de julio' : 'Paga de diciembre'; };

  /* ---------- Vista ---------- */
  var t0 = today0();
  var view = { y: t0.getFullYear(), m: t0.getMonth() };
  var selDate = iso(t0);
  var confirmId = null;
  var openYears = {};

  function renderHero() {
    var t = today0();
    var n = monthsAccrued(t), key = semKey(t), h = t.getMonth() < 6 ? 1 : 2;
    var cap = capFor(n), req = requestedIn(key), avail = Math.max(0, r2(cap - req));
    var full = capFor(6) || 1;
    var pReq = Math.min(100, req / full * 100), pAv = Math.min(100 - pReq, avail / full * 100);
    var nf_ = payFriday(t), dl = addDays(nf_, -1);
    var diff = Math.round((dl - t) / 86400000);
    var left = diff <= 0 ? 'hoy' : diff === 1 ? 'mañana' : 'en ' + diff + ' días';
    var html = '';
    html += '<div>';
    html += '<p class="label">Puedes pedir hoy</p>';
    html += '<p class="big num' + (avail === 0 ? ' zero' : '') + '">' + eur(avail) + '</p>';
    html += '<p class="sem">' + semName(h) + ' ' + t.getFullYear() + ' · ' + n + ' de 6 meses devengados</p>';
    html += '<div class="bar" role="img" aria-label="Pedido ' + eur(req) + ', disponible ' + eur(avail) + ' de ' + eur(full) + '"><i class="b-req" style="width:' + pReq + '%"></i><i class="b-av" style="width:' + pAv + '%"></i></div>';
    html += '<div class="bar-legend"><span class="l1">Pedido ' + eur(req) + '</span><span class="l2">Disponible ' + eur(avail) + '</span><span class="l3">Aún sin devengar ' + eur(Math.max(0, r2(full - cap))) + '</span></div>';
    html += '</div>';
    html += '<div class="facts">';
    html += '<div class="fact"><span>Próximo cobro</span><b>' + fd(nf_) + '</b></div>';
    html += '<div class="fact"><span>Último día para pedirlo</span><b>' + fd(dl) + ' (' + left + ')</b></div>';
    html += '<div class="fact"><span>Tope acumulado hasta hoy</span><b class="num">' + eur(cap) + '</b></div>';
    html += '<div class="fact"><span>Cada mes se suman</span><b class="num">' + eur(capFor(1)) + '</b></div>';
    html += '</div>';
    var m = t.getMonth();
    if (m === 6 || m === 11) {
      html += '<p class="note warn">No hace falta pedir anticipo en ' + fmonth(t.getFullYear(), m) + ': este mes cobras la paga extra y lo anticipado se descontaría de ella.</p>';
    } else if (avail === 0 && n < 6) {
      html += '<p class="note">No queda nada por anticipar este mes. El 1 de ' + fmonth(t.getFullYear(), m + 1) + ' se suman ' + eur(r2(capFor(n + 1) - capFor(n))) + '.</p>';
    }
    $('hero').innerHTML = html;
  }

  function renderCal() {
    var y = view.y, m = view.m;
    $('cal-title').textContent = new Date(y, m, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
    var monday = new Date(2024, 0, 1);
    var html = '';
    for (var i = 0; i < 7; i++) {
      html += '<div class="dow" aria-hidden="true">' + addDays(monday, i).toLocaleDateString('es-ES', { weekday: 'short' }).replace('.', '') + '</div>';
    }
    var lead = (new Date(y, m, 1).getDay() + 6) % 7;
    var days = new Date(y, m + 1, 0).getDate();
    var t = today0(), tIso = iso(t);
    var nf_ = payFriday(t), wS = iso(addDays(nf_, -4)), wE = iso(addDays(nf_, -1));
    var payMap = {}, reqSet = {};
    state.advances.forEach(function (a) {
      var pd = iso(payFriday(parse(a.date)));
      payMap[pd] = (payMap[pd] || 0) + a.amount;
      reqSet[a.date] = true;
    });
    for (var b = 0; b < lead; b++) html += '<div class="blank"></div>';
    for (var d = 1; d <= days; d++) {
      var dt = new Date(y, m, d), s = iso(dt);
      var cls = 'day';
      if (dt.getDay() === 5) cls += ' fri';
      if (s >= wS && s <= wE) cls += ' win';
      if (s === tIso) cls += ' today';
      if (payMap[s]) cls += ' paid';
      if (s === selDate) cls += ' sel';
      var label = dt.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
      if (dt.getDay() === 5) label += ', día de pago';
      if (payMap[s]) label += ', cobro de anticipo ' + eur(payMap[s]);
      if (reqSet[s]) label += ', petición registrada';
      html += '<button type="button" class="' + cls + '" data-act="pick" data-date="' + s + '" aria-label="' + label + '">'
        + '<span class="n">' + d + '</span>'
        + (payMap[s] ? '<span class="amt">+' + Math.round(payMap[s]) + ' €</span>' : '')
        + (reqSet[s] ? '<span class="dot" aria-hidden="true"></span>' : '')
        + '</button>';
    }
    $('cal').innerHTML = html;
  }

  function renderDetails() {
    var y = view.y, h = view.m < 6 ? 1 : 2;
    var key = y + '-' + h;
    var t = today0();
    $('det-sub').textContent = semName(h) + ' ' + y + ' · ' + (h === 1 ? 'enero a junio' : 'julio a diciembre');
    var advs = state.advances.filter(function (a) { return semKey(parse(a.date)) === key; });
    var html = '<div class="mrow head"><span>Mes</span><span>Tope acumulado</span><span>Pedido</span><span>Disponible</span></div>';
    var cumReq = 0;
    for (var i = 1; i <= 6; i++) {
      var month = h === 1 ? i - 1 : i + 5;
      var inMonth = advs.filter(function (a) { return parse(a.date).getMonth() === month; })
        .reduce(function (s, a) { return s + a.amount; }, 0);
      cumReq = r2(cumReq + inMonth);
      var cumCap = capFor(i), av = r2(cumCap - cumReq);
      var cls = 'mrow' + (month === view.m ? ' cur' : '');
      var chips = '';
      if (t.getFullYear() === y && t.getMonth() === month) chips += '<span class="chip">Hoy</span>';
      if (month === 6 || month === 11) chips += '<span class="chip pay">No hace falta pedir</span>';
      html += '<div class="' + cls + '"><span class="mname">' + fmonth(y, month) + chips + '</span>'
        + '<span>' + eur(cumCap) + '</span>'
        + '<span>' + (inMonth ? eur(inMonth) : '—') + '</span>'
        + '<span class="' + (av < 0 ? 'neg' : '') + '">' + eur(av) + '</span></div>';
    }
    $('months').innerHTML = html;
    var total = capFor(6), req = requestedIn(key), rest = r2(total - req);
    $('totals').innerHTML =
      '<div><span>Tope del semestre (80%)</span><b class="num">' + eur(total) + '</b></div>' +
      '<div><span>Pedido hasta ahora</span><b class="num">' + eur(req) + '</b></div>' +
      '<div><span>Aún anticipable en todo el semestre</span><b class="num">' + eur(Math.max(0, rest)) + '</b></div>' +
      '<div><span>Quedaría para la paga (aprox.)</span><b class="num">' + eur(r2(state.ref - req)) + '</b></div>';
    $('det-foot').textContent = h === 1
      ? 'Esta paga se cobra en julio. El 20% no anticipable se suma ese mes.'
      : 'Esta paga se cobra en diciembre y ese mes no hace falta pedir anticipo. El 20% no anticipable se suma a la paga.';
  }

  function renderHistory() {
    var list = state.advances.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    if (!list.length) { $('hist').innerHTML = '<p class="empty">Aún no has registrado anticipos.</p>'; return; }
    var html = '', cur = null, sums = {}, counts = {};
    list.forEach(function (a) { var y = a.date.slice(0, 4); sums[y] = r2((sums[y] || 0) + a.amount); counts[y] = (counts[y] || 0) + 1; });
    list.forEach(function (a) {
      var d = parse(a.date), h = d.getMonth() < 6 ? 1 : 2, y = a.date.slice(0, 4);
      if (y !== cur) {
        if (cur !== null) html += '</ul></details>';
        var open = openYears[y] === undefined ? y === String(today0().getFullYear()) : openYears[y];
        html += '<details class="yr" data-year="' + y + '"' + (open ? ' open' : '') + '><summary><span>' + y + '</span><span class="yr-sum num">' + counts[y] + (counts[y] === 1 ? ' anticipo' : ' anticipos') + ' · ' + eur(sums[y]) + '</span></summary><ul class="hist">';
        cur = y;
      }
      html += '<li class="h-item"><div class="h-amt">' + eur(a.amount) + '</div>'
        + '<div class="h-meta"><b>Pedido ' + fd(d) + '</b> · cobro ' + fd(payFriday(d)) + '<br>'
        + semName(h) + ' ' + d.getFullYear() + (a.ticket ? ' · ticket ' + esc(a.ticket) : '') + '</div>'
        + '<button type="button" class="h-del' + (confirmId === a.id ? ' confirm' : '') + '" data-act="del" data-id="' + esc(a.id) + '">'
        + (confirmId === a.id ? 'Confirmar' : 'Eliminar') + '</button></li>';
    });
    $('hist').innerHTML = html + '</ul></details>';
  }

  function updateHint() {
    var v = $('f-date').value, d = v ? parse(v) : null;
    if (!d || isNaN(d.getTime())) { $('f-hint').textContent = 'Elige una fecha válida.'; $('f-warn').textContent = ''; return; }
    var max = availableAt(d), pay = payFriday(d);
    $('f-hint').innerHTML = 'Disponible en ' + fmonth(d.getFullYear(), d.getMonth()) + ': <b class="num">' + eur(max) + '</b> · Cobro el <b>' + fd(pay) + '</b>' + ((d.getMonth() === 6 || d.getMonth() === 11) ? ' · <b>No hace falta pedirlo este mes</b>' : '');
    var amt = num($('f-amt').value);
    $('f-warn').textContent = (isFinite(amt) && amt > max + 0.004) ? 'Supera el tope en ' + eur(r2(amt - max)) + '.' : '';
  }

  function renderAll() {
    renderHero(); renderCal(); renderDetails(); renderHistory(); updateHint();
    $('bk').value = JSON.stringify(state, null, 2);
    updateMail();
    if (document.activeElement !== $('bk-email')) $('bk-email').value = state.email || '';
    if (document.activeElement !== $('ref')) $('ref').value = inputNum(state.ref.toFixed(2));
  }

  var longMail = false;
  function updateMail() {
    var e = (state.email || '').trim();
    var subject = 'Copia de seguridad de anticipos de paga extra ' + iso(today0());
    var body = 'Copia de seguridad. Para recuperarla, pega este texto en la app (Copia de seguridad > Restaurar desde el texto).\n\n' + JSON.stringify(state);
    var mk = function (b) { return 'mailto:' + e + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(b); };
    var url = mk(body);
    longMail = url.length > 1900;
    if (longMail) url = mk('La copia de seguridad se ha copiado al portapapeles: pegala aqui.');
    $('bk-mail').setAttribute('href', url);
  }
  var toastT;
  function toast(msg) {
    var el = $('toast'); el.textContent = msg; el.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(function () { el.classList.remove('show'); }, 2600);
  }

  /* ---------- Eventos ---------- */
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]');
    if (!el) { if (confirmId && !e.target.closest('summary')) { confirmId = null; renderHistory(); } return; }
    var act = el.getAttribute('data-act');
    if (act === 'prev' || act === 'next') {
      var d = new Date(view.y, view.m + (act === 'next' ? 1 : -1), 1);
      view = { y: d.getFullYear(), m: d.getMonth() };
      renderCal(); renderDetails();
    } else if (act === 'today') {
      var t = today0(); view = { y: t.getFullYear(), m: t.getMonth() }; selDate = iso(t);
      $('f-date').value = selDate; renderCal(); renderDetails(); updateHint();
    } else if (act === 'pick') {
      selDate = el.getAttribute('data-date'); $('f-date').value = selDate;
      renderCal(); updateHint();
      $('f-amt').focus({ preventScroll: true });
    } else if (act === 'max') {
      var dd = parse($('f-date').value);
      if (isNaN(dd.getTime())) return;
      $('f-amt').value = inputNum(availableAt(dd).toFixed(2)); updateHint();
    } else if (act === 'del') {
      var id = el.getAttribute('data-id');
      if (confirmId === id) {
        state.advances = state.advances.filter(function (a) { return a.id !== id; });
        confirmId = null; save(); renderAll(); toast('Anticipo eliminado');
      } else { confirmId = id; renderHistory(); }
    } else if (act === 'bk-copy') {
      var ta = $('bk');
      var done = function () { toast('Copiado'); };
      var fallback = function () { ta.focus(); ta.select(); toast('Selecciona el texto y cópialo con Ctrl+C'); };
      try { navigator.clipboard.writeText(ta.value).then(done, fallback); } catch (err) { fallback(); }
    } else if (act === 'bk-dl') {
      var blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'anticipos-paga-extra-' + iso(today0()) + '.json';
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 0);
    } else if (act === 'bk-mail') {
      var fail = function () { toast('Usa Copiar y pega el texto en el correo'); };
      if (longMail) {
        try { navigator.clipboard.writeText(JSON.stringify(state)).then(function () { toast('Copia en el portapapeles: pégala en el correo'); }, fail); } catch (err) { fail(); }
      } else { toast('Abriendo tu correo. Si no aparece, usa Copiar y pégalo en un mensaje.'); }
    } else if (act === 'bk-up') {
      $('bk-file').click();
    } else if (act === 'bk-restore') {
      try {
        var s = JSON.parse($('bk').value);
        if (!valid(s)) throw new Error('formato');
        s.advances.forEach(function (a) { if (!a.id) a.id = uid(); });
        state = s; save(); renderAll(); toast('Datos restaurados');
      } catch (err) { toast('El texto no tiene un formato válido'); }
    }
  });

  $('form').addEventListener('submit', function (e) {
    e.preventDefault();
    var v = $('f-date').value, amt = num($('f-amt').value);
    if (!v || isNaN(parse(v).getTime())) { $('f-warn').textContent = 'Elige la fecha de la petición.'; return; }
    if (!isFinite(amt) || amt <= 0) { $('f-warn').textContent = 'Escribe un importe mayor que cero.'; return; }
    state.advances.push({ id: uid(), date: v, amount: r2(amt), ticket: $('f-ticket').value.trim() });
    save();
    $('f-amt').value = ''; $('f-ticket').value = '';
    renderAll(); toast('Anticipo guardado');
  });
  $('f-date').addEventListener('change', function () { selDate = $('f-date').value; renderCal(); updateHint(); });
  $('f-amt').addEventListener('input', updateHint);
  $('ref').addEventListener('change', function () {
    var v = num($('ref').value);
    if (isFinite(v) && v > 0) { state.ref = r2(v); save(); toast('Sueldo de referencia actualizado'); }
    else toast('Escribe un importe válido');
    renderAll();
  });

  $('f-date').value = selDate;
  $('hist').addEventListener('toggle', function (e) {
    var y = e.target && e.target.getAttribute && e.target.getAttribute('data-year');
    if (y) openYears[y] = e.target.open;
  }, true);

  $('bk-email').addEventListener('change', function () {
    var v = $('bk-email').value.trim();
    if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { toast('Ese correo no parece válido'); return; }
    state.email = v; save(); renderAll(); toast(v ? 'Correo guardado' : 'Correo borrado');
  });

  $('bk-file').addEventListener('change', function () {
    var inp = $('bk-file'), f = inp.files && inp.files[0];
    if (!f) return;
    var rd = new FileReader();
    rd.onload = function () {
      try {
        var s = JSON.parse(String(rd.result));
        if (!valid(s)) throw new Error('formato');
        s.advances.forEach(function (a) { if (!a.id) a.id = uid(); });
        state = s; save(); renderAll(); toast('Importados ' + s.advances.length + ' anticipos');
      } catch (err) { toast('El archivo no tiene un formato válido'); }
    };
    rd.onerror = function () { toast('No se pudo leer el archivo'); };
    rd.readAsText(f);
    inp.value = '';
  });

  renderAll();
})();
