/**
 * Oyun içi sohbet. Genel kanal düz metindir; özel mesajlar uçtan uca şifrelenir: her katılımcının
 * (oda sahibi dahil) bir ECDH P-256 anahtar çifti vardır, açık anahtarlar oda sahibi üzerinden dağıtılır,
 * mesaj iki tarafın ortak anahtarıyla AES-GCM ile şifrelenir. Oda sahibi özel mesajı yalnızca şifreli
 * hâliyle saklar ve aktarır; kendisi taraf değilse okuyamaz.
 */

/** Genel kanal mesajı en fazla bu kadar karakter */
export const CHAT_MAX_LEN = 300;
/** Oda sahibinde saklanan (yeniden bağlananlara geri gönderilen) mesaj sayısı */
export const CHAT_HISTORY = 400;
/** Gönderim sınırı: CHAT_RATE_WINDOW_MS içinde en fazla CHAT_RATE_COUNT mesaj */
export const CHAT_RATE_COUNT = 6;
export const CHAT_RATE_WINDOW_MS = 5000;

/** Şifreli özel mesaj gövdesi. spub/rpub: gönderenin ve alıcının o anki açık anahtarları (JWK metni) */
export interface ChatBox {
  iv: string;
  data: string;
  spub: string;
  rpub: string;
}

export interface ChatMessage {
  /** Oda sahibinin verdiği sıra numarası */
  id: number;
  /** Oda sahibinin saati (epoch ms) */
  at: number;
  /** Gönderenin koltuğu; null = izleyici */
  seat: number | null;
  name: string;
  color: string;
  /** İzleyici (oturmamış ya da elenmiş) olarak yazıldı */
  spectator: boolean;
  /** null = genel kanal, aksi halde alıcının koltuğu */
  to: number | null;
  /** Genel kanalda metin */
  text?: string;
  /** Özel mesajda şifreli gövde */
  box?: ChatBox;
}

/** Katılandan gelen sohbet isteği (oda sahibi gönderen bilgisini kendisi ekler) */
export type ChatSend = { to: null; text: string } | { to: number; box: ChatBox };

export function cleanChatText(text: unknown): string {
  return (typeof text === 'string' ? text : '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim().slice(0, CHAT_MAX_LEN);
}

export function validBox(b: unknown): b is ChatBox {
  if (!b || typeof b !== 'object') return false;
  const o = b as Record<string, unknown>;
  const str = (v: unknown, max: number) => typeof v === 'string' && v.length > 0 && v.length <= max;
  return str(o.iv, 64) && str(o.data, 4096) && str(o.spub, 1024) && str(o.rpub, 1024);
}

/** Basit kayan pencere hız sınırı */
export class RateLimit {
  private times: number[] = [];
  constructor(
    private count = CHAT_RATE_COUNT,
    private windowMs = CHAT_RATE_WINDOW_MS,
  ) {}
  allow(now = Date.now()): boolean {
    this.times = this.times.filter((t) => now - t < this.windowMs);
    if (this.times.length >= this.count) return false;
    this.times.push(now);
    return true;
  }
}

// ------------------------------------------------------------------
// Şifreleme
// ------------------------------------------------------------------

const ECDH = { name: 'ECDH', namedCurve: 'P-256' } as const;

function subtle(): SubtleCrypto {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new Error('Bu tarayıcıda şifreleme yok (güvenli bağlam gerekir: https ya da localhost)');
  return s;
}

const b64 = (buf: ArrayBuffer | Uint8Array) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
};
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

interface StoredIdentity {
  pub: string;
  priv: JsonWebKey;
}

/**
 * Bu cihazın sohbet anahtarı. Oda başına saklanır ki yeniden bağlanınca (sayfa yenilense de) eski özel
 * mesajlar okunabilsin. Depolama yoksa yalnızca bu oturumda geçerlidir.
 */
export class ChatIdentity {
  private shared = new Map<string, Promise<CryptoKey>>();

  private constructor(
    /** Açık anahtar (JWK metni) */
    readonly pub: string,
    private priv: CryptoKey,
  ) {}

  static async create(storageKey?: string): Promise<ChatIdentity> {
    const s = subtle();
    if (storageKey) {
      try {
        const raw = globalThis.localStorage?.getItem(storageKey);
        if (raw) {
          const st = JSON.parse(raw) as StoredIdentity;
          const priv = await s.importKey('jwk', st.priv, ECDH, false, ['deriveKey']);
          return new ChatIdentity(st.pub, priv);
        }
      } catch {
        // bozuk kayıt: yenisini üret
      }
    }
    const pair = (await s.generateKey(ECDH, true, ['deriveKey'])) as CryptoKeyPair;
    const pubJwk = await s.exportKey('jwk', pair.publicKey);
    const pub = JSON.stringify({ kty: pubJwk.kty, crv: pubJwk.crv, x: pubJwk.x, y: pubJwk.y });
    if (storageKey) {
      try {
        const priv = await s.exportKey('jwk', pair.privateKey);
        globalThis.localStorage?.setItem(storageKey, JSON.stringify({ pub, priv } satisfies StoredIdentity));
      } catch {
        // yalnızca bu oturumda
      }
    }
    return new ChatIdentity(pub, pair.privateKey);
  }

  /** Karşı tarafın açık anahtarıyla ortak AES anahtarı (önbellekli) */
  private key(otherPub: string): Promise<CryptoKey> {
    let k = this.shared.get(otherPub);
    if (!k) {
      const s = subtle();
      k = s
        .importKey('jwk', JSON.parse(otherPub) as JsonWebKey, ECDH, false, [])
        .then((pub) => s.deriveKey({ name: 'ECDH', public: pub }, this.priv, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']));
      this.shared.set(otherPub, k);
    }
    return k;
  }

  async seal(text: string, recipientPub: string): Promise<ChatBox> {
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const data = await subtle().encrypt({ name: 'AES-GCM', iv }, await this.key(recipientPub), new TextEncoder().encode(text));
    return { iv: b64(iv), data: b64(data), spub: this.pub, rpub: recipientPub };
  }

  /** Bu cihaz mesajın gönderen ya da alıcısıysa çözer; değilse ya da bozuksa null */
  async open(box: ChatBox): Promise<string | null> {
    const other = box.spub === this.pub ? box.rpub : box.rpub === this.pub ? box.spub : null;
    if (!other) return null;
    try {
      const plain = await subtle().decrypt({ name: 'AES-GCM', iv: unb64(box.iv) }, await this.key(other), unb64(box.data));
      return new TextDecoder().decode(plain);
    } catch {
      return null;
    }
  }
}
