/* Fuel Tracker: two small SVG charts drawn at the container's real pixel width. */
(function (root) {
  'use strict';

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const r1 = (n) => Math.round(n * 10) / 10;

  function niceTicks(min, max, count) {
    if (!(max > min)) { const d = Math.abs(min) * 0.1 || 1; min -= d; max += d; }
    const raw = (max - min) / Math.max(1, count);
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const n = raw / mag;
    const step = (n > 5 ? 10 : n > 2.5 ? 5 : n > 2 ? 2.5 : n > 1 ? 2 : 1) * mag;
    const lo = Math.floor(min / step + 1e-9) * step;
    const hi = Math.ceil(max / step - 1e-9) * step;
    const values = [];
    for (let v = lo; v <= hi + step / 2; v += step) values.push(Number(v.toFixed(10)));
    return { lo, hi: hi > lo ? hi : lo + step, values };
  }

  function placeTip(box, tip, x, y) {
    tip.hidden = false;
    const w = tip.offsetWidth, h = tip.offsetHeight;
    const left = Math.min(Math.max(4, x - w / 2), box.clientWidth - w - 4);
    let top = y - h - 14;
    if (top < 2) top = y + 14;
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
  }

  function wire(box, svg, count, show, hide) {
    let cur = null;
    const set = (i) => { cur = Math.max(0, Math.min(count - 1, i)); show(cur); };
    svg.addEventListener('pointermove', (e) => set(svg.__index(e)));
    svg.addEventListener('pointerdown', (e) => set(svg.__index(e)));
    svg.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') { cur = null; hide(); } });
    svg.addEventListener('blur', () => { cur = null; hide(); });
    svg.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        set(cur == null ? count - 1 : cur + (e.key === 'ArrowLeft' ? -1 : 1));
      } else if (e.key === 'Escape') { cur = null; hide(); }
    });
  }

  /**
   * Line of one value per full tank.
   * o: { points:[{v,label,sub}], avg, tick(v), value(v), aria, height }
   */
  function line(box, o) {
    const pts = o.points;
    const W = Math.max(240, Math.floor(box.clientWidth));
    const H = o.height || 184;
    const m = { l: 38, r: 14, t: 22, b: 28 };
    const vals = pts.map((p) => p.v).concat(o.avg != null ? [o.avg] : []);
    const lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    const pad = (hi - lo) * 0.2 || Math.abs(hi) * 0.08 || 1;
    const t = niceTicks(Math.max(0, lo - pad), hi + pad, 3);
    const span = W - m.l - m.r;
    const x = (i) => m.l + (pts.length === 1 ? span / 2 : (i * span) / (pts.length - 1));
    const y = (v) => m.t + ((t.hi - v) / (t.hi - t.lo)) * (H - m.t - m.b);
    const last = pts.length - 1;

    let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" tabindex="0" aria-label="${esc(o.aria)}">`;
    for (const v of t.values) {
      s += `<line class="grid" x1="${m.l}" x2="${W - m.r}" y1="${r1(y(v))}" y2="${r1(y(v))}"/>`;
      s += `<text class="tick" x="${m.l - 8}" y="${r1(y(v) + 4)}" text-anchor="end">${esc(o.tick(v))}</text>`;
    }
    const d = pts.map((p, i) => (i ? 'L' : 'M') + r1(x(i)) + ' ' + r1(y(p.v))).join(' ');
    if (pts.length > 1) s += `<path class="area" d="${d} L${r1(x(last))} ${H - m.b} L${r1(x(0))} ${H - m.b} Z"/>`;
    if (o.avg != null) {
      const ay = r1(y(o.avg));
      s += `<line class="ref" x1="${m.l}" x2="${W - m.r}" y1="${ay}" y2="${ay}"/>`;
      s += `<text class="ref-label" x="${m.l + 4}" y="${ay - 6}">avg ${esc(o.tick(o.avg))}</text>`;
    }
    if (pts.length > 1) s += `<path class="line" d="${d}"/>`;
    pts.forEach((p, i) => {
      if (pts.length <= 30 || i === last) s += `<circle class="dot${i === last ? ' end' : ''}" cx="${r1(x(i))}" cy="${r1(y(p.v))}" r="${i === last ? 5 : 4}"/>`;
    });
    const ey = y(pts[last].v);
    const endAbove = ey - 12 > m.t;
    s += `<text class="end-label" x="${r1(Math.min(x(last), W - m.r))}" y="${r1(endAbove ? ey - 11 : ey + 20)}" text-anchor="${pts.length === 1 ? 'middle' : 'end'}">${esc(o.value(pts[last].v))}</text>`;
    s += `<text class="tick" x="${m.l}" y="${H - 8}" text-anchor="start">${esc(pts[0].label)}</text>`;
    if (pts.length > 1) s += `<text class="tick" x="${W - m.r}" y="${H - 8}" text-anchor="end">${esc(pts[last].label)}</text>`;
    s += `<line class="cross" x1="0" x2="0" y1="${m.t - 6}" y2="${H - m.b}" visibility="hidden"/>`;
    s += `<circle class="sel" r="6" cx="0" cy="0" visibility="hidden"/>`;
    s += `</svg><div class="tip" hidden></div>`;
    box.innerHTML = s;

    const svg = box.querySelector('svg');
    const tip = box.querySelector('.tip');
    const cross = svg.querySelector('.cross');
    const sel = svg.querySelector('.sel');
    svg.__index = (e) => {
      const r = svg.getBoundingClientRect();
      const px = ((e.clientX - r.left) / r.width) * W;
      return pts.length === 1 ? 0 : Math.round(((px - m.l) / span) * last);
    };
    wire(box, svg, pts.length, (i) => {
      const p = pts[i];
      const scale = svg.getBoundingClientRect().width / W;
      cross.setAttribute('x1', r1(x(i))); cross.setAttribute('x2', r1(x(i)));
      cross.setAttribute('visibility', 'visible');
      sel.setAttribute('cx', r1(x(i))); sel.setAttribute('cy', r1(y(p.v)));
      sel.setAttribute('visibility', 'visible');
      tip.innerHTML = `<strong>${esc(o.value(p.v))}</strong><span>${esc(p.label)}</span>` + (p.sub ? `<span>${esc(p.sub)}</span>` : '');
      placeTip(box, tip, x(i) * scale, y(p.v) * scale);
    }, () => {
      cross.setAttribute('visibility', 'hidden');
      sel.setAttribute('visibility', 'hidden');
      tip.hidden = true;
    });
  }

  /**
   * Columns, one per month, growing from a zero baseline.
   * o: { bars:[{v,label,short,sub}], tick(v), value(v), aria, height }
   */
  function columns(box, o) {
    const bars = o.bars;
    const W = Math.max(240, Math.floor(box.clientWidth));
    const H = o.height || 170;
    const m = { l: 44, r: 6, t: 24, b: 26 };
    const max = Math.max.apply(null, bars.map((b) => b.v).concat([0]));
    const t = niceTicks(0, max || 1, 3);
    const band = (W - m.l - m.r) / bars.length;
    const bw = Math.min(24, band * 0.62);
    const base = H - m.b;
    const y = (v) => m.t + ((t.hi - v) / (t.hi - t.lo)) * (base - m.t);
    const cx = (i) => m.l + band * i + band / 2;

    let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" tabindex="0" aria-label="${esc(o.aria)}">`;
    for (const v of t.values) {
      s += `<line class="${v === 0 ? 'axis' : 'grid'}" x1="${m.l}" x2="${W - m.r}" y1="${r1(y(v))}" y2="${r1(y(v))}"/>`;
      s += `<text class="tick" x="${m.l - 8}" y="${r1(y(v) + 4)}" text-anchor="end">${esc(o.tick(v))}</text>`;
    }
    bars.forEach((b, i) => {
      const x0 = cx(i) - bw / 2;
      if (b.v > 0) {
        const top = y(b.v);
        const rr = Math.min(4, (base - top) / 2, bw / 2);
        s += `<path class="bar${i === bars.length - 1 ? ' now' : ''}" data-i="${i}" d="M${r1(x0)} ${base} V${r1(top + rr)} Q${r1(x0)} ${r1(top)} ${r1(x0 + rr)} ${r1(top)} H${r1(x0 + bw - rr)} Q${r1(x0 + bw)} ${r1(top)} ${r1(x0 + bw)} ${r1(top + rr)} V${base} Z"/>`;
      }
      s += `<text class="tick${i === bars.length - 1 ? ' strong' : ''}" x="${r1(cx(i))}" y="${H - 8}" text-anchor="middle">${esc(band >= 30 ? b.label : b.short)}</text>`;
    });
    const li = bars.length - 1;
    const lastBar = bars[li];
    if (lastBar && lastBar.v > 0) {
      // Right-aligned to the last column; lifted above its neighbour when the text reaches over it.
      const text = o.value(lastBar.v);
      const lx = Math.min(cx(li) + bw / 2, W - m.r);
      const reach = lx - text.length * 7;
      let top = y(lastBar.v);
      if (li > 0 && reach < cx(li - 1) + bw / 2) top = Math.min(top, y(bars[li - 1].v));
      s += `<text class="end-label" x="${r1(lx)}" y="${r1(Math.max(12, top - 8))}" text-anchor="end">${esc(text)}</text>`;
    }
    s += `</svg><div class="tip" hidden></div>`;
    box.innerHTML = s;

    const svg = box.querySelector('svg');
    const tip = box.querySelector('.tip');
    svg.__index = (e) => {
      const r = svg.getBoundingClientRect();
      const px = ((e.clientX - r.left) / r.width) * W;
      return Math.floor((px - m.l) / band);
    };
    wire(box, svg, bars.length, (i) => {
      const b = bars[i];
      const scale = svg.getBoundingClientRect().width / W;
      svg.querySelectorAll('.bar').forEach((el) => el.classList.toggle('on', +el.dataset.i === i));
      tip.innerHTML = `<strong>${esc(o.value(b.v))}</strong><span>${esc(b.full || b.label)}</span>` + (b.sub ? `<span>${esc(b.sub)}</span>` : '');
      placeTip(box, tip, cx(i) * scale, y(b.v) * scale);
    }, () => {
      svg.querySelectorAll('.bar.on').forEach((el) => el.classList.remove('on'));
      tip.hidden = true;
    });
  }

  root.FT = root.FT || {};
  root.FT.charts = { line, columns, esc };
})(typeof globalThis !== 'undefined' ? globalThis : this);
