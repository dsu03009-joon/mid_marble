/* 중세 마블 - 게임 진행 엔진 (교사 화면 브라우저에서 실행되는 '서버')
   PowerShell 서버(server.ps1)의 게임 규칙을 그대로 옮긴 것입니다. */
const Host = (() => {
  let QD = null, Cells = [], AllQ = [], PopIdx = [], NC = 40;
  let Games = {}, GameOrder = [], Tokens = {}, Stats = {};
  const dirty = new Set();
  let lobbyDirty = true, stateDirty = false;
  const Colors = ['#c0392b','#2e6fd1','#1f8a4c','#d68910','#8e44ad','#138d90','#c2185b','#5d4037'];
  const now = () => Date.now() + (window.serverOffset || 0);
  const rnd = n => Math.floor(Math.random() * n);
  function newId(n){ const c='abcdefghjkmnpqrstuvwxyz23456789'; let s=''; for (let i=0;i<n;i++) s+=c[rnd(c.length)]; return s; }
  function fail(msg){ const e = new Error(msg); e.user = true; throw e; }
  const shuffle = a => { a = a.slice(); for (let i=a.length-1;i>0;i--){ const j=rnd(i+1); [a[i],a[j]]=[a[j],a[i]]; } return a; };

  function init(questions){
    QD = questions; Cells = QD.cells; NC = Cells.length;
    AllQ = Cells.concat(QD.extra || []);
    PopIdx = []; for (let i = NC; i < AllQ.length; i++) PopIdx.push(i);
  }

  /* ---------------- 상태 ---------------- */
  function touch(g){ g.ver++; dirty.add(g.id); lobbyDirty = true; stateDirty = true; }
  function addLog(g, text){ g.log.unshift({ t: now(), text }); if (g.log.length > 40) g.log.length = 40; }
  const findUnit = (g, id) => g.units.find(u => u.id === id) || null;
  const curUnit = g => g.units.length ? g.units[g.turn] : null;
  const answerer = u => (!u || !u.members.length) ? null : u.members[u.ansIdx % u.members.length];

  function newUnit(g, name){
    const u = { id: newId(5), name, color: Colors[g.units.length % Colors.length], score: 0, pos: 0, rolls: 0, stuck: 0,
                bonus: false, combo: 0, shield: 0, members: [], ansIdx: 0 };
    g.units.push(u); return u;
  }
  function newGame(name, mode, maxRolls, dice, timer, teams, judge){
    const g = { id: newId(5), name, mode, status: 'lobby', maxRolls, dice, timer, judge, units: [], turn: 0, phase: 'lobby',
                pending: null, lastRoll: null, rollSeq: 0, result: null, resultSeq: 0, log: [], podium: null, notes: null,
                ver: 1, stats: {}, animMs: 0, created: now() };
    if (mode === 'team') for (let k = 1; k <= teams; k++) newUnit(g, `${k}모둠`);
    Games[g.id] = g; GameOrder.push(g.id); touch(g);
    return g;
  }

  function view(g){
    const units = g.units.map(u => { const a = answerer(u); return {
      id: u.id, name: u.name, color: u.color, score: u.score, pos: u.pos, rolls: u.rolls, stuck: u.stuck, bonus: !!u.bonus,
      combo: u.combo, shield: u.shield, members: u.members.map(m => ({ id: m.id, name: m.name })),
      answererId: a ? a.id : null, answererName: a ? a.name : null }; });
    let pend = null;
    if (g.pending){
      const p = g.pending;
      pend = { kind: p.kind, unitId: p.unitId, answererId: p.answererId, answererName: p.answererName, deadline: p.deadline,
               cell: p.cell, from: p.from, mode: p.mode || null, double: !!p.double, typed: p.typed || null, isPop: !!p.isPop };
      if (p.kind === 'quiz'){
        const c = AllQ[p.qcell];
        pend.preds = Object.keys(p.preds || {}); pend.qcell = p.qcell;
        pend.stars = c.stars; pend.unit = c.unit; pend.short = c.short;
        if (p.mode === 'easy'){ pend.q = c.q; pend.options = p.order.map(o => c.options[o]); }
        else if (p.mode === 'hard'){ pend.q = c.hq || c.q; }
      }
    }
    const cu = curUnit(g);
    return { id: g.id, name: g.name, mode: g.mode, status: g.status, maxRolls: g.maxRolls, dice: g.dice, timer: g.timer, judge: g.judge,
             phase: g.phase, curUnitId: (cu && g.status === 'playing') ? cu.id : null, units, pending: pend, lastRoll: g.lastRoll,
             result: g.result, log: g.log.slice(0, 15), podium: g.podium, notes: g.notes, ver: g.ver };
  }

  /* ---------------- 진행 ---------------- */
  function startGame(g){
    if (g.status !== 'lobby') fail('이미 시작된 게임입니다.');
    g.units = g.units.filter(u => u.members.length > 0);
    if (!g.units.length) fail('참가자가 없습니다.');
    g.units.forEach((u, i) => u.color = Colors[i % Colors.length]);
    g.status = 'playing'; g.phase = 'roll'; g.turn = 0;
    addLog(g, '게임 시작!'); touch(g);
  }
  function setResult(g, r){ g.resultSeq++; r.seq = g.resultSeq; g.result = r; }

  function finishGame(g, why){
    g.status = 'ended'; g.phase = 'ended'; g.pending = null;
    const sorted = g.units.slice().sort((a, b) => b.score - a.score);
    g.podium = sorted.map(u => ({ id: u.id, name: u.name, score: u.score, rank: 1 + g.units.filter(o => o.score > u.score).length,
                                  color: u.color, members: u.members.map(m => m.name) }));
    g.notes = notesList(g.stats, 3);
    addLog(g, `게임 종료 (${why})`); touch(g);
  }
  function checkEnd(g){
    if (g.status !== 'playing') return true;
    if (g.units.some(u => u.rolls < g.maxRolls || u.bonus)) return false;
    finishGame(g, `모두 주사위 ${g.maxRolls}회 완료`); return true;
  }
  function endTurn(g){
    const cur = curUnit(g);
    if (cur) cur.ansIdx++;
    g.pending = null; g.phase = 'roll';
    if (cur && cur.bonus) return;
    if (checkEnd(g)) return;
    const n = g.units.length;
    for (let guard = 0; guard < 500; guard++){
      g.turn = (g.turn + 1) % n;
      const u = g.units[g.turn];
      if (u.rolls >= g.maxRolls) continue;
      if (u.stuck > 0){
        u.stuck--; u.rolls++;
        addLog(g, `${u.name}: 이번 턴은 쉽니다 (남은 ${u.stuck}턴)`);
        if (checkEnd(g)) return;
        continue;
      }
      break;
    }
  }

  function doRoll(g, pl){
    if (g.status !== 'playing' || g.phase !== 'roll') fail('지금은 주사위를 굴릴 수 없습니다.');
    const u = curUnit(g), a = answerer(u);
    if (!a || a.id !== pl.memberId) fail('내 차례가 아닙니다.');
    const d1 = 1 + rnd(6), d2 = g.dice >= 2 ? 1 + rnd(6) : 0, sum = d1 + d2;
    const double = g.dice >= 2 && d1 === d2;
    const isBonus = !!u.bonus;
    if (isBonus) u.bonus = false; else u.rolls++;
    const from = u.pos, raw = from + sum, to = raw % NC, passed = raw >= NC;
    u.pos = to; g.rollSeq++;
    g.lastRoll = { seq: g.rollSeq, unitId: u.id, d1, d2, sum, from, to, by: a.name, double, bonus: isBonus };
    addLog(g, `${u.name}(${a.name}) 주사위 ${sum} → ${to}번 칸${isBonus ? ' [보너스 굴림]' : ''}${double ? ' 더블!' : ''}`);
    g.animMs = 1500 + sum * 170;
    land(g, u, a, from, passed, double, 0, '', null);
    touch(g);
  }

  function land(g, u, a, from, passed, double, depth, pre, card){
    const cell = Cells[u.pos];
    if (cell.type === 'quiz') startQuiz(g, u, a, u.pos, u.pos, from, passed, double, false);
    else if (cell.type === 'chance' && depth === 0) applyChance(g, u, a, from, passed, double);
    else if (cell.type === 'chance'){
      setResult(g, { kind: 'chance', card, unitId: u.id, unitName: u.name, by: a.name, text: (pre + ' 찬스 카드 칸에 도착했지만 이번에는 쉬어 갑니다.').trim() });
      endTurn(g);
    } else applySpecial(g, u, a, cell, from, passed, pre, card);
  }

  function startQuiz(g, u, a, cell, qcell, from, passed, double, isPop){
    g.pending = { kind: 'quiz', unitId: u.id, answererId: a.id, answererName: a.name, cell, qcell, from, passed,
                  order: shuffle([0,1,2,3]), deadline: g.timer > 0 ? now() + 15000 + g.animMs : 0,
                  mode: null, double, typed: null, isPop, preds: {} };
    g.phase = 'question';
  }

  function setMode(g, mode){
    const p = g.pending;
    p.mode = mode; p.deadline = 0;
    if (g.timer > 0){ const t = mode === 'hard' ? Math.ceil(g.timer * 1.5) : g.timer; p.deadline = now() + t * 1000; }
    addLog(g, `${p.answererName}이(가) ${mode === 'hard' ? '하드 모드(주관식)' : '이지 모드(객관식)'} 선택`);
    touch(g);
  }

  const norm = s => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  function autoGrade(c, text){
    const t = norm(text);
    if (!t) return false;
    for (const alt of (c.accept || [])){
      let len = 0, all = true;
      for (const kw of alt){ const k = norm(kw); len += k.length; if (!t.includes(k)){ all = false; break; } }
      if (!all) continue;
      if (c.strict && t.length > len + 8) continue;
      return true;
    }
    return false;
  }
  const modelAnswer = c => c.model || c.options[c.answer];

  function submitAnswer(g, pl, body){
    const p = g.pending;
    if (g.phase !== 'question' || !p || p.kind !== 'quiz' || p.answererId !== pl.memberId) fail('지금은 답할 수 없습니다.');
    if (!p.mode) fail('먼저 모드를 고르세요.');
    const c = AllQ[p.qcell];
    if (p.mode === 'easy'){
      const ch = parseInt(body.choice, 10);
      if (!(ch >= 0 && ch <= 3)) fail('잘못된 선택입니다.');
      const orig = p.order[ch];
      resolveQuiz(g, orig === c.answer, false, c.options[orig], 'auto'); return;
    }
    let text = String(body.text || '').trim();
    if (!text) fail('답을 입력하세요.');
    text = text.slice(0, 80);
    if (autoGrade(c, text)){ resolveQuiz(g, true, false, text, 'auto'); return; }
    if (g.judge === 'teacher'){
      p.typed = text; p.deadline = 0; g.phase = 'judge';
      addLog(g, `${p.answererName}의 주관식 답 '${text}' → 선생님 채점 대기`);
      touch(g); return;
    }
    resolveQuiz(g, false, false, text, 'auto');
  }

  function submitPredict(g, pl, body){
    const p = g.pending;
    if (g.phase !== 'question' || !p || p.kind !== 'quiz' || !p.mode) fail('지금은 예측할 수 없습니다.');
    if (pl.unitId === p.unitId) fail('우리 팀 문제에는 예측할 수 없어요. 답변자를 도와주세요!');
    if (p.preds[pl.unitId]) fail('이미 예측했습니다.');
    const pick = String(body.pick);
    if (p.mode === 'easy'){ const i = parseInt(pick, 10); if (!(i >= 0 && i <= 3)) fail('잘못된 예측입니다.'); }
    else if (pick !== 'o' && pick !== 'x') fail('잘못된 예측입니다.');
    p.preds[pl.unitId] = { pick, name: pl.name };
    touch(g);
  }

  function recordStat(g, qcell, ok){
    for (const tbl of [Stats, g.stats]){
      const k = String(qcell);
      if (!tbl[k]) tbl[k] = { t: 0, w: 0 };
      tbl[k].t++; if (!ok) tbl[k].w++;
    }
  }
  function notesList(tbl, n){
    return Object.keys(tbl).filter(k => tbl[k].w > 0).map(k => {
      const s = tbl[k], c = AllQ[+k];
      return { i: +k, q: c.q, a: modelAnswer(c), explain: c.explain, unit: c.unit, stars: c.stars, tries: s.t, wrong: s.w, rate: Math.round(100 * s.w / s.t) };
    }).sort((a, b) => b.wrong - a.wrong || b.rate - a.rate).slice(0, n);
  }

  function resolveQuiz(g, ok, timeout, chosen, how){
    const p = g.pending, u = findUnit(g, p.unitId), c = AllQ[p.qcell];
    const stars = c.stars, hard = p.mode === 'hard';
    let gain = 0, bonus = 0, delta = 0, extra = false, combo = 0;
    if (ok){
      gain = hard ? stars * 2 : stars;
      if (p.passed) bonus = 3;
      u.combo++;
      if (u.combo % 3 === 0) combo = 2;
      u.score += gain + bonus + combo; delta = gain + bonus + combo;
      if (p.double){ u.bonus = true; extra = true; }
      addLog(g, `${u.name}(${p.answererName}) 정답! ★${gain}${bonus ? ' + 출발 보너스 ★3' : ''}${combo ? ` + ${u.combo}연속 콤보 ★2` : ''}${extra ? ' · 더블 보너스로 한 번 더!' : ''}`);
    } else {
      u.combo = 0; u.pos = p.from;
      if (hard){ const loss = Math.min(stars, u.score); u.score -= loss; delta = -loss; }
      addLog(g, `${u.name}(${p.answererName}) ${timeout ? '시간 초과' : '오답'}${hard ? ` (하드 모드 -★${stars})` : ''}${p.isPop ? '' : ` → ${p.from}번 칸으로 되돌아감`}`);
    }
    if (how !== 'skip') recordStat(g, p.qcell, ok);
    const predWin = [], predLose = [];
    for (const uid of Object.keys(p.preds || {})){
      const pr = p.preds[uid], vu = findUnit(g, uid);
      if (!vu) continue;
      const right = p.mode === 'easy' ? p.order[+pr.pick] === c.answer : ((pr.pick === 'o') === ok);
      const label = g.mode === 'team' ? `${vu.name}(${pr.name})` : vu.name;
      if (right){ vu.score += 1; predWin.push(label); } else predLose.push(label);
    }
    if (predWin.length) addLog(g, '예측 성공 ★1: ' + predWin.join(', '));
    setResult(g, { kind: 'answer', correct: ok, timeout, mode: p.mode || 'easy', how, unitId: u.id, unitName: u.name, by: p.answererName,
                   chosen: chosen || null, answer: modelAnswer(c), explain: c.explain, gain, bonus, combo, comboCount: u.combo, delta, stars,
                   extra, q: c.q, isPop: !!p.isPop, predWin, predLose });
    endTurn(g); touch(g);
  }

  function takeHit(u, amount){
    if (u.shield > 0){ u.shield--; return -1; }
    const loss = Math.min(amount, u.score); u.score -= loss; return loss;
  }

  function applySpecial(g, u, a, cell, from, passed, pre, card){
    const msg = [];
    if (pre) msg.push(pre);
    const kind = cell.kind;
    if (passed && kind !== 'trade'){ u.score += 3; msg.push('출발 칸을 지나 ★3 획득!'); }
    switch (kind){
      case 'start': msg.push('출발 칸 도착!'); break;
      case 'tax':
        if (u.shield > 0){ u.shield--; msg.push('성벽 수리 카드로 세금을 피했습니다!'); }
        else { const t = Math.floor(u.score / 2); u.score -= t; msg.push(`가진 별의 절반 ★${t}를 세금으로 냈습니다.`); }
        break;
      case 'trade': u.pos = 0; u.score += 3; msg.push('원거리 무역 성공! 출발 칸으로 이동하고 ★3 획득!'); break;
      case 'war': u.stuck = 2; msg.push('2턴 동안 전장에 갇힙니다.'); break;
      case 'plague': {
        const n = g.units.length, idx = g.units.indexOf(u);
        const hit = [...new Set([idx, (idx - 1 + n) % n, (idx + 1) % n])];
        const names = hit.map(k => { const v = g.units[k]; const l = takeHit(v, 4); return l < 0 ? `${v.name} 성벽으로 방어!` : `${v.name} -★${l}`; });
        msg.push('흑사병이 퍼졌습니다! ' + names.join(', '));
        break;
      }
      case 'caravan':
        if (g.units.length > 1){
          g.pending = { kind: 'caravan', unitId: u.id, answererId: a.id, answererName: a.name, cell: u.pos, from,
                        deadline: g.timer > 0 ? now() + g.timer * 1000 + 3000 : 0, pre: msg.join(' ') };
          g.phase = 'choose';
          return;
        }
        u.score += 2; msg.push('함께할 친구가 없어 혼자 ★2 획득!');
        break;
    }
    const text = msg.join(' ');
    setResult(g, { kind: 'special', cellKind: kind, title: cell.title, img: cell.img, unitId: u.id, unitName: u.name, by: a.name, text, card });
    addLog(g, `${u.name}: [${cell.title}] ${text}`);
    endTurn(g);
  }

  const Deck = [
    { id: 'bless',   w: 3, title: '교황의 축복', text: '교황이 축복을 내렸다! ★3 획득' },
    { id: 'fief',    w: 3, title: '봉토 하사',   text: '주군에게 충성을 맹세하고 봉토를 받았다. ★2 획득' },
    { id: 'guild',   w: 2, title: '길드 가입',   text: '길드에 가입했다! 다른 모든 플레이어에게서 ★1씩 받기' },
    { id: 'duel',    w: 2, title: '기사의 결투', text: '1등에게 결투 신청! 1등에게서 ★2 빼앗기' },
    { id: 'wall',    w: 2, title: '성벽 수리',   text: '튼튼한 성벽! 다음 세금·흑사병 피해를 1번 막아 준다' },
    { id: 'march',   w: 2, title: '십자군 출정', text: '원정길에 올랐다! 앞으로 3칸 이동' },
    { id: 'avignon', w: 2, title: '교황청 이전', text: '교황청이 아비뇽으로! 25번 칸(아비뇽 문제)으로 이동해 도전' },
    { id: 'pop',     w: 3, title: '돌발 퀴즈',   text: '숨겨진 문제에 도전! 맞히면 별을 얻는다' },
    { id: 'excomm',  w: 1, title: '파문',        text: '교황에게 파문당했다! 다음 1턴 쉬기' },
    { id: 'wreck',   w: 2, title: '무역선 난파', text: '폭풍에 무역선이 가라앉았다. ★2 잃음' },
  ];
  function drawCard(){ let r = rnd(Deck.reduce((s, c) => s + c.w, 0)); for (const c of Deck){ if (r < c.w) return c; r -= c.w; } return Deck[0]; }

  function applyChance(g, u, a, from, passed, double){
    const card = drawCard(), info = { id: card.id, title: card.title, text: card.text };
    addLog(g, `${u.name}: 찬스 카드 [${card.title}]`);
    if (card.id === 'march'){
      const raw = u.pos + 3; u.pos = raw % NC;
      g.animMs += 3600;
      land(g, u, a, from, passed || raw >= NC, double, 1, `[찬스: 십자군 출정] 3칸 앞 ${u.pos}번 칸으로!`, info);
      if (Cells[u.pos].type === 'quiz') setResult(g, { kind: 'chance', card: info, unitId: u.id, unitName: u.name, by: a.name, text: `3칸 앞 ${u.pos}번 칸으로 이동해 문제에 도전!` });
      return;
    }
    if (card.id === 'avignon'){
      const target = 25, p2 = passed || target < u.pos;
      u.pos = target; g.animMs += 3600;
      startQuiz(g, u, a, target, target, from, p2, double, false);
      setResult(g, { kind: 'chance', card: info, unitId: u.id, unitName: u.name, by: a.name, text: '25번 칸(아비뇽)으로 이동해 문제에 도전!' });
      return;
    }
    if (card.id === 'pop'){
      g.animMs += 3600;
      startQuiz(g, u, a, u.pos, PopIdx[rnd(PopIdx.length)], u.pos, passed, double, true);
      setResult(g, { kind: 'chance', card: info, unitId: u.id, unitName: u.name, by: a.name, text: '돌발 퀴즈! 틀려도 제자리에 머뭅니다.' });
      return;
    }
    const msg = [];
    if (passed){ u.score += 3; msg.push('출발 칸을 지나 ★3 획득!'); }
    switch (card.id){
      case 'bless': u.score += 3; msg.push('★3 획득!'); break;
      case 'fief': u.score += 2; msg.push('★2 획득!'); break;
      case 'guild': { let got = 0; for (const v of g.units) if (v.id !== u.id && v.score > 0){ v.score--; got++; } u.score += got; msg.push(`다른 플레이어에게서 ★${got} 받음!`); break; }
      case 'duel': {
        let top = null; for (const v of g.units) if (v.id !== u.id && (!top || v.score > top.score)) top = v;
        if (!top || top.score <= u.score){ u.score += 1; msg.push('이미 내가 1등! 명예를 지켜 ★1 획득'); }
        else { const t = Math.min(2, top.score); top.score -= t; u.score += t; msg.push(`${top.name}에게서 ★${t} 빼앗음!`); }
        break;
      }
      case 'wall': u.shield++; msg.push(`방어 ${u.shield}회 보유`); break;
      case 'excomm': u.stuck = Math.max(u.stuck, 1); msg.push('다음 1턴을 쉽니다.'); break;
      case 'wreck': { const l = Math.min(2, u.score); u.score -= l; msg.push(`★${l} 잃음`); break; }
    }
    const text = msg.join(' ');
    setResult(g, { kind: 'chance', card: info, unitId: u.id, unitName: u.name, by: a.name, text });
    addLog(g, `${u.name}: [${card.title}] ${text}`);
    endTurn(g);
  }

  function resolveCaravan(g, targetId){
    const p = g.pending, u = findUnit(g, p.unitId);
    let t = targetId ? findUnit(g, targetId) : null;
    if (!t || t.id === u.id){ const others = g.units.filter(x => x.id !== u.id); t = others[rnd(others.length)]; }
    u.score += 2; t.score += 2;
    const text = `${p.pre} ${t.name}와(과) 함께 대상 무역에 참가! 둘 다 ★2 획득`.trim();
    setResult(g, { kind: 'special', cellKind: 'caravan', title: '무함마드 대상 참가', img: 'camel.png', unitId: u.id, unitName: u.name, by: p.answererName, text });
    addLog(g, `${u.name}: [무함마드 대상 참가] ${text}`);
    endTurn(g); touch(g);
  }

  function skipTurn(g){
    if (g.status !== 'playing') fail('진행 중인 게임이 아닙니다.');
    if (g.phase === 'question' || g.phase === 'judge'){
      addLog(g, '교사가 턴을 넘겼습니다.');
      if (!g.pending.mode) g.pending.mode = 'easy';
      resolveQuiz(g, false, true, g.pending.typed, 'skip'); return;
    }
    if (g.phase === 'choose'){ addLog(g, '교사가 턴을 넘겼습니다.'); resolveCaravan(g, null); return; }
    const u = curUnit(g);
    if (u.bonus) u.bonus = false; else u.rolls++;
    addLog(g, `교사가 ${u.name}의 턴을 넘겼습니다.`);
    endTurn(g); touch(g);
  }

  function tick(){
    const t = now();
    for (const id of GameOrder){
      const g = Games[id];
      if (g && g.status === 'playing' && g.pending && g.pending.deadline > 0 && t > g.pending.deadline){
        try {
          if (g.pending.kind === 'quiz'){ if (!g.pending.mode) setMode(g, 'easy'); else resolveQuiz(g, false, true, null, ''); }
          else resolveCaravan(g, null);
        } catch (e){ console.error('타이머 처리 오류', e); }
      }
    }
  }

  /* ---------------- 참가 ---------------- */
  function joinGame(body){
    const g = Games[body.gameId];
    if (!g) fail('게임을 찾을 수 없습니다.');
    let name = String(body.name || '').trim();
    if (!name) fail('이름을 입력하세요.');
    name = name.slice(0, 12);
    if (g.status === 'ended') fail('이미 끝난 게임입니다.');
    const mid = newId(8);
    let u;
    if (g.mode === 'solo'){
      if (g.status !== 'lobby') fail('이미 시작된 게임에는 들어갈 수 없습니다.');
      if (g.units.length >= 8) fail('이 모둠은 가득 찼습니다(최대 8명).');
      u = newUnit(g, name);
    } else {
      u = findUnit(g, body.unitId);
      if (!u) fail('팀을 선택하세요.');
      if (g.status !== 'lobby' && !u.members.length) fail('게임이 시작된 뒤에는 기존 팀에만 들어갈 수 있습니다.');
    }
    u.members.push({ id: mid, name });
    const tok = newId(16);
    Tokens[tok] = { token: tok, gameId: g.id, unitId: u.id, memberId: mid, name };
    addLog(g, `${name} 입장 (${u.name})`); touch(g);
    return Tokens[tok];
  }
  function removeMember(g, unitId, memberId){
    const u = findUnit(g, unitId);
    if (!u) return;
    u.members = u.members.filter(m => m.id !== memberId);
    if (g.mode === 'solo' && !u.members.length && g.status === 'lobby') g.units = g.units.filter(x => x !== u);
    for (const k of Object.keys(Tokens)) if (Tokens[k].memberId === memberId) delete Tokens[k];
    touch(g);
  }
  function player(body){
    const t = String(body.token || '');
    const pl = Tokens[t];
    if (!pl) fail('참가 정보가 없습니다. 다시 입장하세요.');
    const g = Games[pl.gameId];
    if (!g) fail('게임이 삭제되었습니다.');
    return [pl, g];
  }
  function deleteGame(id){
    delete Games[id]; GameOrder = GameOrder.filter(x => x !== id);
    for (const k of Object.keys(Tokens)) if (Tokens[k].gameId === id) delete Tokens[k];
    dirty.add(id); lobbyDirty = true; stateDirty = true;
  }

  function lobby(){
    return { games: GameOrder.map(id => Games[id]).map(g => ({ id: g.id, name: g.name, mode: g.mode, status: g.status,
             units: g.units.map(u => ({ id: u.id, name: u.name, members: u.members.map(m => m.name) })) })) };
  }
  function overview(){
    const games = GameOrder.map(id => view(Games[id]));
    const answers = {};
    for (const id of GameOrder){
      const g = Games[id];
      if (g.pending && g.pending.kind === 'quiz'){ const c = AllQ[g.pending.qcell]; answers[id] = { cell: g.pending.cell, qcell: g.pending.qcell, opt: c.options[c.answer], a: modelAnswer(c) }; }
    }
    let tt = 0, tw = 0; for (const v of Object.values(Stats)){ tt += v.t; tw += v.w; }
    return { now: now(), games, answers, notes: { list: notesList(Stats, 10), tries: tt, wrong: tw } };
  }

  /* ---------------- 요청 처리 (PowerShell 서버의 Handle과 같은 주소 체계) ---------------- */
  function handle(path, body, isTeacher){
    body = body || {};
    switch (path){
      case '/api/games': return lobby();
      case '/api/me': { const t = Tokens[body.t]; if (!t || !Games[t.gameId]) fail('none'); return t; }
      case '/api/join': return joinGame(body);
      case '/api/leave': { const [pl, g] = player(body); if (g.status !== 'lobby') fail('게임 중에는 나갈 수 없습니다.'); removeMember(g, pl.unitId, pl.memberId); return { ok: true }; }
      case '/api/roll': { const [pl, g] = player(body); doRoll(g, pl); return { ok: true }; }
      case '/api/mode': {
        const [pl, g] = player(body); const p = g.pending;
        if (g.phase !== 'question' || !p || p.kind !== 'quiz' || p.answererId !== pl.memberId || p.mode) fail('지금은 모드를 고를 수 없습니다.');
        setMode(g, body.mode === 'hard' ? 'hard' : 'easy'); return { ok: true };
      }
      case '/api/predict': { const [pl, g] = player(body); submitPredict(g, pl, body); return { ok: true }; }
      case '/api/answer': { const [pl, g] = player(body); submitAnswer(g, pl, body); return { ok: true }; }
      case '/api/choose': {
        const [pl, g] = player(body);
        if (g.phase !== 'choose' || !g.pending || g.pending.answererId !== pl.memberId) fail('지금은 고를 수 없습니다.');
        resolveCaravan(g, body.target); return { ok: true };
      }
    }
    if (!path.startsWith('/api/t/')) fail('알 수 없는 요청입니다.');
    if (!isTeacher) fail('교사만 할 수 있습니다.');
    let g = null;
    if (body.g){ g = Games[body.g]; if (!g) fail('게임을 찾을 수 없습니다.'); }
    switch (path){
      case '/api/t/overview': return overview();
      case '/api/t/login': return { ok: true };
      case '/api/t/create': {
        const count = Math.max(1, Math.min(12, +body.count || 1)), mr = Math.max(1, Math.min(30, +body.maxRolls || 10));
        const dc = Math.max(1, Math.min(2, +body.dice || 2)), tm = Math.max(0, Math.min(180, +body.timer || 0));
        const jd = body.judge === 'auto' ? 'auto' : 'teacher';
        if (body.mode === 'team') newGame((body.title || '').trim() || '모둠 대항 팀전', 'team', mr, dc, tm, count, jd);
        else for (let k = 1; k <= count; k++) newGame(`${k}모둠 개인전`, 'solo', mr, dc, tm, 0, jd);
        return { ok: true };
      }
      case '/api/t/start': startGame(g); return { ok: true };
      case '/api/t/startall': for (const id of GameOrder){ const x = Games[id]; if (x.status === 'lobby') try { startGame(x); } catch (e){} } return { ok: true };
      case '/api/t/end': if (g.status !== 'ended') finishGame(g, '교사 종료'); return { ok: true };
      case '/api/t/endall': for (const id of GameOrder){ const x = Games[id]; if (x.status === 'playing') finishGame(x, '교사 종료'); } return { ok: true };
      case '/api/t/skip': skipTurn(g); return { ok: true };
      case '/api/t/judge':
        if (g.phase !== 'judge' || !g.pending) fail('채점할 답이 없습니다.');
        resolveQuiz(g, !!body.ok, false, g.pending.typed, 'teacher'); return { ok: true };
      case '/api/t/score': {
        const u = findUnit(g, body.unit); if (!u) fail('대상을 찾을 수 없습니다.');
        const d = parseInt(body.delta, 10) || 0;
        u.score = Math.max(0, u.score + d);
        addLog(g, `교사가 ${u.name}의 점수를 ${d > 0 ? '+' : ''}${d} 조정`); touch(g); return { ok: true };
      }
      case '/api/t/kick': if (g.status !== 'lobby') fail('대기 중에만 내보낼 수 있습니다.'); removeMember(g, body.unit, body.member); return { ok: true };
      case '/api/t/delete': deleteGame(g.id); return { ok: true };
      case '/api/t/deleteall': for (const id of GameOrder.slice()) deleteGame(id); Tokens = {}; return { ok: true };
      case '/api/t/resetnotes': Stats = {}; stateDirty = true; return { ok: true };
    }
    fail('알 수 없는 요청입니다.');
  }

  /* ---------------- 저장/복원, 변경 내역 ---------------- */
  function snapshot(){ return { games: Games, order: GameOrder, tokens: Tokens, stats: Stats }; }
  function restore(s){
    if (!s) return;
    Games = s.games || {}; GameOrder = (s.order || []).filter(id => Games[id]); Tokens = s.tokens || {}; Stats = s.stats || {};
    for (const id of GameOrder){
      const g = Games[id];
      g.units = g.units || []; g.log = g.log || []; g.stats = g.stats || {};
      g.units.forEach(u => u.members = u.members || []);
      if (g.pending){ g.pending.preds = g.pending.preds || {}; if (g.pending.deadline > 0) g.pending.deadline = Math.max(g.pending.deadline, now() + 20000); }
      dirty.add(id);
    }
    lobbyDirty = true;
  }
  function takeChanges(){
    const ids = [...dirty]; dirty.clear();
    const out = { games: ids.map(id => [id, Games[id] ? view(Games[id]) : null]), lobby: lobbyDirty ? lobby() : null, state: stateDirty };
    lobbyDirty = false; stateDirty = false;
    return out;
  }

  return { init, handle, tick, snapshot, restore, takeChanges, overview };
})();
