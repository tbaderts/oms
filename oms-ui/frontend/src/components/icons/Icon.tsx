// Icon.tsx - The app's icons (SPEC-0058): inline SVG drawn for oms-ui on a 24-unit grid, stroked in
// the current text colour. Decorative: every use sits next to a text label, so the SVG is hidden from
// assistive technology. No icon font, no library.
import React from 'react';

type Shape =
  | ['path', string]
  | ['circle', number, number, number, boolean?]
  | ['rect', number, number, number, number, number]
  | ['line', number, number, number, number]
  | ['polyline', string];

const ICONS = {
  // Detail panel sections
  id: [['rect', 3, 5, 18, 14, 2], ['circle', 9, 11, 2], ['path', 'M6 16c.8-1.5 1.9-2.3 3-2.3s2.2.8 3 2.3'], ['line', 14, 10, 18, 10], ['line', 14, 14, 17, 14]],
  instrument: [['polyline', '3 17 9 11 13 15 21 7'], ['polyline', '15 7 21 7 21 13']],
  order: [['rect', 5, 3, 14, 18, 2], ['line', 9, 8, 15, 8], ['line', 9, 12, 15, 12], ['line', 9, 16, 13, 16]],
  execution: [['circle', 12, 12, 9], ['polyline', '8 12.5 11 15.5 16 9.5']],
  status: [['polyline', '3 12 7 12 10 5 14 19 17 12 21 12']],
  time: [['circle', 12, 12, 9], ['polyline', '12 7 12 12 15.5 14']],
  settlement: [['path', 'M3 10l9-6 9 6'], ['line', 6, 10, 6, 17], ['line', 10, 10, 10, 17], ['line', 14, 10, 14, 17], ['line', 18, 10, 18, 17], ['line', 3, 20, 21, 20]],
  derivative: [['path', 'M12 3l9 5-9 5-9-5 9-5z'], ['path', 'M3 13l9 5 9-5']],
  misc: [['circle', 6, 12, 1.4, true], ['circle', 12, 12, 1.4, true], ['circle', 18, 12, 1.4, true]],
  unassigned: [['circle', 12, 12, 9], ['path', 'M9.6 9.4a2.5 2.5 0 1 1 3.4 2.4c-.6.3-1 .8-1 1.5v.7'], ['circle', 12, 17, 0.9, true]],
  // Toolbar and header actions
  filter: [['path', 'M4 5h16l-6 7.5V19l-4-2v-4.5L4 5z']],
  columns: [['rect', 3, 4, 18, 16, 2], ['line', 9, 4, 9, 20], ['line', 15, 4, 15, 20]],
  refresh: [['path', 'M20 12a8 8 0 1 1-2.6-5.9'], ['polyline', '20 4 20 9 15 9']],
  autosize: [['polyline', '7 8 3 12 7 16'], ['polyline', '17 8 21 12 17 16'], ['line', 3, 12, 21, 12]],
  pause: [['rect', 7, 5, 3, 14, 1], ['rect', 14, 5, 3, 14, 1]],
  play: [['path', 'M8 5v14l11-7-11-7z']],
  connect: [['path', 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1'], ['path', 'M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1']],
  disconnect: [['path', 'M15.5 13.2l2.8-2.8a4 4 0 0 0-5.7-5.7l-1 1'], ['path', 'M8.5 10.8l-2.8 2.8a4 4 0 0 0 5.7 5.7l1-1'], ['line', 4, 4, 20, 20]],
  close: [['line', 6, 6, 18, 18], ['line', 18, 6, 6, 18]],
  key: [['circle', 8, 15, 4], ['path', 'M11 12l9-9'], ['path', 'M16.5 6.5l3 3'], ['path', 'M14 9l2 2']],
  // Points right; rotated 90° by CSS when a section is open
  chevron: [['polyline', '9 6 15 12 9 18']],
} satisfies Record<string, Shape[]>;

export type IconName = keyof typeof ICONS;
export const ICON_NAMES = Object.keys(ICONS) as IconName[];

interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
}

function draw(shape: Shape, key: number): React.ReactElement {
  switch (shape[0]) {
    case 'path':
      return <path key={key} d={shape[1]} />;
    case 'circle':
      return <circle key={key} cx={shape[1]} cy={shape[2]} r={shape[3]} fill={shape[4] ? 'currentColor' : undefined} />;
    case 'rect':
      return <rect key={key} x={shape[1]} y={shape[2]} width={shape[3]} height={shape[4]} rx={shape[5]} />;
    case 'line':
      return <line key={key} x1={shape[1]} y1={shape[2]} x2={shape[3]} y2={shape[4]} />;
    case 'polyline':
      return <polyline key={key} points={shape[1]} />;
  }
}

const Icon: React.FC<IconProps> = ({ name, size = 16, className }) => (
  <svg
    className={className ? `oms-icon ${className}` : 'oms-icon'}
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.75}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    {(ICONS[name] as Shape[]).map(draw)}
  </svg>
);

export default Icon;
