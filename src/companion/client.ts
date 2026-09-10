import { IruddMcpClient } from "../client/mcp-client.js";
import type { SyncCursor } from "../contract/sync.js";
import type { PlanningPage } from "../domain/conversation-sync.js";
import { companionHeaders, type CompanionConfig } from "./config.js";
import type { QueueDelivery } from "../domain/planning-delivery.js";

export class CompanionHttpError extends Error {
  constructor(readonly status: number) {
    super(`Companion request failed with HTTP ${status}`);
  }
}

export class CompanionClient {
  constructor(private readonly config: CompanionConfig) {}

  async verify() {
    const client = new IruddMcpClient(
      new URL("/mcp", this.config.serverUrl),
      companionHeaders(this.config),
    );
    try {
      await client.connect();
      const result = await client.callTool<{
        isError?: boolean;
        structuredContent?: {
          ownerId?: string;
          features?: { queueCompanion?: boolean };
        };
      }>("get_contract", { contractVersion: "v1" });
      if (
        result.isError ||
        result.structuredContent?.ownerId !== this.config.ownerId ||
        result.structuredContent.features?.queueCompanion !== true
      )
        throw new Error(
          "Owner or queue companion capability does not match configuration",
        );
    } finally {
      await client.close();
    }
  }

  private url(route: string) {
    return `${this.config.serverUrl}/companion/plans/${encodeURIComponent(this.config.planId)}/${route}`;
  }

  async page(cursor?: SyncCursor): Promise<PlanningPage> {
    const query = cursor
      ? `?cursor=${encodeURIComponent(JSON.stringify(cursor))}&limit=100`
      : "?limit=1";
    const response = await fetch(this.url(`planning${query}`), {
      headers: companionHeaders(this.config),
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new CompanionHttpError(response.status);
    return response.json() as Promise<PlanningPage>;
  }

  async report(
    connectionId: string,
    state: QueueDelivery["state"],
    queuedThrough: number,
  ) {
    const response = await fetch(this.url("delivery"), {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
      headers: {
        ...companionHeaders(this.config),
        "content-type": "application/json",
      },
      body: JSON.stringify({ connectionId, state, queuedThrough }),
    });
    await response.body?.cancel();
    if (!response.ok) throw new CompanionHttpError(response.status);
  }

  async *events(
    connectionId: string,
    signal: AbortSignal,
  ): AsyncGenerator<string> {
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal.addEventListener("abort", abort, { once: true });
    let timeout = setTimeout(abort, 45_000);
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      const response = await fetch(this.url("events"), {
        headers: {
          ...companionHeaders(this.config),
          "x-irudd-connection": connectionId,
          "x-irudd-thread": this.config.threadId,
        },
        redirect: "error",
        signal: AbortSignal.any([signal, controller.signal]),
      });
      if (!response.ok) throw new CompanionHttpError(response.status);
      if (
        !response.body ||
        !response.headers.get("content-type")?.startsWith("text/event-stream")
      )
        throw new Error("Expected a planning event stream");
      reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (!signal.aborted) {
        const chunk = await reader.read();
        if (chunk.done) break;
        clearTimeout(timeout);
        timeout = setTimeout(abort, 45_000);
        buffer += decoder.decode(chunk.value, { stream: true });
        if (buffer.length > 64_000)
          throw new Error("Planning event exceeds the size limit");
        let end: number;
        while ((end = buffer.indexOf("\n\n")) >= 0) {
          const event = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          yield event;
        }
      }
    } finally {
      clearTimeout(timeout);
      signal.removeEventListener("abort", abort);
      controller.abort();
      await reader?.cancel().catch(() => {});
    }
  }
}
