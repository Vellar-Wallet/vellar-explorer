/** Minimal Soroban JSON-RPC client. Just enough for getEvents + getTransaction. */

export interface RpcErrorPayload {
  readonly code: number;
  readonly message: string;
  readonly data?: unknown;
}

export class RpcError extends Error {
  constructor(readonly payload: RpcErrorPayload) {
    super(payload.message);
    this.name = "RpcError";
  }
}

let requestId = 0;

export async function rpcCall<T>(
  rpcUrl: string,
  method: string,
  params?: unknown,
  fetchImpl: typeof fetch = fetch,
): Promise<T> {
  requestId += 1;
  const response = await fetchImpl(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: requestId,
      method,
      ...(params !== undefined ? { params } : {}),
    }),
  });
  if (!response.ok) {
    throw new Error(`RPC ${method} returned HTTP ${response.status}`);
  }
  const body = (await response.json()) as { result?: T; error?: RpcErrorPayload };
  if (body.error) throw new RpcError(body.error);
  if (body.result === undefined) throw new Error(`RPC ${method} returned no result`);
  return body.result;
}

export interface GetEventsResult {
  readonly events: readonly unknown[];
  readonly latestLedger: number;
  readonly cursor?: string;
}

export async function getEvents(
  rpcUrl: string,
  params: Record<string, unknown>,
  fetchImpl?: typeof fetch,
): Promise<GetEventsResult> {
  const raw = await rpcCall<{ events?: unknown[]; latestLedger?: number; cursor?: string }>(
    rpcUrl,
    "getEvents",
    params,
    fetchImpl,
  );
  return {
    events: Array.isArray(raw.events) ? raw.events : [],
    latestLedger: typeof raw.latestLedger === "number" ? raw.latestLedger : 0,
    ...(typeof raw.cursor === "string" ? { cursor: raw.cursor } : {}),
  };
}

export async function getTransaction(
  rpcUrl: string,
  hash: string,
  fetchImpl?: typeof fetch,
): Promise<unknown> {
  return rpcCall(rpcUrl, "getTransaction", { hash, xdrFormat: "json" }, fetchImpl);
}

export async function getHealth(
  rpcUrl: string,
  fetchImpl?: typeof fetch,
): Promise<{ latestLedger: number; oldestLedger: number }> {
  return rpcCall(rpcUrl, "getHealth", undefined, fetchImpl);
}
