#!/usr/bin/env node
/**
 * partnerloop CLI.
 *
 *   partnerloop overview
 *   partnerloop offer
 *   partnerloop faq
 *   partnerloop apply --email <email> --website <url>
 *                     [--name <name>] [--company <company>]
 *                     [--message <text>]
 *   partnerloop mcp
 *
 * No auth. Endpoint from CREATIONLOOP_MCP_URL, default
 * https://creationloop.ai/api/mcp.
 * Exit codes: 0 success, 1 upstream/validation error, 2 usage error.
 */
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

function usage(): never {
  console.error(`Usage:
  partnerloop overview
  partnerloop offer
  partnerloop faq
  partnerloop apply --email <email> --website <url> [--name <name>] [--company <company>] [--message <text>]
  partnerloop mcp
  partnerloop --version`);
  process.exit(2);
}

function flag(rest: string[], name: string): string | undefined {
  const i = rest.indexOf(name);
  return i >= 0 ? rest[i + 1] : undefined;
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === "--version" || cmd === "-v") {
    console.log(VERSION);
    return;
  }
  if (cmd === "mcp") {
    await import("./mcp.js");
    return;
  }
  if (!cmd) usage();
  const fetchFn = globalThis.fetch as unknown as FetchFn;
  const endpointUrl = resolveEndpointUrl(process.env[ENDPOINT_URL_ENV]);
  const known = ["overview", "offer", "faq", "apply"];
  if (!known.includes(cmd)) usage();
  try {
    let out: string;
    if (cmd === "overview") {
      out = await getCompanyOverview(fetchFn, endpointUrl);
    } else if (cmd === "offer") {
      out = await getDesignPartnerOffer(fetchFn, endpointUrl);
    } else if (cmd === "faq") {
      out = await getFaq(fetchFn, endpointUrl);
    } else {
      const input: Record<string, unknown> = {};
      const email = flag(rest, "--email");
      const website = flag(rest, "--website");
      const name = flag(rest, "--name");
      const company = flag(rest, "--company");
      const message = flag(rest, "--message");
      if (email !== undefined) input.email = email;
      if (website !== undefined) input.website = website;
      if (name !== undefined) input.name = name;
      if (company !== undefined) input.company = company;
      if (message !== undefined) input.message = message;
      out = await submitDesignPartnerApplication(fetchFn, endpointUrl, input);
    }
    console.log(out);
  } catch (err) {
    console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

void main();
