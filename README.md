## Postman Task - DMoney API Testing

This repository contains the Postman collection, test design, API documentation, and Newman report artifacts for the DMoney assignment flow.

## Deliverable Links

- Test cases (30 total, positive and negative): [Testcase.md](./Testcase.md)
- API documentation: [API_Doc.md](./API_Doc.md)
- Newman HTML report: [collection/Reports/report.html](./collection/Reports/report.html)

## Scope Covered

- Admin creates 2 Customers, 1 Agent, and 1 Merchant.
- Admin activates all newly created users.
- SYSTEM funds Agent.
- Agent deposits to Customer 1 (commission asserted).
- Customer 1 sends money to Customer 2 (fee asserted).
- Customer 2 cashes out via Agent (fee asserted).
- Customer 1 pays Merchant (fee asserted).

## Run The Collection

Prerequisites:

- Node.js installed
- DMoney API running at `http://localhost:5000`

Install dependencies:

```bash
npm install
```

Run Newman CLI:

```bash
npm test
```

Generate HTML report:

```bash
npm run report
```

## Newman Report Screenshot

![Newman Summary Cards](./collection/Reports/newman-summary-cards.png)

