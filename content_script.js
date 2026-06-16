// content_script.js - Basic working version with enhanced debugging
const DEBUG = false; // Set to true only when you need deep console diagnostics
if (DEBUG) {
    console.log("=== CONTENT SCRIPT LOADED ===");
    console.log("URL:", window.location.href);
    console.log("Domain:", window.location.hostname);
    console.log("Page title:", document.title);
    console.log("===========================");
}

// --- State Management ---
const MachineState = {
    IDLE: 'IDLE',
    RUNNING: 'RUNNING',
    STOPPED: 'STOPPED',
    ERROR: 'ERROR'
};

let currentState = MachineState.IDLE;
let automationData = null;
let navigationMonitorTimer = null;
let automationAbortHandler = null;
let forcedLogoutReason = null;
let pageExitHandlersInstalled = false;
let isTurboMode = false; // Turbo mode: reduces all delays to ~30%

// Helper: scale delay based on turbo mode (multiplier: default 0.3, refresh uses 0.2 for 80% faster)
function turboDelay(normalMs, multiplier = 0.3) {
    return isTurboMode ? Math.max(Math.round(normalMs * multiplier), 50) : normalMs;
}

class AutomationAbortError extends Error {
    constructor(reason) {
        super(reason);
        this.name = "AutomationAbortError";
    }
}

class SessionLogoutError extends Error {
    constructor(reason, context = '') {
        super(reason);
        this.name = 'SessionLogoutError';
        this.reason = reason;
        this.context = context;
    }
}

function detectLogoutState() {
    if (forcedLogoutReason) {
        return forcedLogoutReason;
    }

    try {
        const href = (window.location?.href || '').toLowerCase();
        if (href.includes('login') || href.includes('logout') || href.includes('auth')) {
            return 'Halaman login terdeteksi dari URL';
        }
    } catch (error) {
        if (error instanceof SessionLogoutError || error instanceof AutomationAbortError) { throw error; }
        console.warn('Content script: Failed to inspect window location for logout detection:', error);
    }

    const passwordInput = document.querySelector('input[type="password"], input[name*="password"], input[id*="password"]');
    const loginForm = document.querySelector('form[action*="login"], form[action*="auth"]');
    if (passwordInput && loginForm) {
        return 'Form login Coretax terdeteksi';
    }

    const sessionBanner = Array.from(document.querySelectorAll('[class*="session"], [class*="timeout"], [class*="expired"]'))
        .find(node => node.innerText && node.innerText.toLowerCase().includes('login'));
    if (sessionBanner) {
        return 'Banner session expired muncul pada halaman';
    }

    return null;
}

function assertSessionActive(context = '') {
    const logoutReason = detectLogoutState();
    if (logoutReason) {
        throw new SessionLogoutError(logoutReason, context);
    }
}

function stopNavigationMonitor() {
    if (navigationMonitorTimer) {
        clearInterval(navigationMonitorTimer);
        navigationMonitorTimer = null;
    }
}

function startNavigationMonitor() {
    try {
        stopNavigationMonitor();
        let lastUrl = (window.location?.href || '');

        navigationMonitorTimer = setInterval(() => {
            if (currentState !== MachineState.RUNNING) {
                return;
            }

            if (forcedLogoutReason) {
                return;
            }

            let logoutReason = null;
            try {
                logoutReason = detectLogoutState();
            } catch (error) {
                if (error instanceof SessionLogoutError) {
                    triggerAutomationAbort(error.reason || error.message || 'Session logout terdeteksi.', 'logout-detection');
                    return;
                }
                console.warn('Content script: Navigation monitor detectLogoutState error:', error);
            }

            if (logoutReason) {
                triggerAutomationAbort(logoutReason, 'logout-detection');
                return;
            }

            const currentUrl = (window.location?.href || '');
            if (currentUrl && currentUrl !== lastUrl) {
                lastUrl = currentUrl;
                try {
                    const parsed = new URL(currentUrl, window.location.origin);
                    const host = (parsed.hostname || '').toLowerCase();
                    if (host && !host.endsWith('coretaxdjp.pajak.go.id')) {
                        triggerAutomationAbort(`Halaman berpindah ke ${parsed.hostname}.`, 'url-monitor');
                        return;
                    }
                } catch (parseError) {
                    console.warn('Content script: Navigation monitor gagal parse URL:', parseError);
                }
            }
        }, 1200);
    } catch (error) {
        if (error instanceof SessionLogoutError || error instanceof AutomationAbortError) { throw error; }
        console.warn('Content script: Failed to start navigation monitor:', error);
    }
}

function triggerAutomationAbort(reason, context = 'navigation-monitor') {
    const sanitizedReason = sanitizeLogMessage(reason || 'Konteks otomasi hilang');
    if (!forcedLogoutReason) {
        forcedLogoutReason = sanitizedReason;
    }

    const handler = automationAbortHandler;
    if (!handler || typeof handler.onAbort !== 'function') {
        console.warn('Content script: triggerAutomationAbort invoked but handler belum siap:', { reason: sanitizedReason, context });
        return;
    }

    if (handler.isProcessing) {
        return;
    }
    handler.isProcessing = true;

    stopNavigationMonitor();
    Promise.resolve(handler.onAbort(sanitizedReason, context)).catch(error => {
        console.error('Content script: Gagal memproses abort automation:', error);
    });
}

function installPageExitGuard() {
    if (pageExitHandlersInstalled) {
        return;
    }
    pageExitHandlersInstalled = true;

    const handlePageExit = () => {
        if (currentState === MachineState.RUNNING && !forcedLogoutReason) {
            triggerAutomationAbort('Halaman ditutup atau dimuat ulang saat otomasi berjalan.', 'page-exit');
        }
    };

    try {
        window.addEventListener('pagehide', handlePageExit, true);
        window.addEventListener('beforeunload', handlePageExit, true);
        window.addEventListener('unload', handlePageExit, true);
    } catch (error) {
        console.warn('Content script: Gagal memasang page exit guard:', error);
    }
}

installPageExitGuard();

const MONTH_METADATA = [
    { key: 'januari', label: 'Januari', number: 1, aliases: ['januari', 'jan'] },
    { key: 'februari', label: 'Februari', number: 2, aliases: ['februari', 'feb'] },
    { key: 'maret', label: 'Maret', number: 3, aliases: ['maret', 'mar'] },
    { key: 'april', label: 'April', number: 4, aliases: ['april', 'apr'] },
    { key: 'mei', label: 'Mei', number: 5, aliases: ['mei', 'may'] },
    { key: 'juni', label: 'Juni', number: 6, aliases: ['juni', 'jun'] },
    { key: 'juli', label: 'Juli', number: 7, aliases: ['juli', 'jul'] },
    { key: 'agustus', label: 'Agustus', number: 8, aliases: ['agustus', 'agu', 'aug'] },
    { key: 'september', label: 'September', number: 9, aliases: ['september', 'sep'] },
    { key: 'oktober', label: 'Oktober', number: 10, aliases: ['oktober', 'okt', 'oct'] },
    { key: 'november', label: 'November', number: 11, aliases: ['november', 'nov'] },
    { key: 'desember', label: 'Desember', number: 12, aliases: ['desember', 'des', 'dec'] }
];

const MONTH_ALIAS_LOOKUP = new Map();
const MONTH_KEY_LOOKUP = new Map();
MONTH_METADATA.forEach(entry => {
    MONTH_KEY_LOOKUP.set(entry.key, entry);
    entry.aliases.forEach(alias => {
        MONTH_ALIAS_LOOKUP.set(alias.toLowerCase(), entry);
    });
});

let preferredFilterMonthKeys = [];

function normalizeMonthKey(value) {
    if (value == null) {
        return null;
    }
    const normalizedInput = typeof value === 'number' ? value.toString() : value.toString();
    const trimmed = normalizedInput.trim().toLowerCase();
    if (!trimmed) {
        return null;
    }

    if (MONTH_KEY_LOOKUP.has(trimmed)) {
        return trimmed;
    }

    const numericMatch = trimmed.match(/^(\d{1,2})$/);
    if (numericMatch) {
        const numericValue = parseInt(numericMatch[1], 10);
        if (numericValue >= 1 && numericValue <= 12) {
            return MONTH_METADATA[numericValue - 1].key;
        }
    }

    for (const [alias, entry] of MONTH_ALIAS_LOOKUP) {
        if (trimmed === alias || trimmed.includes(alias)) {
            return entry.key;
        }
    }

    const digitsOnly = trimmed.replace(/[^\d]/g, '');
    if (digitsOnly.length > 0 && digitsOnly.length <= 2) {
        const numericValue = parseInt(digitsOnly, 10);
        if (numericValue >= 1 && numericValue <= 12) {
            return MONTH_METADATA[numericValue - 1].key;
        }
    }

    return null;
}

function cloneMonthEntry(entry) {
    if (!entry) {
        return null;
    }
    return {
        key: entry.key,
        label: entry.label,
        number: entry.number
    };
}

function buildMasaDetailsFromInput(rawValue) {
    if (rawValue == null) {
        return null;
    }

    if (typeof rawValue === 'object') {
        if (rawValue.key && MONTH_KEY_LOOKUP.has(rawValue.key)) {
            return cloneMonthEntry(MONTH_KEY_LOOKUP.get(rawValue.key));
        }
        if (rawValue.monthKey && MONTH_KEY_LOOKUP.has(rawValue.monthKey)) {
            return cloneMonthEntry(MONTH_KEY_LOOKUP.get(rawValue.monthKey));
        }
        if (rawValue.label) {
            const keyFromLabel = normalizeMonthKey(rawValue.label);
            if (keyFromLabel && MONTH_KEY_LOOKUP.has(keyFromLabel)) {
                return cloneMonthEntry(MONTH_KEY_LOOKUP.get(keyFromLabel));
            }
        }
    }

    const normalizedKey = normalizeMonthKey(rawValue);
    if (!normalizedKey || !MONTH_KEY_LOOKUP.has(normalizedKey)) {
        return null;
    }

    return cloneMonthEntry(MONTH_KEY_LOOKUP.get(normalizedKey));
}

function setPreferredFilterMonthsFromFakturList(fakturList) {
    if (!Array.isArray(fakturList)) {
        preferredFilterMonthKeys = [];
        return;
    }

    const seen = new Set();
    const derivedKeys = [];

    fakturList.forEach(item => {
        if (!item) {
            return;
        }
        const masaDetails = buildMasaDetailsFromInput(item.masa);
        if (masaDetails && !seen.has(masaDetails.key)) {
            seen.add(masaDetails.key);
            derivedKeys.push(masaDetails.key);
        }
    });

    preferredFilterMonthKeys = derivedKeys;
    if (derivedKeys.length > 0) {
        console.log('Content script: [CSV MONTHS] Masa pajak terdeteksi dari CSV:', derivedKeys.map(key => getMonthEntry(key)?.label || key));
    } else {
        console.log('Content script: [CSV MONTHS] Tidak ada masa pajak valid pada CSV.');
    }
}

function getPreferredFilterMonthLabels() {
    if (!Array.isArray(preferredFilterMonthKeys) || preferredFilterMonthKeys.length === 0) {
        return [];
    }
    return preferredFilterMonthKeys
        .map(key => getMonthEntry(key))
        .filter(Boolean)
        .map(entry => entry.label);
}

function getMonthEntry(key) {
    if (!key) return null;
    if (MONTH_KEY_LOOKUP.has(key)) {
        return MONTH_KEY_LOOKUP.get(key);
    }
    return null;
}

function detectMonthInText(rawText) {
    if (!rawText) return null;
    const normalized = rawText.toString().toLowerCase();
    for (const entry of MONTH_METADATA) {
        if (entry.aliases.some(alias => normalized.includes(alias))) {
            return entry;
        }
    }
    return null;
}

function determineCreditStatus(rawText, fallbackAction) {
    const normalized = (rawText || '').toString().toLowerCase();
    if (normalized.includes('tidak dikreditkan') || normalized.includes('uncredit') || normalized.includes('uncredited')) {
        return { status: 'Uncredited', source: 'label' };
    }
    if (normalized.includes('dikreditkan') || normalized.includes('credit')) {
        return { status: 'Credited', source: 'label' };
    }
    if (fallbackAction) {
        const actionNormalized = fallbackAction.toString().toLowerCase();
        if (actionNormalized.includes('tidak dikreditkan') || actionNormalized.includes('tidak')) {
            return { status: 'Uncredited', source: 'action' };
        }
        if (actionNormalized.includes('kredit')) {
            return { status: 'Credited', source: 'action' };
        }
    }
    return { status: null, source: null };
}

function parseMasaPajakDetails(rawText, options = {}) {
    const { expectedMonth = null, fallbackAction = null } = options;
    const displayText = (rawText || '').toString().trim();
    const detectedMonth = detectMonthInText(displayText);
    const fallbackMonthKey = normalizeMonthKey(expectedMonth);
    const fallbackMonth = fallbackMonthKey ? getMonthEntry(fallbackMonthKey) : null;
    const creditInfo = determineCreditStatus(displayText, fallbackAction);
    const yearMatch = displayText.match(/\b(20\d{2}|19\d{2})\b/);

    return {
        rawText: displayText,
        monthKey: detectedMonth?.key || fallbackMonth?.key || null,
        monthLabel: detectedMonth?.label || fallbackMonth?.label || null,
        monthNumber: detectedMonth?.number || fallbackMonth?.number || null,
        detectedYear: yearMatch ? parseInt(yearMatch[1], 10) : null,
        creditStatus: creditInfo.status,
        creditSource: creditInfo.source
    };
}

function sanitizeLogMessage(value) {
    if (typeof value !== 'string') {
        return value;
    }
    let sanitized = '';
    for (let i = 0; i < value.length; i++) {
        const code = value.charCodeAt(i);
        if (
            code === 9 || // tab
            code === 10 || // newline
            code === 13 || // carriage return
            (code >= 32 && code <= 126)
        ) {
            sanitized += value[i];
        }
    }
    return sanitized;
}

function getDropdownTextCandidates(dropdownElement) {
    if (!dropdownElement) {
        return [];
    }

    const candidates = [];
    const selectors = [
        '.p-dropdown-label .p-dropdown-label-text',
        '.p-dropdown-label-container',
        '.p-dropdown-label',
        '.p-dropdown .p-dropdown-label',
        'input[role="combobox"]',
        'input.p-inputtext'
    ];

    selectors.forEach(selector => {
        const node = dropdownElement.querySelector(selector);
        if (!node) {
            return;
        }
        const candidate = (node.innerText ?? node.value ?? '').trim();
        if (candidate && !candidates.includes(candidate)) {
            candidates.push(candidate);
        }
    });

    const ariaLabel = dropdownElement.getAttribute?.('aria-label');
    if (ariaLabel) {
        const text = ariaLabel.trim();
        if (text && !candidates.includes(text)) {
            candidates.push(text);
        }
    }

    const reflectLabel = dropdownElement.getAttribute?.('ng-reflect-label') || dropdownElement.getAttribute?.('ng-reflect-model');
    if (reflectLabel) {
        const text = reflectLabel.trim();
        if (text && !candidates.includes(text)) {
            candidates.push(text);
        }
    }

    const innerDropdown = dropdownElement.querySelector?.('.p-dropdown');
    if (innerDropdown) {
        const innerLabel = innerDropdown.getAttribute('aria-label');
        if (innerLabel) {
            const text = innerLabel.trim();
            if (text && !candidates.includes(text)) {
                candidates.push(text);
            }
        }
    }

    return candidates;
}

function getDropdownSelectionSnapshot(dropdownElement, options = {}) {
    const candidates = getDropdownTextCandidates(dropdownElement);
    const primaryText = candidates.length > 0 ? candidates[0] : '';
    const details = parseMasaPajakDetails(primaryText, options);

    return {
        primaryText,
        candidates,
        details
    };
}

//  QUOTA FIX: Add quota tracking variables
let quotaInfo = null;

//  PERBAIKAN: Retry function untuk operasi yang gagal
async function retryOperation(operation, maxRetries = 3, delayMs = 2000) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            if (DEBUG) {
                console.log(`Content script: [RETRY] Attempt ${attempt}/${maxRetries} for operation`);
            }
            const result = await operation();
            if (result) {
                if (DEBUG) {
                    console.log(`Content script: [RETRY]  Operation succeeded on attempt ${attempt}`);
                }
                return result;
            }
            if (attempt < maxRetries) {
                if (DEBUG) {
                    console.log(`Content script: [RETRY] Operation returned false, retrying in ${delayMs}ms...`);
                }
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        } catch (error) {
            if (error instanceof SessionLogoutError || error instanceof AutomationAbortError) { throw error; }
            if (DEBUG) {
                console.warn(`Content script: [RETRY]  Attempt ${attempt} failed:`, error.message);
            }
            if (attempt < maxRetries) {
                if (DEBUG) {
                    console.log(`Content script: [RETRY] Retrying in ${delayMs}ms...`);
                }
                await new Promise(resolve => setTimeout(resolve, delayMs));
            } else {
                throw error;
            }
        }
    }
    console.error(`Content script: [RETRY]  Operation failed after ${maxRetries} attempts`);
    return false;
}

//  PERBAIKAN: Function untuk menunggu elemen muncul dengan timeout lebih lama
async function waitForElementLong(selector, timeoutMs = 15000) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
        assertSessionActive(`waitForElementLong:${selector}`);
        const element = document.querySelector(selector);
        if (element && element.offsetWidth > 0) {
            if (DEBUG) {
                console.log(`Content script: [WAIT]  Element found: ${selector}`);
            }
            return element;
        }
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    if (DEBUG) {
        console.error(`Content script: [WAIT]  Element not found after ${timeoutMs}ms: ${selector}`);
    }
    return null;
}
let processedSuccessCount = 0; // Track successful invoices for quota checking

//  FAKTUR TRACKING: Array untuk tracking hasil processing setiap faktur
let fakturProcessingResults = [];
let activeFaktur = null;
let serverErrorObserver = null;
let serverErrorState = null;
let badGatewayRetryTracker = {};
const serverErrorHistory = new Map();
let sessionReloadScheduled = false;

//  DEBUG: Persistent storage untuk automationData
let persistentAutomationData = null;

// Session management untuk mengatasi timeout
let sessionStartTime = Date.now();
let lastActivityTime = Date.now();
const SESSION_WARNING_TIME = 8 * 60 * 1000; // 8 menit tanpa aktivitas -> warning
const SESSION_TIMEOUT_TIME = 9.5 * 60 * 1000; // 9.5 menit tanpa aktivitas -> timeout
const MAX_AUTOMATION_DURATION = 30 * 60 * 1000; // 30 menit durasi proses -> info

function updateSessionActivity(context = '') {
    lastActivityTime = Date.now();
    if (context && context !== 'status-update') {
        console.log('Content script: Session activity updated (' + context + ')');
    }
}

function formatDuration(milliseconds) {
    if (!milliseconds || milliseconds < 0) {
        return '0 detik';
    }
    if (milliseconds < 60 * 1000) {
        const seconds = Math.max(1, Math.round(milliseconds / 1000));
        return seconds + ' detik';
    }
    const minutes = milliseconds / 60000;
    if (minutes < 10) {
        return minutes.toFixed(1) + ' menit';
    }
    return Math.round(minutes) + ' menit';
}

function checkSessionTimeout() {
    const currentTime = Date.now();
    const totalDuration = currentTime - sessionStartTime;
    const inactivityDuration = currentTime - lastActivityTime;

    if (inactivityDuration > SESSION_TIMEOUT_TIME) {
        const formattedInactivity = formatDuration(inactivityDuration);
        console.error('Content script: Session timeout detected after ' + formattedInactivity + ' of inactivity');
        updateStatus('ERROR: Session timeout terdeteksi! Tidak ada aktivitas selama ' + formattedInactivity + '. Proses dihentikan untuk keamanan.', 'error');
        return 'TIMEOUT';
    }

    if (inactivityDuration > SESSION_WARNING_TIME) {
        const formattedInactivity = formatDuration(inactivityDuration);
        console.warn('Content script: Session idle for ' + formattedInactivity + ', showing warning');
        updateStatus('WARNING: Session idle ' + formattedInactivity + '. Pertimbangkan jeda atau refresh Coretax bila diperlukan.', 'warning');
        return 'WARNING';
    }

    if (!checkSessionTimeout._durationNotified && totalDuration > MAX_AUTOMATION_DURATION) {
        const formattedTotal = formatDuration(totalDuration);
        console.log('Content script: Automation running for ' + formattedTotal + ' (informational)');
        updateStatus('INFO: Otomasi telah berjalan ' + formattedTotal + '. Pastikan Coretax tetap stabil.', 'info');
        checkSessionTimeout._durationNotified = true;
    }

    return 'OK';
}
checkSessionTimeout._durationNotified = false;

function injectNetworkResponseMonitor() {
    try {
        // Use external script file to comply with Manifest V3 CSP
        // Instead of inline script injection which violates CSP
        const script = document.createElement('script');
        script.src = chrome.runtime.getURL('network-monitor.js');
        script.onload = function () {
            this.remove();
            console.log('Content script: Network monitor loaded successfully');
        };
        script.onerror = function () {
            console.warn('Content script: Failed to load network monitor script');
            this.remove();
        };
        (document.head || document.documentElement).appendChild(script);
    } catch (error) {
        if (error instanceof SessionLogoutError || error instanceof AutomationAbortError) { throw error; }
        console.warn('Content script: Failed to inject network monitor:', error);
    }
}

function handleNetworkMonitorMessage(event) {
    if (event.source !== window) {
        return;
    }
    const data = event.data;
    if (!data || typeof data !== 'object') {
        return;
    }
    if (data.source !== 'ef-network-monitor' || data.type !== 'EF_SERVER_ERROR') {
        return;
    }
    const payload = data.payload || {};
    const status = Number(payload.status || payload.code);
    if (status !== 401 && status !== 502) {
        return;
    }
    const statusText = payload.statusText ? normalizeErrorText(payload.statusText) : '';
    const url = payload.url ? normalizeErrorText(payload.url) : '';
    const messageParts = [];
    messageParts.push(`HTTP ${status}`);
    if (statusText) {
        messageParts.push(statusText);
    }
    if (url) {
        messageParts.push(url);
    }
    handleServerErrorDetection({
        code: String(status),
        message: messageParts.join(' - '),
        sourceElement: null,
        invoice: activeFaktur
    });
}

function normalizeErrorText(text) {
    return (text || '').replace(/\s+/g, ' ').trim();
}

function parseServerErrorText(text) {
    const normalized = normalizeErrorText(text).toLowerCase();
    if (!normalized) {
        return null;
    }

    if (normalized.includes('401') &&
        (normalized.includes('unauthorized') || normalized.includes('login') || normalized.includes('timeout'))) {
        return { code: '401', message: normalizeErrorText(text) };
    }

    if ((normalized.includes('502') && normalized.includes('gateway')) ||
        normalized.includes('bad gateway')) {
        return { code: '502', message: normalizeErrorText(text) };
    }

    return null;
}

function extractServerErrorInfo(node) {
    if (!(node instanceof HTMLElement)) {
        return null;
    }

    const candidates = [];
    if (node.matches('.p-dialog, .p-toast, .swal2-container, .modal, [role=\"dialog\"], .p-confirm-dialog, .p-message')) {
        candidates.push(node);
    }
    candidates.push(...node.querySelectorAll('.p-dialog, .p-toast, .swal2-container, .modal, [role=\"dialog\"], .p-confirm-dialog, .p-message'));

    if (candidates.length === 0) {
        candidates.push(node);
    }

    for (const element of candidates) {
        const text = normalizeErrorText(element.innerText || element.textContent || '');
        const info = parseServerErrorText(text);
        if (info) {
            return { ...info, sourceElement: element };
        }
    }

    return null;
}

function cleanupServerErrorHistory() {
    if (serverErrorHistory.size <= 40) {
        return;
    }
    const now = Date.now();
    for (const [key, value] of serverErrorHistory.entries()) {
        if (now - value > 60000) {
            serverErrorHistory.delete(key);
        }
    }
}

function dismissServerErrorNode(element) {
    if (!(element instanceof HTMLElement)) {
        return;
    }
    const buttons = element.matches('button, .p-button')
        ? [element]
        : Array.from(element.querySelectorAll('button, .p-button, .swal2-confirm, .swal2-deny, .swal2-cancel, .btn'));
    const keywords = ['ok', 'tutup', 'close', 'kembali', 'ya', 'retry', 'refresh', 'muat', 'ulang'];

    for (const button of buttons) {
        const text = normalizeErrorText(button.innerText || button.textContent || '');
        const lower = text.toLowerCase();
        if (keywords.some(keyword => lower.includes(keyword))) {
            try {
                button.click();
                console.log('Content script: [SERVER ERROR] Dismissed popup via button:', text);
                return;
            } catch (error) {
                if (error instanceof SessionLogoutError || error instanceof AutomationAbortError) { throw error; }
                console.warn('Content script: [SERVER ERROR] Failed to click dismissal button:', error);
            }
        }
    }
}

function dismissServerErrorDialogs() {
    const selectors = ['.p-dialog', '.p-toast', '.swal2-container', '.modal', '[role="dialog"]', '.p-confirm-dialog', '.p-message'];
    selectors.forEach(selector => {
        document.querySelectorAll(selector).forEach(element => dismissServerErrorNode(element));
    });
}

function handleServerErrorDetection(info) {
    if (!info || !info.code) {
        return;
    }

    const dedupeKey = `${info.code}_${normalizeErrorText(info.message).toLowerCase()}`;
    const now = Date.now();
    cleanupServerErrorHistory();
    const lastHandled = serverErrorHistory.get(dedupeKey);
    if (lastHandled && now - lastHandled < 1500) {
        return;
    }
    serverErrorHistory.set(dedupeKey, now);

    const isAutomationRunning = currentState === MachineState.RUNNING;
    const invoice = isAutomationRunning ? (activeFaktur || info.invoice || 'UNKNOWN') : (info.invoice || 'SESSION');
    const baseReason = info.code === '401'
        ? 'Server error 401 (Unauthorized/Login Timeout)'
        : 'Server error 502 (Bad Gateway)';
    const detail = normalizeErrorText(info.message).slice(0, 180);

    if (isAutomationRunning) {
        addFakturResult(invoice, 'FAILED', baseReason, { errorCode: info.code, source: 'server' });
    }
    updateStatus(` ${baseReason} pada faktur ${invoice}. Detail: ${detail}`, 'error');
    logAutomationStep('Server error detected', { invoice, code: info.code, message: detail });

    if (info.sourceElement) {
        dismissServerErrorNode(info.sourceElement);
    } else {
        dismissServerErrorDialogs();
    }

    serverErrorState = {
        code: info.code,
        invoice,
        detail,
        detectedAt: now
    };
}

function startServerErrorObserver() {
    if (serverErrorObserver || typeof MutationObserver === 'undefined') {
        return;
    }
    const target = document.body || document.documentElement;
    if (!target) {
        setTimeout(startServerErrorObserver, 1000);
        return;
    }
    serverErrorObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            mutation.addedNodes.forEach((node) => {
                const info = extractServerErrorInfo(node);
                if (info) {
                    handleServerErrorDetection(info);
                }
            });
        }
    });
    serverErrorObserver.observe(target, { childList: true, subtree: true });
    console.log('Content script: [SERVER ERROR] Observer started');
}

function stopServerErrorObserver() {
    if (serverErrorObserver) {
        try {
            serverErrorObserver.disconnect();
        } catch (error) {
            if (error instanceof SessionLogoutError || error instanceof AutomationAbortError) { throw error; }
            console.warn('Content script: [SERVER ERROR] Failed to disconnect observer:', error);
        }
    }
    serverErrorObserver = null;
    serverErrorState = null;
}

injectNetworkResponseMonitor();
window.addEventListener('message', handleNetworkMonitorMessage, false);
startServerErrorObserver();


async function handleServerErrorAfterInvoice(faktur, totalBerhasil, totalInvoices) {
    if (!serverErrorState) {
        return { action: 'none' };
    }

    const info = serverErrorState;
    serverErrorState = null;

    if (info.code === '502') {
        const retries = badGatewayRetryTracker[faktur] || 0;
        if (retries < 1) {
            badGatewayRetryTracker[faktur] = retries + 1;
            updateStatus(` Server 502 terdeteksi pada faktur ${faktur}. Sistem akan mencoba ulang otomatis (percobaan ${retries + 1}).`, 'warning', totalBerhasil, false, totalBerhasil, totalInvoices);
            logAutomationStep('Server 502 detected', { faktur, retries: retries + 1, detail: info.detail });
            await attemptBadGatewayRecovery();
            return { action: 'retry' };
        }
        updateStatus(` Server 502 tetap terjadi pada faktur ${faktur}. Faktur akan ditandai gagal dan proses dilanjutkan.`, 'error', totalBerhasil, false, totalBerhasil, totalInvoices);
        logAutomationStep('Server 502 repeated', { faktur, retries, detail: info.detail });
        return { action: 'continue' };
    }

    if (info.code === '401') {
        updateStatus(` Server 401/Unauthorized terdeteksi saat memproses faktur ${faktur}. Otomatisasi dihentikan demi keamanan.`, 'error', totalBerhasil, false, totalBerhasil, totalInvoices);
        logAutomationStep('Server 401 detected', { faktur, detail: info.detail });
        scheduleSessionReload();
        return { action: 'stop' };
    }

    return { action: 'none' };
}

function scheduleSessionReload() {
    if (sessionReloadScheduled) {
        return;
    }
    sessionReloadScheduled = true;
    setTimeout(() => {
        try {
            window.location.reload();
        } catch (error) {
            if (error instanceof SessionLogoutError || error instanceof AutomationAbortError) { throw error; }
            console.warn('Content script: Failed to reload page after server error:', error);
        }
    }, 4000);
}

function saveAutomationData(data) {
    console.log("Content script: Saving automationData to persistent storage");
    console.log("Content script: Data to save:", data);
    automationData = data;
    persistentAutomationData = { ...data }; // Deep copy

    // Turbo mode flag
    if (data.turboMode !== undefined) {
        isTurboMode = !!data.turboMode;
        console.log(`Content script: [TURBO] Mode set to ${isTurboMode ? 'ON ⚡' : 'OFF'}`);
    }

    //  QUOTA FIX: Save quota info separately for easy access
    if (data.quotaInfo) {
        quotaInfo = { ...data.quotaInfo };
        console.log("Content script: [QUOTA FIX] Quota info saved:", quotaInfo);
    }

    // Backup ke sessionStorage sebagai fail-safe
    try {
        sessionStorage.setItem('efaktur_automation_data', JSON.stringify(data));
        console.log("Content script: Data saved to sessionStorage as backup");
    } catch (e) {
        if (e instanceof SessionLogoutError) { throw e; }
        console.warn("Content script: Failed to save to sessionStorage:", e);
    }
}

function loadAutomationData() {
    console.log("Content script: Loading automationData from persistent storage");

    // Prioritas: Variable runtime > sessionStorage > null
    if (persistentAutomationData) {
        automationData = { ...persistentAutomationData };
        //  QUOTA FIX: Restore quota info
        if (automationData.quotaInfo) {
            quotaInfo = { ...automationData.quotaInfo };
            console.log("Content script: [QUOTA FIX] Quota info restored:", quotaInfo);
        }
        // Restore turbo mode
        if (automationData.turboMode !== undefined) {
            isTurboMode = !!automationData.turboMode;
            console.log(`Content script: [TURBO] Restored mode: ${isTurboMode ? 'ON ⚡' : 'OFF'}`);
        }
        console.log("Content script: Data loaded from persistent storage");
        return automationData;
    }

    try {
        const sessionData = sessionStorage.getItem('efaktur_automation_data');
        if (sessionData) {
            const parsed = JSON.parse(sessionData);
            automationData = parsed;
            persistentAutomationData = parsed;
            console.log("Content script: Data loaded from sessionStorage");
            return automationData;
        }
    } catch (e) {
        if (e instanceof SessionLogoutError) { throw e; }
        console.warn("Content script: Failed to load from sessionStorage:", e);
    }

    console.log("Content script: No persistent data found");
    return null;
}

function clearAutomationData() {
    console.log("Content script: Clearing automationData from storage");
    automationData = null;
    persistentAutomationData = null;
    //  QUOTA FIX: Clear quota info
    quotaInfo = null;
    processedSuccessCount = 0;
    //  FAKTUR TRACKING: Clear faktur tracking
    resetFakturTracking();
    try {
        sessionStorage.removeItem('efaktur_automation_data');
    } catch (e) {
        if (e instanceof SessionLogoutError) { throw e; }
        console.warn("Content script: Failed to clear sessionStorage:", e);
    }
}

//  FAKTUR TRACKING: Fungsi untuk menambah hasil processing ke array
function addFakturResult(nomorFaktur, status, errorMessage = null, metadata = {}) {
    const fnstr = typeof nomorFaktur === 'object' && nomorFaktur !== null ? nomorFaktur.nomor : nomorFaktur;
    const safeNomorFakturRaw = (typeof fnstr === 'string' ? fnstr.trim() : String(fnstr ?? '')).trim();
    const safeNomorFaktur = safeNomorFakturRaw || 'UNKNOWN';
    const timestamp = new Date().toLocaleTimeString();
    const normalizedStatus = status || 'UNKNOWN';
    const masaMetaCandidate = metadata?.masaPajakMetadata || metadata?.masaPajak || metadata;
    const masaMeta = (masaMetaCandidate && (
        Object.prototype.hasOwnProperty.call(masaMetaCandidate, 'expectedMonth') ||
        Object.prototype.hasOwnProperty.call(masaMetaCandidate, 'verificationStatus') ||
        Object.prototype.hasOwnProperty.call(masaMetaCandidate, 'actualLabel') ||
        Object.prototype.hasOwnProperty.call(masaMetaCandidate, 'actualMonthKey')
    )) ? masaMetaCandidate : null;

    const basePayload = {
        nomorFaktur: safeNomorFaktur,
        status: normalizedStatus,
        timestamp,
        errorMessage: errorMessage || null,
        errorCode: metadata.errorCode || null,
        source: metadata.source || null,
        expectedMonth: masaMeta?.expectedMonth ?? null,
        expectedMonthKey: masaMeta?.expectedMonthKey ?? null,
        action: masaMeta?.action ?? null,
        actualMonthLabel: masaMeta?.actualLabel ?? null,
        actualMonthKey: masaMeta?.actualMonthKey ?? null,
        actualCreditStatus: masaMeta?.actualCreditStatus ?? null,
        verificationStatus: masaMeta?.verificationStatus ?? null,
        validationAttempts: typeof masaMeta?.validationAttempts === 'number' ? masaMeta.validationAttempts : null,
        validationReason: masaMeta?.validationReason || null,
        listOrder: Number.isFinite(metadata.listOrder) ? metadata.listOrder : (metadata.listOrder != null && !Number.isNaN(Number(metadata.listOrder)) ? Number(metadata.listOrder) : null),
        statusSource: metadata.statusSource || null
    };

    const statusPriority = {
        'PENDING': 0,
        'NOT_PROCESSED': 1,
        'SKIPPED': 2,
        'SKIPPED': 3,
        'FAILED': 4,
        'SUCCESS': 5
    };
    const existingIndex = fakturProcessingResults.findIndex(r => r.nomorFaktur === safeNomorFaktur);

    if (existingIndex !== -1) {
        const current = fakturProcessingResults[existingIndex];
        const currentPriority = statusPriority.hasOwnProperty(current.status) ? statusPriority[current.status] : 0;
        const newPriority = statusPriority.hasOwnProperty(normalizedStatus) ? statusPriority[normalizedStatus] : currentPriority;

        if (newPriority >= currentPriority) {
            const merged = {
                ...current,
                ...basePayload
            };
            merged.errorMessage = basePayload.errorMessage;
            merged.errorCode = basePayload.errorCode;
            merged.expectedMonth = basePayload.expectedMonth ?? current.expectedMonth ?? null;
            merged.expectedMonthKey = basePayload.expectedMonthKey ?? current.expectedMonthKey ?? null;
            merged.action = basePayload.action || current.action || null;
            merged.actualMonthLabel = basePayload.actualMonthLabel ?? current.actualMonthLabel ?? null;
            merged.actualMonthKey = basePayload.actualMonthKey ?? current.actualMonthKey ?? null;
            merged.actualCreditStatus = basePayload.actualCreditStatus ?? current.actualCreditStatus ?? null;
            merged.verificationStatus = basePayload.verificationStatus ?? current.verificationStatus ?? null;
            merged.validationAttempts = basePayload.validationAttempts ?? current.validationAttempts ?? null;
            merged.validationReason = basePayload.validationReason || current.validationReason || null;
            merged.listOrder = basePayload.listOrder ?? current.listOrder ?? null;
            merged.statusSource = basePayload.statusSource ?? current.statusSource ?? null;
            fakturProcessingResults[existingIndex] = merged;
            console.log(`Content script: [FAKTUR TRACKING] Updated result for ${safeNomorFaktur}:`, fakturProcessingResults[existingIndex]);
        } else {
            if (basePayload.errorMessage && !current.errorMessage) {
                current.errorMessage = basePayload.errorMessage;
            }
            if (basePayload.errorCode && !current.errorCode) {
                current.errorCode = basePayload.errorCode;
            }
            if (basePayload.expectedMonth && !current.expectedMonth) {
                current.expectedMonth = basePayload.expectedMonth;
            }
            if (basePayload.expectedMonthKey && !current.expectedMonthKey) {
                current.expectedMonthKey = basePayload.expectedMonthKey;
            }
            if (basePayload.action && !current.action) {
                current.action = basePayload.action;
            }
            if (basePayload.actualMonthLabel && !current.actualMonthLabel) {
                current.actualMonthLabel = basePayload.actualMonthLabel;
            }
            if (basePayload.actualMonthKey && !current.actualMonthKey) {
                current.actualMonthKey = basePayload.actualMonthKey;
            }
            if (basePayload.actualCreditStatus && !current.actualCreditStatus) {
                current.actualCreditStatus = basePayload.actualCreditStatus;
            }
            if (basePayload.verificationStatus && !current.verificationStatus) {
                current.verificationStatus = basePayload.verificationStatus;
            }
            if (typeof basePayload.validationAttempts === 'number' && current.validationAttempts == null) {
                current.validationAttempts = basePayload.validationAttempts;
            }
            if (basePayload.validationReason && !current.validationReason) {
                current.validationReason = basePayload.validationReason;
            }
            if (basePayload.listOrder != null && current.listOrder == null) {
                current.listOrder = basePayload.listOrder;
            }
            if (basePayload.statusSource && !current.statusSource) {
                current.statusSource = basePayload.statusSource;
            }
        }
    } else {
        fakturProcessingResults.push(basePayload);
        console.log(`Content script: [FAKTUR TRACKING] Added result for ${safeNomorFaktur}:`, basePayload);
    }

    syncFakturResultsToStorage();
}

function syncFakturResultsToStorage() {
    try {
        if (chrome?.storage?.local) {
            const snapshot = fakturProcessingResults.map(result => ({
                nomorFaktur: result.nomorFaktur,
                status: result.status,
                timestamp: result.timestamp,
                errorMessage: result.errorMessage || null,
                errorCode: result.errorCode || null,
                source: result.source || null,
                expectedMonth: result.expectedMonth || null,
                expectedMonthKey: result.expectedMonthKey || null,
                action: result.action || null,
                actualMonthLabel: result.actualMonthLabel || null,
                actualMonthKey: result.actualMonthKey || null,
                actualCreditStatus: result.actualCreditStatus || null,
                verificationStatus: result.verificationStatus || null,
                validationAttempts: typeof result.validationAttempts === 'number' ? result.validationAttempts : null,
                validationReason: result.validationReason || null,
                listOrder: Number.isFinite(result.listOrder) ? result.listOrder : null,
                statusSource: result.statusSource || null
            }));
            chrome.storage.local.set({ efakturInvoiceResults: snapshot });
        }
    } catch (error) {
        if (error instanceof SessionLogoutError || error instanceof AutomationAbortError) { throw error; }
        console.warn("Content script: Failed to sync faktur results to storage:", error);
    }
}

function ensureFakturBaseline(fakturList) {
    if (!Array.isArray(fakturList)) {
        return;
    }
    fakturList.forEach((rawEntry, index) => {
        if (rawEntry == null) {
            return;
        }
        let fakturCandidate = rawEntry;
        if (typeof rawEntry === 'object' && rawEntry !== null) {
            fakturCandidate = rawEntry.nomor ?? rawEntry.number ?? rawEntry.nomorFaktur ?? '';
        }
        const faktur = (typeof fakturCandidate === 'string' ? fakturCandidate : String(fakturCandidate ?? '')).trim();
        if (!faktur) {
            return;
        }
        addFakturResult(faktur, 'PENDING', null, {
            listOrder: index + 1,
            statusSource: 'baseline'
        });
    });
}

function finalizePendingResults(finalState, customReason = null) {
    const pendingEntries = fakturProcessingResults.filter(entry => entry.status === 'PENDING');
    if (pendingEntries.length === 0) {
        return;
    }

    let fallbackReason = customReason;
    if (!fallbackReason) {
        if (finalState === MachineState.STOPPED) {
            fallbackReason = 'Belum diproses karena dihentikan oleh pengguna.';
        } else if (finalState === MachineState.ERROR) {
            fallbackReason = 'Belum diproses karena sesi berakhir atau terjadi error.';
        } else {
            fallbackReason = 'Belum diproses.';
        }
    }

    pendingEntries.forEach(entry => {
        addFakturResult(entry.nomorFaktur, 'NOT_PROCESSED', fallbackReason, {
            listOrder: entry.listOrder ?? null,
            statusSource: finalState || 'pending-finalize'
        });
    });
}


//  FAKTUR TRACKING: Fungsi untuk generate summary report
function generateFakturSummary() {
    if (fakturProcessingResults.length === 0) {
        return sanitizeLogMessage(" Tidak ada faktur yang diproses.");
    }

    const summary = {
        total: fakturProcessingResults.length,
        success: fakturProcessingResults.filter(r => r.status === 'SUCCESS').length,
        failed: fakturProcessingResults.filter(r => r.status === 'FAILED').length,
        notFound: fakturProcessingResults.filter(r => r.status === 'SKIPPED').length,
        skipped: fakturProcessingResults.filter(r => r.status === 'SKIPPED').length,
        notProcessed: fakturProcessingResults.filter(r => r.status === 'NOT_PROCESSED').length,
        pending: fakturProcessingResults.filter(r => r.status === 'PENDING').length
    };

    let report = `\n\n  SUMMARY REPORT HASIL PROSES FAKTUR  \n`;
    report += `\n`;
    report += ` Total Faktur Diproses: ${summary.total}\n`;
    report += ` Berhasil: ${summary.success}\n`;
    report += ` Gagal: ${summary.failed}\n`;
    report += ` Tidak Ditemukan: ${summary.notFound}\n`;
    report += ` Dilewati: ${summary.skipped}\n`;
    report += ` Belum Diproses: ${summary.notProcessed}\n`;
    if (summary.pending > 0) {
        report += ` Menunggu: ${summary.pending}\n`;
    }
    report += `\n\n`;

    // Detail hasil per faktur
    report += ` DETAIL HASIL PER FAKTUR:\n`;
    report += `\n`;

    const orderedResults = [...fakturProcessingResults].sort((a, b) => {
        const aOrder = Number.isFinite(a.listOrder) ? a.listOrder : null;
        const bOrder = Number.isFinite(b.listOrder) ? b.listOrder : null;

        if (aOrder != null && bOrder != null) {
            return aOrder - bOrder;
        }
        if (aOrder != null) {
            return -1;
        }
        if (bOrder != null) {
            return 1;
        }
        return (a.nomorFaktur || '').localeCompare(b.nomorFaktur || '');
    });

    orderedResults.forEach((result, index) => {
        const statusIcon = {
            'SUCCESS': '',
            'FAILED': '',
            'SKIPPED': '',
            'SKIPPED': '',
            'NOT_PROCESSED': '',
            'PENDING': ''
        }[result.status] || '';

        const orderLabel = Number.isFinite(result.listOrder) ? result.listOrder : (index + 1);

        report += `${orderLabel}. ${statusIcon} ${result.nomorFaktur} - ${result.status}`;
        const detailParts = [];
        if (result.errorCode) {
            detailParts.push(`Kode ${result.errorCode}`);
        }
        if (result.errorMessage) {
            detailParts.push(result.errorMessage);
        }
        if (result.source) {
            detailParts.push(`Sumber: ${result.source}`);
        }
        if (detailParts.length > 0) {
            report += ` (${detailParts.join(' | ')})`;
        }
        const masaParts = [];
        if (result.expectedMonth) {
            masaParts.push(`Target ${result.expectedMonth}`);
        }
        if (result.actualMonthLabel) {
            masaParts.push(`Aktual ${result.actualMonthLabel}`);
        }
        if (result.actualCreditStatus) {
            masaParts.push(`Status ${result.actualCreditStatus}`);
        }
        if (result.verificationStatus) {
            masaParts.push(`Verifikasi ${result.verificationStatus}`);
        }
        if (typeof result.validationAttempts === 'number' && result.validationAttempts > 0) {
            masaParts.push(`Cek ${result.validationAttempts}x`);
        }
        if (masaParts.length > 0) {
            report += ` {${masaParts.join(' | ')}}`;
        }
        report += ` [${result.timestamp}]\n`;
    });

    report += `\n`;

    return sanitizeLogMessage(report);
}

//  FAKTUR TRACKING: Fungsi untuk reset tracking array
function resetFakturTracking() {
    fakturProcessingResults = [];
    badGatewayRetryTracker = {};
    serverErrorState = null;
    activeFaktur = null;
    sessionReloadScheduled = false;
    if (typeof serverErrorHistory?.clear === 'function') {
        serverErrorHistory.clear();
    }
    try {
        if (chrome?.storage?.local) {
            chrome.storage.local.remove('efakturInvoiceResults');
        }
    } catch (error) {
        if (error instanceof SessionLogoutError || error instanceof AutomationAbortError) { throw error; }
        console.warn("Content script: Failed to clear stored invoice results:", error);
    }
    console.log("Content script: [FAKTUR TRACKING] Reset tracking array");
}

// Smart delay function with randomization to avoid bot detection

function assertNotStopped() {
    if (currentState === MachineState.STOPPED || currentState === MachineState.ERROR) {
        throw new AutomationAbortError("Proses dihentikan.");
    }
}

const delay = ms => {
    assertNotStopped();
    const jitter = isTurboMode ? Math.random() * 60 - 30 : Math.random() * 200 - 100;
    return new Promise(res => setTimeout(res, turboDelay(ms) + jitter));
};

// Intelligent delay based on action type
const smartDelay = (actionType) => {
    assertNotStopped();
    const multiplier = isTurboMode ? 0.3 : 1;
    const delays = {
        'click': (200 + Math.random() * 300) * multiplier,
        'navigation': (800 + Math.random() * 400) * multiplier,
        'input': (150 + Math.random() * 200) * multiplier,
        'ui_update': (400 + Math.random() * 300) * multiplier,
        'filter': (600 + Math.random() * 400) * multiplier,
        'verify': (350 + Math.random() * 250) * multiplier,
        'retry': (1000 + Math.random() * 500) * multiplier
    };
    const finalDelay = Math.max(delays[actionType] || (300 * multiplier), 50);
    return new Promise(res => setTimeout(res, finalDelay));
};

const turboPause = (ms = 600) => {
    assertNotStopped();
    if (!isTurboMode) {
        return Promise.resolve();
    }
    const clamped = Math.max(ms, 200);
    return new Promise(res => setTimeout(res, clamped));
};

// Intelligent element waiting with faster polling
async function waitForElementSmart(selector, maxWaitMs = 5000, parent = document) {
    assertNotStopped();
    const startTime = Date.now();
    const pollInterval = 100; // Check every 100ms instead of 250ms

    while (Date.now() - startTime < maxWaitMs) {
        assertSessionActive(`waitForElementSmart:${selector}`);
        const element = parent.querySelector(selector);
        if (element && (element.offsetWidth > 0 || element.offsetHeight > 0)) {
            return element;
        }
        await new Promise(res => setTimeout(res, pollInterval));
    }
    return null;
}

// --- Helper Functions ---
//  DEDUPLICATION: Debounce tracking untuk menghindari duplikasi pesan
// Using Map with size limit to prevent memory leaks
const MESSAGE_TRACKING_MAX_SIZE = 100;
const MESSAGE_TRACKING_MAX_AGE = 30000; // 30 seconds
let lastMessageTime = new Map();
let lastMessageContent = new Map();

//  CLEANUP: Function untuk membersihkan old entries - runs deterministically
function cleanupMessageTracking() {
    const now = Date.now();

    // Clean up old entries
    for (const [key, timestamp] of lastMessageTime.entries()) {
        if (now - timestamp > MESSAGE_TRACKING_MAX_AGE) {
            lastMessageTime.delete(key);
            lastMessageContent.delete(key);
        }
    }

    // Enforce size limit by removing oldest entries
    if (lastMessageTime.size > MESSAGE_TRACKING_MAX_SIZE) {
        const entries = Array.from(lastMessageTime.entries())
            .sort((a, b) => a[1] - b[1]); // Sort by timestamp ascending

        const toRemove = entries.slice(0, entries.length - MESSAGE_TRACKING_MAX_SIZE);
        for (const [key] of toRemove) {
            lastMessageTime.delete(key);
            lastMessageContent.delete(key);
        }
    }
}

function updateStatus(message, statusType = 'status', invoicesProcessed = 0, isFinalCompletion = false, currentQuotaUsed = 0, totalQuota = 0) {
    updateSessionActivity('status-update');
    const now = Date.now();
    let safeMessage = sanitizeLogMessage(typeof message === 'string' ? message : String(message ?? ''));
    
    // Simplifikasi log untuk user akuntansi/pajak
    if (safeMessage.includes('Mensimulasikan klik pada tombol')) {
        safeMessage = `[PROSES] Menyetujui faktur...`;
    } else if (safeMessage.includes('Filter tahun berhasil diatur ke')) {
        safeMessage = `[PROSES] Mengatur tahun faktur...`;
    } else if (safeMessage.includes('Mencari input') || safeMessage.includes('Memastikan filter') || safeMessage.includes('Menunggu elemen')) {
        // Abaikan log teknis yang terlalu detail
        return;
    } else if (safeMessage.includes('SUKSES memproses faktur')) {
        const match = safeMessage.match(/faktur (\d+)/);
        const fakturNum = match ? match[1] : '';
        safeMessage = `✅ [BERHASIL] Faktur ${fakturNum} sukses diproses.`;
    } else if (safeMessage.includes('GAGAL memproses faktur')) {
        const match = safeMessage.match(/faktur (\d+)/);
        const fakturNum = match ? match[1] : '';
        safeMessage = `❌ [GAGAL] Faktur ${fakturNum} gagal diproses.`;
    }

    const messageKey = `${statusType}_${safeMessage}`;

    //  DEDUPLICATION: Cek apakah pesan yang sama sudah dikirim dalam 1000ms terakhir
    const lastTime = lastMessageTime.get(messageKey);
    const lastContent = lastMessageContent.get(messageKey);
    if (lastTime && lastContent &&
        now - lastTime < 1000 &&
        lastContent === safeMessage) {
        // Skip duplicate message dalam waktu 1 detik
        return;
    }

    // Update tracking using Map
    lastMessageTime.set(messageKey, now);
    lastMessageContent.set(messageKey, safeMessage);

    //  CLEANUP: Run cleanup deterministically every 10 messages
    if (lastMessageTime.size % 10 === 0) {
        cleanupMessageTracking();
    }

    console.log(`Content script: [UPDATE STATUS] Sending: ${safeMessage.substring(0, 50)}...`);

    chrome.runtime.sendMessage({
        type: 'automation-status',
        statusType,
        message: safeMessage,
        invoicesProcessed,
        isFinalCompletion,
        currentQuotaUsed,
        totalQuota,
        sisaQuota: totalQuota - currentQuotaUsed
    });
}

function parseCsv(csvString) {
    if (!csvString || typeof csvString !== 'string') {
        throw new Error("File CSV kosong atau tidak valid.");
    }

    const fakturMap = new Map();
    const fakturList = [];
    const addFaktur = (nomor, masa) => {
        if (!fakturMap.has(nomor)) {
            const masaDetails = buildMasaDetailsFromInput(masa);
            fakturMap.set(nomor, masaDetails);
            fakturList.push({
                nomor,
                masa: masaDetails
            });
        }
    };

    const rawLines = csvString.split(/\r?\n/);
    const trimmedLines = rawLines
        .map(line => (line || '').trim())
        .filter(line => line.length > 0);

    if (trimmedLines.length === 0) {
        throw new Error("File CSV kosong atau tidak valid.");
    }

    const mightBeHeader = trimmedLines[0];
    const headerLooksTextual = /[A-Za-z]/.test(mightBeHeader);
    const headerHasFaktur = /faktur/i.test(mightBeHeader);
    const headerContainsNumber = /(?<!\d)\d{17}(?!\d)/.test(mightBeHeader) || mightBeHeader.replace(/[^\d]/g, '').length === 17;
    const dataStartIndex = (headerLooksTextual || headerHasFaktur) && !headerContainsNumber ? 1 : 0;

    for (let i = dataStartIndex; i < trimmedLines.length; i++) {
        const line = trimmedLines[i];
        const fragments = line.split(/[,;|\t]/).map(f => f.trim());

        let foundNomor = null;
        let foundMasa = null;

        // Process fragments to find invoice number and masa pajak
        if (fragments.length > 1) {
            for (const fragment of fragments) {
                // Try to find 17-digit invoice number
                let localNomor = null;
                const sequentialMatches = fragment.match(/(?<!\d)\d{17}(?!\d)/g);
                if (sequentialMatches && sequentialMatches.length === 1) {
                    localNomor = sequentialMatches[0];
                } else {
                    const digitsOnly = fragment.replace(/[^\d]/g, '');
                    if (digitsOnly.length === 17) {
                        localNomor = digitsOnly;
                    }
                }

                if (localNomor && !foundNomor) {
                    foundNomor = localNomor;
                    continue;
                }

                if (!foundMasa) {
                    const masaCandidate = buildMasaDetailsFromInput(fragment);
                    if (masaCandidate) {
                        foundMasa = masaCandidate;
                    }
                }
            }
        }

        // Fallback for single fragment line or if no number found yet
        if (!foundNomor) {
            const fallbackMatches = line.match(/(?<!\d)\d{17}(?!\d)/g);
            if (fallbackMatches && fallbackMatches.length > 0) {
                foundNomor = fallbackMatches[0];
            } else {
                const digitsOnly = line.replace(/[^\d]/g, '');
                if (digitsOnly.length === 17) {
                    foundNomor = digitsOnly;
                }
            }
        }

        if (!foundMasa) {
            const fallbackMasa = buildMasaDetailsFromInput(line);
            if (fallbackMasa) {
                foundMasa = fallbackMasa;
            }
        }

        if (foundNomor) {
            addFaktur(foundNomor, foundMasa);
        }
    }

    if (fakturList.length === 0) {
        throw new Error("Tidak ada nomor faktur valid (17 digit) yang ditemukan.");
    }

    return fakturList;
}

async function waitForElement(selector, timeout = 10000, parent = document) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
        assertSessionActive(`waitForElement:${selector}`);
        const element = parent.querySelector(selector);
        if (element && (element.offsetWidth > 0 || element.offsetHeight > 0)) {
            return element;
        }
        await new Promise(res => setTimeout(res, 250));
    }
    return null; // Return null instead of throwing, allows for graceful handling
}

async function klikTombolRefresh() {
    const maxRetries = 3;
    let retryCount = 0;

    while (retryCount < maxRetries) {
        try {
            console.log(`Content script: [REFRESH DIAGNOSIS] Looking for refresh button (Attempt ${retryCount + 1}/${maxRetries})`);
            updateStatus(`  -> Mencari tombol refresh... (Percobaan ${retryCount + 1})`);

            //  DIAGNOSIS: Log current page state when searching for refresh button
            console.log(`Content script: [REFRESH DIAGNOSIS] Page state check:`);
            console.log(`- URL: ${window.location.href}`);
            console.log(`- Title: ${document.title}`);
            console.log(`- ReadyState: ${document.readyState}`);
            console.log(`- Total buttons: ${document.querySelectorAll('button').length}`);
            console.log(`- Total pi icons: ${document.querySelectorAll('[class*="pi"]').length}`);
            console.log(`- Specific pi-refresh: ${document.querySelectorAll('.pi-refresh, [class*="pi-refresh"]').length}`);

            //  DIAGNOSIS: Check if we're actually on the right page before searching
            const pageValidators = [
                '[id*="filterTaxInvoicePeriod"]',
                '#filterTaxInvoiceNumber',
                '.p-datatable-tbody'
            ];

            let onCorrectPage = false;
            for (let validator of pageValidators) {
                const element = document.querySelector(validator);
                if (element && element.offsetWidth > 0) {
                    console.log(`Content script: [REFRESH DIAGNOSIS]  Page validator found: ${validator}`);
                    onCorrectPage = true;
                    break;
                }
            }

            if (!onCorrectPage) {
                console.warn(`Content script: [REFRESH DIAGNOSIS]  Not on correct page! Refresh search may fail.`);
                console.warn(`Content script: [REFRESH DIAGNOSIS] Page content: ${document.body.innerText.substring(0, 200)}...`);
            }

            let refreshIcon = null;

            // Multiple selectors untuk refresh button
            const refreshSelectors = [
                '.pi.pi-refresh',                    // PrimeIcons class
                '[class*="pi-refresh"]',             // Partial class match
                '.fa-refresh',                       // FontAwesome
                '.fas.fa-sync-alt',                  // Alternate FA icon
                'button[title*="refresh"]',         // Button with refresh title
                'button[aria-label*="refresh"]',    // Accessibility label
                '.refresh-button, .btn-refresh'     // Generic class names
            ];

            console.log(`Content script: [REFRESH DIAGNOSIS] Searching through ${refreshSelectors.length} selectors...`);
            for (let selector of refreshSelectors) {
                try {
                    refreshIcon = await waitForElementSmart(selector, 2000); // Optimized to 2s
                    if (refreshIcon) {
                        console.log(`Content script: [REFRESH DIAGNOSIS]  Refresh button found with selector: '${selector}'`);
                        console.log(`Content script: [REFRESH DIAGNOSIS] Element details: tag=${refreshIcon.tagName}, class=${refreshIcon.className}, visible=${refreshIcon.offsetWidth > 0}`);
                        break;
                    } else {
                        console.log(`Content script: [REFRESH DIAGNOSIS]  Selector '${selector}' returned null`);
                    }
                } catch (e) {
                    if (e instanceof SessionLogoutError) { throw e; }
                    console.log(`Content script: [REFRESH DIAGNOSIS]  Error with selector '${selector}':`, e.message);
                }
            }

            if (!refreshIcon) {
                console.warn(`Content script: [REFRESH DIAGNOSIS] No refresh icon found with primary selectors (Attempt ${retryCount + 1})`);

                //  ENHANCED FALLBACK: Cari button dengan text content
                console.log(`Content script: [REFRESH DIAGNOSIS] Trying text-based search...`);
                const textBasedButtons = Array.from(document.querySelectorAll('button')).filter(btn => {
                    const text = btn.textContent?.toLowerCase() || '';
                    const title = btn.title?.toLowerCase() || '';
                    const ariaLabel = btn.getAttribute('aria-label')?.toLowerCase() || '';
                    return text.includes('refresh') || text.includes('muat ulang') ||
                        title.includes('refresh') || ariaLabel.includes('refresh');
                });

                if (textBasedButtons.length > 0) {
                    refreshIcon = textBasedButtons[0];
                    console.log(`Content script: [REFRESH DIAGNOSIS]  Found refresh button by text: "${refreshIcon.textContent?.trim()}"`);
                } else {
                    console.log(`Content script: [REFRESH DIAGNOSIS]  No text-based refresh buttons found`);
                }

                //  FINAL FALLBACK: Check if page is still loading or we're on wrong page
                if (!refreshIcon) {
                    console.warn(`Content script: [REFRESH DIAGNOSIS] Complete failure to find refresh button (Attempt ${retryCount + 1})`);
                    console.warn(`Content script: [REFRESH DIAGNOSIS] Possible causes:`);
                    console.warn(`- Still on wrong page: URL=${window.location.href}`);
                    console.warn(`- Page still loading: readyState=${document.readyState}`);
                    console.warn(`- Content not fully rendered: visible buttons=${document.querySelectorAll('button:not([style*="display: none"])').length}`);

                    if (retryCount < maxRetries - 1) {
                        console.log(`Content script: [REFRESH DIAGNOSIS] Retrying with longer wait (Attempt ${retryCount + 1}/${maxRetries})...`);
                        retryCount++;

                        //  ENHANCED RETRY: Wait longer and check page state again
                        await smartDelay('retry');
                        await smartDelay('retry'); // Double wait for slow pages

                        // Log state before retry
                        console.log(`Content script: [REFRESH DIAGNOSIS] Pre-retry state: URL=${window.location.href}, readyState=${document.readyState}`);
                        continue;
                    } else {
                        updateStatus("  ->  GAGAL: Tombol refresh tidak ditemukan setelah semua percobaan dengan diagnosis lengkap.", 'error');
                        console.error(`Content script: [REFRESH DIAGNOSIS] FINAL FAILURE - No refresh button found after all attempts`);
                        console.error(`Content script: [REFRESH DIAGNOSIS] Final page state: URL=${window.location.href}, title="${document.title}"`);
                        return false;
                    }
                }
            }

            // Cari button parent jika yang ditemukan adalah icon
            let buttonToClick = refreshIcon;
            if (refreshIcon.classList.contains('pi') || refreshIcon.classList.contains('fa')) {
                buttonToClick = refreshIcon.closest('button') || refreshIcon.closest('[role="button"]');
                console.log("Content script: Found icon, looking for parent button...");
            }

            if (!buttonToClick) {
                // Jika icon tidak memiliki button parent, coba klik icon langsung
                buttonToClick = refreshIcon;
                console.log("Content script: No parent button found, clicking icon directly...");
            }

            // Validasi button sebelum klik
            if (buttonToClick.disabled) {
                console.warn("Content script: Refresh button is disabled");
                if (retryCount < maxRetries - 1) {
                    console.log("Content script: Waiting and retrying...");
                    retryCount++;
                    await smartDelay('retry');
                    continue;
                } else {
                    updateStatus("  ->  Tombol refresh sedang disabled/mati.", 'error');
                    return false;
                }
            }

            console.log("Content script: Clicking refresh button...");
            buttonToClick.click();

            // Wait for refresh to complete dengan deteksi
            console.log("Content script: Waiting for page refresh to complete...");

            // Method 1: Tunggu loading indicator menghilang
            let refreshComplete = false;
            for (let i = 0; i < 10; i++) { // Optimized to 10 iterations
                await smartDelay('ui_update');

                // Cek apakah ada loading indicator
                const loadingIndicator = document.querySelector('.p-progress-spinner, .loading, .spinner') ||
                    document.querySelector('[class*="loading"]') ||
                    document.querySelector('[class*="spinner"]');

                if (!loadingIndicator) {
                    console.log("Content script: No loading indicator found - assuming refresh complete");
                    refreshComplete = true;
                    break;
                }

                // Method 2: Cek filter bulan apakah muncul kembali (indicator page loaded)
                const filterBulan = document.querySelector('p-multiselect[id*="filterTaxInvoicePeriod"]') ||
                    document.querySelector('.p-multiselect[id*="filterTaxInvoicePeriod"]');

                if (filterBulan && filterBulan.offsetWidth > 0) {
                    console.log("Content script: Filter bulan visible - refresh complete");
                    refreshComplete = true;
                    break;
                }

                console.log(`Content script: Still refreshing... (${i + 1}s)`);
            }

            // Method 3: Fixed timeout sebagai fallback
            if (!refreshComplete) {
                console.log("Content script: Refresh timeout reached, proceeding...");
                await smartDelay('ui_update'); // Optimized wait
            }

            updateStatus("  ->  Halaman berhasil di-refresh");
            console.log("Content script: Page refresh completed successfully");
            return true;

        } catch (error) {
            if (error instanceof SessionLogoutError || error instanceof AutomationAbortError) { throw error; }
            console.error(`Content script: Error during refresh attempt ${retryCount + 1}:`, error);
            if (retryCount < maxRetries - 1) {
                console.log("Content script: Retrying refresh button search after error...");
                retryCount++;
                await smartDelay('retry');
            } else {
                updateStatus(`  ->  ERROR: Refresh gagal dengan error - ${error.message}`, 'error');
                return false;
            }
        }
    }

    updateStatus("  ->  GAGAL TOTAL: Refresh gagal setelah semua percobaan.", 'error');
    console.error("Content script: All refresh attempts failed");
    return false;
}

async function attemptBadGatewayRecovery() {
    try {
        dismissServerErrorDialogs();
        await smartDelay('retry');
        const refreshed = await klikTombolRefresh();
        if (!refreshed) {
            console.warn("Content script: [SERVER ERROR] Refresh after 502 returned false");
        }
    } catch (error) {
        if (error instanceof SessionLogoutError || error instanceof AutomationAbortError) { throw error; }
        console.warn("Content script: [SERVER ERROR] Bad gateway recovery failed:", error);
    }
    await smartDelay('ui_update');
}

async function filterBulan() {
    try {
        updateStatus("  -> Mencari filter bulan dengan simulasi klik natural...");

        //  DIAGNOSIS: Tambahkan informasi halaman sebelum mencari filter
        console.log("Content script: [DIAGNOSIS] Url saat ini:", window.location.href);
        console.log("Content script: [DIAGNOSIS] Title halaman:", document.title);
        console.log("Content script: [DIAGNOSIS] Document readyState:", document.readyState);
        console.log("Content script: [DIAGNOSIS] Total p-multiselect elements:", document.querySelectorAll('p-multiselect').length);
        console.log("Content script: [DIAGNOSIS] Total multiselect elements:", document.querySelectorAll('[class*="multiselect"]').length);
        console.log("Content script: [DIAGNOSIS] Total form elements:", document.querySelectorAll('form').length);
        console.log("Content script: [DIAGNOSIS] Total elements with ID:", document.querySelectorAll('[id]').length);

        // DIAGNOSIS: Log semua multiselect elements yang ditemukan untuk debugging
        const multiselects = document.querySelectorAll('p-multiselect');
        if (multiselects.length > 0) {
            console.log("Content script: [DIAGNOSIS] Found p-multiselect elements:");
            multiselects.forEach((el, index) => {
                console.log(` p-multiselect[${index}]:`, {
                    id: el.id,
                    className: el.className,
                    ariaLabel: el.getAttribute('aria-label'),
                    placeholder: el.getAttribute('placeholder'),
                    parentElement: el.parentElement?.tagName,
                    visible: el.offsetWidth > 0
                });
            });
        } else {
            console.warn("Content script: [DIAGNOSIS]  TIDAK ADA p-multiselect elements ditemukan!");
            // Coba log semua elements dengan class "p-multiselect"
            const pMultiselects = document.querySelectorAll('.p-multiselect');
            console.log("Content script: [DIAGNOSIS] Elements with .p-multiselect class:", pMultiselects.length);
            pMultiselects.forEach((el, index) => {
                console.log(` .p-multiselect[${index}]:`, {
                    id: el.id,
                    tagName: el.tagName,
                    visible: el.offsetWidth > 0,
                    textContent: el.textContent?.substring(0, 50)
                });
            });
        }

        //  PERBAIKAN: Cek apakah halaman sudah fully loaded dan tunggu elemen siap
        if (document.readyState !== 'complete') {
            console.warn("Content script: [DIAGNOSIS]  Document belum complete! ReadyState:", document.readyState);
            // Tunggu halaman fully loaded
            await new Promise(resolve => {
                if (document.readyState === 'complete') {
                    resolve();
                } else {
                    window.addEventListener('load', resolve);
                    // Timeout fallback
                    setTimeout(resolve, 5000);
                }
            });
            console.log("Content script: [DIAGNOSIS] Halaman sudah fully loaded");
        }

        //  PERBAIKAN: Tunggu tambahan waktu untuk dynamic elements
        updateStatus("  -> Menunggu elemen dynamic siap...");
        await new Promise(resolve => setTimeout(resolve, 3000));

        const preferredMonths = getPreferredFilterMonthLabels();
        if (preferredMonths.length > 0) {
            updateStatus(`  -> Mengatur filter sesuai daftar CSV (${preferredMonths.length} bulan)...`);
            const preferredResult = await resetFilterToSelectedMonths(preferredMonths);
            if (preferredResult) {
                console.log("Content script: [FILTER BULAN] Menggunakan daftar masa pajak dari CSV - selesai.");
                return true;
            }
            console.warn("Content script: [FILTER BULAN] Pengaturan filter via daftar CSV gagal, fallback ke mode lama.");
        }

        // Definisi array bulan untuk verifikasi
        const allMonths = [
            "Januari", "Februari", "Maret", "April", "Mei", "Juni",
            "Juli", "Agustus", "September", "Oktober", "November", "Desember"
        ];

        //  BUG FIX: Helper function untuk menghitung bulan yang sudah terpilih dari label
        function countSelectedMonths(label, monthsArray) {
            let count = 0;
            monthsArray.forEach(month => {
                if (label.includes(month)) count++;
            });
            console.log(`Content script: countSelectedMonths - Found ${count} months in label: "${label}"`);
            return count;
        }

        //  MULTI-LEVEL SELECTOR SEARCH
        let multiSelect = null;
        const selectorAttempts = [
            // 1. Exact match untuk periode
            { selector: 'p-multiselect#filterTaxInvoicePeriod', desc: 'p-multiselect#filterTaxInvoicePeriod (exact)' },
            { selector: 'p-multiselect[id*="filterTaxInvoicePeriod"]', desc: 'p-multiselect[id*="filterTaxInvoicePeriod"] (wildcard ID)' },
            { selector: '.p-multiselect[id*="filterTaxInvoicePeriod"]', desc: '.p-multiselect[class][id*="filterTaxInvoicePeriod"] (class + ID)' },

            // 2. Generic multiselect dengan pencarian teks/placeholder
            { selector: 'p-multiselect[placeholder*="masa"]', desc: 'p-multiselect[placeholder*="masa"] (masa pajak)' },
            { selector: 'p-multiselect[placeholder*="bulan"]', desc: 'p-multiselect[placeholder*="bulan"] (bulan)' },
            { selector: '[class*="multiselect"][placeholder*="masa"]', desc: '[class*="multiselect"][placeholder*="masa"] (generic multiselect)' },

            // 3. Generic elements dengan filter
            { selector: '[id*="filter"][id*="Period"]', desc: '[id*="filter"][id*="Period"] (filter Month Period)' },
            { selector: '[id*="filter"][id*="period"]', desc: '[id*="filter"][id*="period"] (filter period lowercase)' },
            { selector: '[class*="multiselect"]', desc: '[class*="multiselect"] (all multiselects)' },

            // 4. Try to find by parent container yang sering digunakan
            { selector: 'form p-multiselect', desc: 'form p-multiselect (within form)' },
            { selector: '[class*="card"] p-multiselect', desc: '[class*="card"] p-multiselect (within card)' },
            { selector: '[class*="panel"] p-multiselect', desc: '[class*="panel"] p-multiselect (within panel)' }
        ];

        console.log("Content script: [SELECTOR ATTEMPTS] Trying multiple selectors...");

        for (const attempt of selectorAttempts) {
            console.log(`Content script: [SELECTOR ATTEMPTS] Trying: ${attempt.desc}`);

            try {
                multiSelect = await waitForElementSmart(attempt.selector, 5000); // Increased to 5s for reliability
                if (multiSelect) {
                    console.log(`Content script:  SUCCESS with selector: '${attempt.desc}'`);
                    console.log("Content script: Found element:", {
                        tagName: multiSelect.tagName,
                        id: multiSelect.id,
                        className: multiSelect.className,
                        visible: multiSelect.offsetWidth > 0
                    });
                    break;
                } else {
                    console.log(`Content script:  No result for: '${attempt.desc}'`);
                }
            } catch (error) {
                if (error instanceof SessionLogoutError || error instanceof AutomationAbortError) { throw error; }
                console.warn(`Content script:  Error with selector '${attempt.desc}':`, error.message);
            }
        }

        if (!multiSelect) {
            updateStatus("  ->  SEMUA SELECTOR GAGAL: Filter bulan tidak ditemukan pada halaman ini.", 'error');

            // LOG ELEMENTS YANG ADA DI HALAMAN UNTUK DEBUGGING
            console.error("Content script: [FINAL FAIL] No filter elements found. Current page elements:");
            console.error("- Current URL:", window.location.href);
            console.error("- Current title:", document.title);
            console.error("- Ready state:", document.readyState);

            const allElements = document.querySelectorAll('*');
            const elementStats = {
                total: allElements.length,
                withId: Array.from(allElements).filter(el => el.id).length,
                withClass: Array.from(allElements).filter(el => el.className).length,
                multiselectElements: document.querySelectorAll('[class*="multiselect"]').length,
                pElements: document.querySelectorAll('p-multiselect, .p-multiselect').length,
                selectElements: document.querySelectorAll('select').length,
                formElements: document.querySelectorAll('form').length
            };
            console.error("Content script: [FINAL FAIL] Page statistics:", elementStats);

            console.error("Content script: [FINAL FAIL] This automation will stop due to missing filter element");
            return false;
        }

        updateStatus("  ->  Filter bulan ditemukan dengan selector yang berhasil");

        updateStatus("  -> Eksekusi langsung: Bukai dropdown dan klik select-all checkbox...");
        console.log("Content script: DIRECT EXECUTION MODE - No state detection needed");

        updateStatus("  -> Klik trigger untuk buka dropdown filter...");
        console.log("Content script: Membuka dropdown filter bulan dengan simulasi natural");

        // PERBAIKAN: Prioritaskan selector yang lebih reliable
        // Urutan baru: label-container -> label -> trigger -> multiSelect
        let trigger = null;

        // 1. Coba klik label container terlebih dahulu (ini yang biasanya visible dan clickable)
        trigger = multiSelect.querySelector('.p-multiselect-label-container');
        if (trigger) {
            console.log("Content script:  .p-multiselect-label-container ditemukan");
        }

        // 2. Jika tidak ada, coba label langsung
        if (!trigger) {
            trigger = multiSelect.querySelector('.p-multiselect-label');
            if (trigger) {
                console.log("Content script:  .p-multiselect-label ditemukan");
            }
        }

        // 3. Jika tidak ada, coba trigger icon
        if (!trigger) {
            trigger = multiSelect.querySelector('.p-multiselect-trigger');
            if (trigger) {
                console.log("Content script:  .p-multiselect-trigger ditemukan");
            }
        }

        // 4. Fallback: klik multiSelect langsung
        if (!trigger) {
            console.log("Content script: Tidak ada trigger spesifik, mencoba klik multiSelect langsung...");
            trigger = multiSelect;
        }

        if (!trigger) {
            updateStatus("  -> GAGAL: Trigger dropdown filter tidak ditemukan.", 'error');
            console.error("Content script: Trigger filter bulan tidak ditemukan");
            return false;
        }

        console.log("Content script: Trigger ditemukan:", trigger.className || trigger.tagName);

        // SIMULASI KLIK DENGAN MOUSE EVENTS YANG LEBIH NATURAL
        // Coba beberapa metode klik untuk memastikan berhasil
        try {
            // Metode 1: dispatch mousedown, mouseup, click events
            const mouseDownEvent = new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window });
            const mouseUpEvent = new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window });
            const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });

            trigger.dispatchEvent(mouseDownEvent);
            await new Promise(resolve => setTimeout(resolve, 50));
            trigger.dispatchEvent(mouseUpEvent);
            await new Promise(resolve => setTimeout(resolve, 50));
            trigger.dispatchEvent(clickEvent);
        } catch (e) {
            // Fallback ke click biasa
            trigger.click();
        }

        await smartDelay('ui_update'); // Optimized UI response wait

        // PERBAIKAN: Tunggu lebih lama dan coba cari panel dengan berbagai selector
        await new Promise(resolve => setTimeout(resolve, 500)); // Extra wait

        let panel = await waitForElementSmart('.p-multiselect-panel:not(.p-hidden)', 5000) ||
            await waitForElementSmart('.p-multiselect-panel', 4000) ||
            await waitForElementSmart('.p-overlaypanel', 3000) ||
            await waitForElementSmart('[role="listbox"]', 3000);

        if (!panel) {
            updateStatus("  -> GAGAL: Panel dropdown filter tidak muncul.", 'error');
            console.error("Content script: Panel dropdown filter tidak muncul dengan semua selector");

            // Coba klik trigger lagi untuk tutup (recovery)
            try {
                trigger.click();
                await smartDelay('click');
            } catch (e) {
                if (e instanceof SessionLogoutError) { throw e; }
                console.warn("Content script: Error saat mencoba menutup dropdown:", e);
            }
            return false;
        }

        updateStatus("  -> Panel dropdown berhasil dibuka...");
        console.log("Content script: Dropdown panel opened successfully");

        //  CRITICAL FIX: Ensure checkbox is scrollable and visible before click
        const headerArea = panel.querySelector('.p-multiselect-header');
        const selectAllContainer = headerArea ? headerArea.querySelector('.p-checkbox') : panel.querySelector('.p-checkbox');

        if (selectAllContainer) {
            // Scroll into view to prevent overlay issues
            selectAllContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await new Promise(resolve => setTimeout(resolve, 400));
        }

        //  BUG FIX: Pre-check if already 12 months selected before clicking checkbox
        const currentLabel = multiSelect.querySelector('.p-multiselect-label-container')?.textContent || '';
        const currentSelectedCount = countSelectedMonths(currentLabel, allMonths);

        if (currentSelectedCount === 12) {
            updateStatus("  ->  12 bulan sudah terpilih, melewati klik checkbox");
            console.log("Content script:  All 12 months already selected, skipping checkbox click");

            //  LANGKAH BARU: Cek dan klik tombol clear filter jika tersedia
            updateStatus("  ->  Mencari tombol clear filter di bagian nomor faktur...");
            console.log("Content script:  LOOKING FOR CLEAR FILTER BUTTON - prioritas tinggi");

            // LOGGING LEBIH DETAIL untuk debugging clear filter
            const allButtons = document.querySelectorAll('button');
            const allSpans = document.querySelectorAll('span.pi');
            console.log(`Content script: [DEBUG CLEAR] Found ${allButtons.length} total buttons on page`);
            console.log(`Content script: [DEBUG CLEAR] Found ${allSpans.length} pi icons on page`);

            //  DEBUG FILTER-SLASH: Log semua elemen dengan pi-filter-slash
            const filterSlashElements = document.querySelectorAll('.pi-filter-slash');
            console.log(`Content script:  [FILTER-SLASH] Found ${filterSlashElements.length} elements with .pi-filter-slash class`);
            filterSlashElements.forEach((elem, index) => {
                console.log(`Content script:  [FILTER-SLASH ${index}] Element: class="${elem.className}" visible="${elem.offsetWidth > 0}"`);
                console.log(`Content script:  [FILTER-SLASH ${index}] Parent: ${elem.parentElement?.tagName} class="${elem.parentElement?.className}"`);
                console.log(`Content script:  [FILTER-SLASH ${index}] Grandparent: ${elem.parentElement?.parentElement?.tagName} class="${elem.parentElement?.parentElement?.className}"`);

                // Special check jika parent adalah button
                if (elem.parentElement?.tagName === 'BUTTON') {
                    console.log(`Content script:  [FILTER-SLASH ${index}]  FOUND BUTTON PARENT: class="${elem.parentElement.className}" visible="${elem.parentElement.offsetWidth > 0}"`);
                }
            });

            // Log semua tombol dengan class yang relevan
            const relevantButtons = document.querySelectorAll('button.p-column-filter-clear-button, button[class*="filter"][class*="clear"]');
            console.log(`Content script: [DEBUG CLEAR] Found ${relevantButtons.length} relevant filter buttons`);
            relevantButtons.forEach((btn, index) => {
                console.log(`Content script: [DEBUG CLEAR] Button ${index}: class="${btn.className}" visible="${btn.offsetWidth > 0}" span="${btn.querySelector('span.pi')?.className}"`);
            });

            // Cari tombol clear filter dengan selector yang tepat sebagai prioritas
            const clearSelectors = [
                'button.p-column-filter-clear-button.p-link',  //  PRIORITAS TERTINGGI - sesuai spesifikasi user
                'button.p-column-filter-clear-button',  // General clear button
                '[class*="column-filter-clear-button"]',  // Partial class match
                'button[class*="filter"][class*="clear"]',  // Other filter clear patterns
                'button[title*="clear"]',  // Title attribute
                'button[aria-label*="clear"]',  // Accessibility label
                '.p-column-filter-clear-button'  // Generic class selector
            ];

            let clearButton = null;

            //  PRIORITAS TERTINGGI: Cari dengan selector yang persis sesuai spesifikasi user - dengan logging detail
            console.log("Content script:  SEARCHING FOR EXACT CLEAR BUTTON - class='p-column-filter-clear-button p-link' + span.pi.pi-filter-slash");

            // Cari semua kandidat button dengan class yang tepat - FIX: Convert NodeList to Array untuk method find()
            const exactButtons = Array.from(document.querySelectorAll('button.p-column-filter-clear-button.p-link'));
            console.log(`Content script: [PRIORITY] Found ${exactButtons.length} buttons with exact class combination`);

            // Log detail setiap kandidat
            exactButtons.forEach((btn, index) => {
                const hasIcon = btn.querySelector('span.pi.pi-filter-slash') !== null;
                console.log(`Content script: [PRIORITY ${index}] Button class="${btn.className}" hasIcon="${hasIcon}" visible="${btn.offsetWidth > 0}" text="${btn.textContent?.trim()}"`);

                // Log juga icon tersendiri jika ada
                const iconSpan = btn.querySelector('span.pi.pi-filter-slash');
                if (iconSpan) {
                    console.log(`Content script: [PRIORITY ${index}] Icon: class="${iconSpan.className}" visible="${iconSpan.offsetWidth > 0}"`);
                }
            });

            // Temukan button yang sesuai spesifikasi lengkap
            clearButton = exactButtons.find(btn => {
                return btn.querySelector('span.pi.pi-filter-slash') !== null;
            });

            if (clearButton) {
                console.log("Content script:  FOUND EXACT MATCH: button.p-column-filter-clear-button.p-link with span.pi.pi-filter-slash");
                updateStatus("  ->  Tombol clear filter tepat ditemukan, klik untuk membersihkan filter");
            }

            if (clearButton) {
                console.log("Content script:  FOUND exact clear filter button match!");
                updateStatus("  ->  Tombol clear filter tepat ditemukan, klik untuk membersihkan filter");
            } else {
                // FALLBACK: Cari dengan selector lainnya
                for (let selector of clearSelectors) {
                    try {
                        clearButton = multiSelect.closest('p-columnfilter, [class*="columnfilter"]')?.querySelector(selector) ||
                            panel.querySelector(selector) ||
                            document.querySelector(selector);

                        if (clearButton && (clearButton.offsetWidth > 0 || clearButton.offsetHeight > 0)) {
                            console.log(`Content script:  Clear filter button found with selector: '${selector}'`);
                            updateStatus("  ->  Tombol clear filter ditemukan, klik untuk membersihkan filter");
                            break;
                        }
                    } catch (e) {
                        if (e instanceof SessionLogoutError) { throw e; }
                        console.log(`Content script: Selector '${selector}' failed, trying next...`);
                    }
                }

                //  NEW FALLBACK: Mencari span .pi-filter-slash dan cari parent button
                if (!clearButton) {
                    console.log("Content script:  FALLBACK: Looking for span.pi-filter-slash and finding parent button...");

                    const filterSlashSpans = document.querySelectorAll('span.pi.pi-filter-slash');
                    for (let span of filterSlashSpans) {
                        const buttonParent = span.closest('button');
                        if (buttonParent && (buttonParent.offsetWidth > 0 || buttonParent.offsetHeight > 0)) {
                            console.log(`Content script:  FOUND via FALLBACK: Button with span.pi.pi-filter-slash class="${buttonParent.className}"`);
                            clearButton = buttonParent;
                            updateStatus("  ->  Tombol clear filter ditemukan via fallback (span.pi.pi-filter-slash)");
                            break;
                        }
                    }
                }
            }

            // Klik tombol clear filter jika ditemukan (abaikan langkah ini jika tidak ada)
            if (clearButton) {
                try {
                    console.log("Content script:  Clicking clear filter button...");
                    clearButton.click();

                    // Tunggu clear filter selesai
                    await smartDelay('filter');
                    updateStatus("  ->  Filter berhasil di-clear - siap lanjut ke filtering nomor faktur");
                    console.log("Content script:  Clear filter operation completed - ready for nomor faktur filtering");
                } catch (clearError) {
                    if (clearError instanceof SessionLogoutError) { throw clearError; }
                    console.warn("Content script:  Failed to click clear filter button:", clearError);
                    updateStatus("  ->  Gagal klik tombol clear filter, namun tetap lanjut ke filtering nomor faktur");
                }
            } else {
                updateStatus("  ->  Tombol clear filter tidak ditemukan - lanjut langsung ke filtering nomor faktur");
                console.log("Content script:  Clear filter button not found - proceeding to nomor faktur filter");
            }

            //  FINAL STEP: Tutup panel dan konfirmasi siap untuk nomor faktur filter
            console.log("Content script:  Closing filter panel after clear filter attempt...");
            updateStatus("  ->  Menutup panel filter bulan dan melanjutkan ke filtering nomor faktur");
            trigger.click();
            await smartDelay('click');
            return true;
        } else {
            updateStatus(`  -> Hanya ${currentSelectedCount}/12 bulan terpilih, klik checkbox Select-All`);
            console.log(`Content script: Only ${currentSelectedCount}/12 months selected, proceeding with checkbox click`);
        }

        //  SIMPLIFIED APPROACH: Cukup klik 1 checkbox "Select All" di header
        console.log("Content script: Using simplified approach - single header checkbox");

        // Cari header area (reuse variable declared earlier)
        // NOTE: headerArea already declared at line 1778, just reassign here
        let headerAreaForCheckbox = panel.querySelector('.p-multiselect-header');

        if (!headerAreaForCheckbox) {
            updateStatus("  ->  Header area tidak ditemukan, namun tetap mencoba cari checkbox...", 'error');
            console.warn("Content script: Header area not found");

            // Fallback: Cari checkbox di seluruh panel
            console.log("Content script: Trying fallback search for checkbox...");
            const fallbackCheckbox = panel.querySelector('.p-checkbox-box');
            if (!fallbackCheckbox) {
                updateStatus("  ->  GAGAL: Tidak ada checkbox ditemukan dalam panel.", 'error');
                console.error("Content script: No checkbox found anywhere in panel");
                trigger.click();
                await smartDelay('click');
                return false;
            }
        } else {
            //  Cari checkbox "Select All" di header (sesuai struktur HTML user)
            const selectAllCheckbox = headerAreaForCheckbox.querySelector('.p-checkbox-box');

            if (!selectAllCheckbox) {
                updateStatus("  ->  Select-All checkbox tidak ada di header, coba cara alternatif...", 'error');
                console.warn("Content script: Select-All checkbox not found in header");

                // Fallback: Cari checkbox di seluruh panel
                const fallbackCheckbox = panel.querySelector('.p-checkbox-box');
                if (!fallbackCheckbox) {
                    updateStatus("  ->  GAGAL: Tidak ada checkbox ditemukan.", 'error');
                    console.error("Content script: No checkbox found");
                    trigger.click();
                    await smartDelay('click');
                    return false;
                }
            }
        }

        //  FINALLY: Get the checkbox (either from header or fallback)
        const targetCheckbox = headerAreaForCheckbox ? headerAreaForCheckbox.querySelector('.p-checkbox-box') : panel.querySelector('.p-checkbox-box');

        updateStatus("  ->  Klik checkbox Select-All...");
        console.log("Content script:  Found checkbox to click!");
        console.log("Content script: Clicking select-all checkbox...");

        try {
            // Klik checkbox "Select All" satu kali saja
            targetCheckbox.click();
            updateStatus('  ->  Header checkbox berhasil diklik!');
            console.log("Content script: Header select-all checkbox clicked successfully");

            // Tunggu UI update setelah klik checkbox
            await smartDelay('ui_update');

            //  LANGKAH BARU: Setelah select all, cari dan klik tombol clear filter jika tersedia
            updateStatus("  ->  Mencari tombol clear filter setelah select all...");
            console.log("Content script: Looking for clear filter button after select-all...");

            // Cari tombol clear filter dengan selector yang tepat sebagai prioritas
            const clearSelectors = [
                'button.p-column-filter-clear-button.p-link',  //  PRIORITAS TERTINGGI - sesuai spesifikasi user
                'button.p-column-filter-clear-button',  // General clear button
                '[class*="column-filter-clear-button"]',  // Partial class match
                'button[class*="filter"][class*="clear"]',  // Other filter clear patterns
                'button[title*="clear"]',  // Title attribute
                'button[aria-label*="clear"]',  // Accessibility label
                '.p-column-filter-clear-button',  // Generic class selector
                'span.pi.pi-filter-slash'  // Icon fallback untuk mencari parent button
            ];

            let clearButton = null;

            //  PRIORITAS TERTINGGI: Cari dengan selector yang persis sesuai spesifikasi user
            console.log("Content script: Searching for exact clear button selector after select-all...");
            clearButton = Array.from(document.querySelectorAll('button.p-column-filter-clear-button.p-link')).find(btn => {
                return btn.querySelector('span.pi.pi-filter-slash');
            });

            if (clearButton) {
                console.log("Content script:  FOUND exact clear filter button match after select-all!");
                updateStatus("  ->  Tombol clear filter tepat ditemukan, klik untuk membersihkan filter");
            } else {
                // FALLBACK: Cari dengan selector lainnya
                for (let selector of clearSelectors) {
                    try {
                        clearButton = multiSelect.closest('p-columnfilter, [class*="columnfilter"]')?.querySelector(selector) ||
                            panel.querySelector(selector) ||
                            document.querySelector(selector);

                        if (clearButton && (clearButton.offsetWidth > 0 || clearButton.offsetHeight > 0)) {
                            console.log(`Content script:  Clear filter button found with selector: '${selector}'`);

                            // Jika ditemukan span icon, cari button parent
                            if (clearButton.tagName === 'SPAN') {
                                clearButton = clearButton.closest('button') || clearButton.parentElement?.closest('button');
                                console.log("Content script: Found icon span, trying to find parent button...");
                            }

                            if (clearButton) {
                                updateStatus("  ->  Tombol clear filter ditemukan, klik untuk membersihkan filter");
                                break;
                            }
                        }
                    } catch (e) {
                        if (e instanceof SessionLogoutError) { throw e; }
                        console.log(`Content script: Selector '${selector}' failed, trying next...`);
                    }
                }

                //  NEW FALLBACK AFTER SELECT-ALL: Mencari span .pi-filter-slash dan cari parent button
                if (!clearButton) {
                    console.log("Content script:  FALLBACK AFTER SELECT-ALL: Looking for span.pi-filter-slash and finding parent button...");

                    const filterSlashSpans = document.querySelectorAll('span.pi.pi-filter-slash');
                    for (let span of filterSlashSpans) {
                        const buttonParent = span.closest('button');
                        if (buttonParent && (buttonParent.offsetWidth > 0 || buttonParent.offsetHeight > 0)) {
                            console.log(`Content script:  FOUND via FALLBACK AFTER SELECT-ALL: Button with span.pi.pi-filter-slash class="${buttonParent.className}"`);
                            clearButton = buttonParent;
                            updateStatus("  ->  Tombol clear filter ditemukan via fallback (span.pi.pi-filter-slash)");
                            break;
                        }
                    }
                }
            }

            // Klik tombol clear filter jika ditemukan (abaikan langkah ini jika tidak ada)
            if (clearButton) {
                try {
                    console.log("Content script: Clicking clear filter button after select-all...");
                    clearButton.click();

                    // Tunggu clear filter selesai
                    await smartDelay('filter');
                    updateStatus("  ->  Filter berhasil di-clear setelah select-all");
                    console.log("Content script: Clear filter operation completed after select-all");
                } catch (clearError) {
                    if (clearError instanceof SessionLogoutError) { throw clearError; }
                    console.warn("Content script: Failed to click clear filter button:", clearError);
                    updateStatus("  ->  Gagal klik tombol clear filter, namun melanjutkan proses");
                }
            } else {
                updateStatus("  ->  Tombol clear filter tidak ditemukan setelah select-all, melanjutkan proses");
                console.log("Content script: Clear filter button not found after select-all - skipping step as requested");
            }

            // VERIFIKASI AKHIR: Pastikan bulan terpilih menggunakan method yang berbeda
            const selectedItems = panel.querySelectorAll('.p-multiselect-item.p-highlight').length;
            console.log(`Content script: Verification method 1 - ${selectedItems} items highlighted`);

            // Method 2: Cek apakah ada perubahan pada label multiselect
            const labelSelector = multiSelect.querySelector('.p-multiselect-label, .p-multiselect-label-container');
            const currentLabel = labelSelector?.textContent?.trim() || 'No label';
            console.log(`Content script: Verification method 2 - Label after click: "${currentLabel}"`);

            // Basic success check
            if (selectedItems >= 12 || currentLabel.toLowerCase() !== 'pilih masa pajak') {
                updateStatus("  ->  SUKSES! Checkbox Select-All berfungsi dengan baik");
                console.log("Content script: SELECT-ALL CHECKBOX WORKING!");
            } else {
                updateStatus(`  ->  Mungkin berhasil: ${selectedItems} item terpilih`);
                console.log(`Content script: Possible success: ${selectedItems} months selected`);
            }

        } catch (error) {
            if (error instanceof SessionLogoutError || error instanceof AutomationAbortError) { throw error; }
            updateStatus(`  ->  ERROR: Gagal klik checkbox - ${error.message}`, 'error');
            console.error("Content script: Failed to click checkbox:", error);
            trigger.click(); // Tutup panel
            await smartDelay('click');
            return false;
        }

        // SUCCESS MESSAGE
        updateStatus("  ->  SELECT-ALL BERHASIL! Checkbox header diklik");
        console.log("Content script: SIMPLIFIED SELECT-ALL OPERATION COMPLETE");

        updateStatus("  -> Menutup panel filter...");
        console.log("Content script: Menutup panel filter bulan");

        // Tutup panel dengan klik trigger lagi atau klik di luar
        trigger.click();
        await smartDelay('ui_update'); // Optimized panel close wait

        // Verifikasi bahwa label telah berubah - cek apakah semua bulan sudah terpilih
        const updatedLabel = multiSelect.querySelector('.p-multiselect-label-container')?.textContent || '';
        console.log("Content script: Verification - Updated filter state:", updatedLabel);

        let finalSelectedCount = 0;
        allMonths.forEach(month => {
            if (updatedLabel.includes(month)) {
                finalSelectedCount++;
            }
        });

        if (finalSelectedCount === 12) {
            updateStatus("  -> SUKSES: Filter bulan berhasil diterapkan (semua 12 bulan terpilih).");
            console.log("Content script: Filter bulan berhasil dikonfirmasi");
            return true;
        } else {
            updateStatus(`  -> FILTER BULAN GAGAL: Hanya ${finalSelectedCount}/12 bulan terpilih! Proses dihentikan.`, 'error');
            console.error(`Content script: FILTER BULAN TIDAK BERHASIL - hanya ${finalSelectedCount}/12 bulan terpilih`);
            console.error("Content script: Automation akan dihentikan karena filter bulan tidak lengkap");
            // RETURN FALSE agar automation berhenti total, bukan melanjutkan tanpa filter
            return false;
        }
    } catch (error) {
        if (error instanceof SessionLogoutError || error instanceof AutomationAbortError) { throw error; }
        updateStatus(`  -> ERROR KRITIS di filterBulan(): ${error.message}`, 'error');
        console.error("Content script: CRITICAL ERROR in filterBulan():", error);
        console.error("Content script: Stack trace:", error.stack);
        // Return false untuk menghentikan automation ketika ada error kritis
        return false;
    }
}

// --- Reset Filter to Specific Months Function (for Download Feature) ---
// This reuses the robust logic from filterBulan() but selects specific months based on user selection
async function resetFilterToSelectedMonths(selectedMonths = []) {
    console.log(`Content script: [RESET FILTER SELECTED] Starting reset filter to ${selectedMonths.length} selected months:`, selectedMonths);

    const normalizedSelection = Array.isArray(selectedMonths)
        ? selectedMonths
            .map(month => normalizeMonthKey(month))
            .filter(Boolean)
        : [];
    const uniqueSelectionKeys = Array.from(new Set(normalizedSelection));

    if (uniqueSelectionKeys.length === 0) {
        updateStatus("  -> Tidak ada bulan valid pada daftar CSV. Menggunakan semua 12 bulan sebagai fallback.");
        return await resetFilterTo12Months();
    }

    if (uniqueSelectionKeys.length === 12) {
        console.log("Content script: [RESET FILTER SELECTED] Normalized selection mencakup 12 bulan, fallback ke resetFilterTo12Months()");
        return await resetFilterTo12Months();
    }

    const selectionLabels = uniqueSelectionKeys.map(key => getMonthEntry(key)?.label || key);
    updateStatus(`  -> Mengatur filter bulan ke ${selectionLabels.length} bulan: ${selectionLabels.join(', ')}`);

    try {
        // Wait for page elements to be ready
        await smartDelay('ui_update');

        // Find multiselect element using the same robust selectors as filterBulan
        const selectorAttempts = [
            { selector: 'p-multiselect#filterTaxInvoicePeriod', desc: 'p-multiselect#filterTaxInvoicePeriod (exact)' },
            { selector: 'p-multiselect[id*="filterTaxInvoicePeriod"]', desc: 'p-multiselect[id*="filterTaxInvoicePeriod"] (wildcard ID)' },
            { selector: '.p-multiselect[id*="filterTaxInvoicePeriod"]', desc: '.p-multiselect[class][id*="filterTaxInvoicePeriod"] (class + ID)' },
            { selector: 'p-multiselect[placeholder*="masa"]', desc: 'p-multiselect[placeholder*="masa"] (masa pajak)' },
            { selector: '[class*="multiselect"]', desc: '[class*="multiselect"] (all multiselects)' }
        ];

        let multiSelect = null;
        for (const attempt of selectorAttempts) {
            multiSelect = await waitForElementSmart(attempt.selector, 5000);
            if (multiSelect) {
                console.log(`Content script: [RESET FILTER SELECTED] Found multiselect with: ${attempt.desc}`);
                break;
            }
        }

        if (!multiSelect) {
            console.error("Content script: [RESET FILTER SELECTED] Multiselect filter not found");
            updateStatus("  ->  Filter masa pajak tidak ditemukan");
            return false;
        }

        // STEP 0: Klik tombol clear filter (ikon di samping multiselect) sebelum membuka panel
        const columnFilterContainer = multiSelect.closest('p-columnfilter, .p-column-filter, .p-column-filter-row') || multiSelect.parentElement;
        let outerClearButton = null;
        if (columnFilterContainer) {
            outerClearButton = columnFilterContainer.querySelector('button.p-column-filter-clear-button');
        }
        if (!outerClearButton) {
            outerClearButton = document.querySelector('#filterTaxInvoicePeriod ~ button.p-column-filter-clear-button') ||
                document.querySelector('button.p-column-filter-clear-button');
        }

        if (outerClearButton && outerClearButton.offsetWidth > 0 && !outerClearButton.disabled) {
            updateStatus("  -> Mengklik tombol clear filter (ikon filter-slash)...");
            try {
                outerClearButton.click();
                await smartDelay('filter');
                console.log("Content script: [RESET FILTER SELECTED] Outer clear filter button clicked");
            } catch (outerClearError) {
                if (outerClearError instanceof SessionLogoutError) { throw outerClearError; }
                console.warn("Content script: [RESET FILTER SELECTED] Failed to click outer clear filter button:", outerClearError);
            }
        } else {
            console.log("Content script: [RESET FILTER SELECTED] Outer clear filter button not found or not clickable");
        }

        // Click trigger to open dropdown
        updateStatus("  -> Membuka dropdown filter...");
        const trigger = multiSelect.querySelector('.p-multiselect-trigger');
        if (!trigger) {
            console.error("Content script: [RESET FILTER SELECTED] Trigger not found");
            updateStatus("  ->  Trigger dropdown tidak ditemukan");
            return false;
        }

        trigger.click();
        await smartDelay('ui_update');

        // Wait for panel with multiple fallback selectors (same as filterBulan)
        let panel = await waitForElementSmart('.p-multiselect-panel:not(.p-hidden)', 5000) ||
            await waitForElementSmart('.p-overlaypanel', 4000) ||
            await waitForElementSmart('p-overlay[aria-modal]', 3000);

        if (!panel) {
            console.error("Content script: [RESET FILTER SELECTED] Panel tidak muncul");
            updateStatus("  ->  Panel filter tidak muncul setelah klik");
            // Try to close
            try {
                trigger.click();
                await smartDelay('click');
            } catch (e) {
                if (e instanceof SessionLogoutError) { throw e; }
            }
            return false;
        }

        console.log("Content script: [RESET FILTER SELECTED] Panel opened successfully");
        updateStatus("  -> Panel dropdown berhasil dibuka");

        // STEP: Klik tombol clear filter (ikon pi-filter-slash) di dalam panel agar seleksi lama hilang
        const panelClearIcon = panel.querySelector('span.pi.pi-filter-slash');
        if (panelClearIcon) {
            const panelClearButton = panelClearIcon.closest('button') || panelClearIcon;
            if (panelClearButton && (panelClearButton.offsetWidth > 0 || panelClearButton.offsetHeight > 0)) {
                updateStatus("  -> Mengklik tombol clear filter di panel bulan...");
                try {
                    panelClearButton.click();
                    await smartDelay('click');
                    console.log("Content script: [RESET FILTER SELECTED] Panel clear filter button clicked");
                } catch (panelClearError) {
                    if (panelClearError instanceof SessionLogoutError) { throw panelClearError; }
                    console.warn("Content script: [RESET FILTER SELECTED] Panel clear button click failed:", panelClearError);
                }
            }
        }

        // First, clear all selections by clicking the "Select All" checkbox if it's checked
        const headerArea = panel.querySelector('.p-multiselect-header');
        if (headerArea) {
            const headerCheckbox = headerArea.querySelector('.p-checkbox-box');
            const headerCheckboxContainer = headerArea.querySelector('.p-checkbox');

            if (headerCheckbox && headerCheckboxContainer) {
                // Check if the header checkbox is already selected by looking for p-highlight class
                const isHeaderChecked = headerCheckbox.classList.contains('p-highlight') ||
                    headerCheckboxContainer.classList.contains('p-highlight') ||
                    headerCheckbox.classList.contains('p-checkbox-checked') ||
                    headerCheckboxContainer.classList.contains('p-checkbox-checked');

                if (isHeaderChecked) {
                    console.log("Content script: [RESET FILTER SELECTED] Clearing all selections first");
                    updateStatus("  -> Membersihkan seleksi yang ada...");

                    try {
                        headerCheckbox.click();
                    } catch (e) {
                        console.warn("Content script: [RESET FILTER SELECTED] Header checkbox click failed, trying container");
                        headerCheckboxContainer.click();
                    }

                    await smartDelay('ui_update');
                }
            }
        }

        // Get all month items from panel
        const monthItems = panel.querySelectorAll('.p-multiselect-item');
        if (monthItems.length === 0) {
            console.error("Content script: [RESET FILTER SELECTED] No month items found in panel");
            updateStatus("  ->  Daftar bulan tidak ditemukan dalam panel");
            trigger.click();
            await smartDelay('click');
            return false;
        }

        console.log(`Content script: [RESET FILTER SELECTED] Found ${monthItems.length} month items in panel`);

        let selectedCount = 0;
        const selectedKeySet = new Set(uniqueSelectionKeys);
        const matchedKeys = new Set();

        // Iterate through each month item and select if it matches our selected months
        for (const item of monthItems) {
            try {
                // Get month label from the item - try multiple selectors
                let label = item.querySelector('.p-multiselect-item-label') ||
                    item.querySelector('span.ng-star-inserted') ||
                    item.querySelector('span:not([class*="checkbox"]):not([class*="ink"])') ||
                    item;

                if (!label) {
                    console.warn("Content script: [RESET FILTER SELECTED] Month item has no label, skipping");
                    console.log("Content script: [RESET FILTER SELECTED] Item HTML structure:", item.innerHTML.substring(0, 150));
                    continue;
                }

                const monthText = label.textContent?.trim();
                if (!monthText) {
                    console.warn("Content script: [RESET FILTER SELECTED] Month label text is empty, skipping");
                    continue;
                }

                const itemKey = normalizeMonthKey(monthText);
                const shouldSelect = itemKey && selectedKeySet.has(itemKey);

                if (!shouldSelect) {
                    console.log(`Content script: [RESET FILTER SELECTED] Skipping month (tidak dibutuhkan): ${label.textContent.trim()}`);
                    continue;
                }

                // Find the checkbox in this item and click it
                const checkbox = item.querySelector('.p-checkbox-box');
                const checkboxContainer = item.querySelector('.p-checkbox');

                if (checkbox && checkboxContainer) {
                    // Check if the checkbox is already selected by looking for p-highlight class
                    const isCurrentlyChecked = checkbox.classList.contains('p-highlight') ||
                        checkboxContainer.classList.contains('p-highlight') ||
                        checkbox.classList.contains('p-checkbox-checked') ||
                        checkboxContainer.classList.contains('p-checkbox-checked');

                    if (!isCurrentlyChecked) {
                        console.log(`Content script: [RESET FILTER SELECTED] Selecting month: ${label.textContent.trim()}`);
                        console.log(`Content script: [RESET FILTER SELECTED] Checkbox classes before click: ${checkbox.className}`);

                        // Try multiple ways to click the checkbox
                        try {
                            // Method 1: Click the checkbox box directly
                            checkbox.click();
                        } catch (e) {
                            console.warn("Content script: [RESET FILTER SELECTED] Direct click failed, trying parent");
                            // Method 2: Click the container if direct click fails
                            checkboxContainer.click();
                        }

                        await smartDelay('click');
                    } else {
                        console.log(`Content script: [RESET FILTER SELECTED] Month already selected: ${label.textContent.trim()}`);
                    }

                    selectedCount++;
                    matchedKeys.add(itemKey);
                } else {
                    console.warn(`Content script: [RESET FILTER SELECTED] No checkbox found for month: ${label.textContent.trim()}`);
                    console.log(`Content script: [RESET FILTER SELECTED] Item structure:`, item.innerHTML.substring(0, 200));
                }
            } catch (itemError) {
                if (itemError instanceof SessionLogoutError) { throw itemError; }
                console.warn("Content script: [RESET FILTER SELECTED] Error processing month item:", itemError);
            }
        }

        console.log(`Content script: [RESET FILTER SELECTED] Selected ${matchedKeys.size} unique months out of ${selectedKeySet.size} requested`);

        if (selectedCount === 0) {
            console.error("Content script: [RESET FILTER SELECTED] No months were successfully selected");
            updateStatus(`  ->  Tidak ada bulan yang berhasil dipilih dari ${selectionLabels.length} bulan yang diminta`);
            trigger.click();
            await smartDelay('click');
            return false;
        }

        if (matchedKeys.size < selectedKeySet.size) {
            console.warn(`Content script: [RESET FILTER SELECTED] Only ${matchedKeys.size} of ${selectedKeySet.size} month keys were matched on UI`);
            updateStatus(`  ->  Warning: ${selectedKeySet.size - matchedKeys.size} bulan tidak ditemukan pada daftar filter.`);
        } else {
            updateStatus(`  ->  Berhasil memilih ${selectedCount} bulan`);
        }

        // Close panel
        updateStatus("  -> Menutup panel filter...");
        trigger.click();
        await smartDelay('ui_update');

        // Apply the filter - try multiple methods
        updateStatus("  -> Menerapkan filter...");
        await applyFilterAfterSelection(multiSelect);

        // Wait for data to refresh
        await smartDelay('navigation');

        console.log("Content script: [RESET FILTER SELECTED] Successfully applied month filter");
        updateStatus(`  ->  Filter berhasil diatur ke ${selectedCount} bulan`);
        return true;

    } catch (error) {
        if (error instanceof SessionLogoutError || error instanceof AutomationAbortError) { throw error; }
        console.error("Content script: [RESET FILTER SELECTED] Error:", error);
        updateStatus(`  ->  Error: ${error.message}`);
        return false;
    }
}

// --- Apply Year Filter Function (for Download Feature) ---
// This applies a text filter to the "Tahun" column to filter by specific year
async function applyYearFilter(year) {
    if (!year || year.trim() === '') {
        console.log("Content script: [YEAR FILTER] No year specified, skipping year filter");
        return true; // No year filter needed
    }

    console.log(`Content script: [YEAR FILTER] Applying year filter: ${year}`);
    updateStatus(`  -> Mengatur filter tahun ke ${year}...`);

    try {
        // Wait for page elements to be ready
        await smartDelay('ui_update');

        // Find the year column filter - it's a p-columnfilter with ID filterTaxInvoiceYear
        const yearFilterSelectors = [
            'p-columnfilter#filterTaxInvoiceYear',
            '#filterTaxInvoiceYear',
            'p-columnfilter[id*="filterTaxInvoiceYear"]',
            '[id*="filterTaxInvoiceYear"]'
        ];

        let yearFilterElement = null;
        for (const selector of yearFilterSelectors) {
            yearFilterElement = document.querySelector(selector);
            if (yearFilterElement) {
                console.log(`Content script: [YEAR FILTER] Found year filter with selector: ${selector}`);
                break;
            }
        }

        if (!yearFilterElement) {
            console.warn("Content script: [YEAR FILTER] Year filter element not found");
            updateStatus("  -> Warning: Filter tahun tidak ditemukan, melanjutkan tanpa filter tahun");
            return true; // Continue without year filter
        }

        // Find the input field within the column filter
        const inputField = yearFilterElement.querySelector('input[type="text"]') ||
            yearFilterElement.querySelector('input') ||
            yearFilterElement.querySelector('.p-inputtext');

        if (!inputField) {
            console.warn("Content script: [YEAR FILTER] Year filter input field not found");
            updateStatus("  -> Warning: Input filter tahun tidak ditemukan, melanjutkan tanpa filter tahun");
            return true; // Continue without year filter
        }

        // Clear existing filter value first
        inputField.value = '';
        inputField.dispatchEvent(new Event('input', { bubbles: true }));
        await smartDelay('click');

        // Set the year value
        inputField.value = year;
        inputField.dispatchEvent(new Event('input', { bubbles: true }));
        await smartDelay('click');

        // Trigger additional events to ensure the filter is applied
        inputField.dispatchEvent(new Event('change', { bubbles: true }));
        inputField.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));

        // Wait for the table to update
        await smartDelay('navigation');

        console.log(`Content script: [YEAR FILTER] Successfully applied year filter: ${year}`);
        updateStatus(`  -> Filter tahun berhasil diatur ke ${year}`);
        return true;

    } catch (error) {
        if (error instanceof SessionLogoutError || error instanceof AutomationAbortError) { throw error; }
        console.error("Content script: [YEAR FILTER] Error applying year filter:", error);
        updateStatus(`  -> Warning: Error filter tahun: ${error.message}, melanjutkan tanpa filter tahun`);
        return true; // Continue even if year filter fails
    }
}

// --- Reset Filter to 12 Months Function (for Download Feature) ---
// This reuses the robust logic from filterBulan() but ensures all 12 months are selected
async function resetFilterTo12Months() {
    console.log("Content script: [RESET FILTER 12M] Starting reset filter to 12 months");
    updateStatus("  -> Mengatur filter bulan ke 12 bulan (semua bulan)...");

    try {
        // Wait for page elements to be ready
        await smartDelay('ui_update');

        // Find multiselect element using the same robust selectors as filterBulan
        const selectorAttempts = [
            { selector: 'p-multiselect#filterTaxInvoicePeriod', desc: 'p-multiselect#filterTaxInvoicePeriod (exact)' },
            { selector: 'p-multiselect[id*="filterTaxInvoicePeriod"]', desc: 'p-multiselect[id*="filterTaxInvoicePeriod"] (wildcard ID)' },
            { selector: '.p-multiselect[id*="filterTaxInvoicePeriod"]', desc: '.p-multiselect[class][id*="filterTaxInvoicePeriod"] (class + ID)' },
            { selector: 'p-multiselect[placeholder*="masa"]', desc: 'p-multiselect[placeholder*="masa"] (masa pajak)' },
            { selector: '[class*="multiselect"]', desc: '[class*="multiselect"] (all multiselects)' }
        ];

        let multiSelect = null;
        for (const attempt of selectorAttempts) {
            multiSelect = await waitForElementSmart(attempt.selector, 5000);
            if (multiSelect) {
                console.log(`Content script: [RESET FILTER 12M] Found multiselect with: ${attempt.desc}`);
                break;
            }
        }

        if (!multiSelect) {
            console.error("Content script: [RESET FILTER 12M] Multiselect filter not found");
            updateStatus("  ->  Filter masa pajak tidak ditemukan");
            return false;
        }

        // STEP 1: Clear any existing filters before making new selections
        updateStatus("  -> Membersihkan filter yang ada...");
        const clearFilterSuccess = await clickClearFilterButton(multiSelect);
        if (clearFilterSuccess) {
            console.log("Content script: [RESET FILTER 12M] Successfully cleared existing filters");
            updateStatus("  ->  Filter berhasil dibersihkan");
            // Wait for the clear to take effect
            await smartDelay('ui_update');
        } else {
            console.log("Content script: [RESET FILTER 12M] No clear filter button found or already clear");
            updateStatus("  ->  Tidak ada filter yang perlu dibersihkan");
        }

        // Click trigger to open dropdown
        updateStatus("  -> Membuka dropdown filter...");
        const trigger = multiSelect.querySelector('.p-multiselect-trigger');
        if (!trigger) {
            console.error("Content script: [RESET FILTER 12M] Trigger not found");
            updateStatus("  ->  Trigger dropdown tidak ditemukan");
            return false;
        }

        trigger.click();
        await smartDelay('ui_update');

        // Wait for panel with multiple fallback selectors (same as filterBulan)
        let panel = await waitForElementSmart('.p-multiselect-panel:not(.p-hidden)', 5000) ||
            await waitForElementSmart('.p-overlaypanel', 4000) ||
            await waitForElementSmart('p-overlay[aria-modal]', 3000);

        if (!panel) {
            console.error("Content script: [RESET FILTER 12M] Panel tidak muncul");
            updateStatus("  ->  Panel filter tidak muncul setelah klik");
            // Try to close
            try {
                trigger.click();
                await smartDelay('click');
            } catch (e) {
                if (e instanceof SessionLogoutError) { throw e; }
            }
            return false;
        }

        console.log("Content script: [RESET FILTER 12M] Panel opened successfully");
        updateStatus("  -> Panel dropdown berhasil dibuka");

        // Find header area with checkbox
        const headerArea = panel.querySelector('.p-multiselect-header');
        if (!headerArea) {
            console.error("Content script: [RESET FILTER 12M] Header area not found");
            updateStatus("  ->  Header area tidak ditemukan");
            trigger.click();
            await smartDelay('click');
            return false;
        }

        // Get the checkbox from header
        const targetCheckbox = headerArea.querySelector('.p-checkbox-box');
        if (!targetCheckbox) {
            console.error("Content script: [RESET FILTER 12M] Checkbox not found in header");
            updateStatus("  ->  Checkbox tidak ditemukan");
            trigger.click();
            await smartDelay('click');
            return false;
        }

        // Click checkbox to select all months
        updateStatus("  -> Mengklik checkbox Select All...");
        console.log("Content script: [RESET FILTER 12M] Clicking select-all checkbox");
        targetCheckbox.click();
        await smartDelay('ui_update');

        updateStatus("  ->  Checkbox berhasil diklik - semua bulan terpilih");
        console.log("Content script: [RESET FILTER 12M] Checkbox clicked successfully");

        // Look for clear filter button (optional, for cleaning other filters)
        const clearButton = Array.from(document.querySelectorAll('button.p-column-filter-clear-button.p-link')).find(btn => {
            return btn.querySelector('span.pi.pi-filter-slash');
        });

        if (clearButton && !clearButton.disabled) {
            console.log("Content script: [RESET FILTER 12M] Found clear filter button, clicking");
            updateStatus("  -> Mengklik tombol clear filter...");
            clearButton.click();
            await smartDelay('click');
        }

        // Close panel
        updateStatus("  -> Menutup panel filter...");
        trigger.click();
        await smartDelay('ui_update');

        // Apply the filter - try multiple methods
        updateStatus("  -> Menerapkan filter...");
        await applyFilterAfterSelection(multiSelect);

        // Wait for data to refresh
        await smartDelay('navigation');

        console.log("Content script: [RESET FILTER 12M] Successfully reset to 12 months");
        updateStatus("  ->  Filter berhasil diatur ke 12 bulan");
        return true;

    } catch (error) {
        if (error instanceof SessionLogoutError || error instanceof AutomationAbortError) { throw error; }
        console.error("Content script: [RESET FILTER 12M] Error:", error);
        updateStatus(`  ->  Error: ${error.message}`);
        return false;
    }
}

// --- Clear Filter Button Function ---
// This function finds and clicks the clear filter button to reset all filters
// --- Clear Filter Button Function ---
// This function finds and clicks the clear filter button to reset all filters
// REFACTORED: Aggressive search for the specific button HTML provided by user
async function clickClearFilterButton(multiSelect) {
    console.log("Content script: [CLEAR FILTER] Looking for clear filter button (Aggressive Search)");
    const maxRetries = 3;
    const retryDelay = 1000;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            let clearButton = null;

            // STRATEGY 1: Exact Class Match (ct-ovw-btn-mini-cancel)
            // This class is very specific and present in the user's HTML
            clearButton = document.querySelector('button.ct-ovw-btn-mini-cancel');
            if (clearButton) {
                console.log("Content script: [CLEAR FILTER] Found by specific class: .ct-ovw-btn-mini-cancel");
            }

            // STRATEGY 2: Exact Tooltip Match
            if (!clearButton) {
                clearButton = document.querySelector('button[ptooltip="Setel Ulang Filter"]');
                if (clearButton) {
                    console.log("Content script: [CLEAR FILTER] Found by tooltip: Setel Ulang Filter");
                }
            }

            // STRATEGY 3: Icon Class in Button
            if (!clearButton) {
                clearButton = document.querySelector('button .pi-filter-slash')?.closest('button');
                if (clearButton) {
                    console.log("Content script: [CLEAR FILTER] Found by inner icon: .pi-filter-slash");
                }
            }

            // STRATEGY 4: Iterate all buttons (Brute force check)
            if (!clearButton) {
                const allButtons = document.querySelectorAll('button');
                for (const btn of allButtons) {
                    const html = btn.outerHTML;
                    if (html.includes('pi-filter-slash') || html.includes('Setel Ulang Filter')) {
                        clearButton = btn;
                        console.log("Content script: [CLEAR FILTER] Found by brute force HTML check");
                        break;
                    }
                }
            }

            if (clearButton && clearButton.offsetWidth > 0 && !clearButton.disabled) {
                console.log("Content script: [CLEAR FILTER] Clicking clear filter button...");
                updateStatus("  -> Mengklik tombol Clear Filter...");

                // Scroll the button into view if needed
                clearButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
                await smartDelay('scroll');

                // Click the clear button
                clearButton.click();
                await smartDelay('click');

                console.log("Content script: [CLEAR FILTER] Clear filter button clicked successfully");
                return true;
            } else {
                console.log(`Content script: [CLEAR FILTER] Button not found or not clickable (Attempt ${attempt + 1})`);
                if (attempt < maxRetries - 1) {
                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                }
            }

        } catch (error) {
            if (error instanceof SessionLogoutError || error instanceof AutomationAbortError) { throw error; }
            console.error("Content script: [CLEAR FILTER] Error clicking clear filter button:", error);
            updateStatus(`  ->  Warning: Tidak dapat membersihkan filter - ${error.message}`);
            return false;
        }
    }

    console.log("Content script: [CLEAR FILTER] Failed to find button after all retries");
    return false;
}



// --- Apply Filter After Selection Function ---
// This function tries multiple methods to apply the filter after making selections
async function applyFilterAfterSelection(multiSelect) {
    console.log("Content script: [APPLY FILTER] Attempting to apply filter after selection");

    try {
        // Method 1: Try to find and click an apply button (if it exists)
        const applyButtonSelectors = [
            'button.p-column-filter-apply-button',
            'button[aria-label*="Apply"]',
            'button[aria-label*="apply"]',
            'button[title*="Apply"]',
            'button[title*="apply"]',
            '.p-column-filter-apply',
            'button[class*="apply"]'
        ];

        for (const selector of applyButtonSelectors) {
            const applyButton = document.querySelector(selector);
            if (applyButton && !applyButton.disabled && applyButton.offsetWidth > 0) {
                console.log(`Content script: [APPLY FILTER] Found apply button with selector: ${selector}`);
                updateStatus("  -> Mengklik tombol Apply...");
                applyButton.click();
                await smartDelay('click');
                return true;
            }
        }

        // Method 2: Try pressing Enter key on the multiselect element
        console.log("Content script: [APPLY FILTER] No apply button found, trying Enter key");
        updateStatus("  -> Mencoba menerapkan filter dengan tombol Enter...");

        const inputElement = multiSelect.querySelector('input[type="text"]') ||
            multiSelect.querySelector('input') ||
            multiSelect;

        if (inputElement) {
            inputElement.focus();

            // Create and dispatch Enter key event
            const enterEvent = new KeyboardEvent('keydown', {
                key: 'Enter',
                keyCode: 13,
                which: 13,
                bubbles: true,
                cancelable: true
            });

            inputElement.dispatchEvent(enterEvent);
            await smartDelay('click');

            // Also try keyup event
            const enterEventUp = new KeyboardEvent('keyup', {
                key: 'Enter',
                keyCode: 13,
                which: 13,
                bubbles: true,
                cancelable: true
            });

            inputElement.dispatchEvent(enterEventUp);
            await smartDelay('click');

            console.log("Content script: [APPLY FILTER] Enter key events dispatched");
        }

        // Method 3: Try to trigger change event on the multiselect
        console.log("Content script: [APPLY FILTER] Trying to trigger change event");
        updateStatus("  -> Memicu event perubahan filter...");

        const changeEvent = new Event('change', { bubbles: true, cancelable: true });
        multiSelect.dispatchEvent(changeEvent);
        await smartDelay('click');

        // Method 4: Try to trigger input event
        const inputEvent = new Event('input', { bubbles: true, cancelable: true });
        multiSelect.dispatchEvent(inputEvent);
        await smartDelay('click');

        // Method 5: Try clicking outside to close any dropdowns and trigger filter application
        console.log("Content script: [APPLY FILTER] Trying to click outside to trigger filter");
        updateStatus("  -> Klik di luar area untuk memicu filter...");

        // Click on the body or a safe element outside the filter area
        document.body.click();
        await smartDelay('click');

        console.log("Content script: [APPLY FILTER] All filter application methods attempted");
        updateStatus("  ->  Filter application methods completed");

        return true;

    } catch (error) {
        if (error instanceof SessionLogoutError || error instanceof AutomationAbortError) { throw error; }
        console.error("Content script: [APPLY FILTER] Error applying filter:", error);
        updateStatus(`  ->  Warning: Tidak dapat memastikan filter diterapkan - ${error.message}`);
        return false;
    }
}

// --- Year Filter Function (Header) ---
// Fungsi untuk mengatur filter tahun di header tabel dengan mengetik di input text
// PERBAIKAN: Menargetkan kolom "Tahun" yang benar (kolom terakhir, bukan NPWP Penjual)
async function filterTahunPajakHeader(tahun) {
    console.log(`Content script: [FILTER TAHUN HEADER] Setting year filter to: ${tahun}`);
    updateStatus(`  -> Mengatur filter tahun ke ${tahun}...`);

    try {
        let yearInput = null;
        let foundSelector = null;

        // METODE 1: Cari berdasarkan header kolom yang mengandung teks "Tahun"
        console.log("Content script: [FILTER TAHUN HEADER] Method 1: Searching by column header text 'Tahun'...");

        // Cari semua header kolom (th) di tabel
        const allTh = document.querySelectorAll('th');
        console.log(`Content script: [FILTER TAHUN HEADER] Found ${allTh.length} th elements`);

        for (const th of allTh) {
            const headerText = th.innerText.trim().toLowerCase();

            // Cari kolom yang header-nya adalah "Tahun" (bukan "Tahun Pajak", "Tanggal", dll)
            // Kolom "Tahun" biasanya hanya berisi kata "Tahun" saja
            if (headerText === 'tahun' || headerText.match(/^tahun$/i)) {
                console.log(`Content script: [FILTER TAHUN HEADER] Found exact "Tahun" column header: "${headerText}"`);

                // Cari input di dalam th ini
                const inputInTh = th.querySelector('input.p-inputtext');
                if (inputInTh && inputInTh.offsetWidth > 0) {
                    yearInput = inputInTh;
                    foundSelector = 'th with exact "Tahun" header';
                    console.log(`Content script: [FILTER TAHUN HEADER] Found input in "Tahun" column`);
                    break;
                }
            }
        }

        // METODE 2: Jika tidak ditemukan, cari berdasarkan urutan kolom (Tahun adalah kolom terakhir)
        if (!yearInput) {
            console.log("Content script: [FILTER TAHUN HEADER] Method 2: Searching by column position (last column)...");

            // Ambil semua th yang memiliki input filter
            const thWithInputs = [];
            for (const th of allTh) {
                const input = th.querySelector('input.p-inputtext');
                if (input && input.offsetWidth > 0) {
                    thWithInputs.push({ th, input });
                }
            }

            console.log(`Content script: [FILTER TAHUN HEADER] Found ${thWithInputs.length} th elements with visible inputs`);

            // Tahun adalah kolom terakhir - ambil yang paling kanan
            if (thWithInputs.length > 0) {
                // Urutkan berdasarkan posisi X (offsetLeft) untuk mendapatkan yang paling kanan
                thWithInputs.sort((a, b) => {
                    const rectA = a.th.getBoundingClientRect();
                    const rectB = b.th.getBoundingClientRect();
                    return rectB.left - rectA.left; // Descending - yang paling kanan dulu
                });

                // Ambil yang paling kanan (kolom Tahun)
                const lastColumn = thWithInputs[0];
                yearInput = lastColumn.input;
                foundSelector = 'rightmost column input (Tahun)';
                console.log(`Content script: [FILTER TAHUN HEADER] Using rightmost column input as Tahun filter`);
            }
        }

        // METODE 3: Fallback - cari input yang sudah berisi format tahun (20XX)
        if (!yearInput) {
            console.log("Content script: [FILTER TAHUN HEADER] Method 3: Searching by year value pattern (20XX)...");
            const allInputs = document.querySelectorAll('th input.p-inputtext.p-component, p-columnfilter input.p-inputtext');

            for (const input of allInputs) {
                const currentValue = (input.value || '').trim();
                // Cek apakah value adalah format tahun (4 digit, dimulai dengan 20)
                if (/^20\d{2}$/.test(currentValue) && input.offsetWidth > 0) {
                    yearInput = input;
                    foundSelector = 'year value pattern match (20XX)';
                    console.log(`Content script: [FILTER TAHUN HEADER] Found by year value pattern: "${currentValue}"`);
                    break;
                }
            }
        }

        if (!yearInput) {
            updateStatus("  ->  WARNING: Input filter tahun tidak ditemukan di header.", 'warning');
            console.warn("Content script: [FILTER TAHUN HEADER] Year filter input not found");
            return false;
        }

        console.log(`Content script: [FILTER TAHUN HEADER] Found year input via "${foundSelector}":`, yearInput);
        console.log(`Content script: [FILTER TAHUN HEADER] Current value: "${yearInput.value}", Setting to: "${tahun}"`);

        // Focus dan clear input
        yearInput.focus();
        await smartDelay('ui_update');

        // Clear current value
        yearInput.value = '';
        yearInput.dispatchEvent(new Event('input', { bubbles: true }));
        await smartDelay('ui_update');

        // Set new value
        yearInput.value = tahun;

        // Trigger events untuk Angular/PrimeNG
        yearInput.dispatchEvent(new Event('input', { bubbles: true }));
        yearInput.dispatchEvent(new Event('change', { bubbles: true }));
        await smartDelay('ui_update');

        // Press Enter untuk apply filter
        const enterEvent = new KeyboardEvent('keydown', {
            key: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true
        });
        yearInput.dispatchEvent(enterEvent);
        await smartDelay('ui_update');

        // Blur untuk trigger perubahan
        yearInput.dispatchEvent(new Event('blur', { bubbles: true }));
        await smartDelay('ui_update');

        // Verify the value was set
        if (yearInput.value !== tahun) {
            console.warn(`Content script: [FILTER TAHUN HEADER] Value mismatch - expected "${tahun}", got "${yearInput.value}"`);

            // Try native setter
            try {
                const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                nativeInputValueSetter.call(yearInput, tahun);
                yearInput.dispatchEvent(new Event('input', { bubbles: true }));
                yearInput.dispatchEvent(new Event('change', { bubbles: true }));

                await smartDelay('ui_update');
            } catch (nativeError) {
                console.warn("Content script: Native setter failed:", nativeError);
            }
        }

        updateStatus(`  ->  Filter tahun berhasil diatur ke ${tahun}.`);
        console.log(`Content script: [FILTER TAHUN HEADER] Year filter set successfully to "${tahun}"`);

        // Tunggu sebentar agar filter diterapkan
        await new Promise(resolve => setTimeout(resolve, 1000));

        return true;

    } catch (error) {
        if (error instanceof SessionLogoutError || error instanceof AutomationAbortError) { throw error; }
        updateStatus(`  ->  GAGAL: Error saat mengatur filter tahun - ${error.message}`, 'error');
        console.error("Content script: [FILTER TAHUN HEADER] Error:", error);
        return false;
    }
}

// --- Invoice Filter Function ---

async function filterNomorFaktur(nomorFaktur) {
    console.log(`Content script:  [filterNomorFaktur] FUNCTION CALLED WITH faktur: ${nomorFaktur}`);
    updateStatus(`  -> Mencari dan filtering nomor faktur: ${nomorFaktur}...`);
    console.log(`Content script:  [filterNomorFaktur] Processing faktur: ${nomorFaktur}`);

    try {
        // Cari filter input dengan ID yang diberikan user
        const filterElement = await waitForElementSmart('#filterTaxInvoiceNumber', 5000); // Optimized timeout

        if (!filterElement) {
            updateStatus("  ->  GAGAL: Filter nomor faktur tidak ditemukan.", 'error');
            console.error("Content script: Invoice number filter element not found");
            return false;
        }

        console.log("Content script: Invoice number filter element found", filterElement);

        //  LANGKAH BARU: CARI DAN CLEAR FILTER NOMOR FAKTUR SEBELUM INPUT
        updateStatus("  ->  Pembersihan filter nomor faktur...");
        console.log("Content script:  CLEARING INVOICE NUMBER FILTER before input");

        const clearSelectors = [
            // 1. Based on HTML structure: button inside p-columnfilter#filterTaxInvoiceNumber
            '#filterTaxInvoiceNumber .p-column-filter-clear-button',
            '#filterTaxInvoiceNumber button.p-column-filter-clear-button.p-link',
            // 2. General clear button near filter input
            '.p-column-filter-clear-button:not(.p-hidden)',
            'button.p-column-filter-clear-button',
            // 3. Fallback by span icon
            'span.pi.pi-filter-slash'
        ];

        let clearButton = null;

        // Cari clear button dengan prioritas berdasarkan kontainer
        for (let selector of clearSelectors) {
            try {
                if (selector.includes('span.pi.pi-filter-slash')) {
                    // Jika mencari span, cari parent button
                    const iconSpan = filterElement.querySelector(selector);
                    if (iconSpan) {
                        clearButton = iconSpan.closest('button');
                        console.log("Content script: Found clear button via icon span");
                    }
                } else {
                    // Cari button langsung
                    clearButton = filterElement.querySelector(selector) ||
                        document.querySelector(selector);
                }

                if (clearButton && (clearButton.offsetWidth > 0 || clearButton.offsetHeight > 0)) {
                    console.log(`Content script:  Clear button found with selector: '${selector}'`);
                    updateStatus("  ->  Tombol clear filter faktur ditemukan, membersihkan filter...");
                    break;
                }
            } catch (e) {
                if (e instanceof SessionLogoutError) { throw e; }
                console.log(`Content script: Selector '${selector}' failed, trying next...`);
            }
        }

        // Klik clear button jika ditemukan
        if (clearButton) {
            try {
                console.log("Content script: Clicking invoice number clear filter button...");
                clearButton.click();

                // Tunggu clear filter selesai
                await smartDelay('filter');
                // (Remove duplicate status update)
                console.log("Content script: Invoice number filter cleared successfully");
            } catch (clearError) {
                if (clearError instanceof SessionLogoutError) { throw clearError; }
                console.warn("Content script: Failed to click clear button:", clearError);
                // (Keep only error message)
            }
        } else {
            console.log("Content script:  Clear button not found in this context");
            // (Remove duplicate status update)
        }

        // Cari input field di dalam p-columnfilter
        const inputField = filterElement.querySelector('input[type="text"], input.p-inputtext');
        if (!inputField) {
            updateStatus("  ->  GAGAL: Input field dalam filter tidak ditemukan.", 'error');
            console.error("Content script: Input field within filter not found");
            return false;
        }

        console.log("Content script: Input field found, setting value...");
        updateStatus(`  -> Mengisi nomor faktur ke filter...`);

        //  DEBUG: Log detail untuk konfirmasi struktur filter nomor faktur
        console.log(`Content script:  Filter element debug:`);
        console.log(`- Tag: ${filterElement.tagName}`);
        console.log(`- ID: ${filterElement.id}`);
        console.log(`- Class: ${filterElement.className}`);
        console.log(`- Children count: ${filterElement.children.length}`);
        console.log(`- Inner HTML: ${filterElement.innerHTML.substring(0, 200)}...`);

        //  AGGRESSIVE CLEAR: Bersihkan input field dengan multiple approach
        console.log(`Content script:  [AGGRESSIVE CLEAR] ORIGINAL value in input field: "${inputField.value}"`);
        console.log(`Content script:  [AGGRESSIVE CLEAR] Starting aggressive clear process for faktur: ${nomorFaktur}`);

        // Method 1: Direct value reset
        inputField.value = '';

        // Method 2: Simulate user interaction to clear
        const clearKeyEvent = new KeyboardEvent('keydown', {
            key: 'Backspace',
            keyCode: 8,
            which: 8,
            bubbles: true,
            cancelable: true,
            metaKey: true, // Cmd/Ctrl + Backspace untuk clear all
            ctrlKey: true
        });

        // Method 3: Try to clear with keyboard shortcuts
        for (let i = 0; i < inputField.value.length + 2; i++) {
            inputField.dispatchEvent(clearKeyEvent);
            inputField.dispatchEvent(new KeyboardEvent('keydown', {
                key: 'Delete',
                keyCode: 46,
                which: 46,
                bubbles: true
            }));
        }

        // Method 4: Force clear dengan selection
        inputField.setSelectionRange(0, inputField.value.length);
        inputField.focus();

        // Method 5: Final fallback - clear dan set ulang
        inputField.value = '';
        inputField.dispatchEvent(new Event('input', { bubbles: true }));
        inputField.dispatchEvent(new Event('change', { bubbles: true }));
        inputField.dispatchEvent(new Event('focus', { bubbles: true }));

        // Verifikasi bahwa field benar-benar bersih
        console.log(`Content script:  [AGGRESSIVE CLEAR] After clear attempt 1: "${inputField.value}"`);

        // Jika masih ada nilai, coba lagi
        if (inputField.value.trim() !== '') {
            console.log("Content script:  Clear not successful, trying again...");
            await smartDelay('input'); // Optimized wait

            inputField.value = '';
            inputField.dispatchEvent(new Event('input', { bubbles: true }));
            inputField.dispatchEvent(new Event('change', { bubbles: true }));
            inputField.dispatchEvent(new Event('blur', { bubbles: true }));
            await smartDelay('input');
            inputField.dispatchEvent(new Event('focus', { bubbles: true }));

            console.log(`Content script:  [AGGRESSIVE CLEAR] After clear attempt 2: "${inputField.value}"`);
        }

        //  Wait a bit before setting new value
        await smartDelay('input');

        // Input nomor faktur
        // FINAL VERIFICATION sebelum set nilai baru
        console.log(`Content script:  [FINAL CHECK] Input field state before setting new value: "${inputField.value}"`);
        if (inputField.value.trim() !== '') {
            console.error(`Content script:  [CRITICAL] Input field not cleared properly! Current: "${inputField.value}", Expected empty.`);
            updateStatus("  ->  Persiapan input field gagal, mencoba perbaikan...");
        }

        console.log(`Content script:  [filterNomorFaktur] SETTING input field value to: ${nomorFaktur}`);
        console.log(`Content script:  [filterNomorFaktur] Input field cleared state: "${inputField.value}"`);

        inputField.focus();
        inputField.value = nomorFaktur;

        // Simulate natural typing dengan optimized delay
        for (let i = 0; i < nomorFaktur.length; i++) {
            await new Promise(res => setTimeout(res, 20 + Math.random() * 30)); // 20-50ms random
            inputField.focus();
        }

        inputField.dispatchEvent(new Event('input', { bubbles: true }));
        inputField.dispatchEvent(new Event('change', { bubbles: true }));
        inputField.dispatchEvent(new Event('blur', { bubbles: true, cancelable: true }));
        await smartDelay('input');

        console.log(`Content script:  [filterNomorFaktur] Input field value set successfully to: "${inputField.value}"`);

        // Simulasi focus untuk memastikan field aktif
        inputField.focus();

        updateStatus(`  -> Menekan Enter untuk apply filter...`);
        console.log(`Content script: Filled input with: ${nomorFaktur}, now pressing Enter...`);

        // Simulasi press Enter
        const enterKeyEvent = new KeyboardEvent('keydown', {
            key: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true
        });
        inputField.dispatchEvent(enterKeyEvent);

        // Tunggu filter diterapkan (beri waktu untuk UI update)
        await smartDelay('filter');

        //  CRITICAL VERIFICATION: Pastikan filter menggunakan nilai yang BENAR
        let currentValue = inputField.value;
        console.log(`Content script:  [CRITICAL CHECK] Initial verification - Expected: ${nomorFaktur}, Got: ${currentValue}`);

        //  FORCE CORRECT VALUE jika tidak sesuai
        if (currentValue !== nomorFaktur) {
            console.warn(`Content script:  [FORCE CORRECTION] Expected: ${nomorFaktur}, Got: ${currentValue} - FORCING CORRECT VALUE!`);

            // Emergency override dengan nilai yang benar
            inputField.focus();
            inputField.value = nomorFaktur;

            // Force dispatch all events to ensure binding updates
            inputField.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
            inputField.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
            inputField.dispatchEvent(new Event('blur', { bubbles: true, cancelable: true }));

            // Wait untuk UI sync
            await smartDelay('ui_update');

            // Recheck
            currentValue = inputField.value;
            console.log(`Content script:  [FORCE CORRECTION RESULT] After override - Expected: ${nomorFaktur}, Got: ${currentValue}`);

            // Jika masih salah setelah force, THROW ERROR
            if (currentValue !== nomorFaktur) {
                console.error(`Content script:  [FATAL ERROR] FORCE CORRECTION FAILED! Cannot set correct value to filter.`);
                console.error(`Content script:  This indicates a fundamental browser/value binding issue.`);
                updateStatus(`  ->  ERROR KRITIS: Tidak bisa mengatur nomor faktur yang benar ke filter!`, 'error');
                return false;
            }
        }

        // FINAL VERIFICATION CAPITAL
        if (currentValue === nomorFaktur) {
            updateStatus(`  ->  Filter nomor faktur BERHASIL diterapkan dengan nilai BENAR: ${nomorFaktur}`);
            console.log(`Content script:  [SUCCESS CONFIRMED] Filter applied successfully - faktur ${nomorFaktur} verified and confirmed!`);

            // Tunggu hasil filter muncul di tabel
            await smartDelay('ui_update');

            return true;
        } else {
            console.error(`Content script:  [UNEXPECTED ERROR] Even after force correction, value is incorrect!`);
            updateStatus(`  ->  ERROR: Filter value tidak bisa dibuat benar. Expected: ${nomorFaktur}, Got: ${currentValue}`, 'error');
            return false;
        }

    } catch (error) {
        if (error instanceof SessionLogoutError || error instanceof AutomationAbortError) { throw error; }
        updateStatus(`  ->  ERROR: Gagal filter nomor faktur - ${error.message}`, 'error');
        console.error("Content script: Error in filterNomorFaktur:", error);
        return false;
    }
}

// --- Core Automation Functions ---

async function ubahMasaPajak(bulan) {
    updateStatus("  -> Mencari dropdown 'Masa Pajak Dikreditkan'...");

    //  ENHANCED VALIDATION: Validasi input bulan
    if (!bulan || typeof bulan !== 'string' || bulan.trim() === '') {
        updateStatus("  -> GAGAL: Parameter bulan tidak valid.", 'error');
        console.error("Content script: ubahMasaPajak - Invalid bulan parameter:", bulan);
        return false;
    }

    let dropdownContainer = null;
    const formItems = Array.from(document.querySelectorAll('einv-doc-form-item'));
    const dropdownItem = formItems.find(item => item.innerText.includes('Masa Pajak Dikreditkan'));

    if (dropdownItem) {
        dropdownContainer = dropdownItem.querySelector('p-dropdown');
    }

    if (!dropdownContainer) {
        updateStatus("  -> GAGAL: Dropdown 'Masa Pajak Dikreditkan' tidak ditemukan.", 'error');
        return false;
    }

    const expectedMonthKey = normalizeMonthKey(bulan);
    let lastSelectionSnapshot = null;

    const triggerButton = dropdownContainer.querySelector('.p-dropdown-trigger');
    if (!triggerButton) {
        updateStatus("  -> GAGAL: Tombol trigger dropdown tidak ditemukan.", 'error');
        return false;
    }

    //  ENHANCED VALIDATION: Validasi state element sebelum operasi
    if (!document.contains(triggerButton) || triggerButton.disabled) {
        updateStatus("  -> GAGAL: Tombol trigger tidak aktif atau tidak terhubung ke DOM.", 'error');
        console.error("Content script: Trigger button validation failed - disabled:", triggerButton.disabled, "connected:", document.contains(triggerButton));
        return false;
    }

    updateStatus("  -> Membuka panel dropdown...");

    //  DIAGNOSIS: Validasi state element sebelum klik
    console.log("Content script: [DIAGNOSIS DROPDOWN] Element validation before click:");
    console.log(`- triggerButton exists: ${!!triggerButton}`);
    console.log(`- triggerButton disabled: ${triggerButton.disabled}`);
    console.log(`- triggerButton visible: ${triggerButton.offsetWidth > 0 && triggerButton.offsetHeight > 0}`);
    console.log(`- triggerButton connected to DOM: ${document.contains(triggerButton)}`);
    console.log(`- dropdownContainer exists: ${!!dropdownContainer}`);
    console.log(`- dropdownContainer visible: ${dropdownContainer.offsetWidth > 0 && dropdownContainer.offsetHeight > 0}`);
    console.log(`- Current focus element: ${document.activeElement?.tagName || 'none'}`);
    console.log(`- Window focus: ${document.hasFocus()}`);

    //  DIAGNOSIS: Log existing panels sebelum klik
    const existingPanels = document.querySelectorAll('.p-dropdown-panel');
    console.log(`Content script: [DIAGNOSIS DROPDOWN] Existing panels before click: ${existingPanels.length}`);
    existingPanels.forEach((panel, index) => {
        console.log(`- Panel ${index}: visible=${!panel.classList.contains('p-hidden')}, display=${window.getComputedStyle(panel).display}`);
    });

    console.log("Content script: [DIAGNOSIS DROPDOWN] Attempting triggerButton.click()...");

    // Add extra delay (0-1 second) before opening dropdown for slow loading websites
    const extraWaitMs = Math.floor(Math.random() * 1000);
    console.log(`Content script: [DIAGNOSIS DROPDOWN] Waiting extra ${extraWaitMs}ms for slow loading websites...`);
    await new Promise(resolve => setTimeout(resolve, extraWaitMs));

    triggerButton.click();
    await turboPause(450);

    //  DIAGNOSIS: Log immediate state setelah klik
    console.log("Content script: [DIAGNOSIS DROPDOWN] Immediate state after click:");
    const panelsAfterClick = document.querySelectorAll('.p-dropdown-panel');
    console.log(`- Panels after click: ${panelsAfterClick.length}`);
    panelsAfterClick.forEach((panel, index) => {
        console.log(`- Panel ${index}: visible=${!panel.classList.contains('p-hidden')}, display=${window.getComputedStyle(panel).display}`);
    });

    await smartDelay('ui_update');

    //  DIAGNOSIS: Log state setelah delay
    console.log("Content script: [DIAGNOSIS DROPDOWN] State after delay:");
    const panelsAfterDelay = document.querySelectorAll('.p-dropdown-panel');
    console.log(`- Panels after delay: ${panelsAfterDelay.length}`);
    panelsAfterDelay.forEach((panel, index) => {
        console.log(`- Panel ${index}: visible=${!panel.classList.contains('p-hidden')}, display=${window.getComputedStyle(panel).display}`);
    });

    //  ENHANCED PANEL DETECTION: Improved retry mechanism with better validation
    console.log("Content script: [DIAGNOSIS DROPDOWN] Waiting for panel to appear...");
    
    // Custom robust wait for the most recently opened panel
    let panel = null;
    for(let w = 0; w < 30; w++) {
        assertNotStopped();
        const panels = Array.from(document.querySelectorAll('.p-dropdown-panel:not(.p-hidden)'));
        const visiblePanels = panels.filter(p => p.offsetWidth > 0 && window.getComputedStyle(p).display !== 'none');
        if (visiblePanels.length > 0) {
            panel = visiblePanels[visiblePanels.length - 1]; // The most recently appended panel is usually the active one
            break;
        }
        await new Promise(r => setTimeout(r, 100));
    }

    if (!panel) {
        console.log("Content script: [DIAGNOSIS DROPDOWN] Panel not found with primary selector, trying alternatives...");

        //  RETRY: Coba selector alternatif untuk panel
        const alternativeSelectors = [
            '.p-dropdown-panel:not(.p-hidden)',
            '.p-dropdown-panel.p-component',
            '.p-dropdown-panel',
            '.p-overlaypanel:not(.p-hidden)',
            '.p-overlay-mask .p-dropdown-panel'
        ];

        for (const selector of alternativeSelectors) {
            panel = await waitForElement(selector, 1000);
            if (panel) {
                console.log(`Content script: [DIAGNOSIS DROPDOWN] Found panel with selector: ${selector}`);
                break;
            }
        }

        if (!panel) {
            console.log("Content script: [DIAGNOSIS DROPDOWN] RETRY - Clicking trigger button again...");
            updateStatus("  ->  Panel tidak muncul, mencoba klik ulang...");

            //  RETRY: Klik trigger button lagi dengan delay lebih lama
            triggerButton.focus();
            await smartDelay('click');
            triggerButton.click();
            await smartDelay('ui_update');
            await smartDelay('ui_update'); // Double delay untuk website yang lambat
            await turboPause(400);

            // Coba lagi mencari panel
            panel = await waitForElement('.p-dropdown-panel.p-component:not(.p-hidden)', 5000);

            if (!panel) {
                // Last resort: cek semua panel yang ada
                const allPanels = document.querySelectorAll('.p-dropdown-panel');
                console.log(`Content script: [DIAGNOSIS DROPDOWN] Last resort - Found ${allPanels.length} total panels`);

                for (const p of allPanels) {
                    const isVisible = !p.classList.contains('p-hidden') &&
                        p.offsetWidth > 0 &&
                        p.offsetHeight > 0 &&
                        window.getComputedStyle(p).display !== 'none';
                    console.log(`Content script: [DIAGNOSIS DROPDOWN] Panel visible check: ${isVisible}`);
                    if (isVisible) {
                        panel = p;
                        console.log("Content script: [DIAGNOSIS DROPDOWN] Found visible panel manually");
                        break;
                    }
                }
            }
        }
    }

    if (!panel) {
        updateStatus("  ->  GAGAL: Panel dropdown tidak muncul setelah semua percobaan.", 'error');
        console.error("Content script: [DIAGNOSIS DROPDOWN] FAILED - Panel tidak dapat dibuka setelah retry");

        //  DIAGNOSIS: Log final state untuk debugging
        console.error("Content script: [DIAGNOSIS DROPDOWN] Final diagnostic info:");
        console.error(`- triggerButton disabled: ${triggerButton.disabled}`);
        console.error(`- triggerButton connected: ${document.contains(triggerButton)}`);
        console.error(`- All panels count: ${document.querySelectorAll('.p-dropdown-panel').length}`);
        console.error(`- Document focus: ${document.hasFocus()}`);

        return false;
    }

    console.log("Content script: [DIAGNOSIS DROPDOWN] SUCCESS - Panel found and opened");
    await turboPause(350);

    //  ENHANCED OPTION SEARCH: Improved option finding with better validation
    const options = Array.from(panel.querySelectorAll('li.p-dropdown-item'));
    const normalize = (s) => (s || '').toString().trim().toLowerCase();
    const bulanNorm = normalize(bulan);

    console.log(`Content script: [OPTION SEARCH] Looking for bulan "${bulan}" (normalized: "${bulanNorm}") in ${options.length} options`);

    let targetOption = options.find(opt => {
        const span = opt.querySelector('span');
        if (!span) return false;
        const text = normalize(span.innerText);
        const containsMatch = text.includes(bulanNorm);
        console.log(`Content script: [OPTION SEARCH] Option text: "${text}" - contains "${bulanNorm}": ${containsMatch}`);
        return containsMatch;
    });

    if (!targetOption) {
        updateStatus(`  -> GAGAL: Opsi bulan yang memuat "${bulan}" tidak ditemukan.`, 'error');
        console.error(`Content script: [OPTION SEARCH] No option found containing "${bulan}"`);
        console.error(`Content script: [OPTION SEARCH] Available options:`, options.map(opt => opt.querySelector('span')?.innerText?.trim()));
        // Tutup dropdown
        triggerButton.click();
        return false;
    }

    updateStatus(`  -> Memilih bulan "${bulan}"...`);
    targetOption.click();
    await turboPause(350);
    await smartDelay('ui_update');

    //  ENHANCED VERIFICATION: Improved verification with multiple attempts and better error handling
    let attempt = 0;
    const maxAttempts = 5; // Increased from 3 to 5 for better reliability

    while (attempt < maxAttempts) {
        await smartDelay('ui_update');
        await turboPause(250);

        const currentSnapshot = getDropdownSelectionSnapshot(dropdownContainer, {
            expectedMonth: bulan,
            fallbackAction: automationData?.aksiFinal
        });
        lastSelectionSnapshot = currentSnapshot;

        const selectedLabel = currentSnapshot.primaryText || currentSnapshot.details.rawText || '';
        const selectedKey = currentSnapshot.details.monthKey;
        const matchesExpected = expectedMonthKey
            ? selectedKey === expectedMonthKey
            : normalize(selectedLabel).includes(bulanNorm);

        console.log(`Content script: [VERIFY BULAN] Attempt ${attempt + 1}/${maxAttempts} - Label="${selectedLabel}", monthKey=${selectedKey}, matchesExpected=${matchesExpected}`);

        if (matchesExpected) {
            await smartDelay('verify');
            await turboPause(250);

            const confirmSnapshot = getDropdownSelectionSnapshot(dropdownContainer, {
                expectedMonth: bulan,
                fallbackAction: automationData?.aksiFinal
            });
            lastSelectionSnapshot = confirmSnapshot;

            const confirmLabel = confirmSnapshot.primaryText || confirmSnapshot.details.rawText || '';
            const confirmKey = confirmSnapshot.details.monthKey;
            const confirmMatches = expectedMonthKey
                ? confirmKey === expectedMonthKey
                : normalize(confirmLabel).includes(bulanNorm);

            console.log(`Content script: [VERIFY BULAN] Double-check attempt ${attempt + 1} - Label="${confirmLabel}", monthKey=${confirmKey}, matchesExpected=${confirmMatches}`);

            if (confirmMatches) {
                updateStatus(`  -> Verifikasi berhasil: "${confirmLabel}" sesuai dengan bulan "${bulan}".`);
                return {
                    success: true,
                    snapshot: confirmSnapshot,
                    initialSnapshot: currentSnapshot,
                    attempts: attempt + 1,
                    expectedKey: expectedMonthKey
                };
            }

            console.warn(`Content script: [VERIFY BULAN] Double-check mismatch detected. expectedKey=${expectedMonthKey}, got=${confirmKey}`);
        } else {
            console.warn(`Content script: [VERIFY BULAN] Mismatch detected. expectedKey=${expectedMonthKey}, detected=${selectedKey}. Reopening dropdown...`);
        }

        if (!document.contains(triggerButton) || triggerButton.disabled) {
            updateStatus("  -> GAGAL: Tombol trigger tidak valid saat retry.", 'error');
            console.error("Content script: [VERIFY BULAN] Trigger button became invalid during retry");
            return {
                success: false,
                reason: 'trigger-invalid',
                snapshot: lastSelectionSnapshot,
                attempts: attempt + 1,
                expectedKey: expectedMonthKey
            };
        }

        triggerButton.click();
        await smartDelay('ui_update');

        panel = await waitForElement('.p-dropdown-panel.p-component:not(.p-hidden)', 2000) ||
            await waitForElement('.p-dropdown-panel:not(.p-hidden)', 2000);

        if (!panel) {
            console.warn("Content script: [VERIFY BULAN] Panel tidak muncul saat retry, mencoba klik trigger lagi...");
            await smartDelay('click');
            triggerButton.click();
            await smartDelay('ui_update');
            panel = await waitForElement('.p-dropdown-panel.p-component:not(.p-hidden)', 2000) ||
                await waitForElement('.p-dropdown-panel:not(.p-hidden)', 2000);
        }

        if (!panel) {
            updateStatus('  -> Panel dropdown tidak dapat dibuka untuk retry verifikasi.', 'warning');
        } else {
            const retryOptions = Array.from(panel.querySelectorAll('li.p-dropdown-item'));
            const retryTarget = retryOptions.find(opt => {
                const span = opt.querySelector('span');
                return span && normalize(span.innerText).includes(bulanNorm);
            });

            if (retryTarget) {
                updateStatus(`  -> Mencoba memilih ulang bulan "${bulan}" (percobaan ${attempt + 2}/${maxAttempts})...`);
                retryTarget.click();
                await smartDelay('ui_update');
            } else {
                console.warn(`Content script: [VERIFY BULAN] Opsi yang memuat "${bulan}" tetap tidak ditemukan saat retry`);
            }
        }

        attempt++;
    }

    const failureSnapshot = getDropdownSelectionSnapshot(dropdownContainer, {
        expectedMonth: bulan,
        fallbackAction: automationData?.aksiFinal
    });
    lastSelectionSnapshot = failureSnapshot;
    const failureLabel = failureSnapshot.primaryText || failureSnapshot.details.rawText || '';
    const failureKey = failureSnapshot.details.monthKey;
    updateStatus(`  -> GAGAL: Label terpilih "${failureLabel}" tidak sesuai dengan bulan "${bulan}" setelah ${maxAttempts} percobaan.`, 'error');
    console.error(`Content script: [VERIFY BULAN] Final verification failed - Expected key=${expectedMonthKey}, got=${failureKey}, label="${failureLabel}"`);
    return {
        success: false,
        reason: 'verification-failed',
        snapshot: failureSnapshot,
        attempts: maxAttempts,
        expectedKey: expectedMonthKey
    };
}

async function klikTombolFinal(teksTombol) {
    const ariaLabels = {
        'Kreditkan': 'Credit',
        'Tidak Dikreditkan': 'Uncredit',
        'Tandai sebagai Tidak Valid': 'Mark as invalid',
        'Kembali ke status Approved': 'Back To Approved'
    };
    const ariaLabel = ariaLabels[teksTombol];

    if (!ariaLabel) {
        updateStatus(`  -> GAGAL: Aksi final "${teksTombol}" tidak dikenal.`, 'error');
        return false;
    }

    const targetAksi = teksTombol.trim().toLowerCase();

    // Attempt to find by aria-label first, then by exact text match
    let button = await waitForElement(`button[aria-label="${ariaLabel}"]`, 2000);
    if (!button) {
        // Fallback: search all buttons for the exact text (e.g. "Kreditkan") or ariaLabel
        const buttons = document.querySelectorAll('button');
        button = Array.from(buttons).find(btn => {
            const btnText = btn.textContent ? btn.textContent.trim().toLowerCase() : '';
            const btnAria = btn.getAttribute('aria-label') ? btn.getAttribute('aria-label').toLowerCase() : '';
            const btnTitle = btn.getAttribute('title') ? btn.getAttribute('title').toLowerCase() : '';
            
            // Allow partial matching
            let textMatch = btnText === targetAksi;
            if (targetAksi === 'kreditkan') {
                textMatch = textMatch || btnText.includes('kreditkan') || btnText === 'credit';
            } else if (targetAksi === 'tidak dikreditkan') {
                textMatch = textMatch || btnText.includes('tidak dikreditkan') || btnText === 'uncredit';
            }
            
            const ariaMatch = btnAria.includes(ariaLabel.toLowerCase());
            const titleMatch = btnTitle.includes(targetAksi);
            return textMatch || ariaMatch || titleMatch;
        });
    }

    if (!button || button.disabled) {
        updateStatus(`  -> GAGAL: Tombol "${teksTombol}" tidak ditemukan atau tidak aktif.`, 'error');
        return false;
    }

    updateStatus(`  -> Mensimulasikan klik pada tombol "${teksTombol}"...`);
    await turboPause(300);
    button.click();
    await smartDelay('ui_update');
    await turboPause(350);
    return true;
}

async function kembaliKeHalamanUtama() {
    const maxRetries = 3;
    let retryCount = 0;

    while (retryCount < maxRetries) {
        try {
            console.log(`Content script: Attempting to navigate back to main page (Attempt ${retryCount + 1}/${maxRetries})`);
            updateStatus(`  -> Kembali ke halaman Pajak Masukan... (Percobaan ${retryCount + 1})`);

            // Coba beberapa selector untuk link navigasi
            let link = null;

            // Selector 1: Text content
            link = Array.from(document.querySelectorAll('a.nav-link')).find(a =>
                a.innerText.trim() === 'Pajak Masukan' ||
                a.innerText.trim() === 'PAJAK MASUKAN' ||
                a.title?.includes('Pajak masukan') ||
                a.title?.includes('Masukan')
            );

            // Selector 2: Jika tidak ketemu, coba selector luas
            if (!link) {
                link = Array.from(document.querySelectorAll('a')).find(a =>
                    a.innerText?.toLowerCase().includes('pajak masukan') ||
                    a.title?.toLowerCase().includes('pajak masukan')
                );
                console.log("Content script: Using fallback selector for navigation link");
            }

            // Selector 3: Coba dengan href pattern
            if (!link) {
                link = Array.from(document.querySelectorAll('a[href*="/input/masukan"], a[href*="/masukan"]')).pop();
                console.log("Content script: Using href pattern for navigation link");
            }

            if (!link) {
                console.error(`Content script: Navigation link not found (Attempt ${retryCount + 1})`);
                if (retryCount < maxRetries - 1) {
                    console.log("Content script: Retrying navigation link search...");
                    retryCount++;
                    await smartDelay('retry');
                    continue;
                }
                updateStatus("  ->  GAGAL: Tombol navigasi tidak ditemukan setelah semua percobaan.", 'error');
                return false;
            }

            console.log("Content script: Navigation link found:", link);

            // Pastikan link memiliki href dan bukan just hash
            if (!link.href || link.href === '#' || link.href.endsWith('#')) {
                console.warn("Content script: Navigation link has invalid href:", link.href);
            }

            // Klik link dengan error handling
            console.log("Content script: Clicking navigation link...");
            link.click();

            // Tunggu navigasi selesai dengan deteksi URL change
            const initialUrl = window.location.href;
            let navigationComplete = false;

            // Polling untuk deteksi URL change - optimized
            for (let i = 0; i < 15; i++) { // Optimized to 15 iterations
                await smartDelay('navigation');

                if (window.location.href !== initialUrl) {
                    console.log("Content script: URL changed - navigation started");
                    navigationComplete = true;
                    break;
                }

                // Alternatif: Cek page title
                if (document.title.toLowerCase().includes('pajak masukan') ||
                    document.title.toLowerCase().includes('masukan')) {
                    console.log("Content script: Page title indicates navigation complete");
                    navigationComplete = true;
                    break;
                }
            }

            if (!navigationComplete) {
                console.warn(`Content script: Navigation may have failed (URL unchanged: ${initialUrl})`);
            }

            // Tunggu minimal loading time
            await smartDelay('navigation');

            //  ENHANCED DIAGNOSIS: WAIT UNTIL PAGE IS FULLY LOADED WITH DETAILED VALIDATION
            console.log("Content script: [DIAGNOSIS] Starting comprehensive page validation...");

            //  DIAGNOSIS: Log current state immediately after navigation
            console.log("Content script: [DIAGNOSIS] Post-navigation state check:");
            console.log(`- Current URL: ${window.location.href}`);
            console.log(`- Current title: ${document.title}`);
            console.log(`- Document readyState: ${document.readyState}`);
            console.log(`- Total elements: ${document.querySelectorAll('*').length}`);

            //  DIAGNOSIS: Check for common elements that exist on any page (generic detection issue)
            const genericElements = {
                tables: document.querySelectorAll('.p-datatable-tbody, .p-table tbody, table tbody').length,
                datatables: document.querySelectorAll('.p-datatable').length,
                buttons: document.querySelectorAll('button').length,
                inputs: document.querySelectorAll('input').length,
                forms: document.querySelectorAll('form').length
            };
            console.log("Content script: [DIAGNOSIS] Generic elements found:", genericElements);

            //  DIAGNOSIS: Check for SPECIFIC Pajak Masukan indicators
            const pajakMasukanSpecificElements = {
                filterTaxInvoicePeriod: document.querySelectorAll('[id*="filterTaxInvoicePeriod"]').length,
                filterTaxInvoiceNumber: document.querySelectorAll('#filterTaxInvoiceNumber').length,
                pajakMasukanText: document.body.innerText.toLowerCase().includes('pajak masukan'),
                pajakMasukanTitle: document.title.toLowerCase().includes('pajak masukan') || document.title.toLowerCase().includes('masukan'),
                refreshButtons: document.querySelectorAll('.pi.pi-refresh, [class*="pi-refresh"]').length,
                navLinksPajakMasukan: Array.from(document.querySelectorAll('a.nav-link')).filter(a =>
                    a.innerText?.toLowerCase().includes('pajak masukan')).length
            };
            console.log("Content script: [DIAGNOSIS] Pajak Masukan specific elements:", pajakMasukanSpecificElements);

            //  DIAGNOSIS: URL validation - check if we're actually on the right page
            const urlValidation = {
                containsMasukan: window.location.href.toLowerCase().includes('masukan'),
                containsInput: window.location.href.toLowerCase().includes('input'),
                containsPajak: window.location.href.toLowerCase().includes('pajak'),
                isCorrectPath: window.location.pathname.toLowerCase().includes('masukan') ||
                    window.location.pathname.toLowerCase().includes('input')
            };
            console.log("Content script: [DIAGNOSIS] URL validation:", urlValidation);

            //  ENHANCED VALIDATION: Wait for SPECIFIC Pajak Masukan elements (not generic ones)
            let pajakMasukanPageFound = false;
            const specificSelectors = [
                '[id*="filterTaxInvoicePeriod"]', // Filter bulan - VERY SPECIFIC to Pajak Masukan
                '#filterTaxInvoiceNumber',        // Filter nomor faktur - VERY SPECIFIC
                '.pi.pi-refresh'                  // Refresh button - specific enough
            ];

            console.log("Content script: [DIAGNOSIS] Searching for SPECIFIC Pajak Masukan elements...");
            for (let selector of specificSelectors) {
                try {
                    const element = await waitForElementSmart(selector, 3000);
                    if (element && element.offsetWidth > 0) {
                        console.log(`Content script: [DIAGNOSIS]  SPECIFIC element found: '${selector}'`);
                        console.log(`Content script: [DIAGNOSIS] Element details: tag=${element.tagName}, id=${element.id}, visible=${element.offsetWidth > 0}`);
                        pajakMasukanPageFound = true;
                        break;
                    } else {
                        console.log(`Content script: [DIAGNOSIS]  SPECIFIC element '${selector}' not found or not visible`);
                    }
                } catch (e) {
                    if (e instanceof SessionLogoutError) { throw e; }
                    console.log(`Content script: [DIAGNOSIS]  Error searching for '${selector}':`, e.message);
                }
            }

            //  DIAGNOSIS: Content validation - check if page content is actually loaded
            let contentValidation = false;
            if (pajakMasukanPageFound) {
                console.log("Content script: [DIAGNOSIS] Performing content validation...");

                // Wait additional time for content to fully load
                await smartDelay('navigation');
                await smartDelay('navigation'); // Double wait for slow pages

                // Check if table content is actually loaded (not just DOM structure)
                const tableRows = document.querySelectorAll('.p-datatable-tbody tr');
                const hasRealContent = tableRows.length > 0 &&
                    Array.from(tableRows).some(row => row.innerText.trim().length > 10);

                console.log(`Content script: [DIAGNOSIS] Content validation: tableRows=${tableRows.length}, hasRealContent=${hasRealContent}`);

                // Check if loading indicators are gone
                const loadingIndicators = document.querySelectorAll('.p-progress-spinner, .loading, .spinner, [class*="loading"], [class*="spinner"]');
                const stillLoading = Array.from(loadingIndicators).some(indicator => indicator.offsetWidth > 0);

                console.log(`Content script: [DIAGNOSIS] Loading check: indicators=${loadingIndicators.length}, stillLoading=${stillLoading}`);

                contentValidation = hasRealContent && !stillLoading;
                console.log(`Content script: [DIAGNOSIS] Final content validation: ${contentValidation}`);
            }

            //  FINAL VALIDATION: Combine all checks
            const finalValidation = {
                pajakMasukanPageFound,
                contentValidation,
                urlIsCorrect: urlValidation.containsMasukan || urlValidation.containsInput || urlValidation.isCorrectPath,
                hasSpecificElements: pajakMasukanSpecificElements.filterTaxInvoicePeriod > 0 ||
                    pajakMasukanSpecificElements.filterTaxInvoiceNumber > 0
            };

            console.log("Content script: [DIAGNOSIS] Final validation summary:", finalValidation);

            const isReallyOnPajakMasukanPage = finalValidation.pajakMasukanPageFound &&
                finalValidation.contentValidation &&
                finalValidation.hasSpecificElements;

            if (isReallyOnPajakMasukanPage) {
                console.log("Content script: [DIAGNOSIS]  CONFIRMED: Really on Pajak Masukan page with loaded content");

                //  FINAL SAFETY CHECK: Wait additional time to ensure everything is stable
                console.log("Content script: [DIAGNOSIS] Performing final stability check...");
                await smartDelay('navigation');

                //  FINAL VALIDATION: Re-check critical elements after stability wait
                const finalStabilityCheck = {
                    filterStillExists: !!document.querySelector('[id*="filterTaxInvoicePeriod"]'),
                    tableStillExists: !!document.querySelector('.p-datatable-tbody'),
                    refreshStillExists: !!document.querySelector('.pi.pi-refresh, [class*="pi-refresh"]')
                };

                console.log("Content script: [DIAGNOSIS] Final stability check:", finalStabilityCheck);

                if (finalStabilityCheck.filterStillExists || finalStabilityCheck.refreshStillExists) {
                    console.log("Content script: [DIAGNOSIS]  FINAL SUCCESS: Page is stable and ready");
                    updateStatus("  ->  Berhasil kembali ke halaman Pajak Masukan");
                    return true;
                } else {
                    console.warn("Content script: [DIAGNOSIS]  Page became unstable after validation - elements disappeared");
                    if (retryCount < maxRetries - 1) {
                        console.log("Content script: [DIAGNOSIS] Retrying due to page instability...");
                        retryCount++;
                        await smartDelay('retry');
                        continue;
                    } else {
                        updateStatus("  ->  GAGAL: Halaman menjadi tidak stabil setelah validasi.", 'error');
                        return false;
                    }
                }
            } else {
                console.warn(`Content script: [DIAGNOSIS]  FAILED VALIDATION (Attempt ${retryCount + 1}):`);
                console.warn(`- Pajak Masukan page found: ${finalValidation.pajakMasukanPageFound}`);
                console.warn(`- Content validation: ${finalValidation.contentValidation}`);
                console.warn(`- URL correct: ${finalValidation.urlIsCorrect}`);
                console.warn(`- Has specific elements: ${finalValidation.hasSpecificElements}`);

                //  ENHANCED RETRY LOGIC: Try to identify specific failure reason
                if (!finalValidation.pajakMasukanPageFound) {
                    console.warn("Content script: [DIAGNOSIS] Primary issue: Pajak Masukan specific elements not found");
                } else if (!finalValidation.contentValidation) {
                    console.warn("Content script: [DIAGNOSIS] Primary issue: Content not fully loaded or still loading");
                } else if (!finalValidation.hasSpecificElements) {
                    console.warn("Content script: [DIAGNOSIS] Primary issue: Missing critical filter elements");
                }

                if (retryCount < maxRetries - 1) {
                    console.log("Content script: [DIAGNOSIS] Retrying navigation with enhanced validation...");
                    retryCount++;

                    //  LONGER WAIT: Give more time for problematic pages
                    await smartDelay('retry');
                    await smartDelay('navigation'); // Extra wait for slow loading
                    continue;
                } else {
                    updateStatus("  ->  GAGAL: Validasi halaman Pajak Masukan gagal setelah semua percobaan dengan diagnosis lengkap.", 'error');
                    console.error("Content script: [DIAGNOSIS] FINAL FAILURE - All validation attempts failed");
                    console.error("Content script: [DIAGNOSIS] Possible solutions: 1) Check network connectivity, 2) Verify navigation target, 3) Check page loading performance");
                    return false;
                }
            }

        } catch (error) {
            if (error instanceof SessionLogoutError || error instanceof AutomationAbortError) { throw error; }
            console.error(`Content script: Error during navigation attempt ${retryCount + 1}:`, error);
            if (retryCount < maxRetries - 1) {
                console.log("Content script: Retrying navigation after error...");
                retryCount++;
                await smartDelay('retry');
            } else {
                updateStatus(`  ->  ERROR: Navigasi gagal dengan error - ${error.message}`, 'error');
                return false;
            }
        }
    }

    // Jika sampai sini berarti semua retry gagal
    updateStatus("  ->  GAGAL TOTAL: Tidak dapat kembali ke halaman Pajak Masukan setelah semua percobaan.", 'error');
    console.error("Content script: All navigation attempts failed");
    return false;
}


// Y" ENHANCED VALIDATION: Helper function untuk validasi perubahan masa pajak
async function validateMasaPajakChange(bulan, options = {}) {
    const { maxRetries = 3, expectedAction = null } = options;
    const expectedKey = normalizeMonthKey(bulan);
    console.log(`Content script: [VALIDATE MASA PAJAK] Validating change to "${bulan}" (expectedKey=${expectedKey})`);

    let lastAttemptInfo = null;

    for (let retry = 0; retry < maxRetries; retry++) {
        await smartDelay('ui_update');
        const attemptNumber = retry + 1;

        const formItems = Array.from(document.querySelectorAll('einv-doc-form-item'));
        const dropdownItem = formItems.find(item => item.innerText.includes('Masa Pajak Dikreditkan'));

        if (!dropdownItem) {
            console.warn(`Content script: [VALIDATE MASA PAJAK] Dropdown not found on attempt ${attemptNumber}`);
            lastAttemptInfo = { attempt: attemptNumber, error: 'dropdown-not-found' };
            continue;
        }

        const dropdownContainer = dropdownItem.querySelector('p-dropdown');
        if (!dropdownContainer) {
            console.warn(`Content script: [VALIDATE MASA PAJAK] Dropdown container not found on attempt ${attemptNumber}`);
            lastAttemptInfo = { attempt: attemptNumber, error: 'dropdown-container-not-found' };
            continue;
        }

        const snapshot = getDropdownSelectionSnapshot(dropdownContainer, {
            expectedMonth: bulan,
            fallbackAction: expectedAction
        });

        const detectedKey = snapshot.details.monthKey;
        const detectedLabel = snapshot.primaryText || snapshot.details.rawText || '';
        const detectedCredit = snapshot.details.creditStatus;

        console.log(`Content script: [VALIDATE MASA PAJAK] Attempt ${attemptNumber}/${maxRetries} - Label="${detectedLabel}", monthKey=${detectedKey}, credit=${detectedCredit || 'n/a'}`);

        const monthMatches = expectedKey ? detectedKey === expectedKey : Boolean(detectedKey);
        lastAttemptInfo = { attempt: attemptNumber, snapshot };

        if (monthMatches) {
            await smartDelay('verify');

            const confirmSnapshot = getDropdownSelectionSnapshot(dropdownContainer, {
                expectedMonth: bulan,
                fallbackAction: expectedAction
            });
            const confirmKey = confirmSnapshot.details.monthKey;
            const confirmLabel = confirmSnapshot.primaryText || confirmSnapshot.details.rawText || '';
            const confirmMatches = expectedKey ? confirmKey === expectedKey : Boolean(confirmKey);

            console.log(`Content script: [VALIDATE MASA PAJAK] Double-check attempt ${attemptNumber} - Label="${confirmLabel}", monthKey=${confirmKey}, match=${confirmMatches}`);

            if (confirmMatches) {
                return {
                    success: true,
                    attempts: attemptNumber,
                    snapshot: confirmSnapshot,
                    initialSnapshot: snapshot
                };
            }

            console.warn(`Content script: [VALIDATE MASA PAJAK] Second-check mismatch on attempt ${attemptNumber}. Expected=${expectedKey}, got=${confirmKey}`);
            lastAttemptInfo = {
                attempt: attemptNumber,
                snapshot: confirmSnapshot,
                initialSnapshot: snapshot,
                mismatchReason: 'second-check-mismatch'
            };
            continue;
        }

        console.warn(`Content script: [VALIDATE MASA PAJAK] Validation failed on attempt ${attemptNumber}, detectedKey=${detectedKey}, expectedKey=${expectedKey}`);
        lastAttemptInfo = Object.assign({}, lastAttemptInfo, { mismatchReason: 'initial-check-mismatch' });
    }

    console.error(`Content script: [VALIDATE MASA PAJAK] Validation failed after ${maxRetries} attempts`);
    return {
        success: false,
        attempts: maxRetries,
        snapshot: lastAttemptInfo?.snapshot || null,
        initialSnapshot: lastAttemptInfo?.initialSnapshot || null,
        reason: lastAttemptInfo?.mismatchReason || lastAttemptInfo?.error || 'validation-failed',
        lastAttempt: lastAttemptInfo
    };
}


// TAHUN PAJAK: Function untuk mengubah tahun pajak
async function ubahTahunPajak(tahun) {
    updateStatus("  -> Mencari input 'Tahun Pajak Pengkreditan'...");

    //  ENHANCED VALIDATION: Validasi input tahun
    if (!tahun || typeof tahun !== 'string' || tahun.trim() === '') {
        updateStatus("  -> GAGAL: Parameter tahun tidak valid.", 'error');
        console.error("Content script: ubahTahunPajak - Invalid tahun parameter:", tahun);
        return false;
    }

    // Find the year input field using id="YearCredit" or placeholder
    let yearInput = document.querySelector('#YearCredit');

    if (!yearInput) {
        // Try alternative selectors
        yearInput = document.querySelector('input[placeholder="Tahun Pajak Pengkreditan"]') ||
            document.querySelector('input[id*="YearCredit"]') ||
            document.querySelector('input[title*="20"]');
    }

    if (!yearInput) {
        updateStatus("  -> GAGAL: Input 'Tahun Pajak Pengkreditan' tidak ditemukan.", 'error');
        console.error("Content script: ubahTahunPajak - Year input not found");
        return false;
    }

    console.log(`Content script: [TAHUN PAJAK] Found year input:`, yearInput);
    console.log(`Content script: [TAHUN PAJAK] Current value: "${yearInput.value}", Setting to: "${tahun}"`);

    //  ENHANCED VALIDATION: Validasi state element sebelum operasi
    if (!document.contains(yearInput) || yearInput.disabled) {
        updateStatus("  -> GAGAL: Input tahun tidak aktif atau tidak terhubung ke DOM.", 'error');
        console.error("Content script: Year input validation failed - disabled:", yearInput.disabled, "connected:", document.contains(yearInput));
        return false;
    }

    updateStatus(`  -> Mengubah tahun pajak ke "${tahun}"...`);

    try {
        // Focus the input
        yearInput.focus();
        await smartDelay('ui_update');

        // Clear the current value
        yearInput.value = '';
        yearInput.dispatchEvent(new Event('input', { bubbles: true }));
        await smartDelay('ui_update');

        // Set the new value using robust method for Angular/React
        yearInput.value = '';
        yearInput.dispatchEvent(new Event('input', { bubbles: true }));
        
        // Use native setter
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativeInputValueSetter.call(yearInput, tahun);
        
        yearInput.dispatchEvent(new Event('input', { bubbles: true }));
        yearInput.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Enter', code: 'Enter', keyCode: 13 }));
        yearInput.dispatchEvent(new Event('change', { bubbles: true }));
        yearInput.dispatchEvent(new Event('blur', { bubbles: true }));

        await smartDelay('ui_update');

        console.log(`Content script: [TAHUN PAJAK] Year input value set to: "${yearInput.value}"`);

        // Verify the value was set
        if (yearInput.value !== tahun) {
            console.warn(`Content script: [TAHUN PAJAK] Value mismatch - expected "${tahun}", got "${yearInput.value}"`);
            // Try one more time with native setter
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            nativeInputValueSetter.call(yearInput, tahun);
            yearInput.dispatchEvent(new Event('input', { bubbles: true }));
            yearInput.dispatchEvent(new Event('change', { bubbles: true }));
            await smartDelay('ui_update');
        }

        updateStatus(`  -> Tahun pajak berhasil diubah ke "${tahun}".`);
        return true;

    } catch (error) {
        if (error instanceof SessionLogoutError || error instanceof AutomationAbortError) { throw error; }
        updateStatus(`  -> GAGAL: Error saat mengubah tahun pajak - ${error.message}`, 'error');
        console.error("Content script: [TAHUN PAJAK] Error:", error);
        return false;
    }
}

// TAHUN PAJAK: Helper function untuk validasi perubahan tahun pajak
async function validateTahunPajakChange(tahun, options = {}) {
    const { maxRetries = 3 } = options;
    console.log(`Content script: [VALIDATE TAHUN PAJAK] Validating change to "${tahun}"`);

    for (let retry = 0; retry < maxRetries; retry++) {
        await smartDelay('ui_update');
        const attemptNumber = retry + 1;

        // Find the year input field
        let yearInput = document.querySelector('#YearCredit') ||
            document.querySelector('input[placeholder="Tahun Pajak Pengkreditan"]') ||
            document.querySelector('input[id*="YearCredit"]');

        if (!yearInput) {
            console.warn(`Content script: [VALIDATE TAHUN PAJAK] Year input not found on attempt ${attemptNumber}`);
            continue;
        }

        const currentValue = yearInput.value || '';
        console.log(`Content script: [VALIDATE TAHUN PAJAK] Attempt ${attemptNumber}/${maxRetries} - Current value: "${currentValue}", Expected: "${tahun}"`);

        if (currentValue === tahun) {
            // Double-check after a short delay
            await smartDelay('verify');

            const confirmValue = yearInput.value || '';
            if (confirmValue === tahun) {
                console.log(`Content script: [VALIDATE TAHUN PAJAK] Validation successful on attempt ${attemptNumber}`);
                return {
                    success: true,
                    attempts: attemptNumber,
                    value: confirmValue
                };
            }
            console.warn(`Content script: [VALIDATE TAHUN PAJAK] Value changed during verification on attempt ${attemptNumber}`);
        }
    }

    console.error(`Content script: [VALIDATE TAHUN PAJAK] Validation failed after ${maxRetries} attempts`);
    return {
        success: false,
        attempts: maxRetries,
        reason: 'validation-failed'
    };
}


//  ENHANCED ERROR HANDLING: Helper function untuk retry dengan exponential backoff
async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const result = await fn();
            const isObjectResult = typeof result === 'object' && result !== null;

            if (result && (!isObjectResult || result.success !== false)) {
                console.log(`Content script: [RETRY] Success on attempt ${attempt + 1}/${maxRetries}`);
                return result;
            }

            if (isObjectResult && result.success === false) {
                console.warn(`Content script: [RETRY] Attempt ${attempt + 1}/${maxRetries} returned explicit failure result`, result.reason || result);
            }
        } catch (error) {
            if (error instanceof SessionLogoutError || error instanceof AutomationAbortError) { throw error; }
            console.warn(`Content script: [RETRY] Attempt ${attempt + 1}/${maxRetries} failed:`, error.message);
        }

        if (attempt < maxRetries - 1) {
            const delay = baseDelay * Math.pow(2, attempt); // Exponential backoff
            console.log(`Content script: [RETRY] Waiting ${delay}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    console.error(`Content script: [RETRY] All ${maxRetries} attempts failed`);
    return false;
}

//  ENHANCED LOGGING: Helper function untuk logging yang lebih detail
function logAutomationStep(step, details = {}) {
    const timestamp = new Date().toISOString();
    console.log(`Content script: [AUTOMATION STEP] ${timestamp} - ${step}`, details);
}

async function prosesSatuFaktur(faktur, bulan, tahun, aksi) {
    updateStatus(`Memproses faktur: ${faktur}...`);

    //  ENHANCED VALIDATION: Validasi input parameter
    if (!faktur || typeof faktur !== 'string' || faktur.trim() === '') {
        updateStatus("  -> GAGAL: Parameter faktur tidak valid.", 'error');
        console.error("Content script: prosesSatuFaktur - Invalid faktur parameter:", faktur);
        //  FAKTUR TRACKING: Track validation failure
        addFakturResult(faktur || 'UNKNOWN', 'FAILED', 'Parameter faktur tidak valid');
        return "FAILED";
    }

    if (aksi !== 'Kembali ke status Approved' && (!bulan || typeof bulan !== 'string' || bulan.trim() === '')) {
        updateStatus("  -> GAGAL: Parameter bulan tidak valid.", 'error');
        console.error("Content script: prosesSatuFaktur - Invalid bulan parameter:", bulan);
        //  FAKTUR TRACKING: Track validation failure
        addFakturResult(faktur, 'FAILED', 'Parameter bulan tidak valid');

        return "FAILED";
    }

    assertSessionActive('prosesSatuFaktur:start');


    const masaPajakMetadata = {
        expectedMonth: aksi !== 'Kembali ke status Approved' ? bulan : null,
        expectedMonthKey: aksi !== 'Kembali ke status Approved' ? normalizeMonthKey(bulan) : null,
        action: aksi,
        actualLabel: null,
        actualMonthKey: null,
        actualCreditStatus: null,
        verificationStatus: aksi !== 'Kembali ke status Approved' ? 'pending' : 'not-applicable',
        validationAttempts: 0,
        validationReason: null
    };

    const finalizeMasaMetadata = () => {
        if (!masaPajakMetadata.actualCreditStatus) {
            const fallbackCredit = determineCreditStatus(masaPajakMetadata.actualLabel, masaPajakMetadata.action);
            if (fallbackCredit.status) {
                masaPajakMetadata.actualCreditStatus = fallbackCredit.status;
            }
        }
    };
    //  NEW APPROACH: Use column filter instead of table scanning
    // After filtering by invoice number, the table should show only the matching invoice
    // So we can directly use the first row instead of searching through all rows
    console.log(`Content script: Processing invoice ${faktur} - using column filter approach`);

    // Wait for table to update after filter application (add LONGER delay)
    // PERBAIKAN: Tambah delay lebih lama untuk memastikan tabel sudah refresh
    await smartDelay('ui_update');
    await new Promise(resolve => setTimeout(resolve, turboDelay(1500, 0.06))); // Extra delay for table refresh
    console.log(`Content script: [DEBUG] Extra delay completed, now reading rows...`);

    const allRows = Array.from(document.querySelectorAll('.p-datatable-tbody > tr'));
    console.log(`Content script: Found ${allRows.length} rows after invoice filter`);

    // DEBUGGING: Log isi setiap row untuk diagnosa
    console.log(`Content script: [DEBUG] Row contents for diagnosis:`);
    allRows.forEach((row, idx) => {
        const rowText = row.innerText.replace(/\n/g, ' | ').substring(0, 200);
        console.log(`Content script: [DEBUG] Row ${idx + 1}: "${rowText}"`);
    });

    // Validation: Check if we have any rows after filtering
    if (allRows.length === 0) {
        updateStatus(`  -> [SKIP] Faktur ${faktur} tidak ditemukan setelah filter diterapkan.`, 'status');
        console.error("Content script: No rows found after invoice filter - filter may have failed");
        //  FAKTUR TRACKING: Track not found result
        addFakturResult(faktur, 'SKIPPED', 'Tidak ditemukan setelah filter diterapkan');
        return "SKIPPED";
    }

    //  ENHANCED ROW SEARCH: Check all rows until we find the correct invoice
    const fakturClean = faktur.replace(/[^\d]/g, ''); // Extract only numbers
    let targetRow = null;

    console.log(`Content script: Searching for invoice ${faktur} (clean: ${fakturClean}) in ${allRows.length} rows...`);

    // Search through all rows for the correct invoice
    for (let i = 0; i < allRows.length; i++) {
        const currentRow = allRows[i];
        const rowText = currentRow.innerText.toLowerCase();

        // Check if this row contains our invoice number
        if (rowText.includes(fakturClean) || rowText.includes(faktur)) {
            targetRow = currentRow;
            console.log(`Content script:  Found invoice ${faktur} in row ${i + 1}/${allRows.length}`);
            break;
        }
    }

    // If we still haven't found the invoice, return NOT_FOUND
    if (!targetRow) {
        updateStatus(`  -> [SKIP] Faktur ${faktur} tidak ditemukan di row manapun.`, 'status');
        console.error(`Content script: Invoice ${faktur} not found in any of the ${allRows.length} filtered rows`);
        //  FAKTUR TRACKING: Track not found result
        addFakturResult(faktur, 'SKIPPED', 'Tidak ditemukan di filtered rows');
        return "SKIPPED";
    }

    updateStatus(`  -> DITEMUKAN: Faktur ${faktur} di hasil filter.`);
    console.log(`Content script: Found invoice in filtered row: ${targetRow.innerText.substring(0, 100)}...`);

    targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await smartDelay('ui_update');

    // Enhanced edit button search with multiple selectors
    let editButton = targetRow.querySelector('.pi.pi-pencil');
    if (!editButton) {
        // Try alternative selectors for edit button
        editButton = targetRow.querySelector('.pi-pencil') ||
            targetRow.querySelector('[title*="edit"]') ||
            targetRow.querySelector('[aria-label*="edit"]') ||
            targetRow.querySelector('button[class*="pencil"]');
    }

    if (!editButton) {
        console.error(`Content script: Edit button search failed. Checking row contents...`);
        console.error(`Content script: Row text content: "${targetRow.innerText}"`);
        console.error(`Content script: Row HTML: ${targetRow.innerHTML.substring(0, 200)}`);

        // Check if row is actually visible and contains our invoice
        const rowText = targetRow.innerText.toLowerCase();
        const fakturClean = faktur.replace(/[^\d]/g, '');

        if (!rowText.includes(fakturClean)) {
            console.error(`Content script: Row does not contain invoice ${faktur}!`);
            console.error(`Content script: Looking for: "${fakturClean}" in "${rowText}"`);
        }

        updateStatus(`  -> GAGAL: Tombol Edit tidak ditemukan untuk faktur ${faktur}.`, 'error');
        //  FAKTUR TRACKING: Track failure
        addFakturResult(faktur, 'FAILED', 'Tombol Edit tidak ditemukan');
        return "FAILED";
    }

    //  ENHANCED VALIDATION: Validasi tombol edit sebelum klik
    if (!document.contains(editButton) || editButton.disabled) {
        updateStatus(`  -> GAGAL: Tombol Edit tidak aktif atau tidak terhubung ke DOM.`, 'error');
        console.error("Content script: Edit button validation failed - disabled:", editButton.disabled, "connected:", document.contains(editButton));
        //  FAKTUR TRACKING: Track failure
        addFakturResult(faktur, 'FAILED', 'Tombol Edit tidak aktif atau tidak terhubung ke DOM');
        return "FAILED";
    }

    editButton.click();
    await smartDelay('ui_update');

    //  ENHANCED ERROR HANDLING: Improved error handling untuk ubah masa pajak dengan retry
    let berhasilUbah = true;
    let masaPajakChangeOutcome = null;
    let masaPajakValidationResult = null;

    if (aksi !== 'Kembali ke status Approved') {
        logAutomationStep("Starting masa pajak change", { faktur, bulan, aksi });

        try {
            masaPajakChangeOutcome = await retryWithBackoff(async () => {
                const result = await ubahMasaPajak(bulan);
                if (!result || (typeof result === 'object' && result.success === false)) {
                    const reason = typeof result === 'object' ? (result.reason || 'ubahMasaPajak returned failure') : 'ubahMasaPajak returned false';
                    throw new Error(reason);
                }
                return result;
            }, 1, 2000);

            berhasilUbah = typeof masaPajakChangeOutcome === 'object'
                ? masaPajakChangeOutcome.success !== false
                : Boolean(masaPajakChangeOutcome);

            if (masaPajakChangeOutcome && typeof masaPajakChangeOutcome === 'object') {
                const changeSnapshot = masaPajakChangeOutcome.snapshot || masaPajakChangeOutcome.initialSnapshot || null;
                if (changeSnapshot) {
                    const changeDetails = changeSnapshot.details || {};
                    masaPajakMetadata.actualLabel = changeSnapshot.primaryText || changeDetails.rawText || masaPajakMetadata.actualLabel;
                    masaPajakMetadata.actualMonthKey = changeDetails.monthKey || masaPajakMetadata.actualMonthKey;
                    masaPajakMetadata.actualCreditStatus = changeDetails.creditStatus || masaPajakMetadata.actualCreditStatus;
                }
            }

            if (berhasilUbah) {
                masaPajakMetadata.verificationStatus = 'pending-validation';
                updateStatus(`  -> Memvalidasi perubahan masa pajak ke "${bulan}"...`);
                logAutomationStep("Validating masa pajak change", { bulan });

                masaPajakValidationResult = await validateMasaPajakChange(bulan, { expectedAction: aksi });
                masaPajakMetadata.validationAttempts = masaPajakValidationResult?.attempts || 0;

                const validationSnapshot = masaPajakValidationResult?.snapshot || masaPajakValidationResult?.initialSnapshot || null;
                if (validationSnapshot) {
                    const validationDetails = validationSnapshot.details || {};
                    masaPajakMetadata.actualLabel = validationSnapshot.primaryText || validationDetails.rawText || masaPajakMetadata.actualLabel;
                    masaPajakMetadata.actualMonthKey = validationDetails.monthKey || masaPajakMetadata.actualMonthKey;
                    masaPajakMetadata.actualCreditStatus = validationDetails.creditStatus || masaPajakMetadata.actualCreditStatus;
                }

                if (!masaPajakValidationResult?.success) {
                    masaPajakMetadata.verificationStatus = 'validation-warning';
                    masaPajakMetadata.validationReason = masaPajakValidationResult?.reason || 'validation-failed';
                    updateStatus(`  -> PERINGATAN: Validasi perubahan masa pajak gagal, namun proses dilanjutkan.`, 'warning');
                    console.warn("Content script: Masa pajak validation failed, but continuing process", masaPajakValidationResult);
                    logAutomationStep("Masa pajak validation failed", { bulan, validationResult: masaPajakValidationResult });
                } else {
                    masaPajakMetadata.verificationStatus = 'verified';
                    updateStatus(`  -> Validasi perubahan masa pajak berhasil.`);
                    logAutomationStep("Masa pajak validation successful", { bulan, attempts: masaPajakValidationResult.attempts });
                }
            } else {
                masaPajakMetadata.verificationStatus = 'change-failed';
                logAutomationStep("Masa pajak change failed", { bulan, berhasilUbah });
            }
        } catch (error) {
            if (error instanceof SessionLogoutError || error instanceof AutomationAbortError) { throw error; }
            masaPajakMetadata.verificationStatus = 'change-error';
            masaPajakMetadata.validationReason = error.message;
            updateStatus(`  -> GAGAL: Error saat mengubah masa pajak - ${error.message}`, 'error');
            console.error("Content script: Error in ubahMasaPajak:", error);
            logAutomationStep("Masa pajak change error", { error: error.message, bulan });
            berhasilUbah = false;
        }
    }

    if (!berhasilUbah) {
        finalizeMasaMetadata();
        updateStatus(`  -> GAGAL: Tidak dapat mengubah masa pajak untuk faktur ${faktur}.`, 'error');
        addFakturResult(faktur, 'FAILED', 'Tidak dapat mengubah masa pajak', masaPajakMetadata);
        return "FAILED";
    }

    // TAHUN PAJAK: Ubah tahun pajak jika dipilih (setelah masa pajak, sebelum aksi final)
    if (aksi !== 'Kembali ke status Approved' && tahun && tahun.trim() !== '') {
        logAutomationStep("Starting tahun pajak change", { faktur, tahun, aksi });
        updateStatus(`  -> Mengubah tahun pajak ke "${tahun}"...`);

        let berhasilUbahTahun = false;
        try {
            berhasilUbahTahun = await ubahTahunPajak(tahun);

            if (berhasilUbahTahun) {
                updateStatus(`  -> Memvalidasi perubahan tahun pajak ke "${tahun}"...`);
                logAutomationStep("Validating tahun pajak change", { tahun });

                const tahunValidationResult = await validateTahunPajakChange(tahun);

                if (!tahunValidationResult?.success) {
                    updateStatus(`  -> PERINGATAN: Validasi perubahan tahun pajak gagal, namun proses dilanjutkan.`, 'warning');
                    console.warn("Content script: Tahun pajak validation failed, but continuing process", tahunValidationResult);
                    logAutomationStep("Tahun pajak validation failed", { tahun, validationResult: tahunValidationResult });
                } else {
                    updateStatus(`  -> Validasi perubahan tahun pajak berhasil.`);
                    logAutomationStep("Tahun pajak validation successful", { tahun, attempts: tahunValidationResult.attempts });
                }
            } else {
                updateStatus(`  -> PERINGATAN: Gagal mengubah tahun pajak, namun proses dilanjutkan.`, 'warning');
                console.warn("Content script: Tahun pajak change failed, but continuing process");
                logAutomationStep("Tahun pajak change failed", { tahun, berhasilUbahTahun });
            }
        } catch (error) {
            if (error instanceof SessionLogoutError || error instanceof AutomationAbortError) { throw error; }
            updateStatus(`  -> PERINGATAN: Error saat mengubah tahun pajak - ${error.message}`, 'warning');
            console.warn("Content script: Error in ubahTahunPajak:", error);
            logAutomationStep("Tahun pajak change error", { error: error.message, tahun });
            // Continue processing - don't fail the entire invoice because of year change error
        }
    }

    //  ENHANCED ERROR HANDLING: Improved error handling untuk klik tombol final
    let berhasilKlik = false;
    try {
        berhasilKlik = await klikTombolFinal(aksi);
    } catch (error) {
        if (error instanceof SessionLogoutError || error instanceof AutomationAbortError) { throw error; }
        updateStatus(`  -> GAGAL: Error saat klik tombol final - ${error.message}`, 'error');
        console.error("Content script: Error in klikTombolFinal:", error);
        berhasilKlik = false;
    }

    if (!berhasilKlik) {
        updateStatus(`  -> GAGAL: Tidak dapat mengklik tombol "${aksi}" untuk faktur ${faktur}.`, 'error');
        //  FAKTUR TRACKING: Track failure
        finalizeMasaMetadata();
        addFakturResult(faktur, 'FAILED', `Tidak dapat mengklik tombol "${aksi}"`, masaPajakMetadata);
        return "FAILED";
    }

    updateStatus(`  ->  BERHASIL: Faktur ${faktur} berhasil diproses.`);
    //  FAKTUR TRACKING: Track success
    finalizeMasaMetadata();
    addFakturResult(faktur, 'SUCCESS', null, masaPajakMetadata);
    return "SUCCESS";
}

async function startDownloadAutomation(selectedMonths = [], selectedYear = '') {
    stopNavigationMonitor();
    forcedLogoutReason = null;
    automationAbortHandler = null;

    // Set state to running
    currentState = MachineState.RUNNING;

    // Download state variables
    let currentPage = 1;
    let totalPages = 0;
    let totalDownloaded = 0;
    let maxPages = 50; // Safety limit to prevent infinite loops
    let downloadState = 'running';

    // Send initial status with month and year information
    if (selectedMonths.length > 0) {
        updateStatus(` Memulai download daftar Pajak Masukan untuk ${selectedMonths.length} bulan...`, 'status', 0, true, 0, 1);
        updateStatus(` Bulan terpilih: ${selectedMonths.join(', ')}`, 'status', 0, false, 0, 1);
    } else {
        updateStatus(' Memulai download daftar Pajak Masukan (semua bulan)...', 'status', 0, true, 0, 1);
    }
    if (selectedYear) {
        updateStatus(` Tahun terpilih: ${selectedYear}`, 'status', 0, false, 0, 1);
    }

    // Download abort handler
    automationAbortHandler = {
        isProcessing: false,
        async onAbort(reason, context) {
            console.warn(`Content script: Download abort via ${context}: ${reason}`);
            try {
                const safeReason = sanitizeLogMessage(reason || 'Session berakhir');
                currentState = MachineState.ERROR;
                downloadState = 'aborted';
                updateStatus(` ERROR: ${safeReason}. Download dihentikan otomatis.`, 'error', totalDownloaded, true, totalDownloaded, totalPages > 0 ? totalPages : 1);
            } catch (abortError) {
                console.error('Content script: Error saat menyelesaikan abort download:', abortError);
            }
        }
    };

    startNavigationMonitor();

    try {
        // Step 1: Click refresh button ONCE at the start
        updateStatus(' Mengklik tombol refresh...', 'status', 0, false, 0, 1);
        const refreshBerhasil = await klikTombolRefresh();
        if (!refreshBerhasil) {
            throw new Error('Gagal me-refresh halaman');
        }

        // Step 2: Reset filter to selected months ONCE at the beginning (filter persists across pages)
        if (selectedMonths.length > 0) {
            updateStatus(` Mengatur filter ke ${selectedMonths.length} bulan yang dipilih...`, 'status', 0, false, 0, 1);
            const filterBerhasil = await resetFilterToSelectedMonths(selectedMonths);
            if (!filterBerhasil) {
                throw new Error(`Gagal mengatur filter ke ${selectedMonths.length} bulan yang dipilih`);
            }
            updateStatus(`  Filter berhasil diatur ke ${selectedMonths.length} bulan`, 'status', 0, false, 0, 1);
        } else {
            // Fallback to all 12 months if no specific months provided
            updateStatus(' Mengatur filter ke 12 bulan (semua bulan)...', 'status', 0, false, 0, 1);
            const filterBerhasil = await resetFilterTo12Months();
            if (!filterBerhasil) {
                throw new Error('Gagal mengatur filter 12 bulan');
            }
            updateStatus('  Filter berhasil diatur ke 12 bulan', 'status', 0, false, 0, 1);
        }

        // Step 2b: Apply year filter if specified
        if (selectedYear && selectedYear.trim() !== '') {
            updateStatus(` Mengatur filter tahun ke ${selectedYear}...`, 'status', 0, false, 0, 1);
            const yearFilterBerhasil = await applyYearFilter(selectedYear);
            if (yearFilterBerhasil) {
                updateStatus(`  Filter tahun berhasil diatur ke ${selectedYear}`, 'status', 0, false, 0, 1);

                // Step 2c: Click refresh button to load data after year filter
                updateStatus(`  -> Mengklik tombol refresh untuk memuat data...`, 'status', 0, false, 0, 1);
                const refreshBerhasilSetelahTahun = await klikTombolRefresh();
                if (refreshBerhasilSetelahTahun) {
                    updateStatus(`  ->  Refresh berhasil, data dimuat`, 'status', 0, false, 0, 1);
                } else {
                    updateStatus(`  ->  Warning: Refresh gagal, melanjutkan proses...`, 'status', 0, false, 0, 1);
                }
            }
        }

        // Step 3: Start download loop - download from each page
        while (downloadState === 'running' && currentPage <= maxPages) {
            updateStatus(`\n=== HALAMAN ${currentPage} ===`, 'status', totalDownloaded, false, totalDownloaded, totalPages > 0 ? totalPages : '?');

            // Step 3a: Click Excel download button
            updateStatus(`  -> Mengklik tombol download Excel...`, 'status', totalDownloaded, false, totalDownloaded, totalPages > 0 ? totalPages : '?');
            const downloadSuccess = await klikTombolDownloadExcel();
            if (!downloadSuccess) {
                throw new Error(`Gagal mengklik tombol download pada halaman ${currentPage}`);
            }

            // Step 3b: Wait for download to complete
            updateStatus(`  -> Menunggu download selesai...`, 'status', totalDownloaded, false, totalDownloaded, totalPages > 0 ? totalPages : '?');
            await tungguDownloadSelesai();
            totalDownloaded++;
            updateStatus(`  ->  Download berhasil! (Total: ${totalDownloaded} file)`, 'status', totalDownloaded, false, totalDownloaded, totalPages > 0 ? totalPages : '?');

            // Step 3c: Check and click next button
            updateStatus(`  -> Memeriksa tombol Next...`, 'status', totalDownloaded, false, totalDownloaded, totalPages > 0 ? totalPages : '?');
            const hasNextPage = await cekDanKlikNextButton();

            if (hasNextPage) {
                currentPage++;
                updateStatus(`  ->  Next button ditemukan, berpindah ke halaman ${currentPage}...`, 'status', totalDownloaded, false, totalDownloaded, totalPages > 0 ? totalPages : '?');
                // Wait for page transition
                await tungguHalamanSiap();
            } else {
                // No more pages, download complete
                totalPages = currentPage;
                downloadState = 'completed';
                updateStatus(`  ->  Ini adalah halaman terakhir (halaman ${totalPages})`, 'status', totalDownloaded, false, totalDownloaded, totalPages);
                break;
            }

            // Check if stop was requested
            if (currentState === MachineState.STOPPED) {
                downloadState = 'stopped';
                break;
            }
        }

        // Final status update
        if (downloadState === 'completed') {
            updateStatus(`\n\n ===== DOWNLOAD SELESAI =====\n  Total File: ${totalDownloaded} file\n  Total Halaman: ${totalPages} halaman\n  Status: Semua data berhasil diunduh\n =============================`, 'success', totalDownloaded, true, totalDownloaded, totalPages);
        } else if (downloadState === 'stopped') {
            updateStatus(`\n\n ===== DOWNLOAD DIHENTIKAN =====\n  Total File: ${totalDownloaded} file\n  Halaman Terakhir: ${currentPage}\n  Status: Dihentikan oleh user\n =============================`, 'warning', totalDownloaded, true, totalDownloaded, currentPage);
        } else if (currentPage > maxPages) {
            updateStatus(`\n\n ===== DOWNLOAD MENCAPAI BATAS =====\n  Total File: ${totalDownloaded} file\n  Batas Maksimum: ${maxPages} halaman\n  Status: Batas keamanan tercapai\n =============================`, 'warning', totalDownloaded, true, totalDownloaded, maxPages);
        }

    } catch (error) {
        if (error instanceof SessionLogoutError) {
            const logoutMessage = sanitizeLogMessage(error.reason || error.message || "Session logout terdeteksi");
            currentState = MachineState.ERROR;
            updateStatus(`\n\n ===== DOWNLOAD ERROR =====\n  Error: ${logoutMessage}\n  File Downloaded: ${totalDownloaded}\n  Halaman: ${currentPage}\n  Status: Download dihentikan untuk keamanan\n ===========================`, 'error', totalDownloaded, true, totalDownloaded, currentPage);
        } else {
            console.error("Content script: Download automation error:", error);
            currentState = MachineState.ERROR;
            const errorMsg = sanitizeLogMessage(error.message || 'Terjadi error tidak diketahui');
            updateStatus(`\n\n ===== DOWNLOAD ERROR =====\n  Error: ${errorMsg}\n  File Downloaded: ${totalDownloaded}\n  Halaman: ${currentPage}\n  Status: Download dihentikan\n ===========================`, 'error', totalDownloaded, true, totalDownloaded, currentPage);
        }
    } finally {
        // Cleanup
        currentState = MachineState.IDLE;
        stopNavigationMonitor();
        automationAbortHandler = null;
        forcedLogoutReason = null;

        console.log("Content script: [DOWNLOAD] Automation cleanup completed");
        updateStatus(" Download automation selesai. Tombol sudah dapat digunakan kembali.");
    }
}

async function klikTombolDownloadExcel() {
    const maxRetries = 3;
    const retryDelay = 1000;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            console.log(`Content script: [DOWNLOAD EXCEL] Looking for download button (Attempt ${attempt + 1}/${maxRetries})`);

            // Multiple selectors for Excel download button based on the HTML structure provided
            const downloadSelectors = [
                'button[icon="pi pi-file-excel"]',
                '.pi-file-excel',
                'button[tooltipposition="bottom"][ptooltip="Ekspor ke Excel"]',
                'button[class*="file-excel"]',
                '.ct-ovw-btn-mini-green',
                'button[class*="mini-green"]',
                'button[title*="Excel"]',
                'button[aria-label*="Excel"]'
            ];

            let downloadButton = null;

            // Try each selector
            for (let selector of downloadSelectors) {
                const elements = document.querySelectorAll(selector);
                for (let element of elements) {
                    // Additional checks to find the correct Excel download button
                    const hasExcelIcon = element.querySelector('.pi-file-excel') ||
                        element.classList.contains('pi-file-excel') ||
                        element.innerHTML.includes('pi-file-excel');

                    const hasExcelTooltip = element.getAttribute('ptooltip') === 'Ekspor ke Excel' ||
                        element.getAttribute('title')?.includes('Excel') ||
                        element.getAttribute('aria-label')?.includes('Excel');

                    const hasGreenClass = element.classList.contains('ct-ovw-btn-mini-green') ||
                        element.classList.contains('mini-green');

                    if (hasExcelIcon || hasExcelTooltip || hasGreenClass) {
                        downloadButton = element;
                        console.log(`Content script: [DOWNLOAD EXCEL] Found button with selector: ${selector}`);
                        break;
                    }
                }
                if (downloadButton) break;
            }

            // If still not found, try text-based search
            if (!downloadButton) {
                const allButtons = Array.from(document.querySelectorAll('button'));
                downloadButton = allButtons.find(btn => {
                    const text = btn.textContent?.toLowerCase() || '';
                    const title = btn.getAttribute('title')?.toLowerCase() || '';
                    const tooltip = btn.getAttribute('ptooltip')?.toLowerCase() || '';
                    return text.includes('excel') || text.includes('ekspor') ||
                        title.includes('excel') || tooltip.includes('excel');
                });
            }

            if (!downloadButton) {
                console.warn(`Content script: [DOWNLOAD EXCEL] Download button not found (Attempt ${attempt + 1})`);
                if (attempt < maxRetries - 1) {
                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                    continue;
                } else {
                    throw new Error('Tombol download Excel tidak ditemukan setelah semua percobaan');
                }
            }

            // Check if button is clickable
            if (downloadButton.disabled || downloadButton.style.display === 'none' ||
                downloadButton.offsetParent === null) {
                console.warn(`Content script: [DOWNLOAD EXCEL] Download button is not clickable (Attempt ${attempt + 1})`);
                if (attempt < maxRetries - 1) {
                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                    continue;
                } else {
                    throw new Error('Tombol download Excel tidak dapat diklik (disabled atau tersembunyi)');
                }
            }

            // Click the download button
            console.log("Content script: Clicking Excel download button...");
            downloadButton.click();

            // Wait a moment to ensure click is processed
            await new Promise(resolve => setTimeout(resolve, 500));

            console.log("Content script: Excel download button clicked successfully");
            return true;

        } catch (error) {
            console.error(`Content script: [DOWNLOAD EXCEL] Error on attempt ${attempt + 1}:`, error);
            if (attempt < maxRetries - 1) {
                await new Promise(resolve => setTimeout(resolve, retryDelay));
            } else {
                throw error;
            }
        }
    }
}

async function cekDanKlikNextButton() {
    const maxWaitTime = 30000; // 30 seconds max wait (increased for slower page loads after download)
    const checkInterval = 500; // Check every 500ms
    let startTime = Date.now();

    // Wait for potential page transition after download
    await new Promise(resolve => setTimeout(resolve, 2000));

    while (Date.now() - startTime < maxWaitTime) {
        try {
            console.log(`Content script: [NEXT BUTTON] Looking for next button...`);

            // Multiple selectors for next button based on the HTML structure provided
            const nextButtonSelectors = [
                '.p-paginator-next',
                '.p-paginator-next.p-paginator-element',
                '.p-paginator-next.p-link',
                'button[class*="paginator-next"]',
                'button[class*="paginator"] .pi-angle-right',
                '.pi-angle-right',
                'button[aria-label*="Next"]',
                'button[title*="Next"]'
            ];

            let nextButton = null;

            // Try each selector
            for (let selector of nextButtonSelectors) {
                const elements = document.querySelectorAll(selector);
                for (let element of elements) {
                    // Additional checks to find the correct next button
                    const hasRightIcon = element.querySelector('.pi-angle-right') ||
                        element.classList.contains('pi-angle-right') ||
                        element.innerHTML.includes('pi-angle-right');

                    const isPaginatorButton = element.classList.contains('p-paginator-next') ||
                        element.classList.contains('p-paginator-element') ||
                        element.closest('.p-paginator');

                    if (hasRightIcon || isPaginatorButton) {
                        nextButton = element;
                        console.log(`Content script: [NEXT BUTTON] Found button with selector: ${selector}`);
                        break;
                    }
                }
                if (nextButton) break;
            }

            if (!nextButton) {
                console.log(`Content script: [NEXT BUTTON] Next button not found, assuming last page`);
                return false; // No next button found, likely last page
            }

            // Check if next button is disabled (which means we're on the last page)
            const isDisabled = nextButton.disabled ||
                nextButton.classList.contains('p-disabled') ||
                nextButton.hasAttribute('aria-disabled') ||
                nextButton.style.opacity === '0' ||
                nextButton.style.pointerEvents === 'none';

            if (isDisabled) {
                console.log(`Content script: [NEXT BUTTON] Next button is disabled, this is the last page`);
                return false; // Disabled button means last page
            }

            // Check if button is visible and clickable
            if (nextButton.offsetParent === null ||
                nextButton.style.display === 'none' ||
                nextButton.style.visibility === 'hidden') {
                console.log(`Content script: [NEXT BUTTON] Next button is not visible, waiting...`);
                await new Promise(resolve => setTimeout(resolve, checkInterval));
                continue;
            }

            // Click the next button
            console.log("Content script: Clicking next button...");
            nextButton.click();

            // Wait a moment to ensure click is processed
            await new Promise(resolve => setTimeout(resolve, 500));

            console.log("Content script: Next button clicked successfully");
            return true;

        } catch (error) {
            console.error(`Content script: [NEXT BUTTON] Error checking/ clicking next button:`, error);
            await new Promise(resolve => setTimeout(resolve, checkInterval));
        }
    }

    // Timeout reached, assume no more pages
    console.log("Content script: [NEXT BUTTON] Timeout reached, assuming no more pages");
    return false;
}

async function tungguDownloadSelesai() {
    const maxWaitTime = 30000; // 30 seconds max wait for download
    const checkInterval = 1000; // Check every 1 second
    let startTime = Date.now();

    console.log("Content script: [DOWNLOAD WAIT] Waiting for download to complete...");

    while (Date.now() - startTime < maxWaitTime) {
        try {
            // Check for download completion indicators
            let downloadComplete = false;

            // Method 1: Check if any download indicators are gone
            // Look for loading spinners, progress bars, or download indicators that disappear when done
            const downloadIndicators = document.querySelectorAll([
                '.loading-spinner',
                '.download-progress',
                '[class*="loading"]',
                '[class*="download"]',
                '[class*="progress"]'
            ].join(', '));

            if (downloadIndicators.length === 0) {
                downloadComplete = true;
            }

            // Method 2: Check for success messages or notifications
            const successMessages = Array.from(document.querySelectorAll('*')).filter(el => {
                const text = el.textContent?.toLowerCase() || '';
                return text.includes('download') &&
                    (text.includes('complete') || text.includes('selesai') || text.includes('berhasil'));
            });

            if (successMessages.length > 0) {
                downloadComplete = true;
            }

            // Method 3: Monitor button state changes
            // If the download button becomes enabled again, download might be complete
            const downloadButtons = document.querySelectorAll([
                'button[icon="pi pi-file-excel"]',
                '.pi-file-excel',
                'button[tooltipposition="bottom"][ptooltip="Ekspor ke Excel"]'
            ].join(', '));

            let allButtonsEnabled = true;
            for (let button of downloadButtons) {
                if (button.disabled) {
                    allButtonsEnabled = false;
                    break;
                }
            }

            if (allButtonsEnabled && downloadButtons.length > 0) {
                downloadComplete = true;
            }

            // Method 4: Check for Chrome download API (if available in content script context)
            // Note: This might not work in all content script environments
            try {
                if (chrome && chrome.downloads) {
                    const recentDownloads = await new Promise((resolve) => {
                        chrome.downloads.search({
                            limit: 5,
                            orderBy: ['-startTime']
                        }, resolve);
                    });

                    const excelDownloads = recentDownloads.filter(download =>
                        download.filename?.toLowerCase().endsWith('.xlsx') ||
                        download.filename?.toLowerCase().endsWith('.xls')
                    );

                    const completedDownloads = excelDownloads.filter(download =>
                        download.state === 'complete'
                    );

                    if (completedDownloads.length > 0) {
                        const latestDownload = completedDownloads[0];
                        const downloadTime = new Date(latestDownload.startTime).getTime();
                        if (Date.now() - downloadTime < maxWaitTime) {
                            downloadComplete = true;
                            console.log("Content script: [DOWNLOAD WAIT] Chrome download API detected completion");
                        }
                    }
                }
            } catch (apiError) {
                // Chrome downloads API not available in content script, ignore
            }

            if (downloadComplete) {
                console.log("Content script: [DOWNLOAD WAIT] Download completion detected");
                // Additional wait to ensure file is fully saved
                await new Promise(resolve => setTimeout(resolve, 2000));
                return true;
            }

            // Still waiting, continue checking
            await new Promise(resolve => setTimeout(resolve, checkInterval));

        } catch (error) {
            console.error("Content script: [DOWNLOAD WAIT] Error while waiting for download:", error);
            await new Promise(resolve => setTimeout(resolve, checkInterval));
        }
    }

    // Timeout reached, but we'll assume download completed for continuity
    console.log("Content script: [DOWNLOAD WAIT] Timeout reached, assuming download completed");
    return true;
}

async function tungguHalamanSiap() {
    const maxWaitTime = 10000; // 10 seconds max wait
    const checkInterval = 500; // Check every 500ms
    let startTime = Date.now();

    console.log("Content script: [PAGE READY] Waiting for page to be ready after navigation...");

    while (Date.now() - startTime < maxWaitTime) {
        try {
            // Check for page readiness indicators
            let pageReady = false;

            // Method 1: Check if loading indicators are gone
            const loadingIndicators = document.querySelectorAll([
                '.loading-spinner',
                '[class*="loading"]',
                '[class*="spinner"]',
                '.p-datatable-loading'
            ].join(', '));

            if (loadingIndicators.length === 0) {
                pageReady = true;
            }

            // Method 2: Check if data table is present and populated
            const dataTable = document.querySelector('.p-datatable, table, [class*="datatable"]');
            if (dataTable && dataTable.querySelectorAll('tr, [class*="row"]').length > 1) {
                pageReady = true;
            }

            // Method 3: Check if key elements are visible
            const keyElements = document.querySelectorAll([
                '.p-paginator',
                'button[class*="file-excel"]',
                'button[class*="mini-green"]'
            ].join(', '));

            let visibleElements = 0;
            for (let element of keyElements) {
                if (element.offsetParent !== null) {
                    visibleElements++;
                }
            }

            if (visibleElements >= 1) {
                pageReady = true;
            }

            if (pageReady) {
                console.log("Content script: [PAGE READY] Page is ready");
                // Additional wait to ensure all elements are fully rendered
                await new Promise(resolve => setTimeout(resolve, 1000));
                return true;
            }

            // Still waiting, continue checking
            await new Promise(resolve => setTimeout(resolve, checkInterval));

        } catch (error) {
            console.error("Content script: [PAGE READY] Error while waiting for page ready:", error);
            await new Promise(resolve => setTimeout(resolve, checkInterval));
        }
    }

    console.log("Content script: [PAGE READY] Timeout reached, proceeding anyway");
    return true;
}

async function startAutomation() {
    stopNavigationMonitor();
    forcedLogoutReason = null;
    automationAbortHandler = null;

    // Basic version - no humanizer dependency
    currentState = MachineState.RUNNING;
    serverErrorState = null;
    badGatewayRetryTracker = {};
    sessionReloadScheduled = false;
    startServerErrorObserver();

    //  ENHANCED LOGGING: Log start of automation
    logAutomationStep("Starting automation", {
        timestamp: new Date().toISOString(),
        currentState: currentState,
        url: window.location.href
    });

    // Reset session timer
    sessionStartTime = Date.now();
    lastActivityTime = Date.now();
    console.log("Content script: Session timer reset for new automation");
    checkSessionTimeout._durationNotified = false;

    //  QUOTA FIX: Reset quota tracking variables for new session
    processedSuccessCount = 0;
    console.log("Content script: [QUOTA FIX] Quota tracking variables reset for new session");

    //  FAKTUR TRACKING: Reset faktur tracking array untuk session baru
    resetFakturTracking();
    console.log("Content script: [FAKTUR TRACKING] Faktur tracking array reset for new session");

    //  DEBUG: Validasi automationData sebelum memulai - dengan recovery
    console.log("Content script: STARTING AUTOMATION - Validating automationData...");
    console.log("Content script: Current automationData exists:", !!automationData);
    console.log("Content script: Current automationData content:", automationData);

    if (!automationData) {
        console.warn("Content script: automationData not found, attempting recovery...");
        const recovered = loadAutomationData();

        if (!recovered) {
            const errorMsg = " FATAL ERROR: automationData tidak tersedia! File CSV/TXT belum dipilih dan tidak dapat dipulihkan.";
            updateStatus(errorMsg, 'error');
            console.error("Content script: automationData recovery failed:", automationData);
            currentState = MachineState.ERROR;
            return;
        }

        console.log("Content script:  automationData recovered successfully");
        updateStatus("  ->  Data konfigurasi berhasil dipulihkan dari penyimpanan");
        console.log("Content script: Recovered data:", automationData);
    } else {
        // Save to persistent storage untuk backup
        saveAutomationData(automationData);
    }

    assertSessionActive('startAutomation:init');

    //  QUOTA FIX: Validate and log quota information
    if (quotaInfo) {
        console.log("Content script: [QUOTA FIX] Quota info available:", quotaInfo);
        console.log("Content script: [QUOTA FIX] User type:", quotaInfo.userType);
        console.log("Content script: [QUOTA FIX] Is free user:", quotaInfo.isFreeUser);
        console.log("Content script: [QUOTA FIX] Max quota:", quotaInfo.maxQuota);
        console.log("Content script: [QUOTA FIX] Used quota:", quotaInfo.usedQuota);
        console.log("Content script: [QUOTA FIX] Remaining quota:", quotaInfo.remainingQuota);

        if (quotaInfo.isFreeUser && quotaInfo.remainingQuota <= 0) {
            const errorMsg = " QUOTA HABIS: Kuota free user sudah habis. Tidak dapat memproses faktur.";
            updateStatus(errorMsg, 'error');
            console.error("Content script: [QUOTA FIX] Free user quota exhausted");
            currentState = MachineState.ERROR;
            return;
        }
    } else {
        console.warn("Content script: [QUOTA FIX]  No quota info received - quota checking will be disabled");
    }

    if (!automationData.csvData) {
        const errorMsg = " FATAL ERROR: csvData tidak tersedia! File CSV/TXT belum dipilih.";
        updateStatus(errorMsg, 'error');
        console.error("Content script: automationData.csvData is empty:", automationData.csvData);
        currentState = MachineState.ERROR;
        return;
    }

    // VALIDASI VALID: Pastikan bulan dipilih bukan empty string, tapi mungkin null/undefined itu ok selama ada default
    const bulanDipilih = automationData.bulanDipilih;
    const aksiFinal = automationData.aksiFinal;

    console.log(`Content script: Validating configuration:`);
    console.log(`- bulanDipilih: "${bulanDipilih}" (isValid: ${bulanDipilih != null})`);
    console.log(`- aksiFinal: "${aksiFinal}" (isValid: ${!!aksiFinal})`);
    console.log(`- csvData size: ${automationData.csvData?.length || 0} characters`);

    // Jika bulanDipilih adalah empty string, itu mungkin ok selama ada default
    // Yang penting adalah aksiFinal harus ada
    if (!aksiFinal) {
        const errorMsg = " FATAL ERROR: aksiFinal tidak tersedia! Pilih aksi final yang diinginkan.";
        updateStatus(errorMsg, 'error');
        console.error("Content script: automationData.aksiFinal is missing:", automationData.aksiFinal);
        currentState = MachineState.ERROR;
        return;
    }

    preferredFilterMonthKeys = [];

    let fakturList;
    try {
        fakturList = parseCsv(automationData.csvData);
        updateStatus(`Ditemukan ${fakturList.length} nomor faktur valid.`);
        console.log(`Content script: CSV parsing successful - ${fakturList.length} invoices found`);
    } catch (e) {
        if (e instanceof SessionLogoutError) { throw e; }
        const errorMsg = ` ERROR: Gagal parsing CSV - ${e.message}`;
        updateStatus(errorMsg, 'error');
        console.error("Content script: CSV parsing failed:", e);
        currentState = MachineState.ERROR;
        return;
    }

    setPreferredFilterMonthsFromFakturList(fakturList);
    const preferredMonthLabels = getPreferredFilterMonthLabels();
    if (preferredMonthLabels.length > 0) {
        updateStatus(`Filter masa pajak otomatis mengikuti ${preferredMonthLabels.length} bulan dari file: ${preferredMonthLabels.join(', ')}`);
    } else {
        updateStatus('Filter masa pajak otomatis menggunakan semua bulan karena kolom Masa Pajak pada file kosong.');
        console.log('Content script: Tidak ada masa pajak spesifik di CSV, filter akan menggunakan 12 bulan.');
    }

    ensureFakturBaseline(fakturList);
    console.log("Content script: Baseline faktur results initialized for full CSV list.");

    let totalBerhasil = 0;
    let processedInvoices = 0;
    badGatewayRetryTracker = {};

    //  NEW: Helper function untuk cleanup dan update kuota terlepas dari state - SINGLE FINAL MESSAGE
    let finalizeCalled = false; // Prevent multiple calls to finalize

    const finalizeAutomation = async (finalState, finalTotalBerhasil, fakturListLength) => {
        if (finalizeCalled) {
            console.log('Content script: FINALIZE already called, skipping duplicate');
            return;
        }
        finalizeCalled = true;
        stopNavigationMonitor();

        console.log(`Content script: FINALIZING (ONE TIME) - State: ${finalState}, Success: ${finalTotalBerhasil}/${fakturListLength}`);

        const pendingFinalizeReason = forcedLogoutReason
            ? `Belum diproses karena otomasi berakhir: ${forcedLogoutReason}`
            : null;
        finalizePendingResults(finalState, pendingFinalizeReason);

        const notProcessedCount = fakturProcessingResults.filter(entry => entry.status === 'NOT_PROCESSED').length;
        const pendingCount = fakturProcessingResults.filter(entry => entry.status === 'PENDING').length;
        const failedCount = fakturProcessingResults.filter(entry => entry.status === 'FAILED').length;
        const notFoundCount = fakturProcessingResults.filter(entry => entry.status === 'SKIPPED').length;
        const skippedCount = fakturProcessingResults.filter(entry => entry.status === 'SKIPPED').length;

        // Always send a SINGLE final status message
        let finalMessage = '';
        let finalStatusType = 'final_completion';
        const remainingInvoices = fakturListLength - finalTotalBerhasil;

        if (finalTotalBerhasil > 0) {
            finalMessage = ` FINAL: ${finalTotalBerhasil} dari ${fakturListLength} faktur berhasil diproses.`;
            if (remainingInvoices > 0) {
                finalMessage += ` (${remainingInvoices} faktur tersisa)`;
            }
            if (finalState === MachineState.STOPPED) {
                finalMessage += ' (Dihentikan oleh user)';
            } else if (finalState === MachineState.ERROR) {
                finalMessage += ' (Selesai dengan error)';
            }
        } else {
            finalMessage = ` FINAL: Proses selesai tanpa faktur yang berhasil diproses. (${remainingInvoices} faktur belum diproses)`;
            if (finalState === MachineState.STOPPED) {
                finalMessage += ' (Dihentikan oleh user)';
                finalStatusType = 'stopped';
            } else if (finalState === MachineState.ERROR) {
                finalMessage += ' (Dengan error)';
                finalStatusType = 'error';
            } else {
                finalStatusType = 'success';
            }
        }

        const extraInfo = [];
        if (notProcessedCount > 0) {
            extraInfo.push(`${notProcessedCount} belum diproses`);
        }
        if (failedCount > 0) {
            extraInfo.push(`${failedCount} gagal`);
        }
        if (notFoundCount > 0) {
            extraInfo.push(`${notFoundCount} tidak ditemukan`);
        }
        if (skippedCount > 0) {
            extraInfo.push(`${skippedCount} dilewati`);
        }
        if (pendingCount > 0) {
            extraInfo.push(`${pendingCount} menunggu`);
        }
        if (extraInfo.length > 0) {
            finalMessage += ` [${extraInfo.join(', ')}]`;
        }

        console.log('Content script: Sending SINGLE final message:', finalMessage);
        // Kirim ringkasan final ke popup; popup yang akan mengelola update kuota sebenarnya
        updateStatus(finalMessage, finalStatusType, finalTotalBerhasil, true, finalTotalBerhasil, fakturListLength);

        //  FAKTUR TRACKING: Generate and send summary report
        const summaryReport = generateFakturSummary();
        updateStatus(summaryReport, 'status', finalTotalBerhasil, true, finalTotalBerhasil, fakturListLength);

        currentState = MachineState.IDLE;
        automationAbortHandler = null;
        forcedLogoutReason = null;
    };

    automationAbortHandler = {
        isProcessing: false,
        async onAbort(reason, context) {
            console.warn(`Content script: Automation abort via ${context}: ${reason}`);
            try {
                const safeReason = sanitizeLogMessage(reason || 'Session berakhir');
                currentState = MachineState.ERROR;
                updateStatus(` ERROR: ${safeReason}. Otomasi dihentikan otomatis untuk keamanan.`, 'error', totalBerhasil, true, totalBerhasil, fakturList.length);
                await finalizeAutomation(MachineState.ERROR, totalBerhasil, fakturList.length);
            } catch (abortError) {
                console.error('Content script: Error saat menyelesaikan abort automation:', abortError);
            }
        }
    };

    startNavigationMonitor();

    try {
        let currentActiveMonthFilter = "ALL";
        const allMonths = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

        for (let i = 0; i < fakturList.length; i++) {
            if (currentState === MachineState.STOPPED) {
                console.log("Content script: Stop flag detected before processing invoice index", i);
                await finalizeAutomation(MachineState.STOPPED, totalBerhasil, fakturList.length);
                break;
            }

            const fakturItem = fakturList[i];
            const faktur = typeof fakturItem === 'object' && fakturItem !== null ? fakturItem.nomor : fakturItem;
            const masaDetails = typeof fakturItem === 'object' && fakturItem !== null
                ? buildMasaDetailsFromInput(fakturItem.masa)
                : null;

            let targetMonthName = "ALL";
            if (automationData.bulanDipilih && automationData.bulanDipilih !== "") {
                targetMonthName = automationData.bulanDipilih;
            } else if (masaDetails?.label) {
                targetMonthName = masaDetails.label;
            }
            processedInvoices++;

            //  QUOTA FIX: Pre-check quota before processing each invoice
            if (quotaInfo && quotaInfo.isFreeUser) {
                const totalUsedNow = (quotaInfo.usedQuota || 0) + processedSuccessCount;
                console.log(`Content script: [QUOTA FIX] Pre-processing quota check for invoice ${processedInvoices}:`, {
                    usedBefore: quotaInfo.usedQuota,
                    processedNow: processedSuccessCount,
                    totalUsedNow: totalUsedNow,
                    maxAllowed: quotaInfo.maxQuota,
                    wouldExceed: totalUsedNow >= quotaInfo.maxQuota
                });

                if (totalUsedNow >= quotaInfo.maxQuota) {
                    console.log(`Content script: [QUOTA FIX]  QUOTA ALREADY REACHED before processing invoice ${processedInvoices}! Stopping.`);
                    updateStatus(` BATAS KUOTA TERCAPAI! Tidak dapat memproses faktur ke-${processedInvoices} karena kuota free (${quotaInfo.maxQuota}) sudah habis. Total berhasil: ${totalBerhasil}`, 'success', totalBerhasil, true, totalUsedNow, quotaInfo.maxQuota);

                    currentState = MachineState.STOPPED;
                    await finalizeAutomation(MachineState.STOPPED, totalBerhasil, fakturList.length);
                    break;
                }
            }

            console.log(`Content script: [QUOTA FIX] Processing invoice ${processedInvoices}/${fakturList.length}: ${faktur} (Success count: ${processedSuccessCount})`);

            // Update session activity
            updateSessionActivity('iteration-start');

            // Check session timeout
            const sessionStatus = checkSessionTimeout();
            if (sessionStatus === 'TIMEOUT') {
                console.error("Content script: Stopping automation due to session timeout");
                currentState = MachineState.ERROR;
                await finalizeAutomation(MachineState.ERROR, totalBerhasil, fakturList.length);
                break;
            } else if (sessionStatus === 'WARNING' && i > 0) {
                // Berikan warning tapi lanjutkan, kecuali jika ini adalah iterasi pertama
                console.warn("Content script: Session warning issued but continuing");
            }

            //  DEBUG: Validasi automationData pada setiap iterasi dengan recovery
            console.log(`Content script: ITERATION ${i + 1}/${fakturList.length} - Invoice: ${faktur}`);
            logAutomationStep("Processing invoice iteration", {
                iteration: i + 1,
                total: fakturList.length,
                faktur,
                processedInvoices
            });

            console.log(`Content script: Validating automationData before processing invoice ${processedInvoices}...`);
            console.log(`Content script: automationData exists:`, !!automationData);
            console.log(`Content script: automationData.bulanDipilih:`, automationData?.bulanDipilih);
            console.log(`Content script: automationData.aksiFinal:`, automationData?.aksiFinal);
            console.log(`Content script: automationData.csvData:`, !!automationData?.csvData);

            //  RECOVERY: Jika automationData hilang, coba pulihkan
            if (!automationData) {
                console.warn(`Content script: automationData lost at iteration ${i + 1}, attempting recovery...`);
                const recovered = loadAutomationData();

                if (!recovered) {
                    const errorMsg = ` FATAL ERROR: automationData hilang secara permanen pada iterasi ${i + 1}! Proses perlu dihentikan dengan ${totalBerhasil} faktur sudah berhasil.`;
                    updateStatus(errorMsg, 'error', totalBerhasil);
                    console.error(`Content script: automationData recovery failed at iteration ${i + 1}:`, automationData);
                    currentState = MachineState.ERROR;
                    //  HUBUNGI FINALIZE untuk update kuota partial sebelum break
                    await finalizeAutomation(MachineState.ERROR, totalBerhasil, fakturList.length);
                    break;
                }

                console.log(`Content script:  automationData recovered at iteration ${i + 1}`);
                updateStatus(`  ->  Data konfigurasi berhasil dipulihkan pada iterasi ${i + 1}`);

                // Save ulang ke persistent storage sebagai backup
                saveAutomationData(recovered);
            }

            if (currentState !== MachineState.RUNNING) {
                console.log("Content script: User stopped the process - notifying popup");
                updateStatus("Proses dihentikan oleh pengguna - menunggu penyelesaian faktur saat ini.", 'stopped', totalBerhasil, false);

                //  FAKTUR TRACKING: Track remaining faktur as skipped due to user stop
                const remainingFaktur = fakturList.slice(i);
                remainingFaktur.forEach(remainingFaktur => {
                    addFakturResult(remainingFaktur, 'SKIPPED', 'Dihentikan oleh pengguna');
                });

                //  HUBUNGI FINALIZE untuk update kuota partial sebelum break
                await finalizeAutomation(MachineState.STOPPED, totalBerhasil, fakturList.length);
                break;
            }

            //  DEBUG: Cek apakah automationData hilang setelah navigasi halaman
            // HATI-HATI: Validasi ini membedakan empty string "" dengan null/undefined
            const isBulanDipilihMissing = automationData.bulanDipilih == null; // null atau undefined saja
            const isAksiFinalMissing = !automationData.aksiFinal;

            if (!automationData || isBulanDipilihMissing || isAksiFinalMissing) {
                const errorMsg = ` FATAL ERROR: automationData hilang pada iterasi ${i + 1}! Proses akan dihentikan dengan ${totalBerhasil} faktur sudah berhasil.`;
                updateStatus(errorMsg, 'error', totalBerhasil);
                console.error(`Content script: automationData lost after iteration ${i + 1}:`);
                console.error(`- automationData exists:`, !!automationData);
                console.error(`- bulanDipilih: "${automationData?.bulanDipilih}" (isMissing: ${isBulanDipilihMissing})`);
                console.error(`- aksiFinal: "${automationData?.aksiFinal}" (isMissing: ${isAksiFinalMissing})`);
                currentState = MachineState.ERROR;
                //  HUBUNGI FINALIZE untuk update kuota partial sebelum break
                await finalizeAutomation(MachineState.ERROR, totalBerhasil, fakturList.length);
                break;
            }

            //  LANGKAH AWAL: SETUP FILTERS SEBELUM MEMPROSES INVOICE PERTAMA
            if (processedInvoices === 1) {
                // Setup filters HANYA untuk invoice pertama - sebelum proses
                console.log("Content script: Setting up filters for first invoice...");

                // Tambahkan klik tombol refresh setelah kembali ke halaman utama (untuk invoice pertama)
                logAutomationStep("Refreshing page for first invoice", { faktur });

                let refreshBerhasil = false;
                try {
                    refreshBerhasil = await klikTombolRefresh();
                } catch (error) {
                    if (error instanceof SessionLogoutError || error instanceof AutomationAbortError) { throw error; }
                    updateStatus(`Gagal me-refresh halaman - ${error.message}. Proses dihentikan.`, "error");
                    console.error("Content script: Page refresh failed with error:", error);
                    logAutomationStep("Page refresh error for first invoice", { error: error.message, faktur });
                    currentState = MachineState.ERROR;
                    await finalizeAutomation(MachineState.ERROR, totalBerhasil, fakturList.length);
                    break;
                }

                if (!refreshBerhasil) {
                    updateStatus("Gagal me-refresh halaman. Proses dihentikan.", "error");
                    console.error("Content script: Page refresh failed");
                    logAutomationStep("Page refresh failed for first invoice", { faktur, refreshBerhasil });
                    currentState = MachineState.ERROR;
                    //  HUBUNGI FINALIZE untuk update kuota partial sebelum break
                    await finalizeAutomation(MachineState.ERROR, totalBerhasil, fakturList.length);
                    break;
                }

                console.log("Content script: Page refresh successful");

                //  LANGKAH BARU: FILTER BULAN UNTUK INVOICE PERTAMA
                console.log("Content script: Setting up month filter for first invoice...");
                updateStatus(`Memeriksa dan mengatur filter bulan (${targetMonthName}) untuk pertama kali...`);
                logAutomationStep("Filtering bulan for first invoice", { faktur, targetMonthName });

                let filterBulanBerhasil = false;
                try {
                    const monthAction = targetMonthName === "ALL"
                        ? () => filterBulan()
                        : () => resetFilterToSelectedMonths([targetMonthName]);
                    filterBulanBerhasil = await retryOperation(monthAction, 3, 3000);
                    currentActiveMonthFilter = targetMonthName;
                } catch (error) {
                    if (error instanceof SessionLogoutError || error instanceof AutomationAbortError) { throw error; }
                    updateStatus(`Gagal mengatur filter bulan - ${error.message}. Proses dihentikan.`, "error");
                    console.error("Content script: Month filter setup failed with error:", error);
                    logAutomationStep("Filter bulan error for first invoice", { error: error.message, faktur });
                    currentState = MachineState.ERROR;
                    await finalizeAutomation(MachineState.ERROR, totalBerhasil, fakturList.length);
                    break;
                }

                if (filterBulanBerhasil) {
                    // LANGKAH BARU: Set filter tahun sesuai konfigurasi user (fallback ke 2025 jika tidak diisi)
                    const targetYear = automationData.tahunDipilih || "2025";
                    console.log(`Content script: Setting year filter to ${targetYear} after successful month selection...`);
                    updateStatus(`  -> Mengatur filter tahun ke ${targetYear}...`);
                    logAutomationStep("Setting year filter from configuration", { faktur, targetYear });

                    try {
                        // Tunggu sebentar agar filter bulan selesai diproses
                        await new Promise(resolve => setTimeout(resolve, 1000));

                        // Set filter tahun sesuai targetYear
                        const filterTahunBerhasil = await filterTahunPajakHeader(targetYear);

                        if (filterTahunBerhasil) {
                            console.log(`Content script: Year filter set to ${targetYear} successfully`);
                            updateStatus(`  ->  Filter tahun ${targetYear} berhasil diterapkan`);
                            logAutomationStep("Year filter applied from configuration", { faktur, targetYear, success: true });
                        } else {
                            console.warn("Content script: Failed to set year filter to 2025, proceeding anyway...");
                            updateStatus("  ->  Gagal mengatur filter tahun, melanjutkan proses...");
                            logAutomationStep("Year filter 2025 failed", { faktur });
                        }
                    } catch (yearFilterError) {
                        console.warn("Content script: Error setting year filter:", yearFilterError);
                        updateStatus("  ->  Gagal mengatur filter tahun, melanjutkan proses...");
                        logAutomationStep("Year filter error", { faktur, error: yearFilterError.message });
                    }

                    // LANGKAH BARU: Ubah dropdown pagination dari 50/250/dll ke 10 (setelah filter tahun)
                    console.log("Content script: Changing pagination dropdown to 10...");
                    updateStatus("  -> Mengubah jumlah baris per halaman ke 10...");
                    logAutomationStep("Changing pagination to 10", { faktur });

                    try {
                        // Cari dropdown pagination - PrimeNG p-dropdown dengan styleclass p-paginator-rpp-options
                        let paginationDropdown = document.querySelector('p-dropdown[styleclass*="paginator-rpp"]');

                        // Fallback selectors
                        if (!paginationDropdown) {
                            paginationDropdown = document.querySelector('.p-paginator p-dropdown') ||
                                document.querySelector('[class*="paginator"] p-dropdown');
                        }

                        if (paginationDropdown) {
                            console.log("Content script:  Found pagination dropdown element");

                            // Log nilai saat ini
                            const currentLabel = paginationDropdown.querySelector('.p-dropdown-label');
                            const currentValue = currentLabel?.textContent?.trim() || 'unknown';
                            console.log(`Content script: Current pagination value: ${currentValue}`);

                            // Jika sudah 10, tidak perlu ubah
                            if (currentValue === '10') {
                                console.log("Content script:  Pagination already set to 10, skipping...");
                                updateStatus("  ->  Pagination sudah 10, skip...");
                            } else {
                                // PERBAIKAN: Klik pada div.p-dropdown di dalam p-dropdown (bukan trigger)
                                // PrimeNG dropdown memerlukan klik pada container utama
                                const dropdownContainer = paginationDropdown.querySelector('div.p-dropdown');

                                if (dropdownContainer) {
                                    console.log("Content script: Clicking dropdown container to open panel...");

                                    // Fokus dulu ke dropdown
                                    const hiddenInput = paginationDropdown.querySelector('input[type="text"]');
                                    if (hiddenInput) {
                                        hiddenInput.focus();
                                        await new Promise(resolve => setTimeout(resolve, 100));
                                    }

                                    // Klik pada container dropdown dengan event yang tepat
                                    dropdownContainer.dispatchEvent(new MouseEvent('mousedown', {
                                        bubbles: true, cancelable: true, view: window, button: 0
                                    }));
                                    await new Promise(resolve => setTimeout(resolve, 50));
                                    dropdownContainer.dispatchEvent(new MouseEvent('mouseup', {
                                        bubbles: true, cancelable: true, view: window, button: 0
                                    }));
                                    await new Promise(resolve => setTimeout(resolve, 50));
                                    dropdownContainer.dispatchEvent(new MouseEvent('click', {
                                        bubbles: true, cancelable: true, view: window, button: 0
                                    }));

                                    // Tunggu dan verifikasi dropdown terbuka
                                    let dropdownOpened = false;
                                    for (let attempt = 0; attempt < 5; attempt++) {
                                        await new Promise(resolve => setTimeout(resolve, 200));

                                        // Cek apakah dropdown sudah terbuka (ada class p-dropdown-open)
                                        if (dropdownContainer.classList.contains('p-dropdown-open')) {
                                            dropdownOpened = true;
                                            console.log(`Content script:  Dropdown opened on attempt ${attempt + 1}`);
                                            break;
                                        }

                                        // Coba klik lagi jika belum terbuka
                                        if (attempt < 4) {
                                            console.log(`Content script: Dropdown not open yet, retry click (attempt ${attempt + 2})...`);
                                            dropdownContainer.click();
                                        }
                                    }

                                    if (dropdownOpened) {
                                        // Dropdown terbuka, cari panel dan item "10"
                                        await new Promise(resolve => setTimeout(resolve, 300));

                                        // Cari panel dropdown - bisa di dalam p-overlay atau langsung di body
                                        let dropdownPanel = document.querySelector('.p-dropdown-panel:not([style*="display: none"])');
                                        if (!dropdownPanel) {
                                            dropdownPanel = document.querySelector('p-overlay .p-dropdown-panel');
                                        }
                                        if (!dropdownPanel) {
                                            // Cari panel yang visible
                                            const allPanels = document.querySelectorAll('.p-dropdown-panel');
                                            for (const panel of allPanels) {
                                                if (panel.offsetWidth > 0 && panel.offsetHeight > 0) {
                                                    dropdownPanel = panel;
                                                    break;
                                                }
                                            }
                                        }

                                        if (dropdownPanel) {
                                            console.log("Content script:  Dropdown panel found");

                                            // Cari item dengan nilai "10"
                                            const items = dropdownPanel.querySelectorAll('.p-dropdown-item, li[role="option"]');
                                            console.log(`Content script: Found ${items.length} dropdown items`);

                                            let found10 = false;
                                            for (const item of items) {
                                                const itemText = item.textContent?.trim();
                                                if (itemText === '10') {
                                                    console.log("Content script:  Found option 10, clicking...");

                                                    // Klik item
                                                    item.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
                                                    await new Promise(resolve => setTimeout(resolve, 50));
                                                    item.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
                                                    await new Promise(resolve => setTimeout(resolve, 50));
                                                    item.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

                                                    found10 = true;
                                                    await new Promise(resolve => setTimeout(resolve, 1500)); // Tunggu data reload

                                                    // Verifikasi perubahan
                                                    const newValue = paginationDropdown.querySelector('.p-dropdown-label')?.textContent?.trim();
                                                    if (newValue === '10') {
                                                        console.log("Content script:  Pagination successfully changed to 10!");
                                                        updateStatus("  ->  Berhasil mengubah ke 10 baris per halaman");
                                                    } else {
                                                        console.log(`Content script: Pagination value after click: ${newValue}`);
                                                        updateStatus(`  ->  Pagination diubah ke ${newValue}`);
                                                    }
                                                    break;
                                                }
                                            }

                                            if (!found10) {
                                                console.warn("Content script: Option 10 not found in dropdown");
                                                updateStatus("  ->  Opsi 10 tidak ditemukan, melanjutkan...");
                                                // Tutup dropdown
                                                document.body.click();
                                            }
                                        } else {
                                            console.warn("Content script: Dropdown panel not found after opening");
                                            updateStatus("  ->  Panel dropdown tidak ditemukan, melanjutkan...");
                                        }
                                    } else {
                                        console.warn("Content script: Failed to open dropdown after 5 attempts");
                                        updateStatus("  ->  Gagal membuka dropdown, melanjutkan...");
                                    }
                                } else {
                                    console.warn("Content script: Dropdown container (div.p-dropdown) not found");
                                    updateStatus("  ->  Container dropdown tidak ditemukan, melanjutkan...");
                                }
                            }
                        } else {
                            console.warn("Content script: Pagination dropdown element not found");
                            updateStatus("  ->  Dropdown pagination tidak ditemukan, melanjutkan...");
                        }
                    } catch (paginationError) {
                        console.warn("Content script: Error changing pagination:", paginationError);
                        updateStatus("  ->  Gagal mengubah pagination, melanjutkan...");
                        // Non-fatal, lanjutkan proses
                    }
                }

                if (!filterBulanBerhasil) {
                    //  PERBAIKAN: Coba pendekatan alternatif sebelum berhenti total
                    updateStatus(" Filter bulan gagal, mencoba pendekatan alternatif...", "warning");
                    console.warn("Content script: Month filter failed for first invoice, trying alternative approach");

                    // Coba skip filter bulan dan lanjutkan ke filter nomor faktur langsung
                    try {
                        updateStatus("  -> Mencoba skip filter bulan, langsung ke filter nomor faktur...");
                        await new Promise(resolve => setTimeout(resolve, 2000));

                        // Test jika filter nomor faktur bisa diakses langsung
                        const filterFakturElement = await waitForElementSmart('#filterTaxInvoiceNumber', 3000);
                        if (filterFakturElement) {
                            updateStatus("  ->  Filter nomor faktur ditemukan, melanjutkan tanpa filter bulan...");
                            filterBulanBerhasil = true; // Set true untuk melanjutkan proses
                        } else {
                            updateStatus(" Filter nomor faktur juga tidak ditemukan. Proses dihentikan.", "error");
                            console.error("Content script: Both month and invoice filters failed for first invoice");
                            logAutomationStep("All filters failed for first invoice", { faktur });
                            currentState = MachineState.ERROR;
                            await finalizeAutomation(MachineState.ERROR, totalBerhasil, fakturList.length);
                            break;
                        }
                    } catch (altError) {
                        if (altError instanceof SessionLogoutError) { throw altError; }
                        updateStatus(" Pendekatan alternatif gagal. Proses dihentikan.", "error");
                        console.error("Content script: Alternative approach failed for first invoice:", altError);
                        currentState = MachineState.ERROR;
                        await finalizeAutomation(MachineState.ERROR, totalBerhasil, fakturList.length);
                        break;
                    }
                }

                //  FILTER BULAN BERHASIL - SIAP LANJUT KE CLEAR FILTER DAN NOMOR FAKTUR
                // (Remove duplicate status update to avoid double logging)
                console.log("Content script:  MONTH FILTER COMPLETED - ready for clear filter and nomor faktur filtering");

                //  LANGKAH LANJUTAN: FILTER NOMOR FAKTUR UNTUK INVOICE PERTAMA
                console.log("Content script:  PROCEEDING TO INVOICE NUMBER FILTER for first invoice...");
                updateStatus(" Memeriksa dan mengatur filter nomor faktur untuk pertama kali...");
                logAutomationStep("Filtering nomor faktur for first invoice", { faktur });

                let filterNomorBerhasil = false;
                try {
                    filterNomorBerhasil = await retryOperation(() => filterNomorFaktur(faktur), 3, 2000);
                } catch (error) {
                    if (error instanceof SessionLogoutError || error instanceof AutomationAbortError) { throw error; }
                    updateStatus(`Gagal mengatur filter nomor faktur - ${error.message}. Proses dihentikan.`, "error");
                    console.error("Content script: Invoice number filter setup failed with error:", error);
                    logAutomationStep("Filter nomor faktur error for first invoice", { error: error.message, faktur });
                    currentState = MachineState.ERROR;
                    await finalizeAutomation(MachineState.ERROR, totalBerhasil, fakturList.length);
                    break;
                }

                if (!filterNomorBerhasil) {
                    updateStatus("Gagal mengatur filter nomor faktur. Proses dihentikan.", "error");
                    console.error("Content script: Invoice number filter setup failed");
                    logAutomationStep("Filter nomor faktur failed for first invoice", { faktur, filterNomorBerhasil });
                    currentState = MachineState.ERROR;
                    //  HUBUNGI FINALIZE untuk update kuota partial sebelum break
                    await finalizeAutomation(MachineState.ERROR, totalBerhasil, fakturList.length);
                    break;
                }

                updateStatus("  ->  Setup filter selesai untuk faktur pertama");

                //  CRITICAL FIX: SEKARANG LANGSUNG PROSES FAKTUR INI!
                updateStatus(` Filter berhasil! Memproses faktur: ${faktur}...`, 'status', totalBerhasil, false, totalBerhasil, fakturList.length);
                console.log(`Content script:  IMMEDIATE ACTION: Processing first invoice ${faktur}...`);
                logAutomationStep("Processing first faktur", { faktur });

                activeFaktur = faktur;
                let firstInvoiceRetryCount = 0;
                let hasilProsesPertama = "FAILED";
                while (true) {
                    try {
                        hasilProsesPertama = await prosesSatuFaktur(faktur, automationData.bulanDipilih, automationData.tahunDipilih, automationData.aksiFinal);
                    } catch (error) {
                        if (error instanceof SessionLogoutError || error instanceof AutomationAbortError) { throw error; }
                        updateStatus(`ERROR: Gagal memproses faktur pertama ${faktur} - ${error.message}`, 'error');
                        console.error(`Content script: Error processing first faktur ${faktur}:`, error);
                        logAutomationStep("First faktur processing error", { faktur, error: error.message, stack: error.stack });
                        hasilProsesPertama = "FAILED";
                    }
                    const serverOutcome = await handleServerErrorAfterInvoice(faktur, totalBerhasil, fakturList.length);
                    if (serverOutcome.action === 'stop') {
                        currentState = MachineState.ERROR;
                        await finalizeAutomation(MachineState.ERROR, totalBerhasil, fakturList.length);
                        return;
                    }
                    if (serverOutcome.action === 'retry' && firstInvoiceRetryCount < 1) {
                        firstInvoiceRetryCount++;
                        console.log(`Content script: [SERVER ERROR] Retrying first invoice ${faktur} after 502 response (attempt ${firstInvoiceRetryCount + 1})`);
                        continue;
                    }
                    break;
                }
                activeFaktur = null;
                if (hasilProsesPertama === "SUCCESS") {
                    totalBerhasil++;
                    delete badGatewayRetryTracker[faktur];
                    processedSuccessCount++; //  QUOTA FIX: Track first invoice success

                    updateStatus(`  ->  SUKSES memproses faktur ${faktur}. Progress: ${totalBerhasil}/${processedInvoices}`, 'status', totalBerhasil, false, totalBerhasil, fakturList.length);
                    updateStatus(` UI diperbarui: ${fakturList.length - totalBerhasil}/${fakturList.length} kuota tersisa`, 'status', totalBerhasil, false, totalBerhasil, fakturList.length);
                    console.log(`Content script:  FIRST INVOICE SUCCESS: ${faktur} processed, ready for next iteration`);

                    //  QUOTA FIX: Check quota for first invoice too
                    if (quotaInfo && quotaInfo.isFreeUser) {
                        const maxAllowed = quotaInfo.maxQuota;
                        const totalUsedNow = (quotaInfo.usedQuota || 0) + processedSuccessCount;

                        console.log(`Content script: [QUOTA FIX] First invoice quota check:`, {
                            usedBefore: quotaInfo.usedQuota,
                            processedNow: processedSuccessCount,
                            totalUsedNow: totalUsedNow,
                            maxAllowed: maxAllowed,
                            shouldStop: totalUsedNow >= maxAllowed
                        });

                        if (totalUsedNow >= maxAllowed) {
                            console.log(`Content script: [QUOTA FIX]  QUOTA LIMIT REACHED on first invoice! Stopping automation.`);
                            updateStatus(` BATAS KUOTA TERCAPAI! Proses dihentikan karena kuota free (${maxAllowed}) sudah habis. Total berhasil: ${totalBerhasil}`, 'success', totalBerhasil, true, totalUsedNow, maxAllowed);

                            //  FAKTUR TRACKING: Track remaining faktur as skipped due to quota
                            const remainingFaktur = fakturList.slice(i);
                            remainingFaktur.forEach(remainingFaktur => {
                                addFakturResult(remainingFaktur, 'SKIPPED', 'Kuota habis');
                            });

                            currentState = MachineState.STOPPED;
                            await finalizeAutomation(MachineState.STOPPED, totalBerhasil, fakturList.length);
                            break;
                        }
                    }
                } else if (hasilProsesPertama === "SKIPPED") {
                    // RETRY DENGAN TAHUN ALTERNATIF: Jika faktur tidak ditemukan di tahun awal, coba cari di tahun lainnya
                    const initialYear = automationData.tahunDipilih || "2025";
                    const alternateYear = initialYear === "2026" ? "2025" : "2026";

                    console.log(`Content script: First invoice ${faktur} not found with year ${initialYear}, trying year ${alternateYear}...`);
                    updateStatus(`  ->  Faktur ${faktur} tidak ditemukan di tahun ${initialYear}, mencoba tahun ${alternateYear}...`, 'status', totalBerhasil, false, totalBerhasil, fakturList.length);
                    logAutomationStep("Retrying with alternate year", { faktur, initialYear, alternateYear });

                    try {
                        // Set filter tahun ke tahun alternatif
                        const filterTahunAlternateBerhasil = await filterTahunPajakHeader(alternateYear);

                        if (filterTahunAlternateBerhasil) {
                            console.log(`Content script: Year filter set to ${alternateYear} for retry`);
                            updateStatus(`  ->  Filter tahun diubah ke ${alternateYear}, mencari ulang...`);


                            // Wait for filter to apply
                            await new Promise(resolve => setTimeout(resolve, 1000));

                            // Re-apply nomor faktur filter
                            await retryOperation(() => filterNomorFaktur(faktur), 2, 2000);

                            // Retry proses faktur
                            const hasilRetryAlternate = await prosesSatuFaktur(faktur, automationData.bulanDipilih, automationData.tahunDipilih, automationData.aksiFinal);

                            if (hasilRetryAlternate === "SUCCESS") {
                                totalBerhasil++;
                                delete badGatewayRetryTracker[faktur];
                                processedSuccessCount++;
                                updateStatus(`  ->  SUKSES memproses faktur ${faktur} dengan tahun ${alternateYear}. Progress: ${totalBerhasil}/${processedInvoices}`, 'status', totalBerhasil, false, totalBerhasil, fakturList.length);
                                console.log(`Content script:  FIRST INVOICE SUCCESS with year ${alternateYear}: ${faktur}`);
                                logAutomationStep("First invoice success with alternate year", { faktur, alternateYear });
                            } else if (hasilRetryAlternate === "SKIPPED") {
                                updateStatus(`  -> [SKIP] Faktur ${faktur} tidak ditemukan di tahun ${initialYear} maupun ${alternateYear}, skip.`, 'status', totalBerhasil, false, totalBerhasil, fakturList.length);
                                console.log(`Content script:  FIRST INVOICE SKIPPED: ${faktur} not found in ${initialYear} or ${alternateYear}`);
                                delete badGatewayRetryTracker[faktur];
                                logAutomationStep("First invoice not found in both years", { faktur, initialYear, alternateYear });
                            } else {
                                updateStatus(`  ->  GAGAL memproses faktur ${faktur} dengan tahun ${alternateYear}.`, 'status', totalBerhasil, false, totalBerhasil, fakturList.length);
                                console.log(`Content script:  FIRST INVOICE FAILED with year ${alternateYear}: ${faktur}`);
                                delete badGatewayRetryTracker[faktur];
                            }

                            // Reset filter tahun kembali ke tahun awal untuk faktur berikutnya
                            console.log(`Content script: Resetting year filter back to ${initialYear} for next invoice...`);
                            await filterTahunPajakHeader(initialYear);
                        } else {
                            // Jika gagal set filter tahun alternatif, skip saja
                            updateStatus(`  -> [SKIP] Faktur ${faktur} tidak ditemukan, skip.`, 'status', totalBerhasil, false, totalBerhasil, fakturList.length);
                            console.log(`Content script:  FIRST INVOICE SKIPPED: ${faktur} not found (failed to set year ${alternateYear} filter)`);
                            delete badGatewayRetryTracker[faktur];
                        }
                    } catch (retryError) {
                        console.warn(`Content script: Error during year ${alternateYear} retry:`, retryError);
                        updateStatus(`  -> [SKIP] Faktur ${faktur} tidak ditemukan, skip.`, 'status', totalBerhasil, false, totalBerhasil, fakturList.length);
                        console.log(`Content script:  FIRST INVOICE SKIPPED: ${faktur} not found`);
                        delete badGatewayRetryTracker[faktur];
                        logAutomationStep("Alternate year retry error", { faktur, alternateYear, error: retryError.message });
                    }

                } else {
                    updateStatus(`  ->  GAGAL memproses faktur ${faktur}, melanjutkan ke faktur berikutnya.`, 'status', totalBerhasil, false, totalBerhasil, fakturList.length);
                    console.log(`Content script:  FIRST INVOICE FAILED: ${faktur} processing failed`);
                    delete badGatewayRetryTracker[faktur];
                }

                console.log(`Content script:  COMPLETED FIRST INVOICE iteration for faktur ${faktur} (Success: ${totalBerhasil}/${processedInvoices})`);

                continue; // Skip ke iterasi berikutnya setelah memproses invoice pertama
            }

            updateStatus(`Memproses faktur ${processedInvoices}/${fakturList.length}: ${faktur}...`, 'status', totalBerhasil, false, totalBerhasil, fakturList.length);

            activeFaktur = faktur;

            // PERBAIKAN: NAVIGASI KEMBALI KE HALAMAN PAJAK MASUKAN DULU
            // Ini penting karena setelah first invoice diproses, kita masih di halaman detail
            console.log("Content script:  NAVIGATING BACK to Pajak Masukan page before processing next invoice...");
            updateStatus("  -> Kembali ke halaman Pajak Masukan...");

            let kembaliBerhasilAfterFirst = false;
            try {
                kembaliBerhasilAfterFirst = await kembaliKeHalamanUtama();
            } catch (navError) {
                if (navError instanceof SessionLogoutError) { throw navError; }
                console.error("Content script: Navigation back after first invoice failed:", navError);
            }

            if (!kembaliBerhasilAfterFirst) {
                updateStatus("  -> Warning: Gagal kembali ke halaman utama, mencoba lanjut...", "warning");
                console.warn("Content script: Navigation back after first invoice failed, trying to continue...");
            } else {
                console.log("Content script:  Navigation back successful after first invoice");
            }

            // Refresh halaman dengan retry
            console.log("Content script: Refreshing page after navigation...");
            updateStatus("  -> Menyegarkan halaman...");
            try {
                const refreshOk = await retryOperation(() => clickRefreshButton(), 3, 2000);
                if (refreshOk) {
                    console.log("Content script:  Refresh successful");
                    await new Promise(resolve => setTimeout(resolve, turboDelay(1000, 0.06))); // Tunggu refresh selesai
                } else {
                    console.warn("Content script: Refresh returned false");
                }
            } catch (refreshError) {
                console.warn("Content script: Refresh failed, continuing...", refreshError);
            }

            // Tunggu halaman siap sepenuhnya setelah refresh
            console.log("Content script: Waiting for page to be ready after refresh...");
            updateStatus("  -> Menunggu halaman siap...");
            await new Promise(resolve => setTimeout(resolve, turboDelay(2000, 0.06))); // Tunggu 2 detik

            try {
                await waitForPageReady();
            } catch (waitError) {
                console.warn("Content script: waitForPageReady error, continuing...", waitError);
            }

            // Setup filter bulan - SAMA SEPERTI PROSES PERTAMA
            console.log("Content script: Setting up month filter after returning...");
            updateStatus("  -> Memeriksa dan mengatur filter bulan...");

            // --- PERBAIKAN START: Gunakan filterBulan() yang identik dengan Invoice Pertama ---
            let filterBulanBerhasilAfterFirst = false;
            try {
                // Tambahkan delay awal yang lebih panjang untuk memastikan DOM benar-benar siap setelah refresh
                await new Promise(resolve => setTimeout(resolve, turboDelay(1500, 0.06)));

                updateStatus(`  -> Mengatur filter bulan menjadi ${targetMonthName}...`);
                const monthAction = targetMonthName === "ALL"
                    ? () => filterBulan()
                    : () => resetFilterToSelectedMonths([targetMonthName]);
                filterBulanBerhasilAfterFirst = await retryOperation(monthAction, 3, 3000);
                currentActiveMonthFilter = targetMonthName;

                if (filterBulanBerhasilAfterFirst) {
                    console.log("Content script:  Month filter setup successful");
                    updateStatus("  -> SUKSES: Filter bulan berhasil diterapkan");
                    await new Promise(resolve => setTimeout(resolve, turboDelay(1000, 0.06)));
                } else {
                    console.warn("Content script: Month filter setup returned false (using filterBulan).");
                }
            } catch (monthFilterError) {
                console.warn("Content script: Month filter setup failed:", monthFilterError);
                // Jangan lakukan retry manual memanggil filterBulanNatural.
                // Jika filterBulan gagal, kita lanjutkan ke langkah berikutnya (alternative approach)
                // agar skrip tidak tersangkut di loop error UI yang tidak pernah selesai.
            }
            // --- PERBAIKAN END ---

            // Log hasil filter bulan
            if (!filterBulanBerhasilAfterFirst) {
                console.warn("Content script: Month filter may not have applied correctly, continuing anyway...");
            }

            // Set filter tahun ke 2025
            console.log("Content script: Setting year filter to 2025...");
            updateStatus("  -> Memastikan filter tahun di-set ke 2025...");
            try {
                const filterTahunOk = await filterTahunPajakHeader(automationData.tahunDipilih || "2025");
                if (filterTahunOk) {
                    console.log("Content script:  Year filter 2025 confirmed");
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            } catch (yearFilterError) {
                console.warn("Content script: Error setting year filter:", yearFilterError);
            }

            // LANGKAH BARU: Klik tombol refresh setelah filter bulan dan tahun, sebelum filter nomor faktur
            console.log("Content script: Clicking refresh button after filter setup...");
            updateStatus("  -> Klik tombol refresh untuk memuat data...");
            try {
                const refreshAfterFilterOk = await klikTombolRefresh();
                if (refreshAfterFilterOk) {
                    console.log("Content script:  Refresh button clicked successfully after filter setup");
                    await new Promise(resolve => setTimeout(resolve, 1500)); // Tunggu data ter-load
                } else {
                    console.warn("Content script: Refresh button click returned false, continuing...");
                }
            } catch (refreshAfterFilterError) {
                console.warn("Content script: Error clicking refresh button after filter:", refreshAfterFilterError);
                // Non-fatal, continue anyway
            }

            // Apply filter nomor faktur yang baru
            console.log(`Content script: Applying invoice number filter for: ${faktur}`);
            updateStatus(`  -> Mengatur filter nomor faktur: ${faktur}...`);
            let filterNomorBerhasil = false;
            try {
                filterNomorBerhasil = await retryOperation(() => filterNomorFaktur(faktur), 3, 2000);
                if (filterNomorBerhasil) {
                    console.log(`Content script:  Invoice number filter applied for: ${faktur}`);
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            } catch (filterError) {
                console.warn("Content script: Error applying invoice filter:", filterError);
            }

            //  ENHANCED ERROR HANDLING: Wrap prosesSatuFaktur dengan try-catch
            let hasil = "FAILED";
            try {
                logAutomationStep("Starting faktur processing", { faktur, bulan: automationData.bulanDipilih, tahun: automationData.tahunDipilih, aksi: automationData.aksiFinal });
                hasil = await prosesSatuFaktur(faktur, automationData.bulanDipilih, automationData.tahunDipilih, automationData.aksiFinal);
                logAutomationStep("Faktur processing completed", { faktur, hasil });
            } catch (error) {
                if (error instanceof SessionLogoutError || error instanceof AutomationAbortError) { throw error; }
                updateStatus(`  ->  ERROR: Gagal memproses faktur ${faktur} - ${error.message}`, 'error');
                console.error(`Content script: Error processing faktur ${faktur}:`, error);
                logAutomationStep("Faktur processing error", { faktur, error: error.message, stack: error.stack });
                hasil = "FAILED";
            }

            const serverOutcome = await handleServerErrorAfterInvoice(faktur, totalBerhasil, fakturList.length);
            if (serverOutcome.action === 'stop') {
                currentState = MachineState.ERROR;
                await finalizeAutomation(MachineState.ERROR, totalBerhasil, fakturList.length);
                return;
            }
            if (serverOutcome.action === 'retry') {
                processedInvoices--;
                i--;
                activeFaktur = null;
                continue;
            }
            activeFaktur = null;


            if (hasil === "SUCCESS") {
                totalBerhasil++;
                processedSuccessCount++; //  QUOTA FIX: Track successful count

                //  QUOTA FIX: Real-time quota checking after each successful invoice
                console.log(`Content script: [QUOTA FIX] SUCCESS! totalBerhasil: ${totalBerhasil}, processedSuccessCount: ${processedSuccessCount}`);

                updateStatus(`  ->  SUKSES memproses faktur ${faktur}. Progress: ${totalBerhasil}/${processedInvoices}`, 'status', totalBerhasil, false, totalBerhasil, fakturList.length);
                updateStatus(` UI diperbarui: ${fakturList.length - totalBerhasil}/${fakturList.length} kuota tersisa`, 'status', totalBerhasil, false, totalBerhasil, fakturList.length);
                console.log(`Content script: Invoice ${faktur} processed successfully (${totalBerhasil}/${processedInvoices})`);

                //  QUOTA FIX: Check if quota limit reached for free users
                if (quotaInfo && quotaInfo.isFreeUser) {
                    const maxAllowed = quotaInfo.maxQuota; // Should be 15 for free users
                    const totalUsedNow = (quotaInfo.usedQuota || 0) + processedSuccessCount;

                    console.log(`Content script: [QUOTA FIX] Free user quota check:`, {
                        usedBefore: quotaInfo.usedQuota,
                        processedNow: processedSuccessCount,
                        totalUsedNow: totalUsedNow,
                        maxAllowed: maxAllowed,
                        shouldStop: totalUsedNow >= maxAllowed
                    });

                    if (totalUsedNow >= maxAllowed) {
                        console.log(`Content script: [QUOTA FIX]  QUOTA LIMIT REACHED! Stopping automation for free user.`);
                        updateStatus(` BATAS KUOTA TERCAPAI! Proses dihentikan karena kuota free (${maxAllowed}) sudah habis. Total berhasil: ${totalBerhasil}`, 'success', totalBerhasil, true, totalUsedNow, maxAllowed);

                        //  FAKTUR TRACKING: Track remaining faktur as skipped due to quota
                        const remainingFaktur = fakturList.slice(i);
                        remainingFaktur.forEach(remainingFaktur => {
                            addFakturResult(remainingFaktur, 'SKIPPED', 'Kuota habis');
                        });

                        // Set state to stop processing
                        currentState = MachineState.STOPPED;
                        console.log(`Content script: [QUOTA FIX] State changed to STOPPED due to quota limit`);

                        // Force finalize automation with quota limit reason
                        await finalizeAutomation(MachineState.STOPPED, totalBerhasil, fakturList.length);
                        break; // Exit the main processing loop
                    }
                }
            } else if (hasil === "SKIPPED") {
                // RETRY DENGAN TAHUN 2026: Untuk subsequent invoices, filter SELALU dimulai dengan 2025, jadi retry SELALU dengan 2026
                console.log(`Content script: Invoice ${faktur} not found with year 2025, trying year 2026...`);
                updateStatus(`  ->  Faktur ${faktur} tidak ditemukan di tahun 2025, mencoba tahun 2026...`, 'status', totalBerhasil, false, totalBerhasil, fakturList.length);
                logAutomationStep("Retrying subsequent invoice with year 2026", { faktur });

                try {
                    // Set filter tahun ke 2026
                    const filterTahun2026Berhasil = await filterTahunPajakHeader(alternateYear);

                    if (filterTahun2026Berhasil) {
                        console.log("Content script: Year filter set to 2026 for retry");
                        updateStatus("  ->  Filter tahun diubah ke 2026, mencari ulang...");

                        // Wait for filter to apply
                        await new Promise(resolve => setTimeout(resolve, 1000));

                        // Re-apply nomor faktur filter
                        await retryOperation(() => filterNomorFaktur(faktur), 2, 2000);

                        // Retry proses faktur dengan tahun 2026
                        const hasilRetry2026 = await prosesSatuFaktur(faktur, automationData.bulanDipilih, alternateYear, automationData.aksiFinal);

                        if (hasilRetry2026 === "SUCCESS") {
                            totalBerhasil++;
                            processedSuccessCount++;
                            updateStatus(`  ->  SUKSES memproses faktur ${faktur} dengan tahun ${alternateYear}. Progress: ${totalBerhasil}/${processedInvoices}`, 'status', totalBerhasil, false, totalBerhasil, fakturList.length);
                            console.log(`Content script:  SUCCESS with year ${alternateYear}: ${faktur}`);
                            logAutomationStep("Invoice success with alternate year", { faktur });

                            //  QUOTA FIX: Check quota limit after success with 2026
                            if (quotaInfo && quotaInfo.isFreeUser) {
                                const maxAllowed = quotaInfo.maxQuota;
                                const totalUsedNow = (quotaInfo.usedQuota || 0) + processedSuccessCount;

                                if (totalUsedNow >= maxAllowed) {
                                    console.log(`Content script: [QUOTA FIX]  QUOTA LIMIT REACHED after year 2026 retry! Stopping automation.`);
                                    updateStatus(` BATAS KUOTA TERCAPAI! Proses dihentikan karena kuota free (${maxAllowed}) sudah habis. Total berhasil: ${totalBerhasil}`, 'success', totalBerhasil, true, totalUsedNow, maxAllowed);

                                    const remainingFaktur = fakturList.slice(i + 1);
                                    remainingFaktur.forEach(rf => {
                                        addFakturResult(rf, 'SKIPPED', 'Kuota habis');
                                    });

                                    currentState = MachineState.STOPPED;
                                    await finalizeAutomation(MachineState.STOPPED, totalBerhasil, fakturList.length);
                                    // Reset filter tahun ke 2025 sebelum exit
                                    try { await filterTahunPajakHeader(automationData.tahunDipilih || "2025"); } catch (e) { /* ignore */ }
                                    break;
                                }
                            }
                        } else if (hasilRetry2026 === "SKIPPED") {
                            updateStatus(`  -> [SKIP] Faktur ${faktur} tidak ditemukan di tahun ${initialYear} maupun ${alternateYear}, skip.`, 'status', totalBerhasil, false, totalBerhasil, fakturList.length);
                            console.log(`Content script:  SKIPPED: ${faktur} not found in ${initialYear} or ${alternateYear}`);
                            logAutomationStep("Invoice not found in both years", { faktur });
                        } else {
                            updateStatus(`  ->  GAGAL memproses faktur ${faktur} dengan tahun ${alternateYear}.`, 'status', totalBerhasil, false, totalBerhasil, fakturList.length);
                            console.log(`Content script:  FAILED with year ${alternateYear}: ${faktur}`);
                            logAutomationStep("Invoice failed with year 2026", { faktur });
                        }

                        // Reset filter tahun kembali ke 2025 untuk faktur berikutnya
                        console.log("Content script: Resetting year filter back to 2025 for next invoice...");
                        try {
                            await filterTahunPajakHeader(automationData.tahunDipilih || "2025");
                        } catch (resetError) {
                            console.warn("Content script: Failed to reset year filter to 2025:", resetError);
                        }
                    } else {
                        // Jika gagal set filter tahun 2026, skip saja
                        updateStatus(`  -> [SKIP] Faktur ${faktur} tidak ditemukan, skip.`, 'status', totalBerhasil, false, totalBerhasil, fakturList.length);
                        console.log(`Content script:  SKIPPED: ${faktur} not found (failed to set year 2026 filter)`);
                        logAutomationStep("Alternate year filter failed", { faktur });
                    }
                } catch (retryError) {
                    if (retryError instanceof SessionLogoutError) { throw retryError; }
                    console.warn("Content script: Error during year 2026 retry:", retryError);
                    updateStatus(`  -> [SKIP] Faktur ${faktur} tidak ditemukan, skip.`, 'status', totalBerhasil, false, totalBerhasil, fakturList.length);
                    console.log(`Content script:  SKIPPED: ${faktur} not found (year 2026 retry error)`);
                    logAutomationStep("Year 2026 retry error", { faktur, error: retryError.message });

                    // Reset filter tahun ke 2025 untuk faktur berikutnya
                    try {
                        await filterTahunPajakHeader(automationData.tahunDipilih || "2025");
                    } catch (e) { /* ignore */ }
                }


            } else {

                updateStatus(`  ->  GAGAL memproses faktur ${faktur}, tetapi melanjutkan ke faktur berikutnya.`, 'status', totalBerhasil, false, totalBerhasil, fakturList.length);
                console.log(`Content script: Invoice ${faktur} failed, continuing to next invoice`);
                logAutomationStep("Faktur processing failed", { faktur, hasil });
            }
            delete badGatewayRetryTracker[faktur];

            if (currentState !== MachineState.RUNNING) {
                //  HUBUNGI FINALIZE untuk update kuota partial sebelum break
                await finalizeAutomation(MachineState.STOPPED, totalBerhasil, fakturList.length);
                break;
            }

            // PERBAIKAN: Skip ke iterasi berikutnya setelah proses faktur selesai
            // Ini mencegah eksekusi blok kedua yang menyebabkan duplikasi proses
            console.log(`Content script:  Faktur ${faktur} sudah diproses, skip ke iterasi berikutnya...`);
            continue;

            // === BLOK BERIKUT TIDAK AKAN DIEKSEKUSI (deprecated/legacy code) ===
            //  NAVIGASI: Kembali ke halaman utama dengan retry mechanism
            console.log(`Content script: Preparing to navigate back to main page for next invoice...`);
            logAutomationStep("Navigating back to main page", { faktur, iteration: i + 1 });

            let kembaliBerhasil = false;
            try {
                kembaliBerhasil = await kembaliKeHalamanUtama();
            } catch (error) {
                if (error instanceof SessionLogoutError || error instanceof AutomationAbortError) { throw error; }
                updateStatus(`Gagal kembali ke halaman utama - ${error.message}. Proses dihentikan.`, "error");
                console.error("Content script: Navigation back to main page failed with error:", error);
                logAutomationStep("Navigation error", { error: error.message, faktur });
                currentState = MachineState.ERROR;
                await finalizeAutomation(MachineState.ERROR, totalBerhasil, fakturList.length);
                break;
            }

            if (!kembaliBerhasil) {
                updateStatus("Gagal kembali ke halaman utama. Proses dihentikan.", "error");
                console.error("Content script: Navigation back to main page failed");
                logAutomationStep("Navigation failed", { faktur, kembaliBerhasil });
                currentState = MachineState.ERROR;
                //  HUBUNGI FINALIZE untuk update kuota partial sebelum break
                await finalizeAutomation(MachineState.ERROR, totalBerhasil, fakturList.length);
                break;
            }

            console.log("Content script: Navigation back to main page successful");
            logAutomationStep("Navigation successful", { faktur });

            //  DEBUG: Validasi automationData setelah navigasi (sebelum refresh) dengan RECOVERY
            // HATI-HATI: Membedakan empty string "" dengan null/undefined
            const isBulanDipilihMissingAfterNav = automationData.bulanDipilih == null;
            const isAksiFinalMissingAfterNav = !automationData.aksiFinal;

            if (!automationData || isBulanDipilihMissingAfterNav || isAksiFinalMissingAfterNav) {
                console.warn("Content script: automationData lost after navigation, attempting recovery...");
                const recovered = loadAutomationData();

                if (!recovered) {
                    const errorMsg = ` FATAL ERROR: automationData hilang setelah navigasi dan tidak dapat dipulihkan! Proses akan dihentikan dengan ${totalBerhasil} faktur sudah berhasil.`;
                    updateStatus(errorMsg, 'error', totalBerhasil);
                    console.error("Content script: automationData recovery failed after navigation:", automationData);
                    currentState = MachineState.ERROR;
                    //  HUBUNGI FINALIZE untuk update kuota partial sebelum break
                    await finalizeAutomation(MachineState.ERROR, totalBerhasil, fakturList.length);
                    break;
                }

                console.log("Content script:  automationData recovered after navigation");
                updateStatus("  ->  Data konfigurasi berhasil dipulihkan setelah navigasi");
            }

            // Tambahkan klik tombol refresh setelah kembali ke halaman utama
            console.log("Content script: Refreshing page after navigation...");
            logAutomationStep("Refreshing page", { faktur, iteration: i + 1 });

            let refreshBerhasil = false;
            try {
                refreshBerhasil = await klikTombolRefresh();
            } catch (error) {
                if (error instanceof SessionLogoutError || error instanceof AutomationAbortError) { throw error; }
                updateStatus(`Gagal me-refresh halaman - ${error.message}. Proses dihentikan.`, "error");
                console.error("Content script: Page refresh failed with error:", error);
                logAutomationStep("Page refresh error", { error: error.message, faktur });
                currentState = MachineState.ERROR;
                await finalizeAutomation(MachineState.ERROR, totalBerhasil, fakturList.length);
                break;
            }

            if (!refreshBerhasil) {
                updateStatus("Gagal me-refresh halaman. Proses dihentikan.", "error");
                console.error("Content script: Page refresh failed");
                logAutomationStep("Page refresh failed", { faktur, refreshBerhasil });
                currentState = MachineState.ERROR;
                //  HUBUNGI FINALIZE untuk update kuota partial sebelum break
                await finalizeAutomation(MachineState.ERROR, totalBerhasil, fakturList.length);
                break;
            }

            console.log("Content script: Page refresh successful");
            logAutomationStep("Page refresh successful", { faktur });

            //  DEBUG: Validasi automationData setelah refresh (sebelum filter) dengan RECOVERY
            // HATI-HATI: Membedakan empty string "" dengan null/undefined
            const isBulanDipilihMissingAfterRefresh = automationData.bulanDipilih == null;
            const isAksiFinalMissingAfterRefresh = !automationData.aksiFinal;

            if (!automationData || isBulanDipilihMissingAfterRefresh || isAksiFinalMissingAfterRefresh) {
                console.warn("Content script: automationData lost after refresh, attempting recovery...");
                const recovered = loadAutomationData();

                if (!recovered) {
                    const errorMsg = ` FATAL ERROR: automationData hilang setelah refresh dan tidak dapat dipulihkan! Proses akan dihentikan dengan ${totalBerhasil} faktur sudah berhasil.`;
                    updateStatus(errorMsg, 'error', totalBerhasil);
                    console.error("Content script: automationData recovery failed after refresh:", automationData);
                    currentState = MachineState.ERROR;
                    //  HUBUNGI FINALIZE untuk update kuota partial sebelum break
                    await finalizeAutomation(MachineState.ERROR, totalBerhasil, fakturList.length);
                    break;
                }

                console.log("Content script:  automationData recovered after refresh");
                updateStatus("  ->  Data konfigurasi berhasil dipulihkan setelah refresh");
            }

            //  LANGKAH BARU: FILTER BULAN SETELAH REFRESH BERHASIL
            console.log("Content script:  Setting up month filter after refresh...");
            updateStatus(" Memeriksa dan mengatur filter bulan setelah refresh...");
            logAutomationStep("Filtering bulan after refresh", { faktur, iteration: i + 1 });

            //  PERBAIKAN: Tunggu halaman siap sebelum mencari filter
            updateStatus("  -> Menunggu halaman siap...");
            await new Promise(resolve => setTimeout(resolve, 2000));

            let filterBerhasil = false;
            try {
                filterBerhasil = await retryOperation(filterBulan, 3, 3000);
            } catch (error) {
                if (error instanceof SessionLogoutError || error instanceof AutomationAbortError) { throw error; }
                updateStatus(` Gagal mengatur filter bulan - ${error.message}. Proses dihentikan.`, "error");
                console.error("Content script: Month filter setup failed with error:", error);
                logAutomationStep("Filter bulan error", { error: error.message, faktur });
                currentState = MachineState.ERROR;
                await finalizeAutomation(MachineState.ERROR, totalBerhasil, fakturList.length);
                break;
            }

            if (!filterBerhasil) {
                //  PERBAIKAN: Coba pendekatan alternatif sebelum berhenti total
                updateStatus(" Filter bulan gagal, mencoba pendekatan alternatif...", "warning");
                console.warn("Content script: Month filter failed, trying alternative approach");

                // Coba skip filter bulan dan lanjutkan ke filter nomor faktur langsung
                try {
                    updateStatus("  -> Mencoba skip filter bulan, langsung ke filter nomor faktur...");
                    await new Promise(resolve => setTimeout(resolve, 2000));

                    // Test jika filter nomor faktur bisa diakses langsung
                    const filterFakturElement = await waitForElementSmart('#filterTaxInvoiceNumber', 3000);
                    if (filterFakturElement) {
                        updateStatus("  ->  Filter nomor faktur ditemukan, melanjutkan tanpa filter bulan...");
                        filterBerhasil = true; // Set true untuk melanjutkan proses
                    } else {
                        updateStatus(" Filter nomor faktur juga tidak ditemukan. Proses dihentikan.", "error");
                        console.error("Content script: Both month and invoice filters failed");
                        logAutomationStep("All filters failed", { faktur });
                        currentState = MachineState.ERROR;
                        await finalizeAutomation(MachineState.ERROR, totalBerhasil, fakturList.length);
                        break;
                    }
                } catch (altError) {
                    if (altError instanceof SessionLogoutError) { throw altError; }
                    updateStatus(" Pendekatan alternatif gagal. Proses dihentikan.", "error");
                    console.error("Content script: Alternative approach failed:", altError);
                    currentState = MachineState.ERROR;
                    await finalizeAutomation(MachineState.ERROR, totalBerhasil, fakturList.length);
                    break;
                }
            }

            //  FILTER BULAN BERHASIL - SIAP LANJUT KE CLEAR FILTER DAN NOMOR FAKTUR
            console.log("Content script:  MONTH FILTER COMPLETED AFTER REFRESH - ready for clear filter and nomor faktur filtering");

            //  LANGKAH LANJUTAN: FILTER NOMOR FAKTUR SETELAH FILTER BULAN BERHASIL
            console.log(`Content script:  ITERATION ${processedInvoices - 1}/SUBSEQUENT - Faktur: ${faktur}`);

            // PERBAIKAN: PASTIKAN FILTER TAHUN DI-SET KE 2025 SEBELUM SETIAP FAKTUR
            console.log("Content script:  ENSURING year filter is set to 2025 before processing...");
            updateStatus("  -> Memastikan filter tahun di-set ke 2025...");
            try {
                const filterTahunOk = await filterTahunPajakHeader(automationData.tahunDipilih || "2025");
                if (filterTahunOk) {
                    console.log("Content script:  Year filter 2025 confirmed for subsequent invoice");
                    await new Promise(resolve => setTimeout(resolve, 500)); // Wait for filter to apply
                } else {
                    console.warn("Content script: Failed to set year filter to 2025, continuing anyway...");
                }
            } catch (yearFilterError) {
                console.warn("Content script: Error setting year filter:", yearFilterError);
            }

            // PERBAIKAN: CLEAR FILTER NOMOR FAKTUR DULU BARU APPLY YANG BARU
            console.log("Content script:  Clearing invoice number filter before applying new one...");
            updateStatus("  -> Membersihkan filter nomor faktur sebelumnya...");
            try {
                // Cari dan klik tombol clear filter untuk nomor faktur
                const clearFakturButton = document.querySelector('#filterTaxInvoiceNumber .p-column-filter-clear-button');
                if (clearFakturButton) {
                    clearFakturButton.click();
                    await new Promise(resolve => setTimeout(resolve, 800));
                    console.log("Content script:  Invoice number filter cleared");
                }
            } catch (clearError) {
                console.warn("Content script: Error clearing invoice filter:", clearError);
            }

            // PERBAIKAN: APPLY FILTER NOMOR FAKTUR YANG BARU
            console.log(`Content script:  Applying invoice number filter for: ${faktur}`);
            updateStatus(` Memeriksa dan mengatur filter nomor faktur: ${faktur}...`);
            logAutomationStep("Filtering nomor faktur", { faktur, iteration: i + 1 });

            let filterNomorBerhasilSubseq = false;
            try {
                filterNomorBerhasilSubseq = await retryOperation(() => filterNomorFaktur(faktur), 3, 2000);
                if (filterNomorBerhasilSubseq) {
                    console.log(`Content script:  Invoice number filter applied for: ${faktur}`);
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            } catch (error) {
                if (error instanceof SessionLogoutError || error instanceof AutomationAbortError) { throw error; }
                updateStatus(` Gagal mengatur filter nomor faktur - ${error.message}. Proses dihentikan.`, "error");
                console.error("Content script: Invoice number filter setup failed with error:", error);
                logAutomationStep("Filter nomor faktur error", { error: error.message, faktur });
                currentState = MachineState.ERROR;
                await finalizeAutomation(MachineState.ERROR, totalBerhasil, fakturList.length);
                break;
            }

            if (!filterNomorBerhasilSubseq) {
                updateStatus(" Gagal mengatur filter nomor faktur. Proses dihentikan.", "error");
                console.error("Content script: Invoice number filter setup failed");
                logAutomationStep("Filter nomor faktur failed", { faktur, filterNomorBerhasilSubseq });
                currentState = MachineState.ERROR;
                await finalizeAutomation(MachineState.ERROR, totalBerhasil, fakturList.length);
                break;
            }

            //  CRITICAL FIX: SEKARANG LANGSUNG PROSES FAKTUR!
            updateStatus(` Filter berhasil! Memproses faktur: ${faktur}...`, 'status', totalBerhasil, false, totalBerhasil, fakturList.length);
            console.log(`Content script:  IMMEDIATE ACTION: Processing invoice ${faktur}...`);
            logAutomationStep("Processing faktur after filter", { faktur, iteration: i + 1 });

            let hasilProses = "FAILED";
            try {
                hasilProses = await prosesSatuFaktur(faktur, automationData.bulanDipilih, automationData.tahunDipilih, automationData.aksiFinal);
            } catch (error) {
                if (error instanceof SessionLogoutError || error instanceof AutomationAbortError) { throw error; }
                updateStatus(` ERROR: Gagal memproses faktur ${faktur} - ${error.message}`, 'error');
                console.error(`Content script: Error processing faktur ${faktur} in loop:`, error);
                logAutomationStep("Faktur processing error in loop", { faktur, error: error.message, stack: error.stack });
                hasilProses = "FAILED";
            }

            if (hasilProses === "SUCCESS") {
                totalBerhasil++;
                processedSuccessCount++; //  QUOTA FIX: Track successful count

                updateStatus(`  ->  SUKSES memproses faktur ${faktur}. Progress: ${totalBerhasil}/${processedInvoices}`, 'status', totalBerhasil, false, totalBerhasil, fakturList.length);
                updateStatus(` UI diperbarui: ${fakturList.length - totalBerhasil}/${fakturList.length} kuota tersisa`, 'status', totalBerhasil, false, totalBerhasil, fakturList.length);
                console.log(`Content script:  SUCCESS: ${faktur} processed, ready for next iteration`);

                //  QUOTA FIX: Check quota limit for subsequent invoices too
                if (quotaInfo && quotaInfo.isFreeUser) {
                    const maxAllowed = quotaInfo.maxQuota;
                    const totalUsedNow = (quotaInfo.usedQuota || 0) + processedSuccessCount;

                    console.log(`Content script: [QUOTA FIX] Subsequent invoice quota check:`, {
                        usedBefore: quotaInfo.usedQuota,
                        processedNow: processedSuccessCount,
                        totalUsedNow: totalUsedNow,
                        maxAllowed: maxAllowed,
                        shouldStop: totalUsedNow >= maxAllowed
                    });

                    if (totalUsedNow >= maxAllowed) {
                        console.log(`Content script: [QUOTA FIX]  QUOTA LIMIT REACHED on subsequent invoice! Stopping automation.`);
                        updateStatus(` BATAS KUOTA TERCAPAI! Proses dihentikan karena kuota free (${maxAllowed}) sudah habis. Total berhasil: ${totalBerhasil}`, 'success', totalBerhasil, true, totalUsedNow, maxAllowed);

                        //  FAKTUR TRACKING: Track remaining faktur as skipped due to quota
                        const remainingFaktur = fakturList.slice(i);
                        remainingFaktur.forEach(remainingFaktur => {
                            addFakturResult(remainingFaktur, 'SKIPPED', 'Kuota habis');
                        });

                        currentState = MachineState.STOPPED;
                        await finalizeAutomation(MachineState.STOPPED, totalBerhasil, fakturList.length);
                        break;
                    }
                }
            } else if (hasilProses === "SKIPPED") {
                // RETRY DENGAN TAHUN 2026: Jika faktur tidak ditemukan di tahun 2025, coba cari di tahun 2026
                console.log(`Content script: Invoice ${faktur} not found with year 2025, trying year 2026...`);
                updateStatus(`  ->  Faktur ${faktur} tidak ditemukan di tahun 2025, mencoba tahun 2026...`, 'status', totalBerhasil, false, totalBerhasil, fakturList.length);
                logAutomationStep("Retrying subsequent invoice with year 2026", { faktur, iteration: i + 1 });

                try {
                    // Set filter tahun ke 2026
                    const filterTahun2026Berhasil = await filterTahunPajakHeader(alternateYear);

                    if (filterTahun2026Berhasil) {
                        console.log("Content script: Year filter set to 2026 for retry");
                        updateStatus("  ->  Filter tahun diubah ke 2026, mencari ulang...");

                        // Wait for filter to apply
                        await new Promise(resolve => setTimeout(resolve, 1000));

                        // Re-apply nomor faktur filter
                        await retryOperation(() => filterNomorFaktur(faktur), 2, 2000);

                        // Retry proses faktur
                        const hasilRetry2026 = await prosesSatuFaktur(faktur, automationData.bulanDipilih, alternateYear, automationData.aksiFinal);

                        if (hasilRetry2026 === "SUCCESS") {
                            totalBerhasil++;
                            processedSuccessCount++;
                            updateStatus(`  ->  SUKSES memproses faktur ${faktur} dengan tahun ${alternateYear}. Progress: ${totalBerhasil}/${processedInvoices}`, 'status', totalBerhasil, false, totalBerhasil, fakturList.length);
                            console.log(`Content script:  SUCCESS with year ${alternateYear}: ${faktur}`);
                            logAutomationStep("Invoice success with alternate year", { faktur, iteration: i + 1 });

                            // Reset filter tahun kembali ke 2025 untuk faktur berikutnya
                            console.log("Content script: Resetting year filter back to 2025 for next invoice...");
                            await filterTahunPajakHeader(automationData.tahunDipilih || "2025");
                        } else if (hasilRetry2026 === "SKIPPED") {
                            updateStatus(`  -> [SKIP] Faktur ${faktur} tidak ditemukan di tahun ${initialYear} maupun ${alternateYear}, skip.`, 'status', totalBerhasil, false, totalBerhasil, fakturList.length);
                            console.log(`Content script:  SKIPPED: ${faktur} not found after checking ${initialYear} and ${alternateYear}`);
                            logAutomationStep("Invoice not found in 2025/2026", { faktur, iteration: i + 1 });
                        } else {
                            updateStatus(`  ->  GAGAL memproses faktur ${faktur} dengan tahun ${alternateYear}.`, 'status', totalBerhasil, false, totalBerhasil, fakturList.length);
                            console.log(`Content script:  FAILED with year ${alternateYear}: ${faktur}`);

                            // Reset filter tahun kembali ke 2025 untuk faktur berikutnya
                            console.log("Content script: Resetting year filter back to 2025 for next invoice...");
                            await filterTahunPajakHeader(automationData.tahunDipilih || "2025");
                        }
                    } else {
                        // Jika gagal set filter tahun 2026, skip saja
                        updateStatus(`  -> [SKIP] Faktur ${faktur} tidak ditemukan, skip.`, 'status', totalBerhasil, false, totalBerhasil, fakturList.length);
                        console.log(`Content script:  SKIPPED: ${faktur} not found (failed to set year 2026 filter)`);
                    }
                } catch (retryError) {
                    console.warn("Content script: Error during year retry:", retryError);
                    updateStatus(`  -> [SKIP] Faktur ${faktur} tidak ditemukan, skip.`, 'status', totalBerhasil, false, totalBerhasil, fakturList.length);
                    console.log(`Content script:  SKIPPED: ${faktur} not found`);
                    logAutomationStep("Year retry error for subsequent invoice", { faktur, error: retryError.message });

                    // Reset filter tahun ke 2025 untuk faktur berikutnya
                    try {
                        await filterTahunPajakHeader(automationData.tahunDipilih || "2025");
                    } catch (e) { /* ignore */ }
                }
            } else {
                updateStatus(`  ->  GAGAL memproses faktur ${faktur}, melanjutkan...`, 'status', totalBerhasil, false, totalBerhasil, fakturList.length);
                console.log(`Content script:  FAILED: ${faktur} processing failed`);
            }

            console.log(`Content script:  COMPLETED iteration for faktur ${faktur} (Success: ${totalBerhasil}/${processedInvoices})`);
        }

        //  FINAL SUCCESS CASE - semua loop selesai tanpa error
        await finalizeAutomation(MachineState.RUNNING, totalBerhasil, fakturList.length);

    } catch (unexpectedError) {
        if (unexpectedError instanceof AutomationAbortError) {
            console.warn("Content script: Automation aborted by user");
            if (finalizeCalled) return;
            updateStatus("Otomatisasi dihentikan seketika oleh pengguna.", "stopped", totalBerhasil, true, totalBerhasil, fakturList.length);
            await finalizeAutomation(MachineState.STOPPED, totalBerhasil, fakturList.length);
            return;
        }
        if (unexpectedError instanceof SessionLogoutError) {
            if (finalizeCalled) {
                console.warn("Content script: Session logout error caught after finalize - skipping duplicate handling");
                return;
            }
            console.error("Content script: Session logout detected during automation:", unexpectedError);
            const logoutMessage = sanitizeLogMessage(unexpectedError.reason || unexpectedError.message || "Session logout terdeteksi");
            if (activeFaktur) {
                try {
                    addFakturResult(activeFaktur, "FAILED", logoutMessage, { source: "session" });
                } catch (trackError) {
                    console.warn("Content script: Failed to record logout failure for invoice", activeFaktur, trackError);
                }
            }
            updateStatus(` ERROR: ${logoutMessage}. Otomasi dihentikan otomatis untuk keamanan.`, "error", totalBerhasil, true, totalBerhasil, fakturList.length);
            await finalizeAutomation(MachineState.ERROR, totalBerhasil, fakturList.length);
            return;
        }
        console.error("Content script: UNEXPECTED ERROR in startAutomation loop:", unexpectedError);
        updateStatus(` UNEXPECTED ERROR: ${unexpectedError.message}`, 'error', totalBerhasil);
        //  HUBUNGI FINALIZE untuk update kuota partial pada unexpected error
        await finalizeAutomation(MachineState.ERROR, totalBerhasil, fakturList.length);
    } finally {
        activeFaktur = null;
        currentState = MachineState.IDLE;
        stopNavigationMonitor();
        automationAbortHandler = null;
        forcedLogoutReason = null;
    }
}


// === PDF FAKTUR KELUARAN DOWNLOAD ===

let pdfDownloadState = {
    isRunning: false,
    isStopped: false,
    totalDownloaded: 0,
    currentPage: 1
};

function getPdfButtons() {
    return Array.from(document.querySelectorAll('button#DownloadButton')).filter(btn => {
        return btn.querySelector('span.pi.pi-file-pdf') !== null;
    });
}

function sendPdfStatus(msg, isComplete = false) {
    chrome.runtime.sendMessage({
        type: 'pdf-download-status',
        message: msg,
        downloadCount: pdfDownloadState.totalDownloaded,
        isComplete: isComplete
    }).catch(() => {}); // Ignore if popup not open
}

async function startPdfDownload() {
    pdfDownloadState = { isRunning: true, isStopped: false, totalDownloaded: 0, currentPage: 1 };
    sendPdfStatus('Memulai download PDF...');
    try {
        await downloadPdfCurrentPage();
    } catch (error) {
        console.error('PDF Download: Error:', error);
        sendPdfStatus(`Error: ${error.message}`, true);
    }
    pdfDownloadState.isRunning = false;
}

async function downloadPdfCurrentPage() {
    if (pdfDownloadState.isStopped) {
        sendPdfStatus(`Download dihentikan. Total: ${pdfDownloadState.totalDownloaded} file.`, true);
        sendPdfQuotaUpdate();
        return;
    }

    await waitForPdfTableReady();

    const buttons = getPdfButtons();
    sendPdfStatus(`Halaman ${pdfDownloadState.currentPage}: ditemukan ${buttons.length} tombol PDF`);

    if (buttons.length === 0) {
        sendPdfStatus('Tidak ditemukan tombol PDF di halaman ini.', true);
        sendPdfQuotaUpdate();
        return;
    }

    for (let i = 0; i < buttons.length; i++) {
        if (pdfDownloadState.isStopped) break;

        const freshButtons = getPdfButtons();
        const btn = freshButtons[i];
        if (!btn) continue;

        btn.scrollIntoView({ block: 'center' });
        btn.click();
        pdfDownloadState.totalDownloaded++;

        sendPdfStatus(`Halaman ${pdfDownloadState.currentPage} — ${i + 1}/${buttons.length} (total: ${pdfDownloadState.totalDownloaded})`);

        // Random delay 500-1000ms (human-like)
        await new Promise(r => setTimeout(r, 500 + Math.random() * 500));
    }

    if (pdfDownloadState.isStopped) {
        sendPdfStatus(`Download dihentikan. Total: ${pdfDownloadState.totalDownloaded} file.`, true);
        sendPdfQuotaUpdate();
        return;
    }

    // Check for next page
    const nextBtn = document.querySelector('.p-paginator-next:not(.p-disabled)');
    if (nextBtn) {
        pdfDownloadState.currentPage++;
        sendPdfStatus(`Navigasi ke halaman ${pdfDownloadState.currentPage}...`);
        nextBtn.click();
        await new Promise(r => setTimeout(r, 3000));
        await downloadPdfCurrentPage();
    } else {
        sendPdfStatus(`Selesai! ${pdfDownloadState.totalDownloaded} PDF didownload dari ${pdfDownloadState.currentPage} halaman.`, true);
        sendPdfQuotaUpdate();
    }
}

function sendPdfQuotaUpdate() {
    if (pdfDownloadState.totalDownloaded <= 0) return;
    chrome.runtime.sendMessage({
        type: 'automation-status',
        statusType: 'final_completion',
        message: `Download PDF selesai. ${pdfDownloadState.totalDownloaded} file berhasil didownload.`,
        invoicesProcessed: pdfDownloadState.totalDownloaded,
        isFinalCompletion: true
    }).catch(() => {});
}

async function waitForPdfTableReady() {
    return new Promise((resolve) => {
        let attempts = 0;
        const check = () => {
            attempts++;
            const buttons = getPdfButtons();
            const rows = document.querySelectorAll('tbody tr');
            const loading = document.querySelector('.p-datatable-loading-overlay');

            if (!loading && rows.length > 0 && buttons.length > 0) {
                setTimeout(resolve, 500);
                return;
            }
            if (attempts >= 60) { resolve(); return; }
            setTimeout(check, 100);
        };
        check();
    });
}

// === END PDF FAKTUR KELUARAN DOWNLOAD ===


// === PDF FAKTUR MASUKAN DOWNLOAD ===

let pdfMasukanDownloadState = {
    isRunning: false,
    isStopped: false,
    totalDownloaded: 0,
    currentPage: 1
};

function getPdfMasukanButtons() {
    return Array.from(document.querySelectorAll('button#DownloadButton')).filter(btn => {
        return btn.querySelector('span.pi.pi-file-pdf') !== null;
    });
}

function sendPdfMasukanStatus(msg, isComplete = false) {
    chrome.runtime.sendMessage({
        type: 'pdf-masukan-download-status',
        message: msg,
        downloadCount: pdfMasukanDownloadState.totalDownloaded,
        isComplete: isComplete
    }).catch(() => {}); // Ignore if popup not open
}

async function startPdfMasukanDownload() {
    pdfMasukanDownloadState = { isRunning: true, isStopped: false, totalDownloaded: 0, currentPage: 1 };
    sendPdfMasukanStatus('Memulai download PDF Pajak Masukan...');
    try {
        await downloadPdfMasukanCurrentPage();
    } catch (error) {
        console.error('PDF Masukan Download: Error:', error);
        sendPdfMasukanStatus(`Error: ${error.message}`, true);
    }
    pdfMasukanDownloadState.isRunning = false;
}

async function downloadPdfMasukanCurrentPage() {
    if (pdfMasukanDownloadState.isStopped) {
        sendPdfMasukanStatus(`Download dihentikan. Total: ${pdfMasukanDownloadState.totalDownloaded} file.`, true);
        sendPdfMasukanQuotaUpdate();
        return;
    }

    await waitForPdfMasukanTableReady();

    const buttons = getPdfMasukanButtons();
    sendPdfMasukanStatus(`Halaman ${pdfMasukanDownloadState.currentPage}: ditemukan ${buttons.length} tombol PDF`);

    if (buttons.length === 0) {
        sendPdfMasukanStatus('Tidak ditemukan tombol PDF di halaman ini.', true);
        sendPdfMasukanQuotaUpdate();
        return;
    }

    for (let i = 0; i < buttons.length; i++) {
        if (pdfMasukanDownloadState.isStopped) break;

        const freshButtons = getPdfMasukanButtons();
        const btn = freshButtons[i];
        if (!btn) continue;

        btn.scrollIntoView({ block: 'center' });
        btn.click();
        pdfMasukanDownloadState.totalDownloaded++;

        sendPdfMasukanStatus(`Halaman ${pdfMasukanDownloadState.currentPage} — ${i + 1}/${buttons.length} (total: ${pdfMasukanDownloadState.totalDownloaded})`);

        // Random delay 500-1000ms (human-like)
        await new Promise(r => setTimeout(r, 500 + Math.random() * 500));
    }

    if (pdfMasukanDownloadState.isStopped) {
        sendPdfMasukanStatus(`Download dihentikan. Total: ${pdfMasukanDownloadState.totalDownloaded} file.`, true);
        sendPdfMasukanQuotaUpdate();
        return;
    }

    // Check for next page
    const nextBtn = document.querySelector('.p-paginator-next:not(.p-disabled)');
    if (nextBtn) {
        pdfMasukanDownloadState.currentPage++;
        sendPdfMasukanStatus(`Navigasi ke halaman ${pdfMasukanDownloadState.currentPage}...`);
        nextBtn.click();
        await new Promise(r => setTimeout(r, 3000));
        await downloadPdfMasukanCurrentPage();
    } else {
        sendPdfMasukanStatus(`Selesai! ${pdfMasukanDownloadState.totalDownloaded} PDF Pajak Masukan didownload dari ${pdfMasukanDownloadState.currentPage} halaman.`, true);
        sendPdfMasukanQuotaUpdate();
    }
}

function sendPdfMasukanQuotaUpdate() {
    if (pdfMasukanDownloadState.totalDownloaded <= 0) return;
    chrome.runtime.sendMessage({
        type: 'automation-status',
        statusType: 'final_completion',
        message: `Download PDF Pajak Masukan selesai. ${pdfMasukanDownloadState.totalDownloaded} file berhasil didownload.`,
        invoicesProcessed: pdfMasukanDownloadState.totalDownloaded,
        isFinalCompletion: true
    }).catch(() => {});
}

async function waitForPdfMasukanTableReady() {
    return new Promise((resolve) => {
        let attempts = 0;
        const check = () => {
            attempts++;
            const buttons = getPdfMasukanButtons();
            const rows = document.querySelectorAll('tbody tr');
            const loading = document.querySelector('.p-datatable-loading-overlay');

            if (!loading && rows.length > 0 && buttons.length > 0) {
                setTimeout(resolve, 500);
                return;
            }
            if (attempts >= 60) { resolve(); return; }
            setTimeout(check, 100);
        };
        check();
    });
}

// === END PDF FAKTUR MASUKAN DOWNLOAD ===


// === DOWNLOAD KELUARAN AUTOMATION ===

async function klikRefreshButtonKeluaran() {
    console.log('Looking for refresh button...');

    // Try multiple selectors for the refresh button
    const refreshSelectors = [
        'button .pi-refresh',  // Button containing refresh icon
        '.pi-refresh',          // Direct icon selector
        'button[icon="pi pi-refresh"]',  // Button with icon attribute
        '[class*="pi-refresh"]',  // Any element with refresh icon class
        'button .p-button-icon.pi-refresh'  // More specific button selector
    ];

    for (const selector of refreshSelectors) {
        const refreshIcon = document.querySelector(selector);
        if (refreshIcon) {
            // Find the parent button element
            const refreshButton = refreshIcon.closest('button');
            if (refreshButton) {
                console.log(`Found refresh button using selector: ${selector}`);
                refreshButton.click();
                await new Promise(resolve => setTimeout(resolve, 1000));
                console.log('Refresh button clicked successfully');
                return true;
            }
        }
    }

    console.warn('Refresh button not found, continuing anyway...');
    return false;
}

async function startDownloadKeluaranAutomation(selectedMonth, selectedYear) {
    console.log(`Starting Keluaran Excel download: Month=${selectedMonth}, Year=${selectedYear}`);

    try {
        // Step 1: Click refresh button to load the list
        updateStatus('Memuat daftar faktur keluaran...', 'info', 0, false);
        await klikRefreshButtonKeluaran();
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Step 2: Apply filters
        if (selectedMonth) {
            updateStatus(`Mengatur filter masa: ${selectedMonth}...`, 'info', 0, false);
            await resetFilterToSelectedMonthKeluaran(selectedMonth);
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        if (selectedYear) {
            updateStatus(`Mengatur filter tahun: ${selectedYear}...`, 'info', 0, false);
            await applyYearFilterKeluaran(selectedYear);
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        // Download loop
        let page = 1;
        let totalDownloaded = 0;

        while (true) {
            updateStatus(`Memproses halaman ${page}...`, 'info', totalDownloaded, false);

            // Wait for table ready
            await waitForTableReadyKeluaran();

            // Click Excel download button
            const success = await klikTombolDownloadExcel();
            if (success) {
                totalDownloaded++;
                updateStatus(`Halaman ${page}: Excel berhasil didownload`, 'success', totalDownloaded, false);
            } else {
                updateStatus(`Halaman ${page}: Tombol Excel tidak ditemukan`, 'warning', totalDownloaded, false);
            }

            // Check for next page
            const hasNextPage = await cekDanKlikNextButton();
            if (!hasNextPage) {
                break;
            }

            page++;
            await new Promise(resolve => setTimeout(resolve, 3000));
        }

        // Final status
        updateStatus(`Selesai! Total ${totalDownloaded} file Excel didownload dari ${page} halaman.`, 'success', totalDownloaded, true);

        // Send quota update
        sendQuotaUpdateKeluaran(totalDownloaded);

    } catch (error) {
        console.error('Keluaran download error:', error);
        updateStatus(`Error: ${error.message}`, 'error', 0, true);
    }
}

async function resetFilterToSelectedMonthKeluaran(month) {
    // Normalize month name
    const monthKey = normalizeMonthKey(month);
    console.log(`Setting Keluaran filter to month: ${monthKey}`);

    // 1. Find the dropdown element (p-dropdown, NOT p-multiselect)
    const dropdown = document.querySelector('p-dropdown#filterTaxInvoicePeriod') ||
                     document.querySelector('[id="filterTaxInvoicePeriod"]');

    if (!dropdown) {
        console.log('Dropdown not found, trying alternative selectors');
        // Fallback: try finding by label pattern
        const dropdowns = document.querySelectorAll('p-dropdown');
        for (const dd of dropdowns) {
            const label = dd.querySelector('.p-dropdown-label');
            if (label && label.textContent.includes('Masa')) {
                // Found it by "Masa" label
                await selectMonthInDropdown(dd, monthKey);
                return;
            }
        }
        throw new Error('Dropdown Masa Pajak tidak ditemukan');
    }

    // 2. Clear existing selection if any
    const clearIcon = dropdown.querySelector('.p-dropdown-clear-icon');
    if (clearIcon) {
        clearIcon.click();
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    // 3. Click trigger to open dropdown
    const trigger = dropdown.querySelector('.p-dropdown-trigger');
    if (!trigger) {
        throw new Error('Dropdown trigger tidak ditemukan');
    }

    trigger.click();

    // 4. Wait for panel to appear (dynamically created, appended to body)
    await new Promise(resolve => setTimeout(resolve, 500));

    // 5. Find and click the month item in the panel
    // Panel is in body, NOT in the dropdown element
    const panel = document.querySelector('.p-dropdown-panel');
    if (!panel) {
        throw new Error('Dropdown panel tidak muncul');
    }

    const items = panel.querySelectorAll('.p-dropdown-item');
    let found = false;

    for (const item of items) {
        const itemText = item.textContent?.trim();
        // Try exact match first, then partial match
        if (itemText === monthKey ||
            itemText.toLowerCase() === monthKey.toLowerCase() ||
            itemText.toLowerCase().includes(monthKey.toLowerCase())) {
            item.click();
            found = true;
            await new Promise(resolve => setTimeout(resolve, 300));
            break;
        }
    }

    if (!found) {
        console.warn(`Month "${monthKey}" not found in dropdown. Available months:`,
            Array.from(items).map(i => i.textContent.trim()).join(', '));
    }

    // 6. No need to click Apply - p-dropdown auto-applies on selection and closes panel
    console.log(`Filter applied successfully: ${monthKey}`);
}

// Helper function to select month in a dropdown element
async function selectMonthInDropdown(dropdown, monthKey) {
    const trigger = dropdown.querySelector('.p-dropdown-trigger');
    if (trigger) {
        trigger.click();
        await new Promise(resolve => setTimeout(resolve, 500));

        const panel = document.querySelector('.p-dropdown-panel');
        if (panel) {
            const items = panel.querySelectorAll('.p-dropdown-item');
            for (const item of items) {
                const itemText = item.textContent?.trim();
                if (itemText === monthKey ||
                    itemText.toLowerCase() === monthKey.toLowerCase() ||
                    itemText.toLowerCase().includes(monthKey.toLowerCase())) {
                    item.click();
                    await new Promise(resolve => setTimeout(resolve, 300));
                    return true;
                }
            }
        }
    }
    return false;
}

async function applyYearFilterKeluaran(year) {
    // Similar to Masukan year filter but adapted for Keluaran page
    console.log(`Setting Keluaran year filter to: ${year}`);

    const yearInput = document.querySelector('input[placeholder*="Tahun"]') ||
                     document.querySelector('[id*="year"]') ||
                     document.querySelector('[id*="tahun"]');

    if (yearInput) {
        yearInput.value = year;
        yearInput.dispatchEvent(new Event('input', { bubbles: true }));
        yearInput.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
}

async function waitForTableReadyKeluaran() {
    // Wait for table to be ready
    return new Promise((resolve) => {
        const check = () => {
            const rows = document.querySelectorAll('tbody tr');
            const loading = document.querySelector('.p-datatable-loading-overlay');
            if (!loading && rows.length > 0) {
                setTimeout(resolve, 500);
            } else {
                setTimeout(check, 100);
            }
        };
        check();
    });
}

function sendQuotaUpdateKeluaran(count) {
    chrome.runtime.sendMessage({
        type: 'automation-status',
        statusType: 'final_completion',
        message: `Download selesai. ${count} file Excel berhasil didownload.`,
        invoicesProcessed: count,
        isFinalCompletion: true
    }).catch(() => {});
}

// === END DOWNLOAD KELUARAN AUTOMATION ===


// --- Message Listener ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("Content script: Message received", message.type, "from sender:", sender.id);
    if (sender.id !== chrome.runtime.id) {
        console.warn("Content script: Ignoring message from unknown sender:", sender.id);
        return;
    }
    if (message.target && message.target !== 'content_script') {
        console.log("Content script: Message targeted for another component, ignoring.");
        return;
    }

    switch (message.type) {
        case 'CHECK_READY':
            console.log("Content script: CHECK_READY received. Sending response: READY");
            const isPajakMasukan = document.title.toLowerCase().includes('masukan') || document.body.innerText.toLowerCase().includes('pajak masukan');
            const badgeElements = Array.from(document.querySelectorAll('.p-badge'));
            const statusBadge = badgeElements.find(badge => badge.textContent.trim().toLowerCase() === 'status');
            sendResponse({ 
                success: true, 
                status: 'READY',
                isPajakMasukan: isPajakMasukan,
                isNoStatusFilter: !statusBadge
            });
            break;

        case 'START_AUTOMATION':
            console.log("Content script: START_AUTOMATION received with data:", message.data);
            if (currentState === MachineState.RUNNING) {
                const warning = "Automasi sudah berjalan. Hentikan dulu untuk memulai yang baru.";
                updateStatus(warning, 'error');
                sendResponse({ success: false, message: warning });
                return;
            }

            //  DEBUG & PERSISTENCE: Save data ke persistent storage
            console.log("Content script: Saving automation data to persistent storage...");
            saveAutomationData(message.data);

            // Start automation asynchronously
            startAutomation().then(() => {
                console.log("Content script: Automation started successfully");
            }).catch((error) => {
                console.error("Content script: Automation failed:", error);
            });

            sendResponse({ success: true, message: "Automation starting..." });
            break;

        case 'START_DOWNLOAD_AUTOMATION':
            console.log("Content script: START_DOWNLOAD_AUTOMATION received");
            if (currentState === MachineState.RUNNING) {
                const warning = "Automasi sudah berjalan. Hentikan dulu untuk memulai download.";
                updateStatus(warning, 'error');
                sendResponse({ success: false, message: warning });
                return;
            }

            // Extract selectedMonths and selectedYear from message data if available
            const selectedMonths = message.data?.selectedMonths || [];
            const selectedYear = message.data?.selectedYear || '';
            console.log("Content script: Selected months for download:", selectedMonths);
            console.log("Content script: Selected year for download:", selectedYear);

            // Start download automation asynchronously with selected months and year
            startDownloadAutomation(selectedMonths, selectedYear).then(() => {
                console.log("Content script: Download automation started successfully");
            }).catch((error) => {
                console.error("Content script: Download automation failed:", error);
            });

            sendResponse({ success: true, message: "Download automation starting..." });
            break;

        case 'START_PDF_DOWNLOAD':
            console.log("Content script: START_PDF_DOWNLOAD received");
            if (pdfDownloadState.isRunning) {
                sendResponse({ success: false, message: 'PDF download sudah berjalan.' });
                return;
            }
            startPdfDownload();
            sendResponse({ success: true, message: 'PDF download dimulai.' });
            break;

        case 'STOP_PDF_DOWNLOAD':
            console.log("Content script: STOP_PDF_DOWNLOAD received");
            pdfDownloadState.isStopped = true;
            sendResponse({ success: true, message: 'PDF download dihentikan.' });
            break;

        case 'START_PDF_MASUKAN_DOWNLOAD':
            console.log("Content script: START_PDF_MASUKAN_DOWNLOAD received");
            if (pdfMasukanDownloadState.isRunning) {
                sendResponse({ success: false, message: 'PDF download Pajak Masukan sudah berjalan.' });
                return;
            }
            startPdfMasukanDownload();
            sendResponse({ success: true, message: 'PDF download Pajak Masukan dimulai.' });
            break;

        case 'STOP_PDF_MASUKAN_DOWNLOAD':
            console.log("Content script: STOP_PDF_MASUKAN_DOWNLOAD received");
            pdfMasukanDownloadState.isStopped = true;
            sendResponse({ success: true, message: 'PDF download Pajak Masukan dihentikan.' });
            break;

        case 'START_DOWNLOAD_KELUARAN_AUTOMATION':
            console.log("Content script: START_DOWNLOAD_KELUARAN_AUTOMATION received", message.data);
            const selectedMonthKeluaran = message.data?.selectedMonth;
            const selectedKeluaranYear = message.data?.selectedYear || '';

            if (!selectedMonthKeluaran) {
                sendResponse({ success: false, message: 'Masa pajak (bulan) wajib dipilih.' });
                return;
            }

            startDownloadKeluaranAutomation(selectedMonthKeluaran, selectedKeluaranYear);
            sendResponse({ success: true, message: 'Download Keluaran automation dimulai.' });
            break;

        case 'STOP_AUTOMATION':
            console.log("Content script: STOP_AUTOMATION received");
            if (currentState === MachineState.RUNNING) {
                currentState = MachineState.STOPPED;
                console.log("Content script: Setting state to STOPPED, waiting for current iteration to finish");

                // Send immediate response to popup
                sendResponse({ success: true, message: "Automation stopping." });

                // Send separate status update with STOPPED flag for proper UI handling
                updateStatus(' STOP DIPERINTAH. Menunggu faktur saat ini selesai processing.', 'stopped', totalBerhasil, false);

                console.log("Content script: Stop command processed, current iteration will finish gracefully");
            } else {
                console.log("Content script: Stop command ignored - automation not running");
                sendResponse({ success: false, message: "Automation not running." });
            }
            break;
        default:
            console.log("Content script: Unknown message type received:", message.type);
            break;
    }
    return true;
});


// Basic version ready
console.log("=== CONTENT SCRIPT READY FOR AUTOMATION ===");

// Test if we can access the page
setTimeout(() => {
    console.log("Page elements test:");
    console.log("- Tables found:", document.querySelectorAll('.p-datatable-tbody').length);
    console.log("- Nav links found:", document.querySelectorAll('a.nav-link').length);
    console.log("- Form items found:", document.querySelectorAll('einv-doc-form-item').length);
}, 2000);
