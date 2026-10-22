/* The Handover — one signature visual per issue, rendered into <figure class="sig" data-sig="…">.
   Each figure is an inline SVG drawn at the stage's CSS width (1 unit = 1px, so hairlines and
   10px labels stay crisp at any DPR). Its state follows a progress value p (0..1) taken from the
   figure's position in the viewport: scrubbed, smoothed and fully reversible.
   Reduced motion, or a window too short to show the whole figure: the final, fully labelled
   state, static. JS off: the stage stays empty and signature.css hides it, leaving the
   figcaption as the text equivalent. */
(() => {
  'use strict';
  const figs = Array.from(document.querySelectorAll('figure.sig[data-sig]'));
  if (!figs.length || !document.createElementNS) return;

  const NS = 'http://www.w3.org/2000/svg';
  const hasIO = 'IntersectionObserver' in window;
  const rmq = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  let reduce = rmq.matches || !hasIO;

  const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = t => t * t * (3 - 2 * t);
  const easeOut = t => 1 - Math.pow(1 - t, 4);                     // close to the site's --ease-out
  const span = (p, a, b) => ease(clamp((p - a) / (b - a)));      // eased sub-range of p
  const px = v => Math.round(v) + 0.5;                             // centre a 1px stroke on the pixel grid
  const f2 = v => (Math.round(v * 100) / 100).toString();
  const NARROW = 540;                                              // below this stage width: the stacked layouts
  const MONO_TRACK = 0.18;

  function S(tag, attrs, parent) {
    const n = document.createElementNS(NS, tag);
    if (attrs) for (const k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  // Letter-spaced mono labels anchored "middle"/"end" are nudged by half/all of the trailing
  // tracking so they sit optically where they should.
  const nudge = (size, anchor, track) => track ? size * track * (anchor === 'end' ? 1 : anchor === 'middle' ? 0.5 : 0) : 0;
  function T(parent, str, x, y, cls, size, anchor, track) {
    const t = S('text', { x: f2(x + nudge(size, anchor, track)), y: f2(y), class: cls, 'font-size': size, 'text-anchor': anchor || null }, parent);
    t.textContent = str;
    t._a = [size, anchor, track];
    return t;
  }
  // per-frame writes skip values that have not changed, so idle parts of a drawing are not invalidated
  const put = (n, k, v) => { const c = n._v || (n._v = {}); if (c[k] !== v) { c[k] = v; n.setAttribute(k, v); } };
  const setX = (t, x) => put(t, 'x', f2(x + nudge(t._a[0], t._a[1], t._a[2])));
  const textW = t => { try { return t.getBBox().width; } catch (e) { return t.textContent.length * 8; } };
  const show = (n, o) => put(n, 'opacity', f2(clamp(o)));

  /* ---------- A. Vol. 01 · "agent-trust": review everything, then sample, humans at the gates ---------- */
  function agentTrust(svg, W) {
    const narrow = W < NARROW;
    const ms = narrow ? 10 : 10.5;                       // mono label size
    const ns = narrow ? Math.round(clamp(W * 0.105, 29, 34)) : 46;   // italic numeral size (smaller on the tiniest screens)
    const g = S('g', null, svg);

    // 1 · The trust track. Left: the start (review 100%). Right: once trust is built (sample 10–20%).
    const yLab = 11;
    const labL = T(g, 'AWAL · REVIEW', 0, yLab, 'm', ms, null, MONO_TRACK);
    const labR = T(g, 'SETELAH PERCAYA · SAMPEL', W, yLab, 'm', ms, 'end', MONO_TRACK);
    let yLabB = yLab;
    if (textW(labL) + textW(labR) + 20 > W) {           // too tight for one line each: both become two-line labels
      labL.textContent = 'AWAL'; labR.textContent = 'SETELAH PERCAYA';
      yLabB = yLab + 14;
      T(g, 'REVIEW', 0, yLabB, 'm', ms, null, MONO_TRACK);
      T(g, 'SAMPEL', W, yLabB, 'm', ms, 'end', MONO_TRACK);
    }
    const yNum = Math.round(yLabB + 10 + ns * 0.8);
    const numL = T(g, '100%', 0, yNum, 'n mu', ns);
    const numLa = T(g, '100%', 0, yNum, 'n ac', ns);
    const numR = T(g, '10–20%', W - 2, yNum, 'n mu', ns, 'end');
    const numRa = T(g, '10–20%', W - 2, yNum, 'n ac', ns, 'end');
    const gapN = narrow ? 14 : 24;
    const x1 = Math.round(textW(numL) + gapN), x2 = Math.round(W - 2 - textW(numR) - gapN);
    const yT = px(yNum - ns * 0.3);
    S('line', { x1, y1: yT, x2, y2: yT, class: 'hair' }, g);
    S('line', { x1: px(x1), y1: yT - 5, x2: px(x1), y2: yT + 5, class: 'ink-1' }, g);
    S('line', { x1: px(x2), y1: yT - 5, x2: px(x2), y2: yT + 5, class: 'ink-1' }, g);
    const run = S('line', { x1, y1: yT, x2: x1, y2: yT, class: 'acc-2' }, g);
    const head = S('circle', { cx: x1, cy: yT, r: narrow ? 4.5 : 5.5, class: 'head' }, g);
    T(g, narrow ? 'KEPERCAYAAN →' : 'KEPERCAYAAN TERBANGUN →', (x1 + x2) / 2, yT + 19, 'm mu', 10, 'middle', MONO_TRACK);

    const ySep = yNum + (narrow ? 22 : 26);
    S('line', { x1: 0, y1: px(ySep), x2: W, y2: px(ySep), class: 'hair' }, g);

    // 2 · The outputs: paper tiles with ruled "text"
    function doc(x, y, tw, th) {
      const d = S('g', { transform: `translate(${x},${y})` }, g);
      S('rect', { x: 0.5, y: 0.5, width: tw - 1, height: th - 1, class: 'doc' }, d);
      const ink = S('rect', { x: 0.5, y: 0.5, width: tw - 1, height: th - 1, class: 'doc-ink' }, d);
      const body = S('g', null, d);
      const lx = Math.round(tw * 0.15), lw = tw - lx * 2;
      S('rect', { x: lx, y: Math.round(th * 0.15), width: Math.round(lw * 0.55), height: 2, class: 'doc-head' }, body);
      const rows = th > 70 ? [0.96, 0.82, 0.92, 0.58] : [0.96, 0.84, 0.6];
      rows.forEach((f, i) => {
        const y0 = px(th * 0.33 + i * th * 0.13);
        S('line', { x1: lx, y1: y0, x2: lx + Math.round(lw * f), y2: y0, class: 'doc-line' }, body);
      });
      return { d, ink, body };
    }
    function check(parent, cx, cy, r) {             // the review mark: a filled accent disc with a tick
      const outer = S('g', { transform: `translate(${f2(cx)},${f2(cy)})` }, parent);
      const inner = S('g', null, outer);
      S('circle', { r, class: 'chk' }, inner);
      S('path', { d: `M${f2(-r * 0.45)},${f2(r * 0.02)} L${f2(-r * 0.12)},${f2(r * 0.36)} L${f2(r * 0.46)},${f2(-r * 0.32)}`, class: 'chk-tick' }, inner);
      return inner;
    }
    function stamp(parent, cx, cy, w, h) {           // the human gate: a rubber stamp, always there
      const s = S('g', { transform: `translate(${f2(cx)},${f2(cy)}) rotate(-6)` }, parent);
      S('rect', { x: -w / 2, y: -h / 2, width: w, height: h, class: 'stamp-o' }, s);
      S('rect', { x: -w / 2 + 2.5, y: -h / 2 + 2.5, width: w - 5, height: h - 5, class: 'stamp-i' }, s);
      T(s, 'MANUSIA', 0, 3.6, 'm stamp-t', 10, 'middle', 0.12);
      return s;
    }

    const cr = narrow ? 8 : 9;                          // check radius (the badge overhangs a tile's corner)
    const ls = 10;                                      // risk label size
    const RISK = [['APPROVAL'], ['TAK BISA', 'DIBATALKAN'], ['IMPLIKASI', 'REPUTASI']];
    const inkW = str => { const t = T(g, str, 0, 0, 'm', ls, null, MONO_TRACK); const w = textW(t); g.removeChild(t); return w; };
    const lblW = inkW('DIBATALKAN');                    // the longest word under a risk tile
    const lastLblW = Math.max(...RISK[2].map(inkW)) - ls * MONO_TRACK;   // the last column's labels, ink only
    // wide: routine grid (5 × 2) | divider | three risk columns wide enough for their labels
    // narrow: the grid spans the width; tiles stop growing at 58px so the figure stays compact
    const D = Math.round(clamp(W * 0.065, 32, 52));
    const tw = narrow ? Math.min(58, Math.floor((W - cr - 4 * 16) / 5))
      : Math.round(clamp((W - D - 3 * (lblW + 14)) / 6.08, 40, 68));
    const th = Math.round(tw * 1.26);
    const gx = narrow ? (W - cr - 5 * tw) / 4 : Math.round(tw * 0.27);
    const gy = narrow ? 18 : 20;
    const routineW = 5 * tw + 4 * gx;
    const riskX = narrow ? 0 : routineW + D;
    const xd = px(routineW + D / 2);                    // the divider (wide)
    const sw = narrow ? 60 : 64, sh = 20, sHalf = sw / 2 + 2;   // stamp size (+ the corners its tilt adds)
    // wide: the pitch is set so the last column's ink (tile, stamp or label) ends flush with the
    // figure's right edge, like the flush-right header above it
    const lastW = Math.max(tw, tw * 0.55 + sHalf, lastLblW);
    const riskP = (W - riskX - lastW) / 2;

    // zone headers
    const yH1 = ySep + 26, yH2 = yH1 + 15;
    T(g, 'HASIL RUTIN', 0, yH1, 'm b', ms, null, MONO_TRACK);
    const legend = S('g', null, g);
    check(legend, 5.5, yH2 - 3.5, 5.5);
    T(legend, 'DIREVIEW', 17, yH2, 'm mu', 10, null, MONO_TRACK);

    const yTiles = yH2 + 22;
    const routine = [];
    for (let i = 0; i < 10; i++) {
      const c = i % 5, r = Math.floor(i / 5);
      const x = Math.round(c * (tw + gx)), y = yTiles + r * (th + gy);
      const t = doc(x, y, tw, th);
      t.mark = check(g, x + tw - 2, y + 2, cr);
      routine.push(t);
    }
    const routineBottom = yTiles + 2 * th + gy;

    // high-risk points: named in the text (approval, irreversible actions, reputation)
    const yR1 = narrow ? routineBottom + 40 : yH1, yR2 = yR1 + 15;
    T(g, 'TITIK BERISIKO TINGGI', riskX, yR1, 'm b', ms, null, MONO_TRACK);
    T(g, 'SELALU LEWAT MANUSIA', riskX, yR2, 'm ac', ms, null, MONO_TRACK);
    if (!narrow) S('line', { x1: xd, y1: ySep + 14, x2: xd, y2: routineBottom, class: 'hair dash' }, g);
    const yRT = yR2 + 22;
    let riskBottom = 0;
    RISK.forEach((lines, i) => {
      // wide: three columns of their own, labels set left; narrow: on routine columns 1, 3, 5,
      // every label centred under its tile (the outer ones held inside the figure)
      const x = narrow ? Math.round(i * 2 * (tw + gx)) : Math.round(riskX + i * riskP);
      doc(x, yRT, tw, th);
      const nodes = lines.map((l, k) => T(g, l, x, yRT + th + 20 + k * 13, 'm', ls, narrow ? 'middle' : null, MONO_TRACK));
      const bw = Math.max(...nodes.map(textW)) - ls * MONO_TRACK;   // ink width (no trailing tracking)
      riskBottom = yRT + th + 20 + (lines.length - 1) * 13;
      if (narrow) {
        const cx = clamp(x + tw / 2, bw / 2, W - bw / 2);
        nodes.forEach(n => setX(n, cx));
      }
      const scx = narrow ? clamp(x + tw / 2, sHalf + 1, W - sHalf - 1)
        : Math.max(x + tw * 0.55, i === 0 ? xd + sHalf + 6 : 0);
      stamp(g, scx, yRT + th * 0.72, sw, sh);
    });

    // which routine outputs stop being reviewed, in order; 2 of 10 stay as the sample (10–20%)
    const DROP = [4, 9, 1, 7, 3, 8, 0, 5];
    const h = Math.ceil(Math.max(routineBottom, riskBottom) + 8);

    return {
      h,
      // only the trust track and the routine grid change; the risk row below them is static, so
      // the scrub is keyed to this band (it fits a phone's window where the whole figure does not)
      movTop: 0,
      movBottom: routineBottom,
      update(p) {
        const q = span(p, 0.04, 0.82);
        const hx = f2(lerp(x1, x2, q));
        put(run, 'x2', hx); put(head, 'cx', hx);
        const c = span(p, 0.45, 0.78);
        show(numLa, 1 - c); show(numRa, c);           // the accent copies fade over muted copies that stay at full strength
        DROP.forEach((idx, k) => {
          const a = 0.1 + k * 0.07, v = 1 - span(p, a, a + 0.12);
          const t = routine[idx];
          show(t.ink, v); show(t.body, 0.45 + 0.55 * v); show(t.mark, v);
          put(t.mark, 'transform', `scale(${f2(0.4 + 0.6 * v)})`);
        });
        return false;
      }
    };
  }

  /* ---------- B. Vol. 02 · "bottleneck": building shrinks, the bottleneck moves to measure + learn ---------- */
  let uid = 0;
  function bottleneck(svg, W) {
    const narrow = W < NARROW;
    const ms = narrow ? 10 : 10.5;                       // mono labels
    const ws = narrow ? (W < 300 ? 14 : 15) : 20;        // stage names
    const ps = narrow ? 15 : 18, gs = narrow ? 13 : 15;  // bottleneck phrase, its muted "then" echo
    const pad = narrow ? 8 : 12;
    const brk = narrow ? 10 : 14, sl = narrow ? 3 : 4.5; // the axis break between "bangun" and the unscaled stages; lean of the cut
    const g = S('g', null, svg);
    const id = 'sig-hatch-' + (++uid);
    const pat = S('pattern', { id, width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, S('defs', null, svg));
    S('line', { x1: 0, y1: 0, x2: 0, y2: 6, class: 'hatch' }, pat);

    const yK = 11, yP = yK + (narrow ? 21 : 25);         // kicker + phrase baselines
    const yBr = yP + 15, yBar = yBr + 14, bh = narrow ? 54 : 60;
    const top = yBar + 0.5, bot = yBar + bh + 0.5;
    const yLoop = yBar + bh + 16;
    const yD = yLoop + 24, yDl = yD + 19;
    const yW = yBar + bh / 2 + ws * 0.32;

    // stage names first, to size the stages around them (moved on top of the shapes below)
    const nB = T(g, 'Bangun', 0, yW, 'w halo', ws);
    const nU = T(g, 'Ukur', 0, yW, 'w halo', ws);
    const nL = T(g, 'Belajar', 0, yW, 'w halo', ws);
    const U = Math.max(Math.round(W * 0.2), Math.ceil(textW(nL) + pad * 2 + sl));   // "ukur", "belajar": same size, unscaled
    const xU = W - 2 * U;                                // where "ukur" starts (middle of its cut edge)
    const xB = xU - brk;                                 // where "bangun" ends (fixed); its start moves right
    // "bangun" shrinks to about a tenth of its six-week length: days out of forty-two
    const bxMax = xB - Math.max(10, Math.round(xB * 0.1));
    const wB = textW(nB);
    const fitW = Math.ceil(wB + pad * 2 + sl);          // the narrowest box that still holds its name
    const R = W - 0.5;

    // stacking: ghost outline, paper fills, hatch, outlines, names
    const ghost = S('path', { d: `M0.5,${top}H${f2(xB + sl)}L${f2(xB - sl)},${bot}H0.5Z`, class: 'ghost' }, g);
    const fillB = S('path', { class: 'seg-fill' }, g);
    S('path', { d: `M${f2(xU + sl)},${top}H${R}V${bot}H${f2(xU - sl)}Z`, class: 'seg-fill' }, g);
    const hz = S('path', { fill: `url(#${id})` }, g);    // the bottleneck zone
    const segB = S('path', { class: 'seg' }, g);
    S('path', { d: `M${f2(xU + sl)},${top}H${px(xU + U)}V${bot}H${f2(xU - sl)}Z`, class: 'seg' }, g);
    S('path', { d: `M${px(xU + U)},${top}H${R}V${bot}H${px(xU + U)}Z`, class: 'seg' }, g);
    // once the box is too small for it, the name steps out and sits to its left, in the old span
    const nBo = T(g, 'Bangun', 0, yW, 'w halo', ws, 'end');
    [nB, nU, nL].forEach(n => g.appendChild(n));
    setX(nU, xU + pad); setX(nL, xU + U + pad);

    // the bottleneck marker (above): bracket + kicker + phrase; the phrase names the constraint
    const kick = T(g, 'LEHER BOTOL', 0, yK, 'm ac b', ms, 'middle', MONO_TRACK);
    const ph0 = T(g, 'seberapa cepat kita membangun', 0, yP, 'w ac', ps, 'middle');
    const ph1 = T(g, 'dua-duanya urusan manusia', 0, yP, 'w ac', ps, 'middle');
    const w0 = textW(ph0), w1 = textW(ph1), wk = textW(kick);
    const bracket = S('path', { class: 'acc-1' }, g);
    const stem = S('line', { y1: px(yBr), y2: px(yBr - 6), class: 'acc-1' }, g);
    const yb = yBr + 8;
    const brPath = (a, b) => `M${px(a + 1)},${yb}V${px(yBr)}H${px(b - 1)}V${yb}`;
    // where it rests once it has moved: centred over "ukur" + "belajar", kept whole inside the figure
    const half1 = Math.max(wk, w1) / 2;
    const c1 = clamp((xU + sl + R) / 2, half1, W - half1);

    // …and the echo it leaves behind over the old six-week "bangun": muted, dashed
    const echo = S('g', null, g);
    const gc = (xB + sl) / 2;
    const ek = T(echo, 'DULU', gc, yK, 'm mu', ms, 'middle', MONO_TRACK);
    const ep = T(echo, 'seberapa cepat kita membangun', gc, yP, 'w mu', gs, 'middle');
    const wep = textW(ep), ecx = Math.max(gc, wep / 2);
    if (ecx + wep / 2 + 16 > c1 - half1) echo.removeChild(ep);              // no room beside the new marker: the kicker alone
    else setX(ep, ecx);
    if (gc + textW(ek) / 2 + 16 > c1 - wk / 2) echo.removeChild(ek);
    S('path', { d: brPath(0, xB + sl), class: 'echo-br' }, echo);
    S('line', { x1: px(gc), x2: px(gc), y1: px(yBr), y2: px(yBr - 6), class: 'echo-st' }, echo);

    // the way back to the start: build → measure → learn → build again
    const loop = S('path', { class: 'loop' }, g);
    const arrow = S('path', { class: 'loop-head' }, g);

    // one dimension line, under "bangun" only: then (dashed, six weeks) and now (solid, days).
    // "ukur" and "belajar" sit past the axis break and are marked as unscaled.
    const dPath = (a, b) => `M${px(a)},${yD - 5}V${yD + 5}M${px(a)},${px(yD)}H${px(b)}M${px(b)},${yD - 5}V${yD + 5}`;
    S('path', { d: dPath(0, xB), class: 'dim-ghost' }, g);
    const dimNow = S('path', { class: 'dim-now' }, g);
    const SW = 14, SG = 6;                               // legend swatch length, gap to its label
    const swatch = (parent, x, y, cls) => S('path', { d: `M${f2(x)},${px(y - 3.5)}H${f2(x + SW)}`, class: cls }, parent);
    const thenG = S('g', null, g);
    swatch(thenG, 0, yDl, 'dim-ghost');
    const thenMu = T(thenG, 'DULU · ENAM MINGGU', SW + SG, yDl, 'm mu', ms, null, MONO_TRACK);
    const thenInk = T(g, 'DULU · ENAM MINGGU', SW + SG, yDl, 'm', ms, null, MONO_TRACK);
    const thenR = SW + SG + textW(thenMu);
    const nowG = S('g', null, g);
    const now = T(nowG, 'SEKARANG · HITUNGAN HARI', xB, yDl, 'm', ms, 'end', MONO_TRACK);
    const wNow = textW(now) - ms * MONO_TRACK;
    let h = yDl + 8;
    let nowL = xB - wNow - SW - SG;
    if (nowL < thenR + 18) {                             // no room for one row: "now" goes underneath
      now.setAttribute('y', yDl + 17);
      h += 17;
      if (nowL < 0) {                                    // and if it is wider than "bangun", it starts at the left edge
        nowL = 0; now._a[1] = null;
        now.removeAttribute('text-anchor'); setX(now, SW + SG);
      }
    }
    swatch(nowG, nowL, +now.getAttribute('y'), 'dim-now');
    // in the slot where their dimension line would be: no scale for these two
    const uns = T(g, 'TANPA SKALA', 0, yD + Math.round(ms * 0.36), 'm mu', ms, 'middle', MONO_TRACK);
    const wu = textW(uns);
    setX(uns, clamp((xU + R) / 2, xU + wu / 2, W - wu / 2));

    // the bottleneck is a state, not a scrub: once "bangun" has shrunk it moves in one short,
    // time-based step (and back, if the reader scrolls back)
    const DUR = 300;
    let z = 0, goal = 0, from = 0, to = 0, t = 0, d = 0;

    return {
      h,
      update(p, dt) {
        const k = span(p, 0.05, 0.5);                  // compression of "bangun"
        const bx = Math.round(lerp(0, bxMax, k)), bw = xB - bx;
        const bPath = `M${px(bx)},${top}H${f2(xB + sl)}L${f2(xB - sl)},${bot}H${px(bx)}Z`;
        put(segB, 'd', bPath); put(fillB, 'd', bPath);
        setX(nB, bx + pad); show(nB, ease(clamp((bw - fitW) / 14)));
        setX(nBo, Math.max(bx - 6, wB)); show(nBo, ease(clamp((fitW + 3 - bw) / 16)));   // mostly after the inner one has gone
        show(ghost, span(p, 0.05, 0.2));
        // the dimension line and its key always agree: at the start the six weeks are drawn in the
        // "then" style (dashed); the solid "now" line and its key arrive together
        put(dimNow, 'd', dPath(bx, xB));
        const nw = span(p, 0.05, 0.25);
        show(dimNow, nw); show(nowG, nw);
        show(thenInk, 1 - span(p, 0.25, 0.5));

        if (p >= 0.55) goal = 1; else if (p < 0.5) goal = 0;   // a little hysteresis
        if (!(dt > 0)) { z = to = goal; d = 0; }                // snap (build, leaving the view, static modes)
        else {
          if (goal !== to) { from = z; to = goal; t = 0; d = DUR * Math.abs(to - from); }   // (re)start from where it is
          if (d > 0) { t = Math.min(d, t + dt); z = lerp(from, to, easeOut(t / d)); if (t >= d) { z = to; d = 0; } }
        }

        // zone, bracket and label travel together from "bangun" to "ukur" + "belajar"
        const tl = lerp(bx, xU + sl, z), tr = lerp(xB + sl, R, z), br = lerp(xB - sl, R, z), bl = lerp(bx, xU - sl, z);
        put(hz, 'd', `M${f2(tl)},${top}L${f2(tr)},${top}L${f2(br)},${bot}L${f2(bl)},${bot}Z`);
        put(bracket, 'd', brPath(tl, tr));
        const cx = px((tl + tr) / 2);
        put(stem, 'x1', cx); put(stem, 'x2', cx);
        const half0 = Math.max(wk, w0) / 2;
        const c0 = clamp((bx + xB + sl) / 2, half0, W - half0);
        const lc = lerp(c0, c1, z);
        // each line is held inside the figure by its own width (the longer "then" phrase too, as it fades)
        setX(kick, clamp(lc, wk / 2, W - wk / 2)); setX(ph0, clamp(lc, w0 / 2, W - w0 / 2)); setX(ph1, clamp(lc, w1 / 2, W - w1 / 2));
        show(ph0, 1 - z); show(ph1, z);                   // the phrase turns over in place
        put(ph0, 'y', f2(yP - 6 * z)); put(ph1, 'y', f2(yP + 6 * (1 - z)));
        show(echo, z);

        // loop back under the bar, from the end of "belajar" to the start of "bangun"
        const lr = 7, xs = W - 16, xe = Math.min(bx + (narrow ? 14 : 18), (bx + xB - sl) / 2), y0 = yBar + bh + 1;
        put(loop, 'd', `M${px(xs)},${y0}V${px(yLoop - lr)}Q${px(xs)},${px(yLoop)} ${px(xs - lr)},${px(yLoop)}H${px(xe + lr)}Q${px(xe)},${px(yLoop)} ${px(xe)},${px(yLoop - lr)}V${y0 + 5}`);
        put(arrow, 'd', `M${px(xe) - 3.5},${y0 + 6}L${px(xe)},${y0 + 1}L${px(xe) + 3.5},${y0 + 6}`);
        return z !== goal;
      }
    };
  }

  // The figcaption already names each figure; the drawing's own label says what the picture adds.
  const SCENES = {
    'agent-trust': {
      draw: agentTrust,
      label: 'Diagram: sepuluh lembar hasil rutin. Seiring kepercayaan terbangun, tanda review berkurang dari semua lembar menjadi dua lembar sampel. Tiga lembar berisiko tinggi, yaitu approval, tak bisa dibatalkan, dan implikasi reputasi, selalu berstempel MANUSIA.'
    },
    'bottleneck': {
      draw: bottleneck,
      label: 'Diagram: satu batang berisi bangun, ukur, belajar, dengan panah kembali ke awal. Bangun menyusut dan meninggalkan garis putus-putus sepanjang enam minggu. Ukur dan belajar digambar tanpa skala. Tanda leher botol pindah dari bangun ke ukur dan belajar.'
    }
  };

  /* ---------- mounting, layout and scroll progress ---------- */
  const items = [];
  figs.forEach(fig => {
    const scene = SCENES[fig.dataset.sig];
    const stage = fig.querySelector('.sig-stage');
    if (!scene || !stage) return;
    const it = { fig, stage, scene, w: 0, view: null, p: 1, target: 1, drawn: -1, visible: false, anim: false, top0: 0, start: 1, end: 0, still: false, fresh: false };
    items.push(it);
    // mounted: the caption-only (JS-off) styling no longer applies, so the figure already has the
    // width it will have once the drawing is in (signature.css)
    fig.classList.add('sig-live');
    try { Object.defineProperty(fig, '_sig', { value: it }); } catch (e) {}   // read-only handle for probes
  });
  if (!items.length) return;

  // where the phone masthead tucks away while the reader scrolls down (reader.css, same query)
  const tuckMq = window.matchMedia ? matchMedia('(max-width:780px),(max-height:500px) and (hover:none)') : { matches: false };

  // Geometry is read only here (build, resize, load, fonts, layout changes, entering the view),
  // never on the scroll path: scroll frames use the cached page offset and scroll position.
  let vh = innerHeight, end0 = 0, inset = 0, sy = scrollY;
  function measureView() {
    vh = innerHeight || document.documentElement.clientHeight;
    if (tuckMq.matches) {
      // phones: the masthead is tucked away while the reader scrolls down through the essay, so
      // only the notch / status bar (env(safe-area-inset-top), exposed by signature.css) counts
      const st = items[0] && items[0].stage;
      end0 = 12 + (st ? parseFloat(getComputedStyle(st).scrollMarginTop) || 0 : 0);
    } else {
      const m = document.querySelector('.masthead');
      end0 = Math.max((m ? m.offsetHeight : 0) + 12, vh * 0.1);
    }
    // the reader's chapter chip (pill mode) covers the foot of the window: 14px + 44px, plus air
    inset = document.documentElement.classList.contains('rd-mode-pill') ? 72 : 0;
  }
  // The scrub runs while the part of the drawing that changes (view.movTop..movBottom; the whole
  // drawing by default) is in view: p = 0 once that band has fully come up (above the chip, when
  // there is one), p = 1 when its top nears the masthead. A window too short to give it 100px of
  // such travel (landscape phones) gets the final state, static.
  function measure(it) {
    const r = it.stage.getBoundingClientRect();
    const v = it.view, mt = v.movTop || 0, mb = v.movBottom != null ? v.movBottom : r.height;
    sy = scrollY;
    it.top0 = r.top + sy;
    it.start = Math.min(vh * 0.72, vh - inset - (mb - mt) - 8) - mt;
    it.end = end0 - mt;
    it.still = it.start - it.end < 100;
  }
  function targetFor(it) {
    if (reduce || it.still) return 1;
    return clamp((it.start - (it.top0 - sy)) / (it.start - it.end));
  }
  function render(it, dt) {
    it.anim = !!it.view.update(it.p, dt);
    it.drawn = it.p;
  }
  function settle(it) {                                // land in the right state, no catch-up animation
    it.p = it.target = targetFor(it);
    render(it, 0);
  }

  function build(it, force) {
    // the figure's real (possibly fractional) width, floored: the SVG is then drawn at exactly W CSS
    // px and never rescaled, so the +0.5 hairline snapping holds (the stage is display:none while empty)
    const W = Math.floor(it.fig.getBoundingClientRect().width);
    if (!W || (W === it.w && !force)) return;
    it.w = W;
    const svg = S('svg', { role: 'img', 'aria-label': it.scene.label, focusable: 'false' });
    while (it.stage.firstChild) it.stage.removeChild(it.stage.firstChild);
    it.stage.appendChild(svg);                       // in the DOM first, so text can be measured
    const view = it.scene.draw(svg, W);
    Array.from(svg.children).forEach(c => c.setAttribute('aria-hidden', 'true'));   // the label speaks for the drawing
    svg.setAttribute('viewBox', `0 0 ${W} ${view.h}`);
    svg.setAttribute('width', W);
    svg.setAttribute('height', view.h);
    it.view = view;
    it.fresh = true;
  }
  function refresh(force) {
    measureView();
    items.forEach(it => build(it, force));
    items.forEach(it => { if (it.view) measure(it); });
    items.forEach(it => { if (it.fresh) { it.fresh = false; settle(it); } });
    kick();
  }

  let raf = 0, last = 0;
  function frame(now) {
    raf = 0;
    const dt = last ? Math.min(64, now - last) : 16;
    last = now;
    let moving = false;
    items.forEach(it => {
      if (!it.view) return;
      if (it.visible) it.target = targetFor(it);      // cached geometry only: no layout reads here
      const d = it.target - it.p;
      if (Math.abs(d) > 0.0008) { it.p += d * (1 - Math.exp(-dt / 90)); moving = true; }
      else it.p = it.target;
      if (it.p !== it.drawn || it.anim) { render(it, dt); if (it.anim) moving = true; }
    });
    if (moving) raf = requestAnimationFrame(frame); else last = 0;
  }
  function kick() { if (!raf && !reduce && items.some(it => it.visible)) raf = requestAnimationFrame(frame); }
  function onScroll() {
    sy = scrollY;                                    // layout is clean while scroll events dispatch
    // queue this frame behind the other modules' scroll frames: they read layout, this one only writes
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    kick();
  }

  let io = null;
  function onIntersect(entries) {
    entries.forEach(e => {
      const it = items.find(x => x.fig === e.target);
      if (!it) return;
      const was = it.visible;
      it.visible = e.isIntersecting;
      if (reduce || !it.view) return;
      if (it.visible) {                              // entering (just off-screen, or after a jump): land, then scrub
        measure(it);
        if (!was) settle(it);
      } else {                                         // left the view: settle on the side it left from
        it.p = it.target = it.still ? 1 : e.boundingClientRect.top > 0 ? 0 : 1;
        render(it, 0);
      }
    });
    kick();
  }
  function startScrub() {
    if (!io) io = new IntersectionObserver(onIntersect, { rootMargin: '15% 0px 15% 0px' });
    items.forEach(it => io.observe(it.fig));
    addEventListener('scroll', onScroll, { passive: true });
  }
  function stopScrub() {
    if (io) io.disconnect();
    removeEventListener('scroll', onScroll);
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    items.forEach(it => { it.visible = false; if (it.view) settle(it); });
  }

  // Labels are measured at build time, so a web font arriving can change the layout. All font
  // triggers fold into one rebuild, and only when the faces' metrics actually changed.
  let fontKey = '', fontT = 0;
  const cv = document.createElement('canvas').getContext('2d');
  function metrics() {
    if (!cv) return '';
    const w = f => { cv.font = f; return cv.measureText('DIBATALKAN Belajar 10–20%').width.toFixed(2); };
    return [w("10px 'JetBrains Mono', ui-monospace, monospace"), w("500 10px 'JetBrains Mono', ui-monospace, monospace"),
      w("italic 300 20px 'Fraunces', Georgia, serif"), w("italic 400 20px 'Fraunces', Georgia, serif")].join('|');
  }
  function fontsChanged() {                          // trailing: faces often land a few ms apart
    clearTimeout(fontT);
    fontT = setTimeout(() => {
      const k = metrics();
      if (k !== fontKey) { fontKey = k; refresh(true); }
    }, 80);
  }

  fontKey = metrics();
  refresh();
  if (!reduce) startScrub();
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      fontsChanged();
      if (document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', fontsChanged);
    });
  }
  addEventListener('load', () => refresh());

  // width changes rebuild; any change in the page's height (content above the figure) re-measures
  let resizeT = 0;
  const onResize = () => { clearTimeout(resizeT); resizeT = setTimeout(() => refresh(), 120); };
  addEventListener('resize', onResize, { passive: true });
  if ('ResizeObserver' in window) {
    const ro = new ResizeObserver(entries => {
      let rebuild = false;
      entries.forEach(e => { const it = items.find(x => x.fig === e.target); if (it && Math.floor(e.contentRect.width) !== it.w) rebuild = true; });
      if (rebuild) onResize();
      else { items.forEach(it => { if (it.view) measure(it); }); kick(); }
    });
    items.forEach(it => ro.observe(it.fig));
    ro.observe(document.body);
  }

  // the OS preference can flip mid-session, either way
  const onPref = () => {
    const r = rmq.matches || !hasIO;
    if (r === reduce) return;
    reduce = r;
    if (reduce) stopScrub();
    else { measureView(); items.forEach(it => { if (it.view) { measure(it); settle(it); } }); startScrub(); }
  };
  if (rmq.addEventListener) rmq.addEventListener('change', onPref); else if (rmq.addListener) rmq.addListener(onPref);
})();
