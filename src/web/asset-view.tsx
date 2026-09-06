import { MessageSquarePlus } from "lucide-react";
import { useEffect, useState } from "react";

import type { AssetDescriptor } from "../contract/plan.js";
import { InteractiveDocument } from "./interactive-document.js";
import { Badge } from "./ui/badge.js";

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
  const source = `/api/plans/${encodeURIComponent(planId)}/assets/${encodeURIComponent(asset.id)}?digest=${encodeURIComponent(asset.digest)}`;
  const isolated =
    asset.mediaType === "text/html" || asset.mediaType === "image/svg+xml";
  const [document, setDocument] = useState<string | undefined>(undefined);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!isolated) return;
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
  }, [isolated, source]);

  return (
    <figure className="asset-view nodrag nopan nowheel">
      <div className="asset-frame">
        {failed ? (
          <p role="status" className="asset-error">
            Asset unavailable or rejected
          </p>
        ) : isolated ? (
          document === undefined ? (
            <p className="asset-loading">Loading visual...</p>
          ) : asset.mediaType === "text/html" ? (
            <InteractiveDocument content={document} title={asset.caption} />
          ) : (
            <iframe
              title={asset.caption}
              srcDoc={`<!doctype html><meta http-equiv="Content-Security-Policy" content="${svgCsp}">${document}`}
              sandbox=""
            />
          )
        ) : (
          <img src={source} alt={asset.caption} />
        )}
      </div>
      <figcaption>
        <span>{asset.caption}</span>
        <span className="asset-actions">
          <Badge>{asset.role}</Badge>
          <button
            type="button"
            className="feedback-target-control"
            aria-label={`Add feedback to visual ${asset.caption}`}
            title={`Add feedback to visual ${asset.caption}`}
            onClick={onAddFeedback}
          >
            <MessageSquarePlus aria-hidden="true" size={14} />
            {feedbackCount > 0 ? <span>{feedbackCount}</span> : null}
          </button>
        </span>
      </figcaption>
    </figure>
  );
}
