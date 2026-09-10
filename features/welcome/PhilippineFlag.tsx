import { useId } from "react";

/** Circular, code-native Philippine flag badge; no external image request. */
export function PhilippineFlag() {
  const id = useId().replace(/:/g, "");
  return <svg width="42" height="42" viewBox="0 0 100 100" role="img" aria-label="Philippine flag" style={{ flexShrink: 0, borderRadius: "50%" }}>
    <defs><clipPath id={`${id}-circle`}><circle cx="50" cy="50" r="50" /></clipPath><path id={`${id}-star`} d="M0-5 1.2-1.6 4.8-1.5 2 1 3 4-0 2.2-3 4-2 1-4.8-1.5-1.2-1.6Z" /></defs>
    <g clipPath={`url(#${id}-circle)`}>
      <path fill="#0038a8" d="M0 0H100V50H0Z" /><path fill="#ce1126" d="M0 50H100V100H0Z" /><path fill="white" d="M0 0 72 50 0 100Z" />
      <g fill="#fcd116"><circle cx="23" cy="50" r="8" />{Array.from({ length: 8 }, (_, index) => <path key={index} d="M21 39 22 31 23 29 24 31 25 39Z" transform={`rotate(${index * 45} 23 50)`} />)}
        <use href={`#${id}-star`} transform="translate(59 50) rotate(90)" /><use href={`#${id}-star`} transform="translate(7 15)" /><use href={`#${id}-star`} transform="translate(7 85) rotate(180)" />
      </g>
    </g>
  </svg>;
}
