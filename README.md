# Faktur Otomatis

**Version:** 1.1
**Description:** Sat Set, Entry Pajak Anti Lelet.

## 📋 Profil

**Faktur Otomatis** adalah ekstensi browser Chrome yang dirancang untuk membantu Wajib Pajak dan konsultan pajak dalam mengelola Faktur Pajak Masukan di sistem Coretax DJP. Alat ini mengotomatisasi tugas-tugas repetitif seperti mengubah masa pajak, mengkreditkan faktur, dan mengunduh data dalam jumlah besar, sehingga menghemat waktu dan meminimalkan kesalahan manusia.

## 🛠️ Fungsi Utama

### 1. Otomatisasi Pajak Masukan
Fitur inti untuk memproses faktur pajak secara massal.
- **Upload CSV/TXT**: Unggah daftar nomor faktur yang ingin diproses.
- **Ubah Masa Pajak**: Secara otomatis mengubah masa pajak faktur ke bulan yang diinginkan (Januari - Desember).
- **Aksi Final**: Tentukan status akhir faktur setelah diubah masa pajaknya:
    - Kreditkan
    - Tidak Dikreditkan
    - Tandai sebagai Tidak Valid
    - Kembali ke status Approved

### 2. Download Data Pajak Masukan
Mengatasi keterbatasan Coretax dalam mengunduh data.
- **Download Massal**: Mengunduh semua halaman data Pajak Masukan secara otomatis.
- **Filter Bulan**: Pilih bulan spesifik untuk diunduh.
- **Format Excel**: Hasil unduhan berupa file Excel (.xlsx) yang siap diolah.
- **Anti-Stop**: Dilengkapi mekanisme *retry* dan *timeout* yang lebih panjang untuk mencegah unduhan berhenti di tengah jalan (misal di halaman 26).

### 3. Gabung File Excel (Tools)
Alat bantu untuk menggabungkan hasil unduhan yang terpecah.
- **Merge Files**: Menggabungkan banyak file Excel menjadi satu sheet tunggal.
- **Smart Header**: Mempertahankan header dari file pertama dan menghapus header dari file berikutnya.
- **Privasi Terjamin**: Proses penggabungan dilakukan 100% di browser (lokal), tanpa upload ke server.



## ℹ️ Informasi Lainnya

### Instalasi
1.  Unduh file ekstensi (format .zip) atau clone repository ini.
2.  Buka Chrome dan navigasi ke `chrome://extensions/`.
3.  Aktifkan "Developer mode" di pojok kanan atas.
4.  Klik "Load unpacked" dan pilih folder ekstensi yang telah diekstrak.

### Persyaratan Sistem
-   **Browser**: Google Chrome versi 120+ atau browser berbasis Chromium lainnya (Edge, Brave).
-   **Koneksi Internet**: Diperlukan untuk akses Coretax dan verifikasi lisensi (login).

### Credits
-   **SheetJS (xlsx)**: Digunakan untuk manipulasi file Excel.

---
*Dibuat Galih Boss Joko untuk mempermudah ACD - ICBP NSF.*
