import re

with open("content_script.js", "r") as f:
    content = f.read()

old_logic = """        case 'CHECK_READY':
            console.log("Content script: CHECK_READY received. Sending response: READY");
            sendResponse({ success: true, status: 'READY' });
            break;"""

new_logic = """        case 'CHECK_READY':
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
            break;"""

content = content.replace(old_logic, new_logic)

with open("content_script.js", "w") as f:
    f.write(content)
