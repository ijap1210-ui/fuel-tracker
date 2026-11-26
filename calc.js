/* Fuel Tracker: units, number parsing and formatting, consumption math.
   No DOM access, so it also runs under Node for testing. */
(function (root) {
  'use strict';

  const KM_PER_MI = 1.609344;
  const L_PER = { L: 1, galUS: 3.785411784, galUK: 4.54609 };

  const DIST = { km: 'km', mi: 'mi' };
  const DIST_NAMES = { km: 'Kilometres', mi: 'Miles' };
  const VOL = { L: 'L', galUS: 'gal', galUK: 'gal' };
  const VOL_NAMES = { L: 'Litres (L)', galUS: 'US gallons', galUK: 'UK gallons' };
  const ECON = {
    L100: { unit: 'L/100 km', name: 'L/100 km', lowerIsBetter: true },
    kmL: { unit: 'km/L', name: 'km/L', lowerIsBetter: false },
    mpgUS: { unit: 'mpg', name: 'MPG (US)', lowerIsBetter: false },
    mpgUK: { unit: 'mpg', name: 'MPG (UK)', lowerIsBetter: false },
  };

  const toKm = (v, u) => v * (u === 'mi' ? KM_PER_MI : 1);
  const fromKm = (km, u) => km / (u === 'mi' ? KM_PER_MI : 1);
  const toL = (v, u) => v * (L_PER[u] || 1);
  const fromL = (l, u) => l / (L_PER[u] || 1);

  /** Fuel economy for a stretch of `km` that used `liters`, in the chosen format. */
  function econ(km, liters, format) {
    if (!(km > 0) || !(liters > 0)) return null;
    const miles = km / KM_PER_MI;
    switch (format) {
      case 'kmL': return km / liters;
      case 'mpgUS': return miles / (liters / L_PER.galUS);
      case 'mpgUK': return miles / (liters / L_PER.galUK);
      default: return (liters / km) * 100;
    }
  }

  /* ---------- Locale ---------- */

  const nav = typeof navigator !== 'undefined' ? navigator : { language: 'en-US' };
  let decimalSep = '.';
  try {
    const part = new Intl.NumberFormat().formatToParts(1.5).find((p) => p.type === 'decimal');
    if (part) decimalSep = part.value;
  } catch (e) { /* keep '.' */ }

  /** Reads "45,32", "1,234.5", "1.234,5", "$61.90" and similar. Returns NaN when empty or invalid. */
  function parseNum(input) {
    if (typeof input === 'number') return isFinite(input) ? input : NaN;
    let s = String(input == null ? '' : input).trim().replace(/[\s  ']/g, '');
    s = s.replace(/[^\d.,-]/g, '');
    if (!s || s === '-' ) return NaN;
    const c = s.lastIndexOf(',');
    const d = s.lastIndexOf('.');
    if (c > -1 && d > -1) {
      s = c > d ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    } else if (c > -1) {
      const parts = s.split(',');
      const thousands = parts.length > 2 || (decimalSep === '.' && parts[1].length === 3);
      s = thousands ? parts.join('') : parts[0] + '.' + parts[1];
    } else if (d > -1) {
      const parts = s.split('.');
      if (parts.length > 2) s = parts.join('');
    }
    const n = Number(s);
    return isFinite(n) ? n : NaN;
  }

  const nfCache = {};
  function nf(key, opts) {
    return nfCache[key] || (nfCache[key] = new Intl.NumberFormat(undefined, opts));
  }

  /** Plain number with up to `max` decimals. */
  function fmt(n, max = 1, min = 0) {
    if (n == null || !isFinite(n)) return '–';
    return nf('n' + min + ':' + max, { minimumFractionDigits: min, maximumFractionDigits: max }).format(n);
  }

  /** Currency amount. opts.price shows up to 3 decimals (pump prices), opts.whole none. */
  function money(n, cur, opts = {}) {
    if (n == null || !isFinite(n)) return '–';
    const key = 'c' + cur + (opts.price ? 'p' : '') + (opts.whole ? 'w' : '');
    try {
      if (!nfCache[key]) {
        const dflt = new Intl.NumberFormat(undefined, { style: 'currency', currency: cur }).resolvedOptions().maximumFractionDigits;
        const o = { style: 'currency', currency: cur };
        if (opts.price) { o.minimumFractionDigits = Math.min(2, dflt); o.maximumFractionDigits = Math.max(3, dflt); }
        if (opts.whole) { o.minimumFractionDigits = 0; o.maximumFractionDigits = 0; }
        nfCache[key] = new Intl.NumberFormat(undefined, o);
      }
      return nfCache[key].format(n);
    } catch (e) {
      return cur + ' ' + fmt(n, opts.price ? 3 : 2, opts.whole ? 0 : 2);
    }
  }

  function currencySymbol(cur) {
    try {
      const p = new Intl.NumberFormat(undefined, { style: 'currency', currency: cur }).formatToParts(1).find((x) => x.type === 'currency');
      return p ? p.value : cur;
    } catch (e) { return cur; }
  }

  const EURO = 'AT BE CY DE EE ES FI FR GR HR IE IT LT LU LV MT NL PT SI SK'.split(' ');
  const CUR = {
    US: 'USD', GB: 'GBP', CA: 'CAD', AU: 'AUD', NZ: 'NZD', IN: 'INR', PH: 'PHP', JP: 'JPY', KR: 'KRW',
    CN: 'CNY', SG: 'SGD', MY: 'MYR', ID: 'IDR', TH: 'THB', VN: 'VND', MX: 'MXN', BR: 'BRL', ZA: 'ZAR',
    NG: 'NGN', KE: 'KES', AE: 'AED', SA: 'SAR', CH: 'CHF', SE: 'SEK', NO: 'NOK', DK: 'DKK', PL: 'PLN',
    CZ: 'CZK', HU: 'HUF', RO: 'RON', TR: 'TRY', EG: 'EGP', PK: 'PKR', BD: 'BDT', AR: 'ARS', CL: 'CLP',
    CO: 'COP', PE: 'PEN', IL: 'ILS', HK: 'HKD', TW: 'TWD', QA: 'QAR', KW: 'KWD',
  };
  const KML = 'JP IN PH ID TH MX BR AR CO CL PE KR TW VN BD PK'.split(' ');
  const CURRENCIES = Array.from(new Set(['USD', 'EUR', ...Object.values(CUR)])).sort();

  function region() {
    try {
      const loc = new Intl.Locale(nav.language || 'en-US').maximize();
      if (loc.region) return loc.region.toUpperCase();
    } catch (e) { /* fall through */ }
    const m = /-([A-Za-z]{2})\b/.exec(nav.language || '');
    return m ? m[1].toUpperCase() : 'US';
  }

  /** Sensible units and currency for the device's region. */
  function localeDefaults(r) {
    r = r || region();
    const currency = EURO.includes(r) ? 'EUR' : (CUR[r] || 'USD');
    if (r === 'US') return { dist: 'mi', vol: 'galUS', econ: 'mpgUS', currency };
    if (r === 'GB') return { dist: 'mi', vol: 'L', econ: 'mpgUK', currency };
    return { dist: 'km', vol: 'L', econ: KML.includes(r) ? 'kmL' : 'L100', currency };
  }

  /* ---------- Entries ---------- */

  const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  function todayISO(d = new Date()) {
    const z = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate());
  }

  const isNum = (v) => typeof v === 'number' && isFinite(v);

  /** Money paid for one fill-up; derived from price × volume when no total was entered. */
  function costOf(e) {
    if (isNum(e.cost)) return e.cost;
    if (e.price > 0 && e.liters > 0) return e.price * e.liters;
    return 0;
  }
  const hasCost = (e) => isNum(e.cost) || (e.price > 0 && e.liters > 0);

  function sortEntries(list) {
    return list.slice().sort((a, b) =>
      (a.odo - b.odo) || String(a.date).localeCompare(String(b.date)) || ((a.created || 0) - (b.created || 0)));
  }

  /**
   * Full-tank method. Consumption is known only between two full fill-ups:
   * the distance between them and every litre added after the first one,
   * partial top-ups included. A "missed a fill-up" flag breaks the chain.
   */
  function analyze(entries) {
    const list = sortEntries(entries);
    const info = {};
    const segments = [];
    let base = null, accL = 0, accCost = 0, costOk = true, broken = false, prev = null;
    for (const e of list) {
      const row = { dist: prev ? e.odo - prev.odo : null, seg: null, first: !prev };
      if (e.missed) broken = true;
      accL += e.liters || 0;
      accCost += costOf(e);
      if (!hasCost(e)) costOk = false;
      if (e.full) {
        if (base && !broken && e.odo > base.odo && accL > 0) {
          row.seg = { km: e.odo - base.odo, liters: accL, cost: accCost, costOk, date: e.date, id: e.id, fromId: base.id };
          segments.push(row.seg);
        }
        base = e; accL = 0; accCost = 0; costOk = true; broken = false;
      }
      info[e.id] = row;
      prev = e;
    }
    const sum = (arr, f) => arr.reduce((t, x) => t + f(x), 0);
    const segKm = sum(segments, (s) => s.km);
    const segL = sum(segments, (s) => s.liters);
    const priced = segments.filter((s) => s.costOk);
    const pricedKm = sum(priced, (s) => s.km);
    const byDate = list.slice().sort((a, b) => String(a.date).localeCompare(String(b.date)) || (a.odo - b.odo));
    const months = {};
    for (const e of list) {
      const m = String(e.date).slice(0, 7);
      months[m] = (months[m] || 0) + costOf(e);
    }
    let lastPricePerL = null;
    for (let i = byDate.length - 1; i >= 0; i--) {
      const e = byDate[i];
      if (e.price > 0) { lastPricePerL = e.price; break; }
      if (isNum(e.cost) && e.cost > 0 && e.liters > 0) { lastPricePerL = e.cost / e.liters; break; }
    }
    return {
      list, info, segments, months, lastPricePerL,
      count: list.length,
      totalCost: sum(list, costOf),
      totalLiters: sum(list, (e) => e.liters || 0),
      distance: list.length > 1 ? list[list.length - 1].odo - list[0].odo : 0,
      segKm, segL,
      lPer100: segKm > 0 ? (segL / segKm) * 100 : null,
      costPerKm: pricedKm > 0 ? sum(priced, (s) => s.cost) / pricedKm : null,
      lastSeg: segments[segments.length - 1] || null,
      lastEntry: byDate[byDate.length - 1] || null,
    };
  }

  /** Odometer problems for a draft fill-up against the vehicle's other fill-ups. */
  function odoWarnings(entries, draft) {
    const others = entries.filter((e) => e.id !== draft.id);
    const out = [];
    const earlier = others.filter((e) => e.date < draft.date && e.odo >= draft.odo);
    const later = others.filter((e) => e.date > draft.date && e.odo <= draft.odo);
    if (earlier.length) out.push('lower');
    if (later.length) out.push('higher');
    if (others.some((e) => e.odo === draft.odo)) out.push('same');
    return out;
  }

  /* ---------- Sample data (shown before the first real fill-up, never saved) ---------- */

  const SAMPLE_PRICE = {
    USD: 0.95, EUR: 1.72, GBP: 1.38, CAD: 1.55, AUD: 1.9, NZD: 2.6, INR: 102, PHP: 62, JPY: 172, KRW: 1650,
    CNY: 7.6, SGD: 2.7, MYR: 2.05, IDR: 13000, THB: 36, VND: 21000, MXN: 24, BRL: 6.1, ZAR: 21.5, CHF: 1.85,
    SEK: 17.5, NOK: 20.5, DKK: 13.2, PLN: 6.1, CZK: 37, HUF: 590, RON: 7.4, TRY: 47, AED: 2.7, SAR: 2.2,
    HKD: 21, TWD: 30, ILS: 7.3, NGN: 1000, KES: 180, EGP: 17, PKR: 270, BDT: 125, ARS: 1300, CLP: 1250,
    COP: 16000, PEN: 4.6, QAR: 2.1, KWD: 0.25,
  };

  function sampleData(cur, today = new Date()) {
    let seed = 7;
    const rnd = () => { // mulberry32
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const p0 = SAMPLE_PRICE[cur] || 1.5;
    const vehicleId = 'sample-car';
    const entries = [];
    const d = new Date(today);
    d.setDate(d.getDate() - 104);
    let odo = 48210, deficit = 0;
    for (let i = 0; i < 10; i++) {
      if (i > 0) {
        const km = 420 + Math.round(rnd() * 150);
        odo += km;
        deficit += (km * (6.1 + rnd() * 1.2)) / 100;
        d.setDate(d.getDate() + 9 + Math.round(rnd() * 3));
      }
      const full = i !== 5;
      const liters = i === 0 ? 41.6 : (full ? deficit : 15);
      deficit = full ? 0 : deficit - 15;
      const price = p0 * (1 + 0.035 * Math.sin(i / 1.7) + (rnd() - 0.5) * 0.02);
      const L = Math.round(liters * 100) / 100;
      entries.push({
        id: 'sample-' + i, vehicleId, date: todayISO(d), odo, liters: L,
        price: Math.round(price * 1000) / 1000, cost: Math.round(L * price * 100) / 100,
        full, missed: false, note: i === 5 ? 'Top-up on the highway' : '', created: i, sample: true,
      });
    }
    return { vehicles: [{ id: vehicleId, name: 'Sample car', created: 0, sample: true }], entries };
  }

  /* ---------- Import / export ---------- */

  const ID_RE = /[^A-Za-z0-9_\-.~:@+]/g;
  const num = (v) => isNum(v) ? v : (typeof v === 'string' && v.trim() !== '' && isFinite(+v) ? +v : null);

  function cleanEntry(e) {
    if (!e || typeof e !== 'object') return null;
    const out = {
      id: String(e.id || '').replace(ID_RE, '').slice(0, 60) || uid('e'),
      vehicleId: String(e.vehicleId || '').replace(ID_RE, '').slice(0, 60),
      date: /^\d{4}-\d{2}-\d{2}$/.test(e.date) ? e.date : null,
      odo: num(e.odo), liters: num(e.liters), price: num(e.price), cost: num(e.cost),
      full: e.full !== false, missed: !!e.missed,
      note: String(e.note || '').slice(0, 200),
      created: num(e.created) || Date.now(),
    };
    return out.date && out.odo != null && out.liters > 0 && out.vehicleId ? out : null;
  }

  function cleanVehicle(v) {
    if (!v || typeof v !== 'object') return null;
    const id = String(v.id || '').replace(ID_RE, '').slice(0, 60);
    const name = String(v.name || '').trim().slice(0, 40);
    return id && name ? { id, name, created: num(v.created) || Date.now() } : null;
  }

  /** Reads a backup file's text. Throws an Error with a readable message. */
  function parseBackup(text) {
    let data;
    try { data = JSON.parse(text); } catch (e) { throw new Error('That file is not a Fuel Tracker backup (it is not JSON).'); }
    if (!data || data.app !== 'fuel-tracker' || !Array.isArray(data.entries) || !Array.isArray(data.vehicles)) {
      throw new Error('That file is not a Fuel Tracker backup.');
    }
    const vehicles = data.vehicles.map(cleanVehicle).filter(Boolean);
    const ids = new Set(vehicles.map((v) => v.id));
    const entries = data.entries.map(cleanEntry).filter((e) => e && ids.has(e.vehicleId));
    const config = data.config && typeof data.config === 'object' ? data.config : {};
    return { vehicles, entries, config };
  }

  function csvCell(v) {
    let s = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d/.test(s)) s = "'" + s;
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  /** Spreadsheet export in the units the person reads in the app. */
  function toCSV(entries, vehicles, cfg) {
    const vol = cfg.vol, dist = cfg.dist;
    const volName = vol === 'L' ? 'litres' : (vol === 'galUS' ? 'us_gallons' : 'uk_gallons');
    const head = ['vehicle', 'date', 'odometer_' + dist, 'fuel_' + volName, 'price_per_' + (vol === 'L' ? 'litre' : 'gallon'),
      'total_' + cfg.currency, 'full_tank', 'missed_previous', 'distance_' + dist, 'consumption_' + cfg.econ, 'note'];
    const rows = [head];
    for (const v of vehicles) {
      const a = analyze(entries.filter((e) => e.vehicleId === v.id));
      for (const e of a.list) {
        const row = a.info[e.id];
        const ppu = e.price > 0 ? e.price : (isNum(e.cost) && e.liters > 0 ? e.cost / e.liters : null);
        rows.push([
          v.name, e.date, round(fromKm(e.odo, dist), 1), round(fromL(e.liters, vol), 3),
          ppu == null ? '' : round(ppu * (L_PER[vol] || 1), 3), hasCost(e) ? round(costOf(e), 2) : '',
          e.full ? 'yes' : 'no', e.missed ? 'yes' : 'no',
          row.dist == null ? '' : round(fromKm(row.dist, dist), 1),
          row.seg ? round(econ(row.seg.km, row.seg.liters, cfg.econ), 2) : '', e.note || '',
        ]);
      }
    }
    return rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
  }

  const round = (n, d) => Math.round(n * Math.pow(10, d)) / Math.pow(10, d);

  const api = {
    KM_PER_MI, L_PER, DIST, DIST_NAMES, VOL, VOL_NAMES, ECON, CURRENCIES,
    toKm, fromKm, toL, fromL, econ, parseNum, fmt, money, currencySymbol, region, localeDefaults,
    uid, todayISO, costOf, hasCost, sortEntries, analyze, odoWarnings, sampleData,
    cleanEntry, cleanVehicle, parseBackup, toCSV, round,
  };
  root.FT = root.FT || {};
  root.FT.calc = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
