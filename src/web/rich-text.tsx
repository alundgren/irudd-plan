interface RichTextProps {
  readonly text: string;
}

export function RichText({ text }: RichTextProps) {
  const blocks = text
    .split(/(^```[^\n]*\n[\s\S]*?^```[ \t]*(?:\n|$))/m)
    .flatMap((part) =>
      part.startsWith("```")
        ? [part]
        : part
            .replace(/^\n+|\n+$/g, "")
            .split(/\n{2,}/)
            .filter(Boolean),
    );
  return (
    <div className="rich-text">
      {blocks.map((block, index) => {
        const code = block.match(/^```([^\n]*)\n([\s\S]*?)^```[ \t]*(?:\n|$)/m);
        if (code)
          return (
            <pre key={index} aria-label={code[1]?.trim() || "Code"}>
              <code>{code[2]}</code>
            </pre>
          );
        const lines = block.split("\n");
        if (lines.every((line) => /^[-*] /.test(line))) {
          return (
            <ul key={index}>
              {lines.map((line, lineIndex) => (
                <li key={lineIndex}>{line.slice(2)}</li>
              ))}
            </ul>
          );
        }
        if (lines.length === 1 && /^#{1,3} /.test(block)) {
          return <h4 key={index}>{block.replace(/^#{1,3} /, "")}</h4>;
        }
        return <p key={index}>{lines.join("\n")}</p>;
      })}
    </div>
  );
}
