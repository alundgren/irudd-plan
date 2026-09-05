import { readFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";

import type { Authenticator } from "../auth/authentication.js";
import { PlanError } from "../contract/errors.js";
import type { PlanService } from "../domain/plan-service.js";
import type { PlanUpdate } from "../domain/plan-update-hub.js";
import { renderAppPage } from "./operator-page.js";

interface BrowserRouterOptions {
  readonly authenticator: Authenticator;
  readonly clientAssetsDirectory: string;
  readonly registerStreamClose: (close: () => void) => () => void;
}

export async function handleBrowserRequest(
  request: IncomingMessage,
  response: ServerResponse,
  service: PlanService,
  options: BrowserRouterOptions,
): Promise<boolean> {
  const url = new URL(request.url ?? "/", "http://localhost");
  if (request.method === "GET" && isClientAsset(url.pathname)) {
    await serveClientAsset(
      response,
      options.clientAssetsDirectory,
      url.pathname,
    );
    return true;
  }
  if (request.method !== "GET") return false;

  if (url.pathname === "/" || isPlanPage(url.pathname)) {
    await options.authenticator.authenticate(request.headers);
    sendHtml(response, renderAppPage());
    return true;
  }

  if (url.pathname === "/api/plans") {
    const ownerId = await options.authenticator.authenticate(request.headers);
    sendJson(response, 200, { plans: await service.list(ownerId) });
    return true;
  }

  const eventMatch = url.pathname.match(/^\/api\/plans\/([^/]+)\/events$/);
  if (eventMatch?.[1] !== undefined) {
    const planId = decodeURIComponent(eventMatch[1]);
    await subscribe(
      request,
      response,
      service,
      options.authenticator,
      options.registerStreamClose,
      planId,
    );
    return true;
  }

  const assetMatch = url.pathname.match(
    /^\/api\/plans\/([^/]+)\/assets\/([^/]+)$/,
  );
  if (assetMatch?.[1] !== undefined && assetMatch[2] !== undefined) {
    const ownerId = await options.authenticator.authenticate(request.headers);
    const asset = await service.getAsset(ownerId, {
      contractVersion: "v1",
      planId: decodeURIComponent(assetMatch[1]),
      assetId: decodeURIComponent(assetMatch[2]),
      digest: url.searchParams.get("digest") ?? "",
      content: "rendered",
    });
    if (isActiveMarkup(asset.mediaType)) {
      sendJson(response, 200, {
        mediaType: asset.mediaType,
        bytesBase64: asset.bytesBase64,
      });
    } else {
      sendAsset(
        response,
        asset.mediaType,
        Buffer.from(asset.bytesBase64, "base64"),
      );
    }
    return true;
  }

  const planMatch = url.pathname.match(/^\/api\/plans\/([^/]+)$/);
  if (planMatch?.[1] !== undefined) {
    const ownerId = await options.authenticator.authenticate(request.headers);
    const stored = await service.current(
      ownerId,
      decodeURIComponent(planMatch[1]),
    );
    if (stored === undefined) {
      throw new PlanError("PLAN_NOT_FOUND", "Plan is unavailable");
    }
    sendJson(response, 200, stored);
    return true;
  }
  return false;
}

async function subscribe(
  request: IncomingMessage,
  response: ServerResponse,
  service: PlanService,
  authenticator: Authenticator,
  registerStreamClose: (close: () => void) => () => void,
  planId: string,
): Promise<void> {
  const ownerId = await authenticator.authenticate(request.headers);
  const current = await service.current(ownerId, planId);
  if (current === undefined) {
    throw new PlanError("PLAN_NOT_FOUND", "Plan is unavailable");
  }
  response.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-store",
    connection: "keep-alive",
    "x-accel-buffering": "no",
  });
  response.write(
    `event: ready\ndata: ${JSON.stringify({ version: current.version })}\n\n`,
  );

  let closed = false;
  let heartbeat: NodeJS.Timeout | undefined;
  let unsubscribe = (): void => undefined;
  let unregisterStream = (): void => undefined;
  const close = (): void => {
    if (closed) return;
    closed = true;
    unsubscribe();
    unregisterStream();
    if (heartbeat !== undefined) clearInterval(heartbeat);
    if (!response.writableEnded) response.end();
  };
  const deliver = async (update: PlanUpdate): Promise<void> => {
    try {
      const currentOwner = await authenticator.authenticate(request.headers);
      if (currentOwner !== ownerId) return close();
      const latest = await service.current(currentOwner, planId);
      if (latest === undefined) return close();
      response.write(
        `id: ${update.version}\nevent: plan-update\ndata: ${JSON.stringify({ version: update.version })}\n\n`,
      );
    } catch {
      close();
    }
  };
  unsubscribe = service.updates.subscribe(ownerId, planId, (update) => {
    void deliver(update);
  });
  unregisterStream = registerStreamClose(close);
  heartbeat = setInterval(() => response.write(": keepalive\n\n"), 15_000);
  heartbeat.unref();
  request.on("close", close);
}

function isPlanPage(pathname: string): boolean {
  return /^\/plans\/[^/]+(?:\/items\/[^/]+)?$/.test(pathname);
}

function isClientAsset(pathname: string): boolean {
  return /^\/assets\/[A-Za-z0-9._-]+$/.test(pathname);
}

async function serveClientAsset(
  response: ServerResponse,
  directory: string,
  pathname: string,
): Promise<void> {
  const filename = pathname.slice("/assets/".length);
  try {
    const content = await readFile(join(directory, filename));
    response.writeHead(200, {
      "content-type": clientAssetMediaType(filename),
      "content-length": content.byteLength,
      "cache-control": "public, max-age=3600",
      ...(filename.startsWith("mockup-worker-")
        ? {
            "content-security-policy":
              "default-src 'none'; script-src 'self' 'unsafe-eval'; connect-src 'none'",
          }
        : {}),
    });
    response.end(content);
  } catch {
    sendJson(response, 503, { error: "Browser application is not built" });
  }
}

function clientAssetMediaType(filename: string): string {
  if (filename.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filename.endsWith(".css")) return "text/css; charset=utf-8";
  return "application/octet-stream";
}

function sendAsset(
  response: ServerResponse,
  mediaType: string,
  content: Buffer,
): void {
  response.writeHead(200, {
    "content-type": mediaType,
    "content-length": content.byteLength,
    "cache-control": "private, no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(content);
}

function isActiveMarkup(mediaType: string): boolean {
  return mediaType === "text/html" || mediaType === "image/svg+xml";
}

export function sendJson(
  response: ServerResponse,
  status: number,
  body: unknown,
): void {
  const content = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(content),
    "cache-control": "private, no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(content);
}

function sendHtml(response: ServerResponse, body: string): void {
  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "private, no-store",
  });
  response.end(body);
}
