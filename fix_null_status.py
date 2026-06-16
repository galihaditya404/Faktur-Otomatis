import re

with open("content_script.js", "r") as f:
    content = f.read()

# Replace GAGAL with NULL in the updateStatus when it's totally not found
content = content.replace("updateStatus(`  -> GAGAL: Faktur ${faktur} tidak ditemukan di tahun ${initialYear} maupun ${alternateYear}`, 'error'", "updateStatus(`  -> [NULL] Faktur ${faktur} tidak ditemukan di tahun ${initialYear} maupun ${alternateYear}`, 'status'")

# Also check other places where it might report not found
content = content.replace("updateStatus(`  -> GAGAL: Faktur ${faktur} tidak ditemukan`, 'error'", "updateStatus(`  -> [NULL] Faktur ${faktur} tidak ditemukan`, 'status'")

with open("content_script.js", "w") as f:
    f.write(content)
