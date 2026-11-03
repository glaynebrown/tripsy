/* Maps: pins, place search, and the map views.
   Uses MapLibre (loaded the first time a map is opened) with free OpenFreeMap
   map tiles -- no key, no limits -- recolored to the current look. Place
   search is Photon (OpenStreetMap data), also free with no key.

   A pin style is { color, emoji, shape } where shape is drop | round | heart | star.
   What a pin looks like: the built-in default for its kind, then the trip's
   default for that kind (trip.pins[cat]), then the idea's own (idea.pin). */

const Maps = (() => {
  const LIB = 'https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/4.7.1/';
  const STYLE = 'https://tiles.openfreemap.org/styles/positron';

  const BASE = {
    sights: { color: '#8FB8E6', emoji: '📸', shape: 'drop' },
    food:   { color: '#F2A6C4', emoji: '🍽️', shape: 'drop' },
    stay:   { color: '#B9A2D8', emoji: '🛏️', shape: 'drop' },
    do:     { color: '#F0B39F', emoji: '🎟️', shape: 'drop' },
    shop:   { color: '#8FCDB9', emoji: '🛍️', shape: 'drop' },
    other:  { color: '#E8C083', emoji: '✨', shape: 'drop' },
  };
  const COLORS = ['#F2A6C4', '#E57FA8', '#F6C6D8', '#F0B39F', '#F3D08A', '#E8C083', '#8FCDB9', '#9CCFC0', '#8FB8E6', '#A9C2E8', '#B9A2D8', '#9B84C9', '#D8A1A7', '#6F7FA8', '#5A4A5E', '#FFFFFF'];
  const EMOJI = ['📍', '⭐', '💖', '✨', '📸', '🏛️', '🏰', '⛪', '🗼', '🌉', '🏖️', '🌊', '⛰️', '🌸', '🌳', '🍽️', '☕', '🍝', '🍣', '🍕', '🥐', '🍦', '🍷', '🍸', '🛏️', '🏨', '🎟️', '🎡', '🎭', '🎶', '🛍️', '👗', '🚆', '✈️', '⛵', '🚲', '🧖‍♀️', '🐚', '🎀', '🦄'];
  const SHAPES = ['drop', 'round', 'heart', 'star'];

  const styleFor = (item, trip) => {
    const cat = BASE[item.cat] ? item.cat : 'other';
    return { ...BASE[cat], ...((trip && trip.pins && trip.pins[cat]) || {}), ...(item.pin || {}) };
  };

  // ---- pin drawing ----
  const SIZES = { drop: [40, 52, 20, 50], round: [40, 40, 20, 20], heart: [46, 42, 23, 21], star: [46, 46, 23, 24] };
  const PATHS = {
    drop: 'M20 50C20 50 4 32.5 4 19a16 16 0 0 1 32 0c0 13.5-16 31-16 31z',
    round: 'M20 3.5a16.5 16.5 0 1 1 0 33a16.5 16.5 0 1 1 0-33z',
    heart: 'M23 39S3.5 27 3.5 14A10 10 0 0 1 23 9.5 10 10 0 0 1 42.5 14C42.5 27 23 39 23 39z',
    star: 'M23 2.5l5.9 12.6 13.7 1.7-10.1 9.5 2.6 13.6L23 33.2l-12.1 6.7 2.6-13.6L3.4 16.8l13.7-1.7z',
  };
  const CENTER = { drop: [20, 19], round: [20, 20], heart: [23, 20], star: [23, 24] };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const safeColor = c => (/^#[0-9a-f]{3,8}$/i.test(c || '') ? c : '#F2A6C4');

  // opts: { must, scale, done }
  function pinHtml(st, opts = {}) {
    const shape = SIZES[st.shape] ? st.shape : 'drop';
    const [w, h] = SIZES[shape];
    const k = opts.scale || 1;
    const [cx, cy] = CENTER[shape];
    return `<span class="pin pin-${shape}${opts.done ? ' done' : ''}" style="width:${w * k}px;height:${h * k}px">
      <svg viewBox="0 0 ${w} ${h}" width="${w * k}" height="${h * k}" aria-hidden="true"><path d="${PATHS[shape]}" fill="${safeColor(st.color)}" stroke="#fff" stroke-width="2.4" stroke-linejoin="round"/></svg>
      <span class="pin-emoji" style="left:${(cx / w) * 100}%;top:${(cy / h) * 100}%;font-size:${15 * k}px">${esc(st.emoji || '')}</span>
      ${opts.must ? `<span class="pin-must" style="font-size:${10 * k}px">💖</span>` : ''}
    </span>`;
  }

  // ---- MapLibre, loaded once ----
  let loading = null;
  function load() {
    if (window.maplibregl) return Promise.resolve(window.maplibregl);
    if (loading) return loading;
    loading = new Promise((res, rej) => {
      const css = document.createElement('link');
      css.rel = 'stylesheet'; css.href = LIB + 'maplibre-gl.min.css';
      document.head.appendChild(css);
      const js = document.createElement('script');
      js.src = LIB + 'maplibre-gl.min.js';
      js.onload = () => res(window.maplibregl);
      js.onerror = () => { loading = null; rej(new Error('The map couldn’t load — check your connection.')); };
      document.head.appendChild(js);
    });
    return loading;
  }

  // The map style, recolored to the look and labeled in English where it can be.
  let baseStyle = null;
  async function styleForLook() {
    if (!baseStyle) {
      const r = await fetch(STYLE);
      if (!r.ok) throw new Error('The map couldn’t load — check your connection.');
      baseStyle = await r.json();
    }
    const css = getComputedStyle(document.documentElement);
    const v = k => css.getPropertyValue(k).trim();
    const bg = v('--bg') || '#FAF3F7', soft = v('--soft') || '#FBE4EE', glow = v('--glow') || '#D9E8FA', ink = v('--ink') || '#523F4B';
    const st = JSON.parse(JSON.stringify(baseStyle));
    for (const l of st.layers) {
      l.paint = l.paint || {};
      if (l.id === 'background') l.paint['background-color'] = mixHex(bg, soft, 0.3);
      else if (l.id === 'water') l.paint['fill-color'] = mixHex('#CFE2F3', glow, 0.18);
      else if (l.id === 'park' || l.id === 'landcover_wood') { l.paint['fill-color'] = '#E4EFDF'; l.paint['fill-opacity'] = 0.7; }
      else if (l.id === 'landuse_residential') l.paint['fill-color'] = soft;
      if (l.type === 'symbol' && l.layout && l.layout['text-field']) {
        l.layout['text-field'] = ['coalesce', ['get', 'name:en'], ['get', 'name:latin'], ['get', 'name']];
        l.paint['text-color'] = ink;
      }
    }
    return st;
  }
  function mixHex(a, b, t) {
    const h = x => { x = x.replace('#', ''); if (x.length === 3) x = x.split('').map(c => c + c).join(''); const n = parseInt(x, 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
    try { const A = h(a), B = h(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join(''); } catch (e) { return a; }
  }

  function pinEl(st, opts) {
    const wrap = document.createElement('div');
    wrap.className = 'pin-wrap';
    wrap.innerHTML = pinHtml(st, opts);
    return wrap;
  }
  const anchorOf = st => (st.shape === 'drop' || !SIZES[st.shape] ? 'bottom' : 'center');

  async function makeMap(gl, el, opts = {}) {
    const map = new gl.Map({
      container: el, style: await styleForLook(), center: [0, 25], zoom: 1, attributionControl: false,
      dragRotate: false, pitchWithRotate: false, touchPitch: false, ...opts,
    });
    map.touchZoomRotate.disableRotation();
    map.addControl(new gl.AttributionControl({ compact: true }), 'bottom-left');
    if (!opts.noZoom) map.addControl(new gl.NavigationControl({ showCompass: false }), 'bottom-right');
    // the map credit starts folded into its ⓘ button
    map.once('load', () => el.querySelectorAll('.maplibregl-compact-show').forEach(x => x.classList.remove('maplibregl-compact-show')));
    map._lookKey = lookKey();
    return map;
  }
  const lookKey = () => getComputedStyle(document.documentElement).getPropertyValue('--soft').trim() + getComputedStyle(document.documentElement).getPropertyValue('--glow').trim();

  // ---- place search (Photon) ----
  function placeLabel(p) {
    const street = [p.housenumber, p.street].filter(Boolean).join(' ');
    const town = p.city || p.town || p.village || p.district || p.county;
    const parts = [p.name, street && street !== p.name ? street : '', town && town !== p.name ? town : '', p.state && p.state !== town ? p.state : '', p.country && p.country !== p.name ? p.country : ''].filter(Boolean);
    return { title: p.name || street || town || p.country || 'Place', sub: parts.slice(1).join(', '), full: parts.join(', ') };
  }
  // near: { lat, lng } to prefer results close to the trip
  async function search(q, near) {
    q = (q || '').trim();
    if (q.length < 3) return [];
    let url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=6&lang=en`;
    if (near) url += `&lat=${near.lat.toFixed(3)}&lon=${near.lng.toFixed(3)}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error('Place search isn’t answering right now — try again in a bit.');
    const j = await r.json();
    return (j.features || []).map(f => ({ ...placeLabel(f.properties || {}), lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] }));
  }

  // Middle of a set of spots, for biasing searches.
  function centerOf(items) {
    const locs = items.map(i => i.loc).filter(Boolean);
    if (!locs.length) return null;
    return { lat: locs.reduce((a, l) => a + l.lat, 0) / locs.length, lng: locs.reduce((a, l) => a + l.lng, 0) / locs.length };
  }
  // A trip with no pins yet: find its "where" once (kept for this visit only).
  const placeCache = {};
  async function placeCenter(text) {
    const key = (text || '').trim().toLowerCase();
    if (!key) return null;
    if (key in placeCache) return placeCache[key];
    try {
      const first = key.split(/[·,/&+]| and /)[0].trim();
      const [hit] = await search(first || key);
      placeCache[key] = hit ? { lat: hit.lat, lng: hit.lng } : null;
    } catch (e) { return null; }
    return placeCache[key];
  }

  // ---- the big map (a trip's, or Someday's) ----
  // One map kept alive and moved into each screen's slot, so live updates
  // don't reset where you've zoomed to.
  let big = null; // { map, el, markers, key }
  let making = null;
  async function show(slot, { key, items, trip, place, onOpen }) {
    const gl = await load();
    if (!slot.isConnected) return;
    if (!big && !making) {
      making = (async () => {
        const el = document.createElement('div');
        el.className = 'tr-map';
        slot.appendChild(el);
        const map = await makeMap(gl, el);
        big = { map, el, markers: [], key: null };
        el.addEventListener('click', e => {
          const b = e.target.closest('[data-open]');
          if (b && big.onOpen) big.onOpen(b.dataset.open);
        });
      })();
      try { await making; } finally { making = null; }
      if (!slot.isConnected) return;
      if (big.el.parentNode !== slot) slot.appendChild(big.el);
    } else {
      if (making) await making;
      if (!slot.isConnected) return;
      slot.appendChild(big.el);
      if (big.map._lookKey !== lookKey()) { big.map._lookKey = lookKey(); big.map.setStyle(await styleForLook()); }
    }
    big.onOpen = onOpen;
    big.map.resize();

    big.markers.forEach(m => m.remove());
    big.markers = [];
    const pts = [];
    for (const i of items) {
      if (!i.loc) continue;
      const st = styleFor(i, trip);
      const pop = new gl.Popup({ closeButton: false, className: 'tr-pop', maxWidth: '260px', offset: anchorOf(st) === 'bottom' ? [0, -46] : 18 })
        .setHTML(`<button class="pop" data-open="${esc(i.id)}">
          ${i.photo ? `<img src="${esc(i.photo)}" alt="">` : ''}
          <span><b>${esc(i.name)}</b>${i.address || i.where ? `<small>${esc(i.address || i.where)}</small>` : ''}<em>Open ›</em></span>
        </button>`);
      const m = new gl.Marker({ element: pinEl(st, { must: i.must }), anchor: anchorOf(st) }).setLngLat([i.loc.lng, i.loc.lat]).setPopup(pop).addTo(big.map);
      m.getElement().title = i.name;
      big.markers.push(m);
      pts.push([i.loc.lng, i.loc.lat]);
    }
    // Frame the pins when the map is opened for a different trip or filter.
    if (big.key !== key) {
      big.key = key;
      if (pts.length > 1) {
        const b = pts.reduce((bb, p) => bb.extend(p), new gl.LngLatBounds(pts[0], pts[0]));
        big.map.fitBounds(b, { padding: 50, maxZoom: 15, duration: 0 });
      } else if (pts.length === 1) big.map.jumpTo({ center: pts[0], zoom: 14 });
      else {
        big.map.jumpTo({ center: [0, 25], zoom: 1 });
        const c = place ? await placeCenter(place) : null;
        if (c && big.key === key) big.map.jumpTo({ center: [c.lng, c.lat], zoom: 10 });
      }
    }
    setTimeout(() => big && big.map.resize(), 60);
  }
  const forget = () => { if (big) big.key = null; };

  // ---- a small map inside the idea editor: tap to drop or move the pin ----
  // opts: { loc, near, style, onPick(loc) } -> { restyle(style), destroy() }
  async function picker(el, opts) {
    const gl = await load();
    if (!el.isConnected) return null;
    const start = opts.loc ? { center: [opts.loc.lng, opts.loc.lat], zoom: 15 } : opts.near ? { center: [opts.near.lng, opts.near.lat], zoom: 11 } : { center: [0, 25], zoom: 0.6 };
    const map = await makeMap(gl, el, start);
    let marker = null;
    const put = loc => {
      if (!marker) {
        const st = opts.style || BASE.other;
        marker = new gl.Marker({ element: pinEl(st), anchor: anchorOf(st), draggable: true }).setLngLat([loc.lng, loc.lat]).addTo(map);
        marker.on('dragend', () => { const p = marker.getLngLat(); opts.onPick({ lat: p.lat, lng: p.lng }); });
      } else marker.setLngLat([loc.lng, loc.lat]);
    };
    if (opts.loc) put(opts.loc);
    map.on('click', e => { put(e.lngLat); opts.onPick({ lat: e.lngLat.lat, lng: e.lngLat.lng }); });
    setTimeout(() => map.resize(), 80);
    return {
      restyle(st) {
        opts.style = st;
        if (!marker) return;
        const p = marker.getLngLat();
        marker.remove(); marker = null;
        put({ lat: p.lat, lng: p.lng });
      },
      destroy() { map.remove(); },
    };
  }

  return { BASE, COLORS, EMOJI, SHAPES, styleFor, pinHtml, search, centerOf, placeCenter, show, forget, picker, load };
})();
