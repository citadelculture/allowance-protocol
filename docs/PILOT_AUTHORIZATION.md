# Pilot Authorization

Pilot authorization is the merchant-approved scope between a completed interview and live pilot preflight.

It records what the merchant actually approves for a first protected endpoint test: endpoint, path prefix, payment rail, network, per-request amount, request count, total spend ceiling, expiry, receipt log path, dispute contact, and safety approvals.

## Command

```bash
npm run pilot-authorization -- ops/pilot_authorization_template.json ops/merchant_intake.example.json ops/interviews.json
```

The template exits nonzero until real merchant approval, completed interview evidence, and validated intake evidence are attached.

## Required Boundary

The packet must keep these distinct:

- merchant authorization to run a limited pilot
- wallet/policy binding for the approved agent
- live pilot preflight before traffic
- receipt evidence after traffic
- public disclosure after merchant-approved receipts
- live directory promotion after signed profile and disclosure

Passing pilot authorization does not start traffic, move funds, sign wallet payloads, count as pilot evidence, approve public claims, mark a merchant live, or unlock token work.

## Approval Ref

A passing report emits:

```text
pilot-authorization:<authorizationId>
```

Use that `approvalRef` in the pilot binding and merchant approval sections of the live gateway config.

To build the gateway config draft from the authorization, attach real x402 payment requirements and run:

```bash
npm run pilot-gateway-config -- <authorization.json> <merchant-intake.json> ops/interviews.json <payment-requirements.json>
```

The gateway config builder still does not start traffic or count as pilot evidence.
