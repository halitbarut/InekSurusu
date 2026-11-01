/**
 * Gerçekçi botların hazır sözleri. Metinler şablondur; {x} ilgili oyuncunun adıyla değiştirilir. Bot serbest metin
 * üretmez, gelen özel mesajları okumaz: yalnızca oyun içi olaylara tepki verir.
 */
export type Personality = 'aggressive' | 'cautious' | 'merchant' | 'opportunist' | 'loyal';
export const PERSONALITIES: readonly Personality[] = ['aggressive', 'cautious', 'merchant', 'opportunist', 'loyal'];
export const PERSONALITY_NAME: Record<Personality, string> = { aggressive: 'Saldırgan', cautious: 'Temkinli', merchant: 'Tüccar', opportunist: 'Fırsatçı', loyal: 'Sadık müttefik' };

export type PhraseTrigger = 'betrayed' | 'betraying' | 'alliance' | 'conquest' | 'revenge' | 'defaulted' | 'capital_fell';

export interface Phrase {
  trigger: PhraseTrigger;
  /** Yalnızca bu kişilik söyler; yoksa herkes */
  who?: Personality;
  text: string;
}

export const PHRASES: readonly Phrase[] = [
  { trigger: 'betrayed', who: 'aggressive', text: 'Bunu {x} yanına bırakmam. Sınırda görüşürüz.' },
  { trigger: 'betrayed', who: 'cautious', text: '{x}, sana güvenmem hataydı. Bir daha olmayacak.' },
  { trigger: 'betrayed', who: 'merchant', text: '{x} ile iş bitmiştir. Bu ihanetin bedeli ağır olacak.' },
  { trigger: 'betrayed', who: 'opportunist', text: 'Demek öyle, {x}. Sıra bende de gelir.' },
  { trigger: 'betrayed', who: 'loyal', text: '{x}, verilen söz bozulmaz. Bunu kimse unutmayacak.' },
  { trigger: 'betraying', who: 'aggressive', text: 'İttifak buraya kadar, {x}. Güçlü olan kazanır.' },
  { trigger: 'betraying', who: 'opportunist', text: 'Kişisel değil {x}, fırsat bu fırsat.' },
  { trigger: 'betraying', who: 'merchant', text: 'Bu ortaklık artık kâr etmiyor, {x}.' },
  { trigger: 'betraying', text: '{x}, yollarımız burada ayrılıyor.' },
  { trigger: 'alliance', who: 'loyal', text: '{x}, birlikte daha güçlüyüz. Sözüm sözdür.' },
  { trigger: 'alliance', who: 'merchant', text: '{x}, bu ittifak ikimize de kazandırır.' },
  { trigger: 'alliance', who: 'cautious', text: '{x}, öne geçen var. Birlikte durmalıyız.' },
  { trigger: 'alliance', text: '{x}, gel elimizi birleştirelim.' },
  { trigger: 'conquest', who: 'aggressive', text: 'Bir toprak daha. Sıradaki kim?' },
  { trigger: 'conquest', who: 'opportunist', text: 'Kapı açık kalınca girmek gerekir.' },
  { trigger: 'conquest', who: 'cautious', text: 'Bu kadarı yeter, sınırlarımı sağlama alayım.' },
  { trigger: 'conquest', text: 'Güzel bir zafer oldu.' },
  { trigger: 'revenge', who: 'aggressive', text: '{x}, borcunu ödeme zamanı.' },
  { trigger: 'revenge', who: 'loyal', text: '{x}, bu saldırı müttefikime yaptığın içindir.' },
  { trigger: 'revenge', text: '{x}, yaptığını unutmadım.' },
  { trigger: 'defaulted', who: 'merchant', text: '{x} borcunu ödemedi. Bir daha kuruş vermem.' },
  { trigger: 'defaulted', text: '{x}, borç borçtur. Hatırlatırım.' },
  { trigger: 'capital_fell', who: 'aggressive', text: 'Bir başkent daha düştü. Sırada kim var?' },
  { trigger: 'capital_fell', who: 'cautious', text: 'Bir başkent düştü. Herkes dikkatli olsun.' },
  { trigger: 'capital_fell', who: 'merchant', text: 'Yeni pazarlar açılıyor demek.' },
  { trigger: 'capital_fell', text: 'Dünya değişiyor.' },
];

/** Şablonu oyuncu adıyla doldurur */
export function phraseText(id: number, about: string): string {
  return PHRASES[id]?.text.replace('{x}', about) ?? '';
}
