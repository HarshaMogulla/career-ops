#!/usr/bin/env python3
"""
Generic tailored-docx builder.

Reads a JSON content spec and produces <company>-tailored .docx + .pdf
using the user's master .docx template (via tailor_docx.tailor()).

Usage:
    python3 build_tailored_docx.py --content /tmp/higginbotham-content.json
    python3 build_tailored_docx.py --content /tmp/x.json --out output

JSON schema:
    {
      "company_slug": "higginbotham",
      "summary": "...",
      "bullets": {
        "fifth_third": ["bullet 1", "bullet 2", ...],
        "optum":       ["bullet 1", ...],
        "goldman":     ["bullet 1", ...],
        "gainwell":    ["bullet 1", ...],
        "pitney":      ["bullet 1", ...]
      },
      "skills_override": {                   # optional
        "Programming Languages: ": "Programming Languages: Python, SQL, ..."
      }
    }

Exits non-zero if the PDF spills past 2 pages (the tailor() function enforces this).
"""
import argparse
import json
import sys
from pathlib import Path

from tailor_docx import tailor


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--content", required=True, help="Path to JSON content spec")
    parser.add_argument("--out", default=None, help="Output directory (default: ./output)")
    args = parser.parse_args()

    content = json.loads(Path(args.content).read_text())

    required = {"company_slug", "summary", "bullets"}
    missing = required - set(content)
    if missing:
        sys.exit(f"❌ Missing required keys in JSON: {missing}")

    expected_jobs = {"fifth_third", "optum", "goldman", "gainwell", "pitney"}
    missing_jobs = expected_jobs - set(content["bullets"])
    if missing_jobs:
        sys.exit(f"❌ bullets missing for: {missing_jobs}")

    out_dir = Path(args.out) if args.out else Path(__file__).parent / "output"

    tailor(
        company_slug=content["company_slug"],
        out_dir=out_dir,
        summary=content["summary"],
        bullets=content["bullets"],
        skills_override=content.get("skills_override"),
    )


if __name__ == "__main__":
    main()
