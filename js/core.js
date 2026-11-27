// js/core.js
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const W = 1280;
const H = 720;
canvas.width = W;
canvas.height = H;

// 게임 모드: '1v1' | '2v2' | 'ffa'
let gameMode = '1v1';
let gameState = 'TITLE'; // TITLE, DRAFT, AIM, FIRING, TURN_END, ROUND_OVER, MATCH_OVER

// Seeded PRNG (멀티/싱글 결정론적 동기화)
let rngSeed = Date.now() % 2147483647;
function setSeed(s) { rngSeed = s % 2147483647; if (rngSeed <= 0) rngSeed += 2147483646; }
function rand() {
  rngSeed = (rngSeed * 16807) % 2147483647;
  return (rngSeed - 1) / 2147483646;
}
function randRange(min, max) { return min + rand() * (max - min); }
function randInt(min, max) { return Math.floor(randRange(min, max + 1)); }

// 지역 테마
const BIOMES = [
  { id: 'plains', name: '초원 전장', skyTop: '#162447', skyBot: '#1f4068', groundTop: '#4ecca3', groundBot: '#233142', fuelMult: 1.0, friction: 0.85, speedMult: 1.0 },
  { id: 'desert', name: '작열하는 사막', skyTop: '#4a1c1c', skyBot: '#d97724', groundTop: '#f6d365', groundBot: '#b86b28', fuelMult: 1.45, friction: 0.85, speedMult: 0.95 },
  { id: 'tundra', name: '혹한의 툰드라', skyTop: '#0f2027', skyBot: '#2c5364', groundTop: '#e0fbfc', groundBot: '#5c80bc', fuelMult: 1.1, friction: 0.96, speedMult: 1.1 },
  { id: 'swamp',  name: '독안개 늪지대', skyTop: '#132a13', skyBot: '#31572c', groundTop: '#90a955', groundBot: '#2b3a1e', fuelMult: 1.2, friction: 0.72, speedMult: 0.7 }
];
let currentBiome = BIOMES[0];

// 지형 및 전장 상태
let terrain = new Float32Array(W);
let players = [];
let projectiles = [];
let effects = [];
let particles = [];
let floatingTexts = [];

// 턴 및 서든데스 상태
let currentTurnIndex = 0;
let turnCount = 1;
let wind = 0;
let suddenDeathActive = false;
let deathZoneMargin = 0; // 양쪽 끝에서 좁혀오는 데스존 픽셀 너비

// 팀/개인 라운드 승수
let scores = { blue: 0, red: 0, p0: 0, p1: 0, p2: 0, p3: 0 };
let roundNumber = 1;
const WIN_ROUNDS = 3;

// 입력 상태
const keys = {};
let mouse = { x: W / 2, y: H / 2, down: false };
let hoverTitleBtn = -1;

// 유틸리티
function addFloatingText(x, y, text, color = '#fff', size = 18) {
  floatingTexts.push({ x, y, text, color, size, life: 75, vy: -0.9 });
}

function spawnParticles(x, y, color, count = 15, speed = 4) {
  for (let i = 0; i < count; i++) {
    const ang = randRange(0, Math.PI * 2);
    const spd = randRange(0.5, speed);
    particles.push({
      x, y,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd - 1,
      color,
      size: randRange(2, 5),
      life: randRange(25, 50)
    });
  }
}

function getTerrainY(x) {
  const ix = Math.max(0, Math.min(W - 1, Math.floor(x)));
  return terrain[ix];
}

function deformTerrain(cx, cy, radius) {
  const startX = Math.max(0, Math.floor(cx - radius));
  const endX = Math.min(W - 1, Math.ceil(cx + radius));
  for (let x = startX; x <= endX; x++) {
    const dx = x - cx;
    const dy = Math.sqrt(Math.max(0, radius * radius - dx * dx));
    const craterBottom = cy + dy;
    if (terrain[x] < craterBottom) {
      terrain[x] = Math.min(H - 25, craterBottom);
    }
  }
}
