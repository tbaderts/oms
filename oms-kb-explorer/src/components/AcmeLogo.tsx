/**
 * The Acme Capital logo, as in oms-ui (`oms-ui/frontend/src/components/AcmeLogo.tsx`, SPEC-0060),
 * for the explorer's header (SPEC-0066). Text and outline use `currentColor`; the chart line uses the
 * brand accent token. The font size and spacing are SVG geometry (viewBox units), not CSS sizes.
 */
interface AcmeLogoProps {
  width?: number | string;
  height?: number | string;
  className?: string;
}

export default function AcmeLogo({ width = 168, height = 42, className = '' }: AcmeLogoProps) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 400 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="Acme Capital Logo"
    >
      {/* A stylised 'A' formed by rising bars, representing growth */}
      <path d="M50 20 L80 80 H20 Z" fill="url(#kb-acme-grad)" stroke="currentColor" strokeWidth="2" />
      {/* A rising chart line in the brand green */}
      <path d="M15 80 L40 55 L55 70 L85 30" stroke="var(--oms-accent)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      <text x="100" y="65" fontFamily="Arial, Helvetica, sans-serif" fontWeight="bold" fontSize="42" fill="currentColor" letterSpacing="1">
        ACME
      </text>
      <text x="240" y="65" fontFamily="Arial, Helvetica, sans-serif" fontWeight="normal" fontSize="42" fill="currentColor">
        CAPITAL
      </text>
      <defs>
        <linearGradient id="kb-acme-grad" x1="50" y1="20" x2="50" y2="80" gradientUnits="userSpaceOnUse">
          <stop stopColor="currentColor" stopOpacity="0.1" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0.05" />
        </linearGradient>
      </defs>
    </svg>
  );
}
