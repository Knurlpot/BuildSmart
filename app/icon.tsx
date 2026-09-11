import { ImageResponse } from "next/og";
import bricks from "@/features/welcome/logo-bricks.json";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(<div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#fffaf3", borderRadius: 12 }}>
    <svg width="52" height="56" viewBox="0 0 459 490">{bricks.map(brick => <path key={brick.sourceIndex} d={brick.d} fill={brick.fill} />)}</svg>
  </div>, size);
}
