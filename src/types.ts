/**
 * partnerloop types.
 *
 * The public surface is four tools against a hosted MCP endpoint:
 * three parameterless reads and one design-partner application
 * write. HTTP access is described by a minimal response surface so
 * tests can inject a fake fetch and never touch the network.
 */

export interface SubmitApplicationOptions {
  email: string;
  website: string;
  name?: string;
  company?: string;
  message?: string;
}

/** Minimal HTTP response surface so tests can inject fixtures. */
export interface HttpResponse {
  ok: boolean;
  status: number;
  statusText?: string;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
  json(): Promise<unknown>;
}

export type FetchFn = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    redirect?: string;
  },
) => Promise<HttpResponse>;
