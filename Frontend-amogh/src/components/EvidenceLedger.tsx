/**
 * Evidence Ledger — provenance rendering for grounded claims.
 *
 * Every assertion the system shows is either traceable to a specific corpus record and
 * verbatim span, or is visibly marked as untraceable. Click a chip to see the exact source
 * text the claim was drawn from.
 */

import React, { useState } from "react";
import { CheckCircle2, HelpCircle, Quote, ShieldAlert, TrendingUp } from "lucide-react";
import type { GroundedClaim, GroundingReport } from "../types/claim";

/* ─── Audit strip ─────────────────────────────────────────────────────── */

export const GroundingAudit: React.FC<{ report: GroundingReport; note?: string }> = ({
  report,
  note,
}) => {
  const { total, verified, unverified, coverage_pct, declined } = report;

  if (declined) {
    return (
      <div className="grounding-audit declined">
        <ShieldAlert size={17} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
        <span className="audit-figure">0 of 0</span>
        <span style={{ fontSize: "0.84rem", color: "var(--text-muted)" }}>
          Declined to answer — records too incomplete to support any claim
        </span>
      </div>
    );
  }

  return (
    <div className="grounding-audit">
      <CheckCircle2 size={17} style={{ color: "var(--favorable)", flexShrink: 0 }} />
      <span className="audit-figure">
        {verified} of {total}
      </span>
      <span style={{ fontSize: "0.84rem", color: "var(--text-muted)" }}>
        claims traced to the case record
        {unverified > 0 && ` · ${unverified} dropped as unverified`}
      </span>
      <div
        className="audit-meter"
        role="meter"
        aria-valuenow={coverage_pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Grounding coverage: ${coverage_pct}%`}
      >
        <div className="audit-meter-fill" style={{ width: `${coverage_pct}%` }} />
      </div>
      <span
        className="audit-figure"
        style={{ fontSize: "0.9rem", color: "var(--text-muted)" }}
      >
        {coverage_pct}%
      </span>
      {note && (
        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", flexBasis: "100%" }}>
          {note}
        </span>
      )}
    </div>
  );
};

/* ─── One claim ───────────────────────────────────────────────────────── */

const ClaimRow: React.FC<{ claim: GroundedClaim }> = ({ claim }) => {
  const [open, setOpen] = useState(false);
  const prov = claim.provenance;
  const isPrediction = claim.kind === "prediction";

  const chipClass = [
    "provenance-chip",
    !claim.verified && "unverified",
    isPrediction && "prediction",
  ]
    .filter(Boolean)
    .join(" ");

  const marker = claim.verified ? (
    <CheckCircle2 size={14} style={{ color: "var(--favorable)", flexShrink: 0, marginTop: 3 }} />
  ) : isPrediction ? (
    <TrendingUp size={14} style={{ color: "var(--text-muted)", flexShrink: 0, marginTop: 3 }} />
  ) : (
    <HelpCircle size={14} style={{ color: "var(--partial)", flexShrink: 0, marginTop: 3 }} />
  );

  return (
    <div className="claim-row">
      <div className="claim-text">
        {marker}
        <span>{claim.text}</span>
      </div>

      {claim.rationale && <div className="claim-rationale">{claim.rationale}</div>}

      {prov && claim.verified ? (
        <>
          <button
            type="button"
            className={chipClass}
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            title="Show the exact source text this claim was drawn from"
          >
            <Quote size={10} />
            {prov.case_id} · {prov.field}
          </button>
          {open && (
            <div className="provenance-span">
              &ldquo;{prov.quoted_span}&rdquo;
              <span className="span-source">
                Verbatim from {prov.case_id}.{prov.field} — verified against the corpus record
              </span>
            </div>
          )}
        </>
      ) : (
        <span
          className={chipClass}
          title={
            isPrediction
              ? "A forward-looking prediction, not a finding from the record"
              : "This claim could not be traced to any corpus record"
          }
        >
          {isPrediction ? "prediction · not a record finding" : "unverified · not traceable"}
        </span>
      )}
    </div>
  );
};

/* ─── A titled group of claims ────────────────────────────────────────── */

export const ClaimList: React.FC<{
  title: string;
  icon?: React.ReactNode;
  claims: GroundedClaim[];
  emptyMessage: string;
}> = ({ title, icon, claims, emptyMessage }) => (
  <div className="glass-card">
    <div
      className="eyebrow"
      style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}
    >
      {icon}
      <span>{title}</span>
      {claims.length > 0 && (
        <span style={{ color: "var(--text-muted)", fontWeight: 500 }}>({claims.length})</span>
      )}
    </div>

    {claims.length === 0 ? (
      <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>{emptyMessage}</p>
    ) : (
      <div>
        {claims.map((c, i) => (
          <ClaimRow key={`${c.text.slice(0, 24)}-${i}`} claim={c} />
        ))}
      </div>
    )}
  </div>
);

/* ─── Retrieval tier pills ────────────────────────────────────────────── */

export const TierPills: React.FC<{
  signals?: { structured: boolean; lexical: boolean; semantic: boolean };
}> = ({ signals }) => {
  if (!signals) return null;
  const tiers: [string, boolean][] = [
    ["structured", signals.structured],
    ["lexical", signals.lexical],
    ["semantic", signals.semantic],
  ];
  return (
    <span className="tier-pills">
      {tiers.map(([name, active]) => (
        <span
          key={name}
          className={`tier-pill ${active ? "active" : "inactive"}`}
          title={
            active
              ? `${name} retrieval contributed to this match`
              : `${name} tier unavailable — its weight was redistributed`
          }
        >
          {name}
        </span>
      ))}
    </span>
  );
};
