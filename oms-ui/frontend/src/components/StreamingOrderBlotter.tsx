// StreamingOrderBlotter.tsx - Streaming orders blotter component
import React from 'react';
import StreamingBlotter from './StreamingBlotter';

interface StreamingOrderBlotterProps {
  onModeChange?: (mode: 'streaming' | 'rest') => void;
}

const StreamingOrderBlotter: React.FC<StreamingOrderBlotterProps> = ({ onModeChange }) => {
  return (
    <StreamingBlotter 
      domainObject="Order" 
      onModeChange={onModeChange}
    />
  );
};

export default StreamingOrderBlotter;
