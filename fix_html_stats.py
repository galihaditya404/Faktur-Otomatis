import re

with open("popup.html", "r") as f:
    content = f.read()

old_stats = "BERHASIL: <b id=\"stat-sukses\" style=\"color: #166534;\">0</b> &bull; GAGAL: <b id=\"stat-gagal\" style=\"color: #991b1b;\">0</b> &bull; NULL: <b id=\"stat-null\" style=\"color: #374151;\">0</b>"
new_stats = "DURASI: <b id=\"stat-durasi\" style=\"color: #475569;\">00:00</b> &bull; BERHASIL: <b id=\"stat-sukses\" style=\"color: #166534;\">0</b> &bull; GAGAL: <b id=\"stat-gagal\" style=\"color: #991b1b;\">0</b> &bull; SKIP: <b id=\"stat-skip\" style=\"color: #ca8a04;\">0</b>"
content = content.replace(old_stats, new_stats)

with open("popup.html", "w") as f:
    f.write(content)
