# Modo: docx-pdf — Tailored CV using the candidate's own .docx template

**DEFAULT FOR THIS CANDIDATE.** When generating a tailored CV, use THIS workflow instead of the HTML template in `modes/pdf.md`. The HTML flow is a fallback only.

## Why this mode exists

The candidate has their own Word resume template with fonts, spacing, and layout they want preserved. The docx pipeline edits a copy of that template in place so submissions look like the candidate's own resume — not a generic template.

## Hard rules (non-negotiable)

1. **Strict 2-page cap.** The Python builder validates page count via `pypdf` after Word converts the docx to PDF, and aborts with `🚨 HARD STOP` if > 2 pages. If the build fails, trim bullet *text* (shorter wording) — do NOT drop bullets.
2. **Keep all bullets.** Master resume has ~33 bullets (Fifth Third 10, Optum 7, Goldman 6, Gainwell 5, Pitney 5). Preserve every bullet; rewrite wording to hit JD keywords. The 2-page cap is a ceiling, not a content target — fill page 2.
3. **Never invent skills.** Only rephrase real experience with JD vocabulary.

## Pipeline

### Step 0 — Fast tool-check with candidate (MANDATORY, but keep it short)

**Before drafting the JSON, show the candidate a simple tool-check table and wait for their reply.**

Format: a markdown table listing every distinct tool, framework, or technology pulled from the JD's required + preferred sections. One row per tool. One column: "Worked with it? (y/n + one line if you want it highlighted)". Example:

| JD tool/tech | Worked with it? |
|---|---|
| Apache Spark | |
| Scala | |
| Starburst | |
| Parquet / Avro / ORC | |
| Data lakes / ETL | |
| Banking domain | |
| Agile delivery | |

**Rules:**
- One question, one table, that's it.
- Don't ask about client vs employer, role framing, or domain emphasis unless the candidate raises it.
- If the candidate replies `y` for a tool → blend it into existing bullets (Category A treatment).
- If the candidate replies `n` or skips → omit from resume, do not hedge, do not fabricate.
- If the candidate gives extra detail (e.g., "Scala at Gainwell, 6 months of UDFs") → use their exact phrasing.

Only AFTER the candidate replies do you proceed to Step 1.

### Step 1 — Read sources
- `cv.md` (master content reference)
- `config/profile.yml` (candidate details, comp, visa)
- `modes/_profile.md` (archetypes, framing, skills priority)
- The JD (from arguments or a file path)

### Step 2 — Identify 15–20 JD keywords
Pull exact vocabulary from the JD: product names (Microsoft Fabric, Snowflake), frameworks (dbt, Airflow), action verbs (ingest, transform, standardize), business domains (insurance, healthcare, banking), soft requirements (data quality, governance, stakeholder partnership).

### Step 3 — Write tailored content

Produce a **JSON file** at `/tmp/tailored-<company_slug>-content.json` with this schema:

```json
{
  "company_slug": "<company-slug-kebab-case>",
  "summary": "3–4 sentence summary leading with the JD's strongest keyword; include exit_story bridge and location/relocation + visa cert language if relevant.",
  "bullets": {
    "fifth_third": ["bullet 1", "bullet 2", "... 10 total ..."],
    "optum":       ["... 7 total ..."],
    "goldman":     ["... 6 total ..."],
    "gainwell":    ["... 5 total ..."],
    "pitney":      ["... 5 total ..."]
  }
}
```

**Bullet-tailoring guidance:**
- Lead-off bullet per role should hit the strongest JD keyword relevant to that role.
- For Optum: Microsoft Fabric Lakehouse is usually the top keyword (directly on CV).
- For Fifth Third: dbt + Snowflake + AWS + Federal Reserve reporting.
- For Pitney Bowes: if JD mentions internal tools / UI / forms, surface "Python (Django/Flask) internal tools" on bullet #5.
- Each bullet ≤ 220 characters ideally (to preserve page-length budget).
- Keep metrics: "5M+ records", "~40%", "1M+ daily", etc.

### Step 4 — Run the builder

```bash
python3 build_tailored_docx.py --content /tmp/tailored-<company_slug>-content.json
```

This:
1. Reads the JSON.
2. Loads the master `.docx` from the path configured via the `RESUME_SRC_DOCX` env variable or the `resume.source_docx` field in `config/profile.yml`.
3. Replaces summary + bullets paragraph-by-paragraph, preserving all formatting.
4. Saves `output/<company_slug>/{candidate-slug}.docx` (per-company subfolder, simple filename since the folder IS the company context).
5. Drives Microsoft Word via AppleScript to export `output/<company_slug>/{candidate-slug}.pdf`.
6. Validates page count with `pypdf`. **Aborts with `🚨 HARD STOP` if > 2 pages.**
7. **File naming convention (STRICT):**
   - CV: `output/<company_slug>/{candidate-slug}.docx` + `{candidate-slug}.pdf`
   - Cover letter: `output/<company_slug>/cover-letter.docx` — NEVER `.md`. Job applications do not accept markdown files. Write the cover letter text as `.md` to `/tmp/` first, then convert using `python3 md_to_docx.py /tmp/cover-letter.md <company_slug>/cover-letter.docx`.
   - Email (for recruiter outreach): `output/<company_slug>/email.txt` — plain text, paste into Gmail.
   - Company/date is encoded in the folder name; do NOT repeat it in filenames.

### Step 5 — Handle overflow

If the builder aborts with `HARD STOP` (3+ pages):

1. Identify the 3–5 **longest** bullets in the JSON (char count).
2. Condense each by 20–40% — drop filler words, collapse parallel clauses, remove trailing adjectives.
3. Rewrite JSON file. Re-run the builder.
4. Repeat until 2 pages.

**Never drop a bullet** to fix overflow. Shorten text instead.

### Step 6 — Report

Output to the user:
- Path to `.docx` (editable)
- Path to `.pdf` (submission-ready)
- Page count confirmation (must be 2)
- Top JD keywords covered (list of 10+)

## Cover letter

When generating the PDF, also write a cover letter at `output/cover-letter-<company_slug>-<YYYY-MM-DD>.md` with 3 paragraphs:
1. Hook: strongest JD-CV match in 2 sentences.
2. Why this company: their domain/stack + the candidate's transferable experience.
3. Close: location/visa/cert readiness + invite to conversation.

## Fallback

If `python3` / `pypdf` / Microsoft Word fails, fall back to `modes/pdf.md` (HTML template). Warn the user explicitly and do not claim the output matches their template.
