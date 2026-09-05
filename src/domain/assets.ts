import { createHash } from "node:crypto";

import { parse } from "acorn";
import { parseFragment } from "parse5";

import { PlanError } from "../contract/errors.js";
import type { AssetDescriptor, UploadAssetRequest } from "../contract/plan.js";

export interface AssetLimits {
  readonly maxAssetBytes: number;
  readonly maxSourceBytes: number;
  readonly maxOwnerStorageBytes: number;
}

export interface PreparedAsset {
  readonly planId: string;
  readonly assetId: string;
  readonly mediaType: string;
  readonly caption: string;
  readonly role: "binding-reference" | "illustration";
  readonly content: Buffer;
  readonly digest: string;
  readonly source?: {
    readonly mediaType: string;
    readonly content: Buffer;
    readonly digest: string;
  };
}

const renderedTypes = new Set([
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/svg+xml",
  "image/webp",
  "text/html",
]);

export function prepareAsset(
  request: UploadAssetRequest,
  limits: AssetLimits,
): PreparedAsset {
  if (!renderedTypes.has(request.mediaType)) {
    throw new PlanError(
      "ASSET_INVALID",
      `Unsupported rendered asset type: ${request.mediaType}`,
    );
  }
  const content = decodeBase64(request.bytesBase64, "asset");
  requireWithinLimit(content, limits.maxAssetBytes, "asset");
  validateSelfContained(request.mediaType, content);

  let source: PreparedAsset["source"];
  if (request.source !== undefined) {
    if (!isSourceType(request.source.mediaType)) {
      throw new PlanError(
        "ASSET_INVALID",
        `Unsupported editable source type: ${request.source.mediaType}`,
      );
    }
    const sourceContent = decodeBase64(request.source.bytesBase64, "source");
    requireWithinLimit(sourceContent, limits.maxSourceBytes, "source");
    source = {
      mediaType: request.source.mediaType,
      content: sourceContent,
      digest: bytesDigest(sourceContent),
    };
  }

  return {
    planId: request.planId,
    assetId: request.assetId,
    mediaType: request.mediaType,
    caption: request.caption,
    role: request.role,
    content,
    digest: bytesDigest(content),
    ...(source === undefined ? {} : { source }),
  };
}

export function assetDescriptor(asset: PreparedAsset): AssetDescriptor {
  return {
    id: asset.assetId,
    uri: assetResourceUri(asset.planId, asset.assetId, asset.digest),
    mediaType: asset.mediaType,
    digest: asset.digest,
    caption: asset.caption,
    role: asset.role,
    available: true,
    ...(asset.source === undefined
      ? {}
      : {
          source: {
            mediaType: asset.source.mediaType,
            digest: asset.source.digest,
          },
        }),
  };
}

export function assetResourceUri(
  planId: string,
  assetId: string,
  digest: string,
): string {
  return `irudd-plan://plans/${encodeURIComponent(planId)}/assets/${encodeURIComponent(assetId)}?digest=${encodeURIComponent(digest)}`;
}

function isSourceType(mediaType: string): boolean {
  return (
    mediaType.startsWith("text/") ||
    mediaType === "application/json" ||
    mediaType === "image/svg+xml"
  );
}

function decodeBase64(value: string, label: string): Buffer {
  const compact = value.replace(/\s/g, "");
  if (
    compact.length === 0 ||
    compact.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(compact)
  ) {
    throw new PlanError("ASSET_INVALID", `${label} bytes are not valid base64`);
  }
  const content = Buffer.from(compact, "base64");
  if (content.toString("base64") !== compact) {
    throw new PlanError("ASSET_INVALID", `${label} bytes are not valid base64`);
  }
  return content;
}

function requireWithinLimit(
  content: Buffer,
  limit: number,
  label: string,
): void {
  if (content.byteLength > limit) {
    throw new PlanError(
      "ASSET_TOO_LARGE",
      `${label} is ${content.byteLength} bytes; the limit is ${limit}`,
      { actualBytes: content.byteLength, limitBytes: limit },
    );
  }
}

function validateSelfContained(mediaType: string, content: Buffer): void {
  if (mediaType !== "text/html" && mediaType !== "image/svg+xml") return;
  const originalText = content.toString("utf8");
  requireClosedScripts(originalText);
  const text = content
    .toString("utf8")
    .replace(/(<script\b[^>]*>)[\s\S]*?(<\/script\s*>)/gi, "$1$2");
  validateInlineScripts(originalText);
  if (hasExternalMarkupDependency(text)) {
    throw new PlanError(
      "ASSET_INVALID",
      "HTML and SVG uploads must be self-contained; an external or relative dependency was found",
    );
  }
}

interface MarkupNode {
  readonly nodeName: string;
  readonly childNodes?: ReadonlyArray<MarkupNode>;
  readonly sourceCodeLocation?: { readonly endTag?: unknown } | null;
}

function requireClosedScripts(text: string): void {
  const document = parseFragment(text, { sourceCodeLocationInfo: true });
  const pending = [...document.childNodes] as MarkupNode[];
  while (pending.length > 0) {
    const node = pending.pop();
    if (node === undefined) continue;
    if (
      node.nodeName === "script" &&
      node.sourceCodeLocation?.endTag === undefined
    ) {
      throw new PlanError(
        "ASSET_INVALID",
        "HTML and SVG script elements must have a closing tag",
      );
    }
    if (node.childNodes !== undefined) pending.push(...node.childNodes);
  }
}

function validateInlineScripts(text: string): void {
  const scripts = text.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi);
  for (const match of scripts) {
    try {
      const program = parse(match[1] ?? "", {
        ecmaVersion: "latest",
        sourceType: "script",
      });
      if (containsImportExpression(program)) {
        throw new Error("imports are disabled");
      }
    } catch {
      throw new PlanError(
        "ASSET_INVALID",
        "HTML and SVG scripts must be valid classic JavaScript without module imports",
      );
    }
  }
}

function containsImportExpression(value: unknown): boolean {
  if (value === null || typeof value !== "object") return false;
  if ((value as { type?: unknown }).type === "ImportExpression") return true;
  return Object.values(value).some((child) =>
    Array.isArray(child)
      ? child.some(containsImportExpression)
      : containsImportExpression(child),
  );
}

function hasExternalMarkupDependency(text: string): boolean {
  const attributes =
    /\b(src|href|xlink:href|action|srcset|data|poster)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi;
  for (const match of text.matchAll(attributes)) {
    const name = match[1]?.toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? "";
    if (name === "srcset" && value.trim() !== "") return true;
    if (!isEmbeddedReference(value)) return true;
  }

  const cssUrls = /\burl\(\s*(?:"([^"]*)"|'([^']*)'|([^\s)'";]+))\s*\)/gi;
  for (const match of text.matchAll(cssUrls)) {
    if (!isEmbeddedReference(match[1] ?? match[2] ?? match[3] ?? "")) {
      return true;
    }
  }

  const cssImports =
    /@import\s+(?:url\(\s*)?(?:"([^"]*)"|'([^']*)'|([^\s)'";]+))/gi;
  for (const match of text.matchAll(cssImports)) {
    if (!isEmbeddedReference(match[1] ?? match[2] ?? match[3] ?? "")) {
      return true;
    }
  }
  return false;
}

function isEmbeddedReference(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return (
    normalized === "" ||
    normalized.startsWith("data:") ||
    normalized.startsWith("#")
  );
}

function bytesDigest(content: Buffer): string {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}
