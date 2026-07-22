# Contributing

Issues and pull requests are welcome.

Before submitting a change:

```bash
npm install
npm run verify
npm pack --dry-run
```

Keep protocol changes in the project that owns them:

- n8n UX, packaging, and adapter behavior belong here;
- BailingHub Client API behavior belongs in BailingHub;
- portable governance semantics belong in ACC.

Do not commit credentials, private workflow exports, deployment URLs, or production evidence.
