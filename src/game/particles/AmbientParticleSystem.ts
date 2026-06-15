import type { TileGrid } from '../../simulation/world/TileGrid';
import type { World } from '../../engine/ecs/World';
import { TerrainType } from '../../simulation/world/types';
import { TILE_SIZE, WORLD_WIDTH, WORLD_HEIGHT } from '../../shared/constants';
import { PAL } from '../../engine/renderer/pixelart/palette';

/** Snap a smooth alpha to one of 3 discrete pixel-art levels (or skip). */
function quantizeAlpha(a: number): number {
  if (a < 0.15) return 0;
  if (a < 0.4) return 0.25;
  if (a < 0.7) return 0.5;
  return 0.75;
}

export type ParticleType = 'leaf' | 'dust' | 'spore' | 'bubble' | 'sand_grain' | 'pollen';

interface Particle {
  x: number;          // world pixels
  y: number;          // world pixels
  vx: number;         // pixels/sec
  vy: number;         // pixels/sec
  life: number;       // remaining seconds
  maxLife: number;     // total life for alpha calc
  size: number;       // radius in pixels
  type: ParticleType;
  alpha: number;      // base alpha (fades with life)
  color: string;
  rotation: number;   // radians (for leaves)
  rotationSpeed: number;
}

export class AmbientParticleSystem {
  private particles: Particle[] = [];
  private grid: TileGrid;
  private spawnTimer: number = 0;
  private readonly MAX_PARTICLES = 200;
  private readonly SPAWN_INTERVAL = 0.08; // seconds between spawn attempts

  // Viewport bounds for spawning (updated each render call)
  private viewStartX = 0;
  private viewStartY = 0;
  private viewEndX = 30;
  private viewEndY = 22;

  constructor(grid: TileGrid, _world: World) {
    this.grid = grid;
  }

  update(dt: number): void {
    // Update existing particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      p.rotation += p.rotationSpeed * dt;

      // Add gentle wave motion for floating particles
      if (p.type === 'spore' || p.type === 'pollen' || p.type === 'dust') {
        p.x += Math.sin(p.life * 3 + p.y * 0.01) * 0.3 * dt * TILE_SIZE;
      }
      // Bubbles rise and wobble
      if (p.type === 'bubble') {
        p.x += Math.sin(p.life * 5) * 0.5 * dt * TILE_SIZE;
      }

      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }

    // Spawn new particles within the viewport
    this.spawnTimer += dt;
    if (this.spawnTimer >= this.SPAWN_INTERVAL && this.particles.length < this.MAX_PARTICLES) {
      this.spawnTimer = 0;
      this.spawnParticle();
    }
  }

  render(ctx: CanvasRenderingContext2D, viewStartX: number, viewStartY: number, viewEndX: number, viewEndY: number): void {
    // Store viewport bounds for particle spawning (tile coordinates)
    this.viewStartX = viewStartX;
    this.viewStartY = viewStartY;
    this.viewEndX = viewEndX;
    this.viewEndY = viewEndY;

    // viewStart/End are in TILE coordinates (from RenderSystem viewport culling)
    const pxStartX = viewStartX * TILE_SIZE - TILE_SIZE;
    const pxStartY = viewStartY * TILE_SIZE - TILE_SIZE;
    const pxEndX = viewEndX * TILE_SIZE + TILE_SIZE;
    const pxEndY = viewEndY * TILE_SIZE + TILE_SIZE;

    for (const p of this.particles) {
      // Viewport cull
      if (p.x < pxStartX || p.x > pxEndX || p.y < pxStartY || p.y > pxEndY) continue;

      // Alpha fades in/out — movement stays smooth, alpha snaps to discrete steps
      const fadeIn = Math.min(1, (p.maxLife - p.life) / 0.5); // fade in over 0.5s
      const fadeOut = Math.min(1, p.life / 0.8); // fade out over last 0.8s
      const alpha = quantizeAlpha(p.alpha * fadeIn * fadeOut);
      if (alpha === 0) continue;

      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;

      // Snap to a 2px grid so particles sit on the art-pixel raster
      const x = Math.round(p.x / 2) * 2;
      const y = Math.round(p.y / 2) * 2;

      if (p.type === 'leaf') {
        // 2×1 art-px leaf flipping between two orientations as it falls
        const flipped = Math.floor(p.rotation * 1.5) % 2 === 0;
        if (flipped) {
          ctx.fillRect(x - 2, y - 1, 4, 2);
        } else {
          ctx.fillRect(x - 1, y - 2, 2, 4);
        }
      } else if (p.type === 'bubble') {
        if (p.life < 0.4) {
          // Pop: 3px hollow ring (4 rects forming a hollow square)
          ctx.fillRect(x - 3, y - 3, 6, 2);
          ctx.fillRect(x - 3, y + 1, 6, 2);
          ctx.fillRect(x - 3, y - 1, 2, 2);
          ctx.fillRect(x + 1, y - 1, 2, 2);
        } else {
          // Rising 1-art-px bubble
          ctx.fillRect(x - 1, y - 1, 2, 2);
        }
      } else {
        // pollen / dust / spore / sand_grain — single square art pixel
        ctx.fillRect(x - 1, y - 1, 2, 2);
      }
    }

    ctx.globalAlpha = 1;
  }

  private spawnParticle(): void {
    // Pick random tile within the viewport (with margin for particles drifting in)
    const margin = 3;
    const minX = Math.max(0, this.viewStartX - margin);
    const maxX = Math.min(WORLD_WIDTH - 1, this.viewEndX + margin);
    const minY = Math.max(0, this.viewStartY - margin);
    const maxY = Math.min(WORLD_HEIGHT - 1, this.viewEndY + margin);

    const tileX = minX + Math.floor(Math.random() * (maxX - minX + 1));
    const tileY = minY + Math.floor(Math.random() * (maxY - minY + 1));
    const tile = this.grid.getTile(tileX, tileY);
    if (!tile) return;

    const worldX = tileX * TILE_SIZE + Math.random() * TILE_SIZE;
    const worldY = tileY * TILE_SIZE + Math.random() * TILE_SIZE;

    let particle: Particle | null = null;

    switch (tile.terrain) {
      case TerrainType.Grass:
        particle = this.createGrassParticle(worldX, worldY);
        break;
      case TerrainType.Dirt:
        particle = this.createDirtParticle(worldX, worldY);
        break;
      case TerrainType.Sand:
        particle = this.createSandParticle(worldX, worldY);
        break;
      case TerrainType.Water:
        particle = this.createWaterParticle(worldX, worldY);
        break;
      // Stone: no particles (it's solid rock)
    }

    // Check proximity to mushrooms for spores (only 20% of grass/dirt particles)
    if (particle === null && Math.random() < 0.1) {
      particle = this.createSporeNearMushroom(tileX, tileY, worldX, worldY);
    }

    if (particle) {
      this.particles.push(particle);
    }
  }

  private createGrassParticle(x: number, y: number): Particle {
    // 60% pollen, 40% falling leaf
    if (Math.random() < 0.6) {
      // Pollen — tiny yellow dots drifting up
      return {
        x, y,
        vx: (Math.random() - 0.5) * 8,
        vy: -Math.random() * 6 - 2,  // drift up
        life: 4 + Math.random() * 3,
        maxLife: 4 + Math.random() * 3,
        size: 1 + Math.random() * 1.5,
        type: 'pollen',
        alpha: 0.4 + Math.random() * 0.2,
        color: this.randomChoice([PAL.healthYellow, PAL.glowAmber, PAL.sand[2]]),
        rotation: 0,
        rotationSpeed: 0,
      };
    } else {
      // Leaf — small colored leaf falling slowly
      return {
        x, y: y - TILE_SIZE * 2, // start above
        vx: (Math.random() - 0.5) * 10,
        vy: 8 + Math.random() * 12,  // fall down
        life: 5 + Math.random() * 4,
        maxLife: 5 + Math.random() * 4,
        size: 2.5 + Math.random() * 2,
        type: 'leaf',
        alpha: 0.5 + Math.random() * 0.3,
        color: this.randomChoice([PAL.leaf[0], PAL.leaf[1], PAL.leaf[2], PAL.grass[2]]),
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 2,
      };
    }
  }

  private createDirtParticle(x: number, y: number): Particle {
    // Dust motes — tiny brown particles drifting
    return {
      x, y,
      vx: (Math.random() - 0.5) * 5,
      vy: (Math.random() - 0.5) * 3 - 1, // slight upward drift
      life: 3 + Math.random() * 3,
      maxLife: 3 + Math.random() * 3,
      size: 1 + Math.random() * 1.2,
      type: 'dust',
      alpha: 0.25 + Math.random() * 0.15,
      color: this.randomChoice([PAL.soil[2], PAL.soil[3], PAL.soil[1]]),
      rotation: 0,
      rotationSpeed: 0,
    };
  }

  private createSandParticle(x: number, y: number): Particle {
    // Sand grains — tiny bright particles carried by wind
    return {
      x, y,
      vx: 5 + Math.random() * 10,  // wind pushes right
      vy: (Math.random() - 0.5) * 3,
      life: 2 + Math.random() * 2,
      maxLife: 2 + Math.random() * 2,
      size: 0.8 + Math.random() * 1,
      type: 'sand_grain',
      alpha: 0.35 + Math.random() * 0.2,
      color: this.randomChoice([PAL.sand[0], PAL.sand[1], PAL.sand[2]]),
      rotation: 0,
      rotationSpeed: 0,
    };
  }

  private createWaterParticle(x: number, y: number): Particle {
    // Bubbles — rise from water surface
    return {
      x, y,
      vx: (Math.random() - 0.5) * 3,
      vy: -5 - Math.random() * 8,  // rise up
      life: 2 + Math.random() * 2,
      maxLife: 2 + Math.random() * 2,
      size: 1.5 + Math.random() * 2.5,
      type: 'bubble',
      alpha: 0.3 + Math.random() * 0.2,
      color: PAL.water[3],
      rotation: 0,
      rotationSpeed: 0,
    };
  }

  private createSporeNearMushroom(_tileX: number, _tileY: number, x: number, y: number): Particle | null {
    // Check if there's food pheromone nearby (indicates mushrooms were harvested here)
    // Or just spawn occasionally with mushroom-like colors
    // For simplicity: spawn spore particles that look organic
    return {
      x, y,
      vx: (Math.random() - 0.5) * 4,
      vy: -3 - Math.random() * 5,  // float up
      life: 4 + Math.random() * 4,
      maxLife: 4 + Math.random() * 4,
      size: 1.2 + Math.random() * 1.5,
      type: 'spore',
      alpha: 0.35 + Math.random() * 0.2,
      color: this.randomChoice([PAL.glowGreen, PAL.leaf[2], PAL.grass[3]]),
      rotation: 0,
      rotationSpeed: 0,
    };
  }

  private randomChoice<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
  }
}
