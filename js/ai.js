'use strict';

/* ============================ 1:1 AI 대전 ============================ */
const AI_LEVELS = {
  easy: { name: '쉬움', icon: '🐣', color: '#69f0ae', angleErr: 13, powerErr: 14, think: 1.1, desc: '자주 빗나가요. 처음이라면 여기부터' },
  normal: { name: '보통', icon: '🤖', color: '#4fc3f7', angleErr: 5.5, powerErr: 6, think: 0.8, desc: '몇 발 안에 맞히는 상대' },
  hard: { name: '어려움', icon: '💀', color: '#ff5252', angleErr: 0.5, powerErr: 0.5, think: 0.6, desc: '바람까지 계산하는 명사수' }
};
const AI_ID = 1;

const aiOn = () => !!G.ai && !Net.active;
const isAi = p => aiOn() && p.id === AI_ID;
// 지금 이 기기의 사람이 카드를 고를 차례인지
const humanCanPick = () => Net.active ? G.cardLoser === Net.myId : !(aiOn() && G.cardLoser === AI_ID);

// 포탄 궤적을 미리 계산해서 목표와 얼마나 가까이 떨어지는지 점수화 (작을수록 좋음)
function simulateShot(p, target, angle, power) {
  const st = p.stats, a = angle * Math.PI / 180;
  const saved = p.angle;
  p.angle = angle;
  const m = muzzlePos(p, a);
  p.angle = saved;
  const sp = power / 100 * MAX_SHELL_SPEED * st.shellSpeed * mapSpeed(), dt = 1 / 60;
  let x = m.x, y = m.y, vx = Math.cos(a) * sp, vy = -Math.sin(a) * sp;
  const tx = target.x, ty = target.y - 14 * target.stats.tankScale;
  const r = 4 * st.shellSize;
  for (let i = 0; i < 600; i++) {
    vx += G.wind * G.windAccel * dt; vy += G.gravity * dt;
    const ox = x, oy = y;
    x += vx * dt; y += vy * dt;
    const n = Math.max(1, Math.ceil(Math.hypot(x - ox, y - oy) / 7));
    for (let k = 1; k <= n; k++) {
      const px = ox + (x - ox) * k / n, py = oy + (y - oy) * k / n;
      if (hitsTank(px, py, r, target)) return i * 0.01;
      const hitSelf = i > 15 && hitsTank(px, py, r, p);
      if (hitSelf || px < 0 || px >= WW) return 3000;
      if ((py >= 0 && Terrain.solid(px, py)) || barrelHit(px, py, r) || py >= H) {
        const self = Math.hypot(px - p.x, py - (p.y - 14));
        const danger = self < st.blastRadius * p.radiusBoost + 35 ? 1500 : 0;
        return Math.hypot(px - tx, py - ty) + i * 0.01 + danger;
      }
    }
  }
  return 3000;
}

function newBot() {
  const level = AI_LEVELS[G.ai];
  const bot = {
    key: `${G.round}:${G.turnCount}`, phase: 'think', t: 0, moveDir: 0, moveT: 0,
    jobs: [], next: 0, best: { score: Infinity, angle: 135, power: 55 }, refined: false, power: 0, level
  };
  // 가끔 자리를 옮겨서 가만히 서 있는 표적이 되지 않게 함
  const p = players[AI_ID];
  const barrel = G.barrels.find(b => Math.abs(b.x - p.x) < 75);
  if (barrel) { bot.moveDir = barrel.x > p.x ? -1 : 1; bot.moveT = 0.7; }
  else if (Math.random() < 0.35) { bot.moveDir = Math.random() < 0.5 ? -1 : 1; bot.moveT = 0.25 + Math.random() * 0.4; }
  return bot;
}

function updateBot(p, dt) {
  if (!G.bot || G.bot.key !== `${G.round}:${G.turnCount}`) G.bot = newBot();
  const b = G.bot;
  const target = players[0];
  b.t += dt;

  if (b.phase === 'think') {
    if (b.moveT > 0 && p.fuel > 0 && !p.air) {
      b.moveT -= dt;
      const biome = BIOME_DEFS[G.biome] || BIOME_DEFS.grass;
      const moved = moveTankX(p, b.moveDir * Math.min(MOVE_SPEED * biome.speedMult * dt, p.fuel));
      p.fuel = Math.max(0, p.fuel - moved * biome.fuelMult);
    } else if (b.t >= b.level.think && !p.air) {
      for (let angle = 10; angle <= 170; angle += 3) {
        for (let power = 20; power <= 100; power += 2.5) b.jobs.push([angle, power]);
      }
      b.phase = 'solve';
    }
    return;
  }

  if (b.phase === 'solve') {
    // 렉이 없도록 여러 프레임에 나눠 계산
    const end = Math.min(b.jobs.length, b.next + 110);
    for (; b.next < end; b.next++) {
      const [angle, power] = b.jobs[b.next];
      const score = simulateShot(p, target, angle, power);
      if (score < b.best.score) b.best = { score, angle, power };
    }
    if (b.next < b.jobs.length) return;
    if (!b.refined) {
      b.refined = true;
      const { angle, power } = b.best;
      for (let da = -2.5; da <= 2.5; da += 0.5) for (let dp = -2; dp <= 2; dp += 0.5) {
        b.jobs.push([clamp(angle + da, 0, 180), clamp(power + dp, 6, 100)]);
      }
      return;
    }
    // 난이도에 따른 오차 (같은 라운드에서 쏠수록 조금씩 정확해짐)
    const focus = Math.max(0.55, 1 - 0.07 * Math.floor(G.turnCount / 2));
    const noise = () => (Math.random() + Math.random() - 1) * focus;
    b.best.angle = clamp(b.best.angle + noise() * b.level.angleErr * 1.6, 0, 180);
    b.power = clamp(b.best.power + noise() * b.level.powerErr * 1.6, 8, 100);
    b.phase = 'aim';
    return;
  }

  if (b.phase === 'aim') {
    const diff = b.best.angle - p.angle;
    const step = 90 * dt;
    if (Math.abs(diff) > step) { p.angle += Math.sign(diff) * step; return; }
    p.angle = b.best.angle;
    b.phase = 'charge'; b.t = 0; b.c = 0;
    Sfx.chargeStart();
    return;
  }

  if (b.phase === 'charge') {
    b.c = Math.min(b.power, b.c + 70 * dt);
    p.charging = true; p.charge = b.c;
    Sfx.chargeUpdate(b.c);
    if (b.c >= b.power) {
      b.phase = 'done';
      if (Math.random() < 0.15) showEmote(AI_ID, 2);
      fire(p);
    }
  }
}

function botCardChoice() {
  const p = players[AI_ID];
  const smart = G.ai === 'hard' ? 2.5 : G.ai === 'normal' ? 1.4 : 0.3;
  let best = 0, bestScore = -Infinity;
  G.choices.forEach((id, i) => {
    let score = RARITY[rarityOf(id)].stars * smart + Math.random() * 3;
    if (newSynergyFor(p, id)) score += smart * 1.5;
    if (G.deal && G.deal.index === i) score -= 2;
    if (score > bestScore) { bestScore = score; best = i; }
  });
  return best;
}
