import re

with open("popup.js", "r") as f:
    content = f.read()

old_logic = """            const logLine2 = document.createElement('tr');
            
            const timeMatch = safeText.match(/^\[(.*?)\]\s*(.*)/);
            const waktu = timeMatch ? timeMatch[1] : '';
            const restOfText = timeMatch ? timeMatch[2] : safeText;
            
            let statusHtml = '<span style="background:#f1f5f9; color:#475569; padding:2px 6px; border-radius:4px; font-weight:bold;">INFO</span>';
            let bgRow = '';
            
            if (restOfText.includes('[BERHASIL]')) {
                statusHtml = '<span style="background:#dcfce7; color:#166534; padding:2px 6px; border-radius:4px; font-weight:bold;">SUKSES</span>';
                bgRow = 'background-color: #f0fdf4;';
            } else if (restOfText.includes('[GAGAL]')) {
                statusHtml = '<span style="background:#fee2e2; color:#991b1b; padding:2px 6px; border-radius:4px; font-weight:bold;">GAGAL</span>';
                bgRow = 'background-color: #fef2f2;';
            } else if (restOfText.includes('[LEWAT]')) {
                statusHtml = '<span style="background:#fef9c3; color:#854d0e; padding:2px 6px; border-radius:4px; font-weight:bold;">SKIP</span>';
                bgRow = 'background-color: #fffbeb;';
            } else if (restOfText.includes('[PROSES]')) {
                statusHtml = '<span style="background:#dbeafe; color:#1e40af; padding:2px 6px; border-radius:4px; font-weight:bold;">PROSES</span>';
            }
            
            let noFaktur = '-';
            const fakturMatch = restOfText.match(/Faktur (\d+)/i);
            if (fakturMatch) {
                noFaktur = fakturMatch[1];
            }
            
            if (bgRow) logLine2.style = bgRow;
            
            logLine2.innerHTML = `
                <td style="padding: 6px; border-bottom: 1px solid var(--border-color); white-space: nowrap;">${waktu}</td>
                <td style="padding: 6px; border-bottom: 1px solid var(--border-color); font-family: monospace;">${noFaktur}</td>
                <td style="padding: 6px; border-bottom: 1px solid var(--border-color);">${statusHtml}</td>
                <td style="padding: 6px; border-bottom: 1px solid var(--border-color);">${restOfText}</td>
            `;
            fragment2.appendChild(logLine2);"""

new_logic = """            const timeMatch = safeText.match(/^\[(.*?)\]\s*(.*)/);
            const waktu = timeMatch ? timeMatch[1] : '';
            const restOfText = timeMatch ? timeMatch[2] : safeText;
            
            let statusHtml = '';
            let bgRow = '';
            let isInfo = true;
            
            if (restOfText.includes('[BERHASIL]')) {
                statusHtml = '<span style="background:#dcfce7; color:#166534; padding:2px 6px; border-radius:4px; font-weight:bold;">SUKSES</span>';
                bgRow = 'background-color: #f0fdf4;';
                isInfo = false;
            } else if (restOfText.includes('[GAGAL]')) {
                statusHtml = '<span style="background:#fee2e2; color:#991b1b; padding:2px 6px; border-radius:4px; font-weight:bold;">GAGAL</span>';
                bgRow = 'background-color: #fef2f2;';
                isInfo = false;
            } else if (restOfText.includes('[LEWAT]')) {
                statusHtml = '<span style="background:#fef9c3; color:#854d0e; padding:2px 6px; border-radius:4px; font-weight:bold;">SKIP</span>';
                bgRow = 'background-color: #fffbeb;';
                isInfo = false;
            } else if (restOfText.includes('[PROSES]')) {
                statusHtml = '<span style="background:#dbeafe; color:#1e40af; padding:2px 6px; border-radius:4px; font-weight:bold;">PROSES</span>';
                isInfo = false;
            } else if (restOfText.includes('[NULL]')) {
                statusHtml = '<span style="background:#f3f4f6; color:#374151; padding:2px 6px; border-radius:4px; font-weight:bold;">NULL</span>';
                bgRow = 'background-color: #f9fafb;';
                isInfo = false;
            }
            
            if (!isInfo) {
                const logLine2 = document.createElement('tr');
                let noFaktur = '-';
                const fakturMatch = restOfText.match(/Faktur (\d+)/i);
                if (fakturMatch) {
                    noFaktur = fakturMatch[1];
                }
                
                if (bgRow) logLine2.style = bgRow;
                
                logLine2.innerHTML = `
                    <td style="padding: 6px; border-bottom: 1px solid var(--border-color); white-space: nowrap;">${waktu}</td>
                    <td style="padding: 6px; border-bottom: 1px solid var(--border-color); font-family: monospace;">${noFaktur}</td>
                    <td style="padding: 6px; border-bottom: 1px solid var(--border-color);">${statusHtml}</td>
                    <td style="padding: 6px; border-bottom: 1px solid var(--border-color);">${restOfText}</td>
                `;
                fragment2.appendChild(logLine2);
            }"""

content = content.replace(old_logic, new_logic)

with open("popup.js", "w") as f:
    f.write(content)
