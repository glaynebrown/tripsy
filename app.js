/* Tripsy screens. Data comes from store.js (Firebase) or demo.js (sample mode)
   as one state object S; every change re-draws the current screen.

   Screens (hash routes):
     #/trips        My trips
     #/t/{tid}      One trip: its ideas (filter by kind)
     #/someday      My someday list (not tied to a trip)
     #/settings     Me, my look, account
     #/join/{code}  An invite link */

(() => {
  const API = Store.configured ? Store : Demo;
  const SAMPLE = !!API.sample;
  const $ = s => document.querySelector(s);
  const view = $('#view');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (id, cls) => `<svg class="icon ${cls || ''}" aria-hidden="true"><use href="#i-${id}"/></svg>`;
  const ls = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} },
  };

  let user = null;
  let S = null;
  let pending = false;
  let dragging = false;
  const ui = { cat: 'all', day: '' };

  const CATS = [
    { id: 'sights', name: 'Sights', emoji: '📍' },
    { id: 'food', name: 'Food', emoji: '🍽️' },
    { id: 'stay', name: 'Stays', emoji: '🛏️' },
    { id: 'do', name: 'Things to do', emoji: '🎟️' },
    { id: 'shop', name: 'Shopping', emoji: '🛍️' },
    { id: 'other', name: 'Other', emoji: '✨' },
  ];
  const catOf = id => CATS.find(c => c.id === id) || CATS[CATS.length - 1];
  const TRIP_EMOJI = ['✈️', '🌴', '🏖️', '🍋', '🗼', '🏔️', '🌸', '🏮', '🤠', '🥐', '🍝', '🌊', '🏰', '🎡', '🌵', '❄️', '🌺', '🗽', '🐚', '🎀'];

  // ---------- small helpers ----------
  const myName = () => (S && S.profile && S.profile.name) || (user && user.name) || 'Me';
  const tripById = tid => S.trips.find(t => t.id === tid);
  const canEdit = t => t && t.roles && t.roles[S.me] === 'edit';
  const isOwner = t => t && t.owner === S.me;
  const nameIn = (t, uid) => (uid === S.me ? 'You' : (t && t.people && t.people[uid] && t.people[uid].name) || 'Someone');
  const first = s => (s || '?').trim().charAt(0).toUpperCase();
  const AV = ['#F4C7D7', '#C9D8F2', '#D8CBEE', '#C8E6DA', '#F6D9B8', '#F2C4BE'];
  const avColor = uid => AV[[...String(uid)].reduce((a, c) => a + c.charCodeAt(0), 0) % AV.length];
  const avatar = (t, uid, cls) => `<span class="av ${cls || ''}" style="background:${avColor(uid)}" title="${esc(nameIn(t, uid))}">${esc(first(uid === S.me ? myName() : nameIn(t, uid)))}</span>`;
  // My own order (dragged on the Trips screen). Trips I haven't placed yet -- new
  // or just joined -- go on top, newest first.
  function sortedTrips() {
    const order = (S.profile && S.profile.tripOrder) || [];
    const at = id => order.indexOf(id);
    return S.trips.slice().sort((a, b) => {
      const A = at(a.id), B = at(b.id);
      if (A < 0 && B < 0) return (b.createdAt || 0) - (a.createdAt || 0);
      if (A < 0 || B < 0) return A < 0 ? -1 : 1;
      return A - B;
    });
  }
  // My chip order (Must-dos + the kinds), the same on every trip. "All" always comes first.
  function chipOrder() {
    const keys = ['must', ...CATS.map(c => c.id)];
    const mine = ((S.profile && S.profile.chipOrder) || []).filter(k => keys.includes(k));
    return [...mine, ...keys.filter(k => !mine.includes(k))];
  }
  const orderedCats = () => chipOrder().filter(k => k !== 'must').map(catOf);
  // Put the visible chips' new order into the full order, keeping hidden ones where they were.
  function mergeOrder(full, shown) {
    const set = new Set(shown);
    let i = 0;
    return full.map(k => (set.has(k) ? shown[i++] : k));
  }
  function chipsHtml(all, counts, musts) {
    const chip = (id, label, n) => `<button class="chip ${ui.cat === id ? 'on' : ''}" data-cat="${id}">${label} <span class="n">${n}</span></button>`;
    return `<div class="chips scroll" id="chips">${chip('all', 'All', all.length)}${chipOrder().map(k => {
      if (k === 'must') return musts ? chip('must', '💖 Must-dos', musts) : '';
      const c = catOf(k);
      return counts[k] ? chip(k, `${c.emoji} ${c.name}`, counts[k]) : '';
    }).join('')}</div>`;
  }
  function sortableChips() {
    const row = $('#chips');
    if (!row) return;
    sortable(row, '.chip:not([data-cat="all"])', { axis: 'x', key: el => el.dataset.cat, onDrop: keys => {
      const next = mergeOrder(chipOrder(), keys);
      S.profile.chipOrder = next;
      API.saveProfile({ chipOrder: next }).catch(oops);
    } });
  }
  const lookFor = t => (t && t.look && !(S.profile.keepMine || {})[t.id] ? t.look : S.profile.look);
  const safeUrl = u => (/^https?:\/\//i.test(u || '') ? u : '');
  const mapsUrl = (address, t) => 'https://maps.apple.com/?q=' + encodeURIComponent(address + (t && t.place && !address.includes(t.place) ? ', ' + t.place : ''));

  // A trip's cover photo, framed where it was dragged to (x/y = 0-100, 50 = centered).
  const coverPos = t => `${t.coverPos ? t.coverPos.x : 50}% ${t.coverPos ? t.coverPos.y : 50}%`;
  const coverImg = (t, cls) => `<img class="${cls}" src="${esc(t.cover)}" alt="" style="object-position:${coverPos(t)}" draggable="false">`;

  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function dateRange(a, b) {
    const p = s => { const [y, m, d] = s.split('-').map(Number); return { y, m, d }; };
    if (!a) return '';
    const A = p(a);
    if (!b || b === a) return `${MON[A.m - 1]} ${A.d}, ${A.y}`;
    const B = p(b);
    if (A.y !== B.y) return `${MON[A.m - 1]} ${A.d}, ${A.y} – ${MON[B.m - 1]} ${B.d}, ${B.y}`;
    if (A.m !== B.m) return `${MON[A.m - 1]} ${A.d} – ${MON[B.m - 1]} ${B.d}, ${A.y}`;
    return `${MON[A.m - 1]} ${A.d} – ${B.d}, ${A.y}`;
  }
  function untilText(start) {
    if (!start) return '';
    const [y, m, d] = start.split('-').map(Number);
    const days = Math.round((new Date(y, m - 1, d) - new Date(new Date().toDateString())) / 86400000);
    if (days < 0) return '';
    if (days === 0) return 'Today! ✨';
    if (days === 1) return 'Tomorrow!';
    if (days < 60) return `in ${days} days`;
    return `in ${Math.round(days / 30.4)} months`;
  }

  function toast(msg, ms) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => t.classList.remove('show'), ms || 2400);
  }
  function oops(e) { console.error(e); toast((e && e.message && e.message.length < 140 ? e.message : 'Something went wrong — try again.')); }

  // ---------- dialogs ----------
  function ask(title, body, ok = 'OK', opts = {}) {
    return new Promise(res => {
      const wrap = $('#dialog-wrap');
      $('#dialog').innerHTML = `<h2>${esc(title)}</h2>${body ? `<p>${body}</p>` : ''}
        ${opts.input ? `<input class="input" id="dlg-in" type="text" autocomplete="off" autocapitalize="characters" placeholder="${esc(opts.placeholder || '')}">` : ''}
        <div class="row">${opts.cancel === false ? '' : `<button class="btn quiet" data-r="0">${esc(opts.cancelLabel || 'Cancel')}</button>`}
        <button class="btn ${opts.danger ? 'danger' : ''}" data-r="1">${esc(ok)}</button></div>`;
      wrap.hidden = false;
      const inp = $('#dlg-in');
      if (inp) setTimeout(() => inp.focus(), 50);
      wrap.onclick = e => {
        const b = e.target.closest('[data-r]');
        if (!b && e.target !== wrap) return;
        const yes = b && b.dataset.r === '1';
        wrap.hidden = true;
        wrap.onclick = null;
        res(opts.input ? (yes ? inp.value : null) : yes);
      };
    });
  }
  const tell = (title, body) => ask(title, body, 'Got it', { cancel: false });

  // ---------- sheet ----------
  const sheetWrap = $('#sheet-wrap');
  const sheet = $('#sheet');
  function openSheet(html, onClick, keepScroll) {
    const top = keepScroll && !sheetWrap.hidden ? sheet.scrollTop : 0;
    sheet.innerHTML = `<div class="grab"></div>${html}`;
    sheetWrap.hidden = false;
    sheet.scrollTop = top;
    sheet.onclick = onClick || null;
    sheet.oninput = null;
    sheet.onchange = null;
    document.body.style.overflow = 'hidden';
  }
  function closeSheet() {
    sheetWrap.hidden = true;
    sheet.innerHTML = '';
    sheet.onclick = sheet.oninput = sheet.onchange = null;
    document.body.style.overflow = '';
    // the sheet may have been showing another look (a trip's) -- put the page's back
    applyPageLook();
    if (pending) render();
  }
  sheetWrap.addEventListener('click', e => { if (e.target.closest('[data-act="close"]')) closeSheet(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !sheetWrap.hidden) closeSheet(); });

  // ---------- press, hold and drag to reorder ----------
  // Holding still for a moment picks an item up (so normal swipes still scroll
  // and taps still tap). Then it follows the finger; let go to drop it.
  // opts: { axis: 'x' (one row, like chips) or both, key: el -> id, onDrop: ids -> }
  function sortable(box, sel, opts) {
    const items = () => [...box.querySelectorAll(sel)];
    let hold = null, drag = null;
    const cancelHold = () => { if (hold) { clearTimeout(hold.t); hold = null; } };
    const blockTouch = e => { if (drag) e.preventDefault(); };
    box.addEventListener('touchmove', blockTouch, { passive: false });
    box.addEventListener('contextmenu', e => { if (hold || drag) e.preventDefault(); });

    box.addEventListener('pointerdown', e => {
      const el = e.target.closest(sel);
      if (!el || !box.contains(el) || e.button > 0) return;
      cancelHold();
      hold = { el, x: e.clientX, y: e.clientY, id: e.pointerId };
      hold.t = setTimeout(() => lift(e), e.pointerType === 'mouse' ? 250 : 380);
    });
    function lift() {
      const { el, x, y, id } = hold;
      hold = null;
      dragging = true;
      drag = { el, x, y, id, left: el.offsetLeft, top: el.offsetTop, sx: box.scrollLeft, sy: window.scrollY };
      try { box.setPointerCapture(id); } catch (err) {}
      el.classList.add('lifted');
      box.classList.add('sorting');
      if (navigator.vibrate) navigator.vibrate(12);
    }
    box.addEventListener('pointermove', e => {
      if (hold && Math.hypot(e.clientX - hold.x, e.clientY - hold.y) > 8) cancelHold();
      if (!drag || e.pointerId !== drag.id) return;
      e.preventDefault();
      const px = e.clientX, py = e.clientY;
      // nudge the row/page along when dragging near its edge
      if (opts.axis === 'x') {
        const r = box.getBoundingClientRect();
        if (px < r.left + 36) box.scrollLeft -= 10; else if (px > r.right - 36) box.scrollLeft += 10;
      } else if (py < 90) window.scrollBy(0, -12); else if (py > innerHeight - 110) window.scrollBy(0, 12);
      const { el } = drag;
      const list = items();
      const over = list.find(o => {
        if (o === el) return false;
        const r = o.getBoundingClientRect();
        return opts.axis === 'x' ? px > r.left && px < r.right : px > r.left && px < r.right && py > r.top && py < r.bottom;
      });
      if (over) {
        const before = list.indexOf(over) < list.indexOf(el);
        over.parentNode.insertBefore(el, before ? over : over.nextSibling);
      } else if (opts.lists) {
        // over a list (an empty day, say) but not over another item: go to its end
        const zone = [...box.querySelectorAll(opts.lists)].find(z => { const r = z.getBoundingClientRect(); return px > r.left && px < r.right && py > r.top - 6 && py < r.bottom + 6; });
        if (zone && el.parentNode !== zone) {
          const last = [...zone.querySelectorAll(sel)].pop();
          zone.insertBefore(el, last ? last.nextSibling : zone.firstChild);
        }
      }
      const dx = px - drag.x - (el.offsetLeft - drag.left) + (box.scrollLeft - drag.sx);
      const dy = opts.axis === 'x' ? 0 : py - drag.y - (el.offsetTop - drag.top) + (window.scrollY - drag.sy);
      el.style.transform = `translate(${dx}px, ${dy}px) scale(1.04)`;
    });
    const drop = e => {
      cancelHold();
      if (!drag || (e && e.pointerId !== drag.id)) return;
      const { el } = drag;
      drag = null;
      el.style.transform = '';
      el.classList.remove('lifted');
      box.classList.remove('sorting');
      // the lift-and-drop shouldn't also count as a tap
      const eat = ev => { ev.preventDefault(); ev.stopPropagation(); };
      box.addEventListener('click', eat, { capture: true, once: true });
      setTimeout(() => box.removeEventListener('click', eat, { capture: true }), 400);
      dragging = false;
      opts.onDrop(items().map(opts.key));
      if (pending) setTimeout(render, 50);
    };
    box.addEventListener('pointerup', drop);
    box.addEventListener('pointercancel', drop);
  }

  // ---------- photos ----------
  // Shrinks a picked photo so it fits comfortably in the database.
  // opts.max = longest side in px, opts.limit = most characters to store
  function pickPhoto(opts = {}) {
    const max = opts.max || 1100, limit = opts.limit || 380000;
    return new Promise(res => {
      const inp = $('#file');
      inp.value = '';
      inp.onchange = () => {
        const f = inp.files && inp.files[0];
        if (!f) return res(null);
        const img = new Image();
        const url = URL.createObjectURL(f);
        img.onload = () => {
          const k = Math.min(1, max / Math.max(img.width, img.height));
          const c = document.createElement('canvas');
          c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          URL.revokeObjectURL(url);
          let q = 0.78, out = c.toDataURL('image/jpeg', q);
          while (out.length > limit && q > 0.4) { q -= 0.08; out = c.toDataURL('image/jpeg', q); }
          res(out);
        };
        img.onerror = () => { URL.revokeObjectURL(url); toast('That photo couldn’t be opened.'); res(null); };
        img.src = url;
      };
      inp.click();
    });
  }

  // ---------- boot ----------
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

  // An invite link opened before signing in: remember it until we're in.
  function noteJoin() {
    const m = location.hash.match(/^#\/join\/([A-Za-z0-9-]+)/);
    if (m) ls.set('tr-join', m[1].toUpperCase());
  }
  noteJoin();

  API.onUser(u => {
    user = u;
    if (!u) { S = null; API.stop(); renderWelcome(); return; }
    view.innerHTML = '<p class="loading">Loading…</p>';
    API.start(s => { S = s; render(); });
  });
  window.addEventListener('hashchange', () => { noteJoin(); ui.cat = 'all'; ui.day = ''; Maps.forget(); if (!sheetWrap.hidden) closeSheet(); $('#dialog-wrap').hidden = true; render(); window.scrollTo(0, 0); });
  view.addEventListener('focusout', () => setTimeout(() => { if (pending && !typing()) render(); }, 0));
  const typing = () => view.contains(document.activeElement) && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && !/checkbox|radio|color/.test(document.activeElement.type);

  function route() {
    const h = location.hash.replace(/^#\/?/, '');
    const [name, arg, sub] = h.split('/');
    return { name: name || 'trips', arg: arg ? decodeURIComponent(arg) : '', sub: sub || '' };
  }

  function applyPageLook() {
    if (!S || !S.profile) return;
    const r = route();
    Themes.apply(r.name === 't' ? lookFor(tripById(r.arg)) : S.profile.look);
  }

  function render() {
    if (!S) return;
    if (typing() || !sheetWrap.hidden || dragging) { pending = true; return; }
    pending = false;
    if (!S.loaded) { view.innerHTML = '<p class="loading">Loading…</p>'; return; }
    if (!S.profile) { renderSetup(); return; }
    // an invite waiting from before sign-in
    const waiting = ls.get('tr-join', '');
    if (waiting && route().name !== 'join') { location.replace('#/join/' + waiting); return; }
    applyPageLook();
    $('#top').hidden = false;
    const r = route();
    renderTabs(r.name);
    const screens = { trips: viewTrips, t: viewTrip, someday: viewSomeday, settings: viewSettings, join: viewJoin };
    view.onclick = null;
    (screens[r.name] || viewTrips)(r.arg, r.sub);
    document.body.classList.toggle('has-fab', !!$('#add'));
    renderBanner();
  }

  function renderTabs(name) {
    const tabs = [['trips', 'Trips', 'suitcase'], ['someday', 'Someday', 'cloud']];
    const on = name === 't' || name === 'join' ? 'trips' : name;
    $('#tabs').innerHTML = tabs.map(([id, label, ic]) => `<a class="tab ${on === id ? 'on' : ''}" href="#/${id}">${icon(ic)}<span>${label}</span></a>`).join('');
    $('#gear').classList.toggle('on', name === 'settings');
  }
  function renderBanner() {
    const b = $('#banner');
    if (SAMPLE) {
      b.hidden = false;
      b.innerHTML = `Sample mode — pretend trips, saved only in this browser. Looking as <b>${esc(myName())}</b> · <a href="#/settings">switch</a>`;
    } else b.hidden = true;
  }

  // ---------- sign in ----------
  function renderWelcome() {
    $('#top').hidden = true;
    $('#banner').hidden = true;
    Themes.apply(Themes.DEFAULT);
    const invited = ls.get('tr-join', '');
    view.innerHTML = `<div class="welcome">
      <div class="clouds" aria-hidden="true"><i></i><i></i><i></i></div>
      <svg class="brand-mark big" aria-hidden="true"><use href="#i-mark"/></svg>
      <h1>Tripsy</h1>
      <p class="tagline">Dream up trips together — the places, the food, the someday ideas, all in one pretty spot.</p>
      ${invited ? `<div class="invite-note">${icon('sparkle')} You’ve been invited to a trip! Sign in to join.</div>` : ''}
      <button class="btn wide google" id="g-in"><svg viewBox="0 0 48 48" class="g" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.8 6C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.6c0-1.6-.1-3.1-.4-4.6H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17z"/><path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.8-6a24 24 0 0 0 0 21.4z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.3 0-11.6-4.2-13.5-9.9l-7.8 6C6.6 42.6 14.6 48 24 48z"/></svg>Continue with Google</button>
      <p class="err center" id="in-err" hidden></p>
    </div>`;
    $('#g-in').onclick = async () => {
      try { await API.signIn(); } catch (e) {
        if (/popup-closed|cancelled-popup/.test(e.code || '')) return;
        const er = $('#in-err'); er.hidden = false; er.textContent = 'Couldn’t sign in — try again.'; console.error(e);
      }
    };
  }

  // ---------- first time: name + look ----------
  let setupLook = null;
  function renderSetup() {
    $('#top').hidden = true;
    setupLook = setupLook || Themes.clean(Themes.DEFAULT);
    Themes.apply(setupLook);
    Themes.loadAllFonts();
    view.innerHTML = `<div class="setup">
      <svg class="brand-mark big" aria-hidden="true"><use href="#i-mark"/></svg>
      <h1>Welcome to Tripsy</h1>
      <p class="tagline">Make it yours — you can change any of this later.</p>
      <div class="card">
        <div class="field"><label for="su-name">Your name</label><input class="input" id="su-name" autocomplete="given-name" value="${esc((user.name || '').split(' ')[0])}" placeholder="What friends call you"></div>
        <div class="label">Your look</div>
        <div id="su-look"></div>
        <button class="btn wide" id="su-go" style="margin-top:20px">Let’s go ${icon('sparkle')}</button>
      </div>
    </div>`;
    lookEditor($('#su-look'), setupLook, l => { setupLook = l; Themes.apply(l); });
    $('#su-go').onclick = async () => {
      const name = $('#su-name').value.trim();
      if (!name) { $('#su-name').focus(); return toast('Add your name first.'); }
      try { await API.createProfile({ name, look: Themes.clean(setupLook) }); } catch (e) { oops(e); }
    };
  }

  // ---------- look editor (palettes, custom colors, fonts) ----------
  // Draws into el; calls onChange(look) on every change.
  function lookEditor(el, look, onChange) {
    look = Themes.clean(look);
    Themes.loadAllFonts();
    const draw = () => {
      const custom = look.palette === 'custom';
      const cp = Themes.fromCustom(look.custom || {});
      const c = look.custom || { bg: cp.bg, accent: cp.accent, ink: cp.ink };
      el.innerHTML = `<div class="palettes">
          ${Object.entries(Themes.PALETTES).map(([id, p]) => `<button type="button" class="pal ${look.palette === id ? 'on' : ''}" data-pal="${id}">
            <span class="sw" style="background:linear-gradient(135deg, ${p.soft}, ${p.glow})"><i style="background:${p.accent}"></i><i style="background:${p.deep}"></i></span><b>${esc(p.name)}</b></button>`).join('')}
          <button type="button" class="pal ${custom ? 'on' : ''}" data-pal="custom">
            <span class="sw rainbow"><i style="background:${esc(cp.accent)}"></i><i style="background:${esc(cp.deep)}"></i></span><b>My own colors</b></button>
        </div>
        ${custom ? `<div class="customs">
          ${[['bg', 'Background'], ['accent', 'Accent'], ['ink', 'Text']].map(([k, label]) => `<label class="cpick"><input type="color" data-c="${k}" value="${esc((c[k] || cp[k]).toLowerCase())}"><span>${label}</span></label>`).join('')}
          <p class="hint">Text that would be hard to read is fixed for you automatically.</p>
        </div>` : ''}
        <div class="label" style="margin-top:16px">Font</div>
        <div class="fonts">
          ${Object.entries(Themes.FONTS).map(([id, f]) => `<button type="button" class="fontopt ${look.font === id ? 'on' : ''}" data-font="${id}">
            <span class="aa" style="font-family:${esc(f.head)};font-weight:${f.weight}">Bon voyage</span><small style="font-family:${esc(f.body)}">${esc(f.name)}</small></button>`).join('')}
        </div>`;
    };
    el.onclick = e => {
      const p = e.target.closest('[data-pal]');
      const f = e.target.closest('[data-font]');
      if (p) {
        if (p.dataset.pal === 'custom' && look.palette !== 'custom') {
          const from = look.palette === 'custom' ? null : Themes.PALETTES[look.palette];
          look = { ...look, palette: 'custom', custom: look.custom || { bg: from.bg, accent: from.accent, ink: from.ink } };
        } else if (p.dataset.pal !== 'custom') look = { ...look, palette: p.dataset.pal };
      } else if (f) look = { ...look, font: f.dataset.font };
      else return;
      draw(); onChange(Themes.clean(look));
    };
    el.oninput = e => {
      const k = e.target.dataset.c;
      if (!k) return;
      look = { ...look, custom: { ...(look.custom || {}), [k]: e.target.value.toUpperCase() } };
      const cp = Themes.fromCustom(look.custom);
      const dots = el.querySelectorAll('[data-pal="custom"] .sw i');
      if (dots.length === 2) { dots[0].style.background = cp.accent; dots[1].style.background = cp.deep; }
      onChange(Themes.clean(look));
    };
    draw();
  }

  // ---------- trips ----------
  function tripCard(t) {
    const ideas = S.ideas[t.id] || [];
    const musts = ideas.filter(i => i.must).length;
    const look = lookFor(t);
    const when = t.start ? dateRange(t.start, t.end) : 'No dates yet';
    const soon = untilText(t.start);
    return `<a class="trip-card" href="#/t/${esc(t.id)}" data-tid="${esc(t.id)}" draggable="false" style="${Themes.styleAttr(look)}">
      <div class="trip-cover ${t.cover ? 'photo' : ''}">${t.cover ? coverImg(t, 'cover-img') : `<span class="trip-emoji">${esc(t.emoji || '✈️')}</span>`}${soon ? `<span class="soon">${esc(soon)}</span>` : ''}</div>
      <div class="trip-body">
        <h3>${esc(t.name)}</h3>
        ${t.place ? `<div class="trip-place">${icon('pin')}${esc(t.place)}</div>` : ''}
        <div class="trip-when">${esc(when)}</div>
        <div class="trip-foot">
          <span class="avs">${t.members.slice(0, 5).map(m => avatar(t, m)).join('')}${t.members.length > 5 ? `<span class="av more">+${t.members.length - 5}</span>` : ''}</span>
          <span class="trip-count">${ideas.length} idea${ideas.length === 1 ? '' : 's'}${musts ? ` · ${musts} must-do${musts === 1 ? '' : 's'}` : ''}${myOpenTodos(t).length ? `<span class="todo-badge">✅ ${myOpenTodos(t).length}</span>` : ''}</span>
        </div>
      </div>
    </a>`;
  }

  function viewTrips() {
    const trips = sortedTrips();
    view.innerHTML = `<div class="page-head">
        <div><h1>Hi ${esc(myName())} ${icon('sparkle', 'h-spark')}</h1><p class="sub">${trips.length ? 'Where to next?' : 'Let’s plan something dreamy.'}</p></div>
        <div class="plus-wrap">
          <button class="plus-btn" id="plus" aria-label="New trip or join" aria-expanded="false">${icon('plus')}</button>
          <div class="plus-menu" id="plus-menu" hidden>
            <button id="new">${icon('suitcase')} New trip</button>
            <button id="join">${icon('person-plus')} Join with a code</button>
          </div>
        </div>
      </div>
      ${trips.length ? `<div class="trips">${trips.map(tripCard).join('')}</div>` : `<div class="empty">
        <svg class="brand-mark big" aria-hidden="true"><use href="#i-mark"/></svg>
        <h2>No trips yet</h2>
        <p>Start a trip to collect places, food and ideas — then invite your friends to add theirs.</p>
        <button class="btn" id="new2">${icon('plus')} Start a trip</button>
      </div>`}`;
    if ($('.trips')) sortable($('.trips'), '.trip-card', { key: el => el.dataset.tid, onDrop: ids => {
      S.profile.tripOrder = ids;
      API.saveProfile({ tripOrder: ids }).catch(oops);
    } });
    const menu = $('#plus-menu');
    const showMenu = on => { menu.hidden = !on; $('#plus').setAttribute('aria-expanded', on); };
    $('#plus').onclick = e => { e.stopPropagation(); showMenu(menu.hidden); };
    document.onclick = e => { if (!menu.hidden && !e.target.closest('.plus-wrap')) showMenu(false); };
    $('#new').onclick = () => { showMenu(false); tripSheet(); };
    if ($('#new2')) $('#new2').onclick = () => tripSheet();
    $('#join').onclick = async () => {
      showMenu(false);
      const code = await ask('Join a trip', 'Type the code a friend sent you.', 'Join', { input: true, placeholder: 'e.g. CHINA-7K2' });
      if (code) joinCode(code);
    };
  }

  async function joinCode(code) {
    try {
      const tid = await API.join(code);
      ls.set('tr-join', null);
      location.hash = '#/t/' + tid;
      toast('You’re in! ✨');
    } catch (e) { ls.set('tr-join', null); oops(e); }
  }

  function viewJoin(code) {
    code = (code || '').toUpperCase();
    ls.set('tr-join', null);
    view.innerHTML = `<div class="welcome">
      <svg class="brand-mark big" aria-hidden="true"><use href="#i-mark"/></svg>
      <h1>Join a trip?</h1>
      <p class="tagline">Someone invited you with the code</p>
      <div class="bigcode">${esc(code)}</div>
      <div class="row center-row"><a class="btn quiet" href="#/trips">Not now</a><button class="btn" id="yes">Join the trip</button></div>
    </div>`;
    $('#yes').onclick = () => joinCode(code);
  }

  // New trip, or edit one's details.
  function tripSheet(t) {
    const d = t ? { ...t } : { name: '', place: '', emoji: '✈️', start: '', end: '', cover: '', coverPos: null };
    d.coverPos = d.coverPos ? { ...d.coverPos } : { x: 50, y: 50 };
    let dated = !!d.start;
    const draw = () => {
      openSheet(`<div class="sheet-head"><h2>${t ? 'Trip details' : 'New trip'}</h2><button class="btn quiet" data-act="close">Cancel</button></div>
        ${d.cover ? `<div class="cover-edit" id="cv-box">${coverImg(d, 'cover-img')}<span class="cover-hint">Drag to fit</span></div>
          <div class="row tight cover-acts"><button type="button" class="btn soft small" id="cv-pick">${icon('photo')} Change photo</button><button type="button" class="btn quiet small" id="cv-off">Remove</button></div>`
          : `<button type="button" class="cover-add" id="cv-pick">${icon('photo')}<span>Add a cover photo</span><small>Optional — or pick an emoji below</small></button>`}
        <div class="emoji-pick ${d.cover ? 'muted-pick' : ''}">${TRIP_EMOJI.map(e => `<button type="button" class="${d.emoji === e ? 'on' : ''}" data-emoji="${e}">${e}</button>`).join('')}</div>
        <div class="field"><label for="tr-name">Trip name</label><input class="input" id="tr-name" value="${esc(d.name)}" placeholder="Girls’ trip to Italy"></div>
        <div class="field"><label for="tr-place">Where</label><input class="input" id="tr-place" value="${esc(d.place)}" placeholder="City, country — or a few"></div>
        <label class="switch"><input type="checkbox" id="tr-dated" ${dated ? 'checked' : ''}> We have dates</label>
        ${dated ? `<div class="md tight"><div class="field"><label for="tr-start">From</label><input class="input" type="date" id="tr-start" value="${esc(d.start)}"></div>
          <div class="field"><label for="tr-end">To</label><input class="input" type="date" id="tr-end" value="${esc(d.end)}"></div></div>` : '<p class="hint">No dates needed — just collect ideas. You can add them anytime.</p>'}
        <div class="sheet-foot"><button class="btn wide" id="tr-save">${t ? 'Save' : 'Create trip'}</button></div>`, onClick);
      framer();
    };
    const grab = () => {
      d.name = $('#tr-name').value; d.place = $('#tr-place').value;
      if ($('#tr-start')) { d.start = $('#tr-start').value; d.end = $('#tr-end').value; }
    };
    async function onClick(e) {
      const em = e.target.closest('[data-emoji]');
      if (em) { grab(); d.emoji = em.dataset.emoji; draw(); return; }
      if (e.target.closest('#cv-pick')) {
        grab();
        const p = await pickPhoto({ max: 1500, limit: 450000 });
        if (p) { d.cover = p; d.coverPos = { x: 50, y: 50 }; draw(); }
        return;
      }
      if (e.target.closest('#cv-off')) { grab(); d.cover = ''; draw(); return; }
      if (e.target.id === 'tr-dated') { grab(); dated = e.target.checked; if (!dated) { d.start = ''; d.end = ''; } draw(); return; }
      if (e.target.closest('#tr-save')) {
        grab();
        const name = d.name.trim();
        if (!name) { $('#tr-name').focus(); return toast('Give your trip a name.'); }
        if (d.start && d.end && d.end < d.start) return toast('The end date is before the start date.');
        if (d.start && !d.end) d.end = d.start;
        const out = { name, place: d.place.trim(), emoji: d.emoji, start: dated ? d.start : '', end: dated ? d.end : '',
          cover: d.cover || '', coverPos: d.cover ? { x: Math.round(d.coverPos.x), y: Math.round(d.coverPos.y) } : null };
        e.target.disabled = true;
        try {
          if (t) { await API.saveTrip(t.id, out); closeSheet(); toast('Saved'); }
          else { const tid = await API.createTrip(out); closeSheet(); location.hash = '#/t/' + tid; }
        } catch (err) { e.target.disabled = false; oops(err); }
      }
    }
    // Drag the photo inside its frame to choose which part shows.
    function framer() {
      const box = $('#cv-box');
      if (!box) return;
      const img = box.querySelector('img');
      let start = null;
      box.onpointerdown = e => {
        if (!img.naturalWidth) return;
        const k = Math.max(box.clientWidth / img.naturalWidth, box.clientHeight / img.naturalHeight);
        // how far the photo sticks out past the frame, in px
        start = { x: e.clientX, y: e.clientY, pos: { ...d.coverPos }, ox: img.naturalWidth * k - box.clientWidth, oy: img.naturalHeight * k - box.clientHeight };
        box.setPointerCapture(e.pointerId);
        box.classList.add('dragging');
      };
      box.onpointermove = e => {
        if (!start) return;
        const clamp = v => Math.max(0, Math.min(100, v));
        if (start.ox > 1) d.coverPos.x = clamp(start.pos.x - (e.clientX - start.x) / start.ox * 100);
        if (start.oy > 1) d.coverPos.y = clamp(start.pos.y - (e.clientY - start.y) / start.oy * 100);
        img.style.objectPosition = `${d.coverPos.x}% ${d.coverPos.y}%`;
      };
      box.onpointerup = box.onpointercancel = () => { start = null; box.classList.remove('dragging'); };
    }
    draw();
  }

  // ---------- one trip ----------
  function viewTrip(tid, sub) {
    const t = tripById(tid);
    if (t && sub === 'todo') return viewTodos(t);
    if (t && sub === 'costs') return viewCosts(t);
    if (!t) {
      view.innerHTML = `<a class="back" href="#/trips">${icon('back')} Trips</a><div class="empty"><h2>Trip not found</h2><p>You may have left it, or it was deleted.</p></div>`;
      return;
    }
    const all = S.ideas[tid] || [];
    const edit = canEdit(t);
    const counts = Object.fromEntries(CATS.map(c => [c.id, all.filter(i => (i.cat || 'other') === c.id).length]));
    const musts = all.filter(i => i.must).length;
    if (ui.cat !== 'all' && ui.cat !== 'must' && !counts[ui.cat]) ui.cat = 'all';
    const shown = all.filter(i => ui.cat === 'all' || (ui.cat === 'must' ? i.must : (i.cat || 'other') === ui.cat))
      .sort((a, b) => (b.must ? 1 : 0) - (a.must ? 1 : 0) || (b.createdAt || 0) - (a.createdAt || 0));
    const when = t.start ? dateRange(t.start, t.end) : '';
    const soon = untilText(t.start);
    const plans = hasPlan(t);
    let mode = modeOf('trip');
    if (mode === 'plan' && !plans) mode = 'ideas';
    // on the map, show just one day's stops if picked
    const dayIds = ui.day && plans ? new Set((S.plan[tid] || []).filter(p => p.day === ui.day && p.idea).map(p => p.idea)) : null;
    const onMap = dayIds ? shown.filter(i => dayIds.has(i.id)) : shown;

    view.innerHTML = `<div class="back-row"><a class="back" href="#/trips">${icon('back')} Trips</a><div class="row">${all.length || plans ? modeSwitch('trip', plans, mode) : ''}<button class="icon-btn" id="more" aria-label="Trip options">${icon('dots')}</button></div></div>
      <section class="hero ${t.cover ? 'has-cover' : ''}">
        ${t.cover ? `<div class="hero-cover">${coverImg(t, 'cover-img')}</div>` : `<div class="hero-emoji">${esc(t.emoji || '✈️')}</div>`}
        <div class="hero-main">
          <h1>${esc(t.name)}</h1>
          ${t.place ? `<div class="trip-place">${icon('pin')}${esc(t.place)}</div>` : ''}
          <div class="hero-when">${when ? esc(when) + (soon ? ` <span class="soon inline">${esc(soon)}</span>` : '') : 'No dates yet — just dreaming'}</div>
          <button class="hero-people" id="people">
            <span class="avs">${t.members.slice(0, 6).map(m => avatar(t, m)).join('')}</span>
            <span>${t.members.length === 1 ? 'Just you so far' : t.members.length + ' going'}</span>
            ${edit ? '' : '<span class="tag">View only</span>'}
          </button>
          <div class="hero-pills"><a class="pill" href="#/t/${esc(t.id)}/todo">✅ ${todoLabel(t)}</a><a class="pill" href="#/t/${esc(t.id)}/costs">💸 ${costLabel(t)}</a></div>
        </div>
      </section>
      ${t.look && (S.profile.keepMine || {})[t.id] ? `<p class="look-note">${icon('palette')} You’re seeing your own look here. <button class="linkbtn" id="use-look">Use the trip’s look</button></p>` : ''}
      ${mode === 'plan' ? planHtml(t) : all.length ? `${chipsHtml(all, counts, musts)}
      ${mode === 'map' ? mapSection(onMap, t, edit, plans ? dayPicker(t) : '') : `<div class="ideas">${shown.map(i => ideaCard(i, t)).join('')}</div>`}` : `<div class="empty">
        <div class="empty-emoji">🗺️</div>
        <h2>Start dreaming</h2>
        <p>${edit ? 'Add places to see, restaurants, stays — anything you might want to do.' : 'Nothing here yet. You can see this trip but not add to it.'}</p>
      </div>`}
      ${edit && mode !== 'plan' ? `<button class="fab" id="add">${icon('plus')}<span>Add idea</span></button>` : ''}`;

    view.querySelectorAll('[data-cat]').forEach(b => b.onclick = () => { ui.cat = b.dataset.cat; Maps.forget(); render(); });
    view.querySelectorAll('[data-idea]').forEach(b => b.onclick = () => ideaDetail(t, all.find(i => i.id === b.dataset.idea)));
    sortableChips();
    bindMode('trip');
    if (mode === 'map') bindMap(t.id + ':' + ui.cat + ':' + (ui.day || ''), onMap, t, t.place, i => ideaDetail(t, i));
    if (mode === 'plan') bindPlan(t);
    if ($('#map-day')) $('#map-day').onchange = e => { ui.day = e.target.value; Maps.forget(); render(); };
    if ($('#add')) $('#add').onclick = () => ideaSheet({ trip: t, item: { cat: ['all', 'must'].includes(ui.cat) ? '' : ui.cat, must: ui.cat === 'must' } });
    $('#people').onclick = () => peopleSheet(t);
    $('#more').onclick = () => tripMenu(t);
    if ($('#use-look')) $('#use-look').onclick = () => API.setKeepMine(t.id, false).catch(oops);
  }

  // Ideas · Map switch (remembered per screen)
  const modeOf = where => ls.get('tr-mode-' + where, 'ideas');
  const modeSwitch = (where, plan, cur) => {
    cur = cur || modeOf(where);
    const b = (id, label, ic) => `<button class="${cur === id ? 'on' : ''}" data-mode="${id}" role="tab">${icon(ic)} ${label}</button>`;
    return `<div class="seg mode ${plan ? 'three' : ''}" role="tablist">${b('ideas', 'Ideas', 'grid')}${b('map', 'Map', 'map')}${plan ? b('plan', 'Plan', 'calendar') : ''}</div>`;
  };
  function bindMode(where) {
    view.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { ls.set('tr-mode-' + where, b.dataset.mode); Maps.forget(); render(); });
  }
  // The map, plus the ideas that aren't on it yet.
  function mapSection(shown, trip, canChange, extra) {
    const off = shown.filter(i => !i.loc);
    return `<div class="map-slot" id="map-slot">${extra || ''}<p class="loading">Loading the map…</p></div>
      ${off.length ? `<div class="nomap">
        <div class="label">Not on the map yet</div>
        ${off.map(i => `<div class="nomap-row"><span>${catOf(i.cat).emoji}</span><b>${esc(i.name)}</b>
          ${canChange ? (i.address ? `<button class="btn soft small" data-find="${esc(i.id)}">Find</button>` : `<button class="btn ghost small" data-place="${esc(i.id)}">Add spot</button>`) : ''}</div>`).join('')}
      </div>` : ''}`;
  }
  function bindMap(key, shown, trip, place, open) {
    const slot = $('#map-slot');
    if (!slot) return;
    Maps.show(slot, { key, items: shown, trip, place, onOpen: id => open(shown.find(i => i.id === id)) })
      .then(() => { const l = slot.querySelector('.loading'); if (l) l.remove(); })
      .catch(e => { slot.innerHTML = `<p class="empty small">${esc(e.message)}</p>`; });
    view.querySelectorAll('[data-find]').forEach(b => b.onclick = async () => { b.disabled = true; if (!(await findOnMap(trip, shown.find(i => i.id === b.dataset.find)))) b.disabled = false; });
    view.querySelectorAll('[data-place]').forEach(b => b.onclick = () => ideaSheet({ trip, item: shown.find(i => i.id === b.dataset.place) }));
  }

  function ideaCard(i, t) {
    const c = catOf(i.cat);
    const days = t ? plannedDays(t, i.id) : [];
    return `<button class="idea" data-idea="${esc(i.id)}">
      ${i.photo ? `<img class="idea-photo" src="${esc(i.photo)}" alt="" loading="lazy">` : `<div class="idea-photo none">${c.emoji}</div>`}
      <div class="idea-body">
        <div class="idea-tags"><span class="tag">${c.emoji} ${esc(c.name)}</span>${i.must ? '<span class="tag must">💖 Must-do</span>' : ''}${days.length ? `<span class="tag planned">📅 Day${days.length > 1 ? 's' : ''} ${days.join(', ')}</span>` : ''}</div>
        <div class="idea-name">${esc(i.name)}</div>
        ${i.where ? `<div class="idea-where">${icon('pin')}${esc(i.where)}</div>` : ''}
        ${i.notes ? `<div class="idea-notes">${esc(i.notes)}</div>` : ''}
        ${t && i.by ? `<div class="idea-by">${avatar(t, i.by, 'tiny')} ${esc(nameIn(t, i.by))}</div>` : ''}
      </div>
    </button>`;
  }

  function ideaDetail(t, i) {
    if (!i) return;
    const c = catOf(i.cat);
    const edit = t ? canEdit(t) : true;
    const link = safeUrl(i.link);
    openSheet(`${i.photo ? `<img class="detail-photo" src="${esc(i.photo)}" alt="">` : ''}
      <div class="idea-tags"><span class="tag">${c.emoji} ${esc(c.name)}</span>${i.must ? '<span class="tag must">💖 Must-do</span>' : ''}</div>
      <h2 class="detail-name">${esc(i.name)}</h2>
      ${i.where ? `<div class="trip-place">${icon('pin')}${esc(i.where)}</div>` : ''}
      ${i.notes ? `<p class="detail-notes">${esc(i.notes)}</p>` : ''}
      <div class="detail-links">
        ${i.loc ? `<a class="openlink" href="${esc(`https://maps.apple.com/?ll=${i.loc.lat},${i.loc.lng}&q=${encodeURIComponent(i.name)}`)}" target="_blank" rel="noopener">${icon('pin')} ${esc(i.address || 'Open in Maps')}</a>`
          : i.address ? `<a class="openlink" href="${esc(mapsUrl(i.address, t))}" target="_blank" rel="noopener">${icon('pin')} ${esc(i.address)}</a>` : ''}
        ${!i.loc && i.address && edit ? `<button class="linkbtn small-link" id="d-find">📍 Put it on the map</button>` : ''}
        ${link ? `<a class="openlink" href="${esc(link)}" target="_blank" rel="noopener">${icon('link')} ${esc(link.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '').slice(0, 48))}</a>` : ''}
      </div>
      ${t && i.by ? `<p class="hint">Added by ${esc(nameIn(t, i.by))}</p>` : ''}
      <div class="sheet-foot">
        ${edit ? `<button class="btn soft" id="d-edit">${icon('edit')} Edit</button>` : ''}
        ${t ? `<button class="btn ghost" id="d-someday">${icon('cloud')} Save to Someday</button>` : `<button class="btn" id="d-move">${icon('suitcase')} Add to a trip</button>`}
        ${edit ? `<button class="btn danger" id="d-del">Delete</button>` : ''}
        <button class="btn quiet" data-act="close">Close</button>
      </div>`, async e => {
      if (e.target.closest('#d-edit')) ideaSheet({ trip: t, item: i });
      else if (e.target.closest('#d-find')) { e.target.disabled = true; if (await findOnMap(t, i)) closeSheet(); else e.target.disabled = false; }
      else if (e.target.closest('#d-someday')) {
        try { await API.copyToSomeday(i, t.place); closeSheet(); toast('Saved to Someday ☁️'); } catch (err) { oops(err); }
      } else if (e.target.closest('#d-move')) moveSheet(i);
      else if (e.target.closest('#d-del')) {
        if (!(await ask('Delete this idea?', `“${esc(i.name)}” will be gone${t ? ' for everyone on the trip' : ''}.`, 'Delete', { danger: true }))) return;
        try { t ? await API.deleteIdea(t.id, i.id) : await API.deleteSomeday(i.id); closeSheet(); } catch (err) { oops(err); }
      }
    });
  }

  // Add/edit an idea -- on a trip (trip set) or on Someday (trip null).
  function ideaSheet({ trip, item }) {
    const d = { cat: '', name: '', photo: '', link: '', address: '', notes: '', must: false, where: '', loc: null, pin: null, ...item };
    const isNew = !d.id;
    const edit = !trip || canEdit(trip);
    let showMap = !!d.loc, styling = false, pick = null, sugs = [], findT = null, near = null;
    // search close to the trip's other pins, or its "where"
    if (trip) {
      near = Maps.centerOf(S.ideas[trip.id] || []);
      if (!near && trip.place) Maps.placeCenter(trip.place).then(c => { near = c; });
    }
    const st = () => Maps.styleFor(d, trip);
    const draw = () => {
      if (pick) { pick.destroy(); pick = null; }
      openSheet(`<div class="sheet-head"><h2>${isNew ? 'New idea' : 'Edit idea'}</h2><button class="btn quiet" data-act="close">Cancel</button></div>
        <div class="cat-pick">${orderedCats().map(c => `<button type="button" class="${d.cat === c.id ? 'on' : ''}" data-c="${c.id}"><span>${c.emoji}</span>${c.name}</button>`).join('')}</div>
        <div class="photo-row">
          <button type="button" class="photo-btn" id="f-pic">${d.photo ? `<img src="${esc(d.photo)}" alt="">` : `<span>${icon('photo')}<small>Add photo</small></span>`}</button>
          <div class="photo-side">
            <input class="input" id="f-name" value="${esc(d.name)}" aria-label="Name" placeholder="${{ food: 'Restaurant or café', stay: 'Hotel, Airbnb…', sights: 'Place to see', do: 'Something to do', shop: 'Shop or market' }[d.cat] || 'Name — what is it?'}">
            <input class="input" id="f-link" type="url" inputmode="url" value="${esc(d.link)}" aria-label="Link" placeholder="Link (website, Instagram…)">
          </div>
        </div>
        ${d.photo ? '<button type="button" class="linkbtn small-link" id="f-nophoto">Remove photo</button>' : ''}
        ${trip ? '' : `<div class="field tight"><label for="f-where">Where</label><input class="input" id="f-where" value="${esc(d.where)}" placeholder="City or country"></div>`}
        <div class="field tight loc-field">
          <label for="f-addr">Location</label>
          <div class="loc-search">
            <input class="input" id="f-addr" value="${esc(d.address)}" autocomplete="off" placeholder="Search a place or address">
            <div class="sugs" id="f-sugs" hidden></div>
          </div>
          ${showMap ? `<div class="loc-map" id="f-map"></div><p class="hint small-hint">${d.loc ? 'Drag the pin to move it, or tap the map.' : 'Tap the map to drop the pin.'}</p>` : ''}
          <div class="loc-acts">
            <span class="pin-prev" id="pin-prev">${Maps.pinHtml(st(), { scale: 0.75 })}</span>
            <button type="button" class="linkbtn" id="f-style">${styling ? 'Done styling' : 'Pin style'}</button>
            ${showMap ? '' : '<button type="button" class="linkbtn" id="f-drop">Drop a pin on the map</button>'}
            <button type="button" class="linkbtn muted-link" id="f-unpin" ${d.loc ? '' : 'hidden'}>Remove pin</button>
          </div>
          ${styling ? '<div class="styler" id="styler"></div>' : ''}
        </div>
        <textarea class="input notes" id="f-notes" placeholder="Notes — hours, what to order, tips…">${esc(d.notes)}</textarea>
        <button type="button" class="must-toggle ${d.must ? 'on' : ''}" id="f-must">💖 Must-do</button>
        <div class="sheet-foot"><button class="btn wide" id="f-save">${isNew ? 'Add idea' : 'Save'}</button></div>`, onClick);
      sheet.oninput = onInput;
      if (styling) pinStyler($('#styler'), st(), next => { d.pin = next; restyle(); }, {
        reset: d.pin ? `Use the standard ${catOf(d.cat || 'other').name.toLowerCase()} pin` : '',
        onReset: () => { d.pin = null; draw(); },
      });
      if (showMap) {
        Maps.picker($('#f-map'), { loc: d.loc, near, style: st(), onPick: loc => { d.loc = loc; $('#f-unpin').hidden = false; } })
          .then(p => { pick = p; }, oops);
      }
    };
    function restyle() {
      const prev = $('#pin-prev');
      if (prev) prev.innerHTML = Maps.pinHtml(st(), { scale: 0.75 });
      if (pick) pick.restyle(st());
    }
    const grab = () => {
      d.name = $('#f-name').value; d.link = $('#f-link').value; d.address = $('#f-addr').value; d.notes = $('#f-notes').value;
      if ($('#f-where')) d.where = $('#f-where').value;
    };
    function onInput(e) {
      if (e.target.id !== 'f-addr') return;
      clearTimeout(findT);
      const q = e.target.value;
      const box = $('#f-sugs');
      if (q.trim().length < 3) { box.hidden = true; return; }
      findT = setTimeout(async () => {
        try { sugs = await Maps.search(q, near); } catch (err) { sugs = []; }
        if (!$('#f-sugs') || $('#f-addr').value !== q) return;
        box.innerHTML = sugs.length ? sugs.map((x, n) => `<button type="button" data-sug="${n}"><b>${esc(x.title)}</b>${x.sub ? `<small>${esc(x.sub)}</small>` : ''}</button>`).join('')
          : '<p class="hint">No places found — you can tap the map instead.</p>';
        box.hidden = false;
      }, 420);
    }
    async function onClick(e) {
      if (e.target.closest('#styler')) return;
      const sg = e.target.closest('[data-sug]');
      if (sg) {
        grab();
        const x = sugs[+sg.dataset.sug];
        d.address = x.full; d.loc = { lat: x.lat, lng: x.lng }; showMap = true;
        if (!d.name.trim()) d.name = x.title;
        draw();
        return;
      }
      const c = e.target.closest('[data-c]');
      if (c) { grab(); d.cat = c.dataset.c; draw(); return; }
      if (e.target.closest('#f-must')) { grab(); d.must = !d.must; draw(); return; }
      if (e.target.closest('#f-nophoto')) { grab(); d.photo = ''; draw(); return; }
      if (e.target.closest('#f-pic')) { grab(); const p = await pickPhoto(); if (p) { d.photo = p; draw(); } return; }
      if (e.target.closest('#f-style')) { grab(); styling = !styling; draw(); return; }
      if (e.target.closest('#f-drop')) { grab(); showMap = true; draw(); return; }
      if (e.target.closest('#f-unpin')) { grab(); d.loc = null; showMap = false; draw(); return; }
      if (e.target.closest('#f-save')) {
        grab();
        if (!d.name.trim()) { $('#f-name').focus(); return toast('Give it a name.'); }
        let link = d.link.trim();
        if (link && !/^https?:\/\//i.test(link)) link = 'https://' + link;
        const out = {
          cat: d.cat || 'other', name: d.name.trim(), photo: d.photo || '', link, address: d.address.trim(), notes: d.notes.trim(), must: !!d.must,
          loc: d.loc ? { lat: +d.loc.lat.toFixed(6), lng: +d.loc.lng.toFixed(6) } : null, pin: d.pin || null,
        };
        if (!trip) out.where = d.where.trim();
        if (d.id) out.id = d.id;
        e.target.disabled = true;
        try {
          trip ? await API.saveIdea(trip.id, out) : await API.saveSomeday(out);
          closeSheet();
          toast(isNew ? 'Added ✨' : 'Saved');
        } catch (err) { e.target.disabled = false; oops(err); }
      }
    }
    draw();
    if (isNew) setTimeout(() => { const n = $('#f-name'); if (n) n.focus(); }, 250);
  }

  // Pin color / shape / emoji picker. Draws into el; onChange(style) on each change.
  // opts: { reset: label for "back to standard", onReset }
  function pinStyler(el, style, onChange, opts = {}) {
    let cur = { ...style };
    const draw = () => {
      el.innerHTML = `<div class="sty-label">Color</div>
        <div class="sty-colors">${Maps.COLORS.map(c => `<button type="button" class="sw-dot ${cur.color.toUpperCase() === c ? 'on' : ''}" data-col="${c}" style="background:${c}" aria-label="Color ${c}"></button>`).join('')}
          <label class="sw-dot custom" aria-label="Any color"><input type="color" data-colin value="${esc(cur.color.toLowerCase())}"></label></div>
        <div class="sty-label">Shape</div>
        <div class="sty-shapes">${Maps.SHAPES.map(sh => `<button type="button" class="${cur.shape === sh ? 'on' : ''}" data-shape="${sh}" aria-label="${sh}">${Maps.pinHtml({ ...cur, shape: sh }, { scale: 0.7 })}</button>`).join('')}</div>
        <div class="sty-label">Emoji</div>
        <div class="sty-emoji">${Maps.EMOJI.map(x => `<button type="button" class="${cur.emoji === x ? 'on' : ''}" data-emo="${x}">${x}</button>`).join('')}</div>
        <input class="input sty-own" data-emoin placeholder="Or type any emoji" autocomplete="off">
        ${opts.reset ? `<button type="button" class="linkbtn small-link" data-reset>${esc(opts.reset)}</button>` : ''}`;
    };
    el.onclick = e => {
      e.stopPropagation();
      const b = e.target.closest('[data-col],[data-shape],[data-emo],[data-reset]');
      if (!b) return;
      if (b.dataset.reset !== undefined) { opts.onReset && opts.onReset(); return; }
      if (b.dataset.col) cur.color = b.dataset.col;
      if (b.dataset.shape) cur.shape = b.dataset.shape;
      if (b.dataset.emo) cur.emoji = b.dataset.emo;
      draw(); onChange({ ...cur });
    };
    el.oninput = e => {
      e.stopPropagation();
      if (e.target.dataset.colin !== undefined) { cur.color = e.target.value.toUpperCase(); onChange({ ...cur }); }
      if (e.target.dataset.emoin !== undefined) {
        const v = e.target.value.trim();
        if (!v) return;
        const seg = window.Intl && Intl.Segmenter ? [...new Intl.Segmenter().segment(v)].map(x => x.segment) : [...v];
        cur.emoji = seg[seg.length - 1];
        onChange({ ...cur });
      }
    };
    el.onchange = e => { if (e.target.dataset.colin !== undefined) draw(); };
    draw();
  }

  // Category pin defaults for a trip (editors).
  function pinDefaultsSheet(t) {
    let open = null, saveT = null;
    const draw = () => {
      t = tripById(t.id);
      if (!t) return closeSheet();
      openSheet(`<div class="sheet-head"><h2>Map pins</h2><button class="btn quiet" data-act="close">Done</button></div>
        <p class="hint" style="margin-top:-6px">The pin each kind of idea gets on this trip’s map. Everyone on the trip sees these. You can still style any single pin when editing an idea.</p>
        <div class="menu tight">${orderedCats().map(c => `<button data-pc="${c.id}" class="${open === c.id ? 'open' : ''}">
            <span class="menu-pin">${Maps.pinHtml(Maps.styleFor({ cat: c.id }, t), { scale: 0.7 })}</span>${c.name}
            ${t.pins && t.pins[c.id] ? '<span class="menu-sub">Custom</span>' : ''}</button>
          ${open === c.id ? '<div class="styler in-menu" id="styler"></div>' : ''}`).join('')}</div>`, e => {
        const b = e.target.closest('[data-pc]');
        if (b) { open = open === b.dataset.pc ? null : b.dataset.pc; draw(); }
      });
      if (open) {
        const cat = open;
        pinStyler($('#styler'), Maps.styleFor({ cat }, t), next => {
          const btn = sheet.querySelector(`[data-pc="${cat}"] .menu-pin`);
          if (btn) btn.innerHTML = Maps.pinHtml(next, { scale: 0.7 });
          clearTimeout(saveT);
          saveT = setTimeout(() => API.saveTrip(t.id, { pins: { ...(t.pins || {}), [cat]: next } }).catch(oops), 500);
        }, {
          reset: t.pins && t.pins[cat] ? 'Back to the standard pin' : '',
          onReset: async () => {
            const pins = { ...(t.pins || {}) };
            delete pins[cat];
            try { await API.saveTrip(t.id, { pins }); setTimeout(draw, 80); } catch (err) { oops(err); }
          },
        });
      }
    };
    draw();
  }

  // Look up an idea's address and put it on the map.
  async function findOnMap(trip, i) {
    const near = trip ? Maps.centerOf(S.ideas[trip.id] || []) || await Maps.placeCenter(trip.place) : null;
    let hits = [];
    try { hits = await Maps.search(i.address || i.name, near); } catch (e) {}
    if (!hits.length && (trip && trip.place || i.where)) {
      try { hits = await Maps.search(`${i.address || i.name}, ${trip ? trip.place : i.where}`); } catch (e) {}
    }
    if (!hits.length) { toast('Couldn’t find that spot — edit the idea to place it on the map.', 3200); return false; }
    const loc = { lat: +hits[0].lat.toFixed(6), lng: +hits[0].lng.toFixed(6) };
    try {
      trip ? await API.saveIdea(trip.id, { id: i.id, loc }) : await API.saveSomeday({ id: i.id, loc });
      toast('On the map 📍');
      return true;
    } catch (e) { oops(e); return false; }
  }

  // ---------- the plan (day by day) ----------
  const PLAN_STYLES = {
    loose: { name: 'Loose', desc: 'Just a list for each day, in whatever order you drag.' },
    slots: { name: 'Time of day', desc: 'Morning, afternoon and evening for each day.' },
    times: { name: 'Times', desc: 'Give stops a time — each day sorts itself. No time is fine too.' },
    none: { name: 'None', desc: 'No plan — this trip is just for collecting ideas.' },
  };
  const SLOTS = [['morning', '☀️ Morning'], ['afternoon', '🌤️ Afternoon'], ['evening', '🌙 Evening']];
  const STOP_EMOJI = ['✈️', '🚆', '🚗', '⛴️', '🏨', '🧳', '🛌', '🍽️', '☕', '🍸', '📸', '🎉', '🛍️', '🏖️', '💆‍♀️', '📝'];
  const hasPlan = t => !!(t && t.start && (t.planStyle || 'loose') !== 'none');
  function tripDays(t) {
    if (!t.start) return [];
    const [y, m, d] = t.start.split('-').map(Number);
    const end = t.end || t.start;
    const out = [];
    for (let i = 0; i < 120; i++) {
      const x = new Date(Date.UTC(y, m - 1, d + i)).toISOString().slice(0, 10);
      out.push(x);
      if (x >= end) break;
    }
    return out;
  }
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  function dayLabel(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return `${DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}, ${MON[m - 1]} ${d}`;
  }
  // Which day numbers an idea is planned on ("2, 4")
  function plannedDays(t, ideaId) {
    if (!hasPlan(t)) return [];
    const days = tripDays(t);
    return [...new Set((S.plan[t.id] || []).filter(p => p.idea === ideaId).map(p => days.indexOf(p.day) + 1).filter(n => n > 0))].sort((a, b) => a - b);
  }
  function timeLabel(hm) {
    if (!hm) return '';
    let [h, m] = hm.split(':').map(Number);
    const ap = h >= 12 ? 'pm' : 'am';
    h = h % 12 || 12;
    return `${h}${m ? ':' + String(m).padStart(2, '0') : ''} ${ap}`;
  }
  const stopIdea = (t, p) => (p.idea ? (S.ideas[t.id] || []).find(i => i.id === p.idea) : null);
  function sortStops(list, style) {
    return list.slice().sort((a, b) => (style === 'times' ? ((a.time || '99') < (b.time || '99') ? -1 : (a.time || '99') > (b.time || '99') ? 1 : 0) : 0) || (a.order || 0) - (b.order || 0) || (a.createdAt || 0) - (b.createdAt || 0));
  }
  function stopHtml(t, p, style) {
    const i = stopIdea(t, p);
    if (p.idea && !i) return '';
    const c = i ? catOf(i.cat) : null;
    const name = i ? i.name : p.text;
    const sub = p.note || (i && i.address) || '';
    return `<div class="stop" data-stop="${esc(p.id)}">
      ${style === 'times' ? `<span class="stop-time ${p.time ? '' : 'none'}">${p.time ? esc(timeLabel(p.time)) : '—'}</span>` : ''}
      ${i && i.photo ? `<img class="stop-thumb" src="${esc(i.photo)}" alt="" draggable="false">` : `<span class="stop-thumb emoji">${esc(i ? c.emoji : p.emoji || '📝')}</span>`}
      <span class="stop-main"><b>${esc(name)}${i && i.must ? ' 💖' : ''}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span>
    </div>`;
  }
  function planHtml(t) {
    const style = t.planStyle || 'loose';
    const days = tripDays(t);
    const items = S.plan[t.id] || [];
    const edit = canEdit(t);
    const list = (day, slot, stops, empty) => `<div class="plan-list" data-day="${day}" data-slot="${slot}">
        ${sortStops(stops, style).map(p => stopHtml(t, p, style)).join('')}
        ${empty ? `<p class="plan-empty">${edit ? 'Nothing yet' : 'Nothing planned'}</p>` : ''}
      </div>`;
    const addBtn = (day, slot, label) => (edit ? `<button class="add-stop" data-add-day="${day}" data-add-slot="${slot}" aria-label="Add to ${esc(label || 'this day')}">${icon('plus')}${label ? '' : ' Add'}</button>` : '');
    const dayCard = (day, n) => {
      const mine = items.filter(p => p.day === day);
      let body;
      if (style === 'slots') {
        // one line per part of the day, with its own small +
        const loose = mine.filter(p => !SLOTS.some(([k]) => k === p.slot));
        body = (loose.length ? `<div class="slot-head"><span>Anytime</span>${addBtn(day, '', 'Anytime')}</div>${list(day, '', loose)}` : '')
          + SLOTS.map(([k, label]) => `<div class="slot-head"><span>${label}</span>${addBtn(day, k, label)}</div>${list(day, k, mine.filter(p => p.slot === k))}`).join('');
      } else body = list(day, '*', mine, true) + addBtn(day, '', '');
      return `<section class="day" id="day-${day}">
        <div class="day-head"><b>Day ${n + 1}</b><span>${esc(dayLabel(day))}</span>${mine.length ? `<small>${mine.length} stop${mine.length === 1 ? '' : 's'}</small>` : ''}</div>
        ${body}
      </section>`;
    };
    const off = items.filter(p => !days.includes(p.day));
    return `<div class="plan" id="plan">
      ${days.map(dayCard).join('')}
      ${off.length ? `<section class="day off"><div class="day-head"><b>Not on a day anymore</b><small>The trip’s dates changed — tap one to move it</small></div>
        <div class="plan-list" data-day="" data-slot="*">${off.map(p => stopHtml(t, p, style)).join('')}</div></section>` : ''}
      ${edit && days.length > 1 ? '<p class="hint center plan-hint">Press and hold a stop to drag it to another spot or day.</p>' : ''}
    </div>`;
  }
  function bindPlan(t) {
    const box = $('#plan');
    if (!box) return;
    const style = t.planStyle || 'loose';
    box.querySelectorAll('[data-add-day]').forEach(b => b.onclick = () => addStopSheet(t, b.dataset.addDay, b.dataset.addSlot));
    box.addEventListener('click', e => {
      const st = e.target.closest('[data-stop]');
      if (st) stopSheet(t, (S.plan[t.id] || []).find(p => p.id === st.dataset.stop));
    });
    if (!canEdit(t)) return;
    sortable(box, '.stop', { key: el => el.dataset.stop, lists: '.plan-list[data-day]:not([data-day=""])', onDrop: () => {
      const cur = Object.fromEntries((S.plan[t.id] || []).map(p => [p.id, p]));
      const moves = [];
      box.querySelectorAll('.plan-list').forEach(listEl => {
        const day = listEl.dataset.day, slot = listEl.dataset.slot;
        if (!day) return;
        [...listEl.querySelectorAll('.stop')].forEach((el, order) => {
          const p = cur[el.dataset.stop];
          if (!p) return;
          const m = { id: p.id, day, order };
          if (slot !== '*') m.slot = slot;
          if (p.day !== m.day || (p.order || 0) !== order || (m.slot !== undefined && (p.slot || '') !== m.slot)) {
            moves.push(m);
            Object.assign(p, m); // show it right away
          }
        });
      });
      if (moves.length) API.movePlan(t.id, moves).catch(oops);
      if (style === 'times') setTimeout(render, 60);
    } });
  }

  // Add stops to a day: tick ideas, or write your own.
  function addStopSheet(t, day, slot) {
    const style = t.planStyle || 'loose';
    const days = tripDays(t);
    let tab = 'ideas', picked = new Set(), own = { emoji: '✈️', text: '', note: '', time: '' }, time = '';
    const ideas = orderedCats().flatMap(c => (S.ideas[t.id] || []).filter(i => (i.cat || 'other') === c.id).sort((a, b) => (b.must ? 1 : 0) - (a.must ? 1 : 0) || a.name.localeCompare(b.name)));
    const where = `Day ${days.indexOf(day) + 1} · ${dayLabel(day)}${slot ? ' · ' + SLOTS.find(([k]) => k === slot)[1] : ''}`;
    const draw = () => {
      openSheet(`<div class="sheet-head"><div><h2>Add to the plan</h2><p class="hint" style="margin:2px 0 0">${esc(where)}</p></div><button class="btn quiet" data-act="close">Cancel</button></div>
        <div class="seg wide"><button class="${tab === 'ideas' ? 'on' : ''}" data-tab="ideas">From ideas</button><button class="${tab === 'own' ? 'on' : ''}" data-tab="own">Write your own</button></div>
        ${tab === 'ideas' ? (ideas.length ? `<div class="pick-list">${ideas.map(i => {
            const on = plannedDays(t, i.id);
            return `<label class="pick ${picked.has(i.id) ? 'on' : ''}"><input type="checkbox" data-pick="${esc(i.id)}" ${picked.has(i.id) ? 'checked' : ''}>
              ${i.photo ? `<img src="${esc(i.photo)}" alt="">` : `<span class="pick-emoji">${catOf(i.cat).emoji}</span>`}
              <span class="pick-main"><b>${esc(i.name)}${i.must ? ' 💖' : ''}</b>${on.length ? `<small>Already on day${on.length > 1 ? 's' : ''} ${on.join(', ')}</small>` : ''}</span>
              <span class="pick-box">${icon('check')}</span></label>`;
          }).join('')}</div>` : '<p class="empty small">No ideas on this trip yet — write your own instead.</p>')
        : `<div class="emoji-pick">${STOP_EMOJI.map(x => `<button type="button" class="${own.emoji === x ? 'on' : ''}" data-semo="${x}">${x}</button>`).join('')}</div>
          <div class="field"><input class="input" id="s-text" value="${esc(own.text)}" placeholder="Flight lands, check in, rest day…" aria-label="What"></div>
          <div class="field"><input class="input" id="s-note" value="${esc(own.note)}" placeholder="Note (optional) — flight number, confirmation…" aria-label="Note"></div>`}
        ${style === 'times' ? `<div class="field tight"><label for="s-time">Time (optional)</label><input class="input" type="time" id="s-time" value="${esc(tab === 'own' ? own.time : time)}"></div>` : ''}
        <div class="sheet-foot"><button class="btn wide" id="s-add">${tab === 'ideas' ? (picked.size ? `Add ${picked.size} to the plan` : 'Pick ideas to add') : 'Add to the plan'}</button></div>`, onClick);
      sheet.onchange = e => {
        const id = e.target.dataset.pick;
        if (id === undefined) return;
        if (e.target.checked) picked.add(id); else picked.delete(id);
        // update in place so the list doesn't jump back to the top
        e.target.closest('.pick').classList.toggle('on', e.target.checked);
        $('#s-add').textContent = picked.size ? `Add ${picked.size} to the plan` : 'Pick ideas to add';
      };
    };
    const grab = () => {
      if ($('#s-time')) { if (tab === 'own') own.time = $('#s-time').value; else time = $('#s-time').value; }
      if ($('#s-text')) { own.text = $('#s-text').value; own.note = $('#s-note').value; }
    };
    async function onClick(e) {
      const tb = e.target.closest('[data-tab]');
      if (tb) { grab(); tab = tb.dataset.tab; draw(); return; }
      const em = e.target.closest('[data-semo]');
      if (em) { grab(); own.emoji = em.dataset.semo; draw(); return; }
      if (!e.target.closest('#s-add')) return;
      grab();
      const same = (S.plan[t.id] || []).filter(p => p.day === day && (style !== 'slots' || (p.slot || '') === slot));
      let order = same.reduce((a, p) => Math.max(a, (p.order || 0) + 1), 0);
      const base = { day, slot: slot || '', time: '' };
      let add;
      if (tab === 'ideas') {
        if (!picked.size) return toast('Tick the ideas you want on this day.');
        add = ideas.filter(i => picked.has(i.id)).map(i => ({ ...base, idea: i.id, time: time || '', order: order++ }));
      } else {
        if (!own.text.trim()) { $('#s-text').focus(); return toast('Write what it is.'); }
        add = [{ ...base, text: own.text.trim(), emoji: own.emoji, note: own.note.trim(), time: own.time || '', order }];
      }
      e.target.disabled = true;
      try { await API.addPlan(t.id, add); closeSheet(); toast('Added to the plan ✨'); } catch (err) { e.target.disabled = false; oops(err); }
    }
    draw();
  }

  // One stop: move it, give it a time, add a note, or take it off the plan.
  function stopSheet(t, p) {
    if (!p) return;
    const style = t.planStyle || 'loose';
    const edit = canEdit(t);
    const days = tripDays(t);
    const i = stopIdea(t, p);
    const d = { day: p.day, slot: p.slot || '', time: p.time || '', note: p.note || '', text: p.text || '', emoji: p.emoji || '📝' };
    const draw = () => {
      openSheet(`<div class="sheet-head"><h2>${esc(i ? i.name : d.text || 'Stop')}</h2><button class="btn quiet" data-act="close">${edit ? 'Cancel' : 'Close'}</button></div>
        ${i ? `<button class="stop-open" id="st-open">${i.photo ? `<img src="${esc(i.photo)}" alt="">` : `<span class="pick-emoji">${catOf(i.cat).emoji}</span>`}<span><b>${esc(i.name)}</b><small>Open the idea ›</small></span></button>` : ''}
        ${edit ? `${!i ? `<div class="emoji-pick">${STOP_EMOJI.map(x => `<button type="button" class="${d.emoji === x ? 'on' : ''}" data-semo="${x}">${x}</button>`).join('')}</div>
            <div class="field"><label for="st-text">What</label><input class="input" id="st-text" value="${esc(d.text)}"></div>` : ''}
          <div class="field tight"><label for="st-day">Day</label><select class="input" id="st-day">${days.map((x, n) => `<option value="${x}" ${x === d.day ? 'selected' : ''}>Day ${n + 1} · ${esc(dayLabel(x))}</option>`).join('')}${days.includes(d.day) ? '' : '<option value="" selected>Pick a day</option>'}</select></div>
          ${style === 'slots' ? `<div class="field"><div class="label">Time of day</div><div class="seg wide">${[['', 'Anytime'], ...SLOTS].map(([k, l]) => `<button class="${d.slot === k ? 'on' : ''}" data-slot="${k}">${l}</button>`).join('')}</div></div>` : ''}
          ${style === 'times' ? `<div class="field"><label for="st-time">Time</label><div class="row"><input class="input" type="time" id="st-time" value="${esc(d.time)}">${d.time ? '<button class="btn quiet small" id="st-notime">No time</button>' : ''}</div></div>` : ''}
          <div class="field"><label for="st-note">Note</label><input class="input" id="st-note" value="${esc(d.note)}" placeholder="Reservation, confirmation number…"></div>
          <div class="sheet-foot"><button class="btn wide" id="st-save">Save</button><button class="btn danger" id="st-del">Take off the plan</button></div>`
        : `<p class="hint">Day ${days.indexOf(p.day) + 1} · ${esc(dayLabel(p.day))}${p.time ? ' · ' + esc(timeLabel(p.time)) : ''}${p.slot && style === 'slots' ? ' · ' + esc(SLOTS.find(([k]) => k === p.slot)[1]) : ''}</p>${p.note ? `<p class="detail-notes">${esc(p.note)}</p>` : ''}`}`, onClick);
    };
    const grab = () => {
      if (!edit) return;
      d.day = $('#st-day').value; d.note = $('#st-note').value;
      if ($('#st-time')) d.time = $('#st-time').value;
      if ($('#st-text')) d.text = $('#st-text').value;
    };
    async function onClick(e) {
      if (e.target.closest('#st-open')) { ideaDetail(t, i); return; }
      const sl = e.target.closest('[data-slot]');
      if (sl) { grab(); d.slot = sl.dataset.slot; draw(); return; }
      const em = e.target.closest('[data-semo]');
      if (em) { grab(); d.emoji = em.dataset.semo; draw(); return; }
      if (e.target.closest('#st-notime')) { grab(); d.time = ''; draw(); return; }
      if (e.target.closest('#st-del')) {
        try { await API.deletePlan(t.id, p.id); closeSheet(); toast('Taken off the plan'); } catch (err) { oops(err); }
        return;
      }
      if (e.target.closest('#st-save')) {
        grab();
        if (!d.day) return toast('Pick a day.');
        if (!i && !d.text.trim()) return toast('Write what it is.');
        const out = { id: p.id, day: d.day, time: d.time || '', note: d.note.trim() };
        if (style === 'slots') out.slot = d.slot;
        if (!i) { out.text = d.text.trim(); out.emoji = d.emoji; }
        // a new day: go to the end of that day's list
        if (d.day !== p.day) out.order = (S.plan[t.id] || []).filter(x => x.day === d.day).reduce((a, x) => Math.max(a, (x.order || 0) + 1), 0);
        e.target.disabled = true;
        try { await API.savePlan(t.id, out); closeSheet(); toast('Saved'); } catch (err) { e.target.disabled = false; oops(err); }
      }
    }
    draw();
  }

  function planStyleSheet(t) {
    const draw = () => {
      t = tripById(t.id);
      const cur = t.planStyle || 'loose';
      openSheet(`<div class="sheet-head"><h2>Plan style</h2><button class="btn quiet" data-act="close">Done</button></div>
        <p class="hint" style="margin-top:-6px">How this trip’s day-by-day plan works. You can switch anytime — nothing you’ve planned is lost.</p>
        <div class="menu tight">${Object.entries(PLAN_STYLES).map(([k, v]) => `<button data-ps="${k}" class="${cur === k ? 'open' : ''}">${cur === k ? icon('check') : '<span class="icon"></span>'} ${esc(v.name)}<span class="menu-sub">${esc(v.desc)}</span></button>`).join('')}</div>`, async e => {
        const b = e.target.closest('[data-ps]');
        if (!b) return;
        try { await API.saveTrip(t.id, { planStyle: b.dataset.ps }); setTimeout(draw, 80); } catch (err) { oops(err); }
      });
    };
    draw();
  }

  // the "which day" picker that floats on the trip map
  function dayPicker(t) {
    const days = tripDays(t);
    const used = new Set((S.plan[t.id] || []).filter(p => p.idea).map(p => p.day));
    if (!used.size) return '';
    return `<label class="map-day">${icon('calendar')}<select id="map-day" aria-label="Show a day">
      <option value="">All days</option>${days.filter(d => used.has(d)).map(d => `<option value="${d}" ${ui.day === d ? 'selected' : ''}>Day ${days.indexOf(d) + 1} · ${esc(dayLabel(d))}</option>`).join('')}</select></label>`;
  }

  // ---------- to-dos ----------
  const STARTER = [
    { title: 'Passport valid 6+ months after the trip', before: 90 },
    { title: 'Check if you need a visa', before: 90 },
    { title: 'International driver’s permit (if you’ll drive)', before: 30 },
    { title: 'Phone plan or eSIM for abroad', before: 7 },
    { title: 'Outlet adapter', before: 7 },
    { title: 'Tell your bank + cards you’re traveling', before: 7 },
    { title: 'Photo of your passport saved on your phone', before: 3 },
  ];
  const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  function addDays(iso, n) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
  }
  // the real due date: a set date, or "N days before the trip" once it has dates
  const dueOf = (t, x) => x.due || (x.before != null && t.start ? addDays(t.start, -x.before) : '');
  const todoFor = (t, x) => (x.for && x.for !== 'all' ? (t.members.includes(x.for) ? [x.for] : []) : t.members);
  const doneBy = (t, x) => todoFor(t, x).filter(u => x.done && x.done[u]);
  const allDone = (t, x) => { const w = todoFor(t, x); return w.length > 0 && doneBy(t, x).length === w.length; };
  const myOpenTodos = t => (S.todos[t.id] || []).filter(x => todoFor(t, x).includes(S.me) && !(x.done && x.done[S.me]));
  function todoLabel(t) {
    const n = myOpenTodos(t).length;
    return n ? `${n} to-do${n === 1 ? '' : 's'}` : 'To-dos';
  }
  function beforeText(days) {
    if (days == null) return '';
    if (days % 30 === 0 && days >= 30) return `${days / 30} month${days === 30 ? '' : 's'} before`;
    if (days % 7 === 0 && days >= 7) return `${days / 7} week${days === 7 ? '' : 's'} before`;
    return `${days} day${days === 1 ? '' : 's'} before`;
  }
  function dueChip(t, x) {
    const due = dueOf(t, x);
    if (!due) return x.before != null ? `<span class="due">${esc(beforeText(x.before))} the trip</span>` : '';
    const today = todayIso();
    const [y, m, d] = due.split('-').map(Number);
    const days = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(...today.split('-').map((v, i) => (i === 1 ? v - 1 : +v)))) / 86400000);
    const when = `${MON[m - 1]} ${d}${y !== new Date().getFullYear() ? ', ' + y : ''}`;
    if (allDone(t, x)) return `<span class="due">${esc(when)}</span>`;
    if (days < 0) return `<span class="due late">Overdue · ${esc(when)}</span>`;
    if (days === 0) return `<span class="due soon">Due today</span>`;
    if (days <= 14) return `<span class="due soon">In ${days} day${days === 1 ? '' : 's'} · ${esc(when)}</span>`;
    return `<span class="due">Due ${esc(when)}</span>`;
  }
  function sortTodos(t, list) {
    return list.slice().sort((a, b) => {
      const A = dueOf(t, a) || '9999', B = dueOf(t, b) || '9999';
      return A < B ? -1 : A > B ? 1 : (a.createdAt || 0) - (b.createdAt || 0);
    });
  }

  function viewTodos(t) {
    const edit = canEdit(t);
    const all = S.todos[t.id] || [];
    const mine = ui.todoMine;
    const visible = mine ? all.filter(x => todoFor(t, x).includes(S.me)) : all;
    const open = sortTodos(t, visible.filter(x => mine ? !(x.done && x.done[S.me]) : !allDone(t, x)));
    const done = sortTodos(t, visible.filter(x => !open.includes(x)));
    const row = x => {
      const who = todoFor(t, x);
      const forMe = who.includes(S.me);
      const meDone = !!(x.done && x.done[S.me]);
      const got = doneBy(t, x);
      return `<div class="todo ${allDone(t, x) || (mine && meDone) ? 'is-done' : ''}" data-todo="${esc(x.id)}">
        ${forMe ? `<button class="todo-check ${meDone ? 'on' : ''}" data-check="${esc(x.id)}" aria-label="${meDone ? 'Mark not done' : 'Mark done'}">${icon('check')}</button>` : '<span class="todo-check off" aria-hidden="true"></span>'}
        <div class="todo-main">
          <b>${esc(x.title)}</b>
          <div class="todo-meta">
            ${x.for && x.for !== 'all' ? `<span class="todo-for">${avatar(t, x.for, 'tiny')} ${x.for === S.me ? 'Just you' : esc(nameIn(t, x.for))}</span>`
              : `<span class="todo-for">${who.length > 1 ? `${got.length} of ${who.length} done` : 'Everyone'}${got.length ? ` <span class="avs mini">${got.slice(0, 5).map(u => avatar(t, u, 'tiny')).join('')}</span>` : ''}</span>`}
            ${dueChip(t, x)}
          </div>
          ${x.notes ? `<small class="todo-notes">${esc(x.notes)}</small>` : ''}
        </div>
      </div>`;
    };
    view.innerHTML = `<div class="back-row"><a class="back" href="#/t/${esc(t.id)}">${icon('back')} ${esc(t.name)}</a>
        ${edit ? `<button class="plus-btn small" id="todo-add" aria-label="Add a to-do">${icon('plus')}</button>` : ''}</div>
      <div class="page-head tight-head"><div><h1>To-dos ✅</h1><p class="sub">Things to get done before you go.</p></div></div>
      ${all.length ? `<div class="seg mode todo-filter"><button class="${!mine ? 'on' : ''}" data-tf="all">Everything</button><button class="${mine ? 'on' : ''}" data-tf="mine">Just mine</button></div>
        <div class="todos">${open.map(row).join('') || `<p class="empty small">${mine ? 'You’re all caught up ✨' : 'Everything’s done ✨'}</p>`}</div>
        ${done.length ? `<details class="done-box" ${ui.showDone ? 'open' : ''}><summary>Done (${done.length})</summary><div class="todos">${done.map(row).join('')}</div></details>` : ''}`
      : `<div class="empty"><div class="empty-emoji">✅</div><h2>Nothing to do yet</h2>
          <p>Add things like booking tours or getting a visa — for everyone, or for one person.</p></div>`}
      ${edit ? `<button class="btn ghost wide starter-btn" id="starter">${icon('sparkle')} Add the international starter list</button>` : ''}`;
    view.querySelectorAll('[data-tf]').forEach(b => b.onclick = () => { ui.todoMine = b.dataset.tf === 'mine'; render(); });
    const box = view.querySelector('.done-box');
    if (box) box.ontoggle = () => { ui.showDone = box.open; };
    view.onclick = async e => {
      const c = e.target.closest('[data-check]');
      if (c) {
        e.stopPropagation();
        const x = all.find(y => y.id === c.dataset.check);
        const on = !(x.done && x.done[S.me]);
        c.classList.toggle('on', on);
        try { await API.checkTodo(t.id, x.id, on); if (on) toast('Done ✨'); } catch (err) { oops(err); }
        return;
      }
      const r = e.target.closest('[data-todo]');
      if (r) todoSheet(t, all.find(y => y.id === r.dataset.todo));
    };
    if ($('#todo-add')) $('#todo-add').onclick = () => todoSheet(t, null);
    if ($('#starter')) $('#starter').onclick = () => starterSheet(t);
  }

  function todoSheet(t, x) {
    const edit = canEdit(t);
    const isNew = !x;
    const d = { title: '', notes: '', for: 'all', due: '', before: null, ...(x || {}) };
    let when = d.due ? 'date' : d.before != null ? 'before' : 'none';
    let n = d.before != null ? d.before : 14, unit = 'days';
    if (d.before && d.before % 30 === 0) { n = d.before / 30; unit = 'months'; } else if (d.before && d.before % 7 === 0) { n = d.before / 7; unit = 'weeks'; }
    if (!edit) {
      openSheet(`<div class="sheet-head"><h2>${esc(d.title)}</h2><button class="btn quiet" data-act="close">Close</button></div>
        <div class="todo-meta">${dueChip(t, d)}</div>${d.notes ? `<p class="detail-notes">${esc(d.notes)}</p>` : ''}
        <p class="hint">${d.for === 'all' ? 'For everyone on the trip' : 'For ' + esc(nameIn(t, d.for))}</p>`);
      return;
    }
    const people = t.members.slice().sort((a, b) => (a === S.me ? -1 : b === S.me ? 1 : nameIn(t, a).localeCompare(nameIn(t, b))));
    const draw = () => {
      openSheet(`<div class="sheet-head"><h2>${isNew ? 'New to-do' : 'Edit to-do'}</h2><button class="btn quiet" data-act="close">Cancel</button></div>
        <div class="field"><input class="input" id="td-title" value="${esc(d.title)}" placeholder="Book the boat tour, get a visa…" aria-label="To-do"></div>
        <div class="field"><div class="label">Who’s it for?</div>
          <div class="check-chips">
            <button type="button" class="chip ${d.for === 'all' ? 'on' : ''}" data-for="all">Everyone</button>
            ${people.map(u => `<button type="button" class="chip ${d.for === u ? 'on' : ''}" data-for="${esc(u)}">${avatar(t, u, 'tiny')} ${u === S.me ? 'Me' : esc(nameIn(t, u))}</button>`).join('')}
          </div>
          ${d.for === 'all' && t.members.length > 1 ? '<p class="hint">Everyone checks it off on their own.</p>' : ''}</div>
        <div class="field"><div class="label">When</div>
          <div class="seg wide"><button class="${when === 'none' ? 'on' : ''}" data-when="none">No date</button><button class="${when === 'date' ? 'on' : ''}" data-when="date">On a date</button><button class="${when === 'before' ? 'on' : ''}" data-when="before">Before the trip</button></div>
          ${when === 'date' ? `<input class="input" type="date" id="td-due" value="${esc(d.due)}">` : ''}
          ${when === 'before' ? `<div class="row before-row"><input class="input" type="number" inputmode="numeric" min="1" max="365" id="td-n" value="${n}"><select class="input" id="td-unit">${['days', 'weeks', 'months'].map(u => `<option ${u === unit ? 'selected' : ''}>${u}</option>`).join('')}</select><span>before</span></div>
            <p class="hint">${t.start ? 'That’s ' + esc(dateRange(addDays(t.start, -beforeDays()))) + '.' : 'Turns into a real date once the trip has dates.'}</p>` : ''}
        </div>
        <textarea class="input notes" id="td-notes" placeholder="Notes (optional)">${esc(d.notes)}</textarea>
        <div class="sheet-foot"><button class="btn wide" id="td-save">${isNew ? 'Add to-do' : 'Save'}</button>${isNew ? '' : '<button class="btn danger" id="td-del">Delete</button>'}</div>`, onClick);
      sheet.oninput = e => {
        if (e.target.id === 'td-n' || e.target.id === 'td-unit') {
          grab();
          const h = e.target.closest('.field').querySelector('.hint');
          if (h && t.start) h.textContent = 'That’s ' + dateRange(addDays(t.start, -beforeDays())) + '.';
        }
      };
      sheet.onchange = sheet.oninput;
    };
    function beforeDays() { const k = { days: 1, weeks: 7, months: 30 }[unit] || 1; return Math.max(1, Math.round((+n || 1) * k)); }
    const grab = () => {
      d.title = $('#td-title').value; d.notes = $('#td-notes').value;
      if ($('#td-due')) d.due = $('#td-due').value;
      if ($('#td-n')) { n = $('#td-n').value; unit = $('#td-unit').value; }
    };
    async function onClick(e) {
      const f = e.target.closest('[data-for]');
      if (f) { grab(); d.for = f.dataset.for; draw(); return; }
      const w = e.target.closest('[data-when]');
      if (w) { grab(); when = w.dataset.when; draw(); return; }
      if (e.target.closest('#td-del')) {
        if (!(await ask('Delete this to-do?', '', 'Delete', { danger: true }))) return;
        try { await API.deleteTodo(t.id, x.id); closeSheet(); } catch (err) { oops(err); }
        return;
      }
      if (!e.target.closest('#td-save')) return;
      grab();
      if (!d.title.trim()) { $('#td-title').focus(); return toast('Write the to-do.'); }
      if (when === 'date' && !d.due) return toast('Pick a date, or choose “No date.”');
      const out = { title: d.title.trim(), notes: d.notes.trim(), for: d.for, due: when === 'date' ? d.due : '', before: when === 'before' ? beforeDays() : null };
      if (x) out.id = x.id;
      e.target.disabled = true;
      try { await API.saveTodo(t.id, out); closeSheet(); toast(isNew ? 'Added ✅' : 'Saved'); } catch (err) { e.target.disabled = false; oops(err); }
    }
    draw();
    if (isNew) setTimeout(() => { const i = $('#td-title'); if (i) i.focus(); }, 250);
  }

  function starterSheet(t) {
    const have = new Set((S.todos[t.id] || []).map(x => x.title.toLowerCase()));
    const picked = new Set(STARTER.map((x, i) => i).filter(i => !have.has(STARTER[i].title.toLowerCase())));
    openSheet(`<div class="sheet-head"><h2>Starter list ✨</h2><button class="btn quiet" data-act="close">Cancel</button></div>
      <p class="hint" style="margin-top:-6px">The usual things for a trip abroad, for everyone. Untick any you don’t need.</p>
      <div class="pick-list">${STARTER.map((x, i) => `<label class="pick ${picked.has(i) ? 'on' : ''}"><input type="checkbox" data-st="${i}" ${picked.has(i) ? 'checked' : ''}>
        <span class="pick-main"><b>${esc(x.title)}</b><small>${have.has(x.title.toLowerCase()) ? 'Already on your list' : esc(beforeText(x.before)) + ' the trip'}</small></span>
        <span class="pick-box">${icon('check')}</span></label>`).join('')}</div>
      <div class="sheet-foot"><button class="btn wide" id="st-go">Add ${picked.size} to-dos</button></div>`, async e => {
      if (!e.target.closest('#st-go')) return;
      if (!picked.size) return toast('Tick the ones you want.');
      e.target.disabled = true;
      try {
        await API.addTodos(t.id, STARTER.filter((x, i) => picked.has(i)).map(x => ({ title: x.title, notes: '', for: 'all', due: '', before: x.before })));
        closeSheet(); toast('Added ✅');
      } catch (err) { e.target.disabled = false; oops(err); }
    });
    sheet.onchange = e => {
      const i = e.target.dataset.st;
      if (i === undefined) return;
      if (e.target.checked) picked.add(+i); else picked.delete(+i);
      e.target.closest('.pick').classList.toggle('on', e.target.checked);
      $('#st-go').textContent = `Add ${picked.size} to-do${picked.size === 1 ? '' : 's'}`;
    };
  }

  // ---------- costs ----------
  // Rates come free from Frankfurter (European Central Bank). The rest you type the rate for.
  const RATED = ['USD', 'EUR', 'GBP', 'CAD', 'MXN', 'JPY', 'CNY', 'KRW', 'THB', 'AUD', 'NZD', 'CHF', 'HKD', 'SGD', 'INR', 'IDR', 'PHP', 'MYR', 'ISK', 'NOK', 'SEK', 'DKK', 'CZK', 'HUF', 'PLN', 'RON', 'TRY', 'ILS', 'ZAR', 'BRL'];
  const OTHER_CURS = ['AED', 'ARS', 'CLP', 'COP', 'CRC', 'DOP', 'EGP', 'FJD', 'JMD', 'KES', 'MAD', 'PEN', 'TWD', 'VND'];
  const COST_EMOJI = ['🍽️', '☕', '🍸', '🏨', '✈️', '🚆', '🚕', '⛵', '⛽', '🎟️', '🛍️', '🎁', '💊', '🧾'];
  const usdFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
  const usd = n => usdFmt.format(Math.round((n || 0) * 100) / 100);
  const usdShort = n => (Math.abs(n) >= 1000 ? '$' + Math.round(n).toLocaleString('en-US') : usd(n));
  function curFmt(n, cur) {
    try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur, currencyDisplay: 'narrowSymbol' }).format(n); } catch (e) { return `${n} ${cur}`; }
  }
  const curSymbol = cur => curFmt(0, cur).replace(/[\d.,\s]/g, '') || cur;
  const round2 = n => Math.round(n * 100) / 100;
  const rateCache = {};
  async function rateFor(cur, date) {
    if (cur === 'USD') return 1;
    if (!RATED.includes(cur)) return null;
    const day = !date || date >= todayIso() ? 'latest' : date;
    const key = cur + day;
    if (key in rateCache) return rateCache[key];
    try {
      const r = await fetch(`https://api.frankfurter.dev/v1/${day}?from=${cur}&to=USD`);
      const j = await r.json();
      rateCache[key] = j && j.rates && j.rates.USD ? j.rates.USD : null;
    } catch (e) { return null; }
    return rateCache[key];
  }

  // everyone who can pay or share: people on the trip, plus guests
  const guestsOf = t => Object.entries(t.guests || {}).map(([id, g]) => ({ key: 'g:' + id, name: g.name, guest: true }));
  const costPeople = t => [...t.members.map(u => ({ key: u, name: u === S.me ? 'You' : nameIn(t, u) })), ...guestsOf(t)];
  const whoName = (t, k) => (k && k.startsWith('g:') ? ((t.guests || {})[k.slice(2)] || {}).name || 'Guest' : nameIn(t, k));
  const whoAv = (t, k) => (k && k.startsWith('g:') ? `<span class="av tiny guest" title="${esc(whoName(t, k))}">${esc(first(whoName(t, k)))}</span>` : avatar(t, k, 'tiny'));
  // USD each person owes for one expense
  function sharesOf(c) {
    const out = {};
    if (c.custom) {
      for (const k of c.among) out[k] = round2((+c.custom[k] || 0) * (c.rate || 1));
      return out;
    }
    const n = c.among.length || 1;
    const cents = Math.round((c.usd || 0) * 100);
    const each = Math.floor(cents / n);
    c.among.forEach((k, i) => { out[k] = (each + (i < cents - each * n ? 1 : 0)) / 100; });
    return out;
  }
  function balances(t) {
    const net = {};
    const add = (k, v) => { net[k] = round2((net[k] || 0) + v); };
    for (const c of S.costs[t.id] || []) {
      if (c.kind === 'settle') { add(c.from, c.usd); add(c.to, -c.usd); continue; }
      add(c.paidBy, c.usd || 0);
      const sh = sharesOf(c);
      for (const k in sh) add(k, -sh[k]);
    }
    return net;
  }
  // fewest payments that square everyone up
  function whoOwes(net) {
    const pos = Object.entries(net).filter(([, v]) => v > 0.004).map(([k, v]) => [k, v]).sort((a, b) => b[1] - a[1]);
    const neg = Object.entries(net).filter(([, v]) => v < -0.004).map(([k, v]) => [k, -v]).sort((a, b) => b[1] - a[1]);
    const out = [];
    let i = 0, j = 0;
    while (i < pos.length && j < neg.length) {
      const amt = round2(Math.min(pos[i][1], neg[j][1]));
      if (amt >= 0.01) out.push({ from: neg[j][0], to: pos[i][0], usd: amt });
      pos[i][1] = round2(pos[i][1] - amt); neg[j][1] = round2(neg[j][1] - amt);
      if (pos[i][1] < 0.01) i++;
      if (neg[j][1] < 0.01) j++;
    }
    return out;
  }
  const expensesOf = t => (S.costs[t.id] || []).filter(c => c.kind !== 'settle');
  function costLabel(t) {
    const total = expensesOf(t).reduce((a, c) => a + (c.usd || 0), 0);
    return total ? usdShort(total) : 'Costs';
  }

  function viewCosts(t) {
    const edit = canEdit(t);
    const all = (S.costs[t.id] || []).slice().sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || 0) - (a.createdAt || 0));
    const exp = all.filter(c => c.kind !== 'settle');
    const total = exp.reduce((a, c) => a + (c.usd || 0), 0);
    const myShare = exp.reduce((a, c) => a + (sharesOf(c)[S.me] || 0), 0);
    const myPaid = exp.filter(c => c.paidBy === S.me).reduce((a, c) => a + (c.usd || 0), 0);
    const owes = whoOwes(balances(t));
    let lastDay = '';
    const rows = all.map(c => {
      const head = c.date !== lastDay ? `<div class="cost-day">${esc(c.date ? dateRange(c.date) : 'No date')}</div>` : '';
      lastDay = c.date;
      if (c.kind === 'settle') return `${head}<div class="cost settle" data-cost="${esc(c.id)}"><span class="cost-emoji">💸</span>
        <span class="cost-main"><b>${esc(whoName(t, c.from))} paid ${esc(c.to === S.me ? 'you' : whoName(t, c.to))} back</b><small>Settled up</small></span><span class="cost-amt">${usd(c.usd)}</span></div>`;
      const n = c.among.length;
      return `${head}<div class="cost" data-cost="${esc(c.id)}"><span class="cost-emoji">${esc(c.emoji || '🧾')}</span>
        <span class="cost-main"><b>${esc(c.what)}</b><small>${esc(whoName(t, c.paidBy))} paid · ${c.custom ? 'custom split' : n === 1 ? 'just ' + esc(whoName(t, c.among[0])) : 'split ' + n + ' ways'}${sharesOf(c)[S.me] != null && c.paidBy !== S.me ? ' · yours ' + usd(sharesOf(c)[S.me]) : ''}</small></span>
        <span class="cost-amt">${usd(c.usd)}${c.cur !== 'USD' ? `<small>${esc(curFmt(c.amount, c.cur))}</small>` : ''}</span></div>`;
    }).join('');
    view.innerHTML = `<div class="back-row"><a class="back" href="#/t/${esc(t.id)}">${icon('back')} ${esc(t.name)}</a>
        ${edit ? `<button class="plus-btn small" id="cost-add" aria-label="Add an expense">${icon('plus')}</button>` : ''}</div>
      <div class="page-head tight-head"><div><h1>Costs 💸</h1><p class="sub">Everything in US dollars.</p></div></div>
      ${exp.length ? `<div class="cost-sum">
          <div><small>Trip total</small><b>${usd(total)}</b></div>
          <div><small>Your share</small><b>${usd(myShare)}</b></div>
          <div><small>You paid</small><b>${usd(myPaid)}</b></div>
        </div>
        <div class="card owes">
          <h3>Who owes who</h3>
          ${owes.length ? owes.map(o => `<div class="owe ${o.from === S.me || o.to === S.me ? 'mine' : ''}">
              <span class="owe-who">${whoAv(t, o.from)} <b>${o.from === S.me ? 'You owe' : esc(whoName(t, o.from)) + ' owes'}</b> ${o.to === S.me ? 'you' : esc(whoName(t, o.to))}</span>
              <span class="owe-amt">${usd(o.usd)}</span>
              ${edit ? `<button class="btn soft small" data-settle="${esc(o.from)}|${esc(o.to)}|${o.usd}">Settle up</button>` : ''}
            </div>`).join('') : '<p class="hint">Everyone’s square ✨</p>'}
        </div>
        <div class="costs">${rows}</div>`
      : `<div class="empty"><div class="empty-emoji">💸</div><h2>No costs yet</h2><p>Add what you spend — the hotel, dinners, tickets — and Tripsy works out who owes who, in dollars.</p></div>`}
      <div class="guests">
        <span class="label">Guests</span>
        ${guestsOf(t).map(g => `<span class="chip guest-chip">${esc(g.name)}${edit ? `<button class="leave-x small-x" data-rmguest="${esc(g.key)}" aria-label="Remove ${esc(g.name)}">×</button>` : ''}</span>`).join('') || '<span class="hint" style="margin:0">People sharing costs who aren’t on Tripsy</span>'}
        ${edit ? '<button class="chip-btn" id="add-guest">+ Guest</button>' : ''}
      </div>`;
    if ($('#cost-add')) $('#cost-add').onclick = () => costSheet(t, null);
    view.onclick = async e => {
      const st = e.target.closest('[data-settle]');
      if (st) {
        const [from, to, amt] = st.dataset.settle.split('|');
        if (!(await ask('Settle up?', `Mark that ${esc(whoName(t, from) === 'You' ? 'you' : whoName(t, from))} paid ${esc(whoName(t, to) === 'You' ? 'you' : whoName(t, to))} <b>${usd(+amt)}</b>.`, 'Mark as paid'))) return;
        try { await API.saveCost(t.id, { kind: 'settle', from, to, usd: +amt, date: todayIso() }); toast('Settled 💸'); } catch (err) { oops(err); }
        return;
      }
      const rg = e.target.closest('[data-rmguest]');
      if (rg) {
        const k = rg.dataset.rmguest;
        if ((S.costs[t.id] || []).some(c => c.paidBy === k || (c.among || []).includes(k) || c.from === k || c.to === k)) return tell('Still in some costs', `${esc(whoName(t, k))} is part of some costs on this trip. Take them out of those first.`);
        const guests = { ...(t.guests || {}) };
        delete guests[k.slice(2)];
        API.saveTrip(t.id, { guests }).catch(oops);
        return;
      }
      if (e.target.closest('#add-guest')) { addGuest(t); return; }
      const c = e.target.closest('[data-cost]');
      if (!c) return;
      const item = all.find(x => x.id === c.dataset.cost);
      if (item.kind === 'settle') {
        if (edit && await ask('Undo this settle-up?', `${esc(whoName(t, item.from))} paid ${esc(item.to === S.me ? 'you' : whoName(t, item.to))} ${usd(item.usd)} — remove it?`, 'Remove', { danger: true })) API.deleteCost(t.id, item.id).catch(oops);
      } else costSheet(t, item);
    };
  }

  async function addGuest(t, then) {
    const name = await ask('Add a guest', 'Someone sharing costs who isn’t on Tripsy.', 'Add', { input: true, placeholder: 'Their name' });
    if (!name || !name.trim()) return null;
    const id = Math.random().toString(36).slice(2, 8);
    try {
      await API.saveTrip(t.id, { guests: { ...(t.guests || {}), [id]: { name: name.trim().slice(0, 30) } } });
      t.guests = { ...(t.guests || {}), [id]: { name: name.trim().slice(0, 30) } };
      if (then) then('g:' + id);
      return 'g:' + id;
    } catch (e) { oops(e); return null; }
  }

  function costSheet(t, c) {
    const edit = canEdit(t);
    const isNew = !c;
    const people = () => costPeople(t);
    const d = c ? { ...c, among: [...c.among], custom: c.custom ? { ...c.custom } : null }
      : { what: '', emoji: '🍽️', amount: '', cur: ls.get('tr-cur-' + t.id, 'USD'), rate: null, date: todayIso(), paidBy: S.me, among: people().map(p => p.key), custom: null, note: '' };
    let mode = d.custom ? 'custom' : 'equal';
    let rate = c ? c.rate : null, rateState = c ? 'ok' : 'loading', manual = c && !RATED.includes(c.cur);
    if (!edit) {
      const sh = sharesOf(c);
      openSheet(`<div class="sheet-head"><h2>${esc(c.emoji || '🧾')} ${esc(c.what)}</h2><button class="btn quiet" data-act="close">Close</button></div>
        <p class="cost-big">${usd(c.usd)}${c.cur !== 'USD' ? ` <small>${esc(curFmt(c.amount, c.cur))}</small>` : ''}</p>
        <p class="hint">${esc(whoName(t, c.paidBy))} paid · ${esc(dateRange(c.date))}</p>
        <div class="people">${Object.entries(sh).map(([k, v]) => `<div class="person">${whoAv(t, k)}<div class="person-main"><b>${esc(whoName(t, k))}</b></div><b>${usd(v)}</b></div>`).join('')}</div>
        ${c.note ? `<p class="detail-notes">${esc(c.note)}</p>` : ''}`);
      return;
    }
    async function loadRate() {
      if (manual) return;
      rateState = 'loading';
      const r = await rateFor(d.cur, d.date);
      if (r) { rate = r; rateState = 'ok'; } else { rateState = 'none'; manual = true; }
      if (!sheetWrap.hidden) draw();
    }
    const amt = () => parseFloat(String(d.amount).replace(/[^0-9.]/g, '')) || 0;
    const customSum = () => d.among.reduce((a, k) => a + (parseFloat((d.custom || {})[k]) || 0), 0);
    function convLine() {
      if (d.cur === 'USD') return '';
      if ((rateState === 'loading' || !rate) && !manual) return '<p class="hint conv">Getting the exchange rate…</p>';
      if (manual) return `<div class="row conv"><span class="hint" style="margin:0">1 ${esc(d.cur)} = $</span><input class="input rate-in" id="c-rate" inputmode="decimal" value="${rate ? esc(String(rate)) : ''}" placeholder="0.00"><span class="hint" style="margin:0" id="c-usd">${rate && amt() ? '≈ ' + usd(amt() * rate) : ''}</span></div>
        <p class="hint">${RATED.includes(d.cur) ? 'Couldn’t get the rate right now — type it in.' : 'Type the exchange rate for this one.'}</p>`;
      return `<p class="hint conv" id="c-usd">${amt() ? '≈ <b>' + usd(amt() * rate) + '</b> · ' : ''}1 ${esc(d.cur)} = $${rate.toFixed(4)}</p>`;
    }
    function splitHtml() {
      const ps = people();
      const chips = `<div class="check-chips">${ps.map(p => `<button type="button" class="chip ${d.among.includes(p.key) ? 'on' : ''}" data-among="${esc(p.key)}">${whoAv(t, p.key)} ${esc(p.name)}</button>`).join('')}<button type="button" class="chip-btn" data-guest="among">+ Guest</button></div>`;
      if (mode === 'equal') {
        const each = d.among.length && amt() ? amt() / d.among.length : 0;
        return chips + (each ? `<p class="hint">${esc(curFmt(round2(each), d.cur))} each${d.cur !== 'USD' && rate ? ' (≈ ' + usd(each * rate) + ')' : ''}</p>` : '');
      }
      const left = round2(amt() - customSum());
      return chips + `<div class="custom-split">${d.among.map(k => `<label class="cs-row">${whoAv(t, k)}<span>${esc(whoName(t, k))}</span>
          <span class="money-in"><span>${esc(curSymbol(d.cur))}</span><input class="input" inputmode="decimal" data-cs="${esc(k)}" value="${esc((d.custom || {})[k] ?? '')}" placeholder="0"></span></label>`).join('')}</div>
        <p class="hint ${Math.abs(left) < 0.01 ? 'good' : 'warn'}" id="cs-left">${!amt() ? 'Add the amount first.' : Math.abs(left) < 0.01 ? 'Adds up ✓' : left > 0 ? esc(curFmt(left, d.cur)) + ' left to split' : esc(curFmt(-left, d.cur)) + ' too much'}</p>`;
    }
    const draw = () => {
      openSheet(`<div class="sheet-head"><h2>${isNew ? 'New expense' : 'Edit expense'}</h2><button class="btn quiet" data-act="close">Cancel</button></div>
        <div class="emoji-pick">${COST_EMOJI.map(x => `<button type="button" class="${d.emoji === x ? 'on' : ''}" data-cemo="${x}">${x}</button>`).join('')}</div>
        <div class="field"><input class="input" id="c-what" value="${esc(d.what)}" placeholder="Dinner, hotel, boat tickets…" aria-label="What was it"></div>
        <div class="row amount-row">
          <span class="money-in grow"><span>${esc(curSymbol(d.cur))}</span><input class="input" id="c-amt" inputmode="decimal" value="${esc(d.amount)}" placeholder="0.00" aria-label="Amount"></span>
          <select class="input cur-pick" id="c-cur" aria-label="Currency">${[...RATED, ...OTHER_CURS].map(x => `<option ${x === d.cur ? 'selected' : ''}>${x}</option>`).join('')}</select>
        </div>
        ${convLine()}
        <div class="field tight"><label for="c-date">Date</label><input class="input" type="date" id="c-date" value="${esc(d.date)}"></div>
        <div class="field"><div class="label">Paid by</div>
          <div class="check-chips">${people().map(p => `<button type="button" class="chip ${d.paidBy === p.key ? 'on' : ''}" data-paid="${esc(p.key)}">${whoAv(t, p.key)} ${esc(p.name)}</button>`).join('')}<button type="button" class="chip-btn" data-guest="paid">+ Guest</button></div></div>
        <div class="field"><div class="row split-head"><div class="label">Split between</div>
          <div class="seg"><button class="${mode === 'equal' ? 'on' : ''}" data-mode2="equal">Equally</button><button class="${mode === 'custom' ? 'on' : ''}" data-mode2="custom">Custom</button></div></div>
          <div id="split">${splitHtml()}</div></div>
        <input class="input" id="c-note" value="${esc(d.note)}" placeholder="Note (optional)" aria-label="Note">
        <div class="sheet-foot"><button class="btn wide" id="c-save">${isNew ? 'Add expense' : 'Save'}</button>${isNew ? '' : '<button class="btn danger" id="c-del">Delete</button>'}</div>`, onClick, true);
      sheet.oninput = onInput;
      sheet.onchange = onChange;
    };
    const grab = () => {
      d.what = $('#c-what').value; d.amount = $('#c-amt').value; d.date = $('#c-date').value; d.note = $('#c-note').value;
      if ($('#c-rate')) rate = parseFloat($('#c-rate').value) || null;
    };
    function onInput(e) {
      const id = e.target.id;
      if (id === 'c-amt' || id === 'c-rate') {
        grab();
        const u = $('#c-usd');
        if (u && rate) u.innerHTML = manual ? (amt() ? '≈ ' + usd(amt() * rate) : '') : `${amt() ? '≈ <b>' + usd(amt() * rate) + '</b> · ' : ''}1 ${esc(d.cur)} = $${rate.toFixed(4)}`;
        if (mode === 'equal' || $('#cs-left')) { const sp = $('#split'); if (sp && mode === 'equal') sp.innerHTML = splitHtml(); else updateLeft(); }
      }
      if (e.target.dataset.cs !== undefined) {
        d.custom = d.custom || {};
        d.custom[e.target.dataset.cs] = e.target.value;
        updateLeft();
      }
    }
    function updateLeft() {
      const el = $('#cs-left');
      if (!el) return;
      const left = round2(amt() - customSum());
      el.className = 'hint ' + (Math.abs(left) < 0.01 ? 'good' : 'warn');
      el.textContent = !amt() ? 'Add the amount first.' : Math.abs(left) < 0.01 ? 'Adds up ✓' : left > 0 ? curFmt(left, d.cur) + ' left to split' : curFmt(-left, d.cur) + ' too much';
    }
    function onChange(e) {
      if (e.target.id === 'c-cur') { grab(); d.cur = e.target.value; ls.set('tr-cur-' + t.id, d.cur); manual = !RATED.includes(d.cur); rate = d.cur === 'USD' ? 1 : null; rateState = 'loading'; draw(); loadRate(); }
      else if (e.target.id === 'c-date' && !manual) { grab(); loadRate(); }
    }
    async function onClick(e) {
      const em = e.target.closest('[data-cemo]');
      if (em) { grab(); d.emoji = em.dataset.cemo; draw(); return; }
      const pd = e.target.closest('[data-paid]');
      if (pd) { grab(); d.paidBy = pd.dataset.paid; draw(); return; }
      const am = e.target.closest('[data-among]');
      if (am) {
        grab();
        const k = am.dataset.among;
        d.among = d.among.includes(k) ? d.among.filter(x => x !== k) : people().map(p => p.key).filter(x => x === k || d.among.includes(x));
        draw(); return;
      }
      const g = e.target.closest('[data-guest]');
      if (g) {
        grab();
        await addGuest(t, k => { if (g.dataset.guest === 'paid') d.paidBy = k; if (!d.among.includes(k)) d.among.push(k); });
        draw(); return;
      }
      const m2 = e.target.closest('[data-mode2]');
      if (m2) {
        grab();
        mode = m2.dataset.mode2;
        if (mode === 'custom' && !d.custom) {
          // start each person at an even share
          const each = d.among.length && amt() ? round2(amt() / d.among.length) : '';
          d.custom = Object.fromEntries(d.among.map(k => [k, each]));
        }
        draw(); return;
      }
      if (e.target.closest('#c-del')) {
        if (!(await ask('Delete this expense?', `“${esc(c.what)}” will be gone for everyone.`, 'Delete', { danger: true }))) return;
        try { await API.deleteCost(t.id, c.id); closeSheet(); } catch (err) { oops(err); }
        return;
      }
      if (!e.target.closest('#c-save')) return;
      grab();
      if (!d.what.trim()) { $('#c-what').focus(); return toast('What was it for?'); }
      if (!amt()) { $('#c-amt').focus(); return toast('Add the amount.'); }
      if (!d.among.length) return toast('Pick who it’s split between.');
      if (d.cur !== 'USD' && !rate) return toast('Add the exchange rate.');
      if (mode === 'custom' && Math.abs(amt() - customSum()) >= 0.01) return toast('The custom amounts need to add up to the total.');
      const r = d.cur === 'USD' ? 1 : rate;
      const out = {
        what: d.what.trim(), emoji: d.emoji, amount: round2(amt()), cur: d.cur, rate: r, usd: round2(amt() * r), date: d.date || todayIso(),
        paidBy: d.paidBy, among: d.among,
        custom: mode === 'custom' ? Object.fromEntries(d.among.map(k => [k, round2(parseFloat(d.custom[k]) || 0)])) : null,
        note: d.note.trim(),
      };
      if (c) out.id = c.id;
      e.target.disabled = true;
      try { await API.saveCost(t.id, out); closeSheet(); toast(isNew ? 'Added 💸' : 'Saved'); } catch (err) { e.target.disabled = false; oops(err); }
    }
    draw();
    if (isNew) { loadRate(); setTimeout(() => { const i = $('#c-what'); if (i) i.focus(); }, 250); }
  }

  // ---------- people + invites ----------
  function inviteLink(t) { return location.origin + location.pathname + '#/join/' + encodeURIComponent(t.code); }
  function inviteSheet(t) {
    const own = isOwner(t);
    const draw = () => {
      t = tripById(t.id) || t;
      openSheet(`<div class="sheet-head"><h2>Invite friends</h2><button class="btn quiet" data-act="close">Done</button></div>
        <p class="hint" style="margin-top:-6px">Send the link — or they can type the code in Tripsy under “Join with a code.”</p>
        <div class="mycode"><span class="code">${esc(t.code)}</span><button class="btn soft small" id="cp-code">${icon('copy')} Copy</button></div>
        <div class="row tight wrap"><button class="btn wide" id="share">${icon('share')} Share invite link</button></div>
        <div class="field tight">
          <div class="label">New people join as</div>
          ${own ? `<div class="seg"><button class="${t.joinRole !== 'view' ? 'on' : ''}" data-role="edit">Can edit</button><button class="${t.joinRole === 'view' ? 'on' : ''}" data-role="view">View only</button></div>`
            : `<p class="hint">${t.joinRole === 'view' ? 'View only' : 'Can edit'} — the trip’s owner can change this.</p>`}
        </div>
        ${own ? '<button class="linkbtn small-link" id="newcode">Make a new code (the old one stops working)</button>' : ''}`, async e => {
        if (e.target.closest('#cp-code')) copy(t.code, 'Code copied');
        else if (e.target.closest('#share')) {
          const url = inviteLink(t);
          const text = `Join my trip “${t.name}” on Tripsy! ✈️ Code: ${t.code}`;
          if (navigator.share) navigator.share({ title: 'Tripsy', text, url }).catch(() => {});
          else copy(text + '\n' + url, 'Invite link copied');
        } else if (e.target.closest('[data-role]')) {
          try { await API.setJoinRole(t.id, e.target.closest('[data-role]').dataset.role); setTimeout(draw, 80); } catch (err) { oops(err); }
        } else if (e.target.closest('#newcode')) {
          if (!(await ask('Make a new code?', 'Invites you already sent will stop working. People already on the trip stay on it.', 'New code'))) return;
          try { await API.newTripCode(t.id); setTimeout(draw, 80); toast('New code ready'); } catch (err) { oops(err); }
        }
      });
    };
    draw();
  }
  function copy(text, msg) {
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(() => toast(msg), () => tell('Copy this', esc(text)));
  }

  function peopleSheet(t) {
    const draw = () => {
      t = tripById(t.id);
      if (!t) return closeSheet();
      const own = isOwner(t);
      const list = t.members.slice().sort((a, b) => (a === t.owner ? -1 : b === t.owner ? 1 : nameIn(t, a).localeCompare(nameIn(t, b))));
      openSheet(`<div class="sheet-head"><h2>Who’s going</h2><button class="btn quiet" data-act="close">Done</button></div>
        <div class="people">${list.map(m => `<div class="person">
          ${avatar(t, m)}
          <div class="person-main"><b>${esc(m === S.me ? myName() + ' (you)' : nameIn(t, m))}</b>
            <small>${m === t.owner ? 'Owner · ' : ''}${t.roles[m] === 'view' ? 'View only' : 'Can edit'}</small></div>
          ${own && m !== S.me ? `<div class="seg mini"><button class="${t.roles[m] !== 'view' ? 'on' : ''}" data-set="edit" data-who="${esc(m)}">Edit</button><button class="${t.roles[m] === 'view' ? 'on' : ''}" data-set="view" data-who="${esc(m)}">View</button></div>
            <button class="leave-x" data-rm="${esc(m)}" aria-label="Remove ${esc(nameIn(t, m))}">×</button>` : ''}
        </div>`).join('')}</div>
        <div class="sheet-foot"><button class="btn soft wide" id="p-invite">${icon('person-plus')} Invite more</button></div>`, async e => {
        const s = e.target.closest('[data-set]');
        const rm = e.target.closest('[data-rm]');
        if (s) { try { await API.setRole(t.id, s.dataset.who, s.dataset.set); setTimeout(draw, 80); } catch (err) { oops(err); } }
        else if (rm) {
          if (!(await ask(`Remove ${esc(nameIn(t, rm.dataset.rm))}?`, 'They won’t see this trip anymore. Ideas they added stay.', 'Remove', { danger: true }))) return;
          try { await API.removePerson(t.id, rm.dataset.rm); setTimeout(draw, 80); } catch (err) { oops(err); }
        } else if (e.target.closest('#p-invite')) inviteSheet(t);
      });
    };
    draw();
  }

  // ---------- trip menu: details, look, leave/delete ----------
  function tripMenu(t) {
    const edit = canEdit(t);
    const own = isOwner(t);
    const keep = !!(S.profile.keepMine || {})[t.id];
    openSheet(`<div class="sheet-head"><h2>${esc(t.name)}</h2><button class="btn quiet" data-act="close">Close</button></div>
      <div class="menu">
        <button data-m="invite">${icon('share')} Invite friends</button>
        ${edit ? `<button data-m="details">${icon('edit')} Trip name, place, dates & photo</button>` : ''}
        ${edit && t.start ? `<button data-m="plan">${icon('calendar')} Plan style <span class="menu-sub">${esc(PLAN_STYLES[t.planStyle || 'loose'].name)}</span></button>` : ''}
        ${edit ? `<button data-m="pins">${icon('pin')} Map pins <span class="menu-sub">The pin each kind of idea gets</span></button>` : ''}
        <button data-m="look">${icon('palette')} Trip look ${t.look ? `<span class="menu-sub">${keep ? 'Using my own' : 'Shared look on'}</span>` : '<span class="menu-sub">None — everyone sees their own</span>'}</button>
        <button data-m="people">${icon('person-plus')} Who’s going</button>
        ${own ? `<button data-m="delete" class="danger-row">Delete trip</button>` : `<button data-m="leave" class="danger-row">Leave trip</button>`}
      </div>`, async e => {
      const m = e.target.closest('[data-m]');
      if (!m) return;
      const k = m.dataset.m;
      if (k === 'invite') inviteSheet(t);
      else if (k === 'details') tripSheet(t);
      else if (k === 'look') tripLookSheet(t);
      else if (k === 'pins') pinDefaultsSheet(t);
      else if (k === 'plan') planStyleSheet(t);
      else if (k === 'people') peopleSheet(t);
      else if (k === 'leave') {
        if (!(await ask('Leave this trip?', 'You won’t see it anymore unless someone invites you again.', 'Leave', { danger: true }))) return;
        try { await API.leaveTrip(t.id); closeSheet(); location.hash = '#/trips'; } catch (err) { oops(err); }
      } else if (k === 'delete') {
        if (!(await ask('Delete this trip?', `“${esc(t.name)}” and all its ideas will be gone for everyone. This can’t be undone.`, 'Delete trip', { danger: true }))) return;
        try { await API.deleteTrip(t.id); closeSheet(); location.hash = '#/trips'; toast('Trip deleted'); } catch (err) { oops(err); }
      }
    });
  }

  // The trip's shared look: editors pick/share/remove it; everyone picks
  // "use the trip's look" or "keep mine".
  function tripLookSheet(t) {
    let picking = null; // a look being chosen for the trip
    const draw = () => {
      t = tripById(t.id);
      if (!t) return closeSheet();
      const edit = canEdit(t);
      const keep = !!(S.profile.keepMine || {})[t.id];
      if (picking) {
        Themes.apply(picking);
        openSheet(`<div class="sheet-head"><h2>Look for this trip</h2><button class="btn quiet" id="lk-cancel">Back</button></div>
          <p class="hint" style="margin-top:-6px">Everyone on the trip will see this inside it (unless they keep their own).</p>
          <div id="lk-ed"></div>
          <div class="sheet-foot"><button class="btn wide" id="lk-save">Share this look with the trip</button></div>`, onClick);
        lookEditor($('#lk-ed'), picking, l => { picking = l; Themes.apply(l); });
        return;
      }
      applyPageLook();
      openSheet(`<div class="sheet-head"><h2>Trip look</h2><button class="btn quiet" data-act="close">Done</button></div>
        ${t.look ? `<div class="look-preview" style="${Themes.styleAttr(t.look)}">
            <span class="lp-emoji">${esc(t.emoji || '✈️')}</span>
            <div><b>${esc(t.name)}</b><small>${esc((Themes.paletteOf(t.look) || {}).name)} · ${esc(Themes.FONTS[Themes.fontOf(t.look)].name)}</small></div>
          </div>
          <div class="field tight"><div class="label">What I see on this trip</div>
            <div class="seg"><button class="${!keep ? 'on' : ''}" data-keep="0">The trip’s look</button><button class="${keep ? 'on' : ''}" data-keep="1">My own look</button></div>
          </div>` : '<p class="hint">This trip doesn’t have a shared look — everyone sees it in their own colors and fonts.</p>'}
        ${edit ? `<div class="stack tight">
          <button class="btn soft wide" id="lk-mine">${icon('sparkle')} Share my look with this trip</button>
          <button class="btn ghost wide" id="lk-pick">${icon('palette')} ${t.look ? 'Change the trip’s look' : 'Pick a look for this trip'}</button>
          ${t.look ? '<button class="btn danger wide" id="lk-off">Stop sharing a look</button>' : ''}
        </div>` : ''}`, onClick);
    };
    async function onClick(e) {
      const kp = e.target.closest('[data-keep]');
      try {
        if (kp) { await API.setKeepMine(t.id, kp.dataset.keep === '1'); setTimeout(draw, 80); }
        else if (e.target.closest('#lk-mine')) { await API.saveTrip(t.id, { look: Themes.clean(S.profile.look) }); await API.setKeepMine(t.id, false); toast('Your look is now the trip’s look ✨'); setTimeout(draw, 80); }
        else if (e.target.closest('#lk-pick')) { picking = Themes.clean(t.look || S.profile.look); draw(); }
        else if (e.target.closest('#lk-cancel')) { picking = null; draw(); }
        else if (e.target.closest('#lk-save')) { await API.saveTrip(t.id, { look: Themes.clean(picking) }); await API.setKeepMine(t.id, false); picking = null; toast('Shared with the trip ✨'); setTimeout(draw, 80); }
        else if (e.target.closest('#lk-off')) {
          if (!(await ask('Stop sharing a look?', 'Everyone will see this trip in their own look again.', 'Stop sharing'))) return;
          await API.saveTrip(t.id, { look: null }); setTimeout(draw, 80);
        }
      } catch (err) { oops(err); }
    }
    draw();
  }

  // ---------- someday ----------
  function viewSomeday() {
    const all = S.someday.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const counts = Object.fromEntries(CATS.map(c => [c.id, all.filter(i => (i.cat || 'other') === c.id).length]));
    if (ui.cat !== 'all' && !counts[ui.cat]) ui.cat = 'all';
    const shown = all.filter(i => ui.cat === 'all' || (i.cat || 'other') === ui.cat);
    view.innerHTML = `<div class="page-head">
        <div><h1>Someday ☁️</h1>${all.length ? `<div class="sub-switch">${modeSwitch('some')}</div>` : ''}</div>
        <button class="plus-btn" id="add-s" aria-label="Add a someday idea">${icon('plus')}</button>
      </div>
      ${all.length ? '' : '<p class="sub one-line">Places you’d love to go, not tied to a trip yet.</p>'}
      ${all.length ? `${chipsHtml(all, counts, 0)}
      ${modeOf('some') === 'map' ? mapSection(shown, null, true) : `<div class="ideas">${shown.map(i => ideaCard(i, null)).join('')}</div>`}` : `<div class="empty">
        <div class="empty-emoji">☁️</div><h2>Your someday list</h2>
        <p>Saw a dreamy hotel or a restaurant you have to try one day? Save it here, then move it into a trip when it’s time.</p>
      </div>`}`;
    view.querySelectorAll('[data-cat]').forEach(b => b.onclick = () => { ui.cat = b.dataset.cat; Maps.forget(); render(); });
    view.querySelectorAll('[data-idea]').forEach(b => b.onclick = () => ideaDetail(null, all.find(i => i.id === b.dataset.idea)));
    sortableChips();
    bindMode('some');
    if (modeOf('some') === 'map') bindMap('someday:' + ui.cat, shown, null, null, i => ideaDetail(null, i));
    $('#add-s').onclick = () => ideaSheet({ trip: null, item: { cat: ui.cat === 'all' ? '' : ui.cat } });
  }

  function moveSheet(item) {
    const trips = sortedTrips().filter(canEdit);
    openSheet(`<div class="sheet-head"><h2>Add to which trip?</h2><button class="btn quiet" data-act="close">Cancel</button></div>
      <p class="hint" style="margin-top:-6px">It moves off your Someday list and onto the trip, where everyone on it can see it.</p>
      ${trips.length ? `<div class="menu">${trips.map(t => `<button data-t="${esc(t.id)}"><span class="menu-emoji">${esc(t.emoji || '✈️')}</span>${esc(t.name)}${t.place ? `<span class="menu-sub">${esc(t.place)}</span>` : ''}</button>`).join('')}</div>`
        : '<p class="empty small">You don’t have a trip you can add to yet.</p>'}
      <button class="btn ghost wide tight" id="mv-new">${icon('plus')} Start a new trip</button>`, async e => {
      const b = e.target.closest('[data-t]');
      if (b) {
        try { await API.moveToTrip(item, b.dataset.t); closeSheet(); location.hash = '#/t/' + b.dataset.t; toast('Moved to the trip ✨'); } catch (err) { oops(err); }
      } else if (e.target.closest('#mv-new')) {
        try {
          const tid = await API.createTrip({ name: item.where ? item.where.split(',')[0] + ' trip' : 'New trip', place: item.where || '', emoji: '✈️' });
          await API.moveToTrip(item, tid);
          closeSheet(); location.hash = '#/t/' + tid; toast('New trip started ✨');
        } catch (err) { oops(err); }
      }
    });
  }

  // ---------- settings ----------
  let lookT = null;
  function viewSettings() {
    const p = S.profile;
    view.innerHTML = `<div class="page-head"><div><h1>Settings</h1></div></div>
      <div class="settings">
        <div class="col">
          <div class="card">
            <h2>About me</h2>
            <div class="field tight"><label for="s-name">Name</label><input class="input" id="s-name" value="${esc(p.name)}"></div>
            ${user && user.email && !SAMPLE ? `<p class="hint">Signed in with Google as ${esc(user.email)}</p>` : ''}
          </div>
          ${SAMPLE ? `<div class="card">
            <h2>Sample mode</h2>
            <p class="hint">Look at the app as one of the pretend friends to see what they see.</p>
            <div class="field tight"><label for="s-as">View as</label><select class="input" id="s-as">${API.people().map(x => `<option value="${x.id}" ${x.id === S.me ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>
            <button class="btn ghost small" id="s-reset">Reset the sample data</button>
          </div>` : ''}
          <div class="card">
            <h2>Account</h2>
            <div class="stack tight">
              <button class="btn ghost" id="s-out">Sign out</button>
              <button class="btn danger" id="s-del">Delete my account</button>
            </div>
          </div>
        </div>
        <div class="col">
          <div class="card">
            <h2>My look</h2>
            <p class="hint">How Tripsy looks for you. Trips with a shared look show that look inside them — you can turn that off per trip.</p>
            <div id="s-look" class="tight"></div>
          </div>
        </div>
      </div>`;
    lookEditor($('#s-look'), p.look, l => {
      Themes.apply(l);
      clearTimeout(lookT);
      lookT = setTimeout(() => API.saveProfile({ look: l }).catch(oops), 400);
    });
    $('#s-name').onchange = e => { const v = e.target.value.trim(); if (v) API.saveProfile({ name: v }).then(() => toast('Saved'), oops); };
    $('#s-out').onclick = () => (SAMPLE ? toast('No signing out in sample mode') : API.signOut());
    $('#s-del').onclick = async () => {
      if (!(await ask('Delete your account?', 'Your Someday list goes away and you’ll leave every trip. Trips you own pass to the next person on them. This can’t be undone.', 'Delete everything', { danger: true }))) return;
      try { await API.deleteAccount(); } catch (e) { oops(e); }
    };
    if (SAMPLE) {
      $('#s-as').onchange = e => API.viewAs(e.target.value);
      $('#s-reset').onclick = async () => { if (await ask('Reset sample data?', 'Puts the pretend trips back the way they started.', 'Reset')) API.resetSample(); };
    }
  }
})();
