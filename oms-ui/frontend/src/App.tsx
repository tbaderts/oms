// App.tsx - Main application shell with header, tabs, and navigation
import React, { useState, useEffect } from 'react';
import { ConfigService } from './services/ConfigService';
import { AuthTokenService } from './services/AuthTokenService';
import OrderBlotter from './components/OrderBlotter';
import ExecutionBlotter from './components/ExecutionBlotter';
import StreamingOrderBlotter from './components/StreamingOrderBlotter';
import StreamingExecutionBlotter from './components/StreamingExecutionBlotter';
import AuthorizeModal from './components/AuthorizeModal';
import AcmeLogo from './components/AcmeLogo';
import './App.scss';

// Feature flags for tab visibility
const FEATURE_FLAGS = {
  QUOTES_ENABLED: false,
  QUOTE_REQUESTS_ENABLED: false,
  STREAMING_ENABLED: true, // Enable real-time streaming mode
};

type TabType = 'orders' | 'executions' | 'quotes' | 'quoteRequests';
type DataMode = 'rest' | 'streaming';

const App: React.FC = () => {
  const [appName, setAppName] = useState('OMS Admin Tool');
  const [activeTab, setActiveTab] = useState<TabType>('orders');
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [dataMode, setDataMode] = useState<DataMode>('streaming'); // Default to streaming mode

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

  const handleModeChange = (mode: DataMode) => {
    setDataMode(mode);
  };

  // Render the appropriate blotter based on mode
  const renderOrderBlotter = () => {
    if (FEATURE_FLAGS.STREAMING_ENABLED && dataMode === 'streaming') {
      return <StreamingOrderBlotter onModeChange={handleModeChange} />;
    }
    return <OrderBlotter />;
  };

  const renderExecutionBlotter = () => {
    if (FEATURE_FLAGS.STREAMING_ENABLED && dataMode === 'streaming') {
      return <StreamingExecutionBlotter onModeChange={handleModeChange} />;
    }
    return <ExecutionBlotter />;
  };

  return (
    <div className="oms-app">
      {/* Header */}
      <header className="oms-header">
        <div className="header-left">
          <AcmeLogo width={200} height={50} color="#ffffff" />
          <h1>{appName}</h1>
        </div>
        <div className="header-right">
          {FEATURE_FLAGS.STREAMING_ENABLED && (
            <div className="mode-toggle">
              <button
                className={`mode-button ${dataMode === 'rest' ? 'active' : ''}`}
                onClick={() => setDataMode('rest')}
              >
                📋 REST
              </button>
              <button
                className={`mode-button ${dataMode === 'streaming' ? 'active' : ''}`}
                onClick={() => setDataMode('streaming')}
              >
                📡 Streaming
              </button>
            </div>
          )}
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
        {activeTab === 'orders' && renderOrderBlotter()}
        {activeTab === 'executions' && renderExecutionBlotter()}
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
