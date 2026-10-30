---
type: Domain Concept
title: "Quote and Quote Request"
description: "Quote requests and quotes as they exist today: Avro schemas and commands only, with no entity, processor or API behind them."
tags: [quotes, rfq, schema-only]
status: draft
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-contracts/src/main/avro/Quote.avsc"
  - resource: "repo:oms-contracts/src/main/avro/QuoteRequest.avsc"
  - resource: "repo:oms-contracts/src/main/avro/QuoteCreateCmd.avsc"
  - resource: "repo:oms-contracts/src/main/avro/QuoteRequestCreateCmd.avsc"
---
# Quote and Quote Request

A **quote request** asks for a price for a quantity of an instrument (`symbol`, `quantity`,
`currency`); a **quote** answers one (`quoteRequestId`, `price`).

Today both exist only as Avro records with create commands (`QuoteRequestCreateCmd`,
`QuoteCreateCmd`). There is no entity, table, processor, API or UI behind them, and no dispatcher
handles the commands. See the planned capability [Quotes](../capabilities/quotes.md).

## Related

- [Avro Messages](../interfaces/avro-messages.md), [Glossary](glossary.md)
