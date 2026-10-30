---
id: venue-accepts
title: The venue accepts the order
kind: external
from: exchange
to: oms-core
illustrations:
  - src: venue-accepts.excalidraw.svg
    caption: The simulator accepts and the OMS moves the order from UNACK to LIVE
links:
  api: [oms-cmd-api#OrderAcceptCmd]
  states: ["UNACK -> LIVE"]
  requirements: [FR-027, FR-029, FR-005, FR-006]
in:
  - name: Order message
    origin: { kind: step, ref: publish-order }
  - name: Venue rules
    shape: "simulator configuration: price band, reject rate, fill slices"
    origin: { kind: external, label: exchange simulator configuration }
out:
  - name: Live order
    shape: "{ orderId, state: LIVE, leavesQty: 100 }"
extensions:
  - id: venue-rejects
    when: The venue rejects the order, for example because the price is outside its band
    then: The simulator sends an OrderRejectCmd; the OMS moves the order to REJ and keeps the reason.
    continueAt: { kind: end }
    illustrations:
      - src: venue-accepts-venue-rejects.excalidraw.svg
        caption: An order priced outside the band ends as REJ, with the reason stored
    out:
      - name: Reject reason
        shape: "{ orderId, state: REJ, text: price outside the band }"
        final: true
---

## What happens

The exchange simulator reads the order, applies its venue rules and decides to accept it. It answers
with an `OrderAcceptCmd` on the `commands` topic. The OMS applies it and the ACME order becomes LIVE:
it is now working at the venue.

## Business rules

- Only an UNACK order can be accepted; anything else is refused as an invalid transition.
- A repeated acknowledgement is not applied twice.

## Notes

- The simulator's decisions (accept or reject, how many fill slices) come from its configuration; see
  the exchange simulator concept page.
