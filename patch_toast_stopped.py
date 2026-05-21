with open("popup.js", "r") as f:
    content = f.read()

old_code = """
                if (request.statusType === 'error' || (request.message && String(request.message).toLowerCase().includes('error'))) {
                    if (typeof showToast === 'function') showToast('Otomatisasi Gagal / Berhenti', safeMessage, 'error');
                } else if (request.statusType === 'final' || request.statusType === 'final_completion' || request.statusType === 'success') {
                    if (typeof showToast === 'function') showToast('Otomatisasi Selesai', safeMessage, 'success');
                }
"""

new_code = """
                if (request.statusType === 'error' || (request.message && String(request.message).toLowerCase().includes('error'))) {
                    if (typeof showToast === 'function') showToast('Otomatisasi Gagal', safeMessage, 'error');
                } else if (request.statusType === 'stopped') {
                    if (typeof showToast === 'function') showToast('Otomatisasi Berhenti', safeMessage, 'warning');
                } else if (request.statusType === 'final' || request.statusType === 'final_completion' || request.statusType === 'success') {
                    if (typeof showToast === 'function') showToast('Otomatisasi Selesai', safeMessage, 'success');
                }
"""

content = content.replace(old_code, new_code)

with open("popup.js", "w") as f:
    f.write(content)
