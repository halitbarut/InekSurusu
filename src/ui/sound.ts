import { getPrefs, setPrefs } from './prefs';

/**
 * Oyun sesleri: hepsi Web Audio API ile anında sentezlenir, ses dosyası yoktur.
 * Tarayıcılar sesi ilk kullanıcı etkileşiminden önce açtırmadığı için bağlam ilk çalmada oluşturulur.
 */

export type SoundName =
  | 'click'
  | 'claim'
  | 'build'
  | 'produce'
  | 'battleStart'
  | 'win'
  | 'lose'
  | 'capitalFall'
  | 'turn'
  | 'offer'
  | 'undo'
  | 'chat'
  | 'tick'
  | 'timeUp';

/** "Hızlı oynat"ta da çalan önemli olaylar */
const IMPORTANT: ReadonlySet<SoundName> = new Set(['win', 'lose', 'capitalFall', 'offer', 'chat']);

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;

function audio(): AudioContext | null {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null;
  if (!ctx) {
    try {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.connect(ctx.destination);
      applyVolume();
    } catch {
      return null;
    }
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

export function applyVolume() {
  if (!master || !ctx) return;
  const p = getPrefs();
  master.gain.setValueAtTime(p.muted ? 0 : p.volume * 0.5, ctx.currentTime);
}

export function setVolume(volume: number) {
  setPrefs({ volume: Math.max(0, Math.min(1, volume)) });
  applyVolume();
}

export function setMuted(muted: boolean) {
  setPrefs({ muted });
  applyVolume();
}

function noise(c: AudioContext): AudioBuffer {
  if (noiseBuf) return noiseBuf;
  noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
  const d = noiseBuf.getChannelData(0);
  // Sabit tohumlu gürültü (Math.random kullanmadan, her açılışta aynı ses)
  let x = 12345;
  for (let i = 0; i < d.length; i++) {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    d[i] = (x / 0x7fffffff) * 2 - 1;
  }
  return noiseBuf;
}

/** Zarflı tek nota */
function tone(c: AudioContext, at: number, freq: number, dur: number, opts: { type?: OscillatorType; gain?: number; slideTo?: number; attack?: number } = {}) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = opts.type ?? 'triangle';
  o.frequency.setValueAtTime(freq, at);
  if (opts.slideTo) o.frequency.exponentialRampToValueAtTime(opts.slideTo, at + dur);
  const peak = opts.gain ?? 0.3;
  const a = opts.attack ?? 0.008;
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + a);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(master!);
  o.start(at);
  o.stop(at + dur + 0.02);
}

/** Süzgeçten geçmiş kısa gürültü (tıkırtı, kalem, gümbürtü) */
function burst(c: AudioContext, at: number, dur: number, opts: { freq: number; q?: number; type?: BiquadFilterType; gain?: number }) {
  const src = c.createBufferSource();
  src.buffer = noise(c);
  const f = c.createBiquadFilter();
  f.type = opts.type ?? 'bandpass';
  f.frequency.setValueAtTime(opts.freq, at);
  f.Q.value = opts.q ?? 1;
  const g = c.createGain();
  g.gain.setValueAtTime(opts.gain ?? 0.4, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  src.connect(f).connect(g).connect(master!);
  src.start(at, Math.random() * 0.5);
  src.stop(at + dur + 0.02);
}

/** Ses çal. byBot: botun olayı ("Hızlı oynat" açıksa yalnızca önemli olanlar çalar). */
export function play(name: SoundName, byBot = false) {
  const p = getPrefs();
  if (p.muted || p.volume <= 0) return;
  if (byBot && p.fastBots && !IMPORTANT.has(name)) return;
  const c = audio();
  if (!c || !master) return;
  const t = c.currentTime + 0.01;
  switch (name) {
    case 'click':
      burst(c, t, 0.03, { freq: 2400, q: 4, gain: 0.12 });
      break;
    case 'claim':
      // Kalemle karalama + küçük "tık"
      burst(c, t, 0.12, { freq: 3200, q: 0.8, gain: 0.18 });
      tone(c, t + 0.05, 660, 0.12, { gain: 0.18, slideTo: 880 });
      break;
    case 'build':
      // İki çekiç vuruşu
      for (const k of [0, 0.16]) {
        burst(c, t + k, 0.09, { freq: 900, q: 2, gain: 0.45 });
        tone(c, t + k, 180, 0.12, { type: 'sine', gain: 0.35, slideTo: 90 });
      }
      break;
    case 'produce':
      // Makine: kısa metalik iki nota
      tone(c, t, 320, 0.1, { type: 'square', gain: 0.08 });
      tone(c, t + 0.1, 480, 0.16, { type: 'square', gain: 0.08 });
      burst(c, t + 0.1, 0.08, { freq: 5000, q: 6, gain: 0.12 });
      break;
    case 'battleStart':
      // Davul gümbürtüsü + boru
      for (let k = 0; k < 5; k++) burst(c, t + k * 0.07, 0.12, { freq: 140, q: 1, type: 'lowpass', gain: 0.5 });
      tone(c, t + 0.3, 220, 0.45, { type: 'sawtooth', gain: 0.12, attack: 0.06 });
      tone(c, t + 0.3, 330, 0.45, { type: 'sawtooth', gain: 0.08, attack: 0.06 });
      break;
    case 'win':
      [523, 659, 784, 1047].forEach((f, k) => tone(c, t + k * 0.09, f, 0.3, { gain: 0.22 }));
      break;
    case 'lose':
      [440, 370, 311, 262].forEach((f, k) => tone(c, t + k * 0.12, f, 0.32, { type: 'sine', gain: 0.22 }));
      break;
    case 'capitalFall': {
      // Derin gümbürtü ve görkemli akor
      burst(c, t, 1.2, { freq: 90, q: 0.7, type: 'lowpass', gain: 0.8 });
      tone(c, t, 70, 1.2, { type: 'sine', gain: 0.5, slideTo: 40 });
      const chord = [262, 330, 392, 523];
      chord.forEach((f, k) => tone(c, t + 0.35 + k * 0.05, f, 1.4, { type: 'sawtooth', gain: 0.07, attack: 0.08 }));
      chord.forEach((f) => tone(c, t + 0.35, f * 2, 1.2, { type: 'triangle', gain: 0.06, attack: 0.1 }));
      break;
    }
    case 'turn':
      tone(c, t, 784, 0.25, { type: 'sine', gain: 0.16 });
      tone(c, t + 0.12, 1047, 0.35, { type: 'sine', gain: 0.14 });
      break;
    case 'offer':
      // Kâğıt hışırtısı + çan
      burst(c, t, 0.18, { freq: 6000, q: 0.5, type: 'highpass', gain: 0.12 });
      tone(c, t + 0.1, 1319, 0.5, { type: 'sine', gain: 0.18 });
      tone(c, t + 0.28, 1568, 0.6, { type: 'sine', gain: 0.15 });
      break;
    case 'undo':
      tone(c, t, 700, 0.12, { type: 'sine', gain: 0.14, slideTo: 420 });
      break;
    case 'chat':
      // Hafif "pıt": yeni sohbet mesajı
      tone(c, t, 988, 0.09, { type: 'sine', gain: 0.1 });
      tone(c, t + 0.07, 1319, 0.14, { type: 'sine', gain: 0.08 });
      break;
    case 'tick':
      // Süre azalıyor: kısa tahta tıkırtısı
      burst(c, t, 0.04, { freq: 1800, q: 6, gain: 0.25 });
      tone(c, t, 880, 0.05, { type: 'square', gain: 0.04 });
      break;
    case 'timeUp':
      tone(c, t, 523, 0.18, { type: 'square', gain: 0.07 });
      tone(c, t + 0.2, 392, 0.3, { type: 'square', gain: 0.07 });
      break;
  }
}

/**
 * Topaç: yavaşlayan tıkırtılar ve sonunda durma sesi. Topaç animasyonu ile aynı sürede biter.
 * durationMs 0 ise yalnızca durma sesi çalar.
 */
export function playSpin(durationMs: number, byBot = false) {
  const p = getPrefs();
  if (p.muted || p.volume <= 0) return;
  if (byBot && p.fastBots) return;
  const c = audio();
  if (!c || !master) return;
  const start = c.currentTime + 0.01;
  const dur = durationMs / 1000;
  // Tıkırtı aralığı başta 35 ms, sonda ~220 ms (ease-out)
  let at = 0;
  let k = 0;
  while (dur > 0 && at < dur - 0.05 && k < 80) {
    const prog = at / dur;
    burst(c, start + at, 0.025, { freq: 2800 - prog * 1200, q: 5, gain: 0.22 });
    at += 0.035 + prog * prog * 0.19;
    k++;
  }
  // Durma: tahta üzerinde "tok"
  burst(c, start + dur, 0.12, { freq: 500, q: 1.5, gain: 0.5 });
  tone(c, start + dur, 210, 0.16, { type: 'sine', gain: 0.3, slideTo: 140 });
}

let clicksBound = false;

/** Düğmelere çok hafif tıklama sesi (bir kez bağlanır) */
export function bindClickSounds() {
  if (clicksBound) return;
  clicksBound = true;
  document.addEventListener(
    'click',
    (e) => {
      const el = (e.target as HTMLElement | null)?.closest('button, .preset-card, summary');
      if (el && !(el as HTMLButtonElement).disabled) play('click');
    },
    true,
  );
}

/** Ayarlar penceresi için ses düzeyi ve sessiz mod alanları (form-grid içine) */
export function soundControls(): HTMLElement[] {
  const p = getPrefs();
  const vol = document.createElement('input');
  vol.type = 'range';
  vol.min = '0';
  vol.max = '100';
  vol.value = String(Math.round(p.volume * 100));
  vol.setAttribute('aria-label', 'Ana ses düzeyi');
  vol.addEventListener('input', () => setVolume(Number(vol.value) / 100));
  vol.addEventListener('change', () => play('claim'));
  const mute = document.createElement('input');
  mute.type = 'checkbox';
  mute.checked = p.muted;
  mute.addEventListener('change', () => setMuted(mute.checked));
  const l1 = document.createElement('label');
  l1.textContent = 'Ana ses düzeyi';
  const l2 = document.createElement('label');
  l2.textContent = 'Sessiz mod';
  return [l1, vol, l2, mute];
}
