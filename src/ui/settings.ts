import { h } from './dom';
import { getPrefs, setPrefs, type UiPrefs } from './prefs';

type BoolPref = { [K in keyof UiPrefs]: UiPrefs[K] extends boolean ? K : never }[keyof UiPrefs];

/** Ayarlar penceresinde onay kutulu bir tercih satırı (etiket + kutu, form-grid için) */
function boolRow(key: BoolPref, label: string, title: string): HTMLElement[] {
  const box = h('input', { type: 'checkbox', checked: getPrefs()[key], 'aria-label': label, onChange: (e: Event) => setPrefs({ [key]: (e.target as HTMLInputElement).checked } as Partial<UiPrefs>) });
  return [h('label', { title }, label), box];
}

/** Oynanışla ilgili bilgilendirme tercihleri (ana menü ve oyun içi ayarlar) */
export function guidanceControls(): HTMLElement[] {
  return [
    ...boolRow('battlePreview', 'Savaştan önce önizleme', 'Saldırmadan önce masraf, kazanma olasılığı ve kazanınca/kaybedince ne olacağını göster'),
    ...boolRow('endTurnReminder', 'Savaş hakkı hatırlatması', 'Bu tur hiç savaşmadan ve saldırabileceğin bir yer varken turu bitirirken sor'),
  ];
}
