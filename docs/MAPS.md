# Hazır haritalar

Oyunla birlikte dört harita gelir (`src/maps/builtin.ts`). Yeni oyun ekranında **Hazır haritalar** altında küçük
önizlemeleri, önerilen oyuncu sayıları ve açıklamalarıyla seçilir; harita editöründe listelenir, silinemez, kopyası
açılıp düzenlenebilir. Haritalar `scripts/maps/` altındaki şekil tariflerinden üretilir:

```bash
npx tsx scripts/maps/build.ts        # src/maps/builtin.ts dosyasını yeniden üretir ve denetim özetini yazar
npx tsx scripts/maps/playtest.ts 4   # her haritada önerilen en az ve en çok oyuncuyla 4'er bot oyunu
```

| Harita | Boyut | Oyuncu | Kara | Boğaz | Göl | Fikir |
|---|---|---|---|---|---|---|
| Anadolu ve Balkanlar | 64×40 | 5–7 | %56 | 3 (İstanbul, Çanakkale, Kerç) | 3 (Tuz, Van, Ohri) | Karadeniz yalnızca İstanbul Boğazı–Marmara–Çanakkale üzerinden Ege'ye açılır; Azak Denizi Kerç'ten. Ege adaları, Girit, Kıbrıs. |
| Takımadalar | 46×32 | 3–4 | %30 | 1 (atolün lagünü) | 4 | Ev adalarında gemi için demir ve petrol; altın ve çelik ortadaki atolde ve orta adalarda. Gemisiz büyüyemezsin. |
| Büyük kıta | 70×46 | 8 | %53 | 2 | 5 | Güneyde boğazla okyanusa açılan iç deniz, doğuda kapalı iç deniz (oradaki tersane yalnızca orada yüzer), kuzeyde boğazlı koy. |
| İkiz kıtalar | 58×36 | 4–6 | %49 | 4 | 4 | İki kıtayı ayıran kanal kuzey ve güney okyanuslarını yalnızca iki dar boğazla bağlar; yakaları iki ayrı kıtadadır. Her kıtada boğazla açılan bir körfez. |

## Doğrulama

- Dördü de editörün doğrulamasından hatasız geçer ve varsayılan kurallarla (madensiz başkent + 9 bitişik toprak,
  başkentler arası 5 kare) en az önerilen en kalabalık oyuncu sayısına başlangıç alanı ayrılabilir
  (`tests/builtinMaps.test.ts`).
- Anadolu'da İstanbul ve Çanakkale boğazlarının yeri, İkiz kıtalar'da kanal boğazlarının yakalarının iki ayrı
  kıtada olması test edilir.
- Takımadalar'daki "madenler dengesiz dağılmış olabilir" uyarısı bilerektir (altın ve çelik ortada).

## Bot oyunları

Her harita, önerilen en az ve en çok oyuncu sayısıyla dörder kez oynatıldı (koltuklarda sırayla Orta, Zor, Kolay
botlar; varsayılan Dengeli kurallar; 200 tur sınırı). Bütün oyunlar takılmadan ilerledi; boğazlar el değiştirdi,
Takımadalar'da gemi seferleri genişlemenin ana yolu oldu.

### Anadolu ve Balkanlar — 5 bot
- 113. tur, ittifak · 154 savaş · 3 başkent düştü (ilki 82. tur) · 51 gemi / 5 uçak seferi · idare edilen boğaz 3/3
- 92. tur, ittifak · 102 savaş · 2 başkent düştü (ilki 84. tur) · 30 gemi / 2 uçak seferi · idare edilen boğaz 1/3
- 125. tur, ittifak · 125 savaş · 3 başkent düştü (ilki 31. tur) · 21 gemi / 3 uçak seferi · idare edilen boğaz 3/3
- 125. tur, ittifak · 115 savaş · 3 başkent düştü (ilki 19. tur) · 20 gemi / 17 uçak seferi · idare edilen boğaz 3/3

### Anadolu ve Balkanlar — 7 bot
- 200 turda bitmedi · 425 savaş · 4 başkent düştü (ilki 51. tur) · 37 gemi / 16 uçak seferi · idare edilen boğaz 1/3
- 101. tur, ittifak · 277 savaş · 2 başkent düştü (ilki 62. tur) · 74 gemi / 39 uçak seferi · idare edilen boğaz 0/3
- 200 turda bitmedi · 294 savaş · 4 başkent düştü (ilki 31. tur) · 35 gemi / 14 uçak seferi · idare edilen boğaz 3/3
- 66. tur, ittifak · 94 savaş · 4 başkent düştü (ilki 41. tur) · 31 gemi / 16 uçak seferi · idare edilen boğaz 0/3

### Takımadalar — 3 bot
- 80. tur, tek devlet · 84 savaş · 2 başkent düştü (ilki 45. tur) · 29 gemi / 0 uçak seferi · idare edilen boğaz 1/1
- 200 turda bitmedi · 230 savaş · 1 başkent düştü (ilki 43. tur) · 25 gemi / 0 uçak seferi · idare edilen boğaz 0/1
- 142. tur, tek devlet · 187 savaş · 2 başkent düştü (ilki 60. tur) · 36 gemi / 1 uçak seferi · idare edilen boğaz 1/1
- 58. tur, ittifak · 58 savaş · 1 başkent düştü (ilki 58. tur) · 26 gemi / 1 uçak seferi · idare edilen boğaz 0/1

### Takımadalar — 4 bot
- 200 turda bitmedi · 314 savaş · 2 başkent düştü (ilki 34. tur) · 46 gemi / 0 uçak seferi · idare edilen boğaz 1/1
- 163. tur, tek devlet · 439 savaş · 3 başkent düştü (ilki 151. tur) · 112 gemi / 3 uçak seferi · idare edilen boğaz 1/1
- 101. tur, ittifak · 140 savaş · 2 başkent düştü (ilki 41. tur) · 60 gemi / 0 uçak seferi · idare edilen boğaz 0/1
- 94. tur, ittifak · 215 savaş · 1 başkent düştü (ilki 94. tur) · 97 gemi / 2 uçak seferi · idare edilen boğaz 0/1

### Büyük kıta — 8 bot
- 74. tur, ittifak · 147 savaş · 2 başkent düştü (ilki 53. tur) · 20 gemi / 27 uçak seferi · idare edilen boğaz 2/2
- 200 turda bitmedi · 205 savaş · 4 başkent düştü (ilki 53. tur) · 16 gemi / 15 uçak seferi · idare edilen boğaz 1/2
- 200 turda bitmedi · 284 savaş · 3 başkent düştü (ilki 65. tur) · 44 gemi / 37 uçak seferi · idare edilen boğaz 2/2
- 96. tur, ittifak · 178 savaş · 2 başkent düştü (ilki 33. tur) · 8 gemi / 65 uçak seferi · idare edilen boğaz 0/2

### İkiz kıtalar — 4 bot
- 17. tur, ittifak · 9 savaş · 2 başkent düştü (ilki 12. tur) · 1 gemi / 1 uçak seferi · idare edilen boğaz 0/4
- 80. tur, ittifak · 31 savaş · 2 başkent düştü (ilki 12. tur) · 4 gemi / 1 uçak seferi · idare edilen boğaz 1/4
- 108. tur, tek devlet · 162 savaş · 3 başkent düştü (ilki 100. tur) · 24 gemi / 12 uçak seferi · idare edilen boğaz 4/4
- 70. tur, ittifak · 39 savaş · 1 başkent düştü (ilki 70. tur) · 4 gemi / 17 uçak seferi · idare edilen boğaz 0/4

### İkiz kıtalar — 6 bot
- 155. tur, tek devlet · 286 savaş · 5 başkent düştü (ilki 33. tur) · 9 gemi / 17 uçak seferi · idare edilen boğaz 4/4
- 200 turda bitmedi · 263 savaş · 1 başkent düştü (ilki 55. tur) · 24 gemi / 28 uçak seferi · idare edilen boğaz 2/4
- 89. tur, tek devlet · 144 savaş · 5 başkent düştü (ilki 17. tur) · 9 gemi / 30 uçak seferi · idare edilen boğaz 4/4
- 200 turda bitmedi · 376 savaş · 4 başkent düştü (ilki 56. tur) · 29 gemi / 28 uçak seferi · idare edilen boğaz 4/4

Gözlemler:

- Haritalar rastgele haritalardan büyük olduğu için oyunlar rastgele haritalardaki oyunlardan biraz uzun sürüyor;
  bazıları 200 tura kadar bitmedi. Daha kısa oyun isteyenler "Hızlı" önayarını seçebilir.
- İkiz kıtalar 4 oyuncuyla her kıtada iki komşu devlet bırakır; erken başkent savaşları görülebilir (ilk düşüş 12. tur).
