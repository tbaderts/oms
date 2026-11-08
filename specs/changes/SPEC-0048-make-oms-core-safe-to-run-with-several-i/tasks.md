# Tasks — SPEC-0048: Make oms-core safe to run with several instances

> **Stage 3 of 3 — the executable plan.** The implement stage works top to bottom and ticks each
> box only when its `verify:` check passes. Keep tasks small (one focused change, about one
> red→green cycle) and in dependency order:
>
> 1. Contracts (oms-contracts) and regeneration
> 2. Migration (new Liquibase changelog)
> 3. Behaviour, one task per AC or slice: write the failing test, implement, make it green
> 4. Wiring: API, messaging, configuration
> 5. Observability (logs, metrics)
> 6. Knowledge base and docs
> 7. Full verification (`spec verify`)
>
> Format, which the gate parses:
>
> ```
> - [ ] **T-1** Imperative summary (AC-1, AC-2)
>   - files: path/one.java, path/two.yaml
>   - verify: `./gradlew test --tests 'org.example.oms…SomeTest'` passes
> ```
>
> Every AC must be covered by at least one task, and every task needs a `verify:` line. Tasks may
> be added during implementation; record why under Notes.

## Tasks

- [x] **T-1** Change `OrderVersionIntegrationTest#concurrentFillsThroughThePipelineOneWaitsThenFails` into `…OneWaitsThenApplies` (red). Make `ExecutionCommandProcessor.loadOrder` take the row lock (AC-1)
  - files: oms-core/src/main/java/org/example/oms/service/execution/ExecutionCommandProcessor.java, oms-core/src/test/java/org/example/oms/integration/OrderVersionIntegrationTest.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.integration.OrderVersionIntegrationTest'` passes
- [x] **T-2** Write `KafkaConsumerConfigTest` (back-off per exception type) and extend `OrderVersionIntegrationTest#kafkaFillRetriedAfterAConflict` past the retry budget with no dead letter (red). Then add the concurrency back-off function and the retry-logging listener (AC-2)
  - files: oms-core/src/main/java/org/example/oms/config/KafkaConsumerConfig.java, oms-core/src/main/resources/application.yml, oms-core/src/test/java/org/example/oms/config/KafkaConsumerConfigTest.java, oms-core/src/test/java/org/example/oms/integration/OrderVersionIntegrationTest.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.config.KafkaConsumerConfigTest' --tests 'org.example.oms.integration.OrderVersionIntegrationTest'` passes
- [x] **T-3** Write `LeadershipTest` (red). Then add `Leadership`, `Role`, `LeadershipHealthIndicator` and the `leadership` health group (AC-3, AC-6)
  - files: oms-core/src/main/java/org/example/oms/service/leadership/Leadership.java, oms-core/src/main/java/org/example/oms/service/leadership/Role.java, oms-core/src/main/java/org/example/oms/service/leadership/LeadershipHealthIndicator.java, oms-core/src/main/resources/application.yml, oms-core/src/test/java/org/example/oms/service/leadership/LeadershipTest.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.service.leadership.*'` passes
- [x] **T-4** Update `OutboxRelayTest` (a non-leader does nothing, drains are serial, a full batch loops) and write `OutboxNudgeIntegrationTest` (red). Then restructure `OutboxRelay` (`poll`, `nudge`, `drainAll`, `drainBatch`) and add the after-commit nudge in `OrderEventAppender` (AC-3, AC-4)
  - files: oms-core/src/main/java/org/example/oms/service/OutboxRelay.java, oms-core/src/main/java/org/example/oms/service/OrderEventAppender.java, oms-core/src/test/java/org/example/oms/service/OutboxRelayTest.java, oms-core/src/test/java/org/example/oms/integration/OutboxNudgeIntegrationTest.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.service.OutboxRelayTest' --tests 'org.example.oms.integration.OutboxNudgeIntegrationTest' --tests 'org.example.oms.integration.OutboxHoldIntegrationTest'` passes
- [x] **T-5** Gate `EndOfDayScheduler` on scheduler leadership, unit test first (AC-6)
  - files: oms-core/src/main/java/org/example/oms/service/endofday/EndOfDayScheduler.java, oms-core/src/test/java/org/example/oms/service/endofday/EndOfDaySchedulerTest.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.service.endofday.*'` passes
- [x] **T-6** Write `KafkaTopicProvisionerIntegrationTest` (red). Then add `KafkaTopicProvisioner`, the `kafka.topics.*` settings, and the listener concurrency from it (AC-5)
  - files: oms-core/src/main/java/org/example/oms/config/KafkaTopicProvisioner.java, oms-core/src/main/java/org/example/oms/config/KafkaConsumerConfig.java, oms-core/src/main/resources/application.yml, oms-core/src/test/java/org/example/oms/integration/KafkaTopicProvisionerIntegrationTest.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.integration.KafkaTopicProvisionerIntegrationTest' --tests 'org.example.oms.integration.CommandListenerKafkaIntegrationTest'` passes
- [x] **T-7** Add the `SecondInstance` test helper and `TwoInstanceIntegrationTest`: ten concurrent fills, one relay leader with takeover, schedulers on the leader only, and the contention test. Add `OrderVersionTwoInstanceIntegrationTest` and `OutboxHoldTwoInstanceIntegrationTest`. Red first where the behaviour is missing, then fix (AC-1, AC-3, AC-6, AC-7)
  - files: oms-core/src/test/java/org/example/oms/integration/SecondInstance.java, oms-core/src/test/java/org/example/oms/integration/TwoInstanceIntegrationTest.java, oms-core/src/test/java/org/example/oms/integration/OrderVersionTwoInstanceIntegrationTest.java, oms-core/src/test/java/org/example/oms/integration/OutboxHoldTwoInstanceIntegrationTest.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.integration.TwoInstanceIntegrationTest' --tests 'org.example.oms.integration.OrderVersionTwoInstanceIntegrationTest' --tests 'org.example.oms.integration.OutboxHoldTwoInstanceIntegrationTest'` passes
- [x] **T-8** Update the knowledge base: event-publication (leader, nudge, slices design, operations), outbox-message, kafka-topics, execution-processing (AC-3, AC-5)
  - files: oms-knowledge-base/capabilities/event-publication.md, oms-knowledge-base/domain/outbox-message.md, oms-knowledge-base/interfaces/kafka-topics.md, oms-knowledge-base/capabilities/execution-processing.md
  - verify: grep finds `advisory lock` in event-publication.md, `partition` and `resize` in kafka-topics.md, and `lock` in execution-processing.md
- [x] **T-9** Run the full oms-core suite
  - verify: `cd oms-core && ./gradlew check` passes
- [x] **T-10** Run spec verify
  - verify: `node specs/tools/spec.mjs verify SPEC-0048` exits 0

- [x] **T-11** Write `OutboxClaimIntegrationTest` (a second claim blocks on the first claim's rows instead of skipping; red with SKIP LOCKED). Make `claimPending` block (AC-3, AC-7)
  - files: oms-core/src/main/java/org/example/oms/repository/OutboxRepository.java, oms-core/src/test/java/org/example/oms/integration/OutboxClaimIntegrationTest.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.integration.OutboxClaimIntegrationTest' --tests 'org.example.oms.integration.OutboxHoldIntegrationTest'` passes
- [x] **T-12** Unit tests first: the relay re-checks leadership before each batch; `stop()` waits for a running drain and refuses new ones; `Leadership` closes a stale session before reopening and opens with keepalive. Then make `OutboxRelay` a `SmartLifecycle` (phase above `Leadership`), re-check per batch, and add `oms.outbox.drains` and `oms.leadership.held{role}` (AC-3)
  - files: oms-core/src/main/java/org/example/oms/service/OutboxRelay.java, oms-core/src/main/java/org/example/oms/service/leadership/Leadership.java, oms-core/src/test/java/org/example/oms/service/OutboxRelayTest.java, oms-core/src/test/java/org/example/oms/service/leadership/LeadershipConnectionTest.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.service.OutboxRelayTest' --tests 'org.example.oms.service.leadership.*'` passes
- [x] **T-13** Strengthen the tests the review found weak: AC-2 (`CommandRetryBudgetIntegrationTest`), AC-3 (follower claims nothing; one 10 s budget), AC-5 (WARN wording), AC-6 (per-instance counters, concurrent trigger), AC-7 (three topics, cumQty of every order). Make the provisioner accept `TopicExistsException` (AC-2, AC-3, AC-5, AC-6, AC-7)
  - files: oms-core/src/test/java/org/example/oms/integration/CommandRetryBudgetIntegrationTest.java, oms-core/src/test/java/org/example/oms/integration/TwoInstanceIntegrationTest.java, oms-core/src/test/java/org/example/oms/integration/KafkaTopicProvisionerIntegrationTest.java, oms-core/src/main/java/org/example/oms/config/KafkaTopicProvisioner.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.integration.CommandRetryBudgetIntegrationTest' --tests 'org.example.oms.integration.TwoInstanceIntegrationTest' --tests 'org.example.oms.integration.KafkaTopicProvisionerIntegrationTest'` passes
- [x] **T-14** Update the knowledge base for the handover rules, the new meters and the keepalive operations note (AC-3)
  - files: oms-knowledge-base/capabilities/event-publication.md
  - verify: grep finds `tcp_keepalives_idle`, `oms.outbox.drains` and `oms.leadership.held` in event-publication.md
- [x] **T-15** Rerun the full suite and spec verify
  - verify: `cd oms-core && ./gradlew check` passes and `node specs/tools/spec.mjs verify SPEC-0048` exits 0

## Notes

- T-3 comes before T-4 and T-5 because both gate on `Leadership`. Until T-4, the relay ignores leadership, and the single-context suite keeps passing.
- Two-instance tests share the singleton containers. They start and stop their second context per class, so the cached main context and the other test classes are unaffected.
- T-4 found that cached test contexts share one database, so the first to take relay leadership drains for all of them. A context with a slow poll then starves the rest. Tests that need to be the leader (nudge, two-instance) run in a database, command topic and consumer group of their own, through `AbstractKafkaPostgresIntegrationTest.isolate(name, topic)`; advisory locks are per database. A subclass cannot override the base's dynamic properties directly, because Spring runs the base's method last. It asks the base, through a thread-local read during registration.
- T-4: the health contributor is named `instanceRoles`, because a contributor may not share its name with the `leadership` group that shows it.
- T-9: the full suite revealed that a stopped (paused) context kept relay leadership while no longer draining. `Leadership` now releases on lifecycle stop (design, Changed during implementation), with a test first.
- T-11 to T-15 come from the independent review in the verify stage (blocking: two drainers during a handover). Implement was reopened, and design.md records the fix first.
- T-13: the concurrent-start test failed against the old provisioner (an ERROR when losing the create race), then against the first fix (describe before the broker knew the topic). Both are fixed. The stronger AC-3 check was confirmed by letting the follower drain, which it caught (`oms.outbox.drains` was 1 on the follower).
- T-15: in the full suite, `CommandRetryBudgetIntegrationTest` counted 8 attempts, not 5. Its record was sent while the listener's six consumers were still joining. A rebalance handed it to another consumer, and the error handler counts attempts per consumer. The test now waits until every partition is assigned. In production a rebalance can likewise restart a record's budget. That is still bounded, and it was so before this ticket (follow-up in verification.md).
