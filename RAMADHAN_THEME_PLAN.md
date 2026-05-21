# Plan: Tema Ramadhan untuk E-Faktur Automation

## Riset & Konsep

Berdasarkan riset, elemen visual khas Ramadhan meliputi:
- **Bulan Sabit (Crescent Moon)** - Simbol utama Islam, warna emas dengan efek glow
- **Lampion (Lantern)** - Gaya Arab/Islamic dengan efek ayun (swinging)
- **Bintang** - Animasi berkelip (twinkling)
- **Warna** - Deep blue/ungu (langit malam), emas/amber, hijau, ungu

## Desain Implementasi

### 1. Header Area (Area Utama Dekorasi)

**Perubahan:**
- Background gradient diubah ke night sky (deep blue ke ungu gelap)
- Tambah lampion menggantung di pojok kiri-kanan atas dengan animasi ayun
- Tambah bulan sabit emas dengan glow di sisi header
- Tambah bintang-bintang kecil berkelip
- Tambah teks "Ramadan Mubarak" atau "Ramadan Kareem" sebagai greeting

### 2. Struktur HTML Baru

```html
<!-- Di dalam .header, tambahkan: -->
<div class="ramadan-decorations">
    <!-- Lampion Kiri -->
    <div class="lantern lantern-left">
        <div class="lantern-wire"></div>
        <div class="lantern-body">
            <div class="lantern-top"></div>
            <div class="lantern-middle"></div>
            <div class="lantern-bottom"></div>
            <div class="lantern-glow"></div>
        </div>
    </div>

    <!-- Lampion Kanan -->
    <div class="lantern lantern-right">...</div>

    <!-- Bulan Sabit -->
    <div class="crescent-moon"></div>

    <!-- Bintang-bintang -->
    <div class="star star-1"></div>
    <div class="star star-2"></div>
    <div class="star star-3"></div>
    <div class="star star-4"></div>
    <div class="star star-5"></div>

    <!-- Greeting Text -->
    <div class="ramadan-greeting">Ramadan Mubarak</div>
</div>
```

### 3. CSS Animasi

#### Lampion (Swinging Animation)
```css
.lantern {
    animation: swing 3s ease-in-out infinite;
    transform-origin: top center;
}

@keyframes swing {
    0%, 100% { transform: rotate(-6deg); }
    50% { transform: rotate(6deg); }
}
```

#### Bulan Sabit (Glow Effect)
```css
.crescent-moon {
    /* Crescent shape dengan box-shadow untuk glow */
    width: 40px;
    height: 40px;
    border-radius: 50%;
    box-shadow:
        15px -5px 0 0 #FFD700,
        0 0 20px rgba(255, 215, 0, 0.5);
}
```

#### Bintang (Twinkle Animation)
```css
.star {
    animation: twinkle 2s ease-in-out infinite;
}

@keyframes twinkle {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.3; transform: scale(0.8); }
}
```

### 4. Warna Theme Ramadhan

```css
:root {
    /* Ramadan Theme Colors */
    --ramadan-night: linear-gradient(135deg, #0F172A 0%, #1E1B4B 50%, #312E81 100%);
    --ramadan-gold: #FFD700;
    --ramadan-amber: #F59E0B;
    --ramadan-lantern: #DC2626; /* Merah untuk lampion */
    --ramadan-lantern-glow: #FCD34D;
}
```

## File yang Akan Dimodifikasi

### 1. `popup.html`
- Tambah elemen dekorasi Ramadhan di dalam `.header`
- Tambah class `ramadan-theme` pada `<body>` atau `.card`

### 2. `style.css`
- Tambah CSS variables untuk warna Ramadhan
- Tambah styles untuk lampion, bulan, bintang
- Tambah animasi (swing, twinkle, glow)
- Modifikasi header background untuk tema Ramadhan

## Visual Preview (Konsep)

```
┌─────────────────────────────────────────┐
│ 🏮                              🏮       │  ← Lampion menggantung
│    🌙                                   │  ← Bulan sabit
│  ⭐    ✨    ⭐                         │  ← Bintang berkelip
│                                         │
│   [Logo] E-Faktur Automation  v2.4     │
│          Ramadan Mubarak ✨             │  ← Greeting
│         ⚙️ Otomatisasi                  │
├─────────────────────────────────────────┤
│                                         │
│  [Content seperti biasa]               │
│                                         │
└─────────────────────────────────────────┘
```

## Catatan Implementasi

1. **Performa**: Animasi CSS murni tanpa JavaScript untuk performa optimal
2. **Responsif**: Pastikan dekorasi tidak mengganggu konten utama
3. **Subtle**: Efek tidak terlalu mencolok agar tidak mengganggu fungsionalitas
4. **Optional**: Bisa dibuat toggle untuk mengaktifkan/nonaktifkan tema (future)

## Tasks

- [ ] Tambah elemen HTML dekorasi di popup.html
- [ ] Buat CSS untuk lampion dengan animasi swing
- [ ] Buat CSS untuk bulan sabit dengan glow
- [ ] Buat CSS untuk bintang dengan twinkle animation
- [ ] Modifikasi header gradient untuk night sky effect
- [ ] Tambah greeting text "Ramadan Mubarak"
- [ ] Test di berbagai ukuran popup

---

**Status:** Menunggu approval untuk mulai implementasi
