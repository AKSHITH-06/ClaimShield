/**
 * Client-side similarity engine — the offline fallback for /similar-cases.
 *
 * Mirrors backend/app/core/similarity.py's structured factors and adds a token-overlap
 * lexical tier. It cannot run the backend's dense embedding tier in the browser, so it
 * reports semantic: false and redistributes that weight exactly the way the server does.
 * The UI shows the inactive tier rather than hiding the fact that ranking is degraded.
 */

import type {
  CorpusCase,
  RetrievalSignals,
  ScoreBreakdown,
  SimilarCaseMatch,
  ExtractedFingerprint,
} from "../types/claim";
import { toHistoricalCase } from "./adapters";

const BASE_WEIGHTS = {
  legal_issue: 0.3,
  insurer: 0.12,
  factual: 0.13,
  claim_medical: 0.08,
  court_jurisdiction: 0.04,
  lexical: 0.15,
  semantic: 0.18,
} as const;

const OPTIONAL_KEYS = ["lexical", "semantic"] as const;
const STRUCTURED_KEYS = [
  "legal_issue",
  "insurer",
  "factual",
  "claim_medical",
  "court_jurisdiction",
] as const;

/** Same redistribution rule as the server, so offline scores stay comparable to live ones. */
function resolveWeights(signals: RetrievalSignals): Record<string, number> {
  const weights: Record<string, number> = { ...BASE_WEIGHTS };
  const orphaned = OPTIONAL_KEYS.filter((k) => !signals[k]).reduce(
    (sum, k) => sum + BASE_WEIGHTS[k],
    0
  );
  if (orphaned <= 0) return weights;

  for (const k of OPTIONAL_KEYS) if (!signals[k]) weights[k] = 0;

  const live = OPTIONAL_KEYS.filter((k) => signals[k]);
  const targets: readonly string[] = live.length ? live : STRUCTURED_KEYS;
  const baseTotal = targets.reduce(
    (sum, k) => sum + BASE_WEIGHTS[k as keyof typeof BASE_WEIGHTS],
    0
  );
  for (const k of targets) {
    weights[k] += orphaned * (BASE_WEIGHTS[k as keyof typeof BASE_WEIGHTS] / baseTotal);
  }
  return weights;
}

function tokens(text?: string | null): Set<string> {
  return new Set(
    (text ?? "")
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 2)
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  a.forEach((t) => {
    if (b.has(t)) inter++;
  });
  const union = new Set([...a, ...b]).size;
  return union ? inter / union : 0;
}

/** Same fields the backend fuses into its retrievable document. */
function caseDocument(c: CorpusCase): string {
  return [
    c.condition,
    c.treatment_type,
    c.relevant_policy_clause,
    c.decision_summary,
    (c.successful_arguments ?? []).join(" "),
    (c.failed_arguments ?? []).join(" "),
    (c.key_evidence ?? []).join(" "),
    (c.rejection_reason ?? "").replace(/_/g, " "),
  ]
    .filter(Boolean)
    .join(" ");
}

function queryDocument(fp: ExtractedFingerprint): string {
  return [
    fp.condition,
    fp.treatment_type,
    fp.relevant_clause,
    (fp.rejection_reason ?? "").replace(/_/g, " "),
  ]
    .filter(Boolean)
    .join(" ");
}

function amountSimilarity(a?: number | null, b?: number | null): number {
  if (a == null || b == null) return 0.5; // neutral when unknown
  if (!a || !b) return 0;
  return Math.min(a, b) / Math.max(a, b);
}

export function rankCorpus(
  fingerprint: ExtractedFingerprint,
  corpus: CorpusCase[],
  topK = 5
): SimilarCaseMatch[] {
  const signals: RetrievalSignals = { structured: true, lexical: true, semantic: false };
  const weights = resolveWeights(signals);
  const queryTokens = tokens(queryDocument(fingerprint));

  // Normalise lexical scores by the best in this result set, matching the server's approach.
  const rawLexical = corpus.map((c) => jaccard(queryTokens, tokens(caseDocument(c))));
  const maxLexical = Math.max(...rawLexical, 0);

  const matches: SimilarCaseMatch[] = [];

  corpus.forEach((c, i) => {
    if (c.id === fingerprint.id) return;

    const scores: ScoreBreakdown = {
      legal_issue: 0,
      insurer: 0,
      factual: 0,
      claim_medical: 0,
      court_jurisdiction: 0,
      lexical: 0,
      semantic: 0,
    };
    const reasons: string[] = [];

    if (fingerprint.rejection_reason && fingerprint.rejection_reason === c.rejection_reason) {
      scores.legal_issue = 1;
      reasons.push(`Same denial category (${c.rejection_reason})`);
    }

    if (fingerprint.insurer?.trim().toLowerCase() === c.insurer?.trim().toLowerCase()) {
      scores.insurer = 1;
      reasons.push("Same insurer");
    }

    let factual = 0;
    if (fingerprint.condition?.trim().toLowerCase() === c.condition?.trim().toLowerCase()) {
      factual += 0.7;
      reasons.push(`Same medical condition (${c.condition})`);
    }
    if (
      fingerprint.treatment_type &&
      c.treatment_type &&
      fingerprint.treatment_type.trim().toLowerCase() === c.treatment_type.trim().toLowerCase()
    ) {
      factual += 0.3;
    }
    scores.factual = Math.min(factual, 1);

    scores.claim_medical = amountSimilarity(fingerprint.claim_amount, c.claim_amount);

    if (fingerprint.court_level && fingerprint.court_level === c.court_level) {
      scores.court_jurisdiction = 1;
    } else if (fingerprint.jurisdiction && fingerprint.jurisdiction === c.jurisdiction) {
      scores.court_jurisdiction = 0.5;
    }

    scores.lexical = maxLexical > 0 ? rawLexical[i] / maxLexical : 0;
    if (scores.lexical >= 0.6) reasons.push("Strong terminology overlap in case record");

    const overall = (Object.keys(scores) as (keyof ScoreBreakdown)[]).reduce(
      (sum, k) => sum + scores[k] * (weights[k] ?? 0),
      0
    );

    matches.push({
      case: toHistoricalCase(c),
      similarity_score: Math.round(overall * 100),
      score_breakdown: scores,
      match_reasons: reasons.length ? reasons : ["Some factual overlap, but limited direct match"],
      match_explanation: {
        same_insurer: scores.insurer >= 1,
        same_reason: scores.legal_issue === 1,
        similar_clause: scores.lexical >= 0.6 || scores.legal_issue === 1,
        similar_facts: scores.factual >= 0.4 && scores.claim_medical >= 0.5,
      },
      retrieval_signals: signals,
    });
  });

  matches.sort((a, b) => b.similarity_score - a.similarity_score);
  return matches.slice(0, topK);
}
