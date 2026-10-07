// Depo Destek Asistanı - Web Kontrol Paneli Scripti

document.addEventListener('DOMContentLoaded', () => {
    // Header & Durum Elementleri
    const connectionPill = document.getElementById('connectionPill');
    const connectionText = document.getElementById('connectionText');
    const stockBadgeHeader = document.getElementById('stockBadgeHeader');
    const stockCountText = document.getElementById('stockCountText');
    const headerBotTitle = document.getElementById('headerBotTitle');
    const headerCompanyTitle = document.getElementById('headerCompanyTitle');
    
    // QR Elements
    const qrLoading = document.getElementById('qrLoading');
    const qrImage = document.getElementById('qrImage');
    const qrConnectedNotice = document.getElementById('qrConnectedNotice');
    const connectedUserPhone = document.getElementById('connectedUserPhone');
    const qrStatusBadge = document.getElementById('qrStatusBadge');
    const btnRefreshQr = document.getElementById('btnRefreshQr');
    
    // Header Buttons
    const btnGitUpdate = document.getElementById('btnGitUpdate');
    const btnRestart = document.getElementById('btnRestart');
    const btnLogout = document.getElementById('btnLogout');
    
    // Tabs
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabPanels = document.querySelectorAll('.tab-panel');
    const liveBadge = document.getElementById('liveBadge');
    
    // Stok Arama Elementleri
    const inputStockSearch = document.getElementById('inputStockSearch');
    const btnDoStockSearch = document.getElementById('btnDoStockSearch');
    const stockResultsContainer = document.getElementById('stockResultsContainer');
    const btnReloadExcel = document.getElementById('btnReloadExcel');
    const statTotalItems = document.getElementById('statTotalItems');
    const statTotalRows = document.getElementById('statTotalRows');
    const statSheets = document.getElementById('statSheets');
    const quickTagButtons = document.querySelectorAll('.tag-btn');
    
    // Messages Stream
    const messagesStream = document.getElementById('messagesStream');
    const emptyLogsState = document.getElementById('emptyLogsState');
    const btnClearLogs = document.getElementById('btnClearLogs');
    
    // Knowledge Base
    const knowledgeTextarea = document.getElementById('knowledgeTextarea');
    const btnSaveKnowledge = document.getElementById('btnSaveKnowledge');
    
    // Sandbox
    const sandboxChatContainer = document.getElementById('sandboxChatContainer');
    const sandboxForm = document.getElementById('sandboxForm');
    const sandboxInput = document.getElementById('sandboxInput');
    const btnResetSandbox = document.getElementById('btnResetSandbox');
    
    // Settings
    const settingsForm = document.getElementById('settingsForm');
    const inputApiKey = document.getElementById('inputApiKey');
    const btnToggleApiKey = document.getElementById('btnToggleApiKey');
    const inputBotName = document.getElementById('inputBotName');
    const inputCompanyName = document.getElementById('inputCompanyName');
    const checkAutoReply = document.getElementById('checkAutoReply');
    const checkIgnoreGroups = document.getElementById('checkIgnoreGroups');
    
    // Toast
    const toast = document.getElementById('toast');

    let totalMessageCount = 0;

    // Toast Gösterici
    function showToast(message, duration = 3000) {
        toast.textContent = message;
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
        }, duration);
    }

    // Tab Değiştirme
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            tabButtons.forEach(b => b.classList.remove('active'));
            tabPanels.forEach(p => p.classList.remove('active'));

            btn.classList.add('active');
            const targetId = btn.getAttribute('data-tab');
            document.getElementById(targetId)?.classList.add('active');

            if (targetId === 'tab-stock') loadStockStats();
            if (targetId === 'tab-knowledge') loadKnowledgeBase();
            if (targetId === 'tab-settings') loadSettings();
        });
    });

    // API Key Görünürlük Butonu
    btnToggleApiKey?.addEventListener('click', () => {
        if (inputApiKey.type === 'password') {
            inputApiKey.type = 'text';
            btnToggleApiKey.textContent = 'Gizle';
        } else {
            inputApiKey.type = 'password';
            btnToggleApiKey.textContent = 'Göster';
        }
    });

    // Durum Güncellemesi
    function updateStatusUI(status, user, stockStats) {
        connectionPill.className = 'status-pill';
        
        if (status === 'connected') {
            connectionPill.classList.add('status-connected');
            const phone = user?.id ? '+' + user.id.split(':')[0] : 'Bağlandı';
            connectionText.textContent = `🟢 Bağlı: ${phone}`;
            
            qrLoading.style.display = 'none';
            qrImage.style.display = 'none';
            qrConnectedNotice.style.display = 'flex';
            connectedUserPhone.textContent = phone;
            qrStatusBadge.textContent = 'Bağlandı';
            qrStatusBadge.className = 'badge badge-success';
        } else if (status === 'qr_ready') {
            connectionPill.classList.add('status-qr_ready');
            connectionText.textContent = '🟡 QR Kod Bekleniyor';
            
            qrLoading.style.display = 'none';
            qrConnectedNotice.style.display = 'none';
            qrImage.style.display = 'block';
            qrStatusBadge.textContent = 'QR Bekleniyor';
            qrStatusBadge.className = 'badge badge-pulse';
        } else if (status === 'connecting') {
            connectionPill.classList.add('status-disconnected');
            connectionText.textContent = 'Bağlanıyor...';
            qrLoading.style.display = 'flex';
            qrImage.style.display = 'none';
            qrConnectedNotice.style.display = 'none';
            qrStatusBadge.textContent = 'Hazırlanıyor';
        } else {
            connectionPill.classList.add('status-disconnected');
            connectionText.textContent = '🔴 Bağlantı Bekleniyor';
            qrLoading.style.display = 'flex';
            qrImage.style.display = 'none';
            qrConnectedNotice.style.display = 'none';
            qrStatusBadge.textContent = 'Beklemede';
        }

        if (stockStats) {
            updateStockStatsUI(stockStats);
        }
    }

    // Stok İstatistiklerini Ekrana Bas
    function updateStockStatsUI(stats) {
        if (!stats) return;
        const total = stats.totalUniqueItems || 0;
        const totalShelves = stats.totalUniqueShelves || 0;
        if (stockCountText) {
            stockCountText.textContent = totalShelves > 0 
                ? `${total.toLocaleString('tr-TR')} Stok • ${totalShelves.toLocaleString('tr-TR')} Raf`
                : `${total.toLocaleString('tr-TR')} Stok Yüklü`;
        }
        if (statTotalItems) statTotalItems.textContent = total.toLocaleString('tr-TR');
        if (statTotalRows) statTotalRows.textContent = (stats.totalRowsScanned || 0).toLocaleString('tr-TR');
        if (statSheets && stats.sheetNames) statSheets.textContent = stats.sheetNames.join(', ');
    }

    // Stok İstatistiklerini Sunucudan Çek
    async function loadStockStats() {
        try {
            const res = await fetch('/api/stock/stats');
            const data = await res.json();
            updateStockStatsUI(data);
        } catch (e) {
            console.error('Stok istatistikleri yüklenemedi:', e);
        }
    }

    // Stok ve Raf Arama Fonksiyonu
    async function executeStockSearch(query) {
        const trimmed = (query || '').trim();
        if (!trimmed) {
            showToast('Lütfen bir stok kodu veya raf konumu yazın.');
            return;
        }

        const isShelfSearch = /^ri(\s+.*)?$/i.test(trimmed);
        const searchLabel = isShelfSearch ? `Raf: ${trimmed.replace(/^ri\s*/i, '') || '...'}` : trimmed.replace(/^ry\s*/i, '');

        stockResultsContainer.innerHTML = `
            <div class="empty-state">
                <div class="spinner"></div>
                <p style="margin-top: 12px;">"<b>${escapeHtml(searchLabel)}</b>" aranıyor...</p>
            </div>
        `;

        try {
            const res = await fetch(`/api/stock/search?q=${encodeURIComponent(trimmed)}`);
            const data = await res.json();
            if (data.mode === 'shelf') {
                renderShelfResults(data.result, data.query);
            } else {
                renderStockResults(data.result, data.query);
            }
        } catch (e) {
            stockResultsContainer.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">❌</div>
                    <h3>Arama sırasında bir hata oluştu</h3>
                    <p>${e.message}</p>
                </div>
            `;
        }
    }

    // Raf İçeriği Sonuçlarını Listele
    function renderShelfResults(result, query) {
        if (!result || result.type === 'not_found' || result.type === 'empty') {
            stockResultsContainer.innerHTML = `
                <div class="results-header-banner banner-none">
                    <span>❌ "<b>${escapeHtml(query)}</b>" raf konumu veya içinde malzeme bulunamadı.</span>
                    <span>0 Kayıt</span>
                </div>
                <div class="empty-state">
                    <div class="empty-icon">📍</div>
                    <h3>Eşleşen Raf veya Malzeme Yok</h3>
                    <p>Lütfen raf kodunu kontrol edip tekrar arayınız. (Örn: A1A, A-1A veya A1)</p>
                </div>
            `;
            return;
        }

        if (result.type === 'exact_shelf') {
            const count = result.items ? result.items.length : 0;
            let html = `
                <div class="results-header-banner banner-exact">
                    <span>📍 <b>Raf Konumu: ${escapeHtml(result.shelf)}</b> (${count} Malzeme)</span>
                    <span class="badge badge-success">Tam Raf Eşleşmesi</span>
                </div>
            `;

            result.items.forEach((item, index) => {
                const otherShelves = (item.shelves && item.shelves.length > 1)
                    ? item.shelves.filter(s => s !== result.shelf).map(s => `<span class="shelf-badge">📍 ${escapeHtml(s)}</span>`).join('')
                    : '';

                html += `
                    <div class="stock-item-card is-exact">
                        <div class="stock-info-left">
                            <div class="stock-code-row">
                                <span class="stock-code-badge">${escapeHtml(item.code || '-')}</span>
                                <span class="text-muted" style="font-size: 12px;">#${index + 1}</span>
                            </div>
                            <div class="stock-name-text">${escapeHtml(item.name || '-')}</div>
                        </div>
                        <div class="stock-shelf-right">
                            <span class="shelf-label">Bulunduğu Raf</span>
                            <div class="shelf-tags-wrap">
                                <span class="shelf-badge" style="background: rgba(16, 185, 129, 0.25); border-color: rgba(16, 185, 129, 0.5);">📍 ${escapeHtml(result.shelf)}</span>
                                ${otherShelves ? '<span class="text-muted" style="font-size: 11px; margin-left: 6px;">Diğer Raflar: ' + otherShelves + '</span>' : ''}
                            </div>
                        </div>
                    </div>
                `;
            });

            stockResultsContainer.innerHTML = html;
            return;
        }

        if (result.type === 'group_shelf') {
            let totalItemCount = 0;
            result.groups.forEach(g => { totalItemCount += g.items.length; });

            let html = `
                <div class="results-header-banner banner-similar">
                    <span>🔍 "<b>${escapeHtml(query)}</b>" ile Eşleşen <b>${result.groups.length} Raf</b> (${totalItemCount} Malzeme)</span>
                    <span class="badge badge-pulse">Raf Grubu</span>
                </div>
            `;

            result.groups.forEach(group => {
                html += `
                    <div style="margin-top: 14px; margin-bottom: 6px; display: flex; align-items: center; gap: 8px;">
                        <span class="shelf-badge" style="font-size: 13px; font-weight: 700; background: rgba(59, 130, 246, 0.2); border-color: rgba(59, 130, 246, 0.4);">📍 Raf: ${escapeHtml(group.rawShelf)}</span>
                        <span class="text-muted" style="font-size: 12px;">(${group.items.length} ürün)</span>
                    </div>
                `;

                group.items.forEach((item, index) => {
                    html += `
                        <div class="stock-item-card is-similar" style="padding: 10px 16px; margin-bottom: 6px;">
                            <div class="stock-info-left">
                                <div class="stock-code-row">
                                    <span class="stock-code-badge" style="font-size: 12px;">${escapeHtml(item.code || '-')}</span>
                                </div>
                                <div class="stock-name-text" style="font-size: 13px;">${escapeHtml(item.name || '-')}</div>
                            </div>
                            <div class="stock-shelf-right">
                                <span class="shelf-badge">📍 ${escapeHtml(group.rawShelf)}</span>
                            </div>
                        </div>
                    `;
                });
            });

            stockResultsContainer.innerHTML = html;
        }
    }

    // Stok Sonuçlarını Kartlar Halinde Listele
    function renderStockResults(result, query) {
        if (!result || result.type === 'not_found' || !result.results || result.results.length === 0) {
            stockResultsContainer.innerHTML = `
                <div class="results-header-banner banner-none">
                    <span>❌ "<b>${escapeHtml(query)}</b>" kriterine uygun stok bulunamadı.</span>
                    <span>0 Kayıt</span>
                </div>
                <div class="empty-state">
                    <div class="empty-icon">🔍</div>
                    <h3>Eşleşen Stok Kaydı Yok</h3>
                    <p>Lütfen stok kodunu veya parça adını kontrol edip tekrar arayınız.</p>
                </div>
            `;
            return;
        }

        const isExact = result.type === 'exact';
        const bannerClass = isExact ? 'banner-exact' : 'banner-similar';
        const bannerIcon = isExact ? '✅' : '⚠️';
        const bannerTitle = isExact 
            ? `Birebir Eşleşen Stok Bulundu (${result.results.length} Kayıt)`
            : `"${escapeHtml(query)}" için Birebir Kayıt Bulunamadı. Benzer Stoklar (${result.results.length} Kayıt)`;

        let html = `
            <div class="results-header-banner ${bannerClass}">
                <span>${bannerIcon} <b>${bannerTitle}</b></span>
                <span class="badge ${isExact ? 'badge-success' : 'badge-pulse'}">${isExact ? 'Birebir Uyum' : 'Benzer Stoklar'}</span>
            </div>
        `;

        result.results.forEach((item, index) => {
            const shelves = (item.shelves && item.shelves.length > 0)
                ? item.shelves.map(s => `<span class="shelf-badge">📍 ${escapeHtml(s)}</span>`).join('')
                : `<span class="shelf-badge empty">Belirtilmemiş</span>`;

            html += `
                <div class="stock-item-card ${isExact ? 'is-exact' : 'is-similar'}">
                    <div class="stock-info-left">
                        <div class="stock-code-row">
                            <span class="stock-code-badge">${escapeHtml(item.code || '-')}</span>
                            ${isExact ? '<span class="badge badge-success" style="font-size: 11px;">Tam Eşleşme</span>' : `<span class="text-muted" style="font-size: 12px;">#${index + 1}</span>`}
                        </div>
                        <div class="stock-name-text">${escapeHtml(item.name || '-')}</div>
                    </div>
                    <div class="stock-shelf-right">
                        <span class="shelf-label">Raf Konumu</span>
                        <div class="shelf-tags-wrap">
                            ${shelves}
                        </div>
                    </div>
                </div>
            `;
        });

        stockResultsContainer.innerHTML = html;
    }

    // Arama Buton & Enter Olayları
    btnDoStockSearch?.addEventListener('click', () => {
        executeStockSearch(inputStockSearch.value);
    });

    inputStockSearch?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            executeStockSearch(inputStockSearch.value);
        }
    });

    // Hızlı Örnek Etiketleri
    quickTagButtons.forEach(tag => {
        tag.addEventListener('click', () => {
            const q = tag.getAttribute('data-query');
            inputStockSearch.value = q;
            executeStockSearch(q);
        });
    });

    // Excel Dosyasını Yeniden Yükle
    btnReloadExcel?.addEventListener('click', async () => {
        try {
            btnReloadExcel.disabled = true;
            btnReloadExcel.textContent = 'Yenileniyor...';
            const res = await fetch('/api/stock/reload', { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                showToast('✅ ' + data.message);
                updateStockStatsUI(data.stats);
            } else {
                showToast('❌ ' + data.message);
            }
        } catch (e) {
            showToast('❌ Yenileme sırasında hata oluştu.');
        } finally {
            btnReloadExcel.disabled = false;
            btnReloadExcel.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg> Excel'i Yenile`;
        }
    });

    // Mesaj Logu Ekle
    function addMessageToStream(log, isPrepend = true) {
        if (emptyLogsState) emptyLogsState.style.display = 'none';

        const pair = document.createElement('div');
        pair.className = 'message-pair';

        const timeStr = new Date(log.timestamp).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
        
        let sourceBadge = '📦 Depo Asistanı';
        if (log.source && log.source.includes('exact')) sourceBadge = '✅ Birebir Stok';
        else if (log.source && log.source.includes('similar')) sourceBadge = '⚠️ Benzer Stoklar';

        pair.innerHTML = `
            <div class="msg-bubble msg-incoming">
                <div class="msg-header">
                    <span><b>👤 ${log.fromName || 'Depo Çalışanı'}</b> (+${log.from})</span>
                    <span>${timeStr}</span>
                </div>
                <div><code>${escapeHtml(log.incomingMessage)}</code></div>
            </div>
            <div class="msg-bubble msg-outgoing">
                <div class="msg-header">
                    <span><b>📦 Depo Destek Asistanı</b></span>
                    <span class="msg-badge">${sourceBadge}</span>
                </div>
                <div style="white-space: pre-wrap; font-family: inherit;">${escapeHtml(log.replyMessage)}</div>
            </div>
        `;

        if (isPrepend) {
            messagesStream.prepend(pair);
        } else {
            messagesStream.appendChild(pair);
        }

        totalMessageCount++;
        if (liveBadge) liveBadge.textContent = totalMessageCount;
    }

    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // WebSocket Bağlantısı
    function connectWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws`;
        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            console.log('[WS] WebSocket bağlantısı kuruldu.');
        };

        ws.onmessage = (event) => {
            try {
                const payload = JSON.parse(event.data);
                const { type, data } = payload;

                if (type === 'initial_state') {
                    updateStatusUI(data.status, data.user, data.stockStats);
                    if (data.qrDataUrl) {
                        qrImage.src = data.qrDataUrl;
                    }
                    if (data.logs && data.logs.length > 0) {
                        messagesStream.innerHTML = '';
                        data.logs.forEach(l => addMessageToStream(l, false));
                    }
                } else if (type === 'status_change') {
                    updateStatusUI(data.status, data.user, null);
                } else if (type === 'qr') {
                    if (data.qrDataUrl) {
                        qrImage.src = data.qrDataUrl;
                        updateStatusUI('qr_ready', null, null);
                    }
                } else if (type === 'new_message') {
                    addMessageToStream(data, true);
                }
            } catch (err) {
                console.error('[WS] Mesaj işleme hatası:', err);
            }
        };

        ws.onclose = () => {
            console.log('[WS] Bağlantı kapandı. 3 saniye içinde yeniden bağlanılıyor...');
            setTimeout(connectWebSocket, 3000);
        };
    }

    // Bilgi Bankasını Yükle
    async function loadKnowledgeBase() {
        try {
            const res = await fetch('/api/knowledge');
            const data = await res.json();
            knowledgeTextarea.value = data.content || '';
        } catch (e) {
            showToast('Bilgi bankası yüklenirken hata oluştu');
        }
    }

    // Bilgi Bankasını Kaydet
    btnSaveKnowledge?.addEventListener('click', async () => {
        const content = knowledgeTextarea.value;
        try {
            btnSaveKnowledge.disabled = true;
            btnSaveKnowledge.textContent = 'Kaydediliyor...';
            
            const res = await fetch('/api/knowledge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content })
            });
            const data = await res.json();
            if (data.success) {
                showToast('✅ Bilgi bankası başarıyla kaydedildi!');
            }
        } catch (e) {
            showToast('❌ Kayıt sırasında hata oluştu');
        } finally {
            btnSaveKnowledge.disabled = false;
            btnSaveKnowledge.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Değişiklikleri Kaydet`;
        }
    });

    // Ayarları Yükle
    async function loadSettings() {
        try {
            const res = await fetch('/api/config');
            const data = await res.json();
            inputBotName.value = data.botName || 'Depo Destek Asistanı';
            inputCompanyName.value = data.companyName || 'Depo & Lojistik Yönetimi';
            checkAutoReply.checked = data.autoReply !== false;
            checkIgnoreGroups.checked = data.ignoreGroups === true;

            if (headerBotTitle) headerBotTitle.textContent = data.botName || 'Depo Destek Asistanı';
            if (headerCompanyTitle) headerCompanyTitle.textContent = data.companyName ? `${data.companyName} Stok & Raf Paneli` : 'WhatsApp Stok Kodu & Raf Yeri Otomasyonu';
        } catch (e) {
            console.error('Ayarlar yüklenemedi:', e);
        }
    }

    // Ayarları Kaydet
    settingsForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const payload = {
            apiKey: inputApiKey.value,
            botName: inputBotName.value,
            companyName: inputCompanyName.value,
            autoReply: checkAutoReply.checked,
            ignoreGroups: checkIgnoreGroups.checked
        };

        try {
            const res = await fetch('/api/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.success) {
                showToast('✅ Ayarlar başarıyla kaydedildi!');
                loadSettings();
            }
        } catch (err) {
            showToast('❌ Ayarlar kaydedilirken hata oluştu');
        }
    });

    // Sandbox Hızlı Test Butonları
    document.querySelectorAll('.btn-paste-test').forEach(btn => {
        btn.addEventListener('click', () => {
            const cmd = btn.getAttribute('data-test');
            sandboxInput.value = cmd;
            sandboxForm.dispatchEvent(new Event('submit'));
        });
    });

    // Sandbox Test Chat
    sandboxForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const message = sandboxInput.value.trim();
        if (!message) return;

        // Kullanıcı baloncuğunu ekle
        const userBubble = document.createElement('div');
        userBubble.className = 'chat-bubble user-bubble';
        userBubble.innerHTML = `<div class="bubble-sender" style="color: #a7f3d0;">Depo Çalışanı</div><div><code>${escapeHtml(message)}</code></div>`;
        sandboxChatContainer.appendChild(userBubble);
        sandboxInput.value = '';
        sandboxChatContainer.scrollTop = sandboxChatContainer.scrollHeight;

        // Bekleme efekti
        const loadingBubble = document.createElement('div');
        loadingBubble.className = 'chat-bubble bot-bubble';
        loadingBubble.innerHTML = `<div class="bubble-sender">📦 Depo Destek Asistanı</div><div class="text-muted">Stok ve raf aranıyor... 🔍</div>`;
        sandboxChatContainer.appendChild(loadingBubble);
        sandboxChatContainer.scrollTop = sandboxChatContainer.scrollHeight;

        try {
            const res = await fetch('/api/test-ai', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message, userName: 'Depo Çalışanı' })
            });
            const data = await res.json();

            let sourceLabel = '📦 Depo Motoru';
            if (data.source && data.source.includes('exact')) sourceLabel = '✅ Birebir';
            else if (data.source && data.source.includes('similar')) sourceLabel = '⚠️ Benzer';

            loadingBubble.innerHTML = `
                <div class="bubble-sender">📦 Depo Destek Asistanı <span class="msg-badge" style="font-size: 10px; margin-left: 6px;">${sourceLabel}</span></div>
                <div style="white-space: pre-wrap;">${escapeHtml(data.text)}</div>
            `;
        } catch (err) {
            loadingBubble.innerHTML = `<div class="bubble-sender" style="color: #ef4444;">Hata</div><div>Yanıt alınırken hata oluştu.</div>`;
        }
        sandboxChatContainer.scrollTop = sandboxChatContainer.scrollHeight;
    });

    // Sandbox Sıfırla
    btnResetSandbox?.addEventListener('click', async () => {
        await fetch('/api/test-ai/reset', { method: 'POST' });
        sandboxChatContainer.innerHTML = `
            <div class="chat-bubble bot-bubble">
                <div class="bubble-sender">📦 Depo Destek Asistanı</div>
                <div class="bubble-content">Sohbet sıfırlandı. <code>ry [kod veya isim]</code> yazarak stok sorgulayabilirsiniz! ✨</div>
            </div>
        `;
        showToast('Test sohbeti sıfırlandı.');
    });

    // Yeniden Başlat & Çıkış Butonları
    btnRestart?.addEventListener('click', async () => {
        if (confirm('WhatsApp botunu yeniden başlatmak istiyor musunuz?')) {
            showToast('Bot yeniden başlatılıyor...');
            await fetch('/api/bot/restart', { method: 'POST' });
        }
    });

    btnLogout?.addEventListener('click', async () => {
        if (confirm('Mevcut WhatsApp oturumunu kapatıp yeni bir QR kod oluşturmak istiyor musunuz?')) {
            showToast('Oturum sonlandırılıyor...');
            await fetch('/api/bot/logout', { method: 'POST' });
        }
    });

    btnRefreshQr?.addEventListener('click', async () => {
        await fetch('/api/bot/restart', { method: 'POST' });
        showToast('QR Kod yenileniyor...');
    });

    btnClearLogs?.addEventListener('click', () => {
        messagesStream.innerHTML = `
            <div class="empty-state" id="emptyLogsState">
                <div class="empty-icon">📬</div>
                <h3>Akış temizlendi</h3>
                <p>Yeni mesajlar geldiğinde burada görünecektir.</p>
            </div>
        `;
        totalMessageCount = 0;
        if (liveBadge) liveBadge.textContent = '0';
    });

    // Git Sunucusundan Güncelleme (raf-yeri-takip)
    btnGitUpdate?.addEventListener('click', async () => {
        if (confirm('Git sunucusundan (raf-yeri-takip) en son güncellemeler çekilsin mi?')) {
            showToast('Git güncellemeleri kontrol ediliyor...');
            btnGitUpdate.disabled = true;
            try {
                const res = await fetch('/api/system/update', { method: 'POST' });
                const data = await res.json();
                if (data.success) {
                    showToast('✅ Program güncellendi! Yeniden başlatılıyor...');
                    setTimeout(() => window.location.reload(), 2500);
                } else {
                    showToast('⚠️ Güncelleme bildirimi: ' + (data.error || 'İşlem tamamlanamadı.'));
                }
            } catch (err) {
                showToast('❌ Güncelleme sırasında bağlantı hatası oluştu.');
            } finally {
                btnGitUpdate.disabled = false;
            }
        }
    });

    // Başlangıç Yüklemeleri
    connectWebSocket();
    loadStockStats();
    loadSettings();
    loadKnowledgeBase();
});
