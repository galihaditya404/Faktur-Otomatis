import re

with open("content_script.js", "r") as f:
    content = f.read()

# Add assertNotStopped
assert_func = """
function assertNotStopped() {
    if (currentState === MachineState.STOPPED || currentState === MachineState.ERROR) {
        throw new AutomationAbortError("Proses dihentikan.");
    }
}
"""

content = content.replace("const delay = ms => {", assert_func + "\nconst delay = ms => {\n    assertNotStopped();")
content = content.replace("const smartDelay = (actionType) => {", "const smartDelay = (actionType) => {\n    assertNotStopped();")
content = content.replace("const turboPause = (ms = 600) => {", "const turboPause = (ms = 600) => {\n    assertNotStopped();")
content = content.replace("async function waitForElementSmart(selector, maxWaitMs = 5000, parent = document) {", "async function waitForElementSmart(selector, maxWaitMs = 5000, parent = document) {\n    assertNotStopped();")

# Update catch blocks for AutomationAbortError
content = content.replace("if (unexpectedError instanceof SessionLogoutError || unexpectedError instanceof AutomationAbortError)", "if (unexpectedError instanceof SessionLogoutError || unexpectedError instanceof AutomationAbortError) {")

with open("content_script.js", "w") as f:
    f.write(content)
