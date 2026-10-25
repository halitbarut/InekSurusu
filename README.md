# İnek Sürüsü

Kareli defter kâğıdında oynanan sıra tabanlı, topaçlı strateji oyununun tarayıcı sürümü.
Aynı ekranda sırayla (hot-seat) ve botlarla 3–8 oyuncu oynanır.

## Çalıştırma

```bash
npm install
npm run dev        # geliştirme sunucusu (http://localhost:5173)
npm run build      # dist/ klasörüne statik derleme
npm test           # kural motoru testleri (Vitest)
npm run simulate   # denge simülasyonu, 1. tur → docs/BALANCE_REPORT.md (uzun sürer; --games 20 ile kısalt)
npm run simulate -- --round 2   # 2. tur: yeni varsayılanlar ve karşılaştırma
npm run simulate -- --round 3   # 3. tur: dengeli madenler, küçük harita; 1.–3. tur karşılaştırması
npm run simulate -- --round onayar   # hazır kural takımlarının (Klasik, Dengeli, Hızlı, Sakin açılış) karşılaştırması
npm run simulate -- --round zorluk   # bot seviyeleri: Zor 1 + Orta 4 ve Orta 1 + Kolay 4
```

`npm run build` çıktısı (`dist/`) herhangi bir statik sunucuda ya da alt klasörde çalışır.

## Nasıl oynanır

1. **Yeni oyun:** oyuncu sayısı, ad, renk, İnsan ya da Bot (Kolay / Orta / Zor); rastgele harita (boyut ve seed,
   önizlemeli) ya da harita editöründe çizilmiş kayıtlı bir harita; kurallar için bir önayar (aşağıda).
2. **Kurulum:** herkes sırayla başkentini seçer, sonra başkentine bitişik 9 toprak seçer. Bu aşamada maden
   kareleri seçilemez (haritada kırmızı taranır); madenler oyun başladıktan sonra alınır.
   Haritada her maden türünden (altın, petrol, demir, çelik) oyuncu sayısı kadar maden vardır ve madenler
   dengeli yayılır: yerleşilebilir her kareden her türün en yakın madeni en fazla 10 kare uzaktadır.
3. **Her tur:** madenler 1'er kaynak verir → gemi, uçak ve askeri üsler için **bakım** ödenir →
   sekizgen topacı çevir (sayı × 100 akçe) → istediğin kadar eylem yap → **Turu bitir**.

Haritayı sürükleyerek kaydır, tekerlekle (ya da iki parmakla) yakınlaş. Bir eylem seçince geçerli hedefler
haritada vurgulanır; karelerin üzerine gelince bilgi ve neden yapılamadığı görünür. Üst çubukta sıradaki oyuncu ve
turun aşaması (Bakım → Topaç → Eylemler) görünür. Eylem çubuğundaki her düğmenin ipucu vardır; yapılamayan
eylemler soluk görünür ve ipucunda nedeni yazar. `Esc` eylemi iptal eder, `Boşluk` topacı çevirir,
`Ctrl+Z` son eylemi geri alır.

### Kural önayarları

Yeni oyun ekranında önce bir önayar seçilir; varsayılan **Dengeli**dir.

| Önayar | Ne değişir |
|---|---|
| Klasik | Kâğıt oyuna en yakın: savaş masrafı ve bakım yok |
| Dengeli | Denge simülasyonlarıyla ayarlanmış varsayılanlar |
| Hızlı | Haritanın %80'i boyutunda, 300 akçeyle başlangıç: oyun daha kısa sürer |
| Sakin açılış | Dengeli + ilk 5 tur kimse kimseye saldıramaz |
| Özel | Bütün ayarlar katlanabilir gruplarda (Harita, Ekonomi, Savaş, Bakım, İsteğe bağlı kurallar) |

Bir değer değiştirilince seçim kendiliğinden **Özel**e geçer. Özel ayarlar isim verilerek kaydedilip sonra listeden
seçilebilir ve silinebilir (tarayıcıda saklanır).

### Botlar

Her bot için seviye ayrı seçilir: **Kolay** daha az planlı ve gelişigüzel oynar, kolay kandırılır; **Orta** önceki
sürümün botudur; **Zor** en yakın rakip başkentini hedefler, başkent savaşı için akçe ve demir saklar, kendi
başkentine dayanan düşmanı önce geri iter, diplomaside çıkarını korur. Hiçbiri hile yapmaz (topaç sonuçlarını
göremez, ek kaynak almaz). Simülasyonda Zor bot 4 orta botun arasında oyunların %35'ini, orta bot 4 kolay botun
arasında %48'ini kazanıyor (adil pay %20; BALANCE_REPORT.md).

### Geri alma

Kendi turunda yaptığın toprak alma, inşa, üretim, altın bozdurma, boğaz ayarı ve sahipsiz toprağa seferi
"Geri al" düğmesi ya da `Ctrl+Z` ile geri alabilirsin. Topaç, savaş (savaşa dönüşen sefer dahil) ve diplomasi
geri alınamaz; bunlardan biri yapılınca o ana kadarki geçmiş silinir, kimse savaş sonucunu görüp önceki
hamlelerini değiştiremez. Geçmiş tur bitince silinir.

### Oyun sonu

Zafer ekranında tur tur toprak ve akçe grafikleri (elenmeler işaretli), her oyuncunun kalem kalem harcaması,
kazandığı ve kaybettiği savaşlar ve başkent savaşı denemeleri vardır. Özet JSON olarak indirilebilir.

### Ses

Bütün sesler tarayıcıda Web Audio ile üretilir (ses dosyası yok): topaç, toprak alma, inşa ve üretim, savaş,
başkent düşüşü, tur değişimi, gelen teklif ve hafif düğme tıklamaları. Ses düzeyi ve sessiz mod ayarlardadır
(oyun içinde üst çubukta da ses düğmesi var). "Hızlı oynat" açıkken botların yalnızca önemli olaylarının sesi çalar.

## Harita editörü

Ana menüde **Harita Editörü**: boş bir kâğıtla (boyut seçilerek) ya da rastgele bir haritayla başla; kara ve deniz
fırçası (boyut ayarlı), kova, maden yerleştirme (altın, petrol, demir, çelik; istersen otomatik dengeli yerleşim)
ve silgiyle çiz. Editörün kendi geri al/yinele'si vardır (`Ctrl+Z`, `Ctrl+Y`). Kapalı küçük su kütleleri kendiliğinden
göl, dar geçitler kendiliğinden boğaz olur ve haritada işaretlenir. Denetim paneli haritanın kaç oyuncuya uygun
olduğunu (madensiz başkent + 9 bitişik toprak alanı) ve sorunları gösterir; boğaz ya da göl yoksa yalnızca uyarır.
Haritalar isimle kaydedilir, küçük önizlemeli listede düzenlenir, silinir, JSON olarak dışa/içe aktarılır.
Yeni oyun ekranında "Rastgele harita" yerine kayıtlı bir harita seçilebilir; oyuncu sayısına yetmiyorsa uyarı
verilir. Kayıtlı oyunlar haritanın kendisini de içerdiği için harita silinse de açılır.

## Kurallar (özet)

| Eylem | Bedel / koşul |
|---|---|
| Sahipsiz toprak al | 100 akçe, toprağına komşu olmalı |
| Tersane / Uçak fabrikası / Askeri üs | 200 / 300 / 400 akçe. Tersane denize kıyı ister, üs başkente kurulamaz. Karede tek yapı |
| Gemi / Uçak üret | 2 demir + 100 akçe / 2 çelik + 200 akçe. Birimler kalıcıdır |
| Altın bozdur | 1 altın = 200 akçe |
| **Turda tek savaş** | Kara savaşı, gemi/uçakla dolu toprağa saldırı, başkent ve üs savaşı — hepsinden turda yalnızca 1 tane |
| **Savaş masrafı** | Başlatırken ödenir, sonuçtan bağımsız: normal savaş 100 akçe · üs savaşı 200 akçe + 1 demir · başkent savaşı 600 akçe + 2 demir. Yetmiyorsa savaş başlatılamaz |
| **Bakım** | Her tur başında, topaçtan önce: gemi ve uçak başına 50 akçe (askeri üs varsayılan olarak bakımsız). Akçe yetmezse oyuncu dağıtacaklarını seçer; ödenemeyen kadar birim dağıtılır, bakımlı üs yıkılır (toprak kalır) |
| Kara savaşı | Sınır komşuluğu. İki taraf topaç çevirir. A > D: saldıran A − D toprak seçer. A < D: savunan karşı saldırıyla ⌈(D − A)/2⌉ toprak seçer (saldıranın kendisine komşu topraklarından). A = D: sonuçsuz |
| Başkent savaşı | Yalnızca karadan (sınır komşuluğu). Art arda 3 kez yüksek at (eşitlik tekrar). Kazanırsan rakip elenir, her şeyi sana geçer. Kaybedersen toprak kaybı yok |
| Askeri üs savaşı | Art arda 2 kez yüksek at. Kaybedersen toprak kaybı yok |
| Gemi seferi | 1 petrol; deniz yoluyla kıyı topraklarına. Kapalı/vergili boğazlara dikkat |
| Uçak seferi | 2 petrol; her yere — düşman üslerinin 3 kare çevresi hariç |
| Sefer hedefi | Sahipsizse 100 akçeyle alınır (savaş sayılmaz), sahipliyse savaş. Maden kareleri seferle doğrudan alınamaz. **Başkente gemi ya da uçakla saldırılamaz** (başkent savaşı yalnızca karadan). Seferle saldırıda kaybedersen savunan yalnızca kendisiyle sınırın olan topraklarından alabilir |

Fetihte başkent ve askeri üs toprakları seçilemez; her seçilen toprak seçim anında seçenin toprağına komşu
olmalıdır (seferle kazanılan savaşta hedef kare ve komşuları). Seçilecek toprak kalmazsa seçilebildiği kadar
alınır. Karşı saldırıda toprakları savunan seçer: insan savunan için cihaz ona verilir ("Cihazı X oyuncusuna
verin"), seçimden sonra sıra saldırana döner.

- **Boğazlar:** Bir boğazın iki yakasındaki tüm kara kareleri senin ise boğazı idare edersin; "Boğazlarım"
  panelinden her oyuncu için geçiş izni ve vergi belirlersin. İdare kaybedilince ayarlar sıfırlanır.
- **Diplomasi:** ittifak, belirli süreli barış, akçe/kaynak/toprak takası, boğaz izni — hepsi tek teklifte
  birleştirilebilir. Müttefiklere ve barış yapılanlara saldırılamaz; müttefik üsleri uçaklarını engellemez.
- **Kazanma:** dünyada tek devlet kalırsa ya da kalan herkes müttefikse ve oybirliğiyle bitirmeye karar verirse.

**İsteğe bağlı kurallar** (yeni oyun → kural ayarları, varsayılan kapalı, kayda dahil):

- **Zayıflık şartı:** başkente saldırmak için savunanın toprak sayısı saldıranınkinin yarısından az olmalı.
- **Açılış barışı:** ilk N tur (varsayılan 5) kimse başka oyuncunun toprağına saldıramaz; sahipsiz toprak serbest.

Savaş masrafları ve bakım ayarlardan tamamen kapatılabilir.

Belirsiz kural noktalarında verilen kararlar: [docs/ASSUMPTIONS.md](docs/ASSUMPTIONS.md).
Denge simülasyonu sonuçları ve öneriler: [docs/BALANCE_REPORT.md](docs/BALANCE_REPORT.md).
Arayüz incelemesi ve önce/sonra ekran görüntüleri: [docs/UI_REVIEW.md](docs/UI_REVIEW.md).

## Çevrimiçi oyun

Herkes kendi cihazından oynar; ayrı bir sunucu gerekmez. Oyun **oda sahibinin tarayıcısında** çalışır
(kurallar, zarlar ve botlar orada), diğerleri tarayıcıdan tarayıcıya (WebRTC, PeerJS) bağlanır.

1. Oda sahibi: **Çevrimiçi oyun → Oda kur**. Bir oda kodu ve davet linki çıkar
   (`http://…/?oda=KOD`). Koltukları "Davetli oyuncu" ya da "Bot" yapar, harita ve kuralları ayarlar.
2. Katılanlar: linke tıklar (ya da kodu girer), adını ve rengini yazar, boş bir koltuğa oturur.
   Oturmayanlar **izleyici** olur; oyun başladıktan sonra gelenler de izleyici olarak girer.
3. Oda sahibi **Oyunu başlat** der; boş kalan davetli koltuklarda bot oynar.

- **Bağlantısı kopan oyuncu** 1 dakika beklenir (herkes geri sayımı görür). Dönmezse yerine bot oynar.
  Aynı tarayıcıdan aynı davet linkiyle döndüğünde koltuğunu geri alır.
- Oda sahibi sekmeyi kapatırsa oyun durur. Oyun oda sahibinde her tur sonunda otomatik kaydedilir;
  kayıt sonradan yerel (hot-seat) oyun olarak açılabilir.
- İlk bağlantı için PeerJS'in ücretsiz eşleşme sunucusu kullanılır; bağlantı kurulduktan sonra veriler
  doğrudan tarayıcılar arasında gider. Çok sıkı kurumsal ağlarda doğrudan bağlantı kurulamayabilir.
- Yerelde denemek için `npm run dev -- --host` yeterli; internetten katılacaklar için sayfanın onlara da
  açık olması gerekir (ör. `npm run build` çıktısını herhangi bir statik barındırmaya koymak ya da
  bir tünel servisi kullanmak).

## Kaydet / yükle

Oyun her tur sonunda otomatik kaydedilir (ana menüde **Devam et**). Üst çubuktaki kaydet düğmesiyle adlandırılmış kayıt
oluşturulur ya da oyun JSON olarak dışa aktarılır; JSON dosyası "Kayıtlı oyunu yükle" ekranından içe aktarılır.
Kayıtlar tarayıcının `localStorage` alanında tutulur.

## Mimari

```
src/
  engine/          Saf TypeScript kural motoru (DOM yok)
    types.ts       GameState, Action, GameEvent ...
    config.ts      Ayarlanabilir kural değerleri (maliyetler, seri sayıları, yarıçap ...)
    rng.ts         Tohumlanabilir RNG (mulberry32)
    rules.ts       validateAction / applyAction / dispatch, tur akışı, savaş, eleme
    movement.ts    Gemi (deniz + boğaz, en ucuz rota) ve uçak (üs engelli) rota bulma
    diplomacy.ts   Teklif doğrulama ve uygulama
    helpers.ts     İlişkiler, boğaz idaresi, fetih adayları ...
    queries.ts     Arayüz/bot için geçerli hedef sorguları
    presets.ts     Hazır kural takımları (önayarlar)
    undo.ts        Geri alma: hangi eylemler geri alınır, tur içi geçmiş
    stats.ts       Tur sonu istatistikleri ve harcama/savaş toplamları (oyun sonu özeti)
    map/           Harita üretici (gürültü, iç deniz, göl, boğaz, maden), boğaz tespiti, elle çizilen haritalar
  bot/             BotBrain arayüzü, kolay/orta/zor botlar, simülasyon için acele eden bot
scripts/           Denge simülasyonu (npm run simulate)
  net/             Çevrimiçi oda: protokol, PeerJS taşıyıcı, oda sahibi (HostRoom) ve katılan (ClientRoom)
  ui/              Canvas harita, topaç animasyonu, paneller, diyaloglar, lobi, kayıt
    icons.ts       Kendi SVG ikon seti (DOM ve Canvas için)
    sound.ts       Web Audio ile sentezlenen sesler
    playerStyle.ts Oyuncu renkleri, harita desenleri ve grafik çizgi desenleri
    game/summary.ts Oyun sonu grafikleri ve özet tablo
    screens/       Ana menü, yeni oyun (önayarlar), harita editörü, çevrimiçi lobi
tests/             Vitest birim testleri
```

- Tüm oyun durumu tek bir serileştirilebilir `GameState` nesnesindedir; RNG durumu da içindedir.
- Her oyuncu eylemi bir `Action`'dır: `validateAction(state, action)` geçerliliği söyler,
  `applyAction(state, action, rng)` yeni durumu ve olayları (`GameEvent[]`) döner; girdi durumu değişmez.
  `dispatch(state, action)` RNG'yi durumdan alıp geri yazan kısayoldur.
- Botlar aynı `Action` arayüzünü kullanır (`BotBrain.chooseAction`). Seviyeler `MediumBot`'tan türetilir
  (`EasyBot`, `HardBot`); bot rastgeleliği oyunun RNG'sine dokunmaz.
- Arayüz yalnızca eylem gönderir ve olayları canlandırır; bu ayrım ileride çevrimiçi moda geçişi kolaylaştırır.
