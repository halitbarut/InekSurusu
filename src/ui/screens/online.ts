import type { GameState } from '../../engine';
import { ClientRoom } from '../../net/clientRoom';
import { HostRoom } from '../../net/hostRoom';
import { joinTransport, openHost } from '../../net/peer';
import { normalizeRoomCode, randomId, randomRoomCode, type LobbyInfo } from '../../net/protocol';
import { clear, h, toast } from '../dom';

export interface OnlineCallbacks {
  menu(): void;
  /** Oda kuruldu: oda sahibi lobisini (yeni oyun ekranı) aç */
  hostLobby(room: HostRoom): void;
  /** Katılan: oyun başladı ya da sürmekte olan oyuna girildi */
  startClient(state: GameState, room: ClientRoom): void;
}

const PROFILE_KEY = 'inek-surusu-profile';

interface Profile {
  name: string;
  color: string;
}

function loadProfile(): Profile {
  try {
    const p = JSON.parse(localStorage.getItem(PROFILE_KEY) ?? 'null');
    if (p && typeof p.name === 'string') return p;
  } catch {
    // varsayılan
  }
  return { name: '', color: '#2a7de1' };
}

function saveProfile(p: Profile) {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
  } catch {
    // depolama yoksa yalnızca bu oturumda
  }
}

/** Aynı odaya yeniden bağlanınca koltuğun geri gelmesi için oda başına kalıcı kimlik */
function clientIdFor(code: string): string {
  const key = `inek-surusu-client-${code}`;
  try {
    const v = localStorage.getItem(key);
    if (v) return v;
    const id = randomId();
    localStorage.setItem(key, id);
    return id;
  } catch {
    return randomId();
  }
}

export function inviteLink(code: string): string {
  return `${location.origin}${location.pathname}?oda=${code}`;
}

/** Oda kodu ve davet linki kutusu (oda sahibi lobisinde) */
export function inviteBox(code: string, people: HTMLElement): HTMLElement {
  const link = inviteLink(code);
  const input = h('input', { type: 'text', class: 'text', value: link, readOnly: true, onFocus: (e: Event) => (e.target as HTMLInputElement).select() });
  return h(
    'div',
    { class: 'invite-box' },
    h('div', {}, h('div', { class: 'muted small' }, 'Oda kodu'), h('div', { class: 'room-code' }, code)),
    h(
      'div',
      { style: { flex: '1', minWidth: '220px' } },
      h('div', { class: 'muted small' }, 'Davet linki — arkadaşlarına gönder'),
      h(
        'div',
        { class: 'row' },
        input,
        h(
          'button',
          {
            class: 'btn btn-small',
            onClick: async () => {
              try {
                await navigator.clipboard.writeText(link);
                toast('Link kopyalandı', 'good');
              } catch {
                input.select();
                toast('Linki seçtim, kopyalayabilirsin', 'info');
              }
            },
          },
          '📋 Kopyala',
        ),
      ),
      people,
    ),
  );
}

export function renderOnlineMenu(host: HTMLElement, cb: OnlineCallbacks, presetCode?: string) {
  clear(host);
  const profile = loadProfile();
  const nameIn = h('input', { type: 'text', class: 'text', maxLength: 16, value: profile.name, placeholder: 'Adın' });
  const colorIn = h('input', { type: 'color', value: profile.color });
  const codeIn = h('input', { type: 'text', class: 'text seed', maxLength: 8, value: presetCode ?? '', placeholder: 'ABCDE' });
  const status = h('p', { class: 'muted small' }, ' ');
  let working = false;

  const create = async () => {
    if (working) return;
    working = true;
    status.textContent = 'Oda açılıyor…';
    try {
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = randomRoomCode();
        try {
          const transport = await openHost(code);
          cb.hostLobby(new HostRoom(code, transport));
          return;
        } catch (e) {
          if ((e as Error).message !== 'unavailable-id') throw e;
        }
      }
      throw new Error('Oda kodu alınamadı, tekrar dene.');
    } catch (e) {
      status.textContent = (e as Error).message;
      working = false;
    }
  };

  const join = async () => {
    if (working) return;
    const code = normalizeRoomCode(codeIn.value);
    const name = nameIn.value.trim();
    if (code.length < 4) return toast('Oda kodunu yaz', 'error');
    if (!name) return toast('Adını yaz', 'error');
    saveProfile({ name, color: colorIn.value });
    working = true;
    status.textContent = 'Odaya bağlanılıyor…';
    const room = new ClientRoom(code, joinTransport(code), { clientId: clientIdFor(code), name, color: colorIn.value });
    // Geliştirme sırasında konsoldan inceleme için
    if (import.meta.env.DEV) (window as unknown as { __room: unknown }).__room = room;
    let entered = false;
    room.events.onLobby = (lobby, seat) => {
      if (entered) return;
      entered = true;
      renderJoinLobby(host, cb, room, lobby, seat);
    };
    room.events.onGameState = (state) => {
      if (entered) return;
      entered = true;
      cb.startClient(state, room);
    };
    room.events.onStatus = (s, reason) => {
      if (s === 'closed' && !entered) {
        status.textContent = reason ?? 'Bağlantı kapandı.';
        working = false;
      }
    };
    try {
      await room.connect();
    } catch (e) {
      status.textContent = (e as Error).message;
      working = false;
    }
  };

  host.appendChild(
    h(
      'div',
      { class: 'screen' },
      h(
        'div',
        { class: 'paper-card' },
        h('h1', { class: 'title small-title' }, '🌐 Çevrimiçi oyun'),
        h('p', {}, 'Herkes kendi cihazından oynar. Oyun oda sahibinin tarayıcısında çalışır; sunucu kurmaya gerek yok.'),
        h('h3', {}, 'Oda kur'),
        h('p', { class: 'muted small' }, 'Bir oda kodu ve davet linki alırsın, ayarları sen yaparsın.'),
        h('button', { class: 'btn btn-primary', onClick: () => void create() }, '🏠 Oda kur'),
        h('h3', { style: { marginTop: '18px' } }, 'Odaya katıl'),
        h('div', { class: 'row' }, 'Ad ', nameIn, colorIn),
        h('div', { class: 'row' }, 'Oda kodu ', codeIn, h('button', { class: 'btn btn-primary', onClick: () => void join() }, '🚪 Katıl')),
        status,
        h('div', { class: 'row-buttons' }, h('button', { class: 'btn', onClick: () => cb.menu() }, '← Geri')),
      ),
    ),
  );
  if (presetCode) nameIn.focus();
}

function renderJoinLobby(host: HTMLElement, cb: OnlineCallbacks, room: ClientRoom, firstLobby: LobbyInfo, firstSeat: number | null) {
  clear(host);
  const profile = loadProfile();
  const seatsEl = h('div', {});
  const infoEl = h('p', { class: 'muted small' });
  const statusEl = h('p', { class: 'muted small' }, ' ');
  const nameIn = h('input', { type: 'text', class: 'text', maxLength: 16, value: profile.name });
  const colorIn = h('input', { type: 'color', value: profile.color });
  const sendProfile = () => {
    const name = nameIn.value.trim() || 'Konuk';
    saveProfile({ name, color: colorIn.value });
    room.setProfile(name, colorIn.value);
  };
  nameIn.addEventListener('change', sendProfile);
  colorIn.addEventListener('change', sendProfile);

  const draw = (lobby: LobbyInfo, seat: number | null) => {
    clear(seatsEl);
    lobby.seats.forEach((x, i) => {
      const mine = seat === i;
      const label = x.kind === 'host' ? 'Oda sahibi' : x.kind === 'bot' ? '🤖 Bot' : x.claimedBy ? (mine ? 'Sen' : 'Dolu') : 'Boş';
      seatsEl.appendChild(
        h(
          'div',
          { class: 'seat-row' },
          h('span', { class: 'num-badge' }, i + 1),
          h('span', { class: 'dot', style: { background: x.color } }),
          h('span', { class: 'grow' }, h('b', {}, x.kind === 'remote' && !x.claimedBy ? 'Davetli koltuk' : x.name), ' ', h('span', { class: 'muted small' }, label)),
          x.kind === 'remote' && !x.claimedBy ? h('button', { class: 'btn btn-small btn-primary', onClick: () => room.claim(i) }, 'Otur') : null,
          mine ? h('button', { class: 'btn btn-small', onClick: () => room.claim(null) }, 'Kalk') : null,
        ),
      );
    });
    infoEl.textContent = `Harita ${lobby.width}×${lobby.height} · seed ${lobby.seed} · İzleyiciler: ${lobby.spectators.length ? lobby.spectators.join(', ') : '—'}`;
    statusEl.textContent = seat === null ? '👀 Şu an izleyicisin. Oynamak için boş bir koltuğa otur.' : `✔ ${seat + 1}. koltuktasın. Oda sahibinin başlatması bekleniyor…`;
  };
  room.events.onLobby = (lobby, seat) => draw(lobby, seat);
  room.events.onGameState = (state) => cb.startClient(state, room);
  room.events.onNotice = (t) => toast(t, 'info');
  room.events.onStatus = (s, reason) => {
    if (s === 'reconnecting') statusEl.textContent = '📡 Bağlantı koptu, yeniden bağlanılıyor…';
    if (s === 'closed') {
      toast(reason ?? 'Oda kapandı', 'error', 5000);
      cb.menu();
    }
  };

  host.appendChild(
    h(
      'div',
      { class: 'screen' },
      h(
        'div',
        { class: 'paper-card wide-card' },
        h('h1', { class: 'title small-title' }, '🌐 Oda ', h('span', { class: 'room-code' }, room.code)),
        h('div', { class: 'row' }, 'Adın ', nameIn, colorIn),
        h('h3', {}, 'Koltuklar'),
        seatsEl,
        infoEl,
        statusEl,
        h(
          'div',
          { class: 'row-buttons' },
          h(
            'button',
            {
              class: 'btn',
              onClick: () => {
                room.leave();
                cb.menu();
              },
            },
            '← Odadan çık',
          ),
          h('button', { class: 'btn', onClick: () => room.claim(null) }, '👀 İzleyici ol'),
        ),
      ),
    ),
  );
  draw(firstLobby, firstSeat);
}
