# Compatibility

| Adapter version | BailingHub contract | n8n | Status |
| --- | --- | --- | --- |
| 0.1.x | `bailing.contract.v2.13` compatible Client API | To be fixed by release E2E evidence | Development |

## Required BailingHub Surface

- `POST /run` returns a JSON object containing `job_id`, `request_id`, and a known status;
- `GET /jobs/{job_id}` returns the same job identity and a known status;
- client tokens are sent as `Authorization: Bearer <token>`;
- clients can access only their allowlisted routes and their own jobs.

Unknown additive fields are ignored. Existing fields are filtered into a stable n8n output.
The adapter fails closed on unknown status values, malformed job IDs, invalid result shapes,
oversized responses, and non-object JSON.

The exact n8n version used for the clean-install E2E test is recorded here before the first
npm release.
