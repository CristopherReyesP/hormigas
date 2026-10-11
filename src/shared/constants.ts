export const TILE_SIZE = 32; // pixels per tile
export const WORLD_WIDTH = 120; // tiles
export const WORLD_HEIGHT = 90; // tiles

// Reference canvas size, NOT derived from world size. The real canvas follows the
// window (GameCanvas); this is only its size before the first measure, a test
// fallback, and the design size screen-space overlays scale from (screenPixelScale).
export const CANVAS_WIDTH = 800;
export const CANVAS_HEIGHT = 600;

export const FIXED_TIMESTEP = 1000 / 60; // 60 ticks per second (in ms)
export const MAX_DELTA = 250; // max frame time to prevent spiral of death

export const PHEROMONE_DECAY_RATE = 0.998; // per tick
export const PHEROMONE_DIFFUSION_RATE = 0.01;
export const PHEROMONE_MAX = 255;

export const ANT_SPEED = 2.0; // tiles per second
export const ANT_MAX_HUNGER = 1000; // ticks before starving
export const ANT_HARVEST_RANGE = 1.5; // tiles
export const ANT_DEPOSIT_RANGE = 1.5; // tiles

export const INITIAL_ANTS = 10;
export const INITIAL_FOOD_CLUSTERS = 12;
export const FOOD_PER_CLUSTER_MIN = 3;
export const FOOD_PER_CLUSTER_MAX = 8;
export const FOOD_AMOUNT_MIN = 50;
export const FOOD_AMOUNT_MAX = 200;

export const BREED_COST_WORKER = 20;
export const BREED_COST_SOLDIER = 35;
export const BREED_COST_SCOUT = 25;
export const BREED_COST_NURSE = 15;
export const BREED_TIME_WORKER = 5;   // seconds
export const BREED_TIME_SOLDIER = 8;
export const BREED_TIME_SCOUT = 6;
export const BREED_TIME_NURSE = 4;
export const SCOUT_VISION_RANGE = 10; // tiles (combat/detection range)
export const FOG_REVEAL_MULTIPLIER = 0.5; // fog reveal = visionRange * this (separate from combat)
export const SCOUT_SPEED_MULTIPLIER = 1.5;
export const FOOD_RESPAWN_INTERVAL = 30; // seconds — new food clusters appear

// Role-specific stats table
export const ROLE_STATS = {
  worker:   { health: 80,  damage: 3,  hungerMax: 1000, hungerDecay: 1.0, carryCapacity: 15, speedMultiplier: 1.0,  visionRange: 10, carrySpeedPenalty: 0.8  },
  soldier:  { health: 150, damage: 8,  hungerMax: 1200, hungerDecay: 1.2, carryCapacity: 8,  speedMultiplier: 0.85, visionRange: 8,  carrySpeedPenalty: 0.9  },
  scout:    { health: 60,  damage: 0,  hungerMax: 800,  hungerDecay: 1.5, carryCapacity: 5,  speedMultiplier: 1.5,  visionRange: 10, carrySpeedPenalty: 0.7  },
  nurse:    { health: 40,  damage: 0,  hungerMax: 600,  hungerDecay: 0.8, carryCapacity: 10, speedMultiplier: 0.7,  visionRange: 6,  carrySpeedPenalty: 0.9  },
  // Defenders: underground sentinels — tankier than soldiers, slower, bound to defense areas
  defender: { health: 200, damage: 10, hungerMax: 1000, hungerDecay: 0.9, carryCapacity: 4,  speedMultiplier: 0.75, visionRange: 7,  carrySpeedPenalty: 1.0  },
} as const;

// Mushroom food type constants
export const MUSHROOM_SPAWN_CHANCE = 0.3;
export const MUSHROOM_CLUSTER_MIN = 1;
export const MUSHROOM_CLUSTER_MAX = 3;
export const MUSHROOM_AMOUNT_MIN = 20;
export const MUSHROOM_AMOUNT_MAX = 80;
export const MUSHROOM_MIN_NEST_DISTANCE = 15;
export const MUSHROOM_NUTRITION_MULTIPLIER = 2.0;
export const MUSHROOM_PREFERENCE_MULTIPLIER = 0.5;

// Beetle stats
export const BEETLE_STATS = {
  health: 240,
  damage: 12,
  speed: 0.9,
  visionRange: 6,
  attackRange: 1.2,
  attackCooldown: 1.5,
  size: 0.55,
} as const;

// Beetle den stats
export const BEETLE_DEN_STATS = {
  health: 800,
  spawnCooldown: 45,
  maxBeetles: 3,
  size: 0.8,
} as const;

// Beetle spawning
export const INITIAL_BEETLE_DENS = 2;
export const BEETLE_DEN_MIN_NEST_DISTANCE = 30;
export const BEETLE_EDGE_SPAWN_INTERVAL = 60;
export const BEETLE_EDGE_SPAWN_CHANCE = 0.5;
export const MAX_TOTAL_BEETLES = 8;

// Beetle meat
export const BEETLE_MEAT_AMOUNT = 60;
export const BEETLE_MEAT_NUTRITION_MULTIPLIER = 3.0;

// Soldier combat
export const SOLDIER_ATTACK_RANGE = 1.2;
export const SOLDIER_ATTACK_COOLDOWN = 1.0;
export const SOLDIER_PATROL_RADIUS = 8;
export const SOLDIER_CHASE_RANGE = 12;

// Danger pheromone
export const DANGER_PHEROMONE_EMIT_STRENGTH = 150;
export const DANGER_PHEROMONE_TRAIL_STRENGTH = 80;
export const DANGER_PHEROMONE_PASSIVE_STRENGTH = 30;
export const DANGER_PHEROMONE_FLEE_THRESHOLD = 2;
export const SOLDIER_DANGER_CHASE_THRESHOLD = 20; // soldiers only chase STRONG pheromone (~8s window vs 30s)
export const SCOUT_FLEE_DISTANCE = 15;
export const SCOUT_BEETLE_DETECT_RANGE = 12;

// Combat behavior thresholds
export const SCOUT_FLEE_HEALTH_RATIO = 0.4; // flee at 40% health (~3 beetle hits)
export const WORKER_FIGHT_RANGE = 10; // workers fight within 10 tiles of nest

// Flanking — ants swarming the same target hit harder (+15% per ally, up to 5)
export const FLANKING_BONUS_PER_ALLY = 0.15;
export const FLANKING_MAX_ALLIES = 5;

// Underground invasions (survival waves). One wave per night, launched at nightfall.
// Wave sizes and their mix come from waveComposition() (src/game/run/waveComposition.ts).
export const INVASION_BOSS_NIGHT = 7;  // the first night milestone: the Crystal Queen attacks, once per run (rival Colmena de Cristal)
export const INVASION_ARM_LEAD = 60;   // seconds before nightfall the wave is telegraphed
export const WAVE_WARNING_LEAD = 30;   // seconds before nightfall the HUD warning banner goes up
export const WAVE_BANNER_SECONDS = 5;  // game seconds the arrival and "cleared" banners stay up
export const INVASION_SOLDIER_RESPONDERS = 9; // most soldiers auto-deployed to defend one wave
export const INVASION_CIVILIAN_ATTACK_DAMAGE = 4; // drafted workers/nurses bite at half a soldier's strength
export const NURSE_DEFENSE_RADIUS = 6; // nurses only fight invaders within this range — they guard, never chase
export const QUEEN_STARVATION_DAMAGE = 5;    // HP/s drained while hunger is at 0

// Healing — ants heal by EATING: whatever a meal holds beyond what hunger
// needs turns into HP. There is no healing trip to the nest.
export const HEAL_HP_PER_FOOD = 2; // 1 food unit restores 2 HP (costs more food to heal)
export const HURT_EAT_HEALTH_RATIO = 0.7; // nurses and defenders live next to the pantry: below this HP they go eat to heal

// Feeding (hunger restoration)
export const HUNGER_EAT_THRESHOLD = 0.5; // go eat at nest when below 50% hunger
export const HUNGER_PER_FOOD = 100; // 1 food unit restores 100 hunger points
export const HUNGER_EAT_RATE = 10; // food units consumed per second while eating — also paces healing

// Cricket stats
export const CRICKET_STATS = {
  health: 600, // was 2000 — fights took 4+ minutes; mini-boss, not damage sponge
  damage: 18,
  speed: 1.2,
  visionRange: 5,
  attackRange: 2.0,
  attackCooldown: 1.2,
  size: 2.5,
} as const;

// Cricket den stats
export const CRICKET_DEN_STATS = {
  health: 600,
  spawnCooldown: 60,
  maxCrickets: 2,
  size: 0.9,
} as const;

// Cricket spawning
// Total colony food (surface buffer + underground pantry) that summons the
// cricket mini-boss. Above the 450 the starting pantry holds, so it demands a
// real expansion — but reachable, unlike the old 1000 measured against a
// surface stockpile that nothing fills any more (crickets never spawned).
export const CRICKET_SPAWN_FOOD_THRESHOLD = 600;
// Balance pass: the threshold alone let the leaper's den appear on day 1
// (the surface stockpile fills fast while the pantry is full), and a 600 HP
// leaper at the nest against ten workers ended runs before the first wave.
// No den before this many seconds of run (three full day/night cycles).
export const CRICKET_DEN_GRACE_SECONDS = 630;
export const CRICKET_DEN_MIN_NEST_DISTANCE = 40;
export const MAX_TOTAL_CRICKETS = 4;

// Cricket behavior
export const CRICKET_STEAL_AMOUNT = 12; // food per second while it raids the nest (was 40: a 450 pantry gone in ~11 s)
export const CRICKET_STEAL_TIME = 2; // seconds to steal food
export const CRICKET_MEAT_AMOUNT = 150; // meat dropped on death
export const CRICKET_MEAT_NUTRITION_MULTIPLIER = 3.5;

// Giant mushroom
export const GIANT_MUSHROOM_AMOUNT_MIN = 400;
export const GIANT_MUSHROOM_AMOUNT_MAX = 600;
export const GIANT_MUSHROOM_NUTRITION_MULTIPLIER = 2.5;
export const GIANT_MUSHROOM_SPAWN_DISTANCE_MIN = 5;
export const GIANT_MUSHROOM_SPAWN_DISTANCE_MAX = 10;
export const GIANT_MUSHROOM_RESPAWN_CHANCE = 0.1;

// Underground nest
// 2x the original 60×45 — base layout is a strategic decision (queen placement,
// pantry distance, choke points), so the colony needs room to express it
export const UNDERGROUND_WIDTH = 90;
export const UNDERGROUND_HEIGHT = 60;
export const QUEEN_CHAMBER_SIZE = 5;
export const STARTING_FOOD_CHAMBER_SIZE = 3;
export const EXCAVATION_TIME = 3;
export const MAX_DIG_JOBS = 20;
export const TRANSIT_DURATION = 1.5;

// Topmost DIGGABLE underground row (row 0 is the Reinforced border). Any
// walkable tile here touches the surface, so digging a column up to this row
// opens a new entrance — more forage throughput, but another way in for waves.
export const ENTRANCE_ROW = 1;

// Porter logistics — idle workers physically carry surface stockpile food down to the pantry
export const PORTER_MAX_COUNT = 4;          // base cap on concurrent porters
export const PORTER_PILE_PER_EXTRA = 60;    // one more porter allowed per this much food on the entrance pile
export const PORTER_ASSIGN_COOLDOWN = 2;    // seconds between porter assignments (prevents recruitment floods)
export const SCAVENGER_MAX_COUNT = 2;       // hard cap on workers hauling invader meat drops to the pantry

// Spatial pantry — food lives as physical piles on FoodStorage chamber tiles
export const PANTRY_TILE_CAPACITY = 50;            // food per pantry tile (9 starting tiles ≈ old 500 cap)
export const PANTRY_FULL_NOTIFY_COOLDOWN_MS = 30000; // throttle for the "pantry full" warning
export const PANTRY_STORAGE_UPGRADE_PER_TILE = 15; // 'storage' upgrade: +capacity per pantry tile per level
export const SURFACE_GLUT_PILE = 150;        // pantry full and this much food at the entrance: workers stop foraging on their own (it would only rot)
export const SURFACE_SPOILAGE_RATE = 0.0015; // fraction of surface nest food lost per second (~9%/min); underground pantry doesn't spoil

// Fungus farming — farm tiles convert stored leaves into mushrooms
export const FUNGUS_CONVERSION_PER_TILE = 0.35; // leaves consumed per second per farm tile
export const FUNGUS_YIELD = 1.4;                // mushrooms produced per leaf consumed
export const FARM_MULCH_CAPACITY = 36;          // leaf mulch a farm tile holds: gardener ants lay it, the fungus eats it (≈ one ripe bed)

// ── Defenders & underground design ─────────────────────────────────
export const BREED_COST_DEFENDER = 30;
export const EGG_INCUBATION_DEFENDER = 35; // seconds
export const DEFENDER_DETECT_RANGE = 8;    // tiles from the defender's POST (bigger than the area itself)
export const MAX_ANTS_PER_TILE_UNDERGROUND = 3; // crowding cap — corridor width becomes strategy
export const CROWD_SQUEEZE_SECONDS = 1.5;       // blocked longer than this → squeeze past (no deadlocks, ever)
export const ROCK_POCKET_COUNT = 14;       // procedural undiggable blobs (design constraints)

// ── Day/night cycle ────────────────────────────────────────────────
export const DAY_DURATION = 150;   // seconds of daylight (forage window)
export const NIGHT_DURATION = 60;  // seconds of night (predators hunt)
export const DUSK_WARNING = 15;    // warn this many seconds before nightfall
export const NIGHT_ENEMY_SPAWN_MULTIPLIER = 2.2; // predators spawn faster at night
export const NIGHT_FOOD_SPAWN_MULTIPLIER = 0.4;  // food regrows slower at night

// Queen entity
// Balance pass: was 500. The nest alert fires when the first invader gets in;
// at 500 a handful of beetles killed her before a player on the surface could
// bring soldiers down, which is how runs ended with ants still outside.
export const QUEEN_MAX_HEALTH = 800;
// Her own chitin, before any upgrade. Balance pass: unarmored, the three young
// beetles of wave 1 (6 damage a bite) killed an undefended queen in under a
// minute; 2 armor turns their bites into 4 and a full beetle's 12 into 10.
export const QUEEN_ARMOR = 2;
// She bites what reaches her: the last defense of a nest with nobody left.
// Balance pass: a defenceless queen made every wave that got in a death
// sentence for a colony that had lost its few nurses.
export const QUEEN_BITE = { damage: 10, range: 1.6, cooldown: 1.2 } as const;
export const QUEEN_MAX_HUNGER = 1000;
export const QUEEN_HUNGER_DECAY = 2.0;
export const QUEEN_EGG_LAY_TIME = 3;
export const QUEEN_EGG_LAY_HUNGER_COST = 30;
export const QUEEN_MIN_HUNGER_TO_LAY = 100; // queen pauses laying below this

// Eggs
export const EGG_INCUBATION_WORKER = 20;
export const EGG_INCUBATION_SOLDIER = 30;
export const EGG_INCUBATION_SCOUT = 24;
export const EGG_INCUBATION_NURSE = 16;
export const EGG_FOOD_REQUIRED = 10;
export const MAX_EGGS_PER_TYPE = 5;
export const MAX_EGGS_PER_INCUBATION_TILE = 4;
/**
 * Brood care: a free nurse attending an incubating larva adds this many seconds
 * of growth per second (1 → the larva grows twice as fast). One nurse per larva,
 * so extra nurses speed the brood up to one per incubating larva, no further.
 */
export const BROOD_CARE_SPEEDUP = 1;
/** Seconds a nurse attends a larva before re-deciding, so urgent work can pull her away */
export const BROOD_CARE_BOUT = 2;
export const INCUBATION_CHAMBER_SIZE = 3;

// Scoring Decision System — Role base weights
export const ROLE_BASE_WEIGHTS = {
  worker:  { food: 1.0, danger: 0.3, explore: 0.5, patrol: 0.1 },
  soldier: { food: 0.2, danger: 1.0, explore: 0.2, patrol: 0.9 },
  scout:   { food: 0.5, danger: 0.1, explore: 1.0, patrol: 0.0 },
  nurse:   { food: 0.3, danger: 0.1, explore: 0.0, patrol: 0.0 },
  // Defenders never run the surface AI (underground sentinels) — typed for completeness
  defender: { food: 0.1, danger: 1.0, explore: 0.0, patrol: 1.0 },
} as const;

// Scoring Decision System — Colony priority multipliers (extreme to feel impactful)
export const COLONY_PRIORITY_MULTIPLIERS = {
  gather:  { food: 2.0, danger: 0.5, explore: 0.2 },
  defend:  { food: 0.3, danger: 2.5, explore: 0.1 },
  explore: { food: 0.2, danger: 0.4, explore: 3.0 },
} as const;

// Scoring Decision System — Tile scoring constants
export const TILE_SCORE = {
  FOOD_PHEROMONE_WEIGHT: 1.0,
  HOME_PHEROMONE_PENALTY: -0.3,
  DANGER_PHEROMONE_WEIGHT: 1.0,
  // How hard a danger trail pushes an ant AWAY when it is not hunting. Scaled
  // per role at use site (see AntAISystem.scoreTile): fear is the inverse of
  // the role's danger weight, so workers detour and soldiers barely blink.
  DANGER_AVOIDANCE_WEIGHT: 1.2,
  UNEXPLORED_BONUS: 0.8,
  DISTANCE_FROM_NEST_BIAS: 0.05,
  TRAIL_LENGTH: 3,
  MIN_SCORE_THRESHOLD: 0.01,
} as const;

// Ant AI behavioral timing constants
export const RETURNING_HOME_DROP_TIMEOUT = 25; // seconds before ReturningHome drops food (was hardcoded 15)
export const STUCK_STALL_SECONDS = 4;          // seconds of sub-threshold displacement before declaring stuck
export const STUCK_MIN_DISPLACEMENT = 0.15;    // tiles; below this per-frame = not moving

// Scoring Decision System — Action scoring constants
export const ACTION_SCORE = {
  FOOD_VISION_BONUS: 10.0,
  PHEROMONE_TRAIL_BONUS: 3.0,
  DANGER_NEARBY_BONUS: 5.0,
  EXPLORE_UNEXPLORED_BONUS: 2.0,
  PATROL_DEFEND_BONUS: 4.0,
  /** A worker that sees a mineral node (food in sight still wins most rolls) */
  MINERAL_VISION_BONUS: 6.0,
} as const;

// ── Predator intelligence ──────────────────────────────────────────
// Beetles used to fight to the death and re-aim only when their path ran out.
// These knobs turn them into hunters with self-preservation instead.
export const BEETLE_RETREAT_HEALTH_RATIO = 0.3;   // break off the fight below 30% HP
export const BEETLE_RETREAT_DURATION = 14;        // seconds spent licking wounds before hunting again
export const BEETLE_REGEN_RATE = 6;               // HP/s recovered while retreating — finish the kill or it comes back
export const BEETLE_CHASE_REPATH_INTERVAL = 0.7;  // seconds between re-aims at moving prey
export const BEETLE_SWARM_RADIUS = 3;             // tiles around a prey counted as "it has backup"
export const BEETLE_SWARM_AVOIDANCE = 0.18;       // per nearby ant: how much less attractive that prey looks
export const BEETLE_SOLDIER_AVOIDANCE = 1.35;     // soldiers look this much "further away" than civilians
export const NIGHT_ENEMY_AGGRESSION_MULTIPLIER = 1.5; // predators see further at night

// ── Ant tactical intelligence ──────────────────────────────────────
export const SOLDIER_FOCUS_FIRE_BONUS = 0.55;     // target-score bonus per ally already engaging that enemy (stacks with flanking)
export const SOLDIER_MAX_FOCUS_ALLIES = 4;
export const NEST_THREAT_RADIUS = 14;             // a predator this close to the nest raises the colony alarm
export const NEST_ALARM_SCORE = 14;               // alarm chase score — outweighs foraging for soldiers
export const FORAGE_ENEMY_AVOID_RADIUS = 5;       // non-soldiers refuse to harvest this close to a predator

// === Meteorite crater (the run's opening impact; the Crystal Hive rises here later) ===
export const CRATER_CLEAR_RADIUS = 3; // tiles around the impact that must be walkable
export const CRATER_EDGE_MARGIN = 6; // tiles kept between the crater and the map edge
export const CRATER_FAR_FRACTION = 0.75; // of the farthest clearing's distance from the nest

// === Minerals (P7.1): food pays for ants, minerals pay for structures ===
export const MINERAL_NODE_AMOUNT = 250;          // ore in one crystal node
export const MINERAL_TRIP_AMOUNT = 5;            // ore a worker carries per trip (StarCraft's 5)
export const MINERAL_MINE_SECONDS = 1.5;         // time a worker spends chipping at a node per trip
export const MINERAL_EXTRA_FIELDS = 3;           // seeded fields besides the crater's natural one
export const MINERAL_NODES_PER_FIELD = 5;
export const MINERAL_FIELD_RADIUS = 2;           // nodes of one field sit within this radius of its center
export const MINERAL_MIN_NEST_DISTANCE = 14;     // no node inside the colony's starting clearing
export const MINERAL_HOME_FIELD_MAX_DISTANCE = 26; // the first seeded field stays this close to the nest
export const MINERAL_FIELD_SPACING = 16;         // minimum distance between two field centers
export const MINERAL_EDGE_MARGIN = 4;            // tiles kept between a field center and the map edge
export const MINER_MAX_SHARE = 0.4;              // share of the surface workers that keep returning to a field
export const MINER_BASELINE = 2;                 // autonomous miners a colony keeps on a discovered field from the start
export const MINER_WORKERS_PER_MINER = 5;        // past the baseline, one more autonomous miner per this many workers
export const MINER_TARGET_MAX = 30;              // the highest miner target the player can set
export const MINER_ALLOCATE_SECONDS = 0.5;       // how often the colony re-checks its miners
export const MINER_FIELD_REACH = 8;              // an ordered miner whose node runs out moves to a node this close to it

// === Player orders (StarCraft-style control) ===
export const ORDER_PATHS_PER_TICK = 6;      // ordered ants routed per tick; a big group spreads its A* runs over frames
export const ORDER_PATH_MAX_STEPS = 6000;   // A* budget for an ordered route (player orders may cross the whole map)
export const ORDER_ARRIVE_RADIUS = 0.3;     // tiles from the formation slot that count as "arrived"
export const ORDER_SETTLE_RADIUS = 2;       // a route that ended this close to the slot also counts (slot crowded or blocked)
export const ORDER_MAX_ROUTES = 6;          // re-route attempts before an unreachable order is dropped
export const ORDER_TIMEOUT_SECONDS = 90;    // an order that has not arrived by then is dropped (the AI takes over)
export const ORDER_SNAP_RADIUS = 3;         // a click on rock snaps to the nearest walkable tile this close
export const ORDER_CHASE_REPATH_SECONDS = 0.75; // an ordered chase re-aims at its moving quarry this often
export const GUARD_LEASH_RADIUS = 8;        // a warrior on guard fights enemies up to this far from its post, never farther
export const GUARD_HOME_RADIUS = 1;         // ...and walks back once a fight left it farther than this from the post
export const ENEMY_PICK_RADIUS = 1.5;       // a right-click this close to an enemy targets it (a big sprite like the cricket: its own size)

// === Control groups and game speed keys ===
export const CONTROL_GROUP_SLOTS = 9;          // Ctrl+1..9 bind a group, 1..9 recall it
export const CONTROL_GROUP_DOUBLE_TAP_MS = 300; // the same digit twice this fast also centers the camera on the group
export const GAME_SPEED_MAX = 3;               // + and - step game speed between x1 and this

// === Mycelium creep (the Swarm's living carpet around the nest) ===
export const CREEP_BASE_RADIUS = 4;          // tiles of creep a newly founded nest holds
export const CREEP_MAX_RADIUS = 13;          // the carpet never reaches farther from a nest
export const CREEP_ANTS_PER_RADIUS = 4;      // every this many living ants push the edge one tile out
export const CREEP_UPDATE_SECONDS = 0.25;    // how often the carpet grows or recedes
export const CREEP_GROW_STEP = 40;           // coverage a tile gains per update (0-255)
export const CREEP_DECAY_STEP = 12;          // coverage a tile loses per update once outside the reach
export const CREEP_SOLID = 128;              // coverage from which a tile counts as creep and spreads further
export const CREEP_SPEED_MULT = 1.3;         // colony ants run this much faster on creep
export const CREEP_HEAL_PER_SECOND = 1.5;    // HP a colony ant on creep regains per second
export const MEAT_MERGE_RADIUS = 1.5;        // a kill this close to a pile of the same meat adds to it instead of a new pile
