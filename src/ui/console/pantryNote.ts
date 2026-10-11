import { broodKeys } from './commands';

/** The full-pantry message, naming the tool that makes room */
export function pantryFullText(): string {
  return `Despensa llena: marca más casillas de Almacén (${broodKeys().storage})`;
}

/** Workers below holding a load until the pantry has room, ahead of the full-pantry message */
export function pantryWaitersText(waiting: number): string {
  return waiting > 0 ? `${waiting} ${waiting === 1 ? 'obrera esperando' : 'obreras esperando'} · ` : '';
}

/** Food on its way (entrance pile and jaws), ahead of the full-pantry message */
export function pantryWaitingText(inTransit: number): string {
  return inTransit > 0 ? `+${inTransit} en camino · ` : '';
}
