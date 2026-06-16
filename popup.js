
// DOM Elements - will be initialized after DOM loads
const DEBUG = false; // Set to true only when you need very detailed console logs
let loadingOverlay, loginSection, automationSection, emailInput, passwordInput;
let loginButton, googleLoginButton, switchAccountButton, websiteButton, loginError, logoutButton;
let userEmailSpan, subscriptionStatusSpan, upgradeButton, quotaDisplay, expiryDisplay;
let csvFileInput, fileNameDisplay, bulanSelect, tahunSelect, aksiSelect, startBtn, downloadBtn, stopBtn, statusLog, clearLogBtn, downloadTemplateLink, exportLogBtn, exportReportBtn, versionBadge;
let turboModeToggle, turboStatusLabel;
const sanitizeLogMessage = (value) => {
    if (typeof value !== "string") {
        return value;
    }
    let output = "";
    for (let i = 0; i < value.length; i++) {
        const code = value.charCodeAt(i);
        if (code === 9 || code === 10 || code === 13 || (code >= 32 && code <= 126)) {
            output += value[i];
        }
    }
    return output;
};
let csvContent = '';
let isQuotaUpdated = false;  // Flag to prevent double quota consumption

function updateTurboStatusLabel(isOn) {
    if (!turboStatusLabel) return;
    turboStatusLabel.textContent = isOn ? 'ON' : 'OFF';
    turboStatusLabel.classList.toggle('turbo-on', isOn);
    turboStatusLabel.classList.toggle('turbo-off', !isOn);
}

function updateVersionDisplay() {
    if (!versionBadge || !chrome?.runtime?.getManifest) {
        return;
    }
    try {
        const manifest = chrome.runtime.getManifest();
        if (manifest?.version) {
            const versionText = `v${manifest.version}`;
            versionBadge.textContent = versionText;
            versionBadge.setAttribute('title', `Versi ${manifest.version}`);
        }
    } catch (error) {
        console.warn('Popup: Tidak dapat membaca versi ekstensi:', error);
    }
}

// Functions for real-time logs
const renderLogs = (logs = []) => {
    const statusLog1 = document.getElementById('status-log');
    const statusLog2 = document.getElementById('status-log-fitur');
    
    if (!statusLog1 && !statusLog2) return;

    if (statusLog1) statusLog1.replaceChildren();
    if (statusLog2) statusLog2.replaceChildren();

    if (!Array.isArray(logs) || logs.length === 0) {
        if (statusLog1) statusLog1.textContent = 'Status: Menunggu perintah...';
        if (statusLog2) statusLog2.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:16px;">Log akan muncul di sini saat proses berjalan</td></tr>';
        
        // Reset stats
        const statSukses = document.getElementById('stat-sukses');
        const statGagal = document.getElementById('stat-gagal');
        const statSkip = document.getElementById('stat-skip');
        const statDurasi = document.getElementById('stat-durasi');
        if(statSukses) statSukses.textContent = '0';
        if(statGagal) statGagal.textContent = '0';
        if(statSkip) statSkip.textContent = '0';
        if(statDurasi) statDurasi.textContent = '00:00';
    } else {
        const fragment1 = document.createDocumentFragment();
        const fragment2 = document.createDocumentFragment();
        
        let countSukses = 0;
        let countGagal = 0;
        let countSkip = 0;
        
        let firstLogTime = null;
        let lastLogTime = null;

        logs.forEach((entry) => {
            const rawEntry = typeof entry === 'string' ? entry : String(entry ?? '');
            const safeText = sanitizeLogMessage(rawEntry);
            
            const logLine1 = document.createElement('div');
            logLine1.textContent = safeText;
            fragment1.appendChild(logLine1);
            
            // Tab 2 Table Row
            const timeMatch = safeText.match(/^\[(.*?)\]\s*(.*)/);
            const waktu = timeMatch ? timeMatch[1] : '';
            const restOfText = timeMatch ? timeMatch[2] : safeText;
            
            if (timeMatch) {
                const d = new Date(new Date().toDateString() + " " + timeMatch[1]);
                if (!isNaN(d.getTime())) {
                    if (!firstLogTime) firstLogTime = d.getTime();
                    lastLogTime = d.getTime();
                }
            }
            
            let statusHtml = '';
            let bgRow = '';
            let isInfo = true;
            
            if (restOfText.includes('[BERHASIL]')) {
                statusHtml = '<span style="background:#dcfce7; color:#166534; padding:2px 6px; border-radius:4px; font-weight:bold;">SUKSES</span>';
                bgRow = 'background-color: #f0fdf4;';
                isInfo = false;
                countSukses++;
            } else if (restOfText.includes('[GAGAL]')) {
                statusHtml = '<span style="background:#fee2e2; color:#991b1b; padding:2px 6px; border-radius:4px; font-weight:bold;">GAGAL</span>';
                bgRow = 'background-color: #fef2f2;';
                isInfo = false;
                countGagal++;
            } else if (restOfText.includes('[LEWAT]') || restOfText.includes('[SKIP]')) {
                statusHtml = '<span style="background:#fef9c3; color:#854d0e; padding:2px 6px; border-radius:4px; font-weight:bold;">SKIP</span>';
                bgRow = 'background-color: #fffbeb;';
                isInfo = false;
                countSkip++;
            } else if (restOfText.includes('[PROSES]')) {
                statusHtml = '<span style="background:#dbeafe; color:#1e40af; padding:2px 6px; border-radius:4px; font-weight:bold;">PROSES</span>';
                isInfo = false;
            }
            
            if (!isInfo) {
                const logLine2 = document.createElement('tr');
                let noFaktur = '-';
                const fakturMatch = restOfText.match(/Faktur (\d+)/i);
                if (fakturMatch) {
                    noFaktur = fakturMatch[1];
                }
                
                if (bgRow) logLine2.style = bgRow;
                
                logLine2.innerHTML = `
                    <td style="padding: 6px; border-bottom: 1px solid var(--border-color); white-space: nowrap;">${waktu}</td>
                    <td style="padding: 6px; border-bottom: 1px solid var(--border-color); font-family: monospace;">${noFaktur}</td>
                    <td style="padding: 6px; border-bottom: 1px solid var(--border-color);">${statusHtml}</td>
                    <td style="padding: 6px; border-bottom: 1px solid var(--border-color);">${restOfText}</td>
                `;
                fragment2.appendChild(logLine2);
            }
        });
        if (statusLog1) statusLog1.appendChild(fragment1);
        if (statusLog2) statusLog2.appendChild(fragment2);
        
        // Update stats UI
        const statSukses = document.getElementById('stat-sukses');
        const statGagal = document.getElementById('stat-gagal');
        const statSkip = document.getElementById('stat-skip');
        const statDurasi = document.getElementById('stat-durasi');
        if(statSukses) statSukses.textContent = countSukses;
        if(statGagal) statGagal.textContent = countGagal;
        if(statSkip) statSkip.textContent = countSkip;
        if(statDurasi && firstLogTime && lastLogTime) {
            let diffSec = Math.floor((lastLogTime - firstLogTime) / 1000);
            if(diffSec < 0) diffSec = 0;
            const m = Math.floor(diffSec / 60).toString().padStart(2, '0');
            const s = (diffSec % 60).toString().padStart(2, '0');
            statDurasi.textContent = `${m}:${s}`;
        }
    }

    if (statusLog1) statusLog1.scrollTop = statusLog1.scrollHeight;
    // For table, we scroll the parent container
    if (statusLog2 && statusLog2.parentElement && statusLog2.parentElement.parentElement) {
        statusLog2.parentElement.parentElement.scrollTop = statusLog2.parentElement.parentElement.scrollHeight;
    }
};

const updateAndSaveStatus = (message) => {
    const timestamp = new Date().toLocaleTimeString();
    const safeMessage = sanitizeLogMessage(typeof message === 'string' ? message : String(message ?? ''));
    const newLogEntry = `[${timestamp}] ${safeMessage}`;

    chrome.storage.local.get({ efakturLogs: [] }, (result) => {
        const logs = Array.isArray(result.efakturLogs) ? result.efakturLogs : [];
        logs.push(newLogEntry); // Add to the end for chronological order (newest at bottom)
        if (logs.length > 1000) logs.splice(0, logs.length - 1000); // Keep last 1000 logs, remove oldest
        chrome.storage.local.set({ efakturLogs: logs }, () => {
            renderLogs(logs);
        });
    });
};

const sanitizeProviderData = (providerData) => {
    if (!Array.isArray(providerData)) {
        return [];
    }
    return providerData
        .map((provider) => provider && provider.providerId ? { providerId: provider.providerId } : null)
        .filter(Boolean);
};

const buildUserMetadata = (user, loginMethod) => {
    if (!user) {
        return null;
    }

    const uid = user.uid || user.localId || null;
    if (!uid) {
        return null;
    }

    return {
        uid,
        email: user.email || '',
        displayName: user.displayName || '',
        providerData: sanitizeProviderData(user.providerData),
        loginMethod: loginMethod || user.loginMethod || null,
        loginTime: Date.now()
    };
};

const persistUserMetadata = (metadata) => new Promise((resolve) => {
    chrome.storage.local.set({ currentUserMeta: metadata }, resolve);
});

const clearUserMetadata = () => new Promise((resolve) => {
    chrome.storage.local.remove(['currentUserMeta'], resolve);
});

// --- Loading Indicator Functions ---
function showLoading() {
    if (loadingOverlay) loadingOverlay.style.display = 'flex';
}

function hideLoading() {
    if (loadingOverlay) loadingOverlay.style.display = 'none';
}

// --- Subscription Status Functions ---
function hashEmailToId(email) {
    let h = 0;
    for (let i = 0; i < email.length; i++) {
        h = ((h << 5) - h) + email.charCodeAt(i);
        h |= 0;
    }
    return 'em_' + (h >>> 0).toString(16);
}

async function checkSubscriptionStatus() {
    return {
        status: "active",
        type: "Premium",
        expiryDate: new Date("2099-12-31").getTime(),
        quotaTotal: 999999,
        quotaUsed: 0
    };
}

function updateSubscriptionUI(subscriptionData) {
    if (!subscriptionStatusSpan || !subscriptionData) return;

    const statusBadge = subscriptionStatusSpan;
    statusBadge.textContent = subscriptionData.type || "Tidak diketahui";
    statusBadge.classList.remove("active", "expired", "trial");
    statusBadge.classList.add("active");
    if (upgradeButton) upgradeButton.style.display = "none";
}

async function updatePremiumQuotaUsed(invoicesProcessed) {
    return { success: true, message: "Quota updated" };
}

async function updateFreeQuotaUsed(invoicesProcessed) {
    return { success: true, message: "Free quota updated" };
}
function formatDisplayDate(dateValue) {
    if (!dateValue) return null;
    const parsedDate = dateValue instanceof Date ? new Date(dateValue.getTime()) : new Date(dateValue);
    if (Number.isNaN(parsedDate.getTime())) {
        return null;
    }
    try {
        return parsedDate.toLocaleDateString('id-ID', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
    } catch (error) {
        return parsedDate.toISOString().slice(0, 10);
    }
}

function updateQuotaUI(subscriptionData) {
    if (!quotaDisplay || !subscriptionData) return;

    const quotaTotal = Number(subscriptionData.quotaTotal) || 0;
    const quotaUsed = Number(subscriptionData.quotaUsed) || 0;
    const sisaKuota = Math.max(quotaTotal - quotaUsed, 0);

    quotaDisplay.classList.remove('expired', 'active', 'trial');

    if (quotaTotal <= 0) {
        quotaDisplay.textContent = 'Tidak ada kuota';
        quotaDisplay.title = 'Langganan Anda tidak menyediakan kuota aktif.';
        quotaDisplay.classList.add('expired');
        return;
    }

    quotaDisplay.textContent = `${sisaKuota} / ${quotaTotal}`;

    const isPremium = subscriptionData.status === 'active';

    if (sisaKuota <= 0) {
        quotaDisplay.classList.add('expired');
        quotaDisplay.title = isPremium
            ? 'Kuota Anda telah habis. Akan direset pada siklus berikutnya.'
            : 'Kuota gratis Anda telah habis. Akan direset bulan depan.';
    } else if (sisaKuota <= Math.ceil(quotaTotal * 0.2)) {
        quotaDisplay.classList.add('trial');
        quotaDisplay.title = isPremium
            ? `Kuota hampir habis. Tersisa ${sisaKuota} dari ${quotaTotal}.`
            : `Kuota gratis hampir habis. Tersisa ${sisaKuota} dari ${quotaTotal}.`;
    } else {
        quotaDisplay.classList.add(isPremium ? 'active' : 'trial');
        quotaDisplay.title = isPremium
            ? `Anda telah menggunakan ${quotaUsed} dari ${quotaTotal} kuota bulanan.`
            : `Anda memiliki ${sisaKuota} kuota gratis tersisa bulan ini.`;
    }
}

function updateExpiryUI(subscriptionData) {
    if (!expiryDisplay || !subscriptionData) return;

    expiryDisplay.classList.remove('expired', 'active', 'trial');
    expiryDisplay.title = '';

    if (!subscriptionData.expiryDate) {
        if (subscriptionData.status === 'free') {
            expiryDisplay.textContent = 'Tidak terbatas';
            expiryDisplay.title = 'Langganan gratis tanpa tanggal kedaluwarsa.';
            expiryDisplay.classList.add('trial');
        } else if (subscriptionData.status === 'trial') {
            expiryDisplay.textContent = 'Belum tersedia';
            expiryDisplay.title = 'Tanggal akhir masa trial belum tersedia.';
            expiryDisplay.classList.add('trial');
        } else {
            expiryDisplay.textContent = 'Tidak tersedia';
            expiryDisplay.title = 'Tanggal kedaluwarsa tidak ditemukan.';
        }
        return;
    }

    const expiryDate = new Date(subscriptionData.expiryDate);
    if (Number.isNaN(expiryDate.getTime())) {
        expiryDisplay.textContent = 'Tanggal tidak valid';
        expiryDisplay.title = subscriptionData.expiryDate;
        expiryDisplay.classList.add('expired');
        return;
    }

    const formattedDate = formatDisplayDate(expiryDate) || expiryDate.toISOString().slice(0, 10);
    expiryDisplay.textContent = formattedDate;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const expiryStart = new Date(expiryDate);
    expiryStart.setHours(0, 0, 0, 0);
    const diffDays = Math.round((expiryStart.getTime() - todayStart.getTime()) / MS_PER_DAY);

    if (diffDays < 0) {
        expiryDisplay.classList.add('expired');
        expiryDisplay.title = `Langganan kedaluwarsa pada ${formattedDate}.`;
    } else if (diffDays === 0) {
        expiryDisplay.classList.add('trial');
        expiryDisplay.title = `Langganan kedaluwarsa hari ini (${formattedDate}).`;
    } else if (diffDays <= 7) {
        expiryDisplay.classList.add('trial');
        expiryDisplay.title = `Langganan kedaluwarsa dalam ${diffDays} hari (${formattedDate}).`;
    } else {
        expiryDisplay.classList.add('active');
        expiryDisplay.title = `Langganan aktif sampai ${formattedDate}.`;
    }
}

function showLoginSection() {
    hideLoading();
    if (loginSection) loginSection.style.display = 'block';
    if (automationSection) automationSection.style.display = 'none';
    if (typeof switchAccountButton !== 'undefined' && switchAccountButton) switchAccountButton.style.display = 'none';
    hideTabNavigation(); // Hide tabs on login page
}

// Fungsi untuk mengaktifkan atau menonaktifkan elemen UI otomatisasi
function toggleAutomationUI(enable) {
    if (csvFileInput) csvFileInput.disabled = !enable;
    if (bulanSelect) bulanSelect.disabled = !enable;
    if (tahunSelect) tahunSelect.disabled = !enable;
    if (aksiSelect) aksiSelect.disabled = !enable;
    if (turboModeToggle) turboModeToggle.disabled = !enable;
    if (downloadTemplateLink) downloadTemplateLink.style.pointerEvents = enable ? 'auto' : 'none';
}

function showAutomationSection() {
    hideLoading();
    const loginError = document.getElementById('login-error');
    if (loginError) loginError.textContent = ''; // Bersihkan pesan error saat login berhasil
    
    // Perbarui label status berdasarkan status server
    updateServerStatusLabel(isServerValid);
    
    if (loginSection) loginSection.style.display = 'none';
    if (automationSection) automationSection.style.display = 'block';
    showTabNavigation(); // Show tabs when logged in

    // Reset turbo mode to OFF by default on each session
    if (turboModeToggle) {
        turboModeToggle.checked = false;
        updateTurboStatusLabel(false);
        chrome.storage.local.set({ turboMode: false });
    }

    updateQuotaUI(subscriptionData);
    updateExpiryUI(subscriptionData);

    // Enable automation if user has quota, regardless of subscription status
    const totalQuota = Number(subscriptionData.quotaTotal) || 0;
    const usedQuota = Number(subscriptionData.quotaUsed) || 0;
    const remainingQuota = Math.max(totalQuota - usedQuota, 0);
    const hasQuota = remainingQuota > 0;

    // Automation enabled if has quota
    toggleAutomationUI(hasQuota);

    if (!hasQuota) {
        updateAndSaveStatus('Error: Kuota Anda telah habis. Proses tidak dapat dijalankan.');
    } else {
        updateAndSaveStatus(`Kuota tersedia: ${remainingQuota} dari ${totalQuota}`);
    }
}

// Initialize DOM elements and event listeners
function initializeElements() {
    // DOM Elements
    loadingOverlay = document.getElementById('loading-overlay');
    loginSection = document.getElementById('login-section');
    automationSection = document.getElementById('automation-section');
    emailInput = document.getElementById('email');
    passwordInput = document.getElementById('password');
    loginButton = document.getElementById('loginButton');
    googleLoginButton = document.getElementById('googleLoginButton');
    switchAccountButton = document.getElementById('switchAccountButton');
    websiteButton = document.getElementById('websiteButton');
    loginError = document.getElementById('loginError');
    logoutButton = document.getElementById('logoutButton');

    // User Info Elements
    userEmailSpan = document.getElementById('userEmail');
    subscriptionStatusSpan = document.getElementById('subscriptionStatus');
    upgradeButton = document.getElementById('upgradeButton');
    quotaDisplay = document.getElementById('quotaDisplay');
    expiryDisplay = document.getElementById('expiryDisplay');

    // Automation UI Elements
    csvFileInput = document.getElementById('csv-file-input');
    fileNameDisplay = document.getElementById('file-name');
    bulanSelect = document.getElementById('bulan-select');
    tahunSelect = document.getElementById('tahun-select');
    aksiSelect = document.getElementById('aksi-select');
    startBtn = document.getElementById('start-btn');
    downloadBtn = document.getElementById('download-btn');
    stopBtn = document.getElementById('stop-btn');
    statusLog = document.getElementById('status-log');
    clearLogBtn = document.getElementById('clear-log-btn');
    downloadTemplateLink = document.getElementById('download-template-link');
    versionBadge = document.getElementById('version-badge');
    turboModeToggle = document.getElementById('turbo-mode-toggle');
    turboStatusLabel = document.getElementById('turbo-status');

    updateVersionDisplay();

    // Restore turbo mode state from storage
    chrome.storage.local.get({ turboMode: false }, (result) => {
        if (turboModeToggle) {
            turboModeToggle.checked = result.turboMode;
            updateTurboStatusLabel(result.turboMode);
        }
    });
}

// Add event listeners
function addEventListeners() {
    if (loginButton) {
        loginButton.addEventListener('click', handleLogin);
    }

    if (googleLoginButton) {
        googleLoginButton.addEventListener('click', handleGoogleLogin);
    }

    if (switchAccountButton) {
        switchAccountButton.addEventListener('click', handleSwitchAccount);
    }

    if (websiteButton) {
        websiteButton.addEventListener('click', () => {
            chrome.tabs.create({ url: 'https://alatpajak.id' });
        });
    }

    if (upgradeButton) {
        upgradeButton.addEventListener('click', () => {
            chrome.tabs.create({ url: 'https://alatpajak.id/pricing' });
        });
    }

    if (logoutButton) {
        logoutButton.addEventListener('click', handleLogout);
    }

    if (csvFileInput) {
        csvFileInput.addEventListener('change', handleFileChange);
    }

    if (startBtn) {
        startBtn.addEventListener('click', handleStart);
    }

    if (downloadBtn) {
        downloadBtn.addEventListener('click', handleDownload);
    }

    // Initialize month checkboxes with max 2 validation
    initMonthCheckboxes();

    if (stopBtn) {
        stopBtn.addEventListener('click', handleStop);
    }

    if (clearLogBtn) {
        clearLogBtn.addEventListener('click', handleClearLog);
    }
    
    const btnExportCSV = document.getElementById('btnExportCSV');
    if (btnExportCSV) {
        btnExportCSV.addEventListener('click', handleExportCSV);
    }
    
    const btnHapusLogFitur = document.getElementById('btnHapusLogFitur');
    if (btnHapusLogFitur) {
        btnHapusLogFitur.addEventListener('click', handleClearLog);
    }

    if (downloadTemplateLink) {
        downloadTemplateLink.addEventListener('click', handleDownloadTemplate);
    }

    if (aksiSelect) {
        aksiSelect.addEventListener('change', handleAksiChange);
    }

    // Turbo Mode toggle
    if (turboModeToggle) {
        turboModeToggle.addEventListener('change', () => {
            const isOn = turboModeToggle.checked;
            chrome.storage.local.set({ turboMode: isOn });
            updateTurboStatusLabel(isOn);
            console.log(`Popup: Turbo Mode ${isOn ? 'ON' : 'OFF'}`);
        });
    }

    // Export Log handler
    exportLogBtn = document.getElementById('export-log-btn');
    if (exportLogBtn) {
        exportLogBtn.addEventListener('click', async () => {
            try {
                const result = await new Promise(resolve => chrome.storage.local.get({ efakturLogs: [] }, resolve));
                const logs = Array.isArray(result.efakturLogs) ? result.efakturLogs : [];
                const blob = new Blob([logs.join('\n')], { type: 'text/plain;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `efaktur_logs_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.txt`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                updateAndSaveStatus(' Log diekspor ke file TXT.');
            } catch (e) {
                console.error('Popup: Gagal export log:', e);
                updateAndSaveStatus(' Gagal export log.');
            }
        });
    }
    exportReportBtn = document.getElementById('export-report-btn');
    if (exportReportBtn) {
        exportReportBtn.addEventListener('click', handleExportReport);
    }


    // Add runtime message listener
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (sender?.id && sender.id !== chrome.runtime.id) {
            console.warn('Popup: Ignoring message from unknown sender:', sender?.id);
            return;
        }
        if (request.type === 'automation-status') {
            console.log('Popup:  RECEIVED automation-status message:', {
                statusType: request.statusType,
                message: request.message,
                invoicesProcessed: request.invoicesProcessed,
                isFinalCompletion: request.isFinalCompletion,
                isQuotaUpdated: isQuotaUpdated
            });

            const safeMessage = typeof request.message === 'string' ? request.message : String(request.message ?? '');
            updateAndSaveStatus(safeMessage);

            const isFinished = request.statusType === 'success' || request.statusType === 'error' || request.statusType === 'final' || request.statusType === 'final_completion' || request.statusType === 'stopped';
            const isStopped = request.statusType === 'stopped';

            if (isFinished) {
                // Show toast notification based on status
                if (request.statusType === 'error' || (request.message && String(request.message).toLowerCase().includes('error'))) {
                    if (typeof showToast === 'function') showToast('Otomatisasi Gagal', safeMessage, 'error');
                } else if (request.statusType === 'stopped') {
                    if (typeof showToast === 'function') showToast('Otomatisasi Berhenti', safeMessage, 'warning');
                } else if (request.statusType === 'final' || request.statusType === 'final_completion' || request.statusType === 'success') {
                    if (typeof showToast === 'function') showToast('Otomatisasi Selesai', safeMessage, 'success');
                }
                console.log('Popup:  DETECTED FINISHED STATUS - checking quota update conditions...');
                // Use flag to prevent double quota consumption per session
                const shouldUpdateQuota = (request.statusType === 'final_completion' || request.isFinalCompletion === true) && request.invoicesProcessed >= 0;

                if (!isQuotaUpdated && shouldUpdateQuota) {
                    isQuotaUpdated = true;  // Lock to prevent multiple updates
                    console.log('Popup:  QUOTA UPDATE FLAG SET - Status:', request.statusType, 'isFinished:', isFinished, 'isStopped:', isStopped, 'Processed:', request.invoicesProcessed);

                    // Reset a fresh check on subscription and update quota
                    (async () => {
                        const latestSubData = await checkSubscriptionStatus();

                        if (true) { // Always update quota when flag is set
                            try {
                                console.log('Popup: Updating quota for', request.invoicesProcessed, 'processed invoices (Status:', request.statusType + ')');

                                //  Tambah rekapan nomor faktur dan status sebelum update kuota
                                try {
                                    const result = await new Promise(resolve => chrome.storage.local.get({ efakturLogs: [] }, resolve));
                                    const logs = Array.isArray(result.efakturLogs) ? result.efakturLogs : [];

                                    // Kumpulkan status per faktur berdasarkan log
                                    const successPatterns = [
                                        /Faktur\s*(\d{17})\s*berhasil\s*diproses/i,
                                        /SUKSES\s*memproses\s*faktur\s*(\d{17})/i,
                                        /BERHASIL[:\s-]*\s*Faktur\s*(\d{17})/i,
                                        /\s*(SUKSES|BERHASIL).*faktur\s*(\d{17})/i
                                    ];
                                    const failPatterns = [
                                        /GAGAL\s*memproses\s*faktur\s*(\d{17})/i,
                                        /Tidak\s*dapat\s*mengklik\s*tombol.*faktur\s*(\d{17})/i,
                                        /Faktur\s*(\d{17})\s*tidak\s*ditemukan/i,
                                        /.*faktur\s*(\d{17})/i
                                    ];

                                    const fakturStatusMap = new Map(); // nomor -> 'BERHASIL' | 'GAGAL'
                                    const fakturOrder = [];

                                    const extractNumber = (match) => {
                                        if (!match) return null;
                                        // Ambil grup mana pun yang berisi 17 digit
                                        for (let i = 1; i < match.length; i++) {
                                            const g = match[i];
                                            if (g && /\d{17}/.test(g)) return g;
                                        }
                                        return null;
                                    };

                                    for (const entry of logs) {
                                        const text = typeof entry === 'string' ? entry : '';
                                        // Cek sukses
                                        for (const re of successPatterns) {
                                            const m = text.match(re);
                                            const no = extractNumber(m);
                                            if (no) {
                                                if (!fakturStatusMap.has(no)) fakturOrder.push(no);
                                                fakturStatusMap.set(no, 'BERHASIL');
                                                break;
                                            }
                                        }
                                        // Cek gagal (hanya set jika belum pernah berhasil)
                                        for (const re of failPatterns) {
                                            const m = text.match(re);
                                            const no = extractNumber(m);
                                            if (no) {
                                                if (!fakturStatusMap.has(no)) {
                                                    fakturOrder.push(no);
                                                    fakturStatusMap.set(no, 'GAGAL');
                                                }
                                                break;
                                            }
                                        }
                                        // Fallback: jika ada 17 digit di baris ini dan mengandung kata kunci
                                        if (/faktur/i.test(text)) {
                                            const anyNo = (text.match(/\d{17}/) || [null])[0];
                                            if (anyNo) {
                                                if (/berhasil|sukses||/i.test(text)) {
                                                    if (!fakturStatusMap.has(anyNo)) fakturOrder.push(anyNo);
                                                    fakturStatusMap.set(anyNo, 'BERHASIL');
                                                } else if (/gagal||failed/i.test(text)) {
                                                    if (!fakturStatusMap.has(anyNo)) {
                                                        fakturOrder.push(anyNo);
                                                        fakturStatusMap.set(anyNo, 'GAGAL');
                                                    }
                                                }
                                            }
                                        }
                                    }

                                    if (fakturOrder.length > 0) {
                                        const failedOnly = fakturOrder.filter(no => fakturStatusMap.get(no) === 'GAGAL');
                                        if (failedOnly.length > 0) {
                                            updateAndSaveStatus(` Faktur gagal diproses: ${failedOnly.length} nomor`);
                                            const MAX_LINES = 100;
                                            let count = 0;
                                            for (const no of failedOnly) {
                                                updateAndSaveStatus(`   - ${no}`);
                                                count++;
                                                if (count >= MAX_LINES) {
                                                    updateAndSaveStatus(`   ... dan ${failedOnly.length - count} lainnya`);
                                                    break;
                                                }
                                            }
                                        } // Hapus pesan sukses yang tidak akurat - summary report sudah cukup
                                    } else {
                                        console.log('Popup: Tidak ada entri faktur yang dapat direkap dari log.');
                                    }
                                } catch (recapErr) {
                                    console.warn('Popup: Gagal membuat rekapan faktur sebelum update kuota:', recapErr);
                                }

                                //  Update quota first - now with proper error handling
                                let quotaUpdateResult;
                                if (latestSubData.status === 'active') {
                                    quotaUpdateResult = await updatePremiumQuotaUsed(request.invoicesProcessed);
                                } else {
                                    quotaUpdateResult = await updateFreeQuotaUsed(request.invoicesProcessed);
                                }

                                // Check if quota update was successful
                                if (quotaUpdateResult && quotaUpdateResult.success) {
                                    console.log('Popup: Quota update successful:', quotaUpdateResult.message);
                                } else {
                                    console.warn('Popup: Quota update failed:', quotaUpdateResult?.error || 'Unknown error');
                                    // Continue with UI update even if quota update failed
                                }

                                console.log('Popup: Starting UI update with manual calculation...');

                                //  MANUAL CALCULATION APPROACH: Direct quota update for immediate UI feedback
                                const updatedData = {
                                    ...latestSubData,
                                    quotaUsed: Math.max(0, (latestSubData.quotaUsed || 0) + request.invoicesProcessed)
                                };

                                console.log('Popup: Manually calculated updated quota:', {
                                    old: latestSubData.quotaUsed,
                                    added: request.invoicesProcessed,
                                    new: updatedData.quotaUsed,
                                    total: latestSubData.quotaTotal
                                });

                                //  IMMEDIATE UI UPDATE with calculated data
                                updateQuotaUI(updatedData);
                                console.log('Popup: UI quota display updated immediately with calculated data');

                                // Update subscription status UI as well
                                if (updatedData.quotaUsed >= updatedData.quotaTotal) {
                                    updateSubscriptionUI({ ...updatedData, type: 'Free' }); // Show "Free" status
                                }

                                updateAndSaveStatus(` UI diperbarui: ${updatedData.quotaTotal - updatedData.quotaUsed}/${updatedData.quotaTotal} kuota tersisa`);

                                console.log('Popup: Real-time quota UI update completed successfully');

                            } catch (quotaError) {
                                console.error('Popup: Failed to update quota:', quotaError);
                                updateAndSaveStatus(` Error update kuota: ${quotaError.message}`);
                                // Continue with fallback UI update
                                try {
                                    const refreshSubscriptionData = await checkSubscriptionStatus();
                                    updateQuotaUI(refreshSubscriptionData);
                                    updateSubscriptionUI(refreshSubscriptionData);
                                    updateAndSaveStatus(` UI diperbarui dengan data terbaru`);
                                } catch (refreshError) {
                                    console.error('Popup: Fallback UI update also failed:', refreshError);
                                }
                            }

                            //  ALWAYS UPDATE QUOTA DISPLAY EVEN IF UPDATE FAILS
                            // Re-check subscription to show current state regardless of success/failure
                            try {
                                console.log('Popup: Re-checking subscription status for UI update...');
                                const refreshSubscriptionData = await checkSubscriptionStatus();
                                updateQuotaUI(refreshSubscriptionData);
                                updateSubscriptionUI(refreshSubscriptionData);

                                const sisaKuota = refreshSubscriptionData.quotaTotal - refreshSubscriptionData.quotaUsed;
                                updateAndSaveStatus(` UI diperbarui: ${sisaKuota}/${refreshSubscriptionData.quotaTotal} kuota tersisa`);
                                console.log('Popup: Quota display refreshed successfully');

                            } catch (refreshError) {
                                console.error('Popup: Failed to refresh quota display:', refreshError);
                                // Fallback: try to show basic completed status
                                updateAndSaveStatus(` Proses selesai tetapi sisa kuota tidak dapat diperbarui.`);
                            }
                        } else {
                            console.log('Popup: No quota update needed - either no invoices processed or already updated');
                        }

                        //  BUG FIX: ONLY reset buttons if we have a REAL completion signal with invoices processed
                        // This prevents premature button reset during navigation steps
                        // Only reset buttons for REAL final completion signals
                        const isRealFinalCompletion = request.isFinalCompletion || (request.invoicesProcessed !== undefined && request.invoicesProcessed >= 0);

                        // Handle button state based on completion type
                        if (request.statusType === 'final_completion') {
                            console.log('Popup: Processing TRUE final completion - enabling start button');
                            // Only now re-enable the start button completely
                            if (startBtn) {
                                startBtn.disabled = false;
                                updateAndSaveStatus(' PROSES SELESAI. Tombol START sudah aktif kembali.');
                            }

                            // Reset flag for next automation session - immediate reset for reliability
                            setTimeout(() => {
                                isQuotaUpdated = false;
                                console.log('Popup: Quota update flag reset for next session');
                            }, 2000); // Reset after 2 seconds to ensure all UI updates complete
                        } else if (request.statusType === 'stopped') {
                            console.log('Popup: User stop acknowledged - disabling start button until completion');
                            // Stop was already processed in handleStop(), just update status
                            updateAndSaveStatus(' PROSES BERHENTI. Menunggu final report dari faktur yang sedang diproses.');
                            // Keep start button disabled until final completion
                        } else {
                            console.log('Popup: Intermediate status update - keeping running state');
                        }
                    })();
                } else {
                    console.log('Popup: Quota update blocked - already processed for this session');
                    // Only reset buttons if this is NOT a duplicate completion signal
                    if ((request.invoicesProcessed >= 0 && request.statusType === 'final') || request.isFinalCompletion) {
                        if (stopBtn) stopBtn.classList.add('hidden');
                        if (startBtn) {
                            startBtn.classList.remove('hidden');
                            startBtn.disabled = false;
                        }
                        if (downloadBtn) {
                            downloadBtn.classList.remove('hidden');
                        }

                        // Force reset flag if we detect repeated final completion without quota update
                        setTimeout(() => {
                            console.log('Popup: Force resetting quota update flag after duplicate completion');
                            isQuotaUpdated = false;
                        }, 5000);
                    }
                }
            }
        }

        if (request.type === 'pdf-download-status') {
            const statusBox = document.getElementById('pdf-download-status');
            const countEl = document.getElementById('pdf-download-count');
            const progressInfo = document.getElementById('pdf-download-progress');
            const startPdfBtn = document.getElementById('start-pdf-download-btn');
            const stopPdfBtn = document.getElementById('stop-pdf-download-btn');

            if (statusBox) {
                statusBox.textContent = request.message;
                statusBox.style.display = 'block';
            }
            if (countEl && request.downloadCount !== undefined) {
                countEl.textContent = request.downloadCount;
            }
            if (progressInfo && request.downloadCount > 0) {
                progressInfo.style.display = 'block';
            }
            if (request.isComplete) {
                if (startPdfBtn) startPdfBtn.classList.remove('hidden');
                if (stopPdfBtn) stopPdfBtn.classList.add('hidden');
            }
        }

        if (request.type === 'pdf-masukan-download-status') {
            const statusBox = document.getElementById('pdf-masukan-download-status');
            const countEl = document.getElementById('pdf-masukan-download-count');
            const progressInfo = document.getElementById('pdf-masukan-download-progress');
            const startPdfBtn = document.getElementById('start-pdf-masukan-download-btn');
            const stopPdfBtn = document.getElementById('stop-pdf-masukan-download-btn');

            if (statusBox) {
                statusBox.textContent = request.message;
                statusBox.style.display = 'block';
            }
            if (countEl && request.downloadCount !== undefined) {
                countEl.textContent = request.downloadCount;
            }
            if (progressInfo && request.downloadCount > 0) {
                progressInfo.style.display = 'block';
            }
            if (request.isComplete) {
                if (startPdfBtn) startPdfBtn.classList.remove('hidden');
                if (stopPdfBtn) stopPdfBtn.classList.add('hidden');
            }
        }

        return true; // Keep message channel open for async response
    });
}

// Event handler functions
async function handleLogin() {
    const email = emailInput?.value;
    const password = passwordInput?.value;

    if (!email || !password) {
        if (loginError) loginError.textContent = 'Email dan password tidak boleh kosong.';
        return;
    }

    showLoading();
    if (loginError) loginError.textContent = '';

    const response = await new Promise(resolve => chrome.runtime.sendMessage({
        type: 'sign-in-email',
        email,
        password
    }, resolve));

    hideLoading();

    if (response.success) {
        console.log('Popup: Email login successful, saving session');

        const metadata = buildUserMetadata(response.user, 'email');
        if (metadata) {
            await persistUserMetadata(metadata);
            console.log('Popup: User session metadata saved');
        } else {
            console.warn('Popup: Unable to build user metadata after email login');
        }

        showAutomationSection();
    } else {
        let errorMessage = "Login gagal: Terjadi kesalahan.";
        if (response.error) {
            switch (response.error.code) {
                case 'auth/user-not-found':
                case 'auth/wrong-password':
                    errorMessage = "Email atau password yang Anda masukkan salah.";
                    break;
                case 'auth/invalid-email':
                    errorMessage = "Format email tidak valid.";
                    break;
                default:
                    errorMessage = `Login gagal: ${response.error.message}`;
            }
        }
        if (loginError) loginError.textContent = errorMessage;
    }
}

async function handleGoogleLogin() {
    showLoading();
    if (loginError) loginError.textContent = '';

    console.log('Popup: Sending sign-in-google request');
    const response = await new Promise(resolve => chrome.runtime.sendMessage({ type: 'sign-in-google' }, resolve));
    hideLoading();

    if (response.success) {
        console.log('Popup: Google login successful, saving session');

        const metadata = buildUserMetadata(response.user, 'google');
        if (metadata) {
            await persistUserMetadata(metadata);
            console.log('Popup: User session metadata saved');
        } else {
            console.warn('Popup: Unable to build user metadata after Google login');
        }

        chrome.storage.local.set({ lastGoogleAccount: response.user.email });
        showAutomationSection();
    } else {
        if (loginError) loginError.textContent = `Login Google gagal: ${response.error?.message || 'Unknown error'}`;
        console.error('Google login error:', response.error);
    }
}

async function handleSwitchAccount() {
    console.log('Popup: Switch account button clicked');
    showLoading();
    if (loginError) loginError.textContent = '';

    const logoutResponse = await new Promise(resolve => chrome.runtime.sendMessage({ type: 'sign-out' }, resolve));
    console.log('Popup: Logout response for account switch:', logoutResponse);

    await clearUserMetadata();
    console.log('Popup: Session cleared for account switch');

    const response = await new Promise(resolve => chrome.runtime.sendMessage({ type: 'sign-in-google' }, resolve));
    hideLoading();

    if (response.success) {
        console.log('Popup: Account switch successful');

        const { lastGoogleAccount } = await new Promise(resolve => chrome.storage.local.get(['lastGoogleAccount'], resolve));
        const currentEmail = response.user.email;

        if (lastGoogleAccount && currentEmail === lastGoogleAccount) {
            if (loginError) {
                loginError.textContent = ' Chrome masih menggunakan akun yang sama. Untuk benar-benar ganti akun: 1) Logout dari Chrome browser, atau 2) Gunakan mode incognito.';
                loginError.style.color = 'orange';
            }

            setTimeout(() => {
                if (loginError) loginError.textContent = '';
            }, 8000);
        }

        chrome.storage.local.set({ lastGoogleAccount: currentEmail });

        const metadata = buildUserMetadata(response.user, 'google');
        if (metadata) {
            await persistUserMetadata(metadata);
            console.log('Popup: User session metadata updated after account switch');
        } else {
            console.warn('Popup: Unable to build user metadata after account switch');
        }

        showAutomationSection();
    } else {
        if (loginError) loginError.textContent = `Ganti akun gagal: ${response.error?.message || 'Unknown error'}`;
        console.error('Account switch error:', response.error);
    }
}

async function handleLogout() {
    console.log('Popup: Logout button clicked');
    showLoading();

    const response = await new Promise(resolve => chrome.runtime.sendMessage({ type: 'sign-out' }, resolve));
    console.log('Popup: Logout response:', response);

    // Clear user session AND reset automation states
    await clearUserMetadata();
    await new Promise(resolve => chrome.storage.local.remove(['isAutomationRunning'], resolve));
    console.log('Popup: Local storage cleared');

    // Clear logs for fresh start
    chrome.storage.local.set({ efakturLogs: [] }, () => {
        console.log('Popup: Logs cleared for new session');
        renderLogs([]);
    });

    hideLoading();
    showLoginSection();
}

function handleFileChange(event) {
    const file = event.target.files[0];
    if (file) {
        if (fileNameDisplay) fileNameDisplay.textContent = file.name;
        const reader = new FileReader();
        reader.onload = (e) => {
            csvContent = e.target.result;
        };
        reader.readAsText(file);
    } else {
        if (fileNameDisplay) fileNameDisplay.textContent = 'Belum ada file dipilih';
        csvContent = '';
    }
}

async function handleStart() {
    // Re-check subscription status before starting to prevent race conditions
    // or starting a job when quota just ran out.
    const subscriptionData = await checkSubscriptionStatus();
    const hasQuota = (subscriptionData.quotaTotal - subscriptionData.quotaUsed) > 0;
    const automationEnabled = hasQuota; //  FIX: Allow any user with remaining quota to run automation

    //  DIAGNOSIS LOGGING: Check subscription data and quota validation (guarded by DEBUG flag)
    if (DEBUG) {
        console.log(`Popup: [QUOTA DEBUG] handleStart() - Subscription data:`, subscriptionData);
        console.log(`Popup: [QUOTA DEBUG] User type: ${subscriptionData.status}, Has quota: ${hasQuota}`);
        console.log(`Popup: [QUOTA DEBUG] Quota used: ${subscriptionData.quotaUsed}/${subscriptionData.quotaTotal}`);
        console.log(`Popup: [QUOTA DEBUG] CRITICAL: This check only happens BEFORE starting, not during processing!`);
    }

    if (!automationEnabled) {
        updateAndSaveStatus('Error: Proses tidak dapat dimulai. Pastikan langganan Anda aktif dan kuota mencukupi.');
        toggleAutomationUI(false); // Make sure UI is disabled
        return;
    }

    console.log("handleStart: Function triggered.");
    if (!csvContent) {
        updateAndSaveStatus('Error: Silakan pilih file CSV/TXT terlebih dahulu.');
        console.log("handleStart: Aborted - No CSV content.");
        return;
    }

    console.log("handleStart: Updating UI to running state.");
    if (startBtn) startBtn.classList.add('hidden');
    if (stopBtn) stopBtn.classList.remove('hidden');
    updateAndSaveStatus('--- Memulai Proses Baru ---');

    // Reset quota update flag for new automation session
    isQuotaUpdated = false;
    console.log("Popup: Quota update flag reset for new automation session");
    console.log("Popup: Starting new automation session - quota flag:", isQuotaUpdated);

    // Clear any existing quota update timeouts
    clearTimeout(window.quotaResetTimeout);

    console.log("handleStart: Saving running state to storage.");
    await new Promise(resolve => chrome.storage.local.set({ isAutomationRunning: true }, resolve));

    // Send message to content script via background
    //  QUOTA FIX: Include quota information in automation data
    const automationData = {
        csvData: csvContent,
        bulanDipilih: bulanSelect?.value,
        tahunDipilih: tahunSelect?.value,
        aksiFinal: aksiSelect?.value,
        turboMode: turboModeToggle?.checked || false,
        //  NEW: Add quota information for real-time checking
        quotaInfo: {
            userType: subscriptionData.status, // 'free', 'active', etc.
            maxQuota: subscriptionData.quotaTotal,
            usedQuota: subscriptionData.quotaUsed,
            remainingQuota: subscriptionData.quotaTotal - subscriptionData.quotaUsed,
            isFreeUser: subscriptionData.status !== 'active'
        }
    };

    console.log(`Popup: [QUOTA FIX] Sending automation data with quota info:`, {
        csvLength: automationData.csvData?.length || 0,
        bulanDipilih: automationData.bulanDipilih,
        tahunDipilih: automationData.tahunDipilih,
        aksiFinal: automationData.aksiFinal,
        quotaInfo: automationData.quotaInfo
    });
    console.log(`Popup: [QUOTA FIX]  Content script will now be aware of quota limits!`);

    chrome.runtime.sendMessage({
        type: 'START_AUTOMATION',
        data: automationData
    }, (response) => {
        if (chrome.runtime.lastError) {
            updateAndSaveStatus(`Error: ${chrome.runtime.lastError.message}`);
            handleStop(true);
        } else if (!response?.success) {
            updateAndSaveStatus(`Gagal memulai: ${response?.message || 'Unknown error'}`);
            handleStop(true);
        } else {
            updateAndSaveStatus('Automasi berhasil dimulai!');
        }
    });
}

async function handleDownload() {
    console.log("handleDownload: Function triggered.");

    // Get selected months
    const selectedMonths = getSelectedMonths();

    // Validate month selection (min 1, max 2)
    if (!validateMonthSelection()) {
        updateAndSaveStatus('Error: Pilih 1-2 bulan untuk melanjutkan download.');
        return;
    }

    // Hide error message if validation passes
    const errorElement = document.getElementById('month-selection-error');
    if (errorElement) {
        errorElement.style.display = 'none';
    }

    // Check subscription status (this also checks authentication internally)
    const subscriptionData = await checkSubscriptionStatus();

    // Check if user has any quota available
    const totalQuota = Number(subscriptionData.quotaTotal) || 0;
    const usedQuota = Number(subscriptionData.quotaUsed) || 0;
    const remainingQuota = Math.max(totalQuota - usedQuota, 0);

    if (remainingQuota <= 0) {
        updateAndSaveStatus('Error: Kuota Anda telah habis. Download tidak dapat dimulai.');
        if (upgradeButton) upgradeButton.style.display = 'block';
        return;
    }

    console.log(`handleDownload: User has ${remainingQuota}/${totalQuota} quota remaining. Proceeding...`);
    console.log(`handleDownload: Selected months: ${selectedMonths.join(', ')}`);

    // Update UI to running state
    if (downloadBtn) downloadBtn.classList.add('hidden');
    if (startBtn) startBtn.classList.add('hidden');
    if (stopBtn) stopBtn.classList.remove('hidden');

    // Save running state to storage
    chrome.storage.local.set({
        isAutomationRunning: true,
        currentOperation: 'download'
    });

    updateAndSaveStatus('=== MEMULAI DOWNLOAD DAFTAR PAJAK MASUKAN ===');
    updateAndSaveStatus(`Kuota tersedia: ${remainingQuota} dari ${totalQuota}`);
    updateAndSaveStatus(`Bulan terpilih: ${selectedMonths.join(', ')}`);
    const selectedYear = getSelectedYear();
    if (selectedYear) {
        updateAndSaveStatus(`Tahun terpilih: ${selectedYear}`);
    }
    updateAndSaveStatus(`Mengatur filter ke ${selectedMonths.length} bulan yang dipilih...`);

    chrome.runtime.sendMessage({
        type: 'START_DOWNLOAD_AUTOMATION',
        data: {
            selectedMonths: selectedMonths,
            selectedYear: selectedYear
        }
    }, (response) => {
        if (chrome.runtime.lastError) {
            updateAndSaveStatus(`Error: ${chrome.runtime.lastError.message}`);
            handleStop(true);
        } else if (!response?.success) {
            updateAndSaveStatus(`Gagal memulai download: ${response?.message || 'Unknown error'}`);
            handleStop(true);
        } else {
            updateAndSaveStatus(' Download automation berhasil dimulai!');
        }
    });
}

// === KELUARAN EXCEL DOWNLOAD HANDLER ===

function handleDownloadKeluaran() {
    const selectedMonth = getSelectedKeluaranMonth();
    const selectedYear = getSelectedKeluaranYear();

    // Validate month selection
    if (!selectedMonth) {
        showKeluaranError('⚠️ Silakan pilih masa pajak (bulan) terlebih dahulu.');
        return;
    }

    // Clear errors and show loading
    clearKeluaranError();
    updateAndSaveStatus('🔄 Menyiapkan download...');

    // Send message to content script
    chrome.runtime.sendMessage({
        type: 'START_DOWNLOAD_KELUARAN_AUTOMATION',
        data: {
            selectedMonth: selectedMonth,  // Single string, not array
            selectedYear: selectedYear
        }
    }, (response) => {
        if (!response?.success) {
            showKeluaranError(`❌ ${response?.message || 'Gagal memulai download.'}`);
        }
    });
}

function getSelectedKeluaranMonth() {
    const select = document.getElementById('keluaran-month-select');
    return select?.value || null;
}

function getSelectedKeluaranYear() {
    const select = document.getElementById('keluaran-year-select');
    return select?.value || null;
}

function showKeluaranError(message) {
    const errorDiv = document.getElementById('keluaran-selection-error');
    if (errorDiv) {
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
    }
}

function clearKeluaranError() {
    const errorDiv = document.getElementById('keluaran-selection-error');
    if (errorDiv) {
        errorDiv.style.display = 'none';
    }
}

function initKeluaranDownload() {
    const downloadBtn = document.getElementById('download-keluaran-btn');
    if (!downloadBtn) return;

    downloadBtn.addEventListener('click', handleDownloadKeluaran);

    // Add change listener to update info box
    const monthSelect = document.getElementById('keluaran-month-select');
    if (monthSelect) {
        monthSelect.addEventListener('change', validateKeluaranSelection);
    }

    // Initial validation
    validateKeluaranSelection();
}

function validateKeluaranSelection() {
    const month = getSelectedKeluaranMonth();
    const year = getSelectedKeluaranYear();
    const infoDiv = document.getElementById('keluaran-selection-info');

    if (!month) {
        if (infoDiv) infoDiv.style.display = 'none';
        return false;
    }

    if (infoDiv) {
        infoDiv.innerHTML = `✅ Terpilih: <strong>${month}</strong> ${year ? `(${year})` : ''}`;
        infoDiv.className = 'selection-info success';
        infoDiv.style.display = 'block';
    }

    return true;
}

// === END KELUARAN EXCEL DOWNLOAD HANDLER ===

async function handleStop(force = false) {
    console.log(`handleStop: Function triggered. Force stop: ${force}`);

    // IMPORTANT: ALWAYS reset buttons immediately for UNINTERRUPTABLE user experience
    // User expects immediate UI feedback when clicking stop
    if (stopBtn) stopBtn.classList.add('hidden');
    if (startBtn) {
        startBtn.classList.remove('hidden');
        startBtn.disabled = true; // Disable temporarily until final completion
    }
    if (downloadBtn) {
        downloadBtn.classList.remove('hidden');
    }

    // Always reset the stored state
    console.log("handleStop: Saving stopped state to storage.");
    await new Promise(resolve => chrome.storage.local.set({ isAutomationRunning: false }, resolve));

    // Send stop message via background with IMMEDIATE feedback
    updateAndSaveStatus(' MENGHENTIKAN PROSES... Menunggu faktur saat ini selesai.');

    chrome.runtime.sendMessage({ type: 'STOP_AUTOMATION' }, (response) => {
        if (chrome.runtime.lastError) {
            console.log('handleStop: Runtime error:', chrome.runtime.lastError);
            updateAndSaveStatus(` Error stopping: ${chrome.runtime.lastError.message}`);
            // Re-enable start button immediately on error
            if (startBtn) startBtn.disabled = false;
        } else {
            console.log('handleStop: Stop command acknowledged by content script');
            // Keep buttons as-is until final completion message arrives
        }
    });

    if (force) {
        updateAndSaveStatus(' STOP PAKSA aktif. Proses akan dihentikan segera.');
    }
}

function handleClearLog(event) {
    event.preventDefault();
    chrome.storage.local.set({ efakturLogs: [] }, () => {
        renderLogs([]);
    });
}

function handleExportCSV(event) {
    if (event) event.preventDefault();
    chrome.storage.local.get({ efakturLogs: [] }, (result) => {
        const logs = result.efakturLogs || [];
        if (logs.length === 0) {
            showToast('Tidak ada log untuk diexport', 'error');
            return;
        }

        let csvContent = 'Waktu,No. Faktur,Status,Keterangan\n';
        
        logs.forEach(entry => {
            const safeText = sanitizeLogMessage(typeof entry === 'string' ? entry : String(entry ?? ''));
            const timeMatch = safeText.match(/^\[(.*?)\]\s*(.*)/);
            const waktu = timeMatch ? timeMatch[1] : '';
            const restOfText = timeMatch ? timeMatch[2] : safeText;
            
            let status = 'INFO';
            if (restOfText.includes('[BERHASIL]')) status = 'SUKSES';
            else if (restOfText.includes('[GAGAL]')) status = 'GAGAL';
            else if (restOfText.includes('[LEWAT]')) status = 'SKIP';
            else if (restOfText.includes('[PROSES]')) status = 'PROSES';
            
            let noFaktur = '-';
            const fakturMatch = restOfText.match(/Faktur (\d+)/i);
            if (fakturMatch) {
                noFaktur = fakturMatch[1];
            }
            
            const escapeCSV = (str) => `"${str.replace(/"/g, '""')}"`;
            
            csvContent += `${escapeCSV(waktu)},${escapeCSV(noFaktur)},${escapeCSV(status)},${escapeCSV(restOfText)}\n`;
        });

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        const dateStr = new Date().toISOString().slice(0, 10);
        link.setAttribute("href", url);
        link.setAttribute("download", `log_efaktur_${dateStr}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    });
}

function handleDownloadTemplate(event) {
    event.preventDefault();

    try {
        const templateData = [
            ["Nomor Faktur Pajak 17 digit", "Masa Pajak Faktur (bukan target masa Kreditkan)"],
            ["01000024000000010", "Januari"],
            ["01000024000000020", "Februari"]
        ];

        const csvLines = templateData.map(row => {
            if (!row || row.length === 0) {
                return '';
            }
            return row.map(value => {
                const safeValue = (value ?? '').toString().replace(/"/g, '""');
                return `"${safeValue}"`;
            }).join(',');
        });

        const csvContent = csvLines.join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", "template_efaktur_otomatis.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    } catch (e) {
        console.error('Popup: Gagal membuat template CSV.', e);
        updateAndSaveStatus('Error: Template CSV gagal dibuat. Coba ulangi atau hubungi tim dukungan.');
    }
}

async function handleExportReport(event) {
    if (event && typeof event.preventDefault === 'function') {
        event.preventDefault();
    }
    try {
        const result = await new Promise(resolve => chrome.storage.local.get({ efakturInvoiceResults: [] }, resolve));
        const records = Array.isArray(result.efakturInvoiceResults) ? result.efakturInvoiceResults : [];
        if (records.length === 0) {
            updateAndSaveStatus('Tidak ada data faktur untuk diekspor.');
            return;
        }

        const header = ['Nomor Faktur', 'Status', 'Aksi', 'Bulan Target', 'Bulan Aktual', 'Status Kredit', 'Status Verifikasi', 'Percobaan Validasi', 'Alasan Validasi', 'Error Code', 'Pesan', 'Timestamp'];
        const lines = records.map(item => [
            item.nomorFaktur || '',
            item.status || '',
            item.action || '',
            item.expectedMonth || '',
            item.actualMonthLabel || '',
            item.actualCreditStatus || '',
            item.verificationStatus || '',
            item.validationAttempts ?? '',
            item.validationReason || '',
            item.errorCode || '',
            item.errorMessage || '',
            item.timestamp || ''
        ].map(value => `"${String(value ?? '').replace(/"/g, '""')}"`).join(','));

        const newlineChar = String.fromCharCode(10);
        const csvContent = [header.join(','), ...lines].join(newlineChar);
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const downloadUrl = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = downloadUrl;
        anchor.download = `efaktur_report_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.csv`;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(downloadUrl);
        updateAndSaveStatus('Laporan faktur diekspor sebagai CSV.');
    } catch (error) {
        console.error('Popup: Gagal export laporan faktur:', error);
        updateAndSaveStatus('Error: Gagal export laporan faktur.');
    }
}

function handleAksiChange() {
    if (bulanSelect && aksiSelect) {
        const isKembaliSelected = aksiSelect.value === 'Kembali ke status Approved';
        bulanSelect.disabled = isKembaliSelected;
        if (tahunSelect) tahunSelect.disabled = isKembaliSelected;
        if (isKembaliSelected) {
            bulanSelect.value = ''; // Reset month selection
            if (tahunSelect) tahunSelect.value = ''; // Reset year selection
        }
    }
}

// === Tab Switching Functionality ===
function initTabSwitching() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    const tabSubtitle = document.getElementById('tab-subtitle');

    const tabLabels = {
        '1': '⚙️ Otomatisasi',
        '2': '🛠️ Fitur'
    };

    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.dataset.tab;

            // Update button states
            tabButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Update subtitle
            if (tabSubtitle) {
                tabSubtitle.textContent = tabLabels[targetTab];
            }

            // Update content visibility
            const targetContent = document.getElementById(`tab-content-${targetTab}`);
            tabContents.forEach(content => {
                content.style.display = 'none';
            });
            if (targetContent) {
                targetContent.style.display = 'block';
            }

            // Initialize Tab 2 tools when switched to
            if (targetTab === '2') {
                initToolsMenu(); // Initialize accordion expanders
            }

            console.log(`Switched to tab ${targetTab}`);
        });
    });
}

// Show/Hide tab navigation based on login state
function showTabNavigation() {
    const tabNav = document.getElementById('tab-navigation');
    if (tabNav) {
        tabNav.style.display = 'flex';
    }
}

function hideTabNavigation() {
    const tabNav = document.getElementById('tab-navigation');
    if (tabNav) {
        tabNav.style.display = 'none';
    }
}

// === Excel Merger Functionality ===
function initExcelMerger() {
    const mergeBtn = document.getElementById('merge-excel-btn');

    if (!mergeBtn) return;

    // Merge button handler - open website instead of local processing
    mergeBtn.addEventListener('click', handleOpenExcelMergerWebsite);
}

async function handleOpenExcelMergerWebsite() {
    updateAndSaveStatus('🌐 Membuka website tools.alatpajak.id...');

    try {
        // Open the website in a new tab
        await chrome.tabs.create({
            url: 'https://tools.alatpajak.id/',
            active: true
        });

        updateAndSaveStatus('✓ Website tools berhasil dibuka');

    } catch (error) {
        console.error('Error opening website:', error);
        updateAndSaveStatus(`❌ Gagal membuka website: ${error.message}`);

        // Fallback: try opening with window.open
        try {
            window.open('https://tools.alatpajak.id/', '_blank');
            updateAndSaveStatus('✓ Website dibuka dengan metode alternatif');
        } catch (fallbackError) {
            updateAndSaveStatus('❌ Gagal membuka website. Silakan buka manual: https://tools.alatpajak.id/');
        }
    }
}

// Month selection helper functions
function getSelectedMonths() {
    const checkboxes = document.querySelectorAll('.month-checkbox:checked');
    return Array.from(checkboxes).map(checkbox => checkbox.value);
}

function validateMonthSelection() {
    const selectedMonths = getSelectedMonths();
    const infoDiv = document.getElementById('month-selection-info');
    const errorDiv = document.getElementById('month-selection-error');

    if (selectedMonths.length === 0) {
        if (infoDiv) {
            infoDiv.style.display = 'none';
        }
        if (errorDiv) {
            errorDiv.textContent = '⚠️ Pilih minimal 1 bulan untuk melanjutkan download.';
                            errorDiv.className = 'month-selection-error';
                            errorDiv.style.display = 'block';
        }
        return false;
    }

    if (selectedMonths.length > 2) {
        if (infoDiv) {
            infoDiv.className = 'selection-info error';
                            infoDiv.textContent = `⚠️ Maksimal 2 bulan. Anda memilih ${selectedMonths.length} bulan.`;
                            infoDiv.style.display = 'block';
        }
        if (errorDiv) {
            errorDiv.style.display = 'none';
        }
        return false;
    }

    // Valid - show success info
    if (infoDiv) {
        infoDiv.className = 'selection-info success';
        const monthsText = selectedMonths.join(', ');
        infoDiv.innerHTML = `✅ Terpilih: <strong>${monthsText}</strong> (${selectedMonths.length}/2 bulan)`;
        infoDiv.style.display = 'block';
    }
    if (errorDiv) {
        errorDiv.style.display = 'none';
    }
    return true;
}

function initMonthCheckboxes() {
    const checkboxes = document.querySelectorAll('.month-checkbox');

    checkboxes.forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            // Check if user is trying to select more than 2
            if (e.target.checked) {
                const selectedCount = document.querySelectorAll('.month-checkbox:checked').length;

                if (selectedCount > 2) {
                    // Prevent selection of 3rd month
                    e.target.checked = false;
                    updateAndSaveStatus('⚠️ Maksimal 2 bulan yang bisa dipilih.');
                    validateMonthSelection();
                    return;
                }
            }

            // Always validate and show info
            validateMonthSelection();
        });
    });
}

// Year selection helper function for download feature
function getSelectedYear() {
    const yearSelect = document.getElementById('download-year-select');
    return yearSelect ? yearSelect.value : '';
}

function initToolsMenu() {
    // NEW: Sub-view navigation system
    initSubViewNavigation();

    // Legacy support - keep for backward compatibility
    const cards = document.querySelectorAll('.tool-menu-card');
    const menu = document.getElementById('tools-menu');
    const subviews = document.querySelectorAll('.tool-subview');
    const backBtns = document.querySelectorAll('.back-btn');

    if (cards.length > 0) {
        cards.forEach(card => {
            card.addEventListener('click', () => {
                const toolId = card.dataset.tool;
                if (menu) menu.classList.add('hidden');
                const target = document.getElementById(`tool-subview-${toolId}`);
                if (target) target.classList.remove('hidden');
            });
        });

        backBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                subviews.forEach(v => v.classList.add('hidden'));
                if (menu) menu.classList.remove('hidden');
            });
        });
    }
}

function initSubViewNavigation() {
    const menuView = document.getElementById('tools-menu-view');
    const toolItems = document.querySelectorAll('.tool-item-header[data-navigate]');
    const subviews = document.querySelectorAll('.tool-subview');

    // Handle tool item clicks - navigate to sub-view
    toolItems.forEach(item => {
        item.addEventListener('click', () => {
            const toolId = item.dataset.navigate;
            if (!toolId || !menuView) return;

            // Hide menu view
            menuView.classList.add('hidden');

            // Show target sub-view
            const targetView = document.getElementById(`tool-subview-${toolId}`);
            if (targetView) {
                targetView.classList.remove('hidden');
                targetView.style.display = 'block';
            }
        });
    });

    // Handle back button clicks - return to menu
    const backButtons = [
        { id: 'back-from-pdf', view: 'tool-subview-pdf-download' },
        { id: 'back-from-pdf-masukan', view: 'tool-subview-pdf-masukan-download' },
        { id: 'back-from-download-keluaran', view: 'tool-subview-download-keluaran' },
        { id: 'back-from-download', view: 'tool-subview-download-masukan' },
        { id: 'back-from-merge', view: 'tool-subview-merge-excel' }
    ];

    backButtons.forEach(({ id, view }) => {
        const btn = document.getElementById(id);
        if (!btn) return;

        btn.addEventListener('click', () => {
            // Hide all sub-views
            subviews.forEach(v => {
                v.classList.add('hidden');
                v.style.display = 'none';
            });

            // Show menu view
            if (menuView) {
                menuView.classList.remove('hidden');
            }
        });
    });
}

function initToolExpanders() {
    // No longer needed - using sub-view navigation instead
    // Keeping function for backward compatibility
}

function initPdfDownload() {
    const startBtn = document.getElementById('start-pdf-download-btn');
    const stopBtn = document.getElementById('stop-pdf-download-btn');
    const statusBox = document.getElementById('pdf-download-status');
    const progressInfo = document.getElementById('pdf-download-progress');
    const countEl = document.getElementById('pdf-download-count');

    if (!startBtn) return;

    startBtn.addEventListener('click', async () => {
        // Check quota first
        const subData = await checkSubscriptionStatus();
        const remaining = Math.max((subData.quotaTotal || 0) - (subData.quotaUsed || 0), 0);
        if (remaining <= 0) {
            if (statusBox) {
                statusBox.textContent = 'Kuota Anda telah habis. Tidak dapat memulai download.';
                statusBox.style.display = 'block';
            }
            return;
        }

        startBtn.classList.add('hidden');
        stopBtn.classList.remove('hidden');
        if (statusBox) {
            statusBox.textContent = 'Memulai download PDF...';
            statusBox.style.display = 'block';
        }
        if (progressInfo) progressInfo.style.display = 'block';
        if (countEl) countEl.textContent = '0';

        // Reset quota flag for new session
        isQuotaUpdated = false;

        chrome.runtime.sendMessage({ type: 'START_PDF_DOWNLOAD' }, (response) => {
            if (!response?.success) {
                if (statusBox) statusBox.textContent = response?.message || 'Gagal memulai download.';
                startBtn.classList.remove('hidden');
                stopBtn.classList.add('hidden');
            }
        });
    });

    stopBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'STOP_PDF_DOWNLOAD' });
        stopBtn.classList.add('hidden');
        startBtn.classList.remove('hidden');
        if (statusBox) statusBox.textContent = 'Download dihentikan.';
    });
}

function initPdfMasukanDownload() {
    const startBtn = document.getElementById('start-pdf-masukan-download-btn');
    const stopBtn = document.getElementById('stop-pdf-masukan-download-btn');
    const statusBox = document.getElementById('pdf-masukan-download-status');
    const progressInfo = document.getElementById('pdf-masukan-download-progress');
    const countEl = document.getElementById('pdf-masukan-download-count');

    if (!startBtn) return;

    startBtn.addEventListener('click', async () => {
        // Check quota first
        const subData = await checkSubscriptionStatus();
        const remaining = Math.max((subData.quotaTotal || 0) - (subData.quotaUsed || 0), 0);
        if (remaining <= 0) {
            if (statusBox) {
                statusBox.textContent = 'Kuota Anda telah habis. Tidak dapat memulai download.';
                statusBox.style.display = 'block';
            }
            return;
        }

        startBtn.classList.add('hidden');
        stopBtn.classList.remove('hidden');
        if (statusBox) {
            statusBox.textContent = 'Memulai download PDF Pajak Masukan...';
            statusBox.style.display = 'block';
        }
        if (progressInfo) progressInfo.style.display = 'block';
        if (countEl) countEl.textContent = '0';

        // Reset quota flag for new session
        isQuotaUpdated = false;

        chrome.runtime.sendMessage({ type: 'START_PDF_MASUKAN_DOWNLOAD' }, (response) => {
            if (!response?.success) {
                if (statusBox) statusBox.textContent = response?.message || 'Gagal memulai download.';
                startBtn.classList.remove('hidden');
                stopBtn.classList.add('hidden');
            }
        });
    });

    stopBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'STOP_PDF_MASUKAN_DOWNLOAD' });
        stopBtn.classList.add('hidden');
        startBtn.classList.remove('hidden');
        if (statusBox) statusBox.textContent = 'Download dihentikan.';
    });
}

function initPreflightChecklist() {
    const checks = document.querySelectorAll('.preflight-check');
    const card = document.getElementById('preflight-checklist');
    if (!card || checks.length < 3) return;
    
    // Disable manual clicking
    checks.forEach(check => {
        check.style.pointerEvents = 'none';
    });
    
    const checkStatus = () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const activeTab = tabs[0];
            if (!activeTab || !activeTab.url) return;
            
            // Check 1: Coretax terbuka
            const isCoretax = activeTab.url.includes('coretaxdjp.pajak.go.id');
            checks[0].checked = isCoretax;
            
            if (isCoretax) {
                // Check 2 and 3 via content_script
                chrome.tabs.sendMessage(activeTab.id, { type: 'CHECK_READY' }, (response) => {
                    if (chrome.runtime.lastError) {
                        checks[1].checked = false;
                        checks[2].checked = false;
                    } else if (response) {
                        checks[1].checked = !!response.isPajakMasukan;
                        checks[2].checked = !!response.isNoStatusFilter;
                    }
                    updateCardState();
                });
            } else {
                checks[1].checked = false;
                checks[2].checked = false;
                updateCardState();
            }
        });
    };
    
    const updateCardState = () => {
        const allChecked = Array.from(checks).every(c => c.checked);
        card.classList.toggle('preflight-ready', allChecked);
    };

    // Auto check every 2 seconds
    checkStatus();
    setInterval(checkStatus, 2000);
}

function initThemeToggle() {
    const toggleBtn = document.getElementById('theme-toggle');
    if (!toggleBtn) return;

    // Load saved theme
    chrome.storage.local.get(['theme'], (result) => {
        if (result.theme === 'dark') {
            document.body.classList.add('dark-mode');
        }
    });

    toggleBtn.addEventListener('click', () => {
        const isDark = document.body.classList.toggle('dark-mode');
        chrome.storage.local.set({ theme: isDark ? 'dark' : 'light' });
    });
}

// Make sure this runs when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
    try {
        console.log('Popup: DOM loaded, initializing elements and starting session check...');

        // Initialize DOM elements and event listeners
        initializeElements();
        addEventListeners();
        initTabSwitching(); // Initialize tab switching
        initToolsMenu(); // Initialize tools menu navigation
        initExcelMerger(); // Initialize Excel merger
        initPdfDownload(); // Initialize PDF download feature
        initPdfMasukanDownload(); // Initialize PDF Masukan download feature
        initKeluaranDownload(); // Initialize Keluaran Excel download feature
        initPreflightChecklist(); // Initialize pre-flight checklist
        initThemeToggle(); // Initialize dark mode toggle
        handleAksiChange(); // Set initial state for the dropdowns


        // Load existing logs first
        chrome.storage.local.get({ efakturLogs: [] }, (result) => {
            renderLogs(result.efakturLogs);
        });

        // Show loading while checking
        showLoading();

        // DON'T check automation running state on login - always reset to clean state
        // This prevents the bug where Stop button shows after logout/login
        console.log('Popup: Resetting UI to default state (Start button visible)');
        if (startBtn) {
            startBtn.classList.remove('hidden');
            startBtn.disabled = false;
        }
        if (stopBtn) stopBtn.classList.add('hidden');

        hideLoading();
        if (loginSection) loginSection.style.display = 'none';
        if (automationSection) automationSection.style.display = 'block';
        showTabNavigation();

        if (turboModeToggle) {
            turboModeToggle.checked = false;
            updateTurboStatusLabel(false);
            chrome.storage.local.set({ turboMode: false });
        }
        
        if (userEmailSpan) userEmailSpan.textContent = "Personal User";
        if (subscriptionStatusSpan) {
            subscriptionStatusSpan.textContent = "Premium";
            subscriptionStatusSpan.classList.add("active");
        }
        if (upgradeButton) upgradeButton.style.display = 'none';
        
        if (quotaDisplay) {
            quotaDisplay.textContent = "Unlimited";
            quotaDisplay.classList.add("active");
        }
        
        if (expiryDisplay) {
            expiryDisplay.textContent = "Lifetime";
            expiryDisplay.classList.add("active");
        }

        toggleAutomationUI(true);

    } catch (error) {
        console.error('Popup: Error in DOMContentLoaded handler:', error);
    }
});

// The entire runAutomation function is removed from popup.js
// Its logic will be rebuilt in content_script.js using the new humanizer module.







function showToast(title, message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '❌';
    if (type === 'warning') icon = '⚠️';

    toast.innerHTML = `
        <div class="toast-icon">${icon}</div>
        <div class="toast-content">
            <div class="toast-title">${title}</div>
            <div class="toast-message">${message}</div>
        </div>
        <button class="toast-close">×</button>
    `;

    container.appendChild(toast);

    // Trigger animation
    setTimeout(() => {
        toast.classList.add('show');
    }, 10);

    // Close button
    toast.querySelector('.toast-close').addEventListener('click', () => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400);
    });

    // Auto remove
    setTimeout(() => {
        if (document.contains(toast)) {
            toast.classList.remove('show');
            setTimeout(() => {
                if (document.contains(toast)) toast.remove();
            }, 400);
        }
    }, 5000);
}
