import re

with open("content_script.js", "r") as f:
    content = f.read()

# Replace yearInput.value = tahun; with a more robust version
old_code = """
        // Set the new value
        yearInput.value = tahun;

        // Trigger events to notify Angular/PrimeNG of the change
        yearInput.dispatchEvent(new Event('input', { bubbles: true }));
        yearInput.dispatchEvent(new Event('change', { bubbles: true }));
        yearInput.dispatchEvent(new Event('blur', { bubbles: true }));
"""

new_code = """
        // Set the new value using robust method for Angular/React
        yearInput.value = '';
        yearInput.dispatchEvent(new Event('input', { bubbles: true }));
        
        // Use native setter
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativeInputValueSetter.call(yearInput, tahun);
        
        yearInput.dispatchEvent(new Event('input', { bubbles: true }));
        yearInput.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Enter', code: 'Enter', keyCode: 13 }));
        yearInput.dispatchEvent(new Event('change', { bubbles: true }));
        yearInput.dispatchEvent(new Event('blur', { bubbles: true }));
"""

content = content.replace(old_code, new_code)

with open("content_script.js", "w") as f:
    f.write(content)
