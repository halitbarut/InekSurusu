import Peer, { type DataConnection } from 'peerjs';
import type { ClientMessage, HostMessage } from './protocol';
import type { ClientTransport, Conn, HostTransport } from './transport';

/** PeerJS kimlik öneki: oda kodu bu önekle oda sahibinin kimliği olur. */
const ID_PREFIX = 'inek-surusu-v1-';
const CONNECT_TIMEOUT_MS = 12_000;

function wrap<In, Out>(c: DataConnection): Conn<In, Out> {
  return {
    id: c.connectionId,
    send: (msg) => {
      if (c.open) c.send(msg);
    },
    onMessage: (cb) => c.on('data', (d) => cb(d as In)),
    onClose: (cb) => {
      c.on('close', cb);
      // Hatalar (ör. tek bir mesajın gönderilememesi) bağlantıyı koparmaz; kopma 'close' ile gelir
      c.on('error', (e) => console.warn('Veri bağlantısı hatası', e));
    },
    close: () => c.close(),
  };
}

function waitOpen(peer: Peer): Promise<void> {
  return new Promise((resolve, reject) => {
    peer.once('open', () => resolve());
    peer.once('error', (e) => reject(e));
  });
}

/** Oda sahibi: kod ile PeerJS kimliği alır ve gelen bağlantıları dinler. */
export async function openHost(code: string): Promise<HostTransport<ClientMessage, HostMessage>> {
  const peer = new Peer(ID_PREFIX + code, { debug: 0 });
  try {
    await waitOpen(peer);
  } catch (e) {
    peer.destroy();
    const type = (e as { type?: string }).type;
    throw new Error(type === 'unavailable-id' ? 'unavailable-id' : 'Eşleşme sunucusuna bağlanılamadı. İnternet bağlantını kontrol et.');
  }
  // Eşleşme sunucusuyla bağlantı koparsa yeniden bağlan (mevcut oyuncu bağlantıları etkilenmez)
  peer.on('disconnected', () => {
    if (!peer.destroyed) peer.reconnect();
  });
  const listeners: ((c: Conn<ClientMessage, HostMessage>) => void)[] = [];
  peer.on('connection', (dc) => {
    dc.on('open', () => {
      const conn = wrap<ClientMessage, HostMessage>(dc);
      for (const l of listeners) l(conn);
    });
  });
  return {
    onConnection: (cb) => listeners.push(cb),
    close: () => peer.destroy(),
  };
}

/** Katılan: kendi rastgele kimliğiyle oda sahibine bağlanır. */
export function joinTransport(code: string): ClientTransport<HostMessage, ClientMessage> {
  let peer: Peer | null = null;
  return {
    async connect() {
      if (!peer || peer.destroyed) {
        peer = new Peer({ debug: 0 });
        try {
          await waitOpen(peer);
        } catch {
          peer.destroy();
          peer = null;
          throw new Error('Eşleşme sunucusuna bağlanılamadı. İnternet bağlantını kontrol et.');
        }
      } else if (peer.disconnected) {
        peer.reconnect();
        await new Promise((r) => setTimeout(r, 500));
      }
      const p = peer;
      return new Promise<Conn<HostMessage, ClientMessage>>((resolve, reject) => {
        // 'binary' kipi büyük mesajları (oyun durumu ~30 KB+) parçalara bölerek gönderir; 'json' kipi 16 KB ile sınırlı
        const dc = p.connect(ID_PREFIX + code, { reliable: true, serialization: 'binary' });
        const timer = setTimeout(() => {
          dc.close();
          reject(new Error('Oda bulunamadı ya da oda sahibine ulaşılamadı.'));
        }, CONNECT_TIMEOUT_MS);
        const onErr = (e: unknown) => {
          if ((e as { type?: string }).type === 'peer-unavailable') {
            clearTimeout(timer);
            reject(new Error('Bu kodla açık bir oda yok.'));
          }
        };
        p.on('error', onErr);
        dc.on('open', () => {
          clearTimeout(timer);
          p.off('error', onErr);
          resolve(wrap<HostMessage, ClientMessage>(dc));
        });
      });
    },
    close() {
      peer?.destroy();
      peer = null;
    },
  };
}
