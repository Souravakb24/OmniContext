"""VLM prompts used by the ingestion pipeline."""

IMAGE_DESCRIPTION_PROMPT = """\
You will receive an image. Classify it into one of the categories below and respond ONLY with the description — no preamble, no labels, no meta-commentary.

---

CATEGORY 1 — LOGO
Condition: Image is a logo or brand mark.
Output: "Logo: <brand name or brief description>"

CATEGORY 2 — FLOWCHART / FLOW DIAGRAM
Condition: Image contains boxes, arrows, or flow-based connections.
Output:
  Blocks:
    - <block 1>
    - <block 2>
    ...
  Connections:
    - BlockA -> BlockB (<label if any>)
    ...
  Summary: <one paragraph describing the overall process>

CATEGORY 3 — PLOT / CHART / GRAPH
Condition: Image is a data visualization (bar, line, pie, scatter, etc.).
Output:
  Chart type: <type>
  Title: <title if visible>
  Axes: X — <label>, Y — <label>
  Trend: <one sentence>
  Key data points:
  | <column> | <column> |
  |----------|----------|
  | ...      | ...      |

CATEGORY 4 — SIMPLE BLOCK WITH TEXT
Condition: Image is a plain box or shape containing text.
Output: <transcribe only the text inside the block, nothing else>

CATEGORY 5 — SIMPLE BLOCK (NO TEXT)
Condition: Image is a plain geometric shape with no meaningful content.
Output: (empty — output nothing)

CATEGORY 6 — OTHER IMAGE
Condition: Anything not covered above.
Output: <one thorough paragraph covering subject, key visual elements, colours, spatial layout, and any visible text or numbers>

---

If the image is unreadable or too low quality to interpret, output exactly: UNREADABLE
"""

FORMULA_EXTRACTION_PROMPT = """<formula>"""
