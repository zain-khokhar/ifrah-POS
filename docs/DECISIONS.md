# Decisions

## Phase 2 - Login, roles and audit

| Decision | Answer | Date |
| --- | --- | --- |
| Staff login method | Password, hashed with Node scrypt | 2026-10-10 |
| Idle auto-logout | 15 minutes of inactivity | 2026-10-10 |
| First Owner account name | Zain | 2026-10-10 |

## Phase 5 - Payments, remaining, status & manual backup

| Decision | Answer | Date |
| --- | --- | --- |
| Who can void a payment? | Owner only (Cashiers strictly disallowed); requires void reason & audit log | 2026-10-10 |
| Allowed payment methods | `cash`, `bank`, `wallet`, `other` | 2026-10-10 |
| Security deposits handling | Recorded as `deposit` kind; isolated from rental `remaining` calculation | 2026-10-10 |
| Booking Closed status requirements | Must have all dresses delivered, returned, and remaining balance = 0 | 2026-10-10 |
| Owner force-close override | Permitted with mandatory reason logged in audit trail | 2026-10-10 |
| Manual backup format & destination | Safe SQLite `VACUUM INTO` / backup API with `PRAGMA integrity_check`; native Windows Save As dialog for USB or custom local path | 2026-10-10 |
