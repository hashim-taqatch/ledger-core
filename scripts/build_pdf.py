import re
import sys

from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib.enums import TA_LEFT
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    ListFlowable,
    ListItem,
)

SRC = "architecture-source.md"
OUT = "architecture-and-tradeoffs.pdf"


def inline_markdown(text: str) -> str:
    text = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text)
    text = re.sub(r"(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)", r"<i>\1</i>", text)
    return text


def build_story():
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "DocTitle", parent=styles["Title"], fontSize=20, spaceAfter=4
    )
    subtitle_style = ParagraphStyle(
        "DocSubtitle",
        parent=styles["Normal"],
        fontSize=11,
        textColor="#555555",
        spaceAfter=18,
        fontName="Helvetica-Oblique",
    )
    h2_style = ParagraphStyle(
        "H2",
        parent=styles["Heading1"],
        fontSize=13.5,
        spaceBefore=13,
        spaceAfter=6,
        textColor="#1a1a1a",
    )
    body_style = ParagraphStyle(
        "Body",
        parent=styles["Normal"],
        fontSize=10,
        leading=13.6,
        spaceAfter=7,
        alignment=TA_LEFT,
    )
    bullet_style = ParagraphStyle(
        "Bullet",
        parent=body_style,
        spaceAfter=5,
    )

    with open(SRC, encoding="utf-8") as f:
        lines = f.read().splitlines()

    # Merge soft-wrapped source lines into logical blocks. A blank line, a
    # heading, or a new "- " bullet each start a fresh block; any other
    # non-blank line is a wrapped continuation of whatever block is
    # currently open (including an open bullet — markdown bullets in this
    # file wrap across several physical lines with no leading "- ").
    blocks = []
    current = []
    current_prefix = ""  # "" for plain paragraph, "- " for a bullet

    def flush_current():
        nonlocal current_prefix
        if current:
            blocks.append(current_prefix + " ".join(current))
            current.clear()
        current_prefix = ""

    for raw in lines:
        line = raw.rstrip()
        if line == "":
            flush_current()
            blocks.append("")
        elif line.startswith("# ") or line.startswith("## "):
            flush_current()
            blocks.append(line)
        elif line.startswith("- "):
            flush_current()
            current_prefix = "- "
            current.append(line[2:].strip())
        else:
            current.append(line.strip())
    flush_current()

    story = []
    bullet_buffer = []

    def flush_bullets():
        nonlocal bullet_buffer
        if bullet_buffer:
            items = [
                ListItem(Paragraph(inline_markdown(b), bullet_style), leftIndent=6)
                for b in bullet_buffer
            ]
            story.append(
                ListFlowable(
                    items,
                    bulletType="bullet",
                    start="•",
                    leftIndent=16,
                    bulletFontSize=8,
                    spaceAfter=10,
                )
            )
            bullet_buffer = []

    for block in blocks:
        if block.startswith("# "):
            flush_bullets()
            story.append(Paragraph(inline_markdown(block[2:].strip()), title_style))
        elif block.startswith("*") and block.endswith("*") and not block.startswith("**"):
            flush_bullets()
            story.append(Paragraph(block.strip("*").strip(), subtitle_style))
        elif block.startswith("## "):
            flush_bullets()
            story.append(Paragraph(inline_markdown(block[3:].strip()), h2_style))
        elif block.startswith("- "):
            bullet_buffer.append(block[2:].strip())
        elif block.strip() == "":
            flush_bullets()
        else:
            flush_bullets()
            story.append(Paragraph(inline_markdown(block.strip()), body_style))

    flush_bullets()
    return story


def main():
    doc = SimpleDocTemplate(
        OUT,
        pagesize=LETTER,
        leftMargin=0.85 * inch,
        rightMargin=0.85 * inch,
        topMargin=0.75 * inch,
        bottomMargin=0.75 * inch,
        title="Architecture & Trade-offs",
        author="ledger-core",
    )
    story = build_story()
    doc.build(story)
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
