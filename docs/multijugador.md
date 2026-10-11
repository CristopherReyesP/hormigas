# Multijugador: análisis

Objetivo: dos jugadores, cada uno con su colonia de hormigas en zonas distintas del mapa. Crecen y evolucionan, con fauna salvaje y otros enemigos siempre presentes. Se gana destruyendo a la reina del rival, lo que obliga a romper sus defensas y entrar en su cueva. Debe dar juego estratégico, con ataques pequeños para debilitar al rival, al estilo StarCraft.

## Lo que ya tenemos a favor

- **Bandos (facciones):** `src/game/factions/factions.ts` ya define `WILDLIFE / PLAYER / RIVAL` y un `FactionState` con espacio para niebla, economía y base propias de cada bando.
- **Simulación reproducible:** el juego avanza a 60 ticks fijos y el azar sale de un generador con semilla (`src/game/save/rng.ts`). Con la misma semilla y las mismas órdenes, dos PCs calculan exactamente la misma partida. Es la base del multijugador al estilo StarCraft.
- **Detectar si las partidas se separan:** `src/game/save/snapshot.ts` y `stateDiff.ts` ya guardan y comparan el estado completo del juego.
- **Entrar a un nido enemigo:** `UndergroundInvasionSystem` ya mete enemigos dentro del nido, y `TransitSystem` ya mueve hormigas entre superficie y cueva.
- **Las órdenes pasan por un solo punto:** la UI manda todo a través de `GameManager`, que es lo que habría que enviar por la red.
- **Simulación sin navegador:** los scripts de `scripts/` ya corren la simulación en Node.

## Lo que falta

### 1. Pasar de una colonia a varias (lo más costoso)

- `World` guarda como valores únicos los minerales (`minerals`), las mejoras (`upgradeLevels`, `upgrades`), las estadísticas (`runTally`) y la prioridad de la colonia (en `AntAISystem`). Hay que moverlos a un estado por facción (`ColonyState`: comida, minerales, mejoras, evoluciones, prioridad).
- Hay un solo `UndergroundGrid` (la cueva). Se necesita una cueva por colonia, cada una enlazada a su propio nido en la superficie.
- Hay unas 60 referencias fijas a `FactionId.PLAYER`, y `ownerOf` da por hecho que toda hormiga es del jugador. Hay que crear `PLAYER_1` y `PLAYER_2` y que las hormigas de colonias distintas sean enemigas entre sí.
- La fauna salvaje ya funciona como neutral hostil, así que sirve tal cual para los dos.
- Cada jugador necesita su propia niebla de guerra (`FogOfWarSystem`) y su propio azar para las ofertas de evolución (`MutationOffers`).

**Recomendación:** hacer esto primero **contra una colonia de hormigas controlada por IA**. Así se valida todo sin red y además queda un modo contra la máquina.

### 2. Distinguir a los jugadores

- Un color de bando por jugador: tinte en los sprites, en el nido y en el minimapa.
- Mapa con salidas simétricas, por ejemplo esquinas opuestas.
- En multijugador, saltar la Fase 1 con el muro de espinas y usar directamente el mapa grande.

### 3. Atacar la cueva enemiga

- **Tapón del nido:** la entrada tiene vida y se refuerza con mejoras. Mientras queden defensores vivos alrededor, se regenera.
- **Entrar:** cuando el tapón cae, los soldados pasan a la cueva enemiga, reutilizando la lógica de invasión existente.
- **Objetivos dentro:**
  - **Despensa:** robar comida y llevarla a casa. Ataca la economía del rival.
  - **Incubadora:** destruir huevos. Frena su producción.
  - **Granja de hongos:** lo debilita a largo plazo.
  - **Reina:** en la cámara más profunda. Matarla da la victoria.
- **Ataques rápidos:** grupos pequeños que entran, roban o matan huevos y salen. Encajan con los grupos de control (`1`–`9`) que ya existen.
- **Opcional, más adelante:** cavar un túnel secreto hacia la cueva enemiga, o una casta excavadora que abra una segunda entrada.
- **Condiciones de victoria:** muerte de la reina, rendición o desconexión del rival.

### 4. Red

- **Modelo:** lockstep determinista (como StarCraft). Solo viajan las órdenes, cada una marcada con el número de tick en que debe ejecutarse, con un retraso de unos 100–150 ms. Cada PC simula la partida completa.
- **Requisitos:**
  - Que todas las órdenes sean datos serializables (selecciones, movimientos, colas de crías, excavación, zonas, prioridad, mejoras).
  - Que la pausa y la velocidad (×2, ×3) se pongan de acuerdo entre los dos.
  - Que cada N ticks las PCs comparen un hash del estado, con aviso si se separan.
  - Riesgo: `Math.sin`, `Math.cos` y similares pueden dar resultados distintos entre navegadores. Hay que probar Chrome contra Firefox desde el principio.
- **Transporte:**
  - **Opción simple:** un servidor pequeño de Node con WebSocket que reenvía órdenes y gestiona las salas.
  - **Opción sin servidor de juego:** WebRTC de navegador a navegador. Igual necesita un servidor mínimo para conectar a los dos jugadores.
  - GitHub Pages no sirve como servidor; harían falta Fly.io, Render o similar.
- **Extra:** como la simulación ya corre en Node, más adelante se podría montar un servidor que valide la partida.

### 5. Interfaz

Sala de espera (crear o unirse con código), elegir color, pantalla de carga sincronizada, mensajes de victoria o derrota y aviso de desconexión.

## Orden sugerido

1. Varias colonias en local, con un rival de hormigas por IA.
2. Tapón del nido, invasión de cuevas y victoria por la reina.
3. Órdenes serializables y hash del estado; probar con dos partidas locales en la misma pestaña.
4. Red con lockstep y WebSocket, más la sala de espera.
5. Balance: mapa, refuerzo del tapón, ataques rápidos.

Las fases 1 y 4 son las más pesadas.
