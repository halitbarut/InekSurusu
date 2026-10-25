# Denge raporu

Bu dosyanın üst kısmı `npm run simulate` ile üretilir (son çalıştırma: 2026-10-25). Her senaryo için 150 oyun, 5 oyuncu (tamamı orta seviye bot; acele testlerinde 1 bot acele eden), 300 tur sınırı. Seed'ler 10000–10149; tüm senaryolarda aynı haritalar kullanılır.

| Senaryo | Açıklama |
|---|---|
| A | Eski kurallar (savaş masrafı ve bakım yok) |
| B | Yeni varsayılan kurallar |
| C | B + zayıflık şartı |
| D | B + açılış barışı (5 tur) |
| RA | A + 1 acele eden bot |
| RB | B + 1 acele eden bot |

Tablolardaki dağılım sütunları: **ortalama | medyan | %10–%90 | en az–en çok**.

## İlk başkentin düştüğü tur

| Senaryo | Başkent düşen oyun | Ortalama | Medyan | %10–%90 | En az–en çok |
|---|---|---|---|---|---|
| A | 145/150 | 41,6 | 23 | 9–100 | 2–266 |
| B | 108/150 | 128,2 | 114 | 73–210 | 51–293 |
| C | 79/150 | 144,9 | 121 | 77–252 | 60–297 |
| D | 103/150 | 127,7 | 114 | 70–207 | 42–293 |

| Senaryo | ≤ 14 | 15–30 | 31–50 | 51–100 | 101–200 | > 200 | hiç düşmedi |
|---|---|---|---|---|---|---|---|
| A | %25 | %37 | %12 | %14 | %7 | %2 | %3 |
| B | %0 | %0 | %0 | %27 | %35 | %9 | %28 |
| C | %0 | %0 | %0 | %14 | %28 | %11 | %47 |
| D | %0 | %0 | %1 | %27 | %33 | %9 | %31 |

## Oyun süresi ve kazanma türü

| Senaryo | Biten oyunların bitiş turu (ort. \| medyan \| %10–%90 \| en az–en çok) | Tur sınırına takılan | Tek devlet | İttifak |
|---|---|---|---|---|
| A | 109,6 \| 94 \| 39–209 \| 17–298 | 33 (%22) | 31 | 86 |
| B | 173,3 \| 171 \| 93–256 \| 60–293 | 58 (%39) | 39 | 53 |
| C | 174,1 \| 171 \| 93–259 \| 79–288 | 98 (%65) | 20 | 32 |
| D | 174,3 \| 177 \| 96–256 \| 60–293 | 67 (%45) | 36 | 47 |

| Senaryo | ≤ 50 | 51–100 | 101–200 | 201–300 | sınıra takıldı |
|---|---|---|---|---|---|
| A | %16 | %25 | %29 | %9 | %22 |
| B | %0 | %9 | %33 | %19 | %39 |
| C | %0 | %5 | %19 | %11 | %65 |
| D | %0 | %8 | %29 | %18 | %45 |

Tur sınırına takılan oyunların seed'leri (tekrar oynatmak için):

- **A:** 10010, 10014, 10016, 10022, 10023, 10033, 10043, 10048, 10065, 10072, 10050, 10054, 10068, 10059, 10055, 10078, 10076, 10098, 10083, 10104, 10085, 10100, 10101, 10109, 10095, 10079, 10103, 10117, 10120, 10110, 10127, 10123, 10141
- **B:** 10006, 10011, 10010, 10023, 10016, 10022, 10014, 10033, 10028, 10025, 10038, 10020, 10024, 10037, 10039, 10047, 10041, 10044, 10053, 10034, 10036, 10052, 10054, 10061, 10045, 10055, 10050, 10063, 10072, 10064, 10048, 10071, 10074, 10057, 10086, 10084, 10102, 10078, 10093, 10103 … (+18)
- **C:** 10006, 10001, 10008, 10011, 10004, 10010, 10002, 10015, 10021, 10016, 10022, 10014, 10024, 10023, 10020, 10033, 10038, 10027, 10031, 10028, 10034, 10039, 10041, 10047, 10032, 10044, 10036, 10037, 10053, 10045, 10054, 10052, 10050, 10061, 10055, 10065, 10056, 10058, 10064, 10060 … (+58)
- **D:** 10011, 10017, 10010, 10023, 10019, 10016, 10028, 10025, 10014, 10024, 10020, 10022, 10033, 10031, 10038, 10043, 10037, 10041, 10046, 10034, 10044, 10039, 10047, 10053, 10036, 10045, 10061, 10054, 10052, 10050, 10072, 10064, 10057, 10074, 10067, 10082, 10048, 10081, 10086, 10089 … (+27)

## Kaynak stokları

Yaşayan oyuncu başına ortalama; parantez içinde o tura ulaşan oyun sayısı.

| Senaryo | Akçe, tur 10 | Akçe, tur 25 | Akçe, tur 50 | Akçe, tur 100 | Maden kaynağı, tur 10 | Maden kaynağı, tur 25 | Maden kaynağı, tur 50 | Maden kaynağı, tur 100 |
|---|---|---|---|---|---|---|---|---|
| A | 11 (150) | 221 (147) | 4.748 (127) | 27.290 (89) | 8 (150) | 34 (147) | 124 (127) | 407 (89) |
| B | 9 (150) | 134 (150) | 953 (150) | 5.469 (137) | 7 (150) | 24 (150) | 70 (150) | 238 (137) |
| C | 9 (150) | 134 (150) | 958 (150) | 5.536 (143) | 7 (150) | 24 (150) | 70 (150) | 233 (143) |
| D | 10 (150) | 131 (150) | 906 (150) | 5.660 (139) | 7 (150) | 24 (150) | 69 (150) | 241 (139) |

Maden kaynağı = altın + petrol + demir + çelik toplamı.

## Harcamaların dağılımı

| Senaryo | Toprak | İnşa | Üretim | Savaş masrafı | Bakım | Boğaz vergisi | Harcama / gelir |
|---|---|---|---|---|---|---|---|
| A | %67,8 | %20,2 | %12,0 | %0,0 | %0,0 | %0,0 | %39 |
| B | %15,3 | %5,2 | %4,1 | %9,3 | %66,1 | %0,0 | %88 |
| C | %13,1 | %4,6 | %3,7 | %8,7 | %69,9 | %0,0 | %87 |
| D | %14,8 | %5,0 | %4,0 | %9,3 | %66,9 | %0,0 | %88 |

Gelir = topaçtan ve altın bozdurmadan gelen akçe. Teklif yoluyla el değiştiren akçe harcama sayılmaz.

## Savaşlar

| Senaryo | Oyun başına savaş | Normal | Üs | Başkent | Başkent savaşı başarı oranı | Üs savaşı başarı oranı |
|---|---|---|---|---|---|---|
| A | 385,6 | %66,6 | %28,8 | %4,5 | %12,7 (330/2608) | %25,3 |
| B | 365,4 | %96,2 | %0,0 | %3,8 | %12,8 (269/2101) | — |
| C | 455,2 | %98,1 | %0,0 | %1,9 | %13,5 (171/1265) | — |
| D | 377,4 | %96,2 | %0,0 | %3,8 | %12,1 (261/2162) | — |

Başkent savaşı için beklenen başarı oranı 1/8 = %12,5, üs savaşı için 1/4 = %25.

## Acele eden bot testi

Her oyunda 1 bot en yakın rakip başkentine koşar (toprak alımını o yöne çevirir, savaşını hep o yönde kullanır, başkente komşu olur olmaz masrafı yetiyorsa başkent savaşına girer; hedefin gücüne bakmaz). Diğer 4 bot orta seviyedir. Acele eden botun koltuğu oyundan oyuna döner. Adil pay: 1/5 = %20.

| Senaryo | Kazanma payı (ittifak zaferi paylaştırılır) | %95 güven aralığı | Tek başına kazandığı oyun | Oyunda ilk elenen o | Oyun başına eleyebildiği rakip | Elendiği oyun | Değerlendirme |
|---|---|---|---|---|---|---|---|
| RA | %29,4 | %22,6–%37,1 | 19/150 | %12 | 1,16 | %30 | **Başkente koşmak baskın strateji** |
| RB | %16,3 | %11,0–%22,7 | 3/150 | %6 | 0,52 | %17 | Adil paydan belirgin farkı yok |

"Belirgin şekilde üstünde": %95 güven aralığının alt sınırı adil payın (%20) üstündeyse. Kazanma payında ittifak zaferleri kazananlar arasında eşit bölünür.

<!-- öneriler: bu satırın altı simülasyon tarafından değiştirilmez -->

## Değerlendirme

1. **Başkente koşma artık baskın değil.** Eski kurallarda (A) acele eden bot oyunların %29'unu kazandı
   (güven aralığı %22,6–%37,1; adil pay %20). Yeni kurallarda (B) bu oran %16'ya düştü. Kural değişikliğinin
   1. amacı tuttu.
2. **Ama denge fazla ters yöne kaydı.** B'de ilk başkent medyan 114. turda düşüyor; oyunların %28'inde hiç
   başkent düşmüyor; %39'u 300 tur sınırına takılıyor. Hedef 15–30. turdu; A'da bu aralık tutuyordu
   (medyan 23), B'de hiç tutmuyor.
3. **Bakım en büyük gider.** B'de harcamaların %66'sı bakım. Harcama/gelir oranı %39'dan %88'e çıktı; amaç 2
   kısmen tuttu. Ancak akçe stoku 50. turdan sonra yine büyüyor (tur 50: ~950, tur 100: ~5.500). A'daki
   27.000'den çok daha az, ama oyun ilerledikçe harcanacak yer azalıyor.
4. **Üs savaşı neredeyse hiç yapılmıyor.** A'da savaşların %29'u üs savaşıydı, B'de %0. 400 akçe + 2 demir,
   1/4 başarı ihtimaline göre botlar için hiç kârlı değil.
5. **Zayıflık şartı (C) oyunları kilitliyor.** Oyunların %65'i tur sınırına takıldı, %47'sinde hiç başkent
   düşmedi.
6. **Açılış barışı (D) botlarda neredeyse etkisiz.** Botlar ilk 5 turda zaten toprak toplamakla meşgul.
   Kural daha çok erken saldıran insan oyuncuları frenler.

Not: Sonuçlar bot davranışına da bağlı. Orta seviye bot başkent savaşına yalnızca masrafın 1,5 katı kaynağı
varsa ve hedef kendi toprağının %75'inden azsa giriyor. Bu temkin de başkentlerin geç düşmesine katkıda bulunuyor.


## Öneriler

Aşağıdaki değerler önerdir; varsayılanlar değiştirilmedi. Tümü 100'ün katı.

| Ayar | Şu an | Öneri | Gerekçe |
|---|---|---|---|
| Başkent savaşı akçe (`capitalBattleAkce`) | 1000 | **600** | Acele etmeyi baskın yapmadan ilk fethi öne çekmek için. A'da bedelsiz başkent savaşı medyan 23. turda fetih veriyordu; masrafın büyük kısmını korumak acele eden botu adil payın altında tutmaya yetmeli. Biriken akçe için de orta-geç oyunda bir harcama yeri olur. |
| Başkent savaşı demir/çelik | 3 / 3 | **2 / 2** | Her türden yalnızca oyuncu sayısı kadar maden var. 3+3 kaynak birçok oyuncu için 10+ tur birikim demek; ilk fethi asıl geciktiren kalem bu. |
| Üs savaşı (`baseBattleAkce`, `baseBattleIron`) | 400 + 2 demir | **200 + 1 demir** | B'de üs savaşı hiç yapılmıyor. Ödülü (1 toprak + engel kalkması) 1/4 ihtimalle geldiği için masrafın yarıya inmesi onu yeniden anlamlı yapar. |
| Askeri üs bakımı (`baseUpkeep`) | 100 | **0** | Bakım harcamaların üçte ikisi. Üs zaten 400 akçeye kuruluyor; bakımı kaldırmak birim bakımını (asıl harcama kalemi) korurken savunmayı cezalandırmaz. |
| Gemi/uçak bakımı | 100 / 100 | **100 / 100** (değişmesin) | 100'ün katı kuralı yüzünden 100'ün altında bir değer yok; 0 yapmak amaç 2'yi bozar. |
| Normal savaş (`landBattleAkce`) | 100 | **100** (değişmesin) | Savaş sayısı A ile aynı düzeyde kaldı (oyun başına ~365–385); bu masraf savaşları azaltmadan akçe çekiyor. |
| Zayıflık şartı | kapalı | **kapalı kalsın** | Oyunların %65'ini sınıra takıyor. |
| Açılış barışı | kapalı | **isteğe bağlı kalsın** (5 tur) | Botlarda etkisiz ama insanların erken baskınına karşı zararsız bir seçenek. |

Önerilerin hepsini birlikte uygulayıp simülasyonu yeniden çalıştırmak gerekir. Özellikle acele eden botun
kazanma payının yeniden %20'nin üstüne çıkıp çıkmadığına bakılmalı (RB satırı). Ayrıca orta seviye botun
başkent temkinini (`capitalCostCushion` 1,5 → 1,2) gevşetmek, kurallara dokunmadan ilk fethi öne çekebilir;
bu bir bot ayarı olduğu için tabloya konmadı.

<!-- bölüm:tur2 — bu işaretle kapanış işareti arası simülasyon tarafından yazılır -->

## 2. tur

`npm run simulate -- --round 2` ile üretilir (son çalıştırma: 2026-10-25). Her senaryo için 100 oyun, 5 oyuncu, 300 tur sınırı, seed'ler 10000–10099. Karşılaştırmanın aynı haritalarda yapılması için 1. turun ayarları (B, RB) da bu seed'lerde yeniden oynatıldı; yukarıdaki 1. tur tabloları 150 oyunluk asıl çalıştırmadır.

| Senaryo | Açıklama |
|---|---|
| B | 1. tur varsayılanları (savaş 100 · üs 400+2 demir · başkent 1000+3+3 · bakım 100/100/100) ve temkinli bot |
| RB | B + 1 acele eden bot |
| B2 | 2. tur varsayılanları (savaş 100 · üs 200+1 demir · başkent 600+2+2 · bakım 50/50/0) ve gevşetilmiş bot |
| RB2 | B2 + 1 acele eden bot |

Gevşetilmiş bot: başkent savaşına masraf + bir sonraki turun bakımı yetiyorsa ve hedefin toprağı kendisininkinden fazla değilse girer (1. turda: masrafın 1,5 katı ve hedef %75'ten küçük).

### Karşılaştırma ve hedefler

| Ölçüt | 1. tur ayarları (B / RB) | 2. tur (B2 / RB2) | Hedef | 2. turda tuttu mu |
|---|---|---|---|---|
| Acele eden botun kazanma payı (%95 üst sınır) | %14,4 (%22) | %16,9 (%26) | < %24 | ✔ |
| İlk başkent fethi, medyan tur | 162 | 111 | 20–40 | ✘ |
| Hiç başkent düşmeyen oyun | %31 | %11 | — |  |
| Tur sınırına takılan oyun | %43 | %19 | < %10 | ✘ |
| Bakım / tüm harcama | %67 | %61 | < %50 | ✘ |
| Harcama / gelir | %88 | %88 | — |  |
| Ortalama akçe stoku, tur 100 | 5.420 | 6.558 | — |  |
| Biten oyunların bitiş turu, medyan | 173 | 146 | — |  |
| Oyun başına savaş | 370 | 296 | — |  |
| Oyun başına başkent savaşı | 14,3 | 19,0 | — |  |
| Üs savaşlarının payı | %0,0 | %0,2 | — |  |

İlk başkent fethi medyanında hiç başkent düşmeyen oyunlar tur sınırı olarak sayıldı; bu yüzden medyan "—" ise oyunların yarısından çoğunda hiç başkent düşmemiştir.

### İlk başkentin düştüğü tur

| Senaryo | Başkent düşen oyun | Ortalama | Medyan | %10–%90 | En az–en çok |
|---|---|---|---|---|---|
| B | 69/100 | 131,3 | 120 | 81–192 | 63–292 |
| B2 | 89/100 | 113,9 | 97 | 57–205 | 35–287 |

| Senaryo | ≤ 14 | 15–30 | 31–50 | 51–100 | 101–200 | > 200 | hiç düşmedi |
|---|---|---|---|---|---|---|---|
| B | %0 | %0 | %0 | %21 | %41 | %7 | %31 |
| B2 | %0 | %0 | %4 | %44 | %31 | %10 | %11 |

### Oyun süresi ve kazanma türü

| Senaryo | Biten oyunların bitiş turu (ort. \| medyan \| %10–%90 \| en az–en çok) | Tur sınırına takılan | Tek devlet | İttifak |
|---|---|---|---|---|
| B | 172,7 \| 173 \| 100–242 \| 69–290 | 43 (%43) | 24 | 33 |
| B2 | 150,2 \| 146 \| 85–236 \| 60–283 | 19 (%19) | 36 | 45 |

| Senaryo | ≤ 50 | 51–100 | 101–200 | 201–300 | sınıra takıldı |
|---|---|---|---|---|---|
| B | %0 | %7 | %32 | %18 | %43 |
| B2 | %0 | %20 | %44 | %17 | %19 |

Tur sınırına takılan oyunların seed'leri (tekrar oynatmak için):

- **B:** 10011, 10001, 10010, 10023, 10016, 10014, 10022, 10030, 10028, 10033, 10024, 10020, 10038, 10047, 10037, 10041, 10034, 10039, 10053, 10044, 10045, 10036, 10052, 10061, 10055, 10050, 10063, 10064, 10072, 10060, 10071, 10048, 10077, 10074, 10057, 10086, 10084, 10090, 10093, 10078 … (+3)
- **B2:** 10008, 10004, 10033, 10012, 10030, 10022, 10052, 10047, 10032, 10055, 10059, 10084, 10079, 10057, 10087, 10086, 10089, 10096, 10099

### Kaynak stokları

Yaşayan oyuncu başına ortalama; parantez içinde o tura ulaşan oyun sayısı.

| Senaryo | Akçe, tur 10 | Akçe, tur 25 | Akçe, tur 50 | Akçe, tur 100 | Maden kaynağı, tur 10 | Maden kaynağı, tur 25 | Maden kaynağı, tur 50 | Maden kaynağı, tur 100 |
|---|---|---|---|---|---|---|---|---|
| B | 8 (100) | 130 (100) | 978 (100) | 5.420 (94) | 7 (100) | 24 (100) | 70 (100) | 236 (94) |
| B2 | 12 (100) | 161 (100) | 1.362 (100) | 6.558 (82) | 8 (100) | 24 (100) | 59 (100) | 241 (82) |

Maden kaynağı = altın + petrol + demir + çelik toplamı.

### Harcamaların dağılımı

| Senaryo | Toprak | İnşa | Üretim | Savaş masrafı | Bakım | Boğaz vergisi | Harcama / gelir |
|---|---|---|---|---|---|---|---|
| B | %14,9 | %5,0 | %4,0 | %9,3 | %66,8 | %0,0 | %88 |
| B2 | %19,1 | %2,2 | %8,6 | %9,3 | %60,8 | %0,0 | %88 |

Gelir = topaçtan ve altın bozdurmadan gelen akçe. Teklif yoluyla el değiştiren akçe harcama sayılmaz.

Bakımın kalemlere göre dökümü (bakım harcamasının içindeki pay ve oyun başına akçe):

| Senaryo | Gemi | Uçak | Askeri üs | Bakım / tüm harcama |
|---|---|---|---|---|
| B | %28 (100.396) | %16 (56.031) | %57 (203.978) | %66,8 |
| B2 | %57 (146.291) | %43 (109.164) | %0 (0) | %60,8 |

### Savaşlar

| Senaryo | Oyun başına savaş | Normal | Üs | Başkent | Başkent savaşı başarı oranı | Üs savaşı başarı oranı |
|---|---|---|---|---|---|---|
| B | 370,3 | %96,1 | %0,0 | %3,9 | %12,1 (174/1433) | — |
| B2 | 295,6 | %93,4 | %0,2 | %6,4 | %12,5 (238/1903) | %14,9 |

Başkent savaşı için beklenen başarı oranı 1/8 = %12,5, üs savaşı için 1/4 = %25.

### Acele eden bot testi

Her oyunda 1 bot en yakın rakip başkentine koşar (toprak alımını o yöne çevirir, savaşını hep o yönde kullanır, başkente komşu olur olmaz masrafı yetiyorsa başkent savaşına girer; hedefin gücüne bakmaz). Diğer 4 bot orta seviyedir. Acele eden botun koltuğu oyundan oyuna döner. Adil pay: 1/5 = %20.

| Senaryo | Kazanma payı (ittifak zaferi paylaştırılır) | %95 güven aralığı | Tek başına kazandığı oyun | Oyunda ilk elenen o | Oyun başına eleyebildiği rakip | Elendiği oyun | Değerlendirme |
|---|---|---|---|---|---|---|---|
| RB | %14,4 | %8,5–%22,1 | 1/100 | %4 | 0,47 | %14 | Adil paydan belirgin farkı yok |
| RB2 | %16,9 | %10,9–%25,5 | 4/100 | %9 | 0,56 | %20 | Adil paydan belirgin farkı yok |

"Belirgin şekilde üstünde": %95 güven aralığının alt sınırı adil payın (%20) üstündeyse. Kazanma payında ittifak zaferleri kazananlar arasında eşit bölünür.

<!-- /bölüm:tur2 -->

### Değerlendirme ve öneriler (2. tur)

**Hedefler:** dört hedeften yalnızca biri tuttu.

| Hedef | 2. tur | Durum |
|---|---|---|
| Acele eden botun payı < %24 | %16,9 (güven aralığı %10,9–%25,5) | ✔ Tuttu; aralığın üst ucu %24'ü biraz aşıyor, yani pay sınıra yakın olabilir |
| İlk başkent fethi medyanı 20–40 | 111 (yalnızca başkent düşen oyunlarda 97) | ✘ 1. tura göre iyileşti (162), ama hedefin çok uzağında |
| Tur sınırına takılan < %10 | %19 | ✘ 1. tura göre yarıya indi (%43) |
| Bakım < harcamanın yarısı | %61 | ✘ Üs bakımı kalktı, ama gemi/uçak bakımı yerini aldı |

**İlk fetih neden geç?** B2'den 30 oyunluk ek ölçüm (medyan turlar): ilk savaş 13. turda, sahipsiz toprak 49. turda
bitiyor. Bir oyuncunun rakip başkentine **komşu olması 46. tur**, başkent savaşının masrafını karşılayabilmesi
**49. tur**, ikisinin aynı oyuncuda buluşması **59. tur**, ilk başkent savaşı **65. tur**, ilk başkent düşüşü
**112. tur**. Yani darboğaz üç yerde:

1. **Başkente ulaşmak.** Başkent yalnızca karadan alınabildiği için cephenin başkente dayanması gerekiyor;
   5 oyunculu 50×36 haritada bu ancak genişleme dönemi bitince (≈ tur 45–50) oluyor.
2. **Demir + çelik şartı.** Her maden türünden oyuncu sayısı kadar maden var ve bunlar dengesiz dağılıyor:
   örnek oyunlarda 60. turda bile oyuncuların yarısının demiri ya da çeliği hiç yok. İki farklı madene birden
   bağlı bir masraf, birçok oyuncuyu başkent savaşından tamamen dışlıyor. Akçe darboğaz değil (100. turda
   ortalama stok ~6.500).
3. **1/8 başarı.** İlk denemeden ilk düşüşe ortalama ~45 tur geçiyor; turda tek savaş ve masraf, denemeleri seyrek tutuyor.

**Bakım neden hâlâ yüksek?** Bakımın payını asıl belirleyen birim fiyatı değil, botun birim politikası:
orta seviye bot toplam bakımı beklenen gelirin %70'ine kadar çıkarıyor (`maxUpkeepShare` 0,5 + stok payı,
üst sınır 0,7). Bakım ucuzladıkça daha çok birim tutuyor. Oyun ilerledikçe başka harcama yeri de
kalmadığından bakımın payı büyüyor.

**Öneriler** (varsayılanlar değiştirilmedi; 3. turda birlikte sınanmalı):

| Ayar | Şu an | Öneri | Gerekçe | Etkilemesi beklenen hedef |
|---|---|---|---|---|
| `capitalBattleSteel` | 2 | **0** | İki farklı maden şartını kaldırır; demiri olan herkes başkent savaşına girebilir. Ölçümde komşuluk ile masrafın aynı oyuncuda buluşması 13 tur gecikiyordu. | İlk fetih |
| `capitalBattleIron` | 2 | **2** (aynı kalsın) | Başkent savaşı yine bir maden kaynağı istesin; acele etmeyi ucuzlatmamak için. | Acele eden pay |
| 5 oyunculu varsayılan harita (`defaultMapSize`) | 50×36 | **44×32** | Genişleme dönemi kısalır, cepheler başkentlere daha erken dayanır. Kara oranı ve maden sayısı oyuncu sayısıyla ölçeklendiği için kaynak dengesi bozulmaz; harita doğrulaması madensiz başlangıç alanlarını yine garanti eder. | İlk fetih, tur sınırı |
| Bot: `maxUpkeepShare` ve bakım tavanı | 0,5 ve 0,7 | **0,3 ve 0,45** | Bakım payını doğrudan bot politikası belirliyor; tavan düşünce akçe toprak, savaş ve başkent masrafına kayar. Bu bir bot ayarı, kural değeri değil. | Bakım payı, ilk fetih |
| `capitalBattleAkce` | 600 | **600** (aynı kalsın) | Akçe darboğaz değil; düşürmek yalnızca acele eden botu güçlendirir. | — |
| `capitalStreak` | 3 | **3** (aynı kalsın) | 2'ye inmesi başarıyı 1/4'e çıkarır; ilk fethi kesin öne çeker ama acele etmeyi yeniden baskın yapma riski yüksek. Yukarıdakiler yetmezse 3. turda ayrı bir senaryo olarak denenmeli. | (yedek seçenek) |

Tur sınırı hedefi (%10) için ayrıca: sınıra takılan oyunların çoğu, kalan devletlerin hepsi birbiriyle müttefik
olmadığı için oylamayla bitemeyen ve başkentlerin uzun süre düşmediği oyunlar. İlk iki öneri başkent
savaşlarını hem öne çekecek hem sıklaştıracağı için bu oranı da düşürmeli. Düşmezse botun ittifak ve
zafer oylaması davranışı ayrıca ele alınmalı.

3. tur için önerilen senaryolar: B3 = öneriler, RB3 = B3 + acele eden bot, ve yedek olarak B3 + `capitalStreak` 2.

<!-- bölüm:tur3 — bu işaretle kapanış işareti arası simülasyon tarafından yazılır -->

## 3. tur

`npm run simulate -- --round 3` ile üretilir (son çalıştırma: 2026-10-25). Her senaryo için 100 oyun, 5 oyuncu, 300 tur sınırı, seed'ler 10000–10099. 1. ve 2. turun ayarları da (eski 50×36 harita ve eski rastgele maden düzeniyle) aynı seed'lerde yeniden oynatıldı; üç tur aynı koşullarda karşılaştırılıyor.

| Senaryo | Açıklama |
|---|---|
| B | 1. tur varsayılanları (savaş 100 · üs 400+2 demir · başkent 1000+3+3 · bakım 100/100/100) ve temkinli bot |
| RB | B + 1 acele eden bot |
| B2 | 2. tur varsayılanları (savaş 100 · üs 200+1 demir · başkent 600+2+2 · bakım 50/50/0) ve gevşetilmiş bot |
| RB2 | B2 + 1 acele eden bot |
| B3 | 3. tur varsayılanları (başkent 600+2 demir, çelik yok · dengeli madenler · 44×32 harita · bot bakım payı 0,3 / tavan 0,45) |
| RB3 | B3 + 1 acele eden bot |

### Karşılaştırma ve hedefler

| Ölçüt | 1. tur | 2. tur | 3. tur | Hedef | Son turda tuttu mu |
|---|---|---|---|---|---|
| Acele eden botun kazanma payı (%95 üst sınır) | %14,4 (%22) | %16,9 (%26) | %26,3 (%35) | < %24 | ✘ |
| İlk başkent fethi, medyan tur | 162 | 111 | 42 | 30–60 | ✔ |
| Hiç başkent düşmeyen oyun | %31 | %11 | %1 | — |  |
| Tur sınırına takılan oyun | %43 | %19 | %17 | < %10 | ✘ |
| Bakım / tüm harcama | %67 | %61 | %56 | < %50 | ✘ |
| Harcama / gelir | %88 | %88 | %85 | — |  |
| Ortalama akçe stoku, tur 100 | 5.420 | 6.558 | 10.058 | — |  |
| Biten oyunların bitiş turu, medyan | 173 | 146 | 92 | — |  |
| Oyun başına savaş | 370 | 296 | 227 | — |  |
| Oyun başına başkent savaşı | 14,3 | 19,0 | 22,8 | — |  |

Tur kolonlarındaki acele eden pay RB/RB2/RB3, diğer satırlar B/B2/B3 senaryolarından. İlk başkent fethi medyanında hiç başkent düşmeyen oyunlar tur sınırı olarak sayıldı.

### Darboğaz ölçümü

Normal botlu senaryolarda, oyun başına bir olayın ilk görüldüğü turun medyanı (parantez içinde olayın görüldüğü oyun sayısı).

| Ölçüm | 1. tur | 2. tur | 3. tur |
|---|---|---|---|
| Bir oyuncu rakip başkentine komşu oluyor | 34 (100) | 33 (100) | 25 (100) |
| Bir oyuncu başkent savaşı masrafını karşılayabiliyor | 54 (100) | 49 (100) | 34 (100) |
| Komşuluk ve masraf aynı oyuncuda | 67 (93) | 59 (96) | 36 (100) |
| İlk başkent savaşı | 92 (78) | 63 (95) | 33 (100) |
| İlk başkent fethi (yalnızca düşen oyunlar) | 120 (69) | 97 (89) | 42 (99) |
| 60. turda demiri olmayan oyuncu oranı | %31 (100) | %32 (100) | %5 (87) |
| 60. turda çeliği olmayan oyuncu oranı | %28 (100) | %29 (100) | %4 (87) |

Masraf her turun kendi başkent savaşı değerleriyle ölçüldü (1. tur 1000+3+3, 2. tur 600+2+2, 3. tur 600+2 demir).

### İlk başkentin düştüğü tur

| Senaryo | Başkent düşen oyun | Ortalama | Medyan | %10–%90 | En az–en çok |
|---|---|---|---|---|---|
| B3 | 99/100 | 49,7 | 42 | 32–66 | 18–280 |

| Senaryo | ≤ 14 | 15–30 | 31–50 | 51–100 | 101–200 | > 200 | hiç düşmedi |
|---|---|---|---|---|---|---|---|
| B3 | %0 | %7 | %70 | %19 | %1 | %2 | %1 |

### Oyun süresi ve kazanma türü

| Senaryo | Biten oyunların bitiş turu (ort. \| medyan \| %10–%90 \| en az–en çok) | Tur sınırına takılan | Tek devlet | İttifak |
|---|---|---|---|---|
| B3 | 111,8 \| 92 \| 50–202 \| 39–280 | 17 (%17) | 41 | 42 |

| Senaryo | ≤ 50 | 51–100 | 101–200 | 201–300 | sınıra takıldı |
|---|---|---|---|---|---|
| B3 | %10 | %36 | %28 | %9 | %17 |

Tur sınırına takılan oyunların seed'leri (tekrar oynatmak için):

- **B3:** 10001, 10017, 10031, 10036, 10038, 10044, 10045, 10054, 10055, 10056, 10060, 10062, 10064, 10067, 10069, 10070, 10093

### Kaynak stokları

Yaşayan oyuncu başına ortalama; parantez içinde o tura ulaşan oyun sayısı.

| Senaryo | Akçe, tur 10 | Akçe, tur 25 | Akçe, tur 50 | Akçe, tur 100 | Maden kaynağı, tur 10 | Maden kaynağı, tur 25 | Maden kaynağı, tur 50 | Maden kaynağı, tur 100 |
|---|---|---|---|---|---|---|---|---|
| B3 | 27 (100) | 92 (100) | 2.653 (92) | 10.058 (54) | 12 (100) | 48 (100) | 140 (92) | 468 (54) |

Maden kaynağı = altın + petrol + demir + çelik toplamı.

### Harcamaların dağılımı

| Senaryo | Toprak | İnşa | Üretim | Savaş masrafı | Bakım | Boğaz vergisi | Harcama / gelir |
|---|---|---|---|---|---|---|---|
| B3 | %23,3 | %3,3 | %4,0 | %12,9 | %56,4 | %0,0 | %85 |

Gelir = topaçtan ve altın bozdurmadan gelen akçe. Teklif yoluyla el değiştiren akçe harcama sayılmaz.

Bakımın kalemlere göre dökümü (bakım harcamasının içindeki pay ve oyun başına akçe):

| Senaryo | Gemi | Uçak | Askeri üs | Bakım / tüm harcama |
|---|---|---|---|---|
| B3 | %65 (96.428) | %35 (52.461) | %0 (0) | %56,4 |

### Savaşlar

| Senaryo | Oyun başına savaş | Normal | Üs | Başkent | Başkent savaşı başarı oranı | Üs savaşı başarı oranı |
|---|---|---|---|---|---|---|
| B3 | 226,9 | %89,9 | %0,1 | %10,0 | %12,9 (295/2280) | %20,0 |

Başkent savaşı için beklenen başarı oranı 1/8 = %12,5, üs savaşı için 1/4 = %25.

### Acele eden bot testi

Her oyunda 1 bot en yakın rakip başkentine koşar (toprak alımını o yöne çevirir, savaşını hep o yönde kullanır, başkente komşu olur olmaz masrafı yetiyorsa başkent savaşına girer; hedefin gücüne bakmaz). Diğer 4 bot orta seviyedir. Acele eden botun koltuğu oyundan oyuna döner. Adil pay: 1/5 = %20.

| Senaryo | Kazanma payı (ittifak zaferi paylaştırılır) | %95 güven aralığı | Tek başına kazandığı oyun | Oyunda ilk elenen o | Oyun başına eleyebildiği rakip | Elendiği oyun | Değerlendirme |
|---|---|---|---|---|---|---|---|
| RB3 | %26,3 | %18,4–%35,4 | 10/100 | %12 | 1,22 | %25 | Adil paydan belirgin farkı yok |

"Belirgin şekilde üstünde": %95 güven aralığının alt sınırı adil payın (%20) üstündeyse. Kazanma payında ittifak zaferleri kazananlar arasında eşit bölünür.

<!-- /bölüm:tur3 -->

### Değerlendirme ve öneriler (3. tur)

**Hedefler:** dört hedeften biri tuttu, biri sınırda kaçtı.

| Hedef | 3. tur | Durum |
|---|---|---|
| Acele eden botun payı < %24 | %26,3 (güven aralığı %18,4–%35,4) | ✘ Adil paydan (%20) istatistiksel olarak ayrışmıyor, ama hedefin üstünde ve 2. turdan (%16,9) belirgin biçimde yüksek |
| İlk başkent fethi medyanı 30–60 | 42 | ✔ Oyunların %70'inde ilk fetih 31–50. turlar arasında; hiç başkent düşmeyen oyun %1 |
| Tur sınırına takılan < %10 | %17 | ✘ 2. tura göre (%19) çok az iyileşti |
| Bakım < harcamanın yarısı | %56 | ✘ Azaldı (%61 → %56) ama hâlâ üstünde |

**Ne işe yaradı?** Dengeli madenler darboğazı çözdü: 60. turda demiri olmayan oyuncu oranı %32'den %5'e,
çeliği olmayan %29'dan %4'e indi. Başkent savaşının masrafını karşılayabilme medyanı 49. turdan 34. tura,
komşuluk ve masrafın buluşması 59. turdan 36. tura geldi. Küçük harita komşuluğu 33. turdan 25. tura çekti.
Oyunlar belirgin biçimde kısaldı (biten oyunların medyanı 146 → 92).

**Acele eden bot neden güçlendi?** Başkent fethi ucuzlayıp öne geldikçe, başkente ilk koşanın ödülü büyüdü:
acele eden bot oyun başına 1,22 rakip eliyor (2. turda 0,56), tek başına kazandığı oyun 4'ten 10'a çıktı.
Normal botlar başkent masrafını ancak 34. turda karşılayabiliyor; acele eden ise biriktirmeye çok daha erken
başlayıp ilk denemeleri yapan taraf oluyor. 25. turda ortalama akçe stoku yalnızca ~90; erken oyunda akçe kıt.

**Tur sınırı neden düşmedi?** Sınıra takılan 17 oyunun 15'inde sona 2–3 devlet kalıyor. Son eleme medyan
98. turda; sonra ~200 tur boyunca kimse kimsenin başkentine ulaşamıyor. Bu oyunlarda 100. turda ortalama
11.000 akçe harcanmadan duruyor. Başkent yalnızca karadan alınabildiği ve karşı saldırı cepheyi ileri geri
oynattığı için, büyümüş iki devlet arasında cephe başkente dayanmıyor. Yani kalan sorun bir kural değerinden çok
oyun sonu davranışı.

**Bakım neden hâlâ yüksek?** Bakımın %65'i gemi, %35'i uçak. Bot birim sayısını hem bakım payıyla hem birim
adedi sınırıyla (2 + toprak/30) kısıtlıyor. Bakım tavanı 0,45'e inince adet sınırı da devreye girdi; payı asıl
belirleyen artık birim başına bakım. Akçe stokunun 50. turdan sonra büyümesi (tur 50: ~2.650, tur 100:
~10.000) diğer harcama yerlerinin de tükendiğini gösteriyor.

**Öneriler** (varsayılanlar değiştirilmedi):

| Ayar | Şu an | Öneri | Gerekçe | Hedef |
|---|---|---|---|---|
| `capitalBattleAkce` | 600 | **800** | Acele edenin avantajı, akçenin kıt olduğu erken oyundaki denemelerden geliyor. Akçe masrafını artırmak onu en çok erken dönemde yavaşlatır; normal botların başkent savaşları stoğun bol olduğu döneme denk geldiği için onları daha az etkiler. İlk fetih medyanının birkaç tur gecikip 30–60 aralığında kalması beklenir (masrafı karşılama 34 → ~40). | Acele eden pay |
| `capitalBattleIron` | 2 | **2** (aynı kalsın) | Demir artık dengeli dağılıyor; artırmak demiri olmayan %5'lik oyuncu grubunu yeniden dışlar. Akçe ayarı yetmezse ikinci adım olarak 3 denenebilir. | — |
| `shipUpkeep` / `planeUpkeep` | 50 / 50 | **25 / 25** | Bakımın tamamı birimlerden geliyor ve bot birim adedini ayrıca sınırladığı için bakım ucuzlayınca birim sayısı çok artmaz; bakımın harcama içindeki payının ~%40'a inmesi beklenir. | Bakım payı |
| Bot: oyun sonu davranışı | — | **Yeni bot kuralı** | ≤ 3 devlet kaldığında ve 20 tur boyunca kimse elenmediğinde: (a) akçe stoku yüksekse kara savaşının beklenen değer şartı aranmadan her tur rakip başkente doğru koridor açılsın; (b) iki devlet kaldıysa ve biri açıkça güçlüyse zayıf taraf barış/ittifak teklif edip zafer oylamasına gidebilsin. Bu bir kural değil bot davranışı; tur sınırı hedefi için en doğrudan araç. | Tur sınırı |
| `capitalStreak` | 3 | **3** (özgün kural, değişmiyor) | — | — |

Önerilen değerlerin acele eden bot testiyle birlikte 4. turda sınanması gerekir. Özellikle başkent masrafı
artınca ilk fetih medyanının 30–60 aralığında kalıp kalmadığına ve tur sınırı oranına bakılmalı.

Not: Bu turda acele eden botun yalnızca güncel varsayılan bot ayarlarını kullandığı bir hata düzeltildi; artık
senaryonun bot ayarlarını (bakım politikası vb.) diğer botlarla paylaşıyor. Bu yüzden 1. ve 2. turun yeniden
oynatılan RB/RB2 değerleri 2. tur raporundaki değerlerle birebir aynı (%14,4 ve %16,9).

