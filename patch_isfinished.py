with open("popup.js", "r") as f:
    content = f.read()

old_code = "const isFinished = request.statusType === 'success' || request.statusType === 'error' || request.statusType === 'final' || request.statusType === 'final_completion';"
new_code = "const isFinished = request.statusType === 'success' || request.statusType === 'error' || request.statusType === 'final' || request.statusType === 'final_completion' || request.statusType === 'stopped';"

content = content.replace(old_code, new_code)

with open("popup.js", "w") as f:
    f.write(content)
