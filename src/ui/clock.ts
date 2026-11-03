/**
 * Real-time driver (plan §3.2): requestAnimationFrame loop with an accumulator. msPerDay = 700 / speed,
 * at most 4 ticks per frame. Auto-pauses on modals, phases other than running, tutorial, blur and
 * hidden tab. Ticks in a frame are batched so subscribers are notified once.
 */
import { config } from '@/config';
import type { Store } from './store';

export class Clock {
  private raf = 0;
  private last = 0;
  private acc = 0;
  private running = false;
  private readonly store: Store;

  constructor(store: Store) {
    this.store = store;
  }

  start(): void {
    if (this.running || typeof requestAnimationFrame === 'undefined') return;
    this.running = true;
    this.last = performance.now();
    this.acc = 0;
    this.raf = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private frame = (now: number): void => {
    if (!this.running) return;
    const dt = Math.min(250, now - this.last);
    this.last = now;
    const store = this.store;
    const sim = store.sim;
    let changed = false;
    if (sim && !store.effectivePaused) {
      const msPerDay = config.time.msPerDayAt1x / store.ui.speed;
      this.acc += dt;
      let ticks = 0;
      sim.batch(() => {
        while (this.acc >= msPerDay && ticks < config.time.maxTicksPerFrame && sim.state.phase === 'running') {
          sim.tick();
          this.acc -= msPerDay;
          ticks++;
        }
      });
      if (ticks === config.time.maxTicksPerFrame) this.acc = Math.min(this.acc, msPerDay);
    } else {
      this.acc = 0;
    }
    const runningUnpaused = !!sim && !store.effectivePaused;
    if (store.frame(dt, runningUnpaused)) changed = true;
    if (changed) store.emit();
    this.raf = requestAnimationFrame(this.frame);
  };
}
