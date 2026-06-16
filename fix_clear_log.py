import re

with open("popup.js", "r") as f:
    content = f.read()

old_logic = """    const btnExportCSV = document.getElementById('btnExportCSV');
    if (btnExportCSV) {
        btnExportCSV.addEventListener('click', handleExportCSV);
    }"""

new_logic = """    const btnExportCSV = document.getElementById('btnExportCSV');
    if (btnExportCSV) {
        btnExportCSV.addEventListener('click', handleExportCSV);
    }
    
    const btnHapusLogFitur = document.getElementById('btnHapusLogFitur');
    if (btnHapusLogFitur) {
        btnHapusLogFitur.addEventListener('click', handleClearLog);
    }"""

content = content.replace(old_logic, new_logic)

with open("popup.js", "w") as f:
    f.write(content)
