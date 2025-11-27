// App.tsx - Main application shell with header, tabs, and navigation
import React, { useState, useEffect } from 'react';
import { ConfigService } from './services/ConfigService';
import { AuthTokenService } from './services/AuthTokenService';
import OrderBlotter from './components/OrderBlotter';
import ExecutionBlotter from './components/ExecutionBlotter';
import AuthorizeModal from './components/AuthorizeModal';
import './App.scss';

// Feature flags for tab visibility
const FEATURE_FLAGS = {
  QUOTES_ENABLED: false,
  QUOTE_REQUESTS_ENABLED: false,
};

type TabType = 'orders' | 'executions' | 'quotes' | 'quoteRequests';

const App: React.FC = () => {
  const [appName, setAppName] = useState('OMS Admin Tool');
  const [activeTab, setActiveTab] = useState<TabType>('orders');
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);

  useEffect(() => {
    // Load configuration
    ConfigService.getConfig().then(config => {
      setAppName(config.appName);
    });

    // Check initial auth status
    const authService = AuthTokenService.getInstance();
    setIsAuthorized(authService.hasToken());

    // Listen for token changes
    const tokenChangeListener = (token: string | null) => {
      setIsAuthorized(token !== null && token.length > 0);
    };
    authService.addTokenChangeListener(tokenChangeListener);

    return () => {
      authService.removeTokenChangeListener(tokenChangeListener);
    };
  }, []);

  const handleAuthorizeClick = () => {
    setShowAuthModal(true);
  };

  const handleCloseAuthModal = () => {
    setShowAuthModal(false);
  };

  return (
    <div className="oms-app">
      {/* Header */}
      <header className="oms-header">
        <div className="header-left">
          <div className="brand-logo">Acme Capital</div>
          <h1>{appName}</h1>
        </div>
        <div className="header-right">
          <button
            className={`authorize-button ${isAuthorized ? 'authorized' : ''}`}
            onClick={handleAuthorizeClick}
          >
            🔒 {isAuthorized ? 'Authorized' : 'Authorize'}
          </button>
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav className="oms-tabs">
        <button
          className={`tab ${activeTab === 'orders' ? 'active' : ''}`}
          onClick={() => setActiveTab('orders')}
        >
          Orders
        </button>
        <button
          className={`tab ${activeTab === 'executions' ? 'active' : ''}`}
          onClick={() => setActiveTab('executions')}
        >
          Executions
        </button>
        {FEATURE_FLAGS.QUOTES_ENABLED && (
          <button
            className={`tab ${activeTab === 'quotes' ? 'active' : ''}`}
            onClick={() => setActiveTab('quotes')}
          >
            Quotes
          </button>
        )}
        {FEATURE_FLAGS.QUOTE_REQUESTS_ENABLED && (
          <button
            className={`tab ${activeTab === 'quoteRequests' ? 'active' : ''}`}
            onClick={() => setActiveTab('quoteRequests')}
          >
            Quote Requests
          </button>
        )}
      </nav>

      {/* Content Area */}
      <main className="oms-content">
        {activeTab === 'orders' && <OrderBlotter />}
        {activeTab === 'executions' && <ExecutionBlotter />}
        {activeTab === 'quotes' && <div>Quotes blotter (coming soon)</div>}
        {activeTab === 'quoteRequests' && <div>Quote Requests blotter (coming soon)</div>}
      </main>

      {/* Footer */}
      <footer className="oms-footer">
        <div className="footer-logo">Acme Capital</div>
        <div className="footer-text">© 2025 Acme Capital OMS</div>
      </footer>

      {/* Authorization Modal */}
      {showAuthModal && <AuthorizeModal onClose={handleCloseAuthModal} />}
    </div>
  );
};

export default App;
