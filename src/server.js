const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const { WebSocketServer } = require('ws');
require('dotenv').config();

// Beklenmeyen socket / bağlantı kopması hatalarında sunucunun çökmesini engelle
process.on('uncaughtException', (err) => {
    console.error('[Sistem] Yakalanan istisna (uncaughtException):', err.message);
});

process.on('unhandledRejection', (reason) => {
    console.error('[Sistem] Yakalanan promise hatası (unhandledRejection):', reason?.message || reason);
});

const {
    startWhatsAppBot,
    getBotStatus,
    getRecentLogs,
    addEventListener,
    restartBot,
    logoutBot
} = require('./bot');

const {
    generateAiResponse,
    getKnowledgeBaseContent,
    updateKnowledgeBaseContent,
    clearHistory
} = require('./ai');

const { stockService } = require('./stockService');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// WebSocket Canlı Bildirimleri
const connectedClients = new Set();

wss.on('connection', (ws) => {
    connectedClients.add(ws);

    // İlk bağlantıda mevcut durumu ve stok istatistiklerini gönder
    const initialStatus = getBotStatus();
    ws.send(JSON.stringify({
        type: 'initial_state',
        data: {
            ...initialStatus,
            geminiConfigured: !!(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim()),
            stockStats: stockService.getStats(),
            logs: getRecentLogs()
        }
    }));

    ws.on('close', () => {
        connectedClients.delete(ws);
    });
});

function broadcastToWs(type, data) {
    const payload = JSON.stringify({ type, data });
    for (const client of connectedClients) {
        if (client.readyState === 1) { // OPEN
            client.send(payload);
        }
    }
}

// Bot olaylarını dinleyip WebSocket istemcilerine aktar
addEventListener((eventType, data) => {
    broadcastToWs(eventType, data);
});

// --- REST API ENDPOINT'LERİ ---

// 1. Genel Durum
app.get('/api/status', (req, res) => {
    const status = getBotStatus();
    res.json({
        ...status,
        geminiConfigured: !!(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim()),
        botName: process.env.BOT_NAME || 'Depo Destek Asistanı',
        companyName: process.env.COMPANY_NAME || 'Depo & Lojistik Yönetimi',
        stockStats: stockService.getStats()
    });
});

// 2. Mesaj Logları
app.get('/api/logs', (req, res) => {
    res.json(getRecentLogs());
});

// 3. Bilgi Bankası Oku / Güncelle
app.get('/api/knowledge', (req, res) => {
    res.json({ content: getKnowledgeBaseContent() });
});

app.post('/api/knowledge', (req, res) => {
    const { content } = req.body;
    if (typeof content !== 'string') {
        return res.status(400).json({ error: 'Geçersiz içerik' });
    }
    updateKnowledgeBaseContent(content);
    res.json({ success: true, message: 'Bilgi bankası başarıyla güncellendi.' });
});

// 4. Stok ve Raf Yeri API'leri
app.get('/api/stock/stats', (req, res) => {
    res.json(stockService.getStats());
});

app.get('/api/stock/search', (req, res) => {
    const rawQuery = req.query.q || '';
    const trimmed = rawQuery.trim();

    // Eğer doğrudan "ri" (raf içeriği) ile arandıysa raf araması yap
    if (/^ri(\s+.*)?$/i.test(trimmed)) {
        const shelfQuery = trimmed.replace(/^ri\s*/i, '');
        const result = stockService.searchShelf(shelfQuery);
        const formattedText = stockService.formatShelfResponse(result);
        return res.json({
            mode: 'shelf',
            query: shelfQuery,
            result,
            formattedText
        });
    }

    // Normal stok araması ("ry " varsa temizle)
    const stockQuery = trimmed.replace(/^ry\s*/i, '');
    const result = stockService.search(stockQuery);
    const formattedText = stockService.formatResponse(result);
    res.json({
        mode: 'stock',
        query: stockQuery,
        result,
        formattedText
    });
});

app.get('/api/shelf/search', (req, res) => {
    const query = (req.query.q || '').trim();
    const result = stockService.searchShelf(query);
    const formattedText = stockService.formatShelfResponse(result);
    res.json({
        mode: 'shelf',
        query,
        result,
        formattedText
    });
});

app.post('/api/stock/reload', (req, res) => {
    const success = stockService.loadData();
    res.json({
        success,
        message: success ? 'Excel stok verileri başarıyla yeniden yüklendi.' : 'Excel yüklenirken hata oluştu.',
        stats: stockService.getStats()
    });
});

// 5. Ayarları Oku / Güncelle
app.get('/api/config', (req, res) => {
    res.json({
        botName: process.env.BOT_NAME || 'Depo Destek Asistanı',
        companyName: process.env.COMPANY_NAME || 'Depo & Lojistik Yönetimi',
        geminiModel: process.env.GEMINI_MODEL || 'gemini-3.5-flash',
        autoReply: process.env.AUTO_REPLY !== 'false',
        ignoreGroups: process.env.IGNORE_GROUPS !== 'false',
        hasApiKey: !!(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim()),
        stockStats: stockService.getStats()
    });
});

app.post('/api/config', (req, res) => {
    const { apiKey, botName, companyName, autoReply, ignoreGroups } = req.body;

    if (apiKey !== undefined && apiKey.trim() !== '') {
        process.env.GEMINI_API_KEY = apiKey.trim();
    }
    if (botName) process.env.BOT_NAME = botName.trim();
    if (companyName) process.env.COMPANY_NAME = companyName.trim();
    if (autoReply !== undefined) process.env.AUTO_REPLY = autoReply ? 'true' : 'false';
    if (ignoreGroups !== undefined) process.env.IGNORE_GROUPS = ignoreGroups ? 'true' : 'false';

    // .env dosyasını güncelle
    try {
        const envPath = path.join(__dirname, '..', '.env');
        let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : '';
        
        const updateEnvVar = (key, val) => {
            const regex = new RegExp(`^${key}=.*$`, 'm');
            if (regex.test(envContent)) {
                envContent = envContent.replace(regex, `${key}=${val}`);
            } else {
                envContent += `\n${key}=${val}`;
            }
        };

        if (apiKey !== undefined && apiKey.trim() !== '') updateEnvVar('GEMINI_API_KEY', apiKey.trim());
        if (botName) updateEnvVar('BOT_NAME', botName.trim());
        if (companyName) updateEnvVar('COMPANY_NAME', companyName.trim());
        if (autoReply !== undefined) updateEnvVar('AUTO_REPLY', autoReply ? 'true' : 'false');
        if (ignoreGroups !== undefined) updateEnvVar('IGNORE_GROUPS', ignoreGroups ? 'true' : 'false');

        fs.writeFileSync(envPath, envContent.trim() + '\n', 'utf-8');
    } catch (e) {
        console.error('.env yazma hatası:', e.message);
    }

    res.json({ success: true, message: 'Ayarlar başarıyla kaydedildi.' });
});

// 6. Test Sandbox (Arayüzden botu deneme)
app.post('/api/test-ai', async (req, res) => {
    const { message, userName } = req.body;
    if (!message) {
        return res.status(400).json({ error: 'Mesaj boş olamaz' });
    }
    const testJid = 'sandbox_user@test.com';
    const result = await generateAiResponse(testJid, message, userName || 'Depo Görevlisi');
    res.json(result);
});

// 7. Test Hafızasını Sıfırla
app.post('/api/test-ai/reset', (req, res) => {
    clearHistory('sandbox_user@test.com');
    res.json({ success: true, message: 'Test sohbet geçmişi sıfırlandı.' });
});

// 8. Bot Kontrolleri
app.post('/api/bot/restart', async (req, res) => {
    await restartBot();
    res.json({ success: true, message: 'Bot yeniden başlatılıyor...' });
});

app.post('/api/bot/logout', async (req, res) => {
    await logoutBot();
    res.json({ success: true, message: 'Oturum kapatıldı, yeni QR kod oluşturuluyor...' });
});

// 9. Sistem Güncelleme (Git Pull)
app.post('/api/system/update', (req, res) => {
    const { exec } = require('child_process');
    const projectRoot = path.join(__dirname, '..');
    exec('git pull origin main', { cwd: projectRoot }, (err, stdout, stderr) => {
        if (err) {
            console.error('[Sistem Güncelleme Hatası]:', stderr || err.message);
            return res.status(500).json({ success: false, error: stderr || err.message });
        }
        console.log('[Sistem Güncelleme Sonucu]:', stdout);
        res.json({ success: true, message: 'Program başarıyla güncellendi.', output: stdout });
    });
});

// Sunucuyu ve WhatsApp Botunu Başlat
server.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(`🚀 Depo Destek Asistanı Paneli: http://localhost:${PORT}`);
    console.log(`======================================================\n`);
    
    // WhatsApp Botunu Başlat
    startWhatsAppBot().catch(err => {
        console.error('[Sunucu] WhatsApp bot başlatılırken hata:', err);
    });
});
