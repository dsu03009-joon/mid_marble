/* 중세 마블 온라인 - Firebase 실시간 DB 연결
   - 학생 화면: 요청을 queue에 넣고(replies로 답을 받음), 게임 화면은 views를 실시간 구독
   - 교사 화면(진행 화면): queue를 처리하는 '서버' 역할 (host.js), 결과를 views/lobby에 게시 */
const NET = (() => {
  const cfg = window.FIREBASE_CONFIG || {};
  const ready = !!(cfg.apiKey && cfg.databaseURL && !String(cfg.apiKey).includes('여기에'));
  if (!ready) return { ready: false };
  firebase.initializeApp(cfg);
  const db = firebase.database();
  const R = (window.DB_ROOT || 'medieval-marble').replace(/\/$/, '') + '/';
  const ref = p => p ? db.ref(R + p) : db.ref(R.slice(0, -1));
  window.serverOffset = 0;
  db.ref('.info/serverTimeOffset').on('value', s => { window.serverOffset = s.val() || 0; });
  const TS = firebase.database.ServerValue.TIMESTAMP;

  /* ---------- 학생/일반: 요청 보내기 ---------- */
  function rpc(path, body){
    return new Promise((resolve, reject) => {
      const id = ref('queue').push().key;
      const rr = ref('replies/' + id);
      const timer = setTimeout(() => { rr.off(); ref('queue/' + id).remove(); reject(Object.assign(new Error('선생님 진행 화면이 응답하지 않아요. 선생님께 알려 주세요.'), { offline: true })); }, 9000);
      rr.on('value', s => {
        const v = s.val(); if (v == null) return;
        clearTimeout(timer); rr.off(); rr.remove();
        const r = JSON.parse(v);
        if (r.error){ const e = new Error(r.error); e.data = r; reject(e); } else resolve(r.data);
      });
      ref('queue/' + id).set({ p: path, b: JSON.stringify(body || {}), t: TS });
    });
  }
  function subView(gid, cb){
    const r = ref('views/' + gid);
    const h = r.on('value', s => { const v = s.val(); cb(v ? JSON.parse(v) : null); });
    return () => r.off('value', h);
  }
  function subLobby(cb){
    const r = ref('lobby');
    const h = r.on('value', s => { const v = s.val(); cb(v ? JSON.parse(v) : { games: [] }); });
    return () => r.off('value', h);
  }
  function subConnected(cb){ db.ref('.info/connected').on('value', s => cb(!!s.val())); }

  /* ---------- 교사: 진행 화면(호스트) ---------- */
  const HOST_ID = Math.random().toString(36).slice(2, 10);
  let hosting = false, hbTimer = null, tickTimer = null, flushTimer = null, saveTimer = null, onChange = null, onLost = null;
  const nowS = () => Date.now() + (window.serverOffset || 0);

  async function hostStatus(){
    const s = await ref('host').once('value'); const v = s.val();
    if (!v || v.id === HOST_ID) return { free: true };
    return { free: nowS() - (v.ts || 0) > 12000, other: v };
  }
  async function startHosting(questions, changeCb, lostCb){
    onChange = changeCb; onLost = lostCb;
    Host.init(questions);
    const st = await ref('state').once('value');
    if (st.val()) { try { Host.restore(JSON.parse(st.val())); } catch (e){ console.error(e); } }
    hosting = true;
    const beat = () => ref('host').set({ id: HOST_ID, ts: TS });
    await beat();
    ref('host').onDisconnect().remove();
    hbTimer = setInterval(beat, 4000);
    ref('host').on('value', s => { const v = s.val(); if (hosting && v && v.id !== HOST_ID) stopHosting(true); });
    ref('queue').on('child_added', onQueue);
    tickTimer = setInterval(() => { Host.tick(); flush(); }, 250);
    flush(true);
  }
  function stopHosting(lost){
    if (!hosting) return;
    hosting = false;
    clearInterval(hbTimer); clearInterval(tickTimer);
    ref('queue').off('child_added', onQueue);
    ref('host').onDisconnect().cancel();
    if (lost && onLost) onLost();
  }
  function onQueue(snap){
    if (!hosting) return;
    const v = snap.val(); snap.ref.remove();
    if (!v || (v.t && nowS() - v.t > 60000)) return;
    let reply;
    try { reply = { data: Host.handle(v.p, JSON.parse(v.b || '{}'), false) }; }
    catch (e){ reply = { error: e.user ? e.message : ('오류: ' + e.message) }; if (!e.user) console.error(e); }
    const rr = ref('replies/' + snap.key);
    rr.set(JSON.stringify(reply));
    setTimeout(() => rr.remove(), 30000);
    flush();
  }
  function local(path, body){ const r = Host.handle(path, body || {}, true); flush(); return r; }
  function flush(force){
    if (!hosting) return;
    const ch = Host.takeChanges();
    const up = {};
    for (const [id, v] of ch.games) up['views/' + id] = v ? JSON.stringify(v) : null;
    if (ch.lobby || force) up['lobby'] = JSON.stringify(ch.lobby || Host.handle('/api/games', {}, true));
    if (Object.keys(up).length) ref('').update(up);
    if (ch.state || force){ clearTimeout(saveTimer); saveTimer = setTimeout(() => ref('state').set(JSON.stringify(Host.snapshot())), 1200); }
    if ((ch.games.length || ch.lobby || force) && onChange) onChange();
  }
  async function wipeAll(){ await ref('').update({ views: null, lobby: null, queue: null, replies: null }); }

  return { ready: true, rpc, subView, subLobby, subConnected, hostStatus, startHosting, stopHosting, local, flush, isHosting: () => hosting, wipeAll };
})();
