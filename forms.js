/* Fuel Tracker: Add/Edit fill-up and Settings screens, then start the app. */
(function (root) {
  'use strict';
  const A = root.FT.app;
  const { S, C, St, ICON, U, DF, esc, $ } = A;

  const dec = (1.5).toLocaleString().charAt(1) === ',' ? ',' : '.';
  const numStr = (n, max) => (n == null || !isFinite(n) ? '' : String(C.round(n, max)).replace('.', dec));
  const val = (id) => C.parseNum(($('#' + id) || {}).value);
  const AMOUNTS = ['total', 'vol', 'price'];
  let edits = [];
  let confirmOdo = false;
  let busy = false;

  /* ---------- Add / Edit ---------- */

  function setupHTML() {
    const c = A.cfg();
    return `<div class="card"><h2>Name your vehicle</h2><p class="sub">Fill-ups are kept per vehicle. You can add more vehicles in Settings.</p></div>
      <div class="group"><div class="field wide"><label for="f-vname">Vehicle</label>
        <input type="text" id="f-vname" value="My car" maxlength="40" autocomplete="off"></div></div>
      <p class="hint">Units: ${esc(C.DIST_NAMES[c.dist].toLowerCase())}, ${esc(C.VOL_NAMES[c.vol])}, ${esc(C.ECON[c.econ].name)}, ${esc(c.currency)}. You can change them in Settings.</p>
      <div class="actions"><button type="button" class="btn primary block" data-act="setup-start">Start logging</button></div>`;
  }

  function formHTML(veh, entry, ents) {
    const c = A.cfg();
    const volWord = c.vol === 'L' ? 'Litres' : 'Gallons';
    const vu = U.vol();
    const last = ents.filter((e) => !entry || e.id !== entry.id).sort((a, b) => b.date.localeCompare(a.date) || b.odo - a.odo)[0];
    const field = (id, label, extra) =>
      `<div class="field"><label for="f-${id}">${label}</label><span class="auto" id="a-${id}" hidden>auto</span>
        <input type="text" id="f-${id}" inputmode="decimal" autocomplete="off" ${extra || ''}></div>`;
    return `<div class="pump" aria-hidden="true">
        <div class="r big"><span class="l">Sale</span><span class="n dim" id="r-total">–</span></div>
        <div class="r"><span class="l">${volWord}</span><span class="n dim" id="r-vol">–</span></div>
        <div class="r"><span class="l">Price / ${esc(vu)}</span><span class="n dim" id="r-price">–</span></div></div>
      <p class="hint">${ents.length || entry ? 'Copy the numbers from the pump. Any two are enough; the app works out the third.'
        : 'Your first fill-up is the starting point. Fill the tank to the top so the next one can be measured.'}</p>
      <div class="group">
        ${field('total', 'Total paid', `placeholder="${esc(C.currencySymbol(c.currency))}"`)}
        ${field('vol', `Fuel (${esc(vu)})`, 'placeholder="0' + dec + '00"')}
        ${field('price', `Price per ${esc(vu)}`, 'placeholder="0' + dec + '000"')}
      </div>
      <div class="group">
        <div class="field"><label for="f-odo">Odometer (${esc(U.dist())})${last ? `<small>Last reading ${U.d(last.odo)} ${esc(U.dist())}</small>` : ''}</label>
          <input type="text" id="f-odo" inputmode="decimal" autocomplete="off" placeholder="${last ? esc(U.d(last.odo)) : '0'}"></div>
        <div class="field"><label for="f-date">Date</label><input type="date" id="f-date" required></div>
      </div>
      <div class="group">
        <div class="field"><label for="f-full">Filled the tank<small>Turn off for a partial top-up</small></label><input type="checkbox" class="switch" id="f-full" checked></div>
        <div class="field"><label for="f-missed">Missed logging a fill-up<small>Turn on if one before this is not in the log</small></label><input type="checkbox" class="switch" id="f-missed"></div>
        <div class="field wide"><label for="f-note">Note</label><input type="text" id="f-note" maxlength="200" autocomplete="off" placeholder="Station or fuel grade"></div>
      </div>
      <div id="f-preview"></div>
      <div id="f-msg"></div>
      <div class="actions">
        <button type="button" class="btn primary block" data-act="save">${entry ? 'Save changes' : 'Save fill-up'}</button>
        ${entry ? `<button type="button" class="btn block" data-act="cancel">Cancel</button>
        <button type="button" class="btn danger block" data-act="delete">Delete fill-up</button>` : ''}
      </div>`;
  }

  root.FT.views.add = function (main) {
    const v = A.view();
    if (v.sample || !v.vehicles.length) {
      if (S.formKey !== 'setup') { S.formKey = 'setup'; main.innerHTML = setupHTML(); }
      return;
    }
    const veh = A.currentVehicle(v);
    const ents = A.entriesOf(v, veh);
    const entry = S.editId ? ents.find((e) => e.id === S.editId) : null;
    if (S.editId && !entry) { S.editId = null; S.formKey = null; }
    const key = 'form:' + veh.id + ':' + (S.editId || 'new');
    if (S.formKey === key) { updateLive(); return; }
    S.formKey = key;
    confirmOdo = false;
    main.innerHTML = formHTML(veh, entry, ents);
    const c = A.cfg();
    if (entry) {
      $('#f-total').value = C.hasCost(entry) ? numStr(C.costOf(entry), 2) : '';
      $('#f-vol').value = numStr(C.fromL(entry.liters, c.vol), 3);
      const ppl = entry.price > 0 ? entry.price : (C.hasCost(entry) ? C.costOf(entry) / entry.liters : null);
      $('#f-price').value = ppl ? numStr(U.perVol(ppl), 3) : '';
      $('#f-odo').value = numStr(C.fromKm(entry.odo, c.dist), 1);
      $('#f-date').value = entry.date;
      $('#f-full').checked = entry.full;
      $('#f-missed').checked = entry.missed;
      $('#f-note').value = entry.note || '';
      edits = entry.price > 0 ? ['vol', 'price'] : ['vol', 'total'];
    } else {
      $('#f-date').value = C.todayISO();
      edits = [];
    }
    updateLive();
  };

  function onAmountInput(name) {
    edits = [name].concat(edits.filter((n) => n !== name)).slice(0, 2);
    if (edits.length === 2) {
      const derived = AMOUNTS.find((n) => !edits.includes(n));
      const t = val('f-total'), vo = val('f-vol'), p = val('f-price');
      let out = NaN;
      if (derived === 'total' && vo > 0 && p > 0) out = C.round(vo * p, 2);
      if (derived === 'vol' && t > 0 && p > 0) out = C.round(t / p, 3);
      if (derived === 'price' && t > 0 && vo > 0) out = C.round(t / vo, 3);
      $('#f-' + derived).value = isFinite(out) ? numStr(out, 3) : '';
      AMOUNTS.forEach((n) => { $('#a-' + n).hidden = n !== derived || !isFinite(out); });
    }
    updateLive();
  }

  /** Reads the form into a fill-up in stored units (km, litres). */
  function draft() {
    const c = A.cfg();
    const v = A.view();
    const veh = A.currentVehicle(v);
    const vol = val('f-vol'), total = val('f-total'), price = val('f-price'), odo = val('f-odo');
    const liters = vol > 0 ? C.toL(vol, c.vol) : NaN;
    const old = S.editId ? v.entries.find((e) => e.id === S.editId) : null;
    return {
      id: S.editId || 'draft',
      vehicleId: veh.id,
      date: $('#f-date').value,
      odo: odo > 0 ? C.round(C.toKm(odo, c.dist), 3) : NaN,
      liters: C.round(liters, 4),
      price: price > 0 ? C.round(price / (C.L_PER[c.vol] || 1), 5) : (total > 0 && liters > 0 ? C.round(total / liters, 5) : null),
      cost: total > 0 ? C.round(total, 2) : (price > 0 && vol > 0 ? C.round(price * vol, 2) : null),
      full: $('#f-full').checked,
      missed: $('#f-missed').checked,
      note: $('#f-note').value.trim().slice(0, 200),
      created: old ? old.created : Date.now(),
    };
  }

  function updateLive() {
    if (!$('#f-vol')) return;
    const c = A.cfg();
    const t = val('f-total'), vo = val('f-vol'), p = val('f-price');
    const show = (id, ok, text) => { const el = $('#r-' + id); el.textContent = ok ? text : '–'; el.classList.toggle('dim', !ok); };
    show('total', t > 0, C.money(t, c.currency));
    show('vol', vo > 0, C.fmt(vo, 2, 2));
    show('price', p > 0, C.money(p, c.currency, { price: true }));

    const d = draft();
    const box = $('#f-preview');
    if (!(d.odo > 0) || !d.date) { box.innerHTML = ''; return; }
    const v = A.view();
    const ents = A.entriesOf(v, A.currentVehicle(v)).filter((e) => e.id !== d.id);
    const a = C.analyze(ents.concat([Object.assign({}, d, { liters: d.liters > 0 ? d.liters : 0 })]));
    const info = a.info[d.id];
    const parts = [];
    if (info && info.dist != null) parts.push(`<span>Since last fill-up <b>${info.dist >= 0 ? '+' : ''}${U.d(info.dist)} ${esc(U.dist())}</b></span>`);
    if (info && info.seg && d.liters > 0) parts.push(`<span>This tank <b>${C.fmt(U.econ(info.seg.km, info.seg.liters), 1, 1)} ${esc(C.ECON[c.econ].unit)}</b></span>`);
    box.innerHTML = parts.length ? `<div class="preview">${parts.join('')}</div>` : '';
  }

  async function save() {
    if (busy) return;
    const msg = $('#f-msg');
    const d = draft();
    const problems = [];
    if (!(d.liters > 0)) problems.push('Enter how much fuel you bought.');
    if (!(d.odo > 0)) problems.push('Enter the odometer reading.');
    if (!d.date) problems.push('Pick the date.');
    if (problems.length) { msg.innerHTML = `<p class="notice error">${problems.map(esc).join(' ')}</p>`; return; }
    const v = A.view();
    const ents = A.entriesOf(v, A.currentVehicle(v));
    const entry = Object.assign({}, d, { id: S.editId || C.uid('e') });
    const warn = C.odoWarnings(ents, entry);
    if (warn.length && !confirmOdo) {
      const text = {
        lower: 'This reading is lower than on an earlier fill-up.',
        higher: 'This reading is higher than on a later fill-up.',
        same: 'Another fill-up has the same odometer reading.',
      };
      msg.innerHTML = `<p class="notice">${warn.map((w) => text[w]).join(' ')} Check the odometer and date, or tap Save again to keep it.</p>`;
      confirmOdo = true;
      return;
    }
    busy = true;
    try {
      await S.store.putEntry(entry);
      const a = C.analyze(ents.filter((e) => e.id !== entry.id).concat([entry]));
      const seg = a.info[entry.id] && a.info[entry.id].seg;
      A.toast(seg ? `Saved · ${C.fmt(U.econ(seg.km, seg.liters), 1, 1)} ${C.ECON[A.cfg().econ].unit}` : (S.editId ? 'Changes saved' : 'Fill-up saved'));
      A.go(S.editId ? 'history' : 'overview');
    } catch (err) {
      A.writeError(err);
    } finally {
      busy = false;
    }
  }

  async function startLog() {
    if (busy) return;
    const name = ($('#f-vname').value || '').trim().slice(0, 40) || 'My car';
    const vehicle = { id: C.uid('v'), name, created: Date.now() };
    busy = true;
    try {
      const c = A.cfg();
      await S.store.putConfig({ started: true, dist: c.dist, vol: c.vol, econ: c.econ, currency: c.currency });
      await S.store.putVehicle(vehicle);
      A.setVehicle(vehicle.id);
      S.formKey = null;
      A.render();
    } catch (err) {
      A.writeError(err);
    } finally {
      busy = false;
    }
  }

  /* ---------- Settings ---------- */

  root.FT.views.settings = function (main) {
    const active = document.activeElement;
    if (S.formKey === 'settings' && active && main.contains(active) && active.matches('input[type="text"]')) return;
    S.formKey = 'settings';
    const c = A.cfg();
    const v = A.view();
    const opt = (map, cur, label) => Object.keys(map).map((k) => `<option value="${k}"${k === cur ? ' selected' : ''}>${esc(label(k))}</option>`).join('');
    const curs = C.CURRENCIES.includes(c.currency) ? C.CURRENCIES : C.CURRENCIES.concat([c.currency]).sort();
    let h = '';

    h += `<div class="section-title">Vehicles</div>`;
    if (v.sample) {
      h += `<div class="card"><p class="sub">Start your log to add your own vehicles.</p>
        <div class="actions" style="margin-top:12px"><button type="button" class="btn primary block" data-act="start">Start my log</button></div></div>`;
    } else {
      h += `<div class="group">${v.vehicles.map((x) => {
        const n = v.entries.filter((e) => e.vehicleId === x.id).length;
        return `<div class="field"><div class="vehicle-row" style="flex:1;min-width:0">
          <input type="text" class="veh-name" data-id="${esc(x.id)}" value="${esc(x.name)}" maxlength="40" aria-label="Vehicle name">
          <span class="count">${n} fill-up${n === 1 ? '' : 's'}</span>
          <button type="button" class="icon-btn" data-act="del-vehicle" data-id="${esc(x.id)}" aria-label="Delete ${esc(x.name)}">${ICON.trash}</button></div></div>`;
      }).join('')}
        <div class="field"><div class="vehicle-row" style="flex:1;min-width:0">
          <input type="text" id="f-newveh" maxlength="40" placeholder="Add a vehicle" aria-label="New vehicle name">
          <button type="button" class="btn small" data-act="add-vehicle">Add</button></div></div></div>`;
    }

    h += `<div class="section-title">Units</div><div class="group">
      <div class="field"><span style="flex:1">Distance</span><div class="seg" role="radiogroup" aria-label="Distance">
        <input type="radio" name="u-dist" id="u-km" value="km"${c.dist === 'km' ? ' checked' : ''}><label for="u-km">km</label>
        <input type="radio" name="u-dist" id="u-mi" value="mi"${c.dist === 'mi' ? ' checked' : ''}><label for="u-mi">miles</label></div></div>
      <div class="field"><label for="u-vol">Fuel</label><select id="u-vol">${opt(C.VOL, c.vol, (k) => C.VOL_NAMES[k])}</select></div>
      <div class="field"><label for="u-econ">Consumption</label><select id="u-econ">${opt(C.ECON, c.econ, (k) => C.ECON[k].name)}</select></div>
      <div class="field"><label for="u-cur">Currency</label><select id="u-cur">${curs.map((k) => `<option value="${k}"${k === c.currency ? ' selected' : ''}>${k}</option>`).join('')}</select></div>
    </div>`;

    const cloud = S.store && S.store.kind === 'cloud';
    h += `<div class="section-title">Your data</div><div class="card" style="display:grid;gap:12px">
      <div class="storage-line">${cloud ? ICON.cloud : ICON.phone}<span>${cloud
        ? 'Saved to your Claude account. The same log shows on your phone and your computer.'
        : (S.store && S.store.fallback ? 'Saved in this browser only, because you are not signed in to Claude.' : 'Saved on this device only. Save a backup now and then, and before you change phones.')}</span></div>
      <div class="actions">
        <button type="button" class="btn block" data-act="export-csv"${v.sample ? ' disabled' : ''}>Export spreadsheet (CSV)</button>
        <button type="button" class="btn block" data-act="export-json"${v.sample ? ' disabled' : ''}>Save a backup</button>
        <button type="button" class="btn block" data-act="restore">Restore a backup</button>
        <input type="file" id="f-restore" accept=".json,application/json" hidden>
        <button type="button" class="btn danger block" data-act="wipe"${v.sample ? ' disabled' : ''}>Delete all data</button>
      </div></div>`;

    h += `<div class="section-title">Put it on your iPhone</div><div class="card">${cloud
      ? `<ol class="steps"><li>Open this page's link in <b>Safari</b> on your iPhone and sign in to Claude.</li>
          <li>Tap the <b>Share</b> button, then <b>Add to Home Screen</b>.</li>
          <li>Open it from the new icon next time you fill up.</li></ol>`
      : `<ol class="steps"><li>Open this page in <b>Safari</b> on your iPhone.</li>
          <li>Tap the <b>Share</b> button, then <b>Add to Home Screen</b>.</li>
          <li>It opens full screen like an app and works without signal.</li></ol>`}</div>`;

    h += `<div class="section-title">How it measures</div><div class="card"><p class="sub">Consumption uses the full-tank method. Fill to the top and log it; at the next full tank the app divides the fuel you added, partial top-ups included, by the distance driven. If you forget to log a fill-up, turn on <b>Missed logging a fill-up</b> on the next one so that stretch is skipped instead of counted wrong.</p></div>`;
    main.innerHTML = h;
  };

  async function exportFile(kind) {
    const v = A.view();
    const stamp = C.todayISO();
    const c = A.cfg();
    let p;
    if (kind === 'csv') {
      p = St.saveFile(`fuel-log-${stamp}.csv`, C.toCSV(v.entries, v.vehicles, c), 'text/csv');
    } else {
      const data = { app: 'fuel-tracker', version: 1, exported: new Date().toISOString(), config: Object.assign({}, S.data.config), vehicles: v.vehicles, entries: v.entries };
      p = St.saveFile(`fuel-tracker-backup-${stamp}.json`, JSON.stringify(data, null, 1), 'application/json');
    }
    try {
      const r = await p;
      if (r === 'saved') A.toast(kind === 'csv' ? 'Spreadsheet saved' : 'Backup saved');
    } catch (err) {
      A.toast(err.message);
    }
  }

  async function restore(file) {
    let data;
    try {
      data = C.parseBackup(await file.text());
    } catch (err) {
      return A.toast(err.message);
    }
    const ok = await A.confirmBox({
      title: 'Replace your log with this backup?',
      body: `The backup has ${data.entries.length} fill-ups for ${data.vehicles.length} vehicle${data.vehicles.length === 1 ? '' : 's'}. Everything in your current log is replaced.`,
      ok: 'Replace',
    });
    if (!ok) return;
    data.config.started = true;
    busy = true;
    try {
      await S.store.replaceAll(data, (n, total) => { if (n % 10 === 0) A.toast(`Restoring… ${Math.round((n / total) * 100)}%`); });
      S.vehicleId = data.vehicles[0] ? data.vehicles[0].id : null;
      A.toast('Backup restored');
      A.go('overview');
    } catch (err) {
      A.writeError(err);
    } finally {
      busy = false;
    }
  }

  /* ---------- Events ---------- */

  root.FT.views.onAct = async function (act, el) {
    if (act === 'save') return save();
    if (act === 'setup-start') return startLog();
    if (act === 'cancel') return A.go('history');
    if (act === 'export-csv') return exportFile('csv');
    if (act === 'export-json') return exportFile('json');
    if (act === 'restore') return $('#f-restore').click();
    if (act === 'delete') {
      if (!(await A.confirmBox({ title: 'Delete this fill-up?', body: 'It is removed from your log and your averages. This cannot be undone.' }))) return;
      try { await S.store.deleteEntry(S.editId); A.toast('Fill-up deleted'); A.go('history'); } catch (err) { A.writeError(err); }
      return;
    }
    if (act === 'add-vehicle') {
      const input = $('#f-newveh');
      const name = input.value.trim().slice(0, 40);
      if (!name) { input.focus(); return A.toast('Type a name for the vehicle first.'); }
      const vehicle = { id: C.uid('v'), name, created: Date.now() };
      try { await S.store.putVehicle(vehicle); A.setVehicle(vehicle.id); A.toast(`${name} added`); } catch (err) { A.writeError(err); }
      return;
    }
    if (act === 'del-vehicle') {
      const v = A.view();
      const veh = v.vehicles.find((x) => x.id === el.dataset.id);
      if (!veh) return;
      const n = v.entries.filter((e) => e.vehicleId === veh.id).length;
      if (!(await A.confirmBox({ title: `Delete ${veh.name}?`, body: `Its ${n} fill-up${n === 1 ? ' is' : 's are'} deleted too. This cannot be undone.` }))) return;
      try { await S.store.deleteVehicle(veh.id); A.toast(`${veh.name} deleted`); } catch (err) { A.writeError(err); }
      return;
    }
    if (act === 'wipe') {
      if (!(await A.confirmBox({ title: 'Delete all data?', body: 'Every vehicle and fill-up is deleted. Save a backup first if you might want it back. This cannot be undone.', ok: 'Delete all' }))) return;
      try { await S.store.clearAll(); S.vehicleId = null; A.toast('All data deleted'); A.go('overview'); } catch (err) { A.writeError(err); }
    }
  };

  function onInput(e) {
    const id = e.target.id || '';
    if (id === 'f-total' || id === 'f-vol' || id === 'f-price') {
      confirmOdo = false;
      return onAmountInput(id.slice(2));
    }
    if (id === 'f-odo' || id === 'f-date' || id === 'f-full' || id === 'f-missed') {
      confirmOdo = false;
      updateLive();
    }
  }

  async function onChange(e) {
    const t = e.target;
    if (t.id === 'f-full' || t.id === 'f-missed') return updateLive();
    try {
      if (t.name === 'u-dist') await S.store.putConfig({ dist: t.value });
      else if (t.id === 'u-vol') await S.store.putConfig({ vol: t.value });
      else if (t.id === 'u-econ') await S.store.putConfig({ econ: t.value });
      else if (t.id === 'u-cur') await S.store.putConfig({ currency: t.value });
      else if (t.classList.contains('veh-name')) {
        const veh = S.data.vehicles.find((x) => x.id === t.dataset.id);
        const name = t.value.trim().slice(0, 40);
        if (veh && name && name !== veh.name) await S.store.putVehicle(Object.assign({}, veh, { name }));
        else if (veh && !name) t.value = veh.name;
      } else if (t.id === 'f-restore' && t.files && t.files[0]) {
        const f = t.files[0];
        t.value = '';
        await restore(f);
      }
    } catch (err) {
      A.writeError(err);
    }
  }

  A.boot();
  const main = document.getElementById('view');
  main.addEventListener('input', onInput);
  main.addEventListener('change', onChange);
  main.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.id === 'f-newveh') root.FT.views.onAct('add-vehicle', e.target);
    if (e.key === 'Enter' && e.target.id === 'f-vname') startLog();
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
