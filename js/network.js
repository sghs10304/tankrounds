'use strict';

/* ============================ 온라인 멀티플레이 매니저 ============================
 * 1) 보안 웹소켓 MQTT 중계로 학교/기관 방화벽 통과
 * 2) 턴마다 시드(seed) 공유 + 소수점 정밀 발사 좌표
 * 3) 턴 종료 시 Host 권위 상태 확정으로 체력·생사·카드창 100% 일치
 */
const BROKER_URLS = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker.hivemq.com:8884/mqtt'
];
const TOPIC_PREFIX = 'tankrounds/v8/room/';

const Net = {
  active: false,
  isHost: true,
  myId: 0, // Host = 0 (P1), 참가자 = 1~3 (P2~P4)
  mode: '1v1',
  peers: {}, // 호스트: clientId -> { id, seen } / 참가자: 미사용
  hostId: null,
  welcomed: false,
  helloTimer: null,
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
  lastHandledFireSeq: {}, // 플레이어별 발사 순번
  pendingFireAck: null,
  remoteTarget: null,

  playerCount() { return this.mode === '1v1' ? 2 : 4; },

  cleanup() {
    // 로비·게임 중에 나가면 상대에게 알림
    if (this.welcomed || (this.isHost && Object.keys(this.peers).length)) this.send({ type: '_leave' }, 1);
    if (this.helloTimer) { clearInterval(this.helloTimer); this.helloTimer = null; }
    this.peers = {};
    this.hostId = null;
    this.welcomed = false;
    if (this.connectTimeout) { clearTimeout(this.connectTimeout); this.connectTimeout = null; }
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
    if (this.pendingFireAck) { clearInterval(this.pendingFireAck); this.pendingFireAck = null; }
    this.joining = false;
    this.active = false;
    this.lastAimSent = '';
    this.remoteTarget = null;
    this.fireSeq = 0;
    this.lastHandledFireSeq = {};
    const joinBtn = document.getElementById('btn-join-room');
    if (joinBtn) joinBtn.disabled = false;
    if (this.client) {
      try { this.client.end(false); } catch (e) {}
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
    const client = this.client;
    client.on('connect', () => {
      if (this.client !== client) return; // 연결 전에 창을 닫은 경우
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
    highlightModeButtons();

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
        this.startHeartbeat();
        this.updateLobby();
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
      if (this.isHost && Object.keys(this.peers).length) this.send({ type: '_leave' }, 1);
      this.peers = {};
      if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
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
        if (this.helloTimer) clearInterval(this.helloTimer);
        this.helloTimer = setInterval(() => { if (!this.welcomed) this.send({ type: '_hello' }, 1); }, 1500);
      });

      this.connectTimeout = setTimeout(() => {
        if (!this.active && !this.welcomed) {
          if (this.helloTimer) { clearInterval(this.helloTimer); this.helloTimer = null; }
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

  setMode(mode) {
    if (!this.isHost || this.active || this.welcomed) return;
    this.mode = mode;
    // 줄어든 정원을 넘는 참가자는 내보냄
    for (const [cid, peer] of Object.entries(this.peers)) {
      if (peer.id >= this.playerCount()) {
        delete this.peers[cid];
        this.send({ type: '_full', to: cid }, 1);
      }
    }
    highlightModeButtons();
    if (this.client && this.client.connected && document.getElementById('my-room-code').textContent.length === 4) this.checkStart();
  },

  updateLobby() {
    const joined = Object.keys(this.peers).length + 1;
    const text = `대기실 ${joined} / ${this.playerCount()}명 (${MODE_LABELS[this.mode]})`;
    const status = document.getElementById('p2p-status');
    status.style.color = '#69f0ae';
    status.textContent = text + ' · 인원이 차면 자동 시작';
    this.send({ type: '_lobby', mode: this.mode, joined }, 1);
  },

  checkStart() {
    this.updateLobby();
    if (Object.keys(this.peers).length + 1 < this.playerCount()) return;
    this.active = true;
    const now = performance.now();
    for (const peer of Object.values(this.peers)) peer.seen = now;
    this.send({ type: '_start', mode: this.mode }, 1);
    document.getElementById('p2p-modal').style.display = 'none';
    canvas.focus();
    startMatch(this.mode);
  },

  abort(reason) {
    this.cleanup();
    document.getElementById('p2p-modal').style.display = 'none';
    showBanner('연결 끊김', reason, '#ff5252', 3.0);
    setState('title');
    canvas.focus();
  },

  // 로비 또는 게임 중 한 명이 나갔을 때
  dropPeer(cid) {
    const peer = this.peers[cid];
    if (!peer) return;
    delete this.peers[cid];
    if (this.active) {
      this.send({ type: '_abort', reason: `P${peer.id + 1} 연결이 종료되었습니다` }, 1);
      this.abort(`P${peer.id + 1} 연결이 종료되었습니다`);
    } else {
      this.updateLobby();
    }
  },

  hostLost() {
    if (this.active) { this.abort('방장과의 연결이 종료되었습니다'); return; }
    this.cleanup();
    const status = document.getElementById('p2p-status');
    status.style.color = '#ff5252';
    status.textContent = '방장이 나갔습니다. 창을 닫고 다시 시도하세요.';
  },

  startHeartbeat() {
    this.lastPong = performance.now();
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => {
      this.send({ type: '_ping' }, 0);
      const now = performance.now();
      if (this.isHost) {
        for (const [cid, peer] of Object.entries(this.peers)) {
          if (now - peer.seen > 18000) this.dropPeer(cid);
        }
      } else if (this.welcomed && now - this.lastPong > 18000) {
        this.hostLost();
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

    if (this.isHost) {
      const peer = this.peers[msg.sender];
      if (msg.type === '_hello') {
        if (peer) { // 환영 메시지 유실 시 재전송
          this.send({ type: '_welcome', to: msg.sender, id: peer.id, mode: this.mode }, 1);
          return;
        }
        const used = new Set(Object.values(this.peers).map(p => p.id));
        let id = 1;
        while (used.has(id)) id++;
        if (this.active || id >= this.playerCount()) {
          this.send({ type: '_full', to: msg.sender }, 1);
          return;
        }
        this.peers[msg.sender] = { id, seen: performance.now() };
        this.send({ type: '_welcome', to: msg.sender, id, mode: this.mode }, 1);
        this.checkStart();
        return;
      }
      if (!peer) return; // 방에 없는 클라이언트의 메시지는 무시
      peer.seen = performance.now();
      if (msg.type === '_leave') { this.dropPeer(msg.sender); return; }
    } else {
      if (msg.type === '_welcome') {
        if (msg.to !== this.clientId || !this.joining) return;
        if (this.connectTimeout) { clearTimeout(this.connectTimeout); this.connectTimeout = null; }
        if (this.helloTimer) { clearInterval(this.helloTimer); this.helloTimer = null; }
        this.joining = false;
        this.welcomed = true;
        this.hostId = msg.sender;
        this.myId = msg.id;
        this.mode = msg.mode;
        highlightModeButtons();
        const status = document.getElementById('p2p-status');
        status.style.color = '#69f0ae';
        status.textContent = `입장 완료! 당신은 P${msg.id + 1} · 시작을 기다리는 중...`;
        this.startHeartbeat();
        return;
      }
      if (msg.type === '_full') {
        if (msg.to !== this.clientId) return;
        this.welcomed = false;
        this.cleanup();
        const status = document.getElementById('p2p-status');
        status.style.color = '#ff5252';
        status.textContent = '방이 가득 찼거나 이미 시작했습니다.';
        return;
      }
      if (!this.welcomed) return;
      if (msg.sender === this.hostId) {
        this.lastPong = performance.now();
        if (msg.type === '_leave') { this.hostLost(); return; }
        if (msg.type === '_abort') { this.abort(msg.reason); return; }
        if (msg.type === '_lobby' && !this.active) {
          this.mode = msg.mode;
          highlightModeButtons();
          document.getElementById('p2p-status').textContent =
            `당신은 P${this.myId + 1} · 대기실 ${msg.joined} / ${this.playerCount()}명 (${MODE_LABELS[this.mode]})`;
          return;
        }
        if (msg.type === '_start' && !this.active) {
          this.active = true;
          this.mode = msg.mode;
          document.getElementById('p2p-modal').style.display = 'none';
          canvas.focus();
          startMatch(this.mode);
          return;
        }
      }
    }

    if (msg.type.startsWith('_')) return;
    if (!this.active) return;

    switch (msg.type) {
      case 'roundSetup': {
        this.remoteTarget = null;
        this.lastHandledFireSeq = {};
        RNG.setSeed(msg.seed);
        G.mode = msg.mode;
        G.round = msg.round;
        G.turnCount = 0;
        G.nextFirst = msg.nextFirst;
        applyRule(msg.rule);
        if (msg.biome) setBiome(msg.biome);
        Terrain.top.set(msg.terrainTop);
        Terrain.rebuild();
        if (msg.px) msg.px.forEach((x, idx) => { if (players[idx]) players[idx].x = x; });
        resetPlayersForRound();
        G.crates = msg.crates;
        G.portals = msg.portals;
        Sfx.roundStart();
        beginTurn(msg.turn, msg.wind, msg.seed);
        const b = BIOME_DEFS[G.biome];
        const sub = G.round === 1 ? `⚡ 초고속 1R (체력 50) · ${b.icon} ${b.name}` : G.round === 2 ? `⚡ 스피드 2R (체력 90) · ${b.icon} ${b.name}` : G.round === 3 ? `⚡ 3R (체력 120) · ${b.icon} ${b.name}` : `${b.icon} ${b.name} · ${players[G.turn].name} 선공`;
        showRoundBanner(sub);
        break;
      }
      case 'turnStart': {
        this.remoteTarget = null;
        if (G.state === 'resolving') {
          G.pending.length = 0;
          G.shells.length = 0;
          G.fields.length = 0;
        }
        if (msg.states) syncAuthoritativeState(msg.states);
        G.turnCount = msg.turnCount - (players[msg.turn].alive ? 1 : 0);
        beginTurn(msg.turn, msg.wind, msg.seed);
        break;
      }
      case 'roundEndSync': {
        this.remoteTarget = null;
        G.pending.length = 0;
        G.shells.length = 0;
        G.fields.length = 0;
        if (msg.states) syncAuthoritativeState(msg.states);
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
        if (msg.to === this.clientId && this.pendingFireAck) {
          clearInterval(this.pendingFireAck);
          this.pendingFireAck = null;
        }
        break;
      }
      case 'fire': {
        // 방장이 수신 확인 (방장이 쏜 탄은 참가자가 확인)
        if (this.isHost || msg.sender === this.hostId) this.send({ type: 'fireAck', seq: msg.seq, to: msg.sender }, 1);
        if (msg.seq <= (this.lastHandledFireSeq[msg.id] ?? -1)) break;
        this.lastHandledFireSeq[msg.id] = msg.seq;
        this.remoteTarget = null;

        const p = players[msg.id];
        if (p && msg.ghost) {
          G.pending.length = 0;
          G.shells.length = 0;
          G.turn = msg.id;
          RNG.setSeed(msg.fireSeed);
          ghostFire(p, msg.ghost.x, msg.ghost.kind, true);
          break;
        }
        if (p && p.alive) {
          if (G.state !== 'aiming' || G.turn !== msg.id) {
            G.pending.length = 0;
            G.shells.length = 0;
            G.fields.length = 0;
            G.turn = msg.id;
            setState('aiming');
          }
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
        G.deal = msg.deal || null;
        G.cardQueue = msg.queue || [msg.loser];
        G.cardLoser = G.cardQueue[0];
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
        startMatch(this.mode);
        break;
      }
    }
  }
};

const MODE_LABELS = { '1v1': '1:1', '2v2': '2:2 팀전', ffa4: '4인 난투' };
function highlightModeButtons() {
  document.querySelectorAll('.mode-btn').forEach(el => {
    el.classList.toggle('on', el.dataset.mode === Net.mode);
    el.disabled = !Net.isHost;
  });
}
document.querySelectorAll('.mode-btn').forEach(el => {
  el.addEventListener('click', () => Net.setMode(el.dataset.mode));
});

window.addEventListener('beforeunload', () => {
  if (Net.active || Net.welcomed || Object.keys(Net.peers).length) Net.send({ type: '_leave' }, 0);
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
