import re

with open("content_script.js", "r") as f:
    content = f.read()

# Fix targetMonthName to prioritize automationData.bulanDipilih
old_month_logic = """            let targetMonthName = "ALL";
            if (masaDetails?.label) {
                targetMonthName = masaDetails.label;
            } else if (automationData.bulanDipilih && automationData.bulanDipilih !== "") {
                targetMonthName = automationData.bulanDipilih;
            }"""

new_month_logic = """            let targetMonthName = "ALL";
            if (automationData.bulanDipilih && automationData.bulanDipilih !== "") {
                targetMonthName = automationData.bulanDipilih;
            } else if (masaDetails?.label) {
                targetMonthName = masaDetails.label;
            }"""
content = content.replace(old_month_logic, new_month_logic)

with open("content_script.js", "w") as f:
    f.write(content)
