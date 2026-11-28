'use strict';

/* ============================ 전설·영웅 카드 전용 연출 ============================
   각 필드는 update(f, dt) 가 false 를 돌려주면 사라짐.
   피해·지형 판정은 f.t 기준으로만 결정해서 온라인에서도 같은 결과가 나옴. */

const CUTIN_TIME = 1.05;
function legendCutin(owner, id) {
  G.cutin = { id, color: owner.color, name: owner.name, t: 0, dur: CUTIN_TIME + 0.1 };
  Sfx.synergy();
}

function spawnLegend(type, ctx_, owner, lv, extra = {}) {
  const x = clamp(ctx_.x, 30, WW - 30);
  // 전설은 발동 알림(컷인)이 지나간 뒤에 연출 시작
  const t = type === 'train' || type === 'reaper' ? 0 : -CUTIN_TIME;
  G.fields.push(Object.assign({ type, x, y: Math.min(ctx_.y, H - BEDROCK), owner, lv, t, focus: true, done: {} }, extra));
}

const groundAt = x => Terrain.h(clamp(Math.round(x), 0, WW - 1));
const dirToEnemy = (owner, x) => x >= owner.x ? 1 : -1;
// 한 필드에서 같은 탱크는 한 번만 맞힘
function hitOnce(f, p, damage, color) {
  if (f.done[p.id]) return false;
  f.done[p.id] = true;
  damageTank(p, damage, color, f.owner);
  return true;
}
function once(f, key) {
  if (f.done[key]) return false;
  f.done[key] = true;
  return true;
}
function launch(p, vx, vy) { p.air = true; p.vx += vx; p.vy = vy; }

/* ---------- 용의 강림: 용이 하늘에서 내리꽂힘 ---------- */
const DRAGON_HIT = 1.35;
function dragonPoint(f, t) {
  const k = clamp(t / DRAGON_HIT, 0, 1), e = k * k * (1.6 - 0.6 * k); // 갈수록 가속
  const sx = f.x - f.dir * 960, sy = 250 - (WW - W) * 0.2; // 화면 옆에서 날아 들어옴
  const cx = f.x - f.dir * 40, cy = sy - 210;
  const a = (1 - e) ** 2, b = 2 * (1 - e) * e, c = e * e;
  const wig = Math.sin(t * 13) * 46 * (1 - e);
  return { x: a * sx + b * cx + c * f.x + wig * 0.3, y: a * sy + b * cy + c * (f.y - 12) + wig };
}

function drawDragon(f) {
  const fade = f.t < DRAGON_HIT ? 1 : clamp(1 - (f.t - DRAGON_HIT) / 0.35, 0, 1);
  ctx.save();
  if (fade > 0) {
    ctx.globalAlpha = fade;
    // 몸통: 머리가 지나온 길을 따라 마디가 이어짐
    for (let i = 26; i >= 1; i--) {
      const p = dragonPoint(f, Math.min(f.t, DRAGON_HIT) - i * 0.026);
      if (f.t - i * 0.026 < 0) continue;
      const r = 30 - i * 0.85;
      ctx.fillStyle = '#ffd54f';
      ctx.beginPath(); ctx.moveTo(p.x - 7, p.y - r + 3); ctx.lineTo(p.x, p.y - r - 14); ctx.lineTo(p.x + 7, p.y - r + 3); ctx.fill();
      ctx.fillStyle = i % 2 ? '#d84315' : '#bf360c';
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffab40'; ctx.beginPath(); ctx.arc(p.x, p.y + r * 0.42, r * 0.5, 0, TAU); ctx.fill();
    }
    const head = dragonPoint(f, f.t), prev = dragonPoint(f, f.t - 0.05);
    const ang = Math.atan2(head.y - prev.y, head.x - prev.x);
    // 날개
    const wing = dragonPoint(f, Math.max(0, Math.min(f.t, DRAGON_HIT) - 0.2));
    const flap = Math.sin(f.t * 17) * 0.45;
    for (const side of [-1, 1]) {
      ctx.save(); ctx.translate(wing.x, wing.y); ctx.rotate(ang + side * (1.75 + flap));
      ctx.fillStyle = side < 0 ? '#8e1c00' : '#e64a19';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(80, -50 * side, 160, -8 * side);
      ctx.lineTo(118, 8 * side); ctx.lineTo(126, 42 * side); ctx.lineTo(80, 26 * side); ctx.lineTo(70, 58 * side); ctx.lineTo(30, 22 * side); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#ffca28'; ctx.lineWidth = 3; ctx.stroke();
      ctx.restore();
    }
    // 머리
    ctx.save(); ctx.translate(head.x, head.y); ctx.rotate(ang);
    if (Math.cos(ang) < 0) ctx.scale(1, -1);
    ctx.fillStyle = '#ffe082';
    for (const oy of [-26, -12]) { ctx.beginPath(); ctx.moveTo(-10, oy); ctx.lineTo(-62, oy - 24); ctx.lineTo(-24, oy + 10); ctx.fill(); }
    ctx.fillStyle = '#e64a19';
    ctx.beginPath(); ctx.moveTo(-30, -28); ctx.lineTo(20, -24); ctx.lineTo(66, -10); ctx.lineTo(62, 0); ctx.lineTo(10, 2); ctx.lineTo(-30, 12); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#bf360c';
    ctx.beginPath(); ctx.moveTo(-18, 8); ctx.lineTo(54, 20); ctx.lineTo(38, 32); ctx.lineTo(-24, 24); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff';
    for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(14 + i * 10, 0); ctx.lineTo(19 + i * 10, 11); ctx.lineTo(24 + i * 10, 0); ctx.fill(); }
    ctx.fillStyle = '#ffff00'; ctx.beginPath(); ctx.ellipse(8, -13, 9, 6, 0.2, 0, TAU); ctx.fill();
    ctx.fillStyle = '#210000'; ctx.fillRect(9, -18, 3, 10);
    // 입에서 뿜는 불
    ctx.globalCompositeOperation = 'lighter';
    for (const [len, w, col] of [[130, 34, 'rgba(255,61,0,0.45)'], [90, 20, 'rgba(255,171,0,0.7)'], [50, 9, 'rgba(255,255,200,0.9)']]) {
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(52, 8); ctx.lineTo(52 + len + Math.sin(f.t * 40) * 14, 8 - w); ctx.lineTo(52 + len, 8 + w); ctx.fill();
    }
    ctx.restore();
  }
  // 착탄 후 불기둥과 지면을 휩쓰는 화염
  if (f.t >= DRAGON_HIT) {
    const k = (f.t - DRAGON_HIT) / 1.1;
    ctx.globalAlpha = clamp(1 - k, 0, 1);
    ctx.globalCompositeOperation = 'lighter';
    const rise = Math.min(1, k * 3.5);
    for (const [w, col] of [[150, 'rgba(255,61,0,0.45)'], [84, 'rgba(255,145,0,0.65)'], [34, 'rgba(255,245,180,0.95)']]) {
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.moveTo(f.x - w / 2, f.y + 10);
      ctx.quadraticCurveTo(f.x - w * 0.3 + Math.sin(f.t * 31) * 12, f.y - 260 * rise, f.x, f.y - 520 * rise);
      ctx.quadraticCurveTo(f.x + w * 0.3 + Math.sin(f.t * 27) * 12, f.y - 260 * rise, f.x + w / 2, f.y + 10);
      ctx.fill();
    }
    const reach = Math.min(1, k * 2) * (250 + f.lv * 30);
    for (let i = -10; i <= 10; i++) {
      const gx = f.x + reach * i / 10;
      if (gx < 0 || gx >= WW) continue;
      const gy = groundAt(gx), hh = 30 + Math.abs(Math.sin(f.t * 19 + i * 2.1)) * 46;
      ctx.fillStyle = i % 2 ? 'rgba(255,109,0,0.8)' : 'rgba(255,200,40,0.75)';
      ctx.beginPath(); ctx.moveTo(gx - 17, gy + 3); ctx.lineTo(gx + Math.sin(f.t * 12 + i) * 8, gy - hh); ctx.lineTo(gx + 17, gy + 3); ctx.fill();
    }
  }
  ctx.restore();
}

function updateDragon(f, dt) {
  if (f.t < DRAGON_HIT) {
    if (once(f, 'roar')) Sfx.phoenix();
    const p = dragonPoint(f, f.t);
    P(p.x, p.y, fxRand(-60, 60), fxRand(-60, 30), { life: 0.45, size: 7, color: Math.random() < 0.5 ? '#ff6d00' : '#ffd54f', grav: -0.1 });
    return true;
  }
  if (once(f, 'slam')) {
    explode({ x: f.x, y: f.y, radius: 88 + f.lv * 12, damage: 34 + f.lv * 9 }, f.owner);
    G.screenFlash = 0.75; G.shake = Math.max(G.shake, 38); Sfx.nuke();
    burst(f.x, f.y - 20, 60, { colors: FIRE_COLORS, speed: 640, life: 1.1, size: 5, kind: 'spark' });
  }
  const reach = Math.min(1, (f.t - DRAGON_HIT) / 0.55) * (250 + f.lv * 30);
  for (const e of hostileTanks(f.owner)) {
    if (Math.abs(e.x - f.x) <= reach && hitOnce(f, e, 12 + f.lv * 4, '#ff6d00')) launch(e, (e.x >= f.x ? 1 : -1) * 160, -260);
  }
  return f.t < DRAGON_HIT + 1.1;
}

/* ---------- 별의 심판: 별자리를 그린 뒤 심판의 빛 ---------- */
const JUDGE_STARS = 7, JUDGE_HIT = 2.0;
const judgeCenter = f => ({ x: f.x, y: Math.max(240, f.y - 290) });
function judgePoint(f, i) {
  const c = judgeCenter(f), a = -Math.PI / 2 + i * TAU / JUDGE_STARS;
  return { x: c.x + Math.cos(a) * 180, y: c.y + Math.sin(a) * 180 };
}
function starShape(x, y, r, spin) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = spin + i * Math.PI / 4, rad = i % 2 ? r * 0.26 : r;
    ctx.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
  }
  ctx.closePath(); ctx.fill();
}
function drawJudgement(f) {
  const c = judgeCenter(f);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  if (f.t < JUDGE_HIT) {
    const gather = clamp((f.t - 1.5) / (JUDGE_HIT - 1.5), 0, 1), pts = [];
    for (let i = 0; i < JUDGE_STARS; i++) {
      const p = judgePoint(f, i);
      pts.push({ x: lerp(p.x, c.x, gather), y: lerp(p.y, c.y, gather) });
    }
    // 별을 세 칸씩 이어 칠각별을 한 획씩 그림
    const drawn = clamp((f.t - 0.45) / 0.9, 0, 1) * JUDGE_STARS;
    ctx.strokeStyle = 'rgba(179,229,252,0.85)'; ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i < drawn; i++) {
      const a = pts[(i * 3) % JUDGE_STARS], b = pts[(i * 3 + 3) % JUDGE_STARS], k = Math.min(1, drawn - i);
      ctx.moveTo(a.x, a.y); ctx.lineTo(lerp(a.x, b.x, k), lerp(a.y, b.y, k));
    }
    ctx.stroke();
    pts.forEach((p, i) => {
      const k = clamp((f.t - i * 0.07) / 0.2, 0, 1);
      if (!k) return;
      ctx.fillStyle = 'rgba(100,180,255,0.35)'; ctx.beginPath(); ctx.arc(p.x, p.y, 22 * k, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffffff'; starShape(p.x, p.y, 20 * k, f.t * 2);
    });
    ctx.fillStyle = 'rgba(255,236,140,0.9)'; starShape(c.x, c.y, gather * 90, -f.t * 3);
    // 조준선
    ctx.strokeStyle = 'rgba(255,241,118,0.5)'; ctx.lineWidth = 2; ctx.setLineDash([8, 10]);
    ctx.beginPath(); ctx.ellipse(f.x, f.y, 150 - gather * 60, 22 - gather * 8, 0, 0, TAU); ctx.stroke();
  } else {
    const k = clamp(1 - (f.t - JUDGE_HIT) / 0.9, 0, 1);
    ctx.globalAlpha = k;
    for (let i = -2; i <= 2; i++) {
      const bx = f.x + i * 105, by = groundAt(bx);
      const main = i === 0;
      for (const [w, col] of [[main ? 150 : 46, 'rgba(64,196,255,0.35)'], [main ? 82 : 24, 'rgba(255,236,140,0.65)'], [main ? 30 : 8, '#ffffff']]) {
        ctx.strokeStyle = col; ctx.lineWidth = w * (0.35 + 0.65 * k);
        ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(bx, by); ctx.stroke();
      }
    }
    ctx.fillStyle = '#fffde7'; starShape(c.x, c.y, 130 * k + 20, f.t * 4);
  }
  ctx.restore();
}
function updateJudgement(f) {
  for (let i = 0; i < JUDGE_STARS; i++) if (f.t >= i * 0.07 && once(f, 'ding' + i)) Sfx.pop();
  if (f.t >= 1.5 && once(f, 'charge')) Sfx.siren();
  if (f.t >= JUDGE_HIT && once(f, 'smite')) {
    for (let i = -2; i <= 2; i++) {
      const bx = clamp(f.x + i * 105, 10, WW - 10);
      explode({ x: bx, y: groundAt(bx), radius: i ? 44 : 100 + f.lv * 10, damage: i ? 11 + f.lv * 3 : 34 + f.lv * 9 }, f.owner);
    }
    G.screenFlash = 0.9; G.shake = Math.max(G.shake, 34); Sfx.nuke();
    burst(f.x, f.y - 10, 50, { colors: ['#ffffff', '#fff59d', '#80d8ff'], speed: 620, life: 1.0, size: 4, grav: 0.4, kind: 'spark' });
  }
  return f.t < JUDGE_HIT + 0.9;
}

/* ---------- 궤도 폭격 위성: 한 줄기 광선이 지면을 가르며 휩씀 ---------- */
const SWEEP_START = 0.9, SWEEP_TIME = 1.3;
function sweepX(f, k) {
  const span = 170 + f.lv * 40;
  return clamp(f.x + f.dir * (k * 2 - 1) * span, 12, WW - 12);
}
function drawSweep(f) {
  ctx.save();
  const top = -900;
  if (f.t < SWEEP_START) {
    const a = sweepX(f, 0), b = sweepX(f, 1);
    ctx.strokeStyle = '#ff1744'; ctx.lineWidth = 3; ctx.globalAlpha = 0.45 + 0.4 * Math.sin(f.t * 34);
    ctx.beginPath(); ctx.moveTo(sweepX(f, 0), top); ctx.lineTo(a, groundAt(a)); ctx.stroke();
    ctx.setLineDash([12, 8]); ctx.beginPath(); ctx.moveTo(a, f.y); ctx.lineTo(b, f.y); ctx.stroke(); ctx.setLineDash([]);
    for (const x of [a, b]) { ctx.beginPath(); ctx.arc(x, groundAt(x), 26, 0, TAU); ctx.stroke(); }
  } else {
    const k = (f.t - SWEEP_START) / SWEEP_TIME;
    const x = sweepX(f, clamp(k, 0, 1)), y = groundAt(x);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = k <= 1 ? 1 : clamp(1 - (k - 1) * 4, 0, 1);
    const flick = 1 + Math.sin(f.t * 60) * 0.14;
    for (const [w, col] of [[92, 'rgba(255,23,68,0.3)'], [54, 'rgba(255,64,129,0.55)'], [28, 'rgba(255,170,200,0.85)'], [10, '#ffffff']]) {
      ctx.fillStyle = col; ctx.fillRect(x - w * flick / 2, top, w * flick, y - top);
    }
    ctx.beginPath(); ctx.fillStyle = 'rgba(255,230,240,0.9)'; ctx.arc(x, y, 34 * flick, 0, TAU); ctx.fill();
  }
  ctx.restore();
}
function updateSweep(f) {
  if (f.t < SWEEP_START) return true;
  if (once(f, 'fire')) { Sfx.lightning(); Sfx.siren(); }
  const k = clamp((f.t - SWEEP_START) / SWEEP_TIME, 0, 1);
  if (k < 1 || once(f, 'last')) {
    const x = sweepX(f, k);
    for (let s = 0; s <= 11; s++) {
      if (k >= s / 11 && once(f, 'cut' + s)) {
        const cx = sweepX(f, s / 11), cy = groundAt(cx);
        Terrain.carve(cx, cy + 6, 24 + f.lv * 3);
        igniteBarrels(cx, cy - 14, 40);
        burst(cx, cy, 12, { colors: ['#ff1744', '#ff80ab', '#ffffff'], speed: 380, life: 0.6, size: 3.5, kind: 'spark' });
      }
    }
    for (const e of hostileTanks(f.owner)) {
      if (Math.abs(e.x - x) < 24 + 20 * e.stats.tankScale) hitOnce(f, e, 36 + f.lv * 9, '#ff4081');
    }
    G.shake = Math.max(G.shake, 12);
  }
  return f.t < SWEEP_START + SWEEP_TIME + 0.25;
}

/* ---------- 하늘 고래: 거대한 고래가 추락하며 해일 ---------- */
const WHALE_HIT = 1.4;
function drawWhale(f) {
  ctx.save();
  const k = clamp(f.t / WHALE_HIT, 0, 1);
  if (f.t < WHALE_HIT) {
    // 바닥 그림자가 점점 커짐
    ctx.fillStyle = `rgba(0,10,40,${0.15 + k * 0.35})`;
    ctx.beginPath(); ctx.ellipse(f.x, f.y, 50 + k * 130, 8 + k * 14, 0, 0, TAU); ctx.fill();
  }
  const start = -480 - (WW - W) * 0.3;
  const y = f.t < WHALE_HIT ? lerp(start, f.y - 70, k * k) : f.y - 70 + (f.t - WHALE_HIT) * 130;
  ctx.globalAlpha = f.t < WHALE_HIT ? 1 : clamp(1 - (f.t - WHALE_HIT) / 0.5, 0, 1);
  if (ctx.globalAlpha > 0) {
    ctx.translate(f.x, y);
    ctx.scale(f.dir, 1);
    ctx.rotate(lerp(-0.25, 1.05, k));
    const g = ctx.createLinearGradient(0, -80, 0, 80);
    g.addColorStop(0, '#0d47a1'); g.addColorStop(0.55, '#1e88e5'); g.addColorStop(1, '#b3e5fc');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(150, 8); ctx.bezierCurveTo(140, -86, -30, -90, -110, -24); ctx.quadraticCurveTo(-150, -6, -185, -14);
    ctx.lineTo(-232, -58 + Math.sin(f.t * 9) * 8); ctx.quadraticCurveTo(-205, -4, -232, 48 + Math.sin(f.t * 9) * 8);
    ctx.lineTo(-180, 12); ctx.bezierCurveTo(-70, 82, 120, 90, 150, 8);
    ctx.fill();
    ctx.strokeStyle = '#e1f5fe'; ctx.lineWidth = 2.5;
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(138 - i * 6, 20 + i * 12); ctx.quadraticCurveTo(60, 38 + i * 15, -30 - i * 4, 34 + i * 9); ctx.stroke(); }
    ctx.fillStyle = '#1565c0'; ctx.beginPath(); ctx.moveTo(10, 28); ctx.quadraticCurveTo(-30, 112, -72, 108); ctx.quadraticCurveTo(-40, 62, -34, 30); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(88, -14, 9, 0, TAU); ctx.fill();
    ctx.fillStyle = '#0a1030'; ctx.beginPath(); ctx.arc(91, -13, 5, 0, TAU); ctx.fill();
  }
  ctx.restore();
  if (f.t >= WHALE_HIT) {
    const w = f.t - WHALE_HIT, reach = w * 520;
    ctx.save();
    ctx.globalAlpha = clamp(1 - w / 0.9, 0, 1);
    for (const side of [-1, 1]) {
      const x = f.x + side * reach;
      if (x < 0 || x >= WW) continue;
      const gy = groundAt(x), h = 130 * clamp(1 - w / 1.1, 0.2, 1);
      ctx.fillStyle = 'rgba(41,182,246,0.8)';
      ctx.beginPath(); ctx.moveTo(x - side * 130, gy + 4); ctx.quadraticCurveTo(x - side * 20, gy - h * 0.4, x + side * 6, gy - h);
      ctx.quadraticCurveTo(x + side * 62, gy - h * 0.7, x + side * 30, gy + 4); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 5; ctx.stroke();
    }
    ctx.restore();
  }
}
function updateWhale(f) {
  if (once(f, 'call')) Sfx.ufo();
  if (f.t < WHALE_HIT) return true;
  if (once(f, 'crash')) {
    explode({ x: f.x, y: f.y, radius: 115 + f.lv * 14, damage: 36 + f.lv * 10 }, f.owner);
    G.screenFlash = 0.6; G.shake = Math.max(G.shake, 44); Sfx.nuke();
    burst(f.x, f.y - 20, 90, { colors: ['#e1f5fe', '#4fc3f7', '#0288d1', '#ffffff'], speed: 720, life: 1.3, size: 5, kind: 'spark' });
  }
  const reach = (f.t - WHALE_HIT) * 520;
  if (reach < 430) {
    for (const e of hostileTanks(f.owner)) {
      if (Math.abs(e.x - f.x) <= reach && hitOnce(f, e, 10 + f.lv * 4, '#4fc3f7')) launch(e, (e.x >= f.x ? 1 : -1) * 380, -360);
    }
  }
  return f.t < WHALE_HIT + 0.9;
}

/* ---------- 성검 강림: 거대한 검이 꽂히고 검기가 퍼짐 ---------- */
const SWORD_HIT = 1.15;
function drawExcalibur(f) {
  ctx.save();
  const out = clamp((f.t - SWORD_HIT - 0.8) / 0.4, 0, 1);
  // 바닥 마법진
  ctx.globalAlpha = (1 - out) * Math.min(1, f.t * 3);
  ctx.strokeStyle = '#ffe082'; ctx.lineWidth = 3;
  for (const r of [105, 78]) { ctx.beginPath(); ctx.ellipse(f.x, f.y, r, r * 0.2, 0, 0, TAU); ctx.stroke(); }
  for (let i = 0; i < 6; i++) {
    const a = f.t * 2.4 + i * TAU / 6, b = a + TAU / 3;
    ctx.beginPath(); ctx.moveTo(f.x + Math.cos(a) * 105, f.y + Math.sin(a) * 21); ctx.lineTo(f.x + Math.cos(b) * 105, f.y + Math.sin(b) * 21); ctx.stroke();
  }
  const high = Math.max(60, f.y - 560);
  const fall = clamp((f.t - 0.8) / (SWORD_HIT - 0.8), 0, 1);
  const tip = lerp(high, f.y + 26, fall * fall * fall);
  ctx.globalAlpha = (1 - out) * clamp(f.t / 0.5, 0, 1);
  ctx.translate(f.x, tip);
  ctx.shadowColor = '#ffd54f'; ctx.shadowBlur = 28;
  const g = ctx.createLinearGradient(-26, 0, 26, 0);
  g.addColorStop(0, '#90caf9'); g.addColorStop(0.5, '#ffffff'); g.addColorStop(1, '#64b5f6');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(25, -48); ctx.lineTo(21, -250); ctx.lineTo(-21, -250); ctx.lineTo(-25, -48); ctx.closePath(); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#ffca28'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(0, -30); ctx.lineTo(0, -244); ctx.stroke();
  ctx.fillStyle = '#ffb300';
  ctx.beginPath(); ctx.moveTo(-70, -272); ctx.quadraticCurveTo(0, -236, 70, -272); ctx.lineTo(62, -246); ctx.quadraticCurveTo(0, -226, -62, -246); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#4e342e'; ctx.fillRect(-9, -326, 18, 66);
  ctx.fillStyle = '#ffd54f'; ctx.beginPath(); ctx.arc(0, -336, 15, 0, TAU); ctx.fill();
  ctx.fillStyle = '#d50000'; ctx.beginPath(); ctx.arc(0, -258, 9, 0, TAU); ctx.fill();
  ctx.restore();
  if (f.t >= SWORD_HIT) {
    const w = f.t - SWORD_HIT, k = clamp(1 - w / 0.8, 0, 1);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = k;
    ctx.fillStyle = 'rgba(255,224,130,0.6)';
    ctx.fillRect(f.x - 46 * k, f.y - 700, 92 * k, 710);
    ctx.fillRect(f.x - 300, f.y - 130 - 12 * k, 600, 24 * k);
    const reach = Math.min(440, w * 760);
    for (const side of [-1, 1]) {
      const x = clamp(f.x + side * reach, 0, WW - 1), gy = groundAt(x);
      ctx.strokeStyle = '#fff3a0'; ctx.lineWidth = 12;
      ctx.beginPath(); ctx.arc(x - side * 42, gy - 46, 62, side > 0 ? -1.15 : Math.PI - 1.15, side > 0 ? 1.15 : Math.PI + 1.15); ctx.stroke();
    }
    ctx.restore();
  }
}
function updateExcalibur(f) {
  if (once(f, 'sing')) Sfx.phoenix();
  if (f.t < SWORD_HIT) return true;
  if (once(f, 'stab')) {
    explode({ x: f.x, y: f.y, radius: 82 + f.lv * 10, damage: 36 + f.lv * 10 }, f.owner);
    G.screenFlash = 0.8; G.shake = Math.max(G.shake, 36); Sfx.lightning();
  }
  const reach = Math.min(440, (f.t - SWORD_HIT) * 760);
  for (const e of hostileTanks(f.owner)) {
    if (Math.abs(e.x - f.x) <= reach) hitOnce(f, e, 15 + f.lv * 5, '#ffe082');
  }
  return f.t < SWORD_HIT + 1.2;
}

/* ---------- 대지의 거신: 땅속에서 거대한 주먹이 솟구침 ---------- */
const TITAN_HIT = 1.0;
function drawTitan(f) {
  ctx.save();
  const base = f.base;
  if (f.t < TITAN_HIT) {
    // 갈라지는 땅
    const k = f.t / TITAN_HIT;
    ctx.strokeStyle = '#ff9100'; ctx.lineWidth = 4;
    for (let i = 0; i < 7; i++) {
      const dir = i - 3;
      ctx.beginPath(); ctx.moveTo(f.x, base);
      ctx.lineTo(f.x + dir * 22 * k + Math.sin(i * 5) * 8, base + 10 + (i % 3) * 5);
      ctx.lineTo(f.x + dir * 46 * k, base + 4 + (i % 2) * 14);
      ctx.stroke();
    }
    ctx.fillStyle = `rgba(255,145,0,${0.2 + 0.2 * Math.sin(f.t * 30)})`;
    ctx.beginPath(); ctx.ellipse(f.x, base, 90 * k, 16 * k, 0, 0, TAU); ctx.fill();
  } else {
    const w = f.t - TITAN_HIT;
    const up = w < 0.18 ? w / 0.18 : w < 0.8 ? 1 : clamp(1 - (w - 0.8) / 0.45, 0, 1);
    ctx.beginPath(); ctx.rect(f.x - 200, base - 700, 400, 716); ctx.clip();
    ctx.translate(f.x, base + 300 - up * 400);
    const g = ctx.createLinearGradient(-80, 0, 80, 0);
    g.addColorStop(0, '#4e342e'); g.addColorStop(0.45, '#a1887f'); g.addColorStop(1, '#5d4037');
    ctx.fillStyle = g; ctx.strokeStyle = '#2b1b14'; ctx.lineWidth = 4;
    rr(-44, 40, 88, 320, 18); ctx.fill(); ctx.stroke(); // 팔
    rr(-76, -52, 152, 112, 28); ctx.fill(); ctx.stroke(); // 주먹
    for (let i = 0; i < 4; i++) { rr(-74 + i * 37, -92, 35, 62, 15); ctx.fill(); ctx.stroke(); }
    rr(54, -8, 48, 66, 20); ctx.fill(); ctx.stroke(); // 엄지
    ctx.strokeStyle = '#ffab40'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-50, -10); ctx.lineTo(-14, 18); ctx.lineTo(-30, 48); ctx.moveTo(22, 66); ctx.lineTo(2, 130); ctx.lineTo(24, 190); ctx.stroke();
  }
  ctx.restore();
}
function updateTitan(f) {
  if (f.t < TITAN_HIT) {
    G.shake = Math.max(G.shake, 3 + f.t * 9);
    if (once(f, 'rumble')) Sfx.drill();
    return true;
  }
  if (once(f, 'punch')) {
    G.screenFlash = 0.4; G.shake = Math.max(G.shake, 40); Sfx.explosion(130); Sfx.thud();
    burst(f.x, f.base, 60, { colors: getDirtColors(), speed: 560, life: 1.2, size: 7, ground: true, spread: 2.2, kind: 'debris' });
    for (const e of hostileTanks(f.owner)) {
      if (Math.abs(e.x - f.x) < 105 && hitOnce(f, e, 42 + f.lv * 11, '#ffab40')) launch(e, (e.x >= f.x ? 1 : -1) * 90, -720);
    }
    Terrain.carve(f.x, f.base + 24, 52);
  }
  return f.t < TITAN_HIT + 1.25;
}

/* ---------- 폭주 열차 (영웅) ---------- */
const TRAIN_WARN = 0.7, TRAIN_SPEED = 950;
const trainFront = f => f.x - f.dir * 620 + f.dir * Math.max(0, f.t - TRAIN_WARN) * TRAIN_SPEED;
function drawTrain(f) {
  ctx.save();
  if (f.t < TRAIN_WARN) {
    ctx.globalAlpha = 0.4 + 0.5 * Math.abs(Math.sin(f.t * 14));
    ctx.strokeStyle = '#ffea00'; ctx.lineWidth = 4; ctx.setLineDash([16, 12]);
    ctx.beginPath();
    for (let i = -12; i <= 12; i++) { const x = clamp(f.x + i * 48, 0, WW - 1); ctx.lineTo(x, groundAt(x) - 8); }
    ctx.stroke(); ctx.setLineDash([]);
    ctx.font = `44px ${FONT}`; ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.fillText('⚠️', f.x, f.y - 90);
  } else {
    const front = trainFront(f);
    for (let car = 3; car >= 0; car--) {
      const x = front - f.dir * car * 92;
      if (x < -60 || x > WW + 60 || Math.abs(x - f.x) > 660) continue;
      const y = groundAt(x), tilt = Math.atan2(groundAt(x + 30) - groundAt(x - 30), 60);
      ctx.save(); ctx.translate(x, y - 6); ctx.rotate(clamp(tilt, -0.6, 0.6)); ctx.scale(f.dir, 1);
      ctx.fillStyle = car ? (car % 2 ? '#1565c0' : '#2e7d32') : '#c62828';
      rr(-42, -50, 84, 40, 8); ctx.fill();
      if (!car) {
        ctx.fillStyle = '#8e0000'; rr(-40, -78, 38, 32, 6); ctx.fill();
        ctx.fillStyle = '#212121'; ctx.fillRect(14, -70, 14, 22); ctx.fillRect(10, -76, 22, 8);
        ctx.fillStyle = '#ffd54f'; ctx.beginPath(); ctx.moveTo(42, -22); ctx.lineTo(66, -4); ctx.lineTo(42, -4); ctx.fill();
      }
      ctx.fillStyle = '#fff59d'; for (let i = 0; i < 3; i++) ctx.fillRect(-32 + i * 24, car ? -42 : -40, 15, 13);
      ctx.fillStyle = '#111';
      for (const wx of [-26, 2, 28]) { ctx.beginPath(); ctx.arc(wx, -6, 11, 0, TAU); ctx.fill(); }
      ctx.restore();
    }
  }
  ctx.restore();
}
function updateTrain(f) {
  if (f.t < TRAIN_WARN) {
    if (once(f, 'horn')) Sfx.siren();
    return true;
  }
  const front = trainFront(f);
  for (const e of hostileTanks(f.owner)) {
    const passed = f.dir > 0 ? front >= e.x : front <= e.x;
    if (passed && Math.abs(e.x - f.x) < 560 && hitOnce(f, e, 20 + f.lv * 7, '#ff8a65')) {
      launch(e, f.dir * 420, -430);
      Sfx.explosion(60); G.shake = Math.max(G.shake, 22);
    }
  }
  if (Math.random() < 0.7) P(front - f.dir * 20, groundAt(front) - 80, fxRand(-30, 30), fxRand(-90, -40), { life: 0.8, size: 9, grow: 14, color: '#cfd8dc', grav: -0.05, kind: 'smoke' });
  G.shake = Math.max(G.shake, 4);
  return Math.abs(front - f.x) < 640 || f.t < TRAIN_WARN + 0.4;
}

/* ---------- 사신의 낫 (영웅): 남은 체력에 비례해 벰 ---------- */
const REAP_HIT = 0.95;
function drawReaper(f) {
  const e = f.target;
  ctx.save();
  const w = f.t - REAP_HIT;
  ctx.globalAlpha = w < 0 ? clamp(f.t / 0.35, 0, 1) : clamp(1 - w / 0.55, 0, 1);
  const x = e.x, y = e.y - 62;
  // 검은 두건
  ctx.fillStyle = 'rgba(18,6,30,0.9)';
  ctx.beginPath(); ctx.moveTo(x - 52, y + 20); ctx.quadraticCurveTo(x - 36, y - 92, x, y - 96); ctx.quadraticCurveTo(x + 36, y - 92, x + 52, y + 20);
  ctx.lineTo(x + 26, y + 4); ctx.lineTo(x + 9, y + 24); ctx.lineTo(x - 9, y + 4); ctx.lineTo(x - 28, y + 24); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#ff1744'; for (const ex of [-11, 11]) { ctx.beginPath(); ctx.arc(x + ex, y - 55, 4.5, 0, TAU); ctx.fill(); }
  // 휘두르는 낫
  const swing = w < -0.18 ? -2.3 : lerp(-2.3, 1.1, clamp((w + 0.18) / 0.22, 0, 1));
  ctx.translate(x, y - 30); ctx.rotate(swing);
  ctx.strokeStyle = '#8d6e63'; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(0, 20); ctx.lineTo(0, -108); ctx.stroke();
  ctx.fillStyle = '#eceff1'; ctx.beginPath(); ctx.moveTo(0, -112); ctx.quadraticCurveTo(66, -128, 104, -62); ctx.quadraticCurveTo(54, -98, 0, -90); ctx.fill();
  ctx.restore();
  if (w >= 0 && w < 0.4) {
    ctx.save(); ctx.globalAlpha = 1 - w / 0.4; ctx.strokeStyle = '#fff'; ctx.lineWidth = 9 * (1 - w / 0.4) + 2;
    ctx.beginPath(); ctx.moveTo(e.x - 90, e.y - 80); ctx.quadraticCurveTo(e.x + 40, e.y - 40, e.x + 80, e.y + 20); ctx.stroke();
    ctx.restore();
  }
}
function updateReaper(f) {
  const e = f.target;
  if (!e.alive && !f.done.cut) return false;
  if (f.t >= REAP_HIT && once(f, 'cut')) {
    Sfx.hit(); G.shake = Math.max(G.shake, 16); G.screenFlash = Math.max(G.screenFlash, 0.3);
    damageTank(e, Math.round(e.hp * (0.13 + f.lv * 0.05)) + 6, '#ce93d8', f.owner);
    burst(e.x, e.y - 18, 30, { colors: ['#4a148c', '#ce93d8', '#ffffff'], speed: 300, life: 0.8, size: 4, grav: 0.4, kind: 'spark' });
  }
  return f.t < REAP_HIT + 0.55;
}

/* ---------- 궤도 강타: 정찰 위성 격추 보상 ---------- */
// 조준 표시 → 거대한 열기둥이 몇 초 동안 한 구역을 통째로 태움
const STRIKE_MARK = 1.5, STRIKE_TIME = 3.4, STRIKE_TICKS = 12;
const strikeRadius = () => 165 * Math.min(1.4, mapSpeed());

function spawnOrbitalStrike(x, owner) {
  G.fields.push({ type: 'strike', x, y: groundAt(x), owner, t: 0, R: strikeRadius(), ticks: 0, focus: true, done: {} });
  showBanner('🛰️ 궤도 강타', `${owner.name}: 폭격 좌표 확정!`, '#ff9100', 1.5);
  Sfx.siren();
}

function updateStrike(f, dt) {
  if (f.t < STRIKE_MARK) {
    for (let i = 1; i <= 4; i++) if (f.t >= STRIKE_MARK * i / 5 && once(f, 'beep' + i)) Sfx.cardMove();
    return true;
  }
  if (once(f, 'ignite')) {
    Sfx.nuke(); Sfx.lightning();
    G.screenFlash = Math.max(G.screenFlash, 0.8);
    G.rings.push({ x: f.x, y: groundAt(f.x), max: f.R * 2.4, t: 0, life: 0.7, color: '255,171,64' });
  }
  const k = (f.t - STRIKE_MARK) / STRIKE_TIME;
  if (k < 1) {
    G.shake = Math.max(G.shake, 20);
    while (f.ticks < STRIKE_TICKS && k >= f.ticks / STRIKE_TICKS) {
      f.ticks++;
      for (const e of hostileTanks(f.owner)) {
        if (Math.abs(e.x - f.x) > f.R + 16 * e.stats.tankScale) continue;
        // 끝까지 맞으면 라운드 체력의 85% (한 턴 피해 제한을 무시하는 격추 보상)
        damageTank(e, Math.max(90, e.roundMaxHp * 0.85) / STRIKE_TICKS, '#ffab40', f.owner, true);
      }
      for (let i = 0; i < 3; i++) {
        const cx = f.x + rand(-f.R * 0.8, f.R * 0.8), cy = groundAt(cx);
        Terrain.carve(cx, cy + 4, rand(22, 38));
        igniteBarrels(cx, cy - 14, 50);
      }
      if (f.ticks % 3 === 1) { Sfx.explosion(70); blastFX(f.x + fxRand(-f.R * 0.6, f.R * 0.6), groundAt(f.x), 70, false); }
    }
    if (Math.random() < 0.9) burst(f.x + fxRand(-f.R, f.R), groundAt(f.x), 4, { colors: ['#fff3e0', '#ffab40', '#ff3d00'], speed: 520, life: 0.8, size: 4, grav: 0.35, kind: 'spark' });
  }
  return f.t < STRIKE_MARK + STRIKE_TIME + 0.6;
}

function drawStrike(f) {
  const gy = groundAt(f.x), top = -2600, R = f.R;
  ctx.save();
  if (f.t < STRIKE_MARK) {
    const k = f.t / STRIKE_MARK, blink = 0.65 + 0.35 * Math.sin(f.t * (14 + k * 30));
    ctx.fillStyle = `rgba(255,145,0,${0.1 + 0.12 * k})`; ctx.fillRect(f.x - R, top, R * 2, gy - top);
    ctx.globalAlpha = blink; ctx.strokeStyle = '#ffab40'; ctx.lineWidth = 3;
    ctx.setLineDash([18, 12]); ctx.lineDashOffset = -f.t * 90;
    ctx.beginPath(); ctx.moveTo(f.x - R, top); ctx.lineTo(f.x - R, gy + 30); ctx.moveTo(f.x + R, top); ctx.lineTo(f.x + R, gy + 30); ctx.stroke();
    ctx.setLineDash([]);
    // 납작하게 눕힌 조준 표식
    ctx.translate(f.x, gy); ctx.scale(1, 0.32);
    for (const [mul, spin] of [[1, 1.4], [0.68, -2.2], [0.36, 3]]) {
      ctx.beginPath();
      for (let i = 0; i <= 6; i++) {
        const a = f.t * spin + i * TAU / 6, rad = R * mul * (1 + 0.5 * (1 - k) * (1 - k));
        if (i) ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad); else ctx.moveTo(Math.cos(a) * rad, Math.sin(a) * rad);
      }
      ctx.lineWidth = 7; ctx.stroke();
    }
  } else {
    const age = f.t - STRIKE_MARK, k = age / STRIKE_TIME;
    const open = Math.min(1, age / 0.18), fade = k < 1 ? 1 : clamp(1 - (age - STRIKE_TIME) / 0.55, 0, 1);
    const w = R * 2 * open * (0.25 + 0.75 * fade) * (1 + Math.sin(f.t * 47) * 0.035);
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = fade;
    for (const [mul, col] of [[1.35, 'rgba(255,61,0,0.22)'], [1, 'rgba(255,109,0,0.5)'], [0.72, 'rgba(255,171,64,0.6)'], [0.42, 'rgba(255,224,150,0.75)'], [0.17, '#ffffff']]) {
      ctx.fillStyle = col; ctx.fillRect(f.x - w * mul / 2, top, w * mul, gy - top + 40);
    }
    // 기둥을 따라 쏟아지는 에너지 줄기
    ctx.fillStyle = 'rgba(255,245,215,0.55)';
    for (let i = 0; i < 34; i++) {
      const sx = f.x + Math.sin(i * 91.7) * w * 0.48, len = 70 + (i % 5) * 34;
      const sy = ((i * 173 + f.t * (1500 + (i % 7) * 190)) % (gy + 700)) - 700;
      ctx.fillRect(sx, sy, 3 + (i % 3) * 2, Math.max(0, Math.min(len, gy - sy)));
    }
    // 바닥 충격 고리
    ctx.translate(f.x, gy); ctx.scale(1, 0.3);
    ctx.fillStyle = 'rgba(255,190,90,0.55)'; ctx.beginPath(); ctx.arc(0, 0, w * 0.72, 0, TAU); ctx.fill();
    ctx.lineWidth = 9;
    for (let i = 0; i < 3; i++) {
      const p = (f.t * 1.6 + i / 3) % 1;
      ctx.strokeStyle = `rgba(255,235,180,${1 - p})`; ctx.beginPath(); ctx.arc(0, 0, w * (0.55 + p * 0.7), 0, TAU); ctx.stroke();
    }
  }
  ctx.restore();
}

const LEGEND_FIELDS = {
  strike: { update: updateStrike, draw: drawStrike },
  dragon: { update: updateDragon, draw: drawDragon },
  judgement: { update: updateJudgement, draw: drawJudgement },
  sweep: { update: updateSweep, draw: drawSweep },
  whale: { update: updateWhale, draw: drawWhale },
  excalibur: { update: updateExcalibur, draw: drawExcalibur },
  titan: { update: updateTitan, draw: drawTitan },
  train: { update: updateTrain, draw: drawTrain },
  reaper: { update: updateReaper, draw: drawReaper }
};

/* ---------- 카드 훅 ---------- */
function hookSatellite(ctx_, owner) {
  if (ctx_.shell.child) return;
  spawnLegend('sweep', ctx_, owner, owner.stats.satellite, { dir: dirToEnemy(owner, ctx_.x) });
  legendCutin(owner, 'satellite');
}
function hookDragon(ctx_, owner) {
  if (ctx_.shell.child) return;
  spawnLegend('dragon', ctx_, owner, owner.stats.dragon, { dir: dirToEnemy(owner, ctx_.x) });
  legendCutin(owner, 'dragon');
}
function hookStarfall(ctx_, owner) {
  if (ctx_.shell.child) return;
  spawnLegend('judgement', ctx_, owner, owner.stats.starfall);
  legendCutin(owner, 'starfall');
}
function hookWhale(ctx_, owner) {
  if (ctx_.shell.child) return;
  spawnLegend('whale', ctx_, owner, owner.stats.whale, { dir: dirToEnemy(owner, ctx_.x) });
  legendCutin(owner, 'whale');
}
function hookExcalibur(ctx_, owner) {
  if (ctx_.shell.child) return;
  spawnLegend('excalibur', ctx_, owner, owner.stats.excalibur);
  legendCutin(owner, 'excalibur');
}
function hookTitan(ctx_, owner) {
  if (ctx_.shell.child) return;
  // 착탄 지점 가까이에 적이 있으면 그 발밑에서 솟아남
  const e = nearEnemy(ctx_, owner, 170 + owner.stats.titan * 30);
  const x = clamp(e ? e.x : ctx_.x, 30, WW - 30);
  spawnLegend('titan', { x, y: ctx_.y }, owner, owner.stats.titan, { base: groundAt(x) });
  legendCutin(owner, 'titan');
}
function hookTrain(ctx_, owner) {
  if (ctx_.shell.child) return;
  spawnLegend('train', ctx_, owner, owner.stats.train, { dir: dirToEnemy(owner, ctx_.x) });
}
function hookReaper(ctx_, owner) {
  if (ctx_.shell.child) return;
  const e = nearEnemy(ctx_, owner, 130 + owner.stats.reaper * 30);
  if (!e) return;
  spawnLegend('reaper', { x: e.x, y: e.y }, owner, owner.stats.reaper, { target: e });
  toast(e.x, e.y - 175, '💀 사신이 다가온다...', '#ce93d8');
}

const LEGEND_CARDS = {
  excalibur: {
    icon: '🗡️', name: '성검 강림', short: '성검', cat: '전설 병기', color: '#ffe082',
    desc: ['거대한 성검이 꽂히고 검기가 지면을 질주', '★중첩: 검의 위력·범위 증가'],
    apply(s) { s.excalibur += 1; addHook(s, 'onExplode', hookExcalibur); }
  },
  titan: {
    icon: '✊', name: '대지의 거신', short: '거신', cat: '전설 병기', color: '#ffab40',
    desc: ['적 발밑에서 거대한 바위 주먹이 솟구침', '★중첩: 탐지 거리·피해 증가'],
    apply(s) { s.titan += 1; addHook(s, 'onExplode', hookTitan); }
  },
  train: {
    icon: '🚂', name: '폭주 열차', short: '열차', cat: '지원 포격', color: '#ef5350',
    desc: ['착탄 지점을 열차가 가로질러 돌진', '★중첩: 충돌 피해 증가'],
    apply(s) { s.train += 1; addHook(s, 'onExplode', hookTrain); }
  },
  reaper: {
    icon: '💀', name: '사신의 낫', short: '사신', cat: 'ROUNDS 엽기', color: '#ab47bc',
    desc: ['적 근처 착탄 시 남은 체력 18% + 6 베기', '★중첩: 베는 비율 +5%'],
    apply(s) { s.reaper += 1; addHook(s, 'onExplode', hookReaper); }
  }
};

/* ---------- 화면 연출: 밤하늘 + 전설 발동 컷인 ---------- */
function drawLegendDim() {
  const strike = G.fields.find(x => x.type === 'strike');
  if (strike) {
    const a = Math.min(1, strike.t / 0.4) * clamp((STRIKE_MARK + STRIKE_TIME + 0.6 - strike.t) / 0.5, 0, 1);
    ctx.fillStyle = `rgba(24,6,0,${0.5 * a})`; ctx.fillRect(0, 0, W, H);
    return;
  }
  const f = G.fields.find(x => x.type === 'judgement' || x.type === 'excalibur');
  if (!f || f.t <= 0) return;
  const end = f.type === 'judgement' ? JUDGE_HIT : SWORD_HIT;
  const a = Math.min(1, f.t / 0.35) * (f.t < end ? 1 : clamp(1 - (f.t - end) / 0.5, 0, 1));
  ctx.fillStyle = `rgba(3,4,26,${0.6 * a})`; ctx.fillRect(0, 0, W, H);
}

function drawCutin() {
  const c = G.cutin;
  if (!c) return;
  const d = CARD_DEFS[c.id];
  const inK = 1 - (1 - clamp(c.t / 0.22, 0, 1)) ** 3, outK = clamp((c.t - (c.dur - 0.25)) / 0.25, 0, 1);
  const slide = (1 - inK) * -W + outK * W;
  ctx.save();
  ctx.translate(slide, 0);
  ctx.fillStyle = 'rgba(8,4,20,0.86)';
  ctx.beginPath(); ctx.moveTo(-40, 196); ctx.lineTo(W + 40, 168); ctx.lineTo(W + 40, 292); ctx.lineTo(-40, 320); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#ffca28';
  for (const y of [190, 314]) { ctx.beginPath(); ctx.moveTo(-40, y); ctx.lineTo(W + 40, y - 28); ctx.lineTo(W + 40, y - 21); ctx.lineTo(-40, y + 7); ctx.closePath(); ctx.fill(); }
  // 속도선
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  for (let i = 0; i < 14; i++) ctx.fillRect((i * 331 + c.t * 2600) % (W + 300) - 300, 205 + (i * 41) % 80, 150 + (i % 3) * 60, 2);
  ctx.textAlign = 'center';
  ctx.font = `92px ${FONT}`; ctx.fillStyle = '#fff'; ctx.fillText(d.icon, W / 2 - 380, 278);
  ctx.font = `900 24px ${FONT}`; ctx.fillStyle = c.color; ctx.fillText(`★★★★  ${c.name}의 전설 발동`, W / 2 + 60, 222);
  bigText(d.name, W / 2 + 60, 268, 64, '#ffd54f');
  ctx.restore();
}

// 수호 천사를 가진 탱크는 날개와 광륜이 보임
function drawAngelAura(p) {
  if (!p.alive || !p.stats.angel) return;
  const s = p.stats.tankScale, y = p.y - 18 * s, flap = Math.sin(G.time * 4) * 0.18;
  ctx.save();
  ctx.globalAlpha = 0.82;
  for (const side of [-1, 1]) {
    ctx.save(); ctx.translate(p.x + side * 16 * s, y); ctx.scale(side * s, s); ctx.rotate(-0.25 + flap);
    ctx.fillStyle = '#fffde7';
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.ellipse(17 + i * 4, -13 + i * 7, 22 - i * 3.5, 4.5, -0.55 + i * 0.22, 0, TAU); ctx.fill(); }
    ctx.restore();
  }
  ctx.strokeStyle = '#ffee58'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.ellipse(p.x, p.y - 52 * s, 15 * s, 4.5 * s, 0, 0, TAU); ctx.stroke();
  ctx.restore();
}

Object.assign(CARD_DEFS, LEGEND_CARDS);
CARD_POOL.push(...Object.keys(LEGEND_CARDS));
