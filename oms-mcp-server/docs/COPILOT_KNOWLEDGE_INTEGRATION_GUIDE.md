# GitHub Copilot Integration Guide: Using OMS Knowledge Base

## 🎯 Goal
Make GitHub Copilot automatically leverage your OMS specifications when writing code, unit tests, analysis, and refactoring.

## ✅ What's Already Working

Your MCP server is **fully operational** and exposes:
- 9 OMS specification documents
- 6 MCP tools for discovery, reading, and searching
- Integration with GitHub Copilot via MCP protocol

## 🔧 How to Make Copilot Use Your Knowledge Base

### 1. **Reference the Knowledge Base in Chat**

When asking Copilot for help, explicitly mention the specs:

#### ❌ Generic Request (Won't Use Specs)
```
"Create a unit test for the Order class"
```

#### ✅ Knowledge-Aware Request
```
"Using the OMS spec, create a unit test for the Order class that validates 
state transitions according to the State Machine Engine specification"
```

#### ✅ Even Better - Direct Tool Usage
```
"Search the OMS specs for state machine validation rules, then create a 
unit test for Order state transitions"
```

---

### 2. **Use @workspace Context with Explicit References**

Copilot Chat has access to MCP tools via `@workspace`. Use it like this:

```
@workspace Search the domain specs for validation rules, then help me 
implement the OrderValidator class following the spec
```

```
@workspace What does the OMS spec say about the domain model? Use that 
to generate the Order entity class
```

```
@workspace Read the Technology Stack section from the OMS spec and verify 
our dependencies match the specification
```

---

### 3. **Create Prompt Templates for Common Tasks**

Save these as snippets or keep them handy:

#### A. Writing New Code
```
@workspace 
1. Search specs for "[CONCEPT]" 
2. Read relevant sections
3. Generate [CLASS/COMPONENT] that follows the specification
4. Include Javadoc references to the spec sections used
```

#### B. Writing Unit Tests
```
@workspace
1. Find all specs related to "[DOMAIN_OBJECT]"
2. List the key behaviors and validation rules from specs
3. Generate comprehensive unit tests covering all spec requirements
4. Add comments linking each test to its spec requirement
```

#### C. Code Review/Analysis
```
@workspace
1. Read the [SECTION] from the OMS spec
2. Analyze [FILE/CLASS] against the specification
3. Identify any deviations from the spec
4. Suggest refactoring to align with spec
```

#### D. Refactoring
```
@workspace
1. Search specs for best practices on "[PATTERN/CONCEPT]"
2. Read the architecture methodology spec
3. Refactor [CODE] to follow the specified patterns
4. Explain changes with spec references
```

---

### 4. **Workflow Examples**

#### Example 1: Create Entity Class from Spec

**Your Prompt:**
```
@workspace I need to create the Order entity class. Please:
1. Read the "Domain Model" section from specs/oms_spec.md
2. Read the domain-model_spec.md for details on entity structure
3. Generate the Java Order class following the spec
4. Include all core attributes mentioned in the spec
5. Add validation annotations based on spec requirements
```

**What Copilot Will Do:**
- Call `readDocSection(path="specs/oms_spec.md", sectionTitle="Domain Model")`
- Call `readDomainDoc(path="specs/domain-model_spec.md")`
- Generate code based on spec content
- Include comments referencing the spec

---

#### Example 2: Generate Tests with Spec Coverage

**Your Prompt:**
```
@workspace I need comprehensive tests for Order state transitions. Please:
1. Search specs for "state machine" and "order lifecycle"
2. Read the State Machine Engine section
3. Generate JUnit tests that cover all state transitions mentioned
4. Include test cases for validation rules from the spec
5. Add comments mapping each test to its spec requirement
```

**Expected Output:**
```java
/**
 * Tests Order state transitions according to OMS State Machine specification
 * Reference: specs/domain-model_spec.md - State Machine Engine
 */
@Test
public void testOrderStateTransition_NewToLive_ValidTransition() {
    // Spec requirement: Orders must transition from NEW to LIVE when accepted
    Order order = new Order();
    order.setState(OrderState.NEW);
    
    order.accept();
    
    assertEquals(OrderState.LIVE, order.getState());
}
```

---

#### Example 3: Validate Code Against Spec

**Your Prompt:**
```
@workspace Please analyze OrderService.java against the OMS specification:
1. Search specs for "command API" and "state store"
2. Read relevant sections
3. Compare our implementation to spec requirements
4. List any deviations or missing features
5. Suggest changes to align with spec
```

---

#### Example 4: Refactor to Match Architecture

**Your Prompt:**
```
@workspace Our Order validation is scattered. Please:
1. Read the "Validation Engine" section from domain-model_spec.md
2. Read software-architecture-methodology_spec.md for patterns
3. Analyze our current validation code
4. Refactor to use the spec's predicate-based approach
5. Explain how the refactored code follows the spec
```

---

### 5. **Integrate Specs into Your Coding Workflow**

#### A. Before Writing Code
```
@workspace What does the OMS spec say about [FEATURE]?
```

#### B. During Code Review
```
@workspace Does this implementation align with the OMS specifications?
Compare [FILE] against relevant spec sections.
```

#### C. When Stuck
```
@workspace Search the specs for examples or guidance on [PROBLEM]
```

#### D. For Architecture Decisions
```
@workspace What architectural patterns does the software-architecture-methodology 
spec recommend for [SCENARIO]?
```

---

### 6. **Advanced Techniques**

#### Multi-Step Spec-Driven Development

**Step 1: Discovery**
```
@workspace List all sections in the OMS spec
```

**Step 2: Deep Dive**
```
@workspace Read section 5 "Domain Model" and summarize the key entities and relationships
```

**Step 3: Implementation**
```
@workspace Based on the domain model we just reviewed, generate the Order, 
Execution, Quote, and QuoteRequest entity classes with JPA annotations
```

**Step 4: Validation**
```
@workspace Generate unit tests for all entities ensuring they match the spec requirements
```

---

#### Spec-to-Code Traceability

Add spec references in your code:

```java
/**
 * Order Management System - Order Entity
 * 
 * Specification References:
 * - specs/oms_spec.md § 5. Domain Model
 * - specs/domain-model_spec.md - Base Entity Model Structure
 * 
 * Key Requirements:
 * - Extends base Order from OMS Core Libraries
 * - Follows FIX protocol semantics (Tag 11: clOrdID)
 * - Supports state machine lifecycle management
 * - Extensible via Java inheritance for asset classes
 * 
 * @see <a href="file:///home/tbaderts/data/workspace/oms/specs/oms_spec.md">OMS Spec</a>
 */
@Entity
@Table(name = "orders")
public class Order {
    // Implementation follows spec...
}
```

Ask Copilot to generate this:
```
@workspace Generate the Order entity class with detailed Javadoc that references 
the relevant spec sections and requirements
```

---

### 7. **Create Spec-Aware Code Templates**

#### Template: Spec-Driven Class

```
@workspace Create a [CLASS_NAME] class that:
1. Searches specs for "[DOMAIN_CONCEPT]"
2. Follows all spec requirements found
3. Includes Javadoc with spec references
4. Adds TODOs for any spec requirements not yet implemented
5. Uses technology stack from specs (Java 21, Spring Boot, etc.)
```

#### Template: Spec-Driven Test Suite

```
@workspace Create a comprehensive test suite for [CLASS_NAME]:
1. Search specs for all requirements related to [DOMAIN_CONCEPT]
2. Generate one test method per spec requirement
3. Include spec section references in test method Javadoc
4. Add parameterized tests for spec examples
5. Ensure 100% coverage of spec requirements
```

---

### 8. **Best Practices**

#### ✅ DO:
- Always start with spec search or reading when working on domain logic
- Reference specific spec sections in prompts
- Ask Copilot to cite specs in generated code comments
- Use `@workspace` to give Copilot access to MCP tools
- Break complex tasks into multiple spec-aware steps
- Verify generated code against specs

#### ❌ DON'T:
- Assume Copilot knows your specs without explicitly asking it to read them
- Write domain code without checking specs first
- Skip spec references in code comments
- Use generic prompts for domain-specific code

---

### 9. **Quick Reference Commands**

| Task | Copilot Prompt |
|------|----------------|
| **Find Relevant Spec** | `@workspace Search specs for "[CONCEPT]"` |
| **Read Spec Section** | `@workspace Read [SECTION] from specs/[FILE].md` |
| **Generate Code** | `@workspace Using the spec for [CONCEPT], generate [CODE]` |
| **Generate Tests** | `@workspace Create tests for [CLASS] based on spec requirements` |
| **Validate Code** | `@workspace Compare [FILE] against the OMS specifications` |
| **Refactor** | `@workspace Refactor [CODE] to match spec patterns for [CONCEPT]` |
| **Explain Spec** | `@workspace Explain what the spec says about [CONCEPT]` |
| **List Requirements** | `@workspace List all spec requirements for [FEATURE]` |

---

### 10. **Practical Examples**

#### Example: Creating a State Machine Component

```
@workspace I need to implement the State Machine Engine. Please:

1. Read specs/domain-model_spec.md section "State Machine Engine"
2. List all requirements from the spec
3. Generate the StateMachine interface and base implementation
4. Include validation of state transitions
5. Add comprehensive tests covering all transition rules
6. Use Java 21 features where appropriate per the tech stack spec
```

#### Example: Implementing CQRS Pattern

```
@workspace Help me implement CQRS for Orders:

1. Search specs for "CQRS" and "command query"
2. Read the architecture principles section
3. Generate the Command API classes (DTOs, handlers)
4. Generate the Query API classes (DTOs, repositories)
5. Ensure separation matches spec requirements
6. Add integration tests
```

#### Example: Creating Validation Rules

```
@workspace Create the validation engine for Orders:

1. Read specs/domain-model_spec.md section "Validation Engine"
2. The spec mentions "predicate-based" approach - implement that
3. Generate OrderValidationRules using Java Predicates
4. Make it extensible as spec requires
5. Add tests for each validation rule
6. Document how this follows the spec pattern
```

---

### 11. **Automate Spec Checks**

Create a checklist prompt:

```
@workspace Spec compliance check for [FILE]:

□ Read relevant spec sections for this component
□ List all spec requirements that apply
□ Verify each requirement is implemented
□ Check technology stack matches (Java 21, Spring Boot, PostgreSQL)
□ Verify architectural patterns match spec (Event Sourcing, CQRS)
□ Confirm naming follows FIX protocol where applicable
□ Check that DTOs are decoupled from entities per spec
□ Verify MapStruct is used for mappings per spec
□ Ensure proper exception handling per spec
□ Generate missing tests for uncovered requirements

Report findings with spec references.
```

---

## 🎓 Training Your Team

Share these guidelines with your team:

### For Developers:
1. **Always search specs first** when implementing domain features
2. **Include spec references** in PR descriptions
3. **Link tests to spec requirements** in comments
4. **Use `@workspace` in Copilot** for spec-aware assistance

### For Code Reviewers:
```
@workspace Review this PR against OMS specifications:
1. Identify which spec sections apply
2. Verify all spec requirements are met
3. Check for proper spec references in code
4. Suggest improvements to match spec patterns
```

---

## 🚀 Next Level: Continuous Spec Alignment

### Weekly Spec Review
```
@workspace Generate a report:
1. List all recent code changes in [COMPONENT]
2. Search specs for related requirements
3. Identify any drift from specifications
4. Suggest alignment tasks
```

### Pre-Commit Spec Validation
```
@workspace Before I commit, validate:
1. What spec sections does this code relate to?
2. Does it follow all applicable spec requirements?
3. Are spec references included in comments?
4. Any missing tests for spec requirements?
```

---

## 📊 Measuring Success

Track these metrics:
- ✅ % of code with spec references in comments
- ✅ % of tests linked to spec requirements
- ✅ Number of spec-driven refactorings per sprint
- ✅ Reduction in spec deviation issues in code review
- ✅ Developer velocity on spec-compliant features

---

## 🎯 Summary

**Key Principle**: Always make the spec the **first** thing Copilot reads, not an afterthought.

**Formula for Success**:
```
1. Ask Copilot to search/read specs
2. Have Copilot generate code based on specs
3. Include spec references in generated code
4. Validate against specs during review
5. Refactor to align with specs when drift occurs
```

Your MCP knowledge server makes this workflow **seamless** - Copilot can now access your institutional knowledge with every request!

---

Made with ❤️ for spec-driven development
