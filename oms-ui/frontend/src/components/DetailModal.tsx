import React from 'react';
import DetailPanel from './DetailPanel';
import './DetailModal.scss';

interface DetailModalProps {
  data: any;
  title: string;
  onClose: () => void;
}

const DetailModal: React.FC<DetailModalProps> = ({ data, title, onClose }) => {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="detail-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{title} Details</h2>
          <button className="close-button" onClick={onClose}>&times;</button>
        </div>
        
        <div className="modal-content">
          <DetailPanel data={data} />
        </div>

        <div className="modal-actions">
          <button onClick={onClose} className="primary-button">Close</button>
        </div>
      </div>
    </div>
  );
};

export default DetailModal;
