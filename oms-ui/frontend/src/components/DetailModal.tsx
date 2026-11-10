import React from 'react';
import DetailPanel from './DetailPanel';
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

const DetailModal: React.FC<DetailModalProps> = ({ data, title, domainObject, onClose }) => {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="detail-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="close-button" onClick={onClose} aria-label="Close details">
            <Icon name="close" size={18} />
          </button>
        </div>
        
        <div className="modal-content">
          <DetailPanel data={data} domainObject={domainObject} />
        </div>

        <div className="modal-actions">
          <button onClick={onClose} className="primary-button">Close</button>
        </div>
      </div>
    </div>
  );
};

export default DetailModal;
