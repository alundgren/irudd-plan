"use strict";

import "ses";

interface NodeSnapshot {
  textContent: string;
  dataset: Record<string, string>;
}

interface InitializeMessage {
  readonly type: "initialize";
  readonly nodes: Record<string, NodeSnapshot>;
  readonly scripts: ReadonlyArray<string>;
}

interface ClickMessage {
  readonly type: "click";
  readonly id: string;
}

type IncomingMessage = InitializeMessage | ClickMessage;
type Handler = (event: { readonly preventDefault: () => void }) => void;

lockdown();

const state = new Map<string, NodeSnapshot>();
const handlers = new Map<string, Handler>();

globalThis.onmessage = (event: MessageEvent<IncomingMessage>) => {
  if (event.data.type === "initialize") {
    initialize(event.data);
    return;
  }
  const handler = handlers.get(event.data.id);
  if (handler !== undefined) {
    try {
      handler.call(element(event.data.id), { preventDefault: () => undefined });
    } catch {
      // A failing uploaded handler stops only this interaction.
    }
  }
};

function initialize(message: InitializeMessage): void {
  for (const [id, snapshot] of Object.entries(message.nodes)) {
    state.set(id, structuredClone(snapshot));
  }
  const document = {
    body: element("body"),
    querySelector: (selector: string) =>
      selector === "body"
        ? element("body")
        : selector.startsWith("#")
          ? element(selector.slice(1))
          : null,
    getElementById: (id: string) => element(id),
  };
  const forbiddenStorage = new Proxy(
    {},
    { get: () => throwDisabled("Parent access") },
  );
  const forbiddenLocation = Object.freeze({
    href: "about:blank",
    assign: () => throwDisabled("Navigation"),
    replace: () => throwDisabled("Navigation"),
  });
  const isolatedWindow = Object.freeze({
    parent: Object.freeze({ localStorage: forbiddenStorage }),
    top: Object.freeze({ location: forbiddenLocation }),
    location: forbiddenLocation,
  });
  const compartment = new Compartment({
    globals: {
      document,
      window: isolatedWindow,
      setTimeout: (callback: () => void, delay?: number) =>
        setTimeout(() => callback(), delay),
      fetch: () => Promise.reject(new Error("Network access is disabled")),
    },
    __options__: true,
  });
  for (const script of message.scripts) {
    try {
      compartment.evaluate(script);
    } catch {
      // A rejected capability stops only that uploaded script.
    }
  }
}

function element(id: string) {
  if (!state.has(id)) return null;
  return {
    get textContent() {
      return state.get(id)?.textContent ?? "";
    },
    set textContent(value: unknown) {
      const snapshot = state.get(id);
      if (snapshot === undefined) return;
      snapshot.textContent = String(value);
      postMessage({ id, textContent: snapshot.textContent });
    },
    dataset: new Proxy(state.get(id)?.dataset ?? {}, {
      set(target, key, value) {
        if (typeof key !== "string") return false;
        target[key] = String(value);
        postMessage({ id, dataset: { ...target } });
        return true;
      },
    }),
    set onclick(value: Handler | undefined) {
      if (value === undefined) handlers.delete(id);
      else handlers.set(id, value);
    },
    get onclick() {
      return handlers.get(id);
    },
  };
}

function throwDisabled(capability: string): never {
  throw new Error(`${capability} is disabled`);
}
