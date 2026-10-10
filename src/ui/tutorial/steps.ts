import type { GoalId } from '../../game/tutorial/goals';
import type { StepId } from '../../game/tutorial/plan';
import type { FocusKind } from '../../game/tutorial/TutorialScenario';

/**
 * Everything the tutorial SAYS and POINTS AT, in one place: Hormi's lines per
 * step and goal (one for touch screens, one for mouse and keyboard), the
 * celebration lines, and the highlight targets. Targets are stable selectors
 * (data attributes or aria labels), tried in order: the first one on screen
 * wins, so a future control (a troop bar, bigger order buttons) only needs its
 * selector added in front of the current one.
 */

export type Device = 'touch' | 'mouse';
/** One line for both devices, or one per device */
export type Line = string | { touch: string; mouse: string };

export function say(line: Line, device: Device): string {
  return typeof line === 'string' ? line : line[device];
}

export function deviceOf(touch: boolean): Device {
  return touch ? 'touch' : 'mouse';
}

export interface TargetSpec {
  /** HUD elements to spotlight, first visible wins */
  selectors?: Partial<Record<Device, readonly string[]>> | readonly string[];
  /** A spot on the surface map to point at, when no HUD element is shown */
  world?: FocusKind;
}

export interface GoalCopy {
  text: Line;
  target?: TargetSpec;
}

export interface StepCopy {
  title: string;
  /** Hormi's opening line for the step */
  intro: Line;
  goals: Partial<Record<GoalId, GoalCopy>>;
  /** Said in the celebration */
  done: string;
  /** The view the step happens in; from the other one Hormi first sends the player back (LAYER_HINT) */
  layer?: 'surface' | 'underground';
}

/** Stable selectors of the controls the tutorial teaches */
export const TARGETS = {
  nestTab: '[aria-label="Nido"]',
  descend: '[data-cmd="descend"]',
  dig: '[data-cmd="dig"]',
  storage: '[data-cmd="storage"]',
  incubation: '[data-cmd="incubation"]',
  breedWorker: '[data-cmd="breed-worker"]',
  breedSoldier: '[data-cmd="breed-soldier"]',
  attack: '[data-cmd="attack"]',
  areaSelect: '[data-cmd="area-select"]',
  /** The quick-select troop bar (touch command redesign); used once it exists */
  troopBar: '[data-troop-bar]',
  troopSoldiers: '[data-troop-chip="soldier"]',
  pantry: '[data-hud="pantry"]',
  minerals: '[data-hud="minerals"]',
  help: '[data-hud="help"]',
} as const;

export const STEP_COPY: Record<StepId, StepCopy> = {
  camera: {
    title: 'Mira tu mundo',
    intro: '¡Hola! Soy Hormi, la exploradora. Te voy a enseñar a cuidar tu hormiguero.',
    goals: {
      pan: {
        text: {
          touch: 'Arrastra un dedo por el mapa para mirar a los lados.',
          mouse: 'Mantén el botón derecho y arrastra para mirar a los lados.',
        },
      },
      zoom: {
        text: {
          touch: 'Ahora pellizca con dos dedos para acercar o alejar.',
          mouse: 'Ahora gira la rueda para acercar o alejar.',
        },
      },
    },
    done: '¡Ya sabes mirar todo el mapa!',
  },
  select: {
    layer: 'surface',
    title: 'Elige tus hormigas',
    intro: 'Estas son tus hormigas. Para darles órdenes, primero hay que elegirlas.',
    goals: {
      'select-one': {
        text: {
          touch: 'Toca una hormiga para elegirla. ¡Prueba con la del círculo!',
          mouse: 'Haz clic en una hormiga para elegirla. ¡Prueba con la del círculo!',
        },
        target: { world: 'worker' },
      },
      'select-group': {
        text: {
          touch: 'Ahora elige varias: usa la barra de tropas, o Seleccionar área y arrastra el dedo alrededor de ellas.',
          mouse: 'Ahora elige varias: arrastra con el botón izquierdo un recuadro alrededor de ellas.',
        },
        target: { selectors: { touch: [TARGETS.troopBar, TARGETS.areaSelect] }, world: 'nest' },
      },
    },
    done: '¡Tienes tu equipo!',
  },
  move: {
    layer: 'surface',
    title: 'Dales una orden',
    intro: 'Tus hormigas te escuchan. ¡Llévalas a pasear!',
    goals: {
      move: {
        text: {
          touch: 'Toca el suelo donde quieras que vayan.',
          mouse: 'Haz clic derecho en el suelo donde quieras que vayan.',
        },
      },
    },
    done: '¡Mira cómo marchan!',
  },
  gather: {
    title: 'A buscar comida',
    intro: 'Las obreras buscan comida solas y la llevan al nido. ¡Hay hojas cerca!',
    goals: {
      gather: {
        text: 'Mira cómo traen hojas. Se guardan en la DESPENSA, y con esa comida la reina pone huevos.',
        target: { selectors: [TARGETS.pantry], world: 'food' },
      },
    },
    done: '¡La despensa se llena!',
  },
  nest: {
    title: 'Tu casa bajo tierra',
    intro: 'Debajo del nido está el hormiguero. ¡Vamos a verlo!',
    goals: {
      'open-nest': {
        text: { touch: 'Toca NIDO para bajar.', mouse: 'Haz clic en NIDO para bajar.' },
        target: { selectors: [TARGETS.nestTab, TARGETS.descend] },
      },
      dig: {
        text: {
          touch: 'Toca Excavar y luego toca la tierra junto a un túnel. Las obreras cavan ahí.',
          mouse: 'Pulsa Excavar y haz clic en la tierra junto a un túnel. Las obreras cavan ahí.',
        },
        target: { selectors: [TARGETS.dig] },
      },
      chamber: {
        text: {
          touch: 'Ahora toca Almacén (o Incubación) y toca un túnel vacío para marcar una sala.',
          mouse: 'Ahora pulsa Almacén (o Incubación) y haz clic en un túnel vacío para marcar una sala.',
        },
        target: { selectors: [TARGETS.storage, TARGETS.incubation] },
      },
    },
    done: '¡Eres una gran arquitecta!',
  },
  breed: {
    title: 'Nuevas hormigas',
    intro: 'La reina pone huevos si hay comida en la despensa.',
    goals: {
      breed: {
        text: {
          touch: 'Toca Criar obrera (o soldado) para pedir un huevo.',
          mouse: 'Haz clic en Criar obrera (o soldado) para pedir un huevo.',
        },
        target: { selectors: [TARGETS.breedWorker, TARGETS.breedSoldier] },
      },
      incubate: {
        text: 'Mira: las nodrizas llevan el huevo a la sala de incubación para que crezca.',
      },
    },
    done: '¡Un huevo en camino!',
  },
  minerals: {
    layer: 'surface',
    title: 'Cristales mágicos',
    intro: 'Esos cristales azules son minerales. Las obreras los pican solas.',
    goals: {
      minerals: {
        text: 'Vuelve a la superficie y espera a que traigan el primer cristal. ¡Sirven para construir!',
        target: { selectors: [TARGETS.minerals], world: 'minerals' },
      },
    },
    done: '¡Primeros minerales!',
  },
  attack: {
    layer: 'surface',
    title: '¡Al ataque!',
    intro: 'Te presto 4 soldados. Hay una guarida de acorazados cerca. ¡Vamos a sacarlos!',
    goals: {
      'select-soldiers': {
        text: {
          touch: 'Elige a los soldados: tócalos, usa la barra de tropas o Seleccionar área.',
          mouse: 'Elige a los soldados: haz clic en uno o arrastra un recuadro alrededor de ellos.',
        },
        target: { selectors: { touch: [TARGETS.troopSoldiers] }, world: 'soldiers' },
      },
      'arm-attack': {
        text: { touch: 'Toca el botón Atacar.', mouse: 'Pulsa el botón Atacar (o la tecla A).' },
        target: { selectors: [TARGETS.attack] },
      },
      'attack-den': {
        text: { touch: 'Ahora toca la guarida.', mouse: 'Ahora haz clic en la guarida.' },
        target: { world: 'den' },
      },
      'den-destroyed': {
        text: '¡Duro con ella! Espera a que la guarida caiga.',
        target: { world: 'den' },
      },
    },
    done: '¡Guarida destruida!',
  },
  night: {
    layer: 'surface',
    title: 'Llega la noche',
    intro: 'De noche vienen oleadas de enemigos. ¡Esta es de práctica!',
    goals: {
      'repel-wave': {
        text: {
          touch: 'Elige a tus soldados y toca a los acorazados para atacarlos.',
          mouse: 'Elige a tus soldados y haz clic derecho en los acorazados para atacarlos.',
        },
        target: { world: 'practice' },
      },
    },
    done: '¡Defendiste el nido!',
  },
  wrap: {
    title: '¡Ya sabes jugar!',
    intro: 'Para ganar: sobrevive 7 noches o destruye la base rival. Si muere la reina, pierdes.',
    goals: {
      ack: {
        text: 'Si te olvidas de algo, el botón ? te muestra los controles y puedes repetir el tutorial.',
        target: { selectors: [TARGETS.help] },
      },
    },
    done: '¡Eres una gran reina de hormigas!',
  },
};

/** When the player is in the wrong view for the step: the way back */
export const LAYER_HINT: Record<'surface' | 'underground', GoalCopy> = {
  surface: {
    text: { touch: 'Primero vuelve arriba: toca SUPERFICIE.', mouse: 'Primero vuelve arriba: haz clic en SUPERFICIE.' },
    target: { selectors: ['[aria-label="Superficie"]', '[data-cmd="ascend"]'] },
  },
  underground: {
    text: { touch: 'Primero baja al hormiguero: toca NIDO.', mouse: 'Primero baja al hormiguero: haz clic en NIDO.' },
    target: { selectors: [TARGETS.nestTab, TARGETS.descend] },
  },
};

/** The way back to the step's view, for this device */
export function layerHint(layer: 'surface' | 'underground', device: Device): { text: string; selectors: readonly string[]; world?: FocusKind } {
  const hint = LAYER_HINT[layer];
  return { text: say(hint.text, device), selectors: (hint.target?.selectors as readonly string[]) ?? [] };
}

export function stepIntro(step: StepId, device: Device): string {
  return say(STEP_COPY[step].intro, device);
}

/** Hormi's line for a goal and what to highlight, for this device */
export function goalCopy(step: StepId, goal: GoalId, device: Device): { text: string; selectors: readonly string[]; world?: FocusKind } {
  const copy = STEP_COPY[step].goals[goal];
  if (!copy) return { text: '', selectors: [] };
  const raw = copy.target?.selectors;
  const selectors = !raw ? [] : Array.isArray(raw) ? (raw as readonly string[]) : ((raw as Partial<Record<Device, readonly string[]>>)[device] ?? []);
  return {
    text: say(copy.text, device),
    selectors,
    world: copy.target?.world,
  };
}

/** Phrases cheered at each celebration, picked by step number */
export const CHEERS = ['¡Genial!', '¡Muy bien!', '¡Increíble!', '¡Bravo!', '¡Así se hace!'] as const;

export const UI_TEXT = {
  offerTitle: '¿Primera vez aquí?',
  offerBody: 'Soy Hormi. Te enseño a jugar en unos minutos, paso a paso.',
  offerAccept: '¡Sí, enséñame!',
  offerDecline: 'Ahora no',
  pickerButton: 'TUTORIAL',
  pickerHint: '¿Primera vez? Aprende a jugar con Hormi',
  progress: (step: number, total: number) => `Paso ${step} de ${total}`,
  skipStep: 'Saltar paso',
  exit: 'Salir del tutorial',
  ready: '¡Listo, a jugar!',
  stars: (n: number) => `${n} ${n === 1 ? 'estrella' : 'estrellas'}`,
  nightBanner: 'NOCHE DE PRÁCTICA',
  helpTitle: 'Controles',
  helpReplay: 'Repetir tutorial',
  helpClose: 'Cerrar',
  helpGoal: 'Meta: sobrevive 7 noches o destruye la base rival. Si muere la reina, pierdes.',
  helpButton: 'Ayuda y controles',
} as const;

/** The help card: the controls of each device */
export const HELP_CONTROLS: Record<Device, ReadonlyArray<{ what: string; how: string }>> = {
  touch: [
    { what: 'Mover la cámara', how: 'Arrastra un dedo' },
    { what: 'Acercar o alejar', how: 'Pellizca con dos dedos' },
    { what: 'Elegir una hormiga', how: 'Tócala' },
    { what: 'Elegir varias', how: 'Seleccionar área y arrastra el dedo, o mantén el dedo sobre una para elegir a todas las de su tipo' },
    { what: 'Mover o atacar', how: 'Con hormigas elegidas, toca el suelo o un enemigo' },
    { what: 'Atacar con el botón', how: 'Toca Atacar y luego al enemigo' },
    { what: 'Bajar al hormiguero', how: 'Toca NIDO; SUPERFICIE para subir' },
    { what: 'Ver qué hace un botón', how: 'Mantén el dedo sobre él' },
    { what: 'Volver al nido', how: 'Toca el botón de mira junto al minimapa' },
  ],
  mouse: [
    { what: 'Mover la cámara', how: 'Arrastra con el botón derecho o la rueda' },
    { what: 'Acercar o alejar', how: 'Gira la rueda' },
    { what: 'Elegir una hormiga', how: 'Clic izquierdo' },
    { what: 'Elegir varias', how: 'Arrastra un recuadro con el botón izquierdo; Ctrl+clic elige a todas las de su tipo' },
    { what: 'Mover o atacar', how: 'Clic derecho en el suelo o en un enemigo' },
    { what: 'Atacar con el botón', how: 'Atacar (A) y luego clic en el enemigo' },
    { what: 'Grupos', how: 'Ctrl+número guarda un grupo; el número lo vuelve a elegir' },
    { what: 'Pausa y velocidad', how: 'Espacio pausa; + y - cambian la velocidad' },
    { what: 'Volver al nido', how: 'Botón de mira junto al minimapa' },
    { what: 'Bajar al hormiguero', how: 'Clic en NIDO; SUPERFICIE para subir' },
  ],
};
