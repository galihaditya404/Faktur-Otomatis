with open("content_script.js", "r") as f:
    content = f.read()

old_code = """
    } catch (unexpectedError) {
        if (unexpectedError instanceof SessionLogoutError) {
"""

new_code = """
    } catch (unexpectedError) {
        if (unexpectedError instanceof AutomationAbortError) {
            console.warn("Content script: Automation aborted by user");
            if (finalizeCalled) return;
            updateStatus("Otomatisasi dihentikan seketika oleh pengguna.", "stopped", totalBerhasil, true, totalBerhasil, fakturList.length);
            await finalizeAutomation(MachineState.STOPPED, totalBerhasil, fakturList.length);
            return;
        }
        if (unexpectedError instanceof SessionLogoutError) {
"""

content = content.replace(old_code, new_code)

with open("content_script.js", "w") as f:
    f.write(content)
