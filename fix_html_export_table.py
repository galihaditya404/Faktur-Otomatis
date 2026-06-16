import re

with open("popup.html", "r") as f:
    content = f.read()

# Fix Export CSV button
old_export = '<button id="btnExportCSV" class="primary-action" style="background-color: #16a34a; flex: 1;">📥 Export CSV</button>'
new_export = '<button id="btnExportCSV" style="flex: 1; padding: 10px; background-color: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0; border-radius: 6px; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; transition: all 0.2s;" onmouseover="this.style.backgroundColor=\'#dcfce7\'" onmouseout="this.style.backgroundColor=\'#f0fdf4\'"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg> Export CSV</button>'
content = content.replace(old_export, new_export)

# Fix Table height and sticky header background
old_table_wrapper = 'max-height: 220px;'
new_table_wrapper = 'max-height: 400px;'
content = content.replace(old_table_wrapper, new_table_wrapper)

old_thead = '<thead style="position: sticky; top: 0; background: var(--bg-body); z-index: 1; border-bottom: 1px solid var(--border-color);">'
new_thead = '<thead style="position: sticky; top: 0; background: #ffffff; z-index: 10; border-bottom: 1px solid var(--border-color); box-shadow: 0 1px 3px rgba(0,0,0,0.1);">'
content = content.replace(old_thead, new_thead)

with open("popup.html", "w") as f:
    f.write(content)
