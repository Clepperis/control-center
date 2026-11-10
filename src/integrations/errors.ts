export type ErrorCode =
  | "configuration"
  | "disabled"
  | "authentication"
  | "rate_limit"
  | "provider"
  | "timeout"
  | "cancelled"
  | "malformed"
  | "agent_unavailable";
export class IntegrationError extends Error {
  constructor(
    public code: ErrorCode,
    public uncertain = false,
  ) {
    super(code);
  }
}
export type Fetcher = typeof fetch;
export async function requestJson(
  fetcher: Fetcher,
  url: string,
  init: RequestInit,
  options: { timeoutMs: number; signal?: AbortSignal; mutation?: boolean },
): Promise<unknown> {
  const timeout = AbortSignal.timeout(options.timeoutMs);
  const signal = options.signal
    ? AbortSignal.any([timeout, options.signal])
    : timeout;
  try {
    const response = await fetcher(url, {
      ...init,
      signal,
      cache: "no-store",
      redirect: "error",
    });
    if (!response.ok) {
      const uncertain =
        !!options.mutation &&
        (response.status >= 500 || response.status === 408);
      await response.body?.cancel();
      throw new IntegrationError(
        response.status === 401 || response.status === 403
          ? "authentication"
          : response.status === 429
            ? "rate_limit"
            : "provider",
        uncertain,
      );
    }
    if (!response.body)
      throw new IntegrationError("malformed", !!options.mutation);
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > 1_000_000) {
          await reader.cancel();
          throw new IntegrationError("malformed", !!options.mutation);
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const buffer = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      buffer.set(chunk, offset);
      offset += chunk.length;
    }
    try {
      return JSON.parse(new TextDecoder().decode(buffer));
    } catch {
      throw new IntegrationError("malformed", !!options.mutation);
    }
  } catch (error) {
    if (error instanceof IntegrationError) throw error;
    if (options.signal?.aborted)
      throw new IntegrationError("cancelled", !!options.mutation);
    if (timeout.aborted)
      throw new IntegrationError("timeout", !!options.mutation);
    throw new IntegrationError("provider", !!options.mutation);
  }
}
