// ExecutionBlotter.tsx - Executions blotter component
import React from 'react';
import Blotter from './Blotter';

const ExecutionBlotter: React.FC = () => {
  return <Blotter domainObject="Execution" pageSize={100} />;
};

export default ExecutionBlotter;
