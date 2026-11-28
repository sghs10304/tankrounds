'use strict';

/* ============================================================
   v6 확장: 카드 등급 · 거래 · 돌발 규칙 · 유령의 복수 · 연출
   ============================================================ */

/* ---------------------------- 1. 카드 등급 ---------------------------- */
const RARITY = {
  common: { name: '일반', color: '#b0bec5', stars: 1, weight: 46 },
  rare: { name: '희귀', color: '#40c4ff', stars: 2, weight: 35 },
  epic: { name: '영웅', color: '#e040fb', stars: 3, weight: 18 },
  legend: { name: '전설', color: '#ffca28', stars: 4, weight: 1 }
};
const RARITY_LIST = {
  common: ['bouncer', 'sniper', 'terraform', 'giant', 'engine', 'heavy', 'burger', 'octopus', 'bee', 'firework', 'banana', 'frost', 'mole', 'bowling', 'chicken', 'cactus'],
  rare: ['cluster', 'poison', 'drill', 'armor', 'repair', 'knockback', 'meteor', 'mine', 'swap', 'duck', 'anvil', 'turtle', 'balloon', 'frog', 'magnet', 'sawblade', 'chainbomb', 'ufo', 'penguin', 'snowman', 'pinata'],
  epic: ['airstrike', 'homing', 'burst', 'blackhole', 'glass', 'leech', 'phoenix', 'volcano', 'lightning', 'buckshot', 'twister', 'jackpot', 'wormhole', 'mirror', 'chaos', 'gift', 'hammer', 'specter', 'train', 'reaper'],
  legend: ['nuke', 'satellite', 'dragon', 'angel', 'starfall', 'whale', 'excalibur', 'titan']
};
const rarityOf = id => Object.keys(RARITY_LIST).find(k => RARITY_LIST[k].includes(id)) || 'common';

/* ---------------------------- 2. 선택지 & 악마의 거래 ---------------------------- */
const DEAL_COSTS = {
  hp: { text: '체력 -25%', apply() {} }, // 라운드 체력에서 차감 (getRoundMaxHp)
  dmg: { text: '공격력 -18%', apply(s) { s.damage *= 0.82; } },
  fuel: { text: '이동 연료 -55%', apply(s) { s.maxFuel = Math.round(s.maxFuel * 0.45); } }
};
const DEAL_CHANCE = 0.05;
const LEGEND_PITY = 8; // 전설이 없는 선택창이 이만큼 이어지면 다음에 1장 보장

// 패배자 컴백 보너스 확률 (합계 100)
const COMEBACK_WEIGHTS = { common: 25, rare: 44, epic: 29, legend: 2 };

function rollCard(exclude, boost = false, allowLegend = false) {
  const entries = Object.keys(RARITY)
    .filter(k => k !== 'legend' || allowLegend)
    .map(k => [k, boost ? COMEBACK_WEIGHTS[k] : RARITY[k].weight]);
  let roll = RNG.next() * entries.reduce((sum, e) => sum + e[1], 0), tier = 'common';
  for (const [k, weight] of entries) {
    if (roll < weight) { tier = k; break; }
    roll -= weight;
  }
  let list = RARITY_LIST[tier].filter(id => !exclude.includes(id));
  if (!list.length) list = CARD_POOL.filter(id => !exclude.includes(id) && rarityOf(id) !== 'legend');
  return list[(RNG.next() * list.length) | 0];
}

function drawChoices(p, boost = false) {
  const choices = [], maxed = maxedCards(p);
  const count = boost ? 4 : 3;
  // 직전 선택창들에 전설이 나왔으면 잠시 쉼, 선택창 하나에는 최대 1장
  const open = G.legendCool <= 0;
  const hasLegend = () => choices.some(id => rarityOf(id) === 'legend');
  while (choices.length < count) choices.push(rollCard([...choices, ...maxed], boost, open && !hasLegend()));
  const legends = () => RARITY_LIST.legend.filter(id => !choices.includes(id) && !maxed.includes(id));
  let deal = null;
  if (open && !hasLegend() && G.round >= 2 && RNG.next() < DEAL_CHANCE && legends().length) {
    const index = (RNG.next() * count) | 0, pool = legends();
    choices[index] = pool[(RNG.next() * pool.length) | 0];
    const costs = Object.keys(DEAL_COSTS);
    deal = { index, cost: costs[(RNG.next() * costs.length) | 0] };
  }
  G.pity = false;
  if (open && !hasLegend() && p.legendDry >= LEGEND_PITY && legends().length) {
    const pool = legends();
    choices[(RNG.next() * count) | 0] = pool[(RNG.next() * pool.length) | 0];
    G.pity = true;
  }
  if (hasLegend()) { p.legendDry = 0; G.legendCool = 2; } // 다음 선택창 2번은 전설 없음
  else { p.legendDry++; G.legendCool = Math.max(0, G.legendCool - 1); }
  return { choices, deal };
}

function buildStats(p) {
  const s = computeStats(p.cards);
  applyAwaken(s, p.cards);
  for (const d of p.deals) DEAL_COSTS[d].apply(s);
  return s;
}

/* ---------------------------- 3. 돌발 규칙 (2라운드마다) ---------------------------- */
const RULE_DEFS = {
  lowgrav: { icon: '🌙', name: '저중력', desc: '모든 것이 둥실둥실', color: '#b39ddb' },
  gale: { icon: '🌪️', name: '태풍 경보', desc: '바람의 영향 2.4배', color: '#80deea' },
  double: { icon: '🔫', name: '더블샷', desc: '모두 +1발 (한 발 피해 -35%)', color: '#ffab40' },
  giant: { icon: '🐘', name: '거대 탱크', desc: '모든 탱크가 커짐', color: '#a1887f' },
  tiny: { icon: '🐜', name: '꼬마 탱크', desc: '모든 탱크가 작아짐', color: '#aed581' },
  bouncy: { icon: '🏀', name: '통통 월드', desc: '모든 포탄이 한 번 튕김', color: '#ff7043' },
  boom: { icon: '💥', name: '대폭발의 날', desc: '폭발 범위 +40%', color: '#ff5252' }
};

function pickRule(round) {
  if (round % 2 !== 0) return null;
  const ids = Object.keys(RULE_DEFS);
  return ids[(RNG.next() * ids.length) | 0];
}

// 바이옴(달)과 돌발 규칙(저중력)을 함께 반영
function updateGravity() {
  const biome = BIOME_DEFS[G.biome] || BIOME_DEFS.grass;
  G.gravity = GRAVITY * Math.max(0.38, (biome.gravMult || 1) * (G.rule === 'lowgrav' ? 0.55 : 1));
}

function applyRule(rule) {
  G.rule = RULE_DEFS[rule] ? rule : null;
  updateGravity();
  G.windAccel = WIND_ACCEL * (G.rule === 'gale' ? 2.4 : 1);
  for (const p of players) {
    const s = buildStats(p);
    if (G.rule === 'double') { s.shots += 1; s.damage *= 0.65; }
    if (G.rule === 'giant') s.tankScale *= 1.4;
    if (G.rule === 'tiny') s.tankScale *= 0.7;
    if (G.rule === 'boom') s.blastRadius *= 1.4;
    p.stats = s;
  }
}

/* ---------------------------- 4. 유령의 복수 ---------------------------- */
function getNextTurn(cur) {
  const n = players.length;
  for (let step = 1; step <= n; step++) {
    const idx = (cur + step) % n;
    // 4인전에서는 파괴된 플레이어도 유령 차례를 가짐
    if (players[idx] && (players[idx].alive || n > 2)) return idx;
  }
  return cur;
}

function ghostFire(p, x, kind, fromRemote = false) {
  if (!fromRemote) {
    const fireSeed = (Date.now() ^ ((Math.random() * 0xFFFFFFFF) >>> 0)) >>> 0;
    RNG.setSeed(fireSeed);
    if (Net.active) {
      Net.fireSeq++;
      Net.sendFireReliable({ type: 'fire', seq: Net.fireSeq, fireSeed, id: p.id, ghost: { x, kind } });
    }
  }
  if (kind === 'heal') {
    G.fields.push({ type: 'healbox', x, y: -30, owner: p, t: 0 });
  } else {
    G.shells.push(makeShell(p, x, -20, 0, 430, { damage: 20, radius: 44, child: true, ghost: true, apex: true, r: 8, icon: '💣', bouncesLeft: 0 }));
  }
  Sfx.portal();
  G.ghost = false;
  G.resolveT = 0; G.settleT = 0;
  setState('resolving');
}

function landHealBox(f) {
  const owner = f.owner;
  for (const p of players) {
    if (!p.alive || Math.abs(p.x - f.x) > 95) continue;
    if (G.mode === '2v2' && p.team !== owner.team) continue;
    const heal = Math.min(p.roundMaxHp - p.hp, Math.round(p.roundMaxHp * 0.2));
    if (heal <= 0) continue;
    p.hp += heal;
    toast(p.x, p.y - 75, `💚 유령의 선물 +${heal}`, '#69f0ae');
  }
  G.rings.push({ x: f.x, y: f.y, max: 95, t: 0, life: 0.5, color: '105,240,174' });
  burst(f.x, f.y, 24, { colors: ['#69f0ae', '#fff', '#b9f6ca'], speed: 240, life: 0.7, size: 3.5, kind: 'spark' });
  Sfx.crate();
}

function updateGhostAim(p, ctrl, dt) {
  const dir = (ctrl.right ? 1 : 0) - (ctrl.left ? 1 : 0);
  G.ghostX = clamp(G.ghostX + dir * 460 * dt, 20, WW - 20);
  if (ctrl.up) G.ghostKind = 'bomb';
  if (ctrl.down) G.ghostKind = 'heal';
}

function drawGhostHUD(p) {
  const x = G.ghostX, y = Terrain.h(x), heal = G.ghostKind === 'heal';
  const col = heal ? '#69f0ae' : '#ff5252';
  ctx.save();
  ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.setLineDash([9, 9]); ctx.lineDashOffset = -G.time * 40;
  ctx.beginPath(); ctx.moveTo(x, 190); ctx.lineTo(x, y); ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath(); ctx.ellipse(x, y, heal ? 95 : 44, 11, 0, 0, TAU); ctx.stroke();
  ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
  ctx.font = `46px ${FONT}`; ctx.fillText('👻', x, 175 + Math.sin(G.time * 4) * 6);
  ctx.font = `bold 18px ${FONT}`; ctx.fillStyle = col;
  ctx.fillText(`${p.name} 유령의 복수: ${heal ? '💚 회복 상자' : '💣 원혼 폭탄'}`, x, 218);
  ctx.font = `14px ${FONT}`; ctx.fillStyle = '#e0e0ff';
  ctx.fillText('좌우: 위치 · 위: 폭탄 · 아래: 회복 · 발사키: 투하', x, 240);
  ctx.restore();
}

/* ---------------------------- 5. 연출: 핵폭발 / 슬로모션 ---------------------------- */
function makeLayer(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

let mushroomSprite = null;
function getMushroom() {
  if (mushroomSprite) return mushroomSprite;
  const [cv, x] = makeLayer(600, 640);
  const puff = (px, py, r, inner, outer) => {
    const g = x.createRadialGradient(px, py - r * 0.2, r * 0.1, px, py, r);
    g.addColorStop(0, inner); g.addColorStop(0.65, outer); g.addColorStop(1, 'rgba(60,20,10,0)');
    x.fillStyle = g; x.beginPath(); x.arc(px, py, r, 0, TAU); x.fill();
  };
  // 기둥
  for (let i = 0; i < 16; i++) puff(300 + Math.sin(i * 2.1) * 12, 610 - i * 24, 52 - Math.sin(i / 15 * Math.PI) * 18, 'rgba(255,190,80,0.95)', 'rgba(150,60,25,0.85)');
  // 바닥 먼지
  for (let i = -5; i <= 5; i++) puff(300 + i * 46, 610 - (5 - Math.abs(i)) * 5, 56, 'rgba(210,150,90,0.85)', 'rgba(110,70,45,0.7)');
  // 버섯 갓
  for (let i = 0; i < 26; i++) {
    const a = i / 26 * TAU;
    puff(300 + Math.cos(a) * 165, 200 + Math.sin(a) * 62, 88, 'rgba(255,170,60,0.95)', 'rgba(130,45,25,0.85)');
  }
  puff(300, 175, 180, 'rgba(255,250,200,1)', 'rgba(255,130,30,0.9)');
  puff(300, 205, 95, 'rgba(255,255,255,1)', 'rgba(255,200,80,0.7)');
  mushroomSprite = cv;
  return cv;
}

function startNukeFx(x, y, scale = 1) {
  if (G.nukeFx && G.nukeFx.scale > scale) return;
  G.nukeFx = { x, y, scale, t: 0, dur: scale >= 1 ? 4.6 : 1.8 };
}

function drawNukeFx() {
  const n = G.nukeFx;
  if (!n) return;
  const t = n.t, big = n.scale >= 1, out = clamp((n.dur - t) / 0.9, 0, 1);
  const at = toScreen(n.x, n.y);
  ctx.save();
  if (big) { // 붉게 타는 하늘
    ctx.globalAlpha = 0.38 * out; ctx.fillStyle = '#ff5a00'; ctx.fillRect(0, 0, W, H);
  }
  // 충격파 (이중 링)
  for (let k = 0; k < 2; k++) {
    const rt = t - k * 0.22;
    if (rt <= 0 || rt > 1.3) continue;
    ctx.globalAlpha = 1 - rt / 1.3;
    ctx.strokeStyle = k ? '#ffb74d' : '#ffffff'; ctx.lineWidth = (28 - rt * 18) * n.scale;
    ctx.beginPath(); ctx.arc(at.x, at.y, rt * 1500 * n.scale, 0, TAU); ctx.stroke();
  }
  // 버섯구름
  const rise = 1 - (1 - clamp(t / 2.2, 0, 1)) ** 3;
  const sw = 600 * n.scale * (0.35 + 0.75 * rise), sh = 640 * n.scale * (0.2 + 0.9 * rise);
  ctx.globalAlpha = clamp((t - 0.12) * 4, 0, 1) * out;
  const base = Math.min(H - 20, at.y + 45 * n.scale);
  ctx.drawImage(getMushroom(), at.x - sw / 2, base - sh, sw, sh);
  // 섬광
  const flash = big ? (t < 0.45 ? 1 : Math.max(0, 1 - (t - 0.45) / 1.1)) : Math.max(0, 0.55 - t * 2);
  if (flash > 0) { ctx.globalAlpha = flash; ctx.fillStyle = '#fffdf2'; ctx.fillRect(0, 0, W, H); }
  ctx.restore();
}

// 핵탄두 비행 중 경고 화면
function drawNukeWarning() {
  if (!G.shells.some(s => s.isDrawNuke)) return;
  const a = 0.35 + 0.3 * Math.sin(G.time * 12);
  ctx.save();
  ctx.globalAlpha = a; ctx.strokeStyle = '#ff1744'; ctx.lineWidth = 34; ctx.strokeRect(0, 0, W, H);
  ctx.globalAlpha = 0.9; ctx.textAlign = 'center'; ctx.font = `900 38px ${FONT}`;
  ctx.fillStyle = '#ffea00'; ctx.fillText('☢️  핵탄두 접근 중  ☢️', W / 2, 170);
  ctx.restore();
}

// 라운드를 끝내는 결정타: 확대 + 슬로모션
function startFinisher(p) {
  if (G.slowmo > 0 || G.nukeFx || !checkRoundOver()) return;
  G.slowmo = 1.7;
  G.focus = { x: p.x, y: p.y - 20 };
}

function drawFinisher() {
  if (G.slowmo <= 0) return;
  const el = 1.7 - G.slowmo, k = Math.min(1, el / 0.2, G.slowmo / 0.3);
  ctx.save();
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, 90 * k); ctx.fillRect(0, H - 90 * k, W, 90 * k);
  const sc = 1 + 2.2 * Math.max(0, 1 - el / 0.22);
  ctx.globalAlpha = k; ctx.translate(W / 2, 250); ctx.rotate(-0.07); ctx.scale(sc, sc);
  ctx.textAlign = 'center'; ctx.font = `italic 900 150px ${FONT}`; ctx.lineJoin = 'round';
  ctx.lineWidth = 18; ctx.strokeStyle = '#1a0008'; ctx.strokeText('K.O.!', 0, 0);
  ctx.fillStyle = '#ff1744'; ctx.fillText('K.O.!', 4, 4);
  ctx.fillStyle = '#ffea00'; ctx.fillText('K.O.!', 0, 0);
  ctx.restore();
}

/* ---------------------------- 6. 승리 연출 ---------------------------- */
const CONFETTI = ['#ff5252', '#ffd740', '#69f0ae', '#40c4ff', '#e040fb', '#ffffff'];

// 입자 배열 없이 시간으로 위치를 계산 (메모리 할당 없음)
function drawConfetti(count, t) {
  for (let c = 0; c < CONFETTI.length; c++) {
    ctx.fillStyle = CONFETTI[c];
    for (let i = c; i < count; i += CONFETTI.length) {
      const speed = 150 + (i * 37) % 190;
      const y = ((i * 211) % H) + t * speed - H;
      if (y < -20) continue;
      const x = (i * 397) % W + Math.sin(t * 2.4 + i) * 34;
      const w = 6 + (i % 4) * 2;
      ctx.fillRect(x, y % (H + 40), w * Math.abs(Math.sin(t * 6 + i)) + 1, w * 1.5);
    }
  }
}

let rayLayer = null;
function getRays() {
  if (rayLayer) return rayLayer;
  const [cv, x] = makeLayer(1000, 1000);
  x.translate(500, 500);
  const g = x.createRadialGradient(0, 0, 40, 0, 0, 500);
  g.addColorStop(0, 'rgba(255,225,120,0.55)'); g.addColorStop(1, 'rgba(255,225,120,0)');
  x.fillStyle = g;
  for (let k = 0; k < 18; k++) {
    x.beginPath(); x.moveTo(0, 0); x.arc(0, 0, 500, k * TAU / 18, k * TAU / 18 + TAU / 36); x.closePath(); x.fill();
  }
  rayLayer = cv;
  return cv;
}

function drawRays(cx, cy, size, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha; ctx.translate(cx, cy); ctx.rotate(G.time * 0.25);
  ctx.drawImage(getRays(), -size / 2, -size / 2, size, size);
  ctx.restore();
}

function winnerInfo() {
  if (G.mode === '2v2') {
    return G.winner === 0 ? { name: '블루팀', color: '#4fc3f7' } : { name: '레드팀', color: '#ff8a65' };
  }
  return players[G.winner];
}

function scoreRows() {
  if (G.mode === '2v2') {
    return [
      { name: '블루팀', color: '#4fc3f7', score: G.teamScores[0], win: G.winner === 0 },
      { name: '레드팀', color: '#ff8a65', score: G.teamScores[1], win: G.winner === 1 }
    ];
  }
  return players.map((p, i) => ({ name: p.name, color: p.color, score: p.score, win: G.winner === i }));
}

function bigText(text, x, y, size, color) {
  ctx.font = `900 ${size}px ${FONT}`; ctx.textAlign = 'center'; ctx.lineJoin = 'round';
  ctx.lineWidth = size * 0.17; ctx.strokeStyle = 'rgba(8,6,24,0.9)'; ctx.strokeText(text, x, y);
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillText(text, x, y + size * 0.07);
  ctx.fillStyle = color; ctx.fillText(text, x, y);
}

function drawRoundResult() {
  const t = G.stateT - 0.25; // 결정타를 잠깐 보여준 뒤 등장
  if (t < 0 || G.slowmo > 0 || G.nukeFx) return;
  const draw_ = G.winner === -1;
  const info = draw_ ? { name: '', color: '#c6ff00' } : winnerInfo();
  const k = 1 - (1 - clamp(t / 0.4, 0, 1)) ** 3;
  ctx.save();
  ctx.fillStyle = `rgba(4,5,16,${0.55 * k})`; ctx.fillRect(0, 0, W, H);
  if (!draw_) drawRays(W / 2, 390, 1300 * k, 0.55 * k);

  // 비스듬한 리본
  const off = (1 - k) * W;
  ctx.fillStyle = 'rgba(10,12,34,0.92)';
  ctx.beginPath(); ctx.moveTo(-off, 290); ctx.lineTo(W - off, 260); ctx.lineTo(W - off, 470); ctx.lineTo(-off, 500); ctx.closePath(); ctx.fill();
  ctx.fillStyle = info.color;
  ctx.beginPath(); ctx.moveTo(off, 281); ctx.lineTo(W + off, 251); ctx.lineTo(W + off, 262); ctx.lineTo(off, 292); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(off, 498); ctx.lineTo(W + off, 468); ctx.lineTo(W + off, 479); ctx.lineTo(off, 509); ctx.closePath(); ctx.fill();

  const pop = 1 + 0.6 * Math.max(0, 1 - t / 0.3);
  ctx.translate(W / 2, 390); ctx.scale(pop, pop); ctx.translate(-W / 2, -390);
  ctx.globalAlpha = k;
  bigText(draw_ ? '⚖️ 무승부!' : `${info.name} 승리!`, W / 2, 400, 104, info.color);
  ctx.font = `bold 24px ${FONT}`; ctx.fillStyle = '#fff';
  ctx.fillText(draw_ ? '전원 카드 1장씩 선택' : `ROUND ${G.round} WIN`, W / 2, 454);
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  const rows = scoreRows(), cw = 300, x0 = W / 2 - rows.length * cw / 2;
  rows.forEach((r, i) => {
    const cx = x0 + i * cw + cw / 2;
    ctx.font = `900 26px ${FONT}`; ctx.fillStyle = r.color; ctx.fillText(r.name, cx, 570);
    for (let s = 0; s < WINS_TO_MATCH; s++) {
      const fresh = r.win && s === r.score - 1;
      const rad = fresh ? 13 + 14 * Math.max(0, 1 - (t - 0.5) / 0.35) * (t > 0.5 ? 1 : 0) : 12;
      const on = s < r.score && (!fresh || t > 0.5);
      ctx.fillStyle = on ? '#ffd54f' : 'rgba(255,255,255,0.18)';
      ctx.beginPath(); ctx.arc(cx + (s - (WINS_TO_MATCH - 1) / 2) * 38, 612, rad, 0, TAU); ctx.fill();
    }
  });
  if (!draw_) drawConfetti(90, t);
  ctx.restore();
}

function drawMatchOver() {
  const t = G.stateT, w = winnerInfo();
  ctx.save();
  ctx.fillStyle = 'rgba(4,5,16,0.88)'; ctx.fillRect(0, 0, W, H);
  drawRays(W / 2, 330, 1700, 0.8);

  // 불꽃놀이
  for (let f = 0; f < 5; f++) {
    const cycle = (t + f * 0.47) % 1.9, round = Math.floor((t + f * 0.47) / 1.9);
    if (cycle > 1.2) continue;
    const fx = 180 + ((f * 613 + round * 331) % (W - 360)), fy = 120 + ((f * 257 + round * 149) % 330);
    const rad = 170 * (1 - (1 - cycle / 1.2) ** 3);
    ctx.globalAlpha = 1 - cycle / 1.2; ctx.fillStyle = CONFETTI[(f + round) % 5];
    for (let i = 0; i < 28; i++) {
      const a = i / 28 * TAU, rr_ = rad * (i % 2 ? 1 : 0.65);
      ctx.fillRect(fx + Math.cos(a) * rr_ - 3, fy + Math.sin(a) * rr_ + cycle * cycle * 55 - 3, 6, 6);
    }
  }
  ctx.globalAlpha = 1;

  const k = 1 - (1 - clamp(t / 0.6, 0, 1)) ** 3;
  ctx.textAlign = 'center';
  ctx.font = `${Math.round(150 * k) + 1}px ${FONT}`; ctx.fillStyle = '#fff';
  ctx.fillText('🏆', W / 2, 270 + Math.sin(G.time * 2.5) * 8);
  bigText('CHAMPION', W / 2, 350, 40, '#ffd54f');
  const pulse = 1 + Math.sin(G.time * 4) * 0.025;
  ctx.save(); ctx.translate(W / 2, 470); ctx.scale(k * pulse + 0.001, k * pulse + 0.001);
  bigText(`${w.name} 최종 우승!`, 0, 0, 100, w.color);
  ctx.restore();
  const score = scoreRows().map(r => `${r.name} ${r.score}승`).join('   |   ');
  ctx.font = `bold 30px ${FONT}`; ctx.fillStyle = '#fff'; ctx.fillText(score, W / 2, 550);
  const champs = G.mode === '2v2' ? players.filter(p => p.team === G.winner) : [players[G.winner]];
  champs.forEach((p, i) => {
    ctx.font = `32px ${FONT}`; ctx.fillStyle = '#fff';
    ctx.fillText(`${p.name}  ${p.cards.slice(-14).map(id => CARD_DEFS[id].icon).join(' ')}`, W / 2, 620 + i * 48);
  });
  drawConfetti(180, t);
  if (t > 1) drawMatchOverButtons();
  ctx.restore();
}
