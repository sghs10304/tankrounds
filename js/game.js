'use strict';

/* ============================ 플레이어 / 게임 상태 ============================ */
const PLAYER_DEFS = [
  { name: 'P1', color: '#4fc3f7', startAngle: 45, aimDir: 1, keys: { left: 'KeyA', right: 'KeyD', up: 'KeyW', down: 'KeyS', fire: 'Space' } },
  { name: 'P2', color: '#ff8a65', startAngle: 135, aimDir: -1, keys: { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown', fire: 'Enter' } },
  { name: 'P3', color: '#69f0ae', startAngle: 55, aimDir: 1, keys: { left: 'KeyJ', right: 'KeyL', up: 'KeyI', down: 'KeyK', fire: 'KeyU' } },
  { name: 'P4', color: '#ffd54f', startAngle: 125, aimDir: -1, keys: { left: 'Numpad4', right: 'Numpad6', up: 'Numpad8', down: 'Numpad5', fire: 'Numpad0' } },
];

function makePlayer(i) {
  const d = PLAYER_DEFS[i];
  return {
    id: i, name: d.name, color: d.color, keys: d.keys, aimDir: d.aimDir, startAngle: d.startAngle,
    team: i % 2, // 2v2: 0번팀(P1, P3) vs 1번팀(P2, P4)
    score: 0, cards: [], stats: computeStats([]),
    x: 0, y: 0, vx: 0, vy: 0, air: false, tilt: 0, hp: 150, roundMaxHp: 150, alive: true,
    angle: d.startAngle, side: d.startAngle < 90 ? 1 : -1,
    lastShotAngle: null, lastShotPower: null,
    dmgBoost: 1, radiusBoost: 1, bonusShots: 0, turnDmgTaken: 0,
    phoenixCharges: 0, empDebuff: 0,
    power: 55, charging: false, chargeT: 0, charge: 0, fuel: 0,
    recoil: 0, hitFlash: 0, wheel: 0, tread: 0, lastX: 0
  };
}
let players = [makePlayer(0), makePlayer(1)];

const G = {
  mode: '1v1', // '1v1', '2v2', 'ffa4'
  state: 'title', stateT: 0, time: 0, timeScale: 1,
  round: 0, turn: 0, turnCount: 0, nextFirst: 0, wind: 0,
  biome: 'grass', disaster: null, localHintShown: false,
  teamScores: [0, 0],
  shells: [], pending: [], particles: [], rings: [], floaters: [], flashes: [], fields: [], streaks: [],
  poisons: [], crates: [], portals: [], mines: [], lightnings: [],
  events: [],
  shake: 0, screenFlash: 0, banner: null, settleT: 0, resolveT: 0,
  choices: [], sel: 1, picked: -1, cardLoser: 0, cardQueue: [], winner: -1,
};

function setState(s) { G.state = s; G.stateT = 0; }

function setBiome(key) {
  G.biome = BIOME_DEFS[key] ? key : 'grass';
  Terrain.setBiome(G.biome);
  BG = makeBackground(G.biome);
}

function packAuthoritativeState() {
  return players.map(p => ({
    hp: p.hp, alive: p.alive, ph: p.phoenixCharges, x: p.x, emp: p.empDebuff
  }));
}

function syncAuthoritativeState(states) {
  if (!Array.isArray(states)) return;
  states.forEach((st, i) => {
    if (!players[i]) return;
    players[i].hp = st.hp;
    players[i].alive = st.alive;
    players[i].phoenixCharges = st.ph;
    players[i].x = st.x;
    players[i].empDebuff = st.emp;
  });
}

function generateSkyGimmicksData() {
  const crates = [];
  const types = ['power', 'mega', 'multi'];
  const cnt = players.length > 2 ? 3 : 2;
  for (let i = 0; i < cnt; i++) {
    crates.push({
      x: Math.round(rand(320, W - 320)), y: Math.round(rand(180, 400)), r: 22,
      type: types[(RNG.next() * types.length) | 0], bob: rand(0, TAU)
    });
  }
  const portals = RNG.next() < 0.7 ? [
    { x: Math.round(rand(420, 710)), y: Math.round(rand(220, 440)), r: 30, color: '#00e5ff' },
    { x: Math.round(rand(890, 1180)), y: Math.round(rand(220, 440)), r: 30, color: '#ff4081' }
  ] : [];
  return { crates, portals };
}

function getRoundMaxHp(p) {
  if (G.round === 1) return 50;
  if (G.round === 2) return 90;
  if (G.round === 3) return 120;
  return p.stats.maxHp;
}

function resetPlayersForRound() {
  for (const p of players) {
    const g = Terrain.sampleTank(p.x, p.stats.tankScale);
    p.y = g.y; p.tilt = g.tilt; p.vx = 0; p.vy = 0; p.air = false; p.lastX = p.x;
    p.roundMaxHp = getRoundMaxHp(p);
    p.hp = p.roundMaxHp;
    p.alive = true; p.charging = false; p.charge = 0; p.chargeT = 0;
    p.hitFlash = 0; p.recoil = 0; p.angle = p.startAngle; p.side = p.startAngle < 90 ? 1 : -1;
    p.lastShotAngle = null; p.lastShotPower = null; p.dmgBoost = 1; p.radiusBoost = 1; p.bonusShots = 0;
    p.turnDmgTaken = 0;
    p.phoenixCharges = p.stats.phoenix;
    p.empDebuff = 0;
  }
  G.shells.length = G.pending.length = G.particles.length = G.rings.length = G.floaters.length = G.flashes.length = G.fields.length = G.poisons.length = G.mines.length = G.lightnings.length = G.events.length = 0;
  G.screenFlash = 0; G.shake = 0;
}

function setupField() {
  const biomeKeys = Object.keys(BIOME_DEFS).filter(k => k !== G.biome);
  const pickedBiome = biomeKeys[(RNG.next() * biomeKeys.length) | 0];
  setBiome(pickedBiome);

  let spawnXs = [];
  if (players.length === 2) {
    spawnXs = [Math.round(rand(150, 300)), Math.round(W - rand(150, 300))];
  } else {
    // 4인전(2v2 / 4인 난투): 4구간 배치
    if (G.mode === '2v2') {
      // 블루팀(P1, P3) 좌측 진영 vs 레드팀(P2, P4) 우측 진영
      const xP1 = Math.round(rand(110, 210));
      const xP3 = Math.round(rand(370, 500));
      const xP4 = Math.round(rand(W - 500, W - 370));
      const xP2 = Math.round(rand(W - 210, W - 110));
      spawnXs = [xP1, xP2, xP3, xP4];
    } else {
      // 4인 개인전: 균등 4분할 랜덤 배치
      const zones = [[110, 280], [450, 640], [960, 1150], [1320, 1490]];
      const shuffled = shuffle(zones);
      spawnXs = shuffled.map(z => Math.round(rand(z[0], z[1])));
    }
  }

  Terrain.generate(spawnXs);
  players.forEach((p, idx) => { p.x = spawnXs[idx]; });
  resetPlayersForRound();
  const gimmicks = generateSkyGimmicksData();
  G.crates = gimmicks.crates; G.portals = gimmicks.portals;
}

function startMatch(mode = '1v1') {
  G.mode = mode;
  const count = mode === '1v1' ? 2 : 4;
  players = Array.from({ length: count }, (_, i) => {
    const p = makePlayer(i);
    if (mode === '2v2') {
      p.team = i % 2; // 0: 블루팀(P1, P3), 1: 레드팀(P2, P4)
      p.color = p.team === 0 ? (i === 0 ? '#4fc3f7' : '#00e5ff') : (i === 1 ? '#ff8a65' : '#ff5252');
      p.startAngle = p.team === 0 ? 45 : 135;
      p.aimDir = p.team === 0 ? 1 : -1;
    }
    return p;
  });
  G.teamScores = [0, 0];
  G.round = 0; G.nextFirst = 0; G.winner = -1; G.localHintShown = false;
  startRound();
}

function startRound() {
  G.round++; G.turnCount = 0; G.wind = 0; G.disaster = null;
  if (Net.active && !Net.isHost) return;
  const seed = (Date.now() ^ ((Math.random() * 0xFFFFFFFF) >>> 0)) >>> 0;
  RNG.setSeed(seed);
  setupField();
  Sfx.roundStart();
  const wind = Math.round(rand(-MAX_WIND, MAX_WIND) * 10) / 10;
  if (Net.active && Net.isHost) {
    Net.send({
      type: 'roundSetup', mode: G.mode, seed, biome: G.biome, round: G.round, nextFirst: G.nextFirst, turn: G.nextFirst, wind,
      terrainTop: Array.from(Terrain.top), px: players.map(p => p.x), crates: G.crates, portals: G.portals
    }, 1);
  }
  beginTurn(G.nextFirst, wind, seed);
  const b = BIOME_DEFS[G.biome];
  const modeLabel = G.mode === '2v2' ? ' [2:2 팀전]' : (G.mode === 'ffa4' ? ' [4인 난투]' : '');
  const sub = G.round === 1 ? `⚡ 초고속 1R (체력 50) · ${b.icon} ${b.name}${modeLabel}` : G.round === 2 ? `⚡ 스피드 2R (체력 90) · ${b.icon} ${b.name}${modeLabel}` : G.round === 3 ? `⚡ 3R (체력 120) · ${b.icon} ${b.name}${modeLabel}` : `${b.icon} ${b.name}${modeLabel} · ${players[G.nextFirst].name} 선공`;
  showBanner(`ROUND ${G.round}`, sub, '#ffffff', 2.2);
}

function applySuddenDeath() {
  if (G.turnCount <= SUDDEN_DEATH_TURN) return;
  const sdLevel = G.turnCount - SUDDEN_DEATH_TURN;
  const sdDmg = 8 + sdLevel * 4;
  for (const pl of players) {
    if (pl.alive) {
      damageTank(pl, sdDmg, '#ff1744', null);
    }
  }
  const dropCount = Math.min(6, 1 + Math.floor(sdLevel / 2));
  Sfx.airstrike();
  const aliveList = players.filter(p => p.alive);
  for (let k = 0; k < dropCount; k++) {
    const target = aliveList.length ? aliveList[k % aliveList.length] : null;
    const mx = target ? clamp(target.x + rand(-180, 180), 40, W - 40) : rand(80, W - 80);
    G.pending.push({
      t: 0.25 + k * 0.14, owner: players[G.turn],
      custom: { x: mx, y: -40, vx: rand(-60, 60), vy: 720, damage: 14 + sdLevel * 3, radius: 52 }
    });
  }
  G.shake = Math.max(G.shake, 16);
  G.floaters.push({ x: W / 2, y: 185, text: `🔥 서든데스 (${G.turnCount}턴)! 전원 -${sdDmg} & 하늘 유성 낙하!`, color: '#ff5252', t: 0, life: 2.2 });
}

function getNextAliveTurn(cur) {
  const n = players.length;
  for (let step = 1; step <= n; step++) {
    const idx = (cur + step) % n;
    if (players[idx] && players[idx].alive) return idx;
  }
  return cur;
}

function beginTurn(i, forcedWind = null, forcedSeed = null) {
  if (forcedSeed !== null) RNG.setSeed(forcedSeed);
  G.turn = i;
  G.turnCount++;
  G.wind = forcedWind !== null ? forcedWind : Math.round(rand(-MAX_WIND, MAX_WIND) * 10) / 10;
  for (const p of players) p.turnDmgTaken = 0;
  const p = players[i];

  if (p.empDebuff === 2) { p.fuel = 0; p.empDebuff = 0; }
  else if (p.empDebuff === 1) { p.fuel = Math.round(p.stats.maxFuel * 0.2); p.empDebuff = 0; }
  else { p.fuel = p.stats.maxFuel; }
  p.charging = false; p.charge = 0; p.chargeT = 0;

  if (!Net.active && !G.localHintShown && G.round === 1 && i === 0) {
    G.localHintShown = true;
    if (players.length === 2) {
      G.floaters.push({ x: players[1].x, y: players[1].y - 95, text: '💡 P2 조작: 방향키(←→↑↓) + Enter!', color: '#ff8a65', t: 0, life: 3.8 });
    } else {
      G.floaters.push({ x: W / 2, y: 210, text: '💡 4인 조작: P1(WASD+Space) · P2(방향키+Enter) · P3(IJKL+U) · P4(넘패드4856+0)', color: '#ffd54f', t: 0, life: 4.5 });
    }
  }

  for (let idx = G.poisons.length - 1; idx >= 0; idx--) {
    const pz = G.poisons[idx];
    const owner = players[pz.ownerId];
    for (const pl of players) {
      if (!pl.alive || !isHostile(owner, pl)) continue;
      if (Math.hypot(pl.x - pz.x, (pl.y - 15) - pz.y) <= pz.r + 20) {
        damageTank(pl, pz.dmg, '#76ff03', (owner && owner.stats.synVampire) ? owner : null);
      }
    }
    pz.turnsLeft--;
    if (pz.turnsLeft <= 0) G.poisons.splice(idx, 1);
  }

  for (let idx = G.mines.length - 1; idx >= 0; idx--) {
    G.mines[idx].life--;
    if (G.mines[idx].life <= 0) G.mines.splice(idx, 1);
  }

  applySuddenDeath();

  if (G.crates.length === 0) {
    const g = generateSkyGimmicksData();
    G.crates = g.crates;
  }
  runHooks(p, 'onTurnStart', p);
  setState('aiming');
}

function showBanner(text, sub, color, dur = 1.7) { G.banner = { text, sub, color, t: 0, dur }; }

/* ============================ 파티클 / 이펙트 ============================ */
const getDirtColors = () => (BIOME_DEFS[G.biome] || BIOME_DEFS.grass).debris;
const FIRE_COLORS = ['#ffd54f', '#ff9800', '#ff5722', '#ffffff'];

function addParticle(o) {
  if (G.particles.length > 450) G.particles.splice(0, 40);
  o.max = o.life; G.particles.push(o);
}
function P(x, y, vx, vy, o) {
  addParticle(Object.assign({ x, y, vx, vy, life: 1, size: 3, color: '#fff', grav: 1, ground: false, kind: 'dot', grow: 0, drag: 0 }, o));
}
function burst(x, y, n, o) {
  const { colors, speed = 300, life = 0.8, size = 3, grav = 1, spread = TAU, dir = -Math.PI / 2, ground = false, kind = 'dot', grow = 0, drag = 0 } = o;
  for (let i = 0; i < n; i++) {
    const a = dir + fxRand(-spread / 2, spread / 2), sp = fxRand(0.25, 1) * speed;
    P(x, y, Math.cos(a) * sp, Math.sin(a) * sp, {
      life: fxRand(life * 0.6, life), size: fxRand(size * 0.6, size * 1.4),
      color: colors[(Math.random() * colors.length) | 0], grav, ground, kind, grow, drag
    });
  }
}
function blastFX(x, y, radius, raise) {
  G.flashes.push({ x, y, r: radius * 1.9, t: 0, life: 0.22 });
  G.rings.push({ x, y, max: radius * 1.6, t: 0, life: 0.35, color: '255,170,80' });
  G.screenFlash = Math.max(G.screenFlash, clamp(radius / 160, 0.12, 0.42));
  burst(x, y, 10, { colors: FIRE_COLORS, speed: 300, life: 0.45, size: 4, grav: 0.3 });
  burst(x, y, 10 + radius * 0.25, { colors: ['#ffe082', '#ffb300', '#ff7043', '#ffffff'], speed: 330 + radius * 5, life: 0.9, size: 2.4, grav: 1, ground: true, kind: 'spark' });
  burst(x, y, 10 + radius * 0.3, { colors: getDirtColors(), speed: 260 + radius * 3, life: 1.0, size: 3.6, grav: 1, ground: true, spread: 2.8, kind: 'debris' });
  for (let i = 0; i < 5 + radius / 10; i++)
    P(x + fxRand(-radius, radius) * 0.5, y + fxRand(-radius, radius) * 0.3, fxRand(-100, 100), fxRand(-140, -20),
      { life: fxRand(1.1, 1.7), size: fxRand(10, 18), grow: fxRand(16, 26), color: Math.random() < 0.5 ? '#8b6b4a' : '#6e5238', grav: -0.05, drag: 1.4, kind: 'dust' });
  G.shake = Math.max(G.shake, 7 + radius * 0.3);
  if (raise) burst(x, y, 14, { colors: getDirtColors(), speed: 340, life: 0.9, size: 4, grav: 1, ground: true, spread: 1.4, kind: 'debris' });
}
function updateParticles(dt) {
  const ps = G.particles;
  for (let i = ps.length - 1; i >= 0; i--) {
    const p = ps[i];
    p.life -= dt;
    if (p.life <= 0) { ps[i] = ps[ps.length - 1]; ps.pop(); continue; }
    p.vy += GRAVITY * p.grav * dt;
    if (p.drag) { const f = Math.exp(-p.drag * dt); p.vx *= f; p.vy *= f; }
    if (p.kind === 'smoke' || p.kind === 'dust') p.vx += G.wind * 5 * dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.size += p.grow * dt;
    if (p.ground && p.x >= 0 && p.x < W && Terrain.solid(p.x, p.y)) {
      const t = Terrain.top[p.x | 0]; if (t <= p.y) p.y = t - 1;
      p.vy *= -0.4; p.vx *= 0.6; if (Math.abs(p.vy) < 25) p.vy = 0;
    }
  }
  for (let i = G.rings.length - 1; i >= 0; i--) { const r = G.rings[i]; r.t += dt; if (r.t >= r.life) G.rings.splice(i, 1); }
  for (let i = G.flashes.length - 1; i >= 0; i--) { const f = G.flashes[i]; f.t += dt; if (f.t >= f.life) G.flashes.splice(i, 1); }
  for (let i = G.floaters.length - 1; i >= 0; i--) { const f = G.floaters[i]; f.t += dt; f.y -= 40 * dt; if (f.t >= f.life) G.floaters.splice(i, 1); }
  for (let i = G.lightnings.length - 1; i >= 0; i--) { const l = G.lightnings[i]; l.t += dt; if (l.t >= l.life) G.lightnings.splice(i, 1); }
}
function updateWindStreaks(dt) {
  if (!G.streaks.length) for (let i = 0; i < 34; i++) G.streaks.push({ x: fxRand(0, W), y: fxRand(130, 700), l: fxRand(16, 46), s: fxRand(0.6, 1.4) });
  for (const s of G.streaks) {
    s.x += (G.wind * 20 + (G.wind >= 0 ? 8 : -8)) * s.s * dt;
    if (s.x > W + 60) s.x = -60; if (s.x < -60) s.x = W + 60;
  }
}

/* ============================ 탱크 물리 & 지뢰 체크 ============================ */
const tankTilt = p => clamp(p.tilt, -1.1, 1.1);
const aimRad = p => p.angle * Math.PI / 180;
function muzzlePos(p, a) {
  const s = p.stats.tankScale, tl = tankTilt(p);
  const px = p.x + PIVOT_Y * s * Math.sin(tl), py = p.y - PIVOT_Y * s * Math.cos(tl);
  return { x: px + Math.cos(a) * BARREL_LEN * s, y: py - Math.sin(a) * BARREL_LEN * s };
}
function moveTankX(p, dx) {
  const s = p.stats.tankScale, hw = BASE_HW * s;
  const nx = clamp(p.x + dx, hw + 6, W - hw - 6);
  const mv = Math.abs(nx - p.x);
  if (mv < 1e-6) return 0;
  const g = Terrain.sampleTank(nx, s);
  const climb = p.y - g.y;
  const maxSlope = 1.85;
  if (climb > mv * maxSlope + 3.5) return 0;
  p.x = nx;
  if (climb >= -(mv * maxSlope + 5)) p.y = g.y;
  return mv;
}
function updateTank(p, dt) {
  const s = p.stats.tankScale, hw = BASE_HW * s;
  p.x = clamp(p.x, hw + 6, W - hw - 6);
  const g = Terrain.sampleTank(p.x, s);
  if (p.air) {
    p.vy += GRAVITY * dt;
    let nx = clamp(p.x + p.vx * dt, hw + 6, W - hw - 6);
    const gN = Terrain.sampleTank(nx, s).y;
    if (p.y - gN > 30 * s) p.vx *= -0.25;
    else { if (nx !== p.x + p.vx * dt) p.vx = 0; p.x = nx; }
    p.y += p.vy * dt;
    p.vx *= Math.exp(-0.15 * dt);
    const g2 = Terrain.sampleTank(p.x, s).y;
    if (p.y >= g2 && p.vy >= 0) {
      if (p.vy > 240) {
        Sfx.thud(); G.shake = Math.max(G.shake, 5 + Math.min(10, p.vy / 80));
        burst(p.x, g2, 10, { colors: getDirtColors(), speed: 170, life: 0.7, size: 3, spread: 2, ground: true, kind: 'debris' });
      }
      p.y = g2; p.vy = 0; p.air = false; p.vx *= 0.35;
    }
  } else {
    if (p.y < g.y - 1.5) { p.air = true; p.vy = Math.max(p.vy, 0); }
    else {
      if (p.y > g.y + 0.6) p.y = Math.max(g.y, p.y - 450 * dt);
      else p.y = g.y;
      const biome = BIOME_DEFS[G.biome] || BIOME_DEFS.grass;
      const friction = biome.slide ? 2.4 : 12;
      p.vx *= Math.exp(-friction * dt); if (Math.abs(p.vx) < 4) p.vx = 0;
      if (p.vx) { if (moveTankX(p, p.vx * dt) === 0) p.vx = 0; }
    }
  }

  if (p.alive) {
    for (let i = G.mines.length - 1; i >= 0; i--) {
      const m = G.mines[i];
      const owner = players[m.ownerId];
      if (!isHostile(owner, p)) continue;
      if (Math.hypot(p.x - m.x, p.y - m.y) < 28 * s) {
        G.mines.splice(i, 1);
        explode({ x: m.x, y: m.y, radius: m.radius, damage: m.damage }, owner);
      }
    }
  }

  const tg = Terrain.sampleTank(p.x, s).tilt;
  p.tilt += (tg - p.tilt) * (1 - Math.exp(-(p.air ? 8 : 24) * dt));
  const dx = p.x - p.lastX; p.lastX = p.x;
  p.wheel += dx / (3.9 * s); p.tread += dx / s;
  p.hitFlash = Math.max(0, p.hitFlash - dt);
  p.recoil = Math.max(0, p.recoil - dt * 5);
  p.side = p.angle < 89.9 ? 1 : (p.angle > 90.1 ? -1 : p.side);
  if (!p.alive && Math.random() < dt * 4)
    P(p.x + fxRand(-8, 8), p.y - 16 * s, fxRand(-10, 10), fxRand(-40, -20), { life: 1.4, size: 5, grow: 10, color: '#555', grav: -0.1, kind: 'smoke', drag: 0.5 });
}
function tanksSettled() {
  return players.every(p => !p.air && Math.abs(p.vx) < 5 && Math.abs(p.vy) < 5 && Math.abs(p.y - Terrain.sampleTank(p.x, p.stats.tankScale).y) < 1.5);
}

/* ============================ 발사 & 충돌 & 폭발 로직 ============================ */
function makeShell(owner, x, y, vx, vy, o = {}) {
  const st = owner.stats;
  return Object.assign({
    x, y, vx, vy, owner, r: 4 * st.shellSize, age: 0, trailT: 0, bouncesLeft: st.bounces,
    damage: st.damage * owner.dmgBoost, radius: st.blastRadius * owner.radiusBoost, child: false, apex: false, split: false, dead: false,
    homeTarget: null, drilling: false, drilled: false, sawing: false, portalCd: 0, angle: 0
  }, o);
}
const pingpong = t => { const ph = (t % POWER_PERIOD) / POWER_PERIOD; return (ph < 0.5 ? ph * 2 : (1 - ph) * 2) * 100; };

function fire(p, fromRemote = false) {
  const power = Math.max(p.charge, 6);
  p.power = power;
  p.lastShotAngle = p.angle;
  p.lastShotPower = power;
  p.charging = false; p.charge = 0; p.chargeT = 0;
  Sfx.chargeStop();

  const px = Math.round(p.x * 100) / 100;
  const py = Math.round(p.y * 100) / 100;
  const pa = Math.round(p.angle * 100) / 100;
  const pp = Math.round(power * 100) / 100;
  p.x = px; p.y = py; p.angle = pa;

  if (!fromRemote) {
    const fireSeed = (Date.now() ^ ((Math.random() * 0xFFFFFFFF) >>> 0)) >>> 0;
    RNG.setSeed(fireSeed);
    if (Net.active && p.id === Net.myId) {
      Net.fireSeq++;
      Net.sendFireReliable({
        type: 'fire',
        seq: Net.fireSeq,
        fireSeed,
        id: p.id,
        x: px,
        y: py,
        angle: pa,
        power: pp
      });
    }
  }

  const a = aimRad(p), st = p.stats;
  const eventRoll = RNG.next();

  if (eventRoll < 0.01) {
    // [특수 이벤트 1] 1% 확률: 돌발 전술 핵폭탄 (맵 초토화 + 전원 자폭 무승부)
    G.pending.push({ t: 0, owner: p, angle: a, power: pp, isDrawNuke: true });
    showBanner('☢️ 핵폭탄 경보!', '1% 확률 돌발 핵탄두 장전! 전원 대피!', '#c6ff00', 1.8);
  } else if (eventRoll < 0.03) {
    // [특수 이벤트 2] 2% 확률 (0.01 ~ 0.03): 불발탄 (기존 4%에서 확률 대폭 하향)
    G.pending.push({ t: 0, owner: p, angle: a, power: pp, isMisfire: true });
    showBanner('💥 불발탄 발생!', '2% 확률 포신 내부 점화!', '#ff5252', 1.5);
  } else {
    const totalShots = st.shots + p.bonusShots;
    for (let i = 0; i < totalShots; i++) {
      const spread = (st.buckshot > 0 || st.synGatling) ? rand(-5.5, 5.5) : (i > 0 ? rand(-1.0, 1.0) : 0);
      G.pending.push({ t: i * st.shotDelay, owner: p, angle: a + spread * Math.PI / 180, power: pp });
    }
  }
  p.dmgBoost = 1;
  p.radiusBoost = 1;
  p.bonusShots = 0;
  G.resolveT = 0; G.settleT = 0;
  setState('resolving');
}
function spawnShell(owner, angle, power, opts = {}) {
  const st = owner.stats, m = muzzlePos(owner, angle);
  if (opts.isMisfire) {
    Sfx.pop();
    G.floaters.push({ x: owner.x, y: owner.y - 68, text: '💥 불발탄 자폭!', color: '#ff5252', t: 0, life: 1.4 });
    explode({ x: owner.x, y: owner.y - 16 * st.tankScale, radius: st.blastRadius * 1.15, damage: Math.max(24, st.damage * 0.9) }, owner);
    return;
  }
  const sp = power / 100 * MAX_SHELL_SPEED * st.shellSpeed;
  const extra = opts.isDrawNuke ? {
    r: 12, radius: 520, damage: 9999, isDrawNuke: true, isLava: true
  } : {};
  const shell = makeShell(owner, m.x, m.y, Math.cos(angle) * sp, -Math.sin(angle) * sp, Object.assign({ angle }, extra));
  if (!opts.isDrawNuke) runHooks(owner, 'onFire', shell);
  G.shells.push(shell);
  owner.recoil = 1;
  Sfx.shoot(power);
  G.shake = Math.max(G.shake, opts.isDrawNuke ? 16 : 4);
  burst(m.x, m.y, 8, { colors: FIRE_COLORS, speed: 240, life: 0.3, size: 3, grav: 0.2, spread: 0.9, dir: -angle, kind: 'spark' });
}
function collectCrate(cr, idx, owner) {
  G.crates.splice(idx, 1);
  Sfx.crate();
  if (cr.type === 'power') {
    owner.dmgBoost = 1.4;
    G.floaters.push({ x: owner.x, y: owner.y - 65, text: '⚡ 다음 1발 +40%!', color: '#ffd54f', t: 0, life: 1.3 });
  } else if (cr.type === 'mega') {
    owner.radiusBoost = 1.5;
    G.floaters.push({ x: owner.x, y: owner.y - 65, text: '💣 거대 폭발 +50%!', color: '#ff7043', t: 0, life: 1.3 });
  } else {
    owner.bonusShots = 2;
    G.floaters.push({ x: owner.x, y: owner.y - 65, text: '💥 다음 턴 +2발 난사!', color: '#69f0ae', t: 0, life: 1.3 });
  }
  burst(cr.x, cr.y, 16, { colors: ['#fff', '#ffd54f', '#ff7043'], speed: 220, life: 0.5, size: 3.5, kind: 'spark' });
}
function hitsTank(px, py, r, p) {
  const s = p.stats.tankScale, half = 21 * s, top = 30 * s;
  return px > p.x - half - r && px < p.x + half + r && py > p.y - top - r && py < p.y + 3;
}
function bounceWall(s, side) {
  s.x = side < 0 ? 1 : W - 1; s.vx = -s.vx * 0.92;
  Sfx.bounce();
}
function bounceTerrain(s) {
  let nx = 0, ny = 0;
  for (let dy = -6; dy <= 6; dy += 2) for (let dx = -6; dx <= 6; dx += 2) if (!Terrain.solid(s.x + dx, s.y + dy)) { nx += dx; ny += dy; }
  let nl = Math.hypot(nx, ny);
  if (nl < 1e-3) { nx = 0; ny = -1; nl = 1; }
  nx /= nl; ny /= nl;
  if (Math.hypot(s.vx, s.vy) < 90) return false;
  const vn = s.vx * nx + s.vy * ny;
  if (vn < 0) { s.vx -= 1.74 * vn * nx; s.vy -= 1.74 * vn * ny; }
  for (let i = 0; i < 16 && Terrain.solid(s.x, s.y); i++) { s.x += nx; s.y += ny; }
  s.x += nx * 1.5; s.y += ny * 1.5;
  Sfx.bounce();
  return true;
}
function updateShells(dt) {
  for (let i = G.shells.length - 1; i >= 0; i--) if (!stepShell(G.shells[i], dt)) G.shells.splice(i, 1);
}
function stepShell(s, dt) {
  const owner = s.owner;
  s.age += dt;
  if (s.portalCd > 0) s.portalCd -= dt;
  if (s.drilling) return stepDrill(s, dt);
  if (s.sawing) return stepSawblade(s, dt);

  const ox = s.x, oy = s.y;
  s.vx += G.wind * WIND_ACCEL * dt; s.vy += GRAVITY * dt;
  runHooks(owner, 'onUpdate', s, dt);
  s.x += s.vx * dt; s.y += s.vy * dt;
  s.trailT += dt;
  while (s.trailT > 0.022) {
    s.trailT -= 0.022;
    P(s.x + fxRand(-1.5, 1.5), s.y + fxRand(-1.5, 1.5), fxRand(-10, 10), fxRand(-12, 6),
      { life: fxRand(0.6, 0.9), size: s.r * fxRand(0.9, 1.3), grow: 10, color: s.isLava ? '#ff7043' : '#bdbdbd', grav: -0.03, kind: 'smoke', drag: 0.8 });
  }
  if (!s.apex && s.vy > 0) {
    s.apex = true;
    if (s.age > 0.08) { runHooks(owner, 'onApex', s); if (s.dead) return false; }
  }

  for (let i = G.crates.length - 1; i >= 0; i--) {
    const cr = G.crates[i];
    if (Math.hypot(s.x - cr.x, s.y - cr.y) <= cr.r + s.r) {
      collectCrate(cr, i, owner);
    }
  }
  if (G.portals.length === 2 && s.portalCd <= 0) {
    for (let i = 0; i < 2; i++) {
      const pt = G.portals[i];
      if (Math.hypot(s.x - pt.x, s.y - pt.y) <= pt.r) {
        const dst = G.portals[1 - i];
        s.x = dst.x; s.y = dst.y; s.portalCd = 0.35;
        Sfx.portal();
        G.rings.push({ x: pt.x, y: pt.y, max: 50, t: 0, life: 0.3, color: '0,229,255' });
        G.rings.push({ x: dst.x, y: dst.y, max: 50, t: 0, life: 0.3, color: '255,64,129' });
        break;
      }
    }
  }

  const dx = s.x - ox, dy = s.y - oy, n = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 3));
  for (let k = 1; k <= n; k++) {
    const px = ox + dx * k / n, py = oy + dy * k / n;
    s.x = px; s.y = py;
    for (const p of players) {
      if (!p.alive || (p === owner && s.age < 0.25)) continue;
      if (hitsTank(px, py, s.r, p)) {
        const hit = { type: 'tank', tank: p };
        if (runImpact(s, hit)) return !s.dead;
        Sfx.hit(); detonate(s, hit); return false;
      }
    }
    if (px < 0 || px > W) { if (runImpact(s, { type: 'wall', side: px < 0 ? -1 : 1 })) return !s.dead; }
    else if (py >= 0 && Terrain.solid(px, py)) {
      const hit = { type: 'terrain' };
      if (s.hops > 0 && bounceTerrain(s)) { s.hops--; return true; }
      if (runImpact(s, hit)) return !s.dead;
      detonate(s, hit); return false;
    }
  }
  return !(s.x < -250 || s.x > W + 250 || s.y > H + 250 || s.age > 16);
}
function stepSawblade(s, dt) {
  s.sawTime -= dt;
  s.x += s.sawDir * 300 * dt;
  s.x = clamp(s.x, 10, W - 10);
  s.y = Terrain.h(s.x) - 2;
  Terrain.carve(s.x, s.y, 13);
  P(s.x, s.y, fxRand(-90, 90), fxRand(-140, -40), { life: 0.35, size: 2.5, color: '#ffd54f', kind: 'spark' });
  for (const p of players) {
    if (p.alive && isHostile(s.owner, p) && hitsTank(s.x, s.y, s.r + 6, p)) {
      detonate(s, { type: 'tank', tank: p });
      return false;
    }
  }
  if (s.sawTime <= 0 || s.x <= 12 || s.x >= W - 12) {
    detonate(s, { type: 'terrain' });
    return false;
  }
  return true;
}
function stepDrill(s, dt) {
  let remain = s.drillSpeed * dt;
  while (remain > 0) {
    const st = Math.min(3, remain); remain -= st;
    // 땅속에서 가장 가까운 적을 향해 방향 전환
    const e = enemyTank(s.owner, s.x, s.y);
    if (e) {
      const cur = Math.atan2(s.dy, s.dx);
      let d = Math.atan2(e.y - 14 * e.stats.tankScale - s.y, e.x - s.x) - cur;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      const na = cur + clamp(d, -0.022 * st, 0.022 * st);
      s.dx = Math.cos(na); s.dy = Math.sin(na);
    }
    s.x += s.dx * st; s.y += s.dy * st; s.drillLeft -= st; s.drillDug += st; s.drillAcc += st;
    s.damage = s.baseDamage * (1 + 0.4 * Math.min(1, s.drillDug / 220));
    for (const p of players) {
      if (p.alive && isHostile(s.owner, p) && hitsTank(s.x, s.y, s.r + 8, p)) { Sfx.hit(); detonate(s, { type: 'tank', tank: p }); return false; }
    }
    if (s.drillAcc >= 5) {
      s.drillAcc = 0;
      Terrain.carve(s.x, s.y, s.drillR);
      P(s.x, s.y, fxRand(-90, 90), fxRand(-120, 20), { life: 0.5, size: 3, color: getDirtColors()[(Math.random() * 4) | 0], kind: 'debris', ground: true });
    }
    if (s.drillLeft <= 0 || s.y >= H - BEDROCK || s.x < 0 || s.x >= W) { detonate(s, { type: 'terrain' }); return false; }
    const lx = s.x + s.dx * (s.drillR + 3), ly = s.y + s.dy * (s.drillR + 3);
    if (s.drillDug > 30 && !Terrain.solid(lx, ly)) {
      s.drilling = false; s.vx = s.dx * s.drillSpeed; s.vy = s.dy * s.drillSpeed; return true;
    }
  }
  G.shake = Math.max(G.shake, 2.5);
  return true;
}
function detonate(s, hit) {
  const owner = s.owner;
  if (s.isDrawNuke) {
    Terrain.carve(s.x, s.y, 650);
    blastFX(s.x, s.y, 280, false);
    G.screenFlash = 1.0;
    G.shake = 42;
    Sfx.ko();
    for (const pl of players) {
      if (pl.alive) {
        pl.phoenixCharges = 0;
        pl.hp = 0;
        killTank(pl);
      }
    }
    showBanner('☢️ 핵폭발 무승부!', '전원 파괴! 무승부 보상으로 모두 카드를 선택합니다', '#c6ff00', 2.4);
    return;
  }
  const c = { x: s.x, y: s.y, shell: s, radius: s.radius, damage: s.damage, raise: false, noCarve: false, raiseRadius: 0, hit };
  runHooks(owner, 'onDetonate', c, owner);
  explode(c, owner);
  runHooks(owner, 'onExplode', c);
}
function explode(c, attacker) {
  const { x, y, radius, damage } = c;
  for (const p of players) {
    if (!p.alive) continue;
    // 2:2 팀전 아군 오폭 방지 (자기 자신의 폭발은 피해 적용)
    if (G.mode === '2v2' && attacker && p !== attacker && p.team === attacker.team) continue;
    const s = p.stats.tankScale;
    const nx = clamp(x, p.x - 21 * s, p.x + 21 * s), ny = clamp(y, p.y - 30 * s, p.y);
    const d = Math.hypot(x - nx, y - ny);
    if (d < radius) {
      const falloff = 1 - 0.7 * (d / radius);
      damageTank(p, damage * falloff, '#ff5252', attacker);
    }
  }
  if (c.raise) Terrain.raise(x, y, c.raiseRadius);
  else if (!c.noCarve) Terrain.carve(x, y, radius);
  blastFX(x, y, radius, c.raise);
  Sfx.explosion(radius);
}
function damageTank(p, amt, col = '#ff5252', attacker = null) {
  if (!p.alive) return;
  const cap = (G.round <= 3) ? p.roundMaxHp : Math.round(p.roundMaxHp * 0.75);
  const remainCap = Math.max(0, cap - p.turnDmgTaken);
  if (attacker && p.stats.armor > 0) {
    amt *= Math.max(0.45, Math.pow(0.82, p.stats.armor) * (p.stats.synFortress ? 0.85 : 1));
  }
  amt = Math.min(remainCap, Math.max(1, Math.round(amt)));
  if (amt <= 0) return;

  p.turnDmgTaken += amt;
  p.hp -= amt; p.hitFlash = 0.25;
  G.floaters.push({ x: p.x, y: p.y - 56 * p.stats.tankScale, text: '-' + amt, color: col, t: 0, life: 1.0 });

  if (attacker && isHostile(attacker, p) && attacker.alive && attacker.stats.leech > 0) {
    const heal = Math.max(1, Math.round(amt * attacker.stats.leech));
    attacker.hp = Math.min(attacker.roundMaxHp, attacker.hp + heal);
    G.floaters.push({ x: attacker.x, y: attacker.y - 68, text: `🧛 +${heal}`, color: '#ff5252', t: 0, life: 1.0 });
  }

  if (p.hp <= 0 && p.alive) {
    if (p.phoenixCharges > 0) {
      p.phoenixCharges--;
      p.hp = Math.max(15, Math.round(p.roundMaxHp * 0.4));
      Sfx.phoenix();
      burst(p.x, p.y - 16, 35, { colors: FIRE_COLORS, speed: 360, life: 0.9, size: 4, kind: 'spark' });
      G.rings.push({ x: p.x, y: p.y - 16, max: 110, t: 0, life: 0.45, color: '255,109,0' });
      G.floaters.push({ x: p.x, y: p.y - 75, text: '🔥 불사조 부활!', color: '#ff9100', t: 0, life: 1.4 });
      return;
    }
    killTank(p);
  }
}
function killTank(p) {
  p.alive = false;
  const cy = p.y - 14 * p.stats.tankScale;
  burst(p.x, cy, 40, { colors: FIRE_COLORS, speed: 540, life: 1.0, size: 4, grav: 0.6, kind: 'spark' });
  burst(p.x, cy, 20, { colors: [p.color, '#333', '#777'], speed: 380, life: 1.4, size: 5, grav: 1, ground: true, kind: 'debris' });
  G.rings.push({ x: p.x, y: cy, max: 150, t: 0, life: 0.5, color: '255,200,120' });
  G.flashes.push({ x: p.x, y: cy, r: 150, t: 0, life: 0.3 });
  G.screenFlash = 0.6; G.shake = Math.max(G.shake, 28);
  Sfx.ko();
  showBanner('K.O.!', `${p.name} 파괴됨`, '#ff5252', 1.4);
}
function computeGuide(p) {
  const st = p.stats, pw = p.charging ? Math.max(p.charge, 6) : p.power;
  const a = aimRad(p), m = muzzlePos(p, a), sp = pw / 100 * MAX_SHELL_SPEED * st.shellSpeed;
  const s = { x: m.x, y: m.y, vx: Math.cos(a) * sp, vy: -Math.sin(a) * sp };
  const pts = [], dt = 1 / 60, steps = Math.round(st.guideTime / dt);
  for (let i = 0; i < steps; i++) {
    s.vx += G.wind * WIND_ACCEL * dt; s.vy += GRAVITY * dt;
    s.x += s.vx * dt; s.y += s.vy * dt;
    if (s.x < 0 || s.x >= W || (s.y >= 0 && Terrain.solid(s.x, s.y))) break;
    if (i % 3 === 2) pts.push({ x: s.x, y: s.y });
  }
  return pts;
}

/* ============================ 필드 이펙트 (블랙홀 & UFO) ============================ */
function spawnBlackhole(x, y, owner, dur, power) {
  G.fields.push({ type: 'blackhole', x, y, owner, t: 0, life: dur, R: 185, power, rot: 0, acc: [0, 0, 0, 0] });
  Sfx.hum(dur);
}
function updateFields(dt) {
  for (let i = G.fields.length - 1; i >= 0; i--) {
    const f = G.fields[i];
    f.t += dt;
    if (f.type === 'duck') {
      if (f.t < 0) continue;
      const e = enemyTank(f.owner, f.x, f.y);
      if (e) f.dir = e.x >= f.x ? 1 : -1;
      f.x = clamp(f.x + f.dir * 190 * dt, 10, W - 10);
      f.y = Terrain.h(f.x) - 9;
      const reached = e && Math.abs(e.x - f.x) < 20 * e.stats.tankScale && Math.abs(e.y - f.y) < 50;
      if (reached || f.t >= f.life) {
        G.fields.splice(i, 1);
        explode({ x: f.x, y: f.y, radius: 34, damage: f.damage }, f.owner);
      }
      continue;
    }
    if (f.type === 'ufo') {
      const e = enemyTank(f.owner, f.x, f.y + 210);
      if (e && Math.abs(e.x - f.x) < f.R) {
        e.air = true;
        if (f.t < f.life * 0.68) {
          e.y = Math.max(150, e.y - 340 * dt);
          e.vy = 0;
          e.x += (f.x - e.x) * 4.5 * dt;
          const maxBeam = 6 + (f.power - 1) * 5;
          if (f.beamTotal < maxBeam) {
            f.beamAcc += (7 + (f.power - 1) * 4) * dt;
            if (f.beamAcc >= 3) {
              const deal = Math.min(Math.round(f.beamAcc), maxBeam - f.beamTotal);
              if (deal > 0) {
                damageTank(e, deal, '#ea80fc', f.owner);
                f.beamTotal += deal;
              }
              f.beamAcc = 0;
            }
          }
          P(e.x + fxRand(-18, 18), e.y - 16, fxRand(-40, 40), fxRand(-80, -20), { life: 0.35, size: 3, color: '#ea80fc', grav: 0, kind: 'spark' });
        } else {
          e.vy = 780;
          if (!f.slammed) {
            f.slammed = true;
            const slamDmg = 11 + (f.power - 1) * 7;
            damageTank(e, slamDmg, '#ff4081', f.owner);
            G.floaters.push({ x: e.x, y: e.y - 72, text: '🛸 강제 추락!', color: '#ea80fc', t: 0, life: 1.2 });
            G.shake = Math.max(G.shake, 14);
          }
        }
      }
      if (f.t >= f.life) G.fields.splice(i, 1);
      continue;
    }

    f.rot += dt * 6;
    const k = Math.min(1, f.t / 0.3) * Math.min(1, (f.life - f.t) / 0.35);
    for (const p of players) {
      if (!p.alive || !isHostile(f.owner, p)) continue;
      const cy = p.y - 14 * p.stats.tankScale;
      const dx = f.x - p.x, dy = f.y - cy, d = Math.hypot(dx, dy);
      if (d < f.R * k) {
        const pull = (70 + 260 * (1 - d / f.R) * f.power) * dt;
        moveTankX(p, Math.sign(dx) * Math.min(pull, Math.abs(dx)));
        if (d < 90) {
          f.acc[p.id] = (f.acc[p.id] || 0) + (12 + (f.power - 1) * 6) * dt;
          if (f.acc[p.id] >= 5) { damageTank(p, f.acc[p.id], '#b388ff', f.owner); f.acc[p.id] = 0; }
        }
      }
    }
    for (const q of G.particles) {
      const dx = f.x - q.x, dy = f.y - q.y, d = Math.hypot(dx, dy);
      if (d < f.R && d > 1) {
        const a = 1500 * (1 - d / f.R) * f.power * k;
        q.vx += dx / d * a * dt; q.vy += dy / d * a * dt;
        if (d < 14) q.life = 0;
      }
    }
    const a = fxRand(0, TAU), d = f.R * fxRand(0.45, 0.95) * k;
    P(f.x + Math.cos(a) * d, f.y + Math.sin(a) * d, -Math.sin(a) * 220, Math.cos(a) * 220,
      { life: 0.8, size: 2.5, grav: 0, color: Math.random() < 0.5 ? '#b388ff' : '#80deea', kind: 'dot' });
    G.shake = Math.max(G.shake, 2);
    if (f.t >= f.life) {
      if (f.owner && f.owner.stats.synSupernova) {
        G.floaters.push({ x: f.x, y: f.y - 45, text: '🌌 초신성 붕괴 폭발!', color: '#d500f9', t: 0, life: 1.3 });
        explode({ x: f.x, y: f.y, radius: 135, damage: 34 }, f.owner);
      } else {
        G.flashes.push({ x: f.x, y: f.y, r: 140, t: 0, life: 0.3 });
        G.rings.push({ x: f.x, y: f.y, max: 180, t: 0, life: 0.45, color: '190,140,255' });
        burst(f.x, f.y, 24, { colors: ['#b388ff', '#ffffff', '#80deea'], speed: 420, life: 0.7, size: 3, grav: 0, kind: 'spark', drag: 2 });
        G.shake = Math.max(G.shake, 12); Sfx.pop();
      }
      G.fields.splice(i, 1);
    }
  }
}

/* ============================ 입력 (로컬 2인/4인 + 온라인 멀티) ============================ */
const keys = {};
const BLOCK_KEYS = new Set(['Space', 'Enter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Numpad0', 'Numpad4', 'Numpad5', 'Numpad6', 'Numpad8']);
let hoverTitleBtn = -1;

const TITLE_BTNS = [
  { mode: '1v1', x: 220, y: 310, w: 360, h: 270, title: '⚔️ 로컬 1 : 1', color: '#4fc3f7', lines: ['1:1 클래식 듀얼', 'P1: WASD + Space', 'P2: 방향키 + Enter', '👉 클릭하여 시작'] },
  { mode: '2v2', x: 620, y: 310, w: 360, h: 270, title: '🛡️ 로컬 2 : 2 팀전', color: '#ff8a65', lines: ['블루(P1·P3) vs 레드(P2·P4)', '팀원 간 아군 오사 면역', '패배 팀 전원 카드 선택!', '👉 클릭하여 시작'] },
  { mode: 'online', x: 1020, y: 310, w: 360, h: 270, title: '🌐 온라인 멀티', color: '#69f0ae', lines: ['1:1 · 2:2 · 4인 난투', '4자리 방 코드 원격 대전', '실시간 궤적·카드 동기화', '👉 클릭하여 방 열기'] }
];

function getCanvasCoords(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (clientX - rect.left) * (W / rect.width),
    y: (clientY - rect.top) * (H / rect.height)
  };
}

function cardAt(e) {
  if (G.state !== 'cards' || G.stateT < 0.5 || (Net.active && G.cardLoser !== Net.myId)) return -1;
  const { x, y } = getCanvasCoords(e.clientX, e.clientY);
  for (let i = 0; i < 3; i++) if (x >= cardX(i) && x <= cardX(i) + CARD_W && y >= CARD_Y && y <= CARD_Y + CARD_H) return i;
  return -1;
}
canvas.addEventListener('mousemove', e => {
  if (G.state === 'cards') {
    const i = cardAt(e);
    canvas.style.cursor = i !== -1 ? 'pointer' : 'default';
    if (i !== -1 && i !== G.sel) {
      G.sel = i; Sfx.cardMove();
      if (Net.active) Net.send({ type: 'cardSelect', sel: i });
    }
    return;
  }
  if (G.state !== 'title') {
    if (hoverTitleBtn !== -1) { hoverTitleBtn = -1; canvas.style.cursor = 'default'; }
    return;
  }
  const { x, y } = getCanvasCoords(e.clientX, e.clientY);
  let hov = -1;
  TITLE_BTNS.forEach((b, idx) => {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) hov = idx;
  });
  hoverTitleBtn = hov;
  canvas.style.cursor = hov !== -1 ? 'pointer' : 'default';
});

canvas.addEventListener('click', e => {
  Sfx.init();
  if (G.state === 'cards') {
    const i = cardAt(e);
    if (i !== -1) { canvas.style.cursor = 'default'; pickCard(i); }
    return;
  }
  if (G.state !== 'title') return;
  const { x, y } = getCanvasCoords(e.clientX, e.clientY);
  for (const b of TITLE_BTNS) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
      canvas.style.cursor = 'default';
      if (b.mode === 'online') {
        Net.openModal();
      } else {
        Net.active = false;
        startMatch(b.mode);
      }
      break;
    }
  }
});

window.addEventListener('keydown', e => {
  if (document.getElementById('p2p-modal').style.display === 'flex') return;
  if (BLOCK_KEYS.has(e.code)) e.preventDefault();
  Sfx.init();
  const was = keys[e.code];
  keys[e.code] = true;
  if (!e.repeat && !was) onKeyDown(e.code);
});
window.addEventListener('keyup', e => {
  if (document.getElementById('p2p-modal').style.display === 'flex') return;
  if (BLOCK_KEYS.has(e.code)) e.preventDefault();
  keys[e.code] = false;
  onKeyUp(e.code);
});
window.addEventListener('blur', () => {
  for (const k in keys) keys[k] = false;
  for (const p of players) if (p.charging) { p.charging = false; p.charge = 0; p.chargeT = 0; Sfx.chargeStop(); }
});

function isMyTurnControl(p) {
  if (!Net.active) return true;
  return p.id === Net.myId;
}

function getActiveControls(p) {
  if (Net.active) {
    return {
      left: keys['KeyA'] || keys['ArrowLeft'],
      right: keys['KeyD'] || keys['ArrowRight'],
      up: keys['KeyW'] || keys['ArrowUp'],
      down: keys['KeyS'] || keys['ArrowDown'],
      fireCode: ['Space', 'Enter']
    };
  }
  return {
    left: keys[p.keys.left],
    right: keys[p.keys.right],
    up: keys[p.keys.up],
    down: keys[p.keys.down],
    fireCode: [p.keys.fire]
  };
}

function onKeyDown(code) {
  switch (G.state) {
    case 'title': {
      if (code === 'Digit1' || code === 'Numpad1') { Net.active = false; startMatch('1v1'); }
      else if (code === 'Digit2' || code === 'Numpad2') { Net.active = false; startMatch('2v2'); }
      else if (code === 'Digit3' || code === 'Numpad3') { Net.openModal(); }
      break;
    }
    case 'aiming': {
      const p = players[G.turn];
      if (!p || !isMyTurnControl(p)) break;
      const ctrl = getActiveControls(p);
      if (p.alive && ctrl.fireCode.includes(code) && !p.charging && G.stateT > 0.25) {
        p.charging = true; p.charge = 0; p.chargeT = 0; Sfx.chargeStart();
      }
      break;
    }
    case 'cards': {
      if (G.stateT < 0.5) break;
      if (Net.active && G.cardLoser !== Net.myId) break;
      const num = { Digit1: 0, Digit2: 1, Digit3: 2, Numpad1: 0, Numpad2: 1, Numpad3: 2 }[code];
      if (num !== undefined) { pickCard(num); break; }
      if (code === 'ArrowLeft' || code === 'KeyA' || code === 'KeyJ') {
        G.sel = (G.sel + 2) % 3; Sfx.cardMove();
        if (Net.active) Net.send({ type: 'cardSelect', sel: G.sel });
      } else if (code === 'ArrowRight' || code === 'KeyD' || code === 'KeyL') {
        G.sel = (G.sel + 1) % 3; Sfx.cardMove();
        if (Net.active) Net.send({ type: 'cardSelect', sel: G.sel });
      } else if (code === 'Space' || code === 'Enter' || code === 'KeyU' || code === 'Numpad0') {
        pickCard(G.sel);
      }
      break;
    }
    case 'matchOver':
      if (G.stateT > 1 && (code === 'Space' || code === 'Enter')) {
        if (!Net.active || Net.isHost) {
          if (Net.active) Net.send({ type: 'rematch' });
          startMatch(G.mode);
        }
      }
      break;
  }
}
function onKeyUp(code) {
  if (G.state !== 'aiming') return;
  const p = players[G.turn];
  if (!p || !isMyTurnControl(p)) return;
  const ctrl = getActiveControls(p);
  if (p.charging && ctrl.fireCode.includes(code)) fire(p);
}

/* ============================ 업데이트 루프 ============================ */
function updateRemoteAimInterpolation(dt) {
  if (!Net.active || !Net.remoteTarget) return;
  const t = Net.remoteTarget;
  const p = players[t.id];
  if (!p || G.turn !== t.id) return;
  const k = 1 - Math.exp(-18 * dt);
  p.x = lerp(p.x, t.x, k);
  p.y = lerp(p.y, t.y, k);
  p.angle = lerp(p.angle, t.angle, k);
  p.fuel = t.fuel;
  p.charging = t.charging;
  p.charge = t.charge;
}

function updateActivePlayer(dt) {
  const p = players[G.turn]; if (!p || !p.alive) return;
  if (!isMyTurnControl(p)) {
    updateRemoteAimInterpolation(dt);
    return;
  }

  const ctrl = getActiveControls(p);
  const up = ctrl.up ? 1 : 0, dn = ctrl.down ? 1 : 0;
  if (up || dn) p.angle = clamp(p.angle + (up - dn) * p.aimDir * AIM_SPEED * dt, 0, 180);
  const dir = (ctrl.right ? 1 : 0) - (ctrl.left ? 1 : 0);
  if (dir && p.fuel > 0 && !p.air) {
    const biome = BIOME_DEFS[G.biome] || BIOME_DEFS.grass;
    const want = Math.min(MOVE_SPEED * biome.speedMult * dt, p.fuel);
    const moved = moveTankX(p, dir * want);
    p.fuel = Math.max(0, p.fuel - moved * biome.fuelMult);
    if (biome.slide && moved > 0) p.vx = dir * MOVE_SPEED * biome.speedMult;
  }
  if (p.charging) { p.chargeT += dt; p.charge = pingpong(p.chargeT); Sfx.chargeUpdate(p.charge); }

  if (Net.active) {
    Net.syncTimer += dt;
    if (Net.syncTimer > 0.18) {
      Net.syncTimer = 0;
      const rx = Math.round(p.x);
      const ry = Math.round(p.y);
      const ra = Math.round(p.angle);
      const rc = p.charging ? Math.round(p.charge) : -1;
      const sig = `${rx},${ry},${ra},${p.charging ? 1 : 0},${rc}`;
      if (sig !== Net.lastAimSent) {
        Net.lastAimSent = sig;
        Net.send({ type: 'aimSync', id: p.id, x: rx, y: ry, angle: ra, fuel: Math.round(p.fuel), charging: p.charging, charge: p.charge }, 0);
      }
    }
  }
}

function checkRoundOver() {
  const alivePlayers = players.filter(p => p.alive);
  if (G.mode === '2v2') {
    const team0Alive = alivePlayers.some(p => p.team === 0);
    const team1Alive = alivePlayers.some(p => p.team === 1);
    return !team0Alive || !team1Alive;
  }
  return alivePlayers.length <= 1;
}

function finishResolve() {
  if (Net.active && !Net.isHost) return;

  if (checkRoundOver()) {
    if (Net.active && Net.isHost) {
      Net.send({ type: 'roundEndSync', states: packAuthoritativeState() }, 1);
    }
    endRound();
  } else {
    const nextTurn = getNextAliveTurn(G.turn);
    const seed = (Date.now() ^ ((Math.random() * 0xFFFFFFFF) >>> 0)) >>> 0;
    RNG.setSeed(seed);
    const wind = Math.round(rand(-MAX_WIND, MAX_WIND) * 10) / 10;
    if (Net.active && Net.isHost) {
      Net.send({
        type: 'turnStart',
        turn: nextTurn,
        turnCount: G.turnCount + 1,
        wind,
        seed,
        states: packAuthoritativeState()
      }, 1);
    }
    beginTurn(nextTurn, wind, seed);
  }
}

function endRound() {
  const alivePlayers = players.filter(p => p.alive);

  // 1. 무승부 처리 (전원 사망 시에도 모든 플레이어에게 카드 선택 기회 부여!)
  if (alivePlayers.length === 0) {
    G.winner = -1;
    G.cardQueue = players.map(p => p.id);
    G.cardLoser = G.cardQueue[0];
    const scoreTxt = G.mode === '2v2' ? `블루 ${G.teamScores[0]} : ${G.teamScores[1]} 레드` : players.map(p => `${p.name}:${p.score}`).join(' · ');
    showBanner('⚖️ ROUND DRAW!', `무승부! 전원 카드 1장씩 선택 · ${scoreTxt}`, '#c6ff00', 2.4);
    setState('roundEnd');
    return;
  }

  // 2. 2:2 팀전 승리 처리
  if (G.mode === '2v2') {
    const winTeam = alivePlayers[0].team;
    const loseTeam = 1 - winTeam;
    G.teamScores[winTeam]++;
    G.winner = winTeam;
    const losers = players.filter(p => p.team === loseTeam);
    G.nextFirst = losers[0].id;
    G.cardQueue = losers.map(p => p.id);
    G.cardLoser = G.cardQueue[0];
    const teamName = winTeam === 0 ? '블루팀 (P1·P3)' : '레드팀 (P2·P4)';
    const teamCol = winTeam === 0 ? '#4fc3f7' : '#ff8a65';
    showBanner(`${teamName} 승리!`, `블루 ${G.teamScores[0]} : ${G.teamScores[1]} 레드`, teamCol, 2.2);
    setState('roundEnd');
    return;
  }

  // 3. 1:1 및 1:1:1:1 개인전 승리 처리
  const winner = alivePlayers[0].id;
  players[winner].score++;
  G.winner = winner;
  const losers = players.filter(p => p.id !== winner);
  G.nextFirst = losers[0].id;
  G.cardQueue = losers.map(p => p.id);
  G.cardLoser = G.cardQueue[0];
  const scoreSub = players.length === 2 ? `${players[0].score} : ${players[1].score}` : players.map(p => `${p.name} ${p.score}승`).join('  |  ');
  showBanner(`${players[winner].name} 승리!`, scoreSub, players[winner].color, 2.2);
  setState('roundEnd');
}

function openCards() {
  if (Net.active && !Net.isHost) return;
  G.cardLoser = G.cardQueue[0];
  G.choices = shuffle(CARD_POOL).slice(0, 3);
  G.sel = 1; G.picked = -1; G.cardAdvanced = false;
  if (Net.active && Net.isHost) {
    Net.send({ type: 'cardChoices', choices: G.choices, loser: G.cardLoser, queue: G.cardQueue }, 1);
  }
  setState('cards');
}

function pickCard(i, fromRemote = false) {
  if (G.state !== 'cards') return;
  if (Net.active && !fromRemote) {
    Net.send({ type: 'cardPick', index: i }, 1);
  }
  const p = players[G.cardLoser];
  const prevSynCount = p.stats.synergies.length;
  p.cards.push(G.choices[i]);
  p.stats = computeStats(p.cards);
  G.picked = i; G.sel = i;
  if (p.stats.synergies.length > prevSynCount) {
    const newSyn = p.stats.synergies[p.stats.synergies.length - 1];
    Sfx.synergy();
    showBanner(`${newSyn.icon} 시너지 각성!`, `${p.name}: [${newSyn.name}] ${newSyn.desc}`, newSyn.color, 2.2);
  } else {
    Sfx.cardPick();
  }
  setState('cardPicked');
}

function update(raw) {
  G.timeScale = (G.state === 'roundEnd' && G.stateT < 1.2) ? 0.3 : 1;
  const dt = raw * G.timeScale;
  G.stateT += raw;
  // 조준 중 사망(서든데스·독·지뢰)하거나 승패가 정해지면 결과 처리 단계로 전환
  if (G.state === 'aiming' && (!players[G.turn].alive || checkRoundOver())) {
    Sfx.chargeStop();
    players[G.turn].charging = false;
    G.resolveT = 0; G.settleT = 0;
    setState('resolving');
  }
  if (G.state === 'aiming') updateActivePlayer(dt);
  updateWindStreaks(dt);
  updateFields(dt);
  updateParticles(dt);
  for (const ev of G.events) if (ev.update) ev.update(dt);
  for (const p of players) updateTank(p, dt);
  G.shake *= Math.exp(-9 * raw); if (G.shake < 0.2) G.shake = 0;
  G.screenFlash *= Math.exp(-7 * raw);
  if (G.banner) { G.banner.t += raw; if (G.banner.t > G.banner.dur) G.banner = null; }

  switch (G.state) {
    case 'resolving': {
      G.resolveT += dt;
      for (let i = G.pending.length - 1; i >= 0; i--) {
        const q = G.pending[i]; q.t -= dt;
        if (q.t <= 0) {
          G.pending.splice(i, 1);
          if (q.custom) {
            const c = q.custom;
            G.shells.push(makeShell(q.owner, c.x, c.y, c.vx, c.vy, { damage: c.damage, radius: c.radius, child: true, r: 3.5, icon: c.icon }));
          } else if (q.chainBoom) {
            const cb = q.chainBoom;
            explode({ x: cb.x, y: Terrain.h(cb.x), radius: cb.radius, damage: cb.damage }, q.owner);
          } else if (q.owner.alive) {
            spawnShell(q.owner, q.angle, q.power, { isDrawNuke: q.isDrawNuke, isMisfire: q.isMisfire });
          }
        }
      }
      const n = Math.max(1, Math.ceil(dt / (1 / 120))), h = dt / n;
      for (let i = 0; i < n; i++) updateShells(h);
      const busy = G.pending.length || G.shells.length || G.fields.length || !tanksSettled();
      G.settleT = busy ? 0 : G.settleT + dt;
      if (G.settleT > 0.7 || G.resolveT > 10) finishResolve();
      break;
    }
    case 'roundEnd':
      if (G.stateT > 2.5) {
        if (G.winner !== -1) {
          const isMatchEnd = G.mode === '2v2'
            ? G.teamScores[G.winner] >= WINS_TO_MATCH
            : players[G.winner].score >= WINS_TO_MATCH;
          if (isMatchEnd) {
            setState('matchOver');
            break;
          }
        }
        // 무승부(G.winner === -1)이거나 매치가 아직 안 끝났으면 카드 선택창 오픈!
        openCards();
      }
      break;
    case 'cardPicked':
      if (G.stateT > 0.95 && !G.cardAdvanced) {
        G.cardAdvanced = true;
        if (Net.active && !Net.isHost) break; // 참가자는 호스트의 다음 신호를 대기
        G.cardQueue.shift();
        if (G.cardQueue.length > 0) {
          openCards();
        } else {
          startRound();
        }
      }
      break;
  }
}

/* ============================ 렌더링 ============================ */
function makeBackground(biomeKey = 'grass') {
  const b = BIOME_DEFS[biomeKey] || BIOME_DEFS.grass;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, b.sky[0]); g.addColorStop(0.35, b.sky[1]); g.addColorStop(0.7, b.sky[2]); g.addColorStop(1, b.sky[3]);
  x.fillStyle = g; x.fillRect(0, 0, W, H);

  if (biomeKey === 'grass') {
    for (let i = 0; i < 200; i++) { x.fillStyle = `rgba(255,255,255,${fxRand(0.2, 0.9)})`; x.fillRect(fxRand(0, W), fxRand(0, H * 0.55), fxRand(1, 2.2), fxRand(1, 2.2)); }
    const mg = x.createRadialGradient(1300, 190, 4, 1300, 190, 70);
    mg.addColorStop(0, '#fff8e1'); mg.addColorStop(0.5, 'rgba(255,248,225,0.9)'); mg.addColorStop(1, 'rgba(255,248,225,0)');
    x.fillStyle = mg; x.beginPath(); x.arc(1300, 190, 70, 0, TAU); x.fill();
  } else if (biomeKey === 'desert') {
    const sg = x.createRadialGradient(320, 210, 10, 320, 210, 150);
    sg.addColorStop(0, '#fffde7'); sg.addColorStop(0.35, 'rgba(255,224,130,0.95)'); sg.addColorStop(1, 'rgba(255,160,0,0)');
    x.fillStyle = sg; x.beginPath(); x.arc(320, 210, 150, 0, TAU); x.fill();
    const pyr = (px, py, pw, ph, col) => {
      x.fillStyle = col; x.beginPath(); x.moveTo(px - pw / 2, py); x.lineTo(px, py - ph); x.lineTo(px + pw / 2, py); x.closePath(); x.fill();
    };
    pyr(460, H * 0.65, 260, 165, 'rgba(92,32,6,0.65)');
    pyr(630, H * 0.66, 180, 115, 'rgba(70,22,4,0.75)');
    pyr(1180, H * 0.65, 220, 140, 'rgba(92,32,6,0.6)');
  } else if (biomeKey === 'tundra') {
    for (let i = 0; i < 180; i++) { x.fillStyle = `rgba(220,245,255,${fxRand(0.3, 0.95)})`; x.fillRect(fxRand(0, W), fxRand(0, H * 0.5), fxRand(1, 2.4), fxRand(1, 2.4)); }
    const ag = x.createLinearGradient(0, 110, 0, 340);
    ag.addColorStop(0, 'rgba(0,255,180,0)'); ag.addColorStop(0.5, 'rgba(100,255,218,0.24)'); ag.addColorStop(1, 'rgba(64,196,255,0)');
    x.fillStyle = ag;
    x.beginPath(); x.moveTo(0, 240);
    for (let i = 0; i <= W; i += 20) x.lineTo(i, 210 + 45 * Math.sin(i / 180) + 25 * Math.cos(i / 75));
    x.lineTo(W, 340); x.lineTo(0, 340); x.closePath(); x.fill();
  } else if (biomeKey === 'swamp') {
    const mg = x.createRadialGradient(1220, 200, 8, 1220, 200, 115);
    mg.addColorStop(0, '#f1f8e9'); mg.addColorStop(0.45, 'rgba(197,225,165,0.85)'); mg.addColorStop(1, 'rgba(139,195,74,0)');
    x.fillStyle = mg; x.beginPath(); x.arc(1220, 200, 115, 0, TAU); x.fill();
    for (let i = 0; i < 65; i++) {
      x.fillStyle = `rgba(178,255,89,${fxRand(0.25, 0.85)})`;
      x.beginPath(); x.arc(fxRand(0, W), fxRand(220, H * 0.72), fxRand(1.5, 3.2), 0, TAU); x.fill();
    }
  }

  const layer = (base, amp, col, sharp = false) => {
    x.fillStyle = col; x.beginPath(); x.moveTo(0, H);
    const ph = fxRand(0, 9);
    for (let i = 0; i <= W; i += 8) {
      const wave = sharp
        ? Math.abs(Math.sin(i / 130 + ph)) * amp * 1.4 + Math.abs(Math.cos(i / 48 + ph)) * amp * 0.5
        : amp * Math.sin(i / 150 + ph) + amp * 0.5 * Math.sin(i / 53 + ph * 2);
      x.lineTo(i, base + (sharp ? -wave : wave));
    }
    x.lineTo(W, H); x.closePath(); x.fill();
  };
  layer(H * 0.62, 46, b.mtn[0], biomeKey === 'tundra');
  layer(H * 0.70, 34, b.mtn[1], biomeKey === 'tundra');
  return c;
}
let BG = null;

function drawTank(p) {
  const s = p.stats.tankScale, tl = tankTilt(p), alive = p.alive, flash = p.hitFlash > 0;
  const base = alive ? p.color : '#3c3c3c';
  const hi = flash ? '#ffffff' : shade(base, 0.4), mid = flash ? '#f2f2f2' : base;
  const lo = flash ? '#cfcfcf' : shade(base, -0.4), dk = flash ? '#bdbdbd' : shade(base, -0.65);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(tl);
  ctx.scale(s, s);
  ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(0, 3, 27, 4, 0, 0, TAU); ctx.fill();

  ctx.save();
  ctx.translate(0, -PIVOT_Y);
  const aw = aimRad(p);
  ctx.rotate(-aw - tl);
  if (Math.cos(aw) < 0) ctx.scale(1, -1);
  const rc = -p.recoil * 8, BL = BARREL_LEN;
  ctx.fillStyle = '#43464e'; ctx.fillRect(2 + rc, -3.6, BL - 2, 7.2);
  ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.fillRect(4 + rc, -2.9, BL - 16, 1.2);
  ctx.fillStyle = '#2b2d34'; rr(BL - 11 + rc, -5.8, 13, 11.6, 2); ctx.fill();
  ctx.fillStyle = '#0c0d11'; ctx.fillRect(BL - 8 + rc, -5.8, 1.7, 11.6); ctx.fillRect(BL - 4.5 + rc, -5.8, 1.7, 11.6);
  ctx.fillStyle = '#585c66'; ctx.fillRect(0, -4.8, 6, 9.6);
  ctx.restore();

  ctx.fillStyle = '#25272e'; rr(-24, -12.5, 48, 14, 6.5); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1.5;
  for (let i = 0; i < 9; i++) {
    const tx = ((((i * 5.4 + p.tread) % 48.6) + 48.6) % 48.6) - 24.3;
    ctx.beginPath(); ctx.moveTo(tx, -12.2); ctx.lineTo(tx, -10.2); ctx.moveTo(tx, 0); ctx.lineTo(tx, 1.6); ctx.stroke();
  }
  for (const wx of [-19.5, -10, 0, 10, 19.5]) {
    const wr = Math.abs(wx) > 15 ? 4.9 : 4;
    ctx.save(); ctx.translate(wx, -5.5); ctx.rotate(p.wheel);
    ctx.fillStyle = '#2a2c33'; ctx.beginPath(); ctx.arc(0, 0, wr, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#7a7e8a'; ctx.lineWidth = 1.1; ctx.stroke();
    ctx.fillStyle = '#c3c6d0'; ctx.beginPath(); ctx.arc(0, 0, 1.1, 0, TAU); ctx.fill();
    ctx.restore();
  }

  ctx.save(); ctx.scale(p.side, 1);
  ctx.fillStyle = mid; ctx.beginPath();
  ctx.moveTo(-21, -9); ctx.lineTo(-17, -19); ctx.lineTo(13, -19); ctx.lineTo(23, -11.5); ctx.lineTo(22, -8.5); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = dk; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(13, -19); ctx.lineTo(22, -9); ctx.moveTo(-17, -19); ctx.lineTo(-17.5, -9); ctx.stroke();
  ctx.fillStyle = lo; rr(-21, -13, 41, 3.4, 1.5); ctx.fill();
  ctx.fillStyle = hi; ctx.fillRect(-17, -18.5, 29, 2);
  ctx.fillStyle = mid; ctx.beginPath();
  ctx.moveTo(-12, -18.5); ctx.quadraticCurveTo(-12, -31, -3, -31); ctx.lineTo(5, -31); ctx.quadraticCurveTo(13, -31, 14, -18.5); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = dk; ctx.lineWidth = 1.2; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.beginPath(); ctx.ellipse(-3.5, -27.2, 6, 2.1, -0.25, 0, TAU); ctx.fill();
  ctx.fillStyle = lo; rr(-8, -33.4, 9, 3.4, 1.6); ctx.fill();
  if (alive) { ctx.strokeStyle = '#c8ccd6'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(-10, -29); ctx.lineTo(-14, -46); ctx.stroke(); }
  ctx.restore();
  ctx.restore();

  // 탱크 머리 위 이름표 (4인전에서 식별 용이)
  if (players.length > 2 && alive) {
    ctx.save();
    ctx.font = `bold 13px ${FONT}`; ctx.textAlign = 'center';
    const teamTag = G.mode === '2v2' ? (p.team === 0 ? '[블루] ' : '[레드] ') : '';
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillText(teamTag + p.name, p.x + 1, p.y - 44 * s + 1);
    ctx.fillStyle = p.color;
    ctx.fillText(teamTag + p.name, p.x, p.y - 44 * s);
    ctx.restore();
  }
}

function drawProtractorHUD(p) {
  const s = p.stats.tankScale, tl = tankTilt(p);
  const cx = p.x + PIVOT_Y * s * Math.sin(tl);
  const cy = p.y - PIVOT_Y * s * Math.cos(tl);
  const R = 74;
  const aw = aimRad(p);

  ctx.save();
  ctx.translate(cx, cy);

  ctx.fillStyle = 'rgba(10, 14, 32, 0.45)';
  ctx.beginPath(); ctx.arc(0, 0, R, Math.PI, 0); ctx.closePath(); ctx.fill();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(0, 0, R, Math.PI, 0); ctx.stroke();
  for (let deg = 0; deg <= 180; deg += 15) {
    const r = deg * Math.PI / 180;
    const major = deg % 45 === 0;
    const r0 = major ? R - 10 : R - 5;
    ctx.strokeStyle = major ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.22)';
    ctx.beginPath();
    ctx.moveTo(Math.cos(r) * r0, -Math.sin(r) * r0);
    ctx.lineTo(Math.cos(r) * R, -Math.sin(r) * R);
    ctx.stroke();
  }

  if (p.lastShotAngle !== null) {
    const ga = p.lastShotAngle * Math.PI / 180;
    const gr = R * (0.3 + 0.7 * (p.lastShotPower / 100));
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.setLineDash([4, 4]); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(ga) * R, -Math.sin(ga) * R); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.beginPath(); ctx.arc(Math.cos(ga) * gr, -Math.sin(ga) * gr, 4, 0, TAU); ctx.fill();
    ctx.restore();
  }

  const baseAng = p.side === 1 ? 0 : -Math.PI;
  const curAng = -aw;
  ctx.fillStyle = p.side === 1 ? 'rgba(79, 195, 247, 0.22)' : 'rgba(255, 138, 101, 0.22)';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, R, Math.min(baseAng, curAng), Math.max(baseAng, curAng));
  ctx.closePath(); ctx.fill();

  const pw = p.charging ? p.charge : p.power;
  const pRad = R * (0.25 + 0.75 * (pw / 100));
  ctx.strokeStyle = p.color; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(aw) * R, -Math.sin(aw) * R); ctx.stroke();

  if (p.charging) {
    ctx.strokeStyle = pw > 75 ? '#ef5350' : (pw > 40 ? '#ffee58' : '#66bb6a');
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(0, 0, pRad, Math.PI, 0); ctx.stroke();
  }

  ctx.fillStyle = 'rgba(5, 8, 22, 0.82)';
  rr(-44, -R - 30, 88, 22, 6); ctx.fill();
  ctx.strokeStyle = p.color; ctx.lineWidth = 1.5;
  rr(-44, -R - 30, 88, 22, 6); ctx.stroke();
  ctx.font = `bold 12px ${FONT}`; ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
  ctx.fillText(`${Math.round(p.angle)}° · ${Math.round(pw)}%`, 0, -R - 15);

  ctx.restore();

  const fr = clamp(p.fuel / p.stats.maxFuel, 0, 1);
  ctx.fillStyle = 'rgba(0,0,0,0.65)'; rr(p.x - 26, p.y + 9, 52, 7, 3.5); ctx.fill();
  ctx.fillStyle = fr > 0.25 ? '#ffd54f' : '#ff7043';
  if (fr > 0.01) { rr(p.x - 26, p.y + 9, 52 * fr, 7, 3.5); ctx.fill(); }
  ctx.font = `10px ${FONT}`; ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.fillText('FUEL', p.x, p.y + 26);

  if (isMyTurnControl(p)) {
    const pts = computeGuide(p);
    pts.forEach((q, i) => {
      ctx.globalAlpha = 1 - i / (pts.length + 4) * 0.7;
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(q.x, q.y, 2.7, 0, TAU); ctx.fill();
    });
    ctx.globalAlpha = 1;
  }
}

function drawSkyGimmicks() {
  for (let i = 0; i < G.portals.length; i++) {
    const pt = G.portals[i];
    ctx.save();
    ctx.translate(pt.x, pt.y);
    ctx.rotate(G.time * (i === 0 ? 3 : -3));
    ctx.strokeStyle = pt.color; ctx.lineWidth = 4;
    ctx.setLineDash([12, 8]);
    ctx.beginPath(); ctx.arc(0, 0, pt.r, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = i === 0 ? 'rgba(0, 229, 255, 0.18)' : 'rgba(255, 64, 129, 0.18)';
    ctx.beginPath(); ctx.arc(0, 0, pt.r - 4, 0, TAU); ctx.fill();
    ctx.restore();
  }
  for (const cr of G.crates) {
    const by = cr.y + Math.sin(G.time * 3 + cr.bob) * 6;
    const col = cr.type === 'power' ? '#ffd54f' : cr.type === 'mega' ? '#ff7043' : '#69f0ae';
    const icon = cr.type === 'power' ? '⚡' : cr.type === 'mega' ? '💣' : '💥';
    ctx.save();
    ctx.translate(cr.x, by);
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-16, -24); ctx.lineTo(-10, -10); ctx.moveTo(16, -24); ctx.lineTo(10, -10); ctx.stroke();
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(0, -24, 18, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#263238'; rr(-14, -12, 28, 24, 5); ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 2; rr(-14, -12, 28, 24, 5); ctx.stroke();
    ctx.font = `bold 15px ${FONT}`; ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
    ctx.fillText(icon, 0, 5);
    ctx.restore();
  }
}

function drawMinesAndPoisons() {
  for (const pz of G.poisons) {
    ctx.save();
    ctx.fillStyle = 'rgba(118, 255, 3, 0.22)';
    ctx.beginPath(); ctx.arc(pz.x, pz.y, pz.r, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(118, 255, 3, 0.55)'; ctx.lineWidth = 2; ctx.setLineDash([6, 6]);
    ctx.beginPath(); ctx.arc(pz.x, pz.y, pz.r, 0, TAU); ctx.stroke();
    ctx.restore();
  }
  for (const m of G.mines) {
    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.fillStyle = '#37474f';
    ctx.beginPath(); ctx.arc(0, 0, 8, Math.PI, 0); ctx.fill();
    ctx.fillStyle = Math.sin(G.time * 10) > 0 ? '#ff1744' : '#ff8a80';
    ctx.beginPath(); ctx.arc(0, -5, 3, 0, TAU); ctx.fill();
    ctx.restore();
  }
}

function drawField(f) {
  if (f.type === 'duck') {
    if (f.t < 0) return;
    ctx.save();
    ctx.translate(f.x, f.y - Math.abs(Math.sin(f.t * 16)) * 4);
    ctx.scale(-f.dir, 1);
    ctx.font = `24px ${FONT}`; ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
    ctx.fillText('🦆', 0, 6);
    ctx.restore();
    return;
  }
  if (f.type === 'ufo') {
    ctx.save();
    ctx.translate(f.x, f.y);
    const g = ctx.createLinearGradient(0, 0, 0, 260);
    g.addColorStop(0, 'rgba(234, 128, 252, 0.5)');
    g.addColorStop(1, 'rgba(234, 128, 252, 0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(-25, 10); ctx.lineTo(25, 10); ctx.lineTo(120, 260); ctx.lineTo(-120, 260); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#b0bec5';
    ctx.beginPath(); ctx.ellipse(0, 0, 44, 14, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ea80fc';
    ctx.beginPath(); ctx.arc(0, -6, 20, Math.PI, 0); ctx.fill();
    ctx.restore();
    return;
  }

  const k = Math.min(1, f.t / 0.3) * Math.min(1, (f.life - f.t) / 0.35), R = 64 * k;
  ctx.save();
  ctx.strokeStyle = 'rgba(190,150,255,0.25)'; ctx.lineWidth = 2; ctx.setLineDash([8, 10]);
  ctx.beginPath(); ctx.arc(f.x, f.y, f.R * k, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
  for (let i = 0; i < 3; i++) {
    ctx.strokeStyle = i === 1 ? 'rgba(128,222,234,0.75)' : 'rgba(200,160,255,0.75)'; ctx.lineWidth = 3 - i * 0.6;
    const a0 = f.rot * (i % 2 ? -1 : 1) * (1 + i * 0.3) + i * 2;
    ctx.beginPath(); ctx.arc(f.x, f.y, R * (1.15 + i * 0.28), a0, a0 + 2.2); ctx.stroke();
  }
  ctx.fillStyle = '#05010c'; ctx.beginPath(); ctx.arc(f.x, f.y, R * 0.7, 0, TAU); ctx.fill();
  ctx.restore();
}

function drawShell(s) {
  ctx.save();
  if (s.sawing) {
    ctx.translate(s.x, s.y);
    ctx.rotate(G.time * 25);
    ctx.fillStyle = '#eceff1';
    ctx.beginPath(); ctx.arc(0, 0, 11, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#ff5252'; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
    return;
  }
  ctx.fillStyle = s.isLava ? '#ff3d00' : (s.child ? '#ffd180' : '#ffffff');
  ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.fill();
  ctx.strokeStyle = s.owner.color; ctx.lineWidth = 2; ctx.stroke();
  if (s.icon) {
    ctx.translate(s.x, s.y); ctx.rotate(s.age * 8);
    ctx.font = `24px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff';
    ctx.fillText(s.icon, 0, 0);
    ctx.restore();
    return;
  }
  if (s.drilling) {
    ctx.translate(s.x, s.y); ctx.rotate(Math.atan2(s.dy, s.dx));
    ctx.fillStyle = '#cfd8dc'; ctx.beginPath(); ctx.moveTo(s.r + 9, 0); ctx.lineTo(-2, -s.r - 2); ctx.lineTo(-2, s.r + 2); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

function drawWorld() {
  ctx.drawImage(BG, 0, 0);
  if (G.biome === 'tundra') {
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    for (let i = 0; i < 45; i++) {
      const sx = ((i * 197 + G.time * (35 + G.wind * 12)) % (W + 40) + (W + 40)) % (W + 40) - 20;
      const sy = (i * 131 + G.time * (48 + (i % 5) * 9)) % (H - 80);
      ctx.beginPath(); ctx.arc(sx, sy, 2 + (i % 3), 0, TAU); ctx.fill();
    }
  } else if (G.biome === 'desert') {
    ctx.fillStyle = 'rgba(255,213,128,0.12)';
    ctx.fillRect(0, 115, W, H - 115);
  } else if (G.biome === 'swamp') {
    ctx.fillStyle = 'rgba(118,255,3,0.08)';
    ctx.fillRect(0, H * 0.55, W, H * 0.45);
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.13)'; ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (const s of G.streaks) { ctx.moveTo(s.x, s.y); ctx.lineTo(s.x + Math.sign(G.wind || 1) * s.l, s.y); }
  ctx.stroke();

  drawSkyGimmicks();
  ctx.drawImage(Terrain.cv, 0, 0);
  drawMinesAndPoisons();
  for (const p of players) drawTank(p);
  for (const f of G.fields) drawField(f);
  for (const ev of G.events) if (ev.draw) ev.draw(ctx);
  if (G.state === 'aiming') { const p = players[G.turn]; if (p && p.alive) drawProtractorHUD(p); }
  for (const s of G.shells) drawShell(s);

  for (const l of G.lightnings) {
    ctx.save();
    ctx.globalAlpha = 1 - (l.t / l.life);
    ctx.strokeStyle = '#00e5ff'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(l.x0, l.y0);
    for (let k = 1; k <= 5; k++) {
      ctx.lineTo(lerp(l.x0, l.x1, k / 6) + fxRand(-22, 22), lerp(l.y0, l.y1, k / 6) + fxRand(-22, 22));
    }
    ctx.lineTo(l.x1, l.y1); ctx.stroke();
    ctx.restore();
  }

  ctx.globalCompositeOperation = 'lighter';
  for (const f of G.flashes) {
    const k = f.t / f.life, rad = f.r * (0.45 + 0.55 * k);
    ctx.fillStyle = `rgba(255,230,170,${0.6 * (1 - k)})`;
    ctx.beginPath(); ctx.arc(f.x, f.y, rad, 0, TAU); ctx.fill();
  }
  for (const r of G.rings) {
    const k = r.t / r.life;
    ctx.strokeStyle = `rgba(${r.color || '255,200,120'},${0.7 * (1 - k)})`; ctx.lineWidth = 5 * (1 - k) + 1;
    ctx.beginPath(); ctx.arc(r.x, r.y, r.max * (0.2 + 0.8 * k), 0, TAU); ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';

  for (const p of G.particles) {
    const k = clamp(p.life / p.max, 0, 1);
    if (p.kind === 'spark') {
      ctx.globalAlpha = k; ctx.strokeStyle = p.color; ctx.lineWidth = p.size;
      ctx.beginPath(); ctx.moveTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04); ctx.lineTo(p.x, p.y); ctx.stroke();
    } else if (p.kind === 'smoke' || p.kind === 'dust') {
      ctx.globalAlpha = k * 0.45; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill();
    } else if (p.kind === 'debris') {
      ctx.globalAlpha = Math.min(1, k * 2); ctx.fillStyle = p.color; ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    } else {
      ctx.globalAlpha = k; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.4 + 0.6 * k), 0, TAU); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center'; ctx.font = `bold 24px ${FONT}`;
  for (const f of G.floaters) {
    ctx.globalAlpha = 1 - (f.t / f.life) ** 2; ctx.fillStyle = '#000'; ctx.fillText(f.text, f.x + 1, f.y + 1);
    ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
}

function countCards(p) {
  const m = {};
  for (const id of p.cards) m[id] = (m[id] || 0) + 1;
  return m;
}

function drawHUD() {
  ctx.fillStyle = 'rgba(5,6,20,0.68)'; ctx.fillRect(0, 0, W, 118);

  if (players.length === 2) {
    // 2인용(1:1) 기존 와이드 HUD
    players.forEach((p, i) => {
      const pw = 640, x0 = i === 0 ? 30 : W - 30 - pw;
      const active = (G.state === 'aiming' || G.state === 'resolving') && G.turn === i;
      const tag = Net.active ? (i === Net.myId ? ' (나)' : ' (상대)') : '';
      ctx.textAlign = 'left'; ctx.font = `bold 20px ${FONT}`;
      ctx.fillStyle = p.color; ctx.fillText(p.name + tag + (active ? '  ▶' : ''), x0, 28);
      for (let k = 0; k < WINS_TO_MATCH; k++) { ctx.fillStyle = k < p.score ? '#ffd54f' : 'rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.arc(x0 + 115 + k * 18, 21, 5.5, 0, TAU); ctx.fill(); }
      const hp = Math.max(0, p.hp), frac = clamp(hp / p.roundMaxHp, 0, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; rr(x0, 38, pw, 20, 10); ctx.fill();
      const col = frac > 0.5 ? '#66bb6a' : frac > 0.25 ? '#ffca28' : '#ef5350';
      if (frac > 0) { ctx.fillStyle = col; rr(i === 0 ? x0 : x0 + pw * (1 - frac), 38, Math.max(16, pw * frac), 20, 10); ctx.fill(); }
      ctx.textAlign = 'center'; ctx.font = `bold 13px ${FONT}`; ctx.fillStyle = '#fff';
      ctx.fillText(`${Math.ceil(hp)} / ${p.roundMaxHp}`, x0 + pw / 2, 53);
      const ff = clamp(p.fuel / p.stats.maxFuel, 0, 1);
      ctx.textAlign = 'left'; ctx.font = `12px ${FONT}`; ctx.fillStyle = '#bbb'; ctx.fillText('이동 연료', x0, 76);
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; rr(x0 + 70, 67, 220, 9, 4.5); ctx.fill();
      ctx.fillStyle = '#ffd54f'; if (ff > 0.005) { rr(x0 + 70, 67, 220 * ff, 9, 4.5); ctx.fill(); }

      let statusTxt = '';
      if (p.stats.synergies.length) statusTxt += p.stats.synergies.map(s => `${s.icon}${s.name}`).join(' ') + '  ';
      if (p.phoenixCharges > 0) statusTxt += `🔥부활×${p.phoenixCharges}  `;
      if (p.dmgBoost > 1) statusTxt += `⚡+40%  `;
      if (statusTxt) {
        ctx.fillStyle = '#80deea'; ctx.font = `bold 12px ${FONT}`;
        ctx.fillText(statusTxt, x0 + 305, 76);
      }

      const counts = countCards(p);
      let cx = x0, cy = 84;
      ctx.font = `13px ${FONT}`;
      for (const id of CARD_POOL) {
        if (!counts[id]) continue;
        const d = CARD_DEFS[id], label = `${d.icon} ${d.short}${counts[id] > 1 ? ' ×' + counts[id] : ''}`;
        const w = ctx.measureText(label).width + 16;
        if (cx + w > x0 + pw) { cx = x0; cy += 24; }
        ctx.fillStyle = 'rgba(0,0,0,0.55)'; rr(cx, cy, w, 21, 10.5); ctx.fill();
        ctx.strokeStyle = d.color; ctx.lineWidth = 1.5; rr(cx, cy, w, 21, 10.5); ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.fillText(label, cx + 8, cy + 15);
        cx += w + 6;
      }
      if (!p.cards.length) { ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.textAlign = 'left'; ctx.fillText('카드 없음', x0, 99); }
    });
  } else {
    // 4인용(2:2 팀전 / 4인 난투) 4분할 컴팩트 HUD
    const slotXs = [20, 345, 935, 1260];
    const pw = 315;
    players.forEach((p, i) => {
      const x0 = slotXs[i];
      const active = (G.state === 'aiming' || G.state === 'resolving') && G.turn === i;
      ctx.textAlign = 'left'; ctx.font = `bold 16px ${FONT}`;
      const teamBadge = G.mode === '2v2' ? (p.team === 0 ? '[블루] ' : '[레드] ') : '';
      ctx.fillStyle = p.color;
      ctx.fillText(`${teamBadge}${p.name}${Net.active && i === Net.myId ? ' (나)' : ''}${active ? ' ▶' : ''}`, x0, 24);

      if (G.mode === 'ffa4') {
        for (let k = 0; k < WINS_TO_MATCH; k++) {
          ctx.fillStyle = k < p.score ? '#ffd54f' : 'rgba(255,255,255,0.22)';
          ctx.beginPath(); ctx.arc(x0 + 82 + k * 14, 18, 4.5, 0, TAU); ctx.fill();
        }
      }

      const hp = Math.max(0, p.hp), frac = clamp(hp / p.roundMaxHp, 0, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.65)'; rr(x0, 32, pw, 16, 8); ctx.fill();
      const col = !p.alive ? '#555' : (frac > 0.5 ? '#66bb6a' : frac > 0.25 ? '#ffca28' : '#ef5350');
      if (frac > 0) { ctx.fillStyle = col; rr(x0, 32, Math.max(12, pw * frac), 16, 8); ctx.fill(); }
      ctx.textAlign = 'center'; ctx.font = `bold 11px ${FONT}`; ctx.fillStyle = '#fff';
      ctx.fillText(p.alive ? `${Math.ceil(hp)} / ${p.roundMaxHp}` : '파괴됨', x0 + pw / 2, 44);

      // 카드 아이콘 요약
      const counts = countCards(p);
      let cx = x0;
      ctx.font = `12px ${FONT}`;
      for (const id of CARD_POOL) {
        if (!counts[id]) continue;
        const d = CARD_DEFS[id];
        const label = `${d.icon}${counts[id] > 1 ? counts[id] : ''}`;
        const w = ctx.measureText(label).width + 10;
        if (cx + w > x0 + pw) break;
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; rr(cx, 54, w, 20, 8); ctx.fill();
        ctx.strokeStyle = d.color; ctx.lineWidth = 1.2; rr(cx, 54, w, 20, 8); ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.fillText(label, cx + 5, 68);
        cx += w + 4;
      }
      if (p.stats.synergies.length) {
        ctx.textAlign = 'left'; ctx.font = `bold 11px ${FONT}`; ctx.fillStyle = '#ffd54f';
        ctx.fillText('✨' + p.stats.synergies.map(s => s.name).join('·'), x0, 92);
      }
    });
  }

  const cx = W / 2;
  const bInfo = BIOME_DEFS[G.biome] || BIOME_DEFS.grass;
  const isSD = G.turnCount > SUDDEN_DEATH_TURN;
  ctx.textAlign = 'center'; ctx.font = `bold 13px ${FONT}`; ctx.fillStyle = isSD ? '#ff5252' : '#aab';
  ctx.fillText(`R${G.round} (${G.turnCount}턴${isSD ? ' · 🔥서든데스' : ''}) · ${bInfo.icon}${bInfo.name}`, cx, 20);

  if (G.mode === '2v2') {
    ctx.font = `bold 14px ${FONT}`; ctx.fillStyle = '#fff';
    ctx.fillText(`블루 ${G.teamScores[0]} : ${G.teamScores[1]} 레드`, cx, 38);
  } else {
    ctx.font = `11px ${FONT}`; ctx.fillStyle = '#889';
    ctx.fillText('WIND', cx, 38);
  }

  const barW = players.length === 2 ? 140 : 105;
  const len = Math.min(Math.abs(G.wind) / MAX_WIND, 1) * barW, dir = Math.sign(G.wind);
  ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(cx - barW - 8, 56); ctx.lineTo(cx + barW + 8, 56); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, 50); ctx.lineTo(cx, 62); ctx.stroke();
  if (len > 1) {
    ctx.strokeStyle = ctx.fillStyle = '#80deea'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(cx, 56); ctx.lineTo(cx + dir * len, 56); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + dir * (len + 9), 56); ctx.lineTo(cx + dir * len, 49); ctx.lineTo(cx + dir * len, 63); ctx.closePath(); ctx.fill();
  }
  ctx.font = `bold 15px ${FONT}`; ctx.fillStyle = '#e0f7fa';
  ctx.fillText(G.wind === 0 ? '무풍' : `${dir < 0 ? '◀' : ''} ${Math.abs(G.wind).toFixed(1)} ${dir > 0 ? '▶' : ''}`, cx, 84);
  if (G.state === 'aiming' || G.state === 'resolving') {
    const p = players[G.turn];
    if (p) {
      ctx.font = `bold 15px ${FONT}`; ctx.fillStyle = p.color; ctx.fillText(`${p.name} 차례`, cx, 108);
    }
  }
  ctx.font = `13px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.textAlign = 'left';
  if (players.length === 2) {
    ctx.fillText(Net.active ? 'A/D 또는 ←/→ 이동 · W/S 또는 ↑/↓ 각도 · Space/Enter 꾹→떼면 발사' : 'P1  A/D 이동 · W/S 포신 회전 · Space 꾹→떼면 발사', 24, H - 12);
    ctx.textAlign = 'right';
    ctx.fillText(Net.active ? `방 코드: ${Net.roomCode || '참가자'}` : 'P2  ←/→ 이동 · ↑/↓ 포신 회전 · Enter 꾹→떼면 발사', W - 24, H - 12);
  } else if (Net.active) {
    ctx.fillText(`A/D 또는 ←/→ 이동 · W/S 또는 ↑/↓ 각도 · Space/Enter 꾹→떼면 발사 · 방 코드: ${Net.roomCode}`, 24, H - 12);
  } else {
    ctx.fillText('P1: WASD+Space  |  P2: 방향키+Enter  |  P3: IJKL+U  |  P4: 넘패드(4,8,5,6)+0', 24, H - 12);
  }
}

function drawBanner() {
  const b = G.banner; if (!b) return;
  const a = Math.min(1, b.t / 0.15, (b.dur - b.t) / 0.4);
  const sc = 1 + 0.25 * Math.max(0, 1 - b.t / 0.25);
  ctx.save(); ctx.globalAlpha = clamp(a, 0, 1);
  ctx.translate(W / 2, 280); ctx.scale(sc, sc);
  ctx.textAlign = 'center'; ctx.font = `900 72px ${FONT}`;
  ctx.lineWidth = 9; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.strokeText(b.text, 0, 0);
  ctx.fillStyle = b.color; ctx.fillText(b.text, 0, 0);
  ctx.font = `bold 28px ${FONT}`; ctx.fillStyle = '#fff'; ctx.strokeText(b.sub, 0, 44); ctx.fillText(b.sub, 0, 44);
  ctx.restore();
}

/* 카드 선택창: 무거운 그라데이션·글로우는 오프스크린에 한 번만 그리고 매 프레임 복사 */
const CARD_W = 360, CARD_H = 520, CARD_GAP = 50, CARD_PAD = 40, CARD_Y = 175;
const cardX = i => W / 2 - (CARD_W * 3 + CARD_GAP * 2) / 2 + i * (CARD_W + CARD_GAP);
const faceCache = new Map(), glowCache = new Map();

function makeLayer(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}
function roundPath(x, px, py, w, h, r) {
  x.beginPath(); x.roundRect(px, py, w, h, r);
}
function getCardGlow(color) {
  let c = glowCache.get(color);
  if (c) return c;
  const [cv, x] = makeLayer(CARD_W + CARD_PAD * 2, CARD_H + CARD_PAD * 2);
  x.shadowColor = color; x.shadowBlur = 36; x.fillStyle = color;
  roundPath(x, CARD_PAD, CARD_PAD, CARD_W, CARD_H, 24); x.fill(); x.fill();
  glowCache.set(color, cv);
  return cv;
}
function getCardFace(id, have) {
  const key = id + ':' + have;
  let c = faceCache.get(key);
  if (c) return c;
  const d = CARD_DEFS[id];
  const [cv, x] = makeLayer(CARD_W, CARD_H);
  const mid = CARD_W / 2;
  const bg = x.createLinearGradient(0, 0, 0, CARD_H);
  bg.addColorStop(0, '#282c5c'); bg.addColorStop(0.5, '#171937'); bg.addColorStop(1, '#0b0c1e');
  x.fillStyle = bg; roundPath(x, 0, 0, CARD_W, CARD_H, 24); x.fill();

  // 아트 영역: 방사형 광원 + 햇살 무늬
  x.save();
  roundPath(x, 14, 14, CARD_W - 28, 214, 16); x.clip();
  x.fillStyle = shade(d.color, -0.72); x.fillRect(0, 0, CARD_W, 240);
  x.translate(mid, 125);
  x.fillStyle = d.color; x.globalAlpha = 0.13;
  for (let k = 0; k < 16; k++) {
    x.beginPath(); x.moveTo(0, 0);
    x.arc(0, 0, 300, k * TAU / 16, k * TAU / 16 + TAU / 34); x.closePath(); x.fill();
  }
  x.globalAlpha = 1;
  const halo = x.createRadialGradient(0, 0, 5, 0, 0, 135);
  halo.addColorStop(0, d.color); halo.addColorStop(1, 'rgba(0,0,0,0)');
  x.globalAlpha = 0.7; x.fillStyle = halo; x.fillRect(-180, -140, 360, 280);
  x.restore();

  x.textAlign = 'center';
  // 테두리 (이중)
  x.strokeStyle = d.color; x.lineWidth = 4; roundPath(x, 2, 2, CARD_W - 4, CARD_H - 4, 22); x.stroke();
  x.strokeStyle = 'rgba(255,255,255,0.18)'; x.lineWidth = 1.5; roundPath(x, 10, 10, CARD_W - 20, CARD_H - 20, 17); x.stroke();
  // 분류 배지
  const tag = d.cat + (d.curse ? '  ⚠ 하이리스크' : '');
  x.font = `bold 14px ${FONT}`;
  const tw = x.measureText(tag).width + 26;
  x.fillStyle = 'rgba(5,6,20,0.75)'; roundPath(x, 24, 26, tw, 28, 14); x.fill();
  x.fillStyle = d.color; x.fillText(tag, 24 + tw / 2, 45);
  // 아이콘
  x.font = `108px ${FONT}`; x.fillStyle = '#fff'; x.fillText(d.icon, mid, 170);
  // 이름 리본
  x.fillStyle = d.color;
  x.beginPath(); x.moveTo(8, 238); x.lineTo(CARD_W - 8, 238); x.lineTo(CARD_W - 28, 266); x.lineTo(CARD_W - 8, 294); x.lineTo(8, 294); x.lineTo(28, 266); x.closePath(); x.fill();
  x.font = `900 30px ${FONT}`; x.lineWidth = 6; x.strokeStyle = 'rgba(0,0,0,0.65)'; x.lineJoin = 'round';
  x.strokeText(d.name, mid, 277); x.fillStyle = '#fff'; x.fillText(d.name, mid, 277);
  // 설명 (폭이 넘치면 자동 축소)
  d.desc.forEach((line, k) => {
    x.fillStyle = 'rgba(255,255,255,0.06)'; roundPath(x, 24, 316 + k * 48, CARD_W - 48, 40, 10); x.fill();
    x.font = `${k ? 'bold ' : ''}17px ${FONT}`; x.fillStyle = k ? '#ffd54f' : '#e3e6ff';
    x.fillText(line, mid, 342 + k * 48, CARD_W - 62);
  });
  x.font = `bold 16px ${FONT}`; x.fillStyle = have ? '#69f0ae' : '#9aa0c8';
  x.fillText(have ? `⚡ Lv.${have} → Lv.${have + 1} 진화!` : '✨ 신규 획득', mid, CARD_H - 76);
  faceCache.set(key, cv);
  return cv;
}

// 이 카드를 고르면 새로 각성하는 시너지
function newSynergyFor(p, id) {
  if (p.cards.includes(id)) return null;
  return SYNERGY_DEFS.find(s => s.req.includes(id) && s.req.every(r => r === id || p.cards.includes(r))) || null;
}

function drawCards() {
  ctx.fillStyle = 'rgba(4,5,16,0.86)'; ctx.fillRect(0, 0, W, H);
  const picking = G.state === 'cardPicked';
  const loser = players[G.cardLoser];
  const isMyPick = !Net.active || G.cardLoser === Net.myId;
  const remainCnt = G.cardQueue.length;

  // 떠오르는 불티 (배열 생성 없이 시간으로 위치 계산)
  ctx.fillStyle = loser.color;
  for (let i = 0; i < 36; i++) {
    const y = H - ((G.time * (28 + (i % 7) * 11) + i * 173) % H);
    ctx.globalAlpha = 0.15 + (i % 4) * 0.1;
    ctx.fillRect((i * 271) % W + Math.sin(G.time + i) * 22, y, 3 + (i % 3), 3 + (i % 3));
  }
  ctx.globalAlpha = 1;

  ctx.textAlign = 'center';
  ctx.font = `900 46px ${FONT}`; ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(0,0,0,0.75)';
  const head = isMyPick ? `${loser.name} 카드를 고르세요!${remainCnt > 1 ? ` (대기 ${remainCnt}명)` : ''}` : `${loser.name}님이 카드를 고르는 중...`;
  ctx.strokeText(head, W / 2, 98); ctx.fillStyle = loser.color; ctx.fillText(head, W / 2, 98);
  ctx.font = `18px ${FONT}`; ctx.fillStyle = '#c8ccec';
  ctx.fillText('특정 카드 2종을 조합하면 강력한 [시너지]가 각성합니다! · 중첩할수록 효과 진화', W / 2, 138);

  const counts = countCards(loser);
  for (let i = 0; i < 3; i++) {
    const id = G.choices[i], d = CARD_DEFS[id];
    const sel = i === G.sel;
    // 등장 애니메이션: 순서대로 아래에서 올라오며 뒤집힘
    const k = picking ? 1 : clamp((G.stateT - i * 0.09) / 0.38, 0, 1);
    const ease = 1 - (1 - k) ** 3;
    let sc = sel ? 1.06 : 0.97, alpha = ease, lift = sel ? -10 + Math.sin(G.time * 3) * 4 : 0;
    if (picking) {
      if (i === G.picked) sc = 1.06 + 0.16 * Math.min(1, G.stateT / 0.35);
      else { alpha = Math.max(0, 1 - G.stateT * 3); lift = G.stateT * 160; }
    }
    if (alpha <= 0) continue;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cardX(i) + CARD_W / 2, CARD_Y + CARD_H / 2 + lift + (1 - ease) * 220);
    ctx.scale(sc * Math.max(0.05, ease), sc);
    const L = -CARD_W / 2, T = -CARD_H / 2;
    if (sel) {
      ctx.globalAlpha = alpha * (0.65 + 0.25 * Math.sin(G.time * 5));
      ctx.drawImage(getCardGlow(d.color), L - CARD_PAD, T - CARD_PAD);
      ctx.globalAlpha = alpha;
    }
    ctx.drawImage(getCardFace(id, counts[id] || 0), L, T);
    if (sel) {
      // 선택 카드 위를 지나가는 광택
      const sx = L - 160 + ((G.time * 0.7) % 1.6) * (CARD_W + 260);
      ctx.save();
      roundPath(ctx, L, T, CARD_W, CARD_H, 24); ctx.clip();
      ctx.globalAlpha = alpha * 0.09; ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.moveTo(sx, T); ctx.lineTo(sx + 60, T); ctx.lineTo(sx - 50, -T); ctx.lineTo(sx - 110, -T); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    const syn = newSynergyFor(loser, id);
    if (syn && !picking) {
      ctx.fillStyle = syn.color; roundPath(ctx, -135, T + 421, 270, 34, 17); ctx.fill();
      ctx.font = `900 16px ${FONT}`; ctx.fillStyle = '#0b0c1e';
      ctx.fillText(`${syn.icon} ${syn.name} 각성 가능!`, 0, T + 444);
    }
    ctx.fillStyle = sel ? d.color : '#2c2f55'; ctx.beginPath(); ctx.arc(0, -T - 34, 19, 0, TAU); ctx.fill();
    ctx.font = `bold 20px ${FONT}`; ctx.fillStyle = sel ? '#111' : '#c8ccec'; ctx.fillText(String(i + 1), 0, -T - 27);
    ctx.restore();
  }
  ctx.globalAlpha = 1; ctx.textAlign = 'center'; ctx.font = `17px ${FONT}`; ctx.fillStyle = '#9aa0c8';
  if (G.state === 'cards' && isMyPick) ctx.fillText('카드 클릭  /  1 · 2 · 3 키  /  ← → (A/D, J/L) 이동 후 Space 또는 Enter', W / 2, 758);
}

function drawTitle() {
  ctx.fillStyle = 'rgba(4,5,16,0.82)'; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.font = `900 80px ${FONT}`; ctx.lineWidth = 9; ctx.strokeStyle = '#000';
  ctx.strokeText('탱크 라운즈 v5', W / 2, 205); ctx.fillStyle = '#ffd54f'; ctx.fillText('탱크 라운즈 v5', W / 2, 205);
  ctx.font = `22px ${FONT}`; ctx.fillStyle = '#c8cbe8';
  ctx.fillText('1:1 · 2:2 팀전 · 온라인 4인 난투! · 39종 카드 & 12종 시너지 각성 · 10턴 서든데스!', W / 2, 255);

  TITLE_BTNS.forEach((b, idx) => {
    const isHov = hoverTitleBtn === idx;
    ctx.save();
    if (isHov) {
      ctx.translate(b.x + b.w / 2, b.y + b.h / 2);
      ctx.scale(1.03, 1.03);
      ctx.translate(-(b.x + b.w / 2), -(b.y + b.h / 2));
    }
    ctx.fillStyle = isHov ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.08)';
    rr(b.x, b.y, b.w, b.h, 20); ctx.fill();
    ctx.strokeStyle = b.color; ctx.lineWidth = isHov ? 5 : 3;
    rr(b.x, b.y, b.w, b.h, 20); ctx.stroke();
    ctx.fillStyle = b.color; ctx.font = `900 26px ${FONT}`; ctx.fillText(b.title, b.x + b.w / 2, b.y + 52);
    ctx.fillStyle = '#e6e8ff'; ctx.font = `17px ${FONT}`;
    b.lines.forEach((l, i) => ctx.fillText(l, b.x + b.w / 2, b.y + 104 + i * 35));
    ctx.restore();
  });

  ctx.font = `16px ${FONT}`; ctx.fillStyle = '#9aa0c8';
  ctx.fillText(`원하는 모드를 마우스로 클릭하세요 (단축키 1~3) · ${WINS_TO_MATCH}승 선취 시 최종 우승`, W / 2, 645);
}

function drawMatchOver() {
  ctx.fillStyle = 'rgba(4,5,16,0.8)'; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  if (G.mode === '2v2') {
    const teamName = G.winner === 0 ? '블루팀 (P1·P3)' : '레드팀 (P2·P4)';
    const col = G.winner === 0 ? '#4fc3f7' : '#ff8a65';
    ctx.font = `900 76px ${FONT}`; ctx.lineWidth = 9; ctx.strokeStyle = '#000';
    ctx.strokeText(`${teamName} 최종 우승!`, W / 2, 360); ctx.fillStyle = col; ctx.fillText(`${teamName} 최종 우승!`, W / 2, 360);
    ctx.font = `bold 38px ${FONT}`; ctx.fillStyle = '#fff'; ctx.fillText(`블루 ${G.teamScores[0]} : ${G.teamScores[1]} 레드`, W / 2, 425);
  } else {
    const w = players[G.winner];
    ctx.font = `900 80px ${FONT}`; ctx.lineWidth = 9; ctx.strokeStyle = '#000';
    ctx.strokeText(`${w.name} 최종 우승!`, W / 2, 360); ctx.fillStyle = w.color; ctx.fillText(`${w.name} 최종 우승!`, W / 2, 360);
    const scTxt = players.length === 2 ? `${players[0].score} : ${players[1].score}` : players.map(p => `${p.name} ${p.score}승`).join('  |  ');
    ctx.font = `bold 34px ${FONT}`; ctx.fillStyle = '#fff'; ctx.fillText(scTxt, W / 2, 425);
  }
  if (G.stateT > 1) {
    ctx.globalAlpha = 0.55 + 0.45 * Math.sin(G.time * 4); ctx.font = `24px ${FONT}`;
    ctx.fillText((!Net.active || Net.isHost) ? 'Space 또는 Enter 로 새 게임' : '호스트가 새 게임을 시작하기를 기다리는 중...', W / 2, 510);
    ctx.globalAlpha = 1;
  }
}

function draw() {
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  if (G.shake > 0) ctx.translate(fxRand(-1, 1) * G.shake, fxRand(-1, 1) * G.shake);
  drawWorld();
  ctx.restore();
  if (G.screenFlash > 0.01) { ctx.fillStyle = `rgba(255,250,235,${G.screenFlash})`; ctx.fillRect(0, 0, W, H); }
  drawHUD();
  drawBanner();
  if (G.state === 'cards' || G.state === 'cardPicked') drawCards();
  else if (G.state === 'title') drawTitle();
  else if (G.state === 'matchOver') drawMatchOver();
}

/* ============================ 메인 루프 ============================ */
Terrain.init();
BG = makeBackground();
setupField();
let last = performance.now();
function frame(now) {
  const raw = Math.min(0.05, (now - last) / 1000); last = now;
  G.time += raw;
  update(raw);
  draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
canvas.focus();
