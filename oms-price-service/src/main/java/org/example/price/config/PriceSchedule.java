package org.example.price.config;

import org.example.price.eod.EndOfDayStore;
import org.example.price.reference.ReferenceDataRefresher;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;

/**
 * The price service's timed work (SPEC-0079): the hourly check whether the instrument list is due
 * for a refresh (first shortly after startup), and the check for new or changed end-of-day files.
 * Off with {@code oms.price.reference.scheduled=false}, for tests that count provider requests.
 */
@Component
@RequiredArgsConstructor
@ConditionalOnProperty(name = "oms.price.reference.scheduled", havingValue = "true", matchIfMissing = true)
public class PriceSchedule {

    private final ReferenceDataRefresher refresher;
    private final EndOfDayStore store;

    @Scheduled(fixedDelayString = "PT1H", initialDelayString = "PT10S")
    public void refreshInstruments() {
        refresher.refresh();
    }

    @Scheduled(fixedDelayString = "${oms.price.eod.reload-interval:PT1M}", initialDelayString = "${oms.price.eod.reload-interval:PT1M}")
    public void reloadEndOfDay() {
        store.reloadIfChanged();
    }
}
