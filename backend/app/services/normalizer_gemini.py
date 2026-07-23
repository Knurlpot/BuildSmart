import os
import re
import time
from pathlib import Path

from dotenv import load_dotenv
from google import genai
from google.genai import types
from google.genai.errors import APIError
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

# gemini-flash-latest is a rolling alias — it moved from gemini-3.5-flash
# (20 requests/DAY free tier) to gemini-3.6-flash (5 requests/MINUTE free
# tier) within two days of each other, with no warning, and each has a
# different real limit. A hardcoded static pacing number keeps breaking as the
# underlying model silently changes, so this widens itself automatically using
# the server's own reported retryDelay whenever a 429 actually occurs — see
# _retry_delay_seconds() and its use in _call_gemini() below. Starting point
# (13s) reflects the 5-req/min limit actually observed against gemini-3.6-flash
# just now, not a guess — a whole batch fails atomically on the first
# unrecoverable row (normalize_pricelist has no per-row error handling), so
# starting under-conservative would likely fail the very next upload before
# the adaptive logic got a chance to learn from it.
_min_interval = 13.0
_last_call_at = 0.0

_client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])

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


def _retry_delay_seconds(exc: BaseException | None) -> float | None:
    """Pull the server's own suggested wait time out of a 429's structured
    detail (a google.rpc.RetryInfo entry), if present. Trusting this instead of
    guessing a fixed backoff means we automatically adapt to whatever the
    current model behind gemini-flash-latest actually enforces."""
    if not isinstance(exc, APIError) or not isinstance(exc.details, dict):
        return None
    for detail in exc.details.get("error", {}).get("details", []):
        if str(detail.get("@type", "")).endswith("RetryInfo"):
            match = re.match(r"([\d.]+)s?$", str(detail.get("retryDelay", "")))
            if match:
                return float(match.group(1))
    return None


def _wait_for_gemini(retry_state):
    exc = retry_state.outcome.exception() if retry_state.outcome else None
    delay = _retry_delay_seconds(exc)
    if delay is not None:
        return delay + 1  # small buffer over what the server asked for
    return wait_exponential(multiplier=1, min=1, max=10)(retry_state)


@retry(wait=_wait_for_gemini, stop=stop_after_attempt(4))
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
    global _last_call_at, _min_interval
    elapsed = time.monotonic() - _last_call_at
    if elapsed < _min_interval:
        time.sleep(_min_interval - elapsed)

    try:
        return _call_gemini_once(prompt)
    except RetryError as exc:
        # RetryError wraps a concurrent.futures.Future, which Celery can't
        # pickle to report through its result backend (surfaces as an opaque
        # UnpickleableExceptionWrapper instead of the real cause). Re-raise a
        # plain, picklable exception with the underlying error's message.
        underlying = exc.last_attempt.exception()

        # Learn from the failure: widen future spacing to whatever the server
        # actually asked for, so subsequent calls in this process don't repeat
        # the same mistake against whatever model version is live right now.
        delay = _retry_delay_seconds(underlying)
        if delay is not None:
            _min_interval = max(_min_interval, delay + 1)

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
