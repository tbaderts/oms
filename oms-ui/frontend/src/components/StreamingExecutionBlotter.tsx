// StreamingExecutionBlotter.tsx - Streaming executions blotter component
import React from 'react';
import StreamingBlotter from './StreamingBlotter';

interface StreamingExecutionBlotterProps {
  onModeChange?: (mode: 'streaming' | 'rest') => void;
}

const StreamingExecutionBlotter: React.FC<StreamingExecutionBlotterProps> = ({ onModeChange }) => {
  return (
    <StreamingBlotter 
      domainObject="Execution" 
      onModeChange={onModeChange}
    />
  );
};

export default StreamingExecutionBlotter;
