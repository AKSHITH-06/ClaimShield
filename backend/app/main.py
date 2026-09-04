"""
ClaimShield backend — hackathon MVP.

Run with: uvicorn app.main:app --reload --port 8000

Docs: http://localhost:8000/docs

Endpoints map directly to the demo flow:
  POST /extract          -> upload text, get case fingerprint
  POST /similar-cases    -> fingerprint in, ranked matches out
  POST /case-intelligence -> why won/lost + evidence gap + counterarguments for one match
  POST /appeal           -> generate the grievance letter + action plan
  GET  /corpus           -> debug: dump the loaded case corpus
"""

import json
import logging
import os
import re
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from openai import OpenAI

from app.core.schema import (
    AssessmentVerdict,
    CaseAssessment,
    CaseFingerprint,
    CaseIntelligence,
    ErrorResponse,
    GroundingReport,
    RejectionCategory,
    SimilarCaseMatch,
)
from app.core.similarity import find_similar_cases
from app.core.retrieval import HybridIndex
from app.core import grounding
from app.core import prompts

# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("claimshield")

# Load .env file if present (local dev)
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

FEATHERLESS_API_KEY = os.environ.get("FEATHERLESS_API_KEY", "")
if not FEATHERLESS_API_KEY:
    logger.warning(
        "FEATHERLESS_API_KEY is not set. LLM endpoints will fail. "
        "Set it in .env (copy from .env.example) and get a key at https://featherless.ai/"
    )
elif FEATHERLESS_API_KEY == "your_key_here":
    logger.error(
        "FEATHERLESS_API_KEY is still the placeholder from .env.example. Something overwrote "
        "your .env — note that `cp .env.example .env` and `git checkout` of a branch that "
        "tracks .env will both clobber it. Prefer: export FEATHERLESS_API_KEY=..."
    )
else:
    # Log only the last 4 chars, so a silently swapped key is visible without printing it.
    logger.info(f"Featherless key loaded (ends ...{FEATHERLESS_API_KEY[-4:]}).")

# Featherless is OpenAI-compatible — just point to their base URL
client = OpenAI(
    api_key=FEATHERLESS_API_KEY or "no-key-set",
    base_url="https://api.featherless.ai/v1",
)
# Best open model for structured JSON extraction tasks
MODEL = "unsloth/Llama-3.3-70B-Instruct"

DATA_PATH = Path(__file__).parent / "data" / "cases.json"

# ---------------------------------------------------------------------------
# Corpus loading
# ---------------------------------------------------------------------------

def load_corpus() -> list[CaseFingerprint]:
    raw = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    return [CaseFingerprint(**c) for c in raw]


CORPUS = load_corpus()
CORPUS_INDEX: dict[str, CaseFingerprint] = {c.id: c for c in CORPUS}
logger.info(f"Loaded {len(CORPUS)} cases from corpus.")

# Lexical + semantic tiers are built once here. Either can fail to load without taking the
# service down — find_similar_cases redistributes the weight and reports the tier inactive.
RETRIEVAL_INDEX = HybridIndex(CORPUS)
logger.info(f"Retrieval tiers active: {RETRIEVAL_INDEX.signals}")

# ---------------------------------------------------------------------------
# App + CORS
# ---------------------------------------------------------------------------

app = FastAPI(
    title="ClaimShield API",
    description=(
        "Health insurance claim analysis backend. "
        "Extracts claim facts, finds similar cases, explains outcomes, and drafts appeals."
    ),
    version="1.0.0",
)

# CORS — open for hackathon local dev (Person C running on any port/device)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten after demo
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc: RequestValidationError):
    """
    Global exception handler for Pydantic validation errors.
    Reshapes default FastAPI 422 errors into Person C's agreed error contract:
    {"error": "validation_failed", "message": "<human readable message>"}
    """
    errors = exc.errors()
    messages = []
    for err in errors:
        loc_parts = [str(l) for l in err.get("loc", []) if l != "body"]
        loc = " -> ".join(loc_parts)
        msg = err.get("msg", "Invalid value")
        messages.append(f"{loc}: {msg}" if loc else msg)
    human_message = "; ".join(messages) or "Validation failed for input data."
    return JSONResponse(
        status_code=422,
        content={"error": "validation_failed", "message": human_message},
    )

# ---------------------------------------------------------------------------
# LLM helper
# ---------------------------------------------------------------------------

def call_llm_json(system: str, user: str) -> dict:
    """
    Call Featherless (OpenAI-compatible) and parse the response as JSON.
    Raises json.JSONDecodeError if parsing fails — callers must handle this.
    """
    resp = client.chat.completions.create(
        model=MODEL,
        max_tokens=2000,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    )
    text = resp.choices[0].message.content or ""
    text = text.strip()
    # Strip ```json ... ``` fences if the model disobeys instructions
    if text.startswith("```"):
        text = re.sub(r"^```[a-z]*\n?", "", text)
        text = re.sub(r"\n?```$", "", text)
    return json.loads(text)


# ---------------------------------------------------------------------------
# Rejection reason normalizer
# ---------------------------------------------------------------------------
# Maps LLM free-text onto the 5 allowed enum values.
# The prompt instructs the LLM to use the enum directly, but we normalize
# defensively server-side — this is the #1 silent failure point per spec.

_REASON_KEYWORD_MAP = {
    "pre-existing": RejectionCategory.PED_NON_DISCLOSURE,
    "pre existing": RejectionCategory.PED_NON_DISCLOSURE,
    "preexisting": RejectionCategory.PED_NON_DISCLOSURE,
    "non-disclosure": RejectionCategory.PED_NON_DISCLOSURE,
    "nondisclosure": RejectionCategory.PED_NON_DISCLOSURE,
    "concealment": RejectionCategory.PED_NON_DISCLOSURE,
    " ped ": RejectionCategory.PED_NON_DISCLOSURE,
    "waiting period": RejectionCategory.WAITING_PERIOD,
    "wait period": RejectionCategory.WAITING_PERIOD,
    "moratorium": RejectionCategory.WAITING_PERIOD,
    "exclusion": RejectionCategory.POLICY_EXCLUSION,
    "excluded": RejectionCategory.POLICY_EXCLUSION,
    "not covered": RejectionCategory.POLICY_EXCLUSION,
    "not payable": RejectionCategory.POLICY_EXCLUSION,
    "cosmetic": RejectionCategory.POLICY_EXCLUSION,
    "document": RejectionCategory.DOCUMENTATION,
    "incomplete": RejectionCategory.DOCUMENTATION,
    "missing": RejectionCategory.DOCUMENTATION,
    "partial settlement": RejectionCategory.PARTIAL_SETTLEMENT,
    "sub-limit": RejectionCategory.PARTIAL_SETTLEMENT,
    "sublimit": RejectionCategory.PARTIAL_SETTLEMENT,
    "co-payment": RejectionCategory.PARTIAL_SETTLEMENT,
    "copayment": RejectionCategory.PARTIAL_SETTLEMENT,
    "deductible": RejectionCategory.PARTIAL_SETTLEMENT,
}

_VALID_REASONS = {r.value for r in RejectionCategory}


def _normalize_rejection_reason(raw: Optional[str]) -> Optional[str]:
    """
    Normalize LLM output to one of the 5 enum values.
    Returns None if no mapping found — caller leaves field as null.
    Never returns an unknown string.
    """
    if raw is None:
        return None
    if raw in _VALID_REASONS:
        return raw
    lower = raw.lower()
    for keyword, canonical in _REASON_KEYWORD_MAP.items():
        if keyword in lower:
            return canonical.value
    logger.warning(f"Could not normalize rejection_reason '{raw}' — setting to null")
    return None


def _normalize_claim_status(raw: Optional[str]) -> Optional[str]:
    if raw is None:
        return None
    lower = raw.lower()
    if "partial" in lower:
        return "partial"
    if any(w in lower for w in ("reject", "denied", "declined", "repudiat")):
        return "rejected"
    return None


# ---------------------------------------------------------------------------
# Standard error responses (Person C's agreed error shape)
# ---------------------------------------------------------------------------

def _err(status: int, slug: str, message: str) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content={"error": slug, "message": message},
    )


# ---------------------------------------------------------------------------
# Endpoint: /extract
# ---------------------------------------------------------------------------

class ExtractRequest(BaseModel):
    policy_text: str = ""
    rejection_text: str
    additional_text: str = ""


@app.post(
    "/extract",
    responses={
        200: {"description": "Case fingerprint extracted successfully"},
        422: {"model": ErrorResponse, "description": "LLM parse failure or schema error"},
        500: {"model": ErrorResponse, "description": "LLM unreachable or unexpected error"},
    },
    summary="Extract Case Fingerprint from rejection letter",
    tags=["Core"],
)
def extract(req: ExtractRequest):
    """
    Extract structured Case Fingerprint fields from a rejection letter.

    - rejection_reason is normalized server-side onto the 5 enum values.
    - Missing fields are returned as null (never hallucinated).
    - Malformed LLM output returns HTTP 422 with a clear error shape for Person C.
    """
    user_prompt = prompts.EXTRACTION_USER_TEMPLATE.format(
        policy_text=req.policy_text or "(not provided)",
        rejection_text=req.rejection_text,
        additional_text=req.additional_text or "(none provided)",
    )

    try:
        result = call_llm_json(prompts.EXTRACTION_SYSTEM_PROMPT, user_prompt)
    except json.JSONDecodeError:
        logger.warning("/extract — JSON parse failed")
        return _err(
            422,
            "extraction_failed",
            "Could not parse structured data from the document. "
            "Try re-uploading or check the file is readable.",
        )
    except Exception as e:
        logger.error(f"/extract — LLM call failed: {e}")
        return _err(500, "llm_unavailable", "Could not reach the AI service. Please try again.")

    # Server-side normalization — never trust LLM to hit the enum exactly
    fp = result.get("fingerprint", {})
    fp["rejection_reason"] = _normalize_rejection_reason(fp.get("rejection_reason"))
    fp["claim_status"] = _normalize_claim_status(fp.get("claim_status"))

    # Clamp claim_amount to numeric
    raw_amount = fp.get("claim_amount")
    if raw_amount is not None:
        try:
            fp["claim_amount"] = float(
                str(raw_amount).replace(",", "").replace("₹", "").replace("Rs.", "").strip()
            )
        except (ValueError, TypeError):
            fp["claim_amount"] = None

    # Ensure extraction_confidence is present
    result["fingerprint"] = fp
    if "extraction_confidence" not in result:
        result["extraction_confidence"] = "low"

    return result


# ---------------------------------------------------------------------------
# Endpoint: /similar-cases
# ---------------------------------------------------------------------------

class SimilarCasesRequest(BaseModel):
    fingerprint: CaseFingerprint
    top_k: int = 5


@app.post(
    "/similar-cases",
    response_model=list[SimilarCaseMatch],
    responses={
        500: {"model": ErrorResponse, "description": "Corpus unavailable or scoring error"},
    },
    summary="Find similar historical cases for a Case Fingerprint",
    tags=["Core"],
)
def similar_cases(req: SimilarCasesRequest):
    """
    Return ranked matches from the case corpus for the given fingerprint.

    - Pure algorithmic scoring — no LLM call, cannot fail from bad AI output.
    - Every match includes match_explanation booleans (never a bare score).
    - Returns up to top_k matches (default 5).
    """
    if not CORPUS:
        return _err(500, "corpus_unavailable", "Case corpus could not be loaded.")

    try:
        return find_similar_cases(
            req.fingerprint, CORPUS, top_k=req.top_k, index=RETRIEVAL_INDEX
        )
    except Exception as e:
        logger.error(f"/similar-cases — scoring error: {e}")
        return _err(500, "similarity_error", "An error occurred while finding similar cases.")


# ---------------------------------------------------------------------------
# Endpoint: /case-intelligence
# ---------------------------------------------------------------------------

class CaseIntelligenceRequest(BaseModel):
    user_fingerprint: CaseFingerprint
    matched_case_id: str
    # What the user actually supplied. Drives evidence_you_have and the missing-evidence
    # comparison, so the gap analysis reflects this user rather than a fixed assumption.
    user_documents: list[str] = []


@app.post(
    "/case-intelligence",
    response_model=CaseIntelligence,
    responses={
        404: {"model": ErrorResponse, "description": "case_id not found in corpus"},
        422: {"model": ErrorResponse, "description": "LLM parse failure"},
        500: {"model": ErrorResponse, "description": "LLM unreachable or unexpected error"},
    },
    summary="Explain why a case won/lost and identify evidence gaps, with per-claim provenance",
    tags=["Core"],
)
def case_intelligence(req: CaseIntelligenceRequest):
    """
    Explain why a matched case was decided as it was, what evidence mattered, what the user
    is missing, and what the insurer is likely to argue.

    Every claim comes back as a GroundedClaim carrying the case_id + field + verbatim span
    it was drawn from, validated against the corpus by app.core.grounding. Claims whose
    citations do not check out are returned unverified rather than rendered as fact.

    Cases flagged insufficient_information decline to answer and never reach the LLM.
    """
    matched = CORPUS_INDEX.get(req.matched_case_id)
    if not matched:
        return _err(404, "case_not_found", f"No case with id '{req.matched_case_id}' found.")

    # --- Declined: no LLM call at all. The honest path. ---
    if matched.insufficient_information:
        logger.info(f"/case-intelligence — declining {req.matched_case_id} (insufficient records)")
        return CaseIntelligence(
            case_id=req.matched_case_id,
            outcome=matched.outcome.value if matched.outcome else "unknown",
            why_outcome_happened=(
                "Insufficient information. The records for this case are incomplete, so the "
                "available documents do not support a reliable explanation of which arguments "
                "or evidence were decisive. Treating this case as a precedent for your appeal "
                "would not be appropriate."
            ),
            why_outcome_claims=[],
            successful_arguments=[],
            evidence_that_mattered=[],
            missing_evidence=[],
            likely_insurer_counterarguments=[],
            evidence_you_have=list(req.user_documents),
            grounding_note=(
                "insufficient_information — this case was flagged as having incomplete records. "
                "No analysis was generated and no AI call was made."
            ),
            grounding_report=grounding.build_report([], declined=True),
        )

    # --- Normal case: cited LLM analysis, then validated ---
    user_prompt = prompts.CASE_INTELLIGENCE_USER_TEMPLATE.format(
        user_fingerprint_json=req.user_fingerprint.model_dump_json(indent=2),
        matched_case_json=matched.model_dump_json(indent=2),
        user_documents_json=json.dumps(req.user_documents or ["(none supplied)"]),
        case_id=matched.id,
    )

    try:
        result = call_llm_json(prompts.CASE_INTELLIGENCE_SYSTEM_PROMPT, user_prompt)
    except json.JSONDecodeError:
        logger.warning(f"/case-intelligence — JSON parse failed for {req.matched_case_id}")
        return _err(
            422,
            "intelligence_error",
            "Could not parse case intelligence from the AI response. Please try again.",
        )
    except Exception as e:
        logger.error(f"/case-intelligence — LLM call failed: {e}")
        return _err(500, "llm_unavailable", "Could not reach the AI service. Please try again.")

    # Parse into GroundedClaims, then validate every citation against the corpus.
    # Counterarguments are predictions, so they are tagged as such and excluded from the
    # coverage denominator rather than counted as unverified history.
    groups: dict[str, list] = {}
    for field, kind in (
        ("why_outcome_claims", "grounded"),
        ("successful_arguments", "grounded"),
        ("evidence_that_mattered", "grounded"),
        ("missing_evidence", "grounded"),
        ("likely_insurer_counterarguments", "prediction"),
    ):
        parsed = grounding.parse_claims(result.get(field), kind=kind)
        groups[field] = grounding.verify_claims(parsed, CORPUS_INDEX)

    report = grounding.build_report(list(groups.values()))
    dropped = report.unverified
    if dropped:
        logger.info(
            f"/case-intelligence — {req.matched_case_id}: {report.verified}/{report.total} "
            f"claims verified, {dropped} could not be traced to the corpus"
        )

    note = result.get("grounding_note") or f"Analysis grounded on {req.matched_case_id} case record."

    try:
        return CaseIntelligence(
            case_id=req.matched_case_id,
            outcome=result.get("outcome") or (matched.outcome.value if matched.outcome else "unknown"),
            why_outcome_happened=result.get("why_outcome_happened") or "",
            evidence_you_have=list(req.user_documents),
            grounding_note=note,
            grounding_report=report,
            **groups,
        )
    except Exception as e:
        logger.error(f"/case-intelligence — validation error: {e}")
        return _err(
            422,
            "intelligence_error",
            "AI response did not match expected schema. Please try again.",
        )


# ---------------------------------------------------------------------------
# Endpoint: /assessment
# ---------------------------------------------------------------------------

class AssessmentRequest(BaseModel):
    user_fingerprint: CaseFingerprint
    matched_case_ids: list[str]


@app.post(
    "/assessment",
    response_model=CaseAssessment,
    responses={
        404: {"model": ErrorResponse, "description": "A matched case_id was not found"},
        422: {"model": ErrorResponse, "description": "LLM parse failure"},
        500: {"model": ErrorResponse, "description": "LLM unreachable or unexpected error"},
    },
    summary="Comparable-case assessment verdict with traced support",
    tags=["Core"],
)
def assessment(req: AssessmentRequest):
    """
    Produce a comparable-case verdict for the user's dispute.

    Returns one of three verdicts and never a win probability. The outcome distribution is
    computed from the corpus (not the LLM), and every supporting point is validated the same
    way /case-intelligence claims are.

    Declines when every matched case is flagged insufficient_information, or when the
    matched set is empty.
    """
    matched = [CORPUS_INDEX[cid] for cid in req.matched_case_ids if cid in CORPUS_INDEX]
    missing = [cid for cid in req.matched_case_ids if cid not in CORPUS_INDEX]
    if missing:
        return _err(404, "case_not_found", f"Matched case(s) not found: {missing}")

    usable = [c for c in matched if not c.insufficient_information]

    # Outcome distribution is computed from corpus records, never asked of the model.
    distribution: dict[str, int] = {}
    for c in usable:
        key = c.outcome.value if c.outcome else "unknown"
        distribution[key] = distribution.get(key, 0) + 1

    if not usable:
        return CaseAssessment(
            verdict=AssessmentVerdict.INSUFFICIENT_INFORMATION,
            reasoning=(
                "No matched case carries complete enough records to support an assessment. "
                "Rather than infer a verdict from incomplete precedent, the system declines."
            ),
            confidence="low",
            supporting_claims=[],
            outcome_distribution=distribution,
            cases_considered=[c.id for c in matched],
            grounding_report=grounding.build_report([], declined=True),
        )

    user_prompt = prompts.ASSESSMENT_USER_TEMPLATE.format(
        user_fingerprint_json=req.user_fingerprint.model_dump_json(indent=2),
        matched_cases_json=json.dumps([c.model_dump(mode="json") for c in usable], indent=2),
        outcome_distribution_json=json.dumps(distribution),
    )

    try:
        result = call_llm_json(prompts.ASSESSMENT_SYSTEM_PROMPT, user_prompt)
    except json.JSONDecodeError:
        logger.warning("/assessment — JSON parse failed")
        return _err(422, "assessment_error", "Could not parse the assessment. Please try again.")
    except Exception as e:
        logger.error(f"/assessment — LLM call failed: {e}")
        return _err(500, "llm_unavailable", "Could not reach the AI service. Please try again.")

    claims = grounding.verify_claims(
        grounding.parse_claims(result.get("supporting_claims")), CORPUS_INDEX
    )
    report = grounding.build_report([claims])

    verdict = _normalize_verdict(result.get("verdict"))
    confidence = str(result.get("confidence") or "low").lower()
    if confidence not in {"high", "medium", "low"}:
        confidence = "low"

    # An unsupported verdict is downgraded rather than presented at face value.
    if verdict != AssessmentVerdict.INSUFFICIENT_INFORMATION and report.verified == 0:
        logger.info("/assessment — no claim survived validation; downgrading confidence to low")
        confidence = "low"

    return CaseAssessment(
        verdict=verdict,
        reasoning=result.get("reasoning") or "",
        confidence=confidence,
        supporting_claims=claims,
        outcome_distribution=distribution,
        cases_considered=[c.id for c in usable],
        grounding_report=report,
    )


def _normalize_verdict(raw: Optional[str]) -> AssessmentVerdict:
    """Map model output onto the three allowed verdicts. Defaults to insufficient, not favorable."""
    text = (raw or "").strip().lower().replace(" ", "_").replace("-", "_")
    for v in AssessmentVerdict:
        if text == v.value:
            return v
    if "challeng" in text or "contest" in text:
        return AssessmentVerdict.POTENTIALLY_CHALLENGEABLE
    if "consistent" in text or "upheld" in text or "insurer" in text:
        return AssessmentVerdict.LIKELY_CONSISTENT
    logger.warning(f"Could not normalize verdict '{raw}' — defaulting to insufficient_information")
    return AssessmentVerdict.INSUFFICIENT_INFORMATION


# ---------------------------------------------------------------------------
# Endpoint: /appeal
# ---------------------------------------------------------------------------

class AppealRequest(BaseModel):
    user_fingerprint: CaseFingerprint
    precedent_case_ids: list[str]
    missing_evidence: list[str] = []


@app.post(
    "/appeal",
    responses={
        200: {"description": "Appeal letter and action plan generated"},
        404: {"model": ErrorResponse, "description": "A precedent case_id not found"},
        422: {"model": ErrorResponse, "description": "LLM parse failure"},
        500: {"model": ErrorResponse, "description": "Unexpected error"},
    },
    summary="Generate grievance appeal letter and action plan",
    tags=["Core"],
)
def generate_appeal(req: AppealRequest):
    """
    Generate an evidence-backed appeal letter and next-action plan.

    - Citations must trace to case source_citation or regulation_sources in the corpus.
    - Falls back to a template-fill letter if the LLM fails (so Person C always has
      something to render on the appeal screen).
    """
    resolved = [CORPUS_INDEX[cid] for cid in req.precedent_case_ids if cid in CORPUS_INDEX]
    missing_ids = [cid for cid in req.precedent_case_ids if cid not in CORPUS_INDEX]
    if missing_ids:
        return _err(404, "case_not_found", f"Precedent case(s) not found: {missing_ids}")

    # A case with incomplete records must never be cited as supporting precedent, even if
    # the user navigated from it. Drop it and tell the caller which ones were dropped.
    precedents = [c for c in resolved if not c.insufficient_information]
    excluded = [c.id for c in resolved if c.insufficient_information]
    if excluded:
        logger.info(f"/appeal — excluded insufficient-record precedents: {excluded}")

    if not precedents:
        return _err(
            422,
            "no_citable_precedent",
            "None of the selected cases have complete enough records to cite as precedent. "
            "Choose a different matched case before generating an appeal.",
        )

    user_prompt = prompts.APPEAL_USER_TEMPLATE.format(
        user_fingerprint_json=req.user_fingerprint.model_dump_json(indent=2),
        precedent_cases_json=json.dumps([p.model_dump() for p in precedents], indent=2),
        missing_evidence_json=json.dumps(req.missing_evidence),
    )

    try:
        resp = client.chat.completions.create(
            model=MODEL,
            max_tokens=1500,
            messages=[
                {"role": "system", "content": prompts.APPEAL_SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
        )
        letter = resp.choices[0].message.content or ""
    except Exception as e:
        logger.error(f"/appeal — LLM call failed: {e}")
        # Fallback: template-fill so Person C has something to render
        return _appeal_template_fallback(req, precedents, excluded)

    # Build action plan and citations from the corpus data (grounded, not invented)
    # Filter out any synthetic / illustrative placeholders so they never leak into user outputs
    raw_citations = []
    for p in precedents:
        if p.source_citation:
            raw_citations.append(p.source_citation)
        raw_citations.extend(p.regulation_sources or [])

    clean_citations = [c for c in raw_citations if not _is_synthetic_citation(c)]

    action_plan = [
        "Submit this appeal letter to the insurer's Grievance Redressal Officer (GRO) "
        "by registered post and/or email. Retain proof of submission.",
        "If no response or unsatisfactory response within 15 days, escalate to the "
        "Insurance Ombudsman at https://bimabharosa.irdai.gov.in/.",
        "File a complaint on the IRDAI Bima Bharosa portal if the ombudsman route "
        "is not applicable to your case.",
        "If the ombudsman ruling is unfavorable, consider the consumer forum route "
        "under the Consumer Protection Act 2019.",
        "Keep copies of all correspondence with timestamps.",
    ]

    return {
        "appeal_letter": letter,
        "action_plan": action_plan,
        "citations_used": list(dict.fromkeys(clean_citations)),  # deduplicate, preserve order
        "precedents_cited": [p.id for p in precedents],
        "precedents_excluded": excluded,
        "generated_by": "llm",
    }


def _is_synthetic_citation(text: Optional[str]) -> bool:
    if not text:
        return True
    lower = text.lower()
    return "illustrative" in lower or "synthetic" in lower


def _appeal_template_fallback(
    req: AppealRequest, precedents: list[CaseFingerprint], excluded: list[str] | None = None
) -> dict:
    """
    Template-fill appeal letter when LLM call fails.
    Per spec fallback guidance — better to render something than nothing on the appeal screen.
    All citations grounded on corpus data only.
    """
    fp = req.user_fingerprint
    insurer = fp.insurer or "the insurer"
    condition = fp.condition or "the medical condition"
    amount = f"₹{fp.claim_amount:,.0f}" if fp.claim_amount else "the claimed amount"
    reason = fp.rejection_reason.value if fp.rejection_reason else "the stated reason"
    valid_precedent_refs = [
        p.source_citation for p in precedents
        if p.source_citation and not _is_synthetic_citation(p.source_citation)
    ]
    precedent_refs = ", ".join(valid_precedent_refs) or "relevant IRDAI regulations and provisions"

    letter = f"""To,
The Grievance Redressal Officer,
{insurer},

Subject: Formal Grievance — Rejection of Health Insurance Claim for {condition}

Dear Sir/Madam,

I write to formally contest the rejection of my health insurance claim of {amount} \
for treatment of {condition}, rejected on the grounds of {reason}.

I submit that this rejection is improper and not in accordance with the terms of my policy \
or applicable IRDAI regulations. I request a thorough and impartial review of my claim.

I draw your attention to the following precedent(s) adjudicated under comparable circumstances: \
{precedent_refs}. I respectfully request that the principles applied in those matters be \
considered in the review of my claim.

I request settlement of my claim in full within 15 days of receipt of this letter. Should this \
grievance not be resolved satisfactorily, I reserve the right to escalate to the Insurance \
Ombudsman under the Insurance Ombudsman Rules 2017, and/or file a complaint on the IRDAI \
Bima Bharosa portal.

I am prepared to provide any additional documentation required.

Yours faithfully,
[Policyholder Name]
[Policy Number]
[Date of writing]
[Contact details]"""

    raw_citations = []
    for p in precedents:
        if p.source_citation:
            raw_citations.append(p.source_citation)
        raw_citations.extend(p.regulation_sources or [])

    clean_citations = [c for c in raw_citations if not _is_synthetic_citation(c)]

    action_plan = [
        "Submit this letter to the insurer's Grievance Redressal Officer by registered post/email.",
        "Retain courier receipt or email timestamp as proof of submission.",
        "If no satisfactory response within 15 days, file with the Insurance Ombudsman: "
        "https://bimabharosa.irdai.gov.in/",
        "Escalate to IRDAI Bima Bharosa portal if ombudsman jurisdiction doesn't apply.",
        "Keep all correspondence and timestamps organized for the ombudsman/forum proceedings.",
    ]

    return {
        "appeal_letter": letter,
        "action_plan": action_plan,
        "citations_used": list(dict.fromkeys(clean_citations)),
        "precedents_cited": [p.id for p in precedents],
        "precedents_excluded": excluded or [],
        "generated_by": "template_fallback",
    }


# ---------------------------------------------------------------------------
# Endpoint: /ingest
# ---------------------------------------------------------------------------

MAX_UPLOAD_BYTES = 8 * 1024 * 1024  # 8 MB — a rejection letter is a few pages
PDF_MAGIC = b"%PDF-"


@app.post(
    "/ingest",
    responses={
        200: {"description": "Text extracted from the uploaded document"},
        413: {"model": ErrorResponse, "description": "File too large"},
        415: {"model": ErrorResponse, "description": "Unsupported file type"},
        422: {"model": ErrorResponse, "description": "File unreadable, encrypted, or has no text"},
    },
    summary="Extract text from an uploaded PDF or text document",
    tags=["Core"],
)
async def ingest(file: UploadFile = File(...)):
    """
    Pull raw text out of a PDF or .txt so the user can review it before extraction.

    Deliberately does NOT auto-run extraction — the text lands in the form for the user to
    check and correct first, because a bad OCR/parse silently poisons everything downstream.
    Scanned image-only PDFs are rejected with a clear message rather than returning empty
    text; there is no OCR in this build.
    """
    raw = await file.read()
    if not raw:
        return _err(422, "empty_file", "That file is empty.")
    if len(raw) > MAX_UPLOAD_BYTES:
        return _err(
            413,
            "file_too_large",
            f"That file is {len(raw) // (1024 * 1024)} MB. The limit is "
            f"{MAX_UPLOAD_BYTES // (1024 * 1024)} MB — try uploading just the relevant pages.",
        )

    name = (file.filename or "document").strip()
    is_pdf = raw.startswith(PDF_MAGIC) or name.lower().endswith(".pdf")

    if is_pdf:
        try:
            import io

            import pdfplumber

            pages: list[str] = []
            with pdfplumber.open(io.BytesIO(raw)) as pdf:
                for page in pdf.pages:
                    pages.append(page.extract_text() or "")
            text = "\n\n".join(pages).strip()
            page_count = len(pages)
        except Exception as e:
            msg = str(e).lower()
            if "password" in msg or "encrypt" in msg:
                return _err(
                    422,
                    "pdf_encrypted",
                    "That PDF is password-protected. Remove the password, or copy the text "
                    "and paste it in directly.",
                )
            logger.warning(f"/ingest — PDF parse failed for {name}: {e}")
            return _err(
                422,
                "pdf_unreadable",
                "That PDF could not be read. Try a different export, or paste the text in directly.",
            )

        if not text:
            return _err(
                422,
                "pdf_no_text",
                "That PDF has no extractable text — it looks like a scan or photo. This build "
                "has no OCR, so please paste the text in directly.",
            )
    else:
        if name.lower().rsplit(".", 1)[-1] not in {"txt", "text", "md"}:
            return _err(
                415,
                "unsupported_type",
                "Only PDF and plain text files are supported. Paste the text in directly for "
                "other formats.",
            )
        try:
            text = raw.decode("utf-8", errors="replace").strip()
        except Exception:
            return _err(422, "decode_failed", "That file could not be decoded as text.")
        page_count = 1
        if not text:
            return _err(422, "empty_file", "That file contains no text.")

    logger.info(f"/ingest — {name}: {page_count} page(s), {len(text)} chars extracted")
    return {
        "filename": name,
        "kind": "pdf" if is_pdf else "text",
        "pages": page_count,
        "chars": len(text),
        "text": text,
    }


# ---------------------------------------------------------------------------
# Health check + debug
# ---------------------------------------------------------------------------

@app.get("/", tags=["Health"])
def root():
    return {
        "status": "ok",
        "service": "ClaimShield API",
        "version": "1.0.0",
        "corpus_cases": len(CORPUS),
        "retrieval_tiers": RETRIEVAL_INDEX.signals,
        "docs": "/docs",
    }


@app.get("/corpus", tags=["Debug"])
def get_corpus():
    """Debug endpoint — dump the loaded case corpus."""
    return CORPUS
