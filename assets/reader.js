/* The Handover — reader layer: the things a reader can do. Chapter rail (desktop) and chapter
   pill + sheet (smaller screens), tucking phone masthead, continue reading, read state on issue
   links, quote sharing, heading anchors, reference popovers, one shared toast, low-light mode.
   Progressive: nothing here is needed to read the page. Loaded with defer after site.js. */
(() => {
  'use strict';
  const doc = document, html = doc.documentElement, body = doc.body;
  if (!body || !('IntersectionObserver' in window)) return;

  /* ---------- helpers ---------- */
  const $ = (s, r = doc) => Array.from(r.querySelectorAll(s));
  const mq = q => matchMedia(q);
  const rmq = mq('(prefers-reduced-motion: reduce)');
  const touchMq = mq('(hover: none), (pointer: coarse)');
  const phoneMq = mq('(max-width: 780px)');
  const tuckMq = mq('(max-width: 780px), (max-height: 500px) and (hover: none)');   // phones, upright or on their side
  const reduce = () => rmq.matches;
  const behavior = () => (reduce() ? 'instant' : 'smooth');
  // a page prerendered by the speculation rules runs this script early: anything that depends on
  // what the reader did in the meantime (storage, toasts) waits until the page is actually shown
  const whenShown = fn => (doc.prerendering ? doc.addEventListener('prerenderingchange', fn, { once: true }) : fn());
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  function h(tag, attrs, ...kids) {
    const el = doc.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v; else el.setAttribute(k, v === true ? '' : v);
    }
    kids.forEach(k => k != null && el.append(k));
    return el;
  }
  const SVGNS = 'http://www.w3.org/2000/svg';
  function svg(markup, cls) {
    const s = doc.createElementNS(SVGNS, 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('focusable', 'false');
    if (cls) s.setAttribute('class', cls);
    s.innerHTML = markup;
    return s;
  }
  const onMq = (m, fn) => (m.addEventListener ? m.addEventListener('change', fn) : m.addListener && m.addListener(fn));

  /* storage: every access guarded (private mode, blocked storage, quota) */
  const K_THEME = 'handover:theme', K_READ = 'handover:reading';
  const store = {
    get(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  };
  function normPath(p) {
    try { p = new URL(p, location.href).pathname; } catch (e) { /* keep as given */ }
    p = String(p || '/').replace(/index\.html?$/i, '');
    if (p === '/vol-01-the-handover/') p = '/';            // Vol. 01's permanent address lives on the front page
    return p.endsWith('/') ? p : p + '/';
  }
  const PATH = normPath(location.pathname);
  const readMap = () => { const m = store.get(K_READ); return m && typeof m === 'object' ? m : {}; };

  async function copyText(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; }
    } catch (e) { /* fall through to the legacy path */ }
    const prev = doc.activeElement;
    try {
      const ta = h('textarea', { readonly: true, 'aria-hidden': 'true', tabindex: '-1' });
      ta.value = text;
      ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none';
      body.append(ta); ta.select();
      const ok = doc.execCommand('copy');
      ta.remove();
      if (prev && prev.focus) prev.focus({ preventScroll: true });
      return ok;
    } catch (e) { return false; }
  }

  /* ---------- 8. Toast: one polite live region shared by everything below ---------- */
  // placed right after the masthead so a toast's buttons are near the start of the tab order
  const toastRoot = h('div', { class: 'rd-toasts', role: 'status', 'aria-live': 'polite' });
  const mastTop = doc.querySelector('.masthead');
  if (mastTop && mastTop.parentNode === body) mastTop.after(toastRoot); else body.prepend(toastRoot);
  let toastCur = null;
  function toast(msg, opts = {}) {
    if (toastCur) toastCur.close(true);
    const el = h('div', { class: 'rd-toast' + (opts.actions ? ' has-actions' : '') });
    el.append(h('p', { class: 'rd-toast-msg' }, msg));
    if (opts.actions) {
      const row = h('div', { class: 'rd-toast-act' });
      opts.actions.forEach(a => {
        const b = h('button', { type: 'button', class: a.cls || 'rd-toast-btn', 'aria-label': a.aria || null }, a.icon || a.label);
        b.addEventListener('click', () => { handle.close(); a.run && a.run(); });
        row.append(b);
      });
      el.append(row);
    }
    let closed = false, timer = 0;
    const handle = {
      el,
      close(instant) {
        if (closed) return; closed = true; clearTimeout(timer);
        if (toastCur === handle) toastCur = null;
        const hadFocus = el.contains(doc.activeElement);
        if (instant || reduce()) el.remove();
        else { el.classList.remove('is-in'); setTimeout(() => el.remove(), 260); }
        // focus inside a toast that goes away moves to a sensible place, never down to <body>
        const back = hadFocus && (typeof opts.returnFocus === 'function' ? opts.returnFocus() : opts.returnFocus);
        if (back && back.isConnected) back.focus({ preventScroll: true });
        opts.onClose && opts.onClose();
      }
    };
    toastRoot.append(el);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-in')));
    // the timer pauses while the pointer rests on the toast or focus is inside it (WCAG 2.2.1)
    let left = opts.timeout || 2600, startedAt = 0, hover = false;
    const run = () => { clearTimeout(timer); startedAt = Date.now(); timer = setTimeout(() => handle.close(), left); };
    const pause = () => { if (!startedAt) return; clearTimeout(timer); left = Math.max(1500, left - (Date.now() - startedAt)); startedAt = 0; };
    const resumeT = () => { if (!closed && !startedAt && !hover && !el.contains(doc.activeElement)) run(); };
    el.addEventListener('pointerenter', () => { hover = true; pause(); });
    el.addEventListener('pointerleave', () => { hover = false; resumeT(); });
    el.addEventListener('focusin', pause);
    el.addEventListener('focusout', () => setTimeout(resumeT, 0));
    el.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); handle.close(); } });
    handle.held = () => hover || el.contains(doc.activeElement);
    run();
    toastCur = handle;
    return handle;
  }

  /* ---------- 9. Low-light mode ---------- */
  const themeMeta = doc.querySelector('meta[name="theme-color"]');
  const THEME_COLOR = { light: themeMeta ? themeMeta.getAttribute('content') : '#f5f1ea', dark: '#1b1814' };
  const themeButtons = [];
  const isDark = () => html.getAttribute('data-theme') === 'dark';
  function paintTheme(dark) {
    if (dark) html.setAttribute('data-theme', 'dark'); else html.removeAttribute('data-theme');
    if (themeMeta) themeMeta.setAttribute('content', dark ? THEME_COLOR.dark : THEME_COLOR.light);
    themeButtons.forEach(b => b.setAttribute('aria-pressed', String(dark)));
  }
  // One flat crossfade of the whole page (html.rd-theming switches off the page-navigation
  // animations and named groups in site.css). A toggle during a running fade skips it first.
  let vtCur = null;
  function setTheme(dark) {
    store.set(K_THEME, dark ? 'dark' : 'light');
    const run = () => paintTheme(dark);
    if (vtCur) { try { vtCur.skipTransition(); } catch (e) { /* already done */ } }
    if (reduce() || !doc.startViewTransition) { run(); return; }
    html.classList.add('rd-theming');
    let vt;
    try { vt = doc.startViewTransition(run); } catch (e) { html.classList.remove('rd-theming'); run(); return; }
    vtCur = vt;
    vt.ready.catch(() => {});
    vt.updateCallbackDone.catch(() => {});
    vt.finished.catch(() => {}).finally(() => {
      if (vtCur === vt) { vtCur = null; html.classList.remove('rd-theming'); }
    });
  }
  // during the fade the page is a snapshot and clicks land on <html>: a click where a switch is
  // drawn still toggles (a quick double click goes back, as it should)
  doc.addEventListener('click', e => {
    if (!vtCur || e.target !== html) return;
    const hit = themeButtons.some(b => {
      const r = b.getBoundingClientRect();
      return r.width && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    });
    if (hit) setTheme(!isDark());
  });
  const syncTheme = () => paintTheme(store.get(K_THEME) === 'dark');
  syncTheme();
  if (doc.prerendering) whenShown(syncTheme);
  function themeButton(cls) {
    const b = h('button', { type: 'button', class: 'rd-theme ' + (cls || ''), 'aria-pressed': String(isDark()) },
      h('span', { class: 'rd-theme-dot', 'aria-hidden': 'true' }), h('span', { class: 'rd-theme-l' }, 'Mode malam'));
    b.addEventListener('click', () => setTheme(!isDark()));
    themeButtons.push(b);
    return b;
  }
  addEventListener('storage', e => {
    if (e.key === K_THEME) syncTheme();
    if (e.key === K_READ) paintReadState();
  });
  // back/forward cache: the reader may have toggled the theme or read on elsewhere meanwhile
  addEventListener('pageshow', e => { if (e.persisted) { syncTheme(); paintReadState(); } });
  // every page: a quiet switch at the end of the footer (the archive has no rail or sheet)
  const footBottom = doc.querySelector('footer .footer-bottom');
  if (footBottom) footBottom.append(themeButton('rd-theme-foot'));

  /* ---------- 4. Read state on links to issues ---------- */
  // The element gets --read and data-read-state. A small mono label goes into its text column:
  // "Dibaca 62%" over a hairline bar, or "Selesai dibaca" with a tick. Placement follows the
  // markup: inline in the one-line "Baru" flag, above the call to action of a shelf item, at the
  // end of an Edisi Lain card, and just above a bare call-to-action link (the archive's feature).
  const SLOT = ':scope [data-progress-slot], :scope > .body, :scope > .shelf-text, :scope > .flag-text';
  const CTA = ':scope > .shelf-cta, :scope > .issue-cta';
  const badges = new Map();
  const tickIcon = () => svg('<path d="M4.5 12.5l4.5 4.5 10.5-11"/>', 'rd-readstate-i');
  function placeBadge(el, badge) {
    const slot = el.querySelector(SLOT);
    if (slot && slot.matches('.flag-text')) { badge.classList.add('is-inline'); slot.append(badge); return; }
    if (slot) {
      const cta = slot.querySelector(CTA);
      if (cta) { badge.classList.add('is-lead'); cta.before(badge); } else slot.append(badge);
      return;
    }
    if (getComputedStyle(el).display.startsWith('inline')) { badge.classList.add('is-lead', 'is-solo'); el.before(badge); return; }
    el.append(badge);
  }
  function paintReadState() {
    const map = readMap();
    $('[data-progress-for]').forEach(el => {
      const rec = map[normPath(el.getAttribute('data-progress-for'))];
      let state = 'none', v = 0;
      if (rec && rec.done) { state = 'done'; v = 1; }
      else if (rec && rec.pct > 0) { state = 'reading'; v = clamp(+rec.pct || 0); }
      el.style.setProperty('--read', v.toFixed(3));
      el.setAttribute('data-read-state', state);
      let badge = badges.get(el);
      if (state === 'none') { if (badge) { badge.remove(); badges.delete(el); } return; }
      if (!badge) {
        badge = h('span', { class: 'rd-readstate' }, tickIcon(), h('span', { class: 'rd-readstate-l' }),
          h('span', { class: 'rd-readstate-bar', 'aria-hidden': 'true' }));
        placeBadge(el, badge);
        badges.set(el, badge);
      }
      badge.style.setProperty('--read', v.toFixed(3));
      badge.classList.toggle('is-done', state === 'done');
      badge.querySelector('.rd-readstate-l').textContent = state === 'done' ? 'Selesai dibaca' : 'Dibaca ' + Math.max(1, Math.round(v * 100)) + '%';
    });
  }
  paintReadState();
  if (doc.prerendering) whenShown(paintReadState);

  /* ---------- issue pages only from here on ---------- */
  const isIssue = body.classList.contains('issue-page') && !!doc.getElementById('intro');
  const ISSUE = (body.getAttribute('data-issue') || '').trim();
  const AUTHOR = ((doc.querySelector('meta[name="author"]') || {}).content || 'Heribertus Hariyanto Atmaja').trim();
  const PUB = 'The Handover' + (ISSUE ? ' Vol. ' + ISSUE : '');
  const pageUrl = id => location.origin + location.pathname + (id ? '#' + id : '');
  const usedIds = new Set($('[id]').map(e => e.id));
  const uniqueId = base => { let s = base, n = 2; while (usedIds.has(s)) s = base + '-' + n++; usedIds.add(s); return s; };

  /* ---------- 5. Quotes you can take with you ---------- */
  const canShare = () => touchMq.matches && typeof navigator.share === 'function';
  function quoteText(pq) {
    const c = pq.cloneNode(true);
    $('.pq-share', c).forEach(n => n.remove());
    return c.textContent.replace(/\s+/g, ' ').trim().replace(/^[“"]+|[”"]+$/g, '');
  }
  const ICON_COPY = '<rect x="8.5" y="8.5" width="11" height="11"/><path d="M15.5 8.5v-4h-11v11h4"/>';
  const ICON_SHARE = '<path d="M12 15V3.5M7.5 8l4.5-4.5L16.5 8"/><path d="M8.5 11.5h-3v9h13v-9h-3"/>';
  function labelShare(b) {
    const share = canShare(), label = share ? 'Bagikan kutipan' : 'Salin kutipan';
    if (b.getAttribute('data-label') === label) return;
    b.setAttribute('aria-label', label);
    b.setAttribute('data-label', label);   // the visible label is CSS-generated, so word-wrapping scripts never touch it
    b.replaceChildren(svg(share ? ICON_SHARE : ICON_COPY, 'pq-share-i'));
  }
  const shareBtns = [];
  $('.pullquote').forEach((pq, i) => {
    if (!pq.id) pq.id = uniqueId('pq-' + (i + 1));
    const b = h('button', { type: 'button', class: 'pq-share' });
    labelShare(b); shareBtns.push(b);
    b.addEventListener('click', async () => {
      const q = quoteText(pq), url = pageUrl(pq.id);
      const text = '“' + q + '” — ' + AUTHOR + ', ' + PUB;
      if (canShare()) {
        try { await navigator.share({ title: doc.title, text, url }); return; }
        catch (e) { if (e && e.name === 'AbortError') return; }
      }
      toast((await copyText(text + '\n' + url)) ? 'Kutipan tersalin' : 'Gagal menyalin kutipan');
    });
    pq.append(b);
  });
  onMq(touchMq, () => shareBtns.forEach(labelShare));

  /* ---------- 6. Heading anchors ---------- */
  const slug = t => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/&/g, ' dan ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
  // The link sits next to the heading, not inside it: inside, its label would become part of the
  // heading's name and every title would be read twice in a screen reader's list of headings.
  // The wrapper has no box of its own (no padding, border or BFC), so the h3's margins pass through.
  $('.chapter-body h3').forEach(h3 => {
    const title = (h3.getAttribute('aria-label') || h3.textContent).replace(/\s+/g, ' ').trim();
    if (!h3.id) h3.id = uniqueId(slug(title) || 'bagian');
    if (h3.parentElement && h3.parentElement.classList.contains('h3-wrap')) return;
    const a = h('a', { class: 'h3-anchor', href: '#' + h3.id, 'aria-label': 'Salin tautan ke bagian: ' + title },
      svg('<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1.2 1.2"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2"/>'));
    a.addEventListener('click', async e => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button > 0) return;   // new tab etc.: native
      e.preventDefault();
      try { history.replaceState(history.state, '', '#' + h3.id); } catch (err) { /* file:// or sandbox */ }
      toast((await copyText(pageUrl(h3.id))) ? 'Tautan tersalin' : 'Gagal menyalin tautan');
    });
    const w = h('div', { class: 'h3-wrap' });
    h3.before(w); w.append(h3, a);
  });

  /* deep links: to ids created above (the fragment scroll may have run before they existed), and
     to the sections the rail and sheet write into the address bar (#ch4, #stack, #letter) */
  // Settled after load and the web fonts (which reflow the text above), then once more on any
  // layout change in the next 3 s, unless the reader has started scrolling by then. Only quotes and
  // headings flash; a section is simply put back at the top. On a later hashchange the browser has
  // already (smoothly) scrolled to a section, so only the reader's own targets are handled there.
  const OWN = '.pullquote, .chapter-body h3';
  const SECTIONS = '.intro, .chapter, .toolstack, .portfolio, .manifesto, .letter';
  function hashTarget(sections) {
    let id = '';
    try { id = decodeURIComponent(location.hash.slice(1)); } catch (e) { return null; }
    const t = id && doc.getElementById(id);
    return t && (t.matches(OWN) || (sections && t.matches(SECTIONS))) ? t : null;
  }
  const align = t => t.scrollIntoView({ block: 'start', behavior: 'instant' });   // honours scroll-margin-top
  function settleHash(sections) {
    const t = hashTarget(sections); if (!t) return;
    align(t);
    if (!t.matches(OWN)) return;
    t.classList.remove('rd-flash'); void t.offsetWidth; t.classList.add('rd-flash');
    setTimeout(() => t.classList.remove('rd-flash'), 2400);
  }
  addEventListener('hashchange', () => settleHash(false));
  if (location.hash.length > 1 && hashTarget(true)) {
    const loaded = doc.readyState === 'complete' ? Promise.resolve() : new Promise(r => addEventListener('load', r, { once: true }));
    const fonts = doc.fonts && doc.fonts.ready ? doc.fonts.ready.catch(() => {}) : Promise.resolve();
    Promise.all([loaded, fonts]).then(() => new Promise(r => whenShown(r))).then(() => requestAnimationFrame(() => {
      settleHash(true);
      if (!('ResizeObserver' in window)) return;
      let moved = false, first = true;
      const stop = () => { moved = true; ro.disconnect(); };
      ['wheel', 'touchstart', 'keydown', 'pointerdown'].forEach(ev => addEventListener(ev, stop, { once: true, passive: true }));
      const ro = new ResizeObserver(() => {
        if (first) { first = false; return; }               // the initial observation is not a change
        const t = hashTarget(true);
        if (!moved && t) align(t);
      });
      ro.observe(body);
      setTimeout(() => ro.disconnect(), 3000);
    }));
  }

  /* ---------- 7. Reference popovers ---------- */
  let closePopover = () => {};
  const refLinks = $('.chapter-body a.ref, .intro a.ref').filter(a => !a.closest('.refs'));
  if (refLinks.length) {
    // no tooltip role: the card holds a link. The described-by text is the non-interactive part.
    const pop = h('div', { class: 'rd-pop', id: 'rd-pop', hidden: true });
    const popK = h('p', { class: 'rd-pop-k' }), popT = h('p', { class: 'rd-pop-t' }), popD = h('p', { class: 'rd-pop-d' });
    const popHost = h('b'), popPath = h('span');
    const popUrl = h('span', { class: 'rd-pop-host' }, popHost, popPath);
    const popGo = h('a', { class: 'rd-pop-go', target: '_blank', rel: 'noopener', tabindex: '-1' }, 'Buka sumber ', h('span', { 'aria-hidden': 'true' }, '↗'));
    pop.append(h('div', { id: 'rd-pop-desc' }, popK, popT, popD), h('p', { class: 'rd-pop-f' }, popUrl, popGo));
    body.append(pop);
    const keyOf = href => { try { const u = new URL(href, location.href); return (u.host + u.pathname).replace(/^www\./, '').replace(/\/+$/, '').toLowerCase(); } catch (e) { return href; } };
    // where the link goes, readable: the host, then the decoded path ("en.wikipedia.org/wiki/Hofstadter's law")
    function whereTo(href) {
      try {
        const u = new URL(href, location.href);
        let path = u.pathname.replace(/\/+$/, '').replace(/\.(html?|php|aspx?)$/i, '');
        try { path = decodeURIComponent(path); } catch (e) { /* keep encoded */ }
        return { host: u.hostname.replace(/^www\./, ''), path: path.replace(/[_+]/g, ' ') };
      } catch (e) { return { host: '', path: '' }; }
    }
    function infoFor(a) {
      const sec = a.closest('.chapter, .intro');
      const list = sec ? $('.refs ol > li', sec) : [];
      const k = keyOf(a.href);
      for (let i = 0; i < list.length; i++) {
        const la = list[i].querySelector('a[href]');
        if (la && keyOf(la.href) === k) {
          const rest = list[i].textContent.replace(la.textContent, '').replace(/\s+/g, ' ').replace(/^\s*[—–-]\s*/, '').trim();
          const ttl = sec.querySelector('.refs-title');
          const kick = ttl ? ttl.textContent.replace(/^[\s—–-]+/, '').trim() : 'Referensi';
          return { k: '[' + (i + 1) + '] · ' + kick, t: la.textContent.replace(/\s+/g, ' ').trim(), d: rest };
        }
      }
      return { k: 'Sumber', t: a.textContent.replace(/\s+/g, ' ').trim(), d: '' };
    }
    let popFor = null, openT = 0, closeT = 0, lastPointer = '';
    function place(a) {
      // a link that wraps: below it, the card hangs from its last line; above, from its first
      const rects = Array.from(a.getClientRects()).filter(q => q.width > 0);
      const r = rects[0] || a.getBoundingClientRect();
      const last = rects.length ? rects[rects.length - 1] : r;
      pop.style.left = '0px'; pop.style.top = '0px';
      const pw = pop.offsetWidth, ph = pop.offsetHeight, gap = 10, pad = 12;
      const gut = Math.max(pad, Math.round(innerWidth * 0.05));        // the page gutter (5vw)
      const mast = doc.querySelector('.masthead');
      const mb = mast ? Math.max(0, mast.getBoundingClientRect().bottom) : 0;
      const pill = doc.querySelector('.rd-pill.is-on');
      const floor = innerHeight - (pill ? innerHeight - pill.getBoundingClientRect().top + 8 : 0) - pad;
      const below = floor - (last.bottom + gap), above = (r.top - gap) - (mb + pad);
      let top, flip = false;
      if (ph <= below) top = last.bottom + gap;
      else if (ph <= above) { top = r.top - gap - ph; flip = true; }
      else if (above > below) { top = Math.max(mb + pad, r.top - gap - ph); flip = true; }
      else top = last.bottom + gap;
      const left = clamp((flip ? r : last).left - 14, gut, Math.max(gut, innerWidth - pw - gut));
      pop.style.left = (left + scrollX) + 'px';
      pop.style.top = (top + scrollY) + 'px';
      pop.classList.toggle('is-above', flip);
    }
    function openPop(a) {
      clearTimeout(openT); clearTimeout(closeT);
      if (popFor === a && !pop.hidden) return;
      const info = infoFor(a);
      popK.textContent = info.k; popT.textContent = info.t; popD.textContent = info.d; popD.hidden = !info.d;
      const w = whereTo(a.href);
      popHost.textContent = w.host; popPath.textContent = w.path; popGo.href = a.href;
      if (popFor && popFor !== a) popFor.removeAttribute('aria-describedby');
      popFor = a; a.setAttribute('aria-describedby', 'rd-pop-desc');
      pop.hidden = false; pop.classList.remove('is-in');
      place(a);
      requestAnimationFrame(() => pop.classList.add('is-in'));
    }
    function closePop() {
      clearTimeout(openT); clearTimeout(closeT);
      if (pop.hidden) return;
      pop.classList.remove('is-in'); pop.hidden = true;
      if (popFor) popFor.removeAttribute('aria-describedby');
      popFor = null;
    }
    const later = fn => { clearTimeout(closeT); closeT = setTimeout(fn, 220); };
    refLinks.forEach(a => {
      a.addEventListener('pointerenter', e => {
        if (e.pointerType !== 'mouse') return;
        clearTimeout(closeT); clearTimeout(openT);
        openT = setTimeout(() => openPop(a), 300);
      });
      a.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') { clearTimeout(openT); later(closePop); } });
      a.addEventListener('focus', () => { if (a.matches(':focus-visible')) openPop(a); });
      a.addEventListener('blur', () => { if (popFor === a && lastPointer !== 'mouse') later(closePop); });
      a.addEventListener('click', e => {
        // touch: the first tap shows the card (its "Buka sumber" navigates); a second tap follows the link
        if ((lastPointer === 'touch' || lastPointer === 'pen') && popFor !== a) { e.preventDefault(); openPop(a); }
      });
    });
    pop.addEventListener('pointerenter', () => clearTimeout(closeT));
    pop.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') later(closePop); });
    addEventListener('pointerdown', e => {
      lastPointer = e.pointerType;
      if (!pop.hidden && !pop.contains(e.target) && e.target !== popFor && !(popFor && popFor.contains(e.target))) closePop();
    }, true);
    addEventListener('keydown', e => {
      lastPointer = 'key';
      if (e.key === 'Escape' && !pop.hidden) { const a = popFor; closePop(); if (a && pop.contains(doc.activeElement)) a.focus(); }
    }, true);
    // a phone's toolbar sliding in or out resizes only the height: keep the card, just re-place it
    let popW = innerWidth;
    addEventListener('resize', () => {
      if (innerWidth !== popW) { popW = innerWidth; closePop(); } else if (popFor && !pop.hidden) place(popFor);
    }, { passive: true });
    closePopover = closePop;
  }

  /* ---------- 2. Phone masthead: tucks away while reading down, returns on any upward scroll ---------- */
  // Every page: past the banner on an issue, past 120px elsewhere. Never while the chapter sheet is
  // open (html.rd-lock) or while focus is inside the masthead.
  const mastEl = doc.querySelector('.masthead');
  if (mastEl) {
    const heroEl = doc.querySelector('.hero');
    let tucked = false, lastY = scrollY, tuckAt = 120, traf = 0;
    const setTuck = on => { if (on !== tucked) { tucked = on; mastEl.classList.toggle('is-tucked', on); } };
    const measureTuck = () => {
      tuckAt = heroEl ? Math.max(120, heroEl.getBoundingClientRect().bottom + scrollY - mastEl.offsetHeight) : 120;
    };
    const tuck = () => {
      traf = 0;
      const y = scrollY, d = y - lastY; lastY = y;
      if (!tuckMq.matches) { setTuck(false); return; }
      if (html.classList.contains('rd-lock')) return;
      if (y <= tuckAt || d < -1) setTuck(false);
      else if (d > 3 && !mastEl.contains(doc.activeElement)) setTuck(true);
    };
    addEventListener('scroll', () => { if (!traf) traf = requestAnimationFrame(tuck); }, { passive: true });
    addEventListener('resize', measureTuck, { passive: true });
    addEventListener('load', measureTuck, { once: true });
    onMq(tuckMq, () => { measureTuck(); tuck(); });
    mastEl.addEventListener('focusin', () => setTuck(false));
    measureTuck();
  }

  if (!isIssue) return;

  /* ---------- the issue's map: prolog, chapters, appendices, letter ---------- */
  const items = [];
  const intro = doc.getElementById('intro');
  items.push({ k: 'intro', el: intro, num: '', name: 'Prolog', short: 'Prolog', kind: 'pro' });
  const chapterEls = $('.chapter');
  chapterEls.forEach((el, i) => {
    if (!el.id) el.id = uniqueId('ch' + (i + 1));
    const n = el.querySelector('.chapter-number'), t = el.querySelector('.chapter-tag span');
    const num = n ? n.textContent.trim() : String(i + 1).padStart(2, '0');
    const ord = parseInt(num, 10) || i + 1;
    items.push({ k: el.id, el, num, ord, name: t ? t.textContent.replace(/\s+/g, ' ').trim() : 'Bab ' + ord, short: 'Bab ' + ord, kind: 'ch' });
  });
  [['stack', 'A', 'Stack'], ['portfolio', 'B', 'Work'], ['manifesto', 'C', 'Manifesto']].forEach(([id, num, name]) => {
    const el = doc.getElementById(id);
    if (el) items.push({ k: id, el, num, name, short: name, kind: 'app' });
  });
  const letter = doc.getElementById('letter');
  if (letter) items.push({ k: 'letter', el: letter, num: '', name: 'Surat', short: 'Surat', kind: 'let' });
  items.sort((a, b) => (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
  items.forEach(it => { it.nodes = []; it.p = -1; it.top = 0; it.h = 1; });
  const CH_TOTAL = chapterEls.length;
  const firstApp = items.find(it => it.kind === 'app');
  const endEl = doc.querySelector('.issues-next') || doc.querySelector('footer');
  const mast = mastEl;
  const volLabel = (() => { const s = $('.masthead .vol span'); return s.length ? s[0].textContent.trim() : PUB; })();
  const issueName = (() => { const s = $('.masthead .vol span'); return s[1] ? s[1].textContent.trim() : 'The Handover'; })();

  const grpNodes = [];                       // the "Apendiks" group heads: their spine fills once A is reached
  function toc(cls) {
    const ol = h('ol', { class: 'rd-toc ' + cls });
    let grp = null;
    items.forEach(it => {
      const a = h('a', { href: '#' + it.el.id, class: 'rd-a' },
        h('span', { class: 'rd-n' }, it.num), h('span', { class: 'rd-l' }, it.name));
      const li = h('li', { class: 'rd-it rd-' + it.kind }, a);
      li.dataset.k = it.k;
      it.nodes.push(li);
      if (it.kind === 'app') {
        if (!grp) {
          const gid = uniqueId('rd-grp-' + cls.replace(/^rd-toc-/, ''));
          grp = h('ol', { class: 'rd-sub', 'aria-labelledby': gid });
          const gli = h('li', { class: 'rd-grp' }, h('span', { class: 'rd-grp-l', id: gid }, 'Apendiks'), grp);
          grpNodes.push(gli);
          ol.append(gli);
        }
        grp.append(li);
      } else { grp = null; ol.append(li); }
    });
    return ol;
  }
  const pillLabel = it => it.kind === 'ch' ? 'Bab ' + it.ord + '/' + CH_TOTAL : it.kind === 'app' ? 'Apendiks ' + it.num : it.short;

  /* ---------- 1a. Rail (desktop) ---------- */
  const rail = h('nav', { class: 'rd-rail', 'aria-label': 'Daftar isi ' + volLabel });
  rail.append(h('p', { class: 'rd-rail-k' }, h('span', null, 'Daftar isi'), h('span', { class: 'rd-rail-v' }, volLabel.replace(/\s*·.*$/, ''))), toc('rd-toc-rail'), themeButton('rd-theme-rail'));

  /* ---------- 1b. Pill + sheet (smaller screens) ---------- */
  const pill = h('button', { type: 'button', class: 'rd-pill', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', 'aria-controls': 'rd-sheet' });
  const ring = svg('<circle class="rd-ring-t" cx="12" cy="12" r="9"/><circle class="rd-ring-f" cx="12" cy="12" r="9" pathLength="1"/>', 'rd-ring');
  const pillK = h('span', { class: 'rd-pill-k' }), pillT = h('span', { class: 'rd-pill-t' });
  // the name is the visible text with a hidden lead-in ("Daftar isi, sekarang: Bab 3/6 Agents & Automation")
  pill.append(h('span', { class: 'rd-vh' }, 'Daftar isi, sekarang: '), ring, pillK, pillT);
  // navigation sits right after the masthead in the tab order, not after the footer
  if (mast && mast.parentNode === body) mast.after(rail, pill); else body.append(rail, pill);

  const sheet = h('div', { class: 'rd-sheet', id: 'rd-sheet', hidden: true });
  const backdrop = h('div', { class: 'rd-sheet-bg' });
  const panel = h('div', { class: 'rd-sheet-panel', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'rd-sheet-title', tabindex: '-1' });
  const xBtn = h('button', { type: 'button', class: 'rd-x', 'aria-label': 'Tutup daftar isi' }, svg('<path d="M6 6l12 12M18 6L6 18"/>'));
  const links = h('div', { class: 'rd-sheet-links' });
  const other = doc.querySelector('.issues-next a[data-progress-for]');
  if (other) {
    const n = other.querySelector('.num'), t = other.querySelector('.t');
    const iss = Array.from(other.classList).find(c => /^issue-\d+$/.test(c));    // wears that issue's accent
    links.append(h('a', { href: other.getAttribute('href'), class: 'rd-sheet-link' + (iss ? ' ' + iss : '') },
      h('span', { class: 'rd-n' }, n ? n.textContent.trim() : ''),
      h('span', null, h('small', null, 'Edisi lain'), t ? t.textContent.trim() : 'Edisi lain')));
  }
  links.append(h('a', { href: '/arsip/', class: 'rd-sheet-link' }, h('span', { class: 'rd-n' }, '—'), h('span', null, h('small', null, 'Semua edisi'), 'Arsip')));
  panel.append(
    h('div', { class: 'rd-sheet-head' },
      h('p', { class: 'rd-sheet-k', id: 'rd-sheet-title' }, 'Daftar isi'),
      themeButton('rd-theme-sheet'), xBtn,
      h('p', { class: 'rd-sheet-t' }, issueName + ' ', h('span', { class: 'rd-sheet-v' }, volLabel.replace(/\s*·.*$/, '')))),
    toc('rd-toc-sheet'),
    links
  );
  sheet.append(backdrop, panel);
  body.append(sheet);

  let sheetOpen = false, inerted = [];
  function focusables() {
    return $('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])', panel).filter(el => el.offsetParent !== null || el === doc.activeElement);
  }
  function openSheet() {
    if (sheetOpen) return;
    sheetOpen = true;
    closePopover();
    sheet.hidden = false;
    // a classic (space-taking) scrollbar vanishes with the scroll lock: pad by its width so the
    // page, the fixed masthead and the pill stay put. Overlay scrollbars measure 0: nothing to do.
    const sb = innerWidth - html.clientWidth;
    if (sb > 0) {
      html.style.paddingRight = sb + 'px';
      if (mast) mast.style.right = sb + 'px';
      pill.style.marginLeft = -sb / 2 + 'px';
    }
    html.classList.add('rd-lock');
    pill.setAttribute('aria-expanded', 'true');
    inerted = Array.from(body.children).filter(el => el !== sheet && el !== toastRoot && !el.inert && el.tagName !== 'SCRIPT');
    inerted.forEach(el => { el.inert = true; });
    requestAnimationFrame(() => requestAnimationFrame(() => sheet.classList.add('is-open')));
    const cur = panel.querySelector('.rd-it.is-cur > a') || xBtn;
    cur.focus({ preventScroll: true });
    if (cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest' });
  }
  function closeSheet(returnFocus) {
    if (!sheetOpen) return;
    sheetOpen = false;
    inerted.forEach(el => { el.inert = false; }); inerted = [];
    html.classList.remove('rd-lock');
    html.style.paddingRight = ''; if (mast) mast.style.right = ''; pill.style.marginLeft = '';
    pill.setAttribute('aria-expanded', 'false');
    sheet.classList.remove('is-open');
    const done = () => { if (!sheetOpen) sheet.hidden = true; };
    if (reduce()) done(); else setTimeout(done, 380);
    if (returnFocus !== false) pill.focus({ preventScroll: true });
  }
  pill.addEventListener('click', () => (sheetOpen ? closeSheet() : openSheet()));
  xBtn.addEventListener('click', () => closeSheet());
  backdrop.addEventListener('click', () => closeSheet());
  sheet.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); closeSheet(); return; }
    if (e.key !== 'Tab') return;
    const f = focusables(); if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && (doc.activeElement === first || doc.activeElement === panel)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && doc.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  // a chapter picked in the sheet: close first (scroll is locked while open), then go
  panel.addEventListener('click', e => {
    const a = e.target.closest('a.rd-a');
    if (!a) return;
    e.preventDefault();
    closeSheet(false);
    jumpTo(a.getAttribute('href').slice(1));
  });
  function jumpTo(id) {
    const t = doc.getElementById(id); if (!t) return;
    try { history.pushState(null, '', '#' + id); } catch (e) { /* ignore */ }
    t.scrollIntoView({ block: 'start', behavior: behavior() });
    if (!t.hasAttribute('tabindex')) t.setAttribute('tabindex', '-1');
    t.focus({ preventScroll: true });
  }
  rail.addEventListener('click', e => {
    const a = e.target.closest('a.rd-a');
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button > 0) return;
    e.preventDefault();
    jumpTo(a.getAttribute('href').slice(1));
  });
  // focus leaving the rail or pill: re-check whether they should still be showing
  [rail, pill].forEach(el => el.addEventListener('focusout', () => setTimeout(() => update(false), 0)));

  /* ---------- geometry ---------- */
  // The rail lives in the right margin. "Content right" is the furthest the reading column reaches
  // (text, pullquotes, refs, the stamp); media, long headings and wide appendix blocks that cross
  // into the rail's column are obstacles: the rail steps aside while one shares its vertical band.
  const MEDIA = 'img,svg,canvas,iframe,video,picture,figure,table,pre,.sig';
  const READING = new Set(items.filter(it => it.kind !== 'app').map(it => it.el));
  function leaves(root, out) {
    for (const k of root.children) {
      if (k.matches('.h3-anchor,.pq-share') || k.closest('.rd-rail,.rd-pill,.rd-sheet,.rd-toasts,.rd-pop')) continue;
      const cs = getComputedStyle(k);
      if (cs.display === 'none' || cs.position === 'fixed' || cs.visibility === 'hidden') continue;
      if (k.matches(MEDIA)) { out.push({ r: k.getBoundingClientRect(), loose: true }); continue; }
      const boxed = cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || cs.backgroundImage !== 'none' ||
        ['Top', 'Right', 'Bottom', 'Left'].some(s => parseFloat(cs['border' + s + 'Width']) > 0 && cs['border' + s + 'Style'] !== 'none');
      const blockKids = Array.from(k.children).some(c => {
        if (c.matches('.h3-anchor,.pq-share')) return false;
        const d = getComputedStyle(c).display;
        return d !== 'none' && d !== 'contents' && !d.startsWith('inline');
      });
      if (boxed) out.push({ el: k, r: k.getBoundingClientRect() });
      else if (blockKids) leaves(k, out);
      else {
        const rg = doc.createRange(); rg.selectNodeContents(k);
        let L = Infinity, R = -Infinity, T = Infinity, B = -Infinity;
        for (const q of rg.getClientRects()) {
          if (q.width < 1 || q.height < 1) continue;
          L = Math.min(L, q.left); R = Math.max(R, q.right); T = Math.min(T, q.top); B = Math.max(B, q.bottom);
        }
        // headings have no measure of their own: a long one is an obstacle, not the column's edge
        if (R > -Infinity) out.push({ el: k, r: { left: L, right: R, top: T, bottom: B }, loose: !!k.closest('h1,h2,h3,h4,h5,h6') });
      }
    }
    return out;
  }
  const geo = { mode: 'none', start: 0, end: 1, railLeft: 0, railW: 0, railTop: 0, railH: 0, obstacles: [], endTop: Infinity };
  const desktopMq = mq('(min-width: 1180px)');
  function measure() {
    const y = scrollY, W = innerWidth;
    items.forEach(it => { const r = it.el.getBoundingClientRect(); it.top = r.top + y; it.h = Math.max(1, r.height); });
    geo.start = items[0].top;
    const last = items[items.length - 1];
    geo.end = last.top + last.h;
    geo.endTop = endEl ? endEl.getBoundingClientRect().top + y : Infinity;
    geo.mastH = mast ? mast.offsetHeight : 0;
    let mode = 'pill';
    if (desktopMq.matches) {
      const all = [];
      items.forEach(it => leaves(it.el, []).forEach(l => { l.reading = READING.has(it.el); l.app = it.kind === 'app'; all.push(l); }));
      let cr = 0;
      all.forEach(l => { if (l.reading && !l.loose) cr = Math.max(cr, l.r.right); });
      const free = W - cr;
      // the rail needs ~180px of its own plus air on both sides; less than that, the pill takes over
      if (free >= 236) {
        mode = 'rail';
        geo.railW = Math.round(Math.min(232, free - 56));
        const gap = Math.max(32, Math.min(96, (free - geo.railW) / 2));
        geo.railLeft = Math.round(cr + gap);
        const obs = all.filter(l => !l.app && l.r.right > geo.railLeft - 12 && l.r.bottom > l.r.top)
          .map(l => ({ top: l.r.top + y, bottom: l.r.bottom + y }));
        // the appendices are wide layouts of their own: if any part of one reaches the rail's
        // column, the whole run from the first to the last appendix is one obstacle
        const apps = items.filter(it => it.kind === 'app');
        if (apps.length && all.some(l => l.app && l.r.right > geo.railLeft - 12)) {
          obs.push({ top: apps[0].top, bottom: apps[apps.length - 1].top + apps[apps.length - 1].h });
        }
        // full-width bands: the banner, the "Baru" flag, the dark stack band, Edisi Lain, the footer
        $('.hero, .issue-flag, .toolstack, .issues-next, footer').forEach(el => {
          const r = el.getBoundingClientRect();
          if (r.height) obs.push({ top: r.top + y, bottom: r.bottom + y });
        });
        geo.obstacles = obs;   // merged below, once the rail's height is known
        rail.style.left = geo.railLeft + 'px';
        rail.style.width = geo.railW + 'px';
        rail.classList.toggle('is-narrow', geo.railW < 190);
        const avail = innerHeight - geo.mastH;
        geo.railH = rail.offsetHeight;
        if (geo.railH > avail - 40) mode = 'pill';                        // a very short window: the pill instead
        // top-aligned with the sticky chapter meta on the left (numeral + tag), like a margin column;
        // centred in the window when that line would push it off the bottom
        const meta = doc.querySelector('.chapter-meta');
        const metaTop = meta ? parseFloat(getComputedStyle(meta).top) || 0 : 0;
        geo.railTop = Math.round(metaTop > geo.mastH && metaTop + geo.railH <= innerHeight - 32
          ? metaTop : geo.mastH + Math.max(20, (avail - geo.railH) / 2));
        rail.style.top = geo.railTop + 'px';
        // merge obstacles separated by a gap the rail could only blink through: it must stay
        // clear for at least half a window of scrolling before it is worth showing
        const minGap = geo.railH + 48 + Math.max(240, innerHeight * 0.5);
        const merged = [];
        geo.obstacles.sort((a, b) => a.top - b.top).forEach(o => {
          const m = merged[merged.length - 1];
          if (m && o.top - m.bottom < minGap) m.bottom = Math.max(m.bottom, o.bottom);
          else merged.push({ top: o.top, bottom: o.bottom });
        });
        geo.obstacles = merged;
      }
    }
    if (mode !== geo.mode) {
      geo.mode = mode;
      html.classList.toggle('rd-mode-rail', mode === 'rail');
      html.classList.toggle('rd-mode-pill', mode === 'pill');
      if (mode === 'rail' && sheetOpen) closeSheet(false);
    }
    update(true);
  }

  /* ---------- per-frame state: current item, per-item progress, visibility, save ---------- */
  let cur = null, railOn = null, pillOn = null, railOffAt = 0, railT = 0;
  function setVis(el, on, prev) {
    if (on === prev) return prev;
    el.classList.toggle('is-on', on);
    el.inert = !on;                                   // hidden UI leaves the tab order and the a11y tree
    return on;
  }
  // UI that holds keyboard focus never hides (inert would drop focus to <body>, back at the top)
  const holds = el => el.contains(doc.activeElement);
  function update(force) {
    const y = scrollY, vh = innerHeight, line = y + vh * 0.4;
    let c = items[0];
    items.forEach(it => {
      if (line >= it.top) c = it;
      const p = clamp((line - it.top) / it.h);
      if (force || Math.abs(p - it.p) > 0.004) {
        it.p = p;
        it.nodes.forEach(n => { n.style.setProperty('--p', p.toFixed(3)); n.classList.toggle('is-read', p >= 0.995); });
      }
    });
    if (c !== cur) {
      if (cur) cur.nodes.forEach(n => { n.classList.remove('is-cur'); const a = n.querySelector('a'); a && a.removeAttribute('aria-current'); });
      cur = c;
      cur.nodes.forEach(n => { n.classList.add('is-cur'); const a = n.querySelector('a'); a && a.setAttribute('aria-current', 'location'); });
      pillK.textContent = pillLabel(cur);
      pillT.textContent = cur.kind === 'pro' || cur.kind === 'let' ? (cur.kind === 'pro' ? 'Pembuka' : 'Penutup') : cur.name;
    }
    pill.style.setProperty('--p', clamp((line - cur.top) / cur.h).toFixed(3));
    if (firstApp) grpNodes.forEach(g => g.classList.toggle('is-reached', firstApp.p > 0));
    const inEssay = line >= geo.start && line <= geo.end;
    // rail: in the essay, wide enough, and nothing wide crossing its band
    let rOn = geo.mode === 'rail' && inEssay;
    if (rOn) {
      const t = y + geo.railTop - 24, b = y + geo.railTop + geo.railH + 24;
      for (const o of geo.obstacles) if (o.top < b && o.bottom > t) { rOn = false; break; }
    }
    rOn = rOn || holds(rail);
    // once it has stepped aside, the rail waits a moment before coming back (no flicker)
    if (!rOn && railOn) railOffAt = performance.now();
    else if (rOn && !railOn && performance.now() - railOffAt < 250) {
      clearTimeout(railT); railT = setTimeout(() => update(false), 260); rOn = false;
    }
    railOn = setVis(rail, rOn, railOn);
    const pOn = geo.mode === 'pill' && line >= geo.start && geo.endTop - y > vh * 0.8;
    pillOn = setVis(pill, pOn || sheetOpen || holds(pill), pillOn);
    html.classList.toggle('rd-pill-on', !!pillOn);
    queueSave();
    if (resume && !resume.programmatic && Math.abs(y - resume.y0) > 80 && !resume.held()) resume.close();
  }

  /* ---------- 3. Continue reading ---------- */
  let saveT = 0, done = !!(readMap()[PATH] || {}).done;
  function save() {
    saveT = 0;
    if (!cur || !geo.end) return;
    const line = scrollY + innerHeight * 0.4;
    const pct = clamp((line - geo.start) / Math.max(1, geo.end - geo.start));
    const map = readMap();
    const prev = map[PATH] || {};
    if (pct < 0.03 && !done) return;                 // a glance at the top never erases a saved place
    map[PATH] = {
      pct: +pct.toFixed(3), id: cur.el.id, label: cur.short,
      f: +clamp((line - cur.top) / cur.h).toFixed(3), ts: Date.now(), done: !!(prev.done || done)
    };
    store.set(K_READ, map);
  }
  function queueSave() { if (!saveT) saveT = setTimeout(save, 900); }
  addEventListener('pagehide', () => { if (saveT) { clearTimeout(saveT); save(); } });
  doc.addEventListener('visibilitychange', () => { if (doc.hidden && saveT) { clearTimeout(saveT); save(); } });
  const signoff = doc.querySelector('.letter .signoff');
  if (signoff) {
    const sio = new IntersectionObserver(es => {
      if (es.some(e => e.isIntersecting)) { done = true; sio.disconnect(); save(); }
    }, { threshold: 0.6 });
    sio.observe(signoff);
  }

  let resume = null, liftT = 0;
  function offerResume() {
    const saved = readMap()[PATH];                  // read now: a prerendered page ran this script earlier
    if (saved && saved.done) done = true;
    if (!saved || location.hash.length > 1 || scrollY > 200) return;
    const pct = +saved.pct || 0;
    if (!(pct > 0.03 && pct < 0.95)) return;
    const it = items.find(i => i.el.id === saved.id);
    if (!it) return;
    const label = it.short;
    const go = () => {
      const target = it.top + clamp(+saved.f || 0) * it.h - innerHeight * 0.4;
      if (resume) resume.programmatic = true;
      scrollTo({ top: Math.max(0, target), behavior: behavior() });
      if (!it.el.hasAttribute('tabindex')) it.el.setAttribute('tabindex', '-1');
      it.el.focus({ preventScroll: true });
    };
    const t = toast('Lanjutkan dari ' + label + ' · ' + Math.round(pct * 100) + '%', {
      timeout: 10000,
      actions: [
        { label: 'Lanjutkan', cls: 'rd-toast-btn is-primary', run: go },
        { icon: svg('<path d="M6 6l12 12M18 6L6 18"/>'), cls: 'rd-toast-x', aria: 'Tutup' }
      ],
      // dismissed from the keyboard: on to what comes after the toast (the banner's cue to the
      // prolog, else the prolog itself), not back to the top of the page
      returnFocus: () => {
        const cue = doc.querySelector('.hero-cue');
        if (cue && cue.getClientRects().length && getComputedStyle(cue).visibility !== 'hidden') return cue;
        if (!intro.hasAttribute('tabindex')) intro.setAttribute('tabindex', '-1');
        return intro;
      },
      onClose: () => { resume = null; clearTimeout(liftT); liftT = setTimeout(() => html.classList.remove('rd-over-hero'), 300); }
    });
    t.el.classList.add('rd-resume');
    resume = { y0: scrollY, programmatic: false, close: () => t.close(), held: () => t.held() };
    // on a full-height banner the scene parks its "Seret … Arahkan" hint near the bottom edge:
    // the toast rides above it while it is showing (CSS scopes this to fine pointers)
    const hero = doc.querySelector('.hero');
    if (hero && hero.getBoundingClientRect().bottom >= innerHeight - 4) {
      clearTimeout(liftT); html.classList.add('rd-over-hero');
    }
  }

  /* ---------- wiring ---------- */
  let raf = 0, mraf = 0, mT = 0;
  addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; update(false); }); }, { passive: true });
  const remeasure = () => { if (!mraf) mraf = requestAnimationFrame(() => { mraf = 0; measure(); }); };
  addEventListener('resize', remeasure, { passive: true });
  if ('ResizeObserver' in window) new ResizeObserver(() => { clearTimeout(mT); mT = setTimeout(remeasure, 120); }).observe(body);
  [desktopMq, phoneMq].forEach(m => onMq(m, remeasure));
  measure();
  const afterLoad = () => { measure(); whenShown(() => setTimeout(offerResume, 350)); };
  if (doc.readyState === 'complete') afterLoad(); else addEventListener('load', afterLoad, { once: true });
  if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(remeasure);
})();
