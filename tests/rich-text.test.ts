import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vite-plus/test";
import { RichText } from "../src/web/rich-text.js";

it("preserves blank lines and literal markup in fenced file examples", () => {
  const html = renderToStaticMarkup(
    createElement(RichText, {
      text: "# Example\n\n```reviewer.md\n# Reviewer\n\n  <script>alert('example')</script>\n```\n\nCompare this file.",
    }),
  );
  expect(html).toContain(
    '<pre aria-label="reviewer.md"><code># Reviewer\n\n  &lt;script&gt;',
  );
  expect(html).not.toContain("<script>");
  expect(html).toContain("<p>Compare this file.</p>");
});
