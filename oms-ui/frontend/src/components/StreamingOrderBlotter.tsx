// StreamingOrderBlotter.tsx - Streaming orders blotter component
import React from 'react';
import StreamingBlotter from './StreamingBlotter';

const StreamingOrderBlotter: React.FC = () => {
  return <StreamingBlotter domainObject="Order" />;
};

export default StreamingOrderBlotter;
