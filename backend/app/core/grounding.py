"""
Grounding validator — the Evidence Ledger's enforcement layer.

The LLM is instructed to cite, for every claim, a corpus case_id plus the verbatim span
it relied on. This module does not trust those citations; it checks them:

  1. Does the cited case actually exist in the corpus?
  2. Is the cited field one a claim is allowed to cite?
  3. Does the quoted span actually appear in that case's field text?

Claims that fail get verified=False and their provenance stripped, so the UI renders them
as untraceable instead of as established fact. This is what lets the product say "3 claims
were dropped because the model couldn't cite them" and mean it.
"""

import re
from typing import Optional

from .schema import CaseFingerprint, GroundedClaim, GroundingReport, Provenance

_WS = re.compile(r"\s+")
_PUNCT = re.compile(r"[^\w\s]")

# Fields a claim may cite. Anything outside this set is rejected outright, which stops the
# model from inventing a plausible-sounding field name to hang a citation on.
CITABLE_FIELDS = {
    "decision_summary",
    "successful_arguments",
    "failed_arguments",
    "key_evidence",
    "relevant_policy_clause",
    "regulation_sources",
    "source_citation",
}

# A verbatim span is ideal, but LLMs lightly reword quotes. Accept a span whose meaningful
# tokens are mostly present in the source field; reject anything below this.
TOKEN_OVERLAP_THRESHOLD = 0.6
MIN_SPAN_CHARS = 12


def _norm(text: Optional[str]) -> str:
    return _WS.sub(" ", _PUNCT.sub(" ", (text or "").lower())).strip()


def _tokens(text: Optional[str]) -> set[str]:
    return {w for w in _norm(text).split() if len(w) > 2}


def _field_text(case: CaseFingerprint, field: str) -> Optional[str]:
    value = getattr(case, field, None)
    if value is None:
        return None
    if isinstance(value, list):
        return " \n ".join(str(v) for v in value)
    return str(value)


def _reject(claim: GroundedClaim) -> GroundedClaim:
    claim.verified = False
    claim.provenance = None
    return claim


def verify_claim(
    claim: GroundedClaim, corpus_index: dict[str, CaseFingerprint]
) -> GroundedClaim:
    """Validate one claim's citation against the corpus. Mutates and returns the claim."""
    prov = claim.provenance
    if prov is None:
        claim.verified = False
        return claim

    case = corpus_index.get(prov.case_id)
    if case is None:
        return _reject(claim)  # cited a case that does not exist

    if prov.field not in CITABLE_FIELDS:
        return _reject(claim)

    span = (prov.quoted_span or "").strip()
    if len(span) < MIN_SPAN_CHARS:
        return _reject(claim)  # too short to be a meaningful quote

    haystack = _field_text(case, prov.field)
    if not haystack:
        return _reject(claim)  # field is empty on this record

    norm_span, norm_hay = _norm(span), _norm(haystack)
    if norm_span and norm_span in norm_hay:
        claim.verified = True
        return claim

    span_tokens = _tokens(span)
    if span_tokens:
        overlap = len(span_tokens & _tokens(haystack)) / len(span_tokens)
        if overlap >= TOKEN_OVERLAP_THRESHOLD:
            claim.verified = True
            return claim

    return _reject(claim)


def verify_claims(
    claims: list[GroundedClaim], corpus_index: dict[str, CaseFingerprint]
) -> list[GroundedClaim]:
    return [verify_claim(c, corpus_index) for c in claims]


def parse_claims(raw, kind: str = "grounded") -> list[GroundedClaim]:
    """
    Turn raw LLM output into GroundedClaim objects, tolerating shape drift.

    Accepts a flat form ({"text","case_id","field","quoted_span"}), a nested form
    ({"text","provenance":{...}}), or a bare string (which becomes an ungrounded claim).
    Anything unparseable is dropped rather than guessed at.
    """
    if not isinstance(raw, list):
        return []

    claims: list[GroundedClaim] = []
    for item in raw:
        if isinstance(item, str):
            claims.append(GroundedClaim(text=item, kind=kind))
            continue
        if not isinstance(item, dict):
            continue

        text = item.get("text") or item.get("claim") or item.get("item") or item.get("argument")
        if not text or not isinstance(text, str):
            continue

        src = item.get("provenance") if isinstance(item.get("provenance"), dict) else item
        case_id = src.get("case_id")
        field = src.get("field")
        quoted = src.get("quoted_span") or src.get("quote")

        provenance = None
        if case_id and field and quoted:
            provenance = Provenance(
                case_id=str(case_id), field=str(field), quoted_span=str(quoted)
            )

        rationale = item.get("rationale") or item.get("why_it_matters")
        addressed = item.get("what_can_address_it")
        if rationale is None and addressed:
            rationale = addressed if isinstance(addressed, str) else "; ".join(map(str, addressed))

        claims.append(
            GroundedClaim(text=text, rationale=rationale, provenance=provenance, kind=kind)
        )
    return claims


def build_report(
    claim_groups: list[list[GroundedClaim]], declined: bool = False
) -> GroundingReport:
    """
    Aggregate audit counts across every claim list in a response.

    Only kind == "grounded" claims count toward coverage. Predictions about what an insurer
    will argue are forward-looking by nature, so scoring them as "unverified history" would
    understate coverage and misrepresent what the number means.
    """
    if declined:
        return GroundingReport(declined=True)

    grounded = [c for group in claim_groups for c in group if c.kind == "grounded"]
    total = len(grounded)
    verified = sum(1 for c in grounded if c.verified)
    return GroundingReport(
        total=total,
        verified=verified,
        unverified=total - verified,
        coverage_pct=round(100.0 * verified / total, 1) if total else 0.0,
        declined=False,
    )
