# Changelog

## 0.1.0 (2026-10-26)

- Initial release.
- CLI: `partnerloop overview|offer|faq|apply` and `partnerloop mcp`.
- MCP server (`partnerloop mcp`, stdio) with four tools:
  `get_company_overview`, `get_design_partner_offer`, `get_faq`,
  and `submit_design_partner_application`.
- Every call is forwarded as a JSON-RPC `tools/call` POST to the
  hosted endpoint from `CREATIONLOOP_MCP_URL`, defaulting to
  `https://creationloop.ai/api/mcp`; the service needs no auth.
- Overview, offer, and FAQ text is returned verbatim from upstream;
  no company copy is stored or invented locally.
- Applications are validated locally (required email/website with
  the documented length limits, optional field limits, unknown
  fields rejected) before any request is sent.
- Upstream failures, including HTTP 429 and JSON-RPC errors,
  surface as errors carrying the upstream message.
- All HTTP goes through an injectable fetch function, so the test
  suite runs entirely on hand-written fixtures with no network access.
