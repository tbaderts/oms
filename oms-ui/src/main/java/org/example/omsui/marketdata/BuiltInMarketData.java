package org.example.omsui.marketdata;

import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.stream.Stream;

import org.example.common.model.marketdata.Instrument;
import org.example.common.model.marketdata.MarketDataSource;
import org.example.common.model.marketdata.Quote;

/**
 * The instruments order entry offers when the market data provider cannot answer (SPEC-0072): the
 * exchange simulator's symbols, from configuration, with its reference price as the last price.
 */
public class BuiltInMarketData {

    private final List<MarketDataProperties.BuiltInInstrument> instruments;

    public BuiltInMarketData(List<MarketDataProperties.BuiltInInstrument> instruments) {
        this.instruments = List.copyOf(instruments);
    }

    /** Symbols starting with the query first, then names containing it; case-insensitive. */
    public List<Instrument> search(String query) {
        String q = query.trim().toLowerCase(Locale.ROOT);
        Stream<MarketDataProperties.BuiltInInstrument> bySymbol = instruments.stream()
                .filter(i -> i.symbol().toLowerCase(Locale.ROOT).startsWith(q));
        Stream<MarketDataProperties.BuiltInInstrument> byName = instruments.stream()
                .filter(i -> !i.symbol().toLowerCase(Locale.ROOT).startsWith(q))
                .filter(i -> i.name() != null && i.name().toLowerCase(Locale.ROOT).contains(q));
        return Stream.concat(bySymbol, byName)
                .<Instrument>map(i -> Instrument.builder().symbol(i.symbol()).name(i.name()).currency(i.currency()).build())
                .toList();
    }

    /** The reference price as a quote; no change, range, bid or ask. */
    public Optional<Quote> quote(String symbol, String notice) {
        return instruments.stream()
                .filter(i -> i.symbol().equalsIgnoreCase(symbol.trim()))
                .findFirst()
                .<Quote>map(i -> Quote.builder()
                        .symbol(i.symbol())
                        .last(i.price())
                        .currency(i.currency())
                        .source(MarketDataSource.BUILT_IN)
                        .notice(notice)
                        .build());
    }
}
