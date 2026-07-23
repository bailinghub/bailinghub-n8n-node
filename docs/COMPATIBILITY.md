# Compatibility

| Adapter version | BailingHub contract | n8n | Status |
| --- | --- | --- | --- |
| 0.1.x | `bailing.client-api.v1` | Creator Portal manual review | Submitted |

## Required BailingHub Surface

- `POST /run` returns a JSON object containing `job_id`, `request_id`, and a known status;
- `GET /jobs/{job_id}` returns the same job identity and a known status;
- client tokens are sent as `Authorization: Bearer <token>`;
- clients can access only their allowlisted routes and their own jobs.

Unknown additive fields are ignored. Existing fields are filtered into a stable n8n output.
The adapter fails closed on unknown status values, malformed job IDs, invalid result shapes,
oversized responses, and non-object JSON.

The machine-readable adapter claim lives at `compatibility/client-api.json`. CI checks it
against the current BailingHub core contract with `scripts/check-client-api-contract.mjs`;
core CI also checks this adapter before accepting a Client API change. The gate verifies
endpoint method, path, authentication shape, request limits, consumed fields, statuses, and
classified HTTP failures rather than relying on a version label alone.
