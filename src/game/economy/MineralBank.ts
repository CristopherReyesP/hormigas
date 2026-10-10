/**
 * The colony's minerals: what miners deliver and what structures cost (P7).
 * Unlike food it never spoils, is never eaten and takes no pantry space, so
 * it is a plain counter rather than piles on tiles. One bank per World for
 * now (the player's colony); rival factions get their own later.
 */
export class MineralBank {
  private amount = 0;

  get stored(): number {
    return this.amount;
  }

  deposit(amount: number): void {
    if (amount > 0) this.amount += amount;
  }

  /** Pay `amount` if the bank holds it; false (and nothing taken) otherwise. */
  spend(amount: number): boolean {
    if (amount < 0 || amount > this.amount) return false;
    this.amount -= amount;
    return true;
  }
}
