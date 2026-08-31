import { describe, it, expect } from "vitest";
import {
  applyMarkdownEdit,
  wrapSelection,
  insertHeading,
  insertBulletList,
  insertPlaceholderToken,
} from "../src/lib/markdown-editor";

describe("wrapSelection", () => {
  it("wraps a non-empty selection and collapses the caret after it", () => {
    const value = "hello world";
    const edit = wrapSelection(value, 0, 5, "**");
    expect(applyMarkdownEdit(value, edit)).toBe("**hello** world");
    expect(edit.caretStart).toBe(9);
    expect(edit.caretEnd).toBe(9);
  });

  it("inserts an empty pair and places the caret between the markers for a collapsed selection", () => {
    const value = "hello world";
    const edit = wrapSelection(value, 5, 5, "*");
    expect(applyMarkdownEdit(value, edit)).toBe("hello** world");
    expect(edit.caretStart).toBe(6);
    expect(edit.caretEnd).toBe(6);
  });

  it("wraps italic markers around a selection", () => {
    const value = "abc";
    const edit = wrapSelection(value, 0, 3, "*");
    expect(applyMarkdownEdit(value, edit)).toBe("*abc*");
  });
});

describe("insertHeading", () => {
  it("prefixes the caret's line with the heading marker", () => {
    const value = "Some title\nBody text";
    const edit = insertHeading(value, 3, 3, 1);
    expect(applyMarkdownEdit(value, edit)).toBe("# Some title\nBody text");
  });

  it("replaces an existing heading prefix with the new level", () => {
    const value = "# Some title\nBody";
    const edit = insertHeading(value, 5, 5, 2);
    expect(applyMarkdownEdit(value, edit)).toBe("## Some title\nBody");
  });

  it("toggles the same level off when applied twice", () => {
    const value = "## Some title\nBody";
    const edit = insertHeading(value, 5, 5, 2);
    expect(applyMarkdownEdit(value, edit)).toBe("Some title\nBody");
  });

  it("only touches the line the caret is on, not other lines", () => {
    const value = "First line\nSecond line\nThird line";
    const secondLineStart = value.indexOf("Second");
    const edit = insertHeading(value, secondLineStart + 2, secondLineStart + 2, 3);
    expect(applyMarkdownEdit(value, edit)).toBe("First line\n### Second line\nThird line");
  });
});

describe("insertBulletList", () => {
  it("prefixes the caret's line with a bullet for a collapsed selection", () => {
    const value = "Item one\nItem two";
    const edit = insertBulletList(value, 0, 0);
    expect(applyMarkdownEdit(value, edit)).toBe("- Item one\nItem two");
  });

  it("prefixes every line spanned by a multi-line selection", () => {
    const value = "Item one\nItem two\nItem three";
    const end = value.length; // spans all three lines
    const edit = insertBulletList(value, 0, end);
    expect(applyMarkdownEdit(value, edit)).toBe("- Item one\n- Item two\n- Item three");
  });

  it("toggles bullets off when every touched line is already bulleted", () => {
    const value = "- Item one\n- Item two";
    const edit = insertBulletList(value, 0, value.length);
    expect(applyMarkdownEdit(value, edit)).toBe("Item one\nItem two");
  });

  it("leaves an already-bulleted line alone when adding bullets to a mixed selection", () => {
    const value = "- Item one\nItem two";
    const edit = insertBulletList(value, 0, value.length);
    expect(applyMarkdownEdit(value, edit)).toBe("- Item one\n- Item two");
  });
});

describe("insertPlaceholderToken", () => {
  it("inserts a {{token}} at the cursor and places the caret after it", () => {
    const value = "Dear customer,";
    const edit = insertPlaceholderToken(value, 5, 5, "clientName");
    expect(applyMarkdownEdit(value, edit)).toBe("Dear {{clientName}}customer,");
    expect(edit.caretStart).toBe(19);
  });

  it("replaces a selection with the placeholder token", () => {
    const value = "Dear NAME,";
    const start = value.indexOf("NAME");
    const end = start + "NAME".length;
    const edit = insertPlaceholderToken(value, start, end, "clientName");
    expect(applyMarkdownEdit(value, edit)).toBe("Dear {{clientName}},");
  });
});
