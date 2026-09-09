import { useState } from "react";
import type { StoredAgentContextEntry } from "../contract/agent-context.js";
import { RichText } from "./rich-text.js";
import { Button } from "./ui/button.js";

export function PlanningSource({
  planId,
  source,
}: {
  readonly planId: string;
  readonly source: { readonly entryId: string; readonly label: string };
}) {
  const [entry, setEntry] = useState<StoredAgentContextEntry>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  async function load() {
    if (loading) return;
    setLoading(true);
    setError(false);
    try {
      const response = await fetch(
        `/api/plans/${encodeURIComponent(planId)}/agent-context/${encodeURIComponent(source.entryId)}`,
      );
      if (!response.ok) throw new Error("Source unavailable");
      setEntry((await response.json()) as StoredAgentContextEntry);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }
  return (
    <details
      className="planning-source"
      onToggle={(event) => {
        if (event.currentTarget.open && !entry && !loading) void load();
      }}
    >
      <summary>Source: {source.label}</summary>
      {loading ? <p role="status">Loading source...</p> : null}
      {error ? (
        <p role="alert">
          Source is unavailable.{" "}
          <Button variant="outline" size="sm" onClick={() => void load()}>
            Retry source
          </Button>
        </p>
      ) : null}
      {entry ? (
        <div className="planning-source-content">
          <p>
            Agent finding recorded {entry.createdAt}. This is the cited version;
            later findings may revise it.
          </p>
          <h3>{entry.title}</h3>
          <RichText text={entry.body} />
        </div>
      ) : null}
    </details>
  );
}
