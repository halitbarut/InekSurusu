/**
 * Ağ taşıma katmanı soyutlaması. Oda mantığı (HostRoom/ClientRoom) yalnızca bu
 * arayüzleri görür; gerçek uygulama PeerJS (peer.ts), testlerde bellek içi sahtesi kullanılır.
 */
export interface Conn<In, Out> {
  readonly id: string;
  send(msg: Out): void;
  onMessage(cb: (msg: In) => void): void;
  onClose(cb: () => void): void;
  close(): void;
}

export interface HostTransport<In, Out> {
  onConnection(cb: (conn: Conn<In, Out>) => void): void;
  close(): void;
}

export interface ClientTransport<In, Out> {
  /** Odaya bağlanır; bağlantı açılınca çözülür. */
  connect(): Promise<Conn<In, Out>>;
  close(): void;
}
