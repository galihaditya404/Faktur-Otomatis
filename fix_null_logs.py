import re

with open("content_script.js", "r") as f:
    content = f.read()

replacements = [
    ("updateStatus(` TIDAK ADA HASIL FILTER: Faktur ${faktur} tidak ditemukan setelah filter diterapkan.`, 'error');", "updateStatus(`  -> [NULL] Faktur ${faktur} tidak ditemukan setelah filter diterapkan.`, 'status');"),
    ("updateStatus(` Faktur ${faktur} tidak ditemukan di row manapun setelah filter diterapkan.`, 'error');", "updateStatus(`  -> [NULL] Faktur ${faktur} tidak ditemukan di row manapun.`, 'status');"),
    ("updateStatus(`  ->  Faktur ${faktur} tidak ditemukan di tahun ${initialYear} maupun ${alternateYear}, skip.`, 'status'", "updateStatus(`  -> [NULL] Faktur ${faktur} tidak ditemukan di tahun ${initialYear} maupun ${alternateYear}, skip.`, 'status'"),
    ("updateStatus(`  ->  Faktur ${faktur} tidak ditemukan, skip.`, 'status'", "updateStatus(`  -> [NULL] Faktur ${faktur} tidak ditemukan, skip.`, 'status'"),
    ("updateStatus(`  ->  Faktur ${faktur} tidak ditemukan, skip (gagal set filter 2026).`, 'status'", "updateStatus(`  -> [NULL] Faktur ${faktur} tidak ditemukan, skip.`, 'status'")
]

for old, new in replacements:
    content = content.replace(old, new)

with open("content_script.js", "w") as f:
    f.write(content)
