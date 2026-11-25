// App.tsx - Main application shell with header, tabs, and navigation
import React, { useState, useEffect, Suspense } from 'react';
import { ConfigService, FeatureFlags, DEFAULT_FEATURE_FLAGS } from './services/ConfigService';
import { AuthTokenService } from './services/AuthTokenService';
import OrderBlotter from './components/OrderBlotter';
import ExecutionBlotter from './components/ExecutionBlotter';
import StreamingOrderBlotter from './components/StreamingOrderBlotter';
import StreamingExecutionBlotter from './components/StreamingExecutionBlotter';
import OrderEntry from './components/OrderEntry';
import OutboxView from './components/OutboxView';
import DeadLetterView from './components/DeadLetterView';
import AuthorizeModal from './components/AuthorizeModal';
import AcmeLogo from './components/AcmeLogo';
import Icon from './components/icons/Icon';
import './App.scss';

// SPEC-0057: the load harness, loaded only when the URL asks for it (?loadHarness), so normal
// users download none of it.
const LoadHarness = React.lazy(() => import('./loadHarness/LoadHarness'));

type TabType = 'orders' | 'executions' | 'orderEntry' | 'outbox' | 'deadLetters' | 'quotes' | 'quoteRequests';
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

  // Order entry (SPEC-0072) does not depend on the data mode; once opened it stays mounted, so a
  // half-filled ticket survives a look at the blotters.
  const [orderEntryOpened, setOrderEntryOpened] = useState(false);
  useEffect(() => {
    if (activeTab === 'orderEntry') setOrderEntryOpened(true);
  }, [activeTab]);

  // The operator views (SPEC-0075): each loads when its tab is first opened and then stays mounted,
  // so switching tabs keeps its filter, page and open detail.
  const [operationsOpened, setOperationsOpened] = useState<{ outbox: boolean; deadLetters: boolean }>({
    outbox: false,
    deadLetters: false,
  });
  useEffect(() => {
    if (activeTab === 'outbox' || activeTab === 'deadLetters') {
      setOperationsOpened((opened) => (opened[activeTab] ? opened : { ...opened, [activeTab]: true }));
    }
  }, [activeTab]);

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
              {/* Named for what the trader sees (SPEC-0059); the internal modes stay 'streaming' and 'rest'. */}
              <button
                className={`mode-button ${dataMode === 'streaming' ? 'active' : ''}`}
                aria-pressed={dataMode === 'streaming'}
                onClick={() => setDataMode('streaming')}
                title="Live: orders and executions as they happen"
              >
                Live
              </button>
              <button
                className={`mode-button ${dataMode === 'rest' ? 'active' : ''}`}
                aria-pressed={dataMode === 'rest'}
                onClick={() => setDataMode('rest')}
                title="History: search and page through stored orders and executions"
              >
                History
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
        <button
          className={`tab ${activeTab === 'orderEntry' ? 'active' : ''}`}
          onClick={() => setActiveTab('orderEntry')}
        >
          Order Entry
        </button>
        <button
          className={`tab ${activeTab === 'outbox' ? 'active' : ''}`}
          onClick={() => setActiveTab('outbox')}
        >
          Outbox
        </button>
        <button
          className={`tab ${activeTab === 'deadLetters' ? 'active' : ''}`}
          onClick={() => setActiveTab('deadLetters')}
        >
          Dead letters
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
        {(orderEntryOpened || activeTab === 'orderEntry') && (
          <div
            className="blotter-view"
            hidden={activeTab !== 'orderEntry'}
            style={activeTab !== 'orderEntry' ? { display: 'none' } : undefined}
          >
            <OrderEntry onShowOrders={() => setActiveTab('orders')} />
          </div>
        )}
        {(operationsOpened.outbox || activeTab === 'outbox') && (
          <div
            className="blotter-view"
            hidden={activeTab !== 'outbox'}
            style={activeTab !== 'outbox' ? { display: 'none' } : undefined}
          >
            <OutboxView />
          </div>
        )}
        {(operationsOpened.deadLetters || activeTab === 'deadLetters') && (
          <div
            className="blotter-view"
            hidden={activeTab !== 'deadLetters'}
            style={activeTab !== 'deadLetters' ? { display: 'none' } : undefined}
          >
            <DeadLetterView />
          </div>
        )}
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
