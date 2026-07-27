# Arsip Implementasi CCAPI (dinonaktifkan sejak migrasi ke libgphoto2)

File di folder ini adalah salinan implementasi kontrol kamera via Canon CCAPI
(HTTP over Wi-Fi), dinonaktifkan karena belum ada unit kamera yang mendukung
Wi-Fi CCAPI untuk testing. Diganti dengan libgphoto2 (USB, multi-brand).

## Cara mengembalikan implementasi CCAPI

1. Cara cepat: `git checkout ccapi-backup-<tanggal> -- src-tauri/src/ccapi.rs src-tauri/src/lib.rs src-tauri/Cargo.toml src/lib/camera.svelte.ts src/routes/camera-config/+page.svelte src/routes/session/+page.svelte`
2. Atau salin manual dari file `.bak` di folder ini kembali ke path aslinya
   (hapus suffix `.bak`), lalu jalankan ulang `pnpm install` / `cargo build`.
3. Ingat: kalau sudah pernah develop gphoto2 juga, cek dulu apakah ada logika
   baru (misal print flow) yang bergantung ke command gphoto2 sebelum revert total.

Tag git referensi: `ccapi-backup-20260727`.
