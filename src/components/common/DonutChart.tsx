import React from 'react';

interface DonutChartProps {
  size?: number;
  strokeWidth?: number;
}

export const DonutChart: React.FC<DonutChartProps> = ({ size = 160, strokeWidth = 36 }) => {
  const radius = (size - strokeWidth) / 2;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;

  // Segment proportions matching the reference images:
  // Green: ~45%, Dark gray: ~35%, Purple: ~20%
  const greenDash = circumference * 0.45;
  const grayDash = circumference * 0.35;
  const purpleDash = circumference * 0.20;

  // Gap between segments for crisp rendering
  const gap = 3;

  return (
    <div className="flex items-center justify-center relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="transform -rotate-90">
        {/* Purple segment (top-left) */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="#7C3AED"
          strokeWidth={strokeWidth}
          strokeDasharray={`${purpleDash - gap} ${circumference - (purpleDash - gap)}`}
          strokeDashoffset={0}
        />

        {/* Green segment (right side) */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="#00D26A"
          strokeWidth={strokeWidth}
          strokeDasharray={`${greenDash - gap} ${circumference - (greenDash - gap)}`}
          strokeDashoffset={-(purpleDash)}
        />

        {/* Dark Charcoal segment (bottom-left) */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="#1E293B"
          strokeWidth={strokeWidth}
          strokeDasharray={`${grayDash - gap} ${circumference - (grayDash - gap)}`}
          strokeDashoffset={-(purpleDash + greenDash)}
        />
      </svg>
    </div>
  );
};

