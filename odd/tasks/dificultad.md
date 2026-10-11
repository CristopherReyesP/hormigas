# Difficulty pass, the alien tarantula and rival bases that dig in

## Decisions (user, 2026-10-11)
- Raise the difficulty of the whole game, with no difficulty picker.
- Phase 2 must be harder than Phase 1.
- A new enemy that only wants to eat ants: an alien tarantula (it has to fit the extraterrestrial setting).
- The rival's base grows with time: the longer it stands, the more defenses it has and the harder it is to attack.
- Follow-up: the base must be bigger, with more defenses and a bigger enemy army; the tarantula hairier and twice the size.

## Changes
- Waves (`waveComposition.ts`): curve `{4, 1.8, 0.5}` (was `{3, 1.5, 0.4}`). Elites 15% rising 4 points to 45% (was 10%, 3, 35%). Young beetles fade by wave 5 (was 6). The Hive's raid share tops at 35% (was 30%); the Humans' raid starts at 25% and tops at 35% (was 20% and 30%).
- Wildlife: 3 starting dens (was 2), a den breeds every 35 s (was 45), edge spawns every 45 s at 65% (was 60 s at 50%), up to 11 beetles (was 8), beetle bite 14 (was 12).
- Economy: new food every 36 s (was 30).
- Crystal Hive: a drone every 36 s (was 45), a garrison of 5 (was 4).
- Alien tarantula (`TarantulaSystem`): twice any other wildlife (an 88×88 shaggy sprite, 1300 HP), it senses ants 30 tiles away, ignores food, stalks and pounces at triple speed, and every kill heals it 20%. One from day 3, two from day 6, up to four in Phase 2.
- Rival bases dig in (`rival/fortify.ts`): a base starts already fortified (3 steps). Every 60 s each rival core grows its hull (up to 3×), toughens its defenses, raises one more (up to 20, on a ring that widens) and adds to its guard (3 + 1 per step, up to 24; every third one heavy: sentinels for the Hive, marksmen for the Humans). The Humans get bunkers; the Hive gets shielded obelisks that fire.
- Dens grow too: the Legionary nest and the spider lairs keep one more creature and gain hull every 90 s.
- Phase 2 is harder: the creatures have about 25% more health and damage, there are 4 spider lairs and 3 mantises, the Legionary nest keeps 10 and breeds faster, the picked rival brings 3 bases, and its raids are 1.5× plus 60% per standing base.
- The balance guards (`balance.regression.test.ts`) still pass: an idle colony lives through night 2, and one played sensibly reaches night 8 on 2 of 3 seeds.
