# Merchant Intake

Use `ops/merchant_intake_template.json` after an interview.

Use `ops/prospects.json` before an interview to track the target, qualification score, and next action.

## Scoring

Each score field is 0, 1, or 2.

- `0`: not true or unknown
- `1`: partly true
- `2`: clearly true

Priority:

- 9-12: immediate integration candidate
- 6-8: keep warm and ask for async feedback
- 3-5: nurture
- 0-2: skip

## Required Fields For A Test Integration

- merchant id
- endpoint type
- pricing model
- example price
- preferred integration surface
- sensitive metadata classes
- success metric

## Test Integration Bar

Do not call a merchant integrated until all are true:

- They tested one protected endpoint.
- One allowed receipt was captured.
- One denied receipt was captured.
- The merchant confirmed the denial reason was useful.
- The dispute packet path was agreed and validates.
- The merchant understood this is a prototype, not audited financial infrastructure.

## Pipeline Report

Run:

```bash
npm run growth
```

The report includes `growth.pipeline.topProspects` and `growth.pipeline.nextRecruitingAction`.

## Validate Interview Evidence

Run:

```bash
npm run interview-report
```

Use `ops/interviews_template.json` when recording a completed interview. An interview counts only if it has at least five answers, confirms product-feedback and no-token-pitch boundaries, and links to a merchant intake JSON that validates.

## Validate An Intake

Run:

```bash
npm run validate-merchant -- ops/merchant_intake.example.json
```

The validator returns readiness, score breakdown, an allowed-merchant patch, and test caps. A merchant is test-ready only when the required fields are complete, the derived score is at least 9, and `integration.canTestThisWeek` is true.

## Generate A Pilot Kit

Run:

```bash
npm run pilot-kit -- ops/merchant_intake.example.json
```

The pilot kit returns a gateway config with the generated merchant profile, policy patch, smoke-test curl commands, and acceptance criteria. Use it only after the merchant has approved a low-risk test endpoint.

## Generate A Pilot Packet

Run:

```bash
npm run pilot-packet -- ops/merchant_intake.example.json
```

The packet combines intake readiness, gateway config with merchant profile, local gateway smoke, commands, evidence boundary, and human approval checklist. It is review-only and does not imply merchant approval.
