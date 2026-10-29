# deploy.md — Hosting, Database, Auth, Backup (semua gratis)

> Menu dashboard Cloudflare bisa berubah. Jika langkah di bawah tidak cocok, ikuti dokumentasi resmi terbaru (developers.cloudflare.com) dan sesuaikan; konsepnya tetap sama.

## 1. Prasyarat
- Akun Cloudflare (gratis). Node.js ≥ 20. `npm i -g wrangler` lalu `wrangler login`.
- Alamat akses: gratis memakai subdomain `*.workers.dev`. Domain sendiri (mis. `erp.namatoko.com`) opsional dan berbayar di registrar.

## 2. Buat database D1 (wilayah Asia-Pasifik)
```bash
npx wrangler d1 create erp-db --location apac
# salin database_id ke wrangler.jsonc
npm run db:migrate            # lokal  (wrangler d1 migrations apply erp-db --local)
npm run db:migrate:remote     # produksi (… --remote)
```

## 3. `wrangler.jsonc` (acuan)
```jsonc
{
  "name": "erp-toko",
  "main": "src/server/index.ts",
  "compatibility_date": "2026-10-01",
  "assets": {
    "directory": "./dist",
    "binding": "ASSETS",
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/api/*"]          // file statis dilayani langsung dari CDN, Worker hanya untuk API
  },
  "d1_databases": [
    { "binding": "DB", "database_name": "erp-db", "database_id": "<ISI>", "migrations_dir": "db/migrations" }
  ],
  "vars": { "ACCESS_TEAM_DOMAIN": "<tim>.cloudflareaccess.com", "ACCESS_AUD": "<aud-tag>" },
  "observability": { "enabled": true }
}
```
`run_worker_first` membuat permintaan file statis tidak memakai kuota/CPU Worker (verifikasi perilaku ini di dokumentasi "Workers Static Assets" terbaru).

## 4. Login: Cloudflare Access (tanpa kode password)
1. Dashboard → **Zero Trust** → buat organisasi (plan Free; cek batas jumlah pengguna terbaru).
2. **Access → Applications → Add → Self-hosted**: pilih domain Worker (atau aktifkan Access langsung dari pengaturan Worker untuk `workers.dev`).
3. **Policy**: Allow → Emails: email pemilik & admin. Metode login: **One-time PIN** (kode dikirim ke email).
4. Salin **Application Audience (AUD) tag** dan **team domain** ke `vars`.
5. Di Worker: verifikasi header `Cf-Access-Jwt-Assertion` dengan JWKS `https://<team>.cloudflareaccess.com/cdn-cgi/access/certs` (library `jose`), cocokkan `aud`, lalu cari `email` di tabel `users` untuk role. Email tidak terdaftar → 403.
6. Dev lokal: `DEV_AUTH_EMAIL=owner@local` hanya aktif bila `ENV=dev`; **tidak boleh** ada di produksi (test otomatis memastikannya).

Catatan: jangan memakai PBKDF2/bcrypt di Worker free plan (≈ 66 ms CPU vs batas 10 ms).

## 5. Deploy
```bash
npm run build          # vite build → dist/
npm run deploy         # wrangler deploy
npx wrangler tail      # log langsung; perhatikan cpuTime (target < 8 ms)
```
Opsional CI: GitHub Actions menjalankan `npm test && npm run build && wrangler deploy` saat push ke `main` (token API Cloudflare di GitHub Secrets, izin terbatas: Workers + D1).

## 6. Backup & pemulihan
| Lapisan | Cara |
|---|---|
| Titik waktu | **D1 Time Travel** — pulihkan ke menit tertentu (cek lama retensi untuk plan Free di dokumentasi) |
| Ekspor berkala | `npx wrangler d1 export erp-db --remote --output=backup/erp-$(date +%F).sql` **mingguan**, simpan di cloud pribadi/repo privat |
| Sebelum aksi besar | Ekspor manual (migrasi skema, import besar) |
| Uji pulihkan | Sekali sebulan: `wrangler d1 execute --local --file=backup/…sql` lalu jalankan `/stock/integrity` |
Tambahan: CSV stok (`/api/export/stock.csv`) bisa dibuka di Excel kalau darurat.

## 7. Batas yang dipantau
| Hal | Batas free | Tanda bahaya | Tindakan |
|---|---|---|---|
| Request Worker | 100.000/hari | > 60% | Kurangi frekuensi sync; cek bot |
| Row read D1 | 5 jt/hari | > 60% | Cari query tanpa index |
| Row write D1 | 100 rb/hari | > 60% | Import besar → pecah antar hari |
| Penyimpanan D1 | 5 GB | > 3 GB | Arsipkan riwayat lama ke file |
| Kuota habis | query gagal sampai 00:00 UTC (07:00 WIB) | banner `LIMIT` | Tunggu reset atau Workers Paid $5/bln |

Pemakaian terlihat di dashboard Cloudflare (Workers & D1 → Metrics) dan di halaman Pengaturan > Pemakaian.

## 8. Checklist go-live
- [ ] Migrasi remote sukses, `/api/stock/integrity` kosong
- [ ] Access aktif: akses tanpa login → ditolak; email non-terdaftar → 403
- [ ] Anggaran kecepatan lolos (`npm run perf`)
- [ ] Backup pertama dibuat & diuji pulih
- [ ] Spreadsheet lama diarsipkan read-only
- [ ] Rutinitas harian dicoba 1 hari penuh paralel dengan spreadsheet
