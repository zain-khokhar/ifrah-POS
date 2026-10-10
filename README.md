# Ifrah Collection POS

**Offline-First Dress Rental Management System**

---

## Project Overview

Ifrah Collection ka dress rental business manage karne ke liye ek Windows desktop application.

**Core Features:**
- 📋 Booking Management
- 👥 Customer Records
- 👗 Dress Catalogue & Availability
- 💳 Payment Tracking
- 🚚 Delivery & Return Management
- 📊 Business Reports
- 🔒 User Roles (Owner / Cashier / Viewer)
- 💾 Offline SQLite Database
- ☁️ Supabase Cloud Sync (Phase 11)

---

## Tech Stack

| Layer | Technology |
|---|---|
| UI | Next.js 16 + React 19 (JavaScript) |
| Desktop | Electron |
| Local DB | SQLite + better-sqlite3 |
| ORM | Drizzle ORM (Phase 1) |
| Online DB | Supabase PostgreSQL (Phase 11) |
| Styling | Tailwind CSS v4 |
| Forms | React Hook Form + Zod |
| Icons | Lucide React |

---

## Development Setup

```bash
# Install dependencies
npm install

# Start in development mode (Next.js + Electron)
npm run dev

# Or run separately:
npm run dev:next      # Next.js on http://localhost:3000
npm run dev:electron  # Electron (waits for Next.js)
```

---

## Project Phases

| Phase | Description | Status |
|---|---|---|
| **Phase 0** | Foundation — Project setup, UI skeleton | ✅ Done |
| **Phase 1** | Local SQLite database & migrations | 🔲 Next |
| **Phase 2** | Authentication & roles | 🔲 Pending |
| **Phase 3** | Customers, cities, casts | 🔲 Pending |
| **Phase 4** | Dress catalogue | 🔲 Pending |
| **Phase 5** | Core booking system | 🔲 Pending |
| **Phase 6** | Availability & double-booking | 🔲 Pending |
| **Phase 7** | Payments & receipts | 🔲 Pending |
| **Phase 8** | Delivery, return & prep reports | 🔲 Pending |
| **Phase 9** | Reports & exports | 🔲 Pending |
| **Phase 10** | Access data migration | 🔲 Pending |
| **Phase 11** | Supabase sync | 🔲 Pending |
| **Phase 12** | Backup, restore & audit | 🔲 Pending |
| **Phase 13** | UI/UX polish | 🔲 Pending |
| **Phase 14** | Testing & release | 🔲 Pending |

---

## Folder Structure

```
ifrah-pos/
├── electron/
│   ├── main.js          # Electron main process
│   ├── preload.js       # Secure IPC bridge
│   └── database/        # SQLite (Phase 1)
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   └── login/   # Login screen
│   │   ├── (dashboard)/ # All protected pages
│   │   │   ├── dashboard/
│   │   │   ├── bookings/
│   │   │   ├── customers/
│   │   │   ├── dresses/
│   │   │   ├── payments/
│   │   │   ├── deliveries/
│   │   │   ├── returns/
│   │   │   ├── reports/
│   │   │   ├── users/
│   │   │   ├── settings/
│   │   │   └── backup/
│   │   └── globals.css  # Design system
│   └── components/
│       └── layout/
│           └── Sidebar.js
└── package.json
```

---

## Demo Credentials (Phase 0)

| Username | Password | Role |
|---|---|---|
| `owner` | `owner123` | Owner — full access |
| `cashier` | `cashier123` | Cashier — bookings & payments |
| `viewer` | `viewer123` | Viewer — read only |

> **Note:** Phase 1 mein yeh SQLite mein real hashed passwords se replace honge.

---

## Architecture Decisions

1. **SQLite first** — Sab kuch pehle locally kaam karta hai
2. **Supabase sync** — Later, non-blocking
3. **Electron + Next.js** — Dev mode: Next.js dev server. Production: static export
4. **Context isolation ON** — Renderer ko direct Node access nahi
5. **Payments append-only** — Edit nahi hote, sirf void/reversal
6. **Booking grand total** — Always calculated from items & payments, never stored as editable

---

*Developed with ❤️ for Ifrah Collection*
>>>>>>> 8b806ee (feat: initial commit - Next.js + Electron POS foundation with SQLite schema)
