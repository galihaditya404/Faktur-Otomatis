import re

with open("content_script.js", "r") as f:
    content = f.read()

old_code = """
    //  ENHANCED PANEL DETECTION: Improved retry mechanism with better validation
    console.log("Content script: [DIAGNOSIS DROPDOWN] Waiting for panel to appear...");
    let panel = await waitForElement('.p-dropdown-panel.p-component:not(.p-hidden)', 3000);
"""

new_code = """
    //  ENHANCED PANEL DETECTION: Improved retry mechanism with better validation
    console.log("Content script: [DIAGNOSIS DROPDOWN] Waiting for panel to appear...");
    
    // Custom robust wait for the most recently opened panel
    let panel = null;
    for(let w = 0; w < 30; w++) {
        assertNotStopped();
        const panels = Array.from(document.querySelectorAll('.p-dropdown-panel:not(.p-hidden)'));
        const visiblePanels = panels.filter(p => p.offsetWidth > 0 && window.getComputedStyle(p).display !== 'none');
        if (visiblePanels.length > 0) {
            panel = visiblePanels[visiblePanels.length - 1]; // The most recently appended panel is usually the active one
            break;
        }
        await new Promise(r => setTimeout(r, 100));
    }
"""

content = content.replace(old_code, new_code)

with open("content_script.js", "w") as f:
    f.write(content)
