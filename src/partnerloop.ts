/**
 * partnerloop core: four tools forwarded to the hosted
 * CreationLoop MCP endpoint.
 *
 *   get_company_overview               tools/call get_company_overview
 *   get_design_partner_offer           tools/call get_design_partner_offer
 *   get_faq                            tools/call get_faq
 *   submit_design_partner_application  tools/call submit_design_partner_application
 *
 * Every call is a JSON-RPC 2.0 `tools/call` POST to
 * https://creationloop.ai/api/mcp (override with the
 * CREATIONLOOP_MCP_URL environment variable). The endpoint speaks
 * plain JSON (no SSE) and needs no authentication: no credential is
 * required, read, or sent.
 *
 * The overview, offer, and FAQ text lives upstream as canonical
 * site copy. This module never invents that copy locally: it
 * forwards the call and returns the upstream text verbatim.
 * Upstream failures — an HTTP error such as 429, a JSON-RPC error
 * object, or a tool result flagged as an error — surface as an
 * Error carrying the upstream message.
 *
 * submit_design_partner_application is validated locally before
 * any request, per the public spec: email (required, valid email,
 * 3–320 chars) and website (required, 1–500 chars); optional name
 * and company up to 200 chars each and message up to 2000 chars.
 * The schema is strict: unknown fields are rejected. A validation
 * failure throws an Error naming the problem, and no request is
 * made.
 */
import type { FetchFn, SubmitApplicationOptions } from "./types.js";

export const VERSION = "0.1.0";

export const DEFAULT_ENDPOINT_URL = "https://creationloop.ai/api/mcp";

export const ENDPOINT_URL_ENV = "CREATIONLOOP_MCP_URL";

/** Resolve the endpoint URL: env value when non-blank, else the default. */
export function resolveEndpointUrl(value?: string): string {
  const v = typeof value === "string" ? value.trim() : "";
  return v ? v : DEFAULT_ENDPOINT_URL;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SUBMIT_FIELDS = ["email", "website", "name", "company", "message"] as const;

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new Error(`${field} is required and must be a string`);
  }
  return value;
}

function checkLength(value: string, field: string, min: number, max: number): string {
  if (value.length < min || value.length > max) {
    throw new Error(
      min > 0
        ? `${field} must be between ${min} and ${max} characters`
        : `${field} must be at most ${max} characters`,
    );
  }
  return value;
}

function optionalField(
  input: Record<string, unknown>,
  field: "name" | "company" | "message",
  max: number,
): string | undefined {
  const value = input[field];
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new Error(`${field} must be a string`);
  return checkLength(value, field, 0, max);
}

/**
 * Validate a design-partner application against the public spec.
 * Throws an Error naming the problem; returns the exact argument
 * set to forward (optional fields present only when supplied).
 */
export function validateApplication(input: unknown): SubmitApplicationOptions {
  if (!isRecord(input)) {
    throw new Error("application arguments must be an object");
  }
  for (const key of Object.keys(input)) {
    if (!(SUBMIT_FIELDS as readonly string[]).includes(key)) {
      throw new Error(`unknown field: ${key}`);
    }
  }
  const email = checkLength(requireString(input.email, "email"), "email", 3, 320);
  if (!EMAIL_RE.test(email)) {
    throw new Error("email must be a valid email address");
  }
  const website = checkLength(requireString(input.website, "website"), "website", 1, 500);
  const out: SubmitApplicationOptions = { email, website };
  const name = optionalField(input, "name", 200);
  if (name !== undefined) out.name = name;
  const company = optionalField(input, "company", 200);
  if (company !== undefined) out.company = company;
  const message = optionalField(input, "message", 2000);
  if (message !== undefined) out.message = message;
  return out;
}

/** Extract the text blocks of an MCP tool result, if it has any. */
function resultText(result: unknown): string | undefined {
  if (!isRecord(result) || !Array.isArray(result.content)) return undefined;
  const parts: string[] = [];
  for (const block of result.content) {
    if (isRecord(block) && block.type === "text" && typeof block.text === "string") {
      parts.push(block.text);
    }
  }
  return parts.length ? parts.join("\n") : undefined;
}

function rpcErrorMessage(payload: unknown): string | undefined {
  if (!isRecord(payload) || !isRecord(payload.error)) return undefined;
  return typeof payload.error.message === "string" && payload.error.message
    ? payload.error.message
    : undefined;
}

/**
 * Forward one tools/call to the upstream endpoint and return its
 * text. Throws an Error carrying the upstream message on any
 * HTTP error (including 429), JSON-RPC error, or error result.
 */
export async function callUpstreamTool(
  fetchFn: FetchFn,
  endpointUrl: string | undefined,
  toolName: string,
  args: Record<string, unknown>,
): Promise<string> {
  const url = resolveEndpointUrl(endpointUrl);
  let response;
  try {
    response = await fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: toolName, arguments: args },
      }),
    });
  } catch (err) {
    throw new Error(
      `CreationLoop MCP request failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = undefined;
  }
  const rpcMessage = rpcErrorMessage(payload);
  if (!response.ok) {
    throw new Error(
      rpcMessage ??
        `CreationLoop MCP request failed: HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}`,
    );
  }
  if (rpcMessage) {
    throw new Error(rpcMessage);
  }
  if (!isRecord(payload) || !("result" in payload)) {
    throw new Error("CreationLoop MCP response did not include a result");
  }
  const result = payload.result;
  const text = resultText(result);
  if (isRecord(result) && result.isError === true) {
    throw new Error(text ?? "CreationLoop MCP tool returned an error");
  }
  if (text !== undefined) return text;
  return typeof result === "string" ? result : JSON.stringify(result, null, 2);
}

/** Get CreationLoop's canonical company overview, verbatim from upstream. */
export async function getCompanyOverview(
  fetchFn: FetchFn,
  endpointUrl?: string,
): Promise<string> {
  return callUpstreamTool(fetchFn, endpointUrl, "get_company_overview", {});
}

/** Get the design-partner program description, verbatim from upstream. */
export async function getDesignPartnerOffer(
  fetchFn: FetchFn,
  endpointUrl?: string,
): Promise<string> {
  return callUpstreamTool(fetchFn, endpointUrl, "get_design_partner_offer", {});
}

/** Get frequently asked questions and answers, verbatim from upstream. */
export async function getFaq(fetchFn: FetchFn, endpointUrl?: string): Promise<string> {
  return callUpstreamTool(fetchFn, endpointUrl, "get_faq", {});
}

/** Submit a design-partner application after local validation. */
export async function submitDesignPartnerApplication(
  fetchFn: FetchFn,
  endpointUrl: string | undefined,
  input: unknown,
): Promise<string> {
  const args = validateApplication(input);
  return callUpstreamTool(
    fetchFn,
    endpointUrl,
    "submit_design_partner_application",
    { ...args },
  );
}
