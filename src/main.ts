import './ui/styles.css';
import type { GameState } from './engine';
import { clear } from './ui/dom';
import { GameScreen } from './ui/game/gameScreen';
import { renderLoadScreen, renderMainMenu, renderNewGame, type MenuCallbacks } from './ui/screens/menus';

const host = document.getElementById('app')!;
let game: GameScreen | null = null;

function leaveGame() {
  game?.destroy();
  game = null;
  clear(host);
}

const cb: MenuCallbacks = {
  start(state: GameState) {
    leaveGame();
    game = new GameScreen(host, state, { toMenu: () => cb.menu(), newGame: () => cb.newGame() });
  },
  newGame() {
    leaveGame();
    renderNewGame(host, cb);
  },
  load() {
    leaveGame();
    renderLoadScreen(host, cb);
  },
  menu() {
    leaveGame();
    renderMainMenu(host, cb);
  },
};

cb.menu();

// Geliştirme sırasında konsoldan inceleme için
if (import.meta.env.DEV) (window as unknown as { __inek: unknown }).__inek = { get game() { return game; } };
