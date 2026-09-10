import type { IncomingMessage, ServerResponse } from "node:http";
import type { Authenticator } from "../auth/authentication.js";
import { PlanError } from "../contract/errors.js";
import type { PlanService } from "../domain/plan-service.js";

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export async function planningEvents(
  request: IncomingMessage,
  response: ServerResponse,
  service: PlanService,
  authenticator: Authenticator,
  register: (close: () => void) => () => void,
  planId: string,
  companion = false,
) {
  const ownerId = await authenticator.authenticate(request.headers);
  await service.getPlanning(ownerId, planId);
  const connectionId = request.headers["x-irudd-connection"];
  const threadId = request.headers["x-irudd-thread"];
  if (
    companion &&
    (typeof connectionId !== "string" ||
      !uuid.test(connectionId) ||
      typeof threadId !== "string" ||
      !uuid.test(threadId))
  )
    throw new PlanError(
      "REQUEST_INVALID",
      "Companion connection and thread UUIDs are required",
    );
  const disconnect = companion
    ? service.delivery.connect(
        ownerId,
        planId,
        connectionId as string,
        threadId as string,
      )
    : () => {};
  response.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-store",
    "x-accel-buffering": "no",
  });
  let closed = false;
  let pending = false;
  let running = false;
  let previous = "";
  const close = () => {
    if (closed) return;
    closed = true;
    clearInterval(timer);
    unsubscribe();
    unregister();
    disconnect();
    response.end();
  };
  const deliver = async () => {
    pending = true;
    if (running || closed) return;
    running = true;
    try {
      while (pending && !closed) {
        pending = false;
        if ((await authenticator.authenticate(request.headers)) !== ownerId)
          return close();
        const page = await service.getPlanning(ownerId, planId);
        if (closed) return;
        // Clients always reconcile from a verified cursor, including after reconnect.
        const data = JSON.stringify({
          revision: page.headCursor.revision,
          digest: page.headCursor.digest,
          delivery: page.delivery ?? null,
        });
        const event =
          data === previous
            ? ": keepalive\n\n"
            : `event: planning-update\ndata: ${data}\n\n`;
        previous = data;
        if (!response.write(event)) return close();
      }
    } catch {
      close();
    } finally {
      running = false;
    }
  };
  const unsubscribe = service.delivery.subscribe(
    ownerId,
    planId,
    () => void deliver(),
  );
  const unregister = register(close);
  // Revalidate credentials and plan access even while the conversation is idle.
  const timer = setInterval(() => void deliver(), 15_000).unref();
  response.on("close", close);
  void deliver();
}
