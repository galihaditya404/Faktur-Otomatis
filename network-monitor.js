// network-monitor.js - Network Response Monitor for E-Faktur Automation
// This script monitors fetch/XHR responses for 401/502 errors
// Injected into the page context to intercept network responses

(function() {
    'use strict';
    
    // Prevent multiple installations
    if (window.__efNetworkMonitorInstalled) {
        return;
    }
    window.__efNetworkMonitorInstalled = true;

    /**
     * Post message to content script
     * @param {string} type - Message type
     * @param {object} payload - Message payload
     */
    function postToContentScript(type, payload) {
        try {
            window.postMessage({
                source: 'ef-network-monitor',
                type: type,
                payload: payload
            }, '*');
        } catch (e) {
            // Silent fail - don't break page functionality
        }
    }

    /**
     * Normalize string value safely
     * @param {*} value - Value to normalize
     * @returns {string}
     */
    function normalize(value) {
        try {
            return String(value || '');
        } catch (e) {
            return '';
        }
    }

    /**
     * Extract URL from various input types
     * @param {*} input - Request input
     * @returns {string}
     */
    function extractUrl(input) {
        if (!input) {
            return '';
        }
        if (typeof input === 'string') {
            return input;
        }
        if (input && typeof input === 'object') {
            if (typeof input.url === 'string') {
                return input.url;
            }
            if (typeof input.href === 'string') {
                return input.href;
            }
        }
        return '';
    }

    /**
     * Notify content script about server error
     * @param {Response} response - Fetch response object
     * @param {*} request - Original request
     */
    function notifyServerError(response, request) {
        if (!response) {
            return;
        }
        
        const status = Number(response.status || 0);
        
        // Only report 401 (Unauthorized) and 502 (Bad Gateway) errors
        if (status === 401 || status === 502) {
            postToContentScript('EF_SERVER_ERROR', {
                status: status,
                statusText: normalize(response.statusText),
                url: normalize(response.url || extractUrl(request))
            });
        }
    }

    // Store original fetch
    const originalFetch = window.fetch;
    
    // Override fetch if available
    if (typeof originalFetch === 'function') {
        window.fetch = function() {
            const args = Array.from(arguments);
            
            return originalFetch.apply(this, args)
                .then(function(response) {
                    try {
                        notifyServerError(response, args[0]);
                    } catch (e) {
                        // Silent fail
                    }
                    return response;
                })
                .catch(function(error) {
                    try {
                        const status = Number(error && error.status);
                        if (status === 401 || status === 502) {
                            postToContentScript('EF_SERVER_ERROR', {
                                status: status,
                                statusText: normalize(error.statusText || error.message),
                                url: normalize(error.url || extractUrl(args[0]))
                            });
                        }
                    } catch (e) {
                        // Silent fail
                    }
                    throw error;
                });
        };
    }

    // Override XMLHttpRequest
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function(method, url) {
        this.__efUrl = url;
        this.__efMethod = method;
        return originalOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function() {
        const xhr = this;
        
        xhr.addEventListener('loadend', function() {
            const status = Number(xhr.status || 0);
            
            if (status === 401 || status === 502) {
                postToContentScript('EF_SERVER_ERROR', {
                    status: status,
                    statusText: normalize(xhr.statusText),
                    url: normalize(xhr.responseURL || xhr.__efUrl || '')
                });
            }
        });
        
        return originalSend.apply(this, arguments);
    };

    // Log successful installation (only in development)
    if (typeof console !== 'undefined' && console.log) {
        console.log('E-Faktur Network Monitor: Installed successfully');
    }
})();
