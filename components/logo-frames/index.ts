import Field0 from "./Field 0.svg";
import Field1 from "./Field 1.svg";
import Field2 from "./Field 2.svg";
import Field3 from "./Field 3.svg";
import Field4 from "./Field 4.svg";
import Field5 from "./Field 5.svg";
import Field6 from "./Field 6.svg";
import Field7 from "./Field 7.svg";
import Field8 from "./Field 8.svg";
import Field9 from "./Field 9.svg";
import Field10 from "./Field 10.svg";
import Field11 from "./Field 11.svg";
import Field12 from "./Field 12.svg";
import Field13 from "./Field 13.svg";

export const LOGO_FRAMES = [
  Field0,
  Field1,
  Field2,
  Field3,
  Field4,
  Field5,
  Field6,
  Field7,
  Field8,
  Field9,
  Field10,
  Field11,
  Field12,
  Field13,
] as const;

export function logoFrame(step: number) {
  const clamped = Math.min(Math.max(step, 0), LOGO_FRAMES.length - 1);
  return LOGO_FRAMES[clamped];
}
