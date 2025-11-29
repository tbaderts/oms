// AuthorizeModal.tsx - OAuth token management interface
import React, { useState } from 'react';
import { AuthTokenService } from '../services/AuthTokenService';
import './AuthorizeModal.scss';

interface AuthorizeModalProps {
  onClose: () => void;
}

const AuthorizeModal: React.FC<AuthorizeModalProps> = ({ onClose }) => {
  const authService = AuthTokenService.getInstance();
  const [token, setToken] = useState(authService.getToken() || '');

  const handleSave = () => {
    authService.setToken(token);
    onClose();
  };

  const handleClear = () => {
    authService.clearToken();
    setToken('');
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="authorize-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2><span className="modal-icon">🔐</span> Authorization</h2>
          <button className="close-button" onClick={onClose}>&times;</button>
        </div>

        <div className="modal-body">
          <p>Enter your OAuth bearer token to authorize API requests.</p>

          <div className="form-group">
            <label>Bearer Token</label>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Enter your OAuth token..."
              className="token-input"
            />
            <span className="input-hint">Token will be stored in session storage</span>
          </div>
        </div>

        <div className="modal-actions">
          <button onClick={handleClear} className="secondary-button">Clear Token</button>
          <button onClick={onClose} className="secondary-button">Cancel</button>
          <button onClick={handleSave} className="primary-button">Save Token</button>
        </div>
      </div>
    </div>
  );
};

export default AuthorizeModal;
