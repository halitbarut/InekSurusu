import { Sketch } from './sketch';

/**
 * Öğretici haritası (26×18): batıda oyuncu, doğuda Mehmet (kara komşusu), kuzeydoğu adasında Zeynep.
 * Oyuncunun batı kıyısında boğazla açılan bir koy, güneydoğuda sahipsiz bir ada, kuzeyde göl.
 */
export function tutorialMap(): Sketch {
  const s = new Sketch(26, 18);
  // Ana kara
  s.poly([[2, 3], [9, 2.2], [15, 2.6], [17, 5.6], [19.6, 6], [20, 12], [18.6, 16], [11, 16.4], [3, 15.6], [2, 10]]);
  // Batı kıyısındaki koy ve okyanusa açılan dar boğaz (yakaları: üstteki ve alttaki üçer kare)
  s.ellipse(6.5, 8.5, 2.2, 1.6, false);
  s.rect(1, 7, 4, 7, true).rect(1, 9, 4, 9, true);
  s.rect(0, 8, 4, 8, false);
  s.rect(0, 0, 0, 17, false);
  s.rect(1, 7, 1, 9, false);
  // Kuzeyde göl
  s.ellipse(10, 4.5, 1.2, 0.9, false);
  // Kuzeydoğuda Zeynep'in adası
  s.ellipse(22, 3.2, 3.4, 2.4);
  // Güneydoğuda sahipsiz ada
  s.ellipse(23.4, 13.8, 1.8, 1.6);
  return s.mines({
    gold: [[8, 9], [22, 2]],
    iron: [[4, 12], [16, 13]],
    oil: [[7, 14], [23, 14]],
    steel: [[8, 4], [17, 9]],
  });
}
