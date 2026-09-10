import type { IncomingMessage, ServerResponse } from "node:http";
import { Schema } from "effect";
import type { Authenticator } from "../auth/authentication.js";
import { decode } from "../contract/plan.js";
import type { PlanService } from "../domain/plan-service.js";
import { planningEvents } from "./planning-events.js";
import { planningQuery, readJson } from "./planning-router.js";

const Report = Schema.Struct({
  connectionId: Schema.String,
  state: Schema.Literals(["listening", "queued", "uncertain"]),
  queuedThrough: Schema.Number.check(
    Schema.isInt(),
    Schema.isGreaterThanOrEqualTo(0),
  ),
});

export async function handleCompanionRequest(
  request: IncomingMessage,
  response: ServerResponse,
  service: PlanService,
  authenticator: Authenticator,
  register: (close: () => void) => () => void,
): Promise<boolean> {
  const url = new URL(request.url ?? "/", "http://localhost");
  const match = url.pathname.match(
    /^\/companion\/plans\/([^/]+)\/(events|planning|delivery)$/,
  );
  if (!match) return false;
  const planId = decodeURIComponent(match[1]!);
  const ownerId = await authenticator.authenticate(request.headers);
  if (match[2] === "events" && request.method === "GET") {
    await planningEvents(
      request,
      response,
      service,
      authenticator,
      register,
      planId,
      true,
    );
    return true;
  }
  let result: unknown;
  if (match[2] === "planning" && request.method === "GET") {
    const query = planningQuery(url, planId);
    result = await service.getPlanning(
      ownerId,
      planId,
      query.cursor,
      query.limit,
    );
  } else if (match[2] === "delivery" && request.method === "POST") {
    await service.getPlanning(ownerId, planId);
    const report = decode(Report, await readJson(request));
    service.delivery.report(
      ownerId,
      planId,
      report.connectionId,
      report.state,
      report.queuedThrough,
    );
    result = { accepted: true };
  } else {
    response.writeHead(405).end();
    return true;
  }
  response.writeHead(200, {
    "content-type": "application/json",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(result));
  return true;
}
