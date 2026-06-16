import re

with open("popup.js", "r") as f:
    content = f.read()

old_logic = """        // Reset stats
        const statSukses = document.getElementById('stat-sukses');
        const statGagal = document.getElementById('stat-gagal');
        const statNull = document.getElementById('stat-null');
        if(statSukses) statSukses.textContent = '0';
        if(statGagal) statGagal.textContent = '0';
        if(statNull) statNull.textContent = '0';
    } else {
        const fragment1 = document.createDocumentFragment();
        const fragment2 = document.createDocumentFragment();
        
        let countSukses = 0;
        let countGagal = 0;
        let countNull = 0;

        logs.forEach((entry) => {
            const rawEntry = typeof entry === 'string' ? entry : String(entry ?? '');
            const safeText = sanitizeLogMessage(rawEntry);
            
            const logLine1 = document.createElement('div');
            logLine1.textContent = safeText;
            fragment1.appendChild(logLine1);
            
            // Tab 2 Table Row
            const timeMatch = safeText.match(/^\[(.*?)\]\s*(.*)/);
            const waktu = timeMatch ? timeMatch[1] : '';
            const restOfText = timeMatch ? timeMatch[2] : safeText;
            
            let statusHtml = '';
            let bgRow = '';
            let isInfo = true;
            
            if (restOfText.includes('[BERHASIL]')) {
                statusHtml = '<span style="background:#dcfce7; color:#166534; padding:2px 6px; border-radius:4px; font-weight:bold;">SUKSES</span>';
                bgRow = 'background-color: #f0fdf4;';
                isInfo = false;
                countSukses++;
            } else if (restOfText.includes('[GAGAL]')) {
                statusHtml = '<span style="background:#fee2e2; color:#991b1b; padding:2px 6px; border-radius:4px; font-weight:bold;">GAGAL</span>';
                bgRow = 'background-color: #fef2f2;';
                isInfo = false;
                countGagal++;
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
                countNull++;
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
            }
        });
        if (statusLog1) statusLog1.appendChild(fragment1);
        if (statusLog2) statusLog2.appendChild(fragment2);
        
        // Update stats UI
        const statSukses = document.getElementById('stat-sukses');
        const statGagal = document.getElementById('stat-gagal');
        const statNull = document.getElementById('stat-null');
        if(statSukses) statSukses.textContent = countSukses;
        if(statGagal) statGagal.textContent = countGagal;
        if(statNull) statNull.textContent = countNull;
    }"""

new_logic = """        // Reset stats
        const statSukses = document.getElementById('stat-sukses');
        const statGagal = document.getElementById('stat-gagal');
        const statSkip = document.getElementById('stat-skip');
        const statDurasi = document.getElementById('stat-durasi');
        if(statSukses) statSukses.textContent = '0';
        if(statGagal) statGagal.textContent = '0';
        if(statSkip) statSkip.textContent = '0';
        if(statDurasi) statDurasi.textContent = '00:00';
    } else {
        const fragment1 = document.createDocumentFragment();
        const fragment2 = document.createDocumentFragment();
        
        let countSukses = 0;
        let countGagal = 0;
        let countSkip = 0;
        
        let firstLogTime = null;
        let lastLogTime = null;

        logs.forEach((entry) => {
            const rawEntry = typeof entry === 'string' ? entry : String(entry ?? '');
            const safeText = sanitizeLogMessage(rawEntry);
            
            const logLine1 = document.createElement('div');
            logLine1.textContent = safeText;
            fragment1.appendChild(logLine1);
            
            // Tab 2 Table Row
            const timeMatch = safeText.match(/^\[(.*?)\]\s*(.*)/);
            const waktu = timeMatch ? timeMatch[1] : '';
            const restOfText = timeMatch ? timeMatch[2] : safeText;
            
            if (timeMatch) {
                const d = new Date(new Date().toDateString() + " " + timeMatch[1]);
                if (!isNaN(d.getTime())) {
                    if (!firstLogTime) firstLogTime = d.getTime();
                    lastLogTime = d.getTime();
                }
            }
            
            let statusHtml = '';
            let bgRow = '';
            let isInfo = true;
            
            if (restOfText.includes('[BERHASIL]')) {
                statusHtml = '<span style="background:#dcfce7; color:#166534; padding:2px 6px; border-radius:4px; font-weight:bold;">SUKSES</span>';
                bgRow = 'background-color: #f0fdf4;';
                isInfo = false;
                countSukses++;
            } else if (restOfText.includes('[GAGAL]')) {
                statusHtml = '<span style="background:#fee2e2; color:#991b1b; padding:2px 6px; border-radius:4px; font-weight:bold;">GAGAL</span>';
                bgRow = 'background-color: #fef2f2;';
                isInfo = false;
                countGagal++;
            } else if (restOfText.includes('[LEWAT]') || restOfText.includes('[SKIP]')) {
                statusHtml = '<span style="background:#fef9c3; color:#854d0e; padding:2px 6px; border-radius:4px; font-weight:bold;">SKIP</span>';
                bgRow = 'background-color: #fffbeb;';
                isInfo = false;
                countSkip++;
            } else if (restOfText.includes('[PROSES]')) {
                statusHtml = '<span style="background:#dbeafe; color:#1e40af; padding:2px 6px; border-radius:4px; font-weight:bold;">PROSES</span>';
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
            }
        });
        if (statusLog1) statusLog1.appendChild(fragment1);
        if (statusLog2) statusLog2.appendChild(fragment2);
        
        // Update stats UI
        const statSukses = document.getElementById('stat-sukses');
        const statGagal = document.getElementById('stat-gagal');
        const statSkip = document.getElementById('stat-skip');
        const statDurasi = document.getElementById('stat-durasi');
        if(statSukses) statSukses.textContent = countSukses;
        if(statGagal) statGagal.textContent = countGagal;
        if(statSkip) statSkip.textContent = countSkip;
        if(statDurasi && firstLogTime && lastLogTime) {
            let diffSec = Math.floor((lastLogTime - firstLogTime) / 1000);
            if(diffSec < 0) diffSec = 0;
            const m = Math.floor(diffSec / 60).toString().padStart(2, '0');
            const s = (diffSec % 60).toString().padStart(2, '0');
            statDurasi.textContent = `${m}:${s}`;
        }
    }"""

content = content.replace(old_logic, new_logic)

with open("popup.js", "w") as f:
    f.write(content)
