# Ifrah Collection POS — Staff Usability & Testing Protocol (Phase 14)

*Document Version:* 1.0  
*Target Audience:* Boutique Owner, Cashier Staff, Shop Operators  
*Date:* 2026-10-11  

---

## 1. Usability Test Protocol (5 Core Shop Tasks)

This protocol is designed to test non-technical staff conducting daily boutique operations.

### Task 1: Create a 3-Dress Booking with Advance Payment & Print Receipt
- **Objective:** Cashier creates a customer booking for 3 dresses, records an advance deposit, and prints an 80mm thermal receipt.
- **Staff Steps:**
  1. Click **Nayi Booking** (or press `Ctrl+N`).
  2. Pick dates: Delivery (`2026-10-25`) and Return (`2026-10-28`).
  3. Search customer `03001234567` or type a new customer name.
  4. In Dress line 1: select dress `Red Bridal Lehenga`, quantity `1`, rate `25,000`.
  5. In Dress line 2: select dress `Gold Walima Saree`, quantity `1`, rate `15,000`.
  6. In Dress line 3: select dress `Green Mehndi Suit`, quantity `1`, rate `10,000`.
  7. Enter advance payment: `Rs. 15,000` via `Cash`.
  8. Verify sticky bottom bar calculates Grand Total (`50,000`), Advance (`15,000`), and Remaining (`35,000`).
  9. Click **Save & Print** (or `Ctrl+S`).
- **Pass Criteria:**
  - Zero manual math required.
  - Receipt preview opens in under 1 second with correct Urdu disclaimer notes.
  - Staff completes within 90 seconds without hesitation.

---

### Task 2: Instant Global Search by Phone Number
- **Objective:** Staff locates an active booking within 2 seconds when a customer calls.
- **Staff Steps:**
  1. Press `Ctrl+F` from any screen to focus the top search bar.
  2. Type the customer's phone number without leading spaces or dashes (e.g. `03001234567`).
  3. Hit `Enter`.
- **Pass Criteria:**
  - Results appear in under 300 ms.
  - Card displays Customer name, Booking number, dates, dress names, status pill, and remaining balance.
  - Clicking the result opens the booking immediately.

---

### Task 3: Customer Search with Apostrophes & Special Characters
- **Objective:** Ensure punctuation, apostrophes, and Urdu names never break search.
- **Staff Steps:**
  1. Search `O'Neill` or `D'Souza` or `عائشہ خان`.
- **Pass Criteria:**
  - Query succeeds without database error or syntax glitch.
  - Normalized matching returns the correct profile.

---

### Task 4: Mark Booking Returned & Prompt Settling
- **Objective:** Customer returns the dress. Staff marks condition and settles remaining balance.
- **Staff Steps:**
  1. Navigate to **Returns Due** from sidebar or click **Returns Today** on Home dashboard.
  2. Find the delivered booking and click **Mark Returned**.
  3. Select dress condition: `OK` / `Needs cleaning` / `Damaged`.
  4. System prompts: *“Baqaya raqam Rs. 35,000 wasool karein aur booking close karein?”*
  5. Staff clicks **Collect & Close**.
- **Pass Criteria:**
  - Payment recorded atomically.
  - Booking status transitions to `Closed` cleanly.
  - Returns counter decrements immediately.

---

### Task 5: 1-Click Print Daily Pack
- **Objective:** Every morning or evening, staff prints the 3 essential operational sheets with 1 click.
- **Staff Steps:**
  1. Go to **Reports** (`/reports`).
  2. Click **Print Daily Pack (3 Reports)**.
- **Pass Criteria:**
  - Generates Deliveries Today sheet, Prepare/Dry-Clean sheet, and Returns Due sheet.
  - Formatted for clean printing with customer contact numbers and dress size details.

---

## 2. Accessibility & Display Verification

1. **High Contrast Dark Aesthetic:**
   - Deep background (`#0f0e1a`) with high-contrast text (`#ffffff`, `#e2e8f0`).
   - WCAG AAA contrast ratio on all primary buttons and text labels.
2. **125% and 150% Windows DPI Scale Support:**
   - UI built with fluid CSS layout units.
   - Text remains sharp and does not truncate or overlap on 125% scaling (standard on 14" shop laptops).
3. **Visible Focus & Keyboard Navigation:**
   - Every input has a distinct focus ring (`ring-2 ring-primary`).
   - Key shortcuts:
     - `Ctrl+N`: New booking
     - `Ctrl+F`: Global search
     - `Ctrl+S`: Save booking
     - `Escape`: Close modals

---

## 3. Staff Error-State Review (Zero Technical Jargon)

| Raw System Event | Friendly Staff Message Displayed |
|---|---|
| `SQLITE_BUSY` | *"Database masroof hai. Barah-e-karam 2 second baad dobara koshish karein."* |
| `UNIQUE constraint` | *"Ye record ya booking number pehle se mojood hai."* |
| `NOT NULL constraint` | *"Zaroori maloomat darj nahi ki gayi. Barah-e-karam khali fields check karein."* |
| Network offline | *"Offline mode — aap ka kaam mehfooz hai (Local database me save ho gaya)."* |
| Date overlap clash | *"⚠️ Needs a look: Ye dress un tareekhon me Booking #X ke liye pehle se booked hai."* |
| Unpaid close attempt | *"Booking close nahi ho sakti: Baqaya raqam Rs. X ada hona baqi hai."* |
