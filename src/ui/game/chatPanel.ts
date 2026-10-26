import type { GameState } from '../../engine';
import { CHAT_MAX_LEN, type ChatMessage } from '../../net/chat';
import type { ChatChannel } from '../../net/hostRoom';
import { clear, h, toast } from '../dom';
import { icon } from '../icons';
import { play } from '../sound';

/** Sohbet sekmesi: 'all' genel kanal, sayı = o koltukla özel konuşma */
type Tab = 'all' | number;

/**
 * Çevrimiçi oyunun sohbet paneli: açılıp kapanır, genel kanal ve oyuncu başına özel sekmeler,
 * okunmamış mesaj rozeti ve hafif bir ses. Hot-seat ve bot oyunlarında hiç oluşturulmaz.
 */
export class ChatPanel {
  readonly el: HTMLElement;
  /** Üst çubuktaki aç/kapa düğmesi */
  readonly toggleBtn: HTMLElement;
  private badge = h('span', { class: 'badge hidden' });
  private tabsEl = h('div', { class: 'chat-tabs', role: 'tablist' });
  private listEl = h('div', { class: 'chat-list', 'aria-live': 'polite' });
  private input = h('input', { type: 'text', class: 'text chat-input', maxLength: CHAT_MAX_LEN, placeholder: 'Mesaj yaz…', 'aria-label': 'Mesaj' });
  private noteEl = h('div', { class: 'chat-note muted small' });
  private open = false;
  private tab: Tab = 'all';
  private unread = new Map<Tab, number>();
  /** Çözülmüş özel mesajlar (id → metin; null = okunamadı) */
  private plain = new Map<number, string | null>();
  private seen = new Set<number>();
  private openTabs = new Set<number>();
  private sending = false;

  constructor(
    private channel: ChatChannel,
    private getState: () => GameState,
  ) {
    this.toggleBtn = h(
      'button',
      { class: 'btn btn-icon chat-toggle', title: 'Sohbet', 'aria-label': 'Sohbet', 'aria-expanded': 'false', onClick: () => this.setOpen(!this.open) },
      icon('chat'),
      this.badge,
    );
    const form = h(
      'form',
      {
        class: 'chat-form',
        onSubmit: (e: Event) => {
          e.preventDefault();
          void this.send();
        },
      },
      this.input,
      h('button', { class: 'btn btn-small btn-primary', type: 'submit', title: 'Gönder', 'aria-label': 'Gönder' }, icon('send')),
    );
    this.el = h(
      'section',
      { class: 'chat-panel hidden', 'aria-label': 'Sohbet' },
      h(
        'div',
        { class: 'chat-head' },
        h('b', {}, icon('chat'), ' Sohbet'),
        this.channel.setSpectatorChat
          ? h(
              'label',
              { class: 'chat-mod small', title: 'Kapalıyken izleyiciler (oturmayanlar ve elenenler) sohbeti okur ama yazamaz' },
              h('input', {
                type: 'checkbox',
                checked: this.channel.spectatorChatOpen(),
                onChange: (e: Event) => this.channel.setSpectatorChat?.((e.target as HTMLInputElement).checked),
              }),
              icon('eye'),
              ' İzleyiciler yazabilir',
            )
          : null,
        h('button', { class: 'icon-btn', title: 'Kapat', 'aria-label': 'Sohbeti kapat', onClick: () => this.setOpen(false) }, icon('close')),
      ),
      this.tabsEl,
      this.listEl,
      this.noteEl,
      form,
    );
    // Oyunun kısayolları (boşluk, Ctrl+Z…) yazarken çalışmasın
    this.input.addEventListener('keydown', (e) => e.stopPropagation());
    this.absorbHistory();
    this.render();
  }

  /** Geçmişteki mesajları sessizce okunmuş say, özel konuşmaların sekmelerini aç */
  private absorbHistory() {
    for (const m of this.channel.chatMessages()) {
      this.seen.add(m.id);
      const tab = this.tabOf(m);
      if (typeof tab === 'number') this.openTabs.add(tab);
    }
  }

  /** Yeni mesaj geldi (null: liste/anahtarlar yenilendi) */
  onMessage(msg: ChatMessage | null) {
    if (msg && !this.seen.has(msg.id)) {
      this.seen.add(msg.id);
      const mine = msg.seat !== null && msg.seat === this.channel.chatSeat() && !msg.spectator;
      const tab = this.tabOf(msg);
      if (typeof tab === 'number') this.openTabs.add(tab);
      if (!mine) {
        if (!this.open || this.tab !== tab) this.unread.set(tab, (this.unread.get(tab) ?? 0) + 1);
        play('chat');
      }
    } else if (!msg) {
      // Geçmiş geldi (ör. yeniden bağlanınca): sesi çalmadan işaretle
      this.absorbHistory();
    }
    this.render();
  }

  /** Diplomasi penceresinden: bu oyuncuyla özel sohbeti aç */
  openPrivate(seat: number) {
    const prob = this.channel.privateProblem(seat);
    if (prob) {
      toast(prob, 'error');
      return;
    }
    this.openTabs.add(seat);
    this.tab = seat;
    this.setOpen(true);
  }

  setOpen(open: boolean) {
    this.open = open;
    this.el.classList.toggle('hidden', !open);
    this.toggleBtn.setAttribute('aria-expanded', String(open));
    if (open) {
      this.unread.delete(this.tab);
      setTimeout(() => this.input.focus(), 0);
    }
    this.render();
  }

  private me(): number | null {
    return this.channel.chatSeat();
  }

  /** Mesajın düştüğü sekme (bu cihazın gözünden) */
  private tabOf(m: ChatMessage): Tab {
    if (m.to === null) return 'all';
    return m.seat === this.me() ? m.to : (m.seat ?? 'all');
  }

  private async send() {
    if (this.sending) return;
    const text = this.input.value;
    if (!text.trim()) return;
    this.sending = true;
    try {
      const err = await this.channel.sendChat(this.tab === 'all' ? null : this.tab, text);
      if (err) toast(err, 'error');
      else this.input.value = '';
    } finally {
      this.sending = false;
    }
  }

  render() {
    const s = this.getState();
    const total = [...this.unread.values()].reduce((a, b) => a + b, 0);
    this.badge.textContent = String(total);
    this.badge.classList.toggle('hidden', total === 0);
    this.toggleBtn.setAttribute('aria-label', total ? `Sohbet (${total} okunmamış)` : 'Sohbet');
    if (!this.open) return;
    this.unread.delete(this.tab);
    // Sekmeler
    clear(this.tabsEl);
    const tabBtn = (t: Tab, label: string, color?: string) => {
      const n = this.unread.get(t) ?? 0;
      return h(
        'button',
        {
          class: `chat-tab ${this.tab === t ? 'active' : ''}`,
          role: 'tab',
          'aria-selected': String(this.tab === t),
          onClick: () => {
            this.tab = t;
            this.unread.delete(t);
            this.render();
            this.input.focus();
          },
        },
        color ? h('span', { class: 'dot small', style: { background: color } }) : icon(t === 'all' ? 'chat' : 'lock'),
        label,
        n ? h('span', { class: 'chat-unread' }, n) : null,
      );
    };
    this.tabsEl.append(tabBtn('all', 'Genel'));
    for (const seat of this.openTabs) {
      const p = s.players[seat];
      if (p) this.tabsEl.append(tabBtn(seat, p.name, p.color));
    }
    // Yeni özel sohbet: insan oyuncular
    const me = this.me();
    const candidates = s.players.filter((p) => p.id !== me && !this.openTabs.has(p.id) && this.channel.privateProblem(p.id) === null);
    if (candidates.length) {
      const sel = h(
        'select',
        {
          class: 'chat-new',
          'aria-label': 'Özel sohbet başlat',
          onChange: (e: Event) => {
            const v = Number((e.target as HTMLSelectElement).value);
            if (Number.isInteger(v) && v >= 0) this.openPrivate(v);
          },
        },
        h('option', { value: '-1' }, '+ Özel'),
        candidates.map((p) => h('option', { value: p.id }, p.name)),
      );
      this.tabsEl.append(sel);
    }
    // Mesajlar
    clear(this.listEl);
    const msgs = this.channel.chatMessages().filter((m) => this.tabOf(m) === this.tab);
    if (msgs.length === 0) {
      this.listEl.append(h('p', { class: 'muted small' }, this.tab === 'all' ? 'Genel kanal: herkes (izleyiciler dahil) okur.' : 'Özel konuşma: yalnızca ikiniz okursunuz, oda sahibi bile göremez.'));
    }
    for (const m of msgs) this.listEl.append(this.line(m));
    this.listEl.scrollTop = this.listEl.scrollHeight;
    // Yazma durumu
    let note: string | null = null;
    if (this.tab === 'all') {
      const spectator = me === null || !s.players[me]?.alive;
      if (spectator && !this.channel.spectatorChatOpen()) note = 'Oda sahibi izleyici sohbetini kapattı.';
      else if (spectator) note = 'İzleyici olarak yazıyorsun.';
    } else {
      const prob = this.channel.privateProblem(this.tab);
      note = prob ?? 'Uçtan uca şifreli: yalnızca ikiniz okursunuz.';
    }
    this.noteEl.textContent = note ?? '';
    this.noteEl.classList.toggle('hidden', !note);
    const blocked = this.tab === 'all' ? (me === null || !s.players[me]?.alive) && !this.channel.spectatorChatOpen() : this.channel.privateProblem(this.tab) !== null;
    this.input.disabled = blocked;
  }

  private line(m: ChatMessage): HTMLElement {
    const time = new Date(m.at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    const body = h('span', { class: 'chat-text' });
    if (m.text !== undefined) body.textContent = m.text;
    else if (m.box) {
      const known = this.plain.get(m.id);
      if (known === undefined) {
        body.textContent = '…';
        void this.channel.openBox(m.box).then((t) => {
          this.plain.set(m.id, t);
          body.textContent = t ?? '(bu cihazda okunamıyor)';
          body.classList.toggle('muted', t === null);
        });
      } else {
        body.textContent = known ?? '(bu cihazda okunamıyor)';
        if (known === null) body.classList.add('muted');
      }
    }
    return h(
      'div',
      { class: `chat-line ${m.seat !== null && m.seat === this.me() && !m.spectator ? 'own' : ''}` },
      h('span', { class: 'chat-time muted' }, time),
      h('span', { class: 'chat-name', style: { color: m.color } }, m.name),
      m.spectator ? h('span', { class: 'tag tag-spectator', title: 'İzleyici' }, icon('eye'), 'izleyici') : null,
      body,
    );
  }
}
