'use strict';

/* ============================ 카드 스탯 및 훅 시스템 ============================
 * 새로운 카드나 특수탄(핵폭탄, 불발탄 등)을 추가할 때는
 * 아래 CARD_DEFS 객체에 항목만 추가하면 자동으로 카드 풀과 설명창에 등록됩니다.
 */
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
    hooks: { onFire: [], onUpdate: [], onApex: [], onImpact: [], onDetonate: [], onExplode: [], onTurnStart: [] },
  };
}

function addHook(s, name, fn) { if (!s.hooks[name].includes(fn)) s.hooks[name].push(fn); }
function runHooks(owner, name, ...args) { for (const f of owner.stats.hooks[name]) f(...args, owner); }
function runImpact(s, hit) { for (const f of s.owner.stats.hooks.onImpact) if (f(s, hit, s.owner)) return true; return false; }

function enemyTank(owner) {
  const e = players[1 - owner.id];
  return (e && e.alive) ? e : null;
}

/* --- 카드 효과 훅 구현 (전부 시드 기반 rand() 사용으로 멀티 100% 일치) --- */
function hookBounce(s, hit) {
  if (hit.type === 'tank' || s.bouncesLeft <= 0) return false;
  const ok = hit.type === 'wall' ? (bounceWall(s, hit.side), true) : bounceTerrain(s);
  if (ok) s.bouncesLeft--;
  return ok;
}
function hookCluster(s, owner) {
  if (s.child || s.split) return;
  s.split = true; s.dead = true;
  const n = 1 + 2 * owner.stats.cluster;
  for (let i = 0; i < n; i++) {
    const f = i - (n - 1) / 2;
    const c = makeShell(owner, s.x, s.y, s.vx * 0.55 + f * 95, rand(-10, 50), {
      r: s.r * 0.72, damage: s.damage * 0.38, radius: s.radius * 0.7, child: true, apex: true, age: 0.3,
      bouncesLeft: s.bouncesLeft, angle: s.angle
    });
    if (owner.stats.homing) c.homeTarget = enemyTank(owner);
    G.shells.push(c);
  }
  Sfx.pop();
  burst(s.x, s.y, 12, { colors: ['#fff', '#ffd180', '#ffab40'], speed: 180, life: 0.4, size: 3, grav: 0.2, kind: 'spark' });
}
function hookAirstrike(ctx_, owner) {
  if (ctx_.shell.child) return;
  const count = 3 * owner.stats.airstrike;
  const targetX = ctx_.x;
  Sfx.airstrike();
  for (let i = 0; i < count; i++) {
    const offset = (i - (count - 1) / 2) * 34 + rand(-8, 8);
    G.pending.push({
      t: 0.35 + i * 0.08, owner,
      custom: { x: clamp(targetX + offset, 20, W - 20), y: -30, vx: G.wind * 2, vy: 640, damage: ctx_.damage * 0.38, radius: ctx_.radius * 0.75 }
    });
  }
}
function hookHomingLock(s, owner) { if (!s.child) s.homeTarget = enemyTank(owner); }
function hookHomingSteer(s, dt, owner) {
  const t = s.homeTarget; if (!t || !t.alive) return;
  const tx = t.x, ty = t.y - 14 * t.stats.tankScale;
  const dist = Math.hypot(tx - s.x, ty - s.y);
  if (dist > 310) return;
  const sp = Math.max(240, Math.hypot(s.vx, s.vy) * 0.997);
  const cur = Math.atan2(s.vy, s.vx);
  let d = Math.atan2(ty - s.y, tx - s.x) - cur;
  while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU;
  const rate = 0.85 * owner.stats.homing;
  const na = cur + clamp(d, -rate * dt, rate * dt);
  s.vx = Math.cos(na) * sp; s.vy = Math.sin(na) * sp;
}
function hookPoison(ctx_, owner) {
  if (ctx_.shell.child) return;
  const r = 80 + 15 * (owner.stats.poison - 1);
  const dmg = 16 * owner.stats.poison;
  G.poisons.push({ x: ctx_.x, y: ctx_.y, r, dmg, ownerId: owner.id, turnsLeft: 2 });
  Sfx.poison();
}
function hookDrill(s, hit, owner) {
  if (hit.type !== 'terrain' || s.drilled || owner.stats.drill <= 0) return false;
  const sp = Math.hypot(s.vx, s.vy) || 1;
  s.drilling = true; s.drilled = true;
  s.drillSpeed = clamp(sp * 0.55, 340, 520); s.dx = s.vx / sp; s.dy = s.vy / sp;
  s.drillLeft = owner.stats.drill * (s.child ? 0.6 : 1); s.drillR = 16; s.drillAcc = 99;
  Sfx.drill();
  return true;
}
function hookTerraform(ctx_, owner) {
  ctx_.raise = true; ctx_.noCarve = true;
  ctx_.raiseRadius = ctx_.radius * (1.05 + 0.2 * (owner.stats.terraform - 1));
}
function hookBlackhole(ctx_, owner) {
  if (ctx_.shell.child) return;
  const n = owner.stats.blackhole;
  spawnBlackhole(ctx_.x, ctx_.y, owner, 1.5 + 0.3 * (n - 1), 1 + 0.25 * (n - 1));
}
function hookVolcano(ctx_, owner) {
  if (ctx_.shell.child) return;
  const count = 4 + owner.stats.volcano;
  for (let i = 0; i < count; i++) {
    const ang = -Math.PI * (0.2 + 0.6 * (i / (count - 1))) + rand(-0.1, 0.1);
    const spd = rand(320, 520);
    G.shells.push(makeShell(owner, ctx_.x, ctx_.y - 12, Math.cos(ang) * spd, Math.sin(ang) * spd, {
      r: 4.5, damage: ctx_.damage * 0.3, radius: ctx_.radius * 0.65, child: true, apex: true, age: 0.3, isLava: true
    }));
  }
  burst(ctx_.x, ctx_.y, 20, { colors: ['#ff3d00', '#ff9100', '#ffd54f'], speed: 340, life: 0.7, size: 4, kind: 'spark' });
}
function hookMeteor(ctx_, owner) {
  if (ctx_.shell.child) return;
  const count = 4 * owner.stats.meteor;
  Sfx.airstrike();
  for (let i = 0; i < count; i++) {
    const mx = rand(120, W - 120);
    G.pending.push({
      t: 0.25 + i * 0.12, owner,
      custom: { x: mx, y: -40, vx: rand(-160, 160), vy: 680, damage: ctx_.damage * 0.35, radius: ctx_.radius * 0.85 }
    });
  }
}
function hookMine(ctx_, owner) {
  if (ctx_.shell.child) return;
  const count = 3 + owner.stats.mine;
  for (let i = 0; i < count; i++) {
    const mx = clamp(ctx_.x + (i - (count - 1) / 2) * 48 + rand(-10, 10), 30, W - 30);
    G.mines.push({ x: mx, y: Terrain.h(mx) - 4, ownerId: owner.id, damage: ctx_.damage * 0.45, radius: ctx_.radius * 0.8, life: 3 });
  }
}
function hookLightning(ctx_, owner) {
  if (ctx_.shell.child) return;
  const e = enemyTank(owner);
  if (!e) return;
  const d = Math.hypot(e.x - ctx_.x, (e.y - 15) - ctx_.y);
  if (d < 340) {
    Sfx.lightning();
    G.lightnings.push({ x0: ctx_.x, y0: ctx_.y, x1: e.x, y1: e.y - 16, t: 0, life: 0.35 });
    damageTank(e, Math.round(ctx_.damage * 0.45 * owner.stats.lightning), '#00e5ff', owner);
  }
}
function hookUfo(ctx_, owner) {
  if (ctx_.shell.child) return;
  Sfx.ufo();
  G.fields.push({ type: 'ufo', x: ctx_.x, y: ctx_.y - 180, owner, t: 0, life: 1.5, R: 160, power: owner.stats.ufo });
}
function hookChainBomb(ctx_, owner) {
  if (ctx_.shell.child) return;
  const dir = ctx_.shell.vx >= 0 ? 1 : -1;
  for (let i = 1; i <= 2 * owner.stats.chainbomb; i++) {
    G.pending.push({
      t: i * 0.16, owner,
      chainBoom: { x: clamp(ctx_.x + dir * i * 62, 20, W - 20), damage: ctx_.damage * 0.4, radius: ctx_.radius * 0.85 }
    });
  }
}
function hookTwisterUpdate(s) {
  for (let i = G.crates.length - 1; i >= 0; i--) {
    const cr = G.crates[i];
    if (Math.hypot(s.x - cr.x, s.y - cr.y) <= cr.r + s.r + 36) {
      collectCrate(cr, i, s.owner);
    }
  }
}
function hookTwisterExplode(ctx_, owner) {
  if (ctx_.shell.child) return;
  const e = enemyTank(owner);
  if (e && Math.hypot(e.x - ctx_.x, e.y - ctx_.y) < ctx_.radius * 2.2) {
    e.air = true;
    e.vy = -440;
    e.vx += rand(-220, 220);
  }
  G.rings.push({ x: ctx_.x, y: ctx_.y, max: ctx_.radius * 2, t: 0, life: 0.4, color: '178,235,242' });
}
function hookJackpot(s, owner) {
  if (s.child) return;
  const mult = RNG.next() < 0.45 ? rand(1.8, 2.8) : rand(0.55, 0.95);
  s.damage *= mult;
  s.radius *= (0.8 + mult * 0.35);
  s.r *= (0.85 + mult * 0.3);
  if (mult >= 1.8) {
    G.floaters.push({ x: owner.x, y: owner.y - 75, text: `🎰 잭팟! ×${mult.toFixed(1)}!`, color: '#ffd54f', t: 0, life: 1.2 });
  } else {
    G.floaters.push({ x: owner.x, y: owner.y - 75, text: `🎰 꽝... ×${mult.toFixed(1)}`, color: '#b0bec5', t: 0, life: 1.0 });
  }
}

const CARD_DEFS = {
  cluster: { icon: '🎆', name: '공중 분열탄', short: '분열', cat: '탄환 변형', color: '#f06292', desc: ['최고점에서 부채꼴로 퍼지는', '자탄 3개로 갈라짐 (38% 피해)'], apply(s) { s.cluster += 1; addHook(s, 'onApex', hookCluster); } },
  airstrike: { icon: '✈️', name: '공중 폭격', short: '폭격', cat: '지원 포격', color: '#ff7043', desc: ['착탄 0.4초 뒤 하늘에서', '폭격 미사일 3발 수직 낙하'], apply(s) { s.airstrike += 1; addHook(s, 'onExplode', hookAirstrike); } },
  homing: { icon: '🎯', name: '유도탄', short: '유도', cat: '탄환 변형', color: '#26c6da', desc: ['상대 반경 310px 진입 시', '궤도가 상대 쪽으로 휘어짐'], apply(s) { s.homing += 1; addHook(s, 'onApex', hookHomingLock); addHook(s, 'onUpdate', hookHomingSteer); } },
  poison: { icon: '☣️', name: '맹독탄', short: '맹독', cat: '지형 제어', color: '#76ff03', desc: ['2턴간 유지되는 독구름 생성', '턴 시작 시 범위 내 적 16 피해'], apply(s) { s.poison += 1; addHook(s, 'onExplode', hookPoison); } },
  bouncer: { icon: '🏀', name: '탱탱볼', short: '탱탱볼', cat: '탄환 변형', color: '#ff9100', desc: ['지형과 벽에 2번 통통 튄 뒤 폭발', '(탱크 직격 시 즉시 폭발)'], apply(s) { s.bounces += 2; addHook(s, 'onImpact', hookBounce); } },
  burst: { icon: '🔫', name: '3연발 사격', short: '3연발', cat: '화력 강화', color: '#ffca28', desc: ['0.13초 간격으로 3발 연속 발사', '(발당 공격력 58%로 보정)'], apply(s) { s.shots += 2; s.damage *= 0.58; } },
  drill: { icon: '🔩', name: '드릴 관통탄', short: '드릴', cat: '탄환 변형', color: '#b0bec5', desc: ['땅속을 파고들며 터널을', '뚫은 뒤 내부에서 폭발'], apply(s) { s.drill += 170; addHook(s, 'onImpact', hookDrill); } },
  terraform: { icon: '⛰️', name: '대지 융기', short: '융기', cat: '지형 제어', color: '#a1887f', desc: ['땅을 파는 대신 착탄 지점에', '거대한 반원형 흙 언덕 생성'], apply(s) { s.terraform += 1; addHook(s, 'onDetonate', hookTerraform); } },
  blackhole: { icon: '🕳️', name: '미니 블랙홀', short: '블랙홀', cat: '지형 제어', color: '#b388ff', desc: ['1.5초간 블랙홀을 생성해', '주변 상대 탱크를 끌어당김'], apply(s) { s.blackhole += 1; addHook(s, 'onExplode', hookBlackhole); } },
  giant: { icon: '🦖', name: '거대화', short: '거대', cat: '탱크 개조', color: '#ffa726', desc: ['최대 체력·폭발 반경 ×1.35', '탱크 크기도 함께 커짐'], apply(s) { s.maxHp *= 1.35; s.blastRadius *= 1.35; s.tankScale *= 1.35; s.shellSize *= 1.2; } },
  sniper: { icon: '🔭', name: '초고속 저격탄', short: '저격', cat: '화력 강화', color: '#40c4ff', desc: ['탄속 ×1.35 증가', '조준 점선 가이드 길이 2배'], apply(s) { s.shellSpeed *= 1.35; s.guideTime *= 2; } },
  glass: { icon: '🔮', name: '유리 대포', short: '유리대포', cat: '하이리스크', color: '#e040fb', curse: true, desc: ['공격력 ×1.85 폭증', '최대 체력 30% 감소'], apply(s) { s.damage *= 1.85; s.maxHp *= 0.7; } },
  leech: { icon: '🧛', name: '흡혈 박쥐', short: '흡혈', cat: 'ROUNDS 엽기', color: '#ff1744', desc: ['적에게 입힌 피해의 45%만큼', '내 탱크 체력을 즉시 회복'], apply(s) { s.leech += 0.45; } },
  phoenix: { icon: '🔥', name: '불사조 부활', short: '부활', cat: 'ROUNDS 엽기', color: '#ff6d00', desc: ['라운드당 1회 사망 시 불길과 함께', '체력 40%로 즉시 부활'], apply(s) { s.phoenix += 1; } },
  volcano: { icon: '🌋', name: '화산 분화', short: '화산', cat: '대환장 난장판', color: '#ff3d00', desc: ['착탄 지점에서 용암 불덩이 5개가', '사방으로 솟구쳐 지형 초토화'], apply(s) { s.volcano += 1; addHook(s, 'onExplode', hookVolcano); } },
  nuke: { icon: '☢️', name: '전술 핵탄두', short: '핵폭탄', cat: '대환장 난장판', color: '#c6ff00', desc: ['폭발 반경 ×2.1배 초대형 분화구!', '공격력 ×1.35 증가'], apply(s) { s.nuke += 1; s.blastRadius *= 2.1; s.damage *= 1.35; s.shellSize *= 1.5; } },
  meteor: { icon: '☄️', name: '유성우 폭격', short: '유성우', cat: '대환장 난장판', color: '#ff9100', desc: ['폭발 후 하늘에서 맵 전체로', '무작위 운석 4발이 쏟아짐'], apply(s) { s.meteor += 1; addHook(s, 'onExplode', hookMeteor); } },
  mine: { icon: '🧨', name: '집속 지뢰', short: '지뢰', cat: '대환장 난장판', color: '#ff5252', desc: ['착탄 지점 주변에 밟으면 터지는', '근접 지뢰 4개를 흩뿌림'], apply(s) { s.mine += 1; addHook(s, 'onExplode', hookMine); } },
  lightning: { icon: '⚡', name: '연쇄 번개', short: '번개', cat: '대환장 난장판', color: '#00e5ff', desc: ['착탄 지점 반경 340px 내 적에게', '하늘에서 강력한 감전 벼락'], apply(s) { s.lightning += 1; addHook(s, 'onExplode', hookLightning); } },
  buckshot: { icon: '💥', name: '샷건 산탄포', short: '산탄포', cat: '대환장 난장판', color: '#ffd740', desc: ['한 번에 산탄 6발을 부채꼴로', '쏟아부어 전장을 벌집으로 만듦'], apply(s) { s.buckshot += 1; s.shots += 5; s.shotDelay = 0.02; s.damage *= 0.36; } },
  ufo: { icon: '🛸', name: 'UFO 납치 광선', short: 'UFO', cat: '대환장 난장판', color: '#ea80fc', desc: ['착탄 상공에 UFO가 나타나 적을', '공중으로 들어올렸다 내동댕이침'], apply(s) { s.ufo += 1; addHook(s, 'onExplode', hookUfo); } },
  chainbomb: { icon: '💣', name: '연쇄 유폭탄', short: '연쇄폭발', cat: '대환장 난장판', color: '#ff6e40', desc: ['첫 폭발 뒤 진행 방향으로', '2차·3차 연쇄 폭발이 도미노 발생'], apply(s) { s.chainbomb += 1; addHook(s, 'onExplode', hookChainBomb); } },
  twister: { icon: '🌪️', name: '회오리 포탄', short: '회오리', cat: '대환장 난장판', color: '#84ffff', desc: ['비행 중 보급 상자를 자동 흡수하고', '착탄 시 적을 회오리로 날려버림'], apply(s) { s.twister += 1; addHook(s, 'onUpdate', hookTwisterUpdate); addHook(s, 'onExplode', hookTwisterExplode); } },
  jackpot: { icon: '🎰', name: '룰렛 대박탄', short: '룰렛탄', cat: '대환장 난장판', color: '#ffd54f', desc: ['발사마다 무작위로 0.55배(꽝) ~', '최대 2.8배(잭팟!) 위력으로 폭발'], apply(s) { s.jackpot += 1; addHook(s, 'onFire', hookJackpot); } },
};

const CARD_POOL = Object.keys(CARD_DEFS);
function computeStats(cardIds) {
  const s = newStats();
  const ids = cardIds.slice().sort((a, b) => CARD_POOL.indexOf(a) - CARD_POOL.indexOf(b));
  for (const id of ids) CARD_DEFS[id].apply(s);
  s.maxHp = Math.max(30, Math.round(s.maxHp));
  return s;
}
