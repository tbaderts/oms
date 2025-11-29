import React from 'react';

interface AcmeLogoProps {
  width?: number | string;
  height?: number | string;
  className?: string;
  color?: string;
}

const AcmeLogo: React.FC<AcmeLogoProps> = ({ 
  width = 200, 
  height = 50, 
  className = '',
  color = '#0f172a' // Slate-900 default
}) => {
  return (
    <svg 
      width={width} 
      height={height} 
      viewBox="0 0 400 100" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Acme Capital Logo"
    >
      {/* Icon: A stylized 'A' formed by rising bars/pillars representing growth */}
      <path 
        d="M50 20 L80 80 H20 Z" 
        fill="url(#grad1)" 
        stroke={color} 
        strokeWidth="2"
      />
      {/* A rising chart line cutting through or overlaying */}
      <path 
        d="M15 80 L40 55 L55 70 L85 30" 
        stroke="#22c55e" 
        strokeWidth="6" 
        strokeLinecap="round" 
        strokeLinejoin="round"
      />
      
      {/* Text: ACME CAPITAL */}
      <text 
        x="100" 
        y="65" 
        fontFamily="Arial, Helvetica, sans-serif" 
        fontWeight="bold" 
        fontSize="42" 
        fill={color}
        letterSpacing="1"
      >
        ACME
      </text>
      <text 
        x="240" 
        y="65" 
        fontFamily="Arial, Helvetica, sans-serif" 
        fontWeight="normal" 
        fontSize="42" 
        fill={color}
      >
        CAPITAL
      </text>
      
      {/* Definitions for gradients */}
      <defs>
        <linearGradient id="grad1" x1="50" y1="20" x2="50" y2="80" gradientUnits="userSpaceOnUse">
          <stop stopColor={color} stopOpacity="0.1"/>
          <stop offset="1" stopColor={color} stopOpacity="0.05"/>
        </linearGradient>
      </defs>
    </svg>
  );
};

export default AcmeLogo;
