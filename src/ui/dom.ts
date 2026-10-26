import { icon, type IconName } from './icons';

export type Child = Node | string | number | null | undefined | false | Child[];

type Attrs = Record<string, unknown>;

/** Küçük DOM yardımcı fonksiyonu: h('div', { class: 'x', onClick: fn }, ...çocuklar) */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') {
      el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    } else if (k === 'class') {
      el.className = String(v);
    } else if (k === 'style' && typeof v === 'object') {
      Object.assign(el.style, v);
    } else if (k === 'dataset' && typeof v === 'object') {
      Object.assign(el.dataset, v);
    } else if (k in el && k !== 'list' && k !== 'form') {
      (el as unknown as Record<string, unknown>)[k] = v;
    } else {
      el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  append(el, children);
  return el;
}

export function append(el: Node, children: Child[]) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
}

export function clear(el: Element) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

let toastHost: HTMLElement | null = null;

export function toast(message: string, kind: 'info' | 'error' | 'good' = 'info', ms = 2600) {
  if (!toastHost || !document.body.contains(toastHost)) {
    toastHost = h('div', { class: 'toast-host' });
    document.body.appendChild(toastHost);
  }
  const t = h('div', { class: `toast toast-${kind}` }, message);
  toastHost.appendChild(t);
  setTimeout(() => t.classList.add('out'), ms);
  setTimeout(() => t.remove(), ms + 400);
}

export interface ModalButton {
  label: string;
  value: string;
  primary?: boolean;
  danger?: boolean;
  disabled?: boolean;
}

export interface ModalHandle {
  el: HTMLElement;
  body: HTMLElement;
  close(value?: string): void;
  result: Promise<string>;
}

const openModals = new Set<ModalHandle>();

/** Açık bütün pencereleri kapatır (ör. tur süresi dolunca); bekleyen result'lar value ile çözülür. */
export function closeAllModals(value: string) {
  for (const m of [...openModals]) m.close(value);
}

/** Basit modal pencere. Düğmeye basılınca ya da kapatılınca result çözülür. */
export function openModal(opts: { title: string; icon?: IconName; body?: Child; buttons?: ModalButton[]; closable?: boolean; wide?: boolean; className?: string }): ModalHandle {
  let resolve!: (v: string) => void;
  const result = new Promise<string>((r) => (resolve = r));
  const body = h('div', { class: 'modal-body' }, opts.body ?? null);
  const backdrop = h('div', { class: `modal-backdrop ${opts.className ?? ''}` });
  let closed = false;
  const close = (value = 'close') => {
    if (closed) return;
    closed = true;
    backdrop.remove();
    document.removeEventListener('keydown', onKey);
    openModals.delete(handle);
    resolve(value);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && opts.closable !== false) close('close');
  };
  const buttons = (opts.buttons ?? []).map((b) =>
    h(
      'button',
      { class: `btn ${b.primary ? 'btn-primary' : ''} ${b.danger ? 'btn-danger' : ''}`, disabled: b.disabled, onClick: () => close(b.value) },
      b.label,
    ),
  );
  const box = h(
    'div',
    { class: `modal ${opts.wide ? 'modal-wide' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': opts.title },
    h(
      'div',
      { class: 'modal-head' },
      h('h2', {}, opts.icon ? icon(opts.icon, { cls: 'head-icon' }) : null, opts.title),
      opts.closable !== false ? h('button', { class: 'icon-btn', title: 'Kapat', 'aria-label': 'Kapat', onClick: () => close('close') }, icon('close')) : null,
    ),
    body,
    buttons.length ? h('div', { class: 'modal-actions' }, buttons) : null,
  );
  backdrop.appendChild(box);
  backdrop.addEventListener('pointerdown', (e) => {
    if (e.target === backdrop && opts.closable !== false) close('close');
  });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(backdrop);
  const handle: ModalHandle = { el: box, body, close, result };
  openModals.add(handle);
  return handle;
}

export function download(filename: string, text: string) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept, style: { display: 'none' } });
    input.addEventListener('change', () => {
      resolve(input.files?.[0] ?? null);
      input.remove();
    });
    document.body.appendChild(input);
    input.click();
  });
}
