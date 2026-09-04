/**
 * ClaimShield core data types.
 *
 * Mirrors backend/app/core/schema.py. Fields the backend cannot supply are optional here and
 * render as hidden rather than filled with plausible-looking defaults — an empty row is
 * honest, a fabricated one is not.
 */

export type OutcomeCategory =
  | "Policyholder favorable"
  | "Insurer favorable"
  | "Partial relief"
  | "Unknown";

export type OutcomeBucket = "favorable" | "partial" | "unfavorable";

/* ─── Evidence Ledger ──────────────────────────────────────────────────── */

/** Where a claim came from. Validated server-side against the corpus record. */
export interface Provenance {
  case_id: string;
  field: string;
  quoted_span: string;
}

/**
 * One assertion, carrying its own provenance.
 * verified === false means the backend's grounding validator could not trace it — render it
 * as unverified, never as established fact.
 */
export interface GroundedClaim {
  text: string;
  rationale?: string | null;
  provenance?: Provenance | null;
  verified: boolean;
  kind: "grounded" | "prediction";
}

export interface GroundingReport {
  total: number;
  verified: number;
  unverified: number;
  coverage_pct: number;
  /** True when the system refused to answer rather than producing ungrounded text. */
  declined: boolean;
}

/* ─── Cases ────────────────────────────────────────────────────────────── */

/** The canonical corpus record, as served by the backend. */
export interface CorpusCase {
  id: string;
  insurer: string;
  insurance_type: string;
  claim_amount?: number | null;
  rejection_reason?: string | null;
  condition: string;
  treatment_type?: string | null;
  policy_start_date?: string | null;
  hospitalization_date?: string | null;
  claim_date?: string | null;
  claim_status?: string | null;
  relevant_policy_clause?: string | null;
  disclosure_issue?: boolean;
  documentation_issue?: boolean;
  court_level?: string;
  jurisdiction?: string | null;
  outcome?: string | null;
  decision_summary?: string | null;
  successful_arguments?: string[] | null;
  failed_arguments?: string[] | null;
  key_evidence?: string[] | null;
  regulation_sources?: string[] | null;
  source_citation?: string | null;
  source_url?: string | null;
  insufficient_information?: boolean;
}

/** View model for the case screens. Unknown fields stay undefined so the UI can hide them. */
export interface HistoricalCase {
  case_id: string;
  case_title: string;
  court: string;
  jurisdiction?: string;
  insurer: string;
  insurance_type: string;
  claim_amount?: number;
  issue?: string;
  denial_reason?: string;
  policy_clause?: string;
  facts?: string;
  policyholder_argument?: string;
  insurer_argument?: string;
  decision?: string;
  outcome_category: OutcomeCategory;
  source_url?: string;
  source_citation?: string;
  successful_arguments?: string[];
  failed_arguments?: string[];
  key_evidence?: string[];
  regulation_sources?: string[];
  insufficient_information?: boolean;
  /** True when this record is illustrative rather than a verified real judgment. */
  is_illustrative?: boolean;
  // Not present in the corpus. Kept optional so screens hide the row instead of inventing.
  case_number?: string;
  date?: string;
  relief?: string;
  court_reasoning?: string;
  case_status?: string;
}

export interface ExtractedFingerprint {
  id?: string;
  insurer: string;
  insurance_type: "health";
  claim_amount: number;
  rejection_reason: string;
  condition: string;
  treatment_type?: string;
  policy_start_date: string;
  hospitalization_date: string;
  claim_date?: string;
  claim_status: string;
  relevant_clause?: string;
  court_level?: string;
  jurisdiction?: string;
  disclosure_issue?: boolean;
  documentation_issue?: boolean;
  field_confidence?: Record<string, "high" | "medium" | "low">;
  field_source_quote?: Record<string, string>;
  fields_needing_review?: string[];
}

export interface ScoreBreakdown {
  legal_issue: number;
  insurer: number;
  factual: number;
  claim_medical: number;
  court_jurisdiction: number;
  lexical: number;
  semantic: number;
}

/** Which retrieval tiers contributed. A false tier means degraded ranking, shown not hidden. */
export interface RetrievalSignals {
  structured: boolean;
  lexical: boolean;
  semantic: boolean;
}

export interface SimilarCaseMatch {
  case: HistoricalCase;
  similarity_score: number; // 0-100
  score_breakdown: ScoreBreakdown;
  match_reasons: string[];
  match_explanation?: Record<string, boolean>;
  retrieval_signals?: RetrievalSignals;
}

/* ─── Intelligence & assessment ───────────────────────────────────────── */

export interface CaseIntelligence {
  case_id: string;
  outcome: string;
  why_outcome_happened: string;
  why_outcome_claims: GroundedClaim[];
  successful_arguments: GroundedClaim[];
  evidence_that_mattered: GroundedClaim[];
  missing_evidence: GroundedClaim[];
  likely_insurer_counterarguments: GroundedClaim[];
  evidence_you_have: string[];
  grounding_note: string;
  grounding_report: GroundingReport;
}

export type AssessmentVerdict =
  | "potentially_challengeable"
  | "likely_consistent"
  | "insufficient_information";

export interface CaseAssessment {
  verdict: AssessmentVerdict;
  reasoning: string;
  confidence: string;
  supporting_claims: GroundedClaim[];
  outcome_distribution: Record<string, number>;
  cases_considered: string[];
  grounding_report: GroundingReport;
}

export interface AppealResult {
  letter_markdown: string;
  action_plan: string[];
  citations_used: string[];
  precedents_cited: string[];
  precedents_excluded: string[];
  generated_by?: "llm" | "template_fallback";
}

export interface IngestResult {
  filename: string;
  kind: "pdf" | "text";
  pages: number;
  chars: number;
  text: string;
}

/* ─── Shared display helpers ──────────────────────────────────────────── */

/**
 * Single mapping from outcome to colour bucket. Every screen imports this so a new outcome
 * value in the corpus does not require touching four components.
 */
export function getOutcomeBucket(outcome: string): {
  bucket: OutcomeBucket;
  label: string;
  colorVar: string;
  badgeClass: string;
} {
  const norm = (outcome || "").toLowerCase();

  if (norm.includes("policyholder_favorable") || norm.includes("policyholder favorable")) {
    return {
      bucket: "favorable",
      label: "Policyholder Favorable",
      colorVar: "var(--favorable)",
      badgeClass: "badge-favorable",
    };
  }
  if (norm.includes("insurer_favorable") || norm.includes("insurer favorable")) {
    return {
      bucket: "unfavorable",
      label: "Insurer Favorable",
      colorVar: "var(--unfavorable)",
      badgeClass: "badge-unfavorable",
    };
  }
  if (norm.includes("partial")) {
    return {
      bucket: "partial",
      label: "Partial Relief",
      colorVar: "var(--partial)",
      badgeClass: "badge-partial",
    };
  }
  return {
    bucket: "partial",
    label: outcome ? "Unknown" : "No Recorded Outcome",
    colorVar: "var(--text-muted)",
    badgeClass: "badge-partial",
  };
}

export function getVerdictDisplay(verdict: AssessmentVerdict): {
  label: string;
  pillClass: string;
} {
  switch (verdict) {
    case "potentially_challengeable":
      return { label: "Potentially Challengeable", pillClass: "assessment-pill challengeable" };
    case "likely_consistent":
      return { label: "Likely Consistent With Policy", pillClass: "assessment-pill consistent" };
    default:
      return { label: "Insufficient Information", pillClass: "assessment-pill insufficient" };
  }
}

/** Human label for a denial category enum value. */
export function formatRejectionReason(reason?: string | null): string {
  if (!reason) return "Not determined";
  return reason
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** A corpus citation marked illustrative must never be presented as a verified judgment. */
export function isIllustrative(citation?: string | null): boolean {
  const t = (citation || "").toLowerCase();
  return t.includes("illustrative") || t.includes("synthetic");
}
