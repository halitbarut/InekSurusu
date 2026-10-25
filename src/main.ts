import './ui/styles.css';
import type { GameState } from './engine';
import { clear } from './ui/dom';
import { GameScreen, type NetMode } from './ui/game/gameScreen';
import { renderLoadScreen, renderMainMenu, renderNewGame, type MenuCallbacks } from './ui/screens/menus';
import { renderMapList } from './ui/screens/mapEditor';
import { renderOnlineMenu } from './ui/screens/online';
import { bindClickSounds } from './ui/sound';

const host = document.getElementById('app')!;
bindClickSounds();
let game: GameScreen | null = null;

function leaveGame() {
  game?.destroy();
  game = null;
  clear(host);
}

function startGame(state: GameState, net: NetMode = null) {
  leaveGame();
  game = new GameScreen(host, state, { toMenu: () => cb.menu(), newGame: () => cb.newGame() }, net);
}

const cb: MenuCallbacks = {
  start: (state) => startGame(state),
  newGame(mapId) {
    leaveGame();
    renderNewGame(host, cb, undefined, mapId);
  },
  editor() {
    leaveGame();
    renderMapList(host, { menu: () => cb.menu(), playMap: (id) => cb.newGame(id) });
  },
  load() {
    leaveGame();
    renderLoadScreen(host, cb);
  },
  menu() {
    leaveGame();
    // Davet linkinden gelindiyse adres çubuğunu temizle
    if (location.search) history.replaceState(null, '', location.pathname);
    renderMainMenu(host, cb);
  },
  online(code) {
    leaveGame();
    renderOnlineMenu(
      host,
      {
        menu: () => cb.menu(),
        hostLobby: (room) => {
          clear(host);
          renderNewGame(host, cb, room);
        },
        startClient: (state, room) => startGame(state, { kind: 'client', room }),
      },
      code,
    );
  },
  startHost(state, room, mySeat) {
    leaveGame();
    game = new GameScreen(host, state, { toMenu: () => cb.menu(), newGame: () => cb.newGame() }, { kind: 'host', room, mySeat });
    const g = game;
    room.startGame(state, () => g.state);
  },
};

// Davet linki: ?oda=KOD
const invite = new URLSearchParams(location.search).get('oda');
if (invite) cb.online(invite);
else cb.menu();

// Geliştirme sırasında konsoldan inceleme için
if (import.meta.env.DEV) (window as unknown as { __inek: unknown }).__inek = { get game() { return game; } };
