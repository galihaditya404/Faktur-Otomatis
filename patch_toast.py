import re

with open("popup.js", "r") as f:
    content = f.read()

toast_func = """
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
"""

# Find handleAutomationStatus
old_handler = """        if (request.isFinalCompletion) {
            handleStop(true);"""

new_handler = """        if (request.isFinalCompletion) {
            if (request.statusType === 'error' || (request.message && request.message.toLowerCase().includes('error'))) {
                showToast('Proses Berhenti / Gagal', request.message, 'error');
            } else {
                showToast('Proses Selesai', request.message, 'success');
            }
            handleStop(true);"""

if "function showToast" not in content:
    content += "\n" + toast_func

content = content.replace(old_handler, new_handler)

with open("popup.js", "w") as f:
    f.write(content)
