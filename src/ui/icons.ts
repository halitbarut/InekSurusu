/**
 * Oyunun kendi ikon seti: kareli defter temasına uygun, kalemle çizilmiş gibi duran sade çizgiler.
 * Hepsi 24×24 çizim alanında, yuvarlak uçlu 1,8 kalınlıkta çizgiyle çizilir; çizgi rengi metin rengini izler.
 * Kaynak ve yapı ikonlarında tanınmayı kolaylaştıran açık renkli bir dolgu vardır.
 * Haritada (Canvas) kullanmak için iconImage() aynı çizimi resme çevirir.
 */

const F = {
  akce: '#d8d2c2',
  gold: '#f2c94c',
  oil: '#3b3a36',
  iron: '#b0704f',
  steel: '#8fb3d6',
  sea: '#bcd6ee',
  land: '#cfe8c0',
  paper: '#fffdf6',
  red: '#e8a29a',
  warn: '#ffe27a',
};

/** İkon çizimleri (24×24). {f:renk} dolgu, aksi halde dolgusuz. */
const ICONS = {
  // ---------- kaynaklar ----------
  akce: `<circle cx="12" cy="12" r="8.6" fill="${F.akce}"/><rect x="9.6" y="9.6" width="4.8" height="4.8" rx=".6" fill="${F.paper}"/><path d="M6.2 9.4c.3-.9.8-1.7 1.4-2.3M17.8 14.6c-.3.9-.8 1.7-1.4 2.3"/>`,
  gold: `<path d="M3.5 17.5 6.8 9.2h10.4l3.3 8.3z" fill="${F.gold}"/><path d="M6.8 9.2 9 12.6h6l2.2-3.4M9 12.6l-1.6 4.9M15 12.6l1.6 4.9"/><path d="M14 5.2l.6-1.6M17 6.3l1.3-1.1M11 5.4 10 4" stroke-width="1.4"/>`,
  oil: `<path d="M12 3.2c-.2.6-6.3 7.4-6.3 11.6a6.3 6.3 0 0 0 12.6 0C18.3 10.6 12.2 3.8 12 3.2z" fill="${F.oil}"/><path d="M9.2 14.6c0 1.6 1.1 2.9 2.6 3.2" stroke="${F.paper}"/>`,
  iron: `<path d="M3.2 7.8h11.6c.2 1.9 2.6 2.9 6 2.3v1.8c-2.8.8-4.6 1.4-5.6 2.7l1.1 3.9H7.6l1.3-3.9c-3-.9-5.1-3.2-5.7-6.8z" fill="${F.iron}"/><path d="M6.5 20.3h11.4"/>`,
  steel: `<path d="M4.8 4.6h14.4v3.2h-5.1v8.4h5.1v3.2H4.8v-3.2h5.1V7.8H4.8z" fill="${F.steel}"/>`,

  // ---------- birimler ----------
  ship: `<path d="M2.8 13.8h18.4l-3 5.1H5.6z" fill="${F.paper}"/><path d="M7.4 13.8v-3.6h8.2v3.6M10.4 10.2V6.4h2.6v3.8"/><path d="M2.5 21.4c1.3-.9 2.6-.9 3.9 0s2.6.9 3.9 0 2.6-.9 3.9 0 2.6.9 3.9 0" stroke-width="1.4"/>`,
  plane: `<path d="M12 2.6c.9 0 1.3 1.3 1.3 3.3v3.7l7.8 4.2v2l-7.8-2.2v4.3l2.7 2v1.6L12 20.4l-4 1.1v-1.6l2.7-2v-4.3l-7.8 2.2v-2l7.8-4.2V5.9c0-2 .4-3.3 1.3-3.3z" fill="${F.paper}"/>`,

  // ---------- yapılar ----------
  capital: `<path d="M3.4 21V9.2h2.4v2h2.3v-2h2.3v3h3.2v-3h2.3v2h2.3v-2h2.4V21z" fill="${F.paper}"/><path d="M10.2 21v-3.6a1.8 1.8 0 0 1 3.6 0V21M12 9.2V3.4l4.2 1.4-4.2 1.5"/>`,
  shipyard: `<circle cx="12" cy="4.8" r="1.9"/><path d="M12 6.7v14M8 10.3h8M4.6 14.2c.3 3.8 3.6 6.5 7.4 6.5s7.1-2.7 7.4-6.5M4.6 14.2l-1.3 1.6M4.6 14.2l1.8.9M19.4 14.2l1.3 1.6M19.4 14.2l-1.8.9"/>`,
  factory: `<path d="M3.2 20.6V10.8l4.9 3.1v-3.1l4.9 3.1v-3.1l4.4 2.8V4.2h3.4v16.4z" fill="${F.paper}"/><path d="M6.4 17.2h1.8M10.4 17.2h1.8M14.4 17.2h1.8"/>`,
  base: `<path d="M12 3 19.8 6v6.1c0 4.5-3.4 7.6-7.8 9-4.4-1.4-7.8-4.5-7.8-9V6z" fill="${F.paper}"/><path d="m12 7.6 1.3 2.7 2.9.4-2.1 2 .5 2.9-2.6-1.4-2.6 1.4.5-2.9-2.1-2 2.9-.4z"/>`,

  // ---------- eylemler ----------
  claim: `<path d="M3.2 15.8h17.6v5H3.2z" fill="${F.land}"/><path d="M8.6 15.8V3.4"/><path d="M8.6 3.6l8.6 2.8-8.6 3z" fill="${F.paper}"/>`,
  build: `<path d="m13.6 3.4 7 7-3 3-7-7z" fill="${F.paper}"/><path d="m12.1 8.4-8.6 8.7a1.6 1.6 0 0 0 2.3 2.3l8.6-8.7"/>`,
  produce: gear(12, 12, 8.6, 6.3, 8) + `<circle cx="12" cy="12" r="2.4"/>`,
  attack: `<path d="M5 5l10.4 10.4M19 5 8.6 15.4"/><path d="M13.2 17.6l4.4-4.4M10.8 17.6l-4.4-4.4M16.4 16.4l3.2 3.2M7.6 16.4l-3.2 3.2"/><path d="M5 5l2.6.4M5 5l.4 2.6M19 5l-2.6.4M19 5l-.4 2.6" stroke-width="1.4"/>`,
  expedition: `<path d="M4 18.6c2.6-8.4 9.6-11.6 15.2-9.4" stroke-dasharray="2.6 2.4"/><path d="m15.6 6.2 3.8 3-3.8 2.9"/><circle cx="4.3" cy="19" r="1.6" fill="currentColor"/>`,
  exchange: `<path d="M8.2 9.6 9.6 6.6h4.8l1.4 3z" fill="${F.gold}"/><circle cx="12" cy="15.2" r="3.2" fill="${F.akce}"/><path d="M4.4 11.4A7.8 7.8 0 0 1 17.6 5.2M17.8 2.8v2.6h-2.6M19.6 12.6a7.8 7.8 0 0 1-13.2 6.2M6.2 21.2v-2.6h2.6"/>`,
  diplomacy: `<path d="M6.4 3.8h11.2c1.4 0 2 .8 2 2v12.6c0 1.1-.8 1.8-1.8 1.8H6.4" fill="${F.paper}"/><path d="M6.4 3.8a2 2 0 0 0 0 4h2M6.4 20.2a2 2 0 0 1 0-4h2V7.8M11.2 9.2h5.4M11.2 12.2h5.4M11.2 15.2h3.6"/>`,
  strait: `<path d="M3.2 3.4c2.2 2.6 2.9 5.6 2.4 8.6s.2 6 2.4 8.6M20.8 3.4c-2.2 2.6-2.9 5.6-2.4 8.6s-.2 6-2.4 8.6"/><path d="M9.4 9.4c1.1-.8 2.1-.8 3.2 0s2.1.8 3.2 0M9.2 14.6c1.1-.8 2.1-.8 3.2 0s2.1.8 3.2 0" stroke-width="1.4"/><path d="M5.8 12h12.4" stroke-dasharray="1.8 1.8"/>`,
  endTurn: `<path d="M3.6 12h11.6M11.2 7.4l4.8 4.6-4.8 4.6M19.6 4.8v14.4"/>`,
  undo: `<path d="M9 6.8 4.2 11 9 15.2"/><path d="M4.4 11h10.2c3.2 0 5.4 2.2 5.4 4.9s-2.1 4.3-4.6 4.3h-4.2"/>`,
  spin: `<path d="M8.4 3.4h7.2l5 5v7.2l-5 5H8.4l-5-5V8.4z" fill="${F.warn}"/><path d="M12 3.6v16.8M3.6 12h16.8M6 6l12 12M18 6 6 18" stroke-width="1"/><circle cx="12" cy="12" r="2" fill="currentColor"/>`,
  battle: `<path d="M12 2.8l1.6 4.6 4.6-2-1.8 4.6 4.8 1.6-4.6 2 2 4.6-4.8-1.8-1.8 4.8-1.8-4.8-4.8 1.8 2-4.6-4.6-2 4.8-1.6-1.8-4.6 4.6 2z" fill="${F.warn}"/>`,

  // ---------- durumlar ----------
  alliance: `<circle cx="8.8" cy="12" r="5.2"/><circle cx="15.2" cy="12" r="5.2"/>`,
  peace: `<path d="M5 19.6C9.4 15.4 13.6 9.8 19 4.4"/><path d="M9.6 14.6c-2.6.4-4.4-.4-5.2-2.2 2.2-.6 4 0 5.2 2.2zM12.4 11.2c.2-2.6 1.4-4.2 3.4-4.6.4 2.2-.6 3.8-3.4 4.6zM12 12c2.6-.4 4.4.4 5.2 2.2-2.2.6-4 0-5.2-2.2zM15.2 8.4c-.2-2.4.6-4 2.4-4.6.6 2-.2 3.6-2.4 4.6z" fill="${F.land}"/>`,
  eliminated: `<path d="M12 3.4c4.2 0 7 2.8 7 6.6 0 2.4-1.2 4-2.8 4.8v3.4H7.8v-3.4C6.2 14 5 12.4 5 10c0-3.8 2.8-6.6 7-6.6z" fill="${F.paper}"/><circle cx="9.4" cy="10.4" r="1.6" fill="currentColor"/><circle cx="14.6" cy="10.4" r="1.6" fill="currentColor"/><path d="M10.2 18.2v2.4M13.8 18.2v2.4M12 13.2v1.4"/>`,
  sound: `<path d="M3.6 9.2h3.6l5.2-4.2v14l-5.2-4.2H3.6z" fill="${F.paper}"/><path d="M15.6 8.8c1.8 1.8 1.8 4.6 0 6.4M18.4 6.2c3.2 3.2 3.2 8.4 0 11.6"/>`,
  mute: `<path d="M3.6 9.2h3.6l5.2-4.2v14l-5.2-4.2H3.6z" fill="${F.paper}"/><path d="m15.4 9.4 5.2 5.2M20.6 9.4l-5.2 5.2"/>`,
  settings: `<path d="M4 6.4h16M4 12h16M4 17.6h16" stroke-width="1.5"/><circle cx="8.6" cy="6.4" r="2" fill="${F.paper}"/><circle cx="15.4" cy="12" r="2" fill="${F.paper}"/><circle cx="10.2" cy="17.6" r="2" fill="${F.paper}"/>`,

  // ---------- genel ----------
  menu: `<path d="M4.4 6.6h15.2M4.4 12h15.2M4.4 17.4h15.2"/>`,
  save: `<path d="M5.2 3.6h13.6v16.8l-6.8-4.4-6.8 4.4z" fill="${F.paper}"/><path d="M9 8.2h6"/>`,
  close: `<path d="M5.8 5.8l12.4 12.4M18.2 5.8 5.8 18.2"/>`,
  plus: `<path d="M12 5v14M5 12h14"/>`,
  minus: `<path d="M5 12h14"/>`,
  fit: `<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>`,
  tiles: `<path d="M4 4h16v16H4zM12 4v16M4 12h16" fill="${F.land}"/>`,
  upkeep: `<path d="M6 3.4h12v17.2l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4-2 1.4z" fill="${F.paper}"/><path d="M9 8h6M9 11.4h6M9 14.8h3.6"/>`,
  mine: `<path d="M4.2 7.4c4.6-4.4 11-4.4 15.6 0" fill="none"/><path d="M12 4.6v16" stroke-width="2.2"/>`,
  trophy: `<path d="M7.6 3.8h8.8v5.4a4.4 4.4 0 0 1-8.8 0z" fill="${F.gold}"/><path d="M7.6 5.6H4.4c0 3 1.4 4.6 3.6 4.8M16.4 5.6h3.2c0 3-1.4 4.6-3.6 4.8M12 13.6v3.6M8.4 20.4h7.2l-.8-3.2H9.2z"/>`,
  bot: `<rect x="5" y="7.6" width="14" height="11" rx="2.4" fill="${F.paper}"/><circle cx="9.4" cy="12.6" r="1.4" fill="currentColor"/><circle cx="14.6" cy="12.6" r="1.4" fill="currentColor"/><path d="M12 7.6V4.4M9.8 16h4.4M3 12v3M21 12v3"/>`,
  human: `<circle cx="12" cy="7.6" r="3.6" fill="${F.paper}"/><path d="M4.8 20.4c.6-4 3.4-6.4 7.2-6.4s6.6 2.4 7.2 6.4"/>`,
  online: `<circle cx="12" cy="12" r="8.4"/><path d="M3.6 12h16.8M12 3.6c2.4 2.4 3.4 5.2 3.4 8.4s-1 6-3.4 8.4c-2.4-2.4-3.4-5.2-3.4-8.4s1-6 3.4-8.4"/>`,
  load: `<path d="M3.6 7.2v12.4h16.8V9.4h-8.2l-2-2.2z" fill="${F.paper}"/><path d="M12 17.4v-6M9.4 13.8 12 11.2l2.6 2.6"/>`,
  newGame: `<path d="m15.2 4.2 4.6 4.6L9 19.6l-5.6 1 1-5.6z" fill="${F.warn}"/><path d="m13 6.4 4.6 4.6"/>`,
  map: `<path d="M3.4 6.2 9 4l6 2.2 5.6-2.2v13.8L15 20l-6-2.2-5.6 2.2z" fill="${F.sea}"/><path d="M9 4v13.8M15 6.2V20"/>`,
  home: `<path d="M4 11.4 12 4.4l8 7M6.4 9.4v10.4h11.2V9.4" fill="none"/><path d="M10.2 19.8v-5h3.6v5"/>`,
  book: `<path d="M12 6.4C9.6 4.6 6.6 4.2 3.6 5v13.6c3-.8 6-.4 8.4 1.4 2.4-1.8 5.4-2.2 8.4-1.4V5c-3-.8-6-.4-8.4 1.4zM12 6.4V20" fill="${F.paper}"/>`,
  download: `<path d="M12 3.6v11.6M7.4 10.8 12 15.4l4.6-4.6M4.4 19.6h15.2"/>`,
  upload: `<path d="M12 15.4V3.8M7.4 8.4 12 3.8l4.6 4.6M4.4 19.6h15.2"/>`,
  dice: `<rect x="4" y="4" width="16" height="16" rx="3" fill="${F.paper}"/><circle cx="8.6" cy="8.6" r="1.3" fill="currentColor"/><circle cx="15.4" cy="15.4" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/>`,
  eye: `<path d="M2.8 12c2.4-4.2 5.4-6.4 9.2-6.4s6.8 2.2 9.2 6.4c-2.4 4.2-5.4 6.4-9.2 6.4S5.2 16.2 2.8 12z" fill="${F.paper}"/><circle cx="12" cy="12" r="2.8"/>`,
  hourglass: `<path d="M6.4 3.6h11.2M6.4 20.4h11.2M7.6 3.6c0 4.4 4.4 5.6 4.4 8.4s-4.4 4-4.4 8.4M16.4 3.6c0 4.4-4.4 5.6-4.4 8.4s4.4 4 4.4 8.4"/>`,
  check: `<path d="m4.6 12.6 4.6 4.6 10.2-10.4"/>`,
  warning: `<path d="M12 3.6 21 19.6H3z" fill="${F.warn}"/><path d="M12 9.4v5M12 17v.2"/>`,
  vote: `<path d="M4 11.6h16v8.8H4z" fill="${F.paper}"/><path d="M8.6 11.6 10 4.2l6.4 1.2-1.2 6.2M9 15.4h6"/>`,
  broken: `<path d="M12 20.2S3.6 15.2 3.6 9.4C3.6 6.6 5.6 4.6 8.2 4.6c1.6 0 3 .8 3.8 2l-1.4 3.4 2.6 1.8-1.6 3.6M12 6.6c.8-1.2 2.2-2 3.8-2 2.6 0 4.6 2 4.6 4.8 0 5.8-8.4 10.8-8.4 10.8" fill="${F.red}"/>`,
  phone: `<rect x="6.6" y="2.8" width="10.8" height="18.4" rx="2.2" fill="${F.paper}"/><path d="M10.6 18h2.8"/>`,
  copy: `<rect x="8.4" y="8.4" width="11.2" height="11.6" rx="1.6" fill="${F.paper}"/><path d="M15.6 8.4V5.6c0-.9-.7-1.6-1.6-1.6H5.6c-.9 0-1.6.7-1.6 1.6v8.6c0 .9.7 1.6 1.6 1.6h2.8"/>`,
  signal: `<path d="M4.4 18.8h2.4v-3.4H4.4zM10.8 18.8h2.4v-7.4h-2.4zM17.2 18.8h2.4V5.2h-2.4z" fill="${F.paper}"/>`,
  door: `<path d="M5.4 20.4V3.6h10v16.8M3.4 20.4h17.2M15.4 6.4l3.6 1.4v12.6" /><circle cx="12.6" cy="12.4" r=".9" fill="currentColor"/>`,
  edit: `<path d="m15.2 4.2 4.6 4.6L9 19.6l-5.6 1 1-5.6z"/>`,
  trash: `<path d="M4.6 6.6h14.8M9.6 6.6V4.2h4.8v2.4M6.6 6.6l1 13.8h8.8l1-13.8"/>`,
  fill: `<path d="M5.2 11.8 11.4 5.6l7 7-6.2 6.2c-.8.8-2 .8-2.8 0l-4.2-4.2c-.8-.8-.8-2 0-2.8z" fill="${F.sea}"/><path d="M8.6 3.4l2.8 2.2M19.8 15.4c0 1.2-.7 2.6-1.4 2.6s-1.4-1.4-1.4-2.6 1.4-2.8 1.4-2.8 1.4 1.6 1.4 2.8z"/>`,
  brushLand: `<path d="M14.6 3.6 20.4 9.4l-7.8 7.8-5.8-5.8z" fill="${F.land}"/><path d="M6.8 11.4c-2.4.4-3.4 2.2-3.4 4.6 0 1.6-.6 2.8-1 3.6 3.4.4 7.6-.4 9.4-3"/>`,
  brushSea: `<path d="M14.6 3.6 20.4 9.4l-7.8 7.8-5.8-5.8z" fill="${F.sea}"/><path d="M6.8 11.4c-2.4.4-3.4 2.2-3.4 4.6 0 1.6-.6 2.8-1 3.6 3.4.4 7.6-.4 9.4-3"/>`,
  eraser: `<path d="M9.4 19.8 3.6 14l9.6-9.6 7.2 7.2-8.2 8.2z" fill="${F.paper}"/><path d="M8 9.6l7 7M9.4 19.8h10.2"/>`,
  wand: `<path d="M4 20 15.6 8.4M14 4.2v2.4M18.6 9.4h2.4M17.6 5.6l1.6-1.6M10.6 5.6 9 4"/>`,
} as const;

export type IconName = keyof typeof ICONS;

/** Dişli çark yolu (üret ikonu) */
function gear(cx: number, cy: number, ro: number, ri: number, teeth: number): string {
  let d = '';
  const step = (Math.PI * 2) / teeth;
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    const pts = [
      [ri, a - step * 0.5],
      [ri, a - step * 0.22],
      [ro, a - step * 0.14],
      [ro, a + step * 0.14],
      [ri, a + step * 0.22],
    ];
    for (const [r, t] of pts) d += `${d ? 'L' : 'M'}${(cx + r * Math.cos(t)).toFixed(2)} ${(cy + r * Math.sin(t)).toFixed(2)}`;
  }
  return `<path d="${d}Z" fill="${F.paper}"/>`;
}

function svgMarkup(name: IconName, stroke = 'currentColor'): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;
}

/** DOM ikonu. label verilirse ekran okuyucuya okunur, yoksa süs sayılır. */
export function icon(name: IconName, opts: { size?: number; label?: string; cls?: string } = {}): HTMLElement {
  const span = document.createElement('span');
  span.className = `icon ${opts.cls ?? ''}`.trim();
  span.innerHTML = svgMarkup(name);
  const size = opts.size;
  if (size) {
    span.style.width = `${size}px`;
    span.style.height = `${size}px`;
  }
  if (opts.label) {
    span.setAttribute('role', 'img');
    span.setAttribute('aria-label', opts.label);
    span.title = opts.label;
  } else span.setAttribute('aria-hidden', 'true');
  return span;
}

const images = new Map<string, HTMLImageElement>();

/**
 * Canvas için ikon resmi. Resim yüklenene kadar null döner; yüklenince onReady çağrılır
 * (harita yeniden çizilsin diye).
 */
export function iconImage(name: IconName, stroke: string, onReady?: () => void): HTMLImageElement | null {
  const key = `${name}|${stroke}`;
  let img = images.get(key);
  if (!img) {
    img = new Image();
    img.decoding = 'async';
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgMarkup(name, stroke).replace('<svg ', '<svg width="96" height="96" '))}`;
    images.set(key, img);
    if (onReady) img.addEventListener('load', onReady, { once: true });
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

/** Ana menü ve logo için küçük inek motifi */
export function cowMark(size = 56): HTMLElement {
  const span = document.createElement('span');
  span.className = 'cow-mark';
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 56" width="${size}" height="${(size * 56) / 64}" fill="none" stroke="#2b2a27" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M14 14c-4-1-8-4-9-9 4 0 8 2 11 5M50 14c4-1 8-4 9-9-4 0-8 2-11 5" fill="#efe6d2"/>
    <path d="M8 22c-4 0-6-3-6-5 3-1 7 0 9 2M56 22c4 0 6-3 6-5-3-1-7 0-9 2" fill="#fffdf6"/>
    <path d="M32 9c10 0 18 6 18 16 0 4-1 7-3 10l1 7c0 6-7 10-16 10S16 48 16 42l1-7c-2-3-3-6-3-10C14 15 22 9 32 9z" fill="#fffdf6"/>
    <path d="M20 16c3 0 6 2 6 6s-4 6-7 5M44 24c-3 1-5 4-3 7" fill="#3b3a36" stroke-width="1.6"/>
    <circle cx="25" cy="27" r="2.2" fill="#2b2a27"/><circle cx="39" cy="27" r="2.2" fill="#2b2a27"/>
    <path d="M21 39c0-4 5-6 11-6s11 2 11 6-5 7-11 7-11-3-11-7z" fill="#f4b6b0"/>
    <circle cx="27.5" cy="40" r="1.6" fill="#2b2a27"/><circle cx="36.5" cy="40" r="1.6" fill="#2b2a27"/>
  </svg>`;
  return span;
}
