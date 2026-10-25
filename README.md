# 🐄 İnek Sürüsü

Kareli defter kâğıdında oynanan sıra tabanlı, topaçlı strateji oyununun tarayıcı sürümü.
Aynı ekranda sırayla (hot-seat) ve botlarla 3–8 oyuncu oynanır.

## Çalıştırma

```bash
npm install
npm run dev        # geliştirme sunucusu (http://localhost:5173)
npm run build      # dist/ klasörüne statik derleme
npm test           # kural motoru testleri (Vitest)
```

`npm run build` çıktısı (`dist/`) herhangi bir statik sunucuda ya da alt klasörde çalışır.

## Nasıl oynanır

1. **Yeni oyun:** oyuncu sayısı, ad, renk, İnsan/Bot; harita boyutu ve seed (önizlemeli); kural ayarları.
2. **Kurulum:** herkes sırayla başkentini seçer, sonra başkentine bitişik 9 toprak seçer. Bu aşamada maden
   kareleri seçilemez (haritada kırmızı taranır); madenler oyun başladıktan sonra alınır.
3. **Her tur:** madenler 1'er kaynak verir → sekizgen topacı çevir (sayı × 100 akçe) → istediğin kadar eylem yap → **Turu bitir**.

Haritayı sürükleyerek kaydır, tekerlekle (ya da iki parmakla) yakınlaş. Bir eylem seçince geçerli hedefler
haritada vurgulanır; karelerin üzerine gelince bilgi ve neden yapılamadığı görünür. `Esc` eylemi iptal eder,
`Boşluk` topacı çevirir.

## Kurallar (özet)

| Eylem | Bedel / koşul |
|---|---|
| Sahipsiz toprak al | 100 akçe, toprağına komşu olmalı |
| Tersane / Uçak fabrikası / Askeri üs | 200 / 300 / 400 akçe. Tersane denize kıyı ister, üs başkente kurulamaz. Karede tek yapı |
| Gemi / Uçak üret | 2 demir + 100 akçe / 2 çelik + 200 akçe. Birimler kalıcıdır |
| Altın bozdur | 1 altın = 200 akçe |
| **Turda tek savaş** | Kara savaşı, gemi/uçakla dolu toprağa saldırı, başkent ve üs savaşı — hepsinden turda yalnızca 1 tane |
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

Belirsiz kural noktalarında verilen kararlar: [docs/ASSUMPTIONS.md](docs/ASSUMPTIONS.md).

## Kaydet / yükle

Oyun her tur sonunda otomatik kaydedilir (ana menüde **Devam et**). 💾 düğmesiyle adlandırılmış kayıt
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
    map/           Harita üretici (gürültü, iç deniz, göl, boğaz, maden) ve boğaz tespiti
  bot/             BotBrain arayüzü ve orta seviye bot
  ui/              Canvas harita, topaç animasyonu, paneller, diyaloglar, kayıt
tests/             Vitest birim testleri
```

- Tüm oyun durumu tek bir serileştirilebilir `GameState` nesnesindedir; RNG durumu da içindedir.
- Her oyuncu eylemi bir `Action`'dır: `validateAction(state, action)` geçerliliği söyler,
  `applyAction(state, action, rng)` yeni durumu ve olayları (`GameEvent[]`) döner; girdi durumu değişmez.
  `dispatch(state, action)` RNG'yi durumdan alıp geri yazan kısayoldur.
- Botlar aynı `Action` arayüzünü kullanır (`BotBrain.chooseAction`). Yeni zorluk seviyeleri `BotBrain`
  uygulanarak ya da `BotTuning` değerleri değiştirilerek eklenebilir.
- Arayüz yalnızca eylem gönderir ve olayları canlandırır; bu ayrım ileride çevrimiçi moda geçişi kolaylaştırır.
