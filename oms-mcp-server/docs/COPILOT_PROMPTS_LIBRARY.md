# Ready-to-Use Copilot Prompts for OMS Development

## 📋 Copy-Paste Prompts for Common Tasks

### 🏗️ Creating New Classes

#### Create Entity Class
```
@workspace Create the Order entity class:
1. Read specs/oms_spec.md section "Domain Model"
2. Read specs/domain-model_spec.md for entity structure details
3. Generate Order.java with:
   - All core attributes from spec
   - JPA annotations for PostgreSQL
   - State management for lifecycle
   - FIX protocol field mappings (clOrdID, etc.)
   - Javadoc with spec references
4. Follow Java 21 and Spring Boot patterns from tech stack spec
```

#### Create Service Class
```
@workspace Create the OrderService class:
1. Search specs for "command API" and "CQRS"
2. Read architecture principles from oms_spec.md
3. Generate OrderService.java that:
   - Implements command operations
   - Follows CQRS pattern per spec
   - Uses Spring @Service annotation
   - Includes proper exception handling
   - Has spec references in Javadoc
```

#### Create Validator
```
@workspace Create OrderValidator:
1. Read specs/domain-model_spec.md section "Validation Engine"
2. Implement predicate-based validation as specified
3. Make it extensible for different asset classes per spec
4. Include all validation rules mentioned in specs
5. Add Javadoc explaining how it follows the spec pattern
```

---

### 🧪 Writing Tests

#### Comprehensive Test Suite
```
@workspace Create comprehensive tests for Order class:
1. Search specs for "order" and "validation"
2. Read State Machine Engine section
3. Generate OrderTest.java with:
   - State transition tests
   - Validation rule tests
   - Edge case tests from spec requirements
   - Each test method referencing its spec requirement
4. Use JUnit 5 and AssertJ
5. Aim for 100% coverage of spec requirements
```

#### State Machine Tests
```
@workspace Create state machine tests:
1. Read specs/domain-model_spec.md section "State Machine Engine"
2. List all valid state transitions from spec
3. Generate parameterized tests for:
   - All valid transitions
   - All invalid transitions
   - Transition guard conditions
4. Add edge cases not explicitly in spec but implied
5. Include spec section references in test comments
```

#### Integration Tests
```
@workspace Create integration tests for Order CRUD:
1. Read CQRS and architecture sections from specs
2. Generate integration tests that:
   - Test command API (write operations)
   - Test query API (read operations)
   - Verify PostgreSQL persistence
   - Check event publishing to Kafka
   - Follow Spring Boot test patterns
3. Include spec references for each test scenario
```

---

### 🔍 Code Analysis

#### Spec Compliance Check
```
@workspace Analyze OrderService.java for spec compliance:
1. Search specs for service layer patterns
2. Read architecture and CQRS sections
3. Compare our implementation against spec requirements
4. List deviations or gaps
5. Provide specific fixes with spec references
6. Rate compliance as percentage
```

#### Architecture Validation
```
@workspace Validate our Order module architecture:
1. Read specs/software-architecture-methodology_spec.md
2. Review our package structure in src/main/java/org/example/oms/
3. Check if we follow:
   - Microservices pattern
   - CQRS separation
   - Proper layering
   - Dependency injection
4. Suggest restructuring to match spec
```

#### Technology Stack Audit
```
@workspace Audit our dependencies against the spec:
1. Read "Technology Stack" section from oms_spec.md
2. Review build.gradle dependencies
3. Verify we use:
   - Java 21 (check language level)
   - Spring Boot (check version)
   - PostgreSQL driver
   - Kafka client (Confluent)
   - Jackson for JSON
4. List missing or non-compliant dependencies
5. Generate corrected build.gradle if needed
```

---

### ♻️ Refactoring

#### Refactor to Match Spec Pattern
```
@workspace Refactor OrderValidator to match spec pattern:
1. Read specs/domain-model_spec.md "Validation Engine" section
2. Our current validation uses if-else chains
3. Refactor to use Java Predicates as spec requires
4. Make validation rules configurable and extensible
5. Show before/after comparison
6. Explain how refactored code follows spec
```

#### Apply CQRS Pattern
```
@workspace Refactor OrderRepository to apply CQRS:
1. Read CQRS principles from specs/oms_spec.md
2. Our current repository mixes reads and writes
3. Split into:
   - OrderCommandRepository (writes)
   - OrderQueryRepository (reads)
4. Update service layer accordingly
5. Add spec references in new classes
6. Generate migration guide for the team
```

#### Extract Reusable Component
```
@workspace Extract State Machine to reusable component:
1. Read specs/domain-model_spec.md about OMS Core Libraries
2. The spec says State Machine should be in core library
3. Extract state logic from Order into generic StateMachine<T>
4. Make it reusable for Execution, Quote, QuoteRequest
5. Follow the extensibility pattern from spec
6. Update all entities to use the extracted component
```

---

### 📚 Documentation

#### Generate Architecture Document
```
@workspace Generate architecture documentation:
1. Read all spec files to understand intended architecture
2. Review our actual implementation in src/
3. Create ARCHITECTURE.md that:
   - Describes our current architecture
   - Maps it to spec requirements
   - Includes diagrams (Mermaid) showing:
     * Component structure
     * CQRS flow
     * Event sourcing pattern
   - Lists spec compliance status per component
   - Identifies technical debt (deviations from spec)
```

#### Create Developer Onboarding Guide
```
@workspace Create DEVELOPER_GUIDE.md:
1. Read specs/manifesto.md and methodology spec
2. Generate a guide that includes:
   - OMS domain model overview (from specs)
   - Key architectural patterns we follow
   - How to find requirements in specs
   - Coding standards from methodology spec
   - How to use MCP tools to read specs
   - Example workflows for common tasks
3. Make it beginner-friendly but spec-referenced
```

#### Document API Contracts
```
@workspace Document our API contracts:
1. Read specs about OpenAPI and Avro contracts
2. Review our existing REST controllers
3. Generate OpenAPI 3.0 spec that:
   - Documents all endpoints
   - Includes examples from domain spec
   - References OMS spec requirements
   - Shows request/response DTOs
4. Add annotations to controllers for auto-generation
```

---

### 🐛 Debugging

#### Debug State Transition Issue
```
@workspace Help debug Order state transition bug:
1. Read State Machine Engine section from specs
2. Review our Order state transition code
3. Analyze this error: [PASTE ERROR]
4. Compare actual behavior vs spec requirements
5. Identify root cause with spec references
6. Provide fix that aligns with spec
```

#### Validate Event Structure
```
@workspace Validate our order events against spec:
1. Read specs about Message API and Avro contracts
2. Review our OrderEvent class
3. Check if events include all required fields per spec
4. Verify event structure matches Event Sourcing pattern
5. List missing fields or incorrect structure
6. Generate compliant event schema
```

---

### 🎨 Design

#### Design New Feature
```
@workspace Design the QuoteRequest feature:
1. Search specs for "QuoteRequest" and "Quote"
2. Read all relevant sections
3. Design the feature including:
   - Entity model (following domain model spec)
   - State machine (following state engine spec)
   - Command API (following CQRS spec)
   - Query API (following CQRS spec)
   - Validation rules (following validation spec)
4. Create design document with spec references
5. List implementation tasks in priority order
```

#### Design Database Schema
```
@workspace Design PostgreSQL schema for Order module:
1. Read Domain Model section from specs
2. Design tables for:
   - Order (with all spec attributes)
   - Execution
   - Quote
   - QuoteRequest
3. Include:
   - Proper relationships
   - Indexes for query performance
   - Event store table for Event Sourcing
   - Audit columns
4. Generate DDL with comments referencing spec
5. Create migration scripts (Flyway/Liquibase)
```

---

### 🔄 Continuous Improvement

#### Weekly Spec Alignment Check
```
@workspace Weekly spec alignment report:
1. Review all code changes from the last week (check git log)
2. For each change, identify related spec sections
3. Check if changes comply with specs
4. List any drift from specifications
5. Prioritize alignment tasks
6. Generate action items for next sprint
```

#### Technical Debt Assessment
```
@workspace Assess technical debt vs specs:
1. Read all OMS specification documents
2. Review our entire codebase in src/
3. Identify areas where we deviate from specs
4. Categorize deviations by severity:
   - Critical (breaks spec requirements)
   - High (misses important patterns)
   - Medium (suboptimal implementation)
   - Low (cosmetic differences)
5. Generate prioritized refactoring backlog
```

---

### 🎯 Spec-Specific Tasks

#### Implement Event Sourcing
```
@workspace Implement Event Sourcing per spec:
1. Read "Event Sourcing" principles from oms_spec.md
2. Review our current Order persistence
3. Implement:
   - Event store (PostgreSQL table)
   - Event append-only logic
   - State reconstruction from events
   - Event versioning
4. Follow spec requirements exactly
5. Add tests verifying event sourcing works
```

#### Implement MapStruct Mappings
```
@workspace Implement entity-to-DTO mappings:
1. Read domain-model_spec.md about MapStruct usage
2. The spec says DTOs must be decoupled from entities
3. Generate MapStruct mappers for:
   - Command API DTOs ↔ Order entity
   - Order entity ↔ Query API DTOs
   - Order entity ↔ Avro messages
4. Follow the mapping pattern from spec
5. Add tests for all mappings
```

#### Implement FIX Protocol Semantics
```
@workspace Implement FIX protocol fields:
1. Search specs for "FIX protocol"
2. Read about FIX semantics in domain model
3. Add FIX tag mappings to Order:
   - Tag 11 (ClOrdID)
   - Other relevant tags from spec
4. Document FIX field meanings in Javadoc
5. Add validation for FIX field formats
```

---

## 🎓 Learning Prompts

#### Understand Domain Concept
```
@workspace Explain the State Store concept:
1. Read state-query-store_spec.md
2. Explain in simple terms:
   - What is a State Store?
   - Why do we need it?
   - How does it work with Event Sourcing?
   - How does it support CQRS?
3. Give practical examples from our OMS
4. Show code examples that implement the concept
```

#### Compare Spec vs Implementation
```
@workspace Compare spec to our implementation:
1. Read specs/oms_spec.md section "Domain Model"
2. Review our src/main/java/org/example/oms/model/Order.java
3. Create a comparison table:
   - Spec requirement | Our implementation | Status (✅/❌)
4. Explain any justified deviations
5. Suggest improvements for better alignment
```

---

## 💡 Pro Tips

### Combine Multiple Prompts
You can chain these prompts:

**Step 1:** Understand the spec
```
@workspace Explain what the spec says about validation
```

**Step 2:** Analyze current code
```
@workspace Compare our validation code against the spec
```

**Step 3:** Refactor
```
@workspace Refactor our validation to match the spec pattern
```

**Step 4:** Test
```
@workspace Generate tests for the refactored validation
```

### Save Time with Templates

Create your own templates by replacing placeholders:
- `[ENTITY]` - Order, Execution, Quote, QuoteRequest
- `[PATTERN]` - CQRS, Event Sourcing, State Machine
- `[SECTION]` - Domain Model, Technology Stack, etc.

---

## 📝 Remember

**Every prompt should:**
1. ✅ Start with reading/searching specs
2. ✅ Reference specific spec sections
3. ✅ Ask for spec citations in output
4. ✅ Use `@workspace` for MCP tool access
5. ✅ Be specific about what you want

**The magic formula:**
```
@workspace 
1. Read/search specs for [TOPIC]
2. [ACTION] based on spec requirements
3. Include spec references in output
```

---

Happy spec-driven coding! 🚀
