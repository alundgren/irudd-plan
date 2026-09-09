import type { IncomingMessage, ServerResponse } from "node:http";
import type { Authenticator } from "../auth/authentication.js";
import { PlanError } from "../contract/errors.js";
import { decode } from "../contract/plan.js";
import {
  AppendPlanningRequest,
  GetPlanningRequest,
} from "../contract/planning.js";
import type { PlanService } from "../domain/plan-service.js";

export async function handlePlanningRequest(
  request: IncomingMessage,
  response: ServerResponse,
  service: PlanService,
  authenticator: Authenticator,
  url: URL,
): Promise<boolean> {
  const source = url.pathname.match(
    /^\/api\/plans\/([^/]+)\/agent-context\/([^/]+)$/,
  );
  const match =
    source ?? url.pathname.match(/^\/api\/plans\/([^/]+)\/planning$/);
  if (match?.[1] === undefined) return false;
  const ownerId = await authenticator.authenticate(request.headers);
  const planId = decodeURIComponent(match[1]);
  try {
    let result: unknown;
    if (source) {
      if (request.method !== "GET") {
        response.writeHead(405, { allow: "GET" }).end();
        return true;
      }
      result = await service.getAgentContextEntry(
        ownerId,
        planId,
        decodeURIComponent(source[2]!),
      );
    } else if (request.method === "GET") {
      const query = planningQuery(url, planId);
      result = await service.getPlanning(
        ownerId,
        planId,
        query.cursor,
        query.limit,
      );
    } else if (request.method === "POST") {
      // A custom header and JSON content type force cross-origin browsers through preflight.
      if (
        request.headers["x-irudd-planning"] !== "1" ||
        request.headers["content-type"]?.split(";")[0] !== "application/json" ||
        request.headers["sec-fetch-site"] === "cross-site"
      ) {
        response.writeHead(403).end();
        return true;
      }
      const body = decode(AppendPlanningRequest, await readJson(request));
      if (body.planId !== planId)
        throw new PlanError(
          "REQUEST_INVALID",
          "Plan does not match the request URL",
        );
      result = await service.appendPlanning(ownerId, body, "human");
    } else {
      response.writeHead(405, { allow: "GET, POST" }).end();
      return true;
    }
    response.writeHead(200, {
      "content-type": "application/json",
      "cache-control": "no-store",
    });
    response.end(JSON.stringify(result));
  } catch (error) {
    if (
      !(error instanceof PlanError) &&
      !(error instanceof SyntaxError) &&
      !(error instanceof Error && error.name === "SchemaError")
    )
      throw error;
    const code = error instanceof PlanError ? error.code : "REQUEST_INVALID";
    const status =
      code === "PLAN_NOT_FOUND" || code === "REFERENCE_MISSING"
        ? 404
        : code === "PLAN_CONFLICT" || code === "SYNC_REQUIRED"
          ? 409
          : 400;
    response.writeHead(status, {
      "content-type": "application/json",
      "cache-control": "no-store",
    });
    response.end(
      JSON.stringify({
        code,
        error: error instanceof Error ? error.message : "Request failed",
      }),
    );
  }
  return true;
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.from(chunk);
    size += bytes.length;
    if (size > 500_000)
      throw new PlanError("REQUEST_INVALID", "Answer batch is too large");
    chunks.push(bytes);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function planningQuery(url: URL, planId: string) {
  return decode(GetPlanningRequest, {
    contractVersion: "v1",
    planId,
    ...(url.searchParams.has("cursor")
      ? { cursor: JSON.parse(url.searchParams.get("cursor")!) }
      : {}),
    ...(url.searchParams.has("limit")
      ? { limit: Number(url.searchParams.get("limit")) }
      : {}),
  });
}
