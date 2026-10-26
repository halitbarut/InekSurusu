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

## Hazır kural takımları (önayarlar)

53. Yeni oyun ekranında dört hazır kural takımı vardır; varsayılan **Dengeli**dir. Değerler `src/engine/presets.ts`
    içindedir; listelenmeyen her ayar varsayılan değerindedir.

    | Önayar | Farkı | Harita |
    |---|---|---|
    | Klasik | Savaş masrafı ve bakım kapalı (kâğıt oyundaki gibi) | önerilen boyut |
    | Dengeli | Varsayılanlar (3. denge turu) | önerilen boyut |
    | Hızlı | Başlangıç akçesi 300 | önerilen boyutun %80'i (5 oyuncuda 35×26) |
    | Sakin açılış | Dengeli + açılış barışı (5 tur) | önerilen boyut |

54. **Hızlı** önayar başkent savaşı kurallarına ve masraflarına dokunmaz (bu oturumda başkent kuralları değişmiyor).
    Oyunu kısaltan iki şey vardır: küçük harita (komşular ve başkentler daha erken karşılaşır) ve ilk turlarda daha
    hızlı genişleme için 300 akçelik başlangıç. Etkisi `npm run simulate -- --round onayar` ile ölçülür
    (BALANCE_REPORT.md, "Hazır kural takımları").
55. Harita boyutu önayarın parçasıdır: önayar oyuncu sayısına göre önerilen boyutu bir çarpanla küçültüp büyütür.
    Genişlik ya da yükseklik elle değiştirilirse seçim **Özel**e geçer. Kural değerlerinden biri değiştirildiğinde de
    aynısı olur. Önayar seçiliyken ayar grupları kapalı ama açılabilir durumdadır; **Özel** seçilince hepsi açılır.
56. Kaydedilen özel ayarlar `localStorage` içinde (`inek-surusu-presets`) ad, tüm kural değerleri, harita çarpanı ve
    (elle girildiyse) harita boyutuyla saklanır. Aynı adla kaydetmek eskisinin üzerine yazar; hazır önayar adları
    kullanılamaz. Kayıtlı ayar seçildikten sonra bir değer değiştirilirse yine **Özel**e geçilir.
57. Görev metninde "online yok" deniyor, ama proje önceki oturumda çevrimiçi oyun kazandı. Çevrimiçi oyun korunup
    yeni özelliklerle uyumlu tutuldu (ör. oda lobisinde seçili kural takımının adı görünür).

## Bot zorluk seviyeleri

58. Her bot koltuğu için Kolay, Orta ya da Zor seçilir (varsayılan Orta). Çevrimiçide oda sahibi bot koltuklarının
    seviyesini seçer; boş kalan davetli koltuklar ve bağlantısı kopan oyuncunun yerine geçen bot Orta oynar.
    Seviye kayda girer. Kod: `src/bot/easy.ts`, `medium.ts`, `hard.ts`.
59. **Kolay** bot, orta botun değerlendirmesine rastgelelik katar: toprak seçimine büyük gürültü ekler, fetihte çoğu
    zaman rastgele kare seçer, savaş hakkını sık sık rastgele bir sınır karesine harcar (beklenen değeri eksi olsa da),
    bakımı az düşünür, başkent savaşı için birikim yapmaz, %12 olasılıkla turu erken bitirir. İttifak ve barış
    tekliflerini hep, kendi aleyhine takasları da çoğu zaman kabul eder.
60. **Zor** bot, en yakın saldırılabilir rakip başkentini hedef seçer: toprak alımını ve kara savaşını oraya yöneltir,
    3 kare yaklaşınca başkent savaşı masrafını (akçe ve bir turluk bakım) biriktirir ve demiri gemiye harcamaz.
    Başkent savaşına hedefin büyüklüğüne bakmadan, beklenen değer artıysa girer. Kendi başkentine komşu düşman
    toprağını tehdit sayar, savaş hakkını önce onu geri itmeye harcar ve fetihte o kareleri önce alır. Teklifte
    başkentinin 2 kare çevresini ve maden karelerini vermez, kendisinden zayıflarla ittifak kurmaz (zafer
    paylaşılmasın), hedef aldığı rakiple barış yapmaz.
61. Botların "rastgeleliği" oyunun RNG'sini kullanmaz: oyun durumundan (tur, akçe, toprak sayısı…) türetilen
    deterministik bir karışımdır. Böylece bot gelecekteki topaç sonuçlarını göremez ve değiştiremez, aynı seed'le
    aynı oyun yeniden oynanabilir. Hiçbir seviye ek kaynak almaz.
62. Seviye farkı `npm run simulate -- --round zorluk` ile ölçülür (BALANCE_REPORT.md, "Bot zorluk seviyeleri").

## Geri alma

63. Geri alınabilen eylemler: sahipsiz toprak alma, inşa, üretim, altın bozdurma, boğaz ayarı, sahipsiz toprağa
    gemi/uçak seferi. Görev listesinde olmasa da **birim dağıtma ve üs yıkma** da geri alınabilir: rastgelelik
    içermezler ve başka oyuncuyu ilgilendirmezler.
64. Geçmişi temizleyen eylemler: topaç, her savaş (sefer sonunda savaşa dönüşen dahil), fetih seçimleri, tüm
    diplomasi eylemleri (teklif yapma, yanıtlama, geri çekme, ittifak bozma, zafer önerisi ve oyu) ve başka bir
    oyuncunun yaptığı herhangi bir eylem (ör. botun teklife yanıtı, çevrimiçide başkasının boğaz ayarı).
    Teklif yapmak da temizler: teklif karşı tarafa ulaşmış bir bilgidir.
65. Geri alma, eylemden önceki durumu olduğu gibi geri yükler (RNG durumu dahil). Geri alınan eylemlerin olay
    günlüğü satırları da böylece silinir. Kurulum (başkent ve başlangıç toprağı seçimi) geri alınamaz.
66. Geçmiş oyun durumunda değil, oyunu yürüten tarafta (yerel oyunda bu cihaz, çevrimiçide oda sahibi) tutulur;
    kayda girmez. Tur bitince, kayıt yüklenince ve bir koltuk bota geçince temizlenir. Çevrimiçide katılan
    oyuncu "Geri al"a basınca oda sahibinden ister (protokol sürümü 2'ye çıktı).

## Harita editörü

67. Editörde yalnızca kara/su ve madenler çizilir. Göller ve boğazlar her çizimden sonra oyunun mevcut kurallarıyla
    bulunur: haritanın kenarına değmeyen ve en fazla 14 karelik su kütlesi **göl** (#22), daha büyük kapalı sular
    iç **deniz**dir. Görevdeki "denize bağlı olmayan su kütleleri göl sayılsın" tanımı, rastgele haritalarla aynı
    kalsın diye bu boyut sınırıyla uygulandı: büyük bir iç deniz çizen oyuncu orada gemi yüzdürebilir.
68. Uygunluk: varsayılan kurallarla (madensiz başkent + 9 bitişik madensiz toprak, başkentler arası 5 kare)
    kaç oyuncuya ayrık başlangıç alanı ayrılabildiği, rastgele haritalardaki açgözlü yerleştirmeyle hesaplanır.
    3'ten az oyuncuya uygunsa hata, boğaz/göl/deniz yoksa ya da bir maden türü hiç yoksa yalnızca uyarıdır.
    Yeni oyun ekranında seçili kurallarla yeniden hesaplanır; harita oyuncu sayısına yetmiyorsa uyarı gösterilir
    ve oyun başlatılmaz (kurulumda başkent yeri kalmayıp oyun kilitlenmesin diye).
69. "Madenleri otomatik yerleştir" rastgele haritalardaki dengeli düzeni kullanır (seçilen oyuncu sayısı kadar her türden).
    Var olan madenler silinir; işlem geri alınabilir.
70. Haritalar `localStorage` içinde (`inek-surusu-maps`) satır metni olarak saklanır: `.` su, `#` kara, `G/O/I/S`
    altın/petrol/demir/çelik. JSON dışa/içe aktarma aynı biçimi kullanır. Boyut 12–90 kare.
71. Kayıtlı oyunlar haritanın tamamını (`GameState.map`, adıyla) zaten içerir; harita silinse de oyun açılır.
    Kayıtlı haritayla kurulan oyunda topaç sonuçlarını yeni oyun ekranındaki seed belirler (haritanın kendisi değil),
    böylece aynı harita her oyunda farklı oynar.

## Oyun sonu özeti

72. İstatistikler oyun durumunun içinde (`GameState.stats`) tutulur, böylece kayda girer ve geri almayla birlikte
    geri alınır. Her tam turun sonunda (sıra başa sarınca), kurulum bitince ("0. tur") ve oyun bitince her oyuncunun
    toprak, akçe, maden kaynakları, gemi ve uçak sayısı kaydedilir. Eski kayıtlarda geçmiş yoksa grafikler eksik çizilir.
73. Harcama kalemleri denge simülasyonuyla aynıdır: toprak (karadan ve seferle alma), inşa, üretim (akçe kısmı),
    savaş masrafı (akçe kısmı), bakım, boğaz vergisi. Teklifle verilen akçe harcama sayılmaz.
74. Savaş sonucu: kara savaşında saldıran toprak alırsa saldıran, karşı saldırı olursa savunan kazanmış sayılır;
    eşitlik ikisine de sayılmaz. Başkent ve üs savaşında başarı saldıranın, başarısızlık savunanın galibiyetidir.
    "Başkent savaşı denemesi" saldıranın başlattığı başkent savaşlarıdır.
75. Grafiklerde oyuncular renge ek olarak çizgi deseniyle ayrılır; elenen oyuncunun çizgisi elendiği turda × ile biter.

## Ses

76. Tüm sesler `src/ui/sound.ts` içinde Web Audio API ile sentezlenir (osilatör + süzgeçten geçmiş gürültü);
    ses dosyası yoktur. Tarayıcı kuralı gereği ses bağlamı ilk tıklamadan sonra açılır.
77. Topaç sesi topaç animasyonuyla aynı sürede yavaşlayan tıkırtılardan ve bir "tok" durma sesinden oluşur.
    Savaş sonunda kazanma/kaybetme sesi bu cihazdaki oyuncunun gözünden çalar (savaşa karışmıyorsa saldıranın).
    Başkent düşüşünde (eleme) ayrı, daha görkemli bir ses çalar. Tur değişim sesi yalnızca insan oyuncunun turu
    başlarken çalar.
78. Ana ses düzeyi ve sessiz mod ayarlardadır (ana menü ve oyun içi), oyun ekranının üst çubuğunda da ses
    aç/kapa düğmesi vardır; tercih `localStorage` içinde hatırlanır.
79. "Hızlı oynat" açıkken botların eylemlerinden yalnızca önemli olayların sesi çalar: savaşı kazanma/kaybetme,
    başkent düşüşü ve gelen teklif. İnsan oyuncunun kendi eylemleri her zaman ses verir.

## Görsel dil ve erişilebilirlik

80. Emojilerin yerini kendi SVG ikon setimiz aldı (`src/ui/icons.ts`): 24×24 alanda, yuvarlak uçlu 1,8 kalınlıkta
    çizgi; kaynak ve yapılarda tanınmayı kolaylaştıran açık renk dolgu. Haritada aynı ikonlar Canvas'a resim olarak
    çizilir. Olay günlüğü ve bildirim metinlerinden emojiler çıkarıldı; günlükte satır başına ikon gösterilir.
81. **Varsayılan oyuncu renkleri** değişti: `#2160c4, #ea5b1e, #921f5e, #129390, #9977e4, #7b4704, #b14e4b, #e5518a`.
    Renkler, kâğıt zemin (`#fbf8ef`) üzerinde renk körlüğü simülasyonu yapan doğrulayıcıyla seçildi: ilk 6 renk
    **tüm çiftlerde** kırmızı-yeşil renk körlüğünde ΔE ≥ 10, normal görüşte ≥ 16; hepsi zemine karşı ≥ 3:1 kontrastlı.
    8 rengin hepsini aynı anda ayırmak mümkün olmadığından 7. ve 8. oyuncuda ayrım desenlere dayanır.
    Oyuncular yine istedikleri rengi seçebilir; eski kayıtlar kendi renkleriyle açılır.
82. Haritada her oyuncunun toprağı rengine ek olarak **kendi tarama deseniyle** çizilir (ters eğik, dikey, yatay,
    noktalı, kareli, çarpılı, halkalı, eğik). Eğik çizgi (/) denizin taramasına benzediği için en sona kondu.
    Aynı desen oyuncu listesinde, aktif oyuncu kartında ve diplomasi penceresinde küçük örnek olarak görünür.
83. Eylem çubuğunda yapılamayan eylemler tıklanabilir kalır ama soluk ve kesik çerçevelidir: üzerine gelince ya da
    klavyeyle odaklanınca ipucunda nedeni yazar, tıklanınca nedeni bildirim olarak gösterir. Gerçek `disabled`
    kullanılmadı, çünkü devre dışı düğmeler fare olaylarını almadığından nedeni gösteremez.
84. Aşama göstergesi normal turda Bakım → Topaç → Eylemler adımlarını gösterir; kurulum, fetih, oylama ve oyun sonu
    tek etiketle gösterilir. Seed üst çubuktan kaldırıldı (zafer ekranında ve kayıt adında duruyor).
85. Hot-seat sıra geçiş ekranı artık tüm ekranı oyuncu rengine boyamıyor; diğer pencerelerle aynı kart, üstünde oyuncu
    renginde şerit ve desen örneği. Hot-seat'te bilgiler zaten gizli değil (#36).

## Teklifler

86. Bir teklifteki kalem sayısının sınırı yoktur (eskiden 24'tü): istediğin kadar toprak, kaynak ve boğaz iznini
    tek teklifte birleştirebilirsin. Geçerlilik kontrolleri sürer: verilen kaynak verenin elinde olmalı, toprak
    verenin olmalı, başkent devredilemez, aynı toprak iki kez eklenemez, en fazla bir ittifak ve bir barış kalemi
    olur, barış süresi en uzun barış ayarını aşamaz.

## Çevrimiçi güvenlik

87. Diplomasi teklifleri gizlidir: oda sahibi her katılımcıya kendi görünümünü gönderir (`viewFor`), teklifler ve
    günlükteki teklif satırları (yapıldı, yanıtlandı, geri çekildi) yalnızca teklifin iki tarafına gider, izleyiciler
    hiç görmez. Teklifin *sonucu* (ittifak, barış, devredilen toprak/kaynak) herkese açıktır, çünkü haritada ve
    panellerde zaten görünür. Hot-seat'te hiçbir bilgi gizli değildir (#36). Ayrıntı: `docs/ONLINE.md`.
88. Katılanın oda kimliği koltuğun anahtarıdır; önceki sürümde lobi mesajında herkese gidiyordu ve bir katılımcı
    başkasının koltuğunu bu kimlikle alabiliyordu. Artık katılanlara giden lobide "dolu" diye maskelenir, kimlik
    128 bit rastgeledir ve 8–64 karakter dışındaki kimlikler reddedilir. Protokol sürümü 3'e çıktı.
89. Ağdan gelen eylemler önce biçim denetiminden geçer (`parseAction`): alanlar tek tek okunup yeni bir eylem
    kurulur. Teklif kalem sayısına kural sınırı getirilmedi (#86); yalnızca bozuk mesajlara karşı 10 000 kalemlik
    teknik bir üst sınır var. Katılanın adı 16 karaktere kısaltılır, renk `#rrggbb` değilse griye çevrilir.

## Sohbet

90. Sohbet yalnızca çevrimiçi oyunda vardır; hot-seat ve bot oyunlarında panel oluşturulmaz. Sohbet oyun durumunun
    parçası değildir (kayda ve tekrar dosyasına girmez); oda sahibi son 400 mesajı bellekte tutar.
91. "Özel mesajı host oyuncu bile göremesin" şartı uçtan uca şifrelemeyle sağlandı (ECDH P-256 + AES-GCM). Oda
    sahibi anahtarları dağıttığı için kodu değiştirilmiş bir oda sahibine karşı koruma yoktur (ONLINE.md, kısıtlar).
92. Özel mesaj yalnızca elenmemiş oyuncular arasında gönderilir; elenen oyuncu eski özel konuşmalarını okuyabilir ama
    yenisini başlatamaz (izleyici sayılır). Botlara özel mesaj gönderilemez; bağlantısı koptuğu için yerine bot oynayan
    insana gönderilebilir, döndüğünde okur.
93. Genel kanal mesajı en fazla 300 karakterdir; bir katılımcı 5 saniyede en fazla 6 mesaj gönderebilir.
94. Davet linkiyle daha önce katılınan odaya link yeniden açılınca (ör. sayfa yenilenince) ad sorulmadan bağlanılır.
