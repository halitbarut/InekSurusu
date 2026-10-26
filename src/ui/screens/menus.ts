import {
  BOT_LEVELS,
  DEFAULT_CONFIG,
  checkMap,
  configProblems,
  createGameFromMap,
  MAX_PLAYERS,
  MIN_PLAYERS,
  createGame,
  generateMap,
  toSeed,
  type BotLevel,
  type GameState,
  type PlayerSetup,
} from '../../engine';
import { BOT_LEVEL_NAME } from '../../bot';
import { clear, h, openModal, pickFile, toast } from '../dom';
import { paintThumb } from '../mapPaint';
import { cowMark, icon } from '../icons';
import { PLAYER_COLORS } from '../playerStyle';
import { mapFromSaved } from './mapEditor';
import { getPrefs, setPrefs } from '../prefs';
import { soundControls } from '../sound';
import type { HostRoom } from '../../net/hostRoom';
import type { LobbyInfo, SeatKind } from '../../net/protocol';
import { AUTOSAVE_ID, deleteSave, getSave, importState, listMaps, listSaves } from '../storage';
import { inviteBox } from './online';
import { clampInt, createRulesPanel } from './rulesPanel';
import { TURN_TIME_CHOICES } from '../game/turnClock';

/** "Kapalı", "1 dakika" … */
export function turnTimeLabel(sec: number): string {
  return sec <= 0 ? 'Kapalı' : `${sec / 60} dakika`;
}

export interface MenuCallbacks {
  start(state: GameState): void;
  /** mapId verilirse kayıtlı harita seçili açılır */
  newGame(mapId?: string): void;
  /** Harita editörü (kayıtlı haritalar listesi) */
  editor(): void;
  load(): void;
  menu(): void;
  /** Çevrimiçi oyun menüsü (oda kur / katıl); code verilirse katılma ekranı açılır */
  online(code?: string): void;
  /** Oda sahibi olarak çevrimiçi oyunu başlat */
  startHost(state: GameState, room: HostRoom, mySeat: number): void;
}

/** Bot seviyesi seçenekleri (değer: "bot:<seviye>") */
function botOptions(selected: BotLevel | null) {
  return BOT_LEVELS.map((lv) => h('option', { value: `bot:${lv}`, selected: selected === lv }, `Bot (${BOT_LEVEL_NAME[lv].toLocaleLowerCase('tr')})`));
}

const NAMES = ['Ayşe', 'Mehmet', 'Zeynep', 'Ali', 'Elif', 'Mustafa', 'Fatma', 'Hasan'];
const COLORS = PLAYER_COLORS;

export function renderMainMenu(host: HTMLElement, cb: MenuCallbacks) {
  clear(host);
  const auto = getSave(AUTOSAVE_ID);
  host.appendChild(
    h(
      'div',
      { class: 'screen menu-screen' },
      h(
        'div',
        { class: 'paper-card menu-card' },
        h('div', { class: 'cow' }, cowMark(92)),
        h('h1', { class: 'title' }, 'İnek Sürüsü'),
        h('p', { class: 'subtitle' }, 'Kareli defterden çıkıp gelen, topaçlı strateji oyunu'),
        h(
          'div',
          { class: 'menu-buttons' },
          auto && auto.state.phase.kind !== 'gameover'
            ? h('button', { class: 'btn btn-primary btn-big', onClick: () => cb.start(auto.state) }, `▶ Devam et (${auto.round > 0 ? `${auto.round}. tur` : 'kurulum'})`)
            : null,
          h('button', { class: `btn btn-big ${auto ? '' : 'btn-primary'}`, onClick: () => cb.newGame() }, icon('newGame'), 'Yeni oyun'),
          h('button', { class: 'btn btn-big', onClick: () => cb.online() }, icon('online'), 'Çevrimiçi oyun'),
          h('button', { class: 'btn btn-big', onClick: () => cb.load() }, icon('load'), 'Kayıtlı oyunu yükle'),
          h('button', { class: 'btn btn-big', onClick: () => cb.editor() }, icon('map'), 'Harita Editörü'),
          h('button', { class: 'btn btn-big', onClick: () => openSettings() }, icon('settings'), 'Ayarlar'),
        ),
        h('p', { class: 'muted small' }, 'Aynı ekranda sırayla (hot-seat), çevrimiçi ya da botlarla 3–8 oyuncu.'),
      ),
    ),
  );
}

function openSettings() {
  const p = getPrefs();
  const anim = h('select', { onChange: (e: Event) => setPrefs({ animSpeed: (e.target as HTMLSelectElement).value as 'normal' | 'fast' | 'off' }) },
    h('option', { value: 'normal', selected: p.animSpeed === 'normal' }, 'Normal'),
    h('option', { value: 'fast', selected: p.animSpeed === 'fast' }, 'Hızlı'),
    h('option', { value: 'off', selected: p.animSpeed === 'off' }, 'Kapalı'),
  );
  const fast = h('input', { type: 'checkbox', checked: p.fastBots, onChange: (e: Event) => setPrefs({ fastBots: (e.target as HTMLInputElement).checked }) });
  const pass = h('input', { type: 'checkbox', checked: p.passScreen, onChange: (e: Event) => setPrefs({ passScreen: (e.target as HTMLInputElement).checked }) });
  openModal({
    title: 'Ayarlar',
    icon: 'settings',
    body: h(
      'div',
      { class: 'form-grid' },
      h('label', {}, 'Topaç ve savaş animasyonu'),
      anim,
      h('label', {}, 'Botları hızlı oynat'),
      fast,
      h('label', {}, 'Hot-seat sıra geçiş ekranı ("Sıra: X")'),
      pass,
      soundControls(),
    ),
    buttons: [{ label: 'Tamam', value: 'ok', primary: true }],
  });
}

export function renderLoadScreen(host: HTMLElement, cb: MenuCallbacks) {
  clear(host);
  const list = h('div', { class: 'save-list' });
  const refresh = () => {
    clear(list);
    const saves = listSaves();
    if (saves.length === 0) list.appendChild(h('p', { class: 'muted' }, 'Bu tarayıcıda kayıtlı oyun yok.'));
    for (const s of saves) {
      list.appendChild(
        h(
          'div',
          { class: 'save-row' },
          h(
            'div',
            {},
            h('b', {}, s.name),
            h('div', { class: 'muted small' }, `${new Date(s.date).toLocaleString('tr-TR')} · ${s.round > 0 ? `${s.round}. tur` : 'kurulum'} · ${s.players.join(', ')}${s.state.phase.kind === 'gameover' ? ' · bitti' : ''}`),
          ),
          h(
            'div',
            { class: 'right' },
            h(
              'button',
              {
                class: 'btn btn-small btn-danger',
                onClick: () => {
                  if (confirm(`"${s.name}" kaydı silinsin mi?`)) {
                    deleteSave(s.id);
                    refresh();
                  }
                },
              },
              'Sil',
            ),
            h('button', { class: 'btn btn-small btn-primary', onClick: () => cb.start(s.state) }, 'Yükle'),
          ),
        ),
      );
    }
  };
  refresh();
  const importBtn = h(
    'button',
    {
      class: 'btn',
      onClick: async () => {
        const f = await pickFile('application/json,.json');
        if (!f) return;
        try {
          cb.start(importState(await f.text()));
        } catch (e) {
          toast((e as Error).message, 'error', 5000);
        }
      },
    },
    icon('upload'),
    'JSON dosyasından içe aktar',
  );
  host.appendChild(
    h(
      'div',
      { class: 'screen' },
      h('div', { class: 'paper-card wide-card' }, h('h1', { class: 'title small-title' }, icon('load', { cls: 'title-icon' }), 'Kayıtlı oyunlar'), list, h('div', { class: 'row-buttons' }, h('button', { class: 'btn', onClick: () => cb.menu() }, '← Geri'), importBtn)),
    ),
  );
}

// ------------------------------------------------------------------

/** Yeni oyun ekranı. room verilirse çevrimiçi oda sahibi lobisi olarak çalışır. */
export function renderNewGame(host: HTMLElement, cb: MenuCallbacks, room?: HostRoom, mapId?: string) {
  clear(host);
  let count = 4;
  const players: PlayerSetup[] = NAMES.map((name, i) => ({ name, color: COLORS[i], kind: i === 0 ? 'human' : 'bot' }));
  // Çevrimiçi: 1. koltuk oda sahibi, diğerleri davetli ya da bot
  const seatKinds: SeatKind[] = NAMES.map((_, i) => (i === 0 ? 'host' : i <= 2 ? 'remote' : 'bot'));
  const seatBotLevels: BotLevel[] = NAMES.map(() => 'medium');
  let lobby: LobbyInfo | null = null;
  const claimSig = () => (lobby ? lobby.seats.map((x) => x.claimedBy ?? '').join('|') : '');
  const syncLobby = () => {
    if (!room) return;
    room.setLobby(
      players.slice(0, count).map((p, i) => ({ name: p.name, color: p.color, kind: seatKinds[i], botLevel: seatKinds[i] === 'bot' ? seatBotLevels[i] : undefined })),
      { width: clampInt(wIn.value, 20, 120), height: clampInt(hIn.value, 16, 90), seed: seedText, rules: rules.label(), mapName: savedMap()?.name, turnSeconds: turnSeconds() },
    );
  };
  let seedText = String(Math.floor(Math.random() * 1_000_000));
  // Maç ayarı: tur süresi (kurallardan bağımsız, önayarları etkilemez)
  const timeSel = h(
    'select',
    { 'aria-label': 'Tur süresi', onChange: () => syncLobby() },
    TURN_TIME_CHOICES.map((sec) => h('option', { value: sec, selected: sec === 0 }, turnTimeLabel(sec))),
  );
  const turnSeconds = () => Number(timeSel.value) || 0;
  const rules = createRulesPanel((what) => {
    if (what === 'size') {
      const size = rules.mapSize(count);
      wIn.value = String(size.width);
      hIn.value = String(size.height);
    }
    syncLobby();
    schedulePreview();
  });
  const size = rules.mapSize(count);

  // Harita kaynağı: rastgele (seed) ya da harita editöründe kaydedilmiş harita
  const maps = listMaps();
  let savedId: string | null = mapId && maps.some((m) => m.id === mapId) ? mapId : null;
  const savedMap = () => (savedId ? (maps.find((m) => m.id === savedId) ?? null) : null);
  const mapWarn = h('div', { class: 'map-warn hidden' });
  const randomRows = h('div', {});
  const sourceSel = h(
    'select',
    {
      'aria-label': 'Harita kaynağı',
      onChange: (e: Event) => {
        const v = (e.target as HTMLSelectElement).value;
        savedId = v === 'random' ? null : v;
        randomRows.classList.toggle('hidden', savedId !== null);
        syncLobby();
        schedulePreview();
      },
    },
    h('option', { value: 'random', selected: !savedId }, 'Rastgele harita'),
    maps.length ? h('optgroup', { label: 'Kayıtlı haritalar' }, maps.map((m) => h('option', { value: m.id, selected: m.id === savedId }, m.name))) : null,
  );
  if (savedId) randomRows.classList.add('hidden');
  const sizeRow = () => randomRows.append(h('div', { class: 'row' }, 'Genişlik ', wIn, ' Yükseklik ', hIn));

  const rowsEl = h('div', { class: 'player-rows' });
  const peopleEl = h('div', { class: 'people muted' }, 'Henüz kimse katılmadı.');
  const countSel = h('select', {}, ...Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, k) => {
    const n = k + MIN_PLAYERS;
    return h('option', { value: n, selected: n === count }, `${n} oyuncu`);
  }));
  const wIn = h('input', { type: 'number', class: 'num', min: 20, max: 120, value: size.width });
  const hIn = h('input', { type: 'number', class: 'num', min: 16, max: 90, value: size.height });
  const seedIn = h('input', { type: 'text', class: 'text seed', value: seedText });
  const preview = h('canvas', { class: 'map-preview', width: 300, height: 220 });
  const previewInfo = h('div', { class: 'muted small' });

  const renderRows = () => {
    clear(rowsEl);
    for (let i = 0; i < count; i++) {
      const p = players[i];
      const claimed = room ? lobby?.seats[i]?.claimedBy : null;
      const locked = !!claimed;
      const shown = locked ? lobby!.seats[i] : p;
      const kindSel = room
        ? i === 0
          ? h('span', { class: 'tag tag-me' }, icon('human'), 'Sen (oda sahibi)')
          : h(
              'select',
              {
                title: 'Koltuk',
                onChange: (e: Event) => {
                  const v = (e.target as HTMLSelectElement).value;
                  seatKinds[i] = v === 'remote' ? 'remote' : 'bot';
                  if (v !== 'remote') seatBotLevels[i] = v.slice(4) as BotLevel;
                  syncLobby();
                },
              },
              h('option', { value: 'remote', selected: seatKinds[i] === 'remote' }, 'Davetli oyuncu'),
              botOptions(seatKinds[i] === 'bot' ? seatBotLevels[i] : null),
            )
        : h(
            'select',
            {
              title: 'Oyuncu türü',
              onChange: (e: Event) => {
                const v = (e.target as HTMLSelectElement).value;
                p.kind = v === 'human' ? 'human' : 'bot';
                if (v !== 'human') p.botLevel = v.slice(4) as BotLevel;
              },
            },
            h('option', { value: 'human', selected: p.kind === 'human' }, 'İnsan'),
            botOptions(p.kind === 'bot' ? (p.botLevel ?? 'medium') : null),
          );
      const status =
        room && seatKinds[i] === 'remote' ? h('span', { class: 'muted small' }, claimed ? 'oturdu' : 'boş') : null;
      rowsEl.appendChild(
        h(
          'div',
          { class: 'player-setup' },
          h('span', { class: 'num-badge' }, i + 1),
          h('input', {
            type: 'color',
            value: shown.color,
            disabled: locked,
            onInput: (e: Event) => {
              p.color = (e.target as HTMLInputElement).value;
              syncLobby();
            },
          }),
          h('input', {
            type: 'text',
            class: 'text',
            value: shown.name,
            maxLength: 16,
            disabled: locked,
            onInput: (e: Event) => {
              p.name = (e.target as HTMLInputElement).value;
              syncLobby();
            },
          }),
          kindSel,
          status,
        ),
      );
    }
  };

  let previewTimer = 0;
  const schedulePreview = () => {
    clearTimeout(previewTimer);
    previewTimer = window.setTimeout(drawPreview, 120);
  };
  const drawPreview = () => {
    const saved = savedMap();
    mapWarn.classList.add('hidden');
    if (saved) {
      const config = rules.config();
      try {
        const map = mapFromSaved(saved);
        paintThumb(preview, map);
        const chk = checkMap(map, config);
        previewInfo.textContent = `${saved.name} · ${map.width}×${map.height} · ${chk.land} kara karesi · ${chk.straits} boğaz · ${chk.lakes} göl · en fazla ${chk.maxPlayers} oyuncu`;
        if (chk.maxPlayers < count) {
          mapWarn.textContent = `Bu harita ${count} oyuncuya uygun değil: en fazla ${chk.maxPlayers} oyuncuya başlangıç alanı ayrılabiliyor. Oyuncu sayısını azalt ya da başka harita seç.`;
          mapWarn.classList.remove('hidden');
        }
      } catch (e) {
        previewInfo.textContent = (e as Error).message;
      }
      return;
    }
    const width = clampInt(wIn.value, 20, 120);
    const height = clampInt(hIn.value, 16, 90);
    const seed = toSeed(seedIn.value);
    const config = rules.config();
    const map = generateMap({
      width,
      height,
      seed,
      players: count,
      minesPerTypePerPlayer: config.minesPerTypePerPlayer,
      startTerritoryCount: config.startTerritoryCount,
      minCapitalDistance: config.minCapitalDistance,
      mineLayout: config.mineLayout,
      maxMineDistance: config.maxMineDistance,
    });
    paintThumb(preview, map);
    const land = map.terrain.filter((t) => t === 'land').length;
    previewInfo.textContent = `Seed ${seed} · ${width}×${height} · ${land} kara karesi · ${map.straits.length} boğaz · ${map.terrain.filter((t) => t === 'lake').length} göl karesi`;
  };

  countSel.addEventListener('change', () => {
    count = Number(countSel.value);
    const size = rules.mapSize(count);
    wIn.value = String(size.width);
    hIn.value = String(size.height);
    renderRows();
    syncLobby();
    schedulePreview();
  });
  for (const el of [wIn, hIn]) {
    el.addEventListener('input', () => {
      rules.sizeEdited(clampInt(wIn.value, 20, 120), clampInt(hIn.value, 16, 90));
      syncLobby();
      schedulePreview();
    });
  }
  seedIn.addEventListener('input', () => {
    seedText = seedIn.value;
    syncLobby();
    schedulePreview();
  });

  const start = async () => {
    const config = rules.config();
    const problems = configProblems(config);
    if (problems.length) return toast(`Kural ayarları geçersiz: ${problems.join('; ')}`, 'error', 6000);
    let ps = players.slice(0, count).map((p, i) => ({ ...p, name: p.name.trim() || `Oyuncu ${i + 1}` }));
    if (room) {
      const seats = room.lobby().seats;
      const empty = seats.filter((x) => x.kind === 'remote' && !x.claimedBy).length;
      if (empty > 0) {
        const m = openModal({
          title: 'Boş koltuklar',
          body: h('p', {}, `${empty} davetli koltuğu hâlâ boş. Bu koltuklarda bot oynasın mı?`),
          buttons: [
            { label: 'Bekle', value: 'no' },
            { label: 'Botla başlat', value: 'yes', primary: true },
          ],
        });
        if ((await m.result) !== 'yes') return;
      }
      ps = seats.map((x, i) => ({
        name: (x.claimedBy ? x.name : ps[i].name).trim() || `Oyuncu ${i + 1}`,
        color: x.claimedBy ? x.color : ps[i].color,
        kind: x.kind === 'host' || x.claimedBy ? ('human' as const) : ('bot' as const),
        // Boş kalan davetli koltuklarda orta seviye bot oynar
        botLevel: x.kind === 'bot' ? (x.botLevel ?? 'medium') : ('medium' as const),
      }));
    }
    if (new Set(ps.map((p) => p.name)).size !== ps.length) return toast('Oyuncu adları farklı olmalı', 'error');
    try {
      const saved = savedMap();
      let state: GameState;
      if (saved) {
        const map = mapFromSaved(saved);
        const chk = checkMap(map, config);
        if (chk.maxPlayers < ps.length) return toast(`"${saved.name}" haritası ${ps.length} oyuncuya uygun değil (en fazla ${chk.maxPlayers}).`, 'error', 6000);
        state = createGameFromMap(map, ps, { ...DEFAULT_CONFIG, ...config }, toSeed(seedText));
      } else {
        state = createGame({
          players: ps,
          width: clampInt(wIn.value, 20, 120),
          height: clampInt(hIn.value, 16, 90),
          seed: toSeed(seedText),
          config,
        });
      }
      if (turnSeconds() > 0) state.options = { turnSeconds: turnSeconds() };
      if (room) cb.startHost(state, room, 0);
      else cb.start(state);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  sizeRow();
  host.appendChild(
    h(
      'div',
      { class: 'screen' },
      h(
        'div',
        { class: 'paper-card wide-card' },
        h('h1', { class: 'title small-title' }, icon(room ? 'online' : 'newGame', { cls: 'title-icon' }), room ? 'Çevrimiçi oda' : 'Yeni oyun'),
        room ? inviteBox(room.code, peopleEl) : null,
        h(
          'div',
          { class: 'newgame-grid' },
          h('div', {}, h('h3', {}, 'Oyuncular'), h('div', { class: 'row' }, countSel), rowsEl),
          h(
            'div',
            {},
            h('h3', {}, 'Harita'),
            h('div', { class: 'row' }, sourceSel),
            randomRows,
            h(
              'div',
              { class: 'row' },
              h('span', { title: 'Rastgele haritayı ve oyundaki topaç sonuçlarını belirler' }, 'Seed '),
              seedIn,
              h(
                'button',
                {
                  class: 'btn btn-small',
                  title: 'Rastgele seed',
                  onClick: () => {
                    seedIn.value = seedText = String(Math.floor(Math.random() * 1_000_000));
                    schedulePreview();
                  },
                },
                icon('dice'),
              ),
            ),
            preview,
            previewInfo,
            mapWarn,
          ),
        ),
        h(
          'div',
          { class: 'match-options' },
          h('h3', {}, 'Maç ayarları'),
          h(
            'div',
            { class: 'row' },
            h('label', { title: 'Süre dolunca topaç kendiliğinden çevrilir, bekleyen zorunlu seçimler Orta bot gibi yapılır ve tur biter' }, icon('clock'), ' Tur süresi '),
            timeSel,
            h('span', { class: 'muted small' }, 'Süre dolunca topaç çevrilir, zorunlu seçimler otomatik yapılır, tur biter.'),
          ),
        ),
        rules.el,
        h(
          'div',
          { class: 'row-buttons' },
          h(
            'button',
            {
              class: 'btn',
              onClick: () => {
                room?.close();
                cb.menu();
              },
            },
            room ? '← Odayı kapat' : '← Geri',
          ),
          h('button', { class: 'btn btn-primary btn-big', onClick: () => void start() }, '▶ Oyunu başlat'),
        ),
      ),
    ),
  );
  renderRows();
  drawPreview();
  if (room) {
    room.events.onLobbyChange = (l) => {
      const before = claimSig();
      lobby = l;
      // Yazarken odak kaybolmasın: satırları yalnızca koltuk sahipliği değişince yeniden çiz
      if (claimSig() !== before) renderRows();
      else
        l.seats.forEach((x, i) => {
          if (!x.claimedBy) return;
          const row = rowsEl.children[i];
          const name = row?.querySelector('input.text') as HTMLInputElement | null;
          if (name) name.value = x.name;
          const color = row?.querySelector('input[type=color]') as HTMLInputElement | null;
          if (color) color.value = x.color;
        });
      const seated = l.seats.filter((x) => x.claimedBy).map((x) => x.name);
      peopleEl.textContent = `Oturanlar: ${seated.length ? seated.join(', ') : '—'} · İzleyiciler: ${l.spectators.length ? l.spectators.join(', ') : '—'}`;
    };
    syncLobby();
  }
}
