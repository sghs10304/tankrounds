'use strict';

/* ============================ 1. 카드 스탯 및 훅 시스템 ============================ */
function newStats() {
  return {
    maxHp: 150,
    damage: 32,
    blastRadius: 46,
    shellSpeed: 1,
    shellSize: 1,
    shots: 1,
    shotDelay: 0.13,
    bounces: 0,
    maxFuel: 130,
    tankScale: 1,
    guideTime: 0.65,
    // 특수 난장판 스탯
    cluster: 0, airstrike: 0, homing: 0, poison: 0, drill: 0, terraform: 0, blackhole: 0,
    leech: 0, phoenix: 0, grow: 0, repel: 0, emp: 0, sawblade: 0,
    volcano: 0, nuke: 0, meteor: 0, mine: 0, lightning: 0,
    buckshot: 0, ufo: 0, chainbomb: 0, twister: 0, jackpot: 0,
    wormhole: 0, magnet: 0, mirror: 0, frost: 0, chaos: 0,
    // 시너지 플래그
    synergies: [],
    synStorm: false, synApocalypse: false, synSupernova: false, synRailgun: false,
    synVampire: false, synGatling: false, synTimeFreeze: false, synVoid: false,
    synFortress: false, synRam: false, synNitro: false, synTyphoon: false,
    armor: 0, repair: 0, knockback: 0,
    hooks: { onFire: [], onUpdate: [], onApex: [], onImpact: [], onDetonate: [], onExplode: [], onTurnStart: [] },
  };
}

function addHook(s, name, fn) { if (!s.hooks[name].includes(fn)) s.hooks[name].push(fn); }
function runHooks(owner, name, ...args) { for (const f of owner.stats.hooks[name]) f(...args, owner); }
function runImpact(s, hit) { for (const f of s.owner.stats.hooks.onImpact) if (f(s, hit, s.owner)) return true; return false; }

/* 다인전(1:1 / 2:2 / 1:1:1:1) 대응 적 타겟 탐색 */
function isHostile(a, b) {
  if (!a || !b || a.id === b.id) return false;
  if (G.mode === '2v2') return a.team !== b.team;
  return true;
}

function enemyTank(owner, refX = null, refY = null) {
  const sx = refX !== null ? refX : owner.x;
  const sy = refY !== null ? refY : owner.y;
  let best = null, bestD = Infinity;
  for (const p of players) {
    if (!p.alive || !isHostile(owner, p)) continue;
    const d = Math.hypot(p.x - sx, p.y - sy);
    if (d < bestD) { bestD = d; best = p; }
  }
  return best;
}

function hostileTanks(owner) {
  return players.filter(p => p.alive && isHostile(owner, p));
}

/* ============================ 2. 카드 시너지 정의 (8종) ============================ */
const SYNERGY_DEFS = [
  {
    id: 'storm', req: ['lightning', 'twister'], icon: '⛈️', name: '슈퍼 뇌우', color: '#00e5ff',
    desc: '번개 낙뢰 범위 +200px & 연쇄 감전!',
    apply(s) { s.synStorm = true; }
  },
  {
    id: 'apocalypse', req: ['volcano', 'meteor'], icon: '☄️', name: '종말의 날', color: '#ff3d00',
    desc: '화산 분출 시 하늘에서 추가 운석 2발 낙하!',
    apply(s) { s.synApocalypse = true; }
  },
  {
    id: 'supernova', req: ['nuke', 'blackhole'], icon: '🌌', name: '초신성 붕괴', color: '#d500f9',
    desc: '블랙홀 소멸 시 초대형 핵폭발 연쇄 발생!',
    apply(s) { s.synSupernova = true; }
  },
  {
    id: 'railgun', req: ['sniper', 'drill'], icon: '⚡', name: '초전자 레일건', color: '#40c4ff',
    desc: '드릴 굴착 속도 ×1.6 & 폭발 공격력 +25%!',
    apply(s) { s.synRailgun = true; s.damage *= 1.25; }
  },
  {
    id: 'vampire', req: ['leech', 'poison'], icon: '🩸', name: '역병의 군주', color: '#ff1744',
    desc: '맹독 구름의 지속 피해도 내 체력으로 흡혈!',
    apply(s) { s.synVampire = true; s.leech += 0.2; }
  },
  {
    id: 'gatling', req: ['burst', 'buckshot'], icon: '🔥', name: '지옥의 개틀링', color: '#ffd740',
    desc: '발사 탄수 +3발 추가 & 연사 속도 초고속화!',
    apply(s) { s.synGatling = true; s.shots += 3; s.shotDelay = 0.03; }
  },
  {
    id: 'timefreeze', req: ['frost', 'sawblade'], icon: '🧊', name: '절대영도 빙하기', color: '#81d4fa',
    desc: '빙결 적중 시 적의 다음 턴 이동 연료 100% 동결!',
    apply(s) { s.synTimeFreeze = true; }
  },
  {
    id: 'void', req: ['wormhole', 'mirror'], icon: '🌀', name: '차원 균열', color: '#ea80fc',
    desc: '거울 분신탄까지 모두 적 머리 위 웜홀로 낙하!',
    apply(s) { s.synVoid = true; }
  },
  {
    id: 'fortress', req: ['armor', 'repair'], icon: '🏰', name: '이동 요새', color: '#90caf9',
    desc: '받는 피해 추가 감소 & 수리량 2배!',
    apply(s) { s.synFortress = true; }
  },
  {
    id: 'ram', req: ['heavy', 'knockback'], icon: '🐏', name: '공성 파쇄추', color: '#ffab91',
    desc: '충격파 밀치기 ×1.7 & 공격력 +15%!',
    apply(s) { s.synRam = true; s.damage *= 1.15; }
  },
  {
    id: 'nitro', req: ['engine', 'bouncer'], icon: '🚀', name: '니트로 핀볼', color: '#ffea00',
    desc: '바운스 +2회 & 이동 연료 +30%!',
    apply(s) { s.synNitro = true; s.bounces += 2; s.maxFuel = Math.round(s.maxFuel * 1.3); }
  },
  {
    id: 'typhoon', req: ['knockback', 'twister'], icon: '🌀', name: '태풍의 눈', color: '#a7ffeb',
    desc: '충격파 범위 ×1.6!',
    apply(s) { s.synTyphoon = true; }
  }
];

/* ============================ 3. 카드 효과 훅 구현 ============================ */
function hookBounce(s, hit) {
  if (hit.type === 'tank' || s.bouncesLeft <= 0) return false;
  const ok = hit.type === 'wall' ? (bounceWall(s, hit.side), true) : bounceTerrain(s);
  if (ok) {
    s.bouncesLeft--;
    s.damage *= 1.22;
    s.radius *= 1.12;
    s.r *= 1.1;
    G.floaters.push({ x: s.x, y: s.y - 20, text: '🏀 바운스 증폭!', color: '#ff9100', t: 0, life: 0.7 });
  }
  return ok;
}
function hookCluster(s, owner) {
  if (s.child || s.split) return;
  s.split = true; s.dead = true;
  const lv = owner.stats.cluster;
  const n = 2 + lv * 2;
  for (let i = 0; i < n; i++) {
    const f = i - (n - 1) / 2;
    const c = makeShell(owner, s.x, s.y, s.vx * 0.55 + f * (85 + lv * 15), rand(-15, 55), {
      r: s.r * (0.72 + lv * 0.05), damage: s.damage * (0.28 + lv * 0.05), radius: s.radius * 0.68, child: true, apex: true, age: 0.3,
      bouncesLeft: s.bouncesLeft, angle: s.angle
    });
    if (owner.stats.homing) c.homeTarget = enemyTank(owner, s.x, s.y);
    G.shells.push(c);
  }
  Sfx.pop();
  burst(s.x, s.y, 12 + lv * 5, { colors: ['#fff', '#ffd180', '#ffab40'], speed: 180 + lv * 40, life: 0.45, size: 3.5, grav: 0.2, kind: 'spark' });
}
function hookAirstrike(ctx_, owner) {
  if (ctx_.shell.child) return;
  const lv = owner.stats.airstrike;
  const count = 2 + lv * 2;
  const targetX = ctx_.x;
  Sfx.airstrike();
  for (let i = 0; i < count; i++) {
    const offset = (i - (count - 1) / 2) * (36 - Math.min(14, lv * 3)) + rand(-8, 8);
    G.pending.push({
      t: 0.32 + i * 0.07, owner,
      custom: { x: clamp(targetX + offset, 20, W - 20), y: -30, vx: G.wind * 2, vy: 660 + lv * 30, damage: 6 + lv * 3, radius: ctx_.radius * (0.65 + lv * 0.1) }
    });
  }
}
function hookHomingLock(s, owner) { if (!s.child) s.homeTarget = enemyTank(owner, s.x, s.y); }
function hookHomingSteer(s, dt, owner) {
  let t = s.homeTarget;
  if (!t || !t.alive) t = s.homeTarget = enemyTank(owner, s.x, s.y);
  if (!t || !t.alive) return;
  const lv = owner.stats.homing;
  const tx = t.x, ty = t.y - 14 * t.stats.tankScale;
  const dist = Math.hypot(tx - s.x, ty - s.y);
  if (dist > 290 + lv * 70) return;
  const sp = Math.max(250, Math.hypot(s.vx, s.vy) * 0.998);
  const cur = Math.atan2(s.vy, s.vx);
  let d = Math.atan2(ty - s.y, tx - s.x) - cur;
  while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU;
  const rate = 0.95 * lv;
  const na = cur + clamp(d, -rate * dt, rate * dt);
  s.vx = Math.cos(na) * sp; s.vy = Math.sin(na) * sp;
}
function hookPoison(ctx_, owner) {
  if (ctx_.shell.child) return;
  const lv = owner.stats.poison;
  const r = 75 + lv * 22;
  const dmg = 14 + lv * 5;
  G.poisons.push({ x: ctx_.x, y: ctx_.y, r, dmg, ownerId: owner.id, turnsLeft: 1 + lv });
  Sfx.poison();
}
function hookDrill(s, hit, owner) {
  if (hit.type !== 'terrain' || s.drilled || owner.stats.drill <= 0) return false;
  const sp = Math.hypot(s.vx, s.vy) || 1;
  const mult = owner.stats.synRailgun ? 1.6 : 1.0;
  s.drilling = true; s.drilled = true;
  s.drillSpeed = clamp(sp * 0.58 * mult, 360, 820); s.dx = s.vx / sp; s.dy = s.vy / sp;
  s.drillLeft = owner.stats.drill * (s.child ? 0.6 : 1);
  s.drillR = 15 + Math.floor(owner.stats.drill / 170) * 4;
  s.drillAcc = 99;
  Sfx.drill();
  return true;
}
function hookTerraform(ctx_, owner) {
  const lv = owner.stats.terraform;
  ctx_.raise = true; ctx_.noCarve = true;
  ctx_.raiseRadius = ctx_.radius * (1.05 + 0.35 * (lv - 1));
}
function hookBlackhole(ctx_, owner) {
  if (ctx_.shell.child) return;
  const lv = owner.stats.blackhole;
  spawnBlackhole(ctx_.x, ctx_.y, owner, 1.4 + 0.35 * (lv - 1), 1 + 0.35 * (lv - 1));
}
function hookVolcano(ctx_, owner) {
  if (ctx_.shell.child) return;
  const lv = owner.stats.volcano;
  const count = 3 + lv * 2;
  for (let i = 0; i < count; i++) {
    const ang = -Math.PI * (0.18 + 0.64 * (i / Math.max(1, count - 1))) + rand(-0.08, 0.08);
    const spd = rand(320, 520 + lv * 30);
    G.shells.push(makeShell(owner, ctx_.x, ctx_.y - 12, Math.cos(ang) * spd, Math.sin(ang) * spd, {
      r: 4.2 + lv * 0.4, damage: 7 + lv * 2, radius: ctx_.radius * 0.6, child: true, apex: true, age: 0.3, isLava: true
    }));
  }
  burst(ctx_.x, ctx_.y, 18 + lv * 6, { colors: ['#ff3d00', '#ff9100', '#ffd54f'], speed: 340, life: 0.7, size: 4, kind: 'spark' });
  if (owner.stats.synApocalypse) {
    G.floaters.push({ x: ctx_.x, y: ctx_.y - 50, text: '☄️ 종말의 날 시너지!', color: '#ff3d00', t: 0, life: 1.0 });
    for (let k = 0; k < 2; k++) {
      G.pending.push({
        t: 0.2 + k * 0.15, owner,
        custom: { x: clamp(ctx_.x + rand(-180, 180), 40, W - 40), y: -40, vx: rand(-80, 80), vy: 700, damage: 12, radius: ctx_.radius * 0.85 }
      });
    }
  }
}
function hookMeteor(ctx_, owner) {
  if (ctx_.shell.child) return;
  const lv = owner.stats.meteor;
  const count = 3 + lv * 2;
  Sfx.airstrike();
  for (let i = 0; i < count; i++) {
    const mx = rand(120, W - 120);
    G.pending.push({
      t: 0.22 + i * 0.1, owner,
      custom: { x: mx, y: -40, vx: rand(-150, 150), vy: 690, damage: 8 + lv * 3, radius: ctx_.radius * (0.75 + lv * 0.1) }
    });
  }
}
function hookMine(ctx_, owner) {
  if (ctx_.shell.child) return;
  const lv = owner.stats.mine;
  const count = 2 + lv * 2;
  for (let i = 0; i < count; i++) {
    const mx = clamp(ctx_.x + (i - (count - 1) / 2) * 44 + rand(-8, 8), 30, W - 30);
    G.mines.push({ x: mx, y: Terrain.h(mx) - 4, ownerId: owner.id, damage: 15 + lv * 4, radius: ctx_.radius * 0.75, life: 2 + lv });
  }
}
function hookLightning(ctx_, owner) {
  if (ctx_.shell.child) return;
  const lv = owner.stats.lightning;
  const range = (320 + lv * 80) + (owner.stats.synStorm ? 200 : 0);
  const targets = hostileTanks(owner).filter(e => Math.hypot(e.x - ctx_.x, (e.y - 15) - ctx_.y) < range);
  if (!targets.length) return;
  Sfx.lightning();
  const hitList = owner.stats.synStorm ? targets : [targets[0]];
  for (const e of hitList) {
    for (let k = 0; k < lv; k++) {
      G.lightnings.push({ x0: ctx_.x + rand(-15, 15), y0: ctx_.y, x1: e.x + rand(-10, 10), y1: e.y - 16, t: 0, life: 0.35 + k * 0.08 });
    }
    damageTank(e, 11 + lv * 6 + (owner.stats.synStorm ? 6 : 0), '#00e5ff', owner);
  }
}
function hookUfo(ctx_, owner) {
  if (ctx_.shell.child) return;
  const lv = owner.stats.ufo;
  Sfx.ufo();
  G.fields.push({
    type: 'ufo', x: ctx_.x, y: ctx_.y - 210, owner, t: 0, life: 1.65 + (lv - 1) * 0.25,
    R: 185 + (lv - 1) * 45, power: lv, beamAcc: 0, beamTotal: 0, slammed: false
  });
}
function hookChainBomb(ctx_, owner) {
  if (ctx_.shell.child) return;
  const lv = owner.stats.chainbomb;
  const dir = ctx_.shell.vx >= 0 ? 1 : -1;
  for (let i = 1; i <= 1 + lv; i++) {
    G.pending.push({
      t: i * 0.16, owner,
      chainBoom: { x: clamp(ctx_.x + dir * i * 62, 20, W - 20), damage: 12 + lv * 4, radius: ctx_.radius * (0.75 + lv * 0.1) }
    });
  }
}
function hookTwisterUpdate(s, dt, owner) {
  const lv = owner.stats.twister;
  for (let i = G.crates.length - 1; i >= 0; i--) {
    const cr = G.crates[i];
    if (Math.hypot(s.x - cr.x, s.y - cr.y) <= cr.r + s.r + 36 + lv * 20) {
      collectCrate(cr, i, s.owner);
    }
  }
}
function hookTwisterExplode(ctx_, owner) {
  if (ctx_.shell.child) return;
  const lv = owner.stats.twister;
  for (const e of hostileTanks(owner)) {
    if (Math.hypot(e.x - ctx_.x, e.y - ctx_.y) < ctx_.radius * (2.0 + lv * 0.3)) {
      e.air = true;
      e.vy = -(400 + lv * 90);
      e.vx += rand(-200 - lv * 60, 200 + lv * 60);
      damageTank(e, 10 + lv * 5, '#84ffff', owner);
    }
  }
  G.rings.push({ x: ctx_.x, y: ctx_.y, max: ctx_.radius * (1.8 + lv * 0.3), t: 0, life: 0.4, color: '178,235,242' });
}
function hookJackpot(s, owner) {
  if (s.child) return;
  const lv = owner.stats.jackpot;
  const winChance = Math.min(0.85, 0.35 + lv * 0.15);
  const mult = RNG.next() < winChance ? rand(1.6 + lv * 0.2, 2.2 + lv * 0.4) : rand(0.65, 0.95);
  s.damage *= mult;
  s.radius *= (0.85 + mult * 0.28);
  s.r *= (0.9 + mult * 0.25);
  if (mult >= 1.6) {
    G.floaters.push({ x: owner.x, y: owner.y - 75, text: `🎰 대박! ×${mult.toFixed(1)}!`, color: '#ffd54f', t: 0, life: 1.2 });
  } else {
    G.floaters.push({ x: owner.x, y: owner.y - 75, text: `🎰 꽝... ×${mult.toFixed(1)}`, color: '#b0bec5', t: 0, life: 1.0 });
  }
}
function hookWormhole(s, owner) {
  if (s.wormholed) return;
  if (s.child && !owner.stats.synVoid) return;
  s.wormholed = true;
  const lv = owner.stats.wormhole;
  const e = enemyTank(owner, s.x, s.y);
  const targetX = e ? clamp(e.x + rand(-55, 55), 50, W - 50) : clamp(W - owner.x, 50, W - 50);
  G.rings.push({ x: s.x, y: s.y, max: 55, t: 0, life: 0.35, color: '0,229,255' });
  s.x = targetX;
  s.y = 75;
  s.vx = G.wind * 1.5;
  s.vy = 420 + lv * 60;
  G.rings.push({ x: s.x, y: s.y, max: 65, t: 0, life: 0.4, color: '213,0,249' });
  Sfx.portal();
  if (!s.child) {
    for (let i = 1; i < lv; i++) {
      const ox = clamp(targetX + (i % 2 === 1 ? 45 : -45) * Math.ceil(i / 2), 40, W - 40);
      G.shells.push(makeShell(owner, ox, 65, G.wind * 1.5, 420 + lv * 60, {
        r: s.r * 0.8, damage: 12 + lv * 3, radius: s.radius * 0.75, child: true, apex: true, age: 0.3
      }));
    }
  }
}
function hookMagnet(s, dt, owner) {
  const lv = owner.stats.magnet;
  const range = 175 + lv * 55;
  for (const e of hostileTanks(owner)) {
    const dx = s.x - e.x, dy = s.y - (e.y - 16);
    const d = Math.hypot(dx, dy);
    if (d < range && d > 12) {
      const pull = (130 + lv * 75) * (1 - d / range) * dt;
      moveTankX(e, Math.sign(dx) * Math.min(pull, Math.abs(dx)));
      if (Math.random() < 0.35) {
        P(e.x + fxRand(-15, 15), e.y - 15, dx * 2, dy * 2, { life: 0.25, size: 2.5, color: '#ff4081', grav: 0, kind: 'spark' });
      }
    }
  }
}
function hookMirror(s, owner) {
  if (s.child || s.mirrored) return;
  s.mirrored = true;
  const lv = owner.stats.mirror;
  for (let i = 1; i <= lv; i++) {
    const spreadAng = (i * 0.14) * (i % 2 === 1 ? 1 : -1);
    const spd = Math.hypot(s.vx, s.vy);
    const baseAng = Math.atan2(s.vy, s.vx) + spreadAng;
    const clone = makeShell(owner, s.x, s.y, Math.cos(baseAng) * spd, Math.sin(baseAng) * spd, {
      r: s.r * 0.85, damage: 14 + lv * 3, radius: s.radius * 0.8, child: true, age: 0.1, bouncesLeft: s.bouncesLeft
    });
    if (owner.stats.synVoid) hookWormhole(clone, owner);
    G.shells.push(clone);
  }
  G.floaters.push({ x: owner.x, y: owner.y - 65, text: `🪞 거울 분신 ×${lv + 1}!`, color: '#80d8ff', t: 0, life: 1.0 });
}
function hookFrost(ctx_, owner) {
  if (ctx_.shell.child) return;
  const lv = owner.stats.frost;
  G.rings.push({ x: ctx_.x, y: ctx_.y, max: ctx_.radius * (1.6 + lv * 0.3), t: 0, life: 0.45, color: '129,212,250' });
  burst(ctx_.x, ctx_.y, 18 + lv * 6, { colors: ['#e1f5fe', '#81d4fa', '#29b6f6', '#ffffff'], speed: 260, life: 0.7, size: 3.5, kind: 'spark' });
  for (const e of hostileTanks(owner)) {
    if (Math.hypot(e.x - ctx_.x, (e.y - 15) - ctx_.y) < ctx_.radius * (1.6 + lv * 0.3)) {
      e.empDebuff = owner.stats.synTimeFreeze ? 2 : 1; // 1: 연료 -80%, 2(시너지): 연료 -100% 완전 동결!
      damageTank(e, 12 + lv * 5, '#4fc3f7', owner);
      const freezeMsg = owner.stats.synTimeFreeze ? '🧊 절대영도 완전 동결! (연료 0)' : '❄️ 엔진 동결! (연료 -80%)';
      G.floaters.push({ x: e.x, y: e.y - 72, text: freezeMsg, color: '#81d4fa', t: 0, life: 1.3 });
    }
  }
}
function hookChaos(ctx_, owner) {
  if (ctx_.shell.child) return;
  const lv = owner.stats.chaos;
  const pool = [hookVolcano, hookLightning, hookUfo, hookBlackhole, hookMeteor];
  G.floaters.push({ x: ctx_.x, y: ctx_.y - 45, text: `🎲 카오스 ×${lv} 발동!`, color: '#ea80fc', t: 0, life: 1.1 });
  for (let i = 0; i < lv; i++) {
    const fn = pool[(RNG.next() * pool.length) | 0];
    fn(ctx_, owner);
  }
}
function hookSawblade(s, hit, owner) {
  if (hit.type !== 'terrain' || s.sawed || owner.stats.sawblade <= 0) return false;
  const lv = owner.stats.sawblade;
  s.sawing = true;
  s.sawed = true;
  s.sawDir = s.vx >= 0 ? 1 : -1;
  s.sawTime = 0.85 + lv * 0.45;
  s.damage = Math.max(16, s.damage * (0.65 + lv * 0.15));
  Sfx.drill();
  return true;
}

function hookRepair(p) {
  const rate = 0.07 * p.stats.repair * (p.stats.synFortress ? 2 : 1);
  const heal = Math.min(p.roundMaxHp - p.hp, Math.round(p.roundMaxHp * rate));
  if (heal <= 0) return;
  p.hp += heal;
  G.floaters.push({ x: p.x, y: p.y - 70, text: `🔧 +${heal}`, color: '#69f0ae', t: 0, life: 1.2 });
}
function hookKnockback(ctx_, owner) {
  if (ctx_.shell.child) return;
  const st = owner.stats, lv = st.knockback;
  const range = ctx_.radius * 2.2 * (st.synTyphoon ? 1.6 : 1);
  const force = (230 + lv * 90) * (st.synRam ? 1.7 : 1);
  for (const e of hostileTanks(owner)) {
    if (Math.hypot(e.x - ctx_.x, (e.y - 15) - ctx_.y) >= range) continue;
    const dir = e.x >= ctx_.x ? 1 : -1;
    e.air = true;
    e.vx += dir * force;
    e.vy = -force * 0.75;
    damageTank(e, 4 + lv * 4, '#ffab91', owner);
  }
  G.rings.push({ x: ctx_.x, y: ctx_.y, max: range, t: 0, life: 0.4, color: '255,171,145' });
}

const CARD_DEFS = {
  cluster: {
    icon: '🎆', name: '공중 분열탄', short: '분열', cat: '탄환 변형', color: '#f06292',
    desc: ['최고점에서 부채꼴 자탄 4발 분열', '★중첩: 자탄 수(+2발) 및 위력 폭증'],
    apply(s) { s.cluster += 1; addHook(s, 'onApex', hookCluster); }
  },
  airstrike: {
    icon: '✈️', name: '공중 폭격', short: '폭격', cat: '지원 포격', color: '#ff7043',
    desc: ['착탄 후 하늘에서 폭격탄 4발 낙하', '★중첩: 낙하 미사일 수·범위 융단폭격'],
    apply(s) { s.airstrike += 1; addHook(s, 'onExplode', hookAirstrike); }
  },
  homing: {
    icon: '🎯', name: '유도탄', short: '유도', cat: '탄환 변형', color: '#26c6da',
    desc: ['상대 반경 360px 진입 시 자동 유도', '★중첩: 유도 탐지 거리·선회력 급상승'],
    apply(s) { s.homing += 1; addHook(s, 'onApex', hookHomingLock); addHook(s, 'onUpdate', hookHomingSteer); }
  },
  poison: {
    icon: '☣️', name: '맹독탄', short: '맹독', cat: '지형 제어', color: '#76ff03',
    desc: ['2턴간 독구름 생성 (턴당 19 피해)', '★시너지(흡혈): 독 피해도 체력 흡수'],
    apply(s) { s.poison += 1; addHook(s, 'onExplode', hookPoison); }
  },
  bouncer: {
    icon: '🏀', name: '탱탱볼', short: '탱탱볼', cat: '탄환 변형', color: '#ff9100',
    desc: ['지형·벽에 2회 튕기며 위력 +22% 증폭', '★중첩: 바운스 횟수 +2회씩 추가 증가'],
    apply(s) { s.bounces += 2; addHook(s, 'onImpact', hookBounce); }
  },
  burst: {
    icon: '🔫', name: '3연발 사격', short: '3연발', cat: '화력 강화', color: '#ffca28',
    desc: ['0.13초 간격 3발 연속 발사 (58% 피해)', '★시너지(산탄): 지옥의 개틀링 기관포'],
    apply(s) { s.shots += 2; s.damage *= 0.58; }
  },
  drill: {
    icon: '🔩', name: '드릴 관통탄', short: '드릴', cat: '탄환 변형', color: '#b0bec5',
    desc: ['땅속을 파고들며 터널 굴착 후 폭발', '★시너지(저격): 초전자 레일건 고속관통'],
    apply(s) { s.drill += 170; addHook(s, 'onImpact', hookDrill); }
  },
  terraform: {
    icon: '⛰️', name: '대지 융기', short: '융기', cat: '지형 제어', color: '#a1887f',
    desc: ['착탄 지점에 거대한 흙 언덕 생성', '★중첩: 에베레스트급 거대 산맥 생성'],
    apply(s) { s.terraform += 1; addHook(s, 'onDetonate', hookTerraform); }
  },
  blackhole: {
    icon: '🕳️', name: '미니 블랙홀', short: '블랙홀', cat: '지형 제어', color: '#b388ff',
    desc: ['1.4초간 블랙홀 생성해 적을 끌어당김', '★시너지(핵탄두): 소멸 시 초신성 핵폭발'],
    apply(s) { s.blackhole += 1; addHook(s, 'onExplode', hookBlackhole); }
  },
  giant: {
    icon: '🦖', name: '거대화', short: '거대', cat: '탱크 개조', color: '#ffa726',
    desc: ['최대 체력·폭발 반경 ×1.35 증가', '★중첩: 초거대 보스 탱크로 진화'],
    apply(s) { s.maxHp *= 1.35; s.blastRadius *= 1.35; s.tankScale *= 1.35; s.shellSize *= 1.2; }
  },
  sniper: {
    icon: '🔭', name: '초고속 저격탄', short: '저격', cat: '화력 강화', color: '#40c4ff',
    desc: ['탄속 ×1.35 & 조준 가이드 2배 연장', '★시너지(드릴): 초전자 레일건 진화'],
    apply(s) { s.shellSpeed *= 1.35; s.guideTime *= 2; }
  },
  glass: {
    icon: '🔮', name: '유리 대포', short: '유리대포', cat: '하이리스크', color: '#e040fb', curse: true,
    desc: ['공격력 ×1.85 폭증 / 최대 체력 -30%', '★중첩: 스치면 즉사급 한방 화력 완성'],
    apply(s) { s.damage *= 1.85; s.maxHp *= 0.7; }
  },
  leech: {
    icon: '🧛', name: '흡혈 박쥐', short: '흡혈', cat: 'ROUNDS 엽기', color: '#ff1744',
    desc: ['입힌 피해의 45%만큼 내 체력 회복', '★시너지(맹독): 독구름 피해도 흡혈'],
    apply(s) { s.leech += 0.45; }
  },
  phoenix: {
    icon: '🔥', name: '불사조 부활', short: '부활', cat: 'ROUNDS 엽기', color: '#ff6d00',
    desc: ['사망 시 체력 40%로 1회 즉시 부활', '★중첩: 라운드당 부활 목숨 +1개 추가'],
    apply(s) { s.phoenix += 1; }
  },
  volcano: {
    icon: '🌋', name: '화산 분화', short: '화산', cat: '대환장 난장판', color: '#ff3d00',
    desc: ['착탄 지점에서 용암 불덩이 5개 분출', '★시너지(유성우): 종말의 날 추가 운석'],
    apply(s) { s.volcano += 1; addHook(s, 'onExplode', hookVolcano); }
  },
  nuke: {
    icon: '☢️', name: '전술 핵탄두', short: '핵폭탄', cat: '대환장 난장판', color: '#c6ff00',
    desc: ['폭발 반경 ×2.0배 & 공격력 ×1.3배', '★시너지(블랙홀): 초신성 붕괴 연쇄'],
    apply(s) { s.nuke += 1; s.blastRadius *= 2.0; s.damage *= 1.3; s.shellSize *= 1.45; }
  },
  meteor: {
    icon: '☄️', name: '유성우 폭격', short: '유성우', cat: '대환장 난장판', color: '#ff9100',
    desc: ['폭발 후 하늘에서 무작위 운석 5발 낙하', '★시너지(화산): 종말의 날 시너지 발동'],
    apply(s) { s.meteor += 1; addHook(s, 'onExplode', hookMeteor); }
  },
  mine: {
    icon: '🧨', name: '집속 지뢰', short: '지뢰', cat: '대환장 난장판', color: '#ff5252',
    desc: ['착탄 주변에 근접 지뢰 4개 매설 (19 피해)', '★중첩: 지뢰 개수·지속시간·폭발력 강화'],
    apply(s) { s.mine += 1; addHook(s, 'onExplode', hookMine); }
  },
  lightning: {
    icon: '⚡', name: '연쇄 번개', short: '번개', cat: '대환장 난장판', color: '#00e5ff',
    desc: ['반경 400px 내 적에게 벼락 (17 피해)', '★시너지(회오리): 슈퍼 뇌우 광역 연쇄감전'],
    apply(s) { s.lightning += 1; addHook(s, 'onExplode', hookLightning); }
  },
  buckshot: {
    icon: '💥', name: '샷건 산탄포', short: '산탄포', cat: '대환장 난장판', color: '#ffd740',
    desc: ['부채꼴로 산탄 6발을 동시에 발사', '★시너지(3연발): 지옥의 개틀링 난사'],
    apply(s) { s.buckshot += 1; s.shots += 5; s.shotDelay = 0.02; s.damage *= 0.36; }
  },
  ufo: {
    icon: '🛸', name: 'UFO 납치 광선', short: 'UFO', cat: '대환장 난장판', color: '#ea80fc',
    desc: ['광선 지짐+추락으로 약 17 추가 피해', '★중첩: 거대 모선 출현, 납치 범위 폭증'],
    apply(s) { s.ufo += 1; addHook(s, 'onExplode', hookUfo); }
  },
  chainbomb: {
    icon: '💣', name: '연쇄 유폭탄', short: '연쇄폭발', cat: '대환장 난장판', color: '#ff6e40',
    desc: ['진행 방향으로 2연속 도미노 추가 폭발', '★중첩: 전장을 가로지르는 연쇄 대폭발'],
    apply(s) { s.chainbomb += 1; addHook(s, 'onExplode', hookChainBomb); }
  },
  twister: {
    icon: '🌪️', name: '회오리 포탄', short: '회오리', cat: '대환장 난장판', color: '#84ffff',
    desc: ['보급 상자 자동 흡수 + 적 공중 날림(15 피해)', '★시너지(번개): 슈퍼 뇌우 시너지 발동'],
    apply(s) { s.twister += 1; addHook(s, 'onUpdate', hookTwisterUpdate); addHook(s, 'onExplode', hookTwisterExplode); }
  },
  jackpot: {
    icon: '🎰', name: '룰렛 대박탄', short: '룰렛탄', cat: '대환장 난장판', color: '#ffd54f',
    desc: ['발사마다 0.65배(꽝) ~ 2.6배(대박!) 변동', '★중첩: 대박 확률 급상승 & 최대 4배수 돌파'],
    apply(s) { s.jackpot += 1; addHook(s, 'onFire', hookJackpot); }
  },
  wormhole: {
    icon: '🌀', name: '차원의 웜홀', short: '웜홀', cat: '신규 대환장', color: '#d500f9',
    desc: ['발사 즉시 적 머리 위 차원문으로 수직 낙하', '★시너지(분신): 모든 분신탄까지 웜홀 낙하'],
    apply(s) { s.wormhole += 1; addHook(s, 'onFire', hookWormhole); }
  },
  magnet: {
    icon: '🧲', name: '초전도 자석탄', short: '자석탄', cat: '신규 대환장', color: '#ff4081',
    desc: ['비행 중 강력한 자기장으로 적을 끌어당김', '★중첩: 화면 반을 끌어당기는 블랙홀급 자력'],
    apply(s) { s.magnet += 1; addHook(s, 'onUpdate', hookMagnet); }
  },
  mirror: {
    icon: '🪞', name: '거울 분신탄', short: '분신탄', cat: '신규 대환장', color: '#80d8ff',
    desc: ['발사 시 추가 환영 분신탄 1발 동시 사출', '★시너지(웜홀): 차원 균열 분신 폭격'],
    apply(s) { s.mirror += 1; addHook(s, 'onFire', hookMirror); }
  },
  frost: {
    icon: '❄️', name: '절대영도 빙결탄', short: '빙결탄', cat: '신규 대환장', color: '#4fc3f7',
    desc: ['착탄 시 17 빙결 피해 + 적 연료 80% 동결', '★시너지(톱날): 빙결 시 연료 100% 완전동결'],
    apply(s) { s.frost += 1; addHook(s, 'onExplode', hookFrost); }
  },
  chaos: {
    icon: '🎲', name: '카오스 변이탄', short: '카오스', cat: '신규 대환장', color: '#ea80fc',
    desc: ['착탄마다 화산·번개·UFO·블랙홀 중 랜덤 발동', '★중첩: 한 번에 2개·3개 재앙이 동시에 터짐!'],
    apply(s) { s.chaos += 1; addHook(s, 'onExplode', hookChaos); }
  },
  sawblade: {
    icon: '🪚', name: '지형 톱날탄', short: '톱날탄', cat: '신규 대환장', color: '#cfd8dc',
    desc: ['땅에 닿으면 지형을 깎으며 돌진하는 톱날 변신', '★중첩: 톱날 질주 시간과 절단 위력 대폭 증가'],
    apply(s) { s.sawblade += 1; addHook(s, 'onImpact', hookSawblade); }
  },
  armor: {
    icon: '🛡️', name: '강화 장갑', short: '장갑', cat: '기본 강화', color: '#90a4ae',
    desc: ['적에게 받는 피해 18% 감소', '★시너지(수리): 이동 요새 각성'],
    apply(s) { s.armor += 1; }
  },
  engine: {
    icon: '🛞', name: '터보 엔진', short: '엔진', cat: '기본 강화', color: '#ffee58',
    desc: ['이동 연료 ×1.5 증가', '★시너지(탱탱볼): 니트로 핀볼 각성'],
    apply(s) { s.maxFuel = Math.round(s.maxFuel * 1.5); }
  },
  repair: {
    icon: '🔧', name: '야전 수리', short: '수리', cat: '기본 강화', color: '#69f0ae',
    desc: ['내 턴 시작마다 체력 7% 회복', '★시너지(장갑): 이동 요새 각성'],
    apply(s) { s.repair += 1; addHook(s, 'onTurnStart', hookRepair); }
  },
  heavy: {
    icon: '🪨', name: '묵직한 철갑탄', short: '철갑', cat: '기본 강화', color: '#bcaaa4',
    desc: ['공격력 ×1.25 & 포탄 크기 증가', '★시너지(충격파): 공성 파쇄추 각성'],
    apply(s) { s.damage *= 1.25; s.shellSize *= 1.15; }
  },
  knockback: {
    icon: '👊', name: '충격파탄', short: '충격파', cat: '기본 강화', color: '#ff8a65',
    desc: ['착탄 시 주변 적을 밀쳐내고 추가 피해', '★시너지(철갑·회오리): 융합 2종 가능'],
    apply(s) { s.knockback += 1; addHook(s, 'onExplode', hookKnockback); }
  },
};

const CARD_POOL = Object.keys(CARD_DEFS);
function computeStats(cardIds) {
  const s = newStats();
  const ids = cardIds.slice().sort((a, b) => CARD_POOL.indexOf(a) - CARD_POOL.indexOf(b));
  for (const id of ids) CARD_DEFS[id].apply(s);

  // 시너지 판정 및 적용
  const set = new Set(ids);
  for (const syn of SYNERGY_DEFS) {
    if (syn.req.every(r => set.has(r))) {
      s.synergies.push(syn);
      syn.apply(s);
    }
  }

  s.maxHp = Math.max(30, Math.round(s.maxHp));
  return s;
}
