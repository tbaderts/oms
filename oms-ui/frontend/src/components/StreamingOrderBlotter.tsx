// StreamingOrderBlotter.tsx - Streaming orders blotter component
import React from 'react';
import StreamingBlotter from './StreamingBlotter';

const StreamingOrderBlotter: React.FC<{ active?: boolean }> = ({ active }) => {
  return <StreamingBlotter domainObject="Order" active={active} />;
};

export default StreamingOrderBlotter;
