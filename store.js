/* Fuel Tracker: where fill-ups are kept.
   - Opened as a Claude artifact: the artifact's database (synced, backed up, readable by Claude).
   - Opened anywhere else (home-screen web app, local file): this device's browser storage. */
(function (root) {
  'use strict';

  const KEY = 'fuel-tracker:v1';
  const PREF = 'fuel-tracker:pref:';
  const empty = () => ({ entries: [], vehicles: [], config: {} });
  const hasClaude = () => !!(root.claude && typeof root.claude.use === 'function');

  /* Per-device conveniences (current vehicle, dismissed hints). Never the log itself. */
  const prefs = {
    get(k, d) {
      try { const v = localStorage.getItem(PREF + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; }
    },
    set(k, v) {
      try { localStorage.setItem(PREF + k, JSON.stringify(v)); } catch (e) { /* private mode */ }
    },
  };

  function stripId(o) {
    const body = Object.assign({}, o);
    delete body.id;
    return body;
  }

  async function pool(items, n, fn) {
    let i = 0;
    const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) { const item = items[i++]; await fn(item); }
    });
    await Promise.all(workers);
  }

  /* ---------- This device ---------- */

  function LocalStore(opts) {
    let state = empty();
    let onData = null;
    let asked = false;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const p = JSON.parse(raw);
        state = { entries: p.entries || [], vehicles: p.vehicles || [], config: p.config || {} };
      }
    } catch (e) { /* unreadable: start empty */ }

    const snapshot = () => ({ entries: state.entries.slice(), vehicles: state.vehicles.slice(), config: Object.assign({}, state.config) });
    function persist() {
      try {
        localStorage.setItem(KEY, JSON.stringify(state));
      } catch (e) {
        throw Object.assign(new Error('This browser would not save the change. Private browsing blocks saving.'), { code: 'storage' });
      }
      if (!asked && navigator.storage && navigator.storage.persist) {
        asked = true;
        navigator.storage.persist().catch(() => {});
      }
      if (onData) onData(snapshot());
    }
    const upsert = (arr, item) => {
      const i = arr.findIndex((x) => x.id === item.id);
      if (i >= 0) arr[i] = item; else arr.push(item);
    };

    return {
      kind: 'local',
      fallback: !!(opts && opts.fallback),
      start(dataCb, statusCb) {
        onData = dataCb;
        statusCb({ state: 'ready' });
        dataCb(snapshot());
      },
      async putEntry(e) { upsert(state.entries, e); persist(); },
      async deleteEntry(id) { state.entries = state.entries.filter((x) => x.id !== id); persist(); },
      async putVehicle(v) { upsert(state.vehicles, v); persist(); },
      async deleteVehicle(id) {
        state.vehicles = state.vehicles.filter((x) => x.id !== id);
        state.entries = state.entries.filter((x) => x.vehicleId !== id);
        persist();
      },
      async putConfig(patch) { state.config = Object.assign({}, state.config, patch); persist(); },
      async replaceAll(data) {
        state = { entries: data.entries.slice(), vehicles: data.vehicles.slice(), config: Object.assign({}, data.config) };
        persist();
      },
      async clearAll() { state = empty(); persist(); },
    };
  }

  /* ---------- Claude artifact database ---------- */

  function DbStore(db) {
    let entries = [], vehicles = [], config = {};
    const got = { entries: false, vehicles: false, config: false };
    const all = () => got.entries && got.vehicles && got.config;
    const col = (name) => db.collection(name);

    return {
      kind: 'cloud',
      fallback: false,
      start(dataCb, statusCb) {
        statusCb({ state: 'loading' });
        let timer = setTimeout(() => { if (!all()) statusCb({ state: 'slow' }); }, 10000);
        const emit = () => {
          if (!all()) return;
          if (timer) { clearTimeout(timer); timer = null; statusCb({ state: 'ready' }); }
          dataCb({ entries, vehicles, config });
        };
        const fail = (err) => {
          if (timer) { clearTimeout(timer); timer = null; }
          statusCb({ state: 'error', code: err && err.code });
        };
        col('entries').onSnapshot((s) => {
          entries = s.docs.map((d) => Object.assign({}, d.data(), { id: d.id }));
          got.entries = true; emit();
        }, fail);
        col('vehicles').onSnapshot((s) => {
          vehicles = s.docs.map((d) => Object.assign({}, d.data(), { id: d.id }));
          got.vehicles = true; emit();
        }, fail);
        db.doc('config/main').onSnapshot((s) => {
          config = s.exists ? Object.assign({}, s.data()) : {};
          got.config = true; emit();
        }, fail);
      },
      putEntry: (e) => col('entries').doc(e.id).set(stripId(e)),
      deleteEntry: (id) => col('entries').doc(id).delete(),
      putVehicle: (v) => col('vehicles').doc(v.id).set(stripId(v)),
      async deleteVehicle(id) {
        await pool(entries.filter((e) => e.vehicleId === id), 4, (e) => col('entries').doc(e.id).delete());
        await col('vehicles').doc(id).delete();
      },
      putConfig: (patch) => db.doc('config/main').set(Object.assign({}, config, patch)),
      async replaceAll(data, progress) {
        const total = entries.length + vehicles.length + data.entries.length + data.vehicles.length;
        let done = 0;
        const tick = () => { done++; if (progress) progress(done, total); };
        await pool(entries.slice(), 4, async (e) => { await col('entries').doc(e.id).delete(); tick(); });
        await pool(vehicles.slice(), 4, async (v) => { await col('vehicles').doc(v.id).delete(); tick(); });
        await pool(data.vehicles, 4, async (v) => { await col('vehicles').doc(v.id).set(stripId(v)); tick(); });
        await pool(data.entries, 4, async (e) => { await col('entries').doc(e.id).set(stripId(e)); tick(); });
        await db.doc('config/main').set(Object.assign({}, data.config));
      },
      async clearAll() {
        await pool(entries.slice(), 4, (e) => col('entries').doc(e.id).delete());
        await pool(vehicles.slice(), 4, (v) => col('vehicles').doc(v.id).delete());
        await db.doc('config/main').delete();
      },
    };
  }

  /** Picks the right store. Resolves quickly outside Claude; inside, once the viewer answers. */
  async function createStore() {
    if (!hasClaude()) return LocalStore();
    let db = null;
    try { db = await root.claude.use('db'); } catch (e) { db = null; }
    return db ? DbStore(db) : LocalStore({ fallback: true });
  }

  /* ---------- Saving a file for the person ---------- */

  let downloads = null;
  if (hasClaude()) {
    root.claude.use('downloads').then((d) => { downloads = d; }, () => {});
  }

  /** Offers a generated file. Resolves 'saved' | 'shared' | 'cancelled'; rejects with a readable message. */
  function saveFile(filename, text, mime) {
    if (hasClaude()) {
      if (!downloads) return Promise.reject(new Error('Saving files is not available in this view.'));
      return downloads.save({ filename, data: text }).then(() => 'saved', (err) => {
        if (err && err.code === 'declined') return 'cancelled';
        throw new Error(err && err.code === 'host_unavailable'
          ? 'This app cannot save files. Open the page in a browser to export.'
          : 'The file could not be saved. Try again in a moment.');
      });
    }
    const blob = new Blob([text], { type: mime });
    const mobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform));
    if (mobile && typeof File === 'function' && navigator.canShare) {
      const file = new File([blob], filename, { type: mime });
      if (navigator.canShare({ files: [file] })) {
        return navigator.share({ files: [file] }).then(() => 'shared', (err) => {
          if (err && err.name === 'AbortError') return 'cancelled';
          throw new Error('The share sheet did not open. Try again.');
        });
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return Promise.resolve('saved');
  }

  root.FT = root.FT || {};
  root.FT.store = { createStore, prefs, saveFile, hasClaude };
})(typeof globalThis !== 'undefined' ? globalThis : this);
