import re

with open("content_script.js", "r") as f:
    content = f.read()

# Fix targetMonthName to use automationData.bulanDipilih
old_month_logic = """            let targetMonthName = "ALL";
            if (masaDetails?.label) {
                targetMonthName = masaDetails.label;
            }"""

new_month_logic = """            let targetMonthName = "ALL";
            if (masaDetails?.label) {
                targetMonthName = masaDetails.label;
            } else if (automationData.bulanDipilih && automationData.bulanDipilih !== "") {
                targetMonthName = automationData.bulanDipilih;
            }"""
content = content.replace(old_month_logic, new_month_logic)

# Fix hardcoded "2026" in subsequent invoices retry
content = content.replace('const filterTahun2026Berhasil = await filterTahunPajakHeader("2026");', 'const filterTahun2026Berhasil = await filterTahunPajakHeader(alternateYear);')
content = content.replace('const hasilRetry2026 = await prosesSatuFaktur(faktur, automationData.bulanDipilih, automationData.tahunDipilih, automationData.aksiFinal);', 'const hasilRetry2026 = await prosesSatuFaktur(faktur, automationData.bulanDipilih, alternateYear, automationData.aksiFinal);')
content = content.replace('SUKSES memproses faktur ${faktur} dengan tahun 2026', 'SUKSES memproses faktur ${faktur} dengan tahun ${alternateYear}')
content = content.replace('SUCCESS with year 2026', 'SUCCESS with year ${alternateYear}')
content = content.replace('GAGAL memproses faktur ${faktur} dengan tahun 2026', 'GAGAL memproses faktur ${faktur} dengan tahun ${alternateYear}')
content = content.replace('FAILED with year 2026', 'FAILED with year ${alternateYear}')
content = content.replace('Faktur ${faktur} tidak ditemukan di tahun 2025 maupun 2026', 'Faktur ${faktur} tidak ditemukan di tahun ${initialYear} maupun ${alternateYear}')
content = content.replace('not found in 2025 or 2026', 'not found in ${initialYear} or ${alternateYear}')
content = content.replace('not found after checking 2025 and 2026', 'not found after checking ${initialYear} and ${alternateYear}')
content = content.replace('Invoice success with year 2026', 'Invoice success with alternate year')
content = content.replace('Year 2026 filter failed', 'Alternate year filter failed')

with open("content_script.js", "w") as f:
    f.write(content)
