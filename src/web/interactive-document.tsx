import { useEffect, useMemo, useRef, useState } from "react";

import MockupWorker from "./mockup-worker.js?worker";

interface InteractiveDocumentProps {
  readonly content: string;
  readonly title: string;
}

interface PreparedDocument {
  readonly html: string;
  readonly scripts: ReadonlyArray<string>;
  readonly nodes: Record<string, NodeSnapshot>;
}

interface NodeSnapshot {
  readonly textContent: string;
  readonly dataset: Record<string, string>;
}

interface NodeUpdate {
  readonly id: string;
  readonly textContent?: string;
  readonly dataset?: Record<string, string>;
}

const documentCsp =
  "default-src 'none'; img-src data:; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'";

export function InteractiveDocument({
  content,
  title,
}: InteractiveDocumentProps) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(240);
  const prepared = useMemo(() => prepareDocument(content), [content]);

  useEffect(() => {
    const iframe = frame.current;
    if (iframe === null) return;
    let worker: Worker | undefined;
    let observer: ResizeObserver | undefined;
    const start = (): void => {
      const frameDocument = iframe.contentDocument;
      if (frameDocument === null) return;
      const measure = () => setHeight(documentHeight(frameDocument));
      observer = new ResizeObserver(measure);
      observer.observe(frameDocument.body);
      measure();
      worker = new MockupWorker({ type: "module" });
      worker.onerror = (event) =>
        console.error("Mockup worker failed:", event.message);
      worker.onmessage = (event: MessageEvent<NodeUpdate>) => {
        applyUpdate(frameDocument, event.data);
      };
      worker.postMessage({
        type: "initialize",
        nodes: prepared.nodes,
        scripts: prepared.scripts,
      });
      frameDocument.addEventListener("click", (event) => {
        const target = event.target as Element | null;
        if (target?.nodeType !== 1) return;
        const interactive = target.closest("[id], a");
        if (interactive?.tagName.toLowerCase() === "a") event.preventDefault();
        const id = interactive?.id;
        if (id !== undefined && id !== "") {
          worker?.postMessage({ type: "click", id });
        }
      });
      frameDocument.addEventListener("submit", (event) =>
        event.preventDefault(),
      );
      frameDocument.addEventListener(
        "wheel",
        (event) => {
          if (!event.ctrlKey && !event.metaKey && canScroll(event)) return;
          event.preventDefault();
          const bounds = iframe.getBoundingClientRect();
          const scale = bounds.width / iframe.offsetWidth;
          iframe.dispatchEvent(
            new WheelEvent("wheel", {
              bubbles: true,
              cancelable: true,
              deltaX: event.deltaX,
              deltaY: event.deltaY,
              deltaMode: event.deltaMode,
              ctrlKey: event.ctrlKey,
              metaKey: event.metaKey,
              shiftKey: event.shiftKey,
              clientX: bounds.x + event.clientX * scale,
              clientY: bounds.y + event.clientY * scale,
            }),
          );
        },
        { passive: false },
      );
    };
    if (
      iframe.contentDocument?.readyState === "complete" &&
      iframe.contentDocument.URL === "about:srcdoc"
    ) {
      start();
    } else {
      iframe.addEventListener("load", start, { once: true });
    }
    return () => {
      iframe.removeEventListener("load", start);
      worker?.terminate();
      observer?.disconnect();
    };
  }, [prepared]);

  return (
    <iframe
      ref={frame}
      className="interactive-document"
      style={{ height }}
      title={title}
      srcDoc={`<!doctype html><meta http-equiv="Content-Security-Policy" content="${documentCsp}">${prepared.html}`}
      sandbox="allow-same-origin"
    />
  );
}

function documentHeight(document: Document): number {
  const body = document.body;
  const style = getComputedStyle(body);
  const contentHeight =
    body.getBoundingClientRect().height +
    Number.parseFloat(style.marginTop) +
    Number.parseFloat(style.marginBottom);
  // Viewport-relative mockups must not keep enlarging their own viewport.
  return Math.min(
    4096,
    Math.max(
      240,
      Math.ceil(Math.max(contentHeight, document.documentElement.scrollHeight)),
    ),
  );
}

function canScroll(event: WheelEvent): boolean {
  let element = event.target as HTMLElement | null;
  while (element !== null) {
    const style = getComputedStyle(element);
    if (
      (["auto", "scroll"].includes(style.overflowY) ||
        element === element.ownerDocument.scrollingElement) &&
      (event.deltaY < 0
        ? element.scrollTop > 0
        : event.deltaY > 0 &&
          element.scrollTop + element.clientHeight < element.scrollHeight)
    )
      return true;
    if (
      (["auto", "scroll"].includes(style.overflowX) ||
        element === element.ownerDocument.scrollingElement) &&
      (event.deltaX < 0
        ? element.scrollLeft > 0
        : event.deltaX > 0 &&
          element.scrollLeft + element.clientWidth < element.scrollWidth)
    )
      return true;
    element = element.parentElement;
  }
  return false;
}

function prepareDocument(content: string): PreparedDocument {
  const parsed = new DOMParser().parseFromString(content, "text/html");
  const scripts = [...parsed.querySelectorAll("script")].map(
    (script) => script.textContent ?? "",
  );
  for (const element of parsed.querySelectorAll(
    "script, iframe, frame, frameset, object, embed, base, link, meta[http-equiv='refresh' i]",
  )) {
    element.remove();
  }
  for (const element of parsed.querySelectorAll("*")) {
    for (const attribute of [...element.attributes]) {
      if (
        attribute.name.toLowerCase().startsWith("on") ||
        ["action", "formaction", "srcdoc"].includes(
          attribute.name.toLowerCase(),
        )
      ) {
        element.removeAttribute(attribute.name);
      }
    }
  }
  const nodes: PreparedDocument["nodes"] = {
    body: snapshotNode(parsed.body),
  };
  for (const element of parsed.querySelectorAll("[id]")) {
    nodes[element.id] = snapshotNode(element);
  }
  return {
    html:
      [...parsed.head.querySelectorAll("style")]
        .map((style) => style.outerHTML)
        .join("") + parsed.body.innerHTML,
    scripts,
    nodes,
  };
}

function snapshotNode(element: Element): NodeSnapshot {
  const dataset: Record<string, string> = {};
  if (element instanceof HTMLElement || element instanceof SVGElement) {
    for (const [key, value] of Object.entries(element.dataset)) {
      if (value !== undefined) dataset[key] = value;
    }
  }
  return {
    textContent: element.textContent ?? "",
    dataset,
  };
}

function applyUpdate(document: Document, update: NodeUpdate): void {
  const element =
    update.id === "body" ? document.body : document.getElementById(update.id);
  if (element === null) return;
  if (update.textContent !== undefined)
    element.textContent = update.textContent;
  if (update.dataset !== undefined) {
    for (const key of Object.keys(element.dataset)) delete element.dataset[key];
    Object.assign(element.dataset, update.dataset);
  }
}
