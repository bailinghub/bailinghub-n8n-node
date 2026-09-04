# n8n-nodes-bailinghub

Use `n8n-nodes-bailinghub` to let an n8n workflow query and operate a store, SaaS, CRM,
ERP, or other business system already connected to
[BailingHub](https://github.com/bailinghub/bailinghub).

Depending on the capabilities exposed by the business system and the routes allowed for the
n8n connection, a workflow can, for example:

- react to a stock alert by finding affected products and preparing a restocking action;
- update a customer record after a trusted form or CRM event;
- submit a refund request and continue only after the configured approval step completes.

n8n submits a task to an allowed route and receives only its public status and result. It
does not receive administrator or business-system credentials. BailingHub keeps route
allowlists, approval state, execution records, and audit trails, while the business system
makes the final authorization decision.

BailingHub sits between agents or automation workflows and existing business systems. It
provides a control plane for route allowlists, risk-aware tool governance, human approval
intents, execution records, and auditability. This node is an independent adapter to its
public Client API; it does not embed BailingHub or redefine ACC.

## Installation

Install the community package named `n8n-nodes-bailinghub` from n8n's community node UI,
or install it in a self-hosted n8n deployment according to the
[n8n community node guide](https://docs.n8n.io/integrations/community-nodes/installation/).

The package's verified-node status is tracked through its GitHub releases. The repository
does not claim n8n verification until n8n has completed that review.

## Operations

| Operation | Purpose |
| --- | --- |
| Submit Governed Job | Calls `POST /run` with a request ID, allowed route, and task input. |
| Get Job | Calls `GET /jobs/{job_id}` and returns a deliberately reduced public result. |
| Wait for Job | Polls the same job for at most 60 seconds, then returns the terminal or latest state. |

The node never resubmits a task while waiting. If a wait times out, branch on
`wait_timed_out: true` and continue polling later with the same job ID.

## Credentials

Create a dedicated BailingHub client in the BailingHub console and configure:

- **Base URL**: the deployment root, such as `https://hub.example.com`;
- **Client Token**: the per-client token issued by BailingHub;
- **Allow Insecure HTTP**: keep disabled unless a self-hosted n8n instance reaches
  BailingHub over a trusted private network without TLS.

Do not use the BailingHub administrator token. Route access and rate limits should be
configured on the dedicated client. n8n's credential test verifies that the configured
BailingHub deployment is reachable through its public health endpoint. The Client Token is
validated by BailingHub on the first protected job request; a health check is not presented
as proof that a token is valid.

## Security Boundary

This adapter intentionally exposes only BailingHub's public client surface:

- it does not call administrator trace or approval endpoints;
- it does not expose approve or reject actions;
- it does not accept acting-subject metadata in v1;
- its dedicated credential is restricted to this node and is not exposed through n8n's
  generic Custom API Call surface;
- it filters job responses so internal dispatch configuration, credentials, metadata, and
  administrator-only evidence do not enter n8n workflow output;
- it maps upstream errors to bounded public messages rather than returning arbitrary bodies.

Trusted acting subjects must be established from an authenticated business-system boundary.
They must not be copied from model output. Final business authorization remains in the
business system.

## Typical Workflow

1. A trusted n8n trigger receives a business event.
2. **Submit Governed Job** sends the task to a BailingHub route with a stable request ID.
3. Store the returned `job_id`.
4. Use **Wait for Job** for a short bounded wait, or schedule **Get Job** later.
5. Branch on `status`, `terminal`, and `wait_timed_out`.
6. Consume `result`, `report`, or `raw_result` only after checking the terminal status.

Approval workflow ownership remains outside this node. BailingHub can pause governed tool
execution and emit approval intents through the deployment's configured approval channel.

An importable example is available at
[`examples/submit-and-wait.workflow.json`](examples/submit-and-wait.workflow.json). Replace
the route placeholder with a route allowed for the dedicated BailingHub client, then assign
the same BailingHub credential to both BailingHub nodes.

## First Success and Feedback

Use the [n8n integration path](https://www.bailinghub.com/en/integrations#n8n) as the
canonical start page. The first integration is successful when the example submits through
an allowlisted route, the same `job_id` reaches a terminal state, BailingHub retains its
approval and audit state, and n8n never receives administrator or business-system
credentials.

Report a PASS, partial result, or failure through the
[BailingHub independent validation form](https://github.com/bailinghub/bailinghub/issues/new?template=independent_validation.yml)
and select the n8n track. Never include tokens, model keys, personal information, or
production business data.

## Compatibility

The adapter targets BailingHub's public `POST /run` and `GET /jobs/{job_id}` Client API and
the `bailing.contract.v2.13` compatible contract family. See
[docs/COMPATIBILITY.md](docs/COMPATIBILITY.md) for the tested matrix.

## Project Boundaries

See [docs/PROJECT_BOUNDARIES.md](docs/PROJECT_BOUNDARIES.md). The dependency direction is
strictly one-way:

```text
n8n-nodes-bailinghub -> BailingHub public Client API
BailingHub may consume ACC declarations
ACC has no dependency on either implementation
```

## Privacy

The node has no telemetry. It sends the configured request ID, route, and task input only to
the BailingHub URL chosen by the n8n operator. See [PRIVACY.md](PRIVACY.md).

## Resources

- [BailingHub](https://github.com/bailinghub/bailinghub)
- [BailingHub integration guide](https://github.com/bailinghub/bailinghub/blob/main/docs/INTEGRATION.en.md)
- [n8n community node documentation](https://docs.n8n.io/integrations/creating-nodes/)
- [Agent Capability Contract](https://agentcapability.org/)

## Development

```bash
npm install
npm run verify
npm run dev
```

`npm run verify` runs the n8n linter, builds the package, and executes the contract-focused
tests. Releases are published from GitHub Actions with npm provenance.

## License

MIT
