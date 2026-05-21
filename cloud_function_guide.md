# Panduan Implementasi Cloud Function untuk Reset Kuota

Dokumen ini menjelaskan cara membuat dan mendeploy **Cloud Function** di Firebase untuk melakukan reset kuota langganan secara otomatis. Metode ini jauh lebih andal daripada melakukannya di sisi klien (ekstensi).

## Konsep Dasar

Cloud Function ini akan:
1.  **Dijalankan secara terjadwal**: Menggunakan **Cloud Scheduler**, fungsi ini akan dipicu setiap hari pada waktu yang ditentukan (misalnya, setiap jam 3 pagi).
2.  **Memeriksa semua langganan**: Fungsi akan membaca semua dokumen dalam koleksi `subscriptions`.
3.  **Mereset kuota jika perlu**: Untuk setiap langganan, fungsi akan memeriksa apakah tanggal reset kuota (`quotaResetDate`) telah terlewati. Jika ya, `quotaUsed` akan diatur kembali ke `0` dan `quotaResetDate` akan diperbarui ke bulan berikutnya.

---

## Langkah-langkah Implementasi

### 1. Inisialisasi Firebase Functions
Jika Anda belum pernah menggunakan Firebase Functions, ikuti [panduan resmi](https://firebase.google.com/docs/functions/get-started) untuk menginisialisasi Functions di proyek Anda.

Perintah dasarnya adalah:
```bash
# Instal Firebase CLI
npm install -g firebase-tools

# Login ke Firebase
firebase login

# Masuk ke direktori proyek Anda
cd /path/to/your/project

# Inisialisasi Firebase Functions
firebase init functions
```
Pilih **JavaScript** atau **TypeScript** saat diminta.

### 2. Tulis Kode Cloud Function

Buka file `index.js` (atau `index.ts` jika Anda menggunakan TypeScript) di dalam direktori `functions` Anda, dan tambahkan kode berikut:

```javascript
const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

const db = admin.firestore();

/**
 * Cloud Function yang dijadwalkan untuk berjalan setiap hari pada pukul 03:00 (waktu server).
 * Fungsi ini akan memeriksa semua langganan dan mereset kuota jika tanggal reset telah tercapai.
 */
exports.scheduledQuotaReset = functions.pubsub.schedule("every day 03:00")
    .timeZone("Asia/Jakarta") // Atur sesuai zona waktu target Anda
    .onRun(async (context) => {
      console.log("Memulai proses reset kuota otomatis...");

      const subscriptionsRef = db.collection("subscriptions");
      const now = new Date();

      try {
        const snapshot = await subscriptionsRef.get();
        if (snapshot.empty) {
          console.log("Tidak ada langganan yang ditemukan. Proses selesai.");
          return null;
        }

        const batch = db.batch();
        let resetCount = 0;

        snapshot.forEach((doc) => {
          const sub = doc.data();
          
          // Periksa apakah dokumen memiliki quotaResetDate dan statusnya aktif
          if (sub.status === "Aktif" && sub.quotaResetDate) {
            const resetDate = sub.quotaResetDate.toDate(); // Konversi Firestore Timestamp ke Date

            if (now >= resetDate) {
              console.log(`Mereset kuota untuk pengguna: ${doc.id}...`);
              
              const currentResetDate = new Date(resetDate);
              // Hitung tanggal reset berikutnya dengan menambahkan 1 bulan
              const nextResetDate = new Date(currentResetDate.setMonth(currentResetDate.getMonth() + 1));
              
              const subscriptionDocRef = db.collection("subscriptions").doc(doc.id);
              
              batch.update(subscriptionDocRef, {
                quotaUsed: 0,
                quotaResetDate: admin.firestore.Timestamp.fromDate(nextResetDate),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              });
              
              resetCount++;
            }
          }
        });

        if (resetCount > 0) {
          await batch.commit();
          console.log(`Reset kuota berhasil untuk ${resetCount} pengguna.`);
        } else {
          console.log("Tidak ada pengguna yang perlu direset kuotanya hari ini.");
        }

        return null;
      } catch (error) {
        console.error("Gagal menjalankan reset kuota:", error);
        return null;
      }
    });
```

### 3. Deploy Cloud Function

Setelah kode disimpan, deploy fungsi Anda menggunakan Firebase CLI:

```bash
firebase deploy --only functions
```

### 4. Hal yang Perlu Diperhatikan

*   **Billing**: Proyek Firebase Anda harus berada di paket **Blaze (Pay-as-you-go)** untuk dapat menggunakan Cloud Functions yang berinteraksi dengan layanan eksternal (seperti Cloud Scheduler secara default).
*   **Keamanan**: Pastikan aturan keamanan (Security Rules) Firestore Anda dikonfigurasi dengan benar untuk hanya mengizinkan akses yang sah. Cloud Function yang berjalan dengan hak akses admin dapat melewati aturan ini.
*   **Idempotensi**: Fungsi di atas dirancang agar idempoten. Jika dijalankan beberapa kali pada hari yang sama, ia tidak akan mereset kuota pengguna lebih dari sekali.
*   **Zona Waktu**: Pastikan Anda menyetel `timeZone` yang benar di `.timeZone()` agar jadwal eksekusi sesuai dengan ekspektasi Anda.

---
Dokumentasi ini memberikan fondasi yang kuat untuk mengelola siklus hidup kuota langganan Anda secara otomatis dan andal.