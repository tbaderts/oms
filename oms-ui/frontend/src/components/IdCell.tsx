import React from 'react';
import './IdCell.scss';

interface IdCellProps {
  value: string | null | undefined;
}

/**
 * An identifier cell (SPEC-0059). Ids of one order tree share a long prefix (an exec id is its order
 * id plus "-F1"), so when the column is too narrow the start is truncated and the distinguishing end
 * stays visible; the full id is the tooltip.
 */
const IdCell: React.FC<IdCellProps> = ({ value }) => {
  if (value == null || value === '') return null;
  return (
    <span className="id-cell" title={String(value)}>
      <bdi>{String(value)}</bdi>
    </span>
  );
};

export default IdCell;
