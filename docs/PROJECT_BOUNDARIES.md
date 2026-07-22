# Project Boundaries

## Ownership

`bailinghub-n8n-node` is an independent ecosystem adapter with its own repository, version,
tests, issues, package, and release process.

## What Belongs Here

- n8n node and credential definitions;
- the minimal TypeScript client for BailingHub's public Client API;
- n8n-specific workflow behavior, packaging, compatibility tests, and discovery copy;
- adapter-specific security and privacy documentation.

## What Does Not Belong Here

| Concern | Owning project or layer |
| --- | --- |
| ACC normative fields and conformance | ACC repository |
| BailingHub routes, runtime behavior, approvals, and trace storage | BailingHub repository |
| Business authorization and trusted subject resolution | Business system |
| n8n runtime behavior and node SDK | n8n |
| Private workflows, URLs, tokens, and run evidence | Deploying organization |

## Dependency Direction

```text
bailinghub-n8n-node -> BailingHub public Client API
BailingHub may consume ACC declarations
ACC has no dependency on either implementation
```

The BailingHub server may link to this adapter as an optional integration. It must not import
this package or synchronize its release number with the adapter.

## Public API Rule

The adapter consumes only:

- `POST /run`;
- `GET /jobs/{job_id}`.

Administrator APIs are intentionally out of scope. A missing public capability is proposed
to BailingHub first and adopted here only after it becomes a stable client-scoped contract.
The adapter must not bypass that process by using an administrator token.

## Subject Rule

The v1 node deliberately omits arbitrary metadata and acting-subject parameters. n8n input
may originate from a model, so accepting a claimed subject without a separate trusted binding
would blur the difference between task data and authenticated identity.

A future subject feature requires an explicit client-scoped binding design that cannot be
overridden by model-generated fields.

## Versioning Rule

- adapter versions describe this package only;
- BailingHub versions describe the control plane only;
- ACC versions describe the portable contract only;
- compatibility is recorded explicitly rather than implied by matching version numbers.
