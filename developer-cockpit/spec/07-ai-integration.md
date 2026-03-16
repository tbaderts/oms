# 07 - AI Integration

AI capabilities are woven into the Developer Cockpit as first-class features, not add-ons. This document specifies all AI-powered features, the provider abstraction, and the agentic investigation system.

---

## 1. AI Provider Abstraction

### AIAdapter Interface

```typescript
interface AIAdapter {
  /**
   * Send a completion request with optional tool definitions.
   * Returns an async iterable of response chunks for streaming.
   */
  complete(request: CompletionRequest): AsyncIterable<CompletionChunk>;

  /** Check if the provider is configured and reachable. */
  healthCheck(): Promise<boolean>;

  /** Return provider name and model info. */
  getInfo(): ProviderInfo;
}

interface CompletionRequest {
  systemPrompt: string;
  messages: Message[];
  tools?: ToolDefinition[];
  maxTokens?: number;
  temperature?: number;
  model?: string;                // Override default model
}

interface Message {
  role: "user" | "assistant" | "tool";
  content: string | ContentBlock[];
  toolCallId?: string;           // For tool result messages
}

interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: object;           // JSON Schema
}

interface CompletionChunk {
  type: "text" | "tool_call" | "done";
  text?: string;
  toolCall?: { id: string; name: string; input: object };
  usage?: { inputTokens: number; outputTokens: number };
}

interface ProviderInfo {
  name: string;
  model: string;
  supportsTools: boolean;
  supportsStreaming: boolean;
}
```

### Built-In Adapters

| Adapter | Provider | Tool Calling | Streaming |
|---------|----------|-------------|-----------|
| `AnthropicAdapter` | Anthropic (Claude) | Yes | Yes |
| `OpenAIAdapter` | OpenAI (GPT) | Yes | Yes |
| `AzureOpenAIAdapter` | Azure OpenAI | Yes | Yes |
| `OllamaAdapter` | Ollama (local models) | Limited | Yes |

### Configuration

```json
{
  "ai": {
    "provider": "anthropic",
    "model": "claude-sonnet-4-6",
    "apiKey": "${AI_API_KEY}",
    "baseUrl": null,
    "maxTokens": 4096,
    "temperature": 0.3
  }
}
```

---

## 2. Single-Turn AI Features

These features make a single AI call (possibly streaming) and return a result.

### 2.1 Message Bus Explainer

**Location**: Message Bus view > expand message > "Explain" button

**Purpose**: Explain a message payload in the context of the project's domain.

**Prompt construction**:
```
System: You are a domain expert for [project name]. Explain the following
message from the [topic name] topic. If a schema is provided, reference
field meanings. Explain what this message represents in business terms,
what triggered it, and what downstream effects it might have.

User:
Topic: {topic}
Schema: {schema or "No schema available"}
Message:
{JSON payload}
```

**UI behavior**:
1. User clicks "Explain" on an expanded message
2. Inline loading indicator appears below the message
3. AI response streams in, rendered as markdown
4. Response persists until the message panel is collapsed

### 2.2 Query Result Analyzer

**Location**: Database view > Query tab > "Analyze" button (appears after query execution)

**Purpose**: Provide statistical summary, anomaly detection, and follow-up query suggestions.

**Prompt construction**:
```
System: You are a data analyst. Analyze the following SQL query results.
Provide: (1) a statistical summary, (2) any anomalies or patterns,
(3) 2-3 follow-up queries that would be useful.

User:
Query: {sql}
Results ({rowCount} rows):
{first 50 rows as formatted table}
Column types: {column name -> type mapping}
```

**UI behavior**:
1. User clicks "Analyze" after running a query
2. Analysis panel appears below the results grid
3. AI response streams in as markdown
4. Follow-up queries are rendered as clickable chips that populate the query editor

### 2.3 Natural Language to SQL

**Location**: Database view > Query tab > text input above the editor

**Purpose**: Convert a natural language description into a SQL query.

**Prompt construction**:
```
System: You are a SQL expert. Convert the following natural language
description into a SQL query for a {database_type} database.
Only output the SQL query, no explanation.

Available tables and columns:
{schema summary}

User: {natural language description}
```

**UI behavior**:
1. User types description in the NL input field and presses Enter
2. AI generates SQL (non-streaming for simplicity)
3. Generated SQL is inserted into the query editor
4. User can review, edit, and execute

### 2.4 Entity Lifecycle Narrator

**Location**: Database view > Entity Lifecycle tab > "Narrate" button

**Purpose**: Generate a human-readable narrative of an entity's lifecycle.

**Prompt construction**:
```
System: You are a technical narrator. Given the following entity data
with its state transitions and related events, tell the story of this
entity's lifecycle in plain English. Include timestamps, key decisions,
and any anomalies.

User:
Entity: {entity type} {entity ID}
Current State: {state}
State History:
{chronological list of state transitions with timestamps}
Related Events:
{event list with timestamps and payloads}
Related Entities:
{parent/child relationships}
```

**UI behavior**:
1. User views an entity lifecycle and clicks "Narrate"
2. Narration panel appears alongside the timeline
3. AI response streams in as a narrative paragraph

### 2.5 Team Briefing Generator

**Location**: Flight Deck > "Briefing" button

**Purpose**: AI-generated situational awareness summary for the team.

**Prompt construction**:
```
System: You are a team lead assistant. Analyze the following project
activity and generate a concise briefing. Highlight: stale MRs (>3 days),
failed pipelines, blocked issues, and any patterns you notice.

User:
Recent Merge Requests (last 7 days):
{MR list with status, author, age}

Recent Pipeline Runs:
{pipeline list with status, branch, duration}

Open Issues:
{issue list with labels, assignee, age}
```

### 2.6 Code Review (Headless)

**Location**: Reviews view > "New Review" dialog

**Purpose**: AI-driven code review against project specifications.

**Process**:
1. Load project specifications and coding standards (from KB or config)
2. Collect source files (module scan or MR diff)
3. Send to AI with structured review prompt
4. AI evaluates code against specs and generates findings
5. Output structured markdown report

**Prompt construction**:
```
System: You are a senior code reviewer. Review the following code against
the provided specifications. For each finding, provide:
- Severity (Critical, High, Medium, Low, Info)
- File and line number
- Description of the issue
- Recommended fix
Rate overall health on a 1-10 scale.

Specifications:
{loaded spec documents}

Code to review:
{file contents or diff}
```

---

## 3. Investigator (Agentic Multi-Turn)

The Investigator is the most complex AI feature. It runs an autonomous multi-turn loop where the AI calls tools, receives results, reasons, and iterates until it reaches a conclusion.

### 3.1 Overview

```
User describes symptom
        |
        v
  Load matching playbook
        |
        v
  Detect available tools (based on environment)
        |
        v
  Build system prompt + tool definitions
        |
        v
  +---> AI generates response
  |         |
  |         +--> Text (reasoning) --> broadcast to UI
  |         |
  |         +--> Tool call --> execute tool --> return result
  |         |         |
  |         |         +---> Loop back to AI
  |         |
  |         +--> No more tool calls --> Final conclusion
  |
  +---- (max turns reached) --> Force conclusion
```

### 3.2 Environment Detection

On investigation start, the service detects what infrastructure is available:

```typescript
interface InvestigationEnvironment {
  database: boolean;           // Can we connect to the database?
  messageBus: boolean;         // Can we connect to the message bus?
  containers: {
    available: boolean;        // Is container runtime available?
    runtime: "docker" | "podman" | null;
    services: string[];        // List of running service containers
  };
  kubernetes: {
    available: boolean;        // Can we reach the cluster?
    namespace: string;
    pods: string[];            // List of running pods
  };
  knowledgeBase: boolean;      // Is KB accessible?
}
```

### 3.3 Tool Set

Tools are dynamically included based on the detected environment:

#### Always Available

| Tool | Description | Input | Output |
|------|-------------|-------|--------|
| `query_database` | Execute a read-only SQL query | `{ sql: string }` | `{ columns, rows, rowCount }` |
| `search_entities` | Search entities by filters | `{ type, filters }` | `{ entities[] }` |
| `get_entity_lifecycle` | Full entity with events and relationships | `{ type, id }` | `{ entity, events, related }` |
| `search_knowledge_base` | Keyword search across KB docs | `{ query }` | `{ results[] }` |
| `correlate_by_id` | Cross-source correlation by ID | `{ id, sources? }` | `{ timeline[] }` |

#### When Message Bus Available

| Tool | Description | Input | Output |
|------|-------------|-------|--------|
| `get_messages` | Read recent messages from a topic | `{ topic, limit?, offset? }` | `{ messages[] }` |
| `search_messages` | Search messages by key or content | `{ topic, query }` | `{ messages[] }` |

#### When Containers Available

| Tool | Description | Input | Output |
|------|-------------|-------|--------|
| `get_container_status` | List running containers | `{}` | `{ containers[] }` |
| `get_service_logs` | Read container logs with optional filters | `{ service, lines?, filter? }` | `{ logs: string }` |
| `get_service_errors` | Scan ERROR/WARN across services | `{ services?, minutes? }` | `{ errors[] }` |
| `get_error_context` | Find error with surrounding context | `{ service, errorPattern }` | `{ context: string }` |

#### When Kubernetes Available

| Tool | Description | Input | Output |
|------|-------------|-------|--------|
| `get_pod_status` | Check pod health and restarts | `{ namespace? }` | `{ pods[] }` |
| `get_pod_logs` | Read pod logs | `{ pod, container?, lines? }` | `{ logs: string }` |

### 3.4 Playbook Integration

Playbooks are markdown files with YAML front-matter that guide the investigator:

```yaml
---
title: "Service Connectivity Investigation"
triggers: [connect, timeout, unavailable, connection, refused]
priority: 10
---

## Service Connectivity Investigation Playbook

1. Check container/pod status -- are all services running?
2. Look for connection errors in logs
3. Verify network configuration
4. Check for recent deployments that may have changed ports/endpoints
5. Query the database for the most recent successful operation
6. Search Kafka for the last message produced by the affected service
7. Correlate timeline: when did the issue start?
```

**Injection**: The matching playbook is prepended to the system prompt:

```
System: You are an incident investigator. You have access to tools for
querying the database, reading logs, inspecting messages, and searching
the knowledge base.

INVESTIGATION PLAYBOOK:
{playbook content}

Follow the playbook steps as a guide, but use your judgment to adapt
based on what you discover. Report your findings after each step.
When you have identified the root cause, provide:
1. Root cause summary
2. Evidence (with specific data points)
3. Chronological timeline
4. Recommended remediation
```

### 3.5 Investigation Loop

```typescript
async function investigate(symptom: string): Promise<Investigation> {
  const env = await detectEnvironment();
  const tools = buildToolSet(env);
  const playbook = matchPlaybook(symptom);
  const systemPrompt = buildSystemPrompt(playbook, env);

  const messages: Message[] = [
    { role: "user", content: symptom }
  ];

  const maxTurns = 15;

  for (let turn = 0; turn < maxTurns; turn++) {
    const response = await ai.complete({
      systemPrompt,
      messages,
      tools,
      maxTokens: 4096
    });

    // Process response chunks
    for await (const chunk of response) {
      if (chunk.type === "text") {
        broadcast("investigation:progress", {
          type: "reasoning", content: chunk.text
        });
        appendToAssistantMessage(messages, chunk.text);
      }

      if (chunk.type === "tool_call") {
        broadcast("investigation:progress", {
          type: "tool_call", tool: chunk.toolCall.name,
          input: chunk.toolCall.input, status: "running"
        });

        const result = await executeToolCall(chunk.toolCall, env);

        broadcast("investigation:progress", {
          type: "tool_result", tool: chunk.toolCall.name,
          output: summarize(result), status: "complete"
        });

        messages.push({
          role: "tool",
          toolCallId: chunk.toolCall.id,
          content: JSON.stringify(result)
        });
      }
    }

    // If no tool calls in this turn, the AI has concluded
    if (!hadToolCalls) break;
  }

  return extractConclusion(messages);
}
```

### 3.6 Cross-Source Correlation

The `correlate_by_id` tool is a composite operation:

```
1. Search database tables for the ID (check common ID columns)
2. Search message bus topics for messages with the ID as key or in payload
3. Search container/pod logs for the ID string
4. Build chronological timeline from all sources
5. Return unified timeline with source labels
```

Output format:
```json
{
  "id": "ORD-12345",
  "timeline": [
    { "time": "10:42:01", "source": "database", "event": "Entity created", "details": "..." },
    { "time": "10:42:02", "source": "kafka", "event": "Message published to events topic", "details": "..." },
    { "time": "10:42:03", "source": "logs:backend", "event": "Processing started", "details": "..." },
    { "time": "10:42:05", "source": "logs:backend", "event": "ERROR: Timeout connecting to...", "details": "..." }
  ]
}
```

### 3.7 Investigation UI

```
+--------------------------------------------------+
| Symptom Input                        [Investigate]|
+--------------------------------------------------+
| Investigation Progress                            |
|                                                   |
|  Step 1: Querying database for entity...          |
|    > Tool: query_database                         |
|    > SQL: SELECT * FROM ...                       |
|    > Result: 3 rows found                         |
|                                                   |
|  Step 2: Reasoning                                |
|    > "The entity was created at 10:42 but..."     |
|                                                   |
|  Step 3: Checking container logs...               |
|    > Tool: get_service_logs                       |
|    > Service: backend                             |
|    > Result: Found ERROR at 10:42:05              |
|                                                   |
|  ...                                              |
|                                                   |
|  CONCLUSION                                       |
|  Root Cause: Connection timeout to external svc   |
|  Evidence: Error log at 10:42:05, no response...  |
|  Timeline: [visual timeline]                      |
|  Recommendation: Check external service health    |
+--------------------------------------------------+
```

Each step expands/collapses. Tool inputs and outputs are formatted for readability.

---

## 4. AI Session Management

### 4.1 CLI Session Architecture

The Sessions view manages AI CLI processes (Claude Code, Aider, etc.) via PTY:

```
Frontend (xterm.js)
    |
    | WebSocket: sessions:output (server->client)
    | WebSocket: input (client->server)
    |
Backend (SessionManager)
    |
    | node-pty / pty wrapper
    |
AI CLI Process (e.g., claude-code)
    |
    | stdin/stdout/stderr via PTY
    |
Working Directory (project root or specified dir)
```

### 4.2 Session Lifecycle

| State | Description | Transitions |
|-------|-------------|-------------|
| `creating` | Process being spawned | -> `running`, -> `error` |
| `running` | Process active, accepting input | -> `idle`, -> `exited`, -> `killed` |
| `idle` | Process waiting for input | -> `running` (on input), -> `exited` |
| `exited` | Process terminated normally | -> `creating` (restart) |
| `killed` | Process terminated by user | -> `creating` (restart) |
| `error` | Process failed to start | -> `creating` (retry) |

### 4.3 Session Configuration

```typescript
interface SessionConfig {
  name: string;                  // Display name
  workingDirectory: string;      // CWD for the process
  cliTool: string;               // CLI executable name
  args: string[];                // CLI arguments
  initialPrompt?: string;        // Sent to stdin after process starts
  model?: string;                // Model override
  env?: Record<string, string>;  // Extra environment variables
}
```

---

## 5. Cost Tracking (Optional)

Track AI usage across all features:

```typescript
interface AIUsageEntry {
  timestamp: string;
  feature: string;               // "explain", "analyze", "investigate", "narrate", "review"
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;         // Based on configured model pricing
}
```

Stored in `~/.developer-cockpit/ai-usage.json`. Displayed as a summary in Settings or as a widget in the Dashboard.

Model pricing is configurable:
```json
{
  "ai": {
    "pricing": {
      "claude-sonnet-4-6": { "inputPer1M": 3.0, "outputPer1M": 15.0 },
      "gpt-4o": { "inputPer1M": 2.5, "outputPer1M": 10.0 }
    }
  }
}
```
