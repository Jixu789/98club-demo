/* ============================================================
   98 CLUB - 核心逻辑
   零依赖 · 窗口管理 / 游戏大厅 / 组队互动 / 排行榜 / 结算彩蛋
   所有数据为本地模拟，刷新后恢复初始演示状态
   ============================================================ */
'use strict';

/* ---------------- 模拟数据 ---------------- */
const GAMES = [
  { id: 'snake', name: '贪吃蛇大作战', ico: '🐍', desc: '经典街机 · 4人混战' },
  { id: 'mine',  name: '扫雷风暴',     ico: '💣', desc: '竞速排雷 · 4人对抗' },
  { id: 'race',  name: '像素赛车',     ico: '🏎️', desc: '复古竞速 · 4人联机' },
];

const BOT_NAMES = ['赛博蛇', '像素魅影', '98号战神', '磁盘收藏家', '猫爪敲键盘', '蓝屏警告', '拨号上网侠', '软盘骑士'];
const ME = { name: '指挥官_98', ready: false, score: 4380, wins: 76 };

let roomSeq = 0;
function mkRoom(name, gameId, members, status) {
  roomSeq += 1;
  return { id: 'r' + roomSeq, name, gameId, max: 4, status: status || 'waiting', members };
}
const bot = (name, ready) => ({ name, bot: true, ready: !!ready });

let rooms = [
  mkRoom('蛇王争霸',   'snake', [bot('赛博蛇', true), bot('像素魅影', true)]),
  mkRoom('极速漂移夜', 'race',  [bot('拨号上网侠'), bot('蓝屏警告')]),
  mkRoom('雷区冲锋',   'mine',  [bot('98号战神', true), bot('磁盘收藏家', true), bot('猫爪敲键盘', true), bot('软盘骑士', true)], 'playing'),
  mkRoom('午夜蛇窟',   'snake', [bot('像素魅影')]),
];

const BOARD = [
  { name: '赛博蛇',     game: 'snake', wins: 132, score: 9870 },
  { name: '像素魅影',   game: 'snake', wins: 121, score: 9120 },
  { name: '98号战神',   game: 'mine',  wins: 118, score: 8750 },
  { name: '扫雷の王',   game: 'mine',  wins: 109, score: 7990 },
  { name: '磁盘收藏家', game: 'race',  wins: 96,  score: 7460 },
  { name: '猫爪敲键盘', game: 'race',  wins: 88,  score: 6980 },
  { name: '蓝屏警告',   game: 'mine',  wins: 81,  score: 6540 },
  { name: '拨号上网侠', game: 'snake', wins: 74,  score: 5880 },
  { name: '软盘骑士',   game: 'race',  wins: 66,  score: 5210 },
  { name: '新手_9527',  game: 'mine',  wins: 51,  score: 4380 },
];
const GAME_NAME = id => (GAMES.find(g => g.id === id) || {}).name || id;

/* ---------------- 状态 ---------------- */
const state = {
  currentRoomId: null,
  soundOn: false,
  zTop: 100,
  minimized: {},   // winId -> bool
  boardFilter: 'all',
  settled: 0,
  lastGameId: 'snake',
  pendingSettle: false,
};

/* ---------------- 工具 ---------------- */
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const gameOf = id => GAMES.find(g => g.id === id);
const roomOf = id => rooms.find(r => r.id === id);
const nowStr = () => { const d = new Date(); return [d.getHours(), d.getMinutes(), d.getSeconds()].map(n => String(n).padStart(2, '0')).join(':'); };

function toast(msg, type) {
  const box = document.createElement('div');
  box.className = 'toast ' + (type || 'ok');
  box.textContent = msg;
  $('#toasts').appendChild(box);
  setTimeout(() => { box.style.opacity = '0'; box.style.transition = 'opacity .3s'; }, 2200);
  setTimeout(() => box.remove(), 2600);
}

/* ---------------- 音效（默认关闭） ---------------- */
let audioCtx = null;
function beep(freq, dur, delay) {
  if (!state.soundOn) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const t = audioCtx.currentTime + (delay || 0);
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'square'; o.frequency.value = freq;
    g.gain.setValueAtTime(0.08, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(audioCtx.destination);
    o.start(t); o.stop(t + dur);
  } catch (e) { /* 音效失败不影响主流程 */ }
}
const sndClick = () => beep(660, 0.07, 0);
const sndReady = () => { beep(523, 0.08, 0); beep(784, 0.1, 0.09); };
const sndWin = () => { [523, 659, 784, 1046].forEach((f, i) => beep(f, 0.16, i * 0.13)); };

/* ---------------- 窗口管理 ---------------- */
const WIN_POS = { 'win-lobby': { l: 200, t: 70 }, 'win-board': { l: 620, t: 110 }, 'win-sysinfo': { l: 280, t: 140 } };

function raiseZ(w) {
  state.zTop += 1;
  if (state.zTop > 7000) { // 防止长期使用后越过任务栏/CRT层
    let z = 100;
    $$('.window').forEach(x => { if (x.classList.contains('open')) x.style.zIndex = z++; });
    state.zTop = z;
  }
  w.style.zIndex = state.zTop;
}
function openWindow(id) {
  const w = document.getElementById(id);
  if (!w) return;
  w.classList.add('open');
  w.classList.remove('off');
  state.minimized[id] = false;
  raiseZ(w);
  if (!w.style.left) {
    const p = WIN_POS[id] || { l: 240, t: 100 };
    const maxL = Math.max(10, window.innerWidth - w.offsetWidth - 20);
    w.style.left = Math.min(p.l, maxL) + 'px';
    w.style.top = Math.min(p.t, Math.max(10, window.innerHeight - 200)) + 'px';
  }
  renderTaskbar();
}
function closeWindow(id) {
  document.getElementById(id).classList.remove('open');
  state.minimized[id] = false;
  renderTaskbar();
}
function minimizeWindow(id) {
  document.getElementById(id).classList.remove('open');
  state.minimized[id] = true;
  renderTaskbar();
}
function focusWindow(id) {
  $$('.window').forEach(w => w.classList.add('off'));
  const w = document.getElementById(id);
  w.classList.remove('off');
  raiseZ(w);
  renderTaskbar();
}
function isRoomView() { return !$('#roomView').classList.contains('hidden'); }

function renderTaskbar() {
  const box = $('#taskItems');
  box.innerHTML = '';
  $$('.window').forEach(w => {
    const id = w.id;
    const open = w.classList.contains('open');
    const min = state.minimized[id];
    if (!open && !min) return;
    const b = document.createElement('button');
    b.className = 'task-item' + (open && !min ? ' active' : '');
    b.textContent = (w.dataset.icon || '▦') + ' ' + (w.dataset.title || id);
    b.onclick = () => {
      if (state.minimized[id]) { openWindow(id); focusWindow(id); }
      else if (w.classList.contains('open')) {
        if (w.style.zIndex == state.zTop) minimizeWindow(id); else focusWindow(id);
      } else openWindow(id);
    };
    box.appendChild(b);
  });
}

/* 窗口拖动 + 关闭/最小化 */
$$('.window').forEach(w => {
  w.addEventListener('mousedown', () => focusWindow(w.id));
  const tb = w.querySelector('.titlebar');
  tb.addEventListener('mousedown', e => {
    if (e.target.closest('.t-btn')) return;
    const rect = w.getBoundingClientRect();
    const ox = e.clientX - rect.left, oy = e.clientY - rect.top;
    const move = ev => {
      const nl = Math.min(Math.max(-w.offsetWidth + 120, ev.clientX - ox), window.innerWidth - 120);
      const nt = Math.min(Math.max(0, ev.clientY - oy), window.innerHeight - 90);
      w.style.left = nl + 'px'; w.style.top = nt + 'px';
    };
    const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
    e.preventDefault();
  });
  w.querySelector('.t-close').addEventListener('click', e => { e.stopPropagation(); closeWindow(w.id); sndClick(); });
  const minBtn = w.querySelector('.t-min');
  if (minBtn) minBtn.addEventListener('click', e => { e.stopPropagation(); minimizeWindow(w.id); sndClick(); });
});

/* ---------------- 大厅渲染 ---------------- */
function renderGames() {
  $('#gameGrid').innerHTML = GAMES.map(g => {
    const rs = rooms.filter(r => r.gameId === g.id);
    const players = rs.reduce((s, r) => s + r.members.length, 0);
    return `<div class="game-card">
      <div class="game-ico">${g.ico}</div>
      <div class="game-name">${g.name}</div>
      <div class="game-info">${g.desc}<br>房间 <b>${rs.length}</b> 个 · 玩家 <b>${players}</b> 人</div>
      <button class="btn btn-accent btn-sm btn-create" data-game="${g.id}">创建房间</button>
    </div>`;
  }).join('');
}

function renderRooms() {
  const list = $('#roomList');
  $('#roomCount').textContent = `共 ${rooms.length} 个房间`;
  if (!rooms.length) { list.innerHTML = '<p class="muted" style="padding:8px">暂无房间，点击上方「创建房间」开局。</p>'; return; }
  list.innerHTML = rooms.map(r => {
    const full = r.members.length >= r.max;
    const tag = r.status === 'playing' ? '<span class="tag tag-play">游戏中</span>'
      : full ? '<span class="tag tag-full">已满员</span>'
      : '<span class="tag tag-wait">等待中</span>';
    const btn = r.status === 'playing' ? '<button class="btn btn-sm" disabled>进行中</button>'
      : full ? '<button class="btn btn-sm btn-join" data-id="' + r.id + '" disabled>已满员</button>'
      : '<button class="btn btn-accent btn-sm btn-join" data-id="' + r.id + '">加入</button>';
    return `<div class="room-row">
      <span class="r-name">${r.name}</span>
      <span class="r-game">${gameOf(r.gameId).ico} ${gameOf(r.gameId).name}</span>
      <span class="r-cnt">${r.members.length}/${r.max}人</span>
      ${tag}${btn}
    </div>`;
  }).join('');
}

function renderLobbyState() {
  const r = roomOf(state.currentRoomId);
  $('#lobbyState').innerHTML = r
    ? `状态: <b class="cyan">已加入「${r.name}」</b>`
    : '状态: 未加入房间';
}

/* ---------------- 房间（组队互动） ---------------- */
function log(msg) {
  const box = $('#roomLog');
  const p = document.createElement('p');
  p.innerHTML = `[${nowStr()}] ${msg}`;
  box.appendChild(p);
  box.scrollTop = box.scrollHeight;
  while (box.children.length > 30) box.firstChild.remove();
}

function renderRoom() {
  const r = roomOf(state.currentRoomId);
  if (!r) return;
  const g = gameOf(r.gameId);
  $('#roomName').textContent = r.name;
  $('#roomMeta').innerHTML = `${g.ico} ${g.name} · ${r.members.length}/${r.max}人 · 状态 <b class="${r.status === 'playing' ? 'neon' : 'cyan'}">${r.status === 'playing' ? '游戏中' : '等待中'}</b> · 成员含模拟玩家(BOT)`;

  const readyN = r.members.filter(m => m.ready).length;
  $('#readyCount').textContent = `已准备 ${readyN}/${r.members.length}`;

  $('#memberList').innerHTML = r.members.map(m => `
    <div class="member-row">
      <span class="m-dot ${m.ready ? 'on' : ''}"></span>
      <span class="m-name">${m.name}${m.bot ? ' <span class="m-tag">BOT</span>' : ' <span class="you">(你)</span>'}</span>
      <span class="m-state ${m.ready ? 'ready' : ''}">${m.ready ? '✔ 已准备' : '… 未准备'}</span>
    </div>`).join('');

  const meReady = r.members.some(m => m.name === ME.name && !m.bot && m.ready);
  const btnReady = $('#btnReady');
  btnReady.textContent = meReady ? '取消准备' : '准备';
  btnReady.disabled = r.status === 'playing';
  $('#btnSettle').disabled = r.status !== 'playing';
}

function switchView(roomMode) {
  $('#lobbyView').classList.toggle('hidden', roomMode);
  $('#roomView').classList.toggle('hidden', !roomMode);
  renderLobbyState();
}

function checkAllReady(r) {
  if (r.status === 'waiting' && r.members.length > 1 && r.members.every(m => m.ready)) {
    r.status = 'playing';
    log('<b>全员准备完毕，对局开始！</b>');
    toast('全员就绪，对局开始！', 'ok');
    sndReady();
    renderRoom(); renderRooms(); renderGames(); renderLobbyState();
  }
}

function botsAutoReady(r) {
  r.members.filter(m => m.bot && !m.ready).forEach((m, i) => {
    setTimeout(() => {
      if (roomOf(r.id) !== r || r.status !== 'waiting') return;
      m.ready = true;
      log(`${m.name} 已准备（模拟玩家）`);
      sndReady();
      renderRoom(); checkAllReady(r);
    }, 900 + i * 900);
  });
}

function joinRoom(id) {
  const r = roomOf(id);
  if (!r) return;
  if (state.currentRoomId) { toast('你已在一个房间中，请先退出当前房间', 'warn'); return; }
  if (r.members.length >= r.max) { toast('房间已满员，无法加入', 'err'); return; }
  if (r.status === 'playing') { toast('该房间对局进行中，无法加入', 'warn'); return; }
  ME.ready = false;
  r.members.push({ name: ME.name, bot: false, ready: false });
  state.currentRoomId = id;
  openWindow('win-lobby'); switchView(true);
  log(`<b>${ME.name}</b> 加入了房间`);
  toast(`成功加入「${r.name}」`, 'ok');
  sndClick();
  botsAutoReady(r);
  renderRoom(); renderRooms(); renderGames();
}

function createRoom(gameId) {
  if (state.currentRoomId) { toast('你已在一个房间中，请先退出当前房间', 'warn'); return; }
  const r = mkRoom(`${ME.name}的${gameOf(gameId).name.slice(0, 3)}房`, gameId, [bot(BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)])]);
  rooms.unshift(r);
  joinRoom(r.id);
  log('房间创建成功，等待玩家就绪');
}

function leaveRoom() {
  const r = roomOf(state.currentRoomId);
  if (!r) return;
  r.members = r.members.filter(m => m.name !== ME.name || m.bot);
  ME.ready = false;
  if (!r.members.some(m => !m.bot)) rooms = rooms.filter(x => x.id !== r.id); // 无真人则解散
  state.currentRoomId = null;
  switchView(false);
  renderRooms(); renderGames();
  toast('已退出房间', 'ok');
}

/* ---------------- 排行榜 ---------------- */
function renderBoard() {
  const rows = BOARD.slice();
  rows.push({ name: ME.name + '（你）', game: state.lastGameId, wins: ME.wins + state.settled, score: ME.score + state.settled * 25, isMe: true });
  let shown = state.boardFilter === 'all' ? rows : rows.filter(p => p.game === state.boardFilter);
  shown = shown.slice().sort((a, b) => b.score - a.score);
  $('#boardList').innerHTML = shown.map((p, i) => {
    const rank = i + 1;
    const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : String(rank).padStart(2, '0');
    const cls = rank <= 3 ? 'top' + rank + ' b-rank r' + rank : 'b-rank';
    return `<div class="board-row ${rank <= 3 ? 'top' + rank : ''} ${p.isMe ? 'me' : ''}">
      <span class="${cls}">${medal}</span>
      <span class="b-name">${p.name}</span>
      <span class="b-game">${GAME_NAME(p.game)}</span>
      <span class="b-win">胜场 ${p.wins}</span>
      <span class="b-score">${p.score}</span>
    </div>`;
  }).join('');
}

/* ---------------- 结算彩蛋 ---------------- */
let vRaf = 0;
function showVictory() {
  const r = roomOf(state.currentRoomId);
  $('#vSub').textContent = r ? `${gameOf(r.gameId).name} · ${r.name}` : '贪吃蛇大作战 · 排位赛';
  $('#victoryOverlay').classList.remove('hidden');
  cancelAnimationFrame(vRaf);
  $$('.v-num').forEach(el => {
    const target = +el.dataset.v;
    const t0 = performance.now();
    const tick = t => {
      const k = Math.min(1, (t - t0) / 850);
      el.textContent = Math.round(target * (1 - Math.pow(1 - k, 3)));
      if (k < 1) vRaf = requestAnimationFrame(tick);
    };
    vRaf = requestAnimationFrame(tick);
  });
  sndWin();
}

function settleVictory() {
  state.settled += 1;
  state.pendingSettle = true;
  const r = roomOf(state.currentRoomId);
  if (r) state.lastGameId = r.gameId;
  showVictory();
  renderBoard();
  if (r) log(`<b>对局结算：${ME.name} 获胜，积分 +25</b>`);
}

function closeVictory() {
  $('#victoryOverlay').classList.add('hidden');
  if (state.pendingSettle) {
    state.pendingSettle = false;
    toast('胜利已收下，积分 +25 已入账', 'ok');
  }
}

/* ---------------- 事件绑定 ---------------- */
$('#roomList').addEventListener('click', e => {
  const b = e.target.closest('.btn-join');
  if (b && !b.disabled) joinRoom(b.dataset.id);
});
$('#gameGrid').addEventListener('click', e => {
  const b = e.target.closest('.btn-create');
  if (b) createRoom(b.dataset.game);
});
$('#btnReady').addEventListener('click', () => {
  const r = roomOf(state.currentRoomId);
  if (!r || r.status === 'playing') return;
  const me = r.members.find(m => m.name === ME.name && !m.bot);
  me.ready = !me.ready;
  if (me.ready) { sndReady(); log(`<b>${ME.name}</b> 已准备`); }
  else log(`${ME.name} 取消了准备`);
  renderRoom(); checkAllReady(r);
});
$('#btnLeave').addEventListener('click', leaveRoom);
$('#btnSettle').addEventListener('click', settleVictory);
$('#boardTabs').addEventListener('click', e => {
  const t = e.target.closest('.tab');
  if (!t) return;
  $$('#boardTabs .tab').forEach(x => x.classList.remove('active'));
  t.classList.add('active');
  state.boardFilter = t.dataset.game;
  renderBoard();
  sndClick();
});
$('#victoryOk').addEventListener('click', closeVictory);
$('#victoryClose').addEventListener('click', closeVictory);
$('#victoryOverlay').addEventListener('click', e => { if (e.target.id === 'victoryOverlay') closeVictory(); });

/* 桌面图标 */
$$('.d-icon').forEach(ic => ic.addEventListener('click', () => {
  const id = ic.dataset.win;
  sndClick();
  if (id === 'victory') { showVictory(); return; }
  openWindow('win-' + id); focusWindow('win-' + id);
}));

/* 开始菜单 */
const sm = $('#startMenu');
$('#startBtn').addEventListener('click', e => {
  e.stopPropagation();
  sm.classList.toggle('hidden');
  $('#startBtn').classList.toggle('active', !sm.classList.contains('hidden'));
});
document.addEventListener('click', e => {
  if (!sm.classList.contains('hidden') && !e.target.closest('#startMenu') && !e.target.closest('#startBtn')) {
    sm.classList.add('hidden');
    $('#startBtn').classList.remove('active');
  }
});
sm.addEventListener('click', e => {
  const it = e.target.closest('.sm-item');
  if (!it) return;
  sm.classList.add('hidden');
  $('#startBtn').classList.remove('active');
  const act = it.dataset.act;
  if (act === 'reset') { location.reload(); return; }
  openWindow('win-' + act.replace('open-', ''));
  focusWindow('win-' + act.replace('open-', ''));
});

/* 音效开关 */
$('#soundBtn').addEventListener('click', () => {
  state.soundOn = !state.soundOn;
  const b = $('#soundBtn');
  b.textContent = '♪ 音效: ' + (state.soundOn ? '开' : '关');
  b.classList.toggle('on', state.soundOn);
  if (state.soundOn) sndClick();
  toast(state.soundOn ? '音效已开启（8-bit）' : '音效已关闭', 'ok');
});

/* 时钟 */
setInterval(() => { $('#clock').textContent = nowStr().slice(0, 5); }, 1000);
$('#clock').textContent = nowStr().slice(0, 5);

/* ---------------- 启动 ---------------- */
renderGames(); renderRooms(); renderBoard();
setTimeout(() => {
  $('#boot').classList.add('done');
  setTimeout(() => $('#boot').remove(), 600);
  toast('欢迎来到 98 CLUB，点击桌面图标开始', 'ok');
}, 1500);
