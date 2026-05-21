// Test script for the Clear Filter functionality
// This simulates the Clear Filter step that was added to the automation

// Mock DOM environment for testing
const { JSDOM } = require('jsdom');
const dom = new JSDOM(`
<!DOCTYPE html>
<html>
<body>
    <button type="button" class="p-element p-ripple ct-ovw-btn-mini-cancel mr-2 p-button p-component p-button-icon-only ng-star-inserted">
        <span class="p-button-icon pi pi-filter-slash" aria-hidden="true"></span>
        <span class="p-ink"></span>
    </button>
</body>
</html>
`);

global.window = dom.window;
global.document = dom.window.document;

// Test function to find the Clear Filter button
function testFindClearFilterButton() {
    console.log('Testing Clear Filter button detection...');

    // Same selectors as in the actual code
    const clearFilterSelectors = [
        'button.p-column-filter-clear-button.p-link span.pi.pi-filter-slash',
        'button.p-column-filter-clear-button span.pi-filter-slash',
        'button[class*="filter"][class*="clear"] span.pi.pi-filter-slash',
        'button span.pi.pi-filter-slash',
        '.pi.pi-filter-slash'
    ];

    let clearFilterButton = null;
    let foundSelector = null;

    for (const selector of clearFilterSelectors) {
        const elements = document.querySelectorAll(selector);

        // Cari elemen yang visible dan memiliki parent button
        for (const element of elements) {
            const parentButton = element.closest('button');
            if (parentButton &&
                (parentButton.offsetWidth > 0 || parentButton.offsetHeight > 0)) {
                clearFilterButton = parentButton;
                foundSelector = selector;
                console.log(`✓ Found Clear Filter button with selector: ${selector}`);
                break;
            }
        }

        if (clearFilterButton) break;
    }

    if (clearFilterButton) {
        console.log('✓ Clear Filter button test PASSED');
        console.log(`  - Button element:`, clearFilterButton.tagName);
        console.log(`  - Button classes:`, clearFilterButton.className);
        console.log(`  - Icon found:`, clearFilterButton.querySelector('.pi.pi-filter-slash') ? 'Yes' : 'No');
        return true;
    } else {
        console.log('✗ Clear Filter button test FAILED');
        return false;
    }
}

// Run the test
console.log('=== Clear Filter Functionality Test ===\n');
testFindClearFilterButton();
console.log('\nTest completed.');