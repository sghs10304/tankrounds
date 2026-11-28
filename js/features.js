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
  firework: '불꽃 대축제',
  penguin: '남극 대함대', chicken: '봉황의 알', cactus: '가시 지옥', snowman: '빙하 대붕괴', pinata: '디저트 대폭발',
  excalibur: '약속된 새벽의 검', titan: '태초의 거신', train: '은하 급행', reaper: '죽음의 군주',
  hammer: '묠니르', specter: '망령의 왕', whale: '리바이어던', mole: '지저 왕국', burger: '궁극의 만찬', octopus: '크라켄의 먹물', gift: '산타의 보따리',
  satellite: '신의 심판 위성', dragon: '고룡 강림', angel: '대천사의 날개', starfall: '은하 종말'
};
// 3중첩에서 능력을 한 번 더 적용하면 지나치게 강해지는 카드는 공격력 보너스만 받음
const NO_EXTRA_APPLY = ['homing', 'glass', 'buckshot', 'burst', 'nuke', 'giant', 'angel'];

// 일반·희귀 카드 3성: 전설 부럽지 않은 보상
// again: 카드 효과를 추가로 적용하는 횟수 (3장 + again = 실제 성능 레벨)
const STAR3 = {
  // 일반
  bouncer: { text: '총 10번 튕기며 튕길수록 강해짐', again: 2 },
  sniper: { text: '피해 ×1.8 · 가이드선 2.5배', again: 0, bonus(s) { s.damage *= 1.8; s.guideTime *= 2.5; } },
  terraform: { text: '산맥 소환 · 피해 ×1.7', again: 1, bonus(s) { s.damage *= 1.7; } },
  giant: { text: '체력 ×1.8 · 폭발 범위 ×1.35', again: 0, bonus(s) { s.maxHp *= 1.8; s.blastRadius *= 1.35; } },
  engine: { text: '무한급 연료 · 피해 ×1.5', again: 2, bonus(s) { s.damage *= 1.5; } },
  heavy: { text: '피해 약 3배의 초대형 철갑탄', again: 1, bonus(s) { s.blastRadius *= 1.2; } },
  burger: { text: '회복량 29% + 모든 피해 25% 흡혈', again: 2, bonus(s) { s.leech += 0.25; } },
  octopus: { text: '초대형 먹물 · 피해 ×1.45', again: 2, bonus(s) { s.damage *= 1.45; } },
  bee: { text: '꿀벌 8마리 대군 · 독침 강화', again: 2 },
  firework: { text: '폭죽 14발 대폭죽쇼', again: 2 },
  banana: { text: '바나나 7개 연쇄 폭발', again: 2 },
  frost: { text: '빙결 피해 37 · 피해 ×1.35', again: 2, bonus(s) { s.damage *= 1.35; } },
  mole: { text: '초대형 함정 · 피해 ×1.4', again: 2, bonus(s) { s.damage *= 1.4; } },
  bowling: { text: '볼링공 3개 트리플 스트라이크', again: 2 },
  chicken: { text: '폭탄 달걀 8개 융단폭격', again: 2 },
  cactus: { text: '가시 15발 전방위 난사', again: 2 },
  // 희귀
  armor: { text: '철옹성: 체력 ×1.35 추가', again: 1, bonus(s) { s.maxHp *= 1.35; } },
  sawblade: { text: '전장을 가로지르는 지옥 톱날 · 피해 ×1.3', again: 2, bonus(s) { s.damage *= 1.3; } }
};
const RARE_STAR3 = { text: '카드 효과 한 단계 추가 · 피해 ×1.35 · 체력 ×1.15', again: 1, bonus(s) { s.damage *= 1.2; s.maxHp *= 1.1; } };
function star3Of(id) {
  if (STAR3[id]) return STAR3[id];
  return rarityOf(id) === 'rare' ? RARE_STAR3 : null;
}

function applyAwaken(s, cards) {
  const counts = {};
  for (const id of cards) counts[id] = (counts[id] || 0) + 1;
  s.awakened = Object.keys(counts).filter(id => counts[id] >= MAX_STACK);
  for (const id of s.awakened) {
    const star = star3Of(id);
    if (!star) {
      if (!NO_EXTRA_APPLY.includes(id)) CARD_DEFS[id].apply(s);
      s.damage *= 1.12;
      continue;
    }
    for (let i = 0; i < star.again; i++) CARD_DEFS[id].apply(s);
    const common = rarityOf(id) === 'common';
    s.damage *= common ? 1.3 : 1.12;
    s.maxHp *= common ? 1.2 : 1.05;
    if (star.bonus) star.bonus(s);
  }
  s.awakenColor = s.awakened.length ? CARD_DEFS[s.awakened[s.awakened.length - 1]].color : null;
  s.maxHp = Math.round(s.maxHp);
}

const STAR3_FX_TIME = 2.2;
function drawStar3Fx() {
  const fx = G.star3Fx;
  if (!fx) return;
  const t = G.time - fx.at;
  if (t > STAR3_FX_TIME || t < 0 || G.state === 'title') { G.star3Fx = null; return; }
  const d = CARD_DEFS[fx.id], a = Math.min(1, t / 0.15, (STAR3_FX_TIME - t) / 0.3), cy = H / 2 - 40;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = 'rgba(6,4,22,0.84)'; ctx.fillRect(0, 0, W, H);
  ctx.translate(W / 2, cy);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter'; ctx.rotate(t * 0.5); ctx.fillStyle = 'rgba(255,196,0,0.14)';
  for (let i = 0; i < 16; i++) { ctx.rotate(TAU / 16); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(900, -70); ctx.lineTo(900, 70); ctx.closePath(); ctx.fill(); }
  ctx.restore();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const pop = 1 + Math.max(0, 0.45 - t) * 2;
  ctx.font = `${Math.round(150 * pop)}px ${FONT}`; ctx.fillStyle = '#fff'; ctx.fillText(d.icon, 0, -20);
  // 별 3개가 차례로 쾅쾅쾅
  for (let i = 0; i < 3; i++) {
    const st = t - 0.25 - i * 0.2;
    if (st < 0) continue;
    const k = 1 + Math.max(0, 0.18 - st) * 9;
    ctx.font = `900 ${Math.round((i === 1 ? 104 : 82) * k)}px ${FONT}`;
    ctx.lineWidth = 8; ctx.strokeStyle = '#5d3200'; ctx.fillStyle = '#ffd600';
    const sx = (i - 1) * 120, sy = i === 1 ? -175 : -145;
    ctx.strokeText('★', sx, sy); ctx.fillText('★', sx, sy);
  }
  ctx.font = `900 62px ${FONT}`; ctx.lineWidth = 10; ctx.strokeStyle = '#14001f';
  ctx.strokeText(AWAKEN_NAMES[fx.id], 0, 140); ctx.fillStyle = '#fff59d'; ctx.fillText(AWAKEN_NAMES[fx.id], 0, 140);
  ctx.font = `900 30px ${FONT}`; ctx.fillStyle = '#fff'; ctx.fillText(`${fx.who} · 3성 달성!`, 0, 205);
  ctx.font = `bold 26px ${FONT}`; ctx.fillStyle = d.color; ctx.fillText(fx.text, 0, 250);
  ctx.restore();
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
const REROLL_Y = 712, REROLL_W = IS_TOUCH ? 290 : 230, REROLL_H = IS_TOUCH ? 62 : 40;

function maxedCards(p) {
  const m = countCards(p);
  return Object.keys(m).filter(id => m[id] >= MAX_STACK);
}

function canReroll() {
  return G.state === 'cards' && players[G.cardLoser].rerolls > 0 && humanCanPick();
}

function rerollCard(i, remote = null) {
  if (G.state !== 'cards') return;
  const p = players[G.cardLoser];
  if (p.rerolls <= 0) return;
  let id = remote;
  if (id === null) {
    if (!canReroll() || G.stateT < 0.5) return;
    RNG.setSeed((Date.now() ^ ((Math.random() * 0xFFFFFFFF) >>> 0)) >>> 0);
    id = rollCard([...G.choices, ...maxedCards(p)], G.comeback, false, countCards(p));
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
    ctx.font = `900 ${IS_TOUCH ? 25 : 16}px ${FONT}`; ctx.fillStyle = able ? '#d7ffe9' : '#7b7f9e';
    ctx.fillText(p.rerolls > 0 ? '🔄 이 카드만 교체' : '🔄 리롤 사용 완료', cx, REROLL_Y + REROLL_H / 2 + (IS_TOUCH ? 9 : 6));
  }
}

/* ---------------------------- 3. 강철 지반 ---------------------------- */
function placeSteel(spawnXs) {
  const blocks = [];
  const anchors = WW > 2200 ? [WW * 0.5, WW * 0.34, WW * 0.66, WW * 0.2, WW * 0.8] : [WW * 0.5, WW * 0.32, WW * 0.68];
  for (const a of anchors) {
    let cx = Math.round(a + rand(-50, 50));
    // 탱크 시작 위치와 겹치지 않게 비켜 놓음
    if (spawnXs.some(x => Math.abs(x - cx) < 110)) cx += 140;
    if (spawnXs.some(x => Math.abs(x - cx) < 100)) continue;
    const w = Math.round(rand(70, 110));
    const x = clamp(cx - (w >> 1), 20, WW - 20 - w);
    const y = Math.round(Terrain.top[x + (w >> 1)]);
    // 걸어 올라갈 수 있도록 주변 지형을 완만하게 맞춤
    const taper = 60;
    for (let tx = x - taper; tx < x + w + taper; tx++) {
      if (tx < 0 || tx >= WW) continue;
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
  const batch = Math.round(3 * mapScale());
  let made = 0;
  for (let tries = 0; tries < 60 && made < batch && G.barrels.length < Math.round(BARREL_MAX * mapScale()); tries++) {
    const x = Math.round(rand(90, WW - 90));
    if (players.some(p => p.alive && Math.abs(p.x - x) < 100)) continue;
    if (G.barrels.some(b => Math.abs(b.x - x) < 70)) continue;
    G.barrels.push({ x, y: 170 - made * 30, vy: 0, landed: false, fuse: 0 });
    made++;
  }
  if (made) G.floaters.push({ x: camCenterX(), y: 215, text: `🛢️ 화약 드럼통 ${made}개 투하!`, color: '#ffab40', t: 0, life: 2.0 });
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
const SAT_RADIUS = 11;
const satWindow = () => Math.floor((G.turnCount + 1) / 6); // 5~6턴, 11~12턴, 17~18턴 ...

function satelliteActive() {
  const m = G.turnCount % 6;
  return G.turnCount >= 5 && (m === 5 || m === 0) && G.satDown !== satWindow();
}

// 빠른 왕복 + 갑작스러운 급정지·역주행 + 불규칙한 상하 회피 (격추 난이도 최상)
function satellitePos(t = G.satT) {
  const span = WW - 160;
  const run = t * 660 * mapSpeed() + Math.sin(t * 4.3) * 185 + Math.sin(t * 1.7) * 90;
  const m = ((run % (span * 2)) + span * 2) % (span * 2);
  return { x: 80 + (m < span ? m : span * 2 - m), y: 226 + Math.sin(t * 3.9) * 58 + Math.sin(t * 8.3) * 20 };
}

function checkSatelliteHit(px, py, shell) {
  if (shell.ghost || !satelliteActive()) return false;
  const p = satellitePos();
  if (Math.hypot(px - p.x, py - p.y) > SAT_RADIUS + Math.min(shell.r, 5)) return false;
  G.satDown = satWindow();
  const owner = shell.owner;
  owner.laser = 1;
  burst(p.x, p.y, 40, { colors: ['#fff', '#80d8ff', '#ffd54f'], speed: 430, life: 1.1, size: 4, grav: 0.8, kind: 'spark' });
  G.flashes.push({ x: p.x, y: p.y, r: 90, t: 0, life: 0.35 });
  Sfx.explosion(60); Sfx.synergy();
  showBanner('🛰️ 위성 격추!', `${owner.name}: 다음 발사 착탄 지점에 [궤도 강타]`, '#ffab40', 2.4);
  return true;
}

function fireOrbitalLaser(x) {
  spawnOrbitalStrike(clamp(x, 20, WW - 20), G.orbital);
  G.orbital = null;
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
  ctx.fillText('정찰 위성 · 격추하면 궤도 강타!', 0, -20);
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
  const id = Net.active ? Net.myId : aiOn() ? 0 : G.turn; // 로컬은 현재 차례 플레이어
  const p = players[id];
  if (!p || (p.chat && G.time - p.chat.at < 0.6)) return;
  showEmote(id, idx);
  if (Net.active) Net.send({ type: 'chat', id, e: idx }, 0);
}

function emoteButtonAt(x, y) {
  if (IS_TOUCH || !emoteReady()) return -1;
  for (let i = 0; i < EMOTES.length; i++) {
    const by = EMOTE_Y + i * EMOTE_STEP;
    if (x >= EMOTE_X && x <= EMOTE_X + EMOTE_SIZE && y >= by && y <= by + EMOTE_SIZE) return i;
  }
  return -1;
}

function drawEmotes() {
  if (IS_TOUCH || !emoteReady()) return;
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
    ctx.translate(p.x, y); ctx.scale(pop * textBoost(), pop * textBoost());
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
  { mode: 'ai', icon: '🤖', title: 'AI 1 : 1 대전', color: '#ff5fa2', lines: ['혼자서도 즐기는 컴퓨터와의 결투', '난이도 3단계 (쉬움 · 보통 · 어려움)', 'AI도 카드를 고르며 강해집니다'] },
  { mode: '1v1', icon: '⚔️', title: '로컬 1 : 1 결투', color: '#4fc3f7', lines: ['한 기기에서 즐기는 클래식 듀얼', 'P1  WASD + Space', 'P2  방향키 + Enter'] },
  { mode: '2v2', icon: '🛡️', title: '로컬 2 : 2 팀전', color: '#ff8a65', lines: ['블루(P1·P3)  vs  레드(P2·P4)', 'P3  IJKL + U   ·   P4  넘패드 4856 + 0', '아군 폭발 피해 없음'] },
  { mode: 'online', icon: '🌐', title: '온라인 멀티', color: '#69f0ae', lines: ['1:1 · 2:2 팀전 · 4인 난투', '4자리 방 코드로 친구 초대', 'PC와 휴대폰이 함께 대전'] },
  { mode: 'codex', icon: '📖', title: '카드 도감', color: '#e040fb', lines: ['모든 카드와 등급 둘러보기', '3번 겹치면 각성 형태로 진화'] },
  { mode: 'help', icon: '❔', title: '게임 방법', color: '#ffd54f', lines: ['규칙과 새 기능 안내'] }
].map((b, i) => Object.assign(b, { x: 96, y: 302 + i * 82, w: 500, h: 72 }));
if (IS_TOUCH) {
  // 터치 기기는 키보드 안내 대신 터치 설명
  TITLE_BTNS[1].lines = ['휴대폰 하나를 번갈아 잡고 대결', '자기 차례에 화면 버튼으로 조작'];
  TITLE_BTNS[2].lines = ['블루(P1·P3)  vs  레드(P2·P4)', '차례마다 휴대폰을 넘겨 가며 플레이', '아군 폭발 피해 없음'];
}
const AI_BTNS = Object.keys(AI_LEVELS).map((id, i) => ({ id, x: 250 + i * 380, y: 280, w: 340, h: 360 }));

const HELP_LINES = [
  '🤖 AI 대전은 혼자서 · 휴대폰은 가로로 들고 화면 버튼으로 조작',
  `🏆 ${WINS_TO_MATCH}승을 먼저 하면 최종 우승 · 라운드가 끝나면 모두 카드 선택`,
  '🔥 직전 라운드 패배자는 카드 4장 중 선택 + 희귀 확률 상승 (승자는 3장)',
  '🔄 매치당 한 번, 원하는 카드 1장만 교체 (버튼 클릭 또는 R 키)',
  '✨ 같은 카드 3장 = 3성(최대) · 일반·희귀는 보너스가 특히 커요',
  '😈 가끔 등장하는 악마의 거래: 대가를 치르고 전설 카드 획득',
  '🗺️ 라운드마다 맵이 넓어지고 체력 증가 · V 키(또는 🔍)로 확대',
  '🛢️ 1턴부터 8턴마다 화약 드럼통 투하 · 서로 연쇄 폭발',
  '🛰️ 5~6, 11~12, 17~18턴의 정찰 위성을 격추하면 궤도 강타 획득',
  '⬛ 강철 지반은 어떤 폭발에도 부서지지 않음',
  '🎲 2라운드마다 돌발 규칙 · 👻 4인전에서 쓰러지면 유령의 복수',
  `☠️ ${SUDDEN_DEATH_TURN}턴 후 서든데스(후반·4인전은 더 늦게)   💬 숫자 1~4 로 이모지`
];
const CODEX_COLS = 6, CODEX_ROWS = 3;

const codexList = () => ['legend', 'epic', 'rare', 'common'].flatMap(k => RARITY_LIST[k]);
const codexPages = () => Math.ceil(codexList().length / (CODEX_COLS * CODEX_ROWS));

function activateMenu(mode) {
  canvas.style.cursor = 'default';
  Sfx.cardPick();
  if (mode !== 'ai') G.ai = null;
  if (mode === 'online') Net.openModal();
  else if (mode === 'codex' || mode === 'help' || mode === 'ai') { G.menuPage = mode; G.codexPage = 0; }
  else { Net.active = false; startMatch(mode); }
}

function startAiMatch(level) {
  Sfx.cardPick();
  Net.active = false;
  G.ai = level; G.menuPage = null;
  startMatch('1v1');
}

function menuKey(code) {
  if (G.menuPage === 'ai') {
    const levels = Object.keys(AI_LEVELS), num = { Digit1: 0, Digit2: 1, Digit3: 2 }[code];
    if (code === 'Escape' || code === 'Backspace') G.menuPage = null;
    else if (num !== undefined) startAiMatch(levels[num]);
    else if (code === 'ArrowLeft' || code === 'KeyA') { G.aiSel = (G.aiSel + 2) % 3; Sfx.cardMove(); }
    else if (code === 'ArrowRight' || code === 'KeyD') { G.aiSel = (G.aiSel + 1) % 3; Sfx.cardMove(); }
    else if (code === 'Space' || code === 'Enter') startAiMatch(levels[G.aiSel]);
    return;
  }
  if (G.menuPage) {
    if (code === 'Escape' || code === 'Backspace') G.menuPage = null;
    else if (G.menuPage === 'codex' && (code === 'ArrowRight' || code === 'KeyD')) G.codexPage = (G.codexPage + 1) % codexPages();
    else if (G.menuPage === 'codex' && (code === 'ArrowLeft' || code === 'KeyA')) G.codexPage = (G.codexPage + codexPages() - 1) % codexPages();
    else if (code === 'Space' || code === 'Enter') G.menuPage = null;
    return;
  }
  const n = TITLE_BTNS.length;
  const num = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Digit5: 4, Digit6: 5 }[code];
  if (num !== undefined) activateMenu(TITLE_BTNS[num].mode);
  else if (code === 'ArrowUp' || code === 'KeyW') { G.menuSel = (G.menuSel + n - 1) % n; Sfx.cardMove(); }
  else if (code === 'ArrowDown' || code === 'KeyS') { G.menuSel = (G.menuSel + 1) % n; Sfx.cardMove(); }
  else if (code === 'Space' || code === 'Enter') activateMenu(TITLE_BTNS[G.menuSel].mode);
}

const aiButtonAt = (x, y) => AI_BTNS.findIndex(b => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);

function menuButtonAt(x, y) {
  return TITLE_BTNS.findIndex(b => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
}

function menuClick(x, y) {
  if (G.menuPage === 'ai') {
    const i = aiButtonAt(x, y);
    if (i !== -1) startAiMatch(AI_BTNS[i].id);
    else if (y > 740) G.menuPage = null;
    return;
  }
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
  HELP_LINES.forEach((l, i) => ctx.fillText(l, 300, 208 + i * 45));
  ctx.textAlign = 'center'; ctx.font = `bold 20px ${FONT}`; ctx.fillStyle = '#9aa0c8';
  ctx.fillText('여기를 누르면 닫기 (Esc)', W / 2, 815);
}

let logoLayer = null, logoShine = null;
function getLogo() {
  if (logoLayer) return logoLayer;
  const [cv, x] = makeLayer(1000, 210);
  const text = '탱크 라운즈';
  x.textAlign = 'center'; x.lineJoin = 'round';
  x.font = `italic 900 128px ${FONT}`;
  // 뒤쪽 속도선
  for (const [y, len, col] of [[62, 150, '#ff7043'], [92, 210, '#ffca28'], [122, 120, '#ff4081']]) {
    for (const side of [-1, 1]) {
      const sx = 500 + side * 385;
      const g = x.createLinearGradient(sx, 0, sx + side * len * 0.75, 0);
      g.addColorStop(0, col); g.addColorStop(1, 'rgba(255,120,60,0)');
      x.fillStyle = g; x.beginPath(); x.moveTo(sx, y - 7); x.lineTo(sx + side * len * 0.75, y - 2); x.lineTo(sx, y + 5); x.fill();
    }
  }
  // 두꺼운 외곽선 + 입체 돌출
  x.shadowColor = 'rgba(255,110,30,0.9)'; x.shadowBlur = 34;
  x.lineWidth = 30; x.strokeStyle = '#12071f'; x.strokeText(text, 504, 138, 760);
  x.shadowBlur = 0;
  for (let d = 13; d > 0; d--) {
    x.fillStyle = d > 7 ? '#5a1200' : '#a52f00';
    x.fillText(text, 500 + d * 0.6, 128 + d, 760);
  }
  x.lineWidth = 9; x.strokeStyle = '#2a0b00'; x.strokeText(text, 500, 128, 760);
  const g = x.createLinearGradient(0, 30, 0, 140);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.34, '#ffe97a'); g.addColorStop(0.52, '#ffb300'); g.addColorStop(0.54, '#ff7a00'); g.addColorStop(0.8, '#ffc107'); g.addColorStop(1, '#fff3b0');
  x.fillStyle = g; x.fillText(text, 500, 128, 760);
  x.lineWidth = 2; x.strokeStyle = 'rgba(255,255,255,0.75)'; x.strokeText(text, 500, 128, 760);
  // 영문 부제 명판
  x.fillStyle = '#12071f'; x.beginPath(); x.moveTo(314, 162); x.lineTo(706, 162); x.lineTo(682, 200); x.lineTo(290, 200); x.closePath(); x.fill();
  x.strokeStyle = '#ffb300'; x.lineWidth = 3; x.stroke();
  x.font = `italic 900 26px ${FONT}`; x.fillStyle = '#fff'; x.fillText('★  TANK  ROUNDS  ★', 498, 190, 360);
  logoLayer = cv;
  return cv;
}

// 로고 위로 빛줄기가 지나감 (글자 모양에만 입힘)
function drawLogo(cx, y) {
  const logo = getLogo();
  ctx.drawImage(logo, cx - 500, y);
  const t = G.time % 3.6;
  if (t > 0.9) return;
  if (!logoShine) logoShine = makeLayer(1000, 210);
  const [cv, x] = logoShine;
  x.globalCompositeOperation = 'source-over';
  x.clearRect(0, 0, 1000, 210);
  x.drawImage(logo, 0, 0);
  x.globalCompositeOperation = 'source-in';
  const sx = -100 + (t / 0.9) * 1200;
  const g = x.createLinearGradient(sx - 60, 0, sx + 60, 40);
  g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,0.8)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 1000, 210);
  ctx.drawImage(cv, cx - 500, y);
}

function drawAiSelect() {
  drawMenuPanel('🤖 AI 난이도 선택');
  ctx.textAlign = 'center';
  AI_BTNS.forEach((b, i) => {
    const L = AI_LEVELS[b.id], on = G.aiSel === i;
    ctx.fillStyle = on ? 'rgba(42,48,108,0.98)' : 'rgba(255,255,255,0.06)'; rr(b.x, b.y, b.w, b.h, 22); ctx.fill();
    ctx.strokeStyle = L.color; ctx.lineWidth = on ? 5 : 2; ctx.stroke();
    const mid = b.x + b.w / 2;
    ctx.font = `96px ${FONT}`; ctx.fillStyle = '#fff'; ctx.fillText(L.icon, mid, b.y + 160 + (on ? Math.sin(G.time * 5) * 6 : 0));
    ctx.font = `900 46px ${FONT}`; ctx.fillStyle = L.color; ctx.fillText(L.name, mid, b.y + 242);
    ctx.font = `18px ${FONT}`; ctx.fillStyle = '#dfe2ff'; ctx.fillText(L.desc, mid, b.y + 296, b.w - 30);
  });
  ctx.font = `bold 24px ${FONT}`; ctx.fillStyle = '#c8ccec';
  ctx.fillText(IS_TOUCH ? '난이도를 누르면 시작  ·  여기를 누르면 뒤로' : '1·2·3 또는 ← → 후 Enter  ·  여기를 눌러 뒤로 (Esc)', W / 2, 790);
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
  if (G.menuPage === 'ai') { drawAiSelect(); return; }

  drawRays(W / 2, 160, 1000, 0.22);
  drawMenuBattle();
  drawLogo(W / 2, 44 + Math.sin(G.time * 1.8) * 5);
  ctx.textAlign = 'center';
  ctx.font = `bold 21px ${FONT}`; ctx.fillStyle = '#ffe7c2';
  ctx.fillText(`CARD  ARTILLERY  BATTLE  ·  ${CARD_POOL.length}종 카드  ·  ${WINS_TO_MATCH}승 선취`, W / 2, 272);

  TITLE_BTNS.forEach((b, i) => {
    const on = G.menuSel === i;
    const slide = (1 - (1 - clamp((G.stateT - i * 0.07) / 0.35, 0, 1)) ** 3);
    const x = b.x - (1 - slide) * 620 + (on ? 26 : 0);
    ctx.fillStyle = on ? 'rgba(30,34,84,0.97)' : 'rgba(10,11,36,0.82)';
    ctx.beginPath(); ctx.moveTo(x + 18, b.y); ctx.lineTo(x + b.w, b.y); ctx.lineTo(x + b.w - 18, b.y + b.h); ctx.lineTo(x, b.y + b.h); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = on ? b.color : 'rgba(255,255,255,0.18)'; ctx.lineWidth = on ? 3.5 : 1.5; ctx.stroke();
    ctx.fillStyle = b.color; ctx.fillRect(x + 8, b.y + 14, 7, b.h - 28);
    ctx.textAlign = 'left';
    ctx.font = `34px ${FONT}`; ctx.fillStyle = '#fff'; ctx.fillText(b.icon, x + 36, b.y + 48);
    ctx.font = `italic 900 28px ${FONT}`; ctx.fillStyle = on ? '#fff' : '#c9cdee'; ctx.fillText(b.title, x + 102, b.y + 46);
    ctx.font = `bold 15px ${FONT}`; ctx.fillStyle = b.color;
    ctx.textAlign = 'right'; ctx.fillText(on ? `▶▶` : String(i + 1), x + b.w - 40 + (on ? Math.sin(G.time * 8) * 5 : 0), b.y + 44);
  });

  drawShowcase(TITLE_BTNS[G.menuSel]);
  ctx.textAlign = 'center'; ctx.font = `bold 17px ${FONT}`;
  ctx.globalAlpha = 0.6 + 0.4 * Math.sin(G.time * 3.5); ctx.fillStyle = '#fff';
  ctx.fillText(IS_TOUCH ? '원하는 메뉴를 터치하세요' : '↑↓ 선택  ·  Enter 시작  ·  마우스 클릭 가능', 346, 824);
  ctx.globalAlpha = 1;
}
