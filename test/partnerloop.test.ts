import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_ENDPOINT_URL,
  getCompanyOverview,
  getDesignPartnerOffer,
  getFaq,
  resolveEndpointUrl,
  submitDesignPartnerApplication,
  validateApplication,
} from "../src/partnerloop.js";
import type { FetchFn, HttpResponse } from "../src/types.js";

function jsonResponse(body: unknown, status = 200, statusText = "OK"): HttpResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    headers: { get: () => "application/json" },
    text: async () => JSON.stringify(body),
    json: async () => body,
  };
}

function rpcResult(text: string, isError = false): unknown {
  return {
    jsonrpc: "2.0",
    id: 1,
    result: { content: [{ type: "text", text }], ...(isError ? { isError: true } : {}) },
  };
}

interface Captured {
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

function fakeFetch(captured: Captured, body: unknown, status = 200, statusText = "OK"): FetchFn {
  return async (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => {
    captured.url = url;
    captured.method = init?.method;
    captured.headers = init?.headers;
    captured.body = init?.body;
    return jsonResponse(body, status, statusText);
  };
}

function parsedBody(c: Captured): { method?: string; params?: { name?: string; arguments?: unknown } } {
  return JSON.parse(c.body ?? "{}") as { method?: string; params?: { name?: string; arguments?: unknown } };
}

describe("endpoint resolution", () => {
  it("defaults to the hosted endpoint and honours an override", () => {
    assert.equal(resolveEndpointUrl(undefined), DEFAULT_ENDPOINT_URL);
    assert.equal(resolveEndpointUrl("  "), DEFAULT_ENDPOINT_URL);
    assert.equal(DEFAULT_ENDPOINT_URL, "https://creationloop.ai/api/mcp");
    assert.equal(resolveEndpointUrl(" https://example.test/mcp "), "https://example.test/mcp");
  });
});

describe("JSON-RPC shaping", () => {
  it("a parameterless tool posts a tools/call with empty arguments and returns upstream text verbatim", async () => {
    const c: Captured = {};
    const out = await getCompanyOverview(fakeFetch(c, rpcResult("UPSTREAM OVERVIEW COPY")), undefined);
    assert.equal(out, "UPSTREAM OVERVIEW COPY");
    assert.equal(c.url, DEFAULT_ENDPOINT_URL);
    assert.equal(c.method, "POST");
    assert.equal(c.headers?.["Content-Type"], "application/json");
    const body = parsedBody(c);
    assert.equal(body.method, "tools/call");
    assert.equal(body.params?.name, "get_company_overview");
    assert.deepEqual(body.params?.arguments, {});
  });

  it("offer and faq forward under their own tool names", async () => {
    const c1: Captured = {};
    assert.equal(await getDesignPartnerOffer(fakeFetch(c1, rpcResult("OFFER")), undefined), "OFFER");
    assert.equal(parsedBody(c1).params?.name, "get_design_partner_offer");
    const c2: Captured = {};
    assert.equal(await getFaq(fakeFetch(c2, rpcResult("FAQ")), undefined), "FAQ");
    assert.equal(parsedBody(c2).params?.name, "get_faq");
  });

  it("submit forwards the validated fields as the tool arguments", async () => {
    const c: Captured = {};
    const out = await submitDesignPartnerApplication(
      fakeFetch(c, rpcResult("Application received for example.com.")),
      undefined,
      { email: "founder@example.com", website: "https://example.com", name: "Ada", message: "Hello" },
    );
    assert.equal(out, "Application received for example.com.");
    const body = parsedBody(c);
    assert.equal(body.params?.name, "submit_design_partner_application");
    assert.deepEqual(body.params?.arguments, {
      email: "founder@example.com",
      website: "https://example.com",
      name: "Ada",
      message: "Hello",
    });
  });

  it("submit omits optional fields that were not supplied", async () => {
    const c: Captured = {};
    await submitDesignPartnerApplication(fakeFetch(c, rpcResult("ok")), undefined, {
      email: "a@b.co",
      website: "https://b.co",
    });
    assert.deepEqual(parsedBody(c).params?.arguments, { email: "a@b.co", website: "https://b.co" });
  });
});

describe("local validation", () => {
  it("rejects a bad email before any request", async () => {
    let called = false;
    const spy: FetchFn = async () => { called = true; return jsonResponse(rpcResult("ok")); };
    await assert.rejects(
      () => submitDesignPartnerApplication(spy, undefined, { email: "not-an-email", website: "https://x.co" }),
      /email must be a valid email address/,
    );
    assert.equal(called, false);
  });

  it("rejects missing required fields, naming the field", () => {
    assert.throws(() => validateApplication({ website: "https://x.co" }), /email is required/);
    assert.throws(() => validateApplication({ email: "a@b.co" }), /website is required/);
  });

  it("rejects over-length fields, naming each field", () => {
    const base = { email: "a@b.co", website: "https://x.co" };
    assert.throws(
      () => validateApplication({ ...base, email: `${"a".repeat(310)}@example.com` }),
      /email must be between 3 and 320/,
    );
    assert.throws(
      () => validateApplication({ ...base, website: `https://${"x".repeat(500)}.co` }),
      /website must be between 1 and 500/,
    );
    assert.throws(() => validateApplication({ ...base, name: "n".repeat(201) }), /name must be at most 200/);
    assert.throws(() => validateApplication({ ...base, company: "c".repeat(201) }), /company must be at most 200/);
    assert.throws(() => validateApplication({ ...base, message: "m".repeat(2001) }), /message must be at most 2000/);
  });

  it("rejects an empty website and a too-short email", () => {
    assert.throws(
      () => validateApplication({ email: "a@b.co", website: "" }),
      /website must be between 1 and 500/,
    );
    assert.throws(
      () => validateApplication({ email: "a@", website: "https://x.co" }),
      /email/,
    );
  });

  it("rejects unknown fields (strict schema)", () => {
    assert.throws(
      () => validateApplication({ email: "a@b.co", website: "https://x.co", phone: "555" }),
      /unknown field: phone/,
    );
  });

  it("accepts boundary-length fields", () => {
    const out = validateApplication({
      email: "a@b.co",
      website: "x",
      name: "n".repeat(200),
      message: "m".repeat(2000),
    });
    assert.equal(out.name?.length, 200);
    assert.equal(out.message?.length, 2000);
  });
});

describe("upstream error mapping", () => {
  it("HTTP 429 surfaces the upstream JSON-RPC error message", async () => {
    const failing = fakeFetch(
      {},
      { jsonrpc: "2.0", id: 1, error: { code: -32000, message: "Too many requests. Try again shortly." } },
      429,
      "Too Many Requests",
    );
    await assert.rejects(() => getFaq(failing, undefined), /Too many requests\. Try again shortly\./);
  });

  it("HTTP 429 without a JSON body still reports the status", async () => {
    const failing: FetchFn = async () => ({
      ok: false,
      status: 429,
      statusText: "Too Many Requests",
      headers: { get: () => null },
      text: async () => "",
      json: async () => { throw new Error("not json"); },
    });
    await assert.rejects(() => getFaq(failing, undefined), /HTTP 429/);
  });

  it("a JSON-RPC error on HTTP 200 surfaces its message", async () => {
    const failing = fakeFetch({}, { jsonrpc: "2.0", id: 1, error: { code: -32000, message: "Method not allowed." } });
    await assert.rejects(() => getCompanyOverview(failing, undefined), /Method not allowed\./);
  });

  it("a tool result flagged isError surfaces its text (submit rate limit)", async () => {
    const failing = fakeFetch({}, rpcResult("Too many requests. Try again shortly.", true));
    await assert.rejects(
      () =>
        submitDesignPartnerApplication(failing, undefined, {
          email: "a@b.co",
          website: "https://x.co",
        }),
      /Too many requests\. Try again shortly\./,
    );
  });

  it("a network failure is wrapped with context", async () => {
    const failing: FetchFn = async () => { throw new Error("socket hang up"); };
    await assert.rejects(() => getFaq(failing, undefined), /CreationLoop MCP request failed: socket hang up/);
  });
});
