---
type: Capability
title: "Quotes"
description: "Requesting and providing quotes (RFQ); schemas exist, nothing else."
tags: [quotes, rfq]
status: draft
maturity: "planned"
commands: ["QuoteCreateCmd", "QuoteRequestCreateCmd"]
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-contracts/src/main/avro/QuoteCreateCmd.avsc"
  - resource: "repo:oms-contracts/src/main/avro/QuoteRequestCreateCmd.avsc"
---
# Quotes

## Summary

Quote requests and quotes are modelled in Avro only; see [Quote and Quote Request](../domain/quote-and-quote-request.md).

## Behaviour

Not designed beyond the schemas; the admin UI specification mentions quote and quote request views.

## Requirements

- [FR-037 Request quotes](../functional-requirements/FR-037-request-quotes.md)
- [FR-038 Provide quotes](../functional-requirements/FR-038-provide-quotes.md)

## Detailed specifications

- [User Interface Specification: OMS Admin Tool](../ui/oms-admin-ui_spec.md) (quote views)

## Known gaps

- No entity, processor, API or concept paper.
