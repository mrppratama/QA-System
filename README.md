# QA Test Case Generator

Aplikasi web untuk QA Engineer — generate manual test case menggunakan AI (9Router), kelola test case, dan generate Cypress automation script.

---

## Requirements

- **Node.js 18+**
- **npm 9+**
- Koneksi internet (untuk 9Router AI API)

---

## Setup & Menjalankan (Pertama Kali)

### 1. Install semua dependencies

```bash
cd qa-test-case-generator
npm run install:all
```

### 2. Setup database

```bash
cd server
DATABASE_URL="file:$(pwd)/../data/qa-generator.db" node node_modules/.bin/prisma db push
cd ..
```

> Database SQLite akan dibuat otomatis di folder `data/`.

### 3. Pastikan `.env` sudah benar

File `.env` sudah tersedia di root project. Cek isinya:

```env
PORT=3001
CLIENT_URL=http://localhost:5173

DATABASE_URL="file:/ABSOLUTE/PATH/TO/qa-test-case-generator/data/qa-generator.db"

AI_PROVIDER=nine-router
NINE_ROUTER_BASE_URL=https://9router.bigmoveintelligent.com/v1
NINE_ROUTER_API_KEY=sk-xxxxxxxxxxxx
NINE_ROUTER_MODEL=cc/claude-sonnet-4-6
NINE_ROUTER_TIMEOUT=60000
```

> **PENTING**: `DATABASE_URL` harus menggunakan **absolute path** (bukan relative).
> Contoh di macOS: `file:/Users/namauser/qa-test-case-generator/data/qa-generator.db`

### 4. Jalankan development server

```bash
npm run dev
```

Buka browser: **http://localhost:5173**

---

## Menjalankan Setelah Setup

Cukup jalankan:

```bash
npm run dev
```

---

## Alur Penggunaan

```
1. Buka http://localhost:5173
2. Klik "+ New Project" → buat project (misal: "BigMove")
3. Pilih project dari dropdown di header
4. Tab "Generate" → isi form → Generate Test Cases
5. Review hasil → centang yang mau disimpan
6. Klik "Save Selected" atau "Save All"
7. Tab "Test Cases" → lihat, edit, filter, export XLSX
8. Tab "Automation" → pilih test case → Generate Cypress Script
9. Edit, Copy, atau Download .cy.js
```

---

## Fitur

| Fitur | Status |
|-------|--------|
| Project Management (Create/Edit/Delete) | ✅ |
| Project Switcher | ✅ |
| AI Test Case Generator (9Router) | ✅ |
| Tested By (wajib, auto-save ke localStorage) | ✅ |
| Select All / Select beberapa | ✅ |
| Save Selected / Save All | ✅ |
| Test Case Management (View/Search/Filter) | ✅ |
| Edit / Delete Test Case | ✅ |
| Testing Result (Not Tested/Passed/Failed/Blocked) | ✅ |
| Automation Status (Not Automated/Generated/Automated) | ✅ |
| Cypress Script Generator (via AI) | ✅ |
| Script Editor (Preview/Edit/Save/Copy/Download) | ✅ |
| Excel Export (per project) | ✅ |
| Excel Import (upload .xlsx, mapping kolom) | ✅ |
| Custom Toast & Confirm Modal (no browser alert) | ✅ |
| Data isolation per project | ✅ |

---

## Kolom Test Case

```
Test Case ID      → Auto-generated (TC001, TC002, ...)
Feature/Module    → Nama fitur
Test Scenario     → Apa yang ditest
Type              → Happy Path / Validation / Error Case / Important edge case
Precondition      → Kondisi awal sebelum test
Action Step       → Langkah-langkah test (numbered)
Test Data         → Data yang digunakan
Expected Result   → Hasil yang diharapkan
Actual Result     → Diisi setelah testing
Testing Result    → Not Tested / Passed / Failed / Blocked
Test Date         → Tanggal testing
Test by           → Nama tester
Bug Note          → Catatan bug
```

---

## API Endpoints

| Method | Path | Deskripsi |
|--------|------|-----------|
| GET | /api/health | Health check |
| GET | /api/projects | List projects |
| POST | /api/projects | Create project |
| PUT | /api/projects/:id | Edit project |
| DELETE | /api/projects/:id | Delete project (cascade) |
| GET | /api/projects/:id/test-cases | Get test cases by project (dengan filter) |
| POST | /api/projects/:id/save-test-cases | Save generated test cases |
| PUT | /api/test-cases/:id | Update test case |
| DELETE | /api/test-cases/:id | Delete test case |
| POST | /api/test-cases/bulk-delete | Bulk delete |
| POST | /api/ai/generate-test-cases | Generate via AI (tidak auto-save) |
| GET | /api/automation?projectId= | List automation scripts |
| POST | /api/automation/generate | Generate Cypress script via AI |
| PUT | /api/automation/:id | Update script |
| DELETE | /api/automation/:id | Delete script |
| POST | /api/excel/import | Upload Excel (.xlsx) |
| POST | /api/excel/export-new | Export test cases sebagai file baru |
| POST | /api/excel/export-project/:id | Export semua test case project |

---

## Environment Variables

| Variable | Wajib | Keterangan |
|----------|-------|------------|
| `PORT` | | Default: 3001 |
| `CLIENT_URL` | | Default: http://localhost:5173 |
| `DATABASE_URL` | ✅ | Absolute path ke file SQLite |
| `AI_PROVIDER` | | Default: nine-router |
| `NINE_ROUTER_BASE_URL` | ✅ | Base URL 9Router API |
| `NINE_ROUTER_API_KEY` | ✅ | API key 9Router |
| `NINE_ROUTER_MODEL` | | Default: cc/claude-sonnet-4-6 |
| `NINE_ROUTER_TIMEOUT` | | Default: 60000 (ms) |

---

## Struktur Project

```
qa-test-case-generator/
├── client/              # React + Vite + TypeScript
│   └── src/
│       ├── components/  # GenerateForm, TestCaseTable, Toast, dll
│       ├── pages/       # GeneratePage, TestCasesPage, AutomationPage, ProjectsPage
│       ├── services/    # api.ts
│       └── types/       # index.ts
├── server/              # Express + TypeScript
│   └── src/
│       ├── routes/      # ai, projects, test-cases, automation, excel
│       ├── services/    # AI provider, Excel service
│       ├── middleware/  # upload (multer)
│       └── validators/  # Zod schemas
├── data/                # SQLite database (qa-generator.db)
├── uploads/             # File Excel yang diupload (temp)
├── exports/             # File export temp
├── .env                 # Environment variables (jangan di-commit)
└── .env.example         # Template environment
```

---

## Troubleshooting

### Database error saat start
Jalankan ulang db push:
```bash
cd server
DATABASE_URL="file:/ABSOLUTE/PATH/data/qa-generator.db" node node_modules/.bin/prisma db push
```

### Schema berubah / reset database
```bash
cd server
DATABASE_URL="file:/ABSOLUTE/PATH/data/qa-generator.db" node node_modules/.bin/prisma db push --force-reset
```
> ⚠️ Data akan terhapus semua

### AI tidak respond
Cek `.env`:
- `NINE_ROUTER_BASE_URL` benar
- `NINE_ROUTER_API_KEY` valid
- `NINE_ROUTER_TIMEOUT` cukup besar (minimal 60000)

---

## Build Production

```bash
npm run build
```
Output: `client/dist/` dan `server/dist/`

> **Catatan untuk Vercel deployment**: SQLite hanya untuk local dev. Untuk production, ganti ke PostgreSQL (Supabase/Neon/Railway) dan ubah `provider = "sqlite"` → `provider = "postgresql"` di `server/prisma/schema.prisma`.
