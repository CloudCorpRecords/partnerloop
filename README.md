# partnerloop

partnerloop connects to CreationLoop's hosted MCP endpoint and
exposes its public design-partner surface: the canonical company
overview, the design-partner program offer, the FAQ, and a way to
submit a design-partner application. One binary serves a
command-line interface and a stdio MCP server; both simply forward
each call upstream, so the text you get back is CreationLoop's own
canonical copy, never a local paraphrase.

No API key or account is needed. The endpoint can be overridden
with `CREATIONLOOP_MCP_URL`; when it is not set, calls go to
`https://creationloop.ai/api/mcp`.

## Install

```bash
npx @reneturcios/partnerloop overview
```

Or run the container image:

```bash
docker run -i ghcr.io/cloudcorprecords/partnerloop
```

The container defaults to the MCP server (see below). Pass CLI
arguments to use it as a CLI instead.

## CLI

```bash
partnerloop overview
partnerloop offer
partnerloop faq
partnerloop apply --email founder@example.com --website https://example.com \
  --name Ada --company Example --message "Scaling content."

partnerloop --version
```

The three read commands print the upstream text exactly as the
hosted server returns it. `apply` prints the upstream confirmation.
Exit codes: `0` on success, `1` when a call fails (a validation
problem, an upstream error, or a rate limit), `2` for usage errors.

Applications are checked locally before anything is sent: `email`
(a valid address, 3–320 characters) and `website` (1–500
characters) are required; `name` and `company` may be up to 200
characters each and `message` up to 2000. Unknown fields are
rejected. A failed check exits `1` with the problem named, and no
request is made.

## MCP server

One bin serves both faces. The `mcp` subcommand starts a stdio MCP
server:

```bash
npx -y @reneturcios/partnerloop mcp
```

MCP client configuration:

```json
{
  "mcpServers": {
    "partnerloop": {
      "command": "npx",
      "args": ["-y", "@reneturcios/partnerloop", "mcp"]
    }
  }
}
```

To point the server at a different CreationLoop-compatible host,
add `CREATIONLOOP_MCP_URL` to the client's `env` for this server.

### Tools

| Tool | Input | What it returns |
| --- | --- | --- |
| `get_company_overview` | (none) | CreationLoop's canonical company information, verbatim from upstream. |
| `get_design_partner_offer` | (none) | The design-partner program description, verbatim from upstream. |
| `get_faq` | (none) | Frequently asked questions and answers, verbatim from upstream. |
| `submit_design_partner_application` | `email`, `website` (required); `name`, `company`, `message` (optional) | The upstream confirmation that the application was received. |

Upstream errors — including the endpoint's rate limits (30
requests/minute overall, 5 submissions/minute for applications) —
come back as error results carrying the upstream message.

## Development

```bash
npm install
npm run build   # tsc -> dist/
npm test        # node test runner over test/*.test.ts, no network (fake fetch fixtures)
npm run dev     # run the CLI from source via tsx
```

## License

MIT — see `LICENSE`.
