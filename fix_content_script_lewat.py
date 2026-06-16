import re

with open("content_script.js", "r") as f:
    content = f.read()

old_logic = """    } else if (safeMessage.includes('tidak ditemukan di tahun')) {
        const match = safeMessage.match(/faktur (\d+)/i);
        const fakturNum = match ? match[1] : '';
        safeMessage = `⚠️ [LEWAT] Faktur ${fakturNum} tidak ditemukan (skip).`;
    }"""

new_logic = """    }"""

content = content.replace(old_logic, new_logic)

with open("content_script.js", "w") as f:
    f.write(content)
