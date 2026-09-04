"""
ClaimShield core data schema.

This is the SHARED CONTRACT for the hackathon. Everyone (dataset, backend,
frontend) should treat these field names as fixed once agreed — changing
them mid-hackathon breaks three people's work at once.
"""

from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field


class RejectionCategory(str, Enum):
    PED_NON_DISCLOSURE = "ped_non_disclosure"
    WAITING_PERIOD = "waiting_period"
    POLICY_EXCLUSION = "policy_exclusion"
    DOCUMENTATION = "documentation"
    PARTIAL_SETTLEMENT = "partial_settlement"


class CourtLevel(str, Enum):
    DISTRICT_COMMISSION = "district_commission"
    STATE_COMMISSION = "state_commission"
    NATIONAL_COMMISSION = "national_commission"
    OMBUDSMAN = "ombudsman"
    HIGH_COURT = "high_court"
    UNKNOWN = "unknown"


class Outcome(str, Enum):
    POLICYHOLDER_FAVORABLE = "policyholder_favorable"
    PARTIAL_RELIEF = "partial_relief"
    INSURER_FAVORABLE = "insurer_favorable"


class CaseFingerprint(BaseModel):
    """
    The structured representation of ANY case — whether it's the user's
    freshly-uploaded rejected claim, or a historical case in the corpus.
    Same shape for both, which is what makes similarity scoring simple.
    """
    id: str
    insurer: str
    insurance_type: str = "health"
    claim_amount: Optional[float] = None
    rejection_reason: Optional[RejectionCategory] = None
    condition: str = Field(description="Medical condition at issue, e.g. 'diabetes'")
    treatment_type: Optional[str] = None
    policy_start_date: Optional[str] = None   # ISO date
    hospitalization_date: Optional[str] = None  # ISO date
    claim_date: Optional[str] = None
    claim_status: Optional[str] = None         # "rejected" | "partial"
    relevant_policy_clause: Optional[str] = None
    disclosure_issue: bool = False
    documentation_issue: bool = False
    court_level: CourtLevel = CourtLevel.UNKNOWN
    jurisdiction: Optional[str] = None

    # Fields only present on HISTORICAL corpus cases (None for user's case)
    outcome: Optional[Outcome] = None
    decision_summary: Optional[str] = None
    successful_arguments: Optional[list[str]] = None
    failed_arguments: Optional[list[str]] = None
    key_evidence: Optional[list[str]] = None
    regulation_sources: Optional[list[str]] = None  # Person C uses these for citations
    source_citation: Optional[str] = None  # e.g. "NCDRC, Consumer Case No. X, 2023"
    source_url: Optional[str] = None
    insufficient_information: bool = False  # True for the "Judge Q1" honesty case


class ExtractionResult(BaseModel):
    """What the extraction step returns for a user's uploaded documents."""
    fingerprint: CaseFingerprint
    extraction_confidence: str  # "high" | "medium" | "low"
    fields_needing_review: list[str] = []
    source_spans: dict[str, str] = {}  # field_name -> quoted source text


class Provenance(BaseModel):
    """Where a claim came from. case_id + field + the verbatim text it was taken from."""
    case_id: str
    field: str
    quoted_span: str


class GroundedClaim(BaseModel):
    """
    One assertion shown to the user, carrying its own provenance.

    verified=True means the grounding validator confirmed the cited case exists AND
    the quoted_span actually appears in that case's cited field. Anything else is
    surfaced to the user as unverified rather than quietly rendered as fact.
    """
    text: str
    rationale: Optional[str] = None      # why_it_matters / what_can_address_it
    provenance: Optional[Provenance] = None
    verified: bool = False
    kind: str = "grounded"               # "grounded" | "prediction"


class GroundingReport(BaseModel):
    """Audit counts for the Evidence Ledger strip."""
    total: int = 0
    verified: int = 0
    unverified: int = 0
    coverage_pct: float = 0.0
    declined: bool = False               # True when the system refused to answer


class SimilarCaseMatch(BaseModel):
    case: CaseFingerprint
    overall_score: float  # 0-1
    score_breakdown: dict[str, float]  # e.g. {"legal_issue": 0.35, ...}
    match_reasons: list[str]  # human-readable, e.g. "Same insurer", "Same denial category"
    # Per spec: match_explanation booleans required (never return bare score to frontend)
    match_explanation: dict[str, bool] = Field(
        default_factory=lambda: {
            "same_insurer": False,
            "same_reason": False,
            "similar_clause": False,
            "similar_facts": False,
        }
    )
    # Which retrieval tiers actually contributed. Set false when a tier is unavailable
    # so degraded ranking is visible instead of silent.
    retrieval_signals: dict[str, bool] = Field(
        default_factory=lambda: {"structured": True, "lexical": False, "semantic": False}
    )


class CaseIntelligence(BaseModel):
    """The 'why did they win/lose' + evidence gap + counterargument bundle for one matched case.

    Every list is GroundedClaim, not str — each assertion carries the corpus record and
    verbatim span it was derived from, validated server-side by app.core.grounding.
    """
    case_id: str
    outcome: str
    why_outcome_happened: str
    why_outcome_claims: list[GroundedClaim] = []
    successful_arguments: list[GroundedClaim] = []
    evidence_that_mattered: list[GroundedClaim] = []
    missing_evidence: list[GroundedClaim] = []
    likely_insurer_counterarguments: list[GroundedClaim] = []
    evidence_you_have: list[str] = []
    grounding_note: str
    grounding_report: GroundingReport = Field(default_factory=GroundingReport)


class AssessmentVerdict(str, Enum):
    POTENTIALLY_CHALLENGEABLE = "potentially_challengeable"
    LIKELY_CONSISTENT = "likely_consistent"
    INSUFFICIENT_INFORMATION = "insufficient_information"


class CaseAssessment(BaseModel):
    """Comparable-case assessment. Never a win probability - a verdict plus traced support."""
    verdict: AssessmentVerdict
    reasoning: str
    confidence: str                       # "high" | "medium" | "low"
    supporting_claims: list[GroundedClaim] = []
    outcome_distribution: dict[str, int] = {}
    cases_considered: list[str] = []
    grounding_report: GroundingReport = Field(default_factory=GroundingReport)


class ActionPlan(BaseModel):
    steps: list[str]
    appeal_letter_draft: Optional[str] = None


# ---------------------------------------------------------------------------
# Standard error shape — agreed with Person C.
# Every error response from every endpoint returns this exact shape.
# HTTP codes: 422 = parse/schema failure, 404 = not found, 500 = unexpected
# ---------------------------------------------------------------------------

class ErrorResponse(BaseModel):
    error: str    # machine-readable slug
    message: str  # human-readable, safe to display in UI
