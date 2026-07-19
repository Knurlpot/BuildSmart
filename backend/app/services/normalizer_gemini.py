import os
import time
from pathlib import Path

from dotenv import load_dotenv
from google import genai
from google.genai import types
from tenacity import RetryError, retry, stop_after_attempt, wait_exponential

from app.schemas.normalization import MaterialMatch
from app.services.normalizer_mock import ItemCandidate

# .env lives at the repo root (shared with the Next.js frontend), one level up from backend/.
load_dotenv(Path(__file__).resolve().parents[3] / ".env")

# gemini-2.0-flash (0 free-tier quota on this project) and gemini-2.5-flash
# ("no longer available to new users") are both dead ends as of this writing —
# confirmed via direct API calls, not assumed. gemini-flash-latest is Google's
# rolling alias to its current recommended flash model and is what actually works.
MODEL = "gemini-flash-latest"

# Hard cap on how many candidates get embedded in the prompt. The full `items`
# table could be thousands of rows — dumping all of it in would blow up token
# cost/latency for no benefit once the catalog grows. 50 is a conservative
# safety cap, not a smart shortlist (e.g. pre-filtering by category or cheap
# string similarity before calling Gemini) — that's future work if the catalog
# outgrows this in practice.
MAX_CANDIDATES_IN_PROMPT = 50

# A live batch run hit 429s after ~6 rapid sequential calls (normalize_pricelist
# processes rows back-to-back with no pacing). This project's exact free-tier
# RPM isn't published anywhere I could confirm, so 4s is a conservative guess
# at safe spacing, not a number derived from official docs — revisit if 429s
# still occur, or once the actual quota tier is known.
MIN_SECONDS_BETWEEN_CALLS = 4.0

_client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
_last_call_at = 0.0

CATEGORY_TYPES = (
    "Structural",
    "Architectural",
    "Electrical",
    "Mechanical",
    "Plumbing",
    "Finishing",
    "Hardware",
    "Others",
)


@retry(wait=wait_exponential(multiplier=1, min=1, max=10), stop=stop_after_attempt(3))
def _call_gemini_once(prompt: str) -> MaterialMatch:
    response = _client.models.generate_content(
        model=MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=MaterialMatch,
        ),
    )
    return response.parsed


def _call_gemini(prompt: str) -> MaterialMatch:
    global _last_call_at
    elapsed = time.monotonic() - _last_call_at
    if elapsed < MIN_SECONDS_BETWEEN_CALLS:
        time.sleep(MIN_SECONDS_BETWEEN_CALLS - elapsed)

    try:
        return _call_gemini_once(prompt)
    except RetryError as exc:
        # RetryError wraps a concurrent.futures.Future, which Celery can't
        # pickle to report through its result backend (surfaces as an opaque
        # UnpickleableExceptionWrapper instead of the real cause). Re-raise a
        # plain, picklable exception with the underlying error's message.
        underlying = exc.last_attempt.exception()
        raise RuntimeError(f"Gemini normalization failed after retries: {underlying}") from None
    finally:
        _last_call_at = time.monotonic()


def _build_prompt(raw_name: str, raw_unit: str, candidates: list[ItemCandidate]) -> str:
    shortlist = candidates[:MAX_CANDIDATES_IN_PROMPT]
    candidate_lines = "\n".join(
        f"- item_code={c['item_code']}: \"{c['item_name']}\" "
        f"(material={c['material']}, brand={c['brand']}, unit={c['unit']}, category={c['category_type']})"
        for c in shortlist
    )

    return f"""You are matching a raw construction material price-list row against an existing item catalog.

Raw row: name="{raw_name}", unit="{raw_unit}"

Candidate catalog items:
{candidate_lines}

Match the raw row to the single best candidate by item_code if it clearly refers to the same
material, allowing for typos, abbreviations, and unit variants (e.g. "pc" vs a length unit,
"gal" vs "gallon"). If no candidate is a good match, set is_new_item=true, matched_item_code=null,
and fill category_type/material/brand/unit/item_name with your best classification of the raw row.

category_type must be exactly one of: {", ".join(CATEGORY_TYPES)}.
confidence must be a number between 0 and 1, reflecting how confident you are in the match
(or in the classification, if you judged it a new item).
"""


def normalize_material_gemini(
    raw_name: str,
    raw_unit: str,
    candidates: list[ItemCandidate],
) -> MaterialMatch:
    if not candidates:
        raise ValueError("candidates must not be empty")

    prompt = _build_prompt(raw_name, raw_unit, candidates)
    return _call_gemini(prompt)
