"""
Hybrid retrieval — the lexical and semantic tiers that sit alongside structured scoring.

Spec section 31 warns against relying on a single matching signal. The original scorer used
difflib.SequenceMatcher on policy clause text, which is a character-level diff: it rates
"Clause 4.1" and "Clause 4.2" as near-identical while missing that "PED exclusion" and
"pre-existing condition waiting period" are the same legal issue.

Three tiers, fused:

  structured  existing weighted field comparison       always available, explainable
  lexical     BM25 (rank_bm25, Apache-2.0, pure Python)  strong on legal terminology
  semantic    dense embeddings (fastembed, Apache-2.0)   catches paraphrase

Both optional tiers degrade explicitly: if a tier cannot load, its weight is redistributed
and the match reports the tier as inactive, so ranking quality never silently changes.
"""

import logging
import math
import re
from typing import Optional

from .schema import CaseFingerprint

logger = logging.getLogger("claimshield.retrieval")

EMBED_MODEL = "BAAI/bge-small-en-v1.5"

_TOKEN = re.compile(r"[a-z0-9]+")

# Narrative fields fused into the retrievable document for each case. Deliberately excludes
# outcome so retrieval cannot bias toward favorable cases just because they read differently.
_TEXT_FIELDS = (
    "condition",
    "treatment_type",
    "relevant_policy_clause",
    "decision_summary",
    "successful_arguments",
    "failed_arguments",
    "key_evidence",
)


def _tokenize(text: str) -> list[str]:
    return _TOKEN.findall((text or "").lower())


def _flatten(value) -> str:
    if value is None:
        return ""
    if isinstance(value, list):
        return " ".join(str(v) for v in value)
    return str(value)


def case_document(case: CaseFingerprint) -> str:
    """The retrievable text for one case."""
    parts = [_flatten(getattr(case, f, None)) for f in _TEXT_FIELDS]
    reason = case.rejection_reason.value.replace("_", " ") if case.rejection_reason else ""
    parts.append(reason)
    return " ".join(p for p in parts if p).strip()


def query_document(fp: CaseFingerprint) -> str:
    """The retrievable text for the user's case. Same shape as case_document."""
    return case_document(fp)


def _normalize(scores: dict[str, float]) -> dict[str, float]:
    """Scale to 0-1 by the max in this result set. BM25 is unbounded, so relative is all we have."""
    if not scores:
        return {}
    top = max(scores.values())
    if top <= 0:
        return {k: 0.0 for k in scores}
    return {k: max(0.0, v / top) for k, v in scores.items()}


class HybridIndex:
    """Built once at startup over the corpus. Query-time only reads."""

    def __init__(self, corpus: list[CaseFingerprint]):
        self.ids = [c.id for c in corpus]
        self.docs = [case_document(c) for c in corpus]
        self._bm25 = None
        self._embedder = None
        self._vectors: Optional[list[list[float]]] = None
        self.lexical_available = False
        self.semantic_available = False
        self._build_lexical()
        self._build_semantic()

    # -- tier construction ---------------------------------------------------

    def _build_lexical(self) -> None:
        try:
            from rank_bm25 import BM25Okapi

            tokenized = [_tokenize(d) for d in self.docs]
            if not any(tokenized):
                logger.warning("BM25: corpus produced no tokens; lexical tier disabled")
                return
            self._bm25 = BM25Okapi(tokenized)
            self.lexical_available = True
            logger.info(f"BM25 lexical index built over {len(self.docs)} cases.")
        except Exception as e:
            logger.warning(f"BM25 unavailable, lexical tier disabled: {e}")

    def _build_semantic(self) -> None:
        try:
            from fastembed import TextEmbedding

            self._embedder = TextEmbedding(model_name=EMBED_MODEL)
            self._vectors = [list(v) for v in self._embedder.embed(self.docs)]
            self.semantic_available = True
            logger.info(
                f"Semantic index built: {len(self._vectors)} vectors, "
                f"dim={len(self._vectors[0]) if self._vectors else 0}, model={EMBED_MODEL}"
            )
        except Exception as e:
            logger.warning(f"fastembed unavailable, semantic tier disabled: {e}")

    # -- query ---------------------------------------------------------------

    def lexical_scores(self, query_text: str) -> dict[str, float]:
        if not self.lexical_available or not query_text.strip():
            return {}
        try:
            raw = self._bm25.get_scores(_tokenize(query_text))
            return _normalize({cid: float(s) for cid, s in zip(self.ids, raw)})
        except Exception as e:
            logger.warning(f"BM25 scoring failed: {e}")
            return {}

    def semantic_scores(self, query_text: str) -> dict[str, float]:
        if not self.semantic_available or not query_text.strip():
            return {}
        try:
            qv = list(next(iter(self._embedder.embed([query_text]))))
            qn = math.sqrt(sum(x * x for x in qv)) or 1.0
            out: dict[str, float] = {}
            for cid, vec in zip(self.ids, self._vectors):
                vn = math.sqrt(sum(x * x for x in vec)) or 1.0
                cos = sum(a * b for a, b in zip(qv, vec)) / (qn * vn)
                # cosine on normalized embeddings is ~0..1 for related text; clamp for safety
                out[cid] = max(0.0, min(1.0, cos))
            return out
        except Exception as e:
            logger.warning(f"Semantic scoring failed: {e}")
            return {}

    @property
    def signals(self) -> dict[str, bool]:
        return {
            "structured": True,
            "lexical": self.lexical_available,
            "semantic": self.semantic_available,
        }
