// OrderEntry.tsx - the Order Entry tab (SPEC-0072): a new order with its instrument, economics and
// account, checked before sending and submitted to oms-core as an OrderCreateCmd. Instrument names
// and quotes come from oms-ui's backend (Alpha Vantage or the built-in instruments); the form works
// without them.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { OMSApiService } from '../services/OMSApiService';
import { ConfigService } from '../services/ConfigService';
import { Instrument, MarketDataService, Quote } from '../services/MarketDataService';
import {
  FieldErrors,
  HANDL_INSTS,
  ORD_TYPES,
  OrderTicket,
  SIDES,
  TIMES_IN_FORCE,
  TicketField,
  isOwnDuplicate,
  needsPrice,
  needsStopPx,
  newTicket,
  readRefusal,
  ticketSummary,
  toOrderCreateCmd,
  validateTicket,
} from '../services/orderTicket';
import './OrderEntry.scss';

interface OrderEntryProps {
  /** Debounce of the instrument lookup; tests set 0. */
  lookupDelayMs?: number;
  /** Shows the Orders tab, e.g. after an order was created. */
  onShowOrders?: () => void;
}

type Banner =
  | { kind: 'created'; orderId: string; byEarlierAttempt?: boolean }
  | { kind: 'refused'; message: string }
  | { kind: 'network'; message: string }
  /** The order may exist, but it could not be confirmed. */
  | { kind: 'unconfirmed' };

const ACCOUNTS_KEY = 'oms.orderEntry.accounts';
const LABELS: Record<string, string> = {
  BUY: 'Buy', SELL: 'Sell', SELL_SHORT: 'Sell short',
  LIMIT: 'Limit', MARKET: 'Market', STOP: 'Stop', STOP_LIMIT: 'Stop limit', MARKET_ON_CLOSE: 'Market on close',
  DAY: 'Day', GOOD_TILL_CANCEL: 'Good till cancel', IMMEDIATE_OR_CANCEL: 'Immediate or cancel',
  FILL_OR_KILL: 'Fill or kill', AT_THE_OPENING: 'At the opening',
  AUTO: 'Automated', BROKER_INTERVENTION_OK: 'Broker intervention OK', MANUAL: 'Manual',
};

/** Recently used accounts, newest first; per browser, best effort. */
function readAccounts(): string[] {
  try {
    const stored = JSON.parse(window.localStorage.getItem(ACCOUNTS_KEY) || '[]');
    return Array.isArray(stored) ? stored.filter(a => typeof a === 'string').slice(0, 5) : [];
  } catch {
    return [];
  }
}

function rememberAccount(account: string): string[] {
  const accounts = [account, ...readAccounts().filter(a => a !== account)].slice(0, 5);
  try {
    window.localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
  } catch {
    // storage unavailable: the suggestion is a convenience only
  }
  return accounts;
}

const fmt = (value?: number) => (value === undefined || value === null ? 'n/a' : String(value));

const OrderEntry: React.FC<OrderEntryProps> = ({ lookupDelayMs = 400, onShowOrders }) => {
  const [ticket, setTicket] = useState<OrderTicket>(() => newTicket());
  const [attempted, setAttempted] = useState(false);
  const [serverErrors, setServerErrors] = useState<FieldErrors>({});
  const [banner, setBanner] = useState<Banner | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false);
  const [accounts, setAccounts] = useState<string[]>(() => readAccounts());

  const [lookup, setLookup] = useState<{ instruments: Instrument[]; notice?: string } | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const lookupSeq = useRef(0);

  const errors = useMemo(() => ({ ...validateTicket(ticket), ...serverErrors }), [ticket, serverErrors]);
  const shownError = (name: TicketField) => (attempted || serverErrors[name] ? errors[name] : undefined);

  const update = useCallback((changes: Partial<OrderTicket>) => {
    setTicket(t => ({ ...t, ...changes }));
    // Editing a field answers oms-core's complaint about it.
    setServerErrors(e => {
      const next = { ...e };
      Object.keys(changes).forEach(k => delete next[k as TicketField]);
      return next;
    });
  }, []);

  // Instrument lookup as the symbol is typed (debounced); the answer for an older query is ignored.
  const [symbolQuery, setSymbolQuery] = useState('');
  useEffect(() => {
    const query = symbolQuery.trim();
    if (query.length < 2) {
      setLookup(null);
      return;
    }
    const seq = ++lookupSeq.current;
    const timer = setTimeout(() => {
      MarketDataService.search(query).then(result => {
        if (seq === lookupSeq.current) {
          setLookup({ instruments: result.instruments, notice: result.notice });
        }
      });
    }, lookupDelayMs);
    return () => clearTimeout(timer);
  }, [symbolQuery, lookupDelayMs]);

  // The quote shown is the one asked for last; a late answer for an earlier symbol is dropped.
  const quoteSeq = useRef(0);

  const choose = (instrument: Instrument) => {
    lookupSeq.current++;
    setLookup(null);
    setSymbolQuery('');
    setTicket(t => ({
      ...t,
      symbol: instrument.symbol,
      securityDesc: instrument.name,
      settlCurrency: t.settlCurrency || instrument.currency || '',
    }));
    setQuote(null);
    const seq = ++quoteSeq.current;
    MarketDataService.quote(instrument.symbol).then(q => {
      if (seq === quoteSeq.current) setQuote(q);
    });
  };

  // After a network error oms-core may or may not have applied the order (AC-4). Until that is
  // known, the next submit asks before it sends: the ticket's clOrdId may already name an order.
  const outcomeUnknown = useRef(false);

  const finishCreated = (orderId: string, byEarlierAttempt = false) => {
    setBanner({ kind: 'created', orderId, byEarlierAttempt });
    setAccounts(rememberAccount(ticket.account.trim()));
    // A further submit is a further order: it gets its own clOrdId (AC-4).
    setTicket(t => ({ ...t, clOrdId: newTicket().clOrdId }));
    outcomeUnknown.current = false;
    setAttempted(false);
    setServerErrors({});
  };

  /** Shows the order an earlier attempt of this ticket created; false when there is none. */
  const showEarlierOrder = async (api: OMSApiService): Promise<boolean> => {
    const order = await api.findOrderByClOrdId(ticket.clOrdId);
    if (order?.orderId) {
      finishCreated(order.orderId, true);
      return true;
    }
    return false;
  };

  const submit = async () => {
    if (inFlight.current) return;
    setAttempted(true);
    if (Object.keys(validateTicket(ticket)).length > 0) return;
    inFlight.current = true;
    setSubmitting(true);
    setBanner(null);
    setServerErrors({});
    const sessionId = ConfigService.getOrderEntrySessionId();
    try {
      const api = await OMSApiService.getInstance();
      if (outcomeUnknown.current) {
        if (await showEarlierOrder(api)) return;
        outcomeUnknown.current = false;
      }
      const outcome = await api.createOrder(toOrderCreateCmd(ticket, sessionId));
      if (outcome.kind === 'created') {
        finishCreated(outcome.orderId);
      } else if (outcome.kind === 'network') {
        outcomeUnknown.current = true;
        setBanner({ kind: 'network', message: outcome.message });
      } else {
        const refusal = readRefusal(outcome.body);
        if (isOwnDuplicate(refusal.message, ticket, sessionId)) {
          // An earlier attempt of this ticket was applied (AC-4): show that order.
          if (!(await showEarlierOrder(api))) {
            setBanner({ kind: 'unconfirmed' });
          }
        } else {
          setServerErrors(refusal.fields);
          setBanner({ kind: 'refused', message: refusal.message });
        }
      }
    } catch {
      // The lookup of an earlier attempt failed: say so rather than guess or send again.
      setBanner({ kind: 'unconfirmed' });
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  };

  const reset = () => {
    outcomeUnknown.current = false;
    quoteSeq.current++;
    setTicket(newTicket());
    setAttempted(false);
    setServerErrors({});
    setBanner(null);
    setQuote(null);
    setLookup(null);
  };

  const input = (name: TicketField, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className={`form-field ${shownError(name) ? 'has-error' : ''}`}>
      <label htmlFor={`oe-${name}`}>{label}</label>
      <input
        id={`oe-${name}`}
        value={(ticket[name] as string) ?? ''}
        aria-invalid={shownError(name) ? 'true' : 'false'}
        aria-describedby={shownError(name) ? `oe-${name}-error` : undefined}
        onChange={e => update({ [name]: e.target.value } as Partial<OrderTicket>)}
        {...props}
      />
      {shownError(name) && <span id={`oe-${name}-error`} className="field-error">{shownError(name)}</span>}
    </div>
  );

  const select = (name: TicketField, label: string, options: readonly string[]) => (
    <div className="form-field">
      <label htmlFor={`oe-${name}`}>{label}</label>
      <select id={`oe-${name}`} value={ticket[name] as string} onChange={e => update({ [name]: e.target.value } as Partial<OrderTicket>)}>
        {options.map(o => <option key={o} value={o}>{LABELS[o] ?? o}</option>)}
      </select>
    </div>
  );

  const canSummarise = ticket.symbol.trim() && ticket.orderQty.trim() && ticket.account.trim();

  return (
    <div className="order-entry">
      <form className="order-entry-form" onSubmit={e => { e.preventDefault(); submit(); }} noValidate>
        <section className="oe-section" aria-labelledby="oe-instrument-title">
          <h3 id="oe-instrument-title">Instrument</h3>
          <div className="symbol-lookup">
            {input('symbol', 'Symbol', {
              autoComplete: 'off',
              placeholder: 'Symbol or name',
              onChange: e => {
                update({ symbol: e.target.value.toUpperCase(), securityDesc: undefined });
                setSymbolQuery(e.target.value);
                quoteSeq.current++;
                setQuote(null);
              },
            })}
            {lookup && (
              <div className="lookup-results">
                {lookup.notice && <div className="lookup-notice" role="status">{lookup.notice}</div>}
                {lookup.instruments.length > 0 && (
                  <ul role="listbox" aria-label="Instruments">
                    {lookup.instruments.map(i => (
                      <li key={i.symbol} role="option" aria-selected="false" tabIndex={0}
                        onClick={() => choose(i)} onKeyDown={e => { if (e.key === 'Enter') choose(i); }}>
                        <strong>{i.symbol}</strong> {i.name}
                        {(i.region || i.currency) && <span className="lookup-meta"> {[i.region, i.currency].filter(Boolean).join(' · ')}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
          {ticket.securityDesc && <div className="security-desc">{ticket.securityDesc}</div>}
          {quote && (
            <section className="quote-panel" aria-label="Quote">
              {quote.notice && <div className="lookup-notice" role="status">{quote.notice}</div>}
              <dl>
                <div><dt>Last</dt><dd>{fmt(quote.last)}</dd></div>
                <div><dt>Change</dt><dd>{quote.change === undefined ? 'n/a' : `${quote.change} (${fmt(quote.changePercent)}%)`}</dd></div>
                <div><dt>Day range</dt><dd>{quote.low !== undefined && quote.high !== undefined ? `${quote.low} – ${quote.high}` : 'n/a'}</dd></div>
                <div><dt>Bid</dt><dd>{fmt(quote.bid)}</dd></div>
                <div><dt>Ask</dt><dd>{fmt(quote.ask)}</dd></div>
                <div><dt>As of</dt><dd>{quote.asOf ?? 'n/a'}</dd></div>
              </dl>
              <div className="quote-footer">
                <span className="quote-source">{quote.source === 'BUILT_IN' ? 'Simulator reference price' : quote.source === 'ALPHA_VANTAGE' ? 'Alpha Vantage' : ''}</span>
                {quote.last !== undefined && needsPrice(ticket.ordType) && (
                  <button type="button" className="secondary-button" onClick={() => update({ price: String(quote.last) })}>
                    Use last price
                  </button>
                )}
              </div>
            </section>
          )}
        </section>

        <section className="oe-section" aria-labelledby="oe-economics-title">
          <h3 id="oe-economics-title">Economics</h3>
          <div className="field-grid">
            {select('side', 'Side', SIDES)}
            {select('ordType', 'Order type', ORD_TYPES)}
            {input('orderQty', 'Quantity', { inputMode: 'decimal' })}
            {needsPrice(ticket.ordType) && input('price', 'Price', { inputMode: 'decimal' })}
            {needsStopPx(ticket.ordType) && input('stopPx', 'Stop price', { inputMode: 'decimal' })}
            {select('timeInForce', 'Time in force', TIMES_IN_FORCE)}
            {input('expireTime', 'Expire time', { type: 'datetime-local' })}
            {input('settlCurrency', 'Settlement currency', { maxLength: 3 })}
          </div>
        </section>

        <section className="oe-section" aria-labelledby="oe-account-title">
          <h3 id="oe-account-title">Account and routing</h3>
          <div className="field-grid">
            {input('account', 'Account', { list: 'order-entry-accounts', autoComplete: 'off' })}
            <datalist id="order-entry-accounts">
              {accounts.map(a => <option key={a} value={a} />)}
            </datalist>
            {input('exDestination', 'Destination')}
            {select('handlInst', 'Handling instruction', HANDL_INSTS)}
            {input('text', 'Text', { maxLength: 255 })}
          </div>
        </section>

        {banner?.kind === 'created' && (
          <div className="oe-banner success" role="status">
            <span>{`Order ${banner.orderId} created`}</span>
            {banner.byEarlierAttempt && (
              <span className="oe-banner-note">by an earlier attempt of this ticket; check its details in Orders</span>
            )}
            {onShowOrders && <button type="button" className="secondary-button" onClick={onShowOrders}>View in Orders</button>}
          </div>
        )}
        {banner?.kind === 'refused' && <div className="oe-banner error" role="alert">{banner.message}</div>}
        {banner?.kind === 'unconfirmed' && (
          <div className="oe-banner error" role="alert">
            Could not confirm whether the order was created; check the Orders tab before submitting again
          </div>
        )}
        {banner?.kind === 'network' && (
          <div className="oe-banner error" role="alert">
            <span>{`Could not reach oms-core: ${banner.message}`}</span>
            <button type="button" className="secondary-button" onClick={submit} disabled={submitting}>Retry</button>
          </div>
        )}

        <div className="oe-actions">
          <span className="oe-summary">{canSummarise ? ticketSummary(ticket) : ''}</span>
          <button type="button" className="secondary-button" onClick={reset} disabled={submitting}>Reset</button>
          <button type="submit" className="primary-button" disabled={submitting}>Submit order</button>
        </div>
      </form>
    </div>
  );
};

export default OrderEntry;
