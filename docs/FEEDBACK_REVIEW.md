# Geri bildirim incelemesi

Oyun yeni bir oyuncu gözüyle oynandı (hot-seat, 1 insan + 3 Orta bot, 12. turdan bir kayıt ve baştan bir oyun).
Her eylem için üç soru soruldu: **eylemden önce ne biliyor** (maliyet, sonuç, olasılık), **eylemden sonra ne görüyor**,
**eksik olan ne**. Her maddenin sonunda bu oturumda ne yapıldığı yazıyor. Önce/sonra ekran görüntüleri:
`docs/screenshots/sade-once-*.png` ve `sade-sonra-*.png`.

## Genel gözlem (inceleme öncesi)

- Haritada bir kareye tıklamak eylem seçilmemişse **hiçbir şey yapmıyor**. Yeni oyuncu önce aşağıdaki 11 düğmeden
  doğru olanı bulmak, sonra kareye tıklamak zorunda. Kareye bakıp "burada ne yapabilirim?" sorusunun cevabı yok.
- Eylem çubuğunda 11 düğme var; altısı (Toprak al, İnşa et, Üret, Saldır, Gemi seferi, Uçak seferi) aslında bir
  kareye bağlı eylemler.
- Bir eylemden sonra değişen kaynaklar yalnızca üst çubuktaki sayının sessizce değişmesiyle belli oluyor; neyin ne kadar
  değiştiğini görmek için günlüğü okumak gerekiyor.
- Hata mesajları kuralı söylüyor ama ne yapılması gerektiğini söylemiyor ("2 demir + 100 akçe gerekli": kaç demir eksik?).

## Eylem eylem

| Eylem | Önce ne biliyor? | Sonra ne görüyor? | Eksik olan |
|---|---|---|---|
| **Topaç** | Bant "topacı çevir" diyor; sonucun 1–8 × 100 akçe olduğu kurallar ekranında | Topaç animasyonu, "+500 akçe", günlük satırı | Akçenin üst çubukta arttığı fark edilmiyor → **yapıldı:** kaynak değişimleri uçan sayılarla (+500 akçe) |
| **Toprak al** | Düğmenin ipucunda 100 akçe; modda sarı kareler | Kare sahibinin rengine boyanıyor, kısa parlama, ses | Kareye doğrudan tıklayınca bir şey olmuyor; akçe yetmezse "100 akçe gerekli" ama ne kadar eksik bilinmiyor → **yapıldı:** kare menüsünde "Toprak al – 100 akçe", eksikse "Yetersiz akçe: 40 akçe daha lazım" |
| **İnşa (tersane, fabrika, üs)** | Pencerede üç yapı ve fiyatları; sonra yer seçme modu | Yapı ikonu, ses, günlük | İki adım (pencere → kare); tersanenin neden bir karede kurulamadığı yalnızca üzerine gelince görünüyor → **yapıldı:** kendi karende menüde "Tersane kur – 200 akçe"; kıyı değilse soluk ve "Denize kıyısı yok" |
| **Üret (gemi, uçak)** | Bant metninde maliyet ve bakım | Birim sayısı rozeti, ses | Demir yetmezse "2 demir + 100 akçe gerekli" → **yapıldı:** "Yetersiz demir: 1 demir daha lazım"; menüde tersane/fabrika karesinde doğrudan "Gemi üret" |
| **Altın bozdur** | 1 altın = 200 akçe, pencere önizlemesi | Akçe artıyor | Değişim görünmüyor → **yapıldı:** "+400 akçe / −2 altın" uçan sayılar |
| **Saldır (kara)** | Masraf ve "kaybedersen karşı saldırı" bantta; olasılık yok | Savaş katmanı, topaçlar, sonuç | Kazanma olasılığı, kazanınca/kaybedince kaç toprak el değiştireceği savaştan önce bilinmiyor; tek savaş hakkının harcanacağı hatırlatılmıyor → **yapıldı:** savaş önizlemesi (masraf, kazanırsan/kaybedersen, olasılık %44, ortalama toprak) |
| **Başkent / üs savaşı** | Bantta "3 art arda" | Seri göstergesi | 1/8 ve 1/4 olasılık hiçbir yerde yazmıyor → **yapıldı:** önizlemede "1/8 (%12,5)", "kaybedersen toprak kaybın yok" |
| **Gemi / uçak seferi** | Bantta renk anlamları ve masraflar | Birim simgesi rota boyunca gidiyor | Rota ve geçilecek boğazlar/vergiler **önceden** görünmüyor; yalnızca ipucunda toplam vergi → **yapıldı:** hedefin üzerine gelince ya da menüde rota haritada çiziliyor, geçilen boğazlar ve vergileri listeleniyor; saldırıysa önizleme |
| **Fetih (toprak seçme)** | Bant "N tane seç", kırmızı kareler | Kare el değiştiriyor | Yeterli; parlama var → **değişmedi** (parlama artık bütün değişen karelerde) |
| **Karşı saldırı** | Savunan için "Cihazı X'e verin" ekranı | Toprak el değiştiriyor | Saldırana "sana karşı saldırı yapıldı" bilgisi yalnızca savaş katmanında → **yapıldı:** kenar bildirimi |
| **Sana saldırıldığında** | — | Günlükte satır, savaş katmanı (izlerken) | Sırası başkasındayken saldırıya uğradığını kolay kaçırıyorsun → **yapıldı:** kenar bildirimi "Ali sana saldırdı" |
| **Bakım** | Üst çubukta "tur başı bakım" sayısı | Akçe sessizce azalıyor, günlük satırı | Ödendiği an fark edilmiyor → **yapıldı:** kenar bildirimi ve "−200 akçe" |
| **Gelir (madenler)** | — | Kısa bilgi notu (hızlı oynatta yok) | → **yapıldı:** uçan sayılar (+1 demir, +1 petrol) |
| **Diplomasi teklifi** | Pencerede kalemler | Alıcıya soru | Gelen teklif bildirimi geçici; çubukta rozet var → **yapıldı:** kenar bildirimi, rozet korunuyor |
| **Boğaz ayarı** | Panelde izin ve vergi | Günlük satırı | Yeterli → **değişmedi** |
| **Geri al** | İpucunda neyin geri alınamayacağı | "Geri alındı" notu | Yeterli → **değişmedi** |
| **Turu bitir** | — | Sıra geçiyor | Savaş hakkını kullanmayı unutmak kolay → **yapıldı:** kullanılmamış savaş hakkı varsa hafif hatırlatma (ayarlardan kapatılabilir) |
| **Kurulum seçimleri** | Bant ve vurgulu kareler, üzerine gelince neden | Kare boyanıyor | Yeterli → **değişmedi** |

## Sadeleştirme

- **Kare odaklı etkileşim:** eylem aşamasında, mod seçili değilken bir kareye tıklamak (dokunmatikte dokunmak) o
  karede yapılabilecek eylemleri maliyetleriyle gösteren küçük bir menü açar. Yapılamayanlar soluk ve nedenleriyle.
- **Eylem çubuğu** yalnızca kareye bağlı olmayan genel eylemleri gösterir: Diplomasi, Altın bozdur, Boğazlarım,
  Geri al, Turu bitir. Kareye bağlı eylemlerin eski "önce eylem, sonra hedef" akışı bozulmadı: çubuğun başındaki
  **Hedef seç** düğmesi altı modu açar (ayrıca 1–6 tuşları).
- Eylem sonrası: kaynak değişimleri kısa süre uçan sayılarla, değişen kareler kısa parlamayla, önemli olaylar ekranın
  sağ kenarında bildirimlerle gösterilir.

## Ekran görüntüleri

| Önce | Sonra |
|---|---|
| `sade-once-01-topac.png` — topaç aşaması | `sade-sonra-01-topac.png` |
| `sade-once-02-eylem-cubugu.png` — 11 düğmeli eylem çubuğu | `sade-sonra-02-eylem-cubugu.png` — 6 düğme (Hedef seç + genel eylemler); topaçtan gelen akçe uçan sayıyla |
| `sade-once-03-kareye-tiklama.png` — kareye tıklamak bir şey yapmıyor | `sade-sonra-03-kare-menusu.png` — kare menüsü |
| `sade-once-04-saldiri-modu.png` — saldırı modu | `sade-sonra-04-hedef-sec.png` — eski mod akışı "Hedef seç" altında (1–6) |
| `sade-once-05-hata.png` — "Saldırabileceğin komşu düşman toprağı yok" | `sade-sonra-05-eksik-kaynak.png` — tersane menüsünde "Yetersiz demir: 1 demir daha lazım" |
| `sade-once-06-ucak-seferi.png` — rotasız sefer modu | `sade-sonra-06-rota.png` — rota haritada, geçilen boğazlar menüde |
| `sade-once-07-savas.png` — önizlemesiz savaş | `sade-sonra-07-savas-onizleme.png` — masraf, sonuçlar, olasılık |
| — | `sade-sonra-08-geri-bildirim.png` — savaş sonrası uçan sayılar ve kenar bildirimi |
| — | `sade-sonra-09-tur-hatirlatma.png` — kullanılmamış savaş hakkı hatırlatması |
| `sade-once-08-telefon.png` | `sade-sonra-10-telefon.png` — dokununca kare menüsü |
