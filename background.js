// background.js

chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

// Listener for messages from the popup.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    (async () => {
        // --- Automation-related messages ---
        if (message.type === 'START_AUTOMATION' || message.type === 'STOP_AUTOMATION' || message.type === 'START_DOWNLOAD_AUTOMATION' ||
            message.type === 'START_PDF_DOWNLOAD' || message.type === 'STOP_PDF_DOWNLOAD' ||
            message.type === 'START_PDF_MASUKAN_DOWNLOAD' || message.type === 'STOP_PDF_MASUKAN_DOWNLOAD' ||
            message.type === 'START_DOWNLOAD_KELUARAN_AUTOMATION') {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (!tab || !tab.url.startsWith("https://coretaxdjp.pajak.go.id")) {
                sendResponse({ success: false, message: 'No active Coretax tab found.' });
                return;
            }

            try {
                await chrome.tabs.sendMessage(tab.id, { type: 'CHECK_READY' });
                const response = await chrome.tabs.sendMessage(tab.id, { type: message.type, data: message.data });
                sendResponse(response);
            } catch (error) {
                try {
                    await chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        files: ['content_script.js']
                    });
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    
                    const response = await chrome.tabs.sendMessage(tab.id, { type: message.type, data: message.data });
                    sendResponse(response);
                } catch (injectError) {
                    sendResponse({ success: false, message: `Connection failed: ${error.message}` });
                }
            }
            return;
        }

        // --- Status messages from content script to popup ---
        if (message.type === 'automation-status') {
            const senderUrl = sender?.url || sender?.tab?.url || '';
            if (!senderUrl.startsWith('https://coretaxdjp.pajak.go.id/')) return;

            chrome.runtime.sendMessage({
                type: 'automation-status',
                statusType: message.statusType,
                message: message.message,
                invoicesProcessed: message.invoicesProcessed,
                isFinalCompletion: message.isFinalCompletion
            });
            return;
        }

        if (message.type === 'pdf-download-status' || message.type === 'pdf-masukan-download-status') {
            const senderUrl = sender?.url || sender?.tab?.url || '';
            if (senderUrl.startsWith('https://coretaxdjp.pajak.go.id/')) {
                chrome.runtime.sendMessage(message);
            }
            return;
        }

        if (message.type === 'open-side-panel') {
            await chrome.sidePanel.open({ tabId: sender.tab.id });
            sendResponse({success: true});
        }
    })();
    return true;
});
