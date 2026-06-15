import { FIXED_TIMESTEP, MAX_DELTA } from '../../shared/constants';

export type UpdateFn = (dt: number) => void;
export type RenderFn = (interpolation: number) => void;

export class GameLoop {
  private running = false;
  private paused = false;
  private speed = 1; // 1x, 2x, 3x
  private accumulator = 0;
  private lastTime = 0;
  private rafId = 0;
  private tickCount = 0;
  private onUpdate: UpdateFn;
  private onRender: RenderFn;

  constructor(
    onUpdate: UpdateFn,
    onRender: RenderFn
  ) {
    this.onUpdate = onUpdate;
    this.onRender = onRender;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.loop(this.lastTime);
  }

  stop(): void {
    this.running = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    if (!paused) {
      this.lastTime = performance.now();
      this.accumulator = 0;
    }
  }

  isPaused(): boolean {
    return this.paused;
  }

  setSpeed(speed: number): void {
    this.speed = Math.max(1, Math.min(5, speed));
  }

  getSpeed(): number {
    return this.speed;
  }

  getTickCount(): number {
    return this.tickCount;
  }

  private loop = (currentTime: number): void => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.loop);

    let delta = currentTime - this.lastTime;
    this.lastTime = currentTime;

    if (delta > MAX_DELTA) delta = MAX_DELTA;

    if (!this.paused) {
      this.accumulator += delta * this.speed;

      while (this.accumulator >= FIXED_TIMESTEP) {
        this.onUpdate(FIXED_TIMESTEP / 1000); // convert to seconds
        this.accumulator -= FIXED_TIMESTEP;
        this.tickCount++;
      }
    }

    const interpolation = this.accumulator / FIXED_TIMESTEP;
    this.onRender(interpolation);
  };
}
