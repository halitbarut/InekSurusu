# Arayüz incelemesi

Bu oturumdaki ikon ve cila çalışmasından önce arayüz tarayıcıda baştan sona gezildi (1440×900 masaüstü ve
390×844 telefon). Ekran görüntüleri: `docs/screenshots/before-*.png` (önce) ve `after-*.png` (sonra).
Her maddenin sonunda durumu yazıyor.

## Görsel dil

1. **Her yer emoji.** Kaynaklar, yapılar, eylemler, günlük satırları ve menüler emoji kullanıyor. Emojiler işletim
   sistemine göre farklı çiziliyor (Windows, Android ve Linux'ta başka başka), defter temasıyla uyuşmuyor ve
   küçük boyutta (haritadaki yapılar, oyuncu satırındaki 🟩 🪙 🚢) okunmuyor. → **Düzeltildi:** kendi SVG ikon seti
   (`src/ui/icons.ts`), haritada da aynı ikonlar.
2. **Harita sembolleri karışık:** madenler harfli daire (A, P, D, Ç), yapılar emoji, birim sayısı küçük siyah daire.
   Üç ayrı dil var. → **Düzeltildi:** madenler renkli daire içinde ikon, yapılar ikon, birim sayısı rozeti aynı stilde.
3. **Logo ve ana menü** üç 🐄 emojisinden oluşuyor. → **Düzeltildi:** çizgi inek motifi.

## Kalabalık ekranlar

4. **Üst çubuk kalabalık ve etiketsiz:** beş kaynak, gemi, uçak, toprak ve "Tur başı bakım" tek satırda yalnızca
   emoji + sayı olarak duruyor; hangi sayının ne olduğu yalnızca fareyle anlaşılıyor. → **Düzeltildi:** ikon + sayı,
   gruplar arasında ayraç, kısa etiketli ipucu; bakım ve seed ikinci plana alındı.
5. **Yeni oyun ekranı**: 33 sayısal ayar alt alta. → **1. görevde düzeltildi** (önayarlar + katlanır gruplar).
6. **Diplomasi penceresi**: ilişki sütunu boşken "—" yazıyor, ne anlama geldiği belli değil; gelen/giden
   teklif başlıkları boşken de yer kaplıyor. → **Düzeltildi:** "İlişki yok" yazıyor, ilişkiler ikonla.
7. **Telefonda üst çubuk 3 satıra taşıyor** ve harita alanını daraltıyor; tur numarası dar ekranda tamamen
   gizleniyor. → **Düzeltildi:** tur numarası aşama göstergesine taşındı, kaynaklar tek satırda kaydırılabilir.

## Belirsiz düğmeler

8. **Eylem çubuğunda yapılamayan eylemler etkin görünüyor.** Gemi seferi (hazır gemi yokken), Üret (tersane
   yokken), Toprak al (akçe yetmezken) tıklanabiliyor; neden yapılamadığı ancak tıkladıktan sonra şeritte
   yazıyor. Yalnızca "Saldır" kilitli görünüyordu. → **Düzeltildi:** her düğme kendi durumunu hesaplar; yapılamıyorsa
   soluk görünür ve ipucunda nedeni yazar.
9. **İpuçları yalnızca tarayıcının `title` balonu:** geç açılıyor, devre dışı düğmede hiç açılmıyor, dokunmatikte
   yok. → **Düzeltildi:** her düğmenin adı, açıklaması ve (varsa) engel nedeni olan kendi ipucu kutusu; klavye
   odağında da açılır.
10. **💾 ve ☰ düğmeleri yalnızca simge**, ikisi de ne yaptığını söylemiyor; logo da aynı menüyü açıyor.
    → **Düzeltildi:** ikon + ipucu; logo menü yerine ana menüye dönüş seçeneğini gösteren aynı menüyü açar (tek giriş).
11. **"⚡ Hızlı oynat"** bir onay kutusu; ne yaptığı belli değil. → **Düzeltildi:** ipucunda "Botların hamlelerini
    animasyonsuz oynat" açıklaması.

## Küçük tıklama alanları ve okunabilirlik

12. Pencere kapatma "✕" düğmesi ~24 px, yakınlaştırma düğmeleri 36×28 px. → **Düzeltildi:** en az 36×36 px.
13. Oyuncu satırındaki istatistikler 0,82 em (~14 px) ve emoji arası boşluksuz; günlük 0,86 em.
    → **Düzeltildi:** 15 px, ikonlu ve aralıklı.
14. Haritadaki maden harfleri 7 px'e kadar küçülüyor. → **Düzeltildi:** ikonlar küçük yakınlaştırmada sade daireye döner.

## Tutarsız boşluk ve renkler

15. Pencere başlıkları üç ayrı stilde: modal (30 px, 10/16 px dolgu), topaç/savaş katmanı (30 px, 18/26 px),
    sıra geçiş ekranı (54 px, oyuncu renginde tam ekran). Zafer ekranı da ayrı. → **Düzeltildi:** tek "kart"
    bileşeni: aynı başlık (ikon + başlık), aynı dolgu, aynı düğme sırası (ikincil solda, birincil sağda).
16. Düğme kenar yuvarlakları ve dolgular dosya dosya farklı (`.btn`, `.action-btn`, `.choice`, `.preset-card`).
    → **Düzeltildi:** ortak boşluk ölçüleri (`--space-*`) ve yarıçap değişkenleri.
17. Kırmızı hem "tehlike/hata" hem 1. oyuncunun rengi; yeşil hem "başarılı" hem 3. oyuncu.
    → **Düzeltildi:** oyuncu paleti durum renklerinden ayrıldı.

## Renk körlüğü

18. **Oyuncu renkleri** (kırmızı, mavi, yeşil, turuncu, mor, pembe, kahve, camgöbeği) kırmızı-yeşil renk
    körlüğünde ayrışmıyor: doğrulayıcıyla turuncu↔yeşil ΔE 4,7 (protan), kahverengi gri gibi okunuyor.
    → **Düzeltildi:** yeni palet; ilk 6 renk tüm çiftlerde renk körlüğü simülasyonunda ΔE ≥ 10, normal görüşte ≥ 16.
19. **Haritada oyuncular yalnızca renkle ayrılıyor** (herkesin taraması aynı). → **Düzeltildi:** her oyuncunun kendi
    tarama deseni (eğik, ters eğik, yatay, dikey, kareli, noktalı…), oyuncu listesinde de aynı desen örneği.
20. Grafiklerde (yeni oyun sonu özeti) oyuncular renk + çizgi deseniyle ayrılıyor.

## Kullanıcı bir sonraki adımda ne yapacağını anlıyor mu?

21. **Aşama belirsiz:** "Topaç aşaması" yazısı oyuncu adının altında 14 px gri; topaç beklenirken eylem
    çubuğu tamamen soluk ama nedeni yazmıyor. → **Düzeltildi:** üst çubukta adım göstergesi
    (Bakım → Topaç → Eylemler), etkin adım vurgulu; çubuk düğmeleri "Önce topacı çevir" ipucunu verir.
22. **Aktif oyuncu** yalnızca 26 px renkli daire ile gösteriliyor. → **Düzeltildi:** oyuncu rengiyle
    çerçevelenmiş ad kartı ve desen; bot/insan ikonu.
23. Bilgi şeridi (bant) haritanın üstünü örtüyor, uzun metinler 2–3 satıra çıkıyor. → **Kısmen:** metinler
    kısaltıldı, ikonla başlıyor; konumu korundu (harita kaydırılabildiği için engel değil).
24. Hover ipucu dokunmatik ekranda açılmıyor; haritada kareye dokunmak doğrudan eylem yapıyor.
    → **Değişmedi:** dar ekranda bant metni ve devre dışı düğme ipuçları yeterli bilgi veriyor; dokunmatik
    için "önce göster sonra onayla" akışı ayrı bir iş (karar bekliyor).
