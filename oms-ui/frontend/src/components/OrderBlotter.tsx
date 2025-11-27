// OrderBlotter.tsx - Orders blotter component
import React from 'react';
import Blotter from './Blotter';

const OrderBlotter: React.FC = () => {
  return <Blotter domainObject="Order" pageSize={100} />;
};

export default OrderBlotter;
