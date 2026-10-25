import type { Action, GameState } from './types';

/**
 * Geri alma. Yalnızca rastgelelik içermeyen ve başka bir oyuncunun yanıtına bağlı olmayan eylemler geri
 * alınabilir; bunlar RNG durumunu değiştirmez. Rastgelelik içeren (topaç, savaş, savaşa dönüşen sefer) ya da
 * başka oyuncuları ilgilendiren (diplomasi, oylama) bir eylem yapılınca geçmiş temizlenir: kimse savaş
 * sonucuna bakıp önceki hamlelerini değiştiremez. Geçmiş, sırası olan oyuncuya aittir ve tur bitince silinir.
 */

/** Eylem geri alınabilir mi? (uygulanmadan önceki durumla sorulur) */
export function isUndoable(state: GameState, action: Action): boolean {
  if (action.player !== state.currentPlayer) return false;
  const ph = state.phase.kind;
  switch (action.type) {
    case 'CLAIM_TILE':
    case 'BUILD':
    case 'PRODUCE':
    case 'SET_STRAIT_POLICY':
      return ph === 'actions';
    case 'EXCHANGE_GOLD':
    case 'DISBAND_UNIT':
    case 'DEMOLISH_BASE':
      return ph === 'actions' || ph === 'spin' || ph === 'upkeep';
    case 'SHIP_EXPEDITION':
    case 'PLANE_EXPEDITION':
      // Sahipsiz toprağa sefer savaş değildir, rastgelelik içermez
      return ph === 'actions' && state.owner[action.target] === null;
    default:
      return false;
  }
}

interface UndoEntry {
  state: GameState;
  action: Action;
}

export class UndoHistory {
  private stack: UndoEntry[] = [];
  private owner = -1;
  private turn = -1;

  /** Uygulanan her eylemden sonra çağrılır (botlarınki ve diğer oyuncularınki dahil). */
  record(before: GameState, action: Action, after: GameState) {
    const undoable = isUndoable(before, action) && after.turnCounter === before.turnCounter;
    if (!undoable) {
      this.clear();
      return;
    }
    if (this.owner !== action.player || this.turn !== before.turnCounter) this.clear();
    this.owner = action.player;
    this.turn = before.turnCounter;
    this.stack.push({ state: before, action });
  }

  /** p oyuncusu şu durumda geri alabilir mi? */
  canUndo(state: GameState, p: number): boolean {
    return this.stack.length > 0 && this.owner === p && this.turn === state.turnCounter && state.currentPlayer === p;
  }

  size(): number {
    return this.stack.length;
  }

  /** Son eylemden önceki durumu döner ve geçmişten çıkarır. */
  undo(): UndoEntry | null {
    return this.stack.pop() ?? null;
  }

  clear() {
    this.stack = [];
    this.owner = -1;
    this.turn = -1;
  }
}
