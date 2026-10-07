const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const path = require('path');
const fs = require('fs');
const qrcode = require('qrcode');
const qrcodeTerminal = require('qrcode-terminal');
const { generateAiResponse } = require('./ai');
const { stockService } = require('./stockService');
require('dotenv').config();

// Global Bot Durumu
let sock = null;
let currentQr = null;
let currentQrDataUrl = null;
let botStatus = 'disconnected'; // 'disconnected' | 'connecting' | 'qr_ready' | 'connected'
let botUser = null;
let eventListeners = [];
const messageLogs = [];
const MAX_LOGS = 100;
let isStarting = false;
let reconnectTimeout = null;

// Son mesajlar için bellek içi önbellek (Bad MAC ve getMessage onarımı için)
const messageCache = new Map();
const MAX_MESSAGE_CACHE = 2000;

function cacheMessage(key, message) {
    if (!key || !key.remoteJid || !key.id || !message) return;
    const msgId = `${key.remoteJid}_${key.id}`;
    messageCache.set(msgId, message);
    if (messageCache.size > MAX_MESSAGE_CACHE) {
        const oldestKey = messageCache.keys().next().value;
        messageCache.delete(oldestKey);
    }
}

// Oturum klasörü
const AUTH_FOLDER = path.join(__dirname, '..', 'session_auth');

/**
 * Dinleyicilere olay yayını yapar (WebSocket & UI için)
 */
function broadcastEvent(eventType, data) {
    for (const listener of eventListeners) {
        try {
            listener(eventType, data);
        } catch (e) {
            console.error('[Bot Event] Yayın hatası:', e.message);
        }
    }
}

function addEventListener(fn) {
    eventListeners.push(fn);
}

function removeEventListener(fn) {
    eventListeners = eventListeners.filter(l => l !== fn);
}

function getBotStatus() {
    return {
        status: botStatus,
        user: botUser,
        qr: currentQr,
        qrDataUrl: currentQrDataUrl,
        autoReply: process.env.AUTO_REPLY !== 'false',
        totalLogs: messageLogs.length
    };
}

function getRecentLogs() {
    return messageLogs.slice(-50).reverse();
}

/**
 * Mesaj metnini çıkartır
 */
function extractMessageText(msg) {
    if (!msg || !msg.message) return '';
    const m = msg.message;
    return (
        m.conversation ||
        m.extendedTextMessage?.text ||
        m.imageMessage?.caption ||
        m.videoMessage?.caption ||
        m.documentMessage?.caption ||
        m.buttonsResponseMessage?.selectedButtonId ||
        m.listResponseMessage?.singleSelectReply?.selectedRowId ||
        m.templateButtonReplyMessage?.selectedId ||
        ''
    ).trim();
}

/**
 * WhatsApp Bağlantısını Başlatır
 */
async function startWhatsAppBot() {
    if (isStarting) {
        console.log('[WhatsApp] Zaten bir başlatma işlemi devam ediyor...');
        return;
    }
    isStarting = true;

    if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
    }

    try {
        if (!fs.existsSync(AUTH_FOLDER)) {
            fs.mkdirSync(AUTH_FOLDER, { recursive: true });
        }

        botStatus = 'connecting';
        broadcastEvent('status_change', { status: botStatus });

        // Eski soketi güvenle temizle
        if (sock) {
            try {
                sock.ev.removeAllListeners();
            } catch (e) {}
        }

        const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
        const { version, isLatest } = await fetchLatestBaileysVersion().catch(() => ({ version: [2, 3000, 1043857760], isLatest: true }));
        console.log(`[WhatsApp] Baileys v${version.join('.')} başlatılıyor...`);

        sock = makeWASocket({
            version,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
            },
            logger: pino({ level: 'silent' }),
            printQRInTerminal: false,
            browser: ['Depo Destek Asistanı', 'Chrome', '1.0.0'],
            syncFullHistory: false,
            generateHighQualityLinkPreview: true,
            connectTimeoutMs: 60000,
            keepAliveIntervalMs: 25000,
            retryRequestDelayMs: 3000,
            getMessage: async (key) => {
                if (!key || !key.remoteJid || !key.id) return undefined;
                const msgId = `${key.remoteJid}_${key.id}`;
                return messageCache.get(msgId) || undefined;
            }
        });

        // Kimlik bilgilerini kaydet
        sock.ev.on('creds.update', saveCreds);

        // Bağlantı Güncellemeleri
        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                currentQr = qr;
                botStatus = 'qr_ready';
                try {
                    currentQrDataUrl = await qrcode.toDataURL(qr);
                } catch (err) {
                    console.error('[QR] DataURL çevirme hatası:', err);
                }

                console.log('\n======================================================');
                console.log('📱 WhatsApp QR Kodu Hazır! Terminalden veya Web Panelinden taratabilirsiniz.');
                console.log('======================================================\n');
                qrcodeTerminal.generate(qr, { small: true });

                broadcastEvent('qr', { qr, qrDataUrl: currentQrDataUrl });
                broadcastEvent('status_change', { status: botStatus });
            }

            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
                console.log(`[WhatsApp] Bağlantı kapandı. Sebep: ${statusCode}. Yeniden bağlanılacak mı: ${shouldReconnect}`);

                botStatus = 'disconnected';
                currentQr = null;
                currentQrDataUrl = null;
                botUser = null;
                broadcastEvent('status_change', { status: botStatus });

                isStarting = false;

                if (shouldReconnect) {
                    if (!reconnectTimeout) {
                        reconnectTimeout = setTimeout(() => {
                            reconnectTimeout = null;
                            startWhatsAppBot().catch(e => console.error('[WhatsApp] Yeniden başlatma hatası:', e));
                        }, 5000);
                    }
                } else {
                    console.log('[WhatsApp] Oturum sonlandırıldı (Logged out). Klasör temizleniyor.');
                    try {
                        fs.rmSync(AUTH_FOLDER, { recursive: true, force: true });
                    } catch (e) {}
                    if (!reconnectTimeout) {
                        reconnectTimeout = setTimeout(() => {
                            reconnectTimeout = null;
                            startWhatsAppBot().catch(e => console.error('[WhatsApp] Yeniden başlatma hatası:', e));
                        }, 2000);
                    }
                }
            } else if (connection === 'open') {
                isStarting = false;
                botStatus = 'connected';
                currentQr = null;
                currentQrDataUrl = null;
                botUser = sock.user;
                console.log(`\n🎉 [WhatsApp] Başarıyla bağlandı! Kullanıcı: ${botUser?.name || botUser?.id}`);
                broadcastEvent('status_change', { status: botStatus, user: botUser });
            }
        });

    // Gelen Mesajları Dinle
    sock.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            if (chatUpdate.type !== 'notify') return;

            for (const msg of chatUpdate.messages) {
                if (msg.key && msg.message) {
                    cacheMessage(msg.key, msg.message);
                }

                // Kendi attığımız mesajları atla
                if (msg.key.fromMe) continue;

                // Durum güncellemelerini / hikayeleri atla
                const fromJid = msg.key.remoteJid;
                if (!fromJid || fromJid === 'status@broadcast') continue;

                // Grup mesajlarını opsiyonel olarak atla
                const isGroup = fromJid.endsWith('@g.us');
                const ignoreGroups = process.env.IGNORE_GROUPS !== 'false';
                if (isGroup && ignoreGroups) continue;

                // Mesaj içeriğini al
                const text = extractMessageText(msg);
                if (!text) continue;

                const pushName = msg.pushName || 'Kullanıcı';
                console.log(`\n📩 [Gelen Mesaj] Kimden: ${pushName} (${fromJid}): "${text}"`);

                // Otomatik cevap aktif mi?
                const autoReply = process.env.AUTO_REPLY !== 'false';
                if (!autoReply) {
                    console.log('[Bot] Otomatik cevap devre dışı olduğu için yanıtlanmadı.');
                    continue;
                }

                // Kural: "ry " (stoktan raf) veya "ri " (raftan malzeme) komutları yanıtlanır
                const cmdResult = stockService.processCommand(text);
                if (!cmdResult) {
                    console.log(`[Bot] Mesaj 'ry ' veya 'ri ' komutu ile başlamadığı için kurallar gereği yanıtlanmadı: "${text}"`);
                    continue;
                }

                const cmdTag = (cmdResult.command || (cmdResult.isRyCommand ? 'ry' : 'ri')).toUpperCase();
                console.log(`🔍 [Depo Destek (${cmdTag})] Sorgu: "${cmdResult.query}" (Sonuç: ${cmdResult.searchResult.type})`);

                // Mesajı okundu olarak işaretle ve "yazıyor..." durumunu göster
                try {
                    await sock.readMessages([msg.key]);
                    await sock.sendPresenceUpdate('composing', fromJid);
                } catch (e) {}

                // İnsansı gecikme (ayarlanabilir)
                const delayMs = parseInt(process.env.REPLY_DELAY_MS || '1000', 10);
                if (delayMs > 0) {
                    await new Promise(r => setTimeout(r, delayMs));
                }

                const replyText = cmdResult.replyText;
                const matchType = cmdResult.searchResult.type;

                // WhatsApp'tan yanıtı gönder
                await sock.sendMessage(fromJid, { text: replyText }, { quoted: msg });
                await sock.sendPresenceUpdate('paused', fromJid);

                console.log(`🤖 [Depo Destek Yanıtı (${matchType})]:\n${replyText}\n`);

                // Log kaydı oluştur
                const logItem = {
                    id: msg.key.id,
                    from: fromJid.split('@')[0],
                    fromName: pushName,
                    isGroup: isGroup,
                    incomingMessage: text,
                    replyMessage: replyText,
                    source: `${(cmdResult.command || 'ry').toLowerCase()}_${matchType}`,
                    query: cmdResult.query,
                    timestamp: new Date().toISOString()
                };

                messageLogs.push(logItem);
                if (messageLogs.length > MAX_LOGS) {
                    messageLogs.shift();
                }

                // Web arayüzüne bildir
                broadcastEvent('new_message', logItem);
            }
        } catch (err) {
            console.error('[Bot] Mesaj işlenirken hata oluştu:', err);
        }
    });
    } catch (err) {
        console.error('[WhatsApp] Başlatma sırasında hata oluştu:', err);
        isStarting = false;
        if (!reconnectTimeout) {
            reconnectTimeout = setTimeout(() => {
                reconnectTimeout = null;
                startWhatsAppBot().catch(e => console.error('[WhatsApp] Yeniden deneme hatası:', e));
            }, 5000);
        }
    }
}

/**
 * Botu yeniden başlatır
 */
async function restartBot() {
    try {
        if (sock) {
            sock.end(new Error('Manual Restart'));
        }
    } catch (e) {}
    setTimeout(() => {
        startWhatsAppBot();
    }, 1000);
}

/**
 * Oturumu kapatıp sıfırlar (yeni QR kod üretir)
 */
async function logoutBot() {
    try {
        if (sock) {
            await sock.logout();
        }
    } catch (e) {}
    try {
        fs.rmSync(AUTH_FOLDER, { recursive: true, force: true });
    } catch (e) {}
    currentQr = null;
    currentQrDataUrl = null;
    botStatus = 'disconnected';
    botUser = null;
    broadcastEvent('status_change', { status: botStatus });
    setTimeout(() => {
        startWhatsAppBot();
    }, 1000);
}

module.exports = {
    startWhatsAppBot,
    getBotStatus,
    getRecentLogs,
    addEventListener,
    removeEventListener,
    restartBot,
    logoutBot
};
