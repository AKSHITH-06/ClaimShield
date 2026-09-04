import React, { useState } from "react";
import type { ExtractedFingerprint } from "../../types/claim";
import {
  Fingerprint,
  AlertCircle,
  Quote,
  ArrowRight,
  Edit3,
} from "lucide-react";

interface FingerprintScreenProps {
  initialFingerprint: ExtractedFingerprint;
  onConfirmFingerprint: (fingerprint: ExtractedFingerprint) => void;
  onBack: () => void;
  isLoading: boolean;
}

// Confidence badge — neutral pill, dot carries the only color signal
const ConfidenceBadge = ({ confidence }: { confidence?: "high" | "medium" | "low" }) => {
  const dotColor =
    confidence === "high"
      ? "var(--favorable)"
      : confidence === "medium"
      ? "var(--partial)"
      : "var(--unfavorable)";
  const label =
    confidence === "high"
      ? "High Confidence"
      : confidence === "medium"
      ? "Medium Confidence"
      : "Review Needed";

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "5px",
        fontSize: "0.72rem",
        fontWeight: 600,
        padding: "2px 8px",
        borderRadius: "var(--radius-full)",
        border: "1px solid var(--border)",
        background: "var(--surface)",
        color: "var(--text-muted)",
      }}
    >
      <span
        style={{
          width: "6px",
          height: "6px",
          borderRadius: "50%",
          background: dotColor,
          display: "inline-block",
          flexShrink: 0,
        }}
      />
      {label}
    </span>
  );
};

// Source quote block — plain left border, no colored background
const SourceQuote = ({ text }: { text: string }) => (
  <div
    style={{
      marginTop: "12px",
      padding: "10px 12px",
      borderRadius: "var(--radius-sm)",
      borderLeft: "2px solid var(--border)",
      fontSize: "0.78rem",
      color: "var(--text-muted)",
      background: "var(--bg)",
    }}
  >
    <Quote size={12} style={{ display: "inline", marginRight: "4px" }} />
    <span>"{text}"</span>
  </div>
);

export const FingerprintScreen: React.FC<FingerprintScreenProps> = ({
  initialFingerprint,
  onConfirmFingerprint,
  onBack,
  isLoading,
}) => {
  const [fp, setFp] = useState<ExtractedFingerprint>({ ...initialFingerprint });
  const [isEditing, setIsEditing] = useState(false);

  const handleFieldChange = (field: keyof ExtractedFingerprint, val: any) => {
    setFp((prev) => ({ ...prev, [field]: val }));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Header Banner */}
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
              <Fingerprint size={14} /> Structured Extraction
            </div>
            <h2 style={{ fontSize: "1.6rem", fontWeight: 800, color: "var(--text)" }}>
              Generated Case Fingerprint
            </h2>
            <p style={{ color: "var(--text-muted)", fontSize: "0.92rem", marginTop: "4px" }}>
              Normalized factual vector extracted from your documents. Every fact is paired with its verifiable source span from the insurer's rejection letter.
            </p>
          </div>

          <div style={{ display: "flex", gap: "10px" }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setIsEditing(!isEditing)}
            >
              <Edit3 size={14} />
              <span>{isEditing ? "Lock Fields" : "Edit Values"}</span>
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={isLoading}
              onClick={() => onConfirmFingerprint(fp)}
            >
              {isLoading ? (
                <>
                  <div className="spinner" style={{ width: "16px", height: "16px", borderWidth: "2px" }} />
                  <span>Searching Precedents...</span>
                </>
              ) : (
                <>
                  <span>Find Similar Cases</span>
                  <ArrowRight size={15} />
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Fields Needing Review Notice */}
      {fp.fields_needing_review && fp.fields_needing_review.length > 0 && (
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            padding: "14px 18px",
            borderRadius: "var(--radius-md)",
            display: "flex",
            alignItems: "center",
            gap: "12px",
            fontSize: "0.85rem",
            color: "var(--text-muted)",
          }}
        >
          <AlertCircle size={18} style={{ flexShrink: 0, color: "var(--partial)" }} />
          <div>
            <strong style={{ color: "var(--text)" }}>Extraction Flag:</strong> The model flagged incomplete or ambiguous details:{" "}
            <em>{fp.fields_needing_review.join(", ")}</em>. You can edit them manually before precedent matching.
          </div>
        </div>
      )}

      {/* Structured Card Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: "20px",
        }}
      >
        {/* Insurer & Policy */}
        <div className="glass-card">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "12px",
            }}
          >
            <span className="eyebrow">Insurance Company</span>
            <ConfidenceBadge confidence={fp.field_confidence?.insurer} />
          </div>

          {isEditing ? (
            <input
              type="text"
              className="form-input"
              value={fp.insurer}
              onChange={(e) => handleFieldChange("insurer", e.target.value)}
            />
          ) : (
            <div style={{ fontSize: "1.2rem", fontWeight: 800, color: "var(--text)" }}>
              {fp.insurer}
            </div>
          )}

          {fp.field_source_quote?.insurer && (
            <SourceQuote text={fp.field_source_quote.insurer} />
          )}
        </div>

        {/* Claim Amount */}
        <div className="glass-card">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "12px",
            }}
          >
            <span className="eyebrow">Claimed Amount</span>
            <ConfidenceBadge confidence={fp.field_confidence?.claim_amount} />
          </div>

          {isEditing ? (
            <input
              type="number"
              className="form-input"
              value={fp.claim_amount}
              onChange={(e) => handleFieldChange("claim_amount", Number(e.target.value))}
            />
          ) : (
            <div style={{ fontSize: "1.2rem", fontWeight: 800, color: "var(--text)" }}>
              ₹{fp.claim_amount?.toLocaleString("en-IN")}
            </div>
          )}

          {fp.field_source_quote?.claim_amount && (
            <SourceQuote text={fp.field_source_quote.claim_amount} />
          )}
        </div>

        {/* Denial Category */}
        <div className="glass-card">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "12px",
            }}
          >
            <span className="eyebrow">Denial Category</span>
            <ConfidenceBadge confidence={fp.field_confidence?.rejection_reason} />
          </div>

          {isEditing ? (
            <input
              type="text"
              className="form-input"
              value={fp.rejection_reason}
              onChange={(e) => handleFieldChange("rejection_reason", e.target.value)}
            />
          ) : (
            <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--text)" }}>
              {fp.rejection_reason}
            </div>
          )}

          {fp.field_source_quote?.rejection_reason && (
            <SourceQuote text={fp.field_source_quote.rejection_reason} />
          )}
        </div>

        {/* Medical Condition */}
        <div className="glass-card">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "12px",
            }}
          >
            <span className="eyebrow">Clinical Condition</span>
            <ConfidenceBadge confidence={fp.field_confidence?.condition} />
          </div>

          {isEditing ? (
            <input
              type="text"
              className="form-input"
              value={fp.condition}
              onChange={(e) => handleFieldChange("condition", e.target.value)}
            />
          ) : (
            <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--text)" }}>
              {fp.condition}
            </div>
          )}

          {fp.field_source_quote?.condition && (
            <SourceQuote text={fp.field_source_quote.condition} />
          )}
        </div>

        {/* Chronology */}
        <div className="glass-card">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "12px",
            }}
          >
            <span className="eyebrow">Dispute Timeline</span>
            <ConfidenceBadge confidence={fp.field_confidence?.policy_start_date} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <div>
              <span style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>Policy Inception: </span>
              <strong style={{ color: "var(--text)" }}>{fp.policy_start_date}</strong>
            </div>
            <div>
              <span style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>Hospitalization: </span>
              <strong style={{ color: "var(--text)" }}>{fp.hospitalization_date}</strong>
            </div>
          </div>
        </div>

        {/* Policy Clause */}
        <div className="glass-card">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "12px",
            }}
          >
            <span className="eyebrow">Policy Clause In Issue</span>
            <ConfidenceBadge confidence={fp.field_confidence?.relevant_clause || "medium"} />
          </div>

          {isEditing ? (
            <input
              type="text"
              className="form-input"
              value={fp.relevant_clause || ""}
              onChange={(e) => handleFieldChange("relevant_clause", e.target.value)}
            />
          ) : (
            <div style={{ fontSize: "0.92rem", color: "var(--text-muted)", lineHeight: "1.4" }}>
              {fp.relevant_clause || "Not specifically referenced"}
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "12px",
        }}
      >
        <button className="btn-secondary" onClick={onBack}>
          ← Back to Upload
        </button>

        <button
          className="btn-primary"
          disabled={isLoading}
          onClick={() => onConfirmFingerprint(fp)}
        >
          {isLoading ? (
            <>
              <div className="spinner" style={{ width: "16px", height: "16px", borderWidth: "2px" }} />
              <span>Searching Precedents...</span>
            </>
          ) : (
            <>
              <span>Find Similar Cases (5 Precedents)</span>
              <ArrowRight size={15} />
            </>
          )}
        </button>
      </div>
    </div>
  );
};
