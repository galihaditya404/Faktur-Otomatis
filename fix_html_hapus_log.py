import re

with open("popup.html", "r") as f:
    content = f.read()

old_btn = '<button id="btnHapusLogFitur" class="secondary-action" style="flex: 1;">🗑️ Hapus Log</button>'
new_btn = """<button id="btnHapusLogFitur" style="flex: 1; padding: 10px; background-color: #fef2f2; color: #dc2626; border: 1px solid #fecaca; border-radius: 6px; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; transition: all 0.2s;" onmouseover="this.style.backgroundColor='#fee2e2'" onmouseout="this.style.backgroundColor='#fef2f2'">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        Hapus Log
                    </button>"""

content = content.replace(old_btn, new_btn)

with open("popup.html", "w") as f:
    f.write(content)
