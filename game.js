// === Utility ===
const rand = (a, b) => Math.random() * (b - a) + a;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Wrap-around function for pacman-style map
function wrapPos(x, y, width, height) {
  let wx = x % width;
  let wy = y % height;
  if (wx < 0) wx += width;
  if (wy < 0) wy += height;
  return { x: wx, y: wy };
}

// === Canvas setup ===
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const minimapCanvas = document.getElementById('minimap');
const minimapCtx = minimapCanvas ? minimapCanvas.getContext('2d') : null;
function resize() {
  canvas.width = innerWidth;
  canvas.height = innerHeight;
  if (minimapCanvas) {
    minimapCanvas.width = 150;
    minimapCanvas.height = 150;
  }
}
addEventListener('resize', resize, { passive: true });
resize();

// === Performance optimizations ===
let lastHUDUpdate = 0;
const HUD_UPDATE_INTERVAL = 100; // Update HUD every 100ms instead of every frame

// Helper function to render object with wrap-around (optimized - only renders visible copies)
// This function will be defined after state is initialized
let renderWithWrapAround;

// === Game state (single class: Chrobry) ===
let state = JSON.parse(localStorage.getItem('chrobry_save_v2')) || {
  pos: { x: 3000, y: 3000 }, vel: { x: 0, y: 0 }, facing: { x: 1, y: 0 },
  hp: 100, hpMax: 100, mp: 50, mpMax: 50,
  level: 1, xp: 0, gold: 0,
  lives: 3, // Liczba żyć gracza
  speed: 2.8,
  attack: { cooldown: 0, cdMelee: 400, cdRanged: 300 },
  meleeDamage: 18, // Siła ataku wręcz
  rangedDamage: 16, // Siła ataku projectile
  pickupMagnetRange: 0, // Zasięg przyciągania dropów (w pikselach)
  levelUpPoints: 0, // Punkty do wykorzystania przy levelowaniu
  ultCooldown: 0, // Cooldown ult ataku
  treeRespawnTimer: 0, // Timer respawnu drzew
  pinballCooldown: 0, // Cooldown kolizji ciałem
  meleeSpin: null,
  lastAttackType: null, // 'melee' or 'ranged' - ostatni typ ataku gracza
  enemies: [], pickups: [], projectiles: [],
  knockback: { x: 0, y: 0, t: 0 }, // Knockback animation
  lastHitTime: 0, // Cooldown for taking damage
  barAnimations: { hp: false, mp: false, xp: false }, // Animacje pasków
  enemyKnockback: {}, // Knockback dla przeciwników {enemyId: {x, y, t}}
  world: { width: 6000, height: 6000 },
  paused: false,
  // New: inventory and quests
  inventory: { apples: 0, meat: 0, seeds: 0, mead: 0, wood: 0 },
  plantingMode: false, // Mode for planting trees
  playerReaction: { emoji: null, timer: 0 }, // Reakcja gracza (emoji + czas)
  interactionMode: false, // Mode for interacting with NPCs
  quests: { tree: false, son: false, book: false },
  lastMinuteSpawn: 0, // Timer for periodic enemy spawning (every minute)
  // New: NPCs
  woman: { x: 3500, y: 3500, t: 0, givenApples: 0, givenMeat: 0 },
  // New: Children
  children: [],
  wizard: { x: 2500, y: 2500, t: 0, givenMeat: 0, givenApples: 0, givenGold: 0 },
  // New: trees and home
  trees: [],
  home: { x: 3000, y: 2800 }, // Domek nad graczem na starcie
  homeGuards: [], // Strażnicy wokół domu: { x, y, attackTimer, id }
  // New: nests/spawners for enemies
  nests: [], // Array of nests: { type: enemyIndex, x, y, hp, hpMax, spawnTimer, nextSpawn, id, respawnTimer }
  nestRespawns: [], // Array of pending respawns: { type: enemyIndex, timer: 30000 }
  // Megabestie - pojawiają się po zniszczeniu 3 legowisk danego typu
  megabeasts: [], // Array of megabeasts: { type: enemyIndex, x, y, hp, hpMax, id }
  nestsDestroyedByType: [0, 0, 0, 0], // Licznik zniszczonych legowisk per typ [wilk, świnia, żmija, trup]
  // Achievements system
  achievements: {}, // { achievementId: true/false }
  stats: { // Statystyki do śledzenia achievmentów
    enemiesKilled: 0,
    treesPlanted: 0,
    nestsDestroyed: 0,
    itemsCollected: { apples: 0, meat: 0, mead: 0, gold: 0, seeds: 0, wood: 0 },
    childrenBorn: 0,
    maxLevel: 1
  }
};

// Initialize missing stats for old saves
if (state.meleeDamage === undefined) state.meleeDamage = 18;
if (state.rangedDamage === undefined) state.rangedDamage = 16;
if (state.pickupMagnetRange === undefined) state.pickupMagnetRange = 0;
if (state.levelUpPoints === undefined) state.levelUpPoints = 0;
if (state.inventory.wood === undefined) state.inventory.wood = 0;
if (state.interactionMode === undefined) state.interactionMode = false;
if (state.lastMinuteSpawn === undefined) state.lastMinuteSpawn = 0;
if (state.nests === undefined) state.nests = [];
if (state.nestRespawns === undefined) state.nestRespawns = [];
if (state.megabeasts === undefined) state.megabeasts = [];
if (state.nestsDestroyedByType === undefined) state.nestsDestroyedByType = [0, 0, 0, 0];
if (state.lives === undefined) state.lives = 3;
if (state.respawnInvulnerable === undefined) state.respawnInvulnerable = 0;
if (state.achievements === undefined) state.achievements = {};
if (state.stats === undefined) {
  state.stats = {
    enemiesKilled: 0,
    treesPlanted: 0,
    nestsDestroyed: 0,
    itemsCollected: { apples: 0, meat: 0, mead: 0, gold: 0, seeds: 0, wood: 0 },
    childrenBorn: 0,
    maxLevel: 1
  };
}
if (state.achievements === undefined) state.achievements = {};
if (state.stats === undefined) {
  state.stats = {
    enemiesKilled: 0,
    treesPlanted: 0,
    nestsDestroyed: 0,
    itemsCollected: { apples: 0, meat: 0, mead: 0, gold: 0, seeds: 0, wood: 0 },
    childrenBorn: 0,
    maxLevel: 1
  };
}
if (state.lowHPWarningShown === undefined) state.lowHPWarningShown = false;
if (state.lowHPWarning === undefined) state.lowHPWarning = null;

// Initialize trees
if (state.trees.length === 0) {
  for (let i = 0; i < 60; i++) {
    state.trees.push({
      x: rand(0, state.world.width),
      y: rand(0, state.world.height),
      type: '🌳',
      lastDrop: 0,
      hp: 2, // 2 uderzenia
      hpMax: 2,
      size: rand(2.2, 2.7), // Rozmiar od 2.2 do 2.7x standardowego emoji (30px)
      id: Math.random().toString(36).slice(2)
    });
  }
} else {
  // Initialize HP and size for existing trees (for old saves)
  for (const tree of state.trees) {
    if (!tree.type) tree.type = '🌳';
    tree.hpMax = 2; // Wymuszamy 2 HP
    if (tree.hp === undefined || tree.hp > 2) {
      tree.hp = 2;
    }
    if (tree.size === undefined) {
      tree.size = rand(2.2, 2.7); // Dodaj rozmiar dla starych zapisów
    }
  }
}

// Migrate procedural conifers to state.trees
if (!state.conifersInitialized) {
  const tile = 80;
  const worldTilesX = Math.ceil(state.world.width / tile);
  const worldTilesY = Math.ceil(state.world.height / tile);
  for (let wx = 0; wx < worldTilesX; wx++) {
    for (let wy = 0; wy < worldTilesY; wy++) {
      if (((wx * 73856093 ^ wy * 19349663) >>> 0) % 7 === 0) {
        const hash = ((wx * 73856093 ^ wy * 19349663) >>> 0);
        const sizeMultiplier = 1.5 + (hash % 100) / 100.0;
        state.trees.push({
          x: wx * tile,
          y: wy * tile,
          type: '🌲', // Explicit type
          lastDrop: 0,
          hp: 2,
          hpMax: 2,
          size: sizeMultiplier,
          id: 'conifer_' + wx + '_' + wy
        });
      }
    }
  }
  state.conifersInitialized = true;
}

// === Collision radii ===
const COLLIDE = { playerR: 20, enemyR: 18 };

// Emoji reakcje gracza dla różnych zdarzeń (tylko buźki, bez powtórzeń między kategoriami)
const PLAYER_REACTIONS = {
  // Radosne buźki przy zbieraniu przedmiotów (bez serduszek)
  pickup: ['😊', '😄', '😃', '🙂', '😁', '😆', '😅', '🤩', '🥳', '😋', '🤗', '😀', '😂', '🤣'],
  // Dumne/zadowolone buźki po zabiciu wroga (bez serduszek)
  killEnemy: ['😤', '😏', '😎', '🤓', '🤑', '🤠', '😈', '😉', '😌', '🤪', '😜', '😝', '😛', '🤨', '🧐'],
  // Zainteresowane/zakłopotane buźki przy kobiecie (TYLKO z serduszkami: 😍🥰😘😗😙😚)
  nearWoman: ['😳', '🤤', '😍', '🥰', '😘', '😗', '😙', '😚', '😊', '😉', '😏', '😌', '🤩', '😎', '😄', '😁', '😆', '😅', '🤗'],
  // Myślące/przyjazne buźki przy czarodzieju (bez serduszek)
  nearWizard: ['🤔', '🤝', '🙂', '🙃'],
  // Smutne/przestraszone buźki przy otrzymaniu obrażeń (bez serduszek)
  takeDamage: ['😢', '😰', '😓', '😞', '😟', '😔', '😕', '🙁', '☹️', '😣', '😖', '😫', '😩', '😭', '😠', '😡', '🤬', '😱', '😨', '😥', '😪', '😵', '🥺', '😶', '😐', '😑', '😬', '🙄', '😯', '😦', '😧', '😮', '😲', '🥱', '😴', '🤐', '🤢', '🤮', '🤧', '😷', '🤒', '🤕', '👿', '💀', '☠️']
};

// Funkcja do wywołania reakcji gracza
function triggerPlayerReaction(type) {
  const reactions = PLAYER_REACTIONS[type];
  if (reactions && reactions.length > 0) {
    const randomEmoji = reactions[Math.floor(Math.random() * reactions.length)];
    state.playerReaction.emoji = randomEmoji;
    state.playerReaction.timer = 3000; // 3 sekundy
  }
}

// Enemies & pickups
// === Enemy Definitions ===
// Każdy przeciwnik ma:
// - dropCount: [min, max] - ile przedmiotów może dropnąć (słaby: 1-2, średni: 2-3, mocny: 3-5)
// - drops: lista możliwych dropów z szansą (chance: 0.0-1.0) i wartością
// Aby dodać nowy typ dropu:
// 1. Dodaj nowy typ do PICKUPS (jeśli nie istnieje)
// 2. Dodaj {kind:'nowyTyp', chance:0.X, value:Y} do listy drops odpowiedniego przeciwnika
const ENEMIES = [
  {
    name: 'Wilk',
    emoji: '🐺',
    hp: 30,
    atk: 8,
    speed: 1.6,
    range: 20,
    dropCount: [1, 2], // Słaby - 1-2 dropy
    drops: [
      { kind: 'xp', chance: 1.0, value: [10, 20] }, // Zawsze XP
      { kind: 'meat', chance: 0.6, value: 1 },
      { kind: 'apple', chance: 0.3, value: 1 },
      { kind: 'mead', chance: 0.2, value: 1 },
      { kind: 'seed', chance: 0.1, value: 1 }
    ]
  },
  {
    name: 'Dzika świnia',
    emoji: '🐗',
    hp: 40,
    atk: 10,
    speed: 1.4,
    range: 16,
    dropCount: [2, 3], // Średni - 2-3 dropy
    drops: [
      { kind: 'xp', chance: 1.0, value: [15, 25] }, // Zawsze XP
      { kind: 'meat', chance: 0.7, value: 1 },
      { kind: 'apple', chance: 0.4, value: 1 },
      { kind: 'mead', chance: 0.3, value: 1 },
      { kind: 'seed', chance: 0.15, value: 1 }
    ]
  },
  {
    name: 'Żmija',
    emoji: '🐍',
    hp: 20,
    atk: 6,
    speed: 1.8,
    range: 14,
    dropCount: [1, 2], // Słaby - 1-2 dropy
    drops: [
      { kind: 'xp', chance: 1.0, value: [8, 15] }, // Zawsze XP
      { kind: 'meat', chance: 0.5, value: 1 },
      { kind: 'apple', chance: 0.25, value: 1 },
      { kind: 'mead', chance: 0.15, value: 1 },
      { kind: 'seed', chance: 0.08, value: 1 }
    ]
  },
  {
    name: 'Trup',
    emoji: '🧟',
    hp: 50,
    atk: 12,
    speed: 1.2,
    range: 18,
    dropCount: [3, 5], // Mocny - 3-5 dropów
    drops: [
      { kind: 'xp', chance: 1.0, value: [20, 35] }, // Zawsze XP
      { kind: 'meat', chance: 0.8, value: 1 },
      { kind: 'apple', chance: 0.5, value: 1 },
      { kind: 'mead', chance: 0.4, value: 1 },
      { kind: 'seed', chance: 0.2, value: 1 }
    ]
  },
];
const PICKUPS = {
  meat: { emoji: '🍖', kind: 'hp', value: [15, 25] },
  mead: { emoji: '🍾', kind: 'mp', value: [12, 22] },
  gold: { emoji: '🪙', kind: 'gold', value: [1, 4] },
  xp: { emoji: '✨', kind: 'xp', value: [12, 22] },
  apple: { emoji: '🍎', kind: 'apple', value: 1 },
  seed: { emoji: '🌱', kind: 'seed', value: 1 },
  wood: { emoji: '🪵', kind: 'wood', value: 1 },
};

// XP requirement curve - zmniejszone wymagania dla łatwiejszego osiągnięcia wyższych poziomów
const xpReq = lvl => Math.floor(50 + (lvl - 1) * (lvl - 1) * 8);

// === Achievements System ===
const ACHIEVEMENTS = [
  // Questy
  { id: 'quest_tree', emoji: '🌳', name: 'Pierwsze Drzewo', desc: 'Zasadź swoje pierwsze drzewo', check: () => state.quests.tree },
  { id: 'quest_son', emoji: '👶', name: 'Ojciec', desc: 'Spłodź dziecko', check: () => state.quests.son },
  { id: 'quest_book', emoji: '📖', name: 'Pisarz', desc: 'Napisz książkę', check: () => state.quests.book },
  { id: 'quest_all', emoji: '🏆', name: 'Mistrz Zadań', desc: 'Ukończ wszystkie zadania', check: () => state.quests.tree && state.quests.son && state.quests.book },

  // Poziomy
  { id: 'level_5', emoji: '⭐', name: 'Nowicjusz', desc: 'Osiągnij poziom 5', check: () => state.stats.maxLevel >= 5 },
  { id: 'level_10', emoji: '⭐⭐', name: 'Doświadczony', desc: 'Osiągnij poziom 10', check: () => state.stats.maxLevel >= 10 },
  { id: 'level_20', emoji: '⭐⭐⭐', name: 'Weteran', desc: 'Osiągnij poziom 20', check: () => state.stats.maxLevel >= 20 },
  { id: 'level_50', emoji: '👑', name: 'Legenda', desc: 'Osiągnij poziom 50', check: () => state.stats.maxLevel >= 50 },

  // Zabijanie wrogów
  { id: 'kill_10', emoji: '⚔️', name: 'Wojownik', desc: 'Zabij 10 wrogów', check: () => state.stats.enemiesKilled >= 10 },
  { id: 'kill_50', emoji: '🗡️', name: 'Zabójca', desc: 'Zabij 50 wrogów', check: () => state.stats.enemiesKilled >= 50 },
  { id: 'kill_100', emoji: '💀', name: 'Rzeźnik', desc: 'Zabij 100 wrogów', check: () => state.stats.enemiesKilled >= 100 },
  { id: 'kill_500', emoji: '☠️', name: 'Anioł Śmierci', desc: 'Zabij 500 wrogów', check: () => state.stats.enemiesKilled >= 500 },

  // Jaskinie
  { id: 'nest_1', emoji: '🏰', name: 'Niszczyciel', desc: 'Zniszcz pierwszą jaskinię', check: () => state.stats.nestsDestroyed >= 1 },
  { id: 'nest_5', emoji: '🏛️', name: 'Demolka', desc: 'Zniszcz 5 jaskiń', check: () => state.stats.nestsDestroyed >= 5 },
  { id: 'nest_10', emoji: '💣', name: 'Eksplozja', desc: 'Zniszcz 10 jaskiń', check: () => state.stats.nestsDestroyed >= 10 },

  // Drzewa
  { id: 'tree_5', emoji: '🌲', name: 'Ogrodnik', desc: 'Zasadź 5 drzew', check: () => state.stats.treesPlanted >= 5 },
  { id: 'tree_20', emoji: '🌳', name: 'Leśnik', desc: 'Zasadź 20 drzew', check: () => state.stats.treesPlanted >= 20 },
  { id: 'tree_50', emoji: '🌴', name: 'Las', desc: 'Zasadź 50 drzew', check: () => state.stats.treesPlanted >= 50 },

  // Zbieranie przedmiotów
  { id: 'collect_100_apple', emoji: '🍎', name: 'Zbieracz Jabłek', desc: 'Zbierz 100 jabłek', check: () => state.stats.itemsCollected.apples >= 100 },
  { id: 'collect_100_meat', emoji: '🍖', name: 'Myśliwy', desc: 'Zbierz 100 mięsa', check: () => state.stats.itemsCollected.meat >= 100 },
  { id: 'collect_50_mead', emoji: '🍾', name: 'Pijak', desc: 'Zbierz 50 flaszek', check: () => state.stats.itemsCollected.mead >= 50 },
  { id: 'collect_100_gold', emoji: '💰', name: 'Bogacz', desc: 'Zbierz 100 monet', check: () => state.stats.itemsCollected.gold >= 100 },
  { id: 'collect_500_gold', emoji: '💎', name: 'Milioner', desc: 'Zbierz 500 monet', check: () => state.stats.itemsCollected.gold >= 500 },

  // Dzieci
  { id: 'child_1', emoji: '👶', name: 'Ojciec', desc: 'Miej pierwsze dziecko', check: () => state.stats.childrenBorn >= 1 },
  { id: 'child_3', emoji: '👨‍👩‍👧‍👦', name: 'Rodzina', desc: 'Miej 3 dzieci', check: () => state.stats.childrenBorn >= 3 },
  { id: 'child_5', emoji: '👪', name: 'Klany', desc: 'Miej 5 dzieci', check: () => state.stats.childrenBorn >= 5 },

  // Specjalne
  { id: 'survivor', emoji: '💪', name: 'Ocalony', desc: 'Przetrwaj z 1 HP', check: () => state.hp <= 1 && state.hp > 0 },
  {
    id: 'collector', emoji: '🎒', name: 'Kolekcjoner', desc: 'Zbierz łącznie 500 przedmiotów', check: () => {
      const total = state.stats.itemsCollected.apples + state.stats.itemsCollected.meat +
        state.stats.itemsCollected.mead + state.stats.itemsCollected.gold +
        state.stats.itemsCollected.seeds + state.stats.itemsCollected.wood;
      return total >= 500;
    }
  }
];

// Funkcja sprawdzająca i odblokowująca achievmenty
function checkAchievements() {
  for (const achievement of ACHIEVEMENTS) {
    if (!state.achievements[achievement.id] && achievement.check()) {
      state.achievements[achievement.id] = true;
      toast(`🏆 Osiągnięcie odblokowane: ${achievement.emoji} ${achievement.name}`);
      updateAchievementsModal();
      // Zapisz stan
      localStorage.setItem('chrobry_save_v2', JSON.stringify(state));
    }
  }
}

// === Input ===
let pointer = { active: false, id: null, x: 0, y: 0, justTapped: false };
let mousePos = { x: 0, y: 0 };
const cam = { x: state.pos.x, y: state.pos.y };

// Virtual joystick
let joystick = {
  active: false,
  touchId: null,
  baseX: 0,
  baseY: 0,
  stickX: 0,
  stickY: 0,
  maxDistance: 50 // Maksymalna odległość od środka
};
function worldToScreen(wx, wy) { return { x: wx - cam.x + canvas.width / 2, y: wy - cam.y + canvas.height / 2 }; }
function screenToWorld(sx, sy) { return { x: sx + cam.x - canvas.width / 2, y: sy + cam.y - canvas.height / 2 }; }

// Define renderWithWrapAround after cam and functions are initialized
renderWithWrapAround = function (x, y, renderFn, margin = 50) {
  const marginX = margin;
  const marginY = margin;
  const viewLeft = cam.x - canvas.width / 2 - marginX;
  const viewRight = cam.x + canvas.width / 2 + marginX;
  const viewTop = cam.y - canvas.height / 2 - marginY;
  const viewBottom = cam.y + canvas.height / 2 + marginY;

  // Calculate which copies to render
  const startOffsetX = Math.floor((viewLeft - x) / state.world.width) * state.world.width;
  const endOffsetX = Math.ceil((viewRight - x) / state.world.width) * state.world.width;
  const startOffsetY = Math.floor((viewTop - y) / state.world.height) * state.world.height;
  const endOffsetY = Math.ceil((viewBottom - y) / state.world.height) * state.world.height;

  // Render only visible copies
  for (let ox = startOffsetX; ox <= endOffsetX; ox += state.world.width) {
    for (let oy = startOffsetY; oy <= endOffsetY; oy += state.world.height) {
      const s = worldToScreen(x + ox, y + oy);
      if (s.x > -margin && s.x < canvas.width + margin && s.y > -margin && s.y < canvas.height + margin) {
        renderFn(s);
      }
    }
  }
};

canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); pointer.active = true; pointer.id = e.pointerId; pointer.x = e.clientX; pointer.y = e.clientY; pointer.justTapped = true; });
canvas.addEventListener('pointermove', (e) => { if (pointer.active && e.pointerId === pointer.id) { pointer.x = e.clientX; pointer.y = e.clientY; } mousePos.x = e.clientX; mousePos.y = e.clientY; });
canvas.addEventListener('pointerup', (e) => { if (e.pointerId === pointer.id) { pointer.active = false; pointer.id = null; state.vel.x = 0; state.vel.y = 0; } });

// Mouse click for arrow or planting
canvas.addEventListener('click', (e) => {
  if (state.paused) return;
  const w = screenToWorld(e.clientX, e.clientY);

  // Planting mode - plant tree at clicked location
  if (state.plantingMode && state.inventory.seeds > 0) {
    state.trees.push({
      x: w.x,
      y: w.y,
      type: '🌳',
      lastDrop: 0,
      hp: 2,
      hpMax: 2,
      size: rand(2.2, 2.7), // Rozmiar od 2.2 do 2.7x standardowego emoji (30px)
      id: Math.random().toString(36).slice(2)
    });
    state.inventory.seeds--;
    toast('🌳 Zasadzono drzewo!');
    updateInventory();
    if (!state.quests.tree) {
      state.quests.tree = true;
      toast('🎉 Ukończono zadanie: Zasadź drzewo!');
      updateHUD();
    }
    return;
  }

  // Interaction mode - check if clicking on NPCs
  if (state.interactionMode) {
    // Check woman
    let dx = state.woman.x - w.x, dy = state.woman.y - w.y;
    if (Math.abs(dx) > state.world.width / 2) dx = dx > 0 ? dx - state.world.width : dx + state.world.width;
    if (Math.abs(dy) > state.world.height / 2) dy = dy > 0 ? dy - state.world.height : dy + state.world.height;
    if (Math.hypot(dx, dy) < 50) {
      state.paused = true;
      updateWomanDialog();
      womanModal.style.display = 'flex';
      return;
    }

    // Check wizard
    dx = state.wizard.x - w.x;
    dy = state.wizard.y - w.y;
    if (Math.abs(dx) > state.world.width / 2) dx = dx > 0 ? dx - state.world.width : dx + state.world.width;
    if (Math.abs(dy) > state.world.height / 2) dy = dy > 0 ? dy - state.world.height : dy + state.world.height;
    if (Math.hypot(dx, dy) < 50) {
      state.paused = true;
      updateWizardDialog();
      wizardModal.style.display = 'flex';
      return;
    }

    // If clicked but not on NPC, just exit interaction mode
    toggleInteractionMode();
    return;
  }

  // Check if clicking on seed pickup to collect
  let clickedSeed = null;
  for (let i = state.pickups.length - 1; i >= 0; i--) {
    const p = state.pickups[i];
    if (p.kind === 'seed') {
      let dx = p.x - w.x, dy = p.y - w.y;
      if (Math.abs(dx) > state.world.width / 2) dx = dx > 0 ? dx - state.world.width : dx + state.world.width;
      if (Math.abs(dy) > state.world.height / 2) dy = dy > 0 ? dy - state.world.height : dy + state.world.height;
      const dist = Math.hypot(dx, dy);
      if (dist < 40) {
        clickedSeed = p;
        break;
      }
    }
  }
  if (clickedSeed) {
    // Collect seed to inventory
    state.inventory.seeds++;
    const idx = state.pickups.findIndex(p => p === clickedSeed);
    if (idx >= 0) state.pickups.splice(idx, 1);
    toast('🌱 Zebrano ziarno!');
    updateInventory();
    return;
  }

  // Otherwise fire arrow
  let target = null;
  for (const enemy of state.enemies) {
    let dx = enemy.x - w.x, dy = enemy.y - w.y;
    if (Math.abs(dx) > state.world.width / 2) dx = dx > 0 ? dx - state.world.width : dx + state.world.width;
    if (Math.abs(dy) > state.world.height / 2) dy = dy > 0 ? dy - state.world.height : dy + state.world.height;
    if (Math.hypot(dx, dy) < 28) {
      target = enemy;
      break;
    }
  }
  fireArrow(target || w);
});

// Keyboard shortcuts
let keys = {};
addEventListener('keydown', (e) => {
  keys[e.key.toLowerCase()] = true;
  if (e.key === ' ' || e.key === 'Space') {
    e.preventDefault();
    startMeleeSpin();
  }
  if (e.key.toLowerCase() === 'q') {
    e.preventDefault();
    toggleQuestLog();
  }
  if (e.key.toLowerCase() === 'e') {
    e.preventDefault();
    toggleInventory();
  }
  if (e.key.toLowerCase() === 'r') {
    e.preventDefault();
    toggleStats();
  }
  if (e.key.toLowerCase() === 'f') {
    e.preventDefault();
    toggleInteractionMode();
  }
  if (e.key.toLowerCase() === 'n') {
    e.preventDefault();
    // Strzał projectile na desktopie (bez targetu - strzela w kierunku kursora)
    fireArrow(null);
  }
  if (e.key.toLowerCase() === 'u') {
    e.preventDefault();
    fireUltimate();
  }
  if (e.key.toLowerCase() === 'c') {
    e.preventDefault();
    toggleCrafting();
  }
  if (e.key === '?' || e.key === '/') {
    e.preventDefault();
    toggleHelp();
  }
  if (e.key === 'Escape') {
    e.preventDefault();
    // Zamknij wszystkie modale
    if (state.interactionMode) {
      toggleInteractionMode();
    }
    if (questModal && questModal.style.display === 'flex') {
      questModal.style.display = 'none';
      state.paused = false;
    }
    if (inventoryModal && inventoryModal.style.display === 'flex') {
      inventoryModal.style.display = 'none';
      state.paused = false;
      state.plantingMode = false;
    }
    if (statsModal && statsModal.style.display === 'flex') {
      statsModal.style.display = 'none';
      state.paused = false;
    }
    if (womanModal && womanModal.style.display === 'flex') {
      womanModal.style.display = 'none';
      state.paused = false;
    }
    if (wizardModal && wizardModal.style.display === 'flex') {
      wizardModal.style.display = 'none';
      state.paused = false;
    }
    if (helpModal && helpModal.style.display === 'flex') {
      helpModal.style.display = 'none';
      state.paused = false;
    }
    const craftingModal = document.getElementById('craftingModal');
    if (craftingModal && craftingModal.style.display === 'flex') {
      craftingModal.style.display = 'none';
      state.paused = false;
    }
    // Level up modal można zamknąć przez Escape (punkty pozostają)
    if (levelUpModal && levelUpModal.style.display === 'flex') {
      closeLevelUp();
      return;
    }
    // Start screen nie zamyka się przez Escape
  }
});
addEventListener('keyup', (e) => {
  keys[e.key.toLowerCase()] = false;
});

// === HUD refs ===
const hpFill = document.getElementById('hpFill');
const mpFill = document.getElementById('mpFill');
const xpFill = document.getElementById('xpFill');
const hpNum = document.getElementById('hpNum');
const mpNum = document.getElementById('mpNum');
const xpNum = document.getElementById('xpNum');
const lvlNum = document.getElementById('lvlNum');
const goldEl = document.getElementById('gold');
const hudApples = document.getElementById('hudApples');
const hudMeat = document.getElementById('hudMeat');
const hudMead = document.getElementById('hudMead');

function updateHUD(force = false) {
  const now = performance.now();
  if (!force && now - lastHUDUpdate < HUD_UPDATE_INTERVAL) return;
  lastHUDUpdate = now;

  const hpPercent = (state.hp / state.hpMax) * 100;
  const mpPercent = (state.mp / state.mpMax) * 100;
  const need = xpReq(state.level);
  const prog = clamp(state.xp / need, 0, 1);
  const xpPercent = prog * 100;

  // Animate bars only if not already animating (pionowe paski używają height zamiast width)
  if (!state.barAnimations.hp) {
    hpFill.style.width = `${hpPercent}%`;
  }
  if (!state.barAnimations.mp) {
    mpFill.style.width = `${mpPercent}%`;
  }
  if (!state.barAnimations.xp) {
    xpFill.style.width = `${xpPercent}%`;
  }

  hpNum.textContent = `${Math.floor(state.hp)}/${state.hpMax}`;
  mpNum.textContent = `${Math.floor(state.mp)}/${state.mpMax}`;
  xpNum.textContent = `${state.xp}/${need}`;
  lvlNum.textContent = state.level;
  goldEl.textContent = state.gold;
  if (hudApples) hudApples.textContent = state.inventory.apples || 0;
  if (hudMeat) hudMeat.textContent = state.inventory.meat || 0;
  if (hudMead) hudMead.textContent = state.inventory.mead || 0;
  const hudWood = document.getElementById('hudWood');
  if (hudWood) hudWood.textContent = state.inventory.wood || 0;
  const livesDisplay = document.getElementById('livesDisplay');
  if (livesDisplay) livesDisplay.textContent = state.lives;

  // Ostrzeżenie o niskim zdrowiu (< 20%) - duży migający komunikat na środku ekranu
  const inventoryBtn = document.getElementById('inventoryBtn');
  if (hpPercent < 20 && state.hp > 0) {
    if (!state.lowHPWarning) {
      state.lowHPWarning = {
        active: true,
        blinkTimer: 0,
        blinkSpeed: 500 // Czas migania w ms
      };
    }
    // Dodaj klasę migania do przycisku inventory
    if (inventoryBtn) {
      inventoryBtn.classList.add('low-hp-blink');
    }
  } else {
    // Resetuj ostrzeżenie gdy zdrowie wzrośnie powyżej 20%
    if (state.lowHPWarning) {
      state.lowHPWarning.active = false;
      state.lowHPWarning = null;
    }
    // Usuń klasę migania z przycisku inventory
    if (inventoryBtn) {
      inventoryBtn.classList.remove('low-hp-blink');
    }
  }

  // Update cooldown indicators
  const cooldownA = document.getElementById('cooldownA');
  const cooldownB = document.getElementById('cooldownB');
  if (cooldownA) {
    const meleeCD = state.attack.cooldown;
    const meleeMaxCD = state.attack.cdMelee;
    const meleePercent = meleeMaxCD > 0 ? Math.min(100, (meleeCD / meleeMaxCD) * 100) : 0;
    cooldownA.style.height = `${meleePercent}%`;
    cooldownA.style.opacity = meleeCD > 0 ? '0.7' : '0';
  }
  if (cooldownB) {
    // Ranged attack uses the same cooldown timer
    const rangedCD = state.attack.cooldown;
    const rangedMaxCD = state.attack.cdRanged;
    const rangedPercent = rangedMaxCD > 0 ? Math.min(100, (rangedCD / rangedMaxCD) * 100) : 0;
    cooldownB.style.height = `${rangedPercent}%`;
    cooldownB.style.opacity = rangedCD > 0 ? '0.7' : '0';
  }

  // Ult cooldown indicator
  const cooldownUlt = document.getElementById('cooldownUlt');
  if (cooldownUlt) {
    const ultCD = state.ultCooldown || 0;
    const ultMaxCD = 2000;
    const ultPercent = ultMaxCD > 0 ? Math.min(100, (ultCD / ultMaxCD) * 100) : 0;
    cooldownUlt.style.height = `${ultPercent}%`;
    cooldownUlt.style.opacity = ultCD > 0 ? '0.7' : '0';
  }

  updateQuestLog();
}

function animateBar(barType, fromPercent, toPercent) {
  const bar = barType === 'hp' ? hpFill : (barType === 'mp' ? mpFill : xpFill);
  const barContainer = barType === 'hp' ? hpFill.parentElement : (barType === 'mp' ? mpFill.parentElement : xpFill.parentElement);

  state.barAnimations[barType] = true;
  barContainer.classList.add('bar-animating');

  // Set start width (poziome paski)
  bar.style.width = `${fromPercent}%`;
  bar.style.transition = 'width 0.4s ease-out';

  // Force reflow
  bar.offsetHeight;

  // Animate to target
  setTimeout(() => {
    bar.style.width = `${toPercent}%`;
    setTimeout(() => {
      state.barAnimations[barType] = false;
      barContainer.classList.remove('bar-animating');
      bar.style.transition = '';
    }, 400);
  }, 10);
}

// === Quest Log ===
const questModal = document.getElementById('questModal');
const quest1Status = document.getElementById('quest1Status');
const quest2Status = document.getElementById('quest2Status');
const quest3Status = document.getElementById('quest3Status');

function updateQuestLog() {
  quest1Status.textContent = state.quests.tree ? '✓ Ukończone' : 'W trakcie';
  quest1Status.style.color = state.quests.tree ? '#4ade80' : '#fbbf24';
  quest2Status.textContent = state.quests.son ? '✓ Ukończone' : 'W trakcie';
  quest2Status.style.color = state.quests.son ? '#4ade80' : '#fbbf24';
  quest3Status.textContent = state.quests.book ? '✓ Ukończone' : 'W trakcie';
  quest3Status.style.color = state.quests.book ? '#4ade80' : '#fbbf24';

  // Aktualizuj subquesty megabestii
  const quest3Nest0 = document.getElementById('quest3Nest0');
  const quest3Nest1 = document.getElementById('quest3Nest1');
  const quest3Nest2 = document.getElementById('quest3Nest2');
  const quest3Nest3 = document.getElementById('quest3Nest3');

  if (quest3Nest0) quest3Nest0.textContent = Math.min(state.nestsDestroyedByType[0] || 0, 3);
  if (quest3Nest1) quest3Nest1.textContent = Math.min(state.nestsDestroyedByType[1] || 0, 3);
  if (quest3Nest2) quest3Nest2.textContent = Math.min(state.nestsDestroyedByType[2] || 0, 3);
  if (quest3Nest3) quest3Nest3.textContent = Math.min(state.nestsDestroyedByType[3] || 0, 3);
}

// Funkcja do przełączania widoczności quest loga
function toggleQuestLog() {
  if (questModal.style.display === 'flex') {
    state.paused = false;
    questModal.style.display = 'none';
  } else {
    state.paused = true;
    updateQuestLog();

    // Ukryj sekcję startową i przycisk startu, jeśli otwieramy quest log w trakcie gry
    const startScreenSection = document.getElementById('startScreenSection');
    const startBtnContainer = document.getElementById('startBtnContainer');
    if (startScreenSection) startScreenSection.style.display = 'none';
    if (startBtnContainer) startBtnContainer.style.display = 'none';

    questModal.style.display = 'flex';
  }
}

// Quest button in header
document.getElementById('questBtn').addEventListener('click', () => {
  toggleQuestLog();
});

document.getElementById('closeQuestBtn').addEventListener('click', () => {
  state.paused = false;
  questModal.style.display = 'none';
});

// Close button dla quest modal - używamy closeQuestBtn na końcu modala (bez modal-close X)

// Funkcja do przełączania opisów questów
function toggleQuestDescription(questNum) {
  const description = document.getElementById(`quest${questNum}Description`);
  const toggle = document.getElementById(`quest${questNum}Toggle`);

  if (description && toggle) {
    const isVisible = description.style.display === 'block';
    description.style.display = isVisible ? 'none' : 'block';
    toggle.textContent = isVisible ? '▼' : '▲';
  }
}

// Przyciski rozwijania opisów questów
const quest1Toggle = document.getElementById('quest1Toggle');
const quest2Toggle = document.getElementById('quest2Toggle');
const quest3Toggle = document.getElementById('quest3Toggle');

if (quest1Toggle) {
  quest1Toggle.addEventListener('click', () => toggleQuestDescription(1));
  // Ustaw domyślną strzałkę na ▲ (opisy są domyślnie rozwinięte)
  quest1Toggle.textContent = '▲';
}
if (quest2Toggle) {
  quest2Toggle.addEventListener('click', () => toggleQuestDescription(2));
  quest2Toggle.textContent = '▲';
}
if (quest3Toggle) {
  quest3Toggle.addEventListener('click', () => toggleQuestDescription(3));
  quest3Toggle.textContent = '▲';
}

// === Inventory Modal ===
const inventoryModal = document.getElementById('inventoryModal');
const invApples = document.getElementById('invApples');
const invMeat = document.getElementById('invMeat');
const invMead = document.getElementById('invMead');
const invSeeds = document.getElementById('invSeeds');
const invWood = document.getElementById('invWood');
const plantingModeIndicator = document.getElementById('plantingModeIndicator');

function updateInventory() {
  invApples.textContent = state.inventory.apples;
  invMeat.textContent = state.inventory.meat;
  invMead.textContent = state.inventory.mead;
  invSeeds.textContent = state.inventory.seeds;
  if (invWood) invWood.textContent = state.inventory.wood;
  plantingModeIndicator.style.display = state.plantingMode ? 'block' : 'none';

  // Aktualizuj HP i MP w inventory modal
  const invHP = document.getElementById('invHP');
  const invHPMax = document.getElementById('invHPMax');
  const invMP = document.getElementById('invMP');
  const invMPMax = document.getElementById('invMPMax');
  const invHPBar = document.getElementById('invHPBar');
  const invMPBar = document.getElementById('invMPBar');

  if (invHP) invHP.textContent = Math.floor(state.hp);
  if (invHPMax) invHPMax.textContent = state.hpMax;
  if (invMP) invMP.textContent = Math.floor(state.mp);
  if (invMPMax) invMPMax.textContent = state.mpMax;

  if (invHPBar) {
    const hpPercent = (state.hp / state.hpMax) * 100;
    invHPBar.style.width = `${hpPercent}%`;
  }
  if (invMPBar) {
    const mpPercent = (state.mp / state.mpMax) * 100;
    invMPBar.style.width = `${mpPercent}%`;
  }
}

function toggleInventory() {
  if (inventoryModal.style.display === 'flex') {
    state.paused = false;
    state.plantingMode = false; // Disable planting mode when closing
    inventoryModal.style.display = 'none';
  } else {
    state.paused = true;
    updateInventory();
    inventoryModal.style.display = 'flex';
  }
}

// Inventory button in header
document.getElementById('inventoryBtn').addEventListener('click', () => {
  toggleInventory();
});

// Consume apple
document.getElementById('invAppleClick').addEventListener('click', () => {
  if (state.inventory.apples > 0) {
    const btn = document.getElementById('invAppleClick');
    const oldHP = state.hp;

    // Animation
    btn.style.animation = 'consumeApple 0.25s ease-in-out';
    setTimeout(() => { btn.style.animation = ''; }, 600);

    state.inventory.apples--;
    state.hp = clamp(state.hp + 8, 0, state.hpMax);
    animateBar('hp', (oldHP / state.hpMax) * 100, (state.hp / state.hpMax) * 100);
    toast('🍎 +8HP');
    updateInventory();
    updateHUD();
    // 10% chance to drop seed
    if (Math.random() < 0.1) {
      state.inventory.seeds++;
      toast('🌱 Pestka!');
      updateInventory();
    }
  }
});

// Heal fully with apples
document.getElementById('healWithApplesBtn').addEventListener('click', () => {
  if (state.inventory.apples === 0) {
    toast('❌ Nie masz jabłek!');
    return;
  }

  if (state.hp >= state.hpMax) {
    toast('❤️ Masz już pełne zdrowie!');
    return;
  }

  const btn = document.getElementById('healWithApplesBtn');
  const oldHP = state.hp;
  const hpNeeded = state.hpMax - state.hp;
  const applesToEat = Math.min(state.inventory.apples, Math.ceil(hpNeeded / 8));
  let seedsGained = 0;
  let totalHeal = 0;

  // Animation
  btn.style.animation = 'consumeApple 0.5s ease-in-out';
  setTimeout(() => { btn.style.animation = ''; }, 500);

  // Eat apples (each heals 8 HP)
  for (let i = 0; i < applesToEat; i++) {
    state.inventory.apples--;
    const before = state.hp;
    state.hp = clamp(state.hp + 8, 0, state.hpMax);
    totalHeal += state.hp - before;

    // 10% chance to drop seed for each apple
    if (Math.random() < 0.1) {
      state.inventory.seeds++;
      seedsGained++;
    }
  }

  // Update UI
  animateBar('hp', (oldHP / state.hpMax) * 100, (state.hp / state.hpMax) * 100);
  toast(`🍎 Zjedzono ${applesToEat} jabłek! +${totalHeal}HP${seedsGained > 0 ? ` 🌱 +${seedsGained} pestek` : ''}`);
  updateInventory();
  updateHUD();
});

// Consume meat
document.getElementById('invMeatClick').addEventListener('click', () => {
  if (state.inventory.meat > 0) {
    const btn = document.getElementById('invMeatClick');
    const oldHP = state.hp;
    const heal = Math.round(rand(15, 25));

    // Animation
    btn.style.animation = 'consumeMeat 0.5s ease-in-out';
    setTimeout(() => { btn.style.animation = ''; }, 500);

    state.inventory.meat--;
    state.hp = clamp(state.hp + heal, 0, state.hpMax);
    animateBar('hp', (oldHP / state.hpMax) * 100, (state.hp / state.hpMax) * 100);
    toast(`🍖 +${heal}HP`);
    updateInventory();
    updateHUD();
  }
});

// Consume mead
document.getElementById('invMeadClick').addEventListener('click', () => {
  if (state.inventory.mead > 0) {
    const btn = document.getElementById('invMeadClick');
    const oldMP = state.mp;
    const mana = Math.round(rand(12, 22));

    // Animation
    btn.style.animation = 'consumeMead 0.4s ease-in-out';
    setTimeout(() => { btn.style.animation = ''; }, 400);

    state.inventory.mead--;
    state.mp = clamp(state.mp + mana, 0, state.mpMax);
    animateBar('mp', (oldMP / state.mpMax) * 100, (state.mp / state.mpMax) * 100);
    toast(`🍾 +${mana} Moc`);
    updateInventory();
    updateHUD();
  }
});

// Activate planting mode
document.getElementById('invSeedClick').addEventListener('click', () => {
  if (state.inventory.seeds > 0) {
    state.plantingMode = !state.plantingMode; // Toggle planting mode
    if (state.plantingMode) {
      // Automatycznie zamknij modal inventory, żeby można było kliknąć na mapie
      if (inventoryModal) {
        inventoryModal.style.display = 'none';
        state.paused = false;
      }
      toast('🌱 Tryb zasadzania aktywny - kliknij na mapie');
    } else {
      toast('🌱 Tryb zasadzania wyłączony');
    }
    updateInventory();
  }
});

document.getElementById('closeInventoryBtn').addEventListener('click', () => {
  state.paused = false;
  state.plantingMode = false; // Disable planting mode when closing
  inventoryModal.style.display = 'none';
});

// Close button (X) for inventory modal
const inventoryModalClose = inventoryModal.querySelector('.modal-close');
if (inventoryModalClose) {
  inventoryModalClose.addEventListener('click', () => {
    state.paused = false;
    state.plantingMode = false;
    inventoryModal.style.display = 'none';
  });
}

// === Crafting System ===
const CRAFTING_RECIPES = [
  {
    id: 'upgrade_sword',
    name: '🗡️ Ulepsz Miecz',
    desc: '+2 obrażeń w zwarciu',
    cost: { wood: 10, gold: 5 },
    action: () => { state.meleeDamage += 2; toast(`🗡️ Miecz ulepszony! Obrażenia: ${state.meleeDamage}`); }
  },
  {
    id: 'upgrade_bow',
    name: '🏹 Ulepsz Łuk',
    desc: '+2 obrażeń z dystansu',
    cost: { wood: 8, gold: 5 },
    action: () => { state.rangedDamage += 2; toast(`🏹 Łuk ulepszony! Obrażenia: ${state.rangedDamage}`); }
  },
  {
    id: 'hp_potion',
    name: '❤️ Mikstura HP',
    desc: 'Pełne zdrowie',
    cost: { apples: 3, meat: 2 },
    action: () => {
      const oldHP = state.hp;
      state.hp = state.hpMax;
      animateBar('hp', (oldHP / state.hpMax) * 100, 100);
      toast('❤️ Pełne zdrowie!');
    }
  },
  {
    id: 'mp_potion',
    name: '🔷 Mikstura MP',
    desc: 'Pełna moc',
    cost: { mead: 3, apples: 2 },
    action: () => {
      const oldMP = state.mp;
      state.mp = state.mpMax;
      animateBar('mp', (oldMP / state.mpMax) * 100, 100);
      toast('🔷 Pełna moc!');
    }
  },
  {
    id: 'home_guard',
    name: '🛡️ Strażnik Domowy',
    desc: 'Broni domu, zadaje 30 obrażeń potworom',
    cost: { wood: 15, gold: 10, meat: 5 },
    action: () => {
      // Spawn guard around home in a circle
      if (!state.homeGuards) state.homeGuards = [];
      const guardCount = state.homeGuards.length;
      const ang = (guardCount * Math.PI * 2 / Math.max(guardCount + 1, 4)) + rand(-0.3, 0.3);
      const dist = 120 + rand(0, 40);
      state.homeGuards.push({
        x: state.home.x + Math.cos(ang) * dist,
        y: state.home.y + Math.sin(ang) * dist,
        attackTimer: 0,
        id: Math.random().toString(36).slice(2)
      });
      toast(`🛡️ Strażnik #${state.homeGuards.length} staje na straży domu!`);
    }
  }
];

function canCraft(recipe) {
  for (const [resource, amount] of Object.entries(recipe.cost)) {
    if (resource === 'gold') {
      if (state.gold < amount) return false;
    } else {
      if ((state.inventory[resource] || 0) < amount) return false;
    }
  }
  return true;
}

function craft(recipeId) {
  const recipe = CRAFTING_RECIPES.find(r => r.id === recipeId);
  if (!recipe) return;
  if (!canCraft(recipe)) {
    toast('❌ Brak surowców!');
    return;
  }
  // Deduct resources
  for (const [resource, amount] of Object.entries(recipe.cost)) {
    if (resource === 'gold') {
      state.gold -= amount;
    } else {
      state.inventory[resource] -= amount;
    }
  }
  // Execute recipe
  recipe.action();
  updateCraftingModal();
  updateInventory();
  updateHUD();
}

function updateCraftingModal() {
  const container = document.getElementById('craftingRecipes');
  if (!container) return;
  container.innerHTML = '';
  for (const recipe of CRAFTING_RECIPES) {
    const available = canCraft(recipe);
    const costText = Object.entries(recipe.cost).map(([r, a]) => {
      const icons = { wood: '🪵', gold: '💰', apples: '🍎', meat: '🍖', mead: '🍾' };
      return `${icons[r] || r} ${a}`;
    }).join(' + ');

    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.style.cssText = `display:flex; justify-content:space-between; align-items:center; padding:16px 20px; font-size:17px; 
      background:linear-gradient(135deg, ${available ? 'rgba(139,92,246,0.8), rgba(124,58,237,0.9)' : 'rgba(50,50,50,0.6), rgba(40,40,40,0.7)'}); 
      border:3px solid ${available ? 'rgba(139,92,246,0.7)' : 'rgba(100,100,100,0.4)'}; 
      opacity:${available ? '1' : '0.5'}; cursor:${available ? 'pointer' : 'not-allowed'};
      margin-bottom:10px; width:100%; border-radius:14px; color:#fff; font-weight:700;`;
    btn.innerHTML = `
      <div style="text-align:left;">
        <div style="font-size:18px; margin-bottom:4px;">${recipe.name}</div>
        <div style="font-size:13px; opacity:0.8;">${recipe.desc}</div>
        <div style="font-size:14px; margin-top:6px; color:${available ? '#a78bfa' : '#888'};">${costText}</div>
      </div>
      <div style="font-size:24px;">${available ? '✅' : '🔒'}</div>
    `;
    if (available) {
      btn.addEventListener('click', () => craft(recipe.id));
    }
    container.appendChild(btn);
  }
}

function toggleCrafting() {
  const craftingModal = document.getElementById('craftingModal');
  if (!craftingModal) return;
  if (craftingModal.style.display === 'flex') {
    state.paused = false;
    craftingModal.style.display = 'none';
  } else {
    state.paused = true;
    updateCraftingModal();
    craftingModal.style.display = 'flex';
  }
}

// === Stats Modal ===
const statsModal = document.getElementById('statsModal');
const statsHP = document.getElementById('statsHP');
const statsHPMax = document.getElementById('statsHPMax');
const statsMP = document.getElementById('statsMP');
const statsMPMax = document.getElementById('statsMPMax');
const statsLevel = document.getElementById('statsLevel');
const statsSpeed = document.getElementById('statsSpeed');
const statsMeleeCD = document.getElementById('statsMeleeCD');
const statsMeleeDmg = document.getElementById('statsMeleeDmg');
const statsRangedCD = document.getElementById('statsRangedCD');
const statsRangedDmg = document.getElementById('statsRangedDmg');
const statsMagnet = document.getElementById('statsMagnet');

function updateStats() {
  statsHP.textContent = Math.floor(state.hp);
  statsHPMax.textContent = state.hpMax;
  statsMP.textContent = Math.floor(state.mp);
  statsMPMax.textContent = state.mpMax;
  statsLevel.textContent = state.level;
  statsSpeed.textContent = state.speed.toFixed(1);
  statsMeleeCD.textContent = Math.round(state.attack.cdMelee);
  statsMeleeDmg.textContent = state.meleeDamage;
  statsRangedCD.textContent = Math.round(state.attack.cdRanged);
  statsRangedDmg.textContent = state.rangedDamage;

  // Update HP/MP bars
  const hpPercent = (state.hp / state.hpMax) * 100;
  const mpPercent = (state.mp / state.mpMax) * 100;
  const hpBar = document.getElementById('statsHPBar');
  const mpBar = document.getElementById('statsMPBar');
  if (hpBar) hpBar.style.width = `${hpPercent}%`;
  if (mpBar) mpBar.style.width = `${mpPercent}%`;

  // Update magnet range
  const totalMagnet = state.level + state.pickupMagnetRange;
  statsMagnet.textContent = `${totalMagnet}px`;
  const magnetDesc = document.getElementById('statsMagnetDesc');
  if (magnetDesc) {
    magnetDesc.textContent = `Poziom ${state.level} + bonus ${state.pickupMagnetRange}`;
  }
}

function toggleStats() {
  if (statsModal.style.display === 'flex') {
    state.paused = false;
    statsModal.style.display = 'none';
  } else {
    state.paused = true;
    updateStats();
    statsModal.style.display = 'flex';
  }
}

// Stats button in header
document.getElementById('statsBtn').addEventListener('click', () => {
  toggleStats();
});

document.getElementById('closeStatsBtn').addEventListener('click', () => {
  state.paused = false;
  statsModal.style.display = 'none';
});

// Close button (X) for stats modal
const statsModalClose = statsModal.querySelector('.modal-close');
if (statsModalClose) {
  statsModalClose.addEventListener('click', () => {
    state.paused = false;
    statsModal.style.display = 'none';
  });
}

// === Interaction Mode ===
const interactBtn = document.getElementById('interactBtn');
function toggleInteractionMode() {
  state.interactionMode = !state.interactionMode;
  if (state.interactionMode) {
    interactBtn.style.background = 'rgba(76,222,128,0.3)';
    interactBtn.style.borderColor = 'rgba(76,222,128,0.6)';
    toast('💬 Tryb interakcji aktywny - kliknij na NPC');
  } else {
    interactBtn.style.background = '';
    interactBtn.style.borderColor = '';
    toast('💬 Tryb interakcji wyłączony');
  }
}

// Interaction button in footer
interactBtn.addEventListener('click', () => {
  toggleInteractionMode();
});

// === Woman Dialog ===
const womanModal = document.getElementById('womanModal');
const womanApples = document.getElementById('womanApples');
const womanMeat = document.getElementById('womanMeat');

function updateWomanDialog() {
  womanApples.textContent = state.woman.givenApples;
  womanMeat.textContent = state.woman.givenMeat;
  // Aktualizuj też quest log jeśli jest otwarty
  if (questModal && questModal.style.display === 'flex') {
    updateQuestLog();
  }
}

function spawnChild() {
  const isBoy = Math.random() < 0.5; // 50% chance
  const child = {
    x: state.woman.x,
    y: state.woman.y,
    emoji: isBoy ? '👶' : '👧',
    gender: isBoy ? 'boy' : 'girl',
    speed: 2.0,
    reachedPlayer: false, // Has reached player for the first time
    lastAttack: 0,
    lastRangedAttack: 0, // Cooldown dla strzałów córki
    meleeSpin: null, // Melee spin dla dziecka (naśladuje gracza)
    id: Math.random().toString(36).slice(2)
  };
  state.children.push(child);
  toast(isBoy ? '👶 Urodził się syn!' : '👧 Urodziła się córka!');
}

document.getElementById('giveAppleBtn').addEventListener('click', () => {
  if (state.inventory.apples > 0 && state.woman.givenApples < 50) {
    state.inventory.apples--;
    state.woman.givenApples++;
    updateWomanDialog();
    if (state.woman.givenApples >= 50 && state.woman.givenMeat >= 50) {
      // Ukończ quest tylko przy pierwszym dziecku
      if (!state.quests.son) {
        state.quests.son = true;
        toast('🎉 Ukończono zadanie: Spłodź syna!');
      }
      spawnChild();
      // Resetuj liczniki po urodzeniu dziecka
      state.woman.givenApples = 0;
      state.woman.givenMeat = 0;
      updateWomanDialog();
      updateHUD();
    }
  }
});

document.getElementById('giveMeatBtn').addEventListener('click', () => {
  if (state.inventory.meat > 0 && state.woman.givenMeat < 50) {
    state.inventory.meat--;
    state.woman.givenMeat++;
    updateWomanDialog();
    if (state.woman.givenApples >= 50 && state.woman.givenMeat >= 50) {
      // Ukończ quest tylko przy pierwszym dziecku
      if (!state.quests.son) {
        state.quests.son = true;
        toast('🎉 Ukończono zadanie: Spłodź syna!');
      }
      spawnChild();
      // Resetuj liczniki po urodzeniu dziecka
      state.woman.givenApples = 0;
      state.woman.givenMeat = 0;
      updateWomanDialog();
      updateHUD();
    }
  }
});

// Daj wszystkie jabłka niewieście
document.getElementById('giveAllApplesBtn').addEventListener('click', () => {
  const needed = 50 - state.woman.givenApples;
  if (needed <= 0) {
    toast('✅ Masz już wszystkie wymagane jabłka!');
    return;
  }
  if (state.inventory.apples === 0) {
    toast('❌ Nie masz jabłek!');
    return;
  }

  const toGive = Math.min(state.inventory.apples, needed);
  state.inventory.apples -= toGive;
  state.woman.givenApples += toGive;

  updateWomanDialog();
  updateHUD();
  toast(`🍎 Dano ${toGive} jabłek!`);

  if (state.woman.givenApples >= 50 && state.woman.givenMeat >= 50) {
    // Ukończ quest tylko przy pierwszym dziecku
    if (!state.quests.son) {
      state.quests.son = true;
      toast('🎉 Ukończono quest: Spłodź syna!');
    }
    spawnChild();
    // Resetuj liczniki po urodzeniu dziecka
    state.woman.givenApples = 0;
    state.woman.givenMeat = 0;
    updateWomanDialog();
    updateHUD();
  }
});

// Daj wszystkie mięsiwo niewieście
document.getElementById('giveAllMeatBtn').addEventListener('click', () => {
  const needed = 50 - state.woman.givenMeat;
  if (needed <= 0) {
    toast('✅ Masz już wszystkie wymagane mięsiwo!');
    return;
  }
  if (state.inventory.meat === 0) {
    toast('❌ Nie masz mięsiwa!');
    return;
  }

  const toGive = Math.min(state.inventory.meat, needed);
  state.inventory.meat -= toGive;
  state.woman.givenMeat += toGive;

  updateWomanDialog();
  updateHUD();
  toast(`🍖 Dano ${toGive} mięsa!`);

  if (state.woman.givenApples >= 50 && state.woman.givenMeat >= 50) {
    // Ukończ quest tylko przy pierwszym dziecku
    if (!state.quests.son) {
      state.quests.son = true;
      toast('🎉 Ukończono quest: Spłodź syna!');
    }
    spawnChild();
    // Resetuj liczniki po urodzeniu dziecka
    state.woman.givenApples = 0;
    state.woman.givenMeat = 0;
    updateWomanDialog();
    updateHUD();
  }
});

document.getElementById('closeWomanBtn').addEventListener('click', () => {
  state.paused = false;
  womanModal.style.display = 'none';
});

// Close button (X) for woman modal
const womanModalClose = womanModal.querySelector('.modal-close');
if (womanModalClose) {
  womanModalClose.addEventListener('click', () => {
    state.paused = false;
    womanModal.style.display = 'none';
  });
}

// === Wizard Dialog ===
const wizardModal = document.getElementById('wizardModal');
const wizardMeat = document.getElementById('wizardMeat');
const wizardApples = document.getElementById('wizardApples');
const wizardGold = document.getElementById('wizardGold');

function updateWizardDialog() {
  wizardMeat.textContent = state.wizard.givenMeat;
  wizardApples.textContent = state.wizard.givenApples;
  wizardGold.textContent = state.wizard.givenGold;
  // Aktualizuj też quest log jeśli jest otwarty
  if (questModal && questModal.style.display === 'flex') {
    updateQuestLog();
  }
}

document.getElementById('wizardGiveMeatBtn').addEventListener('click', () => {
  if (state.inventory.meat > 0 && state.wizard.givenMeat < 100) {
    state.inventory.meat--;
    state.wizard.givenMeat++;
    updateWizardDialog();
    updateHUD();
    if (state.wizard.givenMeat >= 100 && state.wizard.givenApples >= 100 && state.wizard.givenGold >= 100) {
      toast('✅ Masz wszystkie zasoby! Możesz napisać książkę.');
    }
  }
});

document.getElementById('wizardGiveAppleBtn').addEventListener('click', () => {
  if (state.inventory.apples > 0 && state.wizard.givenApples < 100) {
    state.inventory.apples--;
    state.wizard.givenApples++;
    updateWizardDialog();
    updateHUD();
    if (state.wizard.givenMeat >= 100 && state.wizard.givenApples >= 100 && state.wizard.givenGold >= 100) {
      toast('✅ Masz wszystkie zasoby! Możesz napisać książkę.');
    }
  }
});

document.getElementById('wizardGiveGoldBtn').addEventListener('click', () => {
  if (state.gold > 0 && state.wizard.givenGold < 100) {
    state.gold--;
    state.wizard.givenGold++;
    updateWizardDialog();
    updateHUD();
    if (state.wizard.givenMeat >= 100 && state.wizard.givenApples >= 100 && state.wizard.givenGold >= 100) {
      toast('✅ Masz wszystkie zasoby! Możesz napisać książkę.');
    }
  }
});

// Daj wszystkie mięsiwo czarodziejowi
document.getElementById('wizardGiveAllMeatBtn').addEventListener('click', () => {
  const needed = 100 - state.wizard.givenMeat;
  if (needed <= 0) {
    toast('✅ Masz już wszystkie wymagane mięsiwo!');
    return;
  }
  if (state.inventory.meat === 0) {
    toast('❌ Nie masz mięsiwa!');
    return;
  }

  const toGive = Math.min(state.inventory.meat, needed);
  state.inventory.meat -= toGive;
  state.wizard.givenMeat += toGive;

  updateWizardDialog();
  updateHUD();
  toast(`🍖 Dano ${toGive} mięsa!`);

  if (state.wizard.givenMeat >= 100 && state.wizard.givenApples >= 100 && state.wizard.givenGold >= 100) {
    toast('✅ Masz wszystkie zasoby! Możesz napisać książkę.');
  }
});

// Daj wszystkie jabłka czarodziejowi
document.getElementById('wizardGiveAllApplesBtn').addEventListener('click', () => {
  const needed = 100 - state.wizard.givenApples;
  if (needed <= 0) {
    toast('✅ Masz już wszystkie wymagane jabłka!');
    return;
  }
  if (state.inventory.apples === 0) {
    toast('❌ Nie masz jabłek!');
    return;
  }

  const toGive = Math.min(state.inventory.apples, needed);
  state.inventory.apples -= toGive;
  state.wizard.givenApples += toGive;

  updateWizardDialog();
  updateHUD();
  toast(`🍎 Dano ${toGive} jabłek!`);

  if (state.wizard.givenMeat >= 100 && state.wizard.givenApples >= 100 && state.wizard.givenGold >= 100) {
    toast('✅ Masz wszystkie zasoby! Możesz napisać książkę.');
  }
});

// Daj wszystkie monety czarodziejowi
document.getElementById('wizardGiveAllGoldBtn').addEventListener('click', () => {
  const needed = 100 - state.wizard.givenGold;
  if (needed <= 0) {
    toast('✅ Masz już wszystkie wymagane monety!');
    return;
  }
  if (state.gold === 0) {
    toast('❌ Nie masz monet!');
    return;
  }

  const toGive = Math.min(state.gold, needed);
  state.gold -= toGive;
  state.wizard.givenGold += toGive;

  updateWizardDialog();
  updateHUD();
  toast(`💰 Dano ${toGive} monet!`);

  if (state.wizard.givenMeat >= 100 && state.wizard.givenApples >= 100 && state.wizard.givenGold >= 100) {
    toast('✅ Masz wszystkie zasoby! Możesz napisać książkę.');
  }
});

document.getElementById('wizardCompleteBtn').addEventListener('click', () => {
  if (state.wizard.givenMeat >= 100 && state.wizard.givenApples >= 100 && state.wizard.givenGold >= 100) {
    state.quests.book = true;
    toast('🎉 Ukończono zadanie: Napisz książkę!');
    state.paused = false;
    wizardModal.style.display = 'none';
    updateHUD();
  } else {
    toast('❌ Nie masz wystarczających zasobów!');
  }
});

document.getElementById('closeWizardBtn').addEventListener('click', () => {
  state.paused = false;
  wizardModal.style.display = 'none';
});

// Close button (X) for wizard modal
const wizardModalClose = wizardModal.querySelector('.modal-close');
if (wizardModalClose) {
  wizardModalClose.addEventListener('click', () => {
    state.paused = false;
    wizardModal.style.display = 'none';
  });
}

// === Spawning ===
function spawnEnemy() {
  const e = ENEMIES[Math.floor(Math.random() * ENEMIES.length)];
  const ang = rand(0, Math.PI * 2), dist = rand(400, 900);
  const ex = clamp(state.pos.x + Math.cos(ang) * dist, 0, state.world.width);
  const ey = clamp(state.pos.y + Math.sin(ang) * dist, 0, state.world.height);
  state.enemies.push({ ...e, x: ex, y: ey, hp: e.hp, hpMax: e.hp, t: 0, id: Math.random().toString(36).slice(2), nestId: null });
}

function spawnEnemyFromNest(nest) {
  const enemyDef = ENEMIES[nest.type];
  if (!enemyDef) return;

  // Spawn enemy near nest (within guard radius)
  const ang = rand(0, Math.PI * 2);
  const dist = rand(30, nest.guardRadius * 0.8);
  const ex = (nest.x + Math.cos(ang) * dist + state.world.width) % state.world.width;
  const ey = (nest.y + Math.sin(ang) * dist + state.world.height) % state.world.height;

  state.enemies.push({
    ...enemyDef,
    x: ex,
    y: ey,
    hp: enemyDef.hp,
    hpMax: enemyDef.hp, // Zapisz maxHP dla paska zdrowia
    t: 0,
    id: Math.random().toString(36).slice(2),
    nestId: nest.id, // Link enemy to nest for guard behavior
    guardState: 'guarding', // 'guarding', 'chasing', 'flanking', 'attacking'
    flankAngle: Math.random() * Math.PI * 2 // Losowy kąt do okrążania
  });
}
function spawnPickup(kind, x, y, value, direction) {
  const spec = PICKUPS[kind];
  if (!spec) {
    console.warn(`Unknown pickup kind: ${kind}`);
    return; // Don't spawn if kind doesn't exist
  }
  // Check collision with existing pickups
  const pickupRadius = 20;
  let attempts = 0;
  let finalX = x, finalY = y;

  // Try to find a free spot
  while (attempts < 20) {
    let collides = false;
    for (const existing of state.pickups) {
      let dx = existing.x - finalX, dy = existing.y - finalY;
      if (Math.abs(dx) > state.world.width / 2) dx = dx > 0 ? dx - state.world.width : dx + state.world.width;
      if (Math.abs(dy) > state.world.height / 2) dy = dy > 0 ? dy - state.world.height : dy + state.world.height;
      if (Math.hypot(dx, dy) < pickupRadius * 2) {
        collides = true;
        break;
      }
    }
    if (!collides) break;
    finalX = x + rand(-30, 30);
    finalY = y + rand(-30, 30);
    attempts++;
  }

  // Physics animation: throw forward and up with bounces (only if direction is provided)
  const hasDirection = direction !== undefined;
  let vx = 0, vy = 0, bouncing = false, bounceCount = 0, groundY = finalY;

  if (hasDirection) {
    const dir = direction;
    const len = Math.hypot(dir.x, dir.y) || 1;
    vx = (dir.x / len) * 3.5; // Initial horizontal velocity
    vy = -4.5; // Initial upward velocity (negative Y is up)
    bouncing = true;
    bounceCount = 0;
  }

  // Use provided value, or default to 1 (zawsze 1 dla mięsiwa, jabłek, etc.)
  let finalValue = value;
  if (finalValue === undefined || finalValue === null) {
    // Dla mięsiwa, jabłek, flaszek, ziaren zawsze 1
    if (kind === 'meat' || kind === 'apple' || kind === 'mead' || kind === 'seed') {
      finalValue = 1;
    } else if (spec.value) {
      if (Array.isArray(spec.value)) {
        finalValue = Math.round(rand(spec.value[0], spec.value[1]));
      } else {
        finalValue = spec.value;
      }
    } else {
      finalValue = 1;
    }
  }

  state.pickups.push({
    kind,
    x: finalX,
    y: finalY,
    value: finalValue,
    vx, vy, // Physics velocity
    bouncing, // Is still bouncing
    bounceCount, // Number of bounces
    groundY // Will be set when it stops bouncing
  });
}
function spawnNest(enemyTypeIndex) {
  // Check if nest for this enemy type already exists
  if (state.nests.some(n => n.type === enemyTypeIndex)) return;

  const enemyDef = ENEMIES[enemyTypeIndex];
  if (!enemyDef) return;

  // Spawn nest away from player
  const ang = rand(0, Math.PI * 2);
  const dist = rand(800, 1500);
  const nx = clamp(state.pos.x + Math.cos(ang) * dist, 200, state.world.width - 200);
  const ny = clamp(state.pos.y + Math.sin(ang) * dist, 200, state.world.height - 200);

  // HP legowiska = 5x więcej niż normalny mob
  const hpMax = enemyDef.hp * 5;
  const nextSpawn = rand(7000, 21000); // 7-21 seconds

  state.nests.push({
    type: enemyTypeIndex,
    x: nx,
    y: ny,
    hp: hpMax,
    hpMax: hpMax,
    spawnTimer: 0,
    nextSpawn: nextSpawn,
    id: Math.random().toString(36).slice(2),
    guardRadius: 200 // Promień ochrony legowiska
  });
}

// Funkcja do obsługi zniszczenia legowiska
function handleNestDestroyed(nest) {
  // Aktualizuj licznik zniszczonych legowisk per typ
  if (nest.type >= 0 && nest.type < state.nestsDestroyedByType.length) {
    state.nestsDestroyedByType[nest.type]++;
    const destroyedCount = state.nestsDestroyedByType[nest.type];

    // Zawsze spawnuj normalną megabestię przy zniszczeniu legowiska
    spawnMegabeast(nest.type, nest.x, nest.y, false, false);

    // Spawnuj ultra megabestię co 3 zniszczone legowiska (3, 6, 9, 12...)
    if (destroyedCount % 3 === 0) {
      spawnMegabeast(nest.type, nest.x, nest.y, true, false);
    }

    // Spawnuj HIPER ULTRA megabestię co 10 zniszczonych legowisk (10, 20, 30...)
    if (destroyedCount % 10 === 0) {
      spawnMegabeast(nest.type, nest.x, nest.y, true, true);
    }
  }
}

// Funkcja do spawnu megabestii
function spawnMegabeast(enemyTypeIndex, nearX, nearY, isUltra = false, isHiperUltra = false) {
  const enemyDef = ENEMIES[enemyTypeIndex];
  if (!enemyDef) return;

  // Spawn megabestii w pobliżu zniszczonego legowiska
  const ang = rand(0, Math.PI * 2);
  const dist = rand(200, 400);
  const mx = (nearX + Math.cos(ang) * dist + state.world.width) % state.world.width;
  const my = (nearY + Math.sin(ang) * dist + state.world.height) % state.world.height;

  // HP: normalna = 10x, ultra = 20x, hiper ultra = 40x (2x więcej niż ultra)
  let hpMultiplier;
  if (isHiperUltra) {
    hpMultiplier = 40; // Hiper Ultra ma 2x więcej HP niż Ultra (20x * 2 = 40x)
  } else if (isUltra) {
    hpMultiplier = 20; // Ultra ma 2x więcej HP niż normalna (10x * 2 = 20x)
  } else {
    hpMultiplier = 10; // Normalna megabestia
  }
  const hpMax = enemyDef.hp * hpMultiplier;

  state.megabeasts.push({
    type: enemyTypeIndex,
    x: mx,
    y: my,
    hp: hpMax,
    hpMax: hpMax,
    id: Math.random().toString(36).slice(2),
    isUltra: isUltra, // Flaga ultra megabestii
    isHiperUltra: isHiperUltra, // Flaga hiper ultra megabestii
    // Pola dla AI i ataków
    state: 'idle', // 'idle', 'chasing', 'preparing', 'attacking', 'recovering', 'special'
    attackTimer: 0,
    attackCooldown: 0,
    projectileTimer: 0,
    projectileCooldown: 0,
    chargeDirection: { x: 0, y: 0 },
    chargeSpeed: 0,
    t: 0, // Timer dla animacji
    minionSpawnTimer: 0, // Dla trupa - spawn minionów
    phase: 0, // Faza ataku (0-3)
    warningTimer: 0, // Timer dla sygnałów ostrzegawczych
    teleportTimer: 0, // Dla żmii - teleport
    dashCooldown: 0 // Dla wilka - dash cooldown
  });

  const enemyNames = ['Wilk', 'Dzika świnia', 'Żmija', 'Trup'];
  const enemyName = enemyNames[enemyTypeIndex] || 'Potwór';
  let prefix;
  if (isHiperUltra) {
    prefix = '🔥 HIPER ULTRA MEGA';
  } else if (isUltra) {
    prefix = '💀 ULTRA MEGA';
  } else {
    prefix = '⚠️ MEGA';
  }
  toast(`${prefix} ${enemyDef.emoji} ${enemyName} pojawiła się!`);
}

function spawnInitial() {
  // Spawn nests for each enemy type
  for (let i = 0; i < ENEMIES.length; i++) {
    spawnNest(i);
  }

  // Spawn 3 startowe jabłonki niedaleko domu
  for (let i = 0; i < 3; i++) {
    const ang = Math.random() * Math.PI * 2;
    const dist = 150 + Math.random() * 100; // 150-250 pikseli od domu
    const treeX = state.home.x + Math.cos(ang) * dist;
    const treeY = state.home.y + Math.sin(ang) * dist;
    state.trees.push({
      x: treeX,
      y: treeY,
      size: 2.5
    });
  }

  for (let i = 0; i < 28; i++) spawnEnemy();
  for (let i = 0; i < 40; i++) {
    spawnPickup(Math.random() < .5 ? 'meat' : 'mead', rand(0, state.world.width), rand(0, state.world.height));
  }
  // Gold nie spawnuje się na początku - tylko z jaskiń
}

// === Combat ===
function startMeleeSpin() {
  if (state.attack.cooldown > 0 || state.paused) return;
  state.attack.cooldown = state.attack.cdMelee;
  const startAngle = rand(0, Math.PI * 2); // Random starting angle around player
  state.meleeSpin = { t: 0, dur: 450, hit: new Set(), startAngle }; // 450 ms pełne okrążenie (szybszy)
  state.lastAttackType = 'melee'; // Zapisz typ ataku dla dzieci
}

function fireArrow(target) {
  if (state.attack.cooldown > 0 || state.paused) return;
  // Łuk nie zabiera MP
  state.attack.cooldown = state.attack.cdRanged;
  let ax, ay;
  if (target && target.x !== undefined && target.y !== undefined) {
    // target is enemy or world position
    ax = target.x - state.pos.x;
    ay = target.y - state.pos.y;
    // Handle wrap-around distance
    let dx = ax, dy = ay;
    if (Math.abs(dx) > state.world.width / 2) dx = dx > 0 ? dx - state.world.width : dx + state.world.width;
    if (Math.abs(dy) > state.world.height / 2) dy = dy > 0 ? dy - state.world.height : dy + state.world.height;
    ax = dx; ay = dy;
  } else {
    // use facing direction (lub kierunek kursora na desktopie)
    if (pointer && pointer.x !== undefined && pointer.y !== undefined && mousePos && mousePos.x !== undefined) {
      // Użyj kierunku kursora na desktopie
      const worldPos = screenToWorld(mousePos.x, mousePos.y);
      ax = worldPos.x - state.pos.x;
      ay = worldPos.y - state.pos.y;
      // Handle wrap-around
      let dx = ax, dy = ay;
      if (Math.abs(dx) > state.world.width / 2) dx = dx > 0 ? dx - state.world.width : dx + state.world.width;
      if (Math.abs(dy) > state.world.height / 2) dy = dy > 0 ? dy - state.world.height : dy + state.world.height;
      ax = dx; ay = dy;
    } else {
      // Fallback - use facing direction
      ax = state.facing.x;
      ay = state.facing.y;
    }
  }
  const len = Math.hypot(ax, ay) || 1;
  const vx = (ax / len) * 6.0;
  const vy = (ay / len) * 6.0;
  // Dodaj trail history dla animacji strzały - więcej punktów dla płynniejszego trail
  const arrowTrail = [];
  for (let i = 0; i < 12; i++) {
    arrowTrail.push({ x: state.pos.x, y: state.pos.y });
  }

  state.projectiles.push({
    x: state.pos.x,
    y: state.pos.y,
    vx,
    vy,
    ttl: 6000,
    dmg: state.rangedDamage,
    emoji: '🏹',
    trail: arrowTrail, // Historia pozycji dla trail effect
    rotation: Math.atan2(vy, vx) // Kąt rotacji strzały
  });

  state.lastAttackType = 'ranged'; // Zapisz typ ataku dla dzieci
}

// === Ult Attack (AoE) — costs MP ===
function fireUltimate() {
  if (state.ultCooldown > 0 || state.paused) return;
  if (state.mp < 15) {
    toast('🔷 Za mało mocy! (potrzeba 15 MP)');
    return;
  }
  const oldMP = state.mp;
  state.mp = clamp(state.mp - 15, 0, state.mpMax);
  animateBar('mp', (oldMP / state.mpMax) * 100, (state.mp / state.mpMax) * 100);
  state.ultCooldown = 2000; // 2 sekundy cooldown

  const ultRadius = 150;
  const ultDmg = state.meleeDamage * 1.5; // 1.5x obrażenia melee
  let hitCount = 0;

  // Damage all enemies in radius
  for (const e of state.enemies) {
    let dx = e.x - state.pos.x, dy = e.y - state.pos.y;
    if (Math.abs(dx) > state.world.width / 2) dx = dx > 0 ? dx - state.world.width : dx + state.world.width;
    if (Math.abs(dy) > state.world.height / 2) dy = dy > 0 ? dy - state.world.height : dy + state.world.height;
    const dist = Math.hypot(dx, dy);
    if (dist < ultRadius) {
      e.hp -= ultDmg;
      hitCount++;
      // Knockback
      const kbLen = Math.hypot(dx, dy) || 1;
      state.enemyKnockback[e.id] = { x: (dx / kbLen) * 8, y: (dy / kbLen) * 8, t: 200 };
      enemyHitFlashes[e.id] = 200;
      // Floating damage
      const s = worldToScreen(e.x, e.y);
      fly.push({ x: e.x, y: e.y, msg: `-${Math.round(ultDmg)}`, color: '#c084fc', size: 28, t: 1000, vx: 0, vy: 0 });
    }
  }

  // Damage megabeasts in radius
  for (const mb of state.megabeasts) {
    let dx = mb.x - state.pos.x, dy = mb.y - state.pos.y;
    if (Math.abs(dx) > state.world.width / 2) dx = dx > 0 ? dx - state.world.width : dx + state.world.width;
    if (Math.abs(dy) > state.world.height / 2) dy = dy > 0 ? dy - state.world.height : dy + state.world.height;
    const dist = Math.hypot(dx, dy);
    if (dist < ultRadius) {
      mb.hp -= ultDmg;
      hitCount++;
      enemyHitFlashes[mb.id] = 200;
      fly.push({ x: mb.x, y: mb.y, msg: `-${Math.round(ultDmg)}`, color: '#c084fc', size: 28, t: 1000, vx: 0, vy: 0 });
    }
  }

  // Visual particles effect (shockwave)
  for (let i = 0; i < 24; i++) {
    const ang = (i / 24) * Math.PI * 2;
    particles.push({
      x: state.pos.x, y: state.pos.y,
      vx: Math.cos(ang) * 4, vy: Math.sin(ang) * 4,
      color: '#c084fc', size: 4, t: 500
    });
  }

  // Screenshake
  screenShake.t = 200;
  screenShake.intensity = 10;

  if (hitCount > 0) {
    toast(`⚡ Ult! Trafiono ${hitCount} wrogów!`);
  } else {
    toast('⚡ Ult! Brak wrogów w zasięgu.');
  }

  state.lastAttackType = 'ult';
}

function killEnemy(e) {
  // Znajdź bazową definicję przeciwnika
  const enemyDef = ENEMIES.find(en => en.name === e.name || en.emoji === e.emoji);
  if (!enemyDef) {
    // Fallback dla starych przeciwników
    const dropDir1 = { x: rand(-0.8, 0.8), y: -0.5 };
    const dropDir2 = { x: rand(-0.8, 0.8), y: -0.5 };
    spawnPickup('meat', e.x, e.y, undefined, dropDir1);
    const xpValue = Math.round(rand(10, 20));
    spawnPickup('xp', e.x, e.y, xpValue, dropDir2);
    const idx = state.enemies.findIndex(x => x === e); if (idx >= 0) state.enemies.splice(idx, 1);
    triggerPlayerReaction('killEnemy'); // Reakcja na zabicie wroga
    setTimeout(spawnEnemy, 500);
    return;
  }

  // Losuj ile dropów
  const dropCount = Math.round(rand(enemyDef.dropCount[0], enemyDef.dropCount[1]));
  const droppedItems = [];

  // Zbierz wszystkie przedmioty które mają być dropnięte
  for (const drop of enemyDef.drops) {
    if (Math.random() < drop.chance) {
      // Use drop.value if it's a number, otherwise use PICKUPS default value
      let value = drop.value;
      if (typeof value === 'number') {
        // Use the number as-is (e.g., for apples, meat, seeds, mead count)
        value = value;
      } else if (Array.isArray(value)) {
        // Use the range (e.g., for XP, gold)
        value = Math.round(rand(value[0], value[1]));
      } else {
        // If no value specified, use PICKUPS default
        const pickupSpec = PICKUPS[drop.kind];
        if (pickupSpec && pickupSpec.value) {
          if (Array.isArray(pickupSpec.value)) {
            value = Math.round(rand(pickupSpec.value[0], pickupSpec.value[1]));
          } else {
            value = pickupSpec.value;
          }
        } else {
          value = 1;
        }
      }
      droppedItems.push({ kind: drop.kind, value });
    }
  }

  // Jeśli nie ma żadnych dropów (nie powinno się zdarzyć, ale na wszelki wypadek)
  if (droppedItems.length === 0) {
    // Zawsze dropnij przynajmniej XP
    droppedItems.push({ kind: 'xp', value: Math.round(rand(10, 20)) });
  }

  // Ogranicz liczbę dropów do dropCount, ale zawsze zostaw XP (gold tylko z jaskiń)
  const xpDrop = droppedItems.find(d => d.kind === 'xp');
  const otherDrops = droppedItems.filter(d => d.kind !== 'xp');

  // Zawsze dropnij XP (jeśli jest)
  const finalDrops = [];
  if (xpDrop) finalDrops.push(xpDrop);

  // Dodaj pozostałe dropy do limitu
  const remainingSlots = Math.max(0, dropCount - finalDrops.length);
  const shuffled = otherDrops.sort(() => Math.random() - 0.5);
  finalDrops.push(...shuffled.slice(0, remainingSlots));

  // Spawnuj dropy z różnymi kierunkami
  for (let i = 0; i < finalDrops.length; i++) {
    const angle = (i / finalDrops.length) * Math.PI * 2;
    const dropDir = {
      x: Math.cos(angle) * 0.8 + rand(-0.2, 0.2),
      y: Math.sin(angle) * 0.8 - 0.5
    };
    spawnPickup(finalDrops[i].kind, e.x, e.y, finalDrops[i].value, dropDir);
  }

  // remove
  triggerPlayerReaction('killEnemy'); // Reakcja na zabicie wroga
  const idx = state.enemies.findIndex(x => x === e); if (idx >= 0) state.enemies.splice(idx, 1);
  // kolejny przeciwnik za chwilę
  setTimeout(spawnEnemy, 500);
}

// === XP / Level ===
function gainXP(v, x, y) {
  let need = xpReq(state.level);
  const oldXP = state.xp;
  const oldPercent = (oldXP / need) * 100;
  state.xp += v;

  // Show XP gain floating text
  if (x !== undefined && y !== undefined) {
    floatingText(`+${v} XP`, x, y, '#fbbf24', 18, 1000);
  }

  if (state.xp >= need) {
    state.level++;
    state.xp = 0;
    state.lives++; // +1 życie za każdy level up
    animateBar('xp', oldPercent, 0);

    // Level up celebration
    if (x !== undefined && y !== undefined) {
      // Particle burst
      for (let i = 0; i < 30; i++) {
        const angle = (Math.PI * 2 * i) / 30;
        const speed = 2 + Math.random() * 3;
        particles.push({
          x, y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          t: 800 + Math.random() * 400,
          color: ['#fbbf24', '#f59e0b', '#d97706'][Math.floor(Math.random() * 3)],
          size: 3 + Math.random() * 4,
          type: 'celebration'
        });
      }
      // Screen flash
      addScreenShake(3, 200);
    }

    toast(`🎉 Awans na poziom ${state.level}! +1 życie`);
    openLevelUp();
  } else {
    const newPercent = (state.xp / need) * 100;
    animateBar('xp', oldPercent, newPercent);
  }
}

// === Level Up Modal ===
const levelUpModal = document.getElementById('levelUpModal');
const startScreenModal = document.getElementById('startScreenModal');
const startGameBtn = document.getElementById('startGameBtn');
const lvlUpTo = document.getElementById('lvlUpTo');
const levelUpPoints = document.getElementById('levelUpPoints');
const upHPValue = document.getElementById('upHPValue');
const upMPValue = document.getElementById('upMPValue');
const upSpeedValue = document.getElementById('upSpeedValue');
const upMeleeSpeedValue = document.getElementById('upMeleeSpeedValue');
const upMeleeDmgValue = document.getElementById('upMeleeDmgValue');
const upRangedSpeedValue = document.getElementById('upRangedSpeedValue');
const upRangedDmgValue = document.getElementById('upRangedDmgValue');
const upMagnetValue = document.getElementById('upMagnetValue');

function updateLevelUpModal() {
  levelUpPoints.textContent = state.levelUpPoints;
  upHPValue.textContent = state.hpMax;
  upMPValue.textContent = state.mpMax;
  upSpeedValue.textContent = state.speed.toFixed(1);
  upMeleeSpeedValue.textContent = Math.round(state.attack.cdMelee) + 'ms';
  upMeleeDmgValue.textContent = state.meleeDamage;
  upRangedSpeedValue.textContent = Math.round(state.attack.cdRanged) + 'ms';
  upRangedDmgValue.textContent = state.rangedDamage;
  // Wyświetl całkowity zasięg (poziom + bonus)
  if (upMagnetValue) upMagnetValue.textContent = (state.level + state.pickupMagnetRange) + 'px (' + state.level + '+' + state.pickupMagnetRange + ')';

  // Disable buttons if no points
  const buttons = ['upHP', 'upMP', 'upSpeed', 'upMeleeSpeed', 'upMeleeDmg', 'upRangedSpeed', 'upRangedDmg', 'upMagnet'];
  buttons.forEach(id => {
    const btn = document.getElementById(id);
    btn.disabled = state.levelUpPoints <= 0;
    btn.style.opacity = state.levelUpPoints <= 0 ? '0.5' : '1';
  });
}

function spendLevelUpPoint() {
  if (state.levelUpPoints > 0) {
    state.levelUpPoints--;
    updateLevelUpModal();
    // USUNIĘTE: auto-zamykanie gdy punkty = 0 - można zamknąć i wrócić później
    // if(state.levelUpPoints <= 0) {
    //   closeLevelUp();
    // }
  }
}

document.getElementById('upHP').addEventListener('click', () => {
  if (state.levelUpPoints > 0) {
    state.hpMax = Math.floor(state.hpMax * 1.1);
    state.hp = state.hpMax;
    spendLevelUpPoint();
  }
});
document.getElementById('upMP').addEventListener('click', () => {
  if (state.levelUpPoints > 0) {
    state.mpMax = Math.floor(state.mpMax * 1.1);
    state.mp = state.mpMax;
    spendLevelUpPoint();
  }
});
document.getElementById('upSpeed').addEventListener('click', () => {
  if (state.levelUpPoints > 0) {
    state.speed = state.speed * 1.1;
    spendLevelUpPoint();
  }
});
document.getElementById('upMeleeSpeed').addEventListener('click', () => {
  if (state.levelUpPoints > 0) {
    state.attack.cdMelee = Math.max(160, state.attack.cdMelee * 0.9);
    spendLevelUpPoint();
  }
});
document.getElementById('upMeleeDmg').addEventListener('click', () => {
  if (state.levelUpPoints > 0) {
    state.meleeDamage = Math.floor(state.meleeDamage * 1.1);
    spendLevelUpPoint();
  }
});
document.getElementById('upRangedSpeed').addEventListener('click', () => {
  if (state.levelUpPoints > 0) {
    state.attack.cdRanged = Math.max(120, state.attack.cdRanged * 0.9);
    spendLevelUpPoint();
  }
});
document.getElementById('upRangedDmg').addEventListener('click', () => {
  if (state.levelUpPoints > 0) {
    state.rangedDamage = Math.floor(state.rangedDamage * 1.1);
    spendLevelUpPoint();
  }
});
document.getElementById('upMagnet').addEventListener('click', () => {
  if (state.levelUpPoints > 0) {
    state.pickupMagnetRange += 1; // +1 piksel za każdy level
    spendLevelUpPoint();
  }
});

function openLevelUp() {
  state.paused = true;
  state.levelUpPoints = 1; // Give 1 point per level
  lvlUpTo.textContent = state.level;
  updateLevelUpModal();
  levelUpModal.style.display = 'flex';
  updateHUD();
}
function closeLevelUp() {
  state.paused = false;
  levelUpModal.style.display = 'none';
  updateHUD();
}

// Close button (X) for level up modal - zawsze zamyka (punkty pozostają)
const levelUpModalClose = levelUpModal.querySelector('.modal-close');
if (levelUpModalClose) {
  levelUpModalClose.addEventListener('click', () => {
    closeLevelUp(); // Zawsze zamyka, punkty pozostają
  });
}

// === Developer Menu ===
const devMenuModal = document.getElementById('devMenuModal');
let devMenuOpen = false;

// Toggle dev menu with J key
addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() === 'j' && !state.paused) {
    if (!devMenuOpen) {
      devMenuOpen = true;
      state.paused = true;
      devMenuModal.style.display = 'flex';
    } else {
      devMenuOpen = false;
      state.paused = false;
      devMenuModal.style.display = 'none';
    }
  }
});

// Close button
if (devMenuModal) {
  const devMenuClose = devMenuModal.querySelector('.modal-close');
  if (devMenuClose) {
    devMenuClose.addEventListener('click', () => {
      devMenuOpen = false;
      state.paused = false;
      devMenuModal.style.display = 'none';
    });
  }

  // Spawn megabestii (normalne)
  document.getElementById('devSpawnWolf').addEventListener('click', () => {
    spawnMegabeast(0, state.pos.x + 200, state.pos.y, false, false);
    toast('🐺 Spawniono Megawilka!');
  });

  document.getElementById('devSpawnBoar').addEventListener('click', () => {
    spawnMegabeast(1, state.pos.x + 200, state.pos.y, false, false);
    toast('🐗 Spawniono Megadzika!');
  });

  document.getElementById('devSpawnSnake').addEventListener('click', () => {
    spawnMegabeast(2, state.pos.x + 200, state.pos.y, false, false);
    toast('🐍 Spawniono Megażmiję!');
  });

  document.getElementById('devSpawnZombie').addEventListener('click', () => {
    spawnMegabeast(3, state.pos.x + 200, state.pos.y, false, false);
    toast('🧟 Spawniono Megatrupa!');
  });

  // Spawn ultra megabestii
  document.getElementById('devSpawnUltraWolf').addEventListener('click', () => {
    spawnMegabeast(0, state.pos.x + 200, state.pos.y, true, false);
    toast('💀 Spawniono Ultra Megawilka!');
  });

  document.getElementById('devSpawnUltraBoar').addEventListener('click', () => {
    spawnMegabeast(1, state.pos.x + 200, state.pos.y, true, false);
    toast('💀 Spawniono Ultra Megadzika!');
  });

  document.getElementById('devSpawnUltraSnake').addEventListener('click', () => {
    spawnMegabeast(2, state.pos.x + 200, state.pos.y, true, false);
    toast('💀 Spawniono Ultra Megażmiję!');
  });

  document.getElementById('devSpawnUltraZombie').addEventListener('click', () => {
    spawnMegabeast(3, state.pos.x + 200, state.pos.y, true, false);
    toast('💀 Spawniono Ultra Megatrupa!');
  });

  // Spawn hiper ultra megabestii
  document.getElementById('devSpawnHiperUltraWolf').addEventListener('click', () => {
    spawnMegabeast(0, state.pos.x + 200, state.pos.y, true, true);
    toast('🔥 Spawniono HIPER ULTRA Megawilka!');
  });

  document.getElementById('devSpawnHiperUltraBoar').addEventListener('click', () => {
    spawnMegabeast(1, state.pos.x + 200, state.pos.y, true, true);
    toast('🔥 Spawniono HIPER ULTRA Megadzika!');
  });

  document.getElementById('devSpawnHiperUltraSnake').addEventListener('click', () => {
    spawnMegabeast(2, state.pos.x + 200, state.pos.y, true, true);
    toast('🔥 Spawniono HIPER ULTRA Megażmiję!');
  });

  document.getElementById('devSpawnHiperUltraZombie').addEventListener('click', () => {
    spawnMegabeast(3, state.pos.x + 200, state.pos.y, true, true);
    toast('🔥 Spawniono HIPER ULTRA Megatrupa!');
  });

  // Spawn inne
  document.getElementById('devSpawnChild').addEventListener('click', () => {
    const ang = Math.random() * Math.PI * 2;
    const dist = 100;
    const isBoy = Math.random() < 0.5; // 50% chance
    state.children.push({
      x: state.pos.x + Math.cos(ang) * dist,
      y: state.pos.y + Math.sin(ang) * dist,
      emoji: isBoy ? '👶' : '👧',
      gender: isBoy ? 'boy' : 'girl',
      speed: 2.0,
      reachedPlayer: false,
      lastAttack: 0,
      lastRangedAttack: 0, // Cooldown dla strzałów córki
      meleeSpin: null,
      id: Math.random().toString(36).slice(2),
      t: 0
    });
    toast(isBoy ? '👶 Spawniono syna!' : '👧 Spawniono córkę!');
  });

  document.getElementById('devSpawnNest').addEventListener('click', () => {
    const type = Math.floor(Math.random() * ENEMIES.length);
    spawnNest(type);
    toast(`🏰 Spawniono legowisko typu ${type}!`);
  });

  document.getElementById('devSpawnEnemy').addEventListener('click', () => {
    spawnEnemy();
    toast('👹 Spawniono wroga!');
  });

  document.getElementById('devSpawnTree').addEventListener('click', () => {
    const ang = Math.random() * Math.PI * 2;
    const dist = 150;
    state.trees.push({
      x: state.pos.x + Math.cos(ang) * dist,
      y: state.pos.y + Math.sin(ang) * dist,
      size: 2.5
    });
    toast('🌳 Spawniono drzewo!');
  });

  // Zasoby
  document.getElementById('devAddGold').addEventListener('click', () => {
    state.gold += 100;
    toast('💰 +100 monet!');
    updateHUD();
  });

  document.getElementById('devAddXP').addEventListener('click', () => {
    gainXP(1000, state.pos.x, state.pos.y);
    toast('✨ +1000 XP!');
  });

  document.getElementById('devAddLevel').addEventListener('click', () => {
    state.level++;
    state.levelUpPoints++;
    state.lives++;
    toast(`⭐ Awans na poziom ${state.level}!`);
    updateHUD();
  });

  document.getElementById('devFullHeal').addEventListener('click', () => {
    state.hp = state.hpMax;
    state.mp = state.mpMax;
    toast('❤️ Pełne HP i MP!');
    updateHUD();
  });

  // Achievements
  document.getElementById('devUnlockAll').addEventListener('click', () => {
    ACHIEVEMENTS.forEach(ach => {
      state.achievements[ach.id] = true;
    });
    toast('🏆 Odblokowano wszystkie achievmenty!');
  });

  document.getElementById('devCompleteQuests').addEventListener('click', () => {
    state.quests.tree = true;
    state.quests.son = true;
    state.quests.book = true;
    toast('✅ Ukończono wszystkie questy!');
    updateQuestLog();
  });
}

// === Save ===
document.getElementById('saveBtn').addEventListener('click', () => { localStorage.setItem('chrobry_save_v2', JSON.stringify(state)); toast('💾 Zapisano'); });

// === Toasts ===
let toasts = [];
function toast(msg) { toasts.push({ msg, t: 1600 }); }
let fly = [];
// Enhanced floating text with better animations
function floatingText(msg, x, y, color, size = 20, duration = 1000) {
  fly.push({
    msg,
    x,
    y,
    t: duration,
    color: color || '#fff',
    size: size,
    vy: -0.3, // Initial upward velocity
    vx: (Math.random() - 0.5) * 0.1, // Slight horizontal drift
    scale: 0.5, // Start small
    targetScale: 1.2, // Grow to
    alpha: 0,
    targetAlpha: 1
  });
}

// Screen shake system
let screenShake = { x: 0, y: 0, t: 0, intensity: 0 };
function addScreenShake(intensity = 5, duration = 100) {
  screenShake.intensity = Math.max(screenShake.intensity, intensity);
  screenShake.t = Math.max(screenShake.t, duration);
}

// Hit flash system for enemies
let enemyHitFlashes = {}; // {enemyId: {t: timeRemaining}}

// Hit flash system for nests (siedliska)
let nestHitFlashes = {}; // {nestId: {t: timeRemaining}}

// Hit flash system for trees
let treeHitFlashes = {}; // {treeId: {t: timeRemaining}}

// Particle system for effects
let particles = [];
function spawnParticles(x, y, count, color, type = 'spark') {
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
    const speed = 1 + Math.random() * 2;
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      t: 500 + Math.random() * 300,
      color: color || '#fff',
      size: 2 + Math.random() * 3,
      type: type
    });
  }
}

// === Game loop ===
function step(dt) {
  if (state.paused) return;

  // Update screen shake
  if (screenShake.t > 0) {
    screenShake.t -= dt;
    if (screenShake.t <= 0) {
      screenShake.x = 0;
      screenShake.y = 0;
      screenShake.intensity = 0;
    } else {
      const intensity = screenShake.intensity * (screenShake.t / 100);
      screenShake.x = (Math.random() - 0.5) * intensity;
      screenShake.y = (Math.random() - 0.5) * intensity;
    }
  }

  // Update particles
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.1; // Gravity
    p.t -= dt;
    if (p.t <= 0) {
      particles.splice(i, 1);
    }
  }

  // Update enemy hit flashes
  for (const id in enemyHitFlashes) {
    enemyHitFlashes[id] -= dt;
    if (enemyHitFlashes[id] <= 0) {
      delete enemyHitFlashes[id];
    }
  }

  // Update nest hit flashes
  for (const id in nestHitFlashes) {
    nestHitFlashes[id] -= dt;
    if (nestHitFlashes[id] <= 0) {
      delete nestHitFlashes[id];
    }
  }

  // Update tree hit flashes
  for (const id in treeHitFlashes) {
    treeHitFlashes[id] -= dt;
    if (treeHitFlashes[id] <= 0) {
      delete treeHitFlashes[id];
    }
  }

  // Update low HP warning blink timer
  if (state.lowHPWarning && state.lowHPWarning.active) {
    state.lowHPWarning.blinkTimer += dt;
    // Reset timer when it exceeds blink speed
    if (state.lowHPWarning.blinkTimer >= state.lowHPWarning.blinkSpeed) {
      state.lowHPWarning.blinkTimer = 0;
    }
  }

  // Update floating text
  for (let i = fly.length - 1; i >= 0; i--) {
    const f = fly[i];
    f.x += f.vx;
    f.y += f.vy;
    f.vy -= 0.01; // Slight deceleration
    f.t -= dt;

    // Animate scale
    const progress = 1 - (f.t / 1000);
    if (progress < 0.3) {
      f.scale = 0.5 + (progress / 0.3) * (f.targetScale - 0.5);
    } else if (progress > 0.7) {
      f.scale = f.targetScale - ((progress - 0.7) / 0.3) * (f.targetScale - 0.8);
    }

    // Animate alpha
    if (progress < 0.2) {
      f.alpha = progress / 0.2;
    } else if (progress > 0.8) {
      f.alpha = 1 - ((progress - 0.8) / 0.2);
    } else {
      f.alpha = 1;
    }

    if (f.t <= 0) {
      fly.splice(i, 1);
    }
  }

  // Aktualizuj timer reakcji gracza
  if (state.playerReaction.timer > 0) {
    state.playerReaction.timer -= dt;
    if (state.playerReaction.timer <= 0) {
      state.playerReaction.emoji = null;
      state.playerReaction.timer = 0;
    }
  }

  // WASD keyboard movement
  let moveX = 0, moveY = 0;
  if (keys['w'] || keys['arrowup']) moveY -= 1;
  if (keys['s'] || keys['arrowdown']) moveY += 1;
  if (keys['a'] || keys['arrowleft']) moveX -= 1;
  if (keys['d'] || keys['arrowright']) moveX += 1;

  if (moveX !== 0 || moveY !== 0) {
    const len = Math.hypot(moveX, moveY);
    state.vel.x = (moveX / len) * state.speed;
    state.vel.y = (moveY / len) * state.speed;
    state.facing.x = moveX / len;
    state.facing.y = moveY / len;
  }

  // ruch jak w agar.io (touch/mouse)
  if (pointer.active) {
    const ws = screenToWorld(pointer.x, pointer.y);
    // Handle wrap-around for movement target
    let dx = ws.x - state.pos.x;
    let dy = ws.y - state.pos.y;
    if (Math.abs(dx) > state.world.width / 2) dx = dx > 0 ? dx - state.world.width : dx + state.world.width;
    if (Math.abs(dy) > state.world.height / 2) dy = dy > 0 ? dy - state.world.height : dy + state.world.height;
    const dist = Math.hypot(dx, dy);
    const maxSpeed = state.speed * clamp(dist / 120, 0, 2.8);
    if (dist > 6) {
      state.vel.x = (dx / dist) * maxSpeed;
      state.vel.y = (dy / dist) * maxSpeed;
      state.facing.x = dx / dist;
      state.facing.y = dy / dist;
    }
  } else if (!(keys['w'] || keys['s'] || keys['a'] || keys['d'] || keys['arrowup'] || keys['arrowdown'] || keys['arrowleft'] || keys['arrowright'])) {
    // Stop if no input
    state.vel.x *= 0.9;
    state.vel.y *= 0.9;
  }
  state.pos.x += state.vel.x;
  state.pos.y += state.vel.y;

  // Apply knockback if active
  if (state.knockback.t > 0) {
    state.knockback.t -= dt;
    const decay = Math.min(state.knockback.t / 350, 1); // Decay over time
    state.pos.x += state.knockback.x * decay * (dt / 16);
    state.pos.y += state.knockback.y * decay * (dt / 16);
    state.knockback.x *= 0.92; // Friction
    state.knockback.y *= 0.92;
    if (state.knockback.t <= 0) {
      state.knockback.x = 0;
      state.knockback.y = 0;
    }
  }

  // Wrap-around (pacman style)
  const wrapped = wrapPos(state.pos.x, state.pos.y, state.world.width, state.world.height);
  state.pos.x = wrapped.x;
  state.pos.y = wrapped.y;
  cam.x = state.pos.x; cam.y = state.pos.y;

  // tap logic: na postaci = miecz, na wrogu = strzała
  if (pointer.justTapped) {
    pointer.justTapped = false;
    const ps = worldToScreen(state.pos.x, state.pos.y);
    const d = Math.hypot(pointer.x - ps.x, pointer.y - ps.y);
    if (d < 48) { startMeleeSpin(); }
    else {
      const w = screenToWorld(pointer.x, pointer.y);
      let target = null;
      for (const e of state.enemies) {
        // Handle wrap-around distance
        let dx = e.x - w.x, dy = e.y - w.y;
        if (Math.abs(dx) > state.world.width / 2) dx = dx > 0 ? dx - state.world.width : dx + state.world.width;
        if (Math.abs(dy) > state.world.height / 2) dy = dy > 0 ? dy - state.world.height : dy + state.world.height;
        if (Math.hypot(dx, dy) < 28) { target = e; break; }
      }
      fireArrow(target);
    }
  }

  if (state.attack.cooldown > 0) state.attack.cooldown -= dt;

  // melee spin update
  if (state.meleeSpin) {
    const m = state.meleeSpin; m.t += dt; const r = 90; // promień miecza (50% większy: 60 * 1.5 = 90)
    const prog = clamp(m.t / m.dur, 0, 1);
    const startAng = m.startAngle || 0; // Random starting angle
    const ang = startAng + prog * 2 * Math.PI; // Start from random position, full circle
    const sx = state.pos.x + Math.cos(ang) * r;
    const sy = state.pos.y + Math.sin(ang) * r;
    // dmg kontaktowy miecza
    for (const e of state.enemies) {
      const id = e.id; if (m.hit.has(id)) continue;
      // Handle wrap-around distance
      let dx = e.x - sx, dy = e.y - sy;
      if (Math.abs(dx) > state.world.width / 2) dx = dx > 0 ? dx - state.world.width : dx + state.world.width;
      if (Math.abs(dy) > state.world.height / 2) dy = dy > 0 ? dy - state.world.height : dy + state.world.height;
      if (Math.hypot(dx, dy) < 30) { // Zwiększony zasięg trafienia z 22 do 30
        m.hit.add(id);
        e.hp -= state.meleeDamage;
        floatingText(`-${state.meleeDamage}`, e.x, e.y, '#ff6a6a', 24, 1200);

        // Hit flash effect
        enemyHitFlashes[e.id] = 100; // 100ms flash

        // Particles on hit
        spawnParticles(e.x, e.y, 5, '#ff6a6a', 'spark');

        // Knockback
        const nx = dx / Math.hypot(dx, dy) || 0;
        const ny = dy / Math.hypot(dx, dy) || 0;
        if (!state.enemyKnockback[e.id]) {
          state.enemyKnockback[e.id] = { x: 0, y: 0, t: 0 };
        }
        state.enemyKnockback[e.id].x = nx * 8;
        state.enemyKnockback[e.id].y = ny * 8;
        state.enemyKnockback[e.id].t = 200; // 200ms knockback

        if (e.hp <= 0) killEnemy(e);
      }
    }

    // Check for megabeast hits
    for (const mb of state.megabeasts) {
      if (m.hit.has(mb.id)) continue;
      let dx = mb.x - sx, dy = mb.y - sy;
      if (Math.abs(dx) > state.world.width / 2) dx = dx > 0 ? dx - state.world.width : dx + state.world.width;
      if (Math.abs(dy) > state.world.height / 2) dy = dy > 0 ? dy - state.world.height : dy + state.world.height;
      if (Math.hypot(dx, dy) < 40) { // Nieco większy zasięg dla megabestii
        m.hit.add(mb.id);
        mb.hp -= state.meleeDamage;
        floatingText(`-${state.meleeDamage}`, mb.x, mb.y, '#ff0000', 28, 1200); // Czerwony kolor dla megabestii

        // Hit flash effect
        if (!enemyHitFlashes[mb.id]) enemyHitFlashes[mb.id] = 0;
        enemyHitFlashes[mb.id] = 150;

        // Particles on hit
        spawnParticles(mb.x, mb.y, 12, '#ff0000', 'spark');

        if (mb.hp <= 0) {
          // Unikalne dropy dla każdego typu megabestii
          const enemyDef = ENEMIES[mb.type];
          if (mb.type === 0) { // 🐺 WILK
            // Drop: 30 monet + 10 mięsiwa + 5 XP orbs
            for (let i = 0; i < 30; i++) {
              spawnPickup('gold', mb.x + rand(-30, 30), mb.y + rand(-30, 30), 1, undefined);
            }
            for (let i = 0; i < 10; i++) {
              spawnPickup('meat', mb.x + rand(-30, 30), mb.y + rand(-30, 30), 1, undefined);
            }
            for (let i = 0; i < 5; i++) {
              spawnPickup('xp', mb.x + rand(-30, 30), mb.y + rand(-30, 30), 75, undefined); // Uproszczone: zawsze 75 XP
            }
          }
          else if (mb.type === 1) { // 🐗 DZIK
            // Drop: 30 monet + 15 jabłek + 10 mięsiwa
            for (let i = 0; i < 30; i++) {
              spawnPickup('gold', mb.x + rand(-30, 30), mb.y + rand(-30, 30), 1, undefined);
            }
            for (let i = 0; i < 15; i++) {
              spawnPickup('apple', mb.x + rand(-30, 30), mb.y + rand(-30, 30), 1, undefined);
            }
            for (let i = 0; i < 10; i++) {
              spawnPickup('meat', mb.x + rand(-30, 30), mb.y + rand(-30, 30), 1, undefined);
            }
          }
          else if (mb.type === 2) { // 🐍 ŻMIJA
            // Drop: 30 monet + 20 flaszek + 10 XP orbs
            for (let i = 0; i < 30; i++) {
              spawnPickup('gold', mb.x + rand(-30, 30), mb.y + rand(-30, 30), 1, undefined);
            }
            for (let i = 0; i < 20; i++) {
              spawnPickup('mead', mb.x + rand(-30, 30), mb.y + rand(-30, 30), 1, undefined);
            }
            for (let i = 0; i < 10; i++) {
              spawnPickup('xp', mb.x + rand(-30, 30), mb.y + rand(-30, 30), 50, undefined); // Uproszczone: zawsze 50 XP
            }
          }
          else if (mb.type === 3) { // 🧟 TRUP
            // Drop: 30 monet + 25 różnych przedmiotów + 15 XP orbs
            for (let i = 0; i < 30; i++) {
              spawnPickup('gold', mb.x + rand(-30, 30), mb.y + rand(-30, 30), 1, undefined);
            }
            const dropTypes = ['meat', 'apple', 'mead', 'seed'];
            for (let i = 0; i < 25; i++) {
              const dropType = dropTypes[Math.floor(Math.random() * dropTypes.length)];
              spawnPickup(dropType, mb.x + rand(-30, 30), mb.y + rand(-30, 30), 1, undefined);
            }
            for (let i = 0; i < 15; i++) {
              spawnPickup('xp', mb.x + rand(-30, 30), mb.y + rand(-30, 30), 60, undefined); // Uproszczone: zawsze 60 XP
            }
          }

          const mbIdx = state.megabeasts.findIndex(m => m.id === mb.id);
          if (mbIdx >= 0) {
            state.megabeasts.splice(mbIdx, 1);
            const enemyNames = ['Wilka', 'Dzikiej świni', 'Żmii', 'Trupa'];
            const enemyName = enemyNames[mb.type] || 'Potwora';
            toast(`💀 MEGABESTIA ${enemyDef.emoji} ${enemyName} pokonana!`);
          }
        }
      }
    }

    // Check for nest hits (kamień i emoji mają ten sam hitbox - kolizja na pozycji nest.x, nest.y)
    for (const nest of state.nests) {
      if (m.hit.has(nest.id)) continue; // Prevent multiple hits per spin
      // Handle wrap-around distance
      let dx = nest.x - sx, dy = nest.y - sy;
      if (Math.abs(dx) > state.world.width / 2) dx = dx > 0 ? dx - state.world.width : dx + state.world.width;
      if (Math.abs(dy) > state.world.height / 2) dy = dy > 0 ? dy - state.world.height : dy + state.world.height;
      if (Math.hypot(dx, dy) < 30) { // Same range as enemy hit
        m.hit.add(nest.id);
        nest.hp -= state.meleeDamage;
        floatingText(`-${state.meleeDamage}`, nest.x, nest.y, '#8B4513', 24, 1200); // Brown color for nest damage

        // Hit flash effect - klasyczne mruganie jak w starych grach
        nestHitFlashes[nest.id] = 150; // 150ms flash dla siedlisk

        // Particles on hit
        spawnParticles(nest.x, nest.y, 8, '#8B4513', 'spark');

        if (nest.hp <= 0) {
          // Nest destroyed, drop items and schedule respawn
          const baseDropCount = 10; // Domyślnie 10 itemów

          // Dodatkowe dropy: 1 szansa 10% za każdy level gracza
          let extraDrops = 0;
          for (let i = 0; i < state.level; i++) {
            if (Math.random() < 0.1) {
              extraDrops++;
            }
          }

          const totalDropCount = baseDropCount + extraDrops;

          for (let i = 0; i < totalDropCount; i++) {
            // Spawn bez direction - bez bouncing, od razu gotowe do zbierania
            const dropTypes = ['meat', 'apple', 'mead', 'gold', 'seed'];
            const dropType = dropTypes[Math.floor(Math.random() * dropTypes.length)];
            // Małe losowe przesunięcie pozycji, ale bez fizyki bouncing
            const offsetX = nest.x + rand(-30, 30);
            const offsetY = nest.y + rand(-30, 30);
            spawnPickup(dropType, offsetX, offsetY, undefined, undefined);
          }

          // Schedule respawn after 30 seconds
          state.nestRespawns.push({
            type: nest.type,
            timer: 30000 // 30 seconds
          });

          const nestIdx = state.nests.findIndex(n => n.id === nest.id);
          if (nestIdx >= 0) {
            state.nests.splice(nestIdx, 1);
            state.stats.nestsDestroyed++;
            handleNestDestroyed(nest);
            const extraText = extraDrops > 0 ? ` (+${extraDrops} ekstra!)` : '';
            toast(`🏰 Legowisko zniszczone! +${totalDropCount} przedmiotów${extraText}`);
          }
        }
      }
    }

    // Check for tree hits
    for (let i = state.trees.length - 1; i >= 0; i--) {
      const tree = state.trees[i];
      if (m.hit.has(tree.id)) continue;
      
      let dx = tree.x - sx, dy = tree.y - sy;
      if (Math.abs(dx) > state.world.width / 2) dx = dx > 0 ? dx - state.world.width : dx + state.world.width;
      if (Math.abs(dy) > state.world.height / 2) dy = dy > 0 ? dy - state.world.height : dy + state.world.height;
      
      // Zwiększony obszar kolizji (Drzewa są rendering size ~75px)
      if (Math.hypot(dx, dy) < 65) { 
        m.hit.add(tree.id);
        tree.hp -= 1; // 1 damage per hit (takes 2 hits typically)
        
        treeHitFlashes[tree.id] = 150; // Hit flash
        
        floatingText(`-1`, tree.x, tree.y, '#8B4513', 20, 800);
        spawnParticles(tree.x, tree.y, 6, '#8B4513', 'spark'); // Wood splinters

        if (tree.hp <= 0) {
          // Drop wood with bouncing effect
          const dropDir = {
            x: Math.cos(ang) * 0.8 + rand(-0.2, 0.2),
            y: Math.sin(ang) * 0.8 - 0.5
          };
          spawnPickup('wood', tree.x, tree.y, 1, dropDir);
          
          toast('🪵 Ścięto drzewo!');
          state.trees.splice(i, 1);
        }
      }
    }

    if (m.t >= m.dur) state.meleeSpin = null;
  }

  // Trees drop apples
  for (const tree of state.trees) {
    if (tree.type === '🌲') continue; // Choinki nie dropią jabłek!
    tree.lastDrop += dt;
    if (tree.lastDrop > 10000) { // drop every 10 seconds
      tree.lastDrop = 0;

      // Sprawdź ile jabłek jest już w promieniu wokół drzewa (max 7)
      const appleRadius = 80; // Promień wokół drzewa
      let appleCount = 0;
      for (const pickup of state.pickups) {
        if (pickup.kind === 'apple') {
          let dx = pickup.x - tree.x, dy = pickup.y - tree.y;
          if (Math.abs(dx) > state.world.width / 2) dx = dx > 0 ? dx - state.world.width : dx + state.world.width;
          if (Math.abs(dy) > state.world.height / 2) dy = dy > 0 ? dy - state.world.height : dy + state.world.height;
          const dist = Math.hypot(dx, dy);
          if (dist < appleRadius) {
            appleCount++;
          }
        }
      }

      // Dropuj tylko jeśli jest mniej niż 7 jabłek w promieniu
      if (appleCount < 7) {
        const dropDir = { x: rand(-0.5, 0.5), y: 1 }; // Drop forward/down
        spawnPickup('apple', tree.x, tree.y, undefined, dropDir);
      }
    }
  }

  // Update pickup physics (bouncing animation)
  // WAŻNE: wyłącz bouncing jeśli przedmiot jest w zasięgu przyciągania (magnetRange)
  const magnetRange = state.level + state.pickupMagnetRange;

  for (const p of state.pickups) {
    // Sprawdź czy przedmiot jest w zasięgu przyciągania
    let dx = p.x - state.pos.x, dy = p.y - state.pos.y;
    if (Math.abs(dx) > state.world.width / 2) dx = dx > 0 ? dx - state.world.width : dx + state.world.width;
    if (Math.abs(dy) > state.world.height / 2) dy = dy > 0 ? dy - state.world.height : dy + state.world.height;
    const dist = Math.hypot(dx, dy);
    const isInMagnetRange = magnetRange > 0 && dist <= magnetRange;

    if (p.bouncing && !isInMagnetRange) {
      // Gravity
      p.vy += 0.15 * (dt / 16); // Gravity acceleration

      // Move
      p.x += p.vx * (dt / 16);
      p.y += p.vy * (dt / 16);

      // Wrap-around
      const wrapped = wrapPos(p.x, p.y, state.world.width, state.world.height);
      p.x = wrapped.x;
      p.y = wrapped.y;

      // Bounce on ground (when velocity becomes positive/downward)
      if (p.vy > 0) {
        // First big bounce
        if (p.bounceCount === 0) {
          p.vy = -p.vy * 0.7; // Big bounce, 70% energy retained
          p.vx *= 0.8; // Reduce horizontal velocity
          p.bounceCount = 1;
          p.groundY = p.y;
        }
        // Subsequent smaller bounces
        else if (p.bounceCount < 4 && Math.abs(p.vy) > 0.3) {
          p.vy = -p.vy * 0.5; // Smaller bounce, 50% energy
          p.vx *= 0.7;
          p.bounceCount++;
        }
        // Stop bouncing
        else {
          p.bouncing = false;
          p.vx = 0;
          p.vy = 0;
          if (p.groundY) p.y = p.groundY; // Snap to ground
        }
      }
    } else if (p.bouncing && isInMagnetRange) {
      // Jeśli przedmiot jest w zasięgu przyciągania, natychmiast wyłącz bouncing
      p.bouncing = false;
      p.vx = 0;
      p.vy = 0;
      if (p.groundY) p.y = p.groundY; // Snap to ground
    }
    
    // Check collection logic directly below physics update
    if (!p.bouncing && isInMagnetRange) {
        if (dist < 40) { // If close enough to collect, collect it logic
             // Actually, the collection happens via pointer click or magnet? Let's check where the actual splice of pickup is handled... Wait, pickups are collected via click usually for seeds, but what about others? Oh they are picked up automatically when near... wait let me find the actual pickup logic in the world, wait there was a pickup collection loop I should probably not alter the physics section to do this, let me leave this as is for now and verify where pickups are collected.
             // Ah pickups are collected usually if dist < 30 somewhere else. I'll rely on the existing collection logic.
        }
    }
  }

  // Nests: spawn enemies and handle respawns
  for (const nest of state.nests) {
    // Update spawn timer
    nest.spawnTimer += dt;
    if (nest.spawnTimer >= nest.nextSpawn) {
      nest.spawnTimer = 0;
      nest.nextSpawn = rand(7000, 21000); // 7-21 seconds
      spawnEnemyFromNest(nest);
    }
  }

  // Handle nest respawns
  for (let i = state.nestRespawns.length - 1; i >= 0; i--) {
    const respawn = state.nestRespawns[i];
    respawn.timer -= dt;
    if (respawn.timer <= 0) {
      spawnNest(respawn.type);
      state.nestRespawns.splice(i, 1);
    }
  }

  // move & simple AI
  for (const e of state.enemies) {
    e.t += dt;

    // If enemy has nestId, guard the nest with improved AI
    if (e.nestId) {
      const nest = state.nests.find(n => n.id === e.nestId);
      if (nest) {
        // Initialize guard state if not set
        if (!e.guardState) e.guardState = 'guarding';
        if (e.flankAngle === undefined) e.flankAngle = Math.random() * Math.PI * 2;

        // Calculate distance to player
        let dxPlayer = state.pos.x - e.x, dyPlayer = state.pos.y - e.y;
        if (Math.abs(dxPlayer) > state.world.width / 2) dxPlayer = dxPlayer > 0 ? dxPlayer - state.world.width : dxPlayer + state.world.width;
        if (Math.abs(dyPlayer) > state.world.height / 2) dyPlayer = dyPlayer > 0 ? dyPlayer - state.world.height : dyPlayer + state.world.height;
        const dPlayer = Math.hypot(dxPlayer, dyPlayer);

        // Calculate distance to nest
        let dxNest = nest.x - e.x, dyNest = nest.y - e.y;
        if (Math.abs(dxNest) > state.world.width / 2) dxNest = dxNest > 0 ? dxNest - state.world.width : dxNest + state.world.width;
        if (Math.abs(dyNest) > state.world.height / 2) dyNest = dyNest > 0 ? dyNest - state.world.height : dyNest + state.world.height;
        const distToNest = Math.hypot(dxNest, dyNest);

        // State machine for guard behavior
        if (e.guardState === 'guarding') {
          // Guarding: patrol around nest, but if player is spotted, switch to chasing
          if (dPlayer < 400) {
            // Player spotted! Leave guard radius and chase
            e.guardState = 'chasing';
            // Rozproszenie: każdy przeciwnik idzie w nieco innym kierunku
            e.flankAngle = Math.atan2(dyPlayer, dxPlayer) + (Math.random() - 0.5) * 0.8; // ±40 stopni rozproszenia
          } else {
            // Normal patrol
            if (distToNest > nest.guardRadius) {
              // Return to guard radius
              e.x += (dxNest / distToNest) * e.speed * 0.8;
              e.y += (dyNest / distToNest) * e.speed * 0.8;
            } else {
              // Patrol around nest
              const patrolAngle = e.t * 0.001 + e.id.charCodeAt(0) * 0.1;
              const patrolDist = nest.guardRadius * 0.6;
              const targetX = nest.x + Math.cos(patrolAngle) * patrolDist;
              const targetY = nest.y + Math.sin(patrolAngle) * patrolDist;
              let dxPatrol = targetX - e.x, dyPatrol = targetY - e.y;
              if (Math.abs(dxPatrol) > state.world.width / 2) dxPatrol = dxPatrol > 0 ? dxPatrol - state.world.width : dxPatrol + state.world.width;
              if (Math.abs(dyPatrol) > state.world.height / 2) dyPatrol = dyPatrol > 0 ? dyPatrol - state.world.height : dyPatrol + state.world.height;
              const dPatrol = Math.hypot(dxPatrol, dyPatrol);
              if (dPatrol > 5) {
                e.x += (dxPatrol / dPatrol) * e.speed * 0.5;
                e.y += (dyPatrol / dPatrol) * e.speed * 0.5;
              }
            }
          }
        } else if (e.guardState === 'chasing') {
          // Chasing: leave guard radius and move towards player with spread
          if (distToNest > nest.guardRadius * 1.2) {
            // Left guard radius, switch to flanking
            e.guardState = 'flanking';
          } else {
            // Move away from nest towards player with spread
            const spreadDist = 80; // Odległość rozproszenia
            const targetX = e.x + Math.cos(e.flankAngle) * spreadDist;
            const targetY = e.y + Math.sin(e.flankAngle) * spreadDist;
            let dxSpread = targetX - e.x, dySpread = targetY - e.y;
            const dSpread = Math.hypot(dxSpread, dySpread);
            if (dSpread > 0) {
              e.x += (dxSpread / dSpread) * e.speed * 0.7;
              e.y += (dySpread / dSpread) * e.speed * 0.7;
            }
            // Also move towards player
            e.x += (dxPlayer / dPlayer) * e.speed * 0.3;
            e.y += (dyPlayer / dPlayer) * e.speed * 0.3;
          }
        } else if (e.guardState === 'flanking') {
          // Flanking: circle around player
          const playerAngle = Math.atan2(dyPlayer, dxPlayer);
          const flankDist = 150; // Odległość okrążania
          const flankOffset = e.flankAngle; // Użyj zapisanego kątu dla każdego przeciwnika

          // Cel okrążania: pozycja obok gracza
          const flankX = state.pos.x + Math.cos(playerAngle + flankOffset + Math.PI / 2) * flankDist;
          const flankY = state.pos.y + Math.sin(playerAngle + flankOffset + Math.PI / 2) * flankDist;

          let dxFlank = flankX - e.x, dyFlank = flankY - e.y;
          if (Math.abs(dxFlank) > state.world.width / 2) dxFlank = dxFlank > 0 ? dxFlank - state.world.width : dxFlank + state.world.width;
          if (Math.abs(dyFlank) > state.world.height / 2) dyFlank = dyFlank > 0 ? dyFlank - state.world.height : dyFlank + state.world.height;
          const dFlank = Math.hypot(dxFlank, dyFlank);

          if (dFlank > 30) {
            // Still flanking
            e.x += (dxFlank / dFlank) * e.speed * 0.8;
            e.y += (dyFlank / dFlank) * e.speed * 0.8;
          } else {
            // Close enough, switch to attacking
            e.guardState = 'attacking';
          }

          // If player is very close, attack immediately
          if (dPlayer < 100) {
            e.guardState = 'attacking';
          }
        } else if (e.guardState === 'attacking') {
          // Attacking: charge directly at player
          e.x += (dxPlayer / dPlayer) * e.speed;
          e.y += (dyPlayer / dPlayer) * e.speed;

          // If player moves far away, return to flanking
          if (dPlayer > 250) {
            e.guardState = 'flanking';
            e.flankAngle = Math.atan2(dyPlayer, dxPlayer) + (Math.random() - 0.5) * 1.0;
          }
        }
      } else {
        // Nest destroyed, enemy becomes normal
        e.nestId = null;
        e.guardState = null;
      }
    } else {
      // Normal enemy AI (no nest)
      // Dzik (🐗) preferuje jabłka zamiast atakowania gracza
      if (e.emoji === '🐗') {
        // Szukaj jabłek w promieniu ataku
        let nearestApple = null;
        let nearestAppleDist = Infinity;
        const attackRange = e.range || 20; // Promień ataku dzika

        for (const pickup of state.pickups) {
          if (pickup.kind === 'apple') {
            let dxApple = pickup.x - e.x, dyApple = pickup.y - e.y;
            if (Math.abs(dxApple) > state.world.width / 2) dxApple = dxApple > 0 ? dxApple - state.world.width : dxApple + state.world.width;
            if (Math.abs(dyApple) > state.world.height / 2) dyApple = dyApple > 0 ? dyApple - state.world.height : dyApple + state.world.height;
            const dApple = Math.hypot(dxApple, dyApple);

            if (dApple < attackRange && dApple < nearestAppleDist) {
              nearestApple = pickup;
              nearestAppleDist = dApple;
            }
          }
        }

        // Jeśli znalazł jabłko w promieniu ataku, idź do niego zamiast do gracza
        if (nearestApple) {
          let dxApple = nearestApple.x - e.x, dyApple = nearestApple.y - e.y;
          if (Math.abs(dxApple) > state.world.width / 2) dxApple = dxApple > 0 ? dxApple - state.world.width : dxApple + state.world.width;
          if (Math.abs(dyApple) > state.world.height / 2) dyApple = dyApple > 0 ? dyApple - state.world.height : dyApple + state.world.height;
          const dApple = Math.hypot(dxApple, dyApple);

          // Jeśli dzik dotknął jabłka, zjedz je
          if (dApple < 25) { // Promień kolizji (około 25 jednostek)
            const appleIdx = state.pickups.findIndex(p => p === nearestApple);
            if (appleIdx >= 0) {
              state.pickups.splice(appleIdx, 1);
              // Można dodać efekt wizualny lub dźwięk
            }
          } else if (dApple > 0) {
            e.x += (dxApple / dApple) * e.speed;
            e.y += (dyApple / dApple) * e.speed;
          }
        } else {
          // Brak jabłek w promieniu - normalne AI (atakuj gracza)
          let dx = state.pos.x - e.x, dy = state.pos.y - e.y;
          if (Math.abs(dx) > state.world.width / 2) dx = dx > 0 ? dx - state.world.width : dx + state.world.width;
          if (Math.abs(dy) > state.world.height / 2) dy = dy > 0 ? dy - state.world.height : dy + state.world.height;
          const d = Math.hypot(dx, dy);
          if (d < 380) {
            e.x += (dx / d) * e.speed;
            e.y += (dy / d) * e.speed;
          }
          else {
            e.x += Math.cos(e.t * .002 + e.x * 1e-3) * .4;
            e.y += Math.sin(e.t * .002 + e.y * 1e-3) * .4;
          }
        }
      } else {
        // Normal enemy AI dla innych przeciwników
        // Handle wrap-around distance
        let dx = state.pos.x - e.x, dy = state.pos.y - e.y;
        if (Math.abs(dx) > state.world.width / 2) dx = dx > 0 ? dx - state.world.width : dx + state.world.width;
        if (Math.abs(dy) > state.world.height / 2) dy = dy > 0 ? dy - state.world.height : dy + state.world.height;
        const d = Math.hypot(dx, dy);
        if (d < 380) {
          e.x += (dx / d) * e.speed;
          e.y += (dy / d) * e.speed;
        }
        else {
          e.x += Math.cos(e.t * .002 + e.x * 1e-3) * .4;
          e.y += Math.sin(e.t * .002 + e.y * 1e-3) * .4;
        }
      }
    }

    // Update enemy knockback
    if (state.enemyKnockback[e.id] && state.enemyKnockback[e.id].t > 0) {
      const kb = state.enemyKnockback[e.id];
      kb.t -= dt;
      const decay = Math.min(kb.t / 250, 1);
      e.x += kb.x * decay * (dt / 16);
      e.y += kb.y * decay * (dt / 16);
      kb.x *= 0.9; // Friction
      kb.y *= 0.9;

      if (kb.t <= 0) {
        delete state.enemyKnockback[e.id];
      }
    }
  }

  // Update poison dot (zatrucie od żmii)
  if (state.poisoned && state.poisoned.t > 0) {
    state.poisoned.t -= dt;
    if (state.poisoned.t > 0 && Math.floor(state.poisoned.t / 500) !== Math.floor((state.poisoned.t + dt) / 500)) {
      // Co 0.5 sekundy obrażenia
      state.hp -= state.poisoned.dmg;
      floatingText(`-${state.poisoned.dmg}`, state.pos.x, state.pos.y, '#00ff00', 16, 800);
      animateBar('hp', (state.hp / state.hpMax) * 100, ((state.hp - state.poisoned.dmg) / state.hpMax) * 100);
    }
    if (state.poisoned.t <= 0) {
      state.poisoned = null;
    }
  }

  // Update respawn invulnerability (spawn kill protection)
  if (state.respawnInvulnerable > 0) {
    state.respawnInvulnerable -= dt;
    if (state.respawnInvulnerable <= 0) {
      state.respawnInvulnerable = 0;
    }
  }

  // Update megabeasts AI and attacks
  for (const mb of state.megabeasts) {
    mb.t += dt;

    const enemyDef = ENEMIES[mb.type];
    if (!enemyDef) continue;

    // Calculate distance to player
    let dx = state.pos.x - mb.x, dy = state.pos.y - mb.y;
    if (Math.abs(dx) > state.world.width / 2) dx = dx > 0 ? dx - state.world.width : dx + state.world.width;
    if (Math.abs(dy) > state.world.height / 2) dy = dy > 0 ? dy - state.world.height : dy + state.world.height;
    const dist = Math.hypot(dx, dy);

    // Update cooldowns
    if (mb.attackCooldown > 0) mb.attackCooldown -= dt;
    if (mb.projectileCooldown > 0) mb.projectileCooldown -= dt;

    // Ultra megabestia ma mocniejsze ataki (1.5x obrażenia), Hiper Ultra ma 2x obrażenia
    const damageMultiplier = mb.isHiperUltra ? 2.0 : (mb.isUltra ? 1.5 : 1.0);

    // === HIPER ULTRA MEGABESTIE - DODATKOWE PROJECTILE ATTACKS ===
    if (mb.isHiperUltra && mb.type !== 3) { // Wszystkie oprócz trupa strzelają projectile
      // Hiper Ultra strzelają projectile częściej i więcej
      if (mb.projectileCooldown <= 0 && dist < 500) {
        mb.projectileCooldown = 2000; // Co 2 sekundy (szybciej niż normalne)
        const projectileCount = mb.type === 2 ? 12 : 6; // Żmija więcej projectile

        for (let i = 0; i < projectileCount; i++) {
          const angle = Math.atan2(dy, dx) + (i - projectileCount / 2) * (Math.PI * 2 / projectileCount);
          const vx = Math.cos(angle) * 6;
          const vy = Math.sin(angle) * 6;
          const arrowTrail = [];
          for (let j = 0; j < 8; j++) {
            arrowTrail.push({ x: mb.x, y: mb.y });
          }
          state.projectiles.push({
            x: mb.x,
            y: mb.y,
            vx: vx,
            vy: vy,
            dmg: Math.floor(enemyDef.atk * 1.5 * damageMultiplier),
            ttl: 3000,
            emoji: mb.type === 2 ? '💚' : '🦴',
            trail: arrowTrail,
            rotation: angle,
            isPoison: mb.type === 2
          });
        }
      }
    }

    // === PRZEPROJEKTOWANE MEGABESTIE - UNIKALNE WZORCE ATAKU ===
    if (mb.type === 0) { // 🐺 MEGAWILK - Pattern: Dash Attack + Triple Bone Throw
      // Fazy: chasing -> preparing (czerwony glow) -> dashing -> recovering
      if (dist < 600) {
        if (mb.state === 'idle' || mb.state === 'recovering') {
          mb.state = 'chasing';
          mb.phase = 0;
        }

        if (mb.state === 'chasing') {
          // Normalny chase (1.2x szybciej)
          const speed = enemyDef.speed * 1.2;
          mb.x += (dx / dist) * speed * (dt / 16);
          mb.y += (dy / dist) * speed * (dt / 16);

          // Pattern 1: Dash Attack (co 3 sekundy, gdy blisko)
          if (mb.dashCooldown <= 0 && dist < 200 && dist > 80) {
            mb.state = 'preparing';
            mb.warningTimer = 600; // 0.6s sygnał ostrzegawczy (czerwony glow)
            mb.chargeDirection = { x: dx / dist, y: dy / dist };
            mb.dashCooldown = 3000;
          }

          // Pattern 2: Triple Bone Throw (co 4 sekundy)
          if (mb.projectileCooldown <= 0 && dist < 400) {
            mb.projectileCooldown = 4000;
            // Rzuca 3 kośćmi w 3 kierunkach (gracz + 2 boki)
            for (let i = 0; i < 3; i++) {
              const angle = Math.atan2(dy, dx) + (i - 1) * 0.5; // -0.5, 0, +0.5 rad
              const vx = Math.cos(angle) * 5;
              const vy = Math.sin(angle) * 5;
              const arrowTrail = [];
              for (let j = 0; j < 8; j++) {
                arrowTrail.push({ x: mb.x, y: mb.y });
              }
              state.projectiles.push({
                x: mb.x,
                y: mb.y,
                vx: vx,
                vy: vy,
                dmg: Math.floor(enemyDef.atk * 1.2 * damageMultiplier),
                ttl: 2500,
                emoji: '🦴',
                trail: arrowTrail,
                rotation: angle
              });
            }
          }
        }
        else if (mb.state === 'preparing') {
          // Czerwony glow - sygnał ostrzegawczy (FAIR!)
          mb.warningTimer -= dt;
          if (mb.warningTimer <= 0) {
            mb.state = 'attacking';
            mb.chargeSpeed = enemyDef.speed * 4; // Szybki dash
            mb.attackTimer = 400; // Dash trwa 400ms
          }
        }
        else if (mb.state === 'attacking') {
          // Dash attack
          mb.x += mb.chargeDirection.x * mb.chargeSpeed * (dt / 16);
          mb.y += mb.chargeDirection.y * mb.chargeSpeed * (dt / 16);
          mb.attackTimer -= dt;

          // Kolizja z graczem (tylko jeśli gracz nie ma respawn protection)
          if (dist < 35 && state.respawnInvulnerable <= 0) {
            const damage = Math.floor(enemyDef.atk * 2 * damageMultiplier);
            state.hp -= damage;
            floatingText(`-${damage}`, state.pos.x, state.pos.y, '#ff0000', 24, 1200);
            addScreenShake(3, 200);
            spawnParticles(state.pos.x, state.pos.y, 10, '#ff0000', 'spark');
            animateBar('hp', (state.hp / state.hpMax) * 100, ((state.hp - damage) / state.hpMax) * 100);
            mb.state = 'recovering';
            mb.attackCooldown = 1000; // Recovery time
          }

          if (mb.attackTimer <= 0) {
            mb.state = 'recovering';
            mb.attackCooldown = 1000;
          }
        }
        else if (mb.state === 'recovering') {
          // Po dashu - krótka pauza
          if (mb.attackCooldown <= 0) {
            mb.state = 'chasing';
          }
        }

        // Update cooldowns
        if (mb.dashCooldown > 0) mb.dashCooldown -= dt;
      } else {
        mb.state = 'idle';
      }
    }
    else if (mb.type === 1) { // 🐗 MEGADZIK - Pattern: Warning Charge + Minion Spawn
      // Fazy: chasing -> preparing (żółty glow + cofanie) -> charging -> recovering
      if (dist < 700) {
        if (mb.state === 'idle' || mb.state === 'recovering') {
          mb.state = 'chasing';
          mb.phase = 0;
        }

        if (mb.state === 'chasing') {
          // Powolny chase (0.9x szybciej)
          const speed = enemyDef.speed * 0.9;
          mb.x += (dx / dist) * speed * (dt / 16);
          mb.y += (dy / dist) * speed * (dt / 16);

          // Pattern: Charge Attack (co 5 sekund, gdy w średniej odległości)
          if (mb.attackCooldown <= 0 && dist < 400 && dist > 150) {
            mb.state = 'preparing';
            mb.warningTimer = 1000; // 1s sygnał - cofa się i świeci żółto (FAIR!)
            mb.chargeDirection = { x: dx / dist, y: dy / dist };
            mb.attackCooldown = 5000;
          }

          // Spawn małych dzików co 8 sekund
          if (mb.minionSpawnTimer >= 8000) {
            mb.minionSpawnTimer = 0;
            const minionCount = 2;
            for (let i = 0; i < minionCount; i++) {
              const ang = Math.random() * Math.PI * 2;
              const distMinion = 80 + Math.random() * 40;
              const ex = (mb.x + Math.cos(ang) * distMinion + state.world.width) % state.world.width;
              const ey = (mb.y + Math.sin(ang) * distMinion + state.world.height) % state.world.height;
              state.enemies.push({
                ...enemyDef,
                x: ex,
                y: ey,
                hp: enemyDef.hp,
                hpMax: enemyDef.hp,
                t: 0,
                id: Math.random().toString(36).slice(2),
                nestId: null
              });
            }
            toast(`🐗 Megadzik przyzwał ${minionCount} małych dzików!`);
          }
          mb.minionSpawnTimer += dt;
        }
        else if (mb.state === 'preparing') {
          // Cofanie się i żółty glow - sygnał ostrzegawczy (FAIR!)
          mb.warningTimer -= dt;
          // Cofanie się (backing up)
          mb.x -= mb.chargeDirection.x * enemyDef.speed * 0.5 * (dt / 16);
          mb.y -= mb.chargeDirection.y * enemyDef.speed * 0.5 * (dt / 16);

          if (mb.warningTimer <= 0) {
            mb.state = 'attacking';
            mb.chargeSpeed = enemyDef.speed * 3.5; // Szybki charge
            mb.attackTimer = 800; // Charge trwa 800ms
          }
        }
        else if (mb.state === 'attacking') {
          // Charge attack
          mb.x += mb.chargeDirection.x * mb.chargeSpeed * (dt / 16);
          mb.y += mb.chargeDirection.y * mb.chargeSpeed * (dt / 16);
          mb.attackTimer -= dt;

          // Kolizja z graczem (tylko jeśli gracz nie ma respawn protection)
          if (dist < 40 && state.respawnInvulnerable <= 0) {
            const damage = Math.floor(enemyDef.atk * 3 * damageMultiplier);
            state.hp -= damage;
            floatingText(`-${damage}`, state.pos.x, state.pos.y, '#ff0000', 28, 1200);
            addScreenShake(5, 250);
            spawnParticles(state.pos.x, state.pos.y, 15, '#ff0000', 'spark');
            animateBar('hp', (state.hp / state.hpMax) * 100, ((state.hp - damage) / state.hpMax) * 100);

            // Mocny knockback
            const knockback = 60;
            state.pos.x -= mb.chargeDirection.x * knockback;
            state.pos.y -= mb.chargeDirection.y * knockback;

            mb.state = 'recovering';
            mb.attackCooldown = 1500;
          }

          if (mb.attackTimer <= 0) {
            mb.state = 'recovering';
            mb.attackCooldown = 1500;
          }
        }
        else if (mb.state === 'recovering') {
          if (mb.attackCooldown <= 0) {
            mb.state = 'chasing';
          }
        }
      } else {
        mb.state = 'idle';
      }
    }
    else if (mb.type === 2) { // 🐍 MEGAŻMIJA - Pattern: Teleport + Poison Circle + Quick Bite
      // Fazy: chasing -> preparing (zielony glow) -> teleporting -> attacking -> recovering
      if (dist < 550) {
        if (mb.state === 'idle' || mb.state === 'recovering') {
          mb.state = 'chasing';
          mb.phase = 0;
        }

        if (mb.state === 'chasing') {
          // Szybki chase (1.8x szybciej)
          const speed = enemyDef.speed * 1.8;
          mb.x += (dx / dist) * speed * (dt / 16);
          mb.y += (dy / dist) * speed * (dt / 16);

          // Pattern 1: Teleport + Poison Circle (co 6 sekund)
          if (mb.teleportTimer <= 0 && dist < 300) {
            mb.state = 'preparing';
            mb.warningTimer = 800; // 0.8s sygnał - zielony glow (FAIR!)
            mb.teleportTimer = 6000;
          }

          // Pattern 2: Quick Bite (co 2.5 sekundy, gdy blisko) - tylko jeśli gracz nie ma respawn protection
          if (mb.attackCooldown <= 0 && dist < 50 && state.respawnInvulnerable <= 0) {
            mb.attackCooldown = 2500;
            const damage = Math.floor(enemyDef.atk * 1.5 * damageMultiplier);
            state.hp -= damage;
            floatingText(`-${damage}`, state.pos.x, state.pos.y, '#00ff00', 24, 1200);
            animateBar('hp', (state.hp / state.hpMax) * 100, ((state.hp - damage) / state.hpMax) * 100);
            // Zatrucie: dot przez 4 sekundy (ultra ma mocniejsze zatrucie)
            const poisonDmg = mb.isUltra ? 4 : 3;
            if (!state.poisoned) {
              state.poisoned = { t: 4000, dmg: poisonDmg };
            } else {
              state.poisoned.t = 4000; // Resetuj timer
              state.poisoned.dmg = poisonDmg;
            }
            spawnParticles(state.pos.x, state.pos.y, 8, '#00ff00', 'spark');
          }
        }
        else if (mb.state === 'preparing') {
          // Zielony glow - sygnał ostrzegawczy (FAIR!)
          mb.warningTimer -= dt;
          if (mb.warningTimer <= 0) {
            mb.state = 'attacking';
            // Teleport za gracza
            const teleportDist = 100;
            const teleportAngle = Math.atan2(dy, dx) + Math.PI; // Za gracza
            mb.x = state.pos.x + Math.cos(teleportAngle) * teleportDist;
            mb.y = state.pos.y + Math.sin(teleportAngle) * teleportDist;
            // Wrap-around
            const wrapped = wrapPos(mb.x, mb.y, state.world.width, state.world.height);
            mb.x = wrapped.x;
            mb.y = wrapped.y;

            // Spawn poison circle - 8 jadów w okręgu
            for (let i = 0; i < 8; i++) {
              const angle = (i / 8) * Math.PI * 2;
              const vx = Math.cos(angle) * 4;
              const vy = Math.sin(angle) * 4;
              const arrowTrail = [];
              for (let j = 0; j < 6; j++) {
                arrowTrail.push({ x: mb.x, y: mb.y });
              }
              state.projectiles.push({
                x: mb.x,
                y: mb.y,
                vx: vx,
                vy: vy,
                dmg: Math.floor(enemyDef.atk * 0.8 * damageMultiplier),
                ttl: 2000,
                emoji: '💚',
                trail: arrowTrail,
                rotation: angle,
                isPoison: true
              });
            }

            mb.state = 'recovering';
            mb.attackCooldown = 1000;
          }
        }
        else if (mb.state === 'recovering') {
          if (mb.attackCooldown <= 0) {
            mb.state = 'chasing';
          }
        }

        // Update cooldowns
        if (mb.teleportTimer > 0) mb.teleportTimer -= dt;
      } else {
        mb.state = 'idle';
      }
    }
    else if (mb.type === 3) { // 🧟 MEGATRUP - Pattern: Spiral Bone Throw + Heavy Slam + Minion Spawn
      // Fazy: chasing -> preparing (czerwony glow) -> attacking -> recovering
      if (dist < 600) {
        if (mb.state === 'idle' || mb.state === 'recovering') {
          mb.state = 'chasing';
          mb.phase = 0;
        }

        if (mb.state === 'chasing') {
          // Powolny chase (0.7x szybciej)
          const speed = enemyDef.speed * 0.7;
          mb.x += (dx / dist) * speed * (dt / 16);
          mb.y += (dy / dist) * speed * (dt / 16);

          // Pattern 1: Spiral Bone Throw (co 5 sekund)
          if (mb.projectileCooldown <= 0 && dist < 400) {
            mb.projectileCooldown = 5000;
            // Spawn 12 kości w spirali (pełny okrąg)
            for (let i = 0; i < 12; i++) {
              const angle = (i / 12) * Math.PI * 2;
              const vx = Math.cos(angle) * 3.5;
              const vy = Math.sin(angle) * 3.5;
              const arrowTrail = [];
              for (let j = 0; j < 6; j++) {
                arrowTrail.push({ x: mb.x, y: mb.y });
              }
              state.projectiles.push({
                x: mb.x,
                y: mb.y,
                vx: vx,
                vy: vy,
                dmg: Math.floor(enemyDef.atk * 1.0 * damageMultiplier),
                ttl: 3000,
                emoji: '🦴',
                trail: arrowTrail,
                rotation: angle
              });
            }
          }

          // Pattern 2: Heavy Slam (co 4 sekundy, gdy blisko)
          if (mb.attackCooldown <= 0 && dist < 60) {
            mb.state = 'preparing';
            mb.warningTimer = 1000; // 1s sygnał - czerwony glow + zatrzymanie (FAIR!)
            mb.attackCooldown = 4000;
          }

          // Pattern 3: Spawn minionów co 10 sekund
          mb.minionSpawnTimer += dt;
          if (mb.minionSpawnTimer >= 10000) {
            mb.minionSpawnTimer = 0;
            const minionCount = 3;
            for (let i = 0; i < minionCount; i++) {
              const ang = Math.random() * Math.PI * 2;
              const distMinion = 70 + Math.random() * 50;
              const ex = (mb.x + Math.cos(ang) * distMinion + state.world.width) % state.world.width;
              const ey = (mb.y + Math.sin(ang) * distMinion + state.world.height) % state.world.height;
              state.enemies.push({
                ...enemyDef,
                x: ex,
                y: ey,
                hp: enemyDef.hp,
                hpMax: enemyDef.hp,
                t: 0,
                id: Math.random().toString(36).slice(2),
                nestId: null
              });
            }
            toast(`🧟 Megatrup przyzwał ${minionCount} minionów!`);
          }
        }
        else if (mb.state === 'preparing') {
          // Czerwony glow + zatrzymanie - sygnał ostrzegawczy (FAIR!)
          mb.warningTimer -= dt;
          // Zatrzymany - nie porusza się

          if (mb.warningTimer <= 0) {
            mb.state = 'attacking';
            // Heavy slam - mocny atak wręcz (tylko jeśli gracz nie ma respawn protection)
            if (state.respawnInvulnerable <= 0) {
              const damage = Math.floor(enemyDef.atk * 3 * damageMultiplier);
              state.hp -= damage;
              floatingText(`-${damage}`, state.pos.x, state.pos.y, '#ff0000', 32, 1200);
              addScreenShake(6, 300);
              spawnParticles(state.pos.x, state.pos.y, 20, '#ff0000', 'spark');
              animateBar('hp', (state.hp / state.hpMax) * 100, ((state.hp - damage) / state.hpMax) * 100);

              // Mocny knockback
              const knockback = 80;
              const knockDir = { x: dx / dist, y: dy / dist };
              state.pos.x -= knockDir.x * knockback;
              state.pos.y -= knockDir.y * knockback;
            }

            mb.state = 'recovering';
            mb.attackCooldown = 2000;
          }
        }
        else if (mb.state === 'recovering') {
          if (mb.attackCooldown <= 0) {
            mb.state = 'chasing';
          }
        }
      } else {
        mb.state = 'idle';
      }
    }

    // Wrap-around
    const mbWrapped = wrapPos(mb.x, mb.y, state.world.width, state.world.height);
    mb.x = mbWrapped.x;
    mb.y = mbWrapped.y;

    // === Kolizja i podstawowy atak wręcz megabestii ===
    // Oblicz odległość do gracza (już obliczona wcześniej w pętli, ale użyjemy ponownie)
    let mbDx = state.pos.x - mb.x, mbDy = state.pos.y - mb.y;
    if (Math.abs(mbDx) > state.world.width / 2) mbDx = mbDx > 0 ? mbDx - state.world.width : mbDx + state.world.width;
    if (Math.abs(mbDy) > state.world.height / 2) mbDy = mbDy > 0 ? mbDy - state.world.height : mbDy + state.world.height;
    const mbDist = Math.hypot(mbDx, mbDy);
    const mbMinD = COLLIDE.playerR + COLLIDE.enemyR * 2; // Megabestie są większe, więc większy promień kolizji

    // Collision push (tylko gdy nie jest w stanie specjalnego ataku)
    if (mb.state !== 'attacking' && mb.state !== 'preparing' && mbDist > 0 && mbDist < mbMinD) {
      const mbNx = mbDx / mbDist, mbNy = mbDy / mbDist;
      const mbPush = (mbMinD - mbDist) + 0.01;
      mb.x += mbNx * mbPush;
      mb.y += mbNy * mbPush;
      const mbWrapped2 = wrapPos(mb.x, mb.y, state.world.width, state.world.height);
      mb.x = mbWrapped2.x;
      mb.y = mbWrapped2.y;

      // Knockback animation for player on collision
      if (state.knockback.t <= 0) {
        state.knockback.x = -mbNx * 8; // Silniejszy knockback od megabestii
        state.knockback.y = -mbNy * 8;
        state.knockback.t = 200; // Dłuższy knockback
      }
    }

    // Podstawowy atak wręcz (tylko gdy nie jest w stanie specjalnego ataku i jest blisko)
    const mbAttackRange = COLLIDE.playerR + COLLIDE.enemyR * 2 + 10; // Większy zasięg ataku
    const mbLastHitTime = state.lastHitTime || 0;
    const mbRespawnInvulnerable = (state.respawnInvulnerable || 0);
    const mbEnemyDef = ENEMIES[mb.type]; // Pobierz definicję wroga
    const mbCurrentTime = Date.now(); // Czas dla cooldownów
    if (mbEnemyDef && mb.state !== 'attacking' && mb.state !== 'preparing' && mb.state !== 'recovering' &&
      mbDist <= mbAttackRange && mbCurrentTime - mbLastHitTime > 1000 && mbRespawnInvulnerable <= 0) {
      // Megabestie zadają więcej obrażeń niż normalne wrogi
      const mbDamageMultiplier = mb.isHiperUltra ? 2.0 : (mb.isUltra ? 1.5 : 1.0);
      const mbDamage = Math.floor((mbEnemyDef.atk || 10) * 1.5 * mbDamageMultiplier);
      const oldHP = state.hp;
      state.hp = clamp(state.hp - mbDamage, 0, state.hpMax);

      // Reakcja na utratę zdrowia
      if (state.hp < oldHP) {
        triggerPlayerReaction('takeDamage');
        addScreenShake(10, 200); // Silniejszy screen shake od megabestii
        spawnParticles(state.pos.x, state.pos.y, 12, '#ff0000', 'damage');
      }

      animateBar('hp', (oldHP / state.hpMax) * 100, (state.hp / state.hpMax) * 100);
      floatingText(`-${mbDamage}`, state.pos.x, state.pos.y, '#ff0000', 28, 1200);
      state.lastHitTime = mbCurrentTime;

      // Mocny knockback
      const mbNx = (mbDist > 0 ? mbDx / mbDist : 0), mbNy = (mbDist > 0 ? mbDy / mbDist : 0);
      state.knockback.x = -mbNx * 20; // Bardzo silny knockback
      state.knockback.y = -mbNy * 20;
      state.knockback.t = 400; // Dłuższy knockback
      updateHUD();
    }
  }

  // Wrap-around for enemies
  for (const e of state.enemies) {
    const eWrapped = wrapPos(e.x, e.y, state.world.width, state.world.height);
    e.x = eWrapped.x;
    e.y = eWrapped.y;
  }

  // Woman NPC movement
  state.woman.t += dt;

  // Sprawdź czy gracz macha mieczem w pobliżu niewiasty
  let dxWoman = state.woman.x - state.pos.x, dyWoman = state.woman.y - state.pos.y;
  if (Math.abs(dxWoman) > state.world.width / 2) dxWoman = dxWoman > 0 ? dxWoman - state.world.width : dxWoman + state.world.width;
  if (Math.abs(dyWoman) > state.world.height / 2) dyWoman = dyWoman > 0 ? dyWoman - state.world.height : dyWoman + state.world.height;
  const distWoman = Math.hypot(dxWoman, dyWoman);

  // Jeśli gracz macha mieczem (meleeSpin aktywny) i niewiasta jest w pobliżu (promień 150px)
  if (state.meleeSpin && distWoman < 150) {
    // Uciekaj od gracza
    const fleeSpeed = 1.5; // Szybkość ucieczki
    const fleeDir = Math.hypot(dxWoman, dyWoman);
    if (fleeDir > 0) {
      state.woman.x += (dxWoman / fleeDir) * fleeSpeed;
      state.woman.y += (dyWoman / fleeDir) * fleeSpeed;
    }
  } else {
    // Normalny ruch (wędrowanie)
    state.woman.x += Math.cos(state.woman.t * 0.001 + state.woman.x * 1e-3) * 0.5;
    state.woman.y += Math.sin(state.woman.t * 0.001 + state.woman.y * 1e-3) * 0.5;
  }

  const womanWrapped = wrapPos(state.woman.x, state.woman.y, state.world.width, state.world.height);
  state.woman.x = womanWrapped.x;
  state.woman.y = womanWrapped.y;

  // Woman interaction removed - use interaction mode (F) instead

  // Wizard NPC movement
  state.wizard.t += dt;
  state.wizard.x += Math.cos(state.wizard.t * 0.0012 + state.wizard.x * 1e-3) * 0.4;
  state.wizard.y += Math.sin(state.wizard.t * 0.0012 + state.wizard.y * 1e-3) * 0.4;
  const wizardWrapped = wrapPos(state.wizard.x, state.wizard.y, state.world.width, state.world.height);
  state.wizard.x = wizardWrapped.x;
  state.wizard.y = wizardWrapped.y;

  // Check distance to NPCs for reactions (co 500ms)
  const now = Date.now();
  if (!state.lastReactionCheck) state.lastReactionCheck = { woman: 0, wizard: 0 };

  if (now - state.lastReactionCheck.woman > 500) {
    let dxWoman = state.woman.x - state.pos.x, dyWoman = state.woman.y - state.pos.y;
    if (Math.abs(dxWoman) > state.world.width / 2) dxWoman = dxWoman > 0 ? dxWoman - state.world.width : dxWoman + state.world.width;
    if (Math.abs(dyWoman) > state.world.height / 2) dyWoman = dyWoman > 0 ? dyWoman - state.world.height : dyWoman + state.world.height;
    const distWoman = Math.hypot(dxWoman, dyWoman);
    if (distWoman < 150 && state.playerReaction.timer <= 0) {
      triggerPlayerReaction('nearWoman');
    }
    state.lastReactionCheck.woman = now;
  }

  if (now - state.lastReactionCheck.wizard > 500) {
    let dxWizard = state.wizard.x - state.pos.x, dyWizard = state.wizard.y - state.pos.y;
    if (Math.abs(dxWizard) > state.world.width / 2) dxWizard = dxWizard > 0 ? dxWizard - state.world.width : dxWizard + state.world.width;
    if (Math.abs(dyWizard) > state.world.height / 2) dyWizard = dyWizard > 0 ? dyWizard - state.world.height : dyWizard + state.world.height;
    const distWizard = Math.hypot(dxWizard, dyWizard);
    if (distWizard < 150 && state.playerReaction.timer <= 0) {
      triggerPlayerReaction('nearWizard');
    }
    state.lastReactionCheck.wizard = now;
  }

  // Czas dla cooldownów (używany w kolizjach i atakach)
  const currentTime = Date.now();

  // Children AI - follow player and attack enemies
  for (const child of state.children) {
    // Calculate distance to player
    let dx = state.pos.x - child.x, dy = state.pos.y - child.y;
    if (Math.abs(dx) > state.world.width / 2) dx = dx > 0 ? dx - state.world.width : dx + state.world.width;
    if (Math.abs(dy) > state.world.height / 2) dy = dy > 0 ? dy - state.world.height : dy + state.world.height;
    const distToPlayer = Math.hypot(dx, dy);

    // Move towards player
    if (distToPlayer > 0) {
      const moveSpeed = child.speed * (dt / 16);
      child.x += (dx / distToPlayer) * moveSpeed;
      child.y += (dy / distToPlayer) * moveSpeed;

      // Mark as reached player if close enough
      if (distToPlayer < 50 && !child.reachedPlayer) {
        child.reachedPlayer = true;
      }
    }

    // Wrap-around
    const childWrapped = wrapPos(child.x, child.y, state.world.width, state.world.height);
    child.x = childWrapped.x;
    child.y = childWrapped.y;

    // Attack enemies within 100 range of player - naśladuj ataki gracza
    if (child.reachedPlayer && distToPlayer < 100) {
      // Update child melee spin (jeśli aktywny)
      if (child.meleeSpin) {
        child.meleeSpin.t += dt;
        const m = child.meleeSpin;
        const r = 60; // Promień miecza dziecka (mniejszy niż gracza)
        const prog = clamp(m.t / m.dur, 0, 1);
        const startAng = m.startAngle || 0;
        const ang = startAng + prog * 2 * Math.PI;
        const sx = child.x + Math.cos(ang) * r;
        const sy = child.y + Math.sin(ang) * r;

        // Sprawdź trafienia wrogów
        for (const enemy of state.enemies) {
          const id = enemy.id;
          if (m.hit.has(id)) continue;
          let edx = enemy.x - sx, edy = enemy.y - sy;
          if (Math.abs(edx) > state.world.width / 2) edx = edx > 0 ? edx - state.world.width : edx + state.world.width;
          if (Math.abs(edy) > state.world.height / 2) edy = edy > 0 ? edy - state.world.height : edy + state.world.height;
          if (Math.hypot(edx, edy) < 25) {
            m.hit.add(id);
            const damage = state.level;
            enemy.hp -= damage;
            floatingText(`-${damage}`, enemy.x, enemy.y, '#ff6a6a');
            if (enemy.hp <= 0) {
              killEnemy(enemy);
            }
          }
        }

        if (m.t >= m.dur) {
          child.meleeSpin = null;
        }
      }

      // Znajdź najbliższego wroga
      let nearestEnemy = null;
      let nearestEnemyDist = Infinity;
      for (const enemy of state.enemies) {
        let edx = enemy.x - child.x, edy = enemy.y - child.y;
        if (Math.abs(edx) > state.world.width / 2) edx = edx > 0 ? edx - state.world.width : edx + state.world.width;
        if (Math.abs(edy) > state.world.height / 2) edy = edy > 0 ? edy - state.world.height : edy + state.world.height;
        const distToEnemy = Math.hypot(edx, edy);
        if (distToEnemy < 100 && distToEnemy < nearestEnemyDist) {
          nearestEnemy = enemy;
          nearestEnemyDist = distToEnemy;
        }
      }

      // Atak dziecka - gdy gracz uderza mieczem, wszystkie dzieci też uderzają mieczem
      if (nearestEnemy) {
        // Jeśli gracz uderza mieczem, wszystkie dzieci też uderzają mieczem
        if (state.meleeSpin && !child.meleeSpin) {
          const startAngle = rand(0, Math.PI * 2);
          child.meleeSpin = { t: 0, dur: 450, hit: new Set(), startAngle };
        } else if (!state.meleeSpin && !child.meleeSpin) {
          // Gdy gracz nie atakuje melee, dzieci używają swoich domyślnych ataków
          if (child.gender === 'boy') {
            // Syn (👶) - używa miecza (z cooldownem)
            const currentTime = Date.now();
            if (currentTime - child.lastAttack > 800) { // 800ms cooldown dla syna
              const startAngle = rand(0, Math.PI * 2);
              child.meleeSpin = { t: 0, dur: 450, hit: new Set(), startAngle };
              child.lastAttack = currentTime;
            }
          } else if (child.gender === 'girl') {
            // Córka (👧) - strzela z łuku (z cooldownem)
            const currentTime = Date.now();
            if (currentTime - (child.lastRangedAttack || 0) > 1000) { // 1 sekunda cooldown dla córki
              let edx = nearestEnemy.x - child.x, edy = nearestEnemy.y - child.y;
              if (Math.abs(edx) > state.world.width / 2) edx = edx > 0 ? edx - state.world.width : edx + state.world.width;
              if (Math.abs(edy) > state.world.height / 2) edy = edy > 0 ? edy - state.world.height : edy + state.world.height;
              const len = Math.hypot(edx, edy) || 1;
              const vx = (edx / len) * 5.0; // Nieco wolniejsza niż gracz
              const vy = (edy / len) * 5.0;
              // Dodaj trail history dla animacji strzały dziecka
              const childArrowTrail = [];
              for (let j = 0; j < 5; j++) {
                childArrowTrail.push({ x: child.x, y: child.y });
              }

              state.projectiles.push({
                x: child.x,
                y: child.y,
                vx,
                vy,
                ttl: 6000,
                dmg: state.level,
                emoji: '🏹',
                fromChild: true, // Oznacz że to od dziecka
                trail: childArrowTrail, // Historia pozycji dla trail effect
                rotation: Math.atan2(vy, vx) // Kąt rotacji strzały
              });
              child.lastRangedAttack = currentTime; // Zaktualizuj cooldown
            }
          }
        }
      }
    }
  }

  // Wizard interaction removed - use interaction mode (F) instead

  // === Collision resolution & Enemy attacks ===
  // enemies vs player (collision + attack hitbox)
  for (const e of state.enemies) {
    let dx = e.x - state.pos.x, dy = e.y - state.pos.y;
    if (Math.abs(dx) > state.world.width / 2) dx = dx > 0 ? dx - state.world.width : dx + state.world.width;
    if (Math.abs(dy) > state.world.height / 2) dy = dy > 0 ? dy - state.world.height : dy + state.world.height;
    const d = Math.hypot(dx, dy);
    const minD = COLLIDE.playerR + COLLIDE.enemyR;

    // Collision push
    if (d > 0 && d < minD) {
      const nx = dx / d, ny = dy / d;
      const push = (minD - d) + 0.01;
      e.x += nx * push;
      e.y += ny * push;
      const wrapped = wrapPos(e.x, e.y, state.world.width, state.world.height);
      e.x = wrapped.x;
      e.y = wrapped.y;

      // Knockback animation for player on collision
      if (state.knockback.t <= 0) {
        state.knockback.x = -nx * 6; // Push player away
        state.knockback.y = -ny * 6;
        state.knockback.t = 150; // 150ms knockback
      }
    }

    // Attack hitbox - enemy can attack when close enough (tylko jeśli gracz nie ma respawn protection)
    const attackRange = COLLIDE.playerR + COLLIDE.enemyR + 8; // Slightly larger than collision
    const lastHitTime = state.lastHitTime || 0; // Fallback jeśli nie jest zdefiniowane
    const respawnInvulnerable = (state.respawnInvulnerable || 0); // Fallback jeśli nie jest zdefiniowane
    if (d <= attackRange && currentTime - lastHitTime > 800 && respawnInvulnerable <= 0) { // 800ms cooldown between hits
      const enemyAtk = e.atk || 5; // Fallback jeśli atk nie jest zdefiniowane
      const oldHP = state.hp;
      state.hp = clamp(state.hp - enemyAtk, 0, state.hpMax);

      // Reakcja na utratę zdrowia (tylko jeśli HP faktycznie spadło)
      if (state.hp < oldHP) {
        triggerPlayerReaction('takeDamage');
        // Screen shake on damage
        addScreenShake(8, 150);
        // Particles on damage
        spawnParticles(state.pos.x, state.pos.y, 8, '#ff6a6a', 'damage');
      }

      animateBar('hp', (oldHP / state.hpMax) * 100, (state.hp / state.hpMax) * 100);
      floatingText(`-${enemyAtk}`, state.pos.x, state.pos.y, '#ff6a6a', 22, 1200);
      state.lastHitTime = currentTime;

      // Knockback on hit
      const nx = (d > 0 ? dx / d : 0), ny = (d > 0 ? dy / d : 0);
      state.knockback.x = -nx * 15; // Stronger knockback on hit
      state.knockback.y = -ny * 15;
      state.knockback.t = 350; // Longer knockback on hit
      updateHUD();
    }
  }

  // enemies vs enemies (optimized - only check nearby enemies)
  const enemyCollisionRadius = COLLIDE.enemyR * 4; // Only check enemies within this range
  for (let i = 0; i < state.enemies.length; i++) {
    const a = state.enemies[i];
    for (let j = i + 1; j < state.enemies.length; j++) {
      const b = state.enemies[j];
      let dx = b.x - a.x, dy = b.y - a.y;
      if (Math.abs(dx) > state.world.width / 2) dx = dx > 0 ? dx - state.world.width : dx + state.world.width;
      if (Math.abs(dy) > state.world.height / 2) dy = dy > 0 ? dy - state.world.height : dy + state.world.height;
      const d = Math.hypot(dx, dy);

      // Early exit if too far
      if (d > enemyCollisionRadius) continue;

      const minD = COLLIDE.enemyR * 2;
      if (d > 0 && d < minD) {
        const nx = dx / d, ny = dy / d;
        const push = (minD - d) / 2 + 0.01;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
        const wrappedA = wrapPos(a.x, a.y, state.world.width, state.world.height);
        const wrappedB = wrapPos(b.x, b.y, state.world.width, state.world.height);
        a.x = wrappedA.x; a.y = wrappedA.y;
        b.x = wrappedB.x; b.y = wrappedB.y;
      }
    }
  }

  // enemies vs megabeasts (normal enemies can attack megabeasts, but ultra/hiper ultra are immune)
  for (const e of state.enemies) {
    for (const mb of state.megabeasts) {
      // Ultra i Hiper Ultra megabestie są odporne na ataki normalnych wrogów
      if (mb.isUltra || mb.isHiperUltra) continue;

      let dx = mb.x - e.x, dy = mb.y - e.y;
      if (Math.abs(dx) > state.world.width / 2) dx = dx > 0 ? dx - state.world.width : dx + state.world.width;
      if (Math.abs(dy) > state.world.height / 2) dy = dy > 0 ? dy - state.world.height : dy + state.world.height;
      const d = Math.hypot(dx, dy);
      const attackRange = COLLIDE.enemyR * 2 + 10; // Range dla ataku wroga na megabestię

      // Normalny wróg może atakować megabestię (tylko jeśli nie jest ultra/hiper ultra)
      if (d <= attackRange && currentTime - (e.lastHitTime || 0) > 1000) {
        const enemyAtk = e.atk || 5;
        mb.hp -= enemyAtk;
        floatingText(`-${enemyAtk}`, mb.x, mb.y, '#ff6a6a', 18, 800);
        e.lastHitTime = currentTime;

        if (mb.hp <= 0) {
          // Megabestia zginęła
          const idx = state.megabeasts.findIndex(x => x === mb);
          if (idx >= 0) state.megabeasts.splice(idx, 1);
          // Drop loot dla megabestii
          const mbEnemyDef = ENEMIES[mb.type];
          if (mbEnemyDef) {
            spawnPickup('gold', mb.x, mb.y, 30);
            const xpValue = mb.isHiperUltra ? 200 : (mb.isUltra ? 100 : 50);
            spawnPickup('xp', mb.x, mb.y, xpValue);
          }
        }
      }
    }
  }

  for (let i = state.projectiles.length - 1; i >= 0; i--) {
    const pr = state.projectiles[i];

    // Aktualizuj trail history
    if (pr.trail) {
      // Dodaj aktualną pozycję na początek trail
      pr.trail.unshift({ x: pr.x, y: pr.y });
      // Ogranicz długość trail do 15 pozycji dla dłuższego, bardziej widocznego trail
      if (pr.trail.length > 15) {
        pr.trail.pop();
      }
    }

    pr.x += pr.vx;
    pr.y += pr.vy;
    // Wrap-around for projectiles
    const wrapped = wrapPos(pr.x, pr.y, state.world.width, state.world.height);
    pr.x = wrapped.x;
    pr.y = wrapped.y;
    pr.ttl -= dt;

    // Check collision with player (tylko dla projectile od megabestii - mają isPoison lub emoji 🦴/💚)
    if (pr.emoji === '🦴' || pr.emoji === '💚' || pr.isPoison) {
      let dx = state.pos.x - pr.x, dy = state.pos.y - pr.y;
      if (Math.abs(dx) > state.world.width / 2) dx = dx > 0 ? dx - state.world.width : dx + state.world.width;
      if (Math.abs(dy) > state.world.height / 2) dy = dy > 0 ? dy - state.world.height : dy + state.world.height;
      const dist = Math.hypot(dx, dy);

      if (dist < 25 && state.respawnInvulnerable <= 0) {
        // Trafienie gracza (tylko jeśli gracz nie ma respawn protection)
        state.hp -= pr.dmg;
        floatingText(`-${pr.dmg}`, state.pos.x, state.pos.y, '#ff0000', 24, 1200);
        addScreenShake(2, 150);
        spawnParticles(state.pos.x, state.pos.y, 8, '#ff0000', 'spark');
        animateBar('hp', (state.hp / state.hpMax) * 100, ((state.hp - pr.dmg) / state.hpMax) * 100);

        // Jeśli to trucizna, zatruj gracza
        if (pr.isPoison || pr.emoji === '💚') {
          if (!state.poisoned) {
            state.poisoned = { t: 3000, dmg: 2 };
          } else {
            state.poisoned.t = 3000; // Resetuj timer
          }
        }

        pr.ttl = 0;
        updateHUD();
      }
    }

    // Optimized collision - only check enemies within range
    const projectileRange = 30; // Check enemies within this range
    for (const e of state.enemies) {
      let dx = e.x - pr.x, dy = e.y - pr.y;
      if (Math.abs(dx) > state.world.width / 2) dx = dx > 0 ? dx - state.world.width : dx + state.world.width;
      if (Math.abs(dy) > state.world.height / 2) dy = dy > 0 ? dy - state.world.height : dy + state.world.height;
      const dist = Math.hypot(dx, dy);

      // Early exit if too far
      if (dist > projectileRange) continue;

      if (dist < 20) {
        e.hp -= pr.dmg;
        floatingText(`-${pr.dmg}`, e.x, e.y, '#ff6a6a');

        // Hit flash effect
        enemyHitFlashes[e.id] = 100; // 100ms flash

        // Knockback
        const nx = dx / dist || 0;
        const ny = dy / dist || 0;
        if (!state.enemyKnockback[e.id]) {
          state.enemyKnockback[e.id] = { x: 0, y: 0, t: 0 };
        }
        state.enemyKnockback[e.id].x = nx * 10; // Stronger knockback from arrow
        state.enemyKnockback[e.id].y = ny * 10;
        state.enemyKnockback[e.id].t = 250;

        pr.ttl = 0;
        if (e.hp <= 0) killEnemy(e);
        break;
      }
    }

    // Check collision with megabeasts
    const megabeastRange = 45; // Większy zasięg dla megabestii
    for (const mb of state.megabeasts) {
      let dx = mb.x - pr.x, dy = mb.y - pr.y;
      if (Math.abs(dx) > state.world.width / 2) dx = dx > 0 ? dx - state.world.width : dx + state.world.width;
      if (Math.abs(dy) > state.world.height / 2) dy = dy > 0 ? dy - state.world.height : dy + state.world.height;
      const dist = Math.hypot(dx, dy);

      if (dist > megabeastRange) continue;

      if (dist < 40) { // Większy hitbox dla megabestii
        mb.hp -= pr.dmg;
        floatingText(`-${pr.dmg}`, mb.x, mb.y, '#ff0000', 28, 1200); // Czerwony kolor

        // Hit flash effect
        if (!enemyHitFlashes[mb.id]) enemyHitFlashes[mb.id] = 0;
        enemyHitFlashes[mb.id] = 150;

        // Particles on hit
        spawnParticles(mb.x, mb.y, 12, '#ff0000', 'spark');

        pr.ttl = 0;

        if (mb.hp <= 0) {
          // Unikalne dropy dla każdego typu megabestii
          const enemyDef = ENEMIES[mb.type];
          if (mb.type === 0) { // 🐺 WILK
            // Drop: 30 monet + 10 mięsiwa + 5 XP orbs
            for (let i = 0; i < 30; i++) {
              spawnPickup('gold', mb.x + rand(-30, 30), mb.y + rand(-30, 30), 1, undefined);
            }
            for (let i = 0; i < 10; i++) {
              spawnPickup('meat', mb.x + rand(-30, 30), mb.y + rand(-30, 30), 1, undefined);
            }
            for (let i = 0; i < 5; i++) {
              spawnPickup('xp', mb.x + rand(-30, 30), mb.y + rand(-30, 30), 75, undefined); // Uproszczone: zawsze 75 XP
            }
          }
          else if (mb.type === 1) { // 🐗 DZIK
            // Drop: 30 monet + 15 jabłek + 10 mięsiwa
            for (let i = 0; i < 30; i++) {
              spawnPickup('gold', mb.x + rand(-30, 30), mb.y + rand(-30, 30), 1, undefined);
            }
            for (let i = 0; i < 15; i++) {
              spawnPickup('apple', mb.x + rand(-30, 30), mb.y + rand(-30, 30), 1, undefined);
            }
            for (let i = 0; i < 10; i++) {
              spawnPickup('meat', mb.x + rand(-30, 30), mb.y + rand(-30, 30), 1, undefined);
            }
          }
          else if (mb.type === 2) { // 🐍 ŻMIJA
            // Drop: 30 monet + 20 flaszek + 10 XP orbs
            for (let i = 0; i < 30; i++) {
              spawnPickup('gold', mb.x + rand(-30, 30), mb.y + rand(-30, 30), 1, undefined);
            }
            for (let i = 0; i < 20; i++) {
              spawnPickup('mead', mb.x + rand(-30, 30), mb.y + rand(-30, 30), 1, undefined);
            }
            for (let i = 0; i < 10; i++) {
              spawnPickup('xp', mb.x + rand(-30, 30), mb.y + rand(-30, 30), 50, undefined); // Uproszczone: zawsze 50 XP
            }
          }
          else if (mb.type === 3) { // 🧟 TRUP
            // Drop: 30 monet + 25 różnych przedmiotów + 15 XP orbs
            for (let i = 0; i < 30; i++) {
              spawnPickup('gold', mb.x + rand(-30, 30), mb.y + rand(-30, 30), 1, undefined);
            }
            const dropTypes = ['meat', 'apple', 'mead', 'seed'];
            for (let i = 0; i < 25; i++) {
              const dropType = dropTypes[Math.floor(Math.random() * dropTypes.length)];
              spawnPickup(dropType, mb.x + rand(-30, 30), mb.y + rand(-30, 30), 1, undefined);
            }
            for (let i = 0; i < 15; i++) {
              spawnPickup('xp', mb.x + rand(-30, 30), mb.y + rand(-30, 30), 60, undefined); // Uproszczone: zawsze 60 XP
            }
          }

          const mbIdx = state.megabeasts.findIndex(m => m.id === mb.id);
          if (mbIdx >= 0) {
            state.megabeasts.splice(mbIdx, 1);
            const enemyNames = ['Wilka', 'Dzikiej świni', 'Żmii', 'Trupa'];
            const enemyName = enemyNames[mb.type] || 'Potwora';
            toast(`💀 MEGABESTIA ${enemyDef.emoji} ${enemyName} pokonana!`);
          }
        }
        break;
      }
    }

    // Check collision with nests (siedliska) - kamień i emoji mają ten sam hitbox
    const nestRange = 40; // Nieco większy zasięg dla siedlisk (są większe)
    for (const nest of state.nests) {
      let dx = nest.x - pr.x, dy = nest.y - pr.y;
      if (Math.abs(dx) > state.world.width / 2) dx = dx > 0 ? dx - state.world.width : dx + state.world.width;
      if (Math.abs(dy) > state.world.height / 2) dy = dy > 0 ? dy - state.world.height : dy + state.world.height;
      const dist = Math.hypot(dx, dy);

      // Early exit if too far
      if (dist > nestRange) continue;

      if (dist < 35) { // Nieco większy hitbox dla siedlisk
        nest.hp -= pr.dmg;
        floatingText(`-${pr.dmg}`, nest.x, nest.y, '#8B4513', 24, 1200); // Brown color for nest damage

        // Hit flash effect - klasyczne mruganie
        nestHitFlashes[nest.id] = 150; // 150ms flash

        // Particles on hit
        spawnParticles(nest.x, nest.y, 8, '#8B4513', 'spark');

        pr.ttl = 0;

        if (nest.hp <= 0) {
          // Nest destroyed, drop items and schedule respawn
          const baseDropCount = 10;

          // Dodatkowe dropy: 1 szansa 10% za każdy level gracza
          let extraDrops = 0;
          for (let i = 0; i < state.level; i++) {
            if (Math.random() < 0.1) {
              extraDrops++;
            }
          }

          const totalDropCount = baseDropCount + extraDrops;

          for (let i = 0; i < totalDropCount; i++) {
            // Spawn bez direction - bez bouncing, od razu gotowe do zbierania
            const dropTypes = ['meat', 'apple', 'mead', 'gold', 'seed'];
            const dropType = dropTypes[Math.floor(Math.random() * dropTypes.length)];
            // Małe losowe przesunięcie pozycji, ale bez fizyki bouncing
            const offsetX = nest.x + rand(-30, 30);
            const offsetY = nest.y + rand(-30, 30);
            spawnPickup(dropType, offsetX, offsetY, undefined, undefined);
          }

          // Schedule respawn after 30 seconds
          state.nestRespawns.push({
            type: nest.type,
            timer: 30000
          });

          const nestIdx = state.nests.findIndex(n => n.id === nest.id);
          if (nestIdx >= 0) {
            state.nests.splice(nestIdx, 1);
            state.stats.nestsDestroyed++;
            handleNestDestroyed(nest);
            const extraText = extraDrops > 0 ? ` (+${extraDrops} ekstra!)` : '';
            toast(`💥 Zniszczono legowisko!${extraText}`);
          }
        }
        break;
      }
    }

    if (pr.ttl <= 0) state.projectiles.splice(i, 1);
  }

  // pickups - przyciąganie i zbieranie
  for (let i = state.pickups.length - 1; i >= 0; i--) {
    const p = state.pickups[i];
    let dx = p.x - state.pos.x, dy = p.y - state.pos.y;
    if (Math.abs(dx) > state.world.width / 2) dx = dx > 0 ? dx - state.world.width : dx + state.world.width;
    if (Math.abs(dy) > state.world.height / 2) dy = dy > 0 ? dy - state.world.height : dy + state.world.height;
    const dist = Math.hypot(dx, dy);

    // Przyciąganie dropów (jak odkurzacz) - zasięg = poziom postaci + wartość z karty postaci
    const magnetRange = state.level + state.pickupMagnetRange;
    const collectRadius = 15; // Promień zbierania - gdy przedmiot osiągnie środek gracza
    const baseCollectRadius = 100; // Bazowy promień zbierania (bez przyciągania, gdy magnetRange = 0)

    // Inicjalizuj beingPulled jeśli nie istnieje
    if (p.beingPulled === undefined) p.beingPulled = false;

    // Przyciąganie: przedmioty w zasięgu magnetRange (ale poza promieniem zbierania) są przyciągane
    if (magnetRange > collectRadius && dist > collectRadius && dist <= magnetRange) {
      // Oznacz pickup jako przyciągany (dla animacji)
      p.beingPulled = true;

      // Przyciągnij pickup do gracza - zwiększona prędkość dla lepszej animacji
      // Prędkość zależy od odległości - im bliżej, tym szybciej (efekt przyspieszenia)
      const rangeForSpeed = magnetRange - collectRadius;
      const distInRange = dist - collectRadius;
      const speedMultiplier = rangeForSpeed > 0 ? 1 + (1 - (distInRange / rangeForSpeed)) * 2 : 1; // 1x do 3x prędkości
      const pullSpeed = 5.0 * speedMultiplier * (dt / 16); // Zwiększona bazowa prędkość
      const pullX = (dx / dist) * pullSpeed;
      const pullY = (dy / dist) * pullSpeed;
      p.x -= pullX;
      p.y -= pullY;

      // Wrap-around dla pickupów
      const wrapped = wrapPos(p.x, p.y, state.world.width, state.world.height);
      p.x = wrapped.x;
      p.y = wrapped.y;

      // NIE zbieraj przedmiotów, które są przyciągane - wyjdź z pętli
      continue;
    } else {
      p.beingPulled = false;
    }

    // Zbieranie pickupów (gdy osiągną środek gracza) - mały promień zbierania
    // LUB gdy magnetRange jest za mały, zbieraj w bazowym promieniu
    // WAŻNE: przedmioty przyciągane są pomijane (continue powyżej)
    const shouldCollect = (magnetRange > collectRadius && dist < collectRadius) ||
      (magnetRange <= collectRadius && dist < baseCollectRadius);

    if (shouldCollect) {
      // Pickup animation particles
      spawnParticles(p.x, p.y, 5, '#4ade80', 'pickup');

      if (p.kind === 'meat') {
        const meatValue = p.value || 1;
        state.inventory.meat += meatValue;
        floatingText(`+${meatValue} Mięsiwo`, p.x, p.y, '#f59e0b', 16, 800);
        toast(`🍖 +${meatValue} Mięsiwo`);
        triggerPlayerReaction('pickup');
      }
      if (p.kind === 'mead') {
        const meadValue = p.value || 1;
        state.inventory.mead += meadValue;
        floatingText(`+${meadValue} Flaszka`, p.x, p.y, '#8b5cf6', 16, 800);
        toast(`🍾 +${meadValue} Flaszka`);
        triggerPlayerReaction('pickup');
      }
      if (p.kind === 'gold') {
        state.gold += p.value || 1;
        floatingText(`+${p.value || 1}💰`, p.x, p.y, '#fbbf24', 18, 1000);
        toast(`🪙 +${p.value || 1}`);
        triggerPlayerReaction('pickup');
      }
      if (p.kind === 'xp') {
        gainXP(p.value || 10, p.x, p.y); // gainXP z pozycją dla floating text
        toast(`✨ +${p.value || 10} XP`);
        triggerPlayerReaction('pickup');
        // Particles on XP pickup
        spawnParticles(p.x, p.y, 8, '#fbbf24', 'spark');
      }
      if (p.kind === 'apple') {
        const appleValue = p.value || 1;
        state.inventory.apples += appleValue;
        floatingText(`+${appleValue} Jabłko`, p.x, p.y, '#ef4444', 16, 800);
        toast(`🍎 +${appleValue} Jabłko`);
        triggerPlayerReaction('pickup');
        // 10% chance to drop seed
        if (Math.random() < 0.1) {
          const seedDir = { x: state.facing.x || rand(-0.5, 0.5), y: -0.5 };
          spawnPickup('seed', state.pos.x, state.pos.y, undefined, seedDir);
          toast('🌱 Pestka!');
        }
      }
      if (p.kind === 'seed') {
        const seedValue = p.value || 1;
        state.inventory.seeds += seedValue;
        floatingText(`+${seedValue} Ziarno`, p.x, p.y, '#10b981', 16, 800);
        toast(`🌱 +${seedValue} Ziarno`);
        triggerPlayerReaction('pickup');
      }
      if (p.kind === 'wood') {
        const woodValue = p.value || 1;
        state.inventory.wood += woodValue;
        floatingText(`+${woodValue} Drewno`, p.x, p.y, '#8b4513', 16, 800);
        toast(`🪵 +${woodValue} Drewno`);
        triggerPlayerReaction('pickup');
      }
      state.pickups.splice(i, 1); updateHUD();
    }
  }

  // śmierć i respawn miękki
  if (state.hp <= 0) {
    state.lives--;
    if (state.lives > 0) {
      toast(`💀 Zginąłeś! Pozostało żyć: ${state.lives}`);
      state.paused = true;
      showStartScreen(); // Pokaż ekran startowy po śmierci
      // Reset pozycji i wrogów, ale zachowaj stan świata (w tym megabestie!)
      state.hp = state.hpMax;
      state.mp = state.mpMax;
      state.pos = { x: 3000, y: 3000 };
      state.enemies = [];
      state.pickups = [];
      state.projectiles = [];
      state.children = [];
      // Megabestie NIE są resetowane - pozostają w grze!
      // Dodaj spawn kill protection - gracz jest niewrażliwy przez 3 sekundy po respawnie
      if (state.respawnInvulnerable === undefined) state.respawnInvulnerable = 0;
      state.respawnInvulnerable = 3000; // 3 sekundy ochrony
      // Nie resetuj jaskini i drzew - zachowaj stan świata
    } else {
      // Game Over - pokaż ekran startowy
      toast('💀 Game Over! Wszystkie życia wykorzystane.');
      state.paused = true;
      showStartScreen();
      // Reset gry
      state.hp = state.hpMax;
      state.mp = state.mpMax;
      state.pos = { x: 3000, y: 3000 };
      state.enemies = [];
      state.pickups = [];
      state.projectiles = [];
      state.children = [];
      state.nests = [];
      state.nestRespawns = [];
      state.trees = [];
      state.megabeasts = []; // Reset megabestii tylko przy Game Over
      state.lives = 3;
      state.level = 1;
      state.xp = 0;
      state.gold = 0;
      spawnInitial();
    }
  }

  // Periodic enemy spawn every minute
  state.lastMinuteSpawn += dt;
  if (state.lastMinuteSpawn >= 60000) { // 60 seconds = 60000ms
    state.lastMinuteSpawn = 0;
    const enemiesToSpawn = Math.round(rand(5, 12)); // Spawn 5-12 enemies every minute
    for (let i = 0; i < enemiesToSpawn; i++) {
      spawnEnemy();
    }
    toast(`⚠️ Pojawiło się ${enemiesToSpawn} nowych wrogów!`);
  }

  // spawny (random spawns - keep existing logic)
  if (state.enemies.length < 26 && Math.random() < 0.03) spawnEnemy();
  if (Math.random() < 0.02) {
    const dropDir = { x: rand(-0.5, 0.5), y: -0.5 };
    spawnPickup(Math.random() < .5 ? 'meat' : 'mead', rand(0, state.world.width), rand(0, state.world.height), undefined, dropDir);
  }

  // === Home Guards AI ===
  if (state.homeGuards && state.homeGuards.length > 0) {
    for (const guard of state.homeGuards) {
      if (guard.attackTimer === undefined) guard.attackTimer = 0;
      if (guard.attackTimer > 0) {
        guard.attackTimer -= dt;
      } else {
        // Find nearest enemy to guard
        let nearest = null;
        let minDist = 250; // Max attack range
        
        // Check normal enemies
        for (const e of state.enemies) {
          let dx = e.x - guard.x, dy = e.y - guard.y;
          if (Math.abs(dx) > state.world.width / 2) dx = dx > 0 ? dx - state.world.width : dx + state.world.width;
          if (Math.abs(dy) > state.world.height / 2) dy = dy > 0 ? dy - state.world.height : dy + state.world.height;
          const dist = Math.hypot(dx, dy);
          if (dist < minDist) {
            minDist = dist;
            nearest = e;
          }
        }
        
        // Check megabeasts if no normal enemy close
        if (!nearest) {
          for (const mb of state.megabeasts) {
            let dx = mb.x - guard.x, dy = mb.y - guard.y;
            if (Math.abs(dx) > state.world.width / 2) dx = dx > 0 ? dx - state.world.width : dx + state.world.width;
            if (Math.abs(dy) > state.world.height / 2) dy = dy > 0 ? dy - state.world.height : dy + state.world.height;
            const dist = Math.hypot(dx, dy);
            if (dist < minDist) {
              minDist = dist;
              nearest = mb;
            }
          }
        }

        if (nearest) {
          nearest.hp -= 30;
          guard.attackTimer = 2000; // 2 seconds between attacks
          enemyHitFlashes[nearest.id] = 200;
          
          // Visual attack effect (particles/line)
          for (let i = 0; i < 5; i++) {
            particles.push({
              x: guard.x, y: guard.y,
              vx: (nearest.x - guard.x) / 10 + rand(-2, 2),
              vy: (nearest.y - guard.y) / 10 + rand(-2, 2),
              color: '#fbbf24', size: 3, t: 300
            });
          }
          
          // Floating feedback
          fly.push({ x: nearest.x, y: nearest.y, msg: '-30', color: '#fbbf24', size: 20, t: 800, vx: 0, vy: 0 });
        }
      }
    }
  }

  // === Ult cooldown ===
  if (state.ultCooldown > 0) state.ultCooldown -= dt;

  // === Tree Respawn — co 60 sekund spawnuj nowe drzewa jeśli jest ich za mało ===
  if (state.treeRespawnTimer === undefined) state.treeRespawnTimer = 0;
  state.treeRespawnTimer += dt;
  if (state.treeRespawnTimer >= 60000) {
    state.treeRespawnTimer = 0;
    const deciduousCount = state.trees.filter(t => t.type === '🌳').length;
    if (deciduousCount < 50) {
      const newTrees = Math.round(rand(3, 5));
      for (let i = 0; i < newTrees; i++) {
        state.trees.push({
          x: rand(0, state.world.width),
          y: rand(0, state.world.height),
          type: '🌳',
          lastDrop: 0,
          hp: 2,
          hpMax: 2,
          size: rand(2.2, 2.7),
          id: Math.random().toString(36).slice(2)
        });
      }
      toast(`🌳 ${newTrees} nowych drzew wyrosło!`);
    }
  }

  // === Pinball / Kolizja atak ciałem ===
  if (state.pinballCooldown === undefined) state.pinballCooldown = 0;
  if (state.pinballCooldown > 0) state.pinballCooldown -= dt;
  const playerSpeed = Math.hypot(state.vel.x, state.vel.y);
  if (playerSpeed > 1.5 && state.pinballCooldown <= 0) {
    for (const e of state.enemies) {
      let dx = e.x - state.pos.x, dy = e.y - state.pos.y;
      if (Math.abs(dx) > state.world.width / 2) dx = dx > 0 ? dx - state.world.width : dx + state.world.width;
      if (Math.abs(dy) > state.world.height / 2) dy = dy > 0 ? dy - state.world.height : dy + state.world.height;
      const dist = Math.hypot(dx, dy);
      if (dist < COLLIDE.playerR + COLLIDE.enemyR) {
        // Zadaj obrażenia wrogowi
        const pinballDmg = Math.round(state.meleeDamage * 0.5);
        e.hp -= pinballDmg;
        // Knockback wroga w kierunku ruchu gracza
        const kbLen = dist || 1;
        state.enemyKnockback[e.id] = { x: (dx / kbLen) * 10, y: (dy / kbLen) * 10, t: 300 };
        enemyHitFlashes[e.id] = 200;
        fly.push({ x: e.x, y: e.y, msg: `💥-${pinballDmg}`, color: '#fb923c', size: 22, t: 800, vx: 0, vy: 0 });
        // Gracz traci HP
        const oldHP = state.hp;
        state.hp = clamp(state.hp - 5, 0, state.hpMax);
        fly.push({ x: state.pos.x, y: state.pos.y, msg: '-5 HP', color: '#ef4444', size: 18, t: 600, vx: 0, vy: 0 });
        // Cooldown kolizji
        state.pinballCooldown = 500;
        // Particles
        for (let i = 0; i < 6; i++) {
          particles.push({
            x: (state.pos.x + e.x) / 2, y: (state.pos.y + e.y) / 2,
            vx: rand(-3, 3), vy: rand(-3, 3),
            color: '#fb923c', size: 3, t: 400
          });
        }
        break; // Tylko jedna kolizja na raz
      }
    }
  }
}

// === Render ===
function draw() {
  // Apply screen shake
  ctx.save();
  ctx.translate(screenShake.x, screenShake.y);

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Deciduous and Coniferous trees (background) - optimized rendering
  ctx.globalAlpha = 0.85;
  for (const tree of state.trees) {
    const isFlashing = treeHitFlashes[tree.id] && treeHitFlashes[tree.id] > 0;
    
    // Wizualny wskaźnik uszkodzonego drzewa (jeśli zostało trafione)
    let shrinkFactor = 1.0;
    if (tree.hp < tree.hpMax) {
      shrinkFactor = 0.85; // Drzewo jest nieco mniejsze (uszkodzone)
    }
    
    const treeSize = Math.round((tree.size || 2.5) * 30 * shrinkFactor); // Standardowy emoji to ~30px
    ctx.font = `${treeSize}px "Apple Color Emoji", "Segoe UI Emoji"`;
    
    const emoji = tree.type || '🌳';
    
    renderWithWrapAround(tree.x, tree.y, (s) => {
      if (isFlashing) {
        ctx.save();
        ctx.globalAlpha = 0.9;
        // removed shadowBlur
        // removed shadowColor
        ctx.fillText(emoji, s.x, s.y);
        ctx.restore();
      } else {
        ctx.fillText(emoji, s.x, s.y);
      }
    });
  }
  ctx.globalAlpha = 1;

  // Home - optimized rendering (4x emoji size = 120px)
  ctx.font = '120px "Apple Color Emoji", "Segoe UI Emoji"';
  renderWithWrapAround(state.home.x, state.home.y, (s) => {
    ctx.fillText('🏠', s.x, s.y);
  });

  // Home Guards rendering
  if (state.homeGuards && state.homeGuards.length > 0) {
    ctx.font = '36px "Apple Color Emoji", "Segoe UI Emoji"';
    for (const guard of state.homeGuards) {
      renderWithWrapAround(guard.x, guard.y, (s) => {
        ctx.fillText('🛡️', s.x, s.y);
      });
    }
  }

  // Megabeasts - większe i bardziej widoczne niż normalne potwory
  ctx.font = '80px "Apple Color Emoji", "Segoe UI Emoji"'; // Megabestie są większe
  for (const mb of state.megabeasts) {
    renderWithWrapAround(mb.x, mb.y, (s) => {
      const enemyDef = ENEMIES[mb.type];
      const mbEmoji = enemyDef ? enemyDef.emoji : '👹';

      // Hiper Ultra = 2x większe niż Ultra (180px), Ultra = 1.5x większe niż normalna (90px), normalna = 60px
      let fontSize;
      if (mb.isHiperUltra) {
        fontSize = 180; // 2x większe niż Ultra (90px * 2 = 180px)
      } else if (mb.isUltra) {
        fontSize = 90; // 1.5x większa niż normalna (60px * 1.5 = 90px)
      } else {
        fontSize = 60; // Normalna megabestia
      }
      ctx.font = `${fontSize}px "Apple Color Emoji", "Segoe UI Emoji"`;

      // Hit flash effect
      const isFlashing = enemyHitFlashes[mb.id] && enemyHitFlashes[mb.id] > 0;

      if (isFlashing) {
        ctx.save();
        ctx.globalAlpha = 0.9;
        // removed shadowBlur
        // removed shadowColor
        // Hiper Ultra: 2 emoji (lustrzane odbicie) dla wilka, dzika i żmii - stykają się tyłami głów
        if (mb.isHiperUltra && mb.type !== 3) {
          ctx.fillText(mbEmoji, s.x - fontSize * 0.6, s.y); // Lewe emoji (patrzy w lewo)
          // Prawe emoji - odbite lustrzanie (patrzy w prawo) - większy offset aby tyły głów się stykały
          ctx.save();
          ctx.translate(s.x + fontSize * 0.6, s.y);
          ctx.scale(-1, 1); // Odbicie poziome
          ctx.fillText(mbEmoji, 0, 0);
          ctx.restore();
        } else if (mb.isHiperUltra && mb.type === 3) {
          // Trup - poziomo jak królowa z kart (oba patrzą w lewo)
          ctx.fillText(mbEmoji, s.x - fontSize * 0.3, s.y); // Lewe emoji
          ctx.fillText(mbEmoji, s.x + fontSize * 0.3, s.y); // Prawe emoji
        } else {
          ctx.fillText(mbEmoji, s.x, s.y);
        }
        ctx.restore();
      } else if (mb.state === 'preparing' && mb.warningTimer > 0) {
        // Sygnał ostrzegawczy (FAIR MECHANICS) - pulsujący glow podczas przygotowania
        ctx.save();
        let glowColor = '#ef4444'; // Domyślnie czerwony (wilk, trup)
        if (mb.type === 1) glowColor = '#fbbf24'; // Dzik - żółty
        if (mb.type === 2) glowColor = '#10b981'; // Żmija - zielony

        const pulse = 0.5 + Math.sin(Date.now() / 100) * 0.3; // Pulsujący efekt
        ctx.globalAlpha = pulse * 0.7;
        // removed shadowBlur
        // removed shadowColor
        // Hiper Ultra: 2 emoji (lustrzane odbicie) dla wilka, dzika i żmii - stykają się tyłami głów
        if (mb.isHiperUltra && mb.type !== 3) {
          ctx.fillText(mbEmoji, s.x - fontSize * 0.6, s.y); // Lewe emoji (patrzy w lewo)
          // Prawe emoji - odbite lustrzanie (patrzy w prawo) - większy offset aby tyły głów się stykały
          ctx.save();
          ctx.translate(s.x + fontSize * 0.6, s.y);
          ctx.scale(-1, 1); // Odbicie poziome
          ctx.fillText(mbEmoji, 0, 0);
          ctx.restore();
        } else if (mb.isHiperUltra && mb.type === 3) {
          // Trup - poziomo jak królowa z kart (oba patrzą w lewo)
          ctx.fillText(mbEmoji, s.x - fontSize * 0.3, s.y); // Lewe emoji
          ctx.fillText(mbEmoji, s.x + fontSize * 0.3, s.y); // Prawe emoji
        } else {
          ctx.fillText(mbEmoji, s.x, s.y);
        }
        ctx.restore();
      } else {
        // Normalny efekt świecenia dla megabestii
        ctx.save();
        if (mb.isHiperUltra) {
          // Hiper Ultra megabestia - największy, najbardziej intensywny glow (czerwony/pomarańczowy)
          // removed shadowBlur
          // removed shadowColor
        } else if (mb.isUltra) {
          // Ultra megabestia - większy, bardziej intensywny glow (pomarańczowy/purpurowy)
          // removed shadowBlur
          // removed shadowColor
          ctx.globalAlpha = 0.95;
        } else {
          // Normalna megabestia - czerwony glow
          // removed shadowBlur
          // removed shadowColor
        }
        // Hiper Ultra: 2 emoji (lustrzane odbicie) dla wilka, dzika i żmii - stykają się tyłami głów
        if (mb.isHiperUltra && mb.type !== 3) {
          ctx.fillText(mbEmoji, s.x - fontSize * 0.6, s.y); // Lewe emoji (patrzy w lewo)
          // Prawe emoji - odbite lustrzanie (patrzy w prawo) - większy offset aby tyły głów się stykały
          ctx.save();
          ctx.translate(s.x + fontSize * 0.6, s.y);
          ctx.scale(-1, 1); // Odbicie poziome
          ctx.fillText(mbEmoji, 0, 0);
          ctx.restore();
        } else if (mb.isHiperUltra && mb.type === 3) {
          // Trup - poziomo jak królowa z kart (oba patrzą w lewo)
          ctx.fillText(mbEmoji, s.x - fontSize * 0.3, s.y); // Lewe emoji
          ctx.fillText(mbEmoji, s.x + fontSize * 0.3, s.y); // Prawe emoji
        } else {
          ctx.fillText(mbEmoji, s.x, s.y);
        }
        ctx.restore();
      }

      // Show HP bar (zawsze widoczny, większy dla ultra/hiper ultra)
      const hpPercent = mb.hp / mb.hpMax;
      const barWidth = mb.isHiperUltra ? 120 : (mb.isUltra ? 90 : 70); // Hiper Ultra ma najszerszy pasek
      const barHeight = mb.isHiperUltra ? 12 : (mb.isUltra ? 10 : 8); // Hiper Ultra ma najwyższy pasek
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(s.x - barWidth / 2, s.y - (mb.isHiperUltra ? 90 : 60), barWidth, barHeight);
      // Hiper Ultra ma czerwony pasek, Ultra ma pomarańczowy, normalna ma standardowy
      if (mb.isHiperUltra) {
        ctx.fillStyle = hpPercent > 0.5 ? '#ff0000' : hpPercent > 0.25 ? '#ff3333' : '#cc0000';
      } else if (mb.isUltra) {
        ctx.fillStyle = hpPercent > 0.5 ? '#ff6b00' : hpPercent > 0.25 ? '#ff9500' : '#ff0000';
      } else {
        ctx.fillStyle = hpPercent > 0.5 ? '#4ade80' : hpPercent > 0.25 ? '#fbbf24' : '#ef4444';
      }
      ctx.fillRect(s.x - barWidth / 2, s.y - (mb.isHiperUltra ? 90 : 60), barWidth * hpPercent, barHeight);
      ctx.fillStyle = '#e6e6e6';

      // Przywróć domyślny font
      ctx.font = '30px "Apple Color Emoji", "Segoe UI Emoji"';
    });
  }

  // Nests - optimized rendering (show animal emoji for each nest type)
  // Legowiska są 2x większe od normalnych mobów (wrogowie: 30px, legowiska: 60px)
  ctx.font = '60px "Apple Color Emoji", "Segoe UI Emoji"';
  for (const nest of state.nests) {
    renderWithWrapAround(nest.x, nest.y, (s) => {
      // Hit flash effect - klasyczne mruganie jak w starych grach na automatach
      const isFlashing = nestHitFlashes[nest.id] && nestHitFlashes[nest.id] > 0;

      // Kamień pod legowiskiem (2.5x większy) - też miga
      ctx.save();
      ctx.font = '75px "Apple Color Emoji", "Segoe UI Emoji"'; // 30px * 2.5 = 75px
      if (isFlashing) {
        ctx.globalAlpha = 0.9;
        // removed shadowBlur
        // removed shadowColor
      } else {
        ctx.globalAlpha = 0.8;
      }
      ctx.fillText('🪨', s.x, s.y + 20); // Przesunięty w dół
      ctx.globalAlpha = 1;
      ctx.restore();

      // Emoji legowiska (zwierzę) - miga przy trafieniu
      ctx.font = '60px "Apple Color Emoji", "Segoe UI Emoji"';
      const enemyDef = ENEMIES[nest.type];
      const nestEmoji = enemyDef ? enemyDef.emoji : '🏰';

      if (isFlashing) {
        // Klasyczne mruganie - biały flash
        ctx.save();
        ctx.globalAlpha = 0.9;
        // removed shadowBlur
        // removed shadowColor
        ctx.fillText(nestEmoji, s.x, s.y);
        ctx.restore();
      } else {
        ctx.fillText(nestEmoji, s.x, s.y);
      }

      // Show HP bar (zawsze widoczny)
      const hpPercent = nest.hp / nest.hpMax;
      const barWidth = 50;
      const barHeight = 6;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(s.x - barWidth / 2, s.y - 50, barWidth, barHeight);
      ctx.fillStyle = hpPercent > 0.5 ? '#4ade80' : hpPercent > 0.25 ? '#fbbf24' : '#ef4444';
      ctx.fillRect(s.x - barWidth / 2, s.y - 50, barWidth * hpPercent, barHeight);
      ctx.fillStyle = '#e6e6e6';
    });
  }

  // pickups - optimized rendering z animacją przyciągania
  ctx.font = '28px "Apple Color Emoji", "Segoe UI Emoji"';
  const playerScreenPos = worldToScreen(state.pos.x, state.pos.y);
  const magnetRange = state.level + state.pickupMagnetRange;

  for (const p of state.pickups) {
    const spec = PICKUPS[p.kind];
    if (!spec) continue; // Skip if pickup kind doesn't exist
    const emo = spec.emoji;

    renderWithWrapAround(p.x, p.y, (s) => {
      // Animacja przyciągania - rysuj linię i efekt świecenia
      if (p.beingPulled === true) {
        // Oblicz odległość na ekranie
        let dx = s.x - playerScreenPos.x, dy = s.y - playerScreenPos.y;
        const screenDist = Math.hypot(dx, dy);

        // Rysuj animację dla wszystkich przyciąganych przedmiotów
        if (screenDist > 0 && screenDist < 1000) { // Ograniczenie do rozsądnej odległości na ekranie
          // Rysuj świecącą linię między graczem a przedmiotem
          ctx.save();
          // Alpha zależy od odległości - im bliżej, tym jaśniej
          const maxDist = Math.max(magnetRange * 2, 200); // Maksymalna odległość dla animacji
          const alpha = Math.max(0.3, 1 - (screenDist / maxDist));
          ctx.globalAlpha = alpha * 0.8; // Zwiększona widoczność
          ctx.strokeStyle = '#4ade80'; // Zielony kolor
          ctx.lineWidth = 3; // Grubsza linia dla lepszej widoczności
          // removed shadowBlur
          // removed shadowColor
          ctx.beginPath();
          ctx.moveTo(playerScreenPos.x, playerScreenPos.y);
          ctx.lineTo(s.x, s.y);
          ctx.stroke();

          // Dodatkowy efekt wzdłuż linii
          const particleCount = Math.max(5, Math.floor(screenDist / 15));
          const timeOffset = (Date.now() % 2000) / 2000; // Animacja w pętli 2 sekundy
          for (let i = 0; i < particleCount; i++) {
            const t = ((i / particleCount) + timeOffset) % 1; // Cząsteczki poruszają się wzdłuż linii
            const px = playerScreenPos.x + dx * t;
            const py = playerScreenPos.y + dy * t;
            ctx.globalAlpha = alpha * 1.0;
            ctx.fillStyle = '#4ade80';
            // removed shadowBlur
            ctx.beginPath();
            ctx.arc(px, py, 3, 0, Math.PI * 2);
            ctx.fill();
          }

          ctx.restore();

          // Efekt świecenia wokół przyciąganego przedmiotu (rysuj przed normalnym pickupem)
          ctx.save();
          ctx.globalAlpha = alpha * 0.6;
          // removed shadowBlur
          // removed shadowColor
          ctx.fillText(emo, s.x, s.y);
          ctx.restore();
        }
      }

      // Normalny pickup (zawsze rysuj, nawet jeśli beingPulled)
      ctx.fillText(emo, s.x, s.y);
    });
  }

  // Rysuj efekt wizualny zasięgu przyciągania wokół gracza (opcjonalnie, tylko jeśli magnetRange > 0)
  if (magnetRange > 0) {
    ctx.save();
    const time = Date.now() / 1000;
    const pulseAlpha = 0.1 + Math.sin(time * 3) * 0.05; // Pulsujący efekt
    ctx.globalAlpha = pulseAlpha;
    ctx.strokeStyle = '#4ade80';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.arc(playerScreenPos.x, playerScreenPos.y, magnetRange, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  // enemies - optimized rendering with hit flash
  ctx.font = '30px "Apple Color Emoji", "Segoe UI Emoji"';
  for (const e of state.enemies) {
    renderWithWrapAround(e.x, e.y, (s) => {
      // Hit flash effect
      if (enemyHitFlashes[e.id] && enemyHitFlashes[e.id] > 0) {
        ctx.save();
        ctx.globalAlpha = 0.8;
        // removed shadowBlur
        // removed shadowColor
        ctx.fillText(e.emoji, s.x, s.y);
        ctx.restore();
      } else {
        ctx.fillText(e.emoji, s.x, s.y);
      }

      // Show HP bar (ulepszony - większy, gradient, lepszy kontrast)
      let maxHP = e.hpMax || e.hp;
      if (!e.hpMax) {
        const enemyDef = ENEMIES.find(en => en.emoji === e.emoji);
        if (enemyDef) maxHP = enemyDef.hp;
      }
      const hpPercent = e.hp / maxHP;
      const barWidth = 40; // Większy pasek
      const barHeight = 6; // Wyższy pasek

      // Background
      ctx.fillStyle = 'rgba(0,0,0,0.8)';
      ctx.fillRect(s.x - barWidth / 2 - 1, s.y - 30 - 1, barWidth + 2, barHeight + 2);

      // HP bar with gradient
      const gradient = ctx.createLinearGradient(s.x - barWidth / 2, s.y - 30, s.x + barWidth / 2, s.y - 30);
      if (hpPercent > 0.6) {
        gradient.addColorStop(0, '#4ade80');
        gradient.addColorStop(1, '#10b981');
      } else if (hpPercent > 0.3) {
        gradient.addColorStop(0, '#fbbf24');
        gradient.addColorStop(1, '#f59e0b');
      } else {
        gradient.addColorStop(0, '#ef4444');
        gradient.addColorStop(1, '#dc2626');
      }
      ctx.fillStyle = gradient;
      ctx.fillRect(s.x - barWidth / 2, s.y - 30, barWidth * hpPercent, barHeight);

      // Border
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 1;
      ctx.strokeRect(s.x - barWidth / 2, s.y - 30, barWidth, barHeight);

      ctx.fillStyle = '#e6e6e6';
    });
  }

  // Children - optimized rendering
  // Rozmiar dziecka = 0.5 * rozmiar gracza
  const playerFontSizeForChild = 34 + (state.level * 0.25);
  const childFontSize = playerFontSizeForChild * 0.5;
  ctx.font = `${childFontSize}px "Apple Color Emoji", "Segoe UI Emoji"`;
  for (const child of state.children) {
    renderWithWrapAround(child.x, child.y, (s) => {
      ctx.fillText(child.emoji, s.x, s.y);

      // Render child melee spin (naśladuje gracza)
      if (child.meleeSpin) {
        const m = child.meleeSpin;
        const prog = clamp(m.t / m.dur, 0, 1);
        const startAng = m.startAngle || 0;
        const ang = startAng + prog * 2 * Math.PI;
        const r = 60 * 0.5; // Promień miecza dziecka (50% rozmiaru gracza)
        const sx = s.x + Math.cos(ang) * r;
        const sy = s.y + Math.sin(ang) * r;
        const swordFontSize = childFontSize * 0.8; // Miecz nieco mniejszy niż dziecko
        ctx.font = `${swordFontSize}px "Apple Color Emoji", "Segoe UI Emoji"`;
        ctx.fillText('⚔️', sx, sy);
        ctx.font = `${childFontSize}px "Apple Color Emoji", "Segoe UI Emoji"`; // Przywróć rozmiar
      }
    });
  }

  // Woman NPC - optimized rendering
  ctx.font = '32px "Apple Color Emoji", "Segoe UI Emoji"';
  renderWithWrapAround(state.woman.x, state.woman.y, (s) => {
    ctx.fillText('👩', s.x, s.y);
  });

  // Wizard NPC - optimized rendering
  ctx.font = '32px "Apple Color Emoji", "Segoe UI Emoji"';
  renderWithWrapAround(state.wizard.x, state.wizard.y, (s) => {
    ctx.fillText('🧙', s.x, s.y);
  });

  // projectiles - optimized rendering with enhanced trail effect
  // Rozmiar projectile = bazowy (24px) + 1px * poziom
  const projectileFontSize = 24 + state.level;
  ctx.font = `${projectileFontSize}px "Apple Color Emoji", "Segoe UI Emoji"`;
  for (const pr of state.projectiles) {
    renderWithWrapAround(pr.x, pr.y, (s) => {
      // projectiles - optimized rendering with simplified trail
      if (pr.trail && pr.trail.length > 1) {
        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        // Draw main trail path once
        ctx.beginPath();
        const startPos = worldToScreen(pr.trail[0].x, pr.trail[0].y);
        ctx.moveTo(startPos.x, startPos.y);
        
        for (let i = 1; i < pr.trail.length; i++) {
          const tp = worldToScreen(pr.trail[i].x, pr.trail[i].y);
          ctx.lineTo(tp.x, tp.y);
        }
        
        // Use a simple colored line instead of per-segment state changes
        ctx.globalAlpha = 0.4;
        ctx.strokeStyle = pr.isPoison ? '#10b981' : '#3b82f6';
        ctx.lineWidth = 4;
        ctx.stroke();
        ctx.restore();
      }

      // Strzała z rotacją
      ctx.save();
      ctx.translate(s.x, s.y);
      if (pr.rotation !== undefined) {
        ctx.rotate(pr.rotation);
      }

      // Główna strzała
      ctx.fillText(pr.emoji, 0, 0);
      ctx.restore();
    });
  }

  // player — mężczyzna z wąsami (używamy 🧔 jako styl moustache) lub reakcja emoji
  // Rozmiar gracza = bazowy (34px) + 1px * poziom
  const heroEmoji = state.playerReaction.emoji || '🧔';
  const ps = worldToScreen(state.pos.x, state.pos.y);
  const playerFontSize = 34 + state.level;
  ctx.font = `${playerFontSize}px "Apple Color Emoji", "Segoe UI Emoji"`;
  ctx.fillText(heroEmoji, ps.x, ps.y);

  // miecz w wirze z slash effect
  if (state.meleeSpin) {
    const m = state.meleeSpin;
    const prog = clamp(m.t / m.dur, 0, 1);
    const startAng = m.startAngle || 0;
    const ang = startAng + prog * 2 * Math.PI;
    const r = 90;
    const sx = ps.x + Math.cos(ang) * r;
    const sy = ps.y + Math.sin(ang) * r;

    // Slash trail effect
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    // removed shadowBlur
    // removed shadowColor
    const prevAng = startAng + (prog - 0.1) * 2 * Math.PI;
    const prevSx = ps.x + Math.cos(prevAng) * r;
    const prevSy = ps.y + Math.sin(prevAng) * r;
    ctx.beginPath();
    ctx.moveTo(prevSx, prevSy);
    ctx.lineTo(sx, sy);
    ctx.stroke();
    ctx.restore();

    // Rozmiar miecza = bazowy (28px) + 1px * poziom
    const swordFontSize = 28 + state.level;
    ctx.font = `${swordFontSize}px "Apple Color Emoji", "Segoe UI Emoji"`;
    ctx.save();
    // removed shadowBlur
    // removed shadowColor
    ctx.fillText('⚔️', sx, sy);
    ctx.restore();
  }

  // Particles rendering
  for (const p of particles) {
    const s = worldToScreen(p.x, p.y);
    ctx.save();
    const alpha = clamp(p.t / 800, 0, 1);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    // removed shadowBlur
    // removed shadowColor
    ctx.beginPath();
    ctx.arc(s.x, s.y, p.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Ulepszone teksty pływające
  for (let i = fly.length - 1; i >= 0; i--) {
    const f = fly[i];
    const s = worldToScreen(f.x, f.y);
    if (f.t <= 0) { fly.splice(i, 1); continue; }
    ctx.save();
    ctx.globalAlpha = f.alpha || clamp(f.t / 1000, 0, 1);
    ctx.fillStyle = f.color || '#fff';
    ctx.font = `bold ${(f.size || 20) * (f.scale || 1)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // removed shadowBlur
    // removed shadowColor
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 2;
    ctx.strokeText(f.msg, s.x, s.y - (1000 - f.t) / 20);
    ctx.fillText(f.msg, s.x, s.y - (1000 - f.t) / 20);
    ctx.restore();
  }

  // Ostrzeżenie o niskim zdrowiu - duży migający komunikat na środku ekranu
  if (state.lowHPWarning && state.lowHPWarning.active) {
    ctx.save();
    // Oblicz alpha dla migania (0.3 - 1.0)
    const blinkPhase = (state.lowHPWarning.blinkTimer / state.lowHPWarning.blinkSpeed) * Math.PI * 2;
    const alpha = 0.3 + (Math.sin(blinkPhase) + 1) / 2 * 0.7; // Od 0.3 do 1.0

    // Tło z półprzezroczystym czarnym overlay
    ctx.fillStyle = `rgba(0, 0, 0, ${alpha * 0.6})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Duży komunikat na środku ekranu
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    // Tło dla komunikatu
    const padding = 40;
    const text = '⚠️ NISKIE ZDROWIE! ⚠️';
    const subText = 'Ulecz się jabłkami lub mięsiwem!';

    ctx.font = 'bold 48px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Zmierz tekst - najpierw główny tekst
    const textMetrics = ctx.measureText(text);
    // Zmierz podtekst z odpowiednim fontem
    ctx.font = 'bold 28px system-ui, sans-serif';
    const subTextMetrics = ctx.measureText(subText);
    const textWidth = Math.max(textMetrics.width, subTextMetrics.width);
    const textHeight = 60 + 40; // Główny tekst + odstęp + podtekst

    // Rysuj tło komunikatu z gradientem
    const gradient = ctx.createLinearGradient(centerX - textWidth / 2 - padding, centerY - textHeight / 2 - padding, centerX + textWidth / 2 + padding, centerY + textHeight / 2 + padding);
    gradient.addColorStop(0, `rgba(239, 68, 68, ${alpha * 0.9})`);
    gradient.addColorStop(1, `rgba(220, 38, 38, ${alpha * 0.9})`);

    ctx.fillStyle = gradient;
    ctx.fillRect(centerX - textWidth / 2 - padding, centerY - textHeight / 2 - padding, textWidth + padding * 2, textHeight + padding * 2);

    // Obramowanie
    ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.lineWidth = 4;
    ctx.strokeRect(centerX - textWidth / 2 - padding, centerY - textHeight / 2 - padding, textWidth + padding * 2, textHeight + padding * 2);

    // Główny tekst
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.font = 'bold 48px system-ui, sans-serif';
    // removed shadowBlur
    // removed shadowColor
    ctx.fillText(text, centerX, centerY - 20);

    // Podtekst
    ctx.font = 'bold 28px system-ui, sans-serif';
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.9})`;
    // removed shadowBlur
    // removed shadowColor
    ctx.fillText(subText, centerX, centerY + 40);

    ctx.restore();
  }

  // toasty
  ctx.save(); ctx.font = '16px system-ui, sans-serif'; ctx.textAlign = 'center'; let y = canvas.height - 26; for (let i = toasts.length - 1; i >= 0; i--) { const t = toasts[i]; t.t -= 16; if (t.t <= 0) { toasts.splice(i, 1); continue; } ctx.globalAlpha = Math.min(1, t.t / 400); ctx.fillStyle = '#e6e6e6'; ctx.fillText(t.msg, canvas.width / 2, y); y -= 20; } ctx.restore();

  // Mini-mapa
  drawMiniMap();

  // Restore screen shake transform
  ctx.restore();
}

// Funkcja rysująca mini-mapę
function drawMiniMap() {
  if (!minimapCtx || !minimapCanvas) return;

  const mapSize = minimapCanvas.width;
  const worldWidth = state.world.width;
  const worldHeight = state.world.height;

  // Wyczyść mini-mapę
  minimapCtx.fillStyle = 'rgba(0,0,0,0.6)';
  minimapCtx.fillRect(0, 0, mapSize, mapSize);

  // Funkcja konwersji współrzędnych świata na mini-mapę
  const worldToMinimap = (wx, wy) => {
    const x = (wx / worldWidth) * mapSize;
    const y = (wy / worldHeight) * mapSize;
    return { x, y };
  };

  // Rysuj dom
  const homePos = worldToMinimap(state.home.x, state.home.y);
  minimapCtx.font = '16px "Apple Color Emoji", "Segoe UI Emoji"';
  minimapCtx.fillText('🏠', homePos.x - 8, homePos.y + 8);

  // Rysuj niewiastę
  const womanPos = worldToMinimap(state.woman.x, state.woman.y);
  minimapCtx.font = '14px "Apple Color Emoji", "Segoe UI Emoji"';
  minimapCtx.fillText('👩', womanPos.x - 7, womanPos.y + 7);

  // Rysuj czarodzieja
  const wizardPos = worldToMinimap(state.wizard.x, state.wizard.y);
  minimapCtx.font = '14px "Apple Color Emoji", "Segoe UI Emoji"';
  minimapCtx.fillText('🧙', wizardPos.x - 7, wizardPos.y + 7);

  // Rysuj siedliska mobów (jaskinie)
  for (const nest of state.nests) {
    const nestPos = worldToMinimap(nest.x, nest.y);
    const enemyDef = ENEMIES[nest.type];
    if (enemyDef) {
      // Rysuj emoji jaskini (emoji wroga)
      minimapCtx.font = '10px "Apple Color Emoji", "Segoe UI Emoji"';
      minimapCtx.fillText(enemyDef.emoji, nestPos.x - 5, nestPos.y + 5);
    } else {
      // Fallback - kamień
      minimapCtx.font = '10px "Apple Color Emoji", "Segoe UI Emoji"';
      minimapCtx.fillText('🪨', nestPos.x - 5, nestPos.y + 5);
    }
  }

  // Rysuj megabestie (większe, czerwone/pomarańczowe)
  for (const mb of state.megabeasts) {
    const mbPos = worldToMinimap(mb.x, mb.y);
    const enemyDef = ENEMIES[mb.type];
    if (enemyDef) {
      if (mb.isHiperUltra) {
        // Hiper Ultra megabestia - 2x większa niż Ultra na minimapie (21px * 2 = 42px), czerwona
        minimapCtx.font = '42px "Apple Color Emoji", "Segoe UI Emoji"';
        // removed shadowBlur
        // removed shadowColor
        // Hiper Ultra: 2 emoji (lustrzane odbicie) dla wilka, dzika i żmii - stykają się tyłami głów
        if (mb.type !== 3) {
          minimapCtx.fillText(enemyDef.emoji, mbPos.x - 35, mbPos.y + 20); // Lewe emoji (patrzy w lewo)
          // Prawe emoji - odbite lustrzanie (patrzy w prawo) - większy offset aby tyły głów się stykały
          minimapCtx.save();
          minimapCtx.translate(mbPos.x + 35, mbPos.y + 20);
          minimapCtx.scale(-1, 1); // Odbicie poziome
          minimapCtx.fillText(enemyDef.emoji, 0, 0);
          minimapCtx.restore();
        } else {
          // Trup - poziomo jak królowa z kart (oba patrzą w lewo)
          minimapCtx.fillText(enemyDef.emoji, mbPos.x - 20, mbPos.y + 20); // Lewe emoji
          minimapCtx.fillText(enemyDef.emoji, mbPos.x + 20, mbPos.y + 20); // Prawe emoji
        }
      } else if (mb.isUltra) {
        // Ultra megabestia - 1.5x większa na minimapie (14px * 1.5 = 21px), pomarańczowa
        minimapCtx.font = '21px "Apple Color Emoji", "Segoe UI Emoji"';
        // removed shadowBlur
        // removed shadowColor
        minimapCtx.fillText(enemyDef.emoji, mbPos.x - 10, mbPos.y + 10);
      } else {
        // Normalna megabestia - czerwona
        minimapCtx.font = '14px "Apple Color Emoji", "Segoe UI Emoji"';
        // removed shadowBlur
        // removed shadowColor
        minimapCtx.fillText(enemyDef.emoji, mbPos.x - 7, mbPos.y + 7);
      }
      // removed shadowBlur
    }
  }

  // Rysuj gracza (środek)
  const playerPos = worldToMinimap(state.pos.x, state.pos.y);
  minimapCtx.fillStyle = '#4ade80';
  minimapCtx.beginPath();
  minimapCtx.arc(playerPos.x, playerPos.y, 3, 0, Math.PI * 2);
  minimapCtx.fill();
}

// === Main ===
let last = performance.now();
function loop() {
  const now = performance.now();
  const dt = Math.min(now - last, 50); // Cap dt to prevent huge jumps
  last = now;
  step(dt);
  draw();
  updateHUD(); // Now throttled internally
  requestAnimationFrame(loop);
}

// Start screen functions
function showStartScreen() {
  if (questModal) {
    const startScreenLives = document.getElementById('startScreenLives');
    const startScreenLevel = document.getElementById('startScreenLevel');
    const startScreenSection = document.getElementById('startScreenSection');
    const startBtnContainer = document.getElementById('startBtnContainer');

    if (startScreenLives) startScreenLives.textContent = state.lives;
    if (startScreenLevel) startScreenLevel.textContent = state.level;
    if (startScreenSection) startScreenSection.style.display = 'block'; // Pokaż start screen
    if (startBtnContainer) startBtnContainer.style.display = 'block'; // Pokaż przycisk startu

    questModal.style.display = 'flex';
    state.paused = true;

    // Aktualizuj status questów
    updateQuestLog();
  }
}

function hideStartScreen() {
  if (questModal) {
    const startBtnContainer = document.getElementById('startBtnContainer');
    if (startBtnContainer) startBtnContainer.style.display = 'none';

    questModal.style.display = 'none';
    state.paused = false;
  }
}

if (startGameBtn) {
  startGameBtn.addEventListener('click', () => {
    hideStartScreen();
  });
}


// Show start screen on game load
showStartScreen();

// === Virtual Joystick ===
const joystickEl = document.getElementById('joystick');
const joystickStick = document.getElementById('joystickStick');
const actionBtnA = document.getElementById('actionBtnA');
const actionBtnB = document.getElementById('actionBtnB');

if (joystickEl && joystickStick) {
  function updateJoystickBase() {
    const rect = joystickEl.getBoundingClientRect();
    joystick.baseX = rect.left + rect.width / 2;
    joystick.baseY = rect.top + rect.height / 2;
  }
  updateJoystickBase();
  window.addEventListener('resize', updateJoystickBase);

  function updateJoystickPosition(clientX, clientY) {
    const dx = clientX - joystick.baseX;
    const dy = clientY - joystick.baseY;
    const distance = Math.hypot(dx, dy);

    if (distance > joystick.maxDistance) {
      const angle = Math.atan2(dy, dx);
      joystick.stickX = Math.cos(angle) * joystick.maxDistance;
      joystick.stickY = Math.sin(angle) * joystick.maxDistance;
    } else {
      joystick.stickX = dx;
      joystick.stickY = dy;
    }

    joystickStick.style.transform = `translate(calc(-50% + ${joystick.stickX}px), calc(-50% + ${joystick.stickY}px))`;

    // Normalizuj do -1..1
    const normalizedX = joystick.stickX / joystick.maxDistance;
    const normalizedY = joystick.stickY / joystick.maxDistance;

    // Ustaw klawisze wirtualne
    keys['arrowleft'] = normalizedX < -0.3;
    keys['arrowright'] = normalizedX > 0.3;
    keys['arrowup'] = normalizedY < -0.3;
    keys['arrowdown'] = normalizedY > 0.3;
  }

  function resetJoystick() {
    joystick.active = false;
    joystick.touchId = null;
    joystick.stickX = 0;
    joystick.stickY = 0;
    if (joystickStick) {
      joystickStick.style.transform = 'translate(-50%, -50%)';
    }
    keys['arrowleft'] = false;
    keys['arrowright'] = false;
    keys['arrowup'] = false;
    keys['arrowdown'] = false;
  }

  joystickEl.addEventListener('touchstart', (e) => {
    if (joystick.active) return;
    e.preventDefault();
    const touch = e.touches[0];
    if (touch) {
      joystick.active = true;
      joystick.touchId = touch.identifier;
      updateJoystickPosition(touch.clientX, touch.clientY);
    }
  });

  joystickEl.addEventListener('touchmove', (e) => {
    if (!joystick.active) return;
    e.preventDefault();
    const touch = Array.from(e.touches).find(t => t.identifier === joystick.touchId);
    if (touch) {
      updateJoystickPosition(touch.clientX, touch.clientY);
    } else {
      // Touch zniknął - zresetuj
      resetJoystick();
    }
  });

  joystickEl.addEventListener('touchend', (e) => {
    if (!joystick.active) return;
    e.preventDefault();
    const touch = Array.from(e.changedTouches).find(t => t.identifier === joystick.touchId);
    if (touch) {
      resetJoystick();
    }
  });

  joystickEl.addEventListener('touchcancel', (e) => {
    e.preventDefault();
    resetJoystick();
  });

  // Dodatkowe zabezpieczenie - globalne listenery dla touchcancel/touchend
  // na wypadek gdyby touch został przerwany poza obszarem gałki
  document.addEventListener('touchend', (e) => {
    if (joystick.active && joystick.touchId !== null) {
      const touch = Array.from(e.changedTouches).find(t => t.identifier === joystick.touchId);
      if (touch) {
        resetJoystick();
      }
    }
  }, { passive: true });

  document.addEventListener('touchcancel', (e) => {
    if (joystick.active && joystick.touchId !== null) {
      const touch = Array.from(e.changedTouches).find(t => t.identifier === joystick.touchId);
      if (touch) {
        resetJoystick();
      }
    }
  }, { passive: true });

  // Dodatkowe zabezpieczenie - reset przy starcie gry lub pauzie
  // Sprawdzaj co klatkę czy touch nadal istnieje
  setInterval(() => {
    if (joystick.active && joystick.touchId !== null) {
      // Sprawdź czy touch nadal istnieje
      const hasTouch = Array.from(document.querySelectorAll('*')).some(() => {
        // Sprawdź czy są jakieś aktywne touchy
        return false; // Uproszczone - zawsze resetuj jeśli jest problem
      });
      // Jeśli gałka jest aktywna ale nie ma ruchu przez dłuższy czas, zresetuj
      // (to będzie obsłużone przez normalne touchend/touchcancel)
    }
  }, 100);
}

// === Action Buttons ===
if (actionBtnA) {
  actionBtnA.addEventListener('touchstart', (e) => {
    e.preventDefault();
    startMeleeSpin();
  });
  actionBtnA.addEventListener('click', () => {
    startMeleeSpin();
  });
}

if (actionBtnB) {
  actionBtnB.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const w = screenToWorld(canvas.width / 2, canvas.height / 2);
    fireArrow(null);
  });
  actionBtnB.addEventListener('click', () => {
    const w = screenToWorld(canvas.width / 2, canvas.height / 2);
    fireArrow(null);
  });
}

// init
spawnInitial();
requestAnimationFrame(loop);
updateHUD();
