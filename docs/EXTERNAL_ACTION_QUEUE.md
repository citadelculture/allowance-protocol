# External Action Queue

The external action queue summarizes draft packets and blocked future actions across the launch sequence.

```bash
npm run external-action-queue
```

The queue can include:

- `x_post` packets from `npm run x-post-action-pack`
- `merchant_outreach` packets from `npm run outreach-action-pack`
- `controller_policy_signature` packets from `npm run controller-signing-action-pack`
- `live_pilot` packets from `npm run pilot-traffic-action-pack`
- blocked placeholders for `contract_deployment` and `merchant_promotion` when their evidence is not ready

Queue item statuses:

- `ready_for_approval`: the packet is draft-only and ready for human review
- `needs_packet_fixes`: the packet generator found invalid data
- `blocked`: evidence gates or prior launch stages are missing
- `not_ready`: queue structure is unsafe, such as duplicate approval ids
- `complete`: the launch stage already has the required evidence

This command does not approve, post, send, sign, deploy, start pilot traffic, promote merchants, move funds, or store secrets. A `ready_for_approval` item still needs a final packet file with all approval flags set and a passing `npm run external-action-approval` result before a human performs the action.

To write the ready draft packets into local review files, run:

```bash
npm run external-action-workspace
```

The workspace is a convenience handoff only. Its packet files remain unapproved drafts.
