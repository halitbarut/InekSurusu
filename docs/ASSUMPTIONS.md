# Varsayımlar

Görev metninde açık olmayan noktalarda verilen kararlar. Sayısal olanların çoğu
`src/engine/config.ts` içinden ya da "Yeni oyun → Kural ayarları" ekranından değiştirilebilir.

## Kurulum

1. **Seçim sırası:** Önce tüm oyuncular sırayla başkentini seçer. Ardından her oyuncu kendi
   sırasında 9 toprağının hepsini art arda seçer (hot-seat'te cihazın her karede el değiştirmemesi için).
2. **Başkent yeri:** Sahipsiz, madensiz kara karesi olmalı. Ek olarak diğer başkentlere en az
   5 kare (Chebyshev, `minCapitalDistance`) uzakta olmalı ve çevresinde 10 karelik boş kara
   bulunmalı. Haritada bu mesafe kuralına uyan yer kalmazsa kural kendiliğinden gevşer.
3. Seçilecek komşu kare kalmayan oyuncunun başlangıç seçimi kendiliğinden biter; oyuncu
   "Seçimi bitir" ile erken de bitirebilir.

## Tur ve kaynaklar

4. Gelir (madenler) turun başında topaçtan önce gelir.
5. Altın bozdurma topaç, eylem ve fetih aşamalarının hepsinde yapılabilir.
6. "Tur" = yaşayan tüm oyuncuların bir kez oynaması. Barış süreleri bu tam turlarla sayılır.

## Savaş

7. **Savunanın topacı** da aynı tohumlu RNG ile motor tarafından çevrilir; savunandan tıklama
   beklenmez (hot-seat akışını kesmemek için). Ekranda iki topaç yan yana döner.
8. **Kara savaşında alınacak topraklar:** Saldıran, savunanın o anda kendi toprağına komşu olan
   herhangi bir sıradan toprağını seçebilir; seçim saldırılan kareyle sınırlı değildir. Saldırılan
   kare yalnızca savaş türünü belirler (başkent → başkent savaşı, üs → üs savaşı, diğerleri → kara savaşı).
9. **Seferle savaş:** Seçilebilecek kareler hedef kare ve onun 4 komşusudur (savunana ait,
   başkent/üs olmayan). Bunlardan maden olanlar ancak saldıranın bir toprağına komşuysa seçilebilir;
   yani önce hedef kare alınır, sonra yanındaki maden normal sınır kuralıyla alınabilir.
10. Başarısız saldırının (başkent ve üs savaşları dahil) bir bedeli yoktur. Saldırılar ücretsiz ve
    varsayılan olarak sınırsızdır; `maxAttacksPerTurn` ile sınırlanabilir. Orta seviye bot kendine
    tur başına en fazla 4 kara saldırısı, 2 başkent ve 1 üs denemesi sınırı koyar.
11. Başkent savaşında saldıran kazanırsa savunan elenir: tüm toprakları, yapıları, birimleri,
    kaynakları ve akçesi kazanana geçer; bekleyen teklifleri silinir, ilişkileri sıfırlanır,
    eski başkenti sıradan toprak olur.

## Gemi ve uçak

12. Seferler tur başına sınırsızdır, yalnızca petrol sınırlar (`maxSortiesPerUnitPerTurn` ile sınırlanabilir).
13. Sefer sonrası gemi tersanesine, uçak fabrikasına döner. Tersane/fabrika ele geçirilirse
    orada konuşlu birimler de geçer.
14. **Gemi rotası** tersanenin komşu deniz karelerinden başlar ve yalnızca deniz karelerinden geçer
    (göller hariç). Hedef, denize (göle değil) komşu bir kara karesidir. İç denize açılan bir tersane
    yalnızca o iç denize ve boğazlarla bağlı denizlere ulaşır.
15. Sefer hedefi kendi toprağı, müttefik ya da barış yapılan oyuncunun toprağı olamaz.
16. **Uçak rotası** 8 yönlüdür (çapraz geçebilir). Engel alanı varsayılan Chebyshev yarıçapı 3'tür
    (`baseBlockRadius`, `baseBlockMetric`). Fabrikası engel alanında kalan uçak kalkamaz. Askeri üs
    kendi engel alanının içinde olduğu için üslere uçakla saldırılamaz (gemi ya da karadan saldırılır).
17. Müttefik olmayan herkesin (barış yapılanlar dahil) askeri üssü uçakları engeller.

## Harita ve boğazlar

18. Harita kenarları okyanustur; kara oranı yaklaşık %50'dir. Her harita en az 3 boğaz ve en az
    1 göl içerir; sağlanamazsa tohumdan türetilen yeni denemeler yapılır (aynı seed hep aynı haritayı verir).
19. **Göl:** Haritanın kenarına değmeyen, en fazla 14 karelik kapalı su kütlesi. Daha büyük kapalı sular
    iç denizdir.
20. **Boğaz:** 1 kare genişliğinde, en fazla 4 kare uzunluğunda, iki yanında kara bulunan deniz geçidi.
    Geçit kapatılınca iki ucu arasında 30 adımdan kısa bir su yolu kalmamalı ve her iki uç da en az
    10 karelik bir su kütlesine açılmalıdır. **Yakalar**, geçidin iki yanındaki kara karelerinin hepsidir;
    hepsine sahip olan oyuncu boğazı idare eder.
21. Vergi, rota boğaza her girdiğinde bir kez alınır. Birden çok rota varsa önce en ucuzu, sonra en kısası
    seçilir. Vergi idare eden oyuncuya ödenir.
22. Boğaz ayarlarını idare eden oyuncu her an değiştirebilir (motor buna izin verir; arayüzde kendi
    turunda "Boğazlarım" panelinden).
23. Madenler oyuncu başına her türden 3 adettir (`minesPerTypePerPlayer`) ve mümkünse birbirine komşu
    olmayacak şekilde dağıtılır. Yapılar maden karelerine de kurulabilir.

## Diplomasi ve kazanma

24. İttifaklar ikilidir. "Kalan tüm devletler aynı ittifakta" = kalanların her ikisi birbirinin müttefiki.
25. Barış N tur: kabul edildiği turdan itibaren `tur + N` numaralı turun sonuna kadar sürer, bozulamaz.
    Var olan barış uzatılabilir.
26. İttifak yalnızca kendi turunda bozulabilir. Bozulduğu oyuncu turu boyunca iki taraf birbirine
    saldıramaz; sonraki turlardan itibaren saldırı serbesttir.
27. Teklif yalnızca kendi turunda yapılır, yanıt her zaman verilebilir. Geçerlilik kabul anında yeniden
    kontrol edilir; kaynak/toprak artık yoksa teklif düşer. Teklifler süresiz bekler, gönderen geri çekebilir.
28. Toprak devrinde başkent devredilemez; yapı ve birimler toprakla birlikte geçer.
29. "Boğaz geçiş izni / vergi muafiyeti" kalemi, veren tarafın idaresindeki boğazda alan tarafa
    "geçiş açık + belirtilen vergi (0 = muafiyet)" ayarını uygular.
30. Zafer oylamasını kalan herkes müttefikken herhangi biri kendi turunda başlatabilir; öneren
    otomatik "evet" sayılır, tek bir "hayır" oylamayı düşürür.
31. Hot-seat'te bilgiler gizli değildir: herkesin kaynakları kâğıt oyundaki gibi görünür.
32. Arayüzde insan → insan teklifinde cihaz hemen alıcıya geçer; bot → insan teklifleri insanın kendi
    turunda Diplomasi panelinde yanıtlanır. Botlar kendilerine gelen teklifleri anında yanıtlar.
