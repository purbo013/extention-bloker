# Tab Blocker

Extension browser Chrome/Edge/Brave (Manifest V3) untuk memblokir dan menutup tab otomatis berdasarkan domain, URL, atau kata kunci dalam URL.

Repository: [github.com/purbo013/extention-bloker](https://github.com/purbo013/extention-bloker)

## Fitur utama

- **Blokir domain** — tutup semua halaman di domain tertentu (misal: `https://facebook.com`)
- **Blokir URL penuh** — tutup hanya URL yang sama persis
- **Blokir kata kunci** — tutup URL yang mengandung teks tertentu (misal: `shorts`, `/reels`)
- **Whitelist domain** — izinkan domain tertentu, kecuali cocok kata kunci blokir
- **Tab baru terdeteksi** — penampung URL tab baru untuk didaftarkan dengan cepat
- **Hit counter** — catat berapa kali setiap item terdeteksi/diblokir
- **Tombol melayang** — blokir halaman aktif dari pojok kanan bawah
- **Menu klik kanan** — tambah ke daftar blokir/whitelist tanpa buka popup
- **Pagination** — list besar tetap ringan (8 item/halaman, pending 5 item/halaman)

## Browser yang didukung

| Browser | Status |
|---------|--------|
| Google Chrome | Didukung |
| Microsoft Edge | Didukung |
| Brave | Didukung |
| Firefox | Belum didukung |

## Instalasi

### Dari source (developer mode)

1. Clone atau download repository ini
2. Buka `chrome://extensions`
3. Aktifkan **Developer mode** (pojok kanan atas)
4. Klik **Load unpacked**
5. Pilih folder project (`extention`)

Extension siap digunakan. Icon **Tab Blocker** muncul di toolbar browser.

## Cara pakai

### Popup extension

Klik icon extension di toolbar untuk membuka popup.

#### Tab Baru Terdeteksi

Setiap tab baru yang dibuka (dan belum diblokir) otomatis masuk ke daftar ini.

| Tombol | Fungsi |
|--------|--------|
| **Domain** | Daftarkan domain halaman ke blokir domain |
| **URL** | Daftarkan URL penuh ke blokir URL |
| **White** | Daftarkan domain ke whitelist |
| **×** | Abaikan / hapus dari penampung |

- Maksimal **5 baris** per halaman (tanpa scroll)
- Gunakan pager **‹ ›** jika URL terdeteksi lebih banyak

#### Tab Domain / URL / Kata / White

| Tab | Deskripsi |
|-----|-----------|
| **Domain** | Daftar domain yang diblokir seluruhnya |
| **URL** | Daftar URL spesifik yang diblokir |
| **Kata** | Daftar kata kunci dalam URL yang diblokir |
| **White** | Daftar domain yang diizinkan |

Setiap tab menampilkan kolom **Deteksi** (berapa kali terdeteksi) dan tombol hapus (icon tempat sampah).

Tab **Kata** memiliki form input untuk menambah kata kunci manual.

### Menu klik kanan

| Menu | Konteks | Aksi |
|------|---------|------|
| Blokir domain ini | Halaman | Blokir seluruh domain |
| Blokir URL ini | Halaman | Blokir URL halaman aktif |
| Whitelist domain ini | Halaman | Whitelist domain halaman |
| Blokir URL link ini | Link | Blokir URL link yang diklik |
| Whitelist domain link ini | Link | Whitelist domain dari link |
| Blokir kata terpilih | Teks terpilih | Tambah kata kunci dari seleksi |

### Tombol melayang (FAB)

Tombol merah **🚫** di pojok kanan bawah setiap halaman web.

- Klik sekali untuk menambahkan URL halaman aktif ke daftar blokir (mode default)
- Tab yang sama langsung ditutup jika sudah cocok rule blokir

## Prioritas pemblokiran

Extension mengecek URL dengan urutan berikut:

```
1. URL sistem (chrome://, edge://, dll) → tidak pernah diblokir
2. Kata kunci blokir → BLOKIR (mengabaikan whitelist)
3. Whitelist domain → IZINKAN (tidak masuk pending)
4. Blokir domain / URL → BLOKIR
5. Tidak cocok → masuk "Tab Baru Terdeteksi"
```

### Contoh

| Pengaturan | URL dibuka | Hasil |
|--------------|------------|-------|
| Whitelist: `youtube.com` | `youtube.com/watch?v=1` | Diizinkan |
| Whitelist: `youtube.com` + Kata: `shorts` | `youtube.com/shorts/abc` | **Ditutup** |
| Blokir domain: `facebook.com` | `facebook.com/feed` | **Ditutup** |
| Blokir URL: `reddit.com/r/all` | `reddit.com/r/gaming` | Diizinkan |

## Hit counter (Deteksi)

| List | Counter naik saat |
|------|-------------------|
| Tab Baru Terdeteksi | URL yang sama terdeteksi ulang |
| Blokir Domain / URL | Tab ditutup karena rule tersebut |
| Blokir Kata | Tab ditutup karena cocok kata kunci |
| Whitelist | URL di domain whitelist terdeteksi |

Saat memindahkan dari pending ke blokir/whitelist, hit count ikut terbawa.

## Optimasi performa

Extension dirancang agar tetap ringan meski data banyak:

- **Cache memori** — data dibaca sekali, tidak setiap event tab
- **Index lookup** — pengecekan domain/URL pakai `Set`/`Map`
- **Debounce storage** — hit counter ditulis setiap ~1.5 detik, bukan per deteksi
- **Dedup tab check** — URL sama di tab yang sama diabaikan 800ms
- **Pagination server-side** — popup hanya memuat 8 item per halaman
- **Lazy render** — hanya tab aktif yang di-render di popup

### Batas data

| Item | Batas |
|------|-------|
| Blokir domain / URL / kata / whitelist | 1.000 item per list |
| Tab baru terdeteksi (pending) | 50 item |

## Struktur project

```
extention/
├── manifest.json       # Konfigurasi extension MV3
├── background.js       # Service worker: blokir, storage, context menu
├── content.js          # Tombol melayang di halaman web
├── content.css         # Style tombol melayang
├── popup.html          # UI popup
├── popup.js            # Logika popup & pagination
├── popup.css           # Style popup
├── icons/              # Icon extension (16, 48, 128)
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

## Izin (permissions)

| Permission | Alasan |
|------------|--------|
| `tabs` | Deteksi dan menutup tab |
| `storage` | Menyimpan daftar blokir/whitelist lokal |
| `contextMenus` | Menu klik kanan |
| `<all_urls>` | Content script & deteksi URL di semua halaman |

Data disimpan **lokal** di browser (`chrome.storage.local`). Tidak ada pengiriman data ke server eksternal.

## Pengembangan

Tidak ada build step. Edit file langsung, lalu reload extension:

1. Buka `chrome://extensions`
2. Klik icon **Reload** pada kartu Tab Blocker
3. Uji perubahan

### Changelog singkat

| Versi | Perubahan utama |
|-------|-----------------|
| 1.5.1 | Pending max 5 baris tanpa scroll |
| 1.5.0 | Optimasi cache, pagination server-side |
| 1.4.0 | Hit counter di semua list |
| 1.3.0 | Blokir kata kunci (override whitelist) |
| 1.2.0 | Whitelist, tab UI, pagination |
| 1.1.0 | Mode blokir domain vs URL penuh |
| 1.0.0 | Rilis awal |

## Lisensi

Project ini open source. Silakan fork dan modifikasi sesuai kebutuhan.

## Kontribusi

1. Fork repository
2. Buat branch fitur (`git checkout -b fitur/nama-fitur`)
3. Commit perubahan (`git commit -m 'Deskripsi perubahan'`)
4. Push ke branch (`git push origin fitur/nama-fitur`)
5. Buat Pull Request
