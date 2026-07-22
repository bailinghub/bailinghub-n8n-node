# Privacy

`n8n-nodes-bailinghub` does not collect telemetry and does not send data to the project
maintainers.

For **Submit Governed Job**, the node sends these fields to the BailingHub deployment chosen
by the n8n operator:

- `request_id`;
- `route`;
- `input`.

For **Get Job** and **Wait for Job**, it sends the job ID in the request path. The Client Token
is stored by n8n's credential system and added to the fixed BailingHub requests as an
Authorization header. It is not made available to n8n's generic Custom API Call surface.

The adapter filters BailingHub job responses before returning them to the workflow. Internal
metadata and dispatch configuration are not included. The deploying organization remains
responsible for its n8n retention settings, BailingHub retention settings, business payloads,
and applicable privacy obligations.
