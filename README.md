# Career-Ops — Personal Fork

Fork of [santifer/career-ops](https://github.com/santifer/career-ops) with additions focused on making the system immediately useful for one candidate, for any role, without losing the candidate's own resume design.

## What it does

For each job posting you feed it:

1. **Scores it** A–G against your profile (honest, rubric-based).
2. **Tailors your resume** — edits a copy of *your* Word `.docx` in place, preserving your exact fonts, spacing, and layout. No generic HTML templates.
3. **Drafts a cover letter** — flowing prose, saved as `.docx` (upload-ready).
4. **Logs everything** to a Markdown tracker that auto-exports to Excel.
5. **Scans job portals** (Greenhouse, Ashby, Lever, Workday) for new postings matching your title keywords.

Everything runs locally from your terminal via Claude Code, Gemini CLI, or OpenCode.

## What this fork adds beyond upstream

| Feature | What it is | Where |
|---|---|---|
| **.docx-based CV tailoring** | Edits your master Word resume instead of generating from HTML template | `tailor_docx.py`, `build_tailored_docx.py`, `modes/docx-pdf.md` |
| **Cover letter `.docx` converter** | Markdown → Word with bold/italic/line-break support | `md_to_docx.py` |
| **Excel tracker view** | Auto-generates `data/tracker.xlsx` with color-coded scores, Applications + Pipeline sheets | `export_tracker.py` |
| **Workday scan support** | Adds Workday JSON API to the zero-token scanner (covers most Fortune 500 / H-1B sponsors) | `scan.mjs` |
| **US-only location filter** | Optional `location_filter` in `portals.yml` — excludes India, EMEA, APAC listings | `portals.yml`, `scan.mjs` |
| **Per-company output folders** | `output/{company}/{your-name}.pdf`, `cover-letter.docx`, `email.txt` | `tailor_docx.py` |
| **2-page hard cap** | PyPDF validates every generated resume is exactly 2 pages; fails loudly otherwise | `tailor_docx.py` |
| **New `/career-ops-docx` slash command** | Gemini CLI command for the docx-based tailoring flow | `.gemini/commands/career-ops-docx.toml` |

## Who this is for

You, if you want:

- Honest scoring against every posting (save time on bad fits)
- Your own resume design preserved across every tailored version
- A cover letter you can actually upload to application portals
- An Excel view of your pipeline that opens in Numbers or Excel
- Zero Claude attribution in the public code (scripts read candidate identity from `config/profile.yml`)

## Quick start (30 minutes)

### 1. Prerequisites

- Node.js 18+, npm
- Python 3.10+
- Microsoft Word (for `.docx` → PDF conversion)
- A Google account (for free Gemini CLI) or Claude Code subscription

### 2. Fork & clone

Fork this repo on GitHub, then:

```bash
git clone https://github.com/<your-username>/career-ops.git
cd career-ops
```

### 3. Install dependencies

```bash
npm install
npx playwright install chromium

pip3 install python-docx docx2pdf pypdf openpyxl PyYAML
```

### 4. Install at least one AI CLI

- **Gemini CLI (free tier):** `npm i -g @google/gemini-cli` then run `gemini auth`
- **Claude Code:** `npm i -g @anthropic-ai/claude-code` (requires subscription or API key)
- **Playwright MCP (optional, enables scanning JS-heavy career pages):** `npm i -g @playwright/mcp`, then add to your CLI's MCP settings

### 5. Make it yours — three files to customize

#### a) `config/profile.yml`

```yaml
candidate:
  full_name: "Your Name"
  email: "you@example.com"
  phone: "+1-555-123-4567"
  linkedin: "linkedin.com/in/yourhandle"

target_roles:
  primary:
    - "Your Target Role"      # e.g. "Senior Data Engineer", "Software Engineer", "Product Manager"

resume:
  source_docx: "~/path/to/your/master-resume.docx"  # the .docx the tailor script edits in place
```

#### b) `portals.yml`

- Update `title_filter.positive` with keywords matching your target role
- Update `title_filter.negative` with stuff you want excluded (`Intern`, `Junior`, etc.)
- Update `tracked_companies` with the companies you care about (or remove the H-1B Workday list if you don't need it)

#### c) `modes/_profile.md`

Customize your career archetypes and framing. Instead of hand-editing, just tell your AI CLI:

> "Update `modes/_profile.md` to target Software Engineering roles instead of Data Engineering. Keep the rest of the structure."

The AI rewrites it for you.

### 6. Point the tailor script at your master resume

The contract it expects (see `tailor_docx.py` comments):

- Paragraph 5 = your summary (tailor rewrites this)
- Paragraphs 7–15 = skills (left mostly as-is)
- Paragraphs 17+ = per-job headers + bullets (tailor rewrites bullets)

If your resume structure differs, either reshape it to match, or tune the `JOB_RANGES` constants in `tailor_docx.py`.

### 7. Run it

```bash
cd career-ops
gemini           # or `claude`

# Inside the CLI:
/career-ops-docx https://example.com/some-job-url    # score + tailor in one shot
/career-ops-scan                                       # discover new jobs from portals.yml
/career-ops-tracker                                    # see your pipeline
```

You'll get:

```
output/{company-slug}/
├── {your-name}.pdf            # tailored resume, 2 pages, your template
├── {your-name}.docx           # editable version
└── cover-letter.docx          # upload-ready cover letter

reports/{###}-{company-slug}-{date}.md   # full A-G evaluation
data/applications.md                      # markdown tracker
data/tracker.xlsx                         # Excel view (auto-generated)
```

(Filename slug comes from `candidate.full_name` in `config/profile.yml` — e.g. "Jane Doe" → `jane-doe.pdf`.)

## Adapting to ANY target role

The system is role-agnostic. To re-target from, say, Data Engineer to Software Engineer:

1. Update `config/profile.yml` → `target_roles.primary`
2. Update `portals.yml` → `title_filter.positive` with your keywords
3. Tell the AI: *"Retarget `modes/_profile.md` for Software Engineering roles — rewrite archetypes and framing."*

No code changes needed. The AI reads and writes the same files it uses at runtime.

## Privacy

All personal content is gitignored:

- Your master CV (`cv.md`), profile (`config/profile.yml`), target companies (`portals.yml`), archetypes (`modes/_profile.md`)
- All tailored PDFs, cover letters, emails (`output/*`)
- Your application tracker (`data/applications.md`, `data/tracker.xlsx`)
- Evaluation reports (`reports/*.md`)
- Scan history and pipeline inbox
- API keys and `.env`

Safe to push this repo publicly — the code is generic, the data stays local.

## Credits

Upstream: [santifer/career-ops](https://github.com/santifer/career-ops) (MIT). The original architecture, evaluation framework, slash commands, and multi-language mode support all come from there.

This fork's additions focus on preserving the candidate's resume design through `.docx`-based tailoring plus the enterprise / H-1B-sponsor scanning features.

## License

MIT (inherited from upstream).
