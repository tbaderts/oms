import React, { useState } from 'react';
import { useDialog } from '../hooks/useKeyboard';
import DetailPanel from './DetailPanel';
import OrderHistory from './OrderHistory';
import Icon from './icons/Icon';
import { DomainObjectType } from '../types/types';
import './DetailModal.scss';

interface DetailModalProps {
  data: any;
  /** The whole title, e.g. "Order details" (SPEC-0058). */
  title: string;
  /** Whose metamodel labels the badges show. */
  domainObject?: DomainObjectType;
  onClose: () => void;
}

type View = 'details' | 'history';

const DetailModal: React.FC<DetailModalProps> = ({ data, title, domainObject, onClose }) => {
  const dialogRef = useDialog<HTMLDivElement>(onClose);
  // An order also has its command and event history (SPEC-0074), fetched when first shown and kept
  // while the modal is open.
  const hasHistory = domainObject === 'Order' && !!data?.orderId;
  const [view, setView] = useState<View>('details');
  const [historyShown, setHistoryShown] = useState(false);

  const select = (next: View) => {
    setView(next);
    if (next === 'history') setHistoryShown(true);
  };

  const tab = (id: View, label: string) => (
    <button
      type="button"
      role="tab"
      id={`detail-tab-${id}`}
      aria-selected={view === id}
      aria-controls={`detail-panel-${id}`}
      className={`detail-tab${view === id ? ' active' : ''}`}
      onClick={() => select(id)}
    >
      {label}
    </button>
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="detail-modal" ref={dialogRef} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="close-button" onClick={onClose} aria-label="Close details">
            <Icon name="close" size={18} />
          </button>
        </div>

        {hasHistory && (
          <div className="detail-tabs" role="tablist" aria-label="Order views">
            {tab('details', 'Details')}
            {tab('history', 'History')}
          </div>
        )}

        <div className="modal-content">
          {hasHistory ? (
            <>
              <div role="tabpanel" id="detail-panel-details" aria-labelledby="detail-tab-details" hidden={view !== 'details'}>
                <DetailPanel data={data} domainObject={domainObject} />
              </div>
              <div role="tabpanel" id="detail-panel-history" aria-labelledby="detail-tab-history" hidden={view !== 'history'}>
                {historyShown && <OrderHistory orderId={data.orderId} />}
              </div>
            </>
          ) : (
            <DetailPanel data={data} domainObject={domainObject} />
          )}
        </div>

        <div className="modal-actions">
          <button onClick={onClose} className="primary-button">Close</button>
        </div>
      </div>
    </div>
  );
};

export default DetailModal;
