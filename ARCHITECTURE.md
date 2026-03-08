# 🏗️ Game Architecture & Evolution Path

This document outlines the architectural evolution of Chrobry RPG to support the features listed in `BACKLOG.md`. The goal is to scale from a simple prototype to a complex multiplayer RPG using **Vanilla JavaScript** (no frameworks like React/Vue/phaser).

---

## 🟢 1. MINI Architecture (Refactoring & Cleanup)
**Goal:** Organize the codebase to make "Quick Wins" (Skins, Funny Weapons, God Mode) easy to implement without breaking the game.
**Focus:** Splitting the Monoliths.

### Current State (The Problem)
*   **`game.js` (God File):** Contains logic, rendering, input, state, and entity definitions all in one 5000+ line file.
*   **`index.html`:** Contains excessive UI markup (~900 lines) that handles game overlays, inventory, and HUD.

### Proposed Structure (ES Modules)
Using native `<script type="module">` support.

```
/src
  ├── /core
  │   ├── main.js         # Entry point, loop setup
  │   ├── state.js        # Global state (HP, Level, Inventory variables)
  │   └── input.js        # Keyboard & Mouse listeners
  ├── /entities
  │   ├── player.js       # Player logic & rendering
  │   ├── enemy.js        # Enemy classes (Wolf, Snake)
  │   └── particles.js    # Visual effects
  ├── /systems
  │   ├── combat.js       # Hit detection, damage calculation
  │   └── rendering.js    # Canvas context wrapper
  └── /ui
      ├── hud.js          # Updating HP/Mana bars
      └── inventory.js    # Inventory DOM manipulation
index.html                # Just the Canvas container + minimal UI wrappers
styles.css                # Visuals
```

### Key Changes
1.  **Extract UI to JS:** Instead of 900 lines of static HTML, generate repetitive UI elements (like inventory slots) via `inventory.js`.
2.  **Separate Loop:** Move the requestAnimationFrame loop to `main.js`.
3.  **Config Object:** Create `config.js` for constants like `PLAYER_SPEED`, `ENEMY_HP`, making balancing easier.

---

## 🟡 2. MID Architecture (Composition & Scalability)
**Goal:** Support complex features like **Crafting, Farming, Quests, and Biomes**.
**Focus:** Decoupling and Event-Driven Design.

### Design Pattern: Component-Entity-Systems (Lite)
Instead of inheritance (`class Dragon extends Enemy`), use composition or a lightweight ECS to mix behaviors.

### New Modules
1.  **Event Bus (`events.js`):**
    *   Allows disparate systems to talk without dependencies.
    *   *Example:* `CombatSystem` emits `ENEMY_KILLED`. `QuestSystem` hears it and updates "Kill 10 Wolves". `AudioSystem` hears it and plays "death_sound.mp3".
2.  **World Manager (`world.js`):**
    *   Handles **Biomes** and **Chunking** (for the "Infinite World" foundation).
    *   Manages the "Pacman wrap-around" logic or transitions to new maps.
3.  **Item System (`items.js`):**
    *   Database of all items (IDs, names, stats, sprites).
    *   **Crafting:** Logic for `Recipe(Wood + Stone = Sword)`.
4.  **Save System (`storage.js`):**
    *   Abstracts `localStorage`. Prepares for Cloud Save.
    *   Serializes the `State` object to JSON.

### Structure Update
```
/src
  ├── /data
  │   ├── items.json      # Definitions for weapons, skins, resources
  │   └── recipes.json    # Crafting rules
  ├── /managers
  │   ├── EventBus.js     # Pub/Sub system
  │   ├── SaveManager.js  # Persistence
  │   └── SoundManager.js # Audio handling
  ...
```

---

## 🔴 3. MAX Architecture (Multiplayer & Professional)
**Goal:** Real-time **Multiplayer, Village Building, and Infinite Procedural Worlds**.
**Focus:** Client-Server separation and Performance.

### Design Pattern: Client-Server / Authoritative State
The browser (Client) becomes just a visualizer. The logic moves to a Server (Node.js).

### 1. Backend (Node.js + WebSocket)
*   **Socket.io / WS:** Handles real-time positional updates (player coordinates).
*   **Authoritative Logic:** The server decides if a player hit an enemy (prevents cheating).
*   **Database (SQLite/Redis):** Stores User Accounts, Inventory, and World Builds.

### 2. Frontend Optimizations
*   **Render Loop Separation:** `Update()` (Logic) runs at fixed 60 TPS. `Draw()` (Render) runs as fast as possible (interpolated).
*   **View Culling:** Only render entities visible on screen (vital for "Zombie Apocalypse" optimization).
*   **Asset Loader:** Preload all images/sounds before game start to prevent lag.

### 3. Procedural Generation Engine
*   **Perlin Noise:** Generate infinite terrain (Grass, Water, Mountains) on the fly.
*   **Seed System:** Share a "seed" (e.g., "CHROBRY") to generate the same world for different players.

### 4. Multiplayer Sync (Chunking)
*   Divide the world into 16x16 blocks (Chunks).
*   Only subscribe players to updates in their current and surrounding chunks (AOI - Area of Interest).

---
*Architecture Guide by Antigravity Agent*
