import React, { useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  FileText,
  Upload,
  Zap,
} from "lucide-react";
import { DEMO_PRESETS } from "../../data/demoPresets";
import { ingestDocument } from "../../services/api";

interface Props {
  onAnalyze: (policyText: string, rejectionText: string, documents: string[]) => void;
  isLoading: boolean;
}

/**
 * Documents a policyholder typically holds. Checking these drives the evidence-gap
 * comparison — the system compares what you have against what mattered in similar cases,
 * so this list is real input, not decoration.
 */
const COMMON_DOCUMENTS = [
  "Policy certificate and terms",
  "Claim repudiation letter",
  "Hospital discharge summary",
  "Hospital bills and payment receipts",
  "Diagnostic and lab reports",
  "Treating doctor's certificate on date of first diagnosis",
  "Proposal form copy",
  "Pre-policy medical records",
  "Correspondence with the insurer or TPA",
];

export const UploadScreen: React.FC<Props> = ({ onAnalyze, isLoading }) => {
  const [rejectionText, setRejectionText] = useState("");
  const [policyText, setPolicyText] = useState("");
  const [documents, setDocuments] = useState<string[]>([]);

  const [dragging, setDragging] = useState(false);
  const [ingesting, setIngesting] = useState(false);
  const [ingestError, setIngestError] = useState<string | null>(null);
  const [ingestNote, setIngestNote] = useState<string | null>(null);
  /** Which textarea an uploaded file should populate. */
  const [target, setTarget] = useState<"rejection" | "policy">("rejection");

  const fileInput = useRef<HTMLInputElement>(null);

  const toggleDocument = (doc: string) =>
    setDocuments((prev) =>
      prev.includes(doc) ? prev.filter((d) => d !== doc) : [...prev, doc]
    );

  const handleFile = async (file: File) => {
    setIngesting(true);
    setIngestError(null);
    setIngestNote(null);
    try {
      const res = await ingestDocument(file);
      // Text lands in the form for review — a bad parse must be visible and correctable
      // before it poisons extraction.
      if (target === "policy") setPolicyText(res.text);
      else setRejectionText(res.text);
      setIngestNote(
        `Extracted ${res.chars.toLocaleString()} characters from ${res.pages} page(s) of ` +
          `${res.filename}. Check the text below and correct anything the parser got wrong.`
      );
    } catch (err) {
      setIngestError(err instanceof Error ? err.message : "That file could not be read.");
    } finally {
      setIngesting(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  };

  const applyPreset = (id: string) => {
    const preset = DEMO_PRESETS.find((p) => p.id === id);
    if (!preset) return;
    setPolicyText(preset.policyText);
    setRejectionText(preset.rejectionText);
    setIngestNote(null);
    setIngestError(null);
    // The sparse preset deliberately arrives with no supporting documents.
    setDocuments(
      preset.id === "sparse"
        ? ["Claim repudiation letter"]
        : ["Policy certificate and terms", "Claim repudiation letter", "Hospital discharge summary"]
    );
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectionText.trim()) return;
    onAnalyze(policyText, rejectionText, documents);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Intro + presets */}
      <div className="glass-card">
        <div className="eyebrow" style={{ display: "flex", gap: 8, marginBottom: 6 }}>
          <Upload size={14} /> Claim Ingestion
        </div>
        <h2 style={{ fontSize: "1.5rem", fontWeight: 800 }}>Analyse My Insurance Rejection</h2>
        <p
          style={{
            color: "var(--text-muted)",
            fontSize: "0.9rem",
            marginTop: 6,
            maxWidth: 680,
          }}
        >
          Upload or paste your repudiation letter. ClaimShield extracts a structured case
          fingerprint, finds comparable disputes, and traces every conclusion back to the record
          it came from.
        </p>

        <hr className="divider" />

        <div className="eyebrow" style={{ marginBottom: 8 }}>
          Load a sample letter
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {DEMO_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className="btn-secondary"
              onClick={() => applyPreset(p.id)}
              title={p.hint}
            >
              <Zap size={14} /> <span>{p.label}</span>
            </button>
          ))}
        </div>
        <p style={{ fontSize: "0.76rem", color: "var(--text-muted)", marginTop: 8 }}>
          Presets fill the form only — the full pipeline then runs for real against the backend.
        </p>
      </div>

      {/* Upload */}
      <div className="glass-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
          <div className="eyebrow">Upload a document (PDF or text)</div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <label style={{ fontSize: "0.76rem", color: "var(--text-muted)" }} htmlFor="target">
              Send extracted text to:
            </label>
            <select
              id="target"
              className="form-input"
              style={{ width: "auto", padding: "5px 9px", fontSize: "0.8rem" }}
              value={target}
              onChange={(e) => setTarget(e.target.value as "rejection" | "policy")}
            >
              <option value="rejection">Rejection letter</option>
              <option value="policy">Policy terms</option>
            </select>
          </div>
        </div>

        <div
          className={`dropzone ${dragging ? "dragging" : ""} ${ingesting ? "busy" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => !ingesting && fileInput.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              fileInput.current?.click();
            }
          }}
          role="button"
          tabIndex={0}
          aria-label="Upload a PDF or text document"
        >
          {ingesting ? (
            <>
              <div className="spinner" style={{ margin: "0 auto 10px" }} />
              <div style={{ fontSize: "0.86rem" }}>Extracting text…</div>
            </>
          ) : (
            <>
              <FileText size={22} style={{ color: "var(--text-muted)" }} />
              <div style={{ fontSize: "0.88rem", fontWeight: 600, marginTop: 8 }}>
                Drop a PDF here, or click to choose a file
              </div>
              <div style={{ fontSize: "0.76rem", color: "var(--text-muted)", marginTop: 4 }}>
                PDF or .txt, up to 8 MB. Scanned images need OCR and are not supported — paste
                the text instead.
              </div>
            </>
          )}
        </div>

        <input
          ref={fileInput}
          type="file"
          accept=".pdf,.txt,.text,.md,application/pdf,text/plain"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
            e.target.value = "";
          }}
        />

        {ingestError && (
          <div className="notice error" style={{ marginTop: 12 }}>
            <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{ingestError}</span>
          </div>
        )}
        {ingestNote && (
          <div className="notice info" style={{ marginTop: 12 }}>
            <CheckCircle2 size={15} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{ingestNote}</span>
          </div>
        )}
      </div>

      {/* Text input */}
      <form onSubmit={submit} className="glass-card">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: 20,
          }}
        >
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" htmlFor="rejectionInput">
              Rejection / repudiation letter <span style={{ color: "var(--unfavorable)" }}>*</span>
            </label>
            <textarea
              id="rejectionInput"
              className="form-textarea"
              style={{ height: 230 }}
              placeholder="Paste the text of your insurer's rejection letter…"
              value={rejectionText}
              onChange={(e) => setRejectionText(e.target.value)}
              required
            />
            <div style={{ fontSize: "0.76rem", color: "var(--text-muted)", marginTop: 6 }}>
              {rejectionText.length.toLocaleString()} characters
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" htmlFor="policyInput">
              Policy terms / exclusion clauses (optional)
            </label>
            <textarea
              id="policyInput"
              className="form-textarea"
              style={{ height: 230 }}
              placeholder="Paste the relevant clauses from your policy document…"
              value={policyText}
              onChange={(e) => setPolicyText(e.target.value)}
            />
            <div style={{ fontSize: "0.76rem", color: "var(--text-muted)", marginTop: 6 }}>
              {policyText.length.toLocaleString()} characters
            </div>
          </div>
        </div>

        <hr className="divider" />

        {/* Document checklist — real input to the evidence-gap comparison */}
        <div className="eyebrow" style={{ marginBottom: 4 }}>
          Which documents do you have?
        </div>
        <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginBottom: 12 }}>
          Used to compare what you hold against the evidence that mattered in similar disputes.
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(270px, 1fr))",
            gap: 8,
          }}
        >
          {COMMON_DOCUMENTS.map((doc) => (
            <label
              key={doc}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
                fontSize: "0.83rem",
                cursor: "pointer",
                padding: "5px 0",
              }}
            >
              <input
                type="checkbox"
                checked={documents.includes(doc)}
                onChange={() => toggleDocument(doc)}
                style={{ marginTop: 3, flexShrink: 0 }}
              />
              <span>{doc}</span>
            </label>
          ))}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 22,
            paddingTop: 18,
            borderTop: "1px solid var(--border)",
            flexWrap: "wrap",
            gap: 14,
          }}
        >
          <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
            {documents.length} document{documents.length === 1 ? "" : "s"} selected · processed in
            memory, not stored
          </span>
          <button type="submit" className="btn-primary" disabled={isLoading || !rejectionText.trim()}>
            <span>Extract Case Fingerprint</span> <ArrowRight size={15} />
          </button>
        </div>
      </form>
    </div>
  );
};
