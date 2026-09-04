/**
 * Backend corpus record -> screen view model.
 *
 * This mapping used to be inlined inside api.ts's live path, where it filled gaps with
 * plausible-sounding constants: relief "Reimbursement ordered", date "Recent", status
 * "Disposed", case_number = the case id. None of that came from the data.
 *
 * Rule here: map real fields to real fields, and leave anything the corpus does not contain
 * undefined so the screens hide the row. Derived labels (a title assembled from insurer +
 * condition) are fine because they are visibly derived, not asserted as record content.
 */

import type {
  CorpusCase,
  HistoricalCase,
  OutcomeCategory,
  RetrievalSignals,
  ScoreBreakdown,
  SimilarCaseMatch,
} from "../types/claim";
import { formatRejectionReason, isIllustrative } from "../types/claim";

const COURT_LABELS: Record<string, string> = {
  district_commission: "District Consumer Disputes Redressal Commission",
  state_commission: "State Consumer Disputes Redressal Commission",
  national_commission: "National Consumer Disputes Redressal Commission",
  ombudsman: "Insurance Ombudsman",
  high_court: "High Court",
  unknown: "Forum not recorded",
};

const OUTCOME_LABELS: Record<string, OutcomeCategory> = {
  policyholder_favorable: "Policyholder favorable",
  insurer_favorable: "Insurer favorable",
  partial_relief: "Partial relief",
};

function courtLabel(level?: string | null): string {
  if (!level) return COURT_LABELS.unknown;
  return COURT_LABELS[level] ?? level;
}

function outcomeLabel(outcome?: string | null): OutcomeCategory {
  if (!outcome) return "Unknown";
  return OUTCOME_LABELS[outcome] ?? "Unknown";
}

/** Derived display title. Visibly a label, not a claim about the record's contents. */
function derivedTitle(c: CorpusCase): string {
  const reason = formatRejectionReason(c.rejection_reason);
  const condition = c.condition && c.condition !== "unspecified" ? c.condition : null;
  return condition
    ? `${c.insurer} — ${condition} (${reason})`
    : `${c.insurer} — ${reason}`;
}

function nonEmpty(list?: string[] | null): string[] | undefined {
  return list && list.length ? list : undefined;
}

export function toHistoricalCase(c: CorpusCase): HistoricalCase {
  return {
    case_id: c.id,
    case_title: derivedTitle(c),
    court: courtLabel(c.court_level),
    jurisdiction: c.jurisdiction ?? undefined,
    insurer: c.insurer,
    insurance_type: c.insurance_type ?? "health",
    claim_amount: c.claim_amount ?? undefined,
    issue: c.condition && c.condition !== "unspecified" ? c.condition : undefined,
    denial_reason: c.rejection_reason ? formatRejectionReason(c.rejection_reason) : undefined,
    policy_clause: c.relevant_policy_clause ?? undefined,
    facts: c.decision_summary ?? undefined,
    policyholder_argument: c.successful_arguments?.[0] ?? undefined,
    insurer_argument: c.failed_arguments?.[0] ?? undefined,
    decision: c.decision_summary ?? undefined,
    outcome_category: outcomeLabel(c.outcome),
    source_url: c.source_url ?? undefined,
    source_citation: c.source_citation ?? undefined,
    successful_arguments: nonEmpty(c.successful_arguments),
    failed_arguments: nonEmpty(c.failed_arguments),
    key_evidence: nonEmpty(c.key_evidence),
    regulation_sources: nonEmpty(c.regulation_sources),
    insufficient_information: c.insufficient_information ?? false,
    is_illustrative: isIllustrative(c.source_citation),
    // Deliberately omitted — the corpus has no such fields:
    // case_number, date, relief, court_reasoning, case_status
  };
}

const EMPTY_BREAKDOWN: ScoreBreakdown = {
  legal_issue: 0,
  insurer: 0,
  factual: 0,
  claim_medical: 0,
  court_jurisdiction: 0,
  lexical: 0,
  semantic: 0,
};

const DEFAULT_SIGNALS: RetrievalSignals = {
  structured: true,
  lexical: false,
  semantic: false,
};

/** Backend SimilarCaseMatch -> view model. Scores pass through; nothing is defaulted upward. */
export function toSimilarCaseMatch(raw: {
  case: CorpusCase;
  overall_score?: number;
  score_breakdown?: Partial<ScoreBreakdown>;
  match_reasons?: string[];
  match_explanation?: Record<string, boolean>;
  retrieval_signals?: RetrievalSignals;
}): SimilarCaseMatch {
  return {
    case: toHistoricalCase(raw.case),
    similarity_score: Math.round((raw.overall_score ?? 0) * 100),
    score_breakdown: { ...EMPTY_BREAKDOWN, ...(raw.score_breakdown ?? {}) },
    match_reasons: raw.match_reasons ?? [],
    match_explanation: raw.match_explanation,
    retrieval_signals: raw.retrieval_signals ?? DEFAULT_SIGNALS,
  };
}
