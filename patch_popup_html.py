with open("popup.html", "r") as f:
    content = f.read()

toast_html = """
    <!-- Elegant Toast Notification Container -->
    <div id="toast-container" class="toast-container"></div>
    <script src="popup.js"></script>
"""

content = content.replace("<script src=\"popup.js\"></script>", toast_html)

with open("popup.html", "w") as f:
    f.write(content)
