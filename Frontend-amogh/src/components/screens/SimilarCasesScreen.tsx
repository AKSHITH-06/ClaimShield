import React, { useState, useMemo } from "react";
import type {
  CaseAssessment,
  SimilarCaseMatch,
  ExtractedFingerprint,
} from "../../types/claim";
import { GroundingAudit, TierPills } from "../EvidenceLedger";
import { getOutcomeBucket, getVerdictDisplay } from "../../types/claim";
import {
  Sparkles,
  ChevronDown,
  ChevronUp,
  Scale,
  ArrowRight,
  Filter,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

interface SimilarCasesScreenProps {
  fingerprint: ExtractedFingerprint;
  matches: SimilarCaseMatch[];
  assessment: CaseAssessment | null;
  onSelectCase: (match: SimilarCaseMatch) => void;
  onBack: () => void;
}

export const SimilarCasesScreen: React.FC<SimilarCasesScreenProps> = ({
  fingerprint,
  matches,
  assessment,
  onSelectCase,
  onBack,
}) => {
  const [expandedCaseId, setExpandedCaseId] = useState<string | null>(
    matches[0]?.case.case_id || null
  );
  const [outcomeFilter, setOutcomeFilter] = useState<string>("all");
  const [insurerFilter, setInsurerFilter] = useState<string>("all");

  const outcomeStats = useMemo(() => {
    let favorable = 0, partial = 0, unfavorable = 0;
    matches.forEach((m) => {
      const bucket = getOutcomeBucket(m.case.outcome_category).bucket;
      if (bucket === "favorable") favorable++;
      else if (bucket === "partial") partial++;
      else unfavorable++;
    });
    return { total: matches.length, favorable, partial, unfavorable };
  }, [matches]);

  const uniqueInsurers = useMemo(
    () => Array.from(new Set(matches.map((m) => m.case.insurer))),
    [matches]
  );

  const filteredMatches = useMemo(() => {
    return matches.filter((m) => {
      const bucket = getOutcomeBucket(m.case.outcome_category).bucket;
      if (outcomeFilter !== "all" && bucket !== outcomeFilter) return false;
      if (insurerFilter !== "all" && m.case.insurer !== insurerFilter) return false;
      return true;
    });
  }, [matches, outcomeFilter, insurerFilter]);

  const toggleAccordion = (id: string) => {
    setExpandedCaseId(expandedCaseId === id ? null : id);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Hero Header & Outcome Summary Banner */}
      <div className="glass-card">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            flexWrap: "wrap",
            gap: "16px",
          }}
        >
          <div>
            <div
              className="eyebrow"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                marginBottom: "6px",
              }}
            >
              <Sparkles size={14} /> Precedent Retrieval Engine
            </div>
            <h2 style={{ fontSize: "1.6rem", fontWeight: 800, color: "var(--text)" }}>
              Precedent Analysis: {matches.length} Similar Disputes Found
            </h2>
            <p style={{ color: "var(--text-muted)", fontSize: "0.92rem", marginTop: "4px" }}>
              Matched against active dispute:{" "}
              <strong>{fingerprint.insurer}</strong> •{" "}
              <span>{fingerprint.condition}</span> •{" "}
              <span>{fingerprint.rejection_reason}</span>
            </p>
          </div>

          {/* Outcome Metric Counters — colored numbers allowed (carry outcome meaning) */}
          <div
            style={{
              display: "flex",
              gap: "12px",
              background: "var(--bg)",
              padding: "10px 16px",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border)",
            }}
          >
            <div style={{ textAlign: "center", padding: "0 10px" }}>
              <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "var(--favorable)" }}>
                {outcomeStats.favorable}
              </div>
              <div className="eyebrow">Favorable</div>
            </div>
            <div style={{ width: "1px", background: "var(--border)", alignSelf: "stretch" }} />
            <div style={{ textAlign: "center", padding: "0 10px" }}>
              <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "var(--partial)" }}>
                {outcomeStats.partial}
              </div>
              <div className="eyebrow">Partial Relief</div>
            </div>
            <div style={{ width: "1px", background: "var(--border)", alignSelf: "stretch" }} />
            <div style={{ textAlign: "center", padding: "0 10px" }}>
              <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "var(--unfavorable)" }}>
                {outcomeStats.unfavorable}
              </div>
              <div className="eyebrow">Insurer Favored</div>
            </div>
          </div>
        </div>
      </div>

      {/* Comparable-case assessment over the whole matched set */}
      {assessment && (
        <div className="glass-card">
          <div
            className="eyebrow"
            style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}
          >
            <span>Comparable-Case Assessment</span>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span className={getVerdictDisplay(assessment.verdict).pillClass}>
              {getVerdictDisplay(assessment.verdict).label}
            </span>
            <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
              confidence: {assessment.confidence} · {assessment.cases_considered.length} cases
              considered
            </span>
          </div>
          <p style={{ fontSize: "0.88rem", marginTop: 12 }}>{assessment.reasoning}</p>
          <div style={{ marginTop: 14 }}>
            <GroundingAudit report={assessment.grounding_report} />
          </div>
          <p style={{ fontSize: "0.74rem", color: "var(--text-muted)", marginTop: 10 }}>
            This describes what comparable records show. It is not a prediction about your case
            and not a win probability.
          </p>
        </div>
      )}

      {/* Filter Bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "12px",
          background: "var(--surface)",
          padding: "12px 18px",
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--border)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <Filter size={15} style={{ color: "var(--text-muted)" }} />
          <span className="eyebrow">Filter By:</span>

          <select
            className="form-input"
            style={{ width: "auto", padding: "6px 12px", fontSize: "0.84rem" }}
            value={outcomeFilter}
            onChange={(e) => setOutcomeFilter(e.target.value)}
          >
            <option value="all">All Outcomes ({matches.length})</option>
            <option value="favorable">Policyholder Favorable ({outcomeStats.favorable})</option>
            <option value="partial">Partial Relief ({outcomeStats.partial})</option>
            <option value="unfavorable">Insurer Favorable ({outcomeStats.unfavorable})</option>
          </select>

          <select
            className="form-input"
            style={{ width: "auto", padding: "6px 12px", fontSize: "0.84rem" }}
            value={insurerFilter}
            onChange={(e) => setInsurerFilter(e.target.value)}
          >
            <option value="all">All Insurers</option>
            {uniqueInsurers.map((ins) => (
              <option key={ins} value={ins}>{ins}</option>
            ))}
          </select>
        </div>

        <div style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
          Showing {filteredMatches.length} of {matches.length} matches
        </div>
      </div>

      {/* Match Cards List */}
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {filteredMatches.length === 0 ? (
          <div className="glass-card" style={{ textAlign: "center", padding: "48px 20px" }}>
            <AlertCircle size={32} style={{ color: "var(--text-muted)", marginBottom: "12px" }} />
            <h3 style={{ fontSize: "1.1rem", marginBottom: "8px" }}>
              No Precedents Match Selected Filters
            </h3>
            <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
              Try resetting the outcome or insurer filter to inspect all retrieved cases.
            </p>
            <button
              className="btn-secondary"
              style={{ marginTop: "16px" }}
              onClick={() => { setOutcomeFilter("all"); setInsurerFilter("all"); }}
            >
              Reset Filters
            </button>
          </div>
        ) : (
          filteredMatches.map((match) => {
            const isExpanded = expandedCaseId === match.case.case_id;
            const outcomeBucket = getOutcomeBucket(match.case.outcome_category);

            return (
              <div
                key={match.case.case_id}
                className="glass-card"
                style={{ position: "relative", padding: "20px 24px" }}
              >
                {/* Card Top Row */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: "16px",
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ flex: 1, minWidth: "280px" }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        marginBottom: "8px",
                        flexWrap: "wrap",
                      }}
                    >
                      {/* Outcome badge — dot+pill, the only colored element */}
                      <span className={outcomeBucket.badgeClass}>
                        {match.case.outcome_category}
                      </span>
                      <span
                        style={{
                          fontSize: "0.78rem",
                          color: "var(--text-muted)",
                          fontFamily: "var(--font-mono)",
                        }}
                      >
                        {match.case.case_number} • {match.case.court} ({match.case.date})
                      </span>
                    </div>

                    <h3
                      style={{
                        fontSize: "1.1rem",
                        fontWeight: 700,
                        color: "var(--text)",
                        marginBottom: "6px",
                      }}
                    >
                      {match.case.case_title}
                    </h3>

                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                        flexWrap: "wrap",
                        alignItems: "center",
                        marginBottom: 8,
                      }}
                    >
                      <TierPills signals={match.retrieval_signals} />
                      {match.case.insufficient_information && (
                        <span
                          className="badge-partial"
                          title="This record is incomplete — the system will decline to analyse it"
                        >
                          Incomplete records
                        </span>
                      )}
                      {match.case.is_illustrative && (
                        <span
                          style={{
                            fontSize: "0.7rem",
                            color: "var(--text-muted)",
                            border: "1px solid var(--border)",
                            borderRadius: "var(--radius-full)",
                            padding: "2px 8px",
                          }}
                          title="Illustrative MVP record, not a verified published judgment"
                        >
                          illustrative
                        </span>
                      )}
                    </div>

                    <p style={{ color: "var(--text-muted)", fontSize: "0.88rem", lineHeight: "1.5" }}>
                      {match.case.issue}
                    </p>
                  </div>

                  {/* Similarity Score — neutral pill */}
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-end",
                      gap: "6px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "baseline",
                        gap: "4px",
                        background: "var(--bg)",
                        border: "1px solid var(--border)",
                        padding: "6px 14px",
                        borderRadius: "var(--radius-md)",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "1.5rem",
                          fontWeight: 800,
                          color: "var(--text)",
                        }}
                      >
                        {match.similarity_score}%
                      </span>
                      <span className="eyebrow" style={{ marginLeft: "2px" }}>Match</span>
                    </div>

                    <button
                      className="btn-primary"
                      style={{ padding: "8px 14px", fontSize: "0.85rem" }}
                      onClick={() => onSelectCase(match)}
                    >
                      <span>Examine Intel</span>
                      <ArrowRight size={14} />
                    </button>
                  </div>
                </div>

                {/* Match Reasons Tags — neutral chips */}
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "8px",
                    marginTop: "16px",
                    paddingTop: "14px",
                    borderTop: "1px solid var(--border)",
                  }}
                >
                  {match.match_reasons.map((r, i) => (
                    <span
                      key={i}
                      style={{
                        fontSize: "0.76rem",
                        background: "var(--bg)",
                        color: "var(--text-muted)",
                        border: "1px solid var(--border)",
                        padding: "3px 10px",
                        borderRadius: "var(--radius-full)",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "5px",
                      }}
                    >
                      <CheckCircle2 size={11} />
                      <span>{r}</span>
                    </span>
                  ))}
                </div>

                {/* Accordion: Transparent Score Breakdown */}
                <div style={{ marginTop: "12px" }}>
                  <button
                    onClick={() => toggleAccordion(match.case.case_id)}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "var(--text-muted)",
                      fontSize: "0.8rem",
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                      padding: "4px 0",
                    }}
                  >
                    {isExpanded ? (
                      <><ChevronUp size={13} /> Hide Transparent Score Breakdown</>
                    ) : (
                      <><ChevronDown size={13} /> View Transparent Score Breakdown</>
                    )}
                  </button>

                  {isExpanded && (
                    <div
                      style={{
                        marginTop: "14px",
                        background: "var(--bg)",
                        padding: "16px",
                        borderRadius: "var(--radius-md)",
                        border: "1px solid var(--border)",
                      }}
                    >
                      <div className="eyebrow" style={{ marginBottom: "12px" }}>
                        Hybrid Scoring Breakdown
                      </div>

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                          gap: "12px",
                        }}
                      >
                        {[
                          { label: "Legal Issue (30%)", val: Math.round(match.score_breakdown.legal_issue * 100) + "% Match" },
                          { label: "Semantic (18%)", val: Math.round(match.score_breakdown.semantic * 100) + "% Match" },
                          { label: "Lexical / BM25 (15%)", val: Math.round(match.score_breakdown.lexical * 100) + "% Match" },
                          { label: "Factual / Medical (13%)", val: Math.round(match.score_breakdown.factual * 100) + "% Match" },
                          { label: "Insurer Match (12%)", val: Math.round(match.score_breakdown.insurer * 100) + "%" },
                          { label: "Claim Value (8%)", val: Math.round(match.score_breakdown.claim_medical * 100) + "%" },
                          { label: "Court Level (4%)", val: Math.round(match.score_breakdown.court_jurisdiction * 100) + "%" },
                        ].map((item) => (
                          <div key={item.label}>
                            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{item.label}</div>
                            <div style={{ fontWeight: 700, color: "var(--text)" }}>{item.val}</div>
                          </div>
                        ))}
                      </div>

                      <div
                        style={{
                          marginTop: "12px",
                          fontSize: "0.82rem",
                          color: "var(--text-muted)",
                          lineHeight: "1.4",
                          borderTop: "1px solid var(--border)",
                          paddingTop: "10px",
                        }}
                      >
                        <strong>Decision Summary:</strong> {match.case.decision}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Bottom Action */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "12px",
          marginTop: "12px",
        }}
      >
        <button className="btn-secondary" onClick={onBack}>
          ← Edit Fingerprint
        </button>

        <div className="disclaimer-bar" style={{ marginTop: 0 }}>
          <Scale size={14} style={{ flexShrink: 0 }} />
          <span>
            Precedent similarity is calculated against verified consumer court orders. Does not constitute judicial guarantee.
          </span>
        </div>
      </div>
    </div>
  );
};
