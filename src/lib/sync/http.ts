export class TimeoutError extends Error {
  constructor(
    public readonly timeoutMs: number,
    label: string,
  ) {
    super(`Timeout de ${label} após ${timeoutMs}ms`);
    this.name = "TimeoutError";
  }
}

/**
 * `fetch` com timeout real. O sinal é abortado no prazo para que uma conexão
 * pendurada não mantenha a trava de sincronização viva indefinidamente.
 */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
  label = "requisição",
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (e) {
    if (controller.signal.aborted) throw new TimeoutError(timeoutMs, label);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
