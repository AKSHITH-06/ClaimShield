import React, { useEffect, useState } from "react";
import type { ApiMode } from "../services/api";
import { subscribeApiMode } from "../services/api";
import { Server, WifiOff } from "lucide-react";

export const StatusBadge: React.FC = () => {
  const [mode, setMode] = useState<ApiMode>("live");

  useEffect(() => {
    const unsubscribe = subscribeApiMode((newMode) => {
      setMode(newMode);
    });
    return unsubscribe;
  }, []);

  return (
    <div
      className={`status-badge ${mode}`}
      title={
        mode === "live"
          ? "Connected to FastAPI Backend (localhost:8000)"
          : "Backend unavailable or slow; Auto-switched to Offline Demo Engine"
      }
    >
      <span className="status-dot" />
      {mode === "live" ? (
        <>
          <Server size={12} />
          <span>Live Backend</span>
        </>
      ) : (
        <>
          <WifiOff size={12} />
          <span>Offline Demo Engine</span>
        </>
      )}
    </div>
  );
};
