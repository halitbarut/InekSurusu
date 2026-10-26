# İnek Sürüsü

Kareli defter kâğıdında oynanan sıra tabanlı, topaçlı strateji oyununun tarayıcı sürümü.
Aynı ekranda sırayla (hot-seat), botlarla ya da çevrimiçi 3–8 oyuncu oynanır. Yeni başlayanlar için adım adım
bir öğretici vardır.

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
npx tsx scripts/maps/build.ts        # hazır haritaları ve öğretici haritasını şekillerden yeniden üret
npx tsx scripts/maps/playtest.ts 4   # hazır haritalarda bot oyunları (docs/MAPS.md)
npx tsx scripts/tutorialSeed.ts      # öğreticinin sabit topaç/savaş sonuçları için RNG durumunu ara
```

`npm run build` çıktısı (`dist/`) herhangi bir statik sunucuda ya da alt klasörde çalışır.

## Nasıl oynanır

1. **Yeni oyun:** oyuncu sayısı, ad, renk, İnsan ya da Bot (Kolay / Orta / Zor); rastgele harita (boyut ve seed,
   önizlemeli), oyunla gelen **hazır haritalardan** biri ya da harita editöründe çizilmiş kayıtlı bir harita;
   kurallar için bir önayar (aşağıda); **maç ayarı** olarak isteğe bağlı tur süresi.
2. **Kurulum:** herkes sırayla başkentini seçer, sonra başkentine bitişik 9 toprak seçer. Bu aşamada maden
   kareleri seçilemez (haritada kırmızı taranır); madenler oyun başladıktan sonra alınır.
   Haritada her maden türünden (altın, petrol, demir, çelik) oyuncu sayısı kadar maden vardır ve madenler
   dengeli yayılır: yerleşilebilir her kareden her türün en yakın madeni en fazla 10 kare uzaktadır.
3. **Her tur:** madenler 1'er kaynak verir → gemi, uçak ve askeri üsler için **bakım** ödenir →
   sekizgen topacı çevir (sayı × 100 akçe) → istediğin kadar eylem yap → **Turu bitir**.

Haritayı sürükleyerek kaydır, tekerlekle (ya da iki parmakla) yakınlaş. **Bir kareye tıklamak** (dokunmatikte
dokunmak) o karede yapılabilecekleri maliyetleriyle gösteren küçük bir menü açar: sahipsiz karede "Toprak al –
100 akçe", kendi kıyı karende "Tersane kur – 200 akçe", düşman sınır karesinde "Saldır – 100 akçe", gemiyle/uçakla
al ya da saldır… Yapılamayanlar soluk görünür ve nedeni (ör. "Yetersiz demir: 1 demir daha lazım") yazar. Eylem
çubuğunda yalnızca genel eylemler kalır: Diplomasi, Altın bozdur, Boğazlarım, Geri al, Turu bitir. Önce eylemi
sonra hedefi seçmek isteyenler için kareye bağlı altı eylem **Hedef seç** düğmesinin altındadır (`1`–`6` tuşları).

- **Savaştan önce önizleme:** masraf, kazanırsan (fark kadar toprak, ortalama 3), kaybedersen (farkın yarısı
  kadar, yukarı yuvarlanır), berabere ve olasılık (normal savaşta %44, başkent savaşında 1/8, üs savaşında 1/4).
- **Seferde rota:** gemi ya da uçak hedefinin üzerine gelince rota haritada çizilir; geçilecek boğazlar, kimin
  idaresinde oldukları ve vergileri yazar.
- **Eylem sonrası:** kaynak değişimleri kısa süre uçan sayılarla (+300 akçe, −1 demir), değişen kareler kısa
  parlamayla, önemli olaylar (savaş sonucu, gelen teklif, sana yapılan saldırı, bakım ödemesi, elenme, boğaz
  idaresi) ekranın sağ kenarında bildirimlerle görünür.
- Kullanılmamış savaş hakkıyla turu bitirirken hafif bir hatırlatma çıkar; ilk oyunlarda bir eylem ilk kez
  yapılabilir olunca kısa bir ipucu gösterilir. İkisi de ayarlardan kapatılabilir.

Üst çubukta sıradaki oyuncu, turun aşaması (Bakım → Topaç → Eylemler) ve tur süresi açıksa kalan süre görünür.
`Esc` menüyü ya da eylemi iptal eder, `Boşluk` topacı çevirir, `Ctrl+Z` son eylemi geri alır.

### Öğretici

Ana menüde **Öğretici**: küçük, sabit bir haritada, sabit bir seed'le, 2 botla oynanan adım adım eğitim. 11 konu
sırayla işlenir: topaç ve gelir, toprak alma, madenler ve altın bozdurma, inşa (tersane, uçak fabrikası, askeri
üs), üretim ve bakım, normal savaş (biri kaybedilen, biri kazanılan iki örnek), gemi ve uçak seferi, boğazlar,
askeri üs ve başkent savaşı, diplomasi, kazanma koşulu. Her adımda kısa bir açıklama, haritada vurgulanan bir hedef
ve yapılacak tek bir eylem vardır; doğru eylem yapılınca sonraki adıma geçilir ("Benim yerime yap" da var).
Öğreticiden her an çıkılabilir, ana menüden kaldığı yerden sürdürülür. Oyunu ilk kez açan oyuncuya ana menüde
önerilir.

### Tur süresi

Yeni oyun ekranındaki **Maç ayarları**nda isteğe bağlı tur süresi: kapalı (varsayılan), 1, 2, 3 ya da 5 dakika.
Hot-seat'te ve çevrimiçide çalışır (çevrimiçide süreyi oda sahibi tutar). Son 15 saniyede uyarı ve tık sesi.
Süre dolunca topaç çevrilmemişse çevrilir, bekleyen zorunlu seçimler (bakımda dağıtma, kazanılan savaşta toprak
seçimi) Orta bot mantığıyla yapılır ve tur biter. Karşı saldırıda toprak seçen savunanın ve oylamada oyu beklenenin
kendi süresi işler; o sırada sıradaki oyuncunun süresi durur.

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

### Oyun sonu ve tekrar (replay)

Zafer ekranında tur tur toprak ve akçe grafikleri (elenmeler işaretli), her oyuncunun kalem kalem harcaması,
kazandığı ve kaybettiği savaşlar ve başkent savaşı denemeleri vardır. Özet JSON olarak indirilebilir.

Her oyunun başlangıç durumu, seed'i ve uygulanan bütün eylemleri kaydedilir (geri alınanlar çıkarılır); kayıt oyunu
birebir yeniden üretir. Zafer ekranında **Oyunu baştan izle**: oynat/duraklat, ileri/geri adım, 1x–8x hız, tur
çubuğuyla istenen tura atlama, oyun sonu grafiklerinde bir tura tıklayınca o ana gitme ve tekrarla birlikte ilerleyen
olay günlüğü. **Replay indir** ile dosya olarak alınır, ana menüde **Replay aç** ile yüklenir.

### Ses

Bütün sesler tarayıcıda Web Audio ile üretilir (ses dosyası yok): topaç, toprak alma, inşa ve üretim, savaş,
başkent düşüşü, tur değişimi, gelen teklif ve hafif düğme tıklamaları. Ses düzeyi ve sessiz mod ayarlardadır
(oyun içinde üst çubukta da ses düğmesi var). "Hızlı oynat" açıkken botların yalnızca önemli olaylarının sesi çalar.

## Hazır haritalar

Oyunla birlikte dört harita gelir; yeni oyun ekranında küçük önizlemeli kartlardan seçilir, harita editöründe
listelenir (silinemez, "Kopyasını düzenle" ile kendi haritalarına kopyalanır). Ayrıntılar: [docs/MAPS.md](docs/MAPS.md).

| Harita | Oyuncu | Öne çıkan |
|---|---|---|
| Anadolu ve Balkanlar | 5–7 | İstanbul ve Çanakkale boğazları, Marmara, Ege adaları, Karadeniz, Akdeniz, Kerç Boğazı |
| Takımadalar | 3–4 | Ev adaları; altın ve çelik ortadaki atolde, gemi olmadan büyümek zor |
| Büyük kıta | 8 | Boğazla açılan iç deniz, kapalı iç deniz, göller |
| İkiz kıtalar | 4–6 | İki kıtayı ayıran kanaldaki iki dar boğaz okyanusların tek bağlantısı |

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
Arayüz incelemesi ve önce/sonra ekran görüntüleri: [docs/UI_REVIEW.md](docs/UI_REVIEW.md),
geri bildirim incelemesi ve sadeleştirme: [docs/FEEDBACK_REVIEW.md](docs/FEEDBACK_REVIEW.md).
Çevrimiçi mimari ve güvenlik: [docs/ONLINE.md](docs/ONLINE.md).

## Çevrimiçi oyun

Herkes kendi cihazından oynar; ayrı bir sunucu gerekmez. Oyun **oda sahibinin tarayıcısında** çalışır
(kurallar, zarlar ve botlar orada), diğerleri tarayıcıdan tarayıcıya (WebRTC, PeerJS) bağlanır.

1. Oda sahibi: **Çevrimiçi oyun → Oda kur**. Bir oda kodu ve davet linki çıkar
   (`http://…/?oda=KOD`). Koltukları "Davetli oyuncu" ya da "Bot" yapar, harita ve kuralları ayarlar.
2. Katılanlar: linke tıklar (ya da kodu girer), adını ve rengini yazar, boş bir koltuğa oturur.
   Oturmayanlar **izleyici** olur; oyun başladıktan sonra gelenler de izleyici olarak girer. Ayrı bir
   **izleyici linki** (`?oda=KOD&izle=1`) de vardır.
3. Oda sahibi **Oyunu başlat** der; boş kalan davetli koltuklarda bot oynar.

- **Sohbet:** üst çubuktaki sohbet düğmesi (okunmamış rozeti ve hafif bir sesle). Herkese açık genel kanal ve
  oyuncular arasında özel mesajlar; özel mesajlar uçtan uca şifrelidir, oda sahibi bile okuyamaz. Diplomasi
  penceresinden bir oyuncuyla tek tıkla özel sohbete geçilir. Geçmiş yeniden bağlanınca geri gelir. Hot-seat ve
  bot oyunlarında sohbet yoktur.
- **İzleyiciler** haritayı, oyuncuları, günlüğü ve genel sohbeti görür; gizli teklifleri ve özel mesajları görmez.
  Genel sohbete yazabilirler (izleyici olarak işaretlenir); oda sahibi izleyici sohbetini kapatabilir. Elenen oyuncu
  oyundan çıkmak zorunda kalmaz, izleyiciye dönüşür. İzleyici listesi lobide ve oyunda görünür.
- Diplomasi teklifleri yalnızca iki tarafa gider; oda sahibi her eylemi doğrular, zarlar yalnızca onda atılır
  (ayrıntılar ve bilinen kısıtlar: [docs/ONLINE.md](docs/ONLINE.md)).

- **Bağlantısı kopan oyuncu** 1 dakika beklenir (herkes geri sayımı görür). Dönmezse yerine bot oynar.
  Aynı tarayıcıdan aynı davet linkiyle döndüğünde koltuğunu geri alır.
- Oda sahibi sekmeyi kapatırsa oyun durur. Oyun oda sahibinde her tur sonunda otomatik kaydedilir;
  kayıt sonradan yerel (hot-seat) oyun olarak açılabilir. Sayfasını yenileyen katılımcı aynı linkle kendiliğinden
  yeniden bağlanır.
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
    replay.ts      Oyun tekrarı: kayıt, yeniden oynatma, paylaşılan kopyada gizli tekliflerin ayıklanması
    actionShape.ts Ağdan/dosyadan gelen eylemlerin biçim denetimi
    stats.ts       Tur sonu istatistikleri ve harcama/savaş toplamları (oyun sonu özeti)
    map/           Harita üretici (gürültü, iç deniz, göl, boğaz, maden), boğaz tespiti, elle çizilen haritalar
  bot/             BotBrain arayüzü, kolay/orta/zor botlar, simülasyon için acele eden bot, öğretici botu,
                   süre dolunca otomatik eylemler (timeout.ts)
  net/             Çevrimiçi oda: protokol, PeerJS taşıyıcı, oda sahibi (HostRoom) ve katılan (ClientRoom), sohbet
  maps/            Hazır haritalar (scripts/maps ile üretilir)
  tutorial/        Öğretici: sabit senaryo, adımlar, rehber kutusu
  ui/              Canvas harita, topaç animasyonu, paneller, diyaloglar, lobi, kayıt
    icons.ts       Kendi SVG ikon seti (DOM ve Canvas için)
    sound.ts       Web Audio ile sentezlenen sesler
    playerStyle.ts Oyuncu renkleri, harita desenleri ve grafik çizgi desenleri
    game/          Oyun ekranı, kare menüsü, geri bildirim, tur saati, sohbet paneli, ipuçları, oyun sonu özeti
    replay/        Tekrar oynatıcısı
    screens/       Ana menü, yeni oyun (önayarlar, hazır haritalar), harita editörü, çevrimiçi lobi
scripts/           Denge simülasyonu (npm run simulate), harita çizimi ve bot testleri (maps/), öğretici seed araması
tests/             Vitest birim testleri
```

- Tüm oyun durumu tek bir serileştirilebilir `GameState` nesnesindedir; RNG durumu da içindedir.
- Her oyuncu eylemi bir `Action`'dır: `validateAction(state, action)` geçerliliği söyler,
  `applyAction(state, action, rng)` yeni durumu ve olayları (`GameEvent[]`) döner; girdi durumu değişmez.
  `dispatch(state, action)` RNG'yi durumdan alıp geri yazan kısayoldur.
- Botlar aynı `Action` arayüzünü kullanır (`BotBrain.chooseAction`). Seviyeler `MediumBot`'tan türetilir
  (`EasyBot`, `HardBot`); bot rastgeleliği oyunun RNG'sine dokunmaz.
- Arayüz yalnızca eylem gönderir ve olayları canlandırır. Çevrimiçide oda sahibi aynı motoru hakem olarak çalıştırır;
  katılanlar eylem ister, sonucu oda sahibi belirler.
