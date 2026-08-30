#!/usr/bin/env python3
"""
Extract full text content from the Word quotation template
(RAW/AAAM Series Australian Sale Template02 (1).doc / .docx) and dump it
to a plain-text file with red-colored runs marked as <<RED:...>>, so the
resulting content-blocks.json can be built/reviewed against the source.

Usage:
    python3 scripts/extract-content-blocks.py [source.docx] [out.txt]

Requires: python-docx (pip install python-docx)

Note: the source is an old binary .doc. Convert it to .docx first with:
    libreoffice --headless --convert-to docx --outdir RAW "RAW/AAAM Series Australian Sale Template02 (1).doc"
(A pre-converted .docx already exists at
 RAW/AAAM Series Australian Sale Template02 (1).docx in this repo.)
"""
import sys
import docx
from docx.oxml.ns import qn

# Hex colors treated as "red" (variable placeholder) text in the template.
RED_HEXES = {"FF0000", "E00000", "C00000", "FF0100", "ED1C24"}


def run_is_red(run):
    try:
        color = run.font.color
        if color is not None and color.type is not None and color.rgb is not None:
            hexv = str(color.rgb).upper()
            if hexv in RED_HEXES:
                return True
            if len(hexv) == 6:
                r, g, b = int(hexv[0:2], 16), int(hexv[2:4], 16), int(hexv[4:6], 16)
                if r > 150 and g < 90 and b < 90:
                    return True
    except Exception:
        pass
    return False


def render_para(p, idx=None):
    parts = []
    for run in p.runs:
        t = run.text
        if t == "":
            continue
        if run_is_red(run):
            parts.append(f"<<RED:{t}>>")
        else:
            parts.append(t)
    text = "".join(parts)
    style = p.style.name if p.style else ""
    prefix = f"[P{idx}|{style}] " if idx is not None else ""
    return prefix + text


def iter_block_items(parent):
    """Yield paragraphs and tables from the document body, in document order."""
    from docx.document import Document as _Document
    from docx.table import Table
    from docx.text.paragraph import Paragraph

    if isinstance(parent, _Document):
        parent_elm = parent.element.body
    else:
        parent_elm = parent._tc
    for child in parent_elm.iterchildren():
        if child.tag == qn("w:p"):
            yield Paragraph(child, parent)
        elif child.tag == qn("w:tbl"):
            yield Table(child, parent)


def dump(path, out_path):
    d = docx.Document(path)
    lines = []
    idx = 0
    for block in iter_block_items(d):
        if block.__class__.__name__ == "Paragraph":
            lines.append(render_para(block, idx))
            idx += 1
        else:
            lines.append(f"[TABLE {len(block.rows)}x{len(block.columns)}]")
            for r_i, row in enumerate(block.rows):
                cells = []
                for cell in row.cells:
                    cell_txt = [render_para(p) for p in cell.paragraphs]
                    cells.append(" / ".join([c for c in cell_txt if c]))
                lines.append(f"  ROW{r_i}: " + " || ".join(cells))
            lines.append("[/TABLE]")
    with open(out_path, "w") as f:
        f.write("\n".join(lines))
    print(f"Wrote {len(lines)} lines to {out_path}")


if __name__ == "__main__":
    src = sys.argv[1] if len(sys.argv) > 1 else "RAW/AAAM Series Australian Sale Template02 (1).docx"
    out = sys.argv[2] if len(sys.argv) > 2 else "/tmp/docdump.txt"
    dump(src, out)
