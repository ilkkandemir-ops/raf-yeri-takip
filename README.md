# 🤖 WhatsApp AI Destek ve Bilgilendirme Chatbotu

WhatsApp üzerinden gelen mesajları otomatik olarak dinleyen, müşterilere/kullanıcılara destek ve bilgi sağlayan, **Google Gemini Yapay Zekâsı** ile güçlendirilmiş tam kapsamlı bir chatbot projesidir.

---

## 🌟 Öne Çıkan Özellikler

- **⚡ Çift Yönlü Depo Sorgulama Motoru:**
  - 🏷️ **`ry [kod/isim]` (Raf Yeri Arama):** Stok kodundan veya parça adından malzemenin hangi rafta olduğunu bulur. (Örn: `ry 1510FY50TF` veya `ry RULMAN`)
  - 📍 **`ri [raf kodu]` (Raf İçeriği Arama):** Belirtilen raf yerinde hangi malzemelerin bulunduğunu listeler. `A1A`, `A-1A`, `A 1 A` gibi tüm esnek yazımları ve `A1` gibi blok öneklerini destekler! (Örn: `ri A1A`, `ri A-1A`, `ri A1`)
- **📱 QR Kod ile Anında Bağlantı:** Telefonunuzdaki WhatsApp'tan "Bağlı Cihazlar" menüsüyle QR kodu okutarak kolayca bağlanın.
- **🧠 Google Gemini Entegrasyonu:** Soru soran kişilere doğal dilde, kibar ve çözüm odaklı kurumsal yanıtlar verir.
- **📚 Canlı Bilgi Bankası (`knowledge/bilgi_bankasi.txt`):** Şirketiniz, çalışma saatleriniz, paketleriniz, fiyatlarınız ve SSS bilgilerinizi buraya yazın; bot sadece sizin belirlediğiniz doğrularla konuşsun.
- **💬 Sohbet Hafızası (Memory):** Kullanıcının önceki mesajlarını hatırlar, kopuk olmayan akıcı bir diyalog yürütür.
- **🖥️ Modern Web Kontrol Paneli (`http://localhost:3000`):**
  - Canlı QR Kod gösterimi ve durum takibi
  - Gelen & Giden canlı WhatsApp mesaj akışı
  - Web üzerinden Bilgi Bankası düzenleme ve anında kaydetme
  - Botu test edebileceğiniz yapay zekâ simülatörü (Sandbox)
  - API Anahtarı ve asistan ayarları yönetimi

---

## 🚀 Hızlı Başlangıç

### 1. Botu Başlatma & Güncelleme
- **Başlatmak İçin:** Proje klasöründeki `baslat.bat` dosyasına çift tıklayın veya terminalden `npm start` çalıştırın.
- **Git'ten Güncellemek İçin:** Farklı kullanıcı veya istemci bilgisayarlarında yeni kodları ve kütüphaneleri tek tıkla çekmek için `guncelle.bat` dosyasına çift tıklayın.

### 2. Web Paneline Giriş
Tarayıcınızdan **[http://localhost:3000](http://localhost:3000)** adresine gidin.

### 3. WhatsApp Hesabınızı Bağlama
1. Telefonunuzda **WhatsApp** uygulamasını açın.
2. **Ayarlar** (veya sağ üstteki üç nokta) > **Bağlı Cihazlar** seçeneğine dokunun.
3. **Cihaz Bağla** butonuna basarak web panelinde veya terminalde çıkan **QR Kodu** kameranızla okutun.
4. Bağlantı tamamlandığında bot otomatik olarak gelen özel mesajları yanıtlamaya başlayacaktır! 🎉

---

## ⚙️ Yapılandırma (`.env`)

| Değişken | Açıklama | Varsayılan |
|---|---|---|
| `GEMINI_API_KEY` | Google Gemini API Anahtarı ([Ücretsiz Alın](https://aistudio.google.com/app/apikey)) | - |
| `GEMINI_MODEL` | Kullanılacak Yapay Zekâ Modeli | `gemini-2.5-flash` |
| `BOT_NAME` | Asistanınızın Adı | `AI Destek Asistanı` |
| `COMPANY_NAME` | Şirket / Kurum Adı | `Teknoloji & Danışmanlık` |
| `PORT` | Web Paneli Portu | `3000` |
| `AUTO_REPLY` | Otomatik Yanıtlama (Açık/Kapalı) | `true` |
| `IGNORE_GROUPS` | Grupları yoksayma (Sadece özel mesajlar) | `true` |
| `REPLY_DELAY_MS` | Yanıt vermeden önceki yazıyor süresi (ms) | `1500` |

---

## 📁 Proje Dizin Yapısı

```
├── knowledge/
│   └── bilgi_bankasi.txt    # Botun referans aldığı destek ve şirket bilgileri
├── public/                  # Web kontrol paneli (HTML, CSS, JS)
│   ├── index.html
│   ├── style.css
│   └── app.js
├── src/
│   ├── ai.js                # Gemini AI & Akıllı kural tabanlı yanıt motoru
│   ├── bot.js               # WhatsApp Baileys istemcisi ve mesaj işleyici
│   ├── server.js            # Express & WebSocket sunucusu
│   └── stockService.js      # Çift yönlü stok (ry) ve raf (ri) arama motoru
├── .env                     # Yapılandırma ayarları
├── .gitignore               # Git çakışmalarını önleyen kurallar
├── baslat.bat               # Tek tıkla başlatıcı
├── guncelle.bat             # Git'ten otomatik güncelleme sihirbazı
└── package.json
```
