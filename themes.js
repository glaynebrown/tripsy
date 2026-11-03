/* Looks: a palette (preset or custom colors) + a font pairing.
   A look is { palette, custom: { bg, accent, ink }, font }.
   Each person has their own look; a trip can carry a shared look that members
   see inside that trip unless they chose "keep mine". */

const Themes = (() => {
  // bg, card, ink, accent, deep, soft, pin = the little sparkle color
  const PALETTES = {
    lavender: { name: 'Lavender Dream', bg: '#F7F3F9', card: '#FFFDFF', ink: '#4A3F57', accent: '#B9A2D8', deep: '#8263AD', soft: '#EEE6F7', glow: '#F6D7E8' },
    blossom:  { name: 'Peach Blossom',  bg: '#FCF5F1', card: '#FFFDFB', ink: '#55433D', accent: '#F0B39F', deep: '#C07562', soft: '#FBE7DF', glow: '#FFE7C9' },
    candy:    { name: 'Cotton Candy',   bg: '#FAF3F7', card: '#FFFDFE', ink: '#523F4B', accent: '#F2A6C4', deep: '#C2668F', soft: '#FBE4EE', glow: '#D9E8FA' },
    rose:     { name: 'Rosé',           bg: '#F8F1F1', card: '#FFFCFC', ink: '#4F3E40', accent: '#D8A1A7', deep: '#A6616A', soft: '#F3E1E3', glow: '#F5E3CF' },
    seafoam:  { name: 'Seafoam Mist',   bg: '#F2F8F6', card: '#FCFFFE', ink: '#334A45', accent: '#9CCFC0', deep: '#4A8E7D', soft: '#DFF0EA', glow: '#E8F2D9' },
    sky:      { name: 'Cloud Nine',     bg: '#F3F6FB', card: '#FDFEFF', ink: '#38435A', accent: '#A9C2E8', deep: '#5D7FB5', soft: '#E2EBF8', glow: '#F1E1F4' },
    golden:   { name: 'Golden Hour',    bg: '#FBF6EE', card: '#FFFDF9', ink: '#4F4334', accent: '#E8C083', deep: '#AD813E', soft: '#F6EAD5', glow: '#F7D9CF' },
  };

  const FONTS = {
    dreamy:    { name: 'Dreamy',      head: "'Playfair Display', Georgia, serif",    body: "'Quicksand', system-ui, sans-serif", weight: 500, scale: 1,    css: 'family=Playfair+Display:wght@500;600&family=Quicksand:wght@400;500;600;700' },
    romantic:  { name: 'Romantic',    head: "'Cormorant Garamond', Georgia, serif",  body: "'Lato', system-ui, sans-serif",      weight: 600, scale: 1.15, css: 'family=Cormorant+Garamond:wght@500;600;700&family=Lato:wght@400;700' },
    script:    { name: 'Love Letter', head: "'Dancing Script', cursive",             body: "'Quicksand', system-ui, sans-serif", weight: 600, scale: 1.2,  css: 'family=Dancing+Script:wght@500;600;700&family=Quicksand:wght@400;500;600;700' },
    storybook: { name: 'Storybook',   head: "'Fraunces', Georgia, serif",            body: "'Nunito', system-ui, sans-serif",    weight: 500, scale: 1,    css: 'family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Nunito:wght@400;600;700' },
    postcard:  { name: 'Postcard',    head: "'DM Serif Display', Georgia, serif",    body: "'DM Sans', system-ui, sans-serif",   weight: 400, scale: 1.02, css: 'family=DM+Serif+Display&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700' },
    clean:     { name: 'Clean',       head: "'Outfit', system-ui, sans-serif",       body: "'Outfit', system-ui, sans-serif",    weight: 600, scale: 0.96, css: 'family=Outfit:wght@400;500;600;700' },
  };

  const DEFAULT = { palette: 'candy', font: 'dreamy' };
  const fontUrl = f => `https://fonts.googleapis.com/css2?${FONTS[f].css}&display=swap`;

  // ---- color math for custom palettes ----
  const hex = h => { h = String(h || '').replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); const n = parseInt(h, 16); return isNaN(n) || h.length !== 6 ? null : [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const toHex = rgb => '#' + rgb.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase();
  const mix = (a, b, t) => { const A = hex(a), B = hex(b); return toHex(A.map((v, i) => v + (B[i] - v) * t)); };
  const lum = h => { const [r, g, b] = hex(h).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const validHex = h => !!hex(h);

  // Build a whole palette from three picks. "deep" (buttons, links) is the
  // accent darkened until white text and the background both read clearly.
  function fromCustom(c) {
    const bg = validHex(c && c.bg) ? c.bg : '#FAF3F7';
    const accent = validHex(c && c.accent) ? c.accent : '#F2A6C4';
    let ink = validHex(c && c.ink) ? c.ink : mix(accent, '#2B2530', 0.82);
    if (contrast(ink, bg) < 4.5) ink = lum(bg) > 0.4 ? '#2E2833' : '#FAF7FB';
    let deep = mix(accent, ink, 0.3), t = 0.3;
    while (contrast(deep, '#FFFFFF') < 4 && t < 0.9) { t += 0.08; deep = mix(accent, ink, t); }
    return { name: 'My colors', bg, card: mix(bg, '#FFFFFF', 0.7), ink, accent, deep, soft: mix(bg, accent, 0.22), glow: mix(bg, accent, 0.4) };
  }

  const paletteOf = look => (look && look.palette === 'custom' ? fromCustom(look.custom) : PALETTES[look && look.palette] || PALETTES[DEFAULT.palette]);
  const fontOf = look => (look && FONTS[look.font] ? look.font : DEFAULT.font);

  // CSS variables for a look -- used on the whole page, and on trip cards.
  function vars(look) {
    const p = paletteOf(look);
    const f = FONTS[fontOf(look)];
    return {
      '--bg': p.bg, '--card': p.card, '--ink': p.ink, '--accent': p.accent, '--deep': p.deep, '--soft': p.soft, '--glow': p.glow,
      '--muted': mix(p.ink, p.bg, 0.42), '--faint': mix(p.ink, p.bg, 0.62), '--line': mix(p.bg, p.ink, 0.1), '--softer': mix(p.bg, p.soft, 0.5),
      '--danger': '#B4655E', '--head': f.head, '--body': f.body, '--head-weight': f.weight, '--head-scale': f.scale,
    };
  }
  const styleAttr = look => Object.entries(vars(look)).map(([k, v]) => `${k}:${v}`).join(';');

  function apply(look) {
    const root = document.documentElement;
    const v = vars(look);
    for (const k in v) root.style.setProperty(k, v[k]);
    const f = fontOf(look);
    const link = document.getElementById('fonts');
    if (link && link.dataset.font !== f) { link.href = fontUrl(f); link.dataset.font = f; }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = v['--bg'];
    try { localStorage.setItem('tr-look', JSON.stringify(look || DEFAULT)); } catch (e) {}
  }

  // Load every font once, so the font picker can show each one.
  function loadAllFonts() {
    if (document.getElementById('all-fonts')) return;
    const l = document.createElement('link');
    l.id = 'all-fonts'; l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?' + Object.values(FONTS).map(f => f.css).join('&') + '&display=swap';
    document.head.appendChild(l);
  }

  const same = (a, b) => JSON.stringify(clean(a)) === JSON.stringify(clean(b));
  function clean(look) {
    look = look || DEFAULT;
    const out = { palette: look.palette || DEFAULT.palette, font: fontOf(look) };
    if (out.palette === 'custom') out.custom = { bg: (look.custom || {}).bg || '', accent: (look.custom || {}).accent || '', ink: (look.custom || {}).ink || '' };
    return out;
  }

  return { PALETTES, FONTS, DEFAULT, paletteOf, fontOf, vars, styleAttr, apply, loadAllFonts, fromCustom, validHex, same, clean, fontUrl };
})();
