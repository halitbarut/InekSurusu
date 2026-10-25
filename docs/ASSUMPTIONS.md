# Varsayımlar

Görev metninde açık olmayan noktalarda verilen kararlar. Sayısal olanların çoğu
`src/engine/config.ts` içinden ya da "Yeni oyun → Kural ayarları" ekranından değiştirilebilir.

## Kurulum

1. **Seçim sırası:** Önce tüm oyuncular sırayla başkentini seçer. Ardından her oyuncu kendi
   sırasında 9 toprağının hepsini art arda seçer (hot-seat'te cihazın her karede el değiştirmemesi için).
2. **Başkent yeri:** Sahipsiz, madensiz kara karesi olmalı. Ek olarak diğer başkentlere en az
   5 kare (Chebyshev, `minCapitalDistance`) uzakta olmalı ve çevresinde madensiz karelerden oluşan
   10 karelik boş kara bulunmalı. Haritada bu mesafe kuralına uyan yer kalmazsa kural kendiliğinden gevşer.
3. **Başlangıç toprakları** da madensiz olmalıdır (kural). Seçilecek madensiz komşu kare kalmayan
   oyuncunun başlangıç seçimi kendiliğinden biter; oyuncu "Seçimi bitir" ile erken de bitirebilir.
   Oyuncuların birbirinin önünü kesmesi hâlâ mümkündür; bu durumda o oyuncu daha az toprakla başlar.
4. **Harita kontrolü:** Üretici, oyuncu sayısı kadar ayrık "madensiz başkent + 9 bitişik toprak" alanını
   başkent mesafe kuralına uyarak açgözlü yöntemle yerleştirmeyi dener; yerleştiremezse haritayı türetilmiş
   tohumla yeniden üretir.

## Tur ve kaynaklar

5. Gelir (madenler) turun başında topaçtan önce gelir.
6. Altın bozdurma topaç, eylem ve fetih aşamalarının hepsinde yapılabilir.
7. "Tur" = yaşayan tüm oyuncuların bir kez oynaması. Barış süreleri bu tam turlarla sayılır.

## Savaş

8. **Savunanın topacı** da aynı tohumlu RNG ile motor tarafından çevrilir; savunandan tıklama
   beklenmez (hot-seat akışını kesmemek için). Ekranda iki topaç yan yana döner. Savunandan yalnızca
   karşı saldırıyı kazandığında toprak seçimi istenir.
9. **Kara savaşında alınacak topraklar:** Kazanan, kaybedenin o anda kendi toprağına komşu olan
   herhangi bir sıradan toprağını seçebilir; seçim saldırılan kareyle sınırlı değildir. Saldırılan
   kare yalnızca savaş türünü belirler (başkent → başkent savaşı, üs → üs savaşı, diğerleri → kara savaşı).
   Karşı saldırıda da aynı kural savunan için geçerlidir.
10. **Seferle savaş:** Saldıran kazanırsa seçilebilecek kareler hedef kare ve onun 4 komşusudur
   (savunana ait, başkent/üs olmayan). Bunlardan maden olanlar ancak saldıranın bir toprağına komşuysa
   seçilebilir; yani önce hedef kare alınır, sonra yanındaki maden normal sınır kuralıyla alınabilir.
   Savunan kazanırsa sınır kuralı uygulanır: saldıranın savunana komşu topraklarından seçer (sınır yoksa
   toprak alamaz). Seçim sırasında savunan, kazandığı yeni topraklar üzerinden içeri doğru ilerleyebilir.
11. **Turda tek savaş (kural):** Kara savaşı, gemi/uçakla sahipli toprağa saldırı, başkent ve üs savaşı
    hakkı tüketir; sonuç (eşitlik dahil) fark etmez. Sahipsiz toprak alma (karadan ya da seferle), inşa,
    üretim, bozdurma ve diplomasi sınırsızdır. Hak her oyuncu turunun başında yenilenir.
12. Başkent ve üs savaşını kaybeden saldıranın toprak kaybı yoktur (kural). Kara savaşı kayıpları
    karşı saldırı kuralıyla belirlenir.
13. Orta seviye bot tek savaş hakkını, seçenekler arasında beklenen net değeri en yüksek olana kullanır:
    kara savaşında tüm 64 topaç sonucu üzerinden E[alınacak toprakların değeri] − E[karşı saldırıda
    kaybedileceklerin değeri] (maden/yapı/birim olan kareler daha değerli; seçilebilecek toprak sayısı
    sınırı hesaba katılır; rakip başkenti henüz komşu değilse başkente doğru ilerlemenin küçük bir ek değeri
    vardır), başkent savaşında 1/8 × rakibin tüm toprak değeri, üs savaşında 1/4 × üs karesinin değeri.
    Fetihte bot rakip başkentine doğru koridor açar; karşı saldırıda kendi başkentine yakın cepheyi geri iter.
    Değer pozitif değilse saldırmaz. Karşı saldırıda bot savunan madenleri, kıyıları ve kendi bölgesini
    birleştiren kareleri tercih eder.
14. Başkent savaşında saldıran kazanırsa savunan elenir: tüm toprakları, yapıları, birimleri,
    kaynakları ve akçesi kazanana geçer; bekleyen teklifleri silinir, ilişkileri sıfırlanır,
    eski başkenti sıradan toprak olur.

## Gemi ve uçak

15. Seferler tur başına sınırsızdır, yalnızca petrol sınırlar (`maxSortiesPerUnitPerTurn` ile sınırlanabilir).
16. Sefer sonrası gemi tersanesine, uçak fabrikasına döner. Tersane/fabrika ele geçirilirse
    orada konuşlu birimler de geçer.
17. **Gemi rotası** tersanenin komşu deniz karelerinden başlar ve yalnızca deniz karelerinden geçer
    (göller hariç). Hedef, denize (göle değil) komşu bir kara karesidir. İç denize açılan bir tersane
    yalnızca o iç denize ve boğazlarla bağlı denizlere ulaşır.
18. Sefer hedefi kendi toprağı, müttefik ya da barış yapılan oyuncunun toprağı olamaz. Başkent de
    sefer hedefi olamaz (kural): başkent savaşı yalnızca karadan, sınır komşuluğuyla yapılır. Başkente
    komşu sıradan bir toprağa seferle saldırıp kazanan, başkenti fetihte seçemez.
19. **Uçak rotası** 8 yönlüdür (çapraz geçebilir). Engel alanı varsayılan Chebyshev yarıçapı 3'tür
    (`baseBlockRadius`, `baseBlockMetric`). Fabrikası engel alanında kalan uçak kalkamaz. Askeri üs
    kendi engel alanının içinde olduğu için üslere uçakla saldırılamaz (gemi ya da karadan saldırılır).
20. Müttefik olmayan herkesin (barış yapılanlar dahil) askeri üssü uçakları engeller.

## Harita ve boğazlar

21. Varsayılan harita boyutu 3–4 oyuncuda 35×26, 5–6 oyuncuda 44×32, 7–8 oyuncuda 53×37'dir (3. denge turunda
    önceki 40×30 / 50×36 / 60×42 boyutlarından %12 küçültüldü). Harita kenarları okyanustur; kara oranı yaklaşık %50'dir. Her harita en az 3 boğaz ve en az
    1 göl içerir; sağlanamazsa tohumdan türetilen yeni denemeler yapılır (aynı seed hep aynı haritayı verir).
22. **Göl:** Haritanın kenarına değmeyen, en fazla 14 karelik kapalı su kütlesi. Daha büyük kapalı sular
    iç denizdir.
23. **Boğaz:** 1 kare genişliğinde, en fazla 4 kare uzunluğunda, iki yanında kara bulunan deniz geçidi.
    Geçit kapatılınca iki ucu arasında 30 adımdan kısa bir su yolu kalmamalı ve her iki uç da en az
    10 karelik bir su kütlesine açılmalıdır. **Yakalar**, geçidin iki yanındaki kara karelerinin hepsidir;
    hepsine sahip olan oyuncu boğazı idare eder.
24. Vergi, rota boğaza her girdiğinde bir kez alınır. Birden çok rota varsa önce en ucuzu, sonra en kısası
    seçilir. Vergi idare eden oyuncuya ödenir.
25. Boğaz ayarlarını idare eden oyuncu her an değiştirebilir (motor buna izin verir; arayüzde kendi
    turunda "Boğazlarım" panelinden).
26. Her maden türünden oyuncu sayısı kadar maden vardır (oyuncu başına her türden 1, `minesPerTypePerPlayer`;
    yeni oyun ekranından değiştirilebilir). Madenler birbirine bitişik olmaz. Yapılar maden karelerine de kurulabilir.
27. **Dengeli maden yerleşimi** (`mineLayout: 'spread'`, varsayılan): yerleşmeye uygun kara parçalarında
    (en az 10 kare) her tür ayrı ayrı yayılır. Önce açgözlü "en uzak nokta" seçimi yapılır, sonra her maden
    kendisine en yakın karelerin en kötü uzaklığını küçülten kareye kaydırılır. Bu, birkaç farklı rastgele
    başlangıçla denenip en iyisi alınır. Harita, her yerleşilebilir kareden her türün en yakın madenine
    uzaklık `maxMineDistance` (varsayılan 10) kareyi aşmıyorsa kabul edilir; aşıyorsa tohumdan türetilen yeni
    denemeler yapılır. Uzaklık **Chebyshev**'dir (başkent mesafesi ve üs yarıçapıyla aynı ölçü). Manhattan
    ölçüsüyle 10 sınırı, her türden yalnızca oyuncu sayısı kadar maden varken pratikte sağlanamıyordu
    (en kötü uzaklık 17–22). Eski tamamen rastgele düzen `mineLayout: 'random'` ile seçilebilir.
28. **3 oyunculu varsayılan harita (35×26)** küçük olduğu için denemelerin bir kısmında en az 3 boğaz şartı
    tutmuyor. Bu durumda üretici şartlara en çok uyan haritayı kullanır (ör. 2 boğazlı).

## Diplomasi ve kazanma

29. İttifaklar ikilidir. "Kalan tüm devletler aynı ittifakta" = kalanların her ikisi birbirinin müttefiki.
30. Barış N tur: kabul edildiği turdan itibaren `tur + N` numaralı turun sonuna kadar sürer, bozulamaz.
    Var olan barış uzatılabilir.
31. İttifak yalnızca kendi turunda bozulabilir. Bozulduğu oyuncu turu boyunca iki taraf birbirine
    saldıramaz; sonraki turlardan itibaren saldırı serbesttir.
32. Teklif yalnızca kendi turunda yapılır, yanıt her zaman verilebilir. Geçerlilik kabul anında yeniden
    kontrol edilir; kaynak/toprak artık yoksa teklif düşer. Teklifler süresiz bekler, gönderen geri çekebilir.
33. Toprak devrinde başkent devredilemez; yapı ve birimler toprakla birlikte geçer.
34. "Boğaz geçiş izni / vergi muafiyeti" kalemi, veren tarafın idaresindeki boğazda alan tarafa
    "geçiş açık + belirtilen vergi (0 = muafiyet)" ayarını uygular.
35. Zafer oylamasını kalan herkes müttefikken herhangi biri kendi turunda başlatabilir; öneren
    otomatik "evet" sayılır, tek bir "hayır" oylamayı düşürür.
36. Hot-seat'te bilgiler gizli değildir: herkesin kaynakları kâğıt oyundaki gibi görünür.
37. Arayüzde insan → insan teklifinde cihaz hemen alıcıya geçer; bot → insan teklifleri insanın kendi
    turunda Diplomasi panelinde yanıtlanır. Botlar kendilerine gelen teklifleri anında yanıtlar.

## Çevrimiçi oyun

38. Oda sahibinin tarayıcısı hakemdir: eylemleri doğrular ve uygular, botları oynatır, sonucu herkese
    yayınlar. Katılanlar yalnızca kendi koltukları adına eylem gönderebilir; izleyiciler hiç gönderemez.
    Arkadaşlar arası bir oyun olduğu için oda sahibinin hilesine karşı önlem yoktur.
39. İstemcilere giden durumda RNG durumu sıfırlanır, böylece sonraki topaç sonucu önceden hesaplanamaz.
40. Kopan oyuncu için 60 saniye beklenir (bağlantı 12 saniye sessiz kalırsa kopmuş sayılır). Süre dolunca
    koltuk bota geçer; oyuncu aynı tarayıcıdan döndüğünde (oda başına saklanan kimlikle) koltuğu hemen
    insana döner, bot o anki hamlesini bitirmiş olabilir.
41. Oyun başladıktan sonra gelen yeni katılımcılar izleyici olur; bota geçmiş bir koltuğa başkası oturamaz.
42. Çevrimiçide "Cihazı X'e verin" ekranları yoktur: teklifler, oylama ve karşı saldırıda toprak seçimi
    ilgili oyuncunun kendi ekranında sorulur. Teklif "Sonra yanıtla" ile Diplomasi paneline bırakılabilir.
43. Oda sahibi çıkarsa oyun biter; katılanlara "oda kapandı" bildirilir. Oyunu yalnızca oda sahibi kaydeder.

## Denge kuralları

44. **Savaş masrafı** savaş başlatılırken, sonuçtan (eşitlik dahil) bağımsız ödenir. Gemi/uçakla sahipli
    toprağa saldırıda masrafa ek olarak petrol ve varsa boğaz vergisi de gerekir; hepsi aynı anda yetmelidir.
    Sahipsiz toprağa sefer savaş değildir, savaş masrafı yoktur.
45. **Başkent savaşı yalnızca karadan yapılır (kesin kural).** Başkente gemi ya da uçakla saldırılamaz;
    başkent savaşı için sınır komşuluğu gerekir. Üs savaşı gemiyle yapılabilir (uçakla yapılamaz, çünkü üs
    kendi engel alanının içindedir).
46. **Bakım** her oyuncu turunun başında, gelirden (madenler) sonra ve topaçtan önce ödenir. Akçe yetmezse
    bakım aşamasına geçilir: oyuncu altın bozdurabilir, gemi/uçak dağıtabilir ya da üs yıkabilir; borç akçesine
    inince kalan bakım otomatik ödenir ve topaç aşaması başlar. Dağıtılan birim tamamen yok olur. Oyuncu eylem
    aşamasında da kendi isteğiyle birim dağıtıp üs yıkabilir (motor destekler).
47. Başkentin kendisi ve tersane/uçak fabrikası bakım gerektirmez; yalnızca gemi, uçak ve askeri üs.
48. **Zayıflık şartı** yalnızca başkent savaşına uygulanır ve toprak sayılarıyla (başkent dahil) karşılaştırılır:
    savunanın toprağı × 2 < saldıranın toprağı.
49. **Açılış barışı** 1'den N'e kadar (dahil) tam turlarda geçerlidir; kara savaşı, seferle saldırı, üs ve başkent
    savaşının hepsini engeller. Sahipsiz toprak almak ve diğer eylemler serbesttir.
50. Ayarlardaki akçe değerleri (maliyetler, masraflar, bakım) 0 ya da pozitif tam sayı olmalıdır; oyun
    oluşturulurken denetlenir. Ayar ekranında akçe alanları 50'şer artıp azalır ama elle her değer yazılabilir.
    Boğaz vergisi ve tekliflerdeki akçe de herhangi bir pozitif (vergi için 0 dahil) tam sayı olabilir.
51. Simülasyon ve testler için savaş masrafları (`battleCostsEnabled`) ve bakım (`upkeepEnabled`) ayrı
    bayraklarla kapatılabilir; ikisi de kapalıyken kurallar bu güncellemeden öncekiyle aynıdır.
52. Orta seviye bot birim ve üs üretirken toplam bakımı beklenen tur gelirinin (ortalama topaç + altın madenleri)
    %30'u (+ akçe stokunun 1/50'si) ile sınırlar, tavan gelirin %45'idir; bakım gelirin %60'ını aşarsa fazla birimi
    kendiliğinden dağıtır (bot ayarları `maxUpkeepShare`, `upkeepCap`, `upkeepExcessShare`). Başkent savaşına
    masraf ile bir sonraki turun bakımını karşılayabiliyorsa ve hedefin toprağı kendisininkinden fazla değilse
    girer (bot ayarları: `capitalCostCushion` = 1, `capitalReserveUpkeep` = açık, `capitalWeakRatio` = 1).
