/**
 * partnerloop MCP server. Tools: get_company_overview,
 * get_design_partner_offer, get_faq,
 * submit_design_partner_application.
 *
 * Why the low-level Server instead of McpServer: the high-level
 * helper converts zod schemas to JSON Schema and injects keys that
 * are not in this tool's public spec, which breaks exact
 * tool-list/schema parity with the spec. This file serves
 * tools/list with the spec's exact input schemas as explicit
 * literals, while zod still validates every tools/call argument
 * set (strictly: unknown fields are rejected for the submit tool).
 *
 * No auth. The upstream endpoint is read from CREATIONLOOP_MCP_URL
 * at call time and defaults to https://creationloop.ai/api/mcp.
 * Every call is forwarded upstream; no company copy is held here.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  ENDPOINT_URL_ENV,
  getCompanyOverview,
  getDesignPartnerOffer,
  getFaq,
  resolveEndpointUrl,
  submitDesignPartnerApplication,
  VERSION,
} from "./partnerloop.js";
import type { FetchFn } from "./types.js";

const NoArgs = z.object({}).strict();
const SubmitArgs = z
  .object({
    email: z.string().min(3).max(320).email(),
    website: z.string().min(1).max(500),
    name: z.string().max(200).optional(),
    company: z.string().max(200).optional(),
    message: z.string().max(2000).optional(),
  })
  .strict();

const TOOLS = [
  {
    name: "get_company_overview",
    description:
      "Returns CreationLoop's canonical company information: what CreationLoop is, how the content loop works, the two run modes, proof, philosophy, and the pricing stance.",
    inputSchema: {
      type: "object" as const,
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "get_design_partner_offer",
    description:
      "Returns the design-partner program description: what partners get, what CreationLoop asks in return, and how to apply.",
    inputSchema: {
      type: "object" as const,
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "get_faq",
    description:
      "Returns frequently asked questions and answers from CreationLoop's canonical site copy.",
    inputSchema: {
      type: "object" as const,
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "submit_design_partner_application",
    description:
      "Submits an application to CreationLoop's design-partner program; the founder reviews every application and follows up by email.",
    inputSchema: {
      type: "object" as const,
      properties: {
        email: {
          type: "string",
          description: "Applicant email address (required).",
          minLength: 3,
          maxLength: 320,
        },
        website: {
          type: "string",
          description: "The brand's website URL (required).",
          minLength: 1,
          maxLength: 500,
        },
        name: {
          type: "string",
          description: "Applicant name (optional).",
          maxLength: 200,
        },
        company: {
          type: "string",
          description: "Company name (optional).",
          maxLength: 200,
        },
        message: {
          type: "string",
          description:
            "What should your CMO know? Context for the email follow-up (optional).",
          maxLength: 2000,
        },
      },
      required: ["email", "website"],
      additionalProperties: false,
    },
  },
];

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function errorResult(err: unknown) {
  return {
    content: [
      { type: "text" as const, text: err instanceof Error ? err.message : String(err) },
    ],
    isError: true,
  };
}

const server = new Server(
  { name: "partnerloop", version: VERSION },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const fetchFn = globalThis.fetch as unknown as FetchFn;
  const endpointUrl = resolveEndpointUrl(process.env[ENDPOINT_URL_ENV]);
  try {
    let out: string;
    if (name === "get_company_overview") {
      NoArgs.parse(args ?? {});
      out = await getCompanyOverview(fetchFn, endpointUrl);
    } else if (name === "get_design_partner_offer") {
      NoArgs.parse(args ?? {});
      out = await getDesignPartnerOffer(fetchFn, endpointUrl);
    } else if (name === "get_faq") {
      NoArgs.parse(args ?? {});
      out = await getFaq(fetchFn, endpointUrl);
    } else if (name === "submit_design_partner_application") {
      // Zod (strict) validates first; the core re-validates so the
      // error names the specific problem per the public spec.
      SubmitArgs.parse(args ?? {});
      out = await submitDesignPartnerApplication(fetchFn, endpointUrl, args ?? {});
    } else {
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
    return textResult(out);
  } catch (err) {
    if (err instanceof McpError) throw err;
    return errorResult(err);
  }
});

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
}

void main();
