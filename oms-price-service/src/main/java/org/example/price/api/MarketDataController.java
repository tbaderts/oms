package org.example.price.api;

import org.example.common.api.MarketDataApi;
import org.example.common.model.marketdata.InstrumentSearchResult;
import org.example.common.model.marketdata.Quote;
import org.example.price.service.PriceService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import lombok.RequiredArgsConstructor;

/**
 * The market data API ({@code oms-marketdata-api.yml}) for the other services (SPEC-0079): instrument
 * search from the instrument list, quotes live or end-of-day. A symbol nobody prices is a 404.
 */
@RestController
@RequiredArgsConstructor
public class MarketDataController implements MarketDataApi {

    private final PriceService service;

    @Override
    public ResponseEntity<InstrumentSearchResult> searchInstruments(String query) {
        return ResponseEntity.ok(service.search(query));
    }

    @Override
    public ResponseEntity<Quote> getQuote(String symbol) {
        return service.quote(symbol)
                .map(ResponseEntity::ok)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No price for " + symbol));
    }
}
