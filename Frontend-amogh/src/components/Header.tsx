import React from "react";
import { ShieldCheck } from "lucide-react";
import { StatusBadge } from "./StatusBadge";

export type ScreenStep = "upload" | "fingerprint" | "similar" | "detail" | "appeal";

interface HeaderProps {
  currentStep: ScreenStep;
  onStepClick: (step: ScreenStep) => void;
  canNavigateTo: (step: ScreenStep) => boolean;
  onReset: () => void;
}

const STEPS: { id: ScreenStep; label: string; number: number }[] = [
  { id: "upload", label: "Upload & Input", number: 1 },
  { id: "fingerprint", label: "Case Fingerprint", number: 2 },
  { id: "similar", label: "Similar Cases", number: 3 },
  { id: "detail", label: "Case Intelligence", number: 4 },
  { id: "appeal", label: "Appeal & Action", number: 5 },
];

export const Header: React.FC<HeaderProps> = ({
  currentStep,
  onStepClick,
  canNavigateTo,
  onReset,
}) => {
  return (
    <header className="header-nav">
      <div className="brand-wrapper" onClick={onReset} title="Reset to Start">
        <div className="brand-icon">
          <ShieldCheck size={22} />
        </div>
        <div className="brand-text">
          <h1>ClaimShield</h1>
          <p>Insurance Dispute Intelligence</p>
        </div>
      </div>

      <nav className="stepper-container" aria-label="Workflow progress">
        {STEPS.map((s) => {
          const isActive = currentStep === s.id;
          const isAllowed = canNavigateTo(s.id);
          return (
            <button
              key={s.id}
              className={`step-item ${isActive ? "active" : ""} ${
                isAllowed ? "completed" : ""
              }`}
              onClick={() => isAllowed && onStepClick(s.id)}
              disabled={!isAllowed}
              title={isAllowed ? `Go to ${s.label}` : "Complete previous steps first"}
            >
              <span className="step-number">{s.number}</span>
              <span>{s.label}</span>
            </button>
          );
        })}
      </nav>

      <div>
        <StatusBadge />
      </div>
    </header>
  );
};
