interface RichTextProps {
  readonly text: string;
}

export function RichText({ text }: RichTextProps) {
  const blocks = text.split(/\n{2,}/);
  return (
    <div className="rich-text">
      {blocks.map((block, index) => {
        const lines = block.split("\n");
        if (lines.every((line) => /^[-*] /.test(line))) {
          return (
            <ul key={index}>
              {lines.map((line) => (
                <li key={line}>{line.slice(2)}</li>
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
