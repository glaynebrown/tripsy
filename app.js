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
  const ui = { cat: 'all' };

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
  const sortedTrips = () => S.trips.slice().sort((a, b) => (a.start || '9') .localeCompare(b.start || '9') || (b.createdAt || 0) - (a.createdAt || 0));
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
  function openSheet(html, onClick) {
    sheet.innerHTML = `<div class="grab"></div>${html}`;
    sheetWrap.hidden = false;
    sheet.scrollTop = 0;
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
  window.addEventListener('hashchange', () => { noteJoin(); ui.cat = 'all'; if (!sheetWrap.hidden) closeSheet(); $('#dialog-wrap').hidden = true; render(); window.scrollTo(0, 0); });
  view.addEventListener('focusout', () => setTimeout(() => { if (pending && !typing()) render(); }, 0));
  const typing = () => view.contains(document.activeElement) && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && !/checkbox|radio|color/.test(document.activeElement.type);

  function route() {
    const h = location.hash.replace(/^#\/?/, '');
    const [name, arg] = h.split('/');
    return { name: name || 'trips', arg: arg ? decodeURIComponent(arg) : '' };
  }

  function applyPageLook() {
    if (!S || !S.profile) return;
    const r = route();
    Themes.apply(r.name === 't' ? lookFor(tripById(r.arg)) : S.profile.look);
  }

  function render() {
    if (!S) return;
    if (typing() || !sheetWrap.hidden) { pending = true; return; }
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
    (screens[r.name] || viewTrips)(r.arg);
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
    return `<a class="trip-card" href="#/t/${esc(t.id)}" style="${Themes.styleAttr(look)}">
      <div class="trip-cover ${t.cover ? 'photo' : ''}">${t.cover ? coverImg(t, 'cover-img') : `<span class="trip-emoji">${esc(t.emoji || '✈️')}</span>`}${soon ? `<span class="soon">${esc(soon)}</span>` : ''}</div>
      <div class="trip-body">
        <h3>${esc(t.name)}</h3>
        ${t.place ? `<div class="trip-place">${icon('pin')}${esc(t.place)}</div>` : ''}
        <div class="trip-when">${esc(when)}</div>
        <div class="trip-foot">
          <span class="avs">${t.members.slice(0, 5).map(m => avatar(t, m)).join('')}${t.members.length > 5 ? `<span class="av more">+${t.members.length - 5}</span>` : ''}</span>
          <span class="trip-count">${ideas.length} idea${ideas.length === 1 ? '' : 's'}${musts ? ` · ${musts} must-do${musts === 1 ? '' : 's'}` : ''}</span>
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
  function viewTrip(tid) {
    const t = tripById(tid);
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

    view.innerHTML = `<a class="back" href="#/trips">${icon('back')} Trips</a>
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
        </div>
        <div class="hero-acts">
          <button class="btn soft small" id="invite">${icon('person-plus')} Invite</button>
          <button class="icon-btn" id="more" aria-label="Trip options">${icon('dots')}</button>
        </div>
      </section>
      ${t.look && (S.profile.keepMine || {})[t.id] ? `<p class="look-note">${icon('palette')} You’re seeing your own look here. <button class="linkbtn" id="use-look">Use the trip’s look</button></p>` : ''}
      ${all.length ? `<div class="chips scroll">
        <button class="chip ${ui.cat === 'all' ? 'on' : ''}" data-cat="all">All <span class="n">${all.length}</span></button>
        ${musts ? `<button class="chip ${ui.cat === 'must' ? 'on' : ''}" data-cat="must">💖 Must-dos <span class="n">${musts}</span></button>` : ''}
        ${CATS.filter(c => counts[c.id]).map(c => `<button class="chip ${ui.cat === c.id ? 'on' : ''}" data-cat="${c.id}">${c.emoji} ${c.name} <span class="n">${counts[c.id]}</span></button>`).join('')}
      </div>
      <div class="ideas">${shown.map(i => ideaCard(i, t)).join('')}</div>` : `<div class="empty">
        <div class="empty-emoji">🗺️</div>
        <h2>Start dreaming</h2>
        <p>${edit ? 'Add places to see, restaurants, stays — anything you might want to do.' : 'Nothing here yet. You can see this trip but not add to it.'}</p>
      </div>`}
      ${edit ? `<button class="fab" id="add">${icon('plus')}<span>Add idea</span></button>` : ''}`;

    view.querySelectorAll('[data-cat]').forEach(b => b.onclick = () => { ui.cat = b.dataset.cat; render(); });
    view.querySelectorAll('[data-idea]').forEach(b => b.onclick = () => ideaDetail(t, all.find(i => i.id === b.dataset.idea)));
    if ($('#add')) $('#add').onclick = () => ideaSheet({ trip: t, item: { cat: ['all', 'must'].includes(ui.cat) ? '' : ui.cat, must: ui.cat === 'must' } });
    $('#invite').onclick = () => inviteSheet(t);
    $('#people').onclick = () => peopleSheet(t);
    $('#more').onclick = () => tripMenu(t);
    if ($('#use-look')) $('#use-look').onclick = () => API.setKeepMine(t.id, false).catch(oops);
  }

  function ideaCard(i, t) {
    const c = catOf(i.cat);
    return `<button class="idea" data-idea="${esc(i.id)}">
      ${i.photo ? `<img class="idea-photo" src="${esc(i.photo)}" alt="" loading="lazy">` : `<div class="idea-photo none">${c.emoji}</div>`}
      <div class="idea-body">
        <div class="idea-tags"><span class="tag">${c.emoji} ${esc(c.name)}</span>${i.must ? '<span class="tag must">💖 Must-do</span>' : ''}</div>
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
        ${i.address ? `<a class="openlink" href="${esc(mapsUrl(i.address, t))}" target="_blank" rel="noopener">${icon('pin')} ${esc(i.address)}</a>` : ''}
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
    const d = { cat: '', name: '', photo: '', link: '', address: '', notes: '', must: false, where: '', ...item };
    const isNew = !d.id;
    const draw = () => {
      openSheet(`<div class="sheet-head"><h2>${isNew ? 'New idea' : 'Edit idea'}</h2><button class="btn quiet" data-act="close">Cancel</button></div>
        <div class="cat-pick">${CATS.map(c => `<button type="button" class="${d.cat === c.id ? 'on' : ''}" data-c="${c.id}"><span>${c.emoji}</span>${c.name}</button>`).join('')}</div>
        <div class="field"><label for="f-name">Name</label><input class="input" id="f-name" value="${esc(d.name)}" placeholder="${{ food: 'Restaurant or café', stay: 'Hotel, Airbnb…', sights: 'Place to see', do: 'Something to do', shop: 'Shop or market' }[d.cat] || 'What is it?'}"></div>
        ${trip ? '' : `<div class="field"><label for="f-where">Where</label><input class="input" id="f-where" value="${esc(d.where)}" placeholder="City or country"></div>`}
        <div class="photo-row">
          <button type="button" class="photo-btn" id="f-pic">${d.photo ? `<img src="${esc(d.photo)}" alt="">` : `<span>${icon('photo')}<small>Add photo</small></span>`}</button>
          <div class="photo-side">
            <input class="input" id="f-link" type="url" inputmode="url" value="${esc(d.link)}" placeholder="Link (website, Instagram…)">
            <input class="input" id="f-addr" value="${esc(d.address)}" placeholder="Address (opens in Maps)">
          </div>
        </div>
        ${d.photo ? '<button type="button" class="linkbtn small-link" id="f-nophoto">Remove photo</button>' : ''}
        <textarea class="input notes" id="f-notes" placeholder="Notes — hours, what to order, tips…">${esc(d.notes)}</textarea>
        <button type="button" class="must-toggle ${d.must ? 'on' : ''}" id="f-must">💖 Must-do</button>
        <div class="sheet-foot"><button class="btn wide" id="f-save">${isNew ? 'Add idea' : 'Save'}</button></div>`, onClick);
    };
    const grab = () => {
      d.name = $('#f-name').value; d.link = $('#f-link').value; d.address = $('#f-addr').value; d.notes = $('#f-notes').value;
      if ($('#f-where')) d.where = $('#f-where').value;
    };
    async function onClick(e) {
      const c = e.target.closest('[data-c]');
      if (c) { grab(); d.cat = c.dataset.c; draw(); return; }
      if (e.target.closest('#f-must')) { grab(); d.must = !d.must; draw(); return; }
      if (e.target.closest('#f-nophoto')) { grab(); d.photo = ''; draw(); return; }
      if (e.target.closest('#f-pic')) { grab(); const p = await pickPhoto(); if (p) { d.photo = p; draw(); } return; }
      if (e.target.closest('#f-save')) {
        grab();
        if (!d.name.trim()) { $('#f-name').focus(); return toast('Give it a name.'); }
        let link = d.link.trim();
        if (link && !/^https?:\/\//i.test(link)) link = 'https://' + link;
        const out = { cat: d.cat || 'other', name: d.name.trim(), photo: d.photo || '', link, address: d.address.trim(), notes: d.notes.trim(), must: !!d.must };
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
        ${edit ? `<button data-m="details">${icon('edit')} Trip name, place & dates</button>` : ''}
        <button data-m="look">${icon('palette')} Trip look ${t.look ? `<span class="menu-sub">${keep ? 'Using my own' : 'Shared look on'}</span>` : '<span class="menu-sub">None — everyone sees their own</span>'}</button>
        <button data-m="people">${icon('person-plus')} People & invites</button>
        ${own ? `<button data-m="delete" class="danger-row">Delete trip</button>` : `<button data-m="leave" class="danger-row">Leave trip</button>`}
      </div>`, async e => {
      const m = e.target.closest('[data-m]');
      if (!m) return;
      const k = m.dataset.m;
      if (k === 'details') tripSheet(t);
      else if (k === 'look') tripLookSheet(t);
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
        <div><h1>Someday ☁️</h1><p class="sub">Places you’d love to go, not tied to a trip yet.</p></div>
        <button class="plus-btn" id="add-s" aria-label="Add a someday idea">${icon('plus')}</button>
      </div>
      ${all.length ? `<div class="chips scroll">
        <button class="chip ${ui.cat === 'all' ? 'on' : ''}" data-cat="all">All <span class="n">${all.length}</span></button>
        ${CATS.filter(c => counts[c.id]).map(c => `<button class="chip ${ui.cat === c.id ? 'on' : ''}" data-cat="${c.id}">${c.emoji} ${c.name} <span class="n">${counts[c.id]}</span></button>`).join('')}
      </div>
      <div class="ideas">${shown.map(i => ideaCard(i, null)).join('')}</div>` : `<div class="empty">
        <div class="empty-emoji">☁️</div><h2>Your someday list</h2>
        <p>Saw a dreamy hotel or a restaurant you have to try one day? Save it here, then move it into a trip when it’s time.</p>
      </div>`}`;
    view.querySelectorAll('[data-cat]').forEach(b => b.onclick = () => { ui.cat = b.dataset.cat; render(); });
    view.querySelectorAll('[data-idea]').forEach(b => b.onclick = () => ideaDetail(null, all.find(i => i.id === b.dataset.idea)));
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
