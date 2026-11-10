// StreamingExecutionBlotter.tsx - Streaming executions blotter component
import React from 'react';
import StreamingBlotter from './StreamingBlotter';

const StreamingExecutionBlotter: React.FC<{ active?: boolean }> = ({ active }) => {
  return <StreamingBlotter domainObject="Execution" active={active} />;
};

export default StreamingExecutionBlotter;
