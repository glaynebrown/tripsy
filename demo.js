/* Sample mode: the same calls as store.js, kept in this browser only, with
   pretend friends and trips. Used when firebase-config.js hasn't been filled
   in, so the app can be tried (and previewed) without a database.

   It follows the same "who can do what" as firestore.rules, and Settings has
   a "View as" switch to check it from a friend's side. */

const Demo = (() => {
  const KEY = 'tr-demo4';
  let db = null;
  let as = 'izzy';
  let cb = null;
  let userCb = null;
  const clone = o => JSON.parse(JSON.stringify(o));
  const newId = () => Math.random().toString(36).slice(2, 10);

  // Soft placeholder "photos" for the sample ideas.
  function pic(emoji, a, b) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="400" height="300" fill="url(#g)"/><text x="200" y="160" font-size="120" text-anchor="middle" dominant-baseline="middle">${emoji}</text></svg>`;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  function seed() {
    const now = Date.now();
    const idea = (cat, name, o) => ({ id: newId(), cat, name, createdAt: now - Math.random() * 3e9, by: 'izzy', ...o });
    const all = { izzy: 'edit', maddie: 'edit', soph: 'edit' };
    const ppl = ids => Object.fromEntries(ids.map(i => [i, { name: NAMES[i] }]));
    const out = {
      users: {
        izzy: { name: 'Izzy', look: { palette: 'lavender', font: 'dreamy' }, keepMine: {} },
        maddie: { name: 'Maddie', look: { palette: 'candy', font: 'script' }, keepMine: {} },
        soph: { name: 'Sophia', look: { palette: 'seafoam', font: 'postcard' }, keepMine: { amalfi: true } },
        ava: { name: 'Ava', look: { palette: 'golden', font: 'romantic' }, keepMine: {} },
      },
      trips: {
        amalfi: {
          name: 'Amalfi Coast Girls’ Trip', place: 'Positano, Italy', emoji: '🍋', start: '', end: '',
          owner: 'izzy', members: ['izzy', 'maddie', 'soph', 'ava'], roles: { ...all, ava: 'view' }, people: ppl(['izzy', 'maddie', 'soph', 'ava']),
          code: 'AMALFI-7K2', joinRole: 'edit', look: { palette: 'golden', font: 'romantic' }, createdAt: now - 9e8,
        },
        china: {
          name: 'China 2027', place: 'Beijing · Shanghai · Chengdu', emoji: '🏮', start: '2027-04-10', end: '2027-04-24',
          owner: 'maddie', members: ['maddie', 'izzy'], roles: { maddie: 'edit', izzy: 'edit' }, people: ppl(['maddie', 'izzy']),
          code: 'CHINA-P4Q', joinRole: 'edit', look: null, createdAt: now - 5e8,
        },
        nash: {
          name: 'Nashville Bach Weekend', place: 'Nashville, TN', emoji: '🤠', start: '', end: '',
          owner: 'soph', members: ['soph', 'izzy', 'maddie'], roles: { soph: 'edit', izzy: 'edit', maddie: 'edit' }, people: ppl(['soph', 'izzy', 'maddie']),
          code: 'NASHVI-3RT', joinRole: 'edit', look: { palette: 'candy', font: 'script' }, createdAt: now - 2e8,
        },
        paris: {
          name: 'Paris in the Spring', place: 'Paris, France', emoji: '🥐', start: '', end: '',
          owner: 'ava', members: ['ava', 'maddie'], roles: { ava: 'edit', maddie: 'edit' }, people: ppl(['ava', 'maddie']),
          code: 'PARIS-W8N', joinRole: 'view', look: null, createdAt: now - 1e8,
        },
      },
      ideas: {
        amalfi: [
          idea('sights', 'Path of the Gods hike', { loc: { lat: 40.6303, lng: 14.5408 },  photo: pic('🥾', '#F8E7C4', '#CFE3D8'), notes: 'Go early morning — bring water + good shoes. Ends above Positano.', must: true, address: 'Bomerano, Agerola' }),
          idea('food', 'Da Adolfo', { loc: { lat: 40.6197, lng: 14.4686 },  photo: pic('🐟', '#D7EAF2', '#F7E6C9'), notes: 'Beach restaurant you get to by little boat! Reserve ahead.', link: 'https://www.daadolfo.com/', by: 'maddie', must: true }),
          idea('food', 'Lemon granita stand', { loc: { lat: 40.6340, lng: 14.6027 },  photo: pic('🍋', '#FFF2B8', '#F9D9C6'), notes: 'Anywhere along the main road in Amalfi town.', by: 'soph' }),
          idea('stay', 'Hotel Poseidon', { loc: { lat: 40.6286, lng: 14.4880 },  photo: pic('🏨', '#F6DCD2', '#E7D6F0'), notes: 'Pool terrace with the view. Maybe split a suite?', link: 'https://www.hotelposeidonpositano.it/', address: 'Via Pasitea 148, Positano' }),
          idea('do', 'Boat day to Capri', { loc: { lat: 40.5507, lng: 14.2426 },  photo: pic('⛵', '#CFE5F5', '#E9DDF6'), notes: 'Private boat split 4 ways is about the same as the ferry.', by: 'maddie', must: true }),
          idea('shop', 'Sandal maker in Positano', { loc: { lat: 40.6281, lng: 14.4850 }, pin: { color: '#E8C083', emoji: '👡', shape: 'heart' },  photo: pic('👡', '#F3E2D3', '#F9EAD8'), notes: 'Custom leather sandals made while you wait', by: 'soph' }),
          idea('sights', 'Ravello gardens', { loc: { lat: 40.6492, lng: 14.6115 },  photo: pic('🌸', '#F6D9E6', '#E3EBD3'), notes: 'Villa Rufolo + Villa Cimbrone', by: 'izzy' }),
        ],
        china: [
          idea('sights', 'Mutianyu Great Wall', { loc: { lat: 40.4319, lng: 116.5704 },  photo: pic('🏯', '#F4DCCB', '#DCE6F2'), notes: 'Less crowded section — toboggan ride down!', must: true, by: 'maddie' }),
          idea('food', 'Peking duck at Siji Minfu', { loc: { lat: 39.9230, lng: 116.4040 },  photo: pic('🦆', '#F6E1C8', '#F2D3D0'), by: 'maddie' }),
          idea('sights', 'Chengdu Panda Base', { loc: { lat: 30.7330, lng: 104.1460 },  photo: pic('🐼', '#E2EEDC', '#F1F1F1'), notes: 'Go right at opening when they’re most active', must: true }),
          idea('do', 'The Bund at night', { photo: pic('🌃', '#D9D6F2', '#F2D7E6'), address: 'The Bund, Shanghai' }),
        ],
        nash: [
          idea('do', 'Pedal tavern', { photo: pic('🚲', '#F9D6E4', '#FCE9D2'), must: true, by: 'soph' }),
          idea('food', 'Biscuit Love', { photo: pic('🍯', '#FCEBC8', '#F6DACF'), notes: 'Get the bonuts', by: 'maddie' }),
          idea('do', 'Broadway honky tonks', { photo: pic('🎸', '#EED8F4', '#F9D9DE') }),
        ],
        paris: [
          idea('food', 'Café de Flore', { loc: { lat: 48.8541, lng: 2.3326 },  photo: pic('☕', '#EFE0D3', '#F4E4EE'), by: 'ava' }),
          idea('sights', 'Musée de l’Orangerie', { loc: { lat: 48.8638, lng: 2.3226 },  photo: pic('🪷', '#DDE9F4', '#E6F0DE'), notes: 'Monet water lilies', by: 'ava', must: true }),
        ],
      },
      someday: {
        izzy: [
          { id: newId(), cat: 'stay', name: 'Glass igloo in Finland', where: 'Lapland, Finland', loc: { lat: 68.43, lng: 27.42 }, notes: 'Northern lights from bed!!', photo: pic('🌌', '#D6DDF6', '#E6D6F2'), createdAt: now - 4e8 },
          { id: newId(), cat: 'sights', name: 'Lavender fields', where: 'Provence, France', loc: { lat: 43.83, lng: 5.78 }, notes: 'Late June – July', photo: pic('💜', '#E7DDF6', '#F4E6EF'), createdAt: now - 3e8 },
          { id: newId(), cat: 'food', name: 'Sushi omakase', where: 'Tokyo, Japan', createdAt: now - 2e8 },
        ],
        maddie: [], soph: [], ava: [],
      },
      codes: { AMALFI7K2: { tid: 'amalfi', code: 'AMALFI-7K2', role: 'edit' }, CHINAP4Q: { tid: 'china', code: 'CHINA-P4Q', role: 'edit' }, NASHVI3RT: { tid: 'nash', code: 'NASHVI-3RT', role: 'edit' }, PARISW8N: { tid: 'paris', code: 'PARIS-W8N', role: 'view' } },
    };
    // a started plan on the China trip (it has dates)
    const cn = name => out.ideas.china.find(i => i.name.includes(name)).id;
    const stop = (day, order, o) => ({ id: newId(), day, slot: '', time: '', order, by: 'maddie', createdAt: now, ...o });
    out.plan = {
      china: [
        stop('2027-04-10', 0, { text: 'Land in Beijing', emoji: '✈️', time: '14:15', note: 'Flight UA 851' }),
        stop('2027-04-10', 1, { idea: cn('Peking duck'), time: '19:30', slot: 'evening' }),
        stop('2027-04-11', 0, { idea: cn('Great Wall'), time: '08:00', slot: 'morning' }),
        stop('2027-04-16', 0, { idea: cn('Bund'), slot: 'evening' }),
        stop('2027-04-20', 0, { idea: cn('Panda'), time: '07:30', slot: 'morning', note: 'Get there right at opening' }),
      ],
    };
    // to-dos on the China trip
    const todo = (title, o) => ({ id: newId(), title, notes: '', for: 'all', due: '', before: null, done: {}, by: 'maddie', createdAt: now - Math.random() * 1e8, ...o });
    out.todos = {
      china: [
        todo('Passport valid 6+ months after the trip', { before: 90, done: { maddie: now } }),
        todo('Apply for the China visa', { before: 60, notes: 'Takes about 4 business days at the visa center. Need the hotel bookings first.' }),
        todo('International driver’s permit', { for: 'izzy', before: 30, notes: 'AAA office — bring 2 passport photos' }),
        todo('Book the Great Wall tour', { for: 'maddie', due: '2027-01-15' }),
        todo('Download Alipay + WeChat and add a card', { before: 14 }),
        todo('Get a VPN on our phones', { before: 7, notes: 'Google, Instagram etc. are blocked there' }),
      ],
    };
    return out;
  }
  const NAMES = { izzy: 'Izzy', maddie: 'Maddie', soph: 'Sophia', ava: 'Ava' };

  function load() {
    try { db = JSON.parse(localStorage.getItem(KEY)); } catch (e) { db = null; }
    if (!db || !db.users) db = seed();
    try { as = localStorage.getItem(KEY + '-as') || 'izzy'; } catch (e) {}
    if (!db.users[as]) as = 'izzy';
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { console.warn('sample save', e); }
    setTimeout(emit, 30);
  }
  const fail = msg => Promise.reject(new Error(msg));
  const tripOf = tid => db.trips[tid];
  const editor = tid => { const t = tripOf(tid); return t && t.members.includes(as) && t.roles[as] === 'edit'; };
  const owner = tid => { const t = tripOf(tid); return t && t.owner === as; };

  function emit() {
    if (!cb) return;
    const trips = Object.entries(db.trips).filter(([, t]) => t.members.includes(as)).map(([id, t]) => ({ id, ...clone(t) }));
    const ideas = {}, plan = {}, todos = {};
    for (const t of trips) { ideas[t.id] = clone(db.ideas[t.id] || []); plan[t.id] = clone((db.plan || {})[t.id] || []); todos[t.id] = clone((db.todos || {})[t.id] || []); }
    cb({ me: as, loaded: true, profile: db.users[as] ? clone(db.users[as]) : null, trips, ideas, plan, todos, someday: clone(db.someday[as] || []) });
  }

  load();

  const CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const rand = n => Array.from({ length: n }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('');
  const codeId = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const makeCode = name => {
    const word = (String(name || '').toUpperCase().match(/[A-Z]+/g) || ['TRIP']).sort((a, b) => b.length - a.length)[0].slice(0, 6);
    return (word.length >= 3 ? word : 'TRIP') + '-' + rand(3);
  };

  return {
    configured: false, sample: true, uid: () => as,
    onUser(f) { userCb = f; setTimeout(() => f({ uid: as, email: as + '@sample', name: NAMES[as] }), 0); },
    signIn: () => Promise.resolve(),
    signOut() { return Promise.resolve(); },
    start(f) { cb = f; emit(); },
    stop() { cb = null; },

    // sample-only: switch who you're looking as
    people: () => Object.keys(NAMES).map(id => ({ id, name: db.users[id].name })),
    viewAs(id) { as = id; try { localStorage.setItem(KEY + '-as', id); } catch (e) {} if (userCb) userCb({ uid: as, email: as + '@sample', name: NAMES[as] }); },
    resetSample() { db = seed(); save(); },

    createProfile(p) { db.users[as] = { ...p, keepMine: {} }; save(); return Promise.resolve(); },
    saveProfile(patch) {
      Object.assign(db.users[as], patch);
      if (patch.name) for (const t of Object.values(db.trips)) if (t.people[as]) t.people[as].name = patch.name;
      save(); return Promise.resolve();
    },
    setKeepMine(tid, keep) { const k = db.users[as].keepMine = db.users[as].keepMine || {}; if (keep) k[tid] = true; else delete k[tid]; save(); return Promise.resolve(); },

    createTrip(t) {
      const id = newId();
      let code = makeCode(t.name);
      while (db.codes[codeId(code)]) code = makeCode(t.name);
      db.trips[id] = { name: t.name, place: t.place || '', emoji: t.emoji || '✈️', start: t.start || '', end: t.end || '', cover: t.cover || '', coverPos: t.coverPos || null, owner: as, members: [as], roles: { [as]: 'edit' }, people: { [as]: { name: db.users[as].name } }, code, joinRole: 'edit', look: t.look || null, createdAt: Date.now() };
      db.codes[codeId(code)] = { tid: id, code, role: 'edit' };
      db.ideas[id] = [];
      save(); return Promise.resolve(id);
    },
    saveTrip(tid, patch) {
      if (!editor(tid)) return fail('Only people who can edit this trip can change it.');
      Object.assign(db.trips[tid], patch); save(); return Promise.resolve();
    },
    setRole(tid, who, role) { if (!owner(tid)) return fail('Only the trip’s owner can change that.'); db.trips[tid].roles[who] = role; save(); return Promise.resolve(); },
    setJoinRole(tid, role) { if (!owner(tid)) return fail('Only the trip’s owner can change that.'); const t = db.trips[tid]; t.joinRole = role; db.codes[codeId(t.code)].role = role; save(); return Promise.resolve(); },
    removePerson(tid, who) {
      const t = db.trips[tid];
      if (!owner(tid) && who !== as) return fail('Only the trip’s owner can remove people.');
      t.members = t.members.filter(m => m !== who); delete t.roles[who]; delete t.people[who];
      save(); return Promise.resolve();
    },
    newTripCode(tid) {
      if (!owner(tid)) return fail('Only the trip’s owner can change the code.');
      const t = db.trips[tid];
      delete db.codes[codeId(t.code)];
      t.code = makeCode(t.name);
      db.codes[codeId(t.code)] = { tid, code: t.code, role: t.joinRole };
      save(); return Promise.resolve(t.code);
    },
    join(raw) {
      const c = db.codes[codeId(raw)];
      if (codeId(raw).length < 4) return fail('That code looks too short.');
      if (!c) return fail('That code didn’t match a trip. Check it and try again.');
      const t = db.trips[c.tid];
      if (!t.members.includes(as)) { t.members.push(as); t.roles[as] = c.role || 'edit'; t.people[as] = { name: db.users[as].name }; }
      save(); return Promise.resolve(c.tid);
    },
    leaveTrip(tid) { return this.removePerson(tid, as); },
    deleteTrip(tid) {
      if (!owner(tid)) return fail('Only the trip’s owner can delete it.');
      delete db.codes[codeId(db.trips[tid].code)]; delete db.trips[tid]; delete db.ideas[tid]; if (db.plan) delete db.plan[tid];
      save(); return Promise.resolve();
    },

    saveIdea(tid, idea) {
      if (!editor(tid)) return fail('You can look at this trip but not change it.');
      const list = db.ideas[tid] = db.ideas[tid] || [];
      if (idea.id) { const i = list.findIndex(x => x.id === idea.id); if (i >= 0) list[i] = { ...list[i], ...idea }; save(); return Promise.resolve(idea.id); }
      const id = newId();
      list.push({ ...idea, id, by: as, createdAt: Date.now() });
      save(); return Promise.resolve(id);
    },
    deleteIdea(tid, id) {
      if (!editor(tid)) return fail('You can look at this trip but not change it.');
      db.ideas[tid] = (db.ideas[tid] || []).filter(x => x.id !== id);
      if (db.plan && db.plan[tid]) db.plan[tid] = db.plan[tid].filter(p => p.idea !== id);
      save(); return Promise.resolve();
    },

    savePlan(tid, item) {
      if (!editor(tid)) return fail('You can look at this trip but not change it.');
      const list = (db.plan = db.plan || {})[tid] = db.plan[tid] || [];
      if (item.id) { const i = list.findIndex(x => x.id === item.id); if (i >= 0) list[i] = { ...list[i], ...item }; save(); return Promise.resolve(item.id); }
      const id = newId();
      list.push({ ...item, id, by: as, createdAt: Date.now() });
      save(); return Promise.resolve(id);
    },
    addPlan(tid, items) {
      if (!editor(tid)) return fail('You can look at this trip but not change it.');
      const list = (db.plan = db.plan || {})[tid] = db.plan[tid] || [];
      for (const it of items) list.push({ ...it, id: newId(), by: as, createdAt: Date.now() });
      save(); return Promise.resolve();
    },
    movePlan(tid, moves) {
      if (!editor(tid)) return fail('You can look at this trip but not change it.');
      const list = (db.plan || {})[tid] || [];
      for (const { id, ...m } of moves) { const it = list.find(x => x.id === id); if (it) Object.assign(it, m); }
      save(); return Promise.resolve();
    },
    saveTodo(tid, item) {
      if (!editor(tid)) return fail('You can look at this trip but not change it.');
      const list = (db.todos = db.todos || {})[tid] = db.todos[tid] || [];
      if (item.id) { const i = list.findIndex(x => x.id === item.id); if (i >= 0) list[i] = { ...list[i], ...item }; save(); return Promise.resolve(item.id); }
      const id = newId();
      list.push({ ...item, id, done: {}, by: as, createdAt: Date.now() });
      save(); return Promise.resolve(id);
    },
    addTodos(tid, items) {
      if (!editor(tid)) return fail('You can look at this trip but not change it.');
      const list = (db.todos = db.todos || {})[tid] = db.todos[tid] || [];
      items.forEach((it, n) => list.push({ ...it, id: newId(), done: {}, by: as, createdAt: Date.now() + n }));
      save(); return Promise.resolve();
    },
    checkTodo(tid, id, on) {
      const t = db.trips[tid];
      if (!t || !t.members.includes(as)) return fail('You’re not on this trip.');
      const it = ((db.todos || {})[tid] || []).find(x => x.id === id);
      if (it) { it.done = it.done || {}; if (on) it.done[as] = Date.now(); else delete it.done[as]; }
      save(); return Promise.resolve();
    },
    deleteTodo(tid, id) {
      if (!editor(tid)) return fail('You can look at this trip but not change it.');
      if (db.todos && db.todos[tid]) db.todos[tid] = db.todos[tid].filter(x => x.id !== id);
      save(); return Promise.resolve();
    },
    deletePlan(tid, id) {
      if (!editor(tid)) return fail('You can look at this trip but not change it.');
      if (db.plan && db.plan[tid]) db.plan[tid] = db.plan[tid].filter(x => x.id !== id);
      save(); return Promise.resolve();
    },

    saveSomeday(item) {
      const list = db.someday[as] = db.someday[as] || [];
      if (item.id) { const i = list.findIndex(x => x.id === item.id); if (i >= 0) list[i] = { ...list[i], ...item }; save(); return Promise.resolve(item.id); }
      const id = newId();
      list.push({ ...item, id, createdAt: Date.now() });
      save(); return Promise.resolve(id);
    },
    deleteSomeday(id) { db.someday[as] = (db.someday[as] || []).filter(x => x.id !== id); save(); return Promise.resolve(); },
    moveToTrip(item, tid) {
      if (!editor(tid)) return fail('You can look at that trip but not add to it.');
      const { id, createdAt, ...rest } = item;
      (db.ideas[tid] = db.ideas[tid] || []).push({ ...rest, id: newId(), by: as, createdAt: Date.now() });
      db.someday[as] = db.someday[as].filter(x => x.id !== id);
      save(); return Promise.resolve();
    },
    copyToSomeday(idea, where) {
      const { id, by, createdAt, ...rest } = idea;
      (db.someday[as] = db.someday[as] || []).push({ ...rest, where: where || '', id: newId(), createdAt: Date.now() });
      save(); return Promise.resolve();
    },
    deleteAccount() { return fail('That’s turned off in sample mode.'); },
  };
})();
