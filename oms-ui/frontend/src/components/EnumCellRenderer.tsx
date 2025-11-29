import React from 'react';
import './EnumCellRenderer.scss';

interface EnumCellRendererProps {
  value: string;
  valueFormatted?: string;
}

const EnumCellRenderer: React.FC<EnumCellRendererProps> = (props) => {
  const { value, valueFormatted } = props;
  const displayValue = valueFormatted || value;
  
  if (!value) return null;

  // Generate a class name based on the raw value (e.g., 'BUY' -> 'enum-buy')
  const className = `enum-cell enum-${value.toString().toLowerCase().replace(/_/g, '-')}`;

  return (
    <span className={className}>
      {displayValue}
    </span>
  );
};

export default EnumCellRenderer;
