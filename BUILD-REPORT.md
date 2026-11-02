# partnerloop — Build Report

MCP Rebuild 1000 (Batch 8). Clean-room rebuild of
marino129/creationloop-mcp (rank 370, Tier C), built from the
public README spec captured in
`specs-batch8/creationloop.md` and
`harness/fixtures/creationloop-mcp-tools-original.json`. That
fixture is docs-derived: the 4 tools are the full documented
public set — no original server was probed. The private
operator-only tool `review_gtm_sweep` described separately in the
README is **excluded**: it is not part of the public surface, was
not built, and is noted as excluded in the fixture `_source`.
Parity proves the rebuild matches this program's defined spec,
labelled docs-derived. Local build only — nothing pushed or
published.

Identity: repo `partnerloop`, npm `@reneturcios/partnerloop`,
MCP name `io.github.CloudCorpRecords/partnerloop`, version
`0.1.0`, bin `partnerloop` → `dist/cli.js`.

## Files created (19/19 per TEMPLATE.md checklist)

- `package.json` — bin `partnerloop: dist/cli.js`, `mcpName` set,
  scripts build=`tsc` / dev=`tsx src/cli.ts` / test=`tsx --test test/*.test.ts`
- `server.json` — description "CreationLoop design partners:
  company overview, partner offer, FAQ, and apply." = **78 chars**
  (≤100 ✓); npm entry carries `version: 0.1.0`; OCI entry
  `ghcr.io/cloudcorprecords/partnerloop:0.1.0` carries **no**
  `version` field (verified programmatically)
- `Dockerfile` — node:20-alpine two-stage, ENTRYPOINT
  `node /app/dist/cli.js`, CMD `mcp`, label
  `io.modelcontextprotocol.server.name="io.github.CloudCorpRecords/partnerloop"`
- `tsconfig.json` (identical to the fleet template), `.gitignore`,
  `LICENSE` (MIT, Copyright (c) 2026 Rene Turcios), `README.md`
  (fresh text), `CHANGELOG.md` (single 0.1.0 entry, 2026-10-26)
- `src/index.ts`, `src/cli.ts` (`overview`, `offer`, `faq`,
  `apply`, `mcp`, `--version`; exit 2 usage / 1 error),
  `src/mcp.ts`, `src/types.ts`, `src/partnerloop.ts` (core logic,
  `VERSION = "0.1.0"`)
- `test/partnerloop.test.ts`
- `.github/workflows/{ci,publish,publish-container,registry-publish}.yml`
  (from the fleet template; image name and smoke-test server name
  changed to partnerloop)

## Tools implemented (4)

`get_company_overview`, `get_design_partner_offer`, `get_faq`,
`submit_design_partner_application` — the full documented public
set, as recorded in the fixture `_source`. The private
operator-only `review_gtm_sweep` is excluded, per spec.

## Implementation notes

- `src/mcp.ts` uses the SDK's low-level `Server`
  (`sdk/server/index.js` + `StdioServerTransport`) with explicit
  inputSchema literals matching the fixture exactly, per the
  standing fleet rule: the high-level helper's zod-to-JSON-Schema
  conversion injects keys absent from the defined spec and breaks
  exact schema parity. Zod still validates every `tools/call`,
  strictly (`.strict()`), so unknown fields are rejected for the
  submit tool. The three read tools serve
  `{type: "object", properties: {}, additionalProperties: false}`;
  the submit schema carries the spec's verbatim field
  descriptions and length limits, with `email` + `website`
  required.
- Every call is forwarded as a JSON-RPC 2.0 `tools/call` POST to
  `https://creationloop.ai/api/mcp` (env `CREATIONLOOP_MCP_URL`
  override), plain JSON responses, no auth — no credential is
  required, read, or sent.
- **No company copy is held locally.** The overview, offer, and
  FAQ text lives upstream as canonical site copy; the core returns
  the upstream text blocks verbatim and never fabricates copy.
- Local validation for submit runs before any request, in the
  core (so CLI and MCP share it): email required, valid email
  shape, 3–320 chars; website required, 1–500 chars; optional
  name/company ≤200 chars each, message ≤2000 chars; unknown
  fields rejected. A failure returns an error result naming the
  problem (e.g. `email must be a valid email address`,
  `unknown field: phone`).
- Upstream failures are honest errors carrying the upstream
  message: HTTP errors (including 429, using the JSON-RPC error
  message when the body carries one, else the HTTP status), a
  JSON-RPC error object on HTTP 200, and a tool result flagged
  `isError` (the submit rate-limit path, "Too many requests. Try
  again shortly."). Server-side normalisation (email lowercasing,
  `design-partner-mcp:{host}` source, idempotency) stays upstream,
  as the spec describes it.
- All HTTP flows through an injectable `FetchFn` (types.ts). The
  test suite uses a fake fetch only; no live call is made in tests.

## Verification (foreground, exact outputs)

### 1. Build
```
$ ./node_modules/.bin/tsc --noEmit ; echo exit=$?
exit=0
$ npm run build
build exit=0
```
`dist/` produced, including `dist/cli.js`.

### 2. Tests
```
$ npm test   (tsx --test test/*.test.ts)
ℹ tests 16
ℹ pass 16
ℹ fail 0
```
Covers: endpoint default/override; JSON-RPC shaping for a
parameterless tool (POST, `tools/call`, empty arguments, upstream
text returned verbatim) and for submit (validated fields forwarded
as arguments, unsupplied optionals omitted); offer/faq tool names;
local validation — bad email rejected before any request, missing
required fields named, over-length email/website/name/company/
message each named, empty website and too-short email, unknown
field rejection, boundary lengths accepted; upstream mapping —
HTTP 429 with a JSON-RPC message, HTTP 429 without a JSON body,
JSON-RPC error on HTTP 200, `isError` result text, network failure
wrapping.

### 3. CLI / MCP smoke
`--version` → `0.1.0` (exit 0); unknown command exits 2 with
Usage. MCP `initialize` over stdio → `serverInfo:
{"name":"partnerloop","version":"0.1.0"}`. No live CreationLoop
call was made in smoke or tests — every upstream interaction is
fake-fetch tested, and no live result is claimed.

### 4. Parity (harness, from ~/workspace/mcp-rebuild-100/harness/)
```
$ python3 parity.py --original fixtures/creationloop-mcp-tools-original.json \
    --rebuild "stdio:node .../builds/partnerloop/dist/cli.js mcp" \
    --out .../builds/partnerloop/parity-out
verdict=PASS parity_pct=100.0 original_tools=4 rebuild_tools=4 missing=[] extra=[] schema_diffs=[]
(exit 0)
```
(parity.json: identical_tools 4/4.) Original side is tools-file
mode, so `fixture_results` records `SKIPPED-TOOLS-FILE-MODE` —
expected harness semantics, not an error.

## Lockfile status

`package-lock.json` was generated clean via Route 3: a temp copy
holding only `package.json` (no `node_modules`, no `dist`),
offline `npm install --package-lock-only --ignore-scripts
--offline`, verified after generation — parses as JSON, top-level
`name` is `@reneturcios/partnerloop`, version `0.1.0`,
`lockfileVersion` 3, **128 package entries** — then only the
lockfile was placed in the build dir (59,595 bytes, re-parsed
after placement). Local `node_modules` is a sibling copy
(fxrates) used only for the local build/test; it is not part of
the lockfile generation.

## Gaps / honest notes

- Docs-derived spec: the tool schemas follow the README's
  verbatim tool reference as captured in the batch-8 spec — no
  original creationloop server was probed, so parity proves the
  rebuild matches this program's defined spec, not a hand-probed
  original. Whether the upstream server's own JSON Schema carries
  the `minLength`/`maxLength` keywords exactly as the spec's field
  table states is unverified against a live `tools/list`.
- No live call was made: every endpoint behaviour (including the
  exact upstream error wording beyond the two messages the README
  documents) is fake-fetch tested only, so live response drift
  against creationloop.ai is unverified until the publish wave.
- The private operator-only `review_gtm_sweep` tool is excluded
  by design (spec-governed); it is not a missing-tool gap.
- Container build not exercised locally; the publish-container
  workflow smoke-tests the image at publish time.
