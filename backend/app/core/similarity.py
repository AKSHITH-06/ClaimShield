"""
Hybrid similarity scoring for ClaimShield.

Structured field comparison (transparent, explainable, always available) fused with the
lexical and semantic tiers in retrieval.py. Every match returns a per-factor breakdown and
match_explanation booleans, so "why is this similar?" is answered by construction rather
than reverse-engineered after the fact.

The old policy_clause factor used difflib.SequenceMatcher — a character diff that rated
"Clause 4.1" ~ "Clause 4.2" as nearly identical while missing genuine legal-issue overlap.
BM25 plus dense embeddings replace it.
"""

from typing import Optional

from .retrieval import HybridIndex, query_document
from .schema import CaseFingerprint, SimilarCaseMatch

# Sums to 1.0. Structured factors keep the majority of the weight so ranking stays
# explainable; the text tiers add the paraphrase sensitivity the structured pass lacks.
BASE_WEIGHTS = {
    "legal_issue": 0.30,
    "insurer": 0.12,
    "factual": 0.13,
    "claim_medical": 0.08,
    "court_jurisdiction": 0.04,
    "lexical": 0.15,
    "semantic": 0.18,
}

STRUCTURED_KEYS = ("legal_issue", "insurer", "factual", "claim_medical", "court_jurisdiction")
OPTIONAL_KEYS = ("lexical", "semantic")


def resolve_weights(signals: dict[str, bool]) -> dict[str, float]:
    """
    Redistribute the weight of any unavailable tier instead of letting it score 0.

    Scoring a downed tier as 0 would silently compress every result toward the structured
    factors and make scores incomparable across runs. Redistribution keeps the total at 1.0
    and the reported signals tell the UI which tiers actually contributed.
    """
    weights = dict(BASE_WEIGHTS)
    orphaned = sum(weights[k] for k in OPTIONAL_KEYS if not signals.get(k, False))
    if orphaned <= 0:
        return weights

    for k in OPTIONAL_KEYS:
        if not signals.get(k, False):
            weights[k] = 0.0

    live_optional = [k for k in OPTIONAL_KEYS if signals.get(k, False)]
    targets = live_optional or list(STRUCTURED_KEYS)
    base_total = sum(BASE_WEIGHTS[k] for k in targets)
    for k in targets:
        weights[k] += orphaned * (BASE_WEIGHTS[k] / base_total)
    return weights


def _claim_amount_similarity(a: Optional[float], b: Optional[float]) -> float:
    if a is None or b is None:
        return 0.5  # neutral when unknown — don't punish a case for missing data
    if a == 0 or b == 0:
        return 0.0
    return min(a, b) / max(a, b)


def score_case(
    query: CaseFingerprint,
    candidate: CaseFingerprint,
    lexical: float = 0.0,
    semantic: float = 0.0,
    weights: Optional[dict[str, float]] = None,
    signals: Optional[dict[str, bool]] = None,
) -> SimilarCaseMatch:
    weights = weights or resolve_weights({"lexical": False, "semantic": False})
    signals = signals or {"structured": True, "lexical": False, "semantic": False}

    scores: dict[str, float] = {}
    reasons: list[str] = []

    # Legal issue — same denial category is the single strongest precedent signal
    if query.rejection_reason is not None and query.rejection_reason == candidate.rejection_reason:
        scores["legal_issue"] = 1.0
        reasons.append(f"Same denial category ({candidate.rejection_reason.value})")
    else:
        scores["legal_issue"] = 0.0

    # Insurer
    if query.insurer.strip().lower() == candidate.insurer.strip().lower():
        scores["insurer"] = 1.0
        reasons.append("Same insurer")
    else:
        scores["insurer"] = 0.0

    # Factual — condition carries most of it, treatment type refines
    condition_match = query.condition.strip().lower() == candidate.condition.strip().lower()
    treatment_match = bool(
        query.treatment_type
        and candidate.treatment_type
        and query.treatment_type.strip().lower() == candidate.treatment_type.strip().lower()
    )
    factual = 0.0
    if condition_match:
        factual += 0.7
        reasons.append(f"Same medical condition ({candidate.condition})")
    if treatment_match:
        factual += 0.3
    scores["factual"] = min(factual, 1.0)

    scores["claim_medical"] = _claim_amount_similarity(query.claim_amount, candidate.claim_amount)

    # Court / jurisdiction
    if query.court_level == candidate.court_level:
        scores["court_jurisdiction"] = 1.0
    elif query.jurisdiction and query.jurisdiction == candidate.jurisdiction:
        scores["court_jurisdiction"] = 0.5
    else:
        scores["court_jurisdiction"] = 0.0

    # Text tiers
    scores["lexical"] = round(lexical, 4)
    scores["semantic"] = round(semantic, 4)
    if signals.get("lexical") and lexical >= 0.6:
        reasons.append("Strong terminology overlap in case record")
    if signals.get("semantic") and semantic >= 0.75:
        reasons.append("Semantically similar dispute narrative")

    overall = sum(scores[k] * weights.get(k, 0.0) for k in scores)

    # Never return a bare percentage — these booleans are what the UI renders under
    # "Why is this similar?"
    match_explanation = {
        "same_insurer": scores["insurer"] >= 1.0,
        "same_reason": scores["legal_issue"] == 1.0,
        "similar_clause": max(scores["lexical"], scores["semantic"]) >= 0.6
        or scores["legal_issue"] == 1.0,
        "similar_facts": scores["factual"] >= 0.4 and scores["claim_medical"] >= 0.5,
    }

    return SimilarCaseMatch(
        case=candidate,
        overall_score=round(overall, 4),
        score_breakdown={k: round(v, 2) for k, v in scores.items()},
        match_reasons=reasons or ["Some factual overlap, but limited direct match"],
        match_explanation=match_explanation,
        retrieval_signals=dict(signals),
    )


def find_similar_cases(
    query: CaseFingerprint,
    corpus: list[CaseFingerprint],
    top_k: int = 5,
    index: Optional[HybridIndex] = None,
) -> list[SimilarCaseMatch]:
    """
    Rank the corpus against the user's fingerprint.

    The text tiers are scored once per query for the whole corpus (not per pair), then fused
    into each candidate's structured score. Passing index=None degrades to structured-only.
    """
    signals = index.signals if index else {"structured": True, "lexical": False, "semantic": False}
    weights = resolve_weights(signals)

    if index:
        qdoc = query_document(query)
        lexical = index.lexical_scores(qdoc)
        semantic = index.semantic_scores(qdoc)
    else:
        lexical, semantic = {}, {}

    matches = [
        score_case(
            query,
            c,
            lexical=lexical.get(c.id, 0.0),
            semantic=semantic.get(c.id, 0.0),
            weights=weights,
            signals=signals,
        )
        for c in corpus
        if c.id != query.id
    ]
    matches.sort(key=lambda m: m.overall_score, reverse=True)
    return matches[:top_k]
