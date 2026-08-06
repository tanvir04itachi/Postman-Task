# DMoney API Testing — Test Design
## 1. Feature Summary

DMoney is a mobile-financial-service ledger. Every account's balance is derived, never stored, as `SUM(credit) − SUM(debit)` over an append-only `Transactions` table. A user's `phone_number` is their account number for every transaction — not their `id` or `email`.

- **Who uses it:** an Admin (onboards and activates accounts), a SYSTEM account (funds Agents), Agents (fund Customers, pay out cash-outs), Customers (send/receive/pay/cash-out), Merchants (receive payments).
- **What triggers it:** an Admin creating accounts via `POST /user/create`, then activating them via `PATCH /user/update/:id`; thereafter each role logs in (`POST /user/login`, plus OTP verification for non-Admin/non-SYSTEM roles) and calls the relevant transaction endpoint.
- **Preconditions common to every transaction:** both the sender and receiver accounts must exist and have `status = "active"`; the caller's JWT identity (`phone_number` or `email`) must match the `from_account` being debited; both a Bearer token and the `X-AUTH-SECRET-KEY` partner header must be present and valid.
- **Business rules enforced (fees/commissions are DB-driven, not hardcoded):**
  - SYSTEM → Agent: no fee, no commission, no amount limit — pure top-up.
  - Agent → Customer deposit: Agent earns a 2.5% commission on the deposited amount; Customer receives the full amount; amount must be between 10 and 10,000 tk.
  - Customer → Customer send money: sender pays a flat 5 tk fee to SYSTEM; receiver gets the full amount sent.
  - Customer cash-out via Agent (withdraw): customer pays a 1% fee (minimum 5 tk) to SYSTEM; the Agent additionally earns a 2.5% commission on the withdrawn amount.
  - Customer/Agent → Merchant payment: payer pays a 1% fee (minimum 5 tk) to SYSTEM; Merchant receives the full amount.
- **What the user sees:** each successful transaction returns a `trnxId`, the fee/commission actually charged, and the caller's resulting balance.
- **What gets recorded:** every operation writes 2–3 ledger rows sharing one `trnxId` (debit/credit/fee split), tagged with a `transaction_type` (`Deposit`, `SendMoney`, `Withdraw`, `Payment`).
- **What happens on failure:** role/account-type mismatches and inactive accounts return `400`/`403`; insufficient balance and per-account deposit caps return `208`; missing/invalid auth returns `401`/`403`; missing resources return `404`.
- **What it connects to:** a Customer's daily (5,000 tk / 10 txns) and monthly (50,000 tk / 50 txns) outgoing limits are enforced across `SendMoney`, `Payment` and `Withdraw` combined — out of scope for this flow's amounts, which stay well under both caps.

## 2. Acceptance Criteria

AC-1 — An admin can create Customer, Agent and Merchant accounts; each new account starts in `pending` status and cannot transact until the admin activates it.
AC-2 — Creating an account with a duplicate email/phone, an invalid role, or a missing required field is rejected, and no account is created.
AC-3 — Only an admin can activate an account (set it to `active`); the protected SYSTEM/Admin seed accounts cannot be modified through this path.
AC-4 — The SYSTEM account can fund a regular Agent's wallet with no fee; the funded Agent's balance reflects the full funded amount, and SYSTEM cannot fund a Customer or Merchant directly.
AC-5 — When an Agent deposits into an activated Customer's wallet, the Agent is charged the deposited amount but credited a 2.5% commission back, and the Customer receives the full deposited amount; deposits below 10 tk or into a non-Customer account are rejected.
AC-6 — When one Customer sends money to another Customer, the sender is charged the amount plus a flat 5 tk fee, and the receiving Customer gets the full amount; sending to a non-Customer account, or with insufficient balance, is rejected.
AC-7 — When a Customer cashes out through an Agent, the customer is charged the amount plus a 1%-of-amount (min 5 tk) fee, and the Agent's balance additionally reflects a 2.5% commission on the withdrawn amount; withdrawing to a non-Agent account is rejected.
AC-8 — When a Customer pays a Merchant, the payer is charged the amount plus a 1%-of-amount (min 5 tk) fee, and the Merchant receives the full paid amount; paying a non-Merchant account is rejected.
AC-9 — Every transaction and account-management request requires a valid Bearer token and the correct partner secret key; requests missing either are rejected without changing any balance.

## 3. Test Cases

Case order follows the assignment's own flow order: 3a user creation → 3b activation → 3c SYSTEM funds Agent → 3d Agent deposits to Customer (commission) → 3e Customer sends money (fee) → 3f Customer cashes out via Agent (fee) → 3g Customer pays Merchant (fee). Within each group: happy path first, then that group's negative cases.

All requests go through the Postman collection [DMoney-API-Testing.postman_collection.json](./postman/DMoney-API-Testing.postman_collection.json); a one-time **Setup** folder (Admin login, SYSTEM-account id lookup) runs first and is not itself a test case.

### 3a. User Creation (Admin) — AC-1, AC-2

### TC-001

**Test Title:** Verify that a new Customer account is created by the admin and starts in pending status
**Type:** Functional — (system)
**Priority:** High
**Any Issue?:** N/A — bug hunt not yet run

**Preconditions:**
- An Admin is logged in and holds a valid Bearer token and the partner secret key (`X-AUTH-SECRET-KEY`).
- The Customer's email and phone number are not already registered.

**Test Data:**
- `POST /user/create`, role `Customer`, a unique Gmail address, an 11-digit phone number, a 7–13 character NID.

**Steps:**
1. As the admin, call `POST /user/create` with the Customer's details.

**Expected Result:**
- Response is `201 Created` with message `User created`.
- Returned `user.role` is `Customer` and `user.status` is `pending`.

### TC-002

**Test Title:** Verify that a second new Customer account is created by the admin and starts in pending status
**Type:** Functional — (system)
**Priority:** High
**Any Issue?:** N/A — bug hunt not yet run

**Preconditions:**
- Same as TC-001, for a second, distinct Customer.

**Test Data:**
- `POST /user/create`, role `Customer`, a second unique Gmail address, phone number and NID.

**Steps:**
1. As the admin, call `POST /user/create` with the second Customer's details.

**Expected Result:**
- `201 Created`, message `User created`, `user.role = Customer`, `user.status = pending`.

### TC-003

**Test Title:** Verify that a new Agent account is created by the admin and starts in pending status
**Type:** Functional — (system)
**Priority:** High
**Any Issue?:** N/A — bug hunt not yet run

**Preconditions:**
- Same as TC-001, role `Agent`.

**Test Data:**
- `POST /user/create`, role `Agent`, a unique Gmail address, phone number and NID.

**Steps:**
1. As the admin, call `POST /user/create` with the Agent's details.

**Expected Result:**
- `201 Created`, message `User created`, `user.role = Agent`, `user.status = pending`.

### TC-004

**Test Title:** Verify that a new Merchant account is created by the admin and starts in pending status
**Type:** Functional — (system)
**Priority:** High
**Any Issue?:** N/A — bug hunt not yet run

**Preconditions:**
- Same as TC-001, role `Merchant`.

**Test Data:**
- `POST /user/create`, role `Merchant`, a unique Gmail address, phone number and NID.

**Steps:**
1. As the admin, call `POST /user/create` with the Merchant's details.

**Expected Result:**
- `201 Created`, message `User created`, `user.role = Merchant`, `user.status = pending`.

### TC-005

**Test Title:** Verify that account creation is rejected when the email is already registered
**Type:** Negative — (system)
**Priority:** High
**Any Issue?:** N/A — bug hunt not yet run

**Preconditions:**
- The Customer created in TC-001 already exists.

**Test Data:**
- `POST /user/create` reusing TC-001's email with a new, unused phone number.

**Steps:**
1. As the admin, call `POST /user/create` with the duplicate email.

**Expected Result:**
- Response is `208` with message `User already exists`.
- No new account is created.

### TC-006

**Test Title:** Verify that account creation is rejected when a required field is missing
**Type:** Negative — (system)
**Priority:** Medium
**Any Issue?:** N/A — bug hunt not yet run

**Preconditions:**
- Admin token and secret key are valid.

**Test Data:**
- `POST /user/create` with the `name` field omitted from an otherwise valid Customer payload.

**Steps:**
1. As the admin, call `POST /user/create` without a `name`.

**Expected Result:**
- Response is `400` with a validation message naming the missing field.
- No account is created.

### 3b. Admin Activation — AC-1, AC-3

### TC-007

**Test Title:** Verify that the admin can activate the newly created Customer account
**Type:** Functional — (system)
**Priority:** High
**Any Issue?:** N/A — bug hunt not yet run

**Preconditions:**
- Customer from TC-001 exists with `status = pending`.

**Test Data:**
- `PATCH /user/update/{customer1Id}`, body `{ "status": "active" }`.

**Steps:**
1. As the admin, call `PATCH /user/update/{customer1Id}` with `status: active`.

**Expected Result:**
- `200 OK`, message `User updated successfully`.
- The customer's account is now `active` and can transact.

### TC-008

**Test Title:** Verify that the admin can activate the second Customer account
**Type:** Functional — (system)
**Priority:** High
**Any Issue?:** N/A — bug hunt not yet run

**Preconditions:**
- Customer from TC-002 exists with `status = pending`.

**Test Data:**
- `PATCH /user/update/{customer2Id}`, body `{ "status": "active" }`.

**Steps:**
1. As the admin, call `PATCH /user/update/{customer2Id}` with `status: active`.

**Expected Result:**
- `200 OK`, message `User updated successfully`; account is now `active`.

### TC-009

**Test Title:** Verify that the admin can activate the Agent account
**Type:** Functional — (system)
**Priority:** High
**Any Issue?:** N/A — bug hunt not yet run

**Preconditions:**
- Agent from TC-003 exists with `status = pending`.

**Test Data:**
- `PATCH /user/update/{agentId}`, body `{ "status": "active" }`.

**Steps:**
1. As the admin, call `PATCH /user/update/{agentId}` with `status: active`.

**Expected Result:**
- `200 OK`, message `User updated successfully`; account is now `active`.

### TC-010

**Test Title:** Verify that the admin can activate the Merchant account
**Type:** Functional — (system)
**Priority:** High
**Any Issue?:** N/A — bug hunt not yet run

**Preconditions:**
- Merchant from TC-004 exists with `status = pending`.

**Test Data:**
- `PATCH /user/update/{merchantId}`, body `{ "status": "active" }`.

**Steps:**
1. As the admin, call `PATCH /user/update/{merchantId}` with `status: active`.

**Expected Result:**
- `200 OK`, message `User updated successfully`; account is now `active`.

### TC-011

**Test Title:** Verify that the protected SYSTEM account cannot be modified through the update endpoint
**Type:** Negative / Security — (system)
**Priority:** High
**Any Issue?:** N/A — bug hunt not yet run

**Preconditions:**
- The admin knows the SYSTEM account's internal id (looked up once in the Setup folder).

**Test Data:**
- `PATCH /user/update/{systemUserId}`, body `{ "status": "active" }`.

**Steps:**
1. As the admin, call `PATCH /user/update/{systemUserId}`.

**Expected Result:**
- Response is `403` with message `Stupid! Do not try to update this!`.
- The SYSTEM account is unchanged.

### 3c. SYSTEM Funds the Agent — AC-4

### TC-012

**Test Title:** Verify that the SYSTEM account logs in directly without an OTP step
**Type:** Functional — (system)
**Priority:** High
**Any Issue?:** N/A — bug hunt not yet run

**Preconditions:**
- The SYSTEM account (`system@dmoney.com` / `1234`) is seeded and active.

**Test Data:**
- `POST /user/login`, body `{ "email": "system@dmoney.com", "password": "1234" }`.

**Steps:**
1. Call `POST /user/login` with the SYSTEM account's credentials.

**Expected Result:**
- `200 OK`, a JWT `token` is returned directly (no OTP is requested), `role` is `Agent`.

### TC-013

**Test Title:** Verify that the SYSTEM account can fund the Agent's wallet with 5,000 tk
**Type:** Functional — (system)
**Priority:** High
**Any Issue?:** N/A — bug hunt not yet run

**Preconditions:**
- SYSTEM is logged in (TC-012). The Agent (TC-003/TC-009) is `active`.

**Test Data:**
- `POST /transaction/deposit`, body `{ "from_account": "SYSTEM", "to_account": "{agentPhone}", "amount": 5000 }`.

**Steps:**
1. As SYSTEM, call `POST /transaction/deposit` funding the Agent with 5,000 tk.

**Expected Result:**
- `201 Created`, message `SYSTEM deposit to Agent successful`.
- `agentBalance` in the response equals `5000`.
- No fee or commission is charged on this transfer.

### TC-014

**Test Title:** Verify that SYSTEM cannot deposit directly into a Customer's wallet
**Type:** Negative — (system)
**Priority:** High
**Any Issue?:** N/A — bug hunt not yet run

**Preconditions:**
- SYSTEM is logged in. The Customer (TC-001/TC-007) is `active`.

**Test Data:**
- `POST /transaction/deposit`, body `{ "from_account": "SYSTEM", "to_account": "{customer1Phone}", "amount": 1000 }`.

**Steps:**
1. As SYSTEM, call `POST /transaction/deposit` targeting the Customer's account.

**Expected Result:**
- Response is `400` with message `SYSTEM account can only deposit to a regular Agent account. Customer and Merchant accounts are not allowed.`
- No balance changes.

### 3d. Agent Deposits to Customer — AC-5

### TC-015

**Test Title:** Verify that the Agent's login sends a one-time password rather than a direct token
**Type:** Functional — (system)
**Priority:** High
**Any Issue?:** N/A — bug hunt not yet run

**Preconditions:**
- The Agent account is `active`.

**Test Data:**
- `POST /user/login`, body `{ "phone_number": "{agentPhone}", "password": "{testUserPassword}" }`.

**Steps:**
1. Call `POST /user/login` with the Agent's credentials.

**Expected Result:**
- `200 OK`, message `OTP sent to your registered email address`, `otpRequired` is `true`; no token is returned yet.

### TC-016

**Test Title:** Verify that the Agent completes login by verifying the one-time password
**Type:** Functional — (system)
**Priority:** High
**Any Issue?:** N/A — bug hunt not yet run

**Preconditions:**
- TC-015 has requested an OTP for the Agent. (A fixed OTP is configured for automated verification per this environment's `DEFAULT_OTP` setup — see [nodeman.md](./nodeman.md).)

**Test Data:**
- `POST /user/verify-otp?env=dev`, body `{ "identifier": "{agentPhone}", "otp": "{defaultOtp}" }`.

**Steps:**
1. Call `POST /user/verify-otp` with the Agent's identifier and OTP.

**Expected Result:**
- `200 OK`, a JWT `token` is returned, `role` is `Agent`.

### TC-017

**Test Title:** Verify that the Agent depositing 2,000 tk to the Customer earns the correct deposit commission
**Type:** Functional — (system)
**Priority:** High
**Any Issue?:** N/A — bug hunt not yet run

**Preconditions:**
- The Agent is logged in (TC-016) and holds 5,000 tk (TC-013). The Customer is `active`.

**Test Data:**
- `POST /transaction/deposit`, body `{ "from_account": "{agentPhone}", "to_account": "{customer1Phone}", "amount": 2000 }`.

**Steps:**
1. As the Agent, call `POST /transaction/deposit` depositing 2,000 tk into the Customer's wallet.

**Expected Result:**
- `201 Created`, message `Deposit successful`.
- `commission` in the response equals `50` (2.5% of 2,000 tk).
- The Customer's wallet is credited the full 2,000 tk; the Agent's balance is debited 2,000 tk less the 50 tk commission earned.

### TC-018

**Test Title:** Verify that an Agent deposit below the 10 tk minimum is rejected
**Type:** Negative — (system)
**Priority:** Medium
**Any Issue?:** N/A — bug hunt not yet run

**Preconditions:**
- The Agent is logged in. The Customer is `active`.

**Test Data:**
- `POST /transaction/deposit`, body `{ "from_account": "{agentPhone}", "to_account": "{customer1Phone}", "amount": 5 }`.

**Steps:**
1. As the Agent, call `POST /transaction/deposit` with a 5 tk amount.

**Expected Result:**
- Response is `400` with message `Minimum deposit amount is 10 tk and maximum deposit amount is 10000 tk`.
- No balance changes.

### TC-019

**Test Title:** Verify that an Agent cannot deposit into a non-Customer account
**Type:** Negative — (system)
**Priority:** High
**Any Issue?:** N/A — bug hunt not yet run

**Preconditions:**
- The Agent is logged in. The Merchant (TC-004/TC-010) is `active`.

**Test Data:**
- `POST /transaction/deposit`, body `{ "from_account": "{agentPhone}", "to_account": "{merchantPhone}", "amount": 100 }`.

**Steps:**
1. As the Agent, call `POST /transaction/deposit` targeting the Merchant's account.

**Expected Result:**
- Response is `400` with message `To account must be a Customer account. A regular Agent can only deposit to a Customer.`

### 3e. Customer Sends Money to Customer — AC-6

### TC-020

**Test Title:** Verify that Customer 1's login sends a one-time password
**Type:** Functional — (system)
**Priority:** High
**Any Issue?:** N/A — bug hunt not yet run

**Preconditions:**
- Customer 1 is `active`.

**Test Data:**
- `POST /user/login`, body `{ "phone_number": "{customer1Phone}", "password": "{testUserPassword}" }`.

**Steps:**
1. Call `POST /user/login` with Customer 1's credentials.

**Expected Result:**
- `200 OK`, message `OTP sent to your registered email address`, `otpRequired` is `true`.

### TC-021

**Test Title:** Verify that Customer 1 completes login by verifying the one-time password
**Type:** Functional — (system)
**Priority:** High
**Any Issue?:** N/A — bug hunt not yet run

**Preconditions:**
- TC-020 requested an OTP for Customer 1.

**Test Data:**
- `POST /user/verify-otp?env=dev`, body `{ "identifier": "{customer1Phone}", "otp": "{defaultOtp}" }`.

**Steps:**
1. Call `POST /user/verify-otp` with Customer 1's identifier and OTP.

**Expected Result:**
- `200 OK`, a JWT `token` is returned, `role` is `Customer`.

### TC-022

**Test Title:** Verify that Customer 1 sending 1,000 tk to Customer 2 charges the correct service fee
**Type:** Functional — (system)
**Priority:** High
**Any Issue?:** N/A — bug hunt not yet run

**Preconditions:**
- Customer 1 is logged in (TC-021) and holds 2,000 tk (TC-017). Customer 2 is `active`.

**Test Data:**
- `POST /transaction/sendmoney`, body `{ "from_account": "{customer1Phone}", "to_account": "{customer2Phone}", "amount": 1000 }`.

**Steps:**
1. As Customer 1, call `POST /transaction/sendmoney` sending 1,000 tk to Customer 2.

**Expected Result:**
- `201 Created`, message `Send money successful`.
- `fee` in the response equals `5` (flat send-money fee).
- Customer 2 is credited the full 1,000 tk; Customer 1 is debited 1,005 tk (amount + fee).

### TC-023

**Test Title:** Verify that Send Money is rejected when the receiver is not a Customer account
**Type:** Negative — (system)
**Priority:** High
**Any Issue?:** N/A — bug hunt not yet run

**Preconditions:**
- Customer 1 is logged in. The Agent is `active`.

**Test Data:**
- `POST /transaction/sendmoney`, body `{ "from_account": "{customer1Phone}", "to_account": "{agentPhone}", "amount": 100 }`.

**Steps:**
1. As Customer 1, call `POST /transaction/sendmoney` targeting the Agent's account.

**Expected Result:**
- Response is `400` with message `Send money is only allowed between two Customer accounts`.

### TC-024

**Test Title:** Verify that Send Money is rejected when the sender has insufficient balance
**Type:** Negative — (system)
**Priority:** High
**Any Issue?:** N/A — bug hunt not yet run

**Preconditions:**
- Customer 1 is logged in with a balance of 995 tk (2,000 tk deposited minus the 1,005 tk sent in TC-022).

**Test Data:**
- `POST /transaction/sendmoney`, body `{ "from_account": "{customer1Phone}", "to_account": "{customer2Phone}", "amount": 1000 }` (1,005 tk total debit requested against a 995 tk balance).

**Steps:**
1. As Customer 1, call `POST /transaction/sendmoney` requesting more than the available balance.

**Expected Result:**
- Response is `208` with message `Insufficient balance` and the caller's actual `currentBalance`.
- No balance changes.

### 3f. Customer Cashes Out via Agent — AC-7

### TC-025

**Test Title:** Verify that Customer 2's login sends a one-time password
**Type:** Functional — (system)
**Priority:** High
**Any Issue?:** N/A — bug hunt not yet run

**Preconditions:**
- Customer 2 is `active`.

**Test Data:**
- `POST /user/login`, body `{ "phone_number": "{customer2Phone}", "password": "{testUserPassword}" }`.

**Steps:**
1. Call `POST /user/login` with Customer 2's credentials.

**Expected Result:**
- `200 OK`, message `OTP sent to your registered email address`, `otpRequired` is `true`.

### TC-026

**Test Title:** Verify that Customer 2 completes login by verifying the one-time password
**Type:** Functional — (system)
**Priority:** High
**Any Issue?:** N/A — bug hunt not yet run

**Preconditions:**
- TC-025 requested an OTP for Customer 2.

**Test Data:**
- `POST /user/verify-otp?env=dev`, body `{ "identifier": "{customer2Phone}", "otp": "{defaultOtp}" }`.

**Steps:**
1. Call `POST /user/verify-otp` with Customer 2's identifier and OTP.

**Expected Result:**
- `200 OK`, a JWT `token` is returned, `role` is `Customer`.

### TC-027

**Test Title:** Verify that Customer 2 cashing out 500 tk from the Agent charges the correct cash-out fee
**Type:** Functional — (system)
**Priority:** High
**Any Issue?:** N/A — bug hunt not yet run

**Preconditions:**
- Customer 2 is logged in (TC-026) and holds 1,000 tk (credited in TC-022). The Agent is `active`.

**Test Data:**
- `POST /transaction/withdraw`, body `{ "from_account": "{customer2Phone}", "to_account": "{agentPhone}", "amount": 500 }`.

**Steps:**
1. As Customer 2, call `POST /transaction/withdraw` cashing out 500 tk through the Agent.

**Expected Result:**
- `201 Created`, message `Withdraw successful`.
- `fee` in the response equals `5` (1% of 500 tk, floored at the 5 tk minimum).
- Customer 2 is debited 505 tk; the Agent's balance additionally reflects a 12.50 tk commission (2.5% of 500 tk) on top of the 500 tk received.

### TC-028

**Test Title:** Verify that cashing out is rejected when the destination is not an Agent account
**Type:** Negative — (system)
**Priority:** High
**Any Issue?:** N/A — bug hunt not yet run

**Preconditions:**
- Customer 2 is logged in. The Merchant is `active`.

**Test Data:**
- `POST /transaction/withdraw`, body `{ "from_account": "{customer2Phone}", "to_account": "{merchantPhone}", "amount": 100 }`.

**Steps:**
1. As Customer 2, call `POST /transaction/withdraw` targeting the Merchant's account.

**Expected Result:**
- Response is `400` with message `To Account is not agent account`.

### 3g. Customer Pays Merchant — AC-8

### TC-029

**Test Title:** Verify that Customer 1 paying 400 tk to the Merchant charges the correct payment fee
**Type:** Functional — (system)
**Priority:** High
**Any Issue?:** N/A — bug hunt not yet run

**Preconditions:**
- Customer 1 is logged in (TC-021) and holds 995 tk. The Merchant is `active`.

**Test Data:**
- `POST /transaction/payment`, body `{ "from_account": "{customer1Phone}", "to_account": "{merchantPhone}", "amount": 400 }`.

**Steps:**
1. As Customer 1, call `POST /transaction/payment` paying 400 tk to the Merchant.

**Expected Result:**
- `201 Created`, message `Payment successful`.
- `fee` in the response equals `5` (1% of 400 tk, floored at the 5 tk minimum).
- The Merchant is credited the full 400 tk; Customer 1 is debited 405 tk.

### TC-030

**Test Title:** Verify that payment is rejected when the destination is not a Merchant account
**Type:** Negative — (system)
**Priority:** High
**Any Issue?:** N/A — bug hunt not yet run

**Preconditions:**
- Customer 1 is logged in. Customer 2 is `active`.

**Test Data:**
- `POST /transaction/payment`, body `{ "from_account": "{customer1Phone}", "to_account": "{customer2Phone}", "amount": 100 }`.

**Steps:**
1. As Customer 1, call `POST /transaction/payment` targeting Customer 2's account.

**Expected Result:**
- Response is `400` with message `From A/C should be customer or agent and To A/C should be merchant type`.

## 4. Coverage Summary

| Acceptance Criterion | Covered by |
|---|---|
| AC-1 — account creation starts pending, needs admin activation | TC-001–004, TC-007–010 |
| AC-2 — invalid/duplicate creation rejected | TC-005, TC-006 |
| AC-3 — only admin activates; protected accounts immune | TC-007–010, TC-011 |
| AC-4 — SYSTEM funds Agent only, no fee | TC-012, TC-013, TC-014 |
| AC-5 — Agent deposit commission, Customer-only destination | TC-017, TC-018, TC-019 |
| AC-6 — Send Money fee, Customer-to-Customer only | TC-022, TC-023, TC-024 |
| AC-7 — cash-out fee + Agent commission, Agent-only destination | TC-027, TC-028 |
| AC-8 — payment fee, Merchant-only destination | TC-029, TC-030 |
| AC-9 — auth/secret-key enforcement | Enforced implicitly by every request above (a missing/invalid token or secret key on any of these endpoints returns `401`/`403`, per [APiDocumentation.md](./APiDocumentation.md)) |

Nothing material left uncovered within this assignment's 7-step flow.

## 5. Top Test Cases

- Verify that a new Customer account is created by the admin and starts in pending status.
- Verify that a new Agent account is created by the admin and starts in pending status.
- Verify that a new Merchant account is created by the admin and starts in pending status.
- Verify that account creation is rejected when the email is already registered.
- Verify that the admin can activate the newly created Customer account.
- Verify that the protected SYSTEM account cannot be modified through the update endpoint.
- Verify that the SYSTEM account can fund the Agent's wallet with 5,000 tk.
- Verify that SYSTEM cannot deposit directly into a Customer's wallet.
- Verify that the Agent depositing 2,000 tk to the Customer earns the correct deposit commission.
- Verify that an Agent cannot deposit into a non-Customer account.
- Verify that Customer 1 sending 1,000 tk to Customer 2 charges the correct service fee.
- Verify that Send Money is rejected when the receiver is not a Customer account.
- Verify that Send Money is rejected when the sender has insufficient balance.
- Verify that Customer 2 cashing out 500 tk from the Agent charges the correct cash-out fee.
- Verify that cashing out is rejected when the destination is not an Agent account.
- Verify that Customer 1 paying 400 tk to the Merchant charges the correct payment fee.
- Verify that payment is rejected when the destination is not a Merchant account.
