import { describe, expect, it } from 'vitest';
import { checkMap, DEFAULT_CONFIG, validateAction } from '../src/engine';
import { STEPS, TOPICS, runTutorialScript } from '../src/tutorial/steps';
import { ME, T, ZEYNEP, tutorialState } from '../src/tutorial/scenario';

describe('öğretici', () => {
  it('11 konunun hepsi adımlarda var, her adımda tek bir eylem istenir', () => {
    expect(TOPICS).toHaveLength(11);
    expect([...new Set(STEPS.map((s) => s.topic))]).toEqual(TOPICS.map((_, i) => i + 1));
    for (const s of STEPS) expect(s.todo.length).toBeGreaterThan(5);
  });

  it('sabit seed ile baştan sona oynanır; savaş sonuçları önceden belli', () => {
    const r = runTutorialScript(tutorialState());
    expect(r.failedAt).toBe(-1);
    const battles = r.events.filter((e) => e.type === 'battle');
    expect(battles).toHaveLength(3);
    const [lose, win, cap] = battles.map((b) => b as Extract<typeof b, { type: 'battle' }>);
    expect(lose.target).toBe(T.lose);
    expect(lose.gain).toBe(0);
    expect(lose.loss).toBeGreaterThan(0);
    expect(win.target).toBe(T.win);
    expect(win.gain).toBeGreaterThanOrEqual(2);
    expect(cap.kind).toBe('capital');
    expect(cap.success).toBe(true);
    expect(r.events.some((e) => e.type === 'strait_control' && e.controller === ME)).toBe(true);
    expect(r.events.some((e) => e.type === 'upkeep' && e.player === ME)).toBe(true);
    expect(r.state.phase.kind).toBe('gameover');
    expect(r.state.winners).toEqual([ME, ZEYNEP]);
  });

  it('her adımın başında istenen eylem geçerlidir; her adımdan sonra kaldığı yerden sürdürülebilir', () => {
    let s = tutorialState();
    for (let i = 0; i < STEPS.length; i++) {
      if (s.currentPlayer === ME && !STEPS[i].done(s)) expect(validateAction(s, STEPS[i].script(s)).ok).toBe(true);
      // Kayıttan sürdürme: bu durumdan kalan bütün adımlar hatasız biter
      expect(runTutorialScript(s, i).failedAt).toBe(-1);
      const one = runTutorialScript(s, i, i + 1);
      expect(one.failedAt).toBe(-1);
      s = one.state;
    }
    expect(s.phase.kind).toBe('gameover');
  });

  it('öğretici haritası editör doğrulamasından geçer ve batıdaki koyda bir boğaz var', () => {
    const s = tutorialState();
    const chk = checkMap(s.map, { startTerritoryCount: DEFAULT_CONFIG.startTerritoryCount, minCapitalDistance: DEFAULT_CONFIG.minCapitalDistance });
    expect(chk.errors).toEqual([]);
    expect(s.map.straits).toHaveLength(1);
    expect(s.map.straits[0].banks).toContain(T.bank);
  });

  it('yanlış eyleme izin verilmez', () => {
    const s = tutorialState();
    expect(STEPS[0].allow({ type: 'END_TURN', player: ME }, s)).toBe(false);
    expect(STEPS[1].allow({ type: 'CLAIM_TILE', player: ME, tile: T.gold }, s)).toBe(false);
    expect(STEPS[1].allow({ type: 'CLAIM_TILE', player: ME, tile: T.claim }, s)).toBe(true);
  });
});
