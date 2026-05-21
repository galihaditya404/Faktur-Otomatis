import re

with open("style.css", "r") as f:
    content = f.read()

# Make the toast smaller
content = content.replace("""
.toast {
    width: 280px;
    background: rgba(26, 26, 36, 0.85);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    padding: 16px;""", """
.toast {
    width: 240px;
    background: rgba(26, 26, 36, 0.85);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    padding: 12px;""")

content = content.replace("""
.toast-title {
    font-size: 14px;
    font-weight: 600;
    color: #ffffff;
    margin-bottom: 4px;
}

.toast-message {
    font-size: 12px;""", """
.toast-title {
    font-size: 12px;
    font-weight: 600;
    color: #ffffff;
    margin-bottom: 2px;
}

.toast-message {
    font-size: 10px;""")

content = content.replace("""
.toast-icon {
    font-size: 20px;
    line-height: 1;
    margin-top: 2px;
}""", """
.toast-icon {
    font-size: 16px;
    line-height: 1;
    margin-top: 0px;
}""")


with open("style.css", "w") as f:
    f.write(content)
