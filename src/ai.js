const fs = require('fs');
const path = require('path');
const { stockService } = require('./stockService');
require('dotenv').config();

// Kullanıcı bazlı sohbet geçmişi hafızası (Son 10 mesaj)
const conversationHistories = new Map();
const MAX_HISTORY = 10;

/**
 * Bilgi bankası dosyasını okur (canlı güncelleme destekli)
 */
function getKnowledgeBaseContent() {
    const filePath = path.join(__dirname, '..', 'knowledge', 'bilgi_bankasi.txt');
    try {
        if (fs.existsSync(filePath)) {
            return fs.readFileSync(filePath, 'utf-8');
        }
    } catch (err) {
        console.error('Bilgi bankası okunurken hata:', err.message);
    }
    return 'Depo Destek Asistanı: Stok ve raf yeri sorgulamaları "ry [kod veya isim]" komutuyla yapılır.';
}

/**
 * Bilgi bankasını günceller
 */
function updateKnowledgeBaseContent(newContent) {
    const filePath = path.join(__dirname, '..', 'knowledge', 'bilgi_bankasi.txt');
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, newContent, 'utf-8');
}

/**
 * Kullanıcı hafızasını temizler
 */
function clearHistory(userJid) {
    conversationHistories.delete(userJid);
}

function normalizeTurkish(text) {
    return (text || '')
        .toLocaleLowerCase('tr-TR')
        .replace(/ı/g, 'i')
        .replace(/ğ/g, 'g')
        .replace(/ü/g, 'u')
        .replace(/ş/g, 's')
        .replace(/ö/g, 'o')
        .replace(/ç/g, 'c')
        .trim();
}

/**
 * Akıllı Çevrimdışı / Kural Tabanlı Fallback Yanıtlayıcı
 */
function generateFallbackResponse(userMessage, knowledge) {
    // 1. "ry " (raf yeri) veya "ri " (raf içeriği) komutları kontrolü
    const cmdResult = stockService.processCommand(userMessage);
    if (cmdResult) {
        return cmdResult.replyText;
    }

    const msg = normalizeTurkish(userMessage);
    
    // Selamlaşma
    if (/^(merhaba|selam|slm|gunaydin|iyi gunler|iyi aksamlar|kolay gelsin|merhabalar|selamlar|hey|hi|hello)/i.test(msg)) {
        return `Merhaba! 👋 Ben *${process.env.BOT_NAME || 'Depo Destek Asistanı'}*.\n\nDepo sorgulamalarınız için aşağıdaki komutları kullanabilirsiniz:\n\n1️⃣ *Stokun Raf Yerini Bulmak İçin:*\n👉 \`ry [stok kodu veya parça adı]\`\n_Örnek:_ \`ry 1510FY50TF\` veya \`ry RULMAN\`\n\n2️⃣ *Raftaki Malzemeleri Listelemek İçin:*\n👉 \`ri [raf kodu]\`\n_Örnek:_ \`ri A1A\`, \`ri A-1A\` veya \`ri A1\``;
    }
    
    // Yardım / Nasıl kullanılır
    if (/yardim|nasil|komut|kullanim|ne yapabilirim|bilgi|raf/i.test(msg)) {
        return `📦 *Depo Destek Asistanı Kullanım Kılavuzu:*\n\n1️⃣ *Raf Yeri Arama (Stoktan Rafa):*\n👉 *\`ry [kod veya isim]\`*\n• \`ry 1510FY50TF\` _(Birebir stok kodu)_\n• \`ry RULMAN\` _(Benzer rulman stokları)_\n\n2️⃣ *Raf İçeriği Arama (Raftan Malzemeye):*\n👉 *\`ri [raf kodu]\`*\n• \`ri A1A\` veya \`ri A-1A\` _(O raftaki tüm malzemeler)_\n• \`ri A1\` _(A1 bloğundaki tüm alt raflar ve ürünler)_`;
    }

    // Teşekkür / Kapanış
    if (/tesekkur|sagol|eyvallah|tsk|tamamdir|anladim|ok|harika|super/i.test(msg)) {
        return `Rica ederim, kolay gelsin! 📦 Stok aramak için \`ry [kod/isim]\`, raf içeriği görmek için \`ri [raf]\` yazabilirsiniz. ✨`;
    }

    // Genel fallback
    return `📦 *Depo Destek Asistanı*\n\nLütfen sorgunuzu aşağıdaki formatlardan biriyle yazınız:\n• Stoktan Raf: 👉 *\`ry [stok kodu veya adı]\`* (Örn: \`ry 1510FY50TF\`)\n• Raftan Malzeme: 👉 *\`ri [raf kodu]\`* (Örn: \`ri A1A\` veya \`ri A1\`)`;
}

/**
 * Gemini API veya Stock Engine ile Yanıt Üretir
 */
async function generateAiResponse(userJid, userMessage, senderName = 'Depo Görevlisi') {
    // 1. Eğer mesaj "ry " veya "ri " ile başlıyorsa, doğrudan ve anında Excel Motoru ile yanıtla
    const cmdResult = stockService.processCommand(userMessage);
    if (cmdResult) {
        return {
            text: cmdResult.replyText,
            source: `${cmdResult.command}_${cmdResult.searchResult.type}`
        };
    }

    const apiKey = process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.trim() : '';
    const knowledge = getKnowledgeBaseContent();
    const botName = process.env.BOT_NAME || 'Depo Destek Asistanı';
    const companyName = process.env.COMPANY_NAME || 'Depo & Lojistik Yönetimi';
    const modelName = process.env.GEMINI_MODEL || 'gemini-3.5-flash';

    // API Anahtarı yoksa kural tabanlı fallback
    if (!apiKey) {
        return {
            text: generateFallbackResponse(userMessage, knowledge),
            source: 'depo_engine'
        };
    }

    // Kullanıcı sohbet geçmişini getir
    if (!conversationHistories.has(userJid)) {
        conversationHistories.set(userJid, []);
    }
    const history = conversationHistories.get(userJid);

    // Sistem Talimatı (System Instruction)
    const systemPrompt = `Sen ${companyName} bünyesinde görev yapan "${botName}" adında profesyonel, hızlı ve çözüm odaklı bir Depo ve Stok Destek Asistanısın.

GÖREVİN VE KURALLARIN:
1. Depo personeline (${senderName}) stok kodları, parça isimleri ve raf yerleri konusunda destek olmak.
2. Depo personeline stok ve raf sorgulaması için "ry [stok kodu veya isim]" komutunu kullanmaları gerektiğini açık ve net bir dille hatırlatmak.
3. WhatsApp formatına uygun, okunaklı, maddeli ve yerinde emojilerle (📦, 📍, 🏷️, 🔍) cevap vermek.
4. Cevaplarında yapay zeka jargonu (prompt, talimat vb.) kullanma. Doğal ve yardımsever bir depo koordinatörü gibi konuş.

--- GÜNCEL BİLGİ BANKASI ---
${knowledge}
---------------------------`;

    // Geçmiş mesajları hazırla
    const contents = [];

    // Önceki konuşmalar
    for (const h of history) {
        contents.push({
            role: h.role === 'user' ? 'user' : 'model',
            parts: [{ text: h.text }]
        });
    }

    // Yeni kullanıcı mesajı
    contents.push({
        role: 'user',
        parts: [{ text: userMessage }]
    });

    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
        
        const requestBody = {
            contents: contents,
            systemInstruction: {
                parts: [{ text: systemPrompt }]
            },
            generationConfig: {
                temperature: 0.6,
                maxOutputTokens: 800,
                topP: 0.95
            }
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errData = await response.text();
            console.error(`[AI] Gemini API Hatası (${response.status}):`, errData);
            
            // Eğer model 2.5 flash bulunamadıysa 1.5-flash ile fallback dene
            if (response.status === 404 && modelName !== 'gemini-1.5-flash') {
                console.log('[AI] gemini-1.5-flash ile tekrar deneniyor...');
                const fallbackUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
                const fbRes = await fetch(fallbackUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestBody)
                });
                if (fbRes.ok) {
                    const fbJson = await fbRes.json();
                    const replyText = fbJson.candidates?.[0]?.content?.parts?.[0]?.text;
                    if (replyText) {
                        history.push({ role: 'user', text: userMessage });
                        history.push({ role: 'model', text: replyText });
                        if (history.length > MAX_HISTORY * 2) history.splice(0, 2);
                        return { text: replyText.trim(), source: 'gemini-1.5-flash' };
                    }
                }
            }

            // Genel API hatası durumunda akıllı fallback
            return {
                text: generateFallbackResponse(userMessage, knowledge),
                source: 'rule_engine_fallback'
            };
        }

        const data = await response.json();
        const candidate = data.candidates?.[0];
        const aiText = candidate?.content?.parts?.[0]?.text;

        if (!aiText) {
            console.warn('[AI] Yanıt içeriği boş geldi, fallback kullanılıyor.');
            return {
                text: generateFallbackResponse(userMessage, knowledge),
                source: 'rule_engine'
            };
        }

        const cleanedText = aiText.trim();

        // Hafızaya ekle
        history.push({ role: 'user', text: userMessage });
        history.push({ role: 'model', text: cleanedText });
        if (history.length > MAX_HISTORY * 2) {
            history.splice(0, 2);
        }

        return {
            text: cleanedText,
            source: 'gemini'
        };
    } catch (err) {
        console.error('[AI] İstek sırasında istisna oluştu:', err.message);
        return {
            text: generateFallbackResponse(userMessage, knowledge),
            source: 'rule_engine_error'
        };
    }
}

module.exports = {
    generateAiResponse,
    getKnowledgeBaseContent,
    updateKnowledgeBaseContent,
    clearHistory
};
