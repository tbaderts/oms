package org.example.omsui.marketdata;

import org.example.common.api.MarketDataApi;
import org.example.common.model.marketdata.InstrumentSearchResult;
import org.example.common.model.marketdata.Quote;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

import lombok.RequiredArgsConstructor;

/**
 * The market data API for order entry (SPEC-0072, {@code oms-marketdata-api.yml}): instrument lookup
 * and quotes, from the provider, its cache or the built-in instruments.
 */
@RestController
@RequiredArgsConstructor
public class MarketDataController implements MarketDataApi {

    private final MarketDataService service;

    @Override
    public ResponseEntity<InstrumentSearchResult> searchInstruments(String query) {
        return ResponseEntity.ok(service.search(query));
    }

    @Override
    public ResponseEntity<Quote> getQuote(String symbol) {
        return service.quote(symbol)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }
}
