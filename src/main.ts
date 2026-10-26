import './ui/styles.css';
import type { GameState } from './engine';
import { clear } from './ui/dom';
import { GameScreen, type NetMode } from './ui/game/gameScreen';
import { renderLoadScreen, renderMainMenu, renderNewGame, type MenuCallbacks } from './ui/screens/menus';
import { renderMapList } from './ui/screens/mapEditor';
import { renderOnlineMenu } from './ui/screens/online';
import { bindClickSounds } from './ui/sound';
import { parseReplay, type ReplayData } from './engine';
import { ReplayScreen } from './ui/replay/replayScreen';
import { openModal, pickFile, toast } from './ui/dom';
import { TutorialGuide, loadProgress, saveProgress, type GameGuide } from './tutorial/guide';
import { tutorialState } from './tutorial/scenario';
import { STEPS } from './tutorial/steps';

const host = document.getElementById('app')!;
bindClickSounds();
let game: GameScreen | null = null;
let replay: ReplayScreen | null = null;

function leaveGame() {
  game?.destroy();
  game = null;
  replay?.destroy();
  replay = null;
  clear(host);
}

function startGame(state: GameState, net: NetMode = null, rec?: ReplayData, guide: GameGuide | null = null) {
  leaveGame();
  game = new GameScreen(host, state, { toMenu: () => cb.menu(), newGame: () => cb.newGame() }, net, rec, guide);
}

/** Öğreticiyi başlatır; kaldığı yer varsa sorar */
async function startTutorial(fromStart?: boolean) {
  const prog = loadProgress();
  let resume = !fromStart && !prog.done && prog.state !== null && prog.step > 0 && prog.step < STEPS.length;
  if (resume && fromStart === undefined) {
    const m = openModal({
      title: 'Öğretici',
      icon: 'book',
      body: `Öğreticinin ${STEPS[prog.step].topic}. konusunda kalmıştın.`,
      buttons: [
        { label: 'Baştan başla', value: 'restart' },
        { label: 'Kaldığım yerden devam', value: 'resume', primary: true },
      ],
    });
    const v = await m.result;
    if (v === 'close') return;
    resume = v === 'resume';
  }
  saveProgress({ seen: true });
  const state = resume ? prog.state! : tutorialState();
  const step = resume ? prog.step : 0;
  if (!resume) saveProgress({ step: 0, state, done: false });
  startGame(state, null, undefined, new TutorialGuide(step));
}

const cb: MenuCallbacks = {
  start: (state, rec) => startGame(state, null, rec),
  tutorial: (fromStart) => void startTutorial(fromStart),
  async openReplay() {
    const f = await pickFile('application/json,.json');
    if (!f) return;
    try {
      const data = parseReplay(await f.text());
      leaveGame();
      replay = new ReplayScreen(host, { data, viewer: 'all', onClose: () => cb.menu() });
    } catch (e) {
      toast((e as Error).message, 'error', 5000);
    }
  },
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
  online(code, spectate) {
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
      spectate,
    );
  },
  startHost(state, room, mySeat) {
    leaveGame();
    game = new GameScreen(host, state, { toMenu: () => cb.menu(), newGame: () => cb.newGame() }, { kind: 'host', room, mySeat });
    const g = game;
    room.startGame(state, () => g.state, mySeat);
  },
};

// Davet linki: ?oda=KOD (izleyici linki: &izle=1)
const params = new URLSearchParams(location.search);
const invite = params.get('oda');
if (invite) cb.online(invite, params.has('izle'));
else cb.menu();

// Geliştirme sırasında konsoldan inceleme için
if (import.meta.env.DEV) {
  const dbg = { get game() { return game; }, engine: null as unknown };
  (window as unknown as { __inek: unknown }).__inek = dbg;
  void import('./engine').then((m) => (dbg.engine = m));
}
