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
  const SPLIT = '.chapter-body h2, .toolstack h2, .portfolio h2';
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

  if (!reduce) { $(SPLIT).forEach(splitWords); wrapDropcap(); }

  // Stagger indices → CSS transition-delay via --i
  $('ul.notes, .refs ol, footer .colophon').forEach(g => Array.from(g.children).forEach((c, i) => c.style.setProperty('--i', i)));
  $('.tool-card').forEach((c, i) => c.style.setProperty('--i', i % 3));    // per column: each row lands left→right
  $('.principle').forEach((c, i) => c.style.setProperty('--i', i));
  $('.intro p strong:not(.no-mark), .manifesto h2 strong').forEach(s => s.classList.add('mark'));

  /* ---------- 2. Entrance choreography: one observer, .fx → .show, unobserve after ---------- */
  const FX = [
    '.section-label', '.intro p:first-of-type', '.mark',
    '.chapter-meta', SPLIT, '.chapter-body .lede', '.portfolio-lede', '.chapter-body h3',
    '.pullquote', 'ul.notes', '.refs',
    '.tool-card', '.project-list', '.project', '.principle',
    '.letter .stamp', '.letter .salutation', '.letter .signoff', '.contact-strip',
    'footer .colophon', 'footer .footer-bottom'
  ].join(',');
  let io = null;
  const reveal = el => { el.classList.add('show'); if (io) io.unobserve(el); };
  // Anything already behind the reader (hash load, scroll restoration, nav jump) or still
  // pending when the page end is reached (the copyright line) shows at once.
  function sweep() {
    const atEnd = scrollY + innerHeight >= html.scrollHeight - 2;
    $('.fx:not(.show)').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.bottom < 0 || (atEnd && r.top < innerHeight)) reveal(el);
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
    // if the OS preference flips to "reduce" mid-session, show everything that is still hidden
    const showAll = () => { if (rmq.matches) { $('.fx:not(.show)').forEach(el => el.classList.add('show')); io.disconnect(); } };
    if (rmq.addEventListener) rmq.addEventListener('change', showAll); else if (rmq.addListener) rmq.addListener(showAll);
  }

  /* ---------- 3. Masthead progress + chapter depth (scroll-linked, rAF-batched writes) ---------- */
  const mast = document.querySelector('.masthead');
  const nav = mast && mast.querySelector('nav');
  const sections = $('.hero, .intro, .chapter, .toolstack, .portfolio, .manifesto, .letter, footer');
  const chapters = $('.chapter').map(el => ({ el, top: 0, h: 1, d: -1 }));
  let active = null, maxScroll = 1, scrollRaf = 0, resizeRaf = 0;

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
    maxScroll = Math.max(1, html.scrollHeight - innerHeight);
    chapters.forEach(c => { const r = c.el.getBoundingClientRect(); c.top = r.top + scrollY; c.h = Math.max(1, r.height); });
    placeIndicator();
    syncMast();
    tick();
  }
  function tick() {                          // writes only
    if (reduce || !mast) return;
    const y = scrollY;
    mast.style.setProperty('--read', Math.min(1, y / maxScroll).toFixed(4));
    const line = y + innerHeight * 0.4;      // the "reading line" sits 40% down the viewport
    chapters.forEach(c => {
      const d = Math.max(0, Math.min(1, (line - c.top) / c.h));
      if (Math.abs(d - c.d) > 0.002) { c.d = d; c.el.style.setProperty('--depth', d.toFixed(3)); }
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
  if (nav) sections.forEach(s => bandIO.observe(s));
  measure();

  /* ---------- 5. Pointer spotlight on the dark tool cards and the project rows ---------- */
  if (finePointer && !reduce) {
    $('.tool-card, .project').forEach(el => el.classList.add('spot'));
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
  }
})();

/* ===================== ThreeDPaper mount ===================== */
// ThreeDPaper — vanilla port of src/shaders/3d-paper/ThreeDPaper.tsx (@designcodeio/threeui).
// Each `.three-d-paper` host gets the registered source for its data-variant inside a
// sandboxed iframe, mounted only while the host is on screen and the tab is visible,
// and faded in once the frame has loaded — the same behaviour as the React component.
(function(){
  const SOURCES = {
    'original': '/src/shaders/3d-paper/sources/3d-paper.html',
    'site-of-the-year': '/src/shaders/3d-paper/sources/3d-paper-site-of-the-year.html',
    'japanese': '/src/shaders/3d-paper/sources/3d-paper-japanese.html',
    'certificate': '/src/shaders/3d-paper/sources/3d-paper-certificate.html'
  };
  const TITLES = {
    'original': '3D Paper',
    'site-of-the-year': '3D Paper — Site of the Year',
    'japanese': '3D Paper — 認定証',
    'certificate': '3D Paper — Certificate'
  };

  // no WebGL (Lockdown Mode, GPU blocklist, disabled by policy): the scene would
  // load but never draw, so reveal the HTML copy of the sheet instead
  const WEBGL = (() => {
    try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); }
    catch (e) { return false; }
  })();

  document.querySelectorAll('.three-d-paper').forEach(host => {
    if(!WEBGL){
      host.dataset.state = 'unsupported';
      const plate = host.closest('.hero, .issue-cover');
      if(plate) plate.classList.add('no-webgl');
      return;
    }
    const variant = Object.prototype.hasOwnProperty.call(SOURCES, host.dataset.variant)
      ? host.dataset.variant : 'original';
    let hostVisible = true;
    let documentVisible = !document.hidden;
    let ready = false;
    let frame = null;
    let unmountTimer = null;

    function render(){
      const mounted = hostVisible && documentVisible;
      host.dataset.state = !mounted ? 'paused' : (ready ? 'ready' : 'loading');
      if(mounted && !frame){
        const el = document.createElement('iframe');
        el.title = TITLES[variant];
        // per-issue copy for the sheet: data-sheet-title="…|…", data-sheet-vol="…" and friends
        // become ?title=…&vol=… on the scene URL; a host without them shows Vol. 01
        const q = new URLSearchParams();
        Object.keys(host.dataset).forEach(k => {
          if (k.startsWith('sheet') && k.length > 5) q.set(k.slice(5).toLowerCase(), host.dataset[k]);
        });
        const qs = q.toString();
        el.src = SOURCES[variant] + (qs ? '?' + qs : '');
        // allow-same-origin: the scene draws assets/author.jpg into its canvas
        // texture; from an opaque origin that image would taint the canvas and
        // WebGL would refuse it. The frame only runs this site's own code.
        el.setAttribute('sandbox', 'allow-scripts allow-same-origin');
        el.setAttribute('loading', 'eager');
        Object.assign(el.style, {
          position:'absolute', inset:'0', display:'block', width:'100%', height:'100%',
          border:'0', background:'#08080a', opacity:'0', pointerEvents:'none',
          transition:'opacity 240ms ease-out'
        });
        el.addEventListener('load', () => {
          if(frame !== el) return;
          ready = true;
          el.style.opacity = '1';
          el.style.pointerEvents = 'auto';
          host.dataset.state = 'ready';
        });
        frame = el;
        host.appendChild(el);
      } else if(!mounted && frame){
        // hysteresis: a reader scrolling around the fold should not pay the
        // WebGL boot and the intro again, so unmount only after 2s out of view
        if(!unmountTimer) unmountTimer = setTimeout(() => {
          unmountTimer = null;
          if(!(hostVisible && documentVisible) && frame){
            frame.remove();
            frame = null;
            ready = false;
          }
        }, 2000);
      }
      if(mounted && unmountTimer){ clearTimeout(unmountTimer); unmountTimer = null; }
    }

    if(typeof IntersectionObserver !== 'undefined'){
      // a full viewport of margin: the banner is the first screen, keep it warm
      // while the reader is anywhere near it
      new IntersectionObserver(entries => {
        const entry = entries[0];
        hostVisible = entry ? entry.isIntersecting : true;
        render();
      }, { rootMargin: '100%' }).observe(host);
    }
    document.addEventListener('visibilitychange', () => {
      documentVisible = !document.hidden;
      render();
    });
    render();
  });
})();
