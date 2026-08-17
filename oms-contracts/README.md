# OMS Contracts

The single source of truth for every contract shared between OMS services: the OpenAPI
specifications and the Avro schemas, plus the model classes generated from them.

This is a plain Java library — no Spring Boot, no `bootJar`, nothing to run.

## Why it exists

Before this module, all three service modules carried byte-identical copies of the three OpenAPI
specs, and two carried copies of the Avro schemas. Keeping them aligned was a manual step that
nobody could enforce, and it had already failed: `CommandMessage.avsc` declared three command types
in oms-core and six in oms-streaming-service — the same record name, the same schema registry, two
different schemas.

The Avro schemas were also matched by `**/src/main/avro/` in `.gitignore`, so the Kafka wire contract
was only in version control by accident in one module and not at all in the other. `.gitignore` now
carries an explicit exception for this directory.

## What it publishes

| Artifact | Contents |
| --- | --- |
| Generated models | `org.example.common.model.cmd`, `.query`, `.msg` |
| Raw specs | `META-INF/oms-contracts/openapi/`, `META-INF/oms-contracts/avro/` in the same jar |

Model classes only. API interfaces are each service's own business — oms-core generates servlet
interfaces from these specs, and a reactive service could generate reactive ones from the same
source without this module having an opinion.

## Layout

```text
src/main/openapi/     oms-cmd-api.yml, oms-query-api.yml, schema.yml
src/main/avro/        27 .avsc files -> org.example.common.model.msg
```

## Consumers

| Module | Depends on | Still generates locally |
| --- | --- | --- |
| oms-core | models + specs | `ExecuteApi`, `SearchApi` (servlet) |
| oms-streaming-service | models | nothing |
| oms-mcp-server | models | nothing |

Each consumer's `settings.gradle` has `includeBuild('../oms-contracts')`, so a module still builds
on its own with `cd <module> && ./gradlew build`. The root composite picks it up transitively.

## Changing a contract

1. Edit the spec or schema here.
2. `./gradlew build` from the repository root, or `cd oms-contracts && ./gradlew build`.
3. Every consumer sees the change on its next compile.

For Avro, remember the schemas are a **wire contract** against a shared registry. Adding a field
requires a `"default"` for the change to stay backward compatible; renaming or removing one is a
breaking change regardless of what the compiler says.

## Guard

`./gradlew check` runs `verifyContracts`, which fails the build if any service module has
reintroduced its own `src/main/avro` or `src/main/openapi` directory. The duplication this module
removes is easy to recreate by accident, so it is checked rather than merely documented.
