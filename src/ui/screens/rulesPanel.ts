import {
  AKCE_FIELDS,
  AKCE_STEP,
  BUILTIN_PRESETS,
  DEFAULT_CONFIG,
  DEFAULT_PRESET_ID,
  findPreset,
  presetConfig,
  presetMapSize,
  type GameConfig,
} from '../../engine';
import { clear, h, toast } from '../dom';
import { deletePreset, listPresets, savePreset, type SavedPreset } from '../storage';

type FieldKind = 'num' | 'bool' | 'select';

interface Field {
  key: keyof GameConfig;
  label: string;
  kind?: FieldKind;
  min?: number;
  max?: number;
  options?: [string, string][];
  /** Değişince harita önizlemesi yenilensin */
  map?: boolean;
}

interface Group {
  id: string;
  title: string;
  fields: Field[];
}

/** Kural ayarları gruplar hâlinde (Özel seçilince hepsi açılır) */
const GROUPS: Group[] = [
  {
    id: 'map',
    title: 'Harita ve kurulum',
    fields: [
      { key: 'startTerritoryCount', label: 'Başlangıç toprağı (başkent hariç)', min: 0, max: 30, map: true },
      { key: 'minCapitalDistance', label: 'Başkentler arası en az mesafe', min: 1, max: 20, map: true },
      { key: 'minesPerTypePerPlayer', label: 'Oyuncu başına maden (her türden)', min: 0, max: 20, map: true },
      { key: 'mineLayout', label: 'Maden yerleşimi', kind: 'select', options: [['spread', 'Dengeli'], ['random', 'Rastgele (eski)']], map: true },
      { key: 'maxMineDistance', label: 'En yakın madene en fazla uzaklık (dengeli düzen)', min: 1, max: 50, map: true },
    ],
  },
  {
    id: 'economy',
    title: 'Ekonomi',
    fields: [
      { key: 'startAkce', label: 'Başlangıç akçesi', min: 0, max: 100000 },
      { key: 'spinMultiplier', label: 'Topaç çarpanı (sayı × ? akçe)', min: 0, max: 10000 },
      { key: 'goldToAkce', label: '1 altın = ? akçe', min: 0, max: 10000 },
      { key: 'claimCost', label: 'Toprak ele geçirme', min: 0, max: 10000 },
      { key: 'expeditionClaimCost', label: 'Seferle toprak alma', min: 0, max: 10000 },
      { key: 'shipyardCost', label: 'Tersane', min: 0, max: 10000 },
      { key: 'factoryCost', label: 'Uçak fabrikası', min: 0, max: 10000 },
      { key: 'baseCost', label: 'Askeri üs', min: 0, max: 10000 },
      { key: 'shipAkceCost', label: 'Gemi: akçe', min: 0, max: 10000 },
      { key: 'shipIronCost', label: 'Gemi: demir', min: 0, max: 100 },
      { key: 'planeAkceCost', label: 'Uçak: akçe', min: 0, max: 10000 },
      { key: 'planeSteelCost', label: 'Uçak: çelik', min: 0, max: 100 },
      { key: 'shipOilCost', label: 'Gemi seferi: petrol', min: 0, max: 100 },
      { key: 'planeOilCost', label: 'Uçak seferi: petrol', min: 0, max: 100 },
    ],
  },
  {
    id: 'war',
    title: 'Savaş',
    fields: [
      { key: 'battleCostsEnabled', label: 'Savaş masrafları', kind: 'bool' },
      { key: 'landBattleAkce', label: 'Normal savaş (akçe)', min: 0, max: 10000 },
      { key: 'baseBattleAkce', label: 'Üs savaşı (akçe)', min: 0, max: 10000 },
      { key: 'baseBattleIron', label: 'Üs savaşı (demir)', min: 0, max: 100 },
      { key: 'capitalBattleAkce', label: 'Başkent savaşı (akçe)', min: 0, max: 100000 },
      { key: 'capitalBattleIron', label: 'Başkent savaşı (demir)', min: 0, max: 100 },
      { key: 'capitalBattleSteel', label: 'Başkent savaşı (çelik)', min: 0, max: 100 },
      { key: 'capitalStreak', label: 'Başkent savaşı: art arda galibiyet', min: 1, max: 10 },
      { key: 'baseStreak', label: 'Üs savaşı: art arda galibiyet', min: 1, max: 10 },
      { key: 'baseBlockRadius', label: 'Üs uçak engeli yarıçapı', min: 0, max: 20 },
      { key: 'baseBlockMetric', label: 'Üs engeli mesafe ölçüsü', kind: 'select', options: [['chebyshev', 'Chebyshev (kare)'], ['manhattan', 'Manhattan (elmas)']] },
      { key: 'maxSortiesPerUnitPerTurn', label: 'Birim başına tur içi sefer (0 = sınırsız)', min: 0, max: 100 },
      { key: 'maxPeaceRounds', label: 'En uzun barış süresi (tur)', min: 1, max: 200 },
    ],
  },
  {
    id: 'upkeep',
    title: 'Bakım',
    fields: [
      { key: 'upkeepEnabled', label: 'Tur başı bakım', kind: 'bool' },
      { key: 'shipUpkeep', label: 'Gemi (akçe/tur)', min: 0, max: 10000 },
      { key: 'planeUpkeep', label: 'Uçak (akçe/tur)', min: 0, max: 10000 },
      { key: 'baseUpkeep', label: 'Askeri üs (akçe/tur)', min: 0, max: 10000 },
    ],
  },
  {
    id: 'optional',
    title: 'İsteğe bağlı kurallar',
    fields: [
      { key: 'weaknessRule', label: 'Zayıflık şartı (başkente yalnızca toprağı senin yarından az olana saldırılır)', kind: 'bool' },
      { key: 'openingPeace', label: 'Açılış barışı (ilk N tur oyuncu topraklarına saldırı yok)', kind: 'bool' },
      { key: 'openingPeaceRounds', label: 'Açılış barışı süresi (tur)', min: 0, max: 100 },
    ],
  },
];

type Selection = { kind: 'builtin'; id: string } | { kind: 'saved'; name: string } | { kind: 'custom' };

export interface RulesPanel {
  el: HTMLElement;
  config(): GameConfig;
  /** Oyuncu sayısına göre harita boyutu (önayardan ya da elle girilmiş) */
  mapSize(players: number): { width: number; height: number };
  /** Kullanıcı harita boyutunu elle değiştirdi: Özel'e geçilir */
  sizeEdited(width: number, height: number): void;
  /** Seçili ayarın adı (ör. "Dengeli", "Özel") */
  label(): string;
}

/**
 * Yeni oyun ekranının kural bölümü: önayar kartları ve katlanabilir ayar grupları.
 * onChange: 'size' harita boyutu, 'map' harita üretimini etkileyen bir ayar, 'config' diğerleri değişti.
 */
export function createRulesPanel(onChange: (what: 'size' | 'map' | 'config') => void): RulesPanel {
  let sel: Selection = { kind: 'builtin', id: DEFAULT_PRESET_ID };
  let config: GameConfig = presetConfig(findPreset(DEFAULT_PRESET_ID)!);
  let scale = 1;
  let size: { width: number; height: number } | null = null;

  const cardsEl = h('div', { class: 'preset-cards' });
  const groupsEl = h('div', { class: 'cfg-groups' });
  const saveRow = h('div', { class: 'preset-save row' });
  const summary = h('p', { class: 'muted small preset-summary' });

  const sameSel = (a: Selection, b: Selection) =>
    a.kind === b.kind && (a.kind !== 'builtin' || a.id === (b as { id: string }).id) && (a.kind !== 'saved' || a.name === (b as { name: string }).name);

  const toCustom = () => {
    if (sel.kind === 'custom') return;
    sel = { kind: 'custom' };
    renderCards();
    renderSave();
  };

  const select = (next: Selection) => {
    sel = next;
    if (next.kind === 'builtin') {
      const p = findPreset(next.id)!;
      config = presetConfig(p);
      scale = p.mapScale;
      size = null;
    } else if (next.kind === 'saved') {
      const p = listPresets().find((x) => x.name === next.name);
      if (!p) return;
      config = { ...DEFAULT_CONFIG, ...p.config };
      scale = p.mapScale ?? 1;
      size = p.size ?? null;
    }
    renderCards();
    renderGroups(next.kind === 'custom');
    renderSave();
    onChange('size');
    onChange('map');
  };

  const card = (title: string, desc: string, s: Selection, del?: () => void) =>
    h(
      'button',
      {
        class: `preset-card ${sameSel(sel, s) ? 'selected' : ''}`,
        type: 'button',
        'aria-pressed': sameSel(sel, s) ? 'true' : 'false',
        onClick: () => select(s),
      },
      h('span', { class: 'preset-name' }, title),
      h('span', { class: 'preset-desc' }, desc),
      del
        ? h(
            'span',
            {
              class: 'preset-del',
              role: 'button',
              title: `"${title}" ayarını sil`,
              onClick: (e: Event) => {
                e.stopPropagation();
                del();
              },
            },
            '×',
          )
        : null,
    );

  const renderCards = () => {
    clear(cardsEl);
    for (const p of BUILTIN_PRESETS) cardsEl.appendChild(card(p.name, p.description, { kind: 'builtin', id: p.id }));
    for (const p of listPresets()) {
      cardsEl.appendChild(
        card(p.name, 'Kaydettiğin ayar', { kind: 'saved', name: p.name }, () => {
          if (!confirm(`"${p.name}" ayarı silinsin mi?`)) return;
          deletePreset(p.name);
          if (sel.kind === 'saved' && sel.name === p.name) sel = { kind: 'custom' };
          renderCards();
          renderSave();
        }),
      );
    }
    cardsEl.appendChild(card('Özel', 'Tüm ayarları kendin belirle; istersen isim verip kaydet.', { kind: 'custom' }));
    summary.textContent = summaryText();
  };

  const summaryText = () => {
    const c = config;
    const parts = [
      c.battleCostsEnabled ? `savaş masrafı ${c.landBattleAkce} / üs ${c.baseBattleAkce} / başkent ${c.capitalBattleAkce} akçe` : 'savaşlar bedelsiz',
      c.upkeepEnabled ? `bakım gemi ${c.shipUpkeep}, uçak ${c.planeUpkeep}` : 'bakım yok',
      `başlangıç ${c.startAkce} akçe`,
      size ? `harita ${size.width}×${size.height}` : scale !== 1 ? `harita %${Math.round(scale * 100)} boyutta` : 'normal harita',
    ];
    if (c.openingPeace) parts.push(`ilk ${c.openingPeaceRounds} tur barış`);
    if (c.weaknessRule) parts.push('zayıflık şartı');
    return `Kurallar: ${parts.join(' · ')}.`;
  };

  const fieldInput = (f: Field) => {
    const kind = f.kind ?? 'num';
    const changed = () => {
      toCustom();
      summary.textContent = summaryText();
      onChange(f.map ? 'map' : 'config');
    };
    const rec = config as unknown as Record<string, unknown>;
    if (kind === 'bool') {
      return h('input', {
        type: 'checkbox',
        checked: config[f.key] as boolean,
        onChange: (e: Event) => {
          rec[f.key] = (e.target as HTMLInputElement).checked;
          changed();
        },
      });
    }
    if (kind === 'select') {
      return h(
        'select',
        {
          onChange: (e: Event) => {
            rec[f.key] = (e.target as HTMLSelectElement).value;
            changed();
          },
        },
        f.options!.map(([v, l]) => h('option', { value: v, selected: config[f.key] === v }, l)),
      );
    }
    // Akçe değerleri okla 50'şer değişir; elle yazılan her tam sayı geçerlidir
    return h('input', {
      type: 'number',
      class: 'num',
      min: f.min,
      max: f.max,
      step: AKCE_FIELDS.includes(f.key) ? AKCE_STEP : 1,
      value: config[f.key] as number,
      onInput: (e: Event) => {
        rec[f.key] = clampInt((e.target as HTMLInputElement).value, f.min ?? 0, f.max ?? 100000);
        changed();
      },
    });
  };

  const renderGroups = (open: boolean) => {
    clear(groupsEl);
    for (const g of GROUPS) {
      groupsEl.appendChild(
        h(
          'details',
          { class: 'cfg-group', open },
          h('summary', {}, g.title),
          h('div', { class: 'form-grid config-grid' }, g.fields.map((f) => [h('label', {}, f.label), fieldInput(f)])),
        ),
      );
    }
  };

  const renderSave = () => {
    clear(saveRow);
    if (sel.kind !== 'custom') return;
    const name = h('input', { type: 'text', class: 'text', maxLength: 30, placeholder: 'Ayar adı (ör. Cumartesi kuralları)' });
    const save = () => {
      const n = name.value.trim();
      if (!n) return toast('Ayara bir ad ver', 'error');
      if (BUILTIN_PRESETS.some((p) => p.name.toLocaleLowerCase('tr') === n.toLocaleLowerCase('tr'))) return toast('Bu ad hazır bir ayara ait', 'error');
      try {
        savePreset({ name: n, config: { ...config }, mapScale: scale, size } satisfies SavedPreset);
      } catch (e) {
        return toast((e as Error).message, 'error');
      }
      toast(`"${n}" kaydedildi`, 'good');
      sel = { kind: 'saved', name: n };
      renderCards();
      renderSave();
    };
    saveRow.append(h('span', {}, 'Bu ayarı kaydet:'), name, h('button', { class: 'btn btn-small', type: 'button', onClick: save }, 'Kaydet'));
  };

  const el = h(
    'section',
    { class: 'rules-config' },
    h('h3', {}, 'Kurallar'),
    cardsEl,
    summary,
    saveRow,
    h('div', { class: 'muted small' }, 'Ayrıntılı ayarlar (bir değeri değiştirirsen "Özel"e geçilir):'),
    groupsEl,
  );
  renderCards();
  renderGroups(false);

  return {
    el,
    config: () => ({ ...config }),
    mapSize: (players) => size ?? presetMapSize({ mapScale: scale }, players),
    sizeEdited(width, height) {
      size = { width, height };
      toCustom();
      summary.textContent = summaryText();
    },
    label: () => (sel.kind === 'builtin' ? findPreset(sel.id)!.name : sel.kind === 'saved' ? sel.name : 'Özel'),
  };
}

export function clampInt(v: string, min: number, max: number): number {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}
