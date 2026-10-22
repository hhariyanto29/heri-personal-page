/* The Handover — shared scripts: the editorial motion system and the ThreeDPaper mount. Every page loads this with defer. */
/* Motion system — editorial. Vanilla and progressive: nothing here is needed to read
   the page. Pre-states exist only on .fx (added below) or under html.js, so with JS
   off everything is visible. The ThreeDPaper mount further down this file is independent. */
(() => {
  'use strict';
  if (!('IntersectionObserver' in window)) return;             // old browser: static page, everything visible
  const $ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const html = document.documentElement;
  const rmq = matchMedia('(prefers-reduced-motion: reduce)');
  const reduce = rmq.matches;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  html.classList.add('js');                                     // gates masthead / nav / hover CSS

  /* ---------- 1. Prepare the type ---------- */
  // headings whose words rise inside masks; the manifesto h2 keeps its <br> and marker sweep instead
  const SPLIT = '.chapter-body h2, .toolstack h2, .portfolio h2, .archive h1';
  const isWord = s => /[\p{L}\p{N}]/u.test(s);

  // Wrap each word in an overflow mask (<span class="w"><span>word</span></span>).
  // Inline markup (<em>, <strong>) is preserved; the original sentence is kept on aria-label.
  function splitWords(el) {
    const label = el.textContent.replace(/\s+/g, ' ').trim();
    const nodes = []; const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node, i = 0;
    while ((node = walker.nextNode())) nodes.push(node);
    nodes.forEach(t => {
      const frag = document.createDocumentFragment();
      t.data.split(/(\s+)/).filter(Boolean).forEach((part, k) => {
        if (/^\s+$/.test(part)) { frag.append(part); return; }
        if (!isWord(part)) {
          // punctuation right after an <em>/<strong> is glued into that element's last mask,
          // so a lone "." or closing quote can never wrap onto its own line
          const prev = (k === 0 && t.previousSibling && t.previousSibling.nodeType === 1)
            ? t.previousSibling.querySelector('.w:last-of-type > span') : null;
          if (prev) prev.append(part); else frag.append(part);
          return;
        }
        const w = document.createElement('span'); w.className = 'w'; w.style.setProperty('--i', i++);
        const inner = document.createElement('span'); inner.textContent = part;
        w.append(inner); frag.append(w);
      });
      t.replaceWith(frag);
    });
    el.setAttribute('aria-label', label);
    el.classList.add('is-split');
  }

  // Wrap the intro's first letter so it can move (::first-letter cannot be transformed).
  function wrapDropcap() {
    const p = document.querySelector('.intro p:first-of-type');
    const t = p && p.firstChild;
    if (!t || t.nodeType !== 3 || !/^\s*\S/.test(t.data)) return;
    const text = t.data.replace(/^\s+/, '');
    const cap = document.createElement('span'); cap.className = 'dropcap'; cap.textContent = text[0];
    t.data = text.slice(1);
    p.insertBefore(cap, t);
    p.classList.add('has-dropcap');
  }

  // Wipes animate an inner span, never the observed element itself: Chrome's
  // IntersectionObserver applies a target's own clip-path, so a fully clipped
  // target reports "not intersecting" and would never be revealed.
  function wrapInner(el, cls) {
    if (el.querySelector(':scope > .' + cls)) return;
    const span = document.createElement('span'); span.className = cls;
    while (el.firstChild) span.append(el.firstChild);
    el.append(span);
  }
  $('.chapter-body h3').forEach(h => wrapInner(h, 'h3-in'));
  $('.letter .salutation').forEach(s => wrapInner(s, 'sal-in'));

  // Pullquotes: every word becomes a span that inks in as the quote crosses the reading line.
  function splitInk(q) {
    const nodes = []; const walker = document.createTreeWalker(q, NodeFilter.SHOW_TEXT);
    let node, k = 0;
    while ((node = walker.nextNode())) nodes.push(node);
    nodes.forEach(t => {
      const frag = document.createDocumentFragment();
      t.data.split(/(\s+)/).filter(Boolean).forEach(part => {
        if (/^\s+$/.test(part)) { frag.append(part); return; }
        const w = document.createElement('span'); w.className = 'pw'; w.style.setProperty('--k', k++);
        w.textContent = part; frag.append(w);
      });
      t.replaceWith(frag);
    });
    q.style.setProperty('--n', k);
    q.classList.add('is-inking');
  }

  if (!reduce) { $(SPLIT).forEach(splitWords); wrapDropcap(); $('.pullquote').forEach(splitInk); }

  // Stagger indices → CSS transition-delay via --i
  $('ul.notes, .refs ol, footer .colophon, footer .footer-nav, .archive-stats, .issues-next-grid').forEach(g => Array.from(g.children).forEach((c, i) => c.style.setProperty('--i', i)));
  $('.tool-card').forEach((c, i) => c.style.setProperty('--i', i % 3));    // per column: each row lands left→right
  $('.principle').forEach((c, i) => c.style.setProperty('--i', i));
  $('.shelf-item').forEach((c, i) => c.style.setProperty('--i', i));
  $('.intro p strong:not(.no-mark), .manifesto h2 strong').forEach(s => s.classList.add('mark'));

  /* ---------- 2. Entrance choreography: one observer, .fx → .show, unobserve after ---------- */
  const FX = [
    '.section-label', '.intro p:first-of-type', '.mark',
    '.chapter-meta', SPLIT, '.chapter-body .lede', '.portfolio-lede', '.chapter-body h3',
    '.pullquote', 'ul.notes', '.refs',
    '.tool-card', '.project-list', '.project', '.principle',
    '.letter .stamp', '.letter .salutation', '.letter .signoff', '.contact-strip',
    '.issue-flag', '.issues-next-grid', '.issues-next-item',
    '.archive-stats', '.issue-featured', '.shelf-item',
    'footer .colophon', 'footer .footer-nav', 'footer .footer-bottom'
  ].join(',');
  let io = null;
  const reveal = el => { el.classList.add('show'); if (io) io.unobserve(el); };
  // The safety net: anything already behind the reader (hash load, scroll restoration,
  // nav jump), anything sitting on screen that the observer has not reported yet, and
  // whatever is still pending once the page end is reached, shows at once.
  function sweep() {
    const atEnd = scrollY + innerHeight >= html.scrollHeight - 2;
    const line = innerHeight * 0.92;
    $('.fx:not(.show)').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.bottom < 0 || (r.top < line && r.bottom > 0) || (atEnd && r.top < innerHeight)) reveal(el);
    });
  }
  if (!reduce) {                                                // reduced motion: no pre-states at all → static page
    io = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting || e.boundingClientRect.bottom < 0) reveal(e.target); });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0 });
    $(FX).forEach(el => { el.classList.add('fx'); io.observe(el); });
    let sweepT = 0;
    const queueSweep = () => { clearTimeout(sweepT); sweepT = setTimeout(() => requestAnimationFrame(sweep), 160); };
    addEventListener('scroll', queueSweep, { passive: true });
    addEventListener('hashchange', queueSweep);
    addEventListener('load', queueSweep);
    queueSweep();
    // if the OS preference flips to "reduce" mid-session, show everything that is still hidden
    const showAll = () => {
      if (!rmq.matches) return;
      $('.fx:not(.show)').forEach(el => el.classList.add('show')); io.disconnect();
      $('.pullquote.is-inking').forEach(q => q.classList.remove('is-inking'));
    };
    if (rmq.addEventListener) rmq.addEventListener('change', showAll); else if (rmq.addListener) rmq.addListener(showAll);
  }

  /* ---------- 3. Masthead progress, chapter depth, pullquote ink (scroll-linked, rAF-batched writes) ---------- */
  const mast = document.querySelector('.masthead');
  const nav = mast && mast.querySelector('nav');
  const sections = $('.hero, .intro, .chapter, .toolstack, .portfolio, .manifesto, .letter, footer');
  const chapters = $('.chapter').map(el => ({ el, num: el.querySelector('.chapter-number'), top: 0, h: 1, d: -1 }));
  const quotes = $('.pullquote.is-inking').map(el => ({ el, top: 0, h: 1, p: -1 }));
  let active = null, maxScroll = 1, scrollRaf = 0, resizeRaf = 0, vh = innerHeight;

  // masthead state: transparent over the hero, cream bar once the reader has scrolled.
  // State rather than motion, so it also runs under reduced motion (tick() does not).
  const SCROLLED_AT = 8;                     // px
  let mastScrolled = null;
  function syncMast() {
    if (!mast) return;
    let s = scrollY > SCROLLED_AT;
    if (mastScrolled === null && !s && location.hash.length > 1) {   // hash load: the fragment scroll
      let t = null;                                                   // has not happened yet, so decide
      try { t = document.getElementById(decodeURIComponent(location.hash.slice(1))); } catch (e) {}
      if (t) s = t.getBoundingClientRect().top + scrollY - 80 > SCROLLED_AT;   // 80 = scroll-margin-top
    }
    if (s !== mastScrolled) { mastScrolled = s; mast.classList.toggle('is-scrolled', s); }
  }

  function measure() {                       // the only layout reads: load / resize / body ResizeObserver
    vh = innerHeight;
    maxScroll = Math.max(1, html.scrollHeight - vh);
    chapters.forEach(c => { const r = c.el.getBoundingClientRect(); c.top = r.top + scrollY; c.h = Math.max(1, r.height); });
    quotes.forEach(q => { const r = q.el.getBoundingClientRect(); q.top = r.top + scrollY; q.h = Math.max(1, r.height); });
    placeIndicator();
    syncMast();
    tick();
  }
  function tick() {                          // writes only
    if (reduce || !mast) return;
    const y = scrollY;
    mast.style.setProperty('--read', Math.min(1, y / maxScroll).toFixed(4));
    const line = y + vh * 0.4;               // the "reading line" sits 40% down the viewport
    chapters.forEach(c => {
      const d = Math.max(0, Math.min(1, (line - c.top) / c.h));
      if (c.num && Math.abs(d - c.d) > 0.002) { c.d = d; c.num.style.setProperty('--depth', d.toFixed(3)); }
    });
    // a quote starts inking as it enters the lower screen and is fully inked by mid-screen
    quotes.forEach(q => {
      const start = q.top - vh * 0.92, end = q.top + q.h - vh * 0.5;
      const p = Math.max(0, Math.min(1, (y - start) / Math.max(1, end - start)));
      if (Math.abs(p - q.p) > 0.004) { q.p = p; q.el.style.setProperty('--pq', p.toFixed(3)); }
    });
  }
  addEventListener('scroll', () => { if (!scrollRaf) scrollRaf = requestAnimationFrame(() => { scrollRaf = 0; syncMast(); tick(); }); }, { passive: true });
  addEventListener('resize', () => { if (!resizeRaf) resizeRaf = requestAnimationFrame(() => { resizeRaf = 0; measure(); }); }, { passive: true });
  if ('ResizeObserver' in window) new ResizeObserver(measure).observe(document.body);   // fonts, iframe, late layout
  else addEventListener('load', measure);

  /* ---------- 4. Active section → nav underline that slides ---------- */
  const linkFor = new Map();
  if (nav) sections.forEach(s => {
    const a = nav.querySelector(`a[href="${s.classList.contains('chapter') ? '#ch1' : '#' + s.id}"]`);
    if (a) linkFor.set(s, a);                // hero and footer have no link: they clear the state
  });
  if (nav && !linkFor.size) active = nav.querySelector('a.is-here');   // archive: "you are here" is fixed
  function placeIndicator() {
    if (!nav) return;
    nav.classList.toggle('has-active', !!active);
    if (!active || !active.offsetWidth) return;              // nav is display:none on phones
    nav.style.setProperty('--nav-x', active.offsetLeft + 'px');
    nav.style.setProperty('--nav-w', active.offsetWidth);
  }
  const inBand = new Set();
  const bandIO = new IntersectionObserver(entries => {        // a 5%-tall band, 45% down the viewport
    entries.forEach(e => e.isIntersecting ? inBand.add(e.target) : inBand.delete(e.target));
    const cur = sections.filter(s => inBand.has(s)).pop();  // lowest section in the band wins
    const a = cur ? linkFor.get(cur) : null;
    if (a === active) return;
    if (active) { active.classList.remove('is-active'); active.removeAttribute('aria-current'); }
    if (a) { a.classList.add('is-active'); a.setAttribute('aria-current', 'true'); }
    active = a || null;
    placeIndicator();
  }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });
  if (nav && linkFor.size) sections.forEach(s => bandIO.observe(s));
  measure();

  /* ---------- 5. Pointer spotlight on the dark tool cards; archive covers lean toward the pointer ---------- */
  if (finePointer && !reduce) {
    $('.tool-card').forEach(el => el.classList.add('spot'));
    let raf = 0, last = null;
    addEventListener('pointermove', e => {
      const card = e.target && e.target.closest ? e.target.closest('.spot') : null;
      if (!card) return;
      last = { card, x: e.clientX, y: e.clientY };
      if (!raf) raf = requestAnimationFrame(() => {
        raf = 0;
        const r = last.card.getBoundingClientRect();           // one read per frame, then two writes
        last.card.style.setProperty('--mx', (last.x - r.left) + 'px');
        last.card.style.setProperty('--my', (last.y - r.top) + 'px');
      });
    }, { passive: true });

    $('a.shelf-item').forEach(item => {
      const c = item.querySelector('.shelf-cover');
      if (!c) return;
      item.addEventListener('pointermove', e => {
        const r = c.getBoundingClientRect();
        const x = Math.max(-0.5, Math.min(0.5, (e.clientX - r.left) / r.width - 0.5));
        const y = Math.max(-0.5, Math.min(0.5, (e.clientY - r.top) / r.height - 0.5));
        c.style.setProperty('--ty', (x * 12).toFixed(2) + 'deg');
        c.style.setProperty('--tx', (-y * 9).toFixed(2) + 'deg');
        c.style.setProperty('--gx', ((x + 0.5) * 100).toFixed(1) + '%');
        c.style.setProperty('--gy', ((y + 0.5) * 100).toFixed(1) + '%');
      }, { passive: true });
      item.addEventListener('pointerleave', () => { c.style.setProperty('--tx', '0deg'); c.style.setProperty('--ty', '0deg'); });
    });
  }

  /* ---------- 6. Cross-document view transitions: only morph covers the reader can see ---------- */
  const COVERS = '.hero-stage, .issue-cover, .shelf-cover, .issues-next-item .cover';
  const hideOffscreenCovers = () => $(COVERS).forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight || !r.width) el.style.viewTransitionName = 'none';
  });
  addEventListener('pageswap', e => { if (e.viewTransition) hideOffscreenCovers(); });
  addEventListener('pagereveal', e => {
    if (!e.viewTransition) return;
    hideOffscreenCovers();
    e.viewTransition.finished.finally(() => $(COVERS).forEach(el => { el.style.viewTransitionName = ''; }));
  });
})();

/* ===================== ThreeDPaper mount ===================== */
// ThreeDPaper — vanilla port of src/shaders/3d-paper/ThreeDPaper.tsx (@designcodeio/threeui),
// grown up for this site. Each `.three-d-paper` host shows a still poster of its sheet (a CSS
// background) and mounts the live scene in an iframe while it is near the screen. The frame fades
// in once the scene reports its first real frame, renders only while visible, follows the page
// scroll on the hero, opens its issue on a click, and falls back to the poster for good if the
// device cannot keep up.
(function(){
  // Cloudflare Pages (and Vercel with cleanUrls) serve the scene without ".html" and 308-redirect
  // the .html URL; the local python server needs the extension.
  const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  const EXT = LOCAL ? '.html' : '';
  const SOURCES = {
    'original': '/src/shaders/3d-paper/sources/3d-paper',
    'site-of-the-year': '/src/shaders/3d-paper/sources/3d-paper-site-of-the-year',
    'japanese': '/src/shaders/3d-paper/sources/3d-paper-japanese',
    'certificate': '/src/shaders/3d-paper/sources/3d-paper-certificate'
  };
  const TITLES = {
    'original': '3D Paper',
    'site-of-the-year': '3D Paper — Site of the Year',
    'japanese': '3D Paper — 認定証',
    'certificate': '3D Paper — Certificate'
  };
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // no WebGL (Lockdown Mode, GPU blocklist, disabled by policy): the poster stays; a host
  // without a poster reveals the HTML copy of the sheet instead
  const WEBGL = (() => {
    try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); }
    catch (e) { return false; }
  })();
  const hasPoster = host => getComputedStyle(host).backgroundImage !== 'none';

  document.querySelectorAll('.three-d-paper').forEach(host => {
    const href = host.dataset.href || '';
    const plate = host.closest('.hero, .issue-cover');
    const hero = host.closest('.hero');
    // touch: the frame ignores pointers (so the page scrolls); a tap on the plate opens the issue.
    // Modified or middle clicks open a new tab, like a real link would.
    const open = (newTab) => { if (newTab) window.open(href, '_blank', 'noopener'); else location.href = href; };
    if (href) {
      host.addEventListener('click', e => open(e.metaKey || e.ctrlKey || e.shiftKey));
      host.addEventListener('auxclick', e => { if (e.button === 1) open(true); });
    }

    if(!WEBGL){
      host.dataset.state = 'poster';
      if(plate && !hasPoster(host)) plate.classList.add('no-webgl');
      return;
    }
    const variant = Object.prototype.hasOwnProperty.call(SOURCES, host.dataset.variant)
      ? host.dataset.variant : 'original';
    let near = true, onScreen = true, docVisible = !document.hidden;
    let frame = null, ready = false, slow = false, booted = false;
    let unmountTimer = null, readyTimer = null, playing = null, idleQueued = false;

    const post = msg => { if (frame && frame.contentWindow) frame.contentWindow.postMessage(msg, location.origin); };

    function create(){
      const el = document.createElement('iframe');
      el.title = TITLES[variant];
      el.tabIndex = -1;                         // decorative: the plate is aria-hidden, keep it out of the Tab order
      el.setAttribute('aria-hidden', 'true');
      // per-issue copy for the sheet: data-sheet-title="…|…", data-sheet-vol="…" and friends
      // become ?title=…&vol=… on the scene URL; a host without them shows Vol. 01
      const q = new URLSearchParams();
      Object.keys(host.dataset).forEach(k => {
        if (k.startsWith('sheet') && k.length > 5) q.set(k.slice(5).toLowerCase(), host.dataset[k]);
      });
      if (href) q.set('cta', '1');
      // no rise-in when a poster already shows the sheet (the live frame must take over seamlessly)
      // or when this is a remount
      if (booted || hasPoster(host)) q.set('intro', '0');
      el.src = SOURCES[variant] + EXT + '?' + q.toString();
      // same origin, no sandbox: the scene draws /assets/author.jpg into its canvas texture
      // (an opaque origin would taint it) and only runs this site's own code
      el.setAttribute('loading', 'eager');
      Object.assign(el.style, {
        position:'absolute', inset:'0', display:'block', width:'100%', height:'100%',
        border:'0', background:'transparent', opacity:'0', pointerEvents:'none',
        transition:'opacity 600ms cubic-bezier(.22,1,.36,1)'
      });
      el.addEventListener('load', () => {
        if (frame !== el) return;
        clearTimeout(readyTimer);
        readyTimer = setTimeout(() => show(el), 4000);   // an older scene build that never says "ready"
      });
      frame = el; ready = false; playing = null;
      host.appendChild(el);
    }
    function show(el){
      if (frame !== el || ready) return;
      ready = true; booted = true;
      clearTimeout(readyTimer);
      el.style.opacity = '1';
      el.style.pointerEvents = 'auto';
      sync();
      sendScroll(true);
    }
    function sync(){
      const mounted = near && docVisible && !slow;
      host.dataset.state = slow ? 'poster' : !mounted ? 'paused' : (ready ? 'ready' : 'loading');
      if (mounted && !frame) {
        // first mount waits for an idle moment so the page paints and answers input first;
        // the poster carries the banner meanwhile
        if (!booted && !idleQueued && 'requestIdleCallback' in window) {
          idleQueued = true;
          requestIdleCallback(() => { idleQueued = false; if (near && docVisible && !slow && !frame) { create(); sync(); } }, { timeout: 1200 });
        } else if (!idleQueued) create();
      }
      else if (!mounted && frame && !unmountTimer) {
        // hysteresis: a reader scrolling around the fold should not pay the WebGL boot again
        unmountTimer = setTimeout(() => {
          unmountTimer = null;
          if (!(near && docVisible && !slow) && frame) { frame.remove(); frame = null; ready = false; }
        }, 6000);
      }
      if (mounted && unmountTimer) { clearTimeout(unmountTimer); unmountTimer = null; }
      // render only while the plate is actually on screen and the tab is visible
      const play = onScreen && docVisible;
      if (frame && ready && play !== playing) { playing = play; post({ sheet: play ? 'resume' : 'pause' }); }
    }

    // the hero follows the page: 0 while the banner fills the screen, 1 once it has scrolled away
    let lastP = -1, scrollRaf = 0;
    function sendScroll(force){
      if (!hero || !frame || !ready || reduce) return;
      const r = hero.getBoundingClientRect();
      const p = Math.max(0, Math.min(1, -r.top / Math.max(1, r.height)));
      if (force || Math.abs(p - lastP) > 0.002) { lastP = p; post({ sheet: 'scroll', p }); }
    }
    if (hero && !reduce) addEventListener('scroll', () => {
      if (!scrollRaf) scrollRaf = requestAnimationFrame(() => { scrollRaf = 0; if (onScreen) sendScroll(); });
    }, { passive: true });

    addEventListener('message', e => {
      if (!frame || e.source !== frame.contentWindow || e.origin !== location.origin) return;
      const m = e.data || {};
      if (m.sheet === 'ready') show(frame);
      else if (m.sheet === 'click' && href) open(!!(m.newTab || m.metaKey || m.ctrlKey || m.shiftKey || m.button === 1));
      else if (m.sheet === 'slow') {
        // this device cannot animate the sheet smoothly: keep the still poster instead
        slow = true;
        const el = frame; el.style.opacity = '0';
        setTimeout(() => { if (el.parentNode) el.remove(); if (frame === el) { frame = null; ready = false; } }, 650);
        if (plate && !hasPoster(host)) plate.classList.add('no-webgl');
        sync();
      }
    });

    if (typeof IntersectionObserver !== 'undefined') {
      // a full viewport of margin keeps the scene warm while the reader is anywhere near it…
      new IntersectionObserver(entries => {
        const entry = entries[entries.length - 1];
        near = entry ? entry.isIntersecting : true;
        sync();
      }, { rootMargin: '100%' }).observe(host);
      // …but it only draws while some of it is actually visible
      new IntersectionObserver(entries => {
        const entry = entries[entries.length - 1];
        onScreen = entry ? entry.isIntersecting : true;
        sync();
        if (onScreen) sendScroll(true);
      }, { rootMargin: '0px' }).observe(host);
    }
    document.addEventListener('visibilitychange', () => { docVisible = !document.hidden; sync(); });
    sync();
  });
})();
