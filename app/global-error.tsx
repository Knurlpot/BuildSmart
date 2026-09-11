"use client";

import { RecoveryScreen } from "@/components/feedback/RecoveryScreen";
import "./globals.css";

export default function GlobalError() {
  return <html lang="en"><body style={{ margin: 0, fontFamily: "Arial, sans-serif" }}>
    <RecoveryScreen retry={() => window.location.reload()} />
  </body></html>;
}
