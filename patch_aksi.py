import re

with open("content_script.js", "r") as f:
    content = f.read()

old_code = """
    const ariaLabel = ariaLabels[teksTombol];

    if (!ariaLabel) {
        updateStatus(`  -> GAGAL: Aksi final "${teksTombol}" tidak dikenal.`, 'error');
        return false;
    }

    const button = await waitForElement(`button[aria-label="${ariaLabel}"]`);
    if (!button || button.disabled) {
"""

new_code = """
    const ariaLabel = ariaLabels[teksTombol];

    if (!ariaLabel) {
        updateStatus(`  -> GAGAL: Aksi final "${teksTombol}" tidak dikenal.`, 'error');
        return false;
    }

    // Attempt to find by aria-label first, then by exact text match
    let button = await waitForElement(`button[aria-label="${ariaLabel}"]`, 2000);
    if (!button) {
        // Fallback: search all buttons for the exact text (e.g. "Kreditkan") or ariaLabel
        const buttons = document.querySelectorAll('button');
        button = Array.from(buttons).find(btn => {
            const textMatch = btn.textContent && btn.textContent.trim().toLowerCase() === teksTombol.toLowerCase();
            const ariaMatch = btn.getAttribute('aria-label') && btn.getAttribute('aria-label').toLowerCase().includes(ariaLabel.toLowerCase());
            const titleMatch = btn.getAttribute('title') && btn.getAttribute('title').toLowerCase().includes(teksTombol.toLowerCase());
            return textMatch || ariaMatch || titleMatch;
        });
    }

    if (!button || button.disabled) {
"""

content = content.replace(old_code, new_code)

with open("content_script.js", "w") as f:
    f.write(content)
