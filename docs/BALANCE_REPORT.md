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
