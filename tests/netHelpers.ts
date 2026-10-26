import type { ClientMessage, HostMessage } from '../src/net/protocol';
import type { ClientTransport, Conn, HostTransport } from '../src/net/transport';

/** Bellek içi taşıyıcı: mesajlar eşzamanlı iletilir. */
export function memoryNetwork() {
  let onConn: ((c: Conn<ClientMessage, HostMessage>) => void) | null = null;
  let n = 0;
  const host: HostTransport<ClientMessage, HostMessage> = {
    onConnection: (cb) => (onConn = cb),
    close: () => {},
  };
  function endpoint<In, Out>(id: string) {
    const msgs: ((m: In) => void)[] = [];
    const closes: (() => void)[] = [];
    let peer: { deliver(m: Out): void; closed(): void } | null = null;
    let open = true;
    const conn: Conn<In, Out> = {
      id,
      send: (m) => open && peer?.deliver(structuredClone(m)),
      onMessage: (cb) => msgs.push(cb),
      onClose: (cb) => closes.push(cb),
      close: () => {
        if (!open) return;
        open = false;
        closes.forEach((f) => f());
        peer?.closed();
      },
    };
    return {
      conn,
      link: (p: { deliver(m: Out): void; closed(): void }) => (peer = p),
      deliver: (m: In) => open && msgs.forEach((f) => f(m)),
      closed: () => {
        if (!open) return;
        open = false;
        closes.forEach((f) => f());
      },
    };
  }
  const clientTransport = (): ClientTransport<HostMessage, ClientMessage> & { drop(): void } => {
    let current: Conn<HostMessage, ClientMessage> | null = null;
    return {
      async connect() {
        const id = `c${++n}`;
        const h = endpoint<ClientMessage, HostMessage>(id);
        const c = endpoint<HostMessage, ClientMessage>(id);
        h.link(c);
        c.link(h);
        onConn?.(h.conn);
        current = c.conn;
        return c.conn;
      },
      close: () => current?.close(),
      drop: () => current?.close(),
    };
  };
  return { host, clientTransport };
}
