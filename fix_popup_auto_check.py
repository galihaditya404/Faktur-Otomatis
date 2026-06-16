import re

with open("popup.js", "r") as f:
    content = f.read()

old_logic = """function initPreflightChecklist() {
    const checks = document.querySelectorAll('.preflight-check');
    const card = document.getElementById('preflight-checklist');
    if (!card || checks.length === 0) return;

    checks.forEach(check => {
        check.addEventListener('change', () => {
            const allChecked = Array.from(checks).every(c => c.checked);
            card.classList.toggle('preflight-ready', allChecked);
        });
    });
}"""

new_logic = """function initPreflightChecklist() {
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
}"""

content = content.replace(old_logic, new_logic)

with open("popup.js", "w") as f:
    f.write(content)
