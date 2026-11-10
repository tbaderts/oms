// App.tsx - Main application shell with header, tabs, and navigation
import React, { useState, useEffect, Suspense } from 'react';
import { ConfigService, FeatureFlags, DEFAULT_FEATURE_FLAGS } from './services/ConfigService';
import { AuthTokenService } from './services/AuthTokenService';
import OrderBlotter from './components/OrderBlotter';
import ExecutionBlotter from './components/ExecutionBlotter';
import StreamingOrderBlotter from './components/StreamingOrderBlotter';
import StreamingExecutionBlotter from './components/StreamingExecutionBlotter';
import AuthorizeModal from './components/AuthorizeModal';
import AcmeLogo from './components/AcmeLogo';
import Icon from './components/icons/Icon';
import './App.scss';

// SPEC-0057: the load harness, loaded only when the URL asks for it (?loadHarness), so normal
// users download none of it.
const LoadHarness = React.lazy(() => import('./loadHarness/LoadHarness'));

type TabType = 'orders' | 'executions' | 'quotes' | 'quoteRequests';
type DataMode = 'rest' | 'streaming';

const OmsApp: React.FC = () => {
  const [appName, setAppName] = useState('OMS Admin Tool');
  const [activeTab, setActiveTab] = useState<TabType>('orders');
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [dataMode, setDataMode] = useState<DataMode>('streaming'); // Default to streaming mode
  const [featureFlags, setFeatureFlags] = useState<FeatureFlags>(DEFAULT_FEATURE_FLAGS);

  useEffect(() => {
    // Load configuration
    ConfigService.getConfig().then(config => {
      setAppName(config.appName);
      setFeatureFlags(ConfigService.getFeatureFlags());
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

  // The blotter views, one per data mode and tab. A view is mounted the first time it is shown and
  // then kept mounted while hidden (SPEC-0056): a live blotter keeps its subscription and rows, so a
  // tab or mode switch never re-downloads the snapshot, and a REST blotter keeps its page.
  const effectiveMode: DataMode = featureFlags.streamingEnabled && dataMode === 'streaming' ? 'streaming' : 'rest';
  const activeView = `${effectiveMode}:${activeTab}`;
  const [visitedViews, setVisitedViews] = useState<string[]>([]);
  useEffect(() => {
    setVisitedViews(views => (views.includes(activeView) ? views : [...views, activeView]));
  }, [activeView]);

  // Each blotter is told whether its view is shown: a hidden one keeps its subscription or page,
  // but does not save state or auto-refresh, and re-reads the shared state when shown again.
  const BLOTTER_VIEWS: Record<string, (active: boolean) => React.ReactNode> = {
    'streaming:orders': active => <StreamingOrderBlotter active={active} />,
    'streaming:executions': active => <StreamingExecutionBlotter active={active} />,
    'rest:orders': active => <OrderBlotter active={active} />,
    'rest:executions': active => <ExecutionBlotter active={active} />,
  };
  const mountedViews = visitedViews.includes(activeView) ? visitedViews : [...visitedViews, activeView];

  return (
    <div className="oms-app">
      {/* Header */}
      <header className="oms-header">
        <div className="header-left">
          <AcmeLogo width={168} height={42} color="currentColor" className="header-logo" />
          <span className="header-divider" aria-hidden="true" />
          <h1>{appName}</h1>
        </div>
        <div className="header-right">
          {featureFlags.streamingEnabled && (
            <div className="mode-toggle" role="group" aria-label="Data mode">
              <button
                className={`mode-button ${dataMode === 'rest' ? 'active' : ''}`}
                onClick={() => setDataMode('rest')}
              >
                REST
              </button>
              <button
                className={`mode-button ${dataMode === 'streaming' ? 'active' : ''}`}
                onClick={() => setDataMode('streaming')}
              >
                Streaming
              </button>
            </div>
          )}
          <button
            className={`authorize-button ${isAuthorized ? 'authorized' : ''}`}
            onClick={handleAuthorizeClick}
          >
            <Icon name="key" />
            {isAuthorized ? 'Authorized' : 'Authorize'}
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
        {featureFlags.quotesEnabled && (
          <button
            className={`tab ${activeTab === 'quotes' ? 'active' : ''}`}
            onClick={() => setActiveTab('quotes')}
          >
            Quotes
          </button>
        )}
        {featureFlags.quoteRequestsEnabled && (
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
        {mountedViews
          .filter(view => view in BLOTTER_VIEWS)
          .map(view => (
            <div
              key={view}
              data-view={view}
              className="blotter-view"
              hidden={view !== activeView}
              style={view !== activeView ? { display: 'none' } : undefined}
            >
              {BLOTTER_VIEWS[view](view === activeView)}
            </div>
          ))}
        {activeTab === 'quotes' && <div>Quotes blotter (coming soon)</div>}
        {activeTab === 'quoteRequests' && <div>Quote Requests blotter (coming soon)</div>}
      </main>

      {/* Footer */}
      <footer className="oms-footer">
        <span className="footer-text">© {new Date().getFullYear()} Acme Capital · {appName}</span>
      </footer>

      {/* Authorization Modal */}
      {showAuthModal && <AuthorizeModal onClose={handleCloseAuthModal} />}
    </div>
  );
};

const App: React.FC = () => {
  if (new URLSearchParams(window.location.search).has('loadHarness')) {
    return (
      <Suspense fallback={<div className="loading-overlay">Loading load harness...</div>}>
        <LoadHarness />
      </Suspense>
    );
  }
  return <OmsApp />;
};

export default App;
