import { broodKeys } from './commands';

/** The full-pantry message, naming the tool that makes room */
export function pantryFullText(): string {
  return `Despensa llena: marca más casillas de Almacén (${broodKeys().storage})`;
}

/** Food on its way (entrance pile and jaws), ahead of the full-pantry message */
export function pantryWaitingText(inTransit: number): string {
  return inTransit > 0 ? `+${inTransit} en camino · ` : '';
}
