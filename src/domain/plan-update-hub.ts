export interface PlanUpdate {
  readonly ownerId: string;
  readonly planId: string;
  readonly version: number;
}

type Listener = (update: PlanUpdate) => void;

export class PlanUpdateHub {
  private readonly listeners = new Map<string, Set<Listener>>();

  subscribe(ownerId: string, planId: string, listener: Listener): () => void {
    const key = eventKey(ownerId, planId);
    const listeners = this.listeners.get(key) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(key, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.listeners.delete(key);
    };
  }

  publish(update: PlanUpdate): void {
    for (const listener of this.listeners.get(
      eventKey(update.ownerId, update.planId),
    ) ?? []) {
      listener(update);
    }
  }
}

function eventKey(ownerId: string, planId: string): string {
  return `${ownerId.length}:${ownerId}${planId}`;
}
