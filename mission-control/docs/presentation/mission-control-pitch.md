# Mission Control — AI-Powered Platform Operations
## Presentation Slides

---

## Slide 1: Title

# Mission Control
### AI-Powered Platform Operations for Azure Cloud

*Intelligent incident investigation, infrastructure monitoring, and operational workflows — powered by multi-agent AI*

---

## Slide 2: The Problem

### Platform Operations Today

- **Alert fatigue** — Teams are drowning in alerts from Azure Monitor, Log Analytics, Prometheus, and Application Insights
- **Manual runbooks** — Incident response follows documented steps that humans execute one by one, across multiple tools
- **Tool sprawl** — Azure Portal, kubectl, Grafana, pgAdmin, Service Bus Explorer, Log Analytics — constant context-switching
- **Slow MTTR** — Mean Time To Resolution is high because diagnosis requires cross-referencing data from 5+ sources
- **Knowledge silos** — Senior engineers carry the investigation expertise in their heads

**Result:** Incidents take too long to diagnose, on-call is exhausting, and knowledge doesn't scale.

---

## Slide 3: The Vision

### What If Your On-Call Engineer Had AI Teammates?

Imagine describing a symptom — *"pods are restarting in the payment service namespace"* — and having a team of AI agents:

1. **Check AKS** — pod status, events, deployment rollout, node health
2. **Search logs** — container logs, Log Analytics, Application Insights
3. **Query databases** — recent transactions, error records, connection pool state
4. **Analyze metrics** — Azure Monitor, Prometheus, CPU/memory/latency trends
5. **Correlate everything** — build a timeline, identify the root cause, recommend fixes

All within minutes. With a structured report. Following your team's investigation playbooks.

**That's Mission Control.**

---

## Slide 4: What is Mission Control?

### AI-Powered Operational Platform

- **Multi-agent system** — Specialized AI agents that each have expertise in a specific domain (logs, infrastructure, databases, metrics)
- **Supervisor coordination** — A supervisor agent delegates to specialists, correlates findings, produces reports
- **Playbook-driven** — Investigation playbooks guide agents through your team's proven diagnostic steps
- **Human-in-the-loop** — Destructive actions (restart pod, scale deployment) require human approval
- **Visual workflow builder** — Design custom multi-agent workflows for recurring operational tasks

**Built on:** Mastra AI framework + Azure SDK + LLM providers (Anthropic Claude, OpenAI GPT)

---

## Slide 5: Architecture Overview

### How It Works

```
┌──────────────────────────────────────────────────────────┐
│                     Mission Control                       │
│                                                          │
│  ┌─────────────┐    ┌──────────────────────────────┐    │
│  │   React UI  │    │     Mastra AI Engine          │    │
│  │             │    │                               │    │
│  │  Dashboard  │◄──►│  Investigation Supervisor     │    │
│  │  Investigate│    │    ├─ AKS Inspector           │    │
│  │  Workflows  │    │    ├─ Log Analyzer            │    │
│  │  Settings   │    │    ├─ DB Querier              │    │
│  │             │    │    └─ Metrics Analyzer         │    │
│  └─────────────┘    │                               │    │
│                     │  Tools (Azure + Infra)         │    │
│                     │  Workflows (Visual Builder)    │    │
│                     └──────────┬───────────────────┘    │
│                                │                         │
└────────────────────────────────┼─────────────────────────┘
                                 │
          ┌──────────────────────┼──────────────────────┐
          │                      │                      │
    ┌─────▼─────┐    ┌──────────▼───────┐    ┌────────▼────────┐
    │    AKS    │    │  Azure Monitor   │    │   Azure SQL /   │
    │ Clusters  │    │  Log Analytics   │    │   Service Bus   │
    └───────────┘    └──────────────────┘    └─────────────────┘
```

---

## Slide 6: The AI Agent Team

### Specialized Agents, Coordinated by a Supervisor

| Agent | Specialty | What It Does |
|-------|-----------|-------------|
| **Investigation Supervisor** | Coordination | Matches playbooks, delegates to specialists, correlates findings, produces reports |
| **AKS Inspector** | Infrastructure | Checks pods, deployments, services, node health, events, resource limits |
| **Log Analyzer** | Application logs | Searches container logs and Log Analytics for errors, patterns, stack traces |
| **DB Querier** | Data layer | Queries databases for entity states, anomalies, failed operations |
| **Metrics Analyzer** | Observability | Queries Azure Monitor / Prometheus for resource utilization, latency, anomalies |

Each agent has its own set of tools and can only access what it needs. The supervisor coordinates — it never accesses infrastructure directly.

---

## Slide 7: Azure Cloud Integration

### Native Azure Adapter Layer

Mission Control connects to your Azure infrastructure through dedicated adapter tool sets:

| Adapter | Azure Services | Capabilities |
|---------|---------------|-------------|
| **AKS** | Azure Kubernetes Service | Pod health, deployments, services, events, logs, node pools |
| **Azure Monitor** | Monitor, Log Analytics, App Insights | KQL queries, metric analysis, alert status, resource health |
| **Database** | Azure SQL, PostgreSQL Flexible Server | Schema inspection, read-only queries, entity search |
| **Messaging** | Azure Service Bus | Queue depth, dead-letter inspection, topic subscriptions |
| **Resource Manager** | ARM API | Resource inventory, deployment status, resource health |

**All adapters are read-first, safe by default.** Write operations (restart, scale) require explicit human approval.

---

## Slide 8: Azure Integration — Technical Detail

### How We Connect to Azure

```
Azure Identity (DefaultAzureCredential)
    │
    ├── @azure/arm-containerservice    → AKS cluster & node pool management
    ├── @azure/monitor-query           → KQL queries to Log Analytics & Metrics
    ├── @azure/arm-monitor             → Alert rules, metric definitions
    ├── @azure/service-bus             → Queue/topic inspection
    ├── @azure/arm-postgresql-flexible → Database management plane
    └── @azure/arm-resources           → Resource inventory & health
```

- **Authentication:** Azure AD / Managed Identity via `@azure/identity` — same credentials your team already uses
- **Multi-subscription:** Support for multiple Azure subscriptions and resource groups
- **No secrets in code:** Uses Azure's credential chain (environment → managed identity → CLI → interactive)

---

## Slide 9: Investigation Flow — Live Demo Concept

### "Pods restarting in payment-service"

```
User: "pods are restarting in the payment-service namespace"
  │
  ▼
Supervisor: Matches "Pod CrashLoopBackOff" playbook
  │
  ├──► AKS Inspector: "Found 3 pods in CrashLoopBackOff,
  │    12 restarts in last 10 minutes, OOMKilled reason"
  │
  ├──► Metrics Analyzer: "Memory usage hit 95% of limit
  │    at 14:23, correlates with deployment at 14:20"
  │
  ├──► Log Analyzer: "OutOfMemoryError in payment-service
  │    logs, new batch processing code path allocating 2GB"
  │
  └──► DB Querier: "142 failed transactions since 14:23,
       all with timeout errors"
  │
  ▼
Supervisor: Correlates timeline, produces report
  │
  ▼
Report:
  Root Cause: Memory limit too low for new batch processing
  Evidence: OOMKilled + memory spike + deployment correlation
  Recommendation: Increase memory limit or optimize batch code
```

---

## Slide 10: Playbooks — Encoding Team Knowledge

### Your Runbooks, AI-Enhanced

Playbooks are markdown files that capture your team's investigation expertise:

```markdown
---
title: Pod CrashLoopBackOff Investigation
triggers: [crashloop, restart, oomkill, crash, backoff]
priority: 10
---

## Investigation Steps
1. Check pod status and restart count across all namespaces
2. Read pod events for OOMKilled, Error, or CrashLoopBackOff
3. Pull container logs before the most recent crash
4. Check resource limits vs actual usage (memory and CPU)
5. Look for recent deployments that changed config
6. Query database for application errors near crash time
7. Check metrics for memory/CPU spikes leading up to crash
8. Correlate timeline: when did it start? What changed?
```

**Benefits:**
- Knowledge is captured, not siloed in senior engineers' heads
- Junior engineers get guided investigations, not blank screens
- Playbooks improve over time as the team learns
- Agents follow proven steps, not guesswork

---

## Slide 11: Visual Workflow Builder

### Drag-and-Drop Multi-Agent Workflows

Beyond investigations, Mission Control lets you design reusable operational workflows visually:

**Example workflows:**
- **Daily health check** — Morning cluster health report across all namespaces
- **Deployment verification** — Post-deploy check: pods healthy? Metrics normal? No new errors?
- **Capacity planning** — Weekly resource utilization analysis with scaling recommendations
- **Incident post-mortem** — Automated data collection for post-incident review

**Node types:** Agent, Tool, Branch, Parallel, Approval, Input, Output

Users drag nodes onto a canvas, connect them, configure parameters. No code required for workflow composition.

---

## Slide 12: Human-in-the-Loop Safety

### AI Suggests, Humans Decide

Mission Control enforces a safety model for operational actions:

| Action Type | Behavior | Example |
|------------|----------|---------|
| **Read** | Automatic | Query pods, read logs, check metrics |
| **Analyze** | Automatic | Correlate findings, build timelines |
| **Suggest** | Automatic | Recommend scaling, config changes |
| **Modify** | Requires approval | Restart pod, scale deployment |
| **Destroy** | Requires approval | Delete resource, drain node |

The AI agents can investigate freely but cannot change anything without a human pressing "Approve."

This is critical for production environments — the tool augments your team, it doesn't replace their judgment.

---

## Slide 13: Mastra AI Framework

### The Engine Under the Hood

**Mastra** is the open-source TypeScript framework that powers Mission Control:

| Mastra Feature | How Mission Control Uses It |
|---------------|---------------------------|
| **Agent framework** | All 5 investigation agents are Mastra agents with tools and instructions |
| **Tool system** | All 20+ infrastructure tools are Mastra tools with typed schemas |
| **Workflow engine** | Investigation workflows run as Mastra workflows with step coordination |
| **Storage** | Investigation history persisted via Mastra's LibSQL storage |
| **Server** | API layer built on Mastra's built-in Hono server |
| **Studio** | Development and debugging UI comes free with Mastra |

**Mastra Studio** provides:
- Agent testing with ad-hoc prompts
- Individual tool testing with custom inputs
- Workflow step-by-step execution
- Auto-generated REST API + Swagger docs

---

## Slide 14: AI Provider Flexibility

### Bring Your Own LLM

Mission Control supports multiple AI providers through Mastra's model routing:

| Provider | Models | Best For |
|----------|--------|----------|
| **Anthropic** | Claude Opus, Sonnet, Haiku | Complex reasoning, long investigations, nuanced reports |
| **OpenAI** | GPT-4o, GPT-4o-mini | Fast responses, broad tool use, cost-effective for simple tasks |
| **Azure OpenAI** | GPT-4o (hosted in your tenant) | Data residency, enterprise compliance, private deployment |

**Key points:**
- Different agents can use different models (e.g., supervisor uses Claude Opus, sub-agents use Sonnet)
- Model selection is configurable per agent — optimize for cost vs. capability
- Azure OpenAI keeps all data within your Azure tenant — no data leaves your cloud
- Switch providers without changing agent logic

---

## Slide 15: Integration with Azure Cloud Foundry

### Fits Into Your Existing Platform

```
┌─────────────────────────────────────────────────────────┐
│              Azure Cloud Platform                        │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │     AKS      │  │ Azure Monitor│  │  Azure SQL   │  │
│  │  Clusters    │  │ Log Analytics│  │  Service Bus  │  │
│  │  Node Pools  │  │ App Insights │  │  Key Vault   │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │
│         │                 │                  │          │
│         └─────────────────┼──────────────────┘          │
│                           │                             │
│              Azure AD / Managed Identity                 │
└───────────────────────────┼─────────────────────────────┘
                            │
                    ┌───────▼────────┐
                    │ Mission Control │
                    │                │
                    │  Agents ←→ LLM │──► Anthropic / OpenAI
                    │  Tools  ←→ Azure   / Azure OpenAI
                    │  UI     ←→ Users│
                    └────────────────┘
```

- **Authentication:** Uses your existing Azure AD credentials
- **Network:** Runs in your network, connects to Azure APIs — no data exfiltration
- **Deployment:** Can run as a container in AKS itself, or on a developer workstation
- **Alerting:** Can integrate with Azure Monitor alertmanager webhooks to auto-trigger investigations

---

## Slide 16: Expected Benefits

### What This Delivers

| Metric | Before | After | Impact |
|--------|--------|-------|--------|
| **Mean Time To Diagnosis** | 30-60 min | 5-10 min | **~80% reduction** |
| **Tools accessed per incident** | 5-8 (manual) | 1 (Mission Control) | **Single pane of glass** |
| **Knowledge dependency** | Senior engineer required | Playbook-guided AI | **Scales to all engineers** |
| **Runbook execution** | Manual, error-prone | Automated, consistent | **Reproducible investigations** |
| **Context switching** | Constant | Eliminated | **Focus on decisions, not data gathering** |

**Additional benefits:**
- On-call engineers are more effective and less burned out
- New team members ramp up faster with playbook-guided investigations
- Investigation history builds organizational knowledge over time
- Custom workflows automate recurring operational tasks

---

## Slide 17: Current State — PoC

### What We've Built So Far

**Working today (MVP):**
- 5 AI investigation agents (supervisor + 4 specialists)
- 20 infrastructure tools across 4 adapter categories
- Investigation flow: symptom → playbook matching → multi-agent diagnosis → report
- Visual workflow builder (drag-and-drop canvas)
- Dashboard with adapter health monitoring
- Settings UI for adapter configuration
- 3 sample investigation playbooks
- Mastra Studio for development and agent testing

**Built with:** TypeScript, Mastra AI, React 19, Tailwind CSS, React Flow

---

## Slide 18: Roadmap — Where We're Going

### From PoC to Production

**Phase 2 — Investigation Hardening** (Next)
- Real-time streaming of investigation progress
- Approval UI for destructive actions
- Investigation history and search

**Phase 3 — Azure-Native Adapters**
- Azure Monitor / Log Analytics integration (KQL queries)
- Azure Service Bus adapter (queues, topics, dead-letter)
- Azure SQL / PostgreSQL Flexible Server adapter
- Azure Resource Manager for resource inventory

**Phase 4 — Workflow Execution**
- Execute visual workflows, not just design them
- Pre-built workflow templates (health check, deploy verification, capacity planning)
- Scheduled and alert-triggered workflows

**Phase 5 — Enterprise Readiness**
- Azure AD authentication
- Multi-cluster / multi-subscription support
- Audit logging and compliance
- Azure OpenAI integration for data residency

---

## Slide 19: Why This Approach?

### Build vs Buy — Why a Custom Platform?

| Consideration | Our Approach |
|--------------|-------------|
| **Off-the-shelf AIOps tools** | Generic, expensive, black-box AI. Can't encode your team's specific knowledge. |
| **Custom scripts + ChatGPT** | Fragile, no coordination, no safety model, no UI, no history. |
| **Mission Control** | Custom to your platform, playbook-driven, safe, extensible, open framework. |

**Key differentiators:**
- **Your playbooks, your expertise** — not a generic AI guessing at your infrastructure
- **Open framework** — Mastra is open source, no vendor lock-in on the AI orchestration layer
- **Multi-model** — Use Anthropic, OpenAI, or Azure OpenAI — switch anytime
- **Extensible** — New adapters are just TypeScript tool sets, not platform rewrites
- **Safe** — Read-first, approval-required for writes, audit trail

---

## Slide 20: Next Steps

### Getting Started

1. **Validate the PoC** — Run Mission Control against a staging AKS cluster, test investigation flow with real incidents

2. **Build Azure adapters** — Replace generic K8s/Prometheus adapters with Azure-native ones (Azure Monitor, Log Analytics, ARM)

3. **Write team playbooks** — Capture your top 10 incident types as playbooks

4. **Pilot with on-call team** — 2-week trial alongside existing tools, measure MTTR improvement

5. **Iterate** — Refine agents, add workflows, expand adapter coverage based on real usage

### Ask

- Staging AKS cluster access for PoC validation
- Team input on top incident types for playbook creation
- Azure OpenAI instance for data-residency-compliant AI

---

*Mission Control is open source, built on open frameworks, and designed for your platform. It doesn't replace your engineers — it makes them faster.*
