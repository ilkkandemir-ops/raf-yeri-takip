const path = require('path');
const fs = require('fs');
const xlsx = require('xlsx');

/**
 * Türkçe karakterleri ASCII eşdeğerlerine ve temiz küçük harflere dönüştürür (Boşluksuz - Kod karşılaştırmaları için)
 */
function cleanTurkish(str) {
    if (!str) return '';
    return str
        .toString()
        .toLocaleLowerCase('tr-TR')
        .replace(/ı/g, 'i')
        .replace(/ğ/g, 'g')
        .replace(/ü/g, 'u')
        .replace(/ş/g, 's')
        .replace(/ö/g, 'o')
        .replace(/ç/g, 'c')
        .replace(/[^a-z0-9]/g, '')
        .trim();
}

/**
 * Kelime bazlı arama için Türkçe karakterleri normalize eder (Boşlukları korur)
 */
function cleanWords(str) {
    if (!str) return '';
    return str
        .toString()
        .toLocaleLowerCase('tr-TR')
        .replace(/ı/g, 'i')
        .replace(/ğ/g, 'g')
        .replace(/ü/g, 'u')
        .replace(/ş/g, 's')
        .replace(/ö/g, 'o')
        .replace(/ç/g, 'c')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

// Arama esnasında filtrelenecek genel dolgu kelimeleri
const STOP_WORDS = new Set(['stok', 'stogu', 'kodu', 'kodu:', 'kod', 'raf', 'yeri', 'nerede', 'nerde', 'var', 'mi', 've', 'ile', 'icin']);

/**
 * Raf kodlarını standart formata dönüştürür (Boşluk, tire, nokta gibi karakterleri temizler, büyük harfe çevirir)
 * Örn: "A1A", "A-1A", "A-1-A", "A 1 A", "a1a" -> "A1A"
 * Örn: "A1", "A-1", "a1" -> "A1"
 */
function normalizeShelf(str) {
    if (!str) return '';
    return str
        .toString()
        .toLocaleUpperCase('tr-TR')
        .replace(/[^A-Z0-9]/g, '')
        .trim();
}

/**
 * İki metin arasındaki Levenshtein mesafesini hesaplar (Yazım hataları toleransı için)
 */
function levenshteinDistance(s1, s2) {
    const m = s1.length;
    const n = s2.length;
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (s1[i - 1] === s2[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1];
            } else {
                dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
            }
        }
    }
    return dp[m][n];
}

class StockService {
    constructor(excelPath) {
        this.excelPath = excelPath || process.env.EXCEL_PATH || path.join(__dirname, '..', 'Raf Yerleri.xlsx');
        this.items = [];
        this.shelfMap = new Map(); // normShelf -> { rawShelf, items: [] }
        this.lastLoaded = null;
        this.totalRowsScanned = 0;
        this.sheetNames = [];
        this.init();
    }

    init() {
        this.loadData();
        this.setupFileWatcher();
    }

    /**
     * Excel dosyasını okur, verileri ayrıştırır ve bellekte indeksler
     */
    loadData() {
        try {
            if (!fs.existsSync(this.excelPath)) {
                console.warn(`[StockService] Excel dosyası bulunamadı: ${this.excelPath}`);
                return false;
            }

            console.log(`[StockService] Excel dosyası yükleniyor: ${path.basename(this.excelPath)}`);
            const wb = xlsx.readFile(this.excelPath);
            const map = new Map();
            let totalRows = 0;
            this.sheetNames = wb.SheetNames;

            wb.SheetNames.forEach(sheetName => {
                const rows = xlsx.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1 });
                if (!rows || rows.length < 2) return;
                totalRows += (rows.length - 1);

                for (let i = 1; i < rows.length; i++) {
                    const r = rows[i];
                    if (!r || r.length === 0) continue;

                    const code = r[0] != null ? String(r[0]).trim() : '';
                    const name = r[1] != null ? String(r[1]).trim() : '';
                    if (!code && !name) continue;

                    // Raf konumlarını topla ve temizle
                    const rawShelves = [];
                    for (let c = 2; c < r.length; c++) {
                        if (r[c] != null) {
                            const val = String(r[c]).trim();
                            // Geçersiz veya boş ibareleri ayıkla
                            if (val && val !== '"' && val !== '-' && val !== '.' && val.toUpperCase() !== 'BOŞ') {
                                if (!rawShelves.includes(val)) {
                                    rawShelves.push(val);
                                }
                            }
                        }
                    }

                    // Aynı kod ve ada sahip mükerrer satırların raf yerlerini birleştir
                    const groupKey = `${code.toLowerCase()}___${name.toLowerCase()}`;
                    if (!map.has(groupKey)) {
                        map.set(groupKey, {
                            code,
                            name,
                            shelves: rawShelves,
                            normCode: cleanTurkish(code),
                            normName: cleanTurkish(name),
                            wordCode: cleanWords(code),
                            wordName: cleanWords(name),
                            tokens: cleanWords(`${code} ${name}`).split(' ').filter(w => w.length > 1 && !STOP_WORDS.has(w))
                        });
                    } else {
                        const existing = map.get(groupKey);
                        rawShelves.forEach(s => {
                            if (!existing.shelves.includes(s)) {
                                existing.shelves.push(s);
                            }
                        });
                    }
                }
            });

            this.items = Array.from(map.values());
            this.totalRowsScanned = totalRows;
            this.lastLoaded = new Date();

            // Raf indeksini oluştur (Hızlı ters sorgu - Raf İçeriği [ri] için)
            this.shelfMap = new Map();
            for (const item of this.items) {
                for (const shelf of item.shelves) {
                    const norm = normalizeShelf(shelf);
                    if (!norm) continue;
                    if (!this.shelfMap.has(norm)) {
                        this.shelfMap.set(norm, {
                            rawShelf: shelf,
                            items: []
                        });
                    }
                    const entry = this.shelfMap.get(norm);
                    if (!entry.items.some(it => it.code === item.code && it.name === item.name)) {
                        entry.items.push(item);
                    }
                }
            }

            console.log(`[StockService] Başarılı! Toplam ${totalRows} satırdan ${this.items.length} benzersiz stok ve ${this.shelfMap.size} aktif raf konumu indekslendi.`);
            return true;
        } catch (err) {
            console.error('[StockService] Excel dosyası yüklenirken hata oluştu:', err);
            return false;
        }
    }

    /**
     * Excel dosyası güncellendiğinde otomatik yeniden yükler
     */
    setupFileWatcher() {
        try {
            if (fs.existsSync(this.excelPath)) {
                let debounceTimer = null;
                fs.watch(this.excelPath, (eventType) => {
                    if (eventType === 'change' || eventType === 'rename') {
                        if (debounceTimer) clearTimeout(debounceTimer);
                        debounceTimer = setTimeout(() => {
                            console.log('[StockService] Excel dosyasında değişiklik algılandı, veriler yeniden indeksleniyor...');
                            this.loadData();
                        }, 1000);
                    }
                });
            }
        } catch (e) {
            console.warn('[StockService] Dosya izleyici başlatılamadı:', e.message);
        }
    }

    /**
     * Stok araması yapar (Birebir ve Benzerlik desteği)
     */
    search(rawQuery) {
        const query = (rawQuery || '').trim();
        if (!query) {
            return {
                type: 'empty',
                query: '',
                message: 'Lütfen aramak istediğiniz stok kodu veya adını belirtin.',
                results: []
            };
        }

        const qNorm = cleanTurkish(query);
        const qWords = cleanWords(query);
        const qRawTokens = qWords.split(' ').filter(Boolean);
        const qMeaningfulTokens = qRawTokens.filter(w => !STOP_WORDS.has(w) && w.length >= 2);
        const searchTokens = qMeaningfulTokens.length > 0 ? qMeaningfulTokens : qRawTokens;

        // 1. AŞAMA: Birebir (Exact) Eşleşme
        // Stok kodu veya stok adı aranan kelimeyle tam olarak eşleşiyorsa
        const exactMatches = this.items.filter(it => 
            (it.normCode && it.normCode === qNorm) ||
            (it.wordCode && it.wordCode === qWords) ||
            (it.normName && it.normName === qNorm) ||
            (it.wordName && it.wordName === qWords)
        );

        if (exactMatches.length > 0) {
            return {
                type: 'exact',
                query,
                results: exactMatches
            };
        }

        // 2. AŞAMA: Benzer / Kısmi / Çoklu Kelime Kesişimi Eşleşmeleri
        const candidates = [];
        const isMultiToken = searchTokens.length > 1;

        for (const it of this.items) {
            let score = 0;
            let tokenHitCount = 0;
            let exactTokenHitCount = 0;

            // C. Anlamlı Kelime / Token Eşleşmesi (Koddaki ve İsimdeki kelimeler)
            if (searchTokens.length > 0) {
                for (const t of searchTokens) {
                    // 1. Kelime birebir listede var mı?
                    const exactMatch = it.tokens.includes(t) || it.normCode === t;
                    
                    // 2. Kelime prefix / parça olarak koddaki veya isimdeki bir kelimeyle başlıyor mu?
                    // (Örn: 'hort' -> 'hortum', '1550' -> '1550123' veya stok kodunun başı)
                    const codeStartsWith = it.normCode.startsWith(t);
                    const tokenStartsWith = it.tokens.some(tok => tok.startsWith(t) || (t.length >= 4 && tok.includes(t)));
                    const partialMatch = !exactMatch && (codeStartsWith || tokenStartsWith);

                    if (exactMatch) {
                        tokenHitCount += 1;
                        exactTokenHitCount += 1;
                    } else if (partialMatch) {
                        tokenHitCount += 1; // Eşleşen kelime sayısını 1 kabul et
                    }
                }

                // Çoklu kelime aramasında (örn: "1550 hort"):
                // Eğer aranan kelimelerin HEPSİ bu üründe (kodunda veya adında) bulunmuyorsa bu ürünü ele!
                if (isMultiToken && tokenHitCount < searchTokens.length) {
                    continue; // Kural: Bütün kelimeler aynı anda bulunmak zorunda (Çöp sonuçları engeller)
                }

                if (tokenHitCount > 0) {
                    const ratio = tokenHitCount / searchTokens.length;
                    score += ratio * 120; // Yüksek taban skor

                    if (isMultiToken && tokenHitCount === searchTokens.length) {
                        score += 80; // Tüm parçalar (örn: 1550 + hort) eşleştiğinde güçlü kesişim bonusu
                    }
                    if (exactTokenHitCount === searchTokens.length) {
                        score += 40; // Tüm kelimeler tam eşleştiğinde ekstra bonus
                    }
                }
            }

            // A. Tekil Stok Kodu Başlangıç veya İçerme
            if (!isMultiToken && qNorm && it.normCode.length >= 2) {
                if (it.normCode === qNorm) {
                    score += 200;
                } else if (it.normCode.startsWith(qNorm)) {
                    score += 150 + (qNorm.length / (it.normCode.length || 1)) * 40;
                } else if (it.normCode.includes(qNorm) && qNorm.length >= 3) {
                    score += 100 + (qNorm.length / (it.normCode.length || 1)) * 20;
                }
            }

            // B. Tekil Stok İsmi Başlangıç veya Tam İfade İçerme
            if (!isMultiToken && qWords && qWords.length >= 3) {
                if (it.wordName.startsWith(qWords)) {
                    score += 140 + (qWords.length / (it.wordName.length || 1)) * 30;
                } else if (it.wordName.includes(qWords)) {
                    score += 90 + (qWords.length / (it.wordName.length || 1)) * 20;
                }
            }

            // D. Yazım Hatası / Typo Toleransı (Levenshtein) - Sadece tekil aramalarda ve skor 0 ise
            if (!isMultiToken && qNorm.length >= 4 && score === 0) {
                const distCode = levenshteinDistance(qNorm, it.normCode.slice(0, qNorm.length + 2));
                if (distCode <= 1) {
                    score += 55;
                } else {
                    for (const tok of it.tokens) {
                        if (Math.abs(tok.length - qNorm.length) <= 2) {
                            const distName = levenshteinDistance(qNorm, tok);
                            if (distName <= 1) {
                                score += 50;
                                break;
                            }
                        }
                    }
                }
            }

            // Anlamlı eşleşme skoru eşiğini geçenleri listeye al
            if (score >= 45) {
                candidates.push({ item: it, score });
            }
        }

        // Skorlara göre çoktan aza sırala
        candidates.sort((a, b) => b.score - a.score);

        // En alakalı ilk 10 benzer sonuç
        const topResults = candidates.slice(0, 10).map(c => c.item);

        if (topResults.length > 0) {
            return {
                type: 'similar',
                query,
                results: topResults
            };
        }

        // Hiçbir eşleşme bulunamadı
        return {
            type: 'not_found',
            query,
            results: []
        };
    }

    /**
     * Arama sonucunu WhatsApp formatında okunabilir şablon metne dönüştürür
     */
    formatResponse(searchResult) {
        if (searchResult.type === 'empty') {
            return `📦 *DEPO DESTEK ASİSTANI*\n\n⚠️ ${searchResult.message}\n\n*Kullanım:* \`ry [stok kodu veya adı]\`\n*Örnek:* \`ry 1510FY50TF\` veya \`ry RULMAN\``;
        }

        if (searchResult.type === 'exact') {
            let msg = `📦 *DEPO DESTEK ASİSTANI*\n`;
            if (searchResult.results.length === 1) {
                const item = searchResult.results[0];
                const shelfStr = item.shelves.length > 0 ? item.shelves.join(', ') : 'Tanımlanmamış / Boş';
                msg += `✅ *Birebir Eşleşen Stok Bulundu:*\n\n`;
                msg += `🏷️ *Stok Kodu:* \`${item.code}\`\n`;
                msg += `📝 *Stok Adı:* ${item.name || '-'}\n`;
                msg += `📍 *Raf Yeri:* *${shelfStr}*`;
            } else {
                msg += `✅ *Birebir Eşleşen ${searchResult.results.length} Stok Bulundu:*\n\n`;
                searchResult.results.forEach((item, idx) => {
                    const shelfStr = item.shelves.length > 0 ? item.shelves.join(', ') : 'Tanımlanmamış';
                    msg += `${idx + 1}️⃣ *KOD:* \`${item.code}\`\n`;
                    msg += `   📝 *Ad:* ${item.name || '-'}\n`;
                    msg += `   📍 *Raf:* *${shelfStr}*\n\n`;
                });
            }
            return msg.trim();
        }

        if (searchResult.type === 'similar') {
            let msg = `📦 *DEPO DESTEK ASİSTANI*\n`;
            msg += `⚠️ "*${searchResult.query}*" için birebir kayıt bulunamadı. Benzer stoklar listeleniyor:\n\n`;
            searchResult.results.forEach((item, idx) => {
                const shelfStr = item.shelves.length > 0 ? item.shelves.join(', ') : 'Tanımlanmamış';
                msg += `${idx + 1}️⃣ *KOD:* \`${item.code}\`\n`;
                msg += `   📝 *Ad:* ${item.name || '-'}\n`;
                msg += `   📍 *Raf:* *${shelfStr}*\n\n`;
            });
            msg += `💡 _Tam eşleşme için kesin stok kodunu veya parça adını yazabilirsiniz._`;
            return msg.trim();
        }

        return `📦 *DEPO DESTEK ASİSTANI*\n\n❌ "*${searchResult.query}*" kriterine uygun stok veya raf yeri bulunamadı.\nLütfen stok kodunu veya parça adını kontrol edip tekrar deneyiniz.\n\n*Örnek:* \`ry 1510FY50TF\` veya \`ry ZİNCİR\``;
    }

    /**
     * "ry " komutunu işler:
     * - Mesaj "ry " veya "ry" ile başlıyorsa arama yapar ve formatlanmış yanıt döner.
     * - "ry " ile başlamıyorsa null döner (böylece bot sessiz kalır).
     */
    processRyCommand(text) {
        if (!text || typeof text !== 'string') return null;
        const trimmed = text.trim();

        // "ry " veya "RY " veya "Ry " ile başlıyor mu?
        const match = trimmed.match(/^ry(\s+(.+))?$/i);
        if (!match) {
            return null; // ry komutu değil, cevap verilmeyecek
        }

        const query = (match[2] || '').trim();
        const searchResult = this.search(query);
        const replyText = this.formatResponse(searchResult);

        return {
            isRyCommand: true,
            command: 'ry',
            query,
            searchResult,
            replyText
        };
    }

    /**
     * Raf içeriği araması yapar (Örn: "A1A", "A-1A", "A1")
     * - Birebir raf kodu: O raftaki tüm malzemeleri döner
     * - Önek raf kodu (Örn: A1): A1 ile başlayan tüm rafları (A1A, A1B...) ve içerdikleri malzemeleri döner
     */
    searchShelf(rawQuery) {
        const query = (rawQuery || '').trim();
        if (!query) {
            return {
                type: 'empty',
                query: '',
                message: 'Lütfen aramak istediğiniz raf kodunu belirtin (Örn: A1A, A-1A veya A1).',
                results: []
            };
        }

        const normQuery = normalizeShelf(query);
        if (!normQuery) {
            return {
                type: 'empty',
                query,
                message: 'Geçersiz raf kodu girdiniz. Örnek: A1A, A-1A veya A1',
                results: []
            };
        }

        // 1. AŞAMA: Birebir Eşleşen Raf (Örn: A1A veya A-1A)
        if (this.shelfMap.has(normQuery)) {
            const match = this.shelfMap.get(normQuery);
            return {
                type: 'exact_shelf',
                query,
                normQuery,
                shelf: match.rawShelf,
                shelves: [match.rawShelf],
                items: match.items
            };
        }

        // 2. AŞAMA: Önek / Raf Grubu Eşleşmesi (Örn: "A1" girildiğinde A1A, A1B, A1C...)
        const prefixMatches = [];
        for (const [norm, data] of this.shelfMap.entries()) {
            if (norm.startsWith(normQuery)) {
                prefixMatches.push(data);
            }
        }

        if (prefixMatches.length > 0) {
            prefixMatches.sort((a, b) => a.rawShelf.localeCompare(b.rawShelf, 'tr-TR'));
            return {
                type: 'group_shelf',
                query,
                normQuery,
                shelves: prefixMatches.map(m => m.rawShelf),
                groups: prefixMatches
            };
        }

        // 3. AŞAMA: Kısmi / İçeren Eşleşme (Substring)
        const containsMatches = [];
        for (const [norm, data] of this.shelfMap.entries()) {
            if (norm.includes(normQuery)) {
                containsMatches.push(data);
            }
        }

        if (containsMatches.length > 0) {
            containsMatches.sort((a, b) => a.rawShelf.localeCompare(b.rawShelf, 'tr-TR'));
            return {
                type: 'group_shelf',
                query,
                normQuery,
                shelves: containsMatches.map(m => m.rawShelf),
                groups: containsMatches
            };
        }

        return {
            type: 'not_found',
            query,
            normQuery,
            results: []
        };
    }

    /**
     * Raf içeriği arama sonucunu WhatsApp formatında okunabilir şablon metne dönüştürür
     */
    formatShelfResponse(searchResult) {
        if (searchResult.type === 'empty') {
            return `📦 *DEPO DESTEK ASİSTANI (RAF İÇERİĞİ)*\n\n⚠️ ${searchResult.message}\n\n*Kullanım:* \`ri [raf kodu]\`\n*Örnek:* \`ri A1A\`, \`ri A-1A\` veya \`ri A1\``;
        }

        if (searchResult.type === 'exact_shelf') {
            const count = searchResult.items.length;
            let msg = `📦 *DEPO DESTEK ASİSTANI (RAF İÇERİĞİ)*\n\n`;
            msg += `📍 *Raf Konumu:* *${searchResult.shelf}* _(Toplam ${count} Malzeme)_\n\n`;

            const displayList = searchResult.items.slice(0, 25);
            displayList.forEach((item, idx) => {
                msg += `${idx + 1}️⃣ *KOD:* \`${item.code}\`\n`;
                msg += `   📝 *Ad:* ${item.name || '-'}\n`;
                if (item.shelves.length > 1) {
                    const otherShelves = item.shelves.filter(s => s !== searchResult.shelf);
                    if (otherShelves.length > 0) {
                        msg += `   📍 *Diğer Rafları:* ${otherShelves.join(', ')}\n`;
                    }
                }
                msg += `\n`;
            });

            if (count > 25) {
                msg += `➕ *ve ${count - 25} malzeme daha bulunmaktadır.*\n`;
            }
            return msg.trim();
        }

        if (searchResult.type === 'group_shelf') {
            let totalItemCount = 0;
            searchResult.groups.forEach(g => { totalItemCount += g.items.length; });

            let msg = `📦 *DEPO DESTEK ASİSTANI (RAF İÇERİĞİ)*\n\n`;
            msg += `🔍 "*${searchResult.query}*" ile eşleşen *${searchResult.groups.length}* raf konumu bulundu _(Toplam ${totalItemCount} Malzeme)_:\n\n`;

            let displayedCount = 0;
            const MAX_TOTAL = 30;

            for (const group of searchResult.groups) {
                if (displayedCount >= MAX_TOTAL) break;
                msg += `📍 *Raf: ${group.rawShelf}* (${group.items.length} ürün)\n`;
                for (const item of group.items) {
                    if (displayedCount >= MAX_TOTAL) break;
                    msg += ` • \`${item.code}\` - ${item.name || '-'}\n`;
                    displayedCount++;
                }
                msg += `\n`;
            }

            const remaining = totalItemCount - displayedCount;
            if (remaining > 0) {
                msg += `➕ *ve ${remaining} malzeme daha listelenemedi.*\n💡 _Belli bir rafı tam görmek için örn:_ \`ri ${searchResult.groups[0].rawShelf}\`\n`;
            }

            return msg.trim();
        }

        return `📦 *DEPO DESTEK ASİSTANI (RAF İÇERİĞİ)*\n\n❌ "*${searchResult.query}*" kodlu bir raf yeri veya içinde malzeme bulunamadı.\nLütfen raf kodunu kontrol edip tekrar deneyiniz.\n\n*Örnek Kullanım:* \`ri A1A\`, \`ri A-1A\` veya \`ri A1\``;
    }

    /**
     * "ri " komutunu işler:
     * - Mesaj "ri " veya "ri" ile başlıyorsa raf içeriği araması yapar.
     */
    processRiCommand(text) {
        if (!text || typeof text !== 'string') return null;
        const trimmed = text.trim();

        const match = trimmed.match(/^ri(\s+(.+))?$/i);
        if (!match) return null;

        const query = (match[2] || '').trim();
        const searchResult = this.searchShelf(query);
        const replyText = this.formatShelfResponse(searchResult);

        return {
            isRiCommand: true,
            command: 'ri',
            query,
            searchResult,
            replyText
        };
    }

    /**
     * Hem "ry" (raf yeri) hem de "ri" (raf içeriği) komutlarını genel olarak işler
     */
    processCommand(text) {
        if (!text || typeof text !== 'string') return null;
        const trimmed = text.trim();

        // 1. "ri" komutu (Raf İçeriği)
        const riResult = this.processRiCommand(trimmed);
        if (riResult) return riResult;

        // 2. "ry" komutu (Raf Yeri)
        const ryResult = this.processRyCommand(trimmed);
        if (ryResult) return ryResult;

        return null;
    }

    /**
     * İstatistik ve durum bilgisi döner
     */
    getStats() {
        return {
            totalUniqueItems: this.items.length,
            totalUniqueShelves: this.shelfMap ? this.shelfMap.size : 0,
            totalRowsScanned: this.totalRowsScanned,
            sheetNames: this.sheetNames,
            excelFile: path.basename(this.excelPath),
            lastLoaded: this.lastLoaded ? this.lastLoaded.toISOString() : null,
            fileExists: fs.existsSync(this.excelPath)
        };
    }
}

// Singleton servis örneği
const stockService = new StockService();

module.exports = {
    StockService,
    stockService
};
