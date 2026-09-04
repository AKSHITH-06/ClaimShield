import React from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookMarked,
  FileCheck2,
  FileWarning,
  Gavel,
  Info,
  ShieldAlert,
  Swords,
  Target,
} from "lucide-react";
import type {
  CaseAssessment,
  CaseIntelligence,
  ExtractedFingerprint,
  SimilarCaseMatch,
} from "../../types/claim";
import { formatRejectionReason, getOutcomeBucket, getVerdictDisplay } from "../../types/claim";
import { ClaimList, GroundingAudit, TierPills } from "../EvidenceLedger";

interface Props {
  userFingerprint: ExtractedFingerprint;
  selectedMatch: SimilarCaseMatch;
  intelligence: CaseIntelligence;
  assessment: CaseAssessment | null;
  onProceedToAppeal: () => void;
  onBack: () => void;
}

const Field: React.FC<{ label: string; value?: string | number | null }> = ({ label, value }) => {
  // A field the corpus does not contain is hidden, not filled with a plausible default.
  if (value === undefined || value === null || value === "") return null;
  return (
    <div>
      <span className="eyebrow" style={{ display: "block", marginBottom: 3 }}>
        {label}
      </span>
      <span style={{ fontSize: "0.88rem" }}>{value}</span>
    </div>
  );
};

export const CaseDetailScreen: React.FC<Props> = ({
  userFingerprint,
  selectedMatch,
  intelligence,
  assessment,
  onProceedToAppeal,
  onBack,
}) => {
  const record = selectedMatch.case;
  const outcome = getOutcomeBucket(record.outcome_category);
  const declined = intelligence.grounding_report.declined;
  const verdict = assessment ? getVerdictDisplay(assessment.verdict) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div className="glass-card">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div style={{ minWidth: 280, flex: 1 }}>
            <div
              className="eyebrow"
              style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}
            >
              <Gavel size={14} /> Case Intelligence · {record.case_id}
            </div>
            <h2 style={{ fontSize: "1.4rem", fontWeight: 800, lineHeight: 1.3 }}>
              {record.case_title}
            </h2>
            <div
              style={{
                display: "flex",
                gap: 10,
                alignItems: "center",
                marginTop: 10,
                flexWrap: "wrap",
              }}
            >
              <span className={outcome.badgeClass}>{outcome.label}</span>
              {verdict && <span className={verdict.pillClass}>{verdict.label}</span>}
              <TierPills signals={selectedMatch.retrieval_signals} />
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn-secondary" onClick={onBack}>
              <ArrowLeft size={15} /> <span>Back to Matches</span>
            </button>
            <button
              className="btn-primary"
              onClick={onProceedToAppeal}
              disabled={declined}
              title={
                declined
                  ? "This case has incomplete records and cannot be cited as precedent"
                  : "Draft a grievance letter citing this precedent"
              }
            >
              <span>Generate Grounded Appeal</span> <ArrowRight size={15} />
            </button>
          </div>
        </div>

        <hr className="divider" />

        {/* The Evidence Ledger headline */}
        <GroundingAudit report={intelligence.grounding_report} note={intelligence.grounding_note} />
      </div>

      {/* Declined state takes over the screen — nothing below it would be honest */}
      {declined ? (
        <div className="glass-card">
          <div className="notice warn" style={{ marginBottom: 16 }}>
            <ShieldAlert size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <strong>The system declined to analyse this case.</strong>
              <p style={{ marginTop: 6, color: "var(--text-muted)" }}>
                {intelligence.why_outcome_happened}
              </p>
            </div>
          </div>
          <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
            No AI call was made for this record. Rather than generate confident-sounding
            reasoning from an incomplete file, the system reports that it cannot answer. Go back
            and choose a case with complete records to continue.
          </p>
          <div style={{ marginTop: 16 }}>
            <button className="btn-secondary" onClick={onBack}>
              <ArrowLeft size={15} /> <span>Choose another case</span>
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Side-by-side comparison */}
          <div className="glass-card">
            <div className="eyebrow" style={{ marginBottom: 14 }}>
              Your Case vs This Precedent
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                gap: 20,
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <span style={{ fontSize: "0.8rem", fontWeight: 700 }}>Your claim</span>
                <Field label="Insurer" value={userFingerprint.insurer} />
                <Field
                  label="Claim amount"
                  value={
                    userFingerprint.claim_amount
                      ? `₹${userFingerprint.claim_amount.toLocaleString("en-IN")}`
                      : null
                  }
                />
                <Field
                  label="Denial category"
                  value={formatRejectionReason(userFingerprint.rejection_reason)}
                />
                <Field label="Condition" value={userFingerprint.condition} />
                <Field label="Clause invoked" value={userFingerprint.relevant_clause} />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <span style={{ fontSize: "0.8rem", fontWeight: 700 }}>This precedent</span>
                <Field label="Insurer" value={record.insurer} />
                <Field
                  label="Claim amount"
                  value={
                    record.claim_amount ? `₹${record.claim_amount.toLocaleString("en-IN")}` : null
                  }
                />
                <Field label="Denial category" value={record.denial_reason} />
                <Field label="Condition" value={record.issue} />
                <Field label="Clause invoked" value={record.policy_clause} />
                <Field label="Forum" value={record.court} />
                <Field label="Jurisdiction" value={record.jurisdiction} />
              </div>
            </div>

            {record.is_illustrative && (
              <div className="notice info" style={{ marginTop: 18 }}>
                <Info size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>
                  This is an <strong>illustrative case record</strong> built for the MVP corpus,
                  not a verified published judgment. The regulatory provisions cited below are
                  real; the case narrative is representative. Verify before relying on it.
                </span>
              </div>
            )}
          </div>

          {/* Assessment */}
          {assessment && (
            <div className="glass-card">
              <div
                className="eyebrow"
                style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}
              >
                <Target size={14} /> <span>Comparable-Case Assessment</span>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <span className={verdict!.pillClass}>{verdict!.label}</span>
                <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                  confidence: {assessment.confidence} · {assessment.cases_considered.length} cases
                  considered
                </span>
              </div>
              <p style={{ fontSize: "0.88rem", marginTop: 12 }}>{assessment.reasoning}</p>

              {Object.keys(assessment.outcome_distribution).length > 0 && (
                <div
                  style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}
                >
                  {Object.entries(assessment.outcome_distribution).map(([k, n]) => {
                    const b = getOutcomeBucket(k);
                    return (
                      <span key={k} className={b.badgeClass}>
                        {b.label}: {n}
                      </span>
                    );
                  })}
                </div>
              )}

              {assessment.supporting_claims.length > 0 && (
                <>
                  <hr className="divider" />
                  <GroundingAudit report={assessment.grounding_report} />
                </>
              )}
            </div>
          )}

          {/* Why the outcome happened */}
          <div className="glass-card">
            <div
              className="eyebrow"
              style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}
            >
              <Gavel size={14} /> <span>Why This Case Was Decided This Way</span>
            </div>
            <p style={{ fontSize: "0.9rem", marginBottom: 4 }}>
              {intelligence.why_outcome_happened}
            </p>
            {intelligence.why_outcome_claims.map((c, i) => (
              <div key={i} style={{ marginTop: 8 }}>
                <ClaimList title="" claims={[c]} emptyMessage="" />
              </div>
            ))}
          </div>

          <ClaimList
            title="Arguments That Worked"
            icon={<FileCheck2 size={14} />}
            claims={intelligence.successful_arguments}
            emptyMessage="No argument in this record could be cited, so none are shown."
          />

          <ClaimList
            title="Evidence That Mattered"
            icon={<BookMarked size={14} />}
            claims={intelligence.evidence_that_mattered}
            emptyMessage="No evidence item in this record could be cited."
          />

          {/* What the user actually supplied */}
          <div className="glass-card">
            <div
              className="eyebrow"
              style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}
            >
              <FileCheck2 size={14} /> <span>Documents You Have Supplied</span>
            </div>
            {intelligence.evidence_you_have.length === 0 ? (
              <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                You have not listed any documents yet, so the gap analysis below compares against
                an empty set. Add your documents on the upload step for a sharper comparison.
              </p>
            ) : (
              <ul style={{ paddingLeft: 20, fontSize: "0.88rem" }}>
                {intelligence.evidence_you_have.map((d, i) => (
                  <li key={i} style={{ marginBottom: 4 }}>
                    {d}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <ClaimList
            title="Evidence You Appear To Be Missing"
            icon={<FileWarning size={14} />}
            claims={intelligence.missing_evidence}
            emptyMessage="No gap was identified against this record's evidence list."
          />

          <ClaimList
            title="What The Insurer Is Likely To Argue"
            icon={<Swords size={14} />}
            claims={intelligence.likely_insurer_counterarguments}
            emptyMessage="No counterargument could be grounded in this record."
          />

          {/* Real regulatory basis, kept separate from the illustrative case narrative */}
          {record.regulation_sources && record.regulation_sources.length > 0 && (
            <div className="glass-card">
              <div
                className="eyebrow"
                style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}
              >
                <BookMarked size={14} /> <span>Regulatory Basis (verifiable)</span>
              </div>
              <ul style={{ paddingLeft: 20, fontSize: "0.86rem" }}>
                {record.regulation_sources.map((r, i) => (
                  <li key={i} style={{ marginBottom: 6 }}>
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="disclaimer-bar">
            <Info size={14} style={{ flexShrink: 0 }} />
            <span>
              ClaimShield is decision support, not legal advice. It does not predict what a court
              will decide, and it does not represent you.
            </span>
          </div>
        </>
      )}
    </div>
  );
};
