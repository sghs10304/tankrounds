'use strict';

/* ============================ 맵 크기 & 카메라 ============================ */
// W/H 는 화면 크기, WW 는 라운드마다 바뀌는 맵(월드) 폭
// 라운드가 올라갈 때마다 계속 넓어짐 (1:1 최대 4800, 2:2·4인전 최대 5600)
const MAP_GROWTH = [0, 250, 500, 1000, 1600, 2200];
function worldWidthFor(mode, round) {
  const grow = round <= 6 ? MAP_GROWTH[Math.max(1, round) - 1] : 2200 + (round - 6) * 400;
  return (mode === '1v1' ? 1600 : 2400) + Math.min(3200, grow);
}
const mapScale = () => WW / W;
// 맵이 넓어진 만큼 포탄 속도를 올려서 사거리를 맞춤 (사거리는 속도²에 비례)
const mapSpeed = () => Math.sqrt(mapScale());
// 하늘에서 떨어지는 공격은 넓은 맵에서 화면 위쪽부터 나오도록 더 높이서 시작
// 맵이 넓어지면 폭발 범위도 조금 커져서 맞히는 맛이 유지됨
const mapBlast = () => 1 + 0.16 * (mapScale() - 1);
const skyDrop = y => y < 0 ? y - (WW - W) * 0.4 : y;

function sdStart() {
  const many = players.length > 2;
  const extra = clamp(G.round - 3, 0, 7);
  return SUDDEN_DEATH_TURN + (many ? 8 : 0) + extra * (many ? 6 : 4);
}

function setWorld(w) {
  if (w === WW && Terrain.top.length === w) return;
  WW = w;
  Terrain.resize(w);
  G.streaks.length = 0;
}

const cam = { x: W / 2, y: H / 2, z: 1, follow: null };

function cameraTarget() {
  const fit = W / WW;
  let z = fit, x = WW / 2, skyY = null;
  if (WW > W) {
    if (G.state === 'aiming' && G.camClose) {
      z = 1;
      x = G.ghost ? G.ghostX : players[G.turn] ? players[G.turn].x : x;
    } else if (G.state === 'resolving') {
      const s = G.shells.find(sh => !sh.child) || G.shells[0];
      const f = G.fields.find(fl => fl.focus);
      if (f) { z = Math.max(fit, 0.85); x = f.x; }
      else if (s) { z = Math.max(fit, 0.85); x = s.x; skyY = s.y; cam.follow = { x: s.x, t: G.time }; }
      else if (cam.follow && G.time - cam.follow.t < 1.1) { z = Math.max(fit, 0.85); x = cam.follow.x; }
    }
  }
  const halfW = W / (2 * z), halfH = H / (2 * z);
  let y = H - halfH; // 땅이 항상 화면 아래에 붙도록
  if (skyY !== null) y = Math.min(y, skyY + halfH - 240 / z);
  return { x: clamp(x, halfW, Math.max(halfW, WW - halfW)), y, z };
}

function updateCamera(dt, snap = false) {
  const t = cameraTarget();
  const k = snap ? 1 : 1 - Math.exp(-5 * dt);
  cam.z = lerp(cam.z, t.z, k);
  cam.x = lerp(cam.x, t.x, k);
  cam.y = lerp(cam.y, t.y, k);
}

// 결정타 슬로모션 확대까지 합친 현재 화면 변환
function cameraView() {
  let { x, y, z } = cam;
  if (G.slowmo > 0 && G.focus) {
    const k = Math.max(0, Math.min(1, (1.7 - G.slowmo) / 0.25, G.slowmo / 0.4));
    const nz = z * (1 + 0.75 * k), halfW = W / (2 * nz);
    x = lerp(x, clamp(G.focus.x, halfW, Math.max(halfW, WW - halfW)), k);
    y = lerp(y, Math.min(G.focus.y, H - H / (2 * nz)), k);
    z = nz;
  }
  return { x, y, z };
}

function applyCamera() {
  const v = cameraView();
  ctx.translate(W / 2, H / 2); ctx.scale(v.z, v.z); ctx.translate(-v.x, -v.y);
}

function toScreen(x, y) {
  const v = cameraView();
  return { x: (x - v.x) * v.z + W / 2, y: (y - v.y) * v.z + H / 2 };
}
const camCenterX = () => cam.x;
// 멀리서 볼 때 글자·말풍선이 너무 작아지지 않도록 키우는 배율
const textBoost = () => clamp(1 / Math.sqrt(cam.z), 1, 1.7);

const ZOOM_BTN = { x: W / 2 - 120, y: H - 50, w: 240, h: 38 };
const zoomAvailable = () => WW > W && G.state === 'aiming';
function toggleZoom() {
  if (WW <= W) return;
  G.camClose = !G.camClose;
  Sfx.cardMove();
}
const zoomButtonAt = (x, y) => !IS_TOUCH && zoomAvailable() && x >= ZOOM_BTN.x && x <= ZOOM_BTN.x + ZOOM_BTN.w && y >= ZOOM_BTN.y && y <= ZOOM_BTN.y + ZOOM_BTN.h;

// 넓은 맵을 멀리서 볼 때: 탱크 이름표와 확대 버튼
function drawCameraUI() {
  if (G.state !== 'aiming' && G.state !== 'resolving') return;
  if (cam.z < 0.82) {
    ctx.textAlign = 'center'; ctx.font = `900 ${IS_TOUCH ? 26 : 15}px ${FONT}`;
    for (const p of players) {
      if (!p.alive) continue;
      const s = toScreen(p.x, p.y - 62 * p.stats.tankScale);
      if (s.x < 0 || s.x > W) continue;
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.strokeText(p.name, s.x, s.y - 12);
      ctx.fillStyle = p.color; ctx.fillText(p.name, s.x, s.y - 12);
      if (p.id === G.turn) {
        const by = s.y - 6 + Math.sin(G.time * 6) * 4;
        ctx.beginPath(); ctx.moveTo(s.x - 9, by); ctx.lineTo(s.x + 9, by); ctx.lineTo(s.x, by + 12); ctx.closePath(); ctx.fill();
      }
    }
  }
  if (!IS_TOUCH && zoomAvailable()) {
    ctx.fillStyle = 'rgba(10,12,34,0.8)'; rr(ZOOM_BTN.x, ZOOM_BTN.y, ZOOM_BTN.w, ZOOM_BTN.h, 19); ctx.fill();
    ctx.strokeStyle = '#80deea'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.textAlign = 'center'; ctx.font = `bold 15px ${FONT}`; ctx.fillStyle = '#e0f7fa';
    ctx.fillText(G.camClose ? '🗺️ 전체 보기 (V)' : '🔍 내 탱크 확대 (V)', W / 2, ZOOM_BTN.y + 25);
  }
}
