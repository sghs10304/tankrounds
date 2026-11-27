'use strict';

/* ============================ 온라인 멀티플레이 매니저 ============================
 * 1) 보안 웹소켓 MQTT 중계로 학교/기관 방화벽 통과
 * 2) 턴마다 시드(seed) 공유 + 소수점 정밀 발사 좌표
 * 3) 턴 종료 시 Host 권위 상태 확정(turnResult)으로 체력·생사·카드창 100% 일치
 */
const BROKER_URLS = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker.hivemq.com:8884/mqtt'
];
const TOPIC_PREFIX = 'tankrounds/v4/room/';

const Net = {
  active: false,
  isHost: true,
  myId: 0, // Host = 0 (P1), Guest = 1 (P2)
  client: null,
  brokerIdx: 0,
  clientId: 'tr_' + Math.random().toString(36).slice(2, 10),
  roomCode: '',
  topic: '',
  syncTimer: 0,
  lastAimSent: '',
  connectTimeout: null,
  joining: false,
  pingTimer: null,
  lastPong: 0,
  fireSeq: 0,
  lastHandledFireSeq: -1,
  pendingFireAck: null,
  remoteTarget: null,

  cleanup() {
    if (this.connectTimeout) { clearTimeout(this.connectTimeout); this.connectTimeout = null; }
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
    if (this.pendingFireAck) { clearInterval(this.pendingFireAck); this.pendingFireAck = null; }
    this.joining = false;
    this.active = false;
    this.lastAimSent = '';
    this.remoteTarget = null;
    this.fireSeq = 0;
    this.lastHandledFireSeq = -1;
    const joinBtn = document.getElementById('btn-join-room');
    if (joinBtn) joinBtn.disabled = false;
    if (this.client) {
      try { this.client.end(true); } catch (e) {}
      this.client = null;
    }
  },

  ensureBroker(onReady) {
    const status = document.getElementById('p2p-status');
    if (typeof mqtt === 'undefined') {
      status.style.color = '#ff5252';
      status.textContent = 'MQTT 라이브러리 로드 실패. 인터넷 연결을 확인 후 새로고침하세요.';
      return;
    }
    if (this.client && this.client.connected) {
      onReady();
      return;
    }
    if (this.client) {
      try { this.client.end(true); } catch (e) {}
    }
    const url = BROKER_URLS[this.brokerIdx % BROKER_URLS.length];
    this.client = mqtt.connect(url, {
      clientId: this.clientId,
      clean: true,
      connectTimeout: 6000,
      reconnectPeriod: 0
    });
    this.client.on('connect', () => {
      onReady();
    });
    this.client.on('message', (topic, payload) => {
      if (topic !== this.topic) return;
      try {
        const msg = JSON.parse(payload.toString());
        if (msg.sender === this.clientId) return;
        this.onData(msg);
      } catch (e) {}
    });
    this.client.on('error', () => {
      this.brokerIdx++;
      this.cleanup();
      status.style.color = '#ff5252';
      status.textContent = '중계 서버 연결 지연! 버튼을 다시 눌러 백업 서버로 접속하세요.';
    });
  },

  openModal() {
    document.getElementById('p2p-modal').style.display = 'flex';
    const status = document.getElementById('p2p-status');
    const codeBox = document.getElementById('my-room-code');
    document.getElementById('join-code-input').value = '';
    this.cleanup();

    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 4; i++) code += chars[(Math.random() * chars.length) | 0];
    this.roomCode = code;
    this.topic = TOPIC_PREFIX + code;
    this.isHost = true;
    this.myId = 0;

    codeBox.textContent = '연결 중...';
    status.style.color = '#ffd54f';
    status.textContent = '보안 웹소켓 중계 서버에 방 생성 중...';

    this.ensureBroker(() => {
      if (this.joining) return;
      this.client.subscribe(this.topic, { qos: 1 }, err => {
        if (err) {
          status.style.color = '#ff5252';
          status.textContent = '방 구독 실패. 다시 시도해주세요.';
          return;
        }
        codeBox.textContent = code;
        status.style.color = '#69f0ae';
        status.textContent = '준비 완료! 상대방의 입장을 기다리고 있습니다...';
      });
    });
  },

  joinRoom(rawCode) {
    const code = rawCode.trim().toUpperCase();
    const status = document.getElementById('p2p-status');
    const joinBtn = document.getElementById('btn-join-room');
    if (code.length !== 4) {
      status.style.color = '#ff5252';
      status.textContent = '4자리 방 코드를 정확히 입력해주세요.';
      return;
    }
    if (this.joining) return;

    if (this.connectTimeout) clearTimeout(this.connectTimeout);
    this.joining = true;
    joinBtn.disabled = true;
    status.style.color = '#ffd54f';
    status.textContent = `[${code}] 방에 입장 신호 전송 중...`;

    this.ensureBroker(() => {
      if (this.topic && this.topic !== TOPIC_PREFIX + code) {
        try { this.client.unsubscribe(this.topic); } catch (e) {}
      }
      this.roomCode = code;
      this.topic = TOPIC_PREFIX + code;
      this.isHost = false;
      this.myId = 1;

      this.client.subscribe(this.topic, { qos: 1 }, err => {
        if (err) {
          this.joining = false;
          joinBtn.disabled = false;
          status.style.color = '#ff5252';
          status.textContent = '방 입장 실패. 네트워크를 확인하세요.';
          return;
        }
        this.send({ type: '_hello' }, 1);
      });

      this.connectTimeout = setTimeout(() => {
        if (!this.active) {
          this.joining = false;
          joinBtn.disabled = false;
          status.style.color = '#ff5252';
          status.textContent = `[${code}] 방 응답 없음. 방 코드를 다시 확인하세요.`;
        }
      }, 8000);
    });
  },

  closeModal() {
    document.getElementById('p2p-modal').style.display = 'none';
    if (!this.active) this.cleanup();
    canvas.focus();
  },

  startHeartbeat() {
    this.lastPong = performance.now();
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => {
      if (!this.active) return;
      this.send({ type: '_ping' }, 0);
      if (performance.now() - this.lastPong > 18000) {
        this.cleanup();
        showBanner('연결 끊김', '상대방과의 연결이 종료되었습니다', '#ff5252', 3.0);
        setState('title');
      }
    }, 4000);
  },

  send(msg, qos = 0) {
    if (this.client && this.client.connected && this.topic) {
      try {
        this.client.publish(this.topic, JSON.stringify({ ...msg, sender: this.clientId }), { qos });
      } catch (e) {}
    }
  },

  sendFireReliable(firePayload) {
    if (this.pendingFireAck) { clearInterval(this.pendingFireAck); this.pendingFireAck = null; }
    this.send(firePayload, 1);
    let retries = 0;
    this.pendingFireAck = setInterval(() => {
      if (!this.active || retries >= 6) {
        clearInterval(this.pendingFireAck);
        this.pendingFireAck = null;
        return;
      }
      retries++;
      this.send(firePayload, 1);
    }, 450);
  },

  onData(msg) {
    if (!msg || !msg.type) return;
    this.lastPong = performance.now();

    if (msg.type === '_ping') {
      this.send({ type: '_pong' }, 0);
      return;
    }
    if (msg.type === '_pong') return;

    if (msg.type === '_hello' && this.isHost && !this.active) {
      if (this.connectTimeout) { clearTimeout(this.connectTimeout); this.connectTimeout = null; }
      this.active = true;
      this.send({ type: '_welcome' }, 1);
      document.getElementById('p2p-modal').style.display = 'none';
      canvas.focus();
      this.startHeartbeat();
      startMatch();
      return;
    }

    if (msg.type === '_welcome' && !this.isHost && this.joining) {
      if (this.connectTimeout) { clearTimeout(this.connectTimeout); this.connectTimeout = null; }
      this.joining = false;
      this.active = true;
      document.getElementById('btn-join-room').disabled = false;
      document.getElementById('p2p-modal').style.display = 'none';
      canvas.focus();
      this.startHeartbeat();
      return;
    }

    if (!this.active) return;

    switch (msg.type) {
      case 'roundSetup': {
        this.remoteTarget = null;
        this.lastHandledFireSeq = -1;
        RNG.setSeed(msg.seed);
        G.round = msg.round;
        G.turnCount = 0;
        G.nextFirst = msg.nextFirst;
        if (msg.biome) setBiome(msg.biome);
        Terrain.top.set(msg.terrainTop);
        Terrain.rebuild();
        players[0].x = msg.p0x;
        players[1].x = msg.p1x;
        resetPlayersForRound();
        G.crates = msg.crates;
        G.portals = msg.portals;
        Sfx.roundStart();
        beginTurn(msg.turn, msg.wind, msg.seed);
        const b = BIOME_DEFS[G.biome];
        const sub = G.round === 1 ? `⚡ 초고속 1R (체력 50) · ${b.icon} ${b.name}` : G.round === 2 ? `⚡ 스피드 2R (체력 90) · ${b.icon} ${b.name}` : G.round === 3 ? `⚡ 3R (체력 120) · ${b.icon} ${b.name}` : `${b.icon} ${b.name} · ${players[G.turn].name} 선공`;
        showBanner(`ROUND ${G.round}`, sub, '#ffffff', 2.2);
        break;
      }
      case 'turnStart': {
        this.remoteTarget = null;
        if (G.state === 'resolving') {
          G.pending.length = 0;
          G.shells.length = 0;
          G.fields.length = 0;
        }
        // Host가 확정한 직전 턴 종료 체력 동기화
        if (msg.hp0 !== undefined) syncAuthoritativeState(msg);
        beginTurn(msg.turn, msg.wind, msg.seed);
        break;
      }
      case 'roundEndSync': {
        // Host가 라운드 종료 및 승패 확정
        this.remoteTarget = null;
        G.pending.length = 0;
        G.shells.length = 0;
        G.fields.length = 0;
        syncAuthoritativeState(msg);
        if (G.state !== 'roundEnd' && G.state !== 'cards' && G.state !== 'matchOver') {
          endRound();
        }
        break;
      }
      case 'aimSync': {
        if (G.state !== 'aiming' || G.turn !== msg.id) break;
        const p = players[msg.id];
        if (p) {
          this.remoteTarget = {
            id: msg.id,
            x: msg.x,
            y: msg.y,
            angle: msg.angle,
            fuel: msg.fuel,
            charging: msg.charging,
            charge: msg.charge
          };
        }
        break;
      }
      case 'fireAck': {
        if (this.pendingFireAck) {
          clearInterval(this.pendingFireAck);
          this.pendingFireAck = null;
        }
        break;
      }
      case 'fire': {
        this.send({ type: 'fireAck', seq: msg.seq }, 1);
        if (msg.seq <= this.lastHandledFireSeq) break;
        this.lastHandledFireSeq = msg.seq;
        this.remoteTarget = null;

        const p = players[msg.id];
        if (p && p.alive) {
          if (G.state !== 'aiming' || G.turn !== msg.id) {
            G.pending.length = 0;
            G.shells.length = 0;
            G.fields.length = 0;
            G.turn = msg.id;
            setState('aiming');
          }
          // 발사 시드와 소수점 정밀 좌표를 그대로 복원해 100% 동일한 탄도 계산
          RNG.setSeed(msg.fireSeed);
          p.x = msg.x;
          p.y = msg.y;
          p.angle = msg.angle;
          p.charge = msg.power;
          fire(p, true);
        }
        break;
      }
      case 'cardChoices': {
        G.choices = msg.choices;
        G.cardLoser = msg.loser;
        G.sel = 1;
        G.picked = -1;
        setState('cards');
        break;
      }
      case 'cardSelect': {
        if (G.state === 'cards') {
          G.sel = msg.sel;
          Sfx.cardMove();
        }
        break;
      }
      case 'cardPick': {
        if (G.state === 'cards') {
          pickCard(msg.index, true);
        }
        break;
      }
      case 'rematch': {
        startMatch();
        break;
      }
    }
  }
};

window.addEventListener('beforeunload', () => {
  if (Net.active) Net.send({ type: '_leave' }, 0);
});

document.getElementById('btn-join-room').addEventListener('click', () => {
  Net.joinRoom(document.getElementById('join-code-input').value);
});
document.getElementById('join-code-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') Net.joinRoom(e.target.value);
});
document.getElementById('btn-close-p2p').addEventListener('click', () => Net.closeModal());
document.getElementById('my-room-code').addEventListener('click', e => {
  const txt = e.target.textContent;
  if (txt.length === 4) {
    const tmp = document.createElement('textarea');
    tmp.value = txt; document.body.appendChild(tmp); tmp.select();
    document.execCommand('copy'); document.body.removeChild(tmp);
    document.getElementById('p2p-status').textContent = `방 코드 [${txt}] 복사 완료! 친구에게 보내세요.`;
  }
});
