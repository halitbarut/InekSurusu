# Çevrimiçi oyun: mimari ve güvenlik

Bu belge çevrimiçi modun nasıl çalıştığını, hangi verinin kime gittiğini ve bilinen kısıtları anlatır.
Kod: `src/net/` (protokol, taşıyıcı, oda sahibi ve katılan tarafı), oyun akışı `src/ui/game/gameScreen.ts`.

## Roller

**Oda sahibi (host)** bir tarayıcı sekmesidir; kendi sunucumuz yoktur. Oda sahibi:

- Oyunun tek gerçek durumunu (`GameState`, RNG durumu dahil) tutar. Bütün kurallar, topaç ve savaş zarları,
  botlar ve geri alma geçmişi yalnızca oda sahibinde çalışır.
- Katılanlardan gelen her eylemi önce biçim denetiminden (`parseAction`), sonra kural denetiminden
  (`validateAction`, kendi durumuna göre) geçirir; geçerliyse uygular ve sonucu yayınlar, değilse nedenini
  yalnızca gönderene döner.
- Kopan oyuncunun yerine bot oynatır, oyunu her tur sonunda kendi tarayıcısına otomatik kaydeder.

**Katılan (client)** davet linkiyle (`?oda=KOD`) bağlanır. Lobide boş bir "davetli" koltuğa oturursa oyuncu,
oturmazsa **izleyici** olur. Katılan yalnızca:

- kendi koltuğu adına eylem *ister* (sonucu oda sahibi belirler),
- kendi turundaki son eylemini geri almayı *ister*,
- lobide adını/rengini değiştirir, koltuğa oturur ya da kalkar.

Katılanın ekranındaki durum yalnızca bir görüntüdür: oda sahibinden gelen her güncelleme onu tamamen
değiştirir. Katılan kendi tarayıcısında durumu değiştirse bile (ör. konsoldan akçesini artırsa) oda sahibi
eylemi kendi durumuna göre doğruladığı için hiçbir etkisi olmaz (`tests/netSecurity.test.ts`).

## Bağlantı

- Taşıyıcı: PeerJS (WebRTC veri kanalı). Oda sahibi `inek-surusu-v1-<KOD>` kimliğiyle PeerJS'in ücretsiz
  eşleşme sunucusuna kaydolur; katılan rastgele bir kimlikle o kimliğe bağlanır. Eşleşme sunucusu yalnızca
  bağlantıyı kurmaya yarar, oyun verisi tarayıcılar arasında doğrudan (ya da STUN/TURN üzerinden) gider.
- Kanal `reliable: true`, `serialization: 'binary'` açılır: büyük mesajlar (tam oyun durumu ~30 KB+) parçalanır.
- Oda mantığı (`HostRoom`, `ClientRoom`) taşıyıcıyı yalnızca `transport.ts` arayüzleriyle görür; testlerde
  bellek içi sahte ağ kullanılır (`tests/netHelpers.ts`).

## Mesaj protokolü

Sürüm `PROTOCOL_VERSION` (`src/net/protocol.ts`), şu an **5**. Katılan ilk mesajında (`hello`) sürümünü
gönderir; farklıysa oda sahibi `refused` ile reddeder ("İki taraf da sayfayı yenilesin").

| Sürüm | Değişiklik |
|---|---|
| 1 | İlk çevrimiçi sürüm |
| 2 | Geri alma isteği (`undo`), güncellemede geri alınabilir eylem sayısı |
| 3 | Oyuncuya özel durum görünümü (gizli teklifler), lobide maskeli katılımcı kimlikleri |
| 4 | Oyun içi sohbet: `key`, `chat`, `keys` mesajları; `welcome`/`start` içinde sohbet geçmişi |
| 5 | Tur süresi: `clock`, `timeout` mesajları; lobide `turnSeconds` |

Katılan → oda sahibi:

| Mesaj | Anlamı |
|---|---|
| `hello {version, clientId, name, color}` | İlk tanışma ve her yeniden bağlanma |
| `profile {name, color}` | Lobide ad/renk değişikliği |
| `claim {seat}` | Lobide koltuğa otur (`null` = kalk, izleyici ol) |
| `action {reqId, action}` | Eylem isteği |
| `undo {reqId}` | Son eylemi geri alma isteği |
| `key {pub}` | Sohbet: özel mesajlar için açık anahtar (her bağlanışta, yalnızca oyuncular) |
| `chat {msg}` | Sohbet mesajı: `{to: null, text}` genel kanal, `{to: koltuk, box}` şifreli özel mesaj |
| `ping` | Canlılık (4 saniyede bir) |

Oda sahibi → katılan:

| Mesaj | Anlamı |
|---|---|
| `welcome {seat, lobby \| state, presence, chat}` | Tanışma yanıtı: lobideyse lobi, oyundaysa güncel durum ve sohbet geçmişi |
| `refused {reason}` | Sürüm farkı ya da geçersiz kimlik |
| `lobby {lobby, seat}` | Lobi değişti |
| `start {state, seat, presence, chat}` | Oyun başladı |
| `update {state, events, reqId?, undo}` | Bir eylem uygulandı (ya da geri alındı); `reqId` yalnızca isteği gönderene |
| `reject {reqId, reason}` | Eylem reddedildi (yalnızca gönderene) |
| `presence {presence}` | Koltukların bağlantı durumu (bağlı / koptu + geri sayım / botta) |
| `notice {text}` | Bilgi notu ("X oyuna geri döndü" …) |
| `closed {reason}` | Oda kapandı |
| `chat {msg}` | Yeni sohbet mesajı (yalnızca görebileceklere) |
| `keys {keys}` | Koltukların sohbet açık anahtarları değişti |
| `clock {clock}` | Tur saati: kimin süresi işliyor, ne kadar kaldı (`null` = kimsenin). Yeni bağlanana da gönderilir |
| `timeout {players}` | Bu oyuncuların süresi doldu (açık pencerelerini kapatırlar) |
| `ping` | Canlılık |

Her `update` tam durumu taşır (fark değil). Bu, kopmalardan sonra tutarsızlığı imkânsız kılar; bedeli
mesaj boyutudur (yerel ağda ve WebRTC'de sorun olmadı).

## Hangi veri kime gider

| Veri | Kime |
|---|---|
| Harita, sahiplik, yapılar, birimler, kaynaklar, ilişkiler (ittifak/barış), boğazlar, istatistikler | Herkese (kâğıt oyundaki gibi açık bilgi) |
| RNG durumu (`rngState`) | **Hiç kimseye** (0 gönderilir): sonraki topaç önceden hesaplanamaz |
| Diplomasi teklifleri (`state.offers`) | Yalnızca teklifin iki tarafına; izleyicilere hiç |
| Günlükteki ve olaylardaki teklif satırları (`offer_made`, `offer_response`, `offer_cancelled`) | Yalnızca teklifin iki tarafına |
| Teklif sonucu (ittifak kuruldu, barış, devredilen toprak ve kaynak) | Herkese: bunlar haritada ve panellerde zaten görünen değişikliklerdir |
| Lobideki koltuk sahibi kimliği (`claimedBy`) | Oda sahibinde gerçek kimlik; katılanlara yalnızca "dolu" |
| Geri alma geçmişi | Hiç kimseye (oda sahibinde kalır), katılana yalnızca kaç eylem geri alınabileceği |
| Genel sohbet mesajları | Herkese (izleyiciler dahil); izleyicinin mesajı "izleyici" olarak işaretlenir |
| Özel sohbet mesajları | Yalnızca iki tarafa, **şifreli**. Oda sahibi taraf değilse yalnızca şifreli metni görür ve aktarır |
| Sohbet açık anahtarları | Herkese (açık anahtar gizli değildir) |

Süzme oda sahibinde, gönderimden önce yapılır (`viewFor`, `eventsFor`): gizli veri hiçbir zaman ağa
çıkmaz; "herkese gönderip arayüzde gizleme" yapılmaz.

## Doğrulama

1. **Biçim** (`parseAction`, `src/engine/actionShape.ts`): bilinmeyen tür, eksik ya da yanlış tipte alan
   (ör. `amount: "5"`, `tile: 2.5`, `accept: "evet"`) reddedilir. Eylem, alanları tek tek okunarak yeni bir
   nesne olarak kurulur; fazladan alanlar (ör. sahte bir topaç sonucu) taşınmaz. Teklif kalem sayısına
   yalnızca teknik bir üst sınır (10 000) vardır.
2. **Koltuk**: eylemin `player` alanı, mesajı gönderen bağlantının koltuğu olmalıdır; izleyiciler ve koltuğu
   botta olanlar eylem gönderemez.
3. **Kural**: oda sahibi eylemi kendi durumuna göre `validateAction` ile denetler; ret nedeni gönderene döner.
4. **Rastgelelik**: topaç ve savaş sonuçlarını yalnızca oda sahibinin RNG'si üretir; katılanın gönderdiği
   hiçbir alan sonucu etkileyemez.
5. Ad (en fazla 16 karakter, denetim karakterleri silinir) ve renk (`#rrggbb`, değilse gri) temizlenir.
   Bozuk mesajlar bağlantıyı düşürmez, sessizce yok sayılır.

## Tur süresi

Tur süresi açıksa saat yalnızca oda sahibinde tutulur (`TurnClock`, `src/ui/game/turnClock.ts`). Etkin bölüm
(kimin süresi işliyor) her değiştiğinde oda sahibi `clock` mesajıyla kalan süreyi gönderir; katılan bunu kendi
saatine göre geri sayar (iki bilgisayarın saat farkı önemli değildir). Süre dolunca oda sahibi `timeout` gönderir ve
otomatik eylemleri (topaç, zorunlu seçimler, tur sonu) oyuncu adına kendisi uygular; bunlar normal güncellemeler
olarak yayınlanır. Katılanın gönderdiği hiçbir şey süreyi değiştiremez.

## Sohbet

- **Genel kanal** düz metindir; oda sahibi mesajı temizler (en fazla 300 karakter, denetim karakterleri silinir),
  gönderenin adını ve koltuğunu kendisi ekler (katılan kendini başkası gibi gösteremez) ve herkese iletir.
- **Özel mesajlar** uçtan uca şifrelidir (`src/net/chat.ts`). Her oyuncunun tarayıcısı (oda sahibi dahil) bir
  ECDH P-256 anahtar çifti üretir ve oda başına saklar; açık anahtarlar oda sahibi üzerinden dağıtılır.
  Gönderen, alıcının açık anahtarıyla ortak bir AES-GCM anahtarı türetip mesajı şifreler. Şifreli gövde
  gönderenin ve alıcının açık anahtarlarını da taşır, böylece iki taraf da (sayfayı yeniledikten sonra bile)
  mesajı açabilir. Oda sahibi bu gövdeyi yalnızca iki tarafa iletir ve geçmişte şifreli hâliyle saklar.
- Yalnızca oyuncular (elenmemiş) özel mesaj gönderebilir; bota (bağlantısı koptuğu için yerine bot oynayan
  insana değil) ve izleyicilere özel mesaj gönderilemez.
- **Geçmiş:** oda sahibi son 400 mesajı bellekte tutar ve yeniden bağlanan katılımcıya, görebildikleriyle
  (genel kanal + kendi özel konuşmaları) birlikte gönderir. Geçmiş kayda girmez; oda sahibi sayfayı yenilerse silinir.
- **Hız sınırı:** bir katılımcı 5 saniyede en fazla 6 mesaj gönderebilir.

## Kimlik ve yeniden bağlanma

- Katılan, her oda kodu için tarayıcısında rastgele 128 bitlik bir kimlik saklar (`localStorage`,
  `inek-surusu-client-<KOD>`). Bu kimlik koltuğun "anahtarıdır": aynı kimlikle gelen bağlantı koltuğu devralır.
  Bu yüzden kimlik başka katılımcılara hiç gönderilmez (önceki sürümde lobi mesajında görünüyordu).
- Bağlantı 12 saniye sessiz kalırsa kopmuş sayılır. Katılan 3 saniyede bir yeniden bağlanmayı dener.
- Oyunda kopan oyuncu için 60 saniye beklenir (herkes geri sayımı görür); dönmezse koltuğunda bot oynar.
  Oyuncu aynı tarayıcıdan döndüğünde koltuğu hemen insana geçer ve güncel durumu (`welcome`) alır.
- Oyun başladıktan sonra gelen yeni katılımcılar izleyici olur.
- Bu tarayıcı odaya daha önce katıldıysa davet linki yeniden açıldığında (ör. sayfa yenilenince) ad sorulmadan
  kendiliğinden bağlanılır.

## Bilinen kısıtlar

- **Oda sahibi hilesine karşı koruma yoktur.** Kurallar ve zarlar oda sahibinin tarayıcısında çalıştığı için
  oda sahibi kodu değiştirirse sonuçları etkileyebilir. Arkadaşlar arası oyun için kabul edilen bir varsayımdır
  (ASSUMPTIONS #38).
- **Oda sahibi çıkarsa oyun durur.** Katılanlara "oda kapandı" bildirilir; oyun oda sahibinin otomatik
  kaydından yerel oyun olarak sürdürülebilir.
- **Kısıtlı ağlar:** WebRTC doğrudan bağlantısı bazı kurumsal ağlarda, sıkı güvenlik duvarlarında, bazı mobil
  operatörlerde (simetrik NAT) ya da VPN'lerde kurulamayabilir. PeerJS'in varsayılan STUN sunucusu kullanılır,
  TURN (aktarıcı) sunucusu yoktur. Bu durumda "Oda bulunamadı ya da oda sahibine ulaşılamadı" hatası alınır;
  başka bir ağ (ör. telefonun hotspot'u) genellikle çözer.
- **Eşleşme sunucusu:** PeerJS'in ücretsiz bulut sunucusu (`0.peerjs.com`) erişilemezse oda kurulamaz ve
  katılınamaz. Kurulmuş bağlantılar sunucu düşse de sürer.
- **Sohbet şifrelemesi oda sahibine karşı tam koruma değildir:** açık anahtarları oda sahibi dağıttığı için,
  kodu değiştirilmiş bir oda sahibi araya girip (kendi anahtarını vererek) özel mesajları okuyabilir. Değiştirilmemiş
  oyunda oda sahibi özel mesajları hiçbir zaman çözmez ve ekranında göstermez.
- **Özel mesaj güvenli bağlam ister:** tarayıcıların şifreleme arayüzü (`crypto.subtle`) yalnızca `https://` ya da
  `localhost` üzerinde çalışır. Oyun yerel ağda `http://192.168…` adresinden açılırsa genel kanal çalışır, özel
  mesaj kapalı olur (nedeni sohbet panelinde yazar).
- **Teklif sayacı:** `nextOfferId` herkese gider; bir oyuncu teklif kimliklerindeki artıştan *başkaları
  arasında* teklif yapıldığını sezebilir (içeriğini değil).
- Aynı tarayıcının iki sekmesi aynı odaya aynı kimlikle bağlanır ve birbirini düşürür; ikinci bir katılımcı
  için başka bir tarayıcı ya da gizli pencere gerekir.
- Her güncelleme tam durumu taşıdığı için çok büyük haritalarda (90×90) mesajlar büyür.

## Dağıtım

`vite.config.ts` içinde `base: './'`: derleme çıktısındaki bütün yollar görelidir, oyun bir alt klasörden
(ör. GitHub Pages'te `/<depo>/`) sunulabilir. Davet linki `location.origin + location.pathname + ?oda=KOD`
olarak kurulduğu için alt klasörde de doğru linki verir.
