import { PlanError } from "../contract/errors.js";

export interface QueueDelivery {
  readonly connected: boolean;
  readonly threadId: string;
  readonly state: "listening" | "queued" | "uncertain";
  readonly queuedThrough: number;
}

interface Connection {
  readonly id: string;
  seenAt: number;
  delivery: QueueDelivery;
}

/** Presence belongs to the event connection, never to the plan specification. */
export class PlanningDelivery {
  private readonly connections = new Map<string, Connection>();
  private readonly listeners = new Map<string, Set<() => void>>();

  private key(ownerId: string, planId: string) {
    return JSON.stringify([ownerId, planId]);
  }

  get(ownerId: string, planId: string): QueueDelivery | undefined {
    const connection = this.connections.get(this.key(ownerId, planId));
    return connection
      ? {
          ...connection.delivery,
          connected:
            connection.delivery.connected &&
            Date.now() - connection.seenAt < 45_000,
        }
      : undefined;
  }

  connect(ownerId: string, planId: string, id: string, threadId: string) {
    const key = this.key(ownerId, planId);
    if (this.get(ownerId, planId)?.connected)
      throw new PlanError(
        "PLAN_CONFLICT",
        "A queue companion is already connected to this plan",
      );
    this.connections.set(key, {
      id,
      seenAt: Date.now(),
      delivery: {
        connected: true,
        threadId,
        state: "listening",
        queuedThrough: 0,
      },
    });
    this.changed(ownerId, planId);
    return () => {
      if (this.connections.get(key)?.id !== id) return;
      const current = this.connections.get(key)!;
      current.delivery = { ...current.delivery, connected: false };
      this.changed(ownerId, planId);
    };
  }

  report(
    ownerId: string,
    planId: string,
    id: string,
    state: QueueDelivery["state"],
    queuedThrough: number,
  ) {
    const connection = this.connections.get(this.key(ownerId, planId));
    if (!connection || connection.id !== id || !connection.delivery.connected)
      throw new PlanError(
        "PLAN_CONFLICT",
        "The queue companion connection is no longer active",
      );
    const changed =
      connection.delivery.state !== state ||
      connection.delivery.queuedThrough !== queuedThrough;
    connection.seenAt = Date.now();
    connection.delivery = { ...connection.delivery, state, queuedThrough };
    if (changed) this.changed(ownerId, planId);
  }

  subscribe(ownerId: string, planId: string, listener: () => void) {
    const key = this.key(ownerId, planId);
    const listeners = this.listeners.get(key) ?? new Set();
    listeners.add(listener);
    this.listeners.set(key, listeners);
    return () => {
      listeners.delete(listener);
      if (!listeners.size) this.listeners.delete(key);
    };
  }

  changed(ownerId: string, planId: string) {
    for (const listener of this.listeners.get(this.key(ownerId, planId)) ?? [])
      listener();
  }
}
