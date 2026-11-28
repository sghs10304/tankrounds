'use strict';

/* ============================ 모바일 터치 지원 ============================ */
// 터치가 기본인 기기에서만 켜짐 (주소 뒤에 ?touch=1 을 붙이면 PC에서도 확인 가능)
const IS_TOUCH = window.matchMedia('(pointer: coarse)').matches || /[?&]touch=1/.test(location.search);
const touchInput = { left: false, right: false, ccw: false, cw: false };
let touchFireCode = null;

// 키보드 조작에 터치 버튼 입력을 합침
function withTouch(p, ctrl) {
  if (!IS_TOUCH) return ctrl;
  const rot = (touchInput.ccw ? 1 : 0) - (touchInput.cw ? 1 : 0);
  return {
    left: ctrl.left || touchInput.left,
    right: ctrl.right || touchInput.right,
    // 반시계(↺)는 항상 각도 증가: 포신 방향(aimDir)을 상쇄해서 전달
    up: ctrl.up || (rot !== 0 && rot === p.aimDir),
    down: ctrl.down || (rot !== 0 && rot === -p.aimDir),
    fireCode: ctrl.fireCode
  };
}

function releaseTouch() {
  for (const k in touchInput) touchInput[k] = false;
}

function touchFireStart() {
  if (G.state !== 'aiming') return;
  const p = players[G.turn];
  if (!p || !isMyTurnControl(p)) return;
  touchFireCode = getActiveControls(p).fireCode[0];
  onKeyDown(touchFireCode);
}

function touchFireEnd(cancelled) {
  const code = touchFireCode;
  touchFireCode = null;
  if (!code) return;
  if (cancelled) {
    // 전화·알림 등으로 터치가 끊기면 발사하지 않고 충전만 취소
    const p = players[G.turn];
    if (p && p.charging && isMyTurnControl(p)) { p.charging = false; p.charge = 0; p.chargeT = 0; Sfx.chargeStop(); }
    return;
  }
  onKeyUp(code);
}

function bindHold(el, onStart, onEnd) {
  let pointer = null;
  el.addEventListener('pointerdown', e => {
    e.preventDefault();
    if (pointer !== null) return;
    pointer = e.pointerId;
    try { el.setPointerCapture(pointer); } catch (err) {}
    el.classList.add('on');
    Sfx.init();
    onStart();
  });
  const end = (e, cancelled) => {
    if (e.pointerId !== pointer) return;
    pointer = null;
    el.classList.remove('on');
    onEnd(cancelled);
  };
  el.addEventListener('pointerup', e => end(e, false));
  el.addEventListener('pointercancel', e => end(e, true));
  el.addEventListener('lostpointercapture', e => end(e, true));
}

let touchUi = null;
function initTouchUI() {
  if (!IS_TOUCH) return;
  document.body.classList.add('touch');
  const $ = id => document.getElementById(id);
  touchUi = { root: $('touch-ui'), controls: $('tc-controls'), chat: $('tc-chat'), list: $('tc-chat-list'), info: $('tc-info'), fire: $('tc-fire'), ccw: $('tc-ccw'), cw: $('tc-cw'), shown: '' };
  for (const [id, key] of [['tc-left', 'left'], ['tc-right', 'right'], ['tc-ccw', 'ccw'], ['tc-cw', 'cw']]) {
    bindHold($(id), () => { touchInput[key] = true; }, () => { touchInput[key] = false; });
  }
  bindHold(touchUi.fire, touchFireStart, touchFireEnd);
  $('tc-chat-toggle').addEventListener('click', () => touchUi.list.classList.toggle('open'));
  EMOTES.forEach((emoji, i) => {
    const b = document.createElement('button');
    b.textContent = emoji;
    b.addEventListener('click', () => { sendEmote(i); touchUi.list.classList.remove('open'); });
    touchUi.list.appendChild(b);
  });

  touchUi.zoom = $('tc-zoom');
  touchUi.zoom.addEventListener('click', toggleZoom);

  const full = $('tc-full'), root = document.documentElement;
  if (!root.requestFullscreen) full.remove();
  else full.addEventListener('click', () => {
    if (document.fullscreenElement) { document.exitFullscreen(); return; }
    root.requestFullscreen().then(() => {
      if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {});
    }).catch(() => {});
  });
  document.addEventListener('contextmenu', e => e.preventDefault());
  document.addEventListener('visibilitychange', () => { if (document.hidden) releaseTouch(); });
}

// 매 프레임 호출: 바뀐 경우에만 DOM 갱신
function updateTouchUI() {
  if (!touchUi) return;
  const p = players[G.turn];
  const mine = G.state === 'aiming' && !!p && isMyTurnControl(p);
  const chat = emoteReady();
  let info = '';
  if (mine) {
    if (G.ghost) info = '👻 ◀▶ 위치 · ↺↻ 종류 전환';
    else {
      const power = p.charging ? Math.round(p.charge) : null;
      info = `각도 ${Math.round(p.angle)}°  ·  ${power !== null ? `파워 ${power}` : `지난 파워 ${Math.round(p.power)}`}  ·  연료 ${Math.round(p.fuel)}`;
    }
  }
  const zoom = zoomAvailable();
  const key = `${mine}|${chat}|${info}|${G.ghost}|${zoom}`;
  if (key === touchUi.shown) return;
  touchUi.shown = key;
  if (!mine) releaseTouch();
  touchUi.controls.classList.toggle('hidden', !mine);
  touchUi.zoom.classList.toggle('hidden', !zoom);
  touchUi.chat.classList.toggle('hidden', !chat);
  if (!chat) touchUi.list.classList.remove('open');
  touchUi.info.textContent = info;
  touchUi.fire.textContent = G.ghost ? '투하' : '발사';
}

/* ---------------------------- 작은 화면용 큰 HUD ---------------------------- */
function drawMobileHUD() {
  ctx.drawImage(getHudLayer(), 0, 0, W, 130, 0, 0, W, 150);
  const two = players.length === 2;
  const slots = two ? [24, W - 24 - 610] : [16, 336, 946, 1266];
  const pw = two ? 610 : 318;
  players.forEach((p, i) => {
    const x0 = slots[i];
    const active = (G.state === 'aiming' || G.state === 'resolving') && G.turn === i;
    const team = G.mode === '2v2' ? (p.team === 0 ? '[블루] ' : '[레드] ') : '';
    const mine = Net.active && i === Net.myId ? ' (나)' : '';
    ctx.textAlign = 'left'; ctx.font = `900 ${two ? 32 : 24}px ${FONT}`; ctx.fillStyle = p.color;
    ctx.fillText(`${active ? '▶ ' : ''}${p.laser > 0 ? '🛰️' : ''}${team}${p.name}${mine}`, x0, 36, two ? 390 : pw);
    if (G.mode !== '2v2') {
      for (let k = 0; k < WINS_TO_MATCH; k++) {
        ctx.fillStyle = k < p.score ? '#ffd54f' : 'rgba(255,255,255,0.25)';
        ctx.beginPath();
        if (two) ctx.arc(x0 + pw - 14 - (WINS_TO_MATCH - 1 - k) * 28, 24, 10, 0, TAU);
        else ctx.arc(x0 + 10 + k * 20, 138, 7, 0, TAU);
        ctx.fill();
      }
    }
    const hp = Math.max(0, p.hp), frac = clamp(hp / p.roundMaxHp, 0, 1);
    drawHpBar(p, x0, 46, pw, 34, frac > 0.5 ? '#66bb6a' : frac > 0.25 ? '#ffca28' : '#ef5350', two && i === 1);
    ctx.textAlign = 'center'; ctx.font = `900 24px ${FONT}`; ctx.fillStyle = '#fff';
    ctx.fillText(p.alive ? `${Math.ceil(hp)} / ${p.roundMaxHp}` : '👻 유령', x0 + pw / 2, 72);

    const counts = countCards(p);
    ctx.textAlign = 'left'; ctx.font = `bold 26px ${FONT}`; ctx.fillStyle = '#fff';
    let cx = x0, cy = 114;
    for (const id of CARD_POOL) {
      if (!counts[id]) continue;
      const label = `${counts[id] >= MAX_STACK ? '✨' : ''}${CARD_DEFS[id].icon}${counts[id] > 1 ? counts[id] : ''}`;
      const w = ctx.measureText(label).width + 8;
      if (cx + w > x0 + pw) { if (!two || cy > 114) break; cx = x0; cy += 34; }
      ctx.fillText(label, cx, cy);
      cx += w;
    }
  });

  const mid = W / 2, biome = BIOME_DEFS[G.biome] || BIOME_DEFS.grass;
  ctx.textAlign = 'center';
  ctx.font = `bold 22px ${FONT}`; ctx.fillStyle = G.turnCount > sdStart() ? '#ff5252' : '#d5d8f5';
  ctx.fillText(`${biome.icon} R${G.round} · ${G.turnCount}턴`, mid, 28);
  ctx.font = `900 36px ${FONT}`; ctx.fillStyle = '#80deea';
  const wind = Math.abs(G.wind).toFixed(1);
  ctx.fillText(G.wind === 0 ? '무풍' : G.wind < 0 ? `◀◀ ${wind}` : `${wind} ▶▶`, mid, 70);
  if (G.mode === '2v2') {
    ctx.font = `bold 24px ${FONT}`; ctx.fillStyle = '#fff';
    ctx.fillText(`블루 ${G.teamScores[0]} : ${G.teamScores[1]} 레드`, mid, 104);
  }
  const p = players[G.turn];
  if (p && (G.state === 'aiming' || G.state === 'resolving')) {
    ctx.fillStyle = p.color; rr(mid - 112, 114, 224, 36, 18); ctx.fill();
    ctx.font = `900 22px ${FONT}`; ctx.fillStyle = '#0b0c1e';
    ctx.fillText(`${G.ghost ? '👻 ' : '▶ '}${p.name} 차례`, mid, 140, 210);
  }
  const rule = RULE_DEFS[G.rule];
  if (rule) {
    ctx.font = `bold 22px ${FONT}`; ctx.fillStyle = rule.color;
    ctx.fillText(`${rule.icon} ${rule.name} · ${rule.desc}`, mid, 184);
  }
}

/* ---------------------------- 최종 결과 화면 버튼 ---------------------------- */
const OVER_BTN = { y: 736, w: 300, h: 70 };
function matchOverButtons() {
  if (Net.active) return Net.isHost ? [{ id: 'again', x: W / 2, label: '🔁 다시 하기' }] : [];
  return [{ id: 'again', x: W / 2 - 170, label: '🔁 다시 하기' }, { id: 'menu', x: W / 2 + 170, label: '🏠 메인 메뉴' }];
}

function rematch() {
  if (Net.active && !Net.isHost) return;
  if (Net.active) Net.send({ type: 'rematch' });
  startMatch(G.mode);
}

function backToMenu() {
  G.ai = null; G.bot = null; G.menuPage = null; G.banner = null;
  setState('title');
}

function matchOverClick(x, y) {
  if (G.stateT < 1 || y < OVER_BTN.y || y > OVER_BTN.y + OVER_BTN.h) return;
  const hit = matchOverButtons().find(b => Math.abs(x - b.x) <= OVER_BTN.w / 2);
  if (!hit) return;
  Sfx.cardPick();
  if (hit.id === 'again') rematch();
  else backToMenu();
}

function drawMatchOverButtons() {
  ctx.textAlign = 'center';
  const list = matchOverButtons();
  for (const b of list) {
    ctx.fillStyle = b.id === 'again' ? '#ffd54f' : '#2c3170';
    rr(b.x - OVER_BTN.w / 2, OVER_BTN.y, OVER_BTN.w, OVER_BTN.h, 35); ctx.fill();
    ctx.font = `900 26px ${FONT}`; ctx.fillStyle = b.id === 'again' ? '#14102e' : '#fff';
    ctx.fillText(b.label, b.x, OVER_BTN.y + 45);
  }
  ctx.font = `18px ${FONT}`; ctx.fillStyle = '#c8ccec';
  ctx.fillText(list.length ? 'Space: 다시 하기' + (Net.active ? '' : '  ·  Esc: 메인 메뉴') : '호스트가 새 게임을 시작하기를 기다리는 중...', W / 2, 844);
}
