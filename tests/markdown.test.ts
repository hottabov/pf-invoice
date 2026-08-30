import { describe, it, expect } from "vitest";
import { renderMarkdown } from "../src/lib/markdown";

// Pure module — no @/lib/db import, so this never needs DATABASE_URL set
// (same reasoning as tests/sheet-data.test.ts).

describe("renderMarkdown — escaping", () => {
  it("escapes raw HTML/script tags instead of passing them through", () => {
    const html = renderMarkdown("<script>alert(1)</script>");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("escapes ampersands and quotes", () => {
    const html = renderMarkdown(`Tom & Jerry's "great" day`);
    expect(html).toContain("Tom &amp; Jerry&#39;s &quot;great&quot; day");
  });

  it("escapes an <img onerror=...> XSS payload instead of leaving it as a live tag", () => {
    const html = renderMarkdown(`<img src=x onerror="alert(1)">`);
    // The whole tag is neutralized to inert text — no live "<img" element
    // and no live '="' attribute boundary an HTML parser could act on.
    expect(html).not.toContain("<img");
    expect(html).not.toMatch(/onerror\s*=\s*"/);
    expect(html).toBe("<p>&lt;img src=x onerror=&quot;alert(1)&quot;&gt;</p>");
  });

  it("escaping runs before the inline bold/italic transform, so markers can't re-open a tag", () => {
    // If escaping ran second (or not at all before the inline transform),
    // "*<img onerror=x>*" would let the emphasis wrapper sit around a live
    // tag. Escaping first means the transform only ever sees "&lt;...&gt;"
    // text to wrap in <em>, never a real "<".
    const html = renderMarkdown(`*<img onerror=alert(1)>*`);
    expect(html).toBe("<p><em>&lt;img onerror=alert(1)&gt;</em></p>");
  });

  it("never unescapes entities via the bold/italic regex (no raw '<', '>', '&' reappears)", () => {
    const html = renderMarkdown(`**<b>&amp;</b>**`);
    expect(html).not.toMatch(/<b>|<\/b>/);
    // The literal ampersand-entity text passes through inline transforms
    // unchanged — only wrapped in <strong>, never decoded back to "&".
    expect(html).toContain("<strong>&lt;b&gt;&amp;amp;&lt;/b&gt;</strong>");
  });
});

describe("renderMarkdown — inline emphasis", () => {
  it("renders **bold** as <strong>", () => {
    expect(renderMarkdown("This is **bold** text.")).toBe("<p>This is <strong>bold</strong> text.</p>");
  });

  it("renders *italic* as <em>", () => {
    expect(renderMarkdown("This is *italic* text.")).toBe("<p>This is <em>italic</em> text.</p>");
  });

  it("renders bold and italic together in one line", () => {
    expect(renderMarkdown("**bold** and *italic*")).toBe("<p><strong>bold</strong> and <em>italic</em></p>");
  });
});

describe("renderMarkdown — headings", () => {
  it("renders #, ##, ### as h1/h2/h3", () => {
    const html = renderMarkdown("# Title\n\n## Subtitle\n\n### Section");
    expect(html).toBe("<h1>Title</h1>\n<h2>Subtitle</h2>\n<h3>Section</h3>");
  });

  it("applies inline emphasis inside headings", () => {
    expect(renderMarkdown("## **Bold** Heading")).toBe("<h2><strong>Bold</strong> Heading</h2>");
  });
});

describe("renderMarkdown — lists", () => {
  it("renders a flat bullet list", () => {
    const html = renderMarkdown("- Item one\n- Item two\n- Item three");
    expect(html).toBe("<ul><li>Item one</li><li>Item two</li><li>Item three</li></ul>");
  });

  it("renders one level of nesting from indentation", () => {
    const html = renderMarkdown("- Parent one\n  - Child one\n  - Child two\n- Parent two");
    expect(html).toBe(
      "<ul><li>Parent one<ul><li>Child one</li><li>Child two</li></ul></li><li>Parent two</li></ul>"
    );
  });
});

describe("renderMarkdown — multi-paragraph and line breaks", () => {
  it("separates blank-line-delimited text into distinct <p> blocks", () => {
    const html = renderMarkdown("Paragraph one.\n\nParagraph two.");
    expect(html).toBe("<p>Paragraph one.</p>\n<p>Paragraph two.</p>");
  });

  it("joins single line breaks within a paragraph with <br>", () => {
    const html = renderMarkdown("Line one.\nLine two.");
    expect(html).toBe("<p>Line one.<br>Line two.</p>");
  });

  it("handles a realistic multi-block machine body", () => {
    const md =
      "## Pathfinder M{{model}} Cutting System\n\nModel M{{model}} system.\n\n- Conveyorised table\n- Vacuum VSD\n\n**Price: {{price}}**";
    const html = renderMarkdown(md);
    expect(html).toContain("<h2>Pathfinder M{{model}} Cutting System</h2>");
    expect(html).toContain("<p>Model M{{model}} system.</p>");
    expect(html).toContain("<ul><li>Conveyorised table</li><li>Vacuum VSD</li></ul>");
    expect(html).toContain("<p><strong>Price: {{price}}</strong></p>");
  });
});
