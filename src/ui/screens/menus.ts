import {
  AKCE_FIELDS,
  AKCE_STEP,
  DEFAULT_CONFIG,
  configProblems,
  MAX_PLAYERS,
  MIN_PLAYERS,
  createGame,
  defaultMapSize,
  generateMap,
  toSeed,
  type GameConfig,
  type GameMap,
  type GameState,
  type PlayerSetup,
} from '../../engine';
import { clear, h, openModal, pickFile, toast } from '../dom';
import { MINE_COLOR } from '../format';
import { getPrefs, setPrefs } from '../prefs';
import type { HostRoom } from '../../net/hostRoom';
import type { LobbyInfo, SeatKind } from '../../net/protocol';
import { AUTOSAVE_ID, deleteSave, getSave, importState, listSaves } from '../storage';
import { inviteBox } from './online';

export interface MenuCallbacks {
  start(state: GameState): void;
  newGame(): void;
  load(): void;
  menu(): void;
  /** Çevrimiçi oyun menüsü (oda kur / katıl); code verilirse katılma ekranı açılır */
  online(code?: string): void;
  /** Oda sahibi olarak çevrimiçi oyunu başlat */
  startHost(state: GameState, room: HostRoom, mySeat: number): void;
}

const NAMES = ['Ayşe', 'Mehmet', 'Zeynep', 'Ali', 'Elif', 'Mustafa', 'Fatma', 'Hasan'];
const COLORS = ['#d62828', '#2a7de1', '#2a9d4a', '#f08c00', '#8e44ad', '#e84393', '#8d5524', '#1f9e9e'];

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
        h('div', { class: 'cow' }, '🐄🐄🐄'),
        h('h1', { class: 'title' }, 'İnek Sürüsü'),
        h('p', { class: 'subtitle' }, 'Kareli defterden çıkıp gelen, topaçlı strateji oyunu'),
        h(
          'div',
          { class: 'menu-buttons' },
          auto && auto.state.phase.kind !== 'gameover'
            ? h('button', { class: 'btn btn-primary btn-big', onClick: () => cb.start(auto.state) }, `▶ Devam et (${auto.round > 0 ? `${auto.round}. tur` : 'kurulum'})`)
            : null,
          h('button', { class: `btn btn-big ${auto ? '' : 'btn-primary'}`, onClick: () => cb.newGame() }, '✏️ Yeni oyun'),
          h('button', { class: 'btn btn-big', onClick: () => cb.online() }, '🌐 Çevrimiçi oyun'),
          h('button', { class: 'btn btn-big', onClick: () => cb.load() }, '📂 Kayıtlı oyunu yükle'),
          h('button', { class: 'btn btn-big', onClick: () => openSettings() }, '⚙️ Ayarlar'),
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
    title: '⚙️ Ayarlar',
    body: h(
      'div',
      { class: 'form-grid' },
      h('label', {}, 'Topaç ve savaş animasyonu'),
      anim,
      h('label', {}, 'Botları hızlı oynat'),
      fast,
      h('label', {}, 'Hot-seat sıra geçiş ekranı ("Sıra: X")'),
      pass,
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
    '⬆️ JSON dosyasından içe aktar',
  );
  host.appendChild(
    h(
      'div',
      { class: 'screen' },
      h('div', { class: 'paper-card wide-card' }, h('h1', { class: 'title small-title' }, '📂 Kayıtlı oyunlar'), list, h('div', { class: 'row-buttons' }, h('button', { class: 'btn', onClick: () => cb.menu() }, '← Geri'), importBtn)),
    ),
  );
}

// ------------------------------------------------------------------

interface ConfigField {
  key: keyof GameConfig;
  label: string;
  min: number;
  max: number;
}

const CONFIG_FIELDS: ConfigField[] = [
  { key: 'startAkce', label: 'Başlangıç akçesi', min: 0, max: 100000 },
  { key: 'startTerritoryCount', label: 'Başlangıç toprağı (başkent hariç)', min: 0, max: 30 },
  { key: 'minCapitalDistance', label: 'Başkentler arası en az mesafe', min: 1, max: 20 },
  { key: 'claimCost', label: 'Toprak ele geçirme masrafı', min: 0, max: 10000 },
  { key: 'expeditionClaimCost', label: 'Seferle toprak alma masrafı', min: 0, max: 10000 },
  { key: 'goldToAkce', label: '1 altın = ? akçe', min: 0, max: 10000 },
  { key: 'spinMultiplier', label: 'Topaç çarpanı (sayı × ? akçe)', min: 0, max: 10000 },
  { key: 'shipyardCost', label: 'Tersane maliyeti', min: 0, max: 10000 },
  { key: 'factoryCost', label: 'Uçak fabrikası maliyeti', min: 0, max: 10000 },
  { key: 'baseCost', label: 'Askeri üs maliyeti', min: 0, max: 10000 },
  { key: 'shipAkceCost', label: 'Gemi: akçe', min: 0, max: 10000 },
  { key: 'shipIronCost', label: 'Gemi: demir', min: 0, max: 100 },
  { key: 'planeAkceCost', label: 'Uçak: akçe', min: 0, max: 10000 },
  { key: 'planeSteelCost', label: 'Uçak: çelik', min: 0, max: 100 },
  { key: 'shipOilCost', label: 'Gemi seferi: petrol', min: 0, max: 100 },
  { key: 'planeOilCost', label: 'Uçak seferi: petrol', min: 0, max: 100 },
  { key: 'capitalStreak', label: 'Başkent savaşı: art arda galibiyet', min: 1, max: 10 },
  { key: 'baseStreak', label: 'Üs savaşı: art arda galibiyet', min: 1, max: 10 },
  { key: 'baseBlockRadius', label: 'Üs uçak engeli yarıçapı', min: 0, max: 20 },
  { key: 'maxSortiesPerUnitPerTurn', label: 'Birim başına tur içi sefer (0 = sınırsız)', min: 0, max: 100 },
  { key: 'minesPerTypePerPlayer', label: 'Oyuncu başına maden (her türden)', min: 0, max: 20 },
  { key: 'maxMineDistance', label: 'Her türün en yakın madenine en fazla uzaklık (dengeli düzen)', min: 1, max: 50 },
  { key: 'maxPeaceRounds', label: 'En uzun barış süresi (tur)', min: 1, max: 200 },
  { key: 'landBattleAkce', label: 'Normal savaş masrafı (akçe)', min: 0, max: 10000 },
  { key: 'baseBattleAkce', label: 'Üs savaşı masrafı (akçe)', min: 0, max: 10000 },
  { key: 'baseBattleIron', label: 'Üs savaşı masrafı (demir)', min: 0, max: 100 },
  { key: 'capitalBattleAkce', label: 'Başkent savaşı masrafı (akçe)', min: 0, max: 100000 },
  { key: 'capitalBattleIron', label: 'Başkent savaşı masrafı (demir)', min: 0, max: 100 },
  { key: 'capitalBattleSteel', label: 'Başkent savaşı masrafı (çelik)', min: 0, max: 100 },
  { key: 'shipUpkeep', label: 'Gemi bakımı (akçe/tur)', min: 0, max: 10000 },
  { key: 'planeUpkeep', label: 'Uçak bakımı (akçe/tur)', min: 0, max: 10000 },
  { key: 'baseUpkeep', label: 'Askeri üs bakımı (akçe/tur)', min: 0, max: 10000 },
  { key: 'openingPeaceRounds', label: 'Açılış barışı süresi (tur)', min: 0, max: 100 },
];

/** Aç/kapa kurallar */
const CONFIG_TOGGLES: { key: keyof GameConfig; label: string }[] = [
  { key: 'battleCostsEnabled', label: 'Savaş masrafları' },
  { key: 'upkeepEnabled', label: 'Tur başı bakım' },
  { key: 'weaknessRule', label: 'Zayıflık şartı (başkente yalnızca toprağı senin yarından az olana saldırılır)' },
  { key: 'openingPeace', label: 'Açılış barışı (ilk N tur oyuncu topraklarına saldırı yok)' },
];

/** Yeni oyun ekranı. room verilirse çevrimiçi oda sahibi lobisi olarak çalışır. */
export function renderNewGame(host: HTMLElement, cb: MenuCallbacks, room?: HostRoom) {
  clear(host);
  let count = 4;
  const players: PlayerSetup[] = NAMES.map((name, i) => ({ name, color: COLORS[i], kind: i === 0 ? 'human' : 'bot' }));
  // Çevrimiçi: 1. koltuk oda sahibi, diğerleri davetli ya da bot
  const seatKinds: SeatKind[] = NAMES.map((_, i) => (i === 0 ? 'host' : i <= 2 ? 'remote' : 'bot'));
  let lobby: LobbyInfo | null = null;
  const claimSig = () => (lobby ? lobby.seats.map((x) => x.claimedBy ?? '').join('|') : '');
  const syncLobby = () => {
    if (!room) return;
    room.setLobby(
      players.slice(0, count).map((p, i) => ({ name: p.name, color: p.color, kind: seatKinds[i] })),
      { width: clampInt(wIn.value, 20, 120), height: clampInt(hIn.value, 16, 90), seed: seedText },
    );
  };
  let size = defaultMapSize(count);
  let sizeEdited = false;
  let seedText = String(Math.floor(Math.random() * 1_000_000));
  const config: GameConfig = { ...DEFAULT_CONFIG };

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
          ? h('span', { class: 'tag tag-me' }, '🧑 Sen (oda sahibi)')
          : h(
              'select',
              {
                onChange: (e: Event) => {
                  seatKinds[i] = (e.target as HTMLSelectElement).value as SeatKind;
                  syncLobby();
                },
              },
              h('option', { value: 'remote', selected: seatKinds[i] === 'remote' }, '🌐 Davetli oyuncu'),
              h('option', { value: 'bot', selected: seatKinds[i] === 'bot' }, '🤖 Bot (orta)'),
            )
        : h(
            'select',
            { onChange: (e: Event) => (p.kind = (e.target as HTMLSelectElement).value as 'human' | 'bot') },
            h('option', { value: 'human', selected: p.kind === 'human' }, '🧑 İnsan'),
            h('option', { value: 'bot', selected: p.kind === 'bot' }, '🤖 Bot (orta)'),
          );
      const status =
        room && seatKinds[i] === 'remote' ? h('span', { class: 'muted small' }, claimed ? '✔ oturdu' : '⏳ boş') : null;
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
    const width = clampInt(wIn.value, 20, 120);
    const height = clampInt(hIn.value, 16, 90);
    const seed = toSeed(seedIn.value);
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
    paintPreview(preview, map);
    const land = map.terrain.filter((t) => t === 'land').length;
    previewInfo.textContent = `Seed ${seed} · ${width}×${height} · ${land} kara karesi · ${map.straits.length} boğaz · ${map.terrain.filter((t) => t === 'lake').length} göl karesi`;
  };

  countSel.addEventListener('change', () => {
    count = Number(countSel.value);
    if (!sizeEdited) {
      size = defaultMapSize(count);
      wIn.value = String(size.width);
      hIn.value = String(size.height);
    }
    renderRows();
    syncLobby();
    schedulePreview();
  });
  for (const el of [wIn, hIn]) {
    el.addEventListener('input', () => {
      sizeEdited = true;
      syncLobby();
      schedulePreview();
    });
  }
  seedIn.addEventListener('input', () => {
    seedText = seedIn.value;
    syncLobby();
    schedulePreview();
  });

  const configGrid = h(
    'div',
    { class: 'form-grid config-grid' },
    CONFIG_FIELDS.map((f) => {
      // Akçe değerleri 100'er artıp azalır
      const akce = AKCE_FIELDS.includes(f.key);
      return [
        h('label', {}, f.label),
        h('input', {
          type: 'number',
          class: 'num',
          min: f.min,
          max: f.max,
          // Okla 50'şer değişir; elle yazılan her tam sayı geçerlidir
          step: akce ? AKCE_STEP : 1,
          value: config[f.key] as number,
          onInput: (e: Event) => {
            (config as unknown as Record<string, number>)[f.key] = clampInt((e.target as HTMLInputElement).value, f.min, f.max);
            if (f.key === 'minesPerTypePerPlayer' || f.key === 'startTerritoryCount' || f.key === 'maxMineDistance') schedulePreview();
          },
        }),
      ];
    }),
    CONFIG_TOGGLES.map((t) => [
      h('label', {}, t.label),
      h('input', {
        type: 'checkbox',
        checked: config[t.key] as boolean,
        onChange: (e: Event) => ((config as unknown as Record<string, boolean>)[t.key] = (e.target as HTMLInputElement).checked),
      }),
    ]),
    h('label', {}, 'Maden yerleşimi'),
    h(
      'select',
      {
        onChange: (e: Event) => {
          config.mineLayout = (e.target as HTMLSelectElement).value as 'spread' | 'random';
          schedulePreview();
        },
      },
      h('option', { value: 'spread', selected: true }, 'Dengeli'),
      h('option', { value: 'random' }, 'Rastgele (eski)'),
    ),
    h('label', {}, 'Üs engeli mesafe ölçüsü'),
    h(
      'select',
      { onChange: (e: Event) => (config.baseBlockMetric = (e.target as HTMLSelectElement).value as 'chebyshev' | 'manhattan') },
      h('option', { value: 'chebyshev', selected: true }, 'Chebyshev (kare)'),
      h('option', { value: 'manhattan' }, 'Manhattan (elmas)'),
    ),
  );

  const start = async () => {
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
      }));
    }
    if (new Set(ps.map((p) => p.name)).size !== ps.length) return toast('Oyuncu adları farklı olmalı', 'error');
    try {
      const state = createGame({
        players: ps,
        width: clampInt(wIn.value, 20, 120),
        height: clampInt(hIn.value, 16, 90),
        seed: toSeed(seedText),
        config,
      });
      if (room) cb.startHost(state, room, 0);
      else cb.start(state);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  host.appendChild(
    h(
      'div',
      { class: 'screen' },
      h(
        'div',
        { class: 'paper-card wide-card' },
        h('h1', { class: 'title small-title' }, room ? '🌐 Çevrimiçi oda' : '✏️ Yeni oyun'),
        room ? inviteBox(room.code, peopleEl) : null,
        h(
          'div',
          { class: 'newgame-grid' },
          h('div', {}, h('h3', {}, 'Oyuncular'), h('div', { class: 'row' }, countSel), rowsEl),
          h(
            'div',
            {},
            h('h3', {}, 'Harita'),
            h('div', { class: 'row' }, 'Genişlik ', wIn, ' Yükseklik ', hIn),
            h(
              'div',
              { class: 'row' },
              'Seed ',
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
                '🎲',
              ),
            ),
            preview,
            previewInfo,
          ),
        ),
        h('details', { class: 'rules-config' }, h('summary', {}, '⚙️ Kural ayarları'), configGrid),
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

function clampInt(v: string, min: number, max: number): number {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function paintPreview(canvas: HTMLCanvasElement, map: GameMap) {
  const ctx = canvas.getContext('2d')!;
  const s = Math.min(canvas.width / map.width, canvas.height / map.height);
  const ox = (canvas.width - map.width * s) / 2;
  const oy = (canvas.height - map.height * s) / 2;
  ctx.fillStyle = '#fbf8ef';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < map.terrain.length; i++) {
    const x = i % map.width;
    const y = Math.floor(i / map.width);
    const t = map.terrain[i];
    ctx.fillStyle = map.straitOf[i] >= 0 ? '#c0392b' : t === 'sea' ? '#bcd6ee' : t === 'lake' ? '#9fd6c9' : '#fffdf6';
    ctx.fillRect(ox + x * s, oy + y * s, s, s);
    const m = map.mines[i];
    if (m) {
      ctx.fillStyle = MINE_COLOR[m];
      ctx.beginPath();
      ctx.arc(ox + (x + 0.5) * s, oy + (y + 0.5) * s, s * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.strokeStyle = '#3b3a36';
  ctx.strokeRect(ox, oy, map.width * s, map.height * s);
}
