# Security Policy

Please report vulnerabilities through a private GitHub Security Advisory in this repository.
Do not include production tokens, private deployment URLs, personal data, or raw business
payloads in a public issue.

## Supported Versions

Security fixes are provided for the latest published minor version.

## Adapter Boundary

This package stores credentials through n8n's credential system and sends requests only to
the operator-configured BailingHub URL. It does not make administrator API calls, resolve
business authorization, or independently approve tools. The BailingHub credential is
restricted to this node and deliberately does not enable n8n's generic Custom API Call
surface.
