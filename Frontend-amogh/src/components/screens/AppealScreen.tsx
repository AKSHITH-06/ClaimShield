import React, { useState } from "react";
import type {
  AppealResult,
  ExtractedFingerprint,
} from "../../types/claim";
import {
  Copy,
  Check,
  Download,
  Printer,
  Scale,
  Send,
  Compass,
} from "lucide-react";

interface AppealScreenProps {
  appealResult: AppealResult;
  fingerprint: ExtractedFingerprint;
  onRestart: () => void;
  onBack: () => void;
}

export const AppealScreen: React.FC<AppealScreenProps> = ({
  appealResult,
  fingerprint,
  onRestart,
  onBack,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(appealResult.letter_markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleDownload = () => {
    const blob = new Blob([appealResult.letter_markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ClaimShield_Grievance_${fingerprint.insurer.replace(/\s+/g, "_")}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    window.print();
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
              <Send size={14} /> Formal Redressal Output
            </div>
            <h2 style={{ fontSize: "1.6rem", fontWeight: 800, color: "var(--text)" }}>
              Grounded Grievance Letter &amp; Action Plan
            </h2>
            <p style={{ color: "var(--text-muted)", fontSize: "0.92rem", marginTop: "4px" }}>
              Tailored representation for insurer's Grievance Redressal Officer (GRO). All citations directly reference verified precedents in the corpus without fabricated statutory sections.
            </p>
          </div>

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button className="btn-secondary" onClick={handleCopy} title="Copy letter to clipboard">
              {copied ? <Check size={15} /> : <Copy size={15} />}
              <span>{copied ? "Copied!" : "Copy Letter"}</span>
            </button>

            <button className="btn-secondary" onClick={handleDownload} title="Download as Markdown">
              <Download size={15} />
              <span>Download .md</span>
            </button>

            <button className="btn-secondary" onClick={handlePrint} title="Print representation">
              <Printer size={15} />
              <span>Print / PDF</span>
            </button>
          </div>
        </div>
      </div>

      {/* Cited Cases Traceability Section */}
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          padding: "14px 20px",
          borderRadius: "var(--radius-md)",
          display: "flex",
          alignItems: "center",
          gap: "16px",
          flexWrap: "wrap",
        }}
      >
        <div
          className="eyebrow"
          style={{ display: "flex", alignItems: "center", gap: "8px" }}
        >
          <Scale size={15} />
          <span>Verified Precedents Cited In This Letter:</span>
        </div>

        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {appealResult.precedents_cited.map((cid: string) => (
            <span
              key={cid}
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.78rem",
                background: "var(--bg)",
                color: "var(--text-muted)",
                padding: "3px 10px",
                borderRadius: "var(--radius-full)",
                border: "1px solid var(--border)",
              }}
            >
              ✓ {cid}
            </span>
          ))}
        </div>
      </div>

      {/* Main Letter Viewer — uses light surface, not a dark panel */}
      <div className="glass-card" style={{ padding: "32px" }}>
        <div
          style={{
            background: "var(--bg)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            padding: "28px",
            color: "var(--text)",
            fontFamily: "var(--font-main)",
            fontSize: "0.95rem",
            lineHeight: "1.75",
            whiteSpace: "pre-wrap",
          }}
        >
          {appealResult.letter_markdown}
        </div>
      </div>

      {/* Step-by-Step Action Plan */}
      <div className="glass-card">
        <div
          style={{
            fontSize: "1.2rem",
            fontWeight: 700,
            marginBottom: "16px",
            display: "flex",
            alignItems: "center",
            gap: "10px",
          }}
        >
          <Compass size={20} />
          <span>Official Escalation Roadmap &amp; Next Steps</span>
        </div>

        <p style={{ color: "var(--text-muted)", fontSize: "0.88rem", marginBottom: "20px" }}>
          Follow this statutory escalation timeline mandated under IRDAI Policyholder Protection Regulations:
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {appealResult.action_plan.map((step, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "14px",
                background: "var(--bg)",
                padding: "14px 16px",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border)",
              }}
            >
              {/* Step number — accent fill is structural, not an outcome colour */}
              <div
                style={{
                  width: "26px",
                  height: "26px",
                  borderRadius: "50%",
                  background: "var(--accent)",
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 700,
                  fontSize: "0.82rem",
                  flexShrink: 0,
                }}
              >
                {i + 1}
              </div>
              <p style={{ fontSize: "0.88rem", lineHeight: 1.55, flex: 1 }}>{step}</p>
            </div>
          ))}
        </div>

        {appealResult.citations_used.length > 0 && (
          <>
            <hr className="divider" />
            <div className="eyebrow" style={{ marginBottom: 8 }}>
              Regulatory provisions cited (verifiable)
            </div>
            <ul style={{ paddingLeft: 20, fontSize: "0.84rem" }}>
              {appealResult.citations_used.map((c: string, i: number) => (
                <li key={i} style={{ marginBottom: 5 }}>{c}</li>
              ))}
            </ul>
          </>
        )}

        {appealResult.precedents_excluded.length > 0 && (
          <div className="notice warn" style={{ marginTop: 16 }}>
            <span>
              Excluded from citation as having incomplete records:{" "}
              <strong>{appealResult.precedents_excluded.join(", ")}</strong>. A case the system
              cannot verify is never cited as supporting precedent.
            </span>
          </div>
        )}

        {appealResult.generated_by === "template_fallback" && (
          <div className="notice info" style={{ marginTop: 16 }}>
            <span>
              Drafted from the template because the AI service was unavailable. The regulatory
              provisions and escalation route are unchanged; only the wording is not AI-composed.
            </span>
          </div>
        )}
      </div>

      {/* Navigation Footer */}
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
          ← Back to Case Intelligence
        </button>

        <button className="btn-primary" onClick={onRestart}>
          <span>Analyze Another Claim Dispute</span>
        </button>
      </div>
    </div>
  );
};
