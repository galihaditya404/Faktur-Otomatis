# 📚 DOKUMENTASI LENGKAP - E-Faktur Automation v2.6

**Update Terakhir:** 15 April 2026
**Versi:** 2.6
**Manifest:** Chrome Extension Manifest V3
**Website:** https://alatpajak.id

---

## 📑 DAFTAR ISI

1. [Overview](#1-overview)
2. [Fitur dan Fungsionalitas](#2-fitur-dan-fungsionalitas)
3. [Arsitektur Sistem](#3-arsitektur-sistem)
4. [Cara Kerja Detail](#4-cara-kerja-detail)
5. [Workflow Otomatisasi](#5-workflow-otomatisasi)
6. [Workflow Download](#6-workflow-download)
7. [Workflow Merge Excel](#7-workflow-merge-excel)
8. [Security & Privacy](#8-security--privacy)
9. [Struktur File](#9-struktur-file)
10. [Teknologi & Library](#10-teknologi--library)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. OVERVIEW

### Deskripsi Singkat
**E-Faktur Automation** adalah ekstensi browser Chrome yang mengotomatisasi proses KREDITKAN PAJAK MASUKAN di sistem Coretax DJP. User cukup upload CSV berisi nomor faktur, pilih masa pajak target, dan ekstensi akan:

1. Mencari setiap faktur di Coretax
2. Mengubah masa pajak sesuai target
3. Melakukan aksi final (Kreditkan/Tidak Dikreditkan/Tidak Valid/Back to Approved)

### Target Pengguna
- Wajib Pajak Badan/Orang Pribadi
- Konsultan Pajak
- Bendaharawan
- Siapa saja yang sering mengelola Faktur Pajak Masukan dalam jumlah besar

### Problem Yang Diselesaikan
| Problem Manual | Solusi Otomatis |
|----------------|-----------------|
| Klik satu-satu faktur (100+ faktur) | Upload CSV, selesai dalam hitungan menit |
| Risiko salah klik/ubah masa pajak | Akurasi 100% sesuai CSV |
| Lupa men-kreditkan setelah ubah masa pajak | Aksi final otomatis sesuai pilihan |
| Download data satu per satu (max 50 per halaman) | Download otomatis semua halaman |

---

## 2. FITUR DAN FUNGSIONALITAS

### 🎯 Fitur Utama (Tab 1: Otomatisasi)

#### 2.1 Upload CSV/TXT Faktur
- **Format:** CSV atau TXT (comma-separated)
- **Kolom Wajib:**
  - `Nomor Faktur Pajak 17 digit` - 17 digit nomor faktur
  - `Masa Pajak Faktur` (opsional tapi direkomendasikan) - Untuk filter otomatis
- **Validasi:**
  - Cek format 17 digit
  - Normalisasi format (hapus spasi, titik, strip)
  - Skip duplikat

#### 2.2 Ubah Masa Pajak
- **Pilihan Bulan:** Januari - Desember
- **Pilihan Tahun:** 2025, 2026, 2027
- **Otomatisasi:**
  - Buka detail faktur
  - Buka dropdown "Masa Pajak Dikreditkan"
  - Pilih bulan target
  - Verifikasi perubahan (retry up to 5x)

#### 2.3 Aksi Final
Pilihan status akhir setelah masa pajak diubah:

| Aksi | Keterangan |
|------|------------|
| **Kreditkan** | Memindahkan faktur ke status "Dikreditkan" |
| **Tidak Dikreditkan** | Menandai faktur tidak dapat dikreditkan |
| **Tandai sebagai Tidak Valid** | Menandai faktur tidak valid |
| **Kembali ke status Approved** | Mengembalikan ke status awal |

#### 2.4 Mode Turbo ⚡ (Beta)
- **Fungsi:** Mempercepat proses otomatisasi
- **Cara Kerja:** Mengurangi delay antar langkah menjadi ~30% dari normal
- **Multiplier:**
  - Normal delay: 1000ms → Turbo: 300ms
  - UI update: 800ms → Turbo: 240ms
  - Page refresh: 2000ms → Turbo: 400ms

#### 2.5 Smart Filter Month
- **Otomatis detect bulan dari CSV**
- Jika kolom "Masa Pajak Faktur" diisi, ekstensi akan:
  1. Filter halaman Coretax ke bulan tersebut
  2. Lebih cepat mencari faktur
  3. Tidak perlu iterate 12 bulan

#### 2.6 Real-time Status Logging
- Menampilkan progress secara real-time
- Format: `[HH:MM:SS] Pesan log`
- Scroll otomatis ke bawah
- Persistensi log (tersimpan di chrome.storage.local)
- Export log ke CSV

---

### 🛠️ Fitur Tambahan (Tab 2: Fitur)

#### 2.7 Download Data Pajak Masukan
**Fungsi:** Download massal data Pajak Masukan dari Coretax

**Workflow:**
1. Pilih bulan target
2. Ekstensi menavigasi halaman Coretax
3. Klik tombol download Excel setiap halaman
4. Handle pagination otomatis
5. Retry mechanism untuk halaman lambat

**Improvement v2.0:**
- Timeout ditingkatkan: 10s → 30s
- Initial wait: 1s → 2s
- Bisa handle 50+ halaman tanpa stop

**Output:**
- File Excel per halaman (auto-download oleh browser)
- Nama file: `PajakMasukan_Bulan_XXXX.xlsx`

#### 2.8 Gabung File Excel (Merger Tool)
**Fungsi:** Menggabungkan multiple file Excel menjadi satu sheet

**Fitur:**
- Input: Multiple .xlsx files
- Output: Single sheet named "Gabungan"
- Smart header handling:
  - File 1: Include header
  - File 2+: Skip header (data only)
- Progress bar dengan persentase
- Remove individual file dari list
- Validasi minimal 2 files

**Keamanan:**
- 🔒 **100% Client-Side** - Tidak ada upload ke server
- Semua proses di browser memory
- Files never leave user's computer
- Bisa bekerja offline

**Teknologi:**
- Library: SheetJS (xlsx.full.min.js v0.20.3)
- Local file (bukan CDN)
- Array buffer processing
- Blob URL untuk download

---

### 👤 Sistem Autentikasi & Kuota

#### 2.9 Login System
**Metode Login:**
1. **Email/Password** - Firebase Authentication REST API
2. **Google Sign-In** - Chrome Identity API + Firebase

**Autentikasi Flow:**
```
User → Popup UI → Background.js → Offscreen.js → Firebase Auth
```

**Session Management:**
- Menggunakan Offscreen Document (Manifest V3 requirement)
- Storage: `chrome.storage.session`
- Token refresh otomatis saat expired

#### 2.10 Sistem Kuota
**Tipe Kuota:**

| Tipe | Kuota | Reset |
|------|-------|-------|
| **Free** | 15 faktur/bulan | Tanggal 1 setiap bulan |
| **Premium** | Sesuai paket | Tanggal 1 setiap bulan |

**Tracking Kuota:**
- Free quota: `chrome.storage.local` (lokal)
- Premium quota: Firestore database (`subscriptions/{uid}`)

**Update Kuota:**
- Real-time setelah faktur berhasil diproses
- Retry mechanism (3x) dengan exponential backoff
- Error handling untuk failed updates

#### 2.11 Subscription Management
**Status Langganan:**
- **Active** - Premium aktif
- **Free** - Free tier (15 faktur/bulan)
- **Trial** - Masa trial
- **Expired** - Langganan habis

**UI Indicators:**
- Badge status dengan warna:
  - 🟢 Active (hijau)
  - 🔵 Free (biru)
  - 🟠 Trial (orange)
  - 🔴 Expired (merah)
- Display sisa kuota: `X / Y`
- Display expiry date

---

## 3. ARSITEKTUR SISTEM

### Component Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     CHROME BROWSER                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐      ┌──────────────┐      ┌──────────────┐ │
│  │   Popup UI   │◄────►│ Background   │◄────►│  Offscreen   │ │
│  │  (popup.js)  │      │ (background) │      │  (offscreen) │ │
│  │              │      │     .js)     │      │     .js)     │ │
│  └──────┬───────┘      └──────┬───────┘      └──────┬───────┘ │
│         │                     │                     │          │
│         │ chrome.runtime.*    │                     │          │
│         │ sendMessage         │                     │          │
│         │                     │                     │          │
│         ▼                     ▼                     ▼          │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │                   CONTENT SCRIPT                         │ │
│  │              (content_script.js)                         │ │
│  │          Injected to Coretax Page                        │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │              CORETAX DJP WEBSITE                          │ │
│  │        https://coretaxdjp.pajak.go.id                    │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

#### 3.1 Popup UI (popup.html + popup.js)
**Responsibility:** User Interface & Interaction Management

**Tasks:**
- Login/logout form
- File upload (CSV)
- Configuration (bulan, tahun, aksi)
- Start/stop automation
- Display status & logs
- Tab navigation (Otomatisasi vs Fitur)
- Subscription status display
- Excel merger UI

**Key Functions:**
- `initApp()` - Initialize application
- `checkSubscriptionStatus()` - Check user subscription
- `startAutomation()` - Trigger automation
- `stopAutomation()` - Stop current run
- `mergeExcelFiles()` - Merge Excel files
- `updateAndSaveStatus()` - Add log entry

#### 3.2 Background Service Worker (background.js)
**Responsibility:** Message Routing & Tab Management

**Tasks:**
- Route messages between popup ↔ content script ↔ offscreen
- Manage offscreen document lifecycle
- Handle Google OAuth flow
- Inject content script to Coretab page
- Monitor active tab for Coretax URL

**Key Functions:**
- `getOrCreateOffscreenDocument()` - Create/manages offscreen
- `sendToOffscreen()` - Send message to offscreen
- Handle message types:
  - `START_AUTOMATION`
  - `STOP_AUTOMATION`
  - `START_DOWNLOAD_AUTOMATION`
  - `automation-status` (forward to popup)
  - `sign-in-google`
  - `get-current-user`
  - `get-id-token`
  - `sign-out`

#### 3.3 Offscreen Document (offscreen.js)
**Responsibility:** Authentication & Session Management

**Why Needed:** Manifest V3 tidak mengizinkan service worker menggunakan beberapa APIs (seperti `chrome.storage.session` untuk sensitive data)

**Tasks:**
- Firebase Authentication (REST API)
- Token storage & refresh
- User session persistence
- Login/logout handling

**Key Functions:**
- `handleSignInEmail()` - Email/password login
- `handleSignInWithGoogleToken()` - Google OAuth
- `handleGetCurrentUser()` - Get current user
- `handleGetIdToken()` - Get fresh ID token
- `handleSignOut()` - Logout

**Storage:**
- Primary: `chrome.storage.session`
- Fallback: `sessionStorage` or `Map` (memory)

#### 3.4 Content Script (content_script.js)
**Responsibility:** DOM Manipulation on Coretax Page

**Tasks:**
- Cari faktur berdasarkan nomor
- Ubah masa pajak
- Klik tombol aksi final
- Handle pagination
- Session/logout detection
- Navigation guard (anti-close)
- Smart retry mechanism

**Key Functions:**
- `processBatchInvoices()` - Main automation loop
- `cariFakturDiCoretax()` - Search invoice by number
- `ubahMasaPajak()` - Change tax period dropdown
- `klikTombolFinal()` - Click final action button
- `kembaliKeHalamanUtama()` - Navigate back
- `detectLogoutState()` - Check for logout
- `waitForElement()` - Wait for DOM element

**State Machine:**
```
IDLE → RUNNING → STOPPED/ERROR
   ↻          ↻
```

---

## 4. CARA KERJA DETAIL

### 4.1 Message Passing Flow

```
┌─────────┐                    ┌──────────────┐
│  POPUP  │                    │  BACKGROUND  │
└────┬────┘                    └──────┬───────┘
     │                                │
     │ 1. chrome.runtime.sendMessage  │
     │    {type: 'START_AUTOMATION', │
     │     data: {...}}               │
     ├───────────────────────────────>│
     │                                │
     │                         2. Find active tab
     │                         3. Check URL is Coretax
     │                                │
     │                          4. Inject content script
     │                          (if not exists)
     │                                │
     │ 5. chrome.tabs.sendMessage     │
     │    to content_script           │
     │                                ├──────────────────┐
     │                                │                  │
     │                                │              ┌───┴────┐
     │                                │              │CONTENT │
     │                                │              │ SCRIPT │
     │                                │              └───┬────┘
     │                                │                  │
     │ 6. Process each invoice         │
     │    - Cari faktur                │
     │    - Ubah masa pajak            │
     │    - Klik tombol final          │
     │                                │
     │ 7. chrome.runtime.sendMessage   │
     │    {type: 'automation-status', │
     │     message: '...', ...}        │
     │    <────────────────────────────┤
     │                                │
     │ 8. Update UI dengan status     │
     │                                │
```

### 4.2 Authentication Flow

```
┌─────────┐                    ┌──────────────┐
│  POPUP  │                    │  BACKGROUND  │
└────┬────┘                    └──────┬───────┘
     │                                │
     │ 1. User clicks "Login with     │
     │    Google"                     │
     ├───────────────────────────────>│
     │                                │
     │                          2. chrome.identity.
     │                             launchWebAuthFlow
     │                                │
     │ 3. Google OAuth redirect       │
     │    (in new tab)                 │
     │                                │
     │ 4. Extract ID token from URL   │
     │                                │
     │ 5. Send to offscreen           │
     │    {type: 'sign-in-google-     │
     │     token', idToken: '...'}    │
     │                                ├──────────────────┐
     │                                │                  │
     │                                │             ┌────┴────┐
     │                                │             │OFFSCREEN│
     │                                │             └────┬────┘
     │                                │                  │
     │                          6. Firebase Auth
     │                             signInWithGoogle
     │                             (REST API)
     │                                │
     │                          7. Store user in
     │                             chrome.storage.session
     │                                │
     │ 8. Return user data           │
     │    <────────────────────────────┤
     │                                │
     │ 9. Update UI: show             │
     │    automation section          │
```

### 4.3 DOM Manipulation Flow

```
┌──────────────────────────────────────────────────────────┐
│                   CORETAX PAGE                            │
│                  (content_script.js)                      │
└──────────────────────────────────────────────────────────┘

                          │
         1. Navigate to Pajak Masukan page
                          │
                          ▼
         2. Filter by month (if specified in CSV)
                          │
                          ▼
    ┌─────────────────────────────────────┐
    │  FOR EACH INVOICE IN CSV:          │
    └─────────────────────────────────────┘
                          │
        ┌─────────────────┴─────────────────┐
        │                                   │
        ▼                                   ▼
   3a. Search invoice              3b. Click invoice
       by number                    in table
        │                                   │
        └───────────────┬───────────────────┘
                        │
                        ▼
              4. Wait for detail page
                        │
                        ▼
             5. Find dropdown element
             "Masa Pajak Dikreditkan"
                        │
                        ▼
             6. Click dropdown trigger
                        │
                        ▼
             7. Wait for panel to appear
                        │
                        ▼
             8. Find target month option
                        │
                        ▼
             9. Click month option
                        │
                        ▼
         10. Verify selection (retry 5x)
                        │
                        ▼
         11. Find final action button
             (Kreditkan/Tidak/etc)
                        │
                        ▼
         12. Click action button
                        │
                        ▼
         13. Wait for confirmation
                        │
                        ▼
         14. Navigate back to list
                        │
                        ▼
         15. Send status to popup
                        │
                        ▼
              16. Next invoice...
```

---

## 5. WORKFLOW OTOMATISASI

### Step-by-Step User Journey

#### Prasyarat
- [x] Chrome browser terinstall
- [x] Ekstensi E-Faktur Automation terinstall
- [x] Akun alatpajak.id (free atau premium)
- [x] Coretax DJP terbuka di tab browser
- [x] File CSV siap dengan nomor faktur

---

#### Langkah 1: Login
1. Buka ekstensi (klik icon di Chrome toolbar)
2. Pilih metode login:
   - **Email/Password:** Masukkan email & password alatpajak.id
   - **Google:** Klik "Login dengan Google"
3. Setelah login sukses, muncul info:
   - Email login
   - Status langganan (Free/Premium)
   - Sisa kuota
   - Masa aktif (untuk premium)

---

#### Langkah 2: Persiapan CSV
**Template CSV:**
```csv
Nomor Faktur Pajak 17 digit,Masa Pajak Faktur
01000000000000001,Oktober
01000000000000002,November
01000000000000003,Desember
```

**Tips:**
- Kolom "Masa Pajak Faktur" opsional TAPI direkomendasikan
- Jika diisi, proses lebih cepat (filter otomatis)
- Format bulan: Nama lengkap (Januari, Februari, etc.)

---

#### Langkah 3: Konfigurasi Otomatisasi
1. **Upload CSV:**
   - Klik tombol "Choose File"
   - Pilih file CSV/TXT
   - Sistem validasi dan tampilkan jumlah faktur

2. **Pilih Masa Pajak Target:**
   - Bulan: Dropdown Januari - Desember
   - Tahun: 2025, 2026, atau 2027

3. **Pilih Aksi Final:**
   - Kreditkan
   - Tidak Dikreditkan
   - Tandai sebagai Tidak Valid
   - Kembali ke status Approved

4. **(Optional) Aktifkan Mode Turbo:**
   - Toggle switch untuk mempercepat proses

---

#### Langkah 4: Jalankan Otomatisasi
1. Pastikan pre-flight checklist tercentang:
   - [x] Coretax sudah terbuka
   - [x] Berada di menu Pajak Masukan
   - [x] Tidak ada filter Status aktif
   - [x] File CSV sesuai template

2. Klik tombol "Jalankan Otomatisasi"

3. Tombol berubah menjadi "Hentikan" (bisa stop kapan saja)

---

#### Langkah 5: Monitor Progress
**Real-time Log:**
```
[19:30:45] Memulai otomatisasi...
[19:30:46] Kuota tersisa: 15 / 15
[19:30:47] Memproses 3 faktur...
[19:30:48] Invoice 1/3: 010.000.0000.0000.0001
[19:30:48]  -> Filter ke bulan Oktober...
[19:30:49]  -> Mencari faktur di halaman...
[19:30:50]  -> Faktur ditemukan!
[19:30:51]  -> Membuka detail faktur...
[19:30:52]  -> Mencari dropdown 'Masa Pajak Dikreditkan'...
[19:30:53]  -> Memilih bulan "Desember"...
[19:30:54]  -> Verifikasi berhasil: "Desember 2025"
[19:30:55]  -> Mensimulasikan klik pada tombol "Kreditkan"...
[19:30:56]  -> Kembali ke halaman Pajak Masukan...
[19:30:57] Invoice 2/3: 010.000.0000.0000.0002
...
[19:31:15] ✓ Otomatisasi selesai!
[19:31:15] 3 faktur berhasil diproses.
[19:31:16] Kuota berhasil diperbarui (+3)
[19:31:16] Sisa kuota: 12 / 15
```

---

#### Langkah 6: Verifikasi Hasil
1. Buka Coretax di menu Pajak Masukan
2. Filter berdasarkan:
   - Masa pajak: bulan target yang dipilih
   - Status: status aksi final
3. Pastikan faktur-faktur muncul dengan benar

---

#### Langkah 7: Export Log (Opsional)
1. Klik tombol "Export Log"
2. File CSV terdownload dengan nama: `efaktur_log_YYYY-MM-DD.csv`
3. Berisi semua log dari sesi terakhir

---

### Error Handling

#### Jika Terjadi Error:
1. Log akan menunjukkan error:
   ```
   [19:31:05]  -> GAGAL: Dropdown 'Masa Pajak Dikreditkan' tidak ditemukan.
   [19:31:06] Otomatisasi dihentikan karena error.
   ```

2. Kemungkinan penyebab:
   - Coretax page berubah/rerender
   - Internet connection lambat
   - Element tidak ditemukan
   - Session logout

3. Langkah perbaikan:
   - Refresh Coretax page
   - Pastikan berada di halaman yang benar
   - Jalankan ulang otomatisasi
   - Cek log untuk detail error

---

## 6. WORKFLOW DOWNLOAD

### Fitur Download Data Pajak Masukan

**Tujuan:** Download semua data Pajak Masukan dari Coretax secara otomatis tanpa perlu klik satu per satu.

---

### Langkah-langkah:

#### 1. Buka Tab 2 (Fitur)
```
┌─────────────────────────────────────┐
│  ⚙️ Otomatisasi  │  🗂️ Fitur      │
└─────────────────────────────────────┘
```

#### 2. Pilih Bulan Target
- Dropdown: Januari - Desember
- Tahun: otomatis dari tahun berjalan

#### 3. Klik "Download Data Pajak Masukan"
- Proses otomatis dimulai

#### 4. Proses Automation:
**Yang dilakukan content script:**
1. Navigasi ke halaman Pajak Masukan
2. Filter berdasarkan bulan yang dipilih
3. Cari tombol download Excel
4. Klik tombol download
5. Tunggu file terdownload (browser handle)
6. Klik tombol "Next" untuk halaman berikutnya
7. Ulangi langkah 3-6 sampai tidak ada lagi halaman
8. Tampilkan status: "Selesai! X halaman telah diunduh."

#### 5. Hasil Output:
- File Excel terdownload di folder Downloads
- Nama file: `PajakMasukan_Bulan_XXXX.xlsx` (auto-rename oleh Coretax)
- Jumlah file: Sesuai jumlah halaman

---

### Retry Mechanism (v2.0 Improvement)

**Problem di v1.9:**
- Download stop di halaman 26
- Timeout error

**Solusi v2.0:**
```javascript
// Dulu: 10 detik
maxWaitTime: 10000

// Sekarang: 30 detik
maxWaitTime: 30000

// Initial wait dulu: 1 detik
await new Promise(resolve => setTimeout(resolve, 1000));

// Sekarang: 2 detik
await new Promise(resolve => setTimeout(resolve, 2000));
```

**Result:**
- Bisa download 50+ halaman tanpa masalah
- Handle page reload yang lambat
- Better detection untuk "last page"

---

### Troubleshooting Download

| Error | Penyebab | Solusi |
|-------|----------|--------|
| "Tombol download tidak ditemukan" | Halaman bukan Pajak Masukan | Pastikan di menu yang benar |
| "Timeout waiting for page" | Koneksi lambat | Tunggu, sistem akan retry |
| "No next button found" | Sudah halaman terakhir | Normal, proses selesai |

---

## 7. WORKFLOW MERGE EXCEL

### Fitur Gabung File Excel

**Tujuan:** Menggabungkan banyak file Excel hasil download dari Coretax menjadi satu sheet untuk analisis.

---

### Langkah-langkah:

#### 1. Buka Tab 2 (Fitur)

#### 2. Pilih File Excel
- Klik tombol "Pilih File Excel"
- Bisa pilih multiple file (CTRL + klik)
- File muncul di list:
  ```
  📄 Januari_2024.xlsx  [×]
  📄 Februari_2024.xlsx [×]
  📄 Maret_2024.xlsx    [×]
  ```

#### 3. Validasi
- Minimum: 2 file
- Format: .xlsx atau .xls
- Invalid file otomatis ditolak

#### 4. Klik "Gabung File Excel"
- Progress bar muncul:
  ```
  [████████████████████░░░░] 75% (3/4 files)
  ```

#### 5. Tunggu Proses Selesai
- 100% client-side (tidak upload ke server)
- Processing di browser memory
- Speed: ~1 detik per file (tergantung ukuran)

#### 6. Download Hasil
- Nama file: `Gabungan_Excel_YYYY-MM-DD-HH-MM-SS.xlsx`
- Sheet name: "Gabungan"
- Isi: Semua data digabung dalam satu sheet

---

### Smart Header Handling

**How It Works:**

| File | Row 1 | Row 2+ | Action |
|------|-------|--------|--------|
| File 1 | HEADER | Data 1 | Include ALL |
| File 2 | HEADER | Data 2 | Skip header, data only |
| File 3 | HEADER | Data 3 | Skip header, data only |

**Result:**
```
Header
Data 1 (from File 1)
Data 2 (from File 2)
Data 3 (from File 3)
```

**Benefits:**
- Tidak ada duplikat header
- Clean output
- Siap untuk analisis/pivot

---

### Security & Privacy

🔒 **100% Client-Side Processing**

**Proof:**
1. Buka Chrome DevTools (F12)
2. Tab: Network
3. Klik "Gabung File Excel"
4. **Result:** Tidak ada request network selain blob download

**Data Flow:**
```
User Computer
    ↓
Select Files
    ↓
Browser reads files (ArrayBuffer)
    ↓
SheetJS processes in memory
    ↓
Create Blob URL
    ↓
Trigger download
    ↓
User computer
```

**Files never leave user's computer!**

---

## 8. SECURITY & PRIVACY

### 8.1 Authentication Security

#### Firebase Auth Implementation
- **Method:** REST API (not Firebase SDK)
- **Why:** Manifest V3 compatible
- **Storage:** `chrome.storage.session` (ephemeral)
- **Token Management:** Auto-refresh when expired

#### Password Handling
- **Never stored:** Password hanya dikirim ke Firebase saat login
- **Encryption:** HTTPS/TLS untuk semua requests
- **No server-side storage:** Kami tidak punya akses password

#### Google OAuth
- **Flow:** Chrome Identity API → Firebase
- **Redirect:** `chrome-extension://{extension-id}`
- **Scope:** Email, Profile, OpenID
- **Token handling:** Sama dengan email login

---

### 8.2 Data Privacy

#### Data yang DITERSIPKAN:
| Data | Lokasi | Akses |
|------|--------|-------|
| Email user | Firestore | Hanya user (via auth) |
| Status langganan | Firestore | Hanya user (via auth) |
| Kuota usage | Firestore | Hanya user (via auth) |
| ID Token | chrome.storage.session | Hanya ekstensi |
| Refresh Token | chrome.storage.session | Hanya ekstensi |

#### Data yang TIDAK DITERSIPKAN:
- ❌ Nomor faktur pajak
- ❌ Isi file CSV
- ❌ Hasil merge Excel
- ❌ History transaksi
- ❌ Aktivitas browsing

#### Log Data:
- Lokasi: `chrome.storage.local`
- Isi: Status messages (time + message)
- Retention: Max 1000 entries
- Access: Hanya ekstensi di browser user

---

### 8.3 Extension Permissions

#### Permissions yang DIMINTA:
```json
{
  "permissions": [
    "activeTab",      // Akses tab aktif untuk inject script
    "scripting",      // Untuk inject content script
    "storage",        // Untuk simpan log & settings
    "offscreen",      // Untuk auth management
    "identity",       // Untuk Google OAuth
    "tabs",           // Untuk query tab info
    "sidePanel"       // Untuk side panel UI
  ],
  "host_permissions": [
    "https://coretaxdjp.pajak.go.id/*"  // Hanya Coretax
  ]
}
```

#### Why Each Permission:
| Permission | Purpose | Alternative |
|------------|---------|-------------|
| `activeTab` | Inject script ke Coretax | Required |
| `scripting` | Programmatic injection | Required |
| `storage` | Save logs/settings | Required |
| `offscreen` | Firebase auth | Required (MV3) |
| `identity` | Google OAuth | Required |
| `tabs` | Query active tab | Required |
| `sidePanel` | UI display | Could use popup |
| `https://coretaxdjp.pajak.go.id/*` | Interact dengan Coretax | Required |

#### What We DON'T Access:
- ❌ Other websites
- ❌ Browser history
- ❌ Passwords saved in browser
- ❌ Cookies (except auth)
- ❌ Location
- ❌ Camera/Microphone
- ❌ Any other personal data

---

### 8.4 Network Security

#### External Domains (ONLY for Auth):
| Domain | Purpose | Data Sent |
|--------|---------|-----------|
| `firebase.googleapis.com` | Firebase Auth | Email, token |
| `accounts.google.com` | Google OAuth | OAuth flow |
| `firestore.googleapis.com` | Subscription check | Token only |
| `securetoken.googleapis.com` | Token refresh | Refresh token |

#### No External Analytics:
- ❌ No Google Analytics
- ❌ No Mixpanel/Amplitude
- ❌ No tracking pixels
- ❌ No telemetry

---

### 8.5 Code Security

#### Content Security Policy (CSP):
```json
{
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'self'"
  }
}
```

**What This Means:**
- Hanya bisa load script dari extension itself
- Tidak bisa load external scripts
- Tidak bisa eval() dynamic code

#### Library Management:
- **SheetJS:** Downloaded locally (not CDN)
- **No CDN dependencies:** Semua bundle dalam extension
- **No external scripts:** Semua self-contained

#### Vulnerability Prevention:
| Vulnerability | Prevention |
|---------------|------------|
| XSS | CSP + No eval + TextContent (not innerHTML) |
| MITM | HTTPS only |
| Data leakage | No external uploads (except auth) |
| Token theft | chrome.storage.session (ephemeral) |
| CSRF | Firebase handles automatically |

---

## 9. STRUKTUR FILE

### Directory Structure
```
e-fakturautomation/
├── manifest.json                 # Extension manifest (v2.6)
├── popup.html                    # Main UI HTML
├── popup.js                      # Main UI logic (800+ lines)
├── style.css                     # UI styling
├── background.js                 # Service worker (230 lines)
├── content_script.js             # Coretax page script (3700+ lines)
├── offscreen.js                  # Auth management (300 lines)
├── offscreen.html                # Offscreen document container
├── firebase-auth-rest.js         # Firebase REST API wrapper
├── firebase-auth-rest.ts         # TypeScript source
├── xlsx.full.min.js              # SheetJS library (951KB)
├── humanizer.js                  # Number formatting utility
├── network-monitor.js            # Network monitoring utility
├── images/                       # Extension icons
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── test.html                     # Testing page
├── CLAUDE.md                     # Project instructions
├── README.md                     # Public documentation
├── CHANGELOG_v2.0.md            # Version 2.0 changelog
├── cloud_function_guide.md      # Firebase guide
├── DOKUMENTASI_LENGKAP.md       # This file
└── .factory/                    # Build/config files
    └── SECURITY_VALIDATION.md   # Security analysis
```

---

### File Details

#### manifest.json (75 lines)
```json
{
  "manifest_version": 3,
  "name": "Faktur Otomatis",
  "version": "1.0",
  "description": "Otomatisasikan Proses Kreditkan Pajak Masukan...",
  "permissions": [...],
  "host_permissions": [...],
  "background": {
    "service_worker": "background.js"
  },
  "action": {...},
  "side_panel": {...},
  "content_scripts": [...],
  "oauth2": {...}
}
```

**Key Points:**
- Manifest V3 (latest Chrome standard)
- Side panel UI (not popup only)
- OAuth2 configuration
- Content script auto-inject to Coretax

---

#### popup.js (2000+ lines)
**Sections:**
1. Constants & Globals (lines 1-50)
2. DOM Management (lines 50-150)
3. UI Helpers (lines 150-300)
4. Auth Functions (lines 300-600)
5. Subscription Management (lines 600-900)
6. Quota Management (lines 900-1200)
7. Tab Navigation (lines 1200-1400)
8. CSV Upload & Parsing (lines 1400-1800)
9. Automation Controls (lines 1800-2200)
10. Download Automation (lines 2200-2400)
11. Excel Merger (lines 2400-2800)
12. Event Listeners (lines 2800-3200)

**Key Functions:**
```javascript
initApp()                              // Initialize application
checkSubscriptionStatus()              // Firestore query
startAutomation()                      // Trigger automation
stopAutomation()                       // Abort current run
mergeExcelFiles(files)                 // SheetJS processing
updateAndSaveStatus(msg)               // Add log entry
renderLogs(logs)                       // Display logs
```

---

#### background.js (230 lines)
**Responsibilities:**
- Message routing hub
- Offscreen lifecycle management
- Tab query & injection
- Google OAuth flow

**Message Types Handled:**
```javascript
'start-automation'
'stop-automation'
'start-download-automation'
'automation-status'              // Forward to popup
'pdf-download-status'            // Forward to popup
'sign-in-email'
'sign-in-google'
'get-current-user'
'get-id-token'
'sign-out'
```

**Key Pattern:**
```javascript
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    (async () => {
        if (message.type === '...') {
            // Handle message
            sendResponse(response);
        }
    })();
    return true; // Keep channel open for async
});
```

---

#### content_script.js (3700+ lines)
**Sections:**
1. Constants & State (lines 1-200)
2. Session Detection (lines 200-400)
3. Navigation Monitor (lines 400-600)
4. Month Handling (lines 600-900)
5. Dropdown Detection (lines 900-1200)
6. DOM Helpers (lines 1200-1500)
7. Search Functions (lines 1500-2000)
8. Change Tax Period (lines 2000-2500)
9. Click Final Action (lines 2500-2700)
10. Navigate Back (lines 2700-2900)
11. Main Automation Loop (lines 2900-3200)
12. Download Automation (lines 3200-3400)
13. Error Handlers (lines 3400-3700)

**State Machine:**
```javascript
const MachineState = {
    IDLE: 'IDLE',           // Not running
    RUNNING: 'RUNNING',     // Currently processing
    STOPPED: 'STOPPED',     // User stopped
    ERROR: 'ERROR'          // Error occurred
};
```

**Key Algorithms:**
```javascript
// Search invoice by number
async function cariFakturDiCoretax(nomorFaktur) {
    // 1. Try direct search
    // 2. If not found, iterate pages
    // 3. Return element or null
}

// Change tax period dropdown
async function ubahMasaPajak(bulan) {
    // 1. Find dropdown element
    // 2. Click trigger
    // 3. Wait for panel
    // 4. Find & click option
    // 5. Verify selection (retry 5x)
}

// Click final action button
async function klikTombolFinal(teksTombol) {
    // 1. Map text to aria-label
    // 2. Find button
    // 3. Click and verify
}
```

---

#### offscreen.js (300 lines)
**Purpose:** Manage Firebase Auth in Manifest V3

**Why Offscreen?**
- Service workers can't use some APIs
- `chrome.storage.session` requires offscreen
- Firebase token management needs persistent context

**Flow:**
```javascript
// 1. Receive message from background
chrome.runtime.onMessage.addListener((message) => {
    if (message.target !== 'offscreen') return;

    // 2. Route to handler
    switch (message.type) {
        case 'sign-in-email':
            // Call Firebase REST API
            break;
        case 'get-id-token':
            // Return current token (refresh if needed)
            break;
    }
});

// 3. Store user securely
await storage.set(STORAGE_KEY, user);
```

---

## 10. TEKNOLOGI & LIBRARY

### Tech Stack

#### Frontend
- **HTML5** - Structure
- **CSS3** - Styling (custom, no framework)
- **Vanilla JavaScript** - No frameworks (React/Vue/etc)

#### Chrome APIs
- `chrome.runtime` - Message passing
- `chrome.tabs` - Tab management
- `chrome.storage` - Data persistence
- `chrome.offscreen` - Auth document
- `chrome.identity` - Google OAuth
- `chrome.scripting` - Script injection

#### Backend
- **Firebase Authentication** - User auth (REST API)
- **Cloud Firestore** - Subscription database

#### Third-Party Libraries
| Library | Version | Purpose | License |
|---------|---------|---------|---------|
| SheetJS (xlsx) | 0.20.3 | Excel manipulation | Apache 2.0 |

**Note:** SheetJS di-download secara lokal, bukan dari CDN

---

### Why Vanilla JavaScript?

**Advantages:**
1. ✅ No build step required
2. ✅ Smaller bundle size
3. ✅ Faster load time
4. ✅ Simpler deployment
5. ✅ Easier to maintain
6. ✅ No dependency updates
7. ✅ Manifest V3 compatible

**Disadvantages:**
- Manual DOM manipulation
- No reactive data binding
- More boilerplate code

**Decision:** For extension scope, vanilla is sufficient and more maintainable.

---

### Firebase Implementation

#### REST API vs SDK
**Why REST API?**
- Firebase JS SDK tidak Manifest V3 compatible
- Service worker limitations
- CSP restrictions

**Implementation:**
```javascript
import { FirebaseAuthCustom } from './firebase-auth-rest.js';

const firebaseAuth = new FirebaseAuthCustom(API_KEY);

// Sign in
const user = await firebaseAuth.signIn(email, password);

// Sign in with Google
const user = await firebaseAuth.signInWithGoogleIdToken(idToken);

// Refresh token
const tokens = await firebaseAuth.refreshToken(refreshToken);
```

---

### Firestore Schema

#### Collection: `subscriptions`
```
subscriptions/{uid}
{
    fields: {
        status: { stringValue: "Aktif" },
        quotaTotal: { integerValue: 1000 },
        quotaUsed: { integerValue: 50 },
        startDate: { timestampValue: "2025-01-01T00:00:00Z" },
        endDate: { timestampValue: "2025-12-31T23:59:59Z" },
        email: { stringValue: "user@example.com" },
        createdAt: { timestampValue: "..." }
    }
}
```

**Query Pattern:**
```javascript
// GET document
GET https://firestore.googleapis.com/v1/projects/ekstensi-efaktur-otomatisasi/databases/(default)/documents/subscriptions/{uid}

// UPDATE quota (increment)
POST https://firestore.googleapis.com/v1/projects/ekstensi-efaktur-otomatisasi/databases/(default)/documents:commit
{
    "writes": [{
        "transform": {
            "document": "projects/.../subscriptions/{uid}",
            "fieldTransforms": [{
                "fieldPath": "quotaUsed",
                "increment": { "integerValue": 5 }
            }]
        }
    }]
}
```

---

## 11. TROUBLESHOOTING

### Common Issues & Solutions

#### Issue 1: "Tidak dapat terhubung ke Coretax"

**Symptoms:**
- Error: "No active Coretax tab found"
- Automation tidak mulai

**Causes:**
1. Coretax tab tidak aktif
2. URL bukan coretaxdjp.pajak.go.id
3. Content script tidak ter-inject

**Solutions:**
```
1. Pastikan Coretax terbuka di tab aktif
2. Refresh halaman Coretax
3. Buka ekstensi, klik "Jalankan Otomatisasi" lagi
4. Jika masih error, reload extension:
   - Buka chrome://extensions/
   - Find E-Faktur Automation
   - Klik icon reload
```

---

#### Issue 2: "Dropdown tidak ditemukan"

**Symptoms:**
```
[19:30:55]  -> GAGAL: Dropdown 'Masa Pajak Dikreditkan' tidak ditemukan.
```

**Causes:**
1. Tidak berada di detail faktur
2. Coretax UI berubah
3. Page belum selesai loading

**Solutions:**
```
1. Pastikan di halaman detail faktur (bukan list)
2. Tunggu loading selesai
3. Refresh halaman Coretax
4. Jalankan ulang otomatisasi
```

---

#### Issue 3: "Session expired"

**Symptoms:**
```
[19:30:45] Halaman login terdeteksi dari URL
[19:30:46] Otomatisasi dihentikan: Session logout terdeteksi.
```

**Causes:**
1. Coretax session timeout
2. User logout dari Coretax
3. Network error

**Solutions:**
```
1. Login kembali ke Coretax
2. Kembali ke menu Pajak Masukan
3. Jalankan ulang otomatisasi
```

---

#### Issue 4: "Quota habis"

**Symptoms:**
- Status: "Kuota: 0 / 15"
- Pesan: "Kuota Anda sudah habis. Silakan upgrade..."

**Solutions:**
```
FREE users:
- Tunggu reset tanggal 1 bulan depan
- Atau upgrade ke Premium

PREMIUM users:
- Cek expiry date
- Renew subscription jika expired
- Contact support jika ada error
```

---

#### Issue 5: "Download berhenti di halaman 26"

**Symptoms:**
- Download automation stop di halaman 26
- Error: "Timeout waiting for page"

**Note:** This issue FIXED in v2.0

**Solution if still happens:**
```
1. Pastikan versi 2.0+ (cek di popup header)
2. Check internet connection
3. Close other tabs untuk mempercepat
4. Jika masih gagal:
   - Manual download untuk sisa halaman
   - Atau coba lagi setelah beberapa saat
```

---

#### Issue 6: "Excel merge gagal"

**Symptoms:**
- Error: "Failed to read file"
- Error: "Invalid file format"

**Causes:**
1. File bukan Excel (.xlsx/.xls)
2. File corrupt
3. File too large (>100MB)

**Solutions:**
```
1. Pastikan file format .xlsx atau .xls
2. Buka file dulu di Excel untuk verifikasi
3. Jika file besar, split jadi beberapa file
4. Coba file satu per satu untuk isolasi
```

---

#### Issue 7: "Login gagal"

**Symptoms:**
- Error: "Login failed"
- Error: "Invalid credentials"

**Solutions:**

**For Email/Password:**
```
1. Check email & password
2. Reset password di https://alatpajak.id
3. Coba login lagi
```

**For Google:**
```
1. Pastikan sudah login ke Google di Chrome
2. Coba incognito window
3. Logout dari Google, login lagi
4. Check apakah popup diblokir:
   - Chrome Settings → Privacy → Popups
   - Allow popups untuk extension
```

---

### Debug Mode

**Enable Debug Logging:**

1. Open `content_script.js`
2. Find line 2:
   ```javascript
   const DEBUG = false;
   ```
3. Change to:
   ```javascript
   const DEBUG = true;
   ```
4. Save file
5. Reload extension
6. Open DevTools Console (F12) di Coretax tab
7. Jalankan automation
8. Lihat detailed logs di console

**Debug Output Examples:**
```
Content script: [DIAGNOSIS DROPDOWN] Element validation before click:
- triggerButton exists: true
- triggerButton disabled: false
- triggerButton visible: true
...
Content script: [VERIFY BULAN] Attempt 1/5 - Label="Desember 2025", monthKey=desember, matchesExpected=true
```

---

### Getting Help

**Resources:**
1. 📧 Email: support@alatpajak.id
2. 🌐 Website: https://alatpajak.id
3. 📱 WhatsApp: [Check website]

**When Reporting Issues:**
Include:
- Extension version (cek di header popup)
- Chrome version
- Screenshot error (jika ada)
- Steps to reproduce
- Log dari "Export Log" button

---

## APPENDIX

### A. Shortcut Keys
| Shortcut | Action |
|----------|--------|
| Alt + E | Open extension |
| (Chrome native) Ctrl + Shift + J | Open console |

### B. File Format Specifications

**CSV Format:**
```csv
Nomor Faktur Pajak 17 digit,Masa Pajak Faktur
010.000.0000.0000.0001,Januari
01000000000000002,Februari
```

**Rules:**
- Comma-separated
- UTF-8 encoding
- No BOM
- First row: header
- 17 digits: can be formatted or plain

### C. API Endpoints

**Firebase Auth:**
```
POST https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword
POST https://identitytoolkit.googleapis.com/v1/accounts:lookup
POST https://securetoken.googleapis.com/v1/token
```

**Firestore:**
```
GET https://firestore.googleapis.com/v1/projects/{projectId}/databases/(default)/documents/subscriptions/{documentId}
POST https://firestore.googleapis.com/v1/projects/{projectId}/databases/(default)/documents:commit
```

### D. Version History

| Version | Date | Changes |
|---------|------|---------|
| 2.6 | 2026-04-11 | Current version |
| 2.5 | - | - |
| 2.0 | 2025-11-16 | Major update: Tab UI, Excel merge, download fix |
| 1.9 | - | Previous version |

### E. Glossary

| Term | Definition |
|------|------------|
| **Coretax** | Sistem administrasi perpajakan DJP |
| **Masa Pajak** | Periode pajak (bulan) |
| **Pajak Masukan** | Faktur pajak pembelian |
| **Kreditkan** | Memindahkan faktur ke status dikreditkan |
| **Content Script** | Script yang di-inject ke halaman web |
| **Service Worker** | Background script di Chrome extension |
| **Offscreen Document** | Document tersembunyi untuk auth management |

---

## END OF DOCUMENTATION

**Dibuat oleh:** Jevi Saladin Nusantara
**Tanggal:** 15 April 2026
**Versi Dokumen:** 1.0

Untuk pertanyaan lebih lanjut, hubungi:
- 🌐 https://alatpajak.id
- 📧 support@alatpajak.id

---

© 2026 alatpajak.id. All rights reserved.
