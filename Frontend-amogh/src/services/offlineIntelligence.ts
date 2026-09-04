/**
 * Offline intelligence — record passthrough, not fake AI.
 *
 * When the backend is unreachable the app must still render something, but the previous
 * approach replayed pre-baked "hero" responses regardless of which case the user had
 * selected. That is fabricated output.
 *
 * Instead: the corpus record already contains the analysis fields (decision_summary,
 * successful_arguments, key_evidence, failed_arguments). Offline mode surfaces those
 * DIRECTLY, each carrying provenance pointing at the exact field it was copied from. Every
 * claim is therefore verified by construction — it is literally the record's own text, with
 * no synthesis. The UI labels this mode so nobody mistakes it for AI reasoning.
 */

import type {
  CaseAssessment,
  CaseIntelligence,
  CorpusCase,
  GroundedClaim,
  GroundingReport,
  AssessmentVerdict,
} from "../types/claim";

function claim(
  text: string,
  caseId: string,
  field: string,
  rationale?: string,
  kind: "grounded" | "prediction" = "grounded"
): GroundedClaim {
  return {
    text,
    rationale: rationale ?? null,
    // The span IS the text — it was copied verbatim out of this field.
    provenance: { case_id: caseId, field, quoted_span: text },
    verified: true,
    kind,
  };
}

function report(groups: GroundedClaim[][], declined = false): GroundingReport {
  if (declined) {
    return { total: 0, verified: 0, unverified: 0, coverage_pct: 0, declined: true };
  }
  const grounded = groups.flat().filter((c) => c.kind === "grounded");
  const verified = grounded.filter((c) => c.verified).length;
  return {
    total: grounded.length,
    verified,
    unverified: grounded.length - verified,
    coverage_pct: grounded.length ? Math.round((1000 * verified) / grounded.length) / 10 : 0,
    declined: false,
  };
}

export function offlineCaseIntelligence(
  record: CorpusCase,
  userDocuments: string[]
): CaseIntelligence {
  const id = record.id;

  if (record.insufficient_information) {
    return {
      case_id: id,
      outcome: record.outcome ?? "unknown",
      why_outcome_happened:
        "Insufficient information. The records for this case are incomplete, so the available " +
        "documents do not support a reliable explanation of which arguments or evidence were " +
        "decisive. Treating this case as a precedent for your appeal would not be appropriate.",
      why_outcome_claims: [],
      successful_arguments: [],
      evidence_that_mattered: [],
      missing_evidence: [],
      likely_insurer_counterarguments: [],
      evidence_you_have: userDocuments,
      grounding_note:
        "insufficient_information — this case was flagged as having incomplete records. " +
        "No analysis was generated.",
      grounding_report: report([], true),
    };
  }

  const why = record.decision_summary
    ? [claim(record.decision_summary, id, "decision_summary")]
    : [];
  const args = (record.successful_arguments ?? []).map((a) =>
    claim(a, id, "successful_arguments")
  );
  const evidence = (record.key_evidence ?? []).map((e) => claim(e, id, "key_evidence"));

  // Evidence the user has not listed is a genuine gap. Compared by loose token match rather
  // than exact string, since the user's document labels will not match corpus wording.
  const have = userDocuments.map((d) => d.toLowerCase());
  const gaps = (record.key_evidence ?? [])
    .filter((e) => {
      const words = e.toLowerCase().split(/\W+/).filter((w) => w.length > 4);
      return !have.some((h) => words.some((w) => h.includes(w)));
    })
    .map((e) =>
      claim(
        e,
        id,
        "key_evidence",
        "This mattered in the comparable case and is not among the documents you listed."
      )
    );

  const counters = (record.failed_arguments ?? []).map((f) =>
    claim(
      f,
      id,
      "failed_arguments",
      "This line of argument did not succeed in the comparable case.",
      "prediction"
    )
  );

  return {
    case_id: id,
    outcome: record.outcome ?? "unknown",
    why_outcome_happened:
      record.decision_summary ??
      "No decision summary is recorded for this case.",
    why_outcome_claims: why,
    successful_arguments: args,
    evidence_that_mattered: evidence,
    missing_evidence: gaps,
    likely_insurer_counterarguments: counters,
    evidence_you_have: userDocuments,
    grounding_note:
      "Offline mode — every point below is copied verbatim from the case record, with no AI " +
      "synthesis. Provenance is exact by construction.",
    grounding_report: report([why, args, evidence, gaps]),
  };
}

/**
 * Offline assessment from the outcome distribution.
 *
 * Pure arithmetic over corpus outcomes plus one stated rule, so the verdict is reproducible
 * and explainable. No model involved, and the reasoning text says exactly that.
 */
export function offlineAssessment(records: CorpusCase[]): CaseAssessment {
  const usable = records.filter((r) => !r.insufficient_information);

  const distribution: Record<string, number> = {};
  for (const r of usable) {
    const key = r.outcome ?? "unknown";
    distribution[key] = (distribution[key] ?? 0) + 1;
  }

  if (!usable.length) {
    return {
      verdict: "insufficient_information",
      reasoning:
        "No matched case carries complete enough records to support an assessment.",
      confidence: "low",
      supporting_claims: [],
      outcome_distribution: distribution,
      cases_considered: records.map((r) => r.id),
      grounding_report: report([], true),
    };
  }

  const favorable = distribution["policyholder_favorable"] ?? 0;
  const partial = distribution["partial_relief"] ?? 0;
  const against = distribution["insurer_favorable"] ?? 0;
  const forUser = favorable + partial;

  let verdict: AssessmentVerdict;
  if (forUser > against) verdict = "potentially_challengeable";
  else if (against > forUser) verdict = "likely_consistent";
  else verdict = "insufficient_information";

  const claims = usable
    .filter((r) => r.decision_summary)
    .slice(0, 3)
    .map((r) => claim(r.decision_summary as string, r.id, "decision_summary"));

  return {
    verdict,
    reasoning:
      `Of ${usable.length} comparable records, ${favorable} were decided in the policyholder's ` +
      `favour, ${partial} resulted in partial relief, and ${against} favoured the insurer. ` +
      `This verdict is computed from that distribution by counting outcomes — it is not an ` +
      `AI judgement, and it is not a prediction about your case.`,
    confidence: usable.length >= 4 ? "medium" : "low",
    supporting_claims: claims,
    outcome_distribution: distribution,
    cases_considered: usable.map((r) => r.id),
    grounding_report: report([claims]),
  };
}

/** Client-side appeal letter. Cites only real regulatory instruments from the corpus record. */
export function offlineAppeal(
  fingerprint: { insurer: string; condition: string; claim_amount: number; rejection_reason: string },
  precedents: CorpusCase[],
  missingEvidence: string[]
) {
  const citable = precedents.filter((p) => !p.insufficient_information);
  const regs = Array.from(new Set(citable.flatMap((p) => p.regulation_sources ?? [])));
  const amount = fingerprint.claim_amount
    ? `₹${fingerprint.claim_amount.toLocaleString("en-IN")}`
    : "the claimed amount";

  const letter = `To,
The Grievance Redressal Officer,
${fingerprint.insurer}

Subject: Formal Grievance — Repudiation of Health Insurance Claim for ${fingerprint.condition}

Dear Sir/Madam,

I write to formally contest the repudiation of my health insurance claim of ${amount} for \
treatment of ${fingerprint.condition}.

I submit that this repudiation is not consistent with the terms of my policy or with \
applicable regulatory requirements, and I request a thorough and impartial review.

I draw your attention to the following regulatory provisions:
${regs.map((r) => `  • ${r}`).join("\n") || "  • Insurance Ombudsman Rules, 2017"}

${missingEvidence.length ? `I am arranging the following additional documentation, which will be submitted separately:\n${missingEvidence.map((m) => `  • ${m}`).join("\n")}\n` : ""}
I request settlement of my claim in full within 15 days of receipt of this letter. Should \
this grievance not be resolved satisfactorily, I reserve the right to escalate to the \
Insurance Ombudsman and to the appropriate consumer commission.

Yours faithfully,
[Policyholder Name]
[Policy Number]
[Date]
[Contact details]`;

  return {
    letter_markdown: letter,
    action_plan: [
      "Submit this letter to the insurer's Grievance Redressal Officer by registered post and/or email. Retain proof of submission.",
      "If there is no response or an unsatisfactory response within 15 days, escalate to the Insurance Ombudsman at https://bimabharosa.irdai.gov.in/.",
      "File a complaint on the IRDAI Bima Bharosa portal if the ombudsman route does not apply to your case.",
      "If the ombudsman ruling is unfavourable, consider the consumer commission route under the Consumer Protection Act, 2019.",
      "Keep copies of all correspondence with timestamps.",
    ],
    citations_used: regs,
    precedents_cited: citable.map((p) => p.id),
    precedents_excluded: precedents.filter((p) => p.insufficient_information).map((p) => p.id),
    generated_by: "template_fallback" as const,
  };
}
