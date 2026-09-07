import { MessageSquarePlus } from "lucide-react";
import { useEffect, useState } from "react";

import type { AssetDescriptor } from "../contract/plan.js";
import { InteractiveDocument } from "./interactive-document.js";

interface AssetViewProps {
  readonly planId: string;
  readonly asset: AssetDescriptor;
  readonly feedbackCount: number;
  readonly onAddFeedback: () => void;
}

const svgCsp =
  "default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; script-src 'none'; connect-src 'none'; form-action 'none'";

export function AssetView({
  planId,
  asset,
  feedbackCount,
  onAddFeedback,
}: AssetViewProps) {
  const publicRoute = window.location.pathname.match(
    /^\/public\/plans\/([^/]+)\/([^/]+)/,
  );
  const source =
    publicRoute?.[1] === undefined
      ? `/api/plans/${encodeURIComponent(planId)}/assets/${encodeURIComponent(asset.id)}?digest=${encodeURIComponent(asset.digest)}`
      : `/public/plans/${publicRoute[1]}/${encodeURIComponent(planId)}/assets/${encodeURIComponent(asset.id)}?digest=${encodeURIComponent(asset.digest)}`;
  const isolated =
    asset.mediaType === "text/html" || asset.mediaType === "image/svg+xml";
  const [document, setDocument] = useState<string | undefined>(undefined);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!isolated || !asset.available) return;
    const controller = new AbortController();
    setFailed(false);
    setDocument(undefined);
    void fetch(source, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Asset unavailable");
        const body = (await response.json()) as { bytesBase64: string };
        const bytes = Uint8Array.from(atob(body.bytesBase64), (character) =>
          character.charCodeAt(0),
        );
        const content = new TextDecoder().decode(bytes);
        setDocument(content);
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setFailed(true);
        }
      });
    return () => controller.abort();
  }, [asset.available, isolated, source]);

  const supported =
    isolated ||
    ["image/png", "image/jpeg", "image/gif", "image/webp"].includes(
      asset.mediaType,
    );
  return (
    <figure className="asset-view nodrag nopan" data-feedback-asset={asset.id}>
      <figcaption>{asset.caption}</figcaption>
      <div className="asset-frame">
        {!asset.available || failed ? (
          <p role="status" className="asset-error">
            Asset unavailable or rejected
          </p>
        ) : !supported ? (
          <p role="status" className="asset-error">
            Preview unavailable for {asset.mediaType}
          </p>
        ) : isolated ? (
          document === undefined ? (
            <p className="asset-loading">Loading visual...</p>
          ) : asset.mediaType === "text/html" ? (
            <InteractiveDocument content={document} title={asset.caption} />
          ) : (
            <SvgDocument content={document} title={asset.caption} />
          )
        ) : (
          <img
            src={source}
            alt={asset.caption}
            onError={() => setFailed(true)}
          />
        )}
      </div>
      <button
        type="button"
        className="feedback-target-control asset-feedback"
        aria-label={`Add feedback to visual ${asset.caption}`}
        title={`Add feedback to visual ${asset.caption}`}
        onClick={onAddFeedback}
      >
        <MessageSquarePlus aria-hidden="true" size={14} />
        Add feedback{feedbackCount > 0 ? ` (${feedbackCount})` : ""}
      </button>
    </figure>
  );
}

function SvgDocument({
  content,
  title,
}: {
  readonly content: string;
  readonly title: string;
}) {
  const svg = new DOMParser().parseFromString(
    content,
    "image/svg+xml",
  ).documentElement;
  const viewBox = svg
    .getAttribute("viewBox")
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);
  const dimension = (name: string) => {
    const value = svg.getAttribute(name) ?? "";
    return /^\d+(?:\.\d+)?(?:px)?$/.test(value)
      ? Number.parseFloat(value)
      : undefined;
  };
  const width = dimension("width") ?? viewBox?.[2] ?? 300;
  const height = dimension("height") ?? viewBox?.[3] ?? 150;
  const ratio =
    width > 0 && height > 0 && Number.isFinite(width / height)
      ? width / height
      : 2;
  if (!svg.hasAttribute("viewBox") && width > 0 && height > 0) {
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  }
  const drawing = new XMLSerializer().serializeToString(svg);
  return (
    <iframe
      className="svg-document"
      title={title}
      style={{ aspectRatio: ratio }}
      srcDoc={`<!doctype html><meta http-equiv="Content-Security-Policy" content="${svgCsp}"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden}body>svg{display:block;width:100%;height:100%}</style>${drawing}`}
      sandbox=""
    />
  );
}
