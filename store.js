/* All database access lives here (and in demo.js, its stand-in for sample
   mode), so app.js only deals in plain objects.

   Firestore layout:
     users/{uid}                 profile: name, look, keepMine {tripId: true}
     users/{uid}/someday/{id}    my "someday" ideas (just me)
     trips/{tid}                 { name, place, emoji, start, end, cover (photo), coverPos {x, y}, owner, members [uids],
                                   roles {uid: 'edit'|'view'}, people {uid: {name, photo}},
                                   code (e.g. CHINA-7K2), joinRole, look (shared look or null) }
     trips/{tid}/ideas/{id}      { cat, name, photo, link, address, notes, must, loc {lat, lng}, pin {color, emoji, shape}, by, createdAt }
     trips/{tid}/plan/{id}       one stop on the itinerary: { day 'YYYY-MM-DD', slot morning|afternoon|evening|'',
                                   time 'HH:MM'|'', order, idea (an idea's id) or text + emoji, note, by }
     codes/{CODE}                { tid, code, role } -- CODE is the trip code without the dash

   firestore.rules is what keeps each trip to its own people. */

const Store = (() => {
  const configured = typeof firebaseConfig !== 'undefined' && !/PASTE/.test(firebaseConfig.apiKey);
  if (!configured) return { configured: false };

  firebase.initializeApp(firebaseConfig);
  const auth = firebase.auth();
  const db = firebase.firestore();
  const FV = firebase.firestore.FieldValue;
  db.enablePersistence({ synchronizeTabs: true }).catch(() => {});

  const U = uid => db.collection('users').doc(uid);
  const T = tid => db.collection('trips').doc(tid);
  const uid = () => auth.currentUser && auth.currentUser.uid;
  const docs = s => s.docs.map(d => ({ id: d.id, ...d.data() }));

  // ---- account ----
  const onUser = cb => auth.onAuthStateChanged(u => cb(u ? { uid: u.uid, email: u.email, name: u.displayName || '', photo: u.photoURL || '' } : null));
  async function signIn() {
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      await auth.signInWithPopup(provider);
    } catch (e) {
      // Some phones block the pop-up window; go to Google in this window instead.
      if (/popup-blocked|operation-not-supported/.test(e.code || '')) return auth.signInWithRedirect(provider);
      throw e;
    }
  }
  auth.getRedirectResult().catch(e => console.warn('redirect', e.code));
  const signOut = () => { stop(); return auth.signOut(); };

  // ---- live data ----
  // start(cb) keeps cb fed with one state object:
  //   { me, loaded, profile, trips [], ideas {tid: []}, plan {tid: []}, someday [] }
  let S = null;
  let subs = {};
  let emitT = null;
  let cb = null;
  const emit = () => { clearTimeout(emitT); emitT = setTimeout(() => cb && cb(S), 20); };

  function listen(key, ref, fn) {
    if (subs[key]) return;
    subs[key] = ref.onSnapshot(fn, e => {
      // Usually a trip someone just removed us from.
      console.warn('listen', key, e.code);
      delete subs[key];
      fn(null);
    });
  }
  function drop(key) { if (subs[key]) { subs[key](); delete subs[key]; } }

  function start(onState) {
    stop();
    cb = onState;
    const me = uid();
    S = { me, loaded: false, profile: null, trips: [], ideas: {}, plan: {}, someday: [] };
    listen('me', U(me), s => { S.profile = s && s.exists ? s.data() : null; S.loaded = true; emit(); });
    listen('someday', U(me).collection('someday'), s => { S.someday = s ? docs(s) : []; emit(); });
    listen('trips', db.collection('trips').where('members', 'array-contains', me), s => {
      S.trips = s ? docs(s) : [];
      const want = new Set(S.trips.map(t => t.id));
      for (const t of S.trips) listen('ideas:' + t.id, T(t.id).collection('ideas'), x => { S.ideas[t.id] = x ? docs(x) : []; emit(); });
      for (const t of S.trips) listen('plan:' + t.id, T(t.id).collection('plan'), x => { S.plan[t.id] = x ? docs(x) : []; emit(); });
      for (const key of Object.keys(subs)) {
        const [kind, tid] = key.split(':');
        if ((kind === 'ideas' || kind === 'plan') && !want.has(tid)) { drop(key); delete S[kind][tid]; }
      }
      emit();
    });
  }
  function stop() {
    Object.keys(subs).forEach(drop);
    subs = {};
    cb = null;
  }

  // ---- profile ----
  const createProfile = p => U(uid()).set({ ...p, keepMine: {}, createdAt: Date.now() });
  async function saveProfile(patch) {
    await U(uid()).set(patch, { merge: true });
    // Keep my name the same on every trip I'm on.
    if (patch.name) {
      const me = uid();
      await Promise.all(S.trips.map(t => T(t.id).update({ ['people.' + me + '.name']: patch.name }).catch(() => {})));
    }
  }
  const setKeepMine = (tid, keep) => U(uid()).set({ keepMine: { [tid]: keep ? true : FV.delete() } }, { merge: true });

  // ---- codes ----
  const CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const rand = n => Array.from({ length: n }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('');
  const codeId = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  // "China 2027" -> CHINA-7K2
  const makeCode = name => {
    const word = (String(name || '').toUpperCase().match(/[A-Z]+/g) || ['TRIP']).sort((a, b) => b.length - a.length)[0].slice(0, 6);
    return (word.length >= 3 ? word : 'TRIP') + '-' + rand(3);
  };
  async function freeCode(name) {
    for (let i = 0; i < 6; i++) {
      const c = makeCode(name);
      if (!(await db.collection('codes').doc(codeId(c)).get()).exists) return c;
    }
    return 'TRIP-' + rand(5);
  }

  // ---- trips ----
  async function createTrip(t) {
    const me = uid();
    const code = await freeCode(t.name);
    const ref = db.collection('trips').doc();
    const batch = db.batch();
    batch.set(ref, {
      name: t.name, place: t.place || '', emoji: t.emoji || '✈️', start: t.start || '', end: t.end || '',
      cover: t.cover || '', coverPos: t.coverPos || null,
      owner: me, members: [me], roles: { [me]: 'edit' }, people: { [me]: { name: S.profile.name } },
      code, joinRole: 'edit', look: t.look || null, createdAt: Date.now(),
    });
    batch.set(db.collection('codes').doc(codeId(code)), { tid: ref.id, code, role: 'edit' });
    await batch.commit();
    return ref.id;
  }
  // name, place, emoji, start, end, cover, coverPos, look, pins, planStyle -- anyone who can edit
  const saveTrip = (tid, patch) => T(tid).update(patch);
  // owner only
  const setRole = (tid, who, role) => T(tid).update({ ['roles.' + who]: role });
  // The code card carries the role too, since people joining can't read the trip yet.
  function setJoinRole(tid, role) {
    const t = S.trips.find(x => x.id === tid);
    const batch = db.batch();
    batch.update(T(tid), { joinRole: role });
    batch.set(db.collection('codes').doc(codeId(t.code)), { tid, code: t.code, role });
    return batch.commit();
  }
  function removePerson(tid, who) {
    return T(tid).update({ members: FV.arrayRemove(who), ['roles.' + who]: FV.delete(), ['people.' + who]: FV.delete() });
  }
  async function newTripCode(tid) {
    const t = S.trips.find(x => x.id === tid);
    const code = await freeCode(t.name);
    const batch = db.batch();
    batch.update(T(tid), { code });
    batch.set(db.collection('codes').doc(codeId(code)), { tid, code, role: t.joinRole || 'edit' });
    if (t.code) batch.delete(db.collection('codes').doc(codeId(t.code)));
    await batch.commit();
    return code;
  }

  // Join with a code (typed in, or from an invite link). -> trip id
  async function join(raw) {
    const me = uid();
    const id = codeId(raw);
    if (id.length < 4) throw new Error('That code looks too short.');
    const snap = await db.collection('codes').doc(id).get();
    if (!snap.exists) throw new Error('That code didn’t match a trip. Check it and try again.');
    const { tid, code, role } = snap.data();
    if (S.trips.some(t => t.id === tid)) return tid;
    // joinCode proves we know the trip's current code; the role is the one the owner picked.
    await T(tid).update({
      members: FV.arrayUnion(me), ['roles.' + me]: role || 'edit', ['people.' + me]: { name: S.profile.name },
      joinCode: code + ':' + me,
    });
    return tid;
  }

  const leaveTrip = tid => removePerson(tid, uid());
  async function deleteTrip(tid) {
    const t = S.trips.find(x => x.id === tid);
    const ideas = [...(await T(tid).collection('ideas').get()).docs, ...(await T(tid).collection('plan').get()).docs];
    for (let i = 0; i < ideas.length; i += 400) {
      const b = db.batch();
      ideas.slice(i, i + 400).forEach(d => b.delete(d.ref));
      await b.commit();
    }
    await T(tid).delete();
    if (t && t.code) await db.collection('codes').doc(codeId(t.code)).delete().catch(() => {});
  }

  // ---- ideas ----
  function saveIdea(tid, idea) {
    const { id, ...rest } = idea;
    const col = T(tid).collection('ideas');
    const ref = id ? col.doc(id) : col.doc();
    if (!id) { rest.by = uid(); rest.createdAt = Date.now(); }
    return (id ? ref.update(rest) : ref.set(rest)).then(() => ref.id);
  }
  // An idea leaves the plan too, wherever it was.
  function deleteIdea(tid, id) {
    const batch = db.batch();
    batch.delete(T(tid).collection('ideas').doc(id));
    (S.plan[tid] || []).filter(p => p.idea === id).forEach(p => batch.delete(T(tid).collection('plan').doc(p.id)));
    return batch.commit();
  }

  // ---- the plan ----
  function savePlan(tid, item) {
    const { id, ...rest } = item;
    const col = T(tid).collection('plan');
    const ref = id ? col.doc(id) : col.doc();
    if (!id) { rest.by = uid(); rest.createdAt = Date.now(); }
    return (id ? ref.update(rest) : ref.set(rest)).then(() => ref.id);
  }
  // several new stops at once (ticked in "Add to this day")
  function addPlan(tid, items) {
    const batch = db.batch();
    for (const it of items) batch.set(T(tid).collection('plan').doc(), { ...it, by: uid(), createdAt: Date.now() });
    return batch.commit();
  }
  // after a drag: [{ id, day, slot, order }]
  function movePlan(tid, moves) {
    const batch = db.batch();
    for (const { id, ...m } of moves) batch.update(T(tid).collection('plan').doc(id), m);
    return batch.commit();
  }
  const deletePlan = (tid, id) => T(tid).collection('plan').doc(id).delete();

  // ---- someday ----
  function saveSomeday(item) {
    const { id, ...rest } = item;
    const col = U(uid()).collection('someday');
    const ref = id ? col.doc(id) : col.doc();
    if (!id) rest.createdAt = Date.now();
    return (id ? ref.update(rest) : ref.set(rest)).then(() => ref.id);
  }
  const deleteSomeday = id => U(uid()).collection('someday').doc(id).delete();
  // Someday -> a trip (it leaves Someday).
  async function moveToTrip(item, tid) {
    const { id, createdAt, ...rest } = item;
    const batch = db.batch();
    batch.set(T(tid).collection('ideas').doc(), { ...rest, by: uid(), createdAt: Date.now() });
    batch.delete(U(uid()).collection('someday').doc(id));
    await batch.commit();
  }
  // A trip idea -> my Someday (a copy; the trip keeps it).
  function copyToSomeday(idea, where) {
    const { id, by, createdAt, ...rest } = idea;
    return U(uid()).collection('someday').add({ ...rest, where: where || '', createdAt: Date.now() });
  }

  // ---- delete everything ----
  async function deleteAccount() {
    const me = uid();
    for (const t of S.trips) {
      if (t.owner === me && t.members.length <= 1) await deleteTrip(t.id);
      else if (t.owner === me) {
        // Hand the trip to the next person so it isn't left without an owner.
        const next = t.members.find(m => m !== me);
        await T(t.id).update({ owner: next, ['roles.' + next]: 'edit' });
        await T(t.id).update({ members: FV.arrayRemove(me), ['roles.' + me]: FV.delete(), ['people.' + me]: FV.delete() });
      } else await leaveTrip(t.id);
    }
    const some = await U(me).collection('someday').get();
    for (let i = 0; i < some.docs.length; i += 400) {
      const b = db.batch();
      some.docs.slice(i, i + 400).forEach(d => b.delete(d.ref));
      await b.commit();
    }
    stop();
    await U(me).delete();
    try {
      await auth.currentUser.delete();
    } catch (e) {
      if (/requires-recent-login/.test(e.code || '')) {
        await auth.currentUser.reauthenticateWithPopup(new firebase.auth.GoogleAuthProvider());
        await auth.currentUser.delete();
      } else throw e;
    }
  }

  return {
    configured: true, onUser, signIn, signOut, start, stop, createProfile, saveProfile, setKeepMine,
    createTrip, saveTrip, setRole, setJoinRole, removePerson, newTripCode, join, leaveTrip, deleteTrip,
    saveIdea, deleteIdea, savePlan, addPlan, movePlan, deletePlan, saveSomeday, deleteSomeday, moveToTrip, copyToSomeday, deleteAccount, uid,
  };
})();
