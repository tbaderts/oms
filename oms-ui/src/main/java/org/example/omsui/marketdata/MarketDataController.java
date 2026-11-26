package org.example.omsui.marketdata;

import org.example.common.api.MarketDataApi;
import org.example.common.model.marketdata.InstrumentSearchResult;
import org.example.common.model.marketdata.Quote;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

import lombok.RequiredArgsConstructor;

/**
 * The market data API for order entry (SPEC-0072, {@code oms-marketdata-api.yml}): instrument lookup
 * and quotes, forwarded to the price service (SPEC-0079), which owns market data. Parameters are
 * validated here, so a bad query never leaves oms-ui.
 */
@RestController
@RequiredArgsConstructor
public class MarketDataController implements MarketDataApi {

    private final PriceServiceClient priceService;

    @Override
    public ResponseEntity<InstrumentSearchResult> searchInstruments(String query) {
        return ResponseEntity.ok(priceService.search(query));
    }

    @Override
    public ResponseEntity<Quote> getQuote(String symbol) {
        return priceService.quote(symbol)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }
}
