# DMoney API Documentation — Assignment Flow

> Companion documents: [Testcase.md](./Testcase.md) (test design) · [README.md](./README.md) (assignment overview) · [collection/Reports/report.html](./collection/Reports/report.html) (Newman run report)
>
> Base URL: `http://localhost:5000` · Full interactive Swagger docs: `http://localhost:5000/api-docs/user` and `http://localhost:5000/api-docs/transaction` (also see [API_ENDPOINTS_SUMMARY.md](../../dmoney-transaction-api/swagger/API_ENDPOINTS_SUMMARY.md) in the API repo).
>
> This document only covers the endpoints exercised by this assignment's flow and its Postman collection. It is written directly from the controller source in `dmoney-transaction-api/controllers/`.

## Authentication model

| Header | Used by | Notes |
|---|---|---|
| `Authorization: Bearer <token>` | every authenticated endpoint | Obtained from `/user/login` (Admin/SYSTEM) or `/user/login` + `/user/verify-otp` (Customer/Agent/Merchant). |
| `X-AUTH-SECRET-KEY: <PARTNER_KEY>` | every route in this flow **except** `/user/login`, `/user/verify-otp` and `/user/create`'s siblings under `publicAuthenticateJWT` | Must equal the API's `PARTNER_KEY` env value. Missing/incorrect → `401 { "message": "Secret auth key validation failure!" }`. Missing Bearer token → `401 { "message": "No Token Found!" }`. Expired/invalid token → `403 { "message": "Token expired!" }` / `403 { "message": "Token invalid!" }`. |

The account number for every transaction endpoint is the user's `phone_number` — never their `id` or `email`.

## 1. `POST /user/login`

Public — no auth headers required.

**Request body:**
```json
{ "email": "user@gmail.com", "password": "1234" }
```
or
```json
{ "phone_number": "01911110001", "password": "1234" }
```

**Response — Admin or the SYSTEM account (`phone_number = "SYSTEM"`), `200 OK`:**
```json
{ "message": "Login successful", "token": "<jwt>", "role": "Admin", "expiresIn": "1h" }
```
The token is issued directly; OTP is skipped for these two accounts only.

**Response — Customer / Agent / Merchant, `200 OK`:**
```json
{ "message": "OTP sent to your registered email address", "otpRequired": true }
```
A 4-digit OTP is generated, stored against the user (2-minute expiry), always logged to the API server console, and emailed when the account's address is a Gmail address.

**Errors:** `404 { "message": "User not found" }` · `401 { "message": "Password incorrect" }`.

## 2. `POST /user/verify-otp`

Public. Completes login for Customer/Agent/Merchant after `/user/login`.

**Request body:**
```json
{ "identifier": "01911110001", "otp": "1234" }
```

**Dev bypass (automation only):** append `?env=dev` and send `otp` equal to the API's `DEFAULT_OTP` env value to skip the stored-OTP match/expiry check. Required for any automated (Postman/Newman) run — see [nodeman.md](./nodeman.md) for setup.

**Response — `200 OK`:**
```json
{ "message": "Login successful", "token": "<jwt>", "role": "Customer", "expiresIn": "1h" }
```

**Errors:** `400 { "message": "Identifier and OTP are required" }` · `404 { "message": "User not found" }` · `400 { "message": "No OTP found. Please login again to request a new OTP." }` · `401 { "message": "OTP has expired. Please login again to receive a new OTP." }` · `401 { "message": "Invalid OTP. Please try again." }`.

## 3. `POST /user/create` — Admin only

Requires `Authorization` + `X-AUTH-SECRET-KEY`; the caller's role must be `Admin`.

**Request body:**
```json
{
  "name": "DMoney QA Customer One",
  "email": "dmoney.qa.cust1@gmail.com",
  "password": "Test@1234",
  "phone_number": "01911110001",
  "nid": "9000000001",
  "role": "Customer"
}
```

| Field | Rule |
|---|---|
| `name` | required, 3–50 chars |
| `email` | required, must end in `@gmail.com`, 5–255 chars |
| `password` | required, 4–1024 chars (sent in plaintext, hashed server-side with SHA-256) |
| `phone_number` | required, exactly 11 characters — this is the account number |
| `nid` | required, 7–13 chars |
| `role` | required, must exist in the `Roles` table (`Admin`, `Agent`, `Customer`, `Merchant`) |

**Response — `201 Created`:**
```json
{
  "message": "User created",
  "user": { "id": 5, "name": "...", "email": "...", "phone_number": "...", "role": "Customer", "status": "pending", "createdAt": "...", "updatedAt": "..." }
}
```
New accounts always start with `status: "pending"` and cannot transact until activated.

**Errors:** `403 { "message": "Only admin can create new users" }` (caller not Admin) · `400 { "message": "Invalid role: <role>. This role does not exist in the Role table." }` · `208 { "message": "User already exists" }` (email or phone already registered) · `400` with a Joi validation message for a missing/invalid field.

## 4. `PATCH /user/update/:id` — activate/suspend a user

Requires `Authorization` + `X-AUTH-SECRET-KEY`. Admin can update any user; a user can partially update only their own record (and cannot change their own `role`/`status`).

**Request body (activation):**
```json
{ "status": "active" }
```

**Response — `200 OK`:**
```json
{ "message": "User updated successfully", "user": { "status": "active" } }
```

**Errors:** `404 { "message": "User not found" }` · `403 { "message": "You can only update your own account" }` (non-admin, not self) · `403 { "message": "Stupid! Do not try to update this!" }` for the protected SYSTEM account or the seeded `admin@dmoney.com` account — these can never be modified through this endpoint.

## 5. `POST /transaction/adminDeposit`

Requires `Authorization` + `X-AUTH-SECRET-KEY`. The caller must be the `from_account` holder and that account's role must be `Agent` (this includes the special SYSTEM account, whose role is also `Agent`).

### 5a. Flow 1 — SYSTEM → regular Agent (funding)

```json
{ "from_account": "SYSTEM", "to_account": "01911110003", "amount": 5000 }
```
No fee, no commission, no min/max amount limit.

**Response — `201 Created`:**
```json
{ "message": "SYSTEM deposit to Agent successful", "trnxId": "TXN...", "amount": 5000, "agentBalance": 5000 }
```

**Errors:** `400 { "message": "SYSTEM account can only deposit to a regular Agent account. Customer and Merchant accounts are not allowed." }` (to_account is not a regular Agent) · `400 { "message": "From account and to account cannot be the same" }` · `208 { "message": "SYSTEM account has insufficient balance", "currentBalance": ... }`.

### 5b. Flow 2 — regular Agent → Customer (commission-earning deposit)

```json
{ "from_account": "01911110003", "to_account": "01911110001", "amount": 2000 }
```
Amount must be between 10 and 10,000 tk (DB-configured). The Agent earns a 2.5% commission (DB-configured rate); the Customer receives the full amount.

**Response — `201 Created`:**
```json
{ "message": "Deposit successful", "trnxId": "TXN...", "commission": 50, "currentBalance": 3050 }
```
`commission` = `rate × amount` (2.5% × 2000 = 50 in this example); `currentBalance` is the Agent's own balance after the debit.

**Errors:** `400 { "message": "To account must be a Customer account. A regular Agent can only deposit to a Customer." }` · `400 { "message": "Minimum deposit amount is 10 tk and maximum deposit amount is 10000 tk" }` · `208 { "message": "Insufficient balance", "currentBalance": ... }` · `208` cap-exceeded variants when the customer's wallet would exceed its 10,000 tk cap.

**Common errors (both flows):** `403 { "message": "Unauthorized: you can only initiate transactions from your own account" }` · `403 { "message": "From account is not active. Please contact admin." }` / `"To account is not active..."` · `404 { "message": "From Account does not exist" }` / `"To Account does not exist"`.

## 6. `POST /transaction/sendmoney` — Customer → Customer

Requires `Authorization` + `X-AUTH-SECRET-KEY`; both accounts must be role `Customer`.

```json
{ "from_account": "01911110001", "to_account": "01911110002", "amount": 1000 }
```
Sender pays a flat 5 tk fee (DB-configured) to SYSTEM; receiver gets the full amount. Subject to the sender's daily (5,000 tk/10 txns) and monthly (50,000 tk/50 txns) outgoing limits (combined across Send Money, Payment and Withdraw).

**Response — `201 Created`:**
```json
{ "message": "Send money successful", "trnxId": "TXN...", "fee": 5, "currentBalance": 995 }
```

**Errors:** `400 { "message": "Send money is only allowed between two Customer accounts" }` · `400 { "message": "Minimum amount is 10 tk" }` · `208 { "message": "Insufficient balance", "currentBalance": ... }` · `400` limit-exceeded variants (daily/monthly cap).

## 7. `POST /transaction/withdraw` — Customer/Merchant cash-out via Agent

Requires `Authorization` + `X-AUTH-SECRET-KEY`; `from_account` must be `Customer` or `Merchant`, `to_account` must be `Agent`.

```json
{ "from_account": "01911110002", "to_account": "01911110003", "amount": 500 }
```
Customer pays a 1%-of-amount fee, floored at 5 tk (DB-configured), to SYSTEM. The Agent additionally earns a 2.5% commission (DB-configured) on top of the withdrawn amount. Customer withdrawals are subject to the same daily/monthly outgoing limits as Send Money.

**Response — `201 Created`:**
```json
{ "message": "Withdraw successful", "trnxId": "TXN...", "fee": 5, "currentBalance": 495 }
```

**Errors:** `400 { "message": "To Account is not agent account" }` · `400 { "message": "Minimum withdraw amount is 10 tk", "currentBalance": ... }` · `208 { "message": "Insufficient balance", "currentBalance": ... }`.

## 8. `POST /transaction/payment` — Customer/Agent → Merchant

Requires `Authorization` + `X-AUTH-SECRET-KEY`; `from_account` must be `Customer` or `Agent`, `to_account` must be `Merchant`.

```json
{ "from_account": "01911110001", "to_account": "01911110004", "amount": 400 }
```
Payer pays a 1%-of-amount fee, floored at 5 tk (DB-configured), to SYSTEM. Merchant receives the full amount. Optional `discount_code` + `discount_amount` (percentage) apply only when `discount_code` matches the API's `DISCOUNT_CODE` env value.

**Response — `201 Created`:**
```json
{ "message": "Payment successful", "trnxId": "TXN...", "fee": 5, "currentBalance": 590 }
```

**Errors:** `400 { "message": "From A/C should be customer or agent and To A/C should be merchant type" }` · `400 { "message": "Minimum Payment amount is 10 tk" }` · `208 { "message": "Insufficient balance", "currentBalance": ... }`.

## 9. `GET /user/search/email/:email` — read-only lookup

Requires only `Authorization` (no secret key — uses `publicAuthenticateJWT`). Used once in this collection's Setup folder to resolve the protected SYSTEM account's internal id for TC-011.

**Response — `200 OK`:**
```json
{ "message": "User found", "user": { "id": 1, "name": "SYSTEM", "phone_number": "SYSTEM", "role": "Agent", "status": "active", "balance": 8995000 } }
```

## Status code summary

| Code | Meaning in this API |
|---|---|
| `200` | Read succeeded, or login/OTP-verify succeeded |
| `201` | A resource/transaction was created |
| `208` | Business-rule "already reported" state — duplicate user, insufficient balance, deposit cap exceeded (non-standard use of 208; kept for compatibility with the existing API) |
| `400` | Validation failure or role/account-type mismatch |
| `401` | Missing/incorrect auth token or partner secret key |
| `403` | Authenticated but not authorized for this action, or a protected account/inactive account |
| `404` | Referenced user/transaction does not exist |
| `500` | Unhandled server error |

All errors are wrapped by the global handler as `{ "error": { "message": "..." } }` for uncaught exceptions; controller-level errors above are returned directly as `{ "message": "..." }` (and sometimes extra fields such as `currentBalance`).
