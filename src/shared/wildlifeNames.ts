// Player-facing names of the neutral wildlife. The cricket entity (internal
// name kept: CricketComponent, 'cricket' shape, cricket_meat) is shown as an
// alien leaper, "Saltador", in neutral Spanish.

export const LEAPER_NAME = {
  one: 'Saltador',
  many: 'Saltadores',
  den: 'Guarida de saltadores',
  meat: 'Carne de saltador',
} as const;

export const LEAPER_NOTICE = {
  stealing: '⚠️ ¡Un saltador está robando comida del nido!',
  denDestroyed: '💥 ¡Guarida de saltadores destruida!',
} as const;
