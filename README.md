# E-Faktur Automation

**Version:** 2.0
**Description:** Otomatisasikan Proses Kreditkan Pajak Masukan, Sekali Klik Beres Semua.

## 📋 Profil

**E-Faktur Automation** adalah ekstensi browser Chrome yang dirancang untuk membantu Wajib Pajak dan konsultan pajak dalam mengelola Faktur Pajak Masukan di sistem Coretax DJP. Alat ini mengotomatisasi tugas-tugas repetitif seperti mengubah masa pajak, mengkreditkan faktur, dan mengunduh data dalam jumlah besar, sehingga menghemat waktu dan meminimalkan kesalahan manusia.

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

## ⚙️ Cara Kerja

Ekstensi ini bekerja sebagai jembatan antara pengguna dan antarmuka web Coretax.

### Flow Diagram

```mermaid
graph TD
    User[User] -->|Interacts| Popup[Extension Popup UI]
    Popup -->|Login via Google| Auth[Firebase Auth]
    
    subgraph "Automation Process"
        Popup -->|Upload CSV & Config| ContentScript[Content Script]
        ContentScript -->|Injects/Manipulates DOM| Coretax[Coretax Web Page]
        Coretax -->|Responses| ContentScript
        ContentScript -->|Status Updates| Popup
    end

    subgraph "Download Process"
        Popup -->|Select Month| ContentScript
        ContentScript -->|Iterate Pages| Coretax
        Coretax -->|Download Trigger| Browser[Browser Download]
    end

    subgraph "Merge Excel Process"
        User -->|Select Files| Popup
        Popup -->|Read Files (ArrayBuffer)| Memory[Browser Memory]
        Memory -->|Process with SheetJS| MergedData[Merged Data]
        MergedData -->|Create Blob| UserDownload[Download Merged File]
    end
    
    style User fill:#f9f,stroke:#333,stroke-width:2px
    style Coretax fill:#ccf,stroke:#333,stroke-width:2px
    style Popup fill:#cfc,stroke:#333,stroke-width:2px
```

### Penjelasan Proses

1.  **Login & Autentikasi**:
    - User login menggunakan akun Google via Firebase Authentication.
    - Status langganan dan kuota dicek untuk mengaktifkan fitur premium.

2.  **Proses Otomatisasi**:
    - User mengunggah file CSV berisi daftar Nomor Faktur.
    - Ekstensi membaca file dan mengirimkan instruksi ke *Content Script* yang berjalan di halaman Coretax.
    - *Content Script* mencari faktur berdasarkan nomor, mengubah masa pajak, dan menyimpan perubahan sesuai konfigurasi user.
    - Log aktivitas ditampilkan secara real-time di Popup.

3.  **Proses Download**:
    - User memilih bulan yang ingin diunduh.
    - Ekstensi menavigasi halaman Coretax, mengklik tombol download, dan menangani paginasi secara otomatis sampai semua data terunduh.

4.  **Proses Gabung Excel**:
    - User memilih file-file Excel dari komputer lokal.
    - Ekstensi menggunakan library `SheetJS` untuk membaca dan menggabungkan data di dalam memori browser.
    - File hasil gabungan dibuat dan diunduh langsung tanpa pernah meninggalkan komputer user.

## 🔒 Security & Privacy

Keamanan data adalah prioritas utama kami. Berikut adalah detail implementasi keamanan:

-   **Client-Side Processing**: Semua proses sensitif, terutama penggabungan file Excel, dilakukan sepenuhnya di sisi klien (browser pengguna). **Tidak ada file Excel atau data pajak yang diunggah ke server kami.**
-   **Firebase Authentication**: Kami menggunakan Google Firebase untuk autentikasi yang aman. Kami hanya menyimpan email dan status langganan. Password akun Google Anda tidak pernah kami ketahui.
-   **No External Analytics**: Ekstensi ini tidak menggunakan layanan analitik pihak ketiga yang melacak aktivitas browsing Anda.
-   **Permissions**: Izin yang diminta (seperti `activeTab`, `scripting`) hanya digunakan untuk berinteraksi dengan halaman Coretax saat Anda menjalankan perintah otomatisasi.
-   **Local Library**: Library pihak ketiga seperti `SheetJS` disertakan secara lokal dalam paket ekstensi, bukan dimuat dari CDN eksternal, untuk mencegah potensi risiko keamanan jaringan.

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
-   **Firebase**: Digunakan untuk backend autentikasi dan manajemen user.

---
*Dibuat dengan ❤️ untuk mempermudah pekerjaan perpajakan Anda.*
