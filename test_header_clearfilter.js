// Test script for the Header Clear Filter functionality
// This simulates finding the Clear Filter button in the table header

const { JSDOM } = require('jsdom');

// Create a DOM that matches the HTML structure provided
const dom = new JSDOM(`
<!DOCTYPE html>
<html>
<body>
    <div class="p-datatable-header ng-star-inserted">
        <div class="p-d-inline-blok ng-star-inserted">
            <span class="float-left ng-star-inserted">
                <button type="button" pbutton="" pripple="" icon="pi pi-refresh" tooltipposition="bottom" ptooltip="Refresh" class="p-element p-ripple ct-ovw-btn-mini-cancel mr-2 p-button p-component p-button-icon-only ng-star-inserted">
                    <span class="p-button-icon pi pi-refresh" aria-hidden="true"></span>
                    <span class="p-ink"></span>
                </button>
                <button type="button" pbutton="" pripple="" icon="pi pi-file" tooltipposition="bottom" ptooltip="Ekspor ke CSV" class="p-element p-ripple ct-ovw-btn-mini-gray mr-2 p-button p-component p-button-icon-only">
                    <span class="p-button-icon pi pi-file" aria-hidden="true"></span>
                    <span class="p-ink"></span>
                </button>
                <button type="button" pbutton="" pripple="" icon="pi pi-filter-slash" tooltipposition="bottom" ptooltip="Setel Ulang Filter" class="p-element p-ripple ct-ovw-btn-mini-cancel mr-2 p-button p-component p-button-icon-only ng-star-inserted">
                    <span class="p-button-icon pi pi-filter-slash" aria-hidden="true"></span>
                    <span class="p-ink"></span>
                </button>
            </span>
        </div>
    </div>
</body>
</html>
`);

global.window = dom.window;
global.document = dom.window.document;

// Test function to find the Clear Filter button in table header
function testFindHeaderClearFilterButton() {
    console.log('Testing Header Clear Filter button detection...\n');

    // Priority 1: Find in table header
    const tableHeader = document.querySelector('.p-datatable-header');
    console.log('1. Searching in table header...');

    let clearFilterButton = null;
    let foundSelector = null;
    let testResults = [];

    if (tableHeader) {
        console.log('   ✓ Table header found');
        testResults.push('Table header found');

        // Search for button with specific attribute
        clearFilterButton = tableHeader.querySelector('button[ptooltip="Setel Ulang Filter"]');
        if (clearFilterButton) {
            console.log('   ✓ Clear Filter button found via ptooltip attribute');
            testResults.push('Clear Filter button found via ptooltip');
            foundSelector = 'table header button with ptooltip="Setel Ulang Filter"';
        }
    } else {
        console.log('   ✗ Table header not found');
        testResults.push('Table header not found');
    }

    // Priority 2: General selectors
    if (!clearFilterButton) {
        console.log('\n2. Trying general selectors...');

        const clearFilterSelectors = [
            '.p-datatable-header button[ptooltip="Setel Ulang Filter"]',
            '.p-datatable-header button[tooltipposition="bottom"] span.pi-filter-slash',
            'button.ct-ovw-btn-mini-cancel[ptooltip="Setel Ulang Filter"]',
            'button.p-button-icon-only[ptooltip="Setel Ulang Filter"]',
            '.p-datatable-header .pi.pi-filter-slash'
        ];

        for (const selector of clearFilterSelectors) {
            const elements = document.querySelectorAll(selector);
            if (elements.length > 0) {
                console.log(`   ✓ Found ${elements.length} element(s) with selector: ${selector}`);
                testResults.push(`Found ${elements.length} elements with: ${selector}`);

                for (const element of elements) {
                    const button = element.tagName === 'BUTTON' ? element : element.closest('button');

                    if (button && button.getAttribute('ptooltip') === 'Setel Ulang Filter') {
                        clearFilterButton = button;
                        foundSelector = selector;
                        console.log('   ✓ Correct button found!');
                        break;
                    }
                }
                if (clearFilterButton) break;
            }
        }
    }

    // Priority 3: Class-specific search
    if (!clearFilterButton) {
        console.log('\n3. Searching by class attributes...');

        const allButtons = document.querySelectorAll('button.ct-ovw-btn-mini-cancel');
        console.log(`   Found ${allButtons.length} buttons with ct-ovw-btn-mini-cancel class`);

        for (let i = 0; i < allButtons.length; i++) {
            const btn = allButtons[i];
            const hasIcon = btn.querySelector('.pi.pi-filter-slash');
            const hasTooltip = btn.getAttribute('ptooltip') === 'Setel Ulang Filter';

            console.log(`   Button ${i + 1}: hasIcon=${!!hasIcon}, hasTooltip=${hasTooltip}`);

            if (hasIcon && hasTooltip) {
                clearFilterButton = btn;
                foundSelector = 'button.ct-ovw-btn-mini-cancel with pi-filter-slash icon';
                console.log('   ✓ Clear Filter button found by class!');
                break;
            }
        }
    }

    // Results
    console.log('\n=== TEST RESULTS ===');
    if (clearFilterButton) {
        console.log('✓ Header Clear Filter button test PASSED');
        console.log(`  - Found via: ${foundSelector}`);
        console.log(`  - Button classes: ${clearFilterButton.className}`);
        console.log(`  - Has pi-filter-slash icon: ${!!clearFilterButton.querySelector('.pi.pi-filter-slash')}`);
        console.log(`  - Tooltip: ${clearFilterButton.getAttribute('ptooltip')}`);

        // Simulate click
        clearFilterButton.click();
        console.log('  - Click simulation successful');

        return true;
    } else {
        console.log('✗ Header Clear Filter button test FAILED');
        testResults.forEach(result => console.log(`  - ${result}`));
        return false;
    }
}

// Run the test
console.log('=== Header Clear Filter Functionality Test ===\n');
const result = testFindHeaderClearFilterButton();
console.log(`\nOverall result: ${result ? 'PASSED' : 'FAILED'}`);