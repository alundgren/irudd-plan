import { useEffect, useState } from "react";
import type { AssetDescriptor } from "../contract/plan.js";
import { assetSource } from "./asset-view.js";

export function AssetThumbnail({
  planId,
  asset,
}: {
  readonly planId: string;
  readonly asset: AssetDescriptor;
}) {
  const source = assetSource(planId, asset);
  const [svg, setSvg] = useState<string>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!asset.available || asset.mediaType !== "image/svg+xml") return;
    const controller = new AbortController();
    void fetch(source, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Asset unavailable");
        const body = (await response.json()) as { bytesBase64: string };
        setSvg(`data:image/svg+xml;base64,${body.bytesBase64}`);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [source, asset.available, asset.mediaType]);
  if (!asset.available || failed || !asset.mediaType.startsWith("image/"))
    return null;
  if (asset.mediaType === "image/svg+xml" && svg === undefined) return null;
  return (
    <img
      className="asset-thumbnail"
      src={asset.mediaType === "image/svg+xml" ? svg : source}
      alt={asset.caption}
      onError={() => setFailed(true)}
    />
  );
}
