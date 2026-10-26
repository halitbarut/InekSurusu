import { Sketch } from './sketch';

/**
 * Takımadalar (3–4 oyuncu): her oyuncuya bir ev adası (gemi için demir ve petrol madeni), altın ve çelik
 * ortadaki atolde ve orta adalarda. Atolün lagünü dar bir boğazla açık denize bağlanır. Genişlemek için gemi şart.
 */
export function archipelago(): Sketch {
  const s = new Sketch(46, 32);
  // Ev adaları
  s.ellipse(8.5, 7.5, 6, 4.2);
  s.ellipse(37.5, 7.5, 6, 4.2);
  s.ellipse(8.5, 24.5, 6, 4.2);
  s.ellipse(37.5, 24.5, 6, 4.2);
  // Her ev adasında küçük bir göl
  s.rect(5, 6, 5, 7, false).rect(41, 6, 41, 7, false).rect(5, 24, 5, 25, false).rect(41, 24, 41, 25, false);
  // Kıyıları biraz girintili olsun
  s.ellipse(13.5, 9.5, 1.4, 1.2, false).ellipse(32.5, 9.5, 1.4, 1.2, false).ellipse(13.5, 22.5, 1.4, 1.2, false).ellipse(32.5, 22.5, 1.4, 1.2, false);
  // Ortada lagünlü atol; lagün doğudan tek karelik bir boğazla denize açılır
  s.ellipse(23, 16, 6.4, 5.2);
  s.ellipse(23, 16, 3.8, 2.9, false);
  s.rect(26, 16, 29, 16, false);
  s.rect(26, 15, 29, 15, true);
  s.rect(26, 17, 29, 17, true);
  // Dört orta ada
  s.ellipse(23, 3.5, 3.2, 1.5);
  s.ellipse(23, 28.5, 3.2, 1.5);
  s.ellipse(3.5, 16, 1.6, 2.6);
  s.ellipse(42.5, 16, 1.6, 2.6);
  // Adacıklar: sefer için ara duraklar
  s.rect(15, 14, 16, 15).rect(30, 3, 31, 3).rect(15, 28, 16, 28).rect(31, 26, 32, 27).rect(16, 3, 16, 4).rect(11, 16, 11, 17).rect(35, 15, 35, 16);
  return s.mines({
    // Ev adalarında gemi için demir ve petrol; altın ve çelik (uçak) ortadaki adalarda
    iron: [[8, 6], [37, 6], [8, 25], [37, 25]],
    oil: [[11, 8], [34, 8], [11, 23], [34, 23]],
    gold: [[21, 12], [18, 17], [22, 3], [24, 28]],
    steel: [[27, 19], [24, 20], [3, 15], [43, 15]],
  });
}

/**
 * Büyük kıta (8 oyuncu): geniş bir kara parçası. Güneydeki büyük iç deniz okyanusa bir boğazla açılır;
 * doğudaki kapalı iç denize kıyısı olan tersaneler yalnızca orada yüzer. Kuzeyde boğazlı bir koy, beş göl.
 */
export function bigContinent(): Sketch {
  const s = new Sketch(70, 46);
  s.poly([
    [4, 9], [9, 4.5], [17, 3.4], [24, 5.2], [31, 3], [39, 4.2], [47, 3.2], [55, 5], [62, 4.4], [66.5, 9], [65.2, 16],
    [67, 23], [65, 31], [66.4, 37], [61, 42.4], [52, 41.2], [44, 43], [36.5, 41.6], [30, 43.2], [22, 41.4], [14, 42.6],
    [7.5, 38.6], [3.6, 32], [5.4, 25], [3, 18],
  ]);
  // Kıyı girintileri ve yarımadalar
  s.ellipse(3.5, 22, 3, 2.2, false).ellipse(66.5, 28, 2.6, 2.4, false).ellipse(19, 43, 3.5, 2, false).ellipse(58, 3.6, 3, 1.8, false);
  s.ellipse(48, 43.5, 3, 2, false).ellipse(11, 4, 3, 1.6, false);
  // Batıda ve doğuda derin körfezler, güneybatıda bir koy
  s.ellipse(5, 27, 6, 4.6, false).ellipse(66, 21, 6, 4.2, false).ellipse(16, 40, 5, 3, false).ellipse(52, 4, 5, 2.6, false);
  // Güneydeki büyük iç deniz ve okyanusa açılan dikey boğaz
  s.poly([[19, 25], [27, 20.5], [36, 21.6], [45, 20.4], [51, 24.4], [47, 31], [38, 32.5], [29, 31.4], [21, 30]], false);
  s.rect(35, 32, 37, 41, true);
  s.rect(36, 32, 36, 35, false);
  s.rect(35, 36, 37, 41, false);
  s.ellipse(36, 39.5, 4, 2.6, false);
  // İç denizde iki ada
  s.ellipse(30.5, 26.5, 1.6, 1.1).ellipse(41, 26.2, 1.3, 1.6);
  // Doğuda kapalı iç deniz (göl sınırından büyük)
  s.ellipse(55, 15, 4.4, 3.2, false);
  // Kuzeyde dar boğazla okyanusa açılan koy
  s.ellipse(30, 9, 4.2, 2.4, false);
  s.rect(29, 3, 31, 6, true);
  s.rect(30, 4, 30, 6, false);
  s.rect(30, 0, 30, 3, false);
  // Göller
  s.ellipse(14, 14, 1.6, 1.3, false).ellipse(13, 31, 1.8, 1.2, false).ellipse(45, 10, 1.4, 1.4, false).ellipse(58, 33, 1.6, 1.3, false).ellipse(22, 16, 1.2, 1.4, false);
  return s.autoMines(8, 3);
}

/**
 * İkiz kıtalar (4–6 oyuncu): batı ve doğu kıtaları haritanın iki kenarına dayanır, aralarındaki kanal kuzey ve
 * güney okyanuslarını yalnızca iki dar boğaz ve ortadaki küçük denizle bağlar. Kanalın iki yakası iki ayrı
 * kıtadadır: bir boğazı idare etmek için iki kıtada da toprak gerekir; kapatılan boğaz gemileri kıtanın öbür
 * yanından dolaştıramaz.
 */
export function twinContinents(): Sketch {
  const s = new Sketch(58, 36);
  // Batı kıtası (sol kenara dayanır)
  s.poly([[0, 8], [7, 6.6], [15, 7.6], [22, 6.4], [27.4, 8.6], [27.4, 13], [25.4, 17], [27.4, 21], [27.4, 26.6], [21, 29], [13, 28], [6, 29.4], [0, 27.6]]);
  // Doğu kıtası (sağ kenara dayanır)
  s.poly([[30.6, 8.6], [35, 6.6], [43, 7.6], [51, 6.2], [58, 7.4], [58, 27.8], [50, 29.4], [42, 28], [35, 29.2], [30.6, 26.6], [30.6, 21], [32.6, 17], [30.6, 13]]);
  // Kanal: kuzeyde ve güneyde birer dar boğaz (tek kare genişlikte), arada küçük bir iç deniz
  s.rect(27, 0, 30, 8, false);
  s.rect(26, 9, 31, 11, true);
  s.rect(28, 9, 28, 11, false);
  s.rect(27, 12, 30, 20, false);
  s.rect(26, 21, 31, 23, true);
  s.rect(28, 21, 28, 23, false);
  s.rect(27, 24, 30, 36, false);
  // Kıyı girintileri ve iç körfezler
  s.ellipse(12, 7, 3, 1.6, false).ellipse(45, 7.2, 3, 1.4, false).ellipse(10, 29, 3, 1.8, false).ellipse(47, 28.8, 3, 1.6, false);
  // Her kıtada okyanusa kısa bir boğazla açılan iç körfez
  s.ellipse(15, 20, 4.2, 3.6, false);
  s.rect(14, 24, 16, 27, true);
  s.rect(15, 24, 15, 28, false);
  s.ellipse(43, 16.5, 4.2, 3.6, false);
  s.rect(42, 9, 44, 12, true);
  s.rect(43, 8, 43, 12, false);
  // Göller
  s.ellipse(21, 23, 1.4, 1.1, false).ellipse(37, 12, 1.4, 1.1, false).ellipse(21, 11, 1.1, 1.1, false).ellipse(37, 24, 1.2, 1.1, false);
  return s.autoMines(6, 5);
}
