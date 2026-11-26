/* Fuel Tracker: app shell, Overview and History screens. The Add and Settings screens are in forms.js. */
(function (root) {
  'use strict';
  const C = root.FT.calc, St = root.FT.store, Ch = root.FT.charts, esc = Ch.esc;
  const $ = (sel, el) => (el || document).querySelector(sel);

  const svg = (body, w) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w || 2}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  const ICON = {
    pump: svg('<path d="M4 21V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v16"/><path d="M3 21h13"/><path d="M6.5 8h6"/><path d="M15 10h1.5a1.5 1.5 0 0 1 1.5 1.5V16a1.5 1.5 0 0 0 3 0V8.5L18.5 6"/>'),
    gauge: svg('<path d="M3.5 17.5a9 9 0 1 1 17 0"/><path d="M12 14l4.5-4.5"/><circle cx="12" cy="14" r="1.2"/>'),
    plus: svg('<path d="M12 5v14M5 12h14"/>', 2.8),
    list: svg('<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>', 2.2),
    sliders: svg('<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>'),
    up: svg('<path d="M12 19V5M6 11l6-6 6 6"/>', 2.4),
    down: svg('<path d="M12 5v14M6 13l6 6 6-6"/>', 2.4),
    trash: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
    cloud: svg('<path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 9.5a4 4 0 0 1-.5 8.5z"/>'),
    phone: svg('<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>'),
  };

  const S = {
    store: null,
    status: 'starting', // starting | loading | slow | ready | error
    data: { entries: [], vehicles: [], config: {} },
    tab: 'overview',
    editId: null,
    vehicleId: St.prefs.get('vehicle', null),
    formKey: null,
  };

  const DEF = C.localeDefaults();
  const ALLOWED = { dist: C.DIST, vol: C.VOL, econ: C.ECON };
  function cfg() {
    const out = Object.assign({}, DEF);
    const c = S.data.config || {};
    for (const k of ['dist', 'vol', 'econ']) if (c[k] && ALLOWED[k][c[k]]) out[k] = c[k];
    if (typeof c.currency === 'string' && /^[A-Z]{3}$/.test(c.currency)) out.currency = c.currency;
    return out;
  }

  /* ----- What the screens show: the real log, or sample data before the log starts ----- */
  const isSample = () => S.status === 'ready' && !S.data.vehicles.length && !S.data.entries.length && !S.data.config.started;
  let sampleCache = null;
  function view() {
    if (isSample()) {
      const cur = cfg().currency;
      if (!sampleCache || sampleCache.cur !== cur) sampleCache = Object.assign({ cur }, C.sampleData(cur));
      return { vehicles: sampleCache.vehicles, entries: sampleCache.entries, sample: true };
    }
    const vehicles = S.data.vehicles.slice().sort((a, b) => (a.created || 0) - (b.created || 0));
    return { vehicles, entries: S.data.entries, sample: false };
  }
  const currentVehicle = (v) => v.vehicles.find((x) => x.id === S.vehicleId) || v.vehicles[0] || null;
  const entriesOf = (v, veh) => (veh ? v.entries.filter((e) => e.vehicleId === veh.id) : []);

  /* ----- Formatting in the person's units ----- */
  const U = {
    dist: () => C.DIST[cfg().dist],
    vol: () => C.VOL[cfg().vol],
    econUnit: () => C.ECON[cfg().econ].unit,
    d: (km, digits) => C.fmt(C.fromKm(km, cfg().dist), digits == null ? 0 : digits),
    v: (l, digits) => C.fmt(C.fromL(l, cfg().vol), digits == null ? 2 : digits),
    econ: (km, l) => C.econ(km, l, cfg().econ),
    money: (n, o) => C.money(n, cfg().currency, o),
    perVol: (pricePerL) => pricePerL * (C.L_PER[cfg().vol] || 1),
  };
  const iso = (s) => { const p = String(s).split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); };
  const DF = {
    short: new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }),
    month: new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }),
    monthName: new Intl.DateTimeFormat(undefined, { month: 'long' }),
    mon: new Intl.DateTimeFormat(undefined, { month: 'short' }),
    narrow: new Intl.DateTimeFormat(undefined, { month: 'narrow' }),
    wd: new Intl.DateTimeFormat(undefined, { weekday: 'short' }),
  };

  /* ----- Feedback ----- */
  let toastTimer = null;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
  }

  function confirmBox(o) {
    return new Promise((resolve) => {
      const d = $('#dialog');
      d.innerHTML = `<div class="panel" role="alertdialog" aria-modal="true" aria-labelledby="dlg-t" aria-describedby="dlg-b">
        <h3 id="dlg-t">${esc(o.title)}</h3><p id="dlg-b">${esc(o.body)}</p>
        <div class="btns"><button type="button" class="btn" data-a="no">Cancel</button>
        <button type="button" class="btn ${o.danger === false ? 'primary' : 'destructive'}" data-a="yes">${esc(o.ok || 'Delete')}</button></div></div>`;
      d.hidden = false;
      const done = (val) => { d.hidden = true; d.innerHTML = ''; d.onclick = null; document.removeEventListener('keydown', onKey); resolve(val); };
      const onKey = (e) => { if (e.key === 'Escape') done(false); };
      d.onclick = (e) => {
        const b = e.target.closest('[data-a]');
        if (b) done(b.dataset.a === 'yes'); else if (e.target === d) done(false);
      };
      document.addEventListener('keydown', onKey);
      $('[data-a="no"]', d).focus();
    });
  }

  function writeError(err) {
    const code = err && err.code;
    if (code === 'quota_exceeded') return toast('Your log is full. Delete old fill-ups to add more.');
    if (code === 'invalid_argument') return toast('You can view this log but not change it.');
    if (code === 'storage') return toast(err.message);
    toast('That change was not saved. Check your connection and try again.');
  }

  /* ----- Shell ----- */
  const TABS = [
    ['overview', 'Overview', ICON.gauge],
    ['add', 'Add', `<span class="plus">${ICON.plus}</span>`],
    ['history', 'History', ICON.list],
    ['setup', 'Settings', ICON.sliders],
  ];
  const TITLES = { overview: 'Overview', add: 'Add fill-up', history: 'History', setup: 'Settings' };

  function renderShell() {
    $('#app').innerHTML = `<div class="shell">
      <header class="top"><div><div class="brand">${ICON.pump}<span>Fuel Tracker</span></div><h1 id="title">Overview</h1></div><div id="veh" class="vehicle-name"></div></header>
      <main id="view" class="view"></main></div>
      <nav class="tabbar" aria-label="Sections"><div class="in">${TABS.map(([id, label, icon]) =>
        `<button type="button" class="tab${id === 'add' ? ' add' : ''}" data-tab="${id}">${icon}<span>${label}</span></button>`).join('')}</div></nav>
      <div id="toast" class="toast" role="status" aria-live="polite"></div>
      <div id="dialog" class="dialog" hidden></div>`;
    $('.tabbar').addEventListener('click', (e) => {
      const b = e.target.closest('[data-tab]');
      if (b) go(b.dataset.tab);
    });
    $('#view').addEventListener('click', onViewClick);
  }

  function renderHeader() {
    $('#title').textContent = S.tab === 'add' && S.editId ? 'Edit fill-up' : TITLES[S.tab];
    document.querySelectorAll('.tab').forEach((b) => {
      if (b.dataset.tab === S.tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    const box = $('#veh');
    const v = view();
    const veh = currentVehicle(v);
    if (S.status !== 'ready' || !veh || (v.sample && S.tab === 'add')) { box.className = 'vehicle-name'; box.textContent = ''; return; }
    if (v.vehicles.length < 2) { box.className = 'vehicle-name'; box.textContent = veh.name; return; }
    box.className = 'vehicle-pick';
    box.innerHTML = `<select id="vehicle-select" aria-label="Vehicle">${v.vehicles.map((x) =>
      `<option value="${esc(x.id)}"${x.id === veh.id ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select>`;
    $('#vehicle-select').onchange = (e) => { setVehicle(e.target.value); };
  }

  function setVehicle(id) {
    S.vehicleId = id;
    St.prefs.set('vehicle', id);
    S.formKey = null;
    if (S.tab === 'add' && S.editId) S.editId = null;
    render();
  }

  function go(tab, opts) {
    S.tab = tab;
    S.editId = (opts && opts.editId) || null;
    S.formKey = null;
    render();
    window.scrollTo(0, 0);
  }

  function render() {
    renderHeader();
    const main = $('#view');
    if (S.status === 'starting' || S.status === 'loading' || S.status === 'slow') {
      main.innerHTML = `<div class="loading">${S.status === 'slow' ? 'Still connecting to your saved fill-ups…' : 'Loading your fill-ups…'}</div>`;
      return;
    }
    if (S.status === 'error') {
      main.innerHTML = `<div class="banner warn"><p>Your saved fill-ups could not be loaded. Reload the page to try again.</p></div>`;
      return;
    }
    if (S.tab === 'add') return root.FT.views.add(main);
    S.formKey = null;
    if (S.tab === 'setup') return root.FT.views.settings(main);
    if (S.tab === 'history') { main.innerHTML = historyHTML(); return; }
    overview(main);
  }

  /* ----- Banners ----- */
  function bannerHTML(v) {
    let h = '';
    if (S.store && S.store.fallback) {
      h += `<div class="banner warn"><p>Your fill-ups are being saved in this browser only. Sign in to Claude to keep them in your account.</p></div>`;
    }
    if (v.sample) {
      h += `<div class="banner"><p><b>You are looking at sample data.</b> It shows what the app does after a few fill-ups. Your own log starts empty.</p>
        <div class="row-actions"><button type="button" class="btn small primary" data-act="start">Start my log</button></div></div>`;
    }
    if (S.store && S.store.kind === 'local' && !S.store.fallback && !v.sample && isIOSSafariTab() && !St.prefs.get('installHintDone', false)) {
      h += `<div class="banner"><p><b>Install it on your iPhone:</b> tap the Share button, then <b>Add to Home Screen</b>. It then opens like an app and works offline.</p>
        <div class="row-actions"><button type="button" class="btn small" data-act="hint-done">Got it</button></div></div>`;
    }
    return h;
  }
  function isIOSSafariTab() {
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform));
    const standalone = navigator.standalone || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
    return ios && !standalone;
  }

  /* ----- Overview ----- */
  function overview(main) {
    const v = view();
    const veh = currentVehicle(v);
    const c = cfg();
    if (!veh) {
      main.innerHTML = bannerHTML(v) + `<div class="card"><h2>Add a vehicle to begin</h2><p class="sub">Your fill-ups are grouped by vehicle.</p>
        <div class="actions" style="margin-top:12px"><button type="button" class="btn primary block" data-act="go-add">Add a vehicle</button></div></div>`;
      return;
    }
    const a = C.analyze(entriesOf(v, veh));
    const E = C.ECON[c.econ];
    let h = bannerHTML(v);

    // Headline
    if (a.segments.length) {
      const avg = U.econ(a.segKm, a.segL);
      const last = U.econ(a.lastSeg.km, a.lastSeg.liters);
      const diff = (last - avg) / avg;
      const better = E.lowerIsBetter ? diff < 0 : diff > 0;
      const chip = a.segments.length < 2 ? ''
        : Math.abs(diff) < 0.01
        ? `<span class="delta">Same as average</span>`
        : `<span class="delta ${better ? 'good' : 'bad'}">${diff > 0 ? ICON.up : ICON.down}${C.fmt(Math.abs(diff) * 100, 0)}% ${better ? 'better' : 'worse'}</span>`;
      h += `<section class="card hero" aria-label="Average consumption">
        <div class="label">Average consumption</div>
        <div class="big"><span class="num">${C.fmt(avg, 1, 1)}</span><span class="unit">${esc(E.unit)}</span></div>
        <div class="line2"><span>Last tank ${C.fmt(last, 1, 1)} ${esc(E.unit)}</span>${chip}</div>
        <p class="sub">Over ${U.d(a.segKm)} ${U.dist()} and ${a.segments.length} full ${a.segments.length === 1 ? 'tank' : 'tanks'} · ${a.count} fill-ups logged</p>
      </section>`;
    } else {
      const fulls = a.list.filter((e) => e.full).length;
      const pct = Math.min(1, fulls / 2) * 100;
      h += `<section class="card hero"><div class="label">Average consumption</div>
        <h2>${a.count ? 'One more full tank to go' : 'Log your first fill-up'}</h2>
        <p class="sub">Fill the tank to the top and log it. Consumption appears after your second full tank, measured from the first one.</p>
        <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="2" aria-valuenow="${Math.min(2, fulls)}" aria-label="Full tanks logged"><span style="width:${pct}%"></span></div>
        <div class="actions" style="margin-top:14px"><button type="button" class="btn primary block" data-act="go-add">Add fill-up</button></div></section>`;
    }

    // Stat tiles
    const now = new Date();
    const mKey = C.todayISO(now).slice(0, 7);
    const perDist = a.costPerKm == null ? null : a.costPerKm * (c.dist === 'mi' ? C.KM_PER_MI : 1);
    const tiles = [
      ['Cost per ' + U.dist(), perDist == null ? '–' : U.money(perDist, { price: true })],
      ['Spent in ' + DF.monthName.format(now), U.money(a.months[mKey] || 0)],
      ['Last price paid', a.lastPricePerL == null ? '–' : `${U.money(U.perVol(a.lastPricePerL), { price: true })}<small>/${esc(U.vol())}</small>`],
      ['Distance logged', `${U.d(a.distance)} <small>${esc(U.dist())}</small>`],
      ['Total spent', U.money(a.totalCost)],
      ['Fuel bought', `${U.v(a.totalLiters, 1)} <small>${esc(U.vol())}</small>`],
    ];
    h += `<div class="stats">${tiles.map(([k, val]) => `<div class="stat"><div class="k">${esc(k)}</div><div class="v">${val}</div></div>`).join('')}</div>`;

    h += `<section class="card"><h2>Consumption per tank</h2><p class="sub">${esc(E.name)}, ${E.lowerIsBetter ? 'lower' : 'higher'} is better. Tap a point for details.</p>
      ${a.segments.length ? '<div class="chart-box" id="chart-econ"></div>' : '<div class="empty-chart">Each full tank after the first adds a point here.</div>'}</section>`;
    h += `<section class="card"><h2>Spending by month</h2><p class="sub">Last 12 months. Month totals are also in History.</p>
      ${a.totalCost > 0 ? '<div class="chart-box" id="chart-spend"></div>' : '<div class="empty-chart">Add the amount you paid to see monthly spending.</div>'}</section>`;
    main.innerHTML = h;
    drawCharts(a);
  }

  function drawCharts(a) {
    const E = C.ECON[cfg().econ];
    const econBox = $('#chart-econ');
    if (econBox) {
      const pts = a.segments.map((s) => ({
        v: U.econ(s.km, s.liters),
        label: DF.short.format(iso(s.date)),
        sub: `${U.d(s.km)} ${U.dist()} on ${U.v(s.liters, 1)} ${U.vol()}`,
      }));
      Ch.line(econBox, {
        points: pts,
        avg: pts.length > 1 ? U.econ(a.segKm, a.segL) : null,
        tick: (n) => C.fmt(n, 1),
        value: (n) => C.fmt(n, 1, 1) + ' ' + E.unit,
        aria: `Consumption for the last ${pts.length} full tanks, latest ${C.fmt(pts[pts.length - 1].v, 1, 1)} ${E.unit}`,
      });
    }
    const spendBox = $('#chart-spend');
    if (spendBox) {
      const bars = [];
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - 11);
      for (let i = 0; i < 12; i++) {
        const key = C.todayISO(d).slice(0, 7);
        const n = a.list.filter((e) => e.date.slice(0, 7) === key).length;
        bars.push({ v: a.months[key] || 0, label: DF.mon.format(d), short: DF.narrow.format(d), full: DF.month.format(d), sub: n ? `${n} fill-up${n === 1 ? '' : 's'}` : 'No fill-ups' });
        d.setMonth(d.getMonth() + 1);
      }
      Ch.columns(spendBox, {
        bars,
        tick: (n) => U.money(n, { whole: true }),
        value: (n) => U.money(n),
        aria: `Monthly fuel spending for the last 12 months, this month ${U.money(bars[11].v)}`,
      });
    }
  }

  /* ----- History ----- */
  function historyHTML() {
    const v = view();
    const veh = currentVehicle(v);
    let h = bannerHTML(v);
    if (!veh) return h + `<div class="card"><h2>No vehicles yet</h2><p class="sub">Add a vehicle, then log your fill-ups.</p></div>`;
    const a = C.analyze(entriesOf(v, veh));
    if (!a.count) {
      return h + `<div class="card"><h2>No fill-ups yet</h2><p class="sub">Every fill-up you log for ${esc(veh.name)} appears here, newest first.</p>
        <div class="actions" style="margin-top:12px"><button type="button" class="btn primary block" data-act="go-add">Add fill-up</button></div></div>`;
    }
    const E = C.ECON[cfg().econ];
    const rows = a.list.slice().sort((x, y) => y.date.localeCompare(x.date) || y.odo - x.odo);
    const groups = [];
    for (const e of rows) {
      const key = e.date.slice(0, 7);
      if (!groups.length || groups[groups.length - 1].key !== key) groups.push({ key, items: [] });
      groups[groups.length - 1].items.push(e);
    }
    for (const g of groups) {
      const total = g.items.reduce((t, e) => t + C.costOf(e), 0);
      h += `<div><div class="month-head"><span>${esc(DF.month.format(iso(g.key + '-01')))}</span><span>${total > 0 ? esc(U.money(total)) : ''}</span></div><div class="group">`;
      for (const e of g.items) {
        const info = a.info[e.id];
        const day = iso(e.date);
        let right;
        if (info.seg) right = `<b>${C.fmt(U.econ(info.seg.km, info.seg.liters), 1, 1)}</b><small>${esc(E.unit)}</small>`;
        else if (!e.full) right = `<span class="chip">Partial</span>`;
        else if (e.missed) right = `<span class="chip warn">After a gap</span>`;
        else if (info.first) right = `<span class="chip">Starting point</span>`;
        else right = `<small>–</small>`;
        const cost = C.hasCost(e) ? ' · ' + esc(U.money(C.costOf(e))) : '';
        const b = [`${U.d(e.odo)} ${U.dist()}`];
        if (info.dist != null) b.push(`+${U.d(info.dist)} ${U.dist()}`);
        if (e.note) b.push(e.note);
        h += `<button type="button" class="entry" data-edit="${esc(e.id)}" aria-label="Fill-up on ${esc(DF.short.format(day))}">
          <span class="day"><small>${esc(DF.wd.format(day))}</small><b>${day.getDate()}</b></span>
          <span class="mid"><span class="a">${U.v(e.liters)} ${esc(U.vol())}${cost}</span><span class="b">${esc(b.join(' · '))}</span></span>
          <span class="right">${right}</span></button>`;
      }
      h += `</div></div>`;
    }
    return h;
  }

  /* ----- Clicks inside the current screen ----- */
  function onViewClick(e) {
    const t = e.target.closest('[data-act],[data-edit]');
    if (!t) return;
    if (t.dataset.edit) {
      if (view().sample) return toast('This is sample data. Tap Start my log to add your own.');
      return go('add', { editId: t.dataset.edit });
    }
    const act = t.dataset.act;
    if (act === 'start' || act === 'go-add') go('add');
    else if (act === 'hint-done') { St.prefs.set('installHintDone', true); render(); }
    else if (root.FT.views.onAct) root.FT.views.onAct(act, t, e);
  }

  /* ----- Start ----- */
  function setData(d) {
    S.data = {
      entries: (d.entries || []).map(C.cleanEntry).filter(Boolean),
      vehicles: (d.vehicles || []).map(C.cleanVehicle).filter(Boolean),
      config: Object.assign({}, d.config || {}),
    };
    render();
  }

  let resizeTimer = null;
  async function boot() {
    renderShell();
    render();
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => { if (S.tab === 'overview' && S.status === 'ready') render(); }, 150);
    });
    S.store = await St.createStore();
    S.store.start(setData, (st) => { S.status = st.state; render(); });
  }

  root.FT.views = root.FT.views || {};
  root.FT.app = { S, C, St, ICON, U, DF, iso, esc, $, cfg, view, currentVehicle, entriesOf, isSample, go, render, setVehicle, toast, confirmBox, writeError, boot };
})(typeof globalThis !== 'undefined' ? globalThis : this);
