import {
  DEFAULT_CONFIG,
  MAP_MAX_SIZE,
  MAP_MIN_SIZE,
  MAX_PLAYERS,
  MINE_TYPES,
  MIN_PLAYERS,
  autoPlaceMines,
  buildMap,
  checkMap,
  defaultMapSize,
  draftFromMap,
  draftFromRows,
  draftToRows,
  emptyDraft,
  fillRegion,
  generateMap,
  toSeed,
  type GameMap,
  type MapCheck,
  type MapDraft,
  type MineType,
} from '../../engine';
import { append, clear, download, h, pickFile, toast } from '../dom';
import { MINE_COLOR, MINE_LETTER, RES_NAME } from '../format';
import { PAINT, paintThumb } from '../mapPaint';
import { deleteMap, exportMap, importMap, listMaps, saveMap, type SavedMap } from '../storage';
import { clampInt } from './rulesPanel';

export interface EditorCallbacks {
  menu(): void;
  /** Kayıtlı haritayla yeni oyun ekranını aç */
  playMap(id: string): void;
}

/** Haritayı varsayılan kurallarla denetler */
export function checkDefault(map: GameMap): MapCheck {
  const c = DEFAULT_CONFIG;
  return checkMap(map, { startTerritoryCount: c.startTerritoryCount, minCapitalDistance: c.minCapitalDistance, maxMineDistance: c.maxMineDistance });
}

export function mapFromSaved(m: SavedMap): GameMap {
  return buildMap(draftFromRows(m.rows), m.name);
}

// ------------------------------------------------------------------
// Liste ekranı
// ------------------------------------------------------------------

export function renderMapList(host: HTMLElement, cb: EditorCallbacks) {
  clear(host);
  const list = h('div', { class: 'map-list' });
  const refresh = () => {
    clear(list);
    const maps = listMaps();
    if (maps.length === 0) list.appendChild(h('p', { class: 'muted' }, 'Henüz kayıtlı haritan yok. Boş bir kâğıtla ya da rastgele bir haritayla başla.'));
    for (const m of maps) {
      let map: GameMap | null = null;
      let check: MapCheck | null = null;
      try {
        map = mapFromSaved(m);
        check = checkDefault(map);
      } catch {
        // bozuk kayıt: yine de listelenir, silinebilir
      }
      const thumb = h('canvas', { class: 'map-thumb', width: 168, height: 118 });
      if (map) paintThumb(thumb, map);
      list.appendChild(
        h(
          'div',
          { class: 'map-item' },
          thumb,
          h(
            'div',
            { class: 'map-item-info' },
            h('b', {}, m.name),
            h(
              'div',
              { class: 'muted small' },
              map ? `${map.width}×${map.height} · ${check!.maxPlayers >= MIN_PLAYERS ? `en fazla ${check!.maxPlayers} oyuncu` : 'oynanamaz'}` : 'Bozuk kayıt',
            ),
            h('div', { class: 'muted small' }, new Date(m.date).toLocaleString('tr-TR')),
          ),
          h(
            'div',
            { class: 'map-item-actions' },
            map ? h('button', { class: 'btn btn-small btn-primary', onClick: () => openEditor(host, cb, draftFromRows(m.rows), m) }, 'Düzenle') : null,
            map && check!.maxPlayers >= MIN_PLAYERS ? h('button', { class: 'btn btn-small', onClick: () => cb.playMap(m.id) }, 'Oyna') : null,
            h('button', { class: 'btn btn-small', onClick: () => download(`harita-${slug(m.name)}.json`, exportMap(m)) }, 'Dışa aktar'),
            h(
              'button',
              {
                class: 'btn btn-small btn-danger',
                onClick: () => {
                  if (!confirm(`"${m.name}" haritası silinsin mi? Bu haritayla kaydedilmiş oyunlar yine açılabilir.`)) return;
                  deleteMap(m.id);
                  refresh();
                },
              },
              'Sil',
            ),
          ),
        ),
      );
    }
  };
  refresh();

  const size = defaultMapSize(5);
  const wIn = h('input', { type: 'number', class: 'num', min: MAP_MIN_SIZE, max: MAP_MAX_SIZE, value: size.width, 'aria-label': 'Genişlik' });
  const hIn = h('input', { type: 'number', class: 'num', min: MAP_MIN_SIZE, max: MAP_MAX_SIZE, value: size.height, 'aria-label': 'Yükseklik' });
  const playersSel = h('select', { 'aria-label': 'Oyuncu sayısı' }, Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, k) => h('option', { value: k + MIN_PLAYERS, selected: k + MIN_PLAYERS === 5 }, `${k + MIN_PLAYERS} oyuncu`)));
  const dims = () => ({ w: clampInt(wIn.value, MAP_MIN_SIZE, MAP_MAX_SIZE), h: clampInt(hIn.value, MAP_MIN_SIZE, MAP_MAX_SIZE) });

  host.appendChild(
    h(
      'div',
      { class: 'screen' },
      h(
        'div',
        { class: 'paper-card wide-card' },
        h('h1', { class: 'title small-title' }, 'Harita Editörü'),
        h(
          'div',
          { class: 'map-new' },
          h('div', { class: 'row' }, 'Boyut ', wIn, ' × ', hIn),
          h(
            'div',
            { class: 'row' },
            h('button', { class: 'btn btn-primary', onClick: () => openEditor(host, cb, emptyDraft(dims().w, dims().h), null) }, 'Boş kâğıt'),
            h(
              'button',
              {
                class: 'btn',
                title: 'Rastgele üretilmiş bir haritayı başlangıç olarak al',
                onClick: () => {
                  const { w, h: hh } = dims();
                  const map = generateMap({ width: w, height: hh, seed: Math.floor(Math.random() * 1e6), players: Number(playersSel.value), minesPerTypePerPlayer: 1, startTerritoryCount: 9 });
                  openEditor(host, cb, draftFromMap(map), null);
                },
              },
              'Rastgele harita',
            ),
            playersSel,
            h(
              'button',
              {
                class: 'btn',
                onClick: async () => {
                  const f = await pickFile('application/json,.json');
                  if (!f) return;
                  try {
                    const m = importMap(await f.text());
                    const d = draftFromRows(m.rows);
                    saveMap({ id: newId(), name: uniqueName(m.name), rows: draftToRows(d) });
                    toast(`"${m.name}" içe aktarıldı`, 'good');
                    refresh();
                  } catch (e) {
                    toast((e as Error).message, 'error', 5000);
                  }
                },
              },
              'JSON içe aktar',
            ),
          ),
        ),
        h('h3', {}, 'Kayıtlı haritalar'),
        list,
        h('div', { class: 'row-buttons' }, h('button', { class: 'btn', onClick: () => cb.menu() }, '← Ana menü')),
      ),
    ),
  );
}

function newId(): string {
  return `m${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
}

function uniqueName(name: string): string {
  const names = new Set(listMaps().map((m) => m.name));
  if (!names.has(name)) return name;
  for (let k = 2; ; k++) if (!names.has(`${name} (${k})`)) return `${name} (${k})`;
}

function slug(name: string): string {
  return name.toLocaleLowerCase('tr').replace(/[^a-z0-9çğıöşü]+/g, '-').replace(/^-|-$/g, '') || 'harita';
}

// ------------------------------------------------------------------
// Düzenleyici
// ------------------------------------------------------------------

type Tool = 'land' | 'sea' | 'fill' | 'mine' | 'erase';

interface Snapshot {
  land: boolean[];
  mines: (MineType | null)[];
}

const TOOLS: { id: Tool; label: string; tip: string }[] = [
  { id: 'land', label: 'Kara', tip: 'Kara fırçası (K)' },
  { id: 'sea', label: 'Deniz', tip: 'Deniz fırçası (D)' },
  { id: 'fill', label: 'Kova', tip: 'Tıklanan bölgeyi seçili zemin rengiyle doldur (B)' },
  { id: 'mine', label: 'Maden', tip: 'Maden yerleştir (M)' },
  { id: 'erase', label: 'Silgi', tip: 'Madeni sil (E)' },
];

function openEditor(host: HTMLElement, cb: EditorCallbacks, draft: MapDraft, saved: SavedMap | null) {
  clear(host);
  let d = draft;
  let id = saved?.id ?? null;
  let tool: Tool = 'land';
  /** Kova ile doldurulacak zemin */
  let fillLand = true;
  let mineType: MineType = 'gold';
  let brush = 2;
  let dirty = false;
  const past: Snapshot[] = [];
  const future: Snapshot[] = [];
  let map = buildMap(d);
  let check = checkDefault(map);

  const canvas = h('canvas', { class: 'editor-canvas' });
  const wrap = h('div', { class: 'editor-canvas-wrap' }, canvas);
  const ctx = canvas.getContext('2d')!;
  const nameIn = h('input', { type: 'text', class: 'text', maxLength: 40, value: saved?.name ?? '', placeholder: 'Harita adı' });
  const toolsEl = h('div', { class: 'editor-tools' });
  const minesEl = h('div', { class: 'editor-mines' });
  const checkEl = h('div', { class: 'editor-check' });
  const undoBtn = h('button', { class: 'btn btn-small', title: 'Geri al (Ctrl+Z)', onClick: () => undo() }, '↶ Geri al');
  const redoBtn = h('button', { class: 'btn btn-small', title: 'Yinele (Ctrl+Y)', onClick: () => redo() }, '↷ Yinele');
  const brushIn = h('input', { type: 'range', min: 1, max: 6, value: brush, 'aria-label': 'Fırça boyutu' });
  const brushLbl = h('span', { class: 'small' }, `${brush}`);
  brushIn.addEventListener('input', () => {
    brush = Number(brushIn.value);
    brushLbl.textContent = `${brush}`;
  });
  const autoSel = h('select', { 'aria-label': 'Oyuncu sayısı' }, Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, k) => h('option', { value: k + MIN_PLAYERS, selected: k + MIN_PLAYERS === 5 }, `${k + MIN_PLAYERS} oyuncu`)));

  const snapshot = (): Snapshot => ({ land: [...d.land], mines: [...d.mines] });
  const restore = (s: Snapshot) => {
    d = { ...d, land: [...s.land], mines: [...s.mines] };
  };
  const pushUndo = () => {
    past.push(snapshot());
    if (past.length > 200) past.shift();
    future.length = 0;
  };
  const undo = () => {
    const s = past.pop();
    if (!s) return;
    future.push(snapshot());
    restore(s);
    changed();
  };
  const redo = () => {
    const s = future.pop();
    if (!s) return;
    past.push(snapshot());
    restore(s);
    changed();
  };

  /** Haritayı yeniden kurar (göller, boğazlar) ve doğrular */
  const changed = () => {
    dirty = true;
    map = buildMap(d);
    check = checkDefault(map);
    renderCheck();
    paint();
    undoBtn.disabled = past.length === 0;
    redoBtn.disabled = future.length === 0;
  };

  const renderTools = () => {
    clear(toolsEl);
    for (const t of TOOLS) {
      toolsEl.appendChild(
        h(
          'button',
          {
            class: `btn btn-small tool-btn ${tool === t.id ? 'active' : ''}`,
            title: t.tip,
            'aria-pressed': tool === t.id ? 'true' : 'false',
            onClick: () => {
              if (t.id === 'land' || t.id === 'sea') fillLand = t.id === 'land';
              tool = t.id;
              renderTools();
            },
          },
          t.label,
        ),
      );
    }
    toolsEl.appendChild(h('span', { class: 'small muted' }, tool === 'fill' ? `Kova: ${fillLand ? 'kara' : 'deniz'} ile doldurur` : ''));
    clear(minesEl);
    for (const m of MINE_TYPES) {
      minesEl.appendChild(
        h(
          'button',
          {
            class: `btn btn-small tool-btn ${tool === 'mine' && mineType === m ? 'active' : ''}`,
            title: `${RES_NAME[m]} madeni`,
            onClick: () => {
              tool = 'mine';
              mineType = m;
              renderTools();
            },
          },
          h('span', { class: 'mine-chip', style: { background: MINE_COLOR[m] } }, MINE_LETTER[m]),
          ` ${RES_NAME[m]}`,
        ),
      );
    }
  };

  const renderCheck = () => {
    clear(checkEl);
    const ok = check.errors.length === 0;
    append(checkEl, [
      h('div', { class: `check-head ${ok ? 'good' : 'bad'}` }, ok ? `✔ ${MIN_PLAYERS}–${check.maxPlayers} oyuncu için uygun` : '✘ Henüz oynanamaz'),
      h(
        'div',
        { class: 'muted small' },
        `${map.width}×${map.height} · ${check.land} kara · ${check.straits} boğaz · ${check.lakes} göl · maden: ${MINE_TYPES.map((m) => `${MINE_LETTER[m]} ${check.mines[m]}`).join(', ')}`,
      ),
      check.errors.length ? h('ul', { class: 'check-list bad' }, check.errors.map((e) => h('li', {}, e))) : null,
      check.warnings.length ? h('ul', { class: 'check-list warn' }, check.warnings.map((e) => h('li', {}, e))) : null,
      h(
        'p',
        { class: 'muted small' },
        `Her oyuncu madensiz bir başkent ve ona bitişik ${DEFAULT_CONFIG.startTerritoryCount} madensiz toprakla başlar; başkentler arası en az ${DEFAULT_CONFIG.minCapitalDistance} kare. Göller ve boğazlar kendiliğinden bulunur.`,
      ),
    ]);
  };

  // ---------- çizim ----------
  let cell = 10;
  let ox = 0;
  let oy = 0;
  const layout = () => {
    const r = wrap.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    canvas.style.width = `${r.width}px`;
    canvas.style.height = `${r.height}px`;
    cell = Math.max(3, Math.floor(Math.min(r.width / d.width, r.height / d.height)));
    ox = Math.floor((r.width - cell * d.width) / 2);
    oy = Math.floor((r.height - cell * d.height) / 2);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    paint();
  };
  let hover = -1;
  const paint = () => {
    const W = canvas.width;
    const H = canvas.height;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = PAINT.paper;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    for (let i = 0; i < d.land.length; i++) {
      const x = ox + (i % d.width) * cell;
      const y = oy + Math.floor(i / d.width) * cell;
      // Fırça sürerken taslak, bırakınca kurulan harita (göl ve boğazlar) çizilir
      const t = d.land[i] ? 'land' : map.terrain[i] === 'land' ? 'sea' : map.terrain[i];
      ctx.fillStyle = map.straitOf[i] >= 0 && !d.land[i] ? PAINT.strait : t === 'land' ? PAINT.land : t === 'lake' ? PAINT.lake : PAINT.sea;
      ctx.fillRect(x, y, cell, cell);
    }
    if (cell >= 6) {
      ctx.strokeStyle = 'rgba(86, 140, 200, 0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= d.width; x++) {
        ctx.moveTo(ox + x * cell + 0.5, oy);
        ctx.lineTo(ox + x * cell + 0.5, oy + d.height * cell);
      }
      for (let y = 0; y <= d.height; y++) {
        ctx.moveTo(ox, oy + y * cell + 0.5);
        ctx.lineTo(ox + d.width * cell, oy + y * cell + 0.5);
      }
      ctx.stroke();
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < d.mines.length; i++) {
      const m = d.mines[i];
      if (!m || !d.land[i]) continue;
      const cx = ox + ((i % d.width) + 0.5) * cell;
      const cy = oy + (Math.floor(i / d.width) + 0.5) * cell;
      ctx.fillStyle = MINE_COLOR[m];
      ctx.beginPath();
      ctx.arc(cx, cy, cell * 0.38, 0, Math.PI * 2);
      ctx.fill();
      if (cell >= 12) {
        ctx.fillStyle = m === 'gold' ? '#3a2a00' : '#fff';
        ctx.font = `bold ${Math.round(cell * 0.5)}px "Patrick Hand", sans-serif`;
        ctx.fillText(MINE_LETTER[m], cx, cy + 1);
      }
    }
    // Boğaz etiketleri
    if (cell >= 10) {
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${Math.round(cell * 0.45)}px "Patrick Hand", sans-serif`;
      for (const st of map.straits) {
        const t = st.tiles[Math.floor(st.tiles.length / 2)];
        ctx.fillText(`B${st.id + 1}`, ox + ((t % d.width) + 0.5) * cell, oy + (Math.floor(t / d.width) + 0.5) * cell);
      }
    }
    // Fırça izi
    if (hover >= 0 && (tool === 'land' || tool === 'sea' || tool === 'erase')) {
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 1.5;
      const r = brush - 1;
      const hx = hover % d.width;
      const hy = Math.floor(hover / d.width);
      const x0 = Math.max(0, hx - Math.floor(r / 2));
      const y0 = Math.max(0, hy - Math.floor(r / 2));
      ctx.strokeRect(ox + x0 * cell, oy + y0 * cell, Math.min(brush, d.width - x0) * cell, Math.min(brush, d.height - y0) * cell);
    } else if (hover >= 0) {
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(ox + (hover % d.width) * cell, oy + Math.floor(hover / d.width) * cell, cell, cell);
    }
    ctx.strokeStyle = PAINT.pencil;
    ctx.lineWidth = 2;
    ctx.strokeRect(ox, oy, d.width * cell, d.height * cell);
  };

  const tileAt = (e: PointerEvent): number => {
    const r = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - r.left - ox) / cell);
    const y = Math.floor((e.clientY - r.top - oy) / cell);
    if (x < 0 || y < 0 || x >= d.width || y >= d.height) return -1;
    return y * d.width + x;
  };

  /** Fırçayı tek bir kareye uygular */
  const stamp = (t: number) => {
    const tx = t % d.width;
    const ty = Math.floor(t / d.width);
    const off = Math.floor((brush - 1) / 2);
    for (let y = ty - off; y < ty - off + brush; y++) {
      for (let x = tx - off; x < tx - off + brush; x++) {
        if (x < 0 || y < 0 || x >= d.width || y >= d.height) continue;
        const i = y * d.width + x;
        if (tool === 'land') d.land[i] = true;
        else if (tool === 'sea') {
          d.land[i] = false;
          d.mines[i] = null;
        } else if (tool === 'erase') d.mines[i] = null;
      }
    }
  };

  let drawing = false;
  let last = -1;
  canvas.addEventListener('pointerdown', (e) => {
    const t = tileAt(e);
    if (t < 0) return;
    canvas.setPointerCapture(e.pointerId);
    pushUndo();
    if (tool === 'fill') {
      for (const i of fillRegion(d, t)) {
        d.land[i] = fillLand;
        if (!fillLand) d.mines[i] = null;
      }
      changed();
      return;
    }
    if (tool === 'mine') {
      if (!d.land[t]) {
        past.pop();
        toast('Maden yalnızca karaya konur', 'error');
        return;
      }
      d.mines[t] = d.mines[t] === mineType ? null : mineType;
      changed();
      return;
    }
    drawing = true;
    last = t;
    stamp(t);
    paint();
  });
  canvas.addEventListener('pointermove', (e) => {
    const t = tileAt(e);
    if (t !== hover) {
      hover = t;
      if (!drawing) paint();
    }
    if (!drawing || t < 0 || t === last) return;
    // Hızlı harekette aradaki kareleri de boya
    const [ax, ay] = [last % d.width, Math.floor(last / d.width)];
    const [bx, by] = [t % d.width, Math.floor(t / d.width)];
    const steps = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
    for (let k = 1; k <= steps; k++) stamp(Math.round(ay + ((by - ay) * k) / steps) * d.width + Math.round(ax + ((bx - ax) * k) / steps));
    last = t;
    paint();
  });
  const end = () => {
    if (!drawing) return;
    drawing = false;
    changed();
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('pointerleave', () => {
    hover = -1;
    paint();
  });

  const onKey = (e: KeyboardEvent) => {
    if (!document.body.contains(canvas)) {
      document.removeEventListener('keydown', onKey);
      return;
    }
    if ((e.target as HTMLElement)?.tagName === 'INPUT' || document.querySelector('.modal-backdrop')) return;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'z') {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    } else if ((e.ctrlKey || e.metaKey) && k === 'y') {
      e.preventDefault();
      redo();
    } else if (!e.ctrlKey && !e.metaKey) {
      const map: Record<string, Tool> = { k: 'land', d: 'sea', b: 'fill', m: 'mine', e: 'erase' };
      if (map[k]) {
        if (map[k] === 'land' || map[k] === 'sea') fillLand = map[k] === 'land';
        tool = map[k];
        renderTools();
      }
    }
  };
  document.addEventListener('keydown', onKey);
  const ro = new ResizeObserver(() => layout());
  ro.observe(wrap);

  const leave = (then: () => void) => {
    if (dirty && !confirm('Kaydedilmemiş değişiklikler kaybolacak. Çıkılsın mı?')) return;
    ro.disconnect();
    document.removeEventListener('keydown', onKey);
    then();
  };

  const save = (): string | null => {
    const name = nameIn.value.trim();
    if (!name) {
      toast('Haritaya bir ad ver', 'error');
      nameIn.focus();
      return null;
    }
    if (listMaps().some((m) => m.name === name && m.id !== id)) {
      toast('Bu adda başka bir harita var', 'error');
      return null;
    }
    try {
      const slot = saveMap({ id: id ?? newId(), name, rows: draftToRows(d) });
      id = slot.id;
      dirty = false;
      toast(`"${name}" kaydedildi`, 'good');
      return slot.id;
    } catch (e) {
      toast((e as Error).message, 'error', 5000);
      return null;
    }
  };

  const autoMines = () => {
    const n = Number(autoSel.value);
    if (!d.land.some(Boolean)) return toast('Önce kara çiz', 'error');
    pushUndo();
    const mines = autoPlaceMines(d, map.terrain, n, 1, DEFAULT_CONFIG.startTerritoryCount, toSeed(draftToRows(d).join('')));
    d.mines = mines;
    changed();
    toast(`${n} oyuncu için her türden ${n} maden yerleştirildi`, 'good');
  };

  const clearMines = () => {
    pushUndo();
    d.mines = d.mines.map(() => null);
    changed();
  };

  host.appendChild(
    h(
      'div',
      { class: 'editor-screen' },
      h(
        'header',
        { class: 'topbar editor-top' },
        h('div', { class: 'brand', onClick: () => leave(() => renderMapList(host, cb)) }, 'Harita Editörü'),
        nameIn,
        h(
          'div',
          { class: 'top-controls' },
          undoBtn,
          redoBtn,
          h('button', { class: 'btn btn-small btn-primary', onClick: () => save() }, 'Kaydet'),
          h('button', { class: 'btn btn-small', onClick: () => download(`harita-${slug(nameIn.value || 'harita')}.json`, exportMap({ name: nameIn.value || 'Harita', rows: draftToRows(d) })) }, 'JSON dışa aktar'),
          h(
            'button',
            {
              class: 'btn btn-small',
              title: 'Kaydet ve bu haritayla yeni oyun aç',
              onClick: () => {
                if (check.errors.length) return toast(check.errors[0], 'error', 5000);
                const sid = save();
                if (sid) leave(() => cb.playMap(sid));
              },
            },
            'Oyna',
          ),
          h('button', { class: 'btn btn-small', onClick: () => leave(() => renderMapList(host, cb)) }, 'Kapat'),
        ),
      ),
      h(
        'main',
        { class: 'editor-main' },
        wrap,
        h(
          'aside',
          { class: 'editor-side' },
          h('section', {}, h('h3', {}, 'Araçlar'), toolsEl, h('div', { class: 'row' }, 'Fırça ', brushIn, brushLbl)),
          h('section', {}, h('h3', {}, 'Madenler'), minesEl, h('div', { class: 'row' }, h('button', { class: 'btn btn-small', onClick: autoMines }, 'Otomatik yerleştir'), autoSel), h('button', { class: 'btn btn-small', onClick: clearMines }, 'Tüm madenleri sil')),
          h('section', {}, h('h3', {}, 'Denetim'), checkEl),
          h(
            'section',
            { class: 'muted small' },
            h('div', {}, h('span', { class: 'swatch', style: { background: PAINT.sea } }), ' deniz  ', h('span', { class: 'swatch', style: { background: PAINT.lake } }), ' göl  ', h('span', { class: 'swatch', style: { background: PAINT.strait } }), ' boğaz'),
            h('div', {}, 'Kısayollar: K kara, D deniz, B kova, M maden, E silgi, Ctrl+Z / Ctrl+Y'),
          ),
        ),
      ),
    ),
  );
  renderTools();
  renderCheck();
  undoBtn.disabled = true;
  redoBtn.disabled = true;
  requestAnimationFrame(layout);
}
