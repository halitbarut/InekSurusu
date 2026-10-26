import { Sketch } from './sketch';

/**
 * Anadolu ve Balkanlar (5–7 oyuncu): gerçek coğrafyadan esinlenmiş, ama birebir değil.
 * Karadeniz ↔ İstanbul Boğazı ↔ Marmara ↔ Çanakkale Boğazı ↔ Ege; Kerç Boğazı ile Azak Denizi;
 * Ege adaları (Midilli, Sakız, Rodos, Girit), Kıbrıs, Tuz Gölü ve Van Gölü.
 */
export function anadolu(): Sketch {
  const s = new Sketch(64, 40);
  // Balkanlar (Trakya, Yunanistan, Mora)
  s.poly([
    [0, 0], [25, 0], [24.5, 6], [23, 9], [23.2, 12.5], [24, 15], [24, 17], [20, 17], [17.5, 17.6], [15, 17], [13, 18.5],
    [11.5, 20.5], [10.5, 23.5], [11, 25.5], [9, 27.2], [7.6, 26.6], [8.7, 29.6], [7.6, 32.2], [5.4, 31.2], [4.6, 28.4],
    [6.2, 26.8], [4, 25.6], [2.2, 22], [1, 17.5], [0, 14],
  ]);
  // Mora'yı anakaraya bağlayan dar kıstak ve Korint körfezi
  s.rect(5, 26, 7, 26, false);
  // Kuzey kıyısı: Ukrayna, Kırım, Kafkasya
  s.poly([[25, 0], [64, 0], [64, 6.5], [58, 7.5], [53, 5.4], [47, 4.4], [40, 4.2], [32, 3.6], [27.5, 4.2], [25, 4.6]]);
  s.ellipse(36, 5, 3, 1.5); // Kırım
  // Azak Denizi ve Kerç Boğazı (Kırım'ın doğusunda dikey geçit)
  s.ellipse(45, 1.5, 4.5, 1.2, false);
  s.rect(40, 1, 40, 4, true);
  s.rect(41, 2, 41, 4, false);
  s.rect(42, 3, 42, 4, true);
  s.tiles([[42, 2]], false);
  // Anadolu, Kafkasya ve Mezopotamya
  s.poly([
    [25, 16], [29, 16.6], [35, 16.2], [43, 16], [50, 15.2], [55.5, 12.6], [57.5, 8.4], [64, 6.5], [64, 34], [56, 36.5],
    [50, 37.2], [46, 38.6], [44.5, 35.6], [41.2, 33], [37.2, 32.4], [33, 33.4], [29, 32.8], [25.6, 31], [23, 28.4],
    [22, 25.6], [21.2, 23.6], [20.6, 21], [21, 19.4], [23.2, 19.2], [26.4, 19.8], [27.6, 18.2], [26, 17.4],
  ]);
  // Hazar Denizi (sağ kenarda) ve Basra'ya inen güneydoğu kıyısı
  s.poly([[58.5, 9.5], [64, 8.2], [64, 27], [61, 25.5], [58.8, 21], [57.6, 15]], false);
  s.poly([[64, 31], [64, 40], [46, 40], [50, 37.6], [57, 35.6]], false);
  // Adriyatik kıyısı
  s.poly([[0, 3], [2.4, 6], [3, 11], [1.6, 15], [0, 16]], false);
  // İskenderun ve Antalya körfezleri biraz daha derin
  s.ellipse(41.6, 33.4, 1.4, 1.2, false);
  s.ellipse(32.8, 33.2, 1.6, 0.8, false);
  // Güney Marmara kıyısı (Truva, Bursa, İzmit) dolu kara
  s.rect(16, 19, 28, 20, true);
  // Marmara Denizi
  s.rect(20, 17, 26, 18, false);
  // İstanbul Boğazı: Marmara'dan Karadeniz'e dikey geçit
  s.rect(24, 13, 26, 16, true);
  s.rect(25, 13, 25, 16, false);
  // Çanakkale Boğazı: Marmara'dan Ege'ye yatay geçit (Gelibolu kuzeyde, Truva güneyde)
  s.rect(16, 16, 20, 16, true);
  s.rect(16, 18, 19, 19, true);
  s.rect(16, 17, 19, 17, false);
  s.rect(14, 16, 15, 18, false);
  // Ege adaları
  s.ellipse(18.7, 22.3, 1.3, 0.9); // Midilli
  s.ellipse(19.2, 25.6, 0.9, 1.1); // Sakız
  s.ellipse(15.4, 24.4, 1.4, 0.9); // Eğriboz'un açığında bir ada
  s.ellipse(12.7, 22.2, 1.6, 0.7); // Eğriboz
  s.ellipse(14.6, 28.6, 1.1, 0.8); // Kiklad
  s.ellipse(22.6, 30.6, 1.2, 0.9); // Rodos
  s.ellipse(15, 34.4, 5.2, 1.1); // Girit
  s.ellipse(35.4, 36.6, 3.4, 1.4); // Kıbrıs
  // Göller: Tuz Gölü, Van Gölü, Ohri
  s.ellipse(34, 24.6, 1.6, 1.3, false);
  s.ellipse(56.5, 23.6, 1.8, 1.4, false);
  s.ellipse(4.3, 17.6, 0.8, 1.1, false);
  // Madenler oyunun dengeli yerleşimiyle, 7 oyuncuya göre her türden 7 (en yakın madene en fazla 11 kare)
  return s.autoMines(7, 6);
}
