// ExecutionBlotter.tsx - Executions blotter component
import React from 'react';
import Blotter from './Blotter';

const ExecutionBlotter: React.FC<{ active?: boolean }> = ({ active }) => {
  return <Blotter domainObject="Execution" pageSize={100} active={active} />;
};

export default ExecutionBlotter;
