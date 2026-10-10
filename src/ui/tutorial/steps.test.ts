import { describe, expect, it } from 'vitest';
import { TUTORIAL_PLAN } from '../../game/tutorial/plan';
import { STEP_COPY, goalCopy, say, stepIntro, deviceOf, HELP_CONTROLS, layerHint } from './steps';

const MOUSE_WORDS = /\b(clic|ratón|rueda|mouse|teclado)\b/i;
const TOUCH_WORDS = /\b(toca|tocar|dedo|dedos|pellizca|tócala|tócalo)\b/i;

describe('tutorial copy', () => {
  it('has words for every step and every goal of the plan', () => {
    for (const step of TUTORIAL_PLAN) {
      const copy = STEP_COPY[step.id];
      expect(copy, step.id).toBeDefined();
      expect(copy.title.length).toBeGreaterThan(0);
      for (const goal of step.goals) {
        for (const device of ['touch', 'mouse'] as const) {
          expect(goalCopy(step.id, goal, device).text.length, `${step.id}/${goal}/${device}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('talks of tapping on touch screens and of clicking with a mouse', () => {
    expect(goalCopy('select', 'select-one', 'touch').text).toMatch(/toca/i);
    expect(goalCopy('select', 'select-one', 'mouse').text).toMatch(/clic/i);
    expect(goalCopy('move', 'move', 'touch').text).toMatch(/toca/i);
    expect(goalCopy('move', 'move', 'mouse').text).toMatch(/clic derecho/i);
    expect(goalCopy('camera', 'zoom', 'touch').text).toMatch(/dedos/i);
    expect(goalCopy('camera', 'zoom', 'mouse').text).toMatch(/rueda/i);
  });

  it('never mixes the devices', () => {
    for (const step of TUTORIAL_PLAN) {
      expect(stepIntro(step.id, 'touch'), step.id).not.toMatch(MOUSE_WORDS);
      expect(stepIntro(step.id, 'mouse'), step.id).not.toMatch(TOUCH_WORDS);
      for (const goal of step.goals) {
        expect(goalCopy(step.id, goal, 'touch').text, `${step.id}/${goal}`).not.toMatch(MOUSE_WORDS);
        expect(goalCopy(step.id, goal, 'mouse').text, `${step.id}/${goal}`).not.toMatch(TOUCH_WORDS);
      }
    }
  });

  it('teaches the touch troop bar: «Soldados» in the bar, highlighted by its chip', () => {
    const group = goalCopy('select', 'select-group', 'touch');
    expect(group.text).toMatch(/toca «Soldados» en la barra/);
    expect(group.selectors[0]).toBe('[data-quick-chip="soldier"]');
    expect(group.selectors).toContain('[data-coach="quick-bar"]');
    expect(goalCopy('attack', 'select-soldiers', 'touch').selectors[0]).toBe('[data-quick-chip="soldier"]');
    // A mouse has no troop bar
    expect(goalCopy('select', 'select-group', 'mouse').selectors).toEqual([]);
  });

  it('wraps up with the endless goal, never the old seven nights', () => {
    for (const device of ['touch', 'mouse'] as const) {
      expect(stepIntro('wrap', device)).toContain('sobrevive el mayor número de noches');
      expect(stepIntro('wrap', device)).not.toMatch(/7 noches/);
    }
  });

  it('every highlight target is a stable selector or a world focus', () => {
    for (const step of TUTORIAL_PLAN) {
      for (const goal of step.goals) {
        for (const device of ['touch', 'mouse'] as const) {
          for (const selector of goalCopy(step.id, goal, device).selectors) expect(selector).toMatch(/^\[(data-|aria-)/);
        }
      }
    }
  });

  it('say() picks the line for the device', () => {
    expect(say('igual', 'touch')).toBe('igual');
    expect(say({ touch: 'toca', mouse: 'haz clic' }, 'touch')).toBe('toca');
    expect(say({ touch: 'toca', mouse: 'haz clic' }, 'mouse')).toBe('haz clic');
    expect(deviceOf(true)).toBe('touch');
    expect(deviceOf(false)).toBe('mouse');
  });

  it('the help card lists the controls of each device', () => {
    const touch = HELP_CONTROLS.touch.map((c) => `${c.what} ${c.how}`).join(' ');
    const mouse = HELP_CONTROLS.mouse.map((c) => `${c.what} ${c.how}`).join(' ');
    expect(touch).toMatch(/toca/i);
    expect(touch).not.toMatch(MOUSE_WORDS);
    expect(mouse).toMatch(/clic/i);
    expect(mouse).not.toMatch(TOUCH_WORDS);
  });

  it('sends the player back to the view a step needs, in the device words', () => {
    expect(STEP_COPY.attack.layer).toBe('surface');
    expect(layerHint('surface', 'touch').text).toMatch(/toca SUPERFICIE/);
    expect(layerHint('surface', 'mouse').text).toMatch(/clic en SUPERFICIE/);
    expect(layerHint('surface', 'touch').selectors[0]).toBe('[aria-label="Superficie"]');
    expect(layerHint('underground', 'mouse').text).toMatch(/NIDO/);
  });
});
