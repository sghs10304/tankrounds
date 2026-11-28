'use strict';

/* ============================================================
   v7 확장: 각성 · 리롤 · 강철 지반 · 드럼통 · 정찰 위성 · 퀵 채팅 · 메인 메뉴
   ============================================================ */

/* ---------------------------- 1. 카드 3중첩 각성 ---------------------------- */
const MAX_STACK = 3;
const AWAKEN_NAMES = {
  cluster: '은하 확산탄', airstrike: '융단 폭격 사령부', homing: '추적의 신탄', poison: '역병의 근원', bouncer: '무한 탄성구',
  burst: '폭풍 연사포', drill: '지핵 관통자', terraform: '대지 창조주', blackhole: '사건의 지평선', giant: '타이탄 코어',
  sniper: '신궁의 눈', glass: '다이아몬드 대포', leech: '혈월의 송곳니', phoenix: '영원의 불사조', volcano: '태양의 화염구',
  nuke: '종말의 태양', meteor: '혜성 군단', mine: '지뢰 제국', lightning: '천벌의 뇌신', buckshot: '철의 폭풍',
  ufo: '외계 모함', chainbomb: '무한 연쇄핵', twister: '재앙의 태풍', jackpot: '황금 잭팟', wormhole: '차원 지배자',
  magnet: '초전도 자기장', mirror: '만화경 분신', frost: '영겁의 빙결', chaos: '혼돈의 군주', sawblade: '지옥의 회전톱',
  armor: '불괴의 성벽', engine: '음속 엔진', repair: '나노 재생체', heavy: '유성 철갑탄', knockback: '천둥 주먹',
  swap: '차원 맞교환', duck: '황금 오리 군단', anvil: '신의 대장간', banana: '바나나 대폭발',
  bee: '여왕벌의 분노', turtle: '현무의 진격', bowling: '퍼펙트 스트라이크', balloon: '무중력 납치극', frog: '개구리 대홍수',
  firework: '불꽃 대축제', mole: '지저 왕국', burger: '궁극의 만찬', octopus: '크라켄의 먹물', gift: '산타의 보따리',
  satellite: '신의 심판 위성', dragon: '고룡의 겁화', angel: '대천사의 날개', starfall: '은하 종말'
};
// 3중첩에서 능력을 한 번 더 적용하면 지나치게 강해지는 카드는 공격력 보너스만 받음
const NO_EXTRA_APPLY = ['glass', 'buckshot', 'burst', 'nuke', 'giant', 'angel'];

function applyAwaken(s, cards) {
  const counts = {};
  for (const id of cards) counts[id] = (counts[id] || 0) + 1;
  s.awakened = Object.keys(counts).filter(id => counts[id] >= MAX_STACK);
  for (const id of s.awakened) {
    if (!NO_EXTRA_APPLY.includes(id)) CARD_DEFS[id].apply(s);
    s.damage *= 1.12;
  }
  s.awakenColor = s.awakened.length ? CARD_DEFS[s.awakened[s.awakened.length - 1]].color : null;
  s.maxHp = Math.round(s.maxHp);
}

function drawAwakenAura(s) {
  const col = s.owner.stats.awakenColor;
  if (!col || s.ghost) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = col;
  const pulse = 1 + Math.sin(G.time * 18) * 0.2;
  for (const [mul, a] of [[3.2, 0.18], [2, 0.34]]) {
    ctx.globalAlpha = a; ctx.beginPath(); ctx.arc(s.x, s.y, (s.r + 3) * mul * pulse, 0, TAU); ctx.fill();
  }
  // 뒤로 끌리는 꼬리
  const v = Math.hypot(s.vx, s.vy) || 1;
  for (let i = 1; i <= 5; i++) {
    ctx.globalAlpha = 0.4 - i * 0.06;
    ctx.beginPath(); ctx.arc(s.x - s.vx / v * i * 9, s.y - s.vy / v * i * 9, s.r * (1.6 - i * 0.2), 0, TAU); ctx.fill();
  }
  ctx.restore();
}

function awakenBlast(s) {
  const col = s.owner.stats.awakenColor;
  if (!col || s.child) return;
  burst(s.x, s.y, 30, { colors: [col, '#ffffff', col], speed: 520, life: 0.8, size: 4, grav: 0.35, kind: 'spark' });
  const n = parseInt(col.slice(1), 16);
  const rgb = `${n >> 16},${(n >> 8) & 255},${n & 255}`;
  G.rings.push({ x: s.x, y: s.y, max: s.radius * 2.1, t: 0, life: 0.55, color: rgb });
  G.rings.push({ x: s.x, y: s.y, max: s.radius * 1.4, t: 0, life: 0.4, color: '255,255,255' });
}

/* ---------------------------- 2. 개별 카드 리롤 (매치당 1회) ---------------------------- */
const REROLL_Y = 712, REROLL_W = 230, REROLL_H = 40;

function maxedCards(p) {
  const m = countCards(p);
  return Object.keys(m).filter(id => m[id] >= MAX_STACK);
}

function canReroll() {
  return G.state === 'cards' && players[G.cardLoser].rerolls > 0 && (!Net.active || G.cardLoser === Net.myId);
}

function rerollCard(i, remote = null) {
  if (G.state !== 'cards') return;
  const p = players[G.cardLoser];
  if (p.rerolls <= 0) return;
  let id = remote;
  if (id === null) {
    if (!canReroll() || G.stateT < 0.5) return;
    RNG.setSeed((Date.now() ^ ((Math.random() * 0xFFFFFFFF) >>> 0)) >>> 0);
    id = rollCard([...G.choices, ...maxedCards(p)], G.comeback);
    if (Net.active) Net.send({ type: 'cardReroll', index: i, id }, 1);
  }
  p.rerolls--;
  G.choices[i] = id;
  if (G.deal && G.deal.index === i) G.deal = null;
  G.sel = i;
  G.rerollFx = { i, at: G.time };
  Sfx.portal();
}

function rerollButtonAt(x, y) {
  if (!canReroll()) return -1;
  for (let i = 0; i < G.choices.length; i++) {
    const cx = cardCenterX(i);
    if (Math.abs(x - cx) <= REROLL_W / 2 && y >= REROLL_Y && y <= REROLL_Y + REROLL_H) return i;
  }
  return -1;
}

function drawRerollButtons() {
  if (G.state !== 'cards') return;
  const p = players[G.cardLoser], able = canReroll();
  ctx.textAlign = 'center';
  for (let i = 0; i < G.choices.length; i++) {
    const cx = cardCenterX(i);
    ctx.fillStyle = able ? '#2a2f66' : 'rgba(40,40,60,0.7)';
    rr(cx - REROLL_W / 2, REROLL_Y, REROLL_W, REROLL_H, 20); ctx.fill();
    ctx.strokeStyle = able ? '#69f0ae' : '#555a77'; ctx.lineWidth = 2; ctx.stroke();
    ctx.font = `900 16px ${FONT}`; ctx.fillStyle = able ? '#d7ffe9' : '#7b7f9e';
    ctx.fillText(p.rerolls > 0 ? '🔄 이 카드만 교체' : '🔄 리롤 사용 완료', cx, REROLL_Y + 26);
  }
}

/* ---------------------------- 3. 강철 지반 ---------------------------- */
function placeSteel(spawnXs) {
  const blocks = [];
  const anchors = [W * 0.5, W * 0.32, W * 0.68];
  for (const a of anchors) {
    let cx = Math.round(a + rand(-50, 50));
    // 탱크 시작 위치와 겹치지 않게 비켜 놓음
    if (spawnXs.some(x => Math.abs(x - cx) < 110)) cx += 140;
    if (spawnXs.some(x => Math.abs(x - cx) < 100)) continue;
    const w = Math.round(rand(70, 110));
    const x = clamp(cx - (w >> 1), 20, W - 20 - w);
    const y = Math.round(Terrain.top[x + (w >> 1)]);
    // 걸어 올라갈 수 있도록 주변 지형을 완만하게 맞춤
    const taper = 60;
    for (let tx = x - taper; tx < x + w + taper; tx++) {
      if (tx < 0 || tx >= W) continue;
      const d = tx < x ? x - tx : tx >= x + w ? tx - (x + w - 1) : 0;
      const k = 1 - d / taper, e = k * k * (3 - 2 * k);
      Terrain.top[tx] = lerp(Terrain.top[tx], y, e);
    }
    blocks.push({ x, y, w, h: Math.min(46, H - BEDROCK - y) });
  }
  return blocks;
}

let steelSprite = null;
function drawSteelBlock(c, b) {
  if (!steelSprite) {
    const [cv, x] = makeLayer(120, 48);
    const g = x.createLinearGradient(0, 0, 0, 48);
    g.addColorStop(0, '#eceff1'); g.addColorStop(0.18, '#90a4ae'); g.addColorStop(0.6, '#546e7a'); g.addColorStop(1, '#263238');
    x.fillStyle = g; x.fillRect(0, 0, 120, 48);
    // 위험 줄무늬
    x.save(); x.beginPath(); x.rect(0, 5, 120, 9); x.clip();
    x.fillStyle = '#ffca28'; x.fillRect(0, 5, 120, 9);
    x.fillStyle = '#212121';
    for (let i = -20; i < 140; i += 18) { x.beginPath(); x.moveTo(i, 14); x.lineTo(i + 9, 14); x.lineTo(i + 18, 5); x.lineTo(i + 9, 5); x.fill(); }
    x.restore();
    for (let i = 10; i < 120; i += 25) for (const y of [23, 39]) {
      x.fillStyle = '#263238'; x.beginPath(); x.arc(i, y + 1, 3.2, 0, TAU); x.fill();
      x.fillStyle = '#cfd8dc'; x.beginPath(); x.arc(i, y, 2.4, 0, TAU); x.fill();
    }
    steelSprite = cv;
  }
  c.drawImage(steelSprite, 0, 0, b.w, b.h, b.x, b.y, b.w, b.h);
  c.strokeStyle = '#102027'; c.lineWidth = 2; c.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
}

/* ---------------------------- 4. 화약 드럼통 ---------------------------- */
const BARREL_INTERVAL = 8, BARREL_DAMAGE = 18, BARREL_RADIUS = 52, BARREL_MAX = 9;

function dropBarrels() {
  if ((G.turnCount - 1) % BARREL_INTERVAL !== 0) return;
  let made = 0;
  for (let tries = 0; tries < 40 && made < 3 && G.barrels.length < BARREL_MAX; tries++) {
    const x = Math.round(rand(90, W - 90));
    if (players.some(p => p.alive && Math.abs(p.x - x) < 100)) continue;
    if (G.barrels.some(b => Math.abs(b.x - x) < 70)) continue;
    G.barrels.push({ x, y: 170 - made * 30, vy: 0, landed: false, fuse: 0 });
    made++;
  }
  if (made) G.floaters.push({ x: W / 2, y: 215, text: `🛢️ 화약 드럼통 ${made}개 투하!`, color: '#ffab40', t: 0, life: 2.0 });
}

function igniteBarrels(x, y, radius, delay = 0.14) {
  for (const b of G.barrels) {
    if (b.fuse > 0) continue;
    if (Math.hypot(b.x - x, b.y - 14 - y) <= radius + 16) b.fuse = delay;
  }
}

function barrelHit(px, py, r) {
  for (const b of G.barrels) {
    if (b.fuse === 0 && Math.abs(px - b.x) <= 12 + r && py >= b.y - 30 - r && py <= b.y + r) return b;
  }
  return null;
}

function updateBarrels(dt) {
  for (let i = G.barrels.length - 1; i >= 0; i--) {
    const b = G.barrels[i];
    if (!b) continue;
    const ground = Terrain.h(b.x);
    if (b.y < ground - 0.5) {
      // 낙하산으로 천천히 내려옴 (착지한 뒤 땅이 꺼지면 빠르게 추락)
      b.vy = b.landed ? b.vy + G.gravity * dt : 190;
      b.y = Math.min(ground, b.y + b.vy * dt);
    } else {
      b.y = ground; b.vy = 0; b.landed = true;
    }
    if (b.fuse > 0) {
      b.fuse -= dt;
      if (b.fuse <= 0) {
        G.barrels.splice(i, 1);
        burst(b.x, b.y - 14, 18, { colors: FIRE_COLORS, speed: 380, life: 0.7, size: 4, grav: 0.5, kind: 'spark' });
        explode({ x: b.x, y: b.y - 10, radius: BARREL_RADIUS, damage: BARREL_DAMAGE }, null);
      }
    }
  }
}

let barrelSprite = null;
function drawBarrels() {
  if (!barrelSprite) {
    const [cv, x] = makeLayer(26, 32);
    const g = x.createLinearGradient(0, 0, 26, 0);
    g.addColorStop(0, '#7f0000'); g.addColorStop(0.45, '#ff5252'); g.addColorStop(1, '#7f0000');
    x.fillStyle = g; x.beginPath(); x.roundRect(1, 1, 24, 30, 5); x.fill();
    x.fillStyle = '#37474f'; x.fillRect(1, 7, 24, 3); x.fillRect(1, 22, 24, 3);
    x.fillStyle = '#ffd600'; x.beginPath(); x.moveTo(13, 10); x.lineTo(20, 21); x.lineTo(6, 21); x.closePath(); x.fill();
    x.fillStyle = '#111'; x.fillRect(12, 13, 2, 5); x.fillRect(12, 19, 2, 1.5);
    barrelSprite = cv;
  }
  for (const b of G.barrels) {
    if (!b.landed) {
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(b.x - 16, b.y - 52); ctx.lineTo(b.x - 9, b.y - 29); ctx.moveTo(b.x + 16, b.y - 52); ctx.lineTo(b.x + 9, b.y - 29); ctx.stroke();
      ctx.fillStyle = '#ffab40'; ctx.beginPath(); ctx.arc(b.x, b.y - 52, 18, Math.PI, 0); ctx.fill();
    }
    ctx.drawImage(barrelSprite, b.x - 13, b.y - 31);
    if (b.fuse > 0) {
      ctx.fillStyle = 'rgba(255,255,200,0.75)'; ctx.beginPath(); ctx.arc(b.x, b.y - 16, 19, 0, TAU); ctx.fill();
    }
  }
}

/* ---------------------------- 5. 정찰 위성 & 궤도 레이저 ---------------------------- */
const SAT_RADIUS = 15;
const satWindow = () => Math.floor((G.turnCount + 1) / 6); // 5~6턴, 11~12턴, 17~18턴 ...

function satelliteActive() {
  const m = G.turnCount % 6;
  return G.turnCount >= 5 && (m === 5 || m === 0) && G.satDown !== satWindow();
}

// 빠른 왕복 + 속도 변화 + 위아래 흔들림 (격추 난이도 상)
function satellitePos(t = G.satT) {
  const span = W - 160;
  const run = t * 540 + Math.sin(t * 2.7) * 120;
  const m = ((run % (span * 2)) + span * 2) % (span * 2);
  return { x: 80 + (m < span ? m : span * 2 - m), y: 222 + Math.sin(t * 3.3) * 44 + Math.sin(t * 7.1) * 12 };
}

function checkSatelliteHit(px, py, shell) {
  if (shell.ghost || !satelliteActive()) return false;
  const p = satellitePos();
  if (Math.hypot(px - p.x, py - p.y) > SAT_RADIUS + shell.r) return false;
  G.satDown = satWindow();
  const owner = shell.owner;
  owner.laser = 1;
  burst(p.x, p.y, 40, { colors: ['#fff', '#80d8ff', '#ffd54f'], speed: 430, life: 1.1, size: 4, grav: 0.8, kind: 'spark' });
  G.flashes.push({ x: p.x, y: p.y, r: 90, t: 0, life: 0.35 });
  Sfx.explosion(60); Sfx.synergy();
  showBanner('🛰️ 위성 격추!', `${owner.name}: 다음 발사에 궤도 레이저 장전`, '#80d8ff', 2.2);
  return true;
}

function fireOrbitalLaser(x) {
  G.fields.push({ type: 'laser', x: clamp(x, 20, W - 20), owner: G.orbital, t: 0.1, damage: 45, fired: false, big: true });
  G.floaters.push({ x, y: 190, text: '🛰️ 궤도 레이저 발사!', color: '#80d8ff', t: 0, life: 1.6 });
  G.orbital = null;
  Sfx.siren();
}

function drawSatellite() {
  if (!satelliteActive()) return;
  const p = satellitePos();
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.strokeStyle = 'rgba(128,216,255,0.55)'; ctx.lineWidth = 1.5;
  const ping = (G.time * 1.4) % 1;
  ctx.globalAlpha = 1 - ping; ctx.beginPath(); ctx.arc(0, 0, 18 + ping * 30, 0, TAU); ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#1565c0'; ctx.fillRect(-34, -6, 20, 12); ctx.fillRect(14, -6, 20, 12);
  ctx.strokeStyle = '#90caf9'; ctx.lineWidth = 1;
  for (const sx of [-34, -27, -21, 14, 21, 27]) ctx.strokeRect(sx, -6, 7, 12);
  ctx.fillStyle = '#cfd8dc'; rr(-12, -10, 24, 20, 5); ctx.fill();
  ctx.fillStyle = Math.sin(G.time * 12) > 0 ? '#ff1744' : '#5d1020';
  ctx.beginPath(); ctx.arc(0, 0, 4.5, 0, TAU); ctx.fill();
  ctx.font = `bold 12px ${FONT}`; ctx.textAlign = 'center'; ctx.fillStyle = '#b3e5fc';
  ctx.fillText('정찰 위성 · 격추하면 레이저!', 0, -20);
  ctx.restore();
}

/* ---------------------------- 6. 퀵 채팅 ---------------------------- */
const EMOTES = ['😱', '🥵', '🎯', '💀'];
const EMOTE_X = W - 62, EMOTE_Y = 190, EMOTE_STEP = 56, EMOTE_SIZE = 46;
const emoteReady = () => ['aiming', 'resolving', 'roundEnd'].includes(G.state);

function showEmote(id, idx) {
  const p = players[id];
  if (!p || !EMOTES[idx]) return;
  p.chat = { text: EMOTES[idx], until: G.time + 2.5, at: G.time };
  Sfx.pop();
}

function sendEmote(idx) {
  if (!emoteReady()) return;
  const id = Net.active ? Net.myId : G.turn; // 로컬은 현재 차례 플레이어
  const p = players[id];
  if (!p || (p.chat && G.time - p.chat.at < 0.6)) return;
  showEmote(id, idx);
  if (Net.active) Net.send({ type: 'chat', id, e: idx }, 0);
}

function emoteButtonAt(x, y) {
  if (!emoteReady()) return -1;
  for (let i = 0; i < EMOTES.length; i++) {
    const by = EMOTE_Y + i * EMOTE_STEP;
    if (x >= EMOTE_X && x <= EMOTE_X + EMOTE_SIZE && y >= by && y <= by + EMOTE_SIZE) return i;
  }
  return -1;
}

function drawEmotes() {
  if (!emoteReady()) return;
  ctx.textAlign = 'center';
  EMOTES.forEach((e, i) => {
    const y = EMOTE_Y + i * EMOTE_STEP;
    ctx.fillStyle = 'rgba(10,12,34,0.72)'; rr(EMOTE_X, y, EMOTE_SIZE, EMOTE_SIZE, 12); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.font = `26px ${FONT}`; ctx.fillStyle = '#fff'; ctx.fillText(e, EMOTE_X + 23, y + 33);
    ctx.font = `bold 11px ${FONT}`; ctx.fillStyle = '#ffd54f'; ctx.fillText(String(i + 1), EMOTE_X + 7, y + 13);
  });
}

function drawChatBubbles() {
  for (const p of players) {
    const c = p.chat;
    if (!c || G.time >= c.until) continue;
    const age = G.time - c.at, pop = Math.min(1, age / 0.18);
    const y = Math.max(165, p.y - 100 * p.stats.tankScale);
    ctx.save();
    ctx.translate(p.x, y); ctx.scale(pop, pop);
    ctx.globalAlpha = Math.min(1, (c.until - G.time) / 0.3);
    ctx.fillStyle = '#fff'; rr(-32, -30, 64, 52, 18); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-8, 20); ctx.lineTo(0, 34); ctx.lineTo(10, 20); ctx.fill();
    ctx.strokeStyle = p.color; ctx.lineWidth = 3.5; rr(-32, -30, 64, 52, 18); ctx.stroke();
    ctx.font = `34px ${FONT}`; ctx.textAlign = 'center'; ctx.fillStyle = '#000'; ctx.fillText(c.text, 0, 9);
    ctx.restore();
  }
}

/* ---------------------------- 7. 게임형 메인 메뉴 ---------------------------- */
const TITLE_BTNS = [
  { mode: '1v1', icon: '⚔️', title: '로컬 1 : 1 결투', color: '#4fc3f7', lines: ['한 기기에서 즐기는 클래식 듀얼', 'P1  WASD + Space', 'P2  방향키 + Enter'] },
  { mode: '2v2', icon: '🛡️', title: '로컬 2 : 2 팀전', color: '#ff8a65', lines: ['블루(P1·P3)  vs  레드(P2·P4)', 'P3  IJKL + U   ·   P4  넘패드 4856 + 0', '아군 폭발 피해 없음'] },
  { mode: 'online', icon: '🌐', title: '온라인 멀티', color: '#69f0ae', lines: ['1:1 · 2:2 팀전 · 4인 난투', '4자리 방 코드로 친구 초대', '조작: WASD 또는 방향키 + Space/Enter'] },
  { mode: 'codex', icon: '📖', title: '카드 도감', color: '#e040fb', lines: ['모든 카드와 등급 둘러보기', '3번 겹치면 각성 형태로 진화'] },
  { mode: 'help', icon: '❔', title: '게임 방법', color: '#ffd54f', lines: ['규칙과 새 기능 안내'] }
].map((b, i) => Object.assign(b, { x: 96, y: 318 + i * 92, w: 500, h: 76 }));

const HELP_LINES = [
  `🏆 ${WINS_TO_MATCH}승을 먼저 하면 최종 우승 · 라운드가 끝나면 모두 카드 선택`,
  '🔥 직전 라운드 패배자는 카드 4장 중 선택 + 희귀 확률 상승 (승자는 3장)',
  '🔄 매치당 한 번, 원하는 카드 1장만 교체 (버튼 클릭 또는 R 키)',
  '✨ 같은 카드를 3번 모으면 각성 · 3번이 최대',
  '😈 가끔 등장하는 악마의 거래: 대가를 치르고 전설 카드 획득',
  '🛢️ 1턴부터 8턴마다 화약 드럼통 투하 · 서로 연쇄 폭발',
  '🛰️ 5~6, 11~12, 17~18턴의 정찰 위성을 격추하면 궤도 레이저 획득',
  '⬛ 강철 지반은 어떤 폭발에도 부서지지 않음',
  '🎲 2라운드마다 돌발 규칙 · 👻 4인전에서 쓰러지면 유령의 복수',
  `☠️ ${SUDDEN_DEATH_TURN}턴이 지나면 서든데스   💬 숫자 1~4 로 이모지`
];
const CODEX_COLS = 6, CODEX_ROWS = 3;

const codexList = () => ['legend', 'epic', 'rare', 'common'].flatMap(k => RARITY_LIST[k]);
const codexPages = () => Math.ceil(codexList().length / (CODEX_COLS * CODEX_ROWS));

function activateMenu(mode) {
  canvas.style.cursor = 'default';
  Sfx.cardPick();
  if (mode === 'online') Net.openModal();
  else if (mode === 'codex' || mode === 'help') { G.menuPage = mode; G.codexPage = 0; }
  else { Net.active = false; startMatch(mode); }
}

function menuKey(code) {
  if (G.menuPage) {
    if (code === 'Escape' || code === 'Backspace') G.menuPage = null;
    else if (G.menuPage === 'codex' && (code === 'ArrowRight' || code === 'KeyD')) G.codexPage = (G.codexPage + 1) % codexPages();
    else if (G.menuPage === 'codex' && (code === 'ArrowLeft' || code === 'KeyA')) G.codexPage = (G.codexPage + codexPages() - 1) % codexPages();
    else if (code === 'Space' || code === 'Enter') G.menuPage = null;
    return;
  }
  const n = TITLE_BTNS.length;
  const num = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Digit5: 4, Numpad1: 0, Numpad2: 1, Numpad3: 2 }[code];
  if (num !== undefined) activateMenu(TITLE_BTNS[num].mode);
  else if (code === 'ArrowUp' || code === 'KeyW') { G.menuSel = (G.menuSel + n - 1) % n; Sfx.cardMove(); }
  else if (code === 'ArrowDown' || code === 'KeyS') { G.menuSel = (G.menuSel + 1) % n; Sfx.cardMove(); }
  else if (code === 'Space' || code === 'Enter') activateMenu(TITLE_BTNS[G.menuSel].mode);
}

function menuButtonAt(x, y) {
  return TITLE_BTNS.findIndex(b => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
}

function menuClick(x, y) {
  if (G.menuPage) {
    if (G.menuPage === 'codex' && y > 770 && Math.abs(x - W / 2) > 150) {
      G.codexPage = (G.codexPage + (x > W / 2 ? 1 : codexPages() - 1)) % codexPages();
      Sfx.cardMove();
    } else if (y > 770) G.menuPage = null;
    return;
  }
  const i = menuButtonAt(x, y);
  if (i !== -1) activateMenu(TITLE_BTNS[i].mode);
}

let menuBack = null;
function getMenuBackdrop() {
  if (menuBack) return menuBack;
  const [cv, x] = makeLayer(W, H);
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#05061a'); g.addColorStop(0.45, '#1b1750'); g.addColorStop(0.72, '#6a2c6f'); g.addColorStop(0.9, '#e0675a'); g.addColorStop(1, '#ffb25c');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  const sun = x.createRadialGradient(1180, 690, 20, 1180, 690, 300);
  sun.addColorStop(0, 'rgba(255,240,190,0.95)'); sun.addColorStop(0.3, 'rgba(255,170,90,0.55)'); sun.addColorStop(1, 'rgba(255,120,80,0)');
  x.fillStyle = sun; x.fillRect(780, 330, 800, 570);
  for (const [base, amp, col, ph] of [[690, 70, '#2c1c52', 0.6], [770, 55, '#1b1038', 2.4], [845, 34, '#0b0720', 4.1]]) {
    x.fillStyle = col; x.beginPath(); x.moveTo(0, H);
    for (let i = 0; i <= W; i += 20) x.lineTo(i, base + Math.sin(i / 170 + ph) * amp + Math.sin(i / 61 + ph * 2) * amp * 0.3);
    x.lineTo(W, H); x.fill();
  }
  menuBack = cv;
  return cv;
}

function drawMenuTank(x, y, dir, color) {
  ctx.save();
  ctx.translate(x, y); ctx.scale(dir * 2.1, 2.1);
  ctx.fillStyle = '#05030f'; rr(-26, -10, 52, 12, 6); ctx.fill();
  ctx.fillStyle = color; rr(-20, -21, 40, 13, 5); ctx.fill();
  ctx.beginPath(); ctx.arc(0, -21, 10, Math.PI, 0); ctx.fill();
  ctx.strokeStyle = color; ctx.lineWidth = 5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(3, -24); ctx.lineTo(27, -40); ctx.stroke();
  ctx.restore();
}

// 배경에서 두 탱크가 계속 포탄을 주고받는 장면 (시간으로만 계산)
function drawMenuBattle() {
  const left = { x: 690, y: 838 }, right = { x: 1515, y: 822 };
  drawMenuTank(left.x, left.y, 1, '#4fc3f7');
  drawMenuTank(right.x, right.y, -1, '#ff8a65');
  const cycle = 2.4, n = Math.floor(G.time / cycle), t = (G.time % cycle) / cycle;
  const a = n % 2 ? right : left, b = n % 2 ? left : right;
  if (t < 0.7) {
    const k = t / 0.7;
    ctx.fillStyle = '#fff3c4';
    for (let i = 0; i < 9; i++) {
      const q = k - i * 0.018;
      if (q < 0) break;
      ctx.globalAlpha = 1 - i * 0.11;
      ctx.beginPath(); ctx.arc(lerp(a.x, b.x, q), lerp(a.y - 60, b.y - 20, q) - Math.sin(q * Math.PI) * 190, 7 - i * 0.6, 0, TAU); ctx.fill();
    }
  } else {
    const k = (t - 0.7) / 0.3;
    ctx.globalAlpha = 1 - k; ctx.fillStyle = '#ffca28';
    ctx.beginPath(); ctx.arc(b.x, b.y - 25, 18 + k * 52, 0, TAU); ctx.fill();
    for (let i = 0; i < 14; i++) {
      const ang = i / 14 * TAU;
      ctx.fillRect(b.x + Math.cos(ang) * k * 110, b.y - 25 + Math.sin(ang) * k * 80, 7, 7);
    }
  }
  ctx.globalAlpha = 1;
}

function drawShowcase(info) {
  const px = 690, py = 318, pw = 820, ph = 352;
  ctx.fillStyle = 'rgba(8,9,30,0.74)'; rr(px, py, pw, ph, 22); ctx.fill();
  ctx.strokeStyle = info.color; ctx.lineWidth = 2.5; ctx.stroke();
  ctx.textAlign = 'left';
  ctx.font = `900 30px ${FONT}`; ctx.fillStyle = info.color; ctx.fillText(`${info.icon}  ${info.title}`, px + 34, py + 54);
  ctx.font = `17px ${FONT}`; ctx.fillStyle = '#e6e8ff';
  info.lines.forEach((l, i) => ctx.fillText(l, px + 36, py + 94 + i * 30, 380));

  // 대표 카드 3장이 부채꼴로 돌아가며 등장
  const list = codexList(), step = Math.floor(G.time / 2.6), k = clamp((G.time % 2.6) / 0.35, 0, 1);
  for (let i = 0; i < 3; i++) {
    const id = list[((step * 3 + i) * 7) % list.length];
    ctx.save();
    ctx.translate(px + 545 + (i - 1) * 105, py + 205 + Math.abs(i - 1) * 18 + Math.sin(G.time * 2 + i) * 5);
    ctx.rotate((i - 1) * 0.16);
    ctx.scale(0.47 * Math.max(0.05, k), 0.47);
    ctx.drawImage(getCardFace(id, 0), -CARD_W / 2, -CARD_H / 2);
    ctx.restore();
  }
}

function drawMenuPanel(title) {
  ctx.fillStyle = 'rgba(7,8,26,0.94)'; rr(70, 70, W - 140, H - 100, 26); ctx.fill();
  ctx.strokeStyle = '#ffd54f'; ctx.lineWidth = 3; ctx.stroke();
  bigText(title, W / 2, 142, 46, '#ffd54f');
}

function drawCodex() {
  drawMenuPanel('📖 카드 도감');
  const list = codexList(), per = CODEX_COLS * CODEX_ROWS, cw = 232, ch = 184;
  const x0 = W / 2 - CODEX_COLS * cw / 2;
  list.slice(G.codexPage * per, (G.codexPage + 1) * per).forEach((id, i) => {
    const d = CARD_DEFS[id], r = RARITY[rarityOf(id)];
    const x = x0 + (i % CODEX_COLS) * cw + 6, y = 180 + Math.floor(i / CODEX_COLS) * (ch + 8);
    ctx.fillStyle = 'rgba(255,255,255,0.06)'; rr(x, y, cw - 12, ch, 14); ctx.fill();
    ctx.strokeStyle = r.color; ctx.lineWidth = rarityOf(id) === 'legend' ? 4 : 2; ctx.stroke();
    const mid = x + (cw - 12) / 2;
    ctx.textAlign = 'center';
    ctx.font = `46px ${FONT}`; ctx.fillStyle = '#fff'; ctx.fillText(d.icon, mid, y + 58);
    ctx.font = `900 16px ${FONT}`; ctx.fillText(d.name, mid, y + 88, cw - 24);
    ctx.font = `bold 12px ${FONT}`; ctx.fillStyle = r.color; ctx.fillText(`${'★'.repeat(r.stars)} ${r.name}`, mid, y + 108);
    ctx.font = `12px ${FONT}`; ctx.fillStyle = '#cdd1f0'; ctx.fillText(d.desc[0], mid, y + 134, cw - 24);
    ctx.fillStyle = '#ffd54f'; ctx.fillText(`✨ ${AWAKEN_NAMES[id] || d.name}`, mid, y + 166, cw - 24);
  });
  ctx.font = `bold 20px ${FONT}`; ctx.textAlign = 'center'; ctx.fillStyle = '#c8ccec';
  ctx.fillText(`◀ 이전        [ ${G.codexPage + 1} / ${codexPages()} ]  여기를 누르면 닫기 (Esc)        다음 ▶`, W / 2, 815);
}

function drawHelp() {
  drawMenuPanel('❔ 게임 방법');
  ctx.textAlign = 'left'; ctx.font = `22px ${FONT}`; ctx.fillStyle = '#e9ebff';
  HELP_LINES.forEach((l, i) => ctx.fillText(l, 300, 220 + i * 52));
  ctx.textAlign = 'center'; ctx.font = `bold 20px ${FONT}`; ctx.fillStyle = '#9aa0c8';
  ctx.fillText('여기를 누르면 닫기 (Esc)', W / 2, 815);
}

function drawTitle() {
  ctx.drawImage(getMenuBackdrop(), 0, 0);
  ctx.fillStyle = '#fff';
  for (let i = 0; i < 60; i++) {
    ctx.globalAlpha = 0.25 + 0.6 * Math.abs(Math.sin(G.time * (0.6 + (i % 5) * 0.2) + i));
    ctx.fillRect((i * 271 + G.time * (4 + i % 3)) % W, (i * 97) % 420, 2 + (i % 2), 2 + (i % 2));
  }
  ctx.globalAlpha = 1;
  if (G.menuPage === 'codex') { drawCodex(); return; }
  if (G.menuPage === 'help') { drawHelp(); return; }

  drawRays(W / 2, 160, 1000, 0.22);
  drawMenuBattle();
  ctx.drawImage(getLogo(), W / 2 - 450, 62 + Math.sin(G.time * 1.8) * 7);
  ctx.textAlign = 'center';
  ctx.font = `bold 21px ${FONT}`; ctx.fillStyle = '#ffe7c2';
  ctx.fillText(`CARD  ARTILLERY  BATTLE  ·  ${CARD_POOL.length}종 카드  ·  ${WINS_TO_MATCH}승 선취`, W / 2, 258);

  TITLE_BTNS.forEach((b, i) => {
    const on = G.menuSel === i;
    const slide = (1 - (1 - clamp((G.stateT - i * 0.07) / 0.35, 0, 1)) ** 3);
    const x = b.x - (1 - slide) * 620 + (on ? 26 : 0);
    ctx.fillStyle = on ? 'rgba(30,34,84,0.97)' : 'rgba(10,11,36,0.82)';
    ctx.beginPath(); ctx.moveTo(x + 18, b.y); ctx.lineTo(x + b.w, b.y); ctx.lineTo(x + b.w - 18, b.y + b.h); ctx.lineTo(x, b.y + b.h); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = on ? b.color : 'rgba(255,255,255,0.18)'; ctx.lineWidth = on ? 3.5 : 1.5; ctx.stroke();
    ctx.fillStyle = b.color; ctx.fillRect(x + 8, b.y + 14, 7, b.h - 28);
    ctx.textAlign = 'left';
    ctx.font = `34px ${FONT}`; ctx.fillStyle = '#fff'; ctx.fillText(b.icon, x + 36, b.y + 50);
    ctx.font = `italic 900 28px ${FONT}`; ctx.fillStyle = on ? '#fff' : '#c9cdee'; ctx.fillText(b.title, x + 102, b.y + 48);
    ctx.font = `bold 15px ${FONT}`; ctx.fillStyle = b.color;
    ctx.textAlign = 'right'; ctx.fillText(on ? `▶▶` : String(i + 1), x + b.w - 40 + (on ? Math.sin(G.time * 8) * 5 : 0), b.y + 46);
  });

  drawShowcase(TITLE_BTNS[G.menuSel]);
  ctx.textAlign = 'center'; ctx.font = `bold 17px ${FONT}`;
  ctx.globalAlpha = 0.6 + 0.4 * Math.sin(G.time * 3.5); ctx.fillStyle = '#fff';
  ctx.fillText('↑↓ 선택  ·  Enter 시작  ·  마우스 클릭 가능', 346, 810);
  ctx.globalAlpha = 1;
}
