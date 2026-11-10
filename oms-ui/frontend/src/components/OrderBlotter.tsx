// OrderBlotter.tsx - Orders blotter component
import React from 'react';
import Blotter from './Blotter';

const OrderBlotter: React.FC<{ active?: boolean }> = ({ active }) => {
  return <Blotter domainObject="Order" pageSize={100} active={active} />;
};

export default OrderBlotter;
