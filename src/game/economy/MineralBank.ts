/**
 * The colony's minerals: what miners deliver and what structures cost (P7).
 * Unlike food it never spoils, is never eaten and takes no pantry space, so
 * it is a plain counter rather than piles on tiles. One bank per World for
 * now (the player's colony); rival factions get their own later.
 */

/** Ore banked at a spot: the renderer pops a "+5" there. */
export interface MineralDeposit {
  amount: number;
  x: number;
  y: number;
}

/** Deposits kept for the renderer to drain; older ones are dropped (headless runs never drain). */
const MAX_PENDING_DEPOSITS = 32;

export class MineralBank {
  private amount = 0;
  private pending: MineralDeposit[] = [];

  get stored(): number {
    return this.amount;
  }

  /** Bank `amount`; `at` (tile coords) is where a miner delivered it, for the "+N" float. */
  deposit(amount: number, at?: { x: number; y: number }): void {
    if (amount <= 0) return;
    this.amount += amount;
    if (at) {
      this.pending.push({ amount, x: at.x, y: at.y });
      if (this.pending.length > MAX_PENDING_DEPOSITS) this.pending.shift();
    }
  }

  /** Deliveries since the last call, oldest first. */
  drainDeposits(): MineralDeposit[] {
    return this.pending.splice(0);
  }

  /** Pay `amount` if the bank holds it; false (and nothing taken) otherwise. */
  spend(amount: number): boolean {
    if (amount < 0 || amount > this.amount) return false;
    this.amount -= amount;
    return true;
  }
}
