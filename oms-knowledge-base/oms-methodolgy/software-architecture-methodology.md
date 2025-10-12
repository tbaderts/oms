# OMS Layered Architecture Framework

**1. Introduction**

This document describes a software architecture methodology that divides architectural concerns into four distinct pillars: Execution Architecture, Application Architecture, Development Architecture, and Operations Architecture. This methodology provides a structured approach to designing, developing, and operating complex software systems like the Order Management System (OMS). This document clarifies the scope of each pillar, outlines the benefits of this methodology, and suggests potential naming conventions for your organization.

**2. Purpose**

The purpose of this methodology is to:

*   Provide a clear framework for defining and communicating architectural responsibilities.
*   Facilitate consistent application of architectural principles across different projects and sub-domains.
*   Improve the overall quality, maintainability, and operability of the software system.
*   Identify key areas for focus, contribution, and knowledge building within the team.
*   Enable specialization and expertise within the development team.

**3. The Four Pillars**

The methodology divides software architecture into the following four pillars:

**3.1 Execution Architecture**

*   **Scope:** The foundational platform and infrastructure upon which the application runs. This pillar defines the technical underpinnings of the system.
*   **Key Areas:**
    *   **Platform Technology Stack:** The chosen programming languages, frameworks (e.g., Spring Boot, Spring Data), databases (e.g., PostgreSQL), message queues (e.g., Kafka), and cloud platform (e.g., Azure).
    *   **OMS Core Architecture Components:** The design and implementation of reusable components such as the State Store, State Machine, Validation/Rules Engine, and Orchestration Engine.
    *   **Service Orchestration:** How services interact and coordinate with each other.
    *   **API Gateway:** How external requests are routed and managed.
    *   **Security:** Authentication, authorization, encryption, and other security measures.
    *   **Entitlements:** Defining and managing user permissions and access control.
    *   **Non-Functional Requirements (NFRs):** Performance, scalability, reliability, availability, and other quality attributes.
    *   **Data Architecture:** The design of the data model, data storage, and data access patterns.
*   **Responsibilities:**
    *   Selecting and configuring the platform technology stack.
    *   Designing and implementing the core architecture components.
    *   Defining security and entitlement policies.
    *   Ensuring that the system meets its NFRs.

**3.2 Application Architecture**

*   **Scope:** How the Execution Architecture is utilized to deliver specific implementations of the OMS for different sub-domains (e.g., Digital Assets, Money Market, Equity Trading). This pillar focuses on translating business requirements into software solutions.
*   **Key Areas:**
    *   **Sub-Domain Business Logic:** Implementing the core business rules, workflows, and validation logic for a specific asset class or trading domain.
    *   **API Implementation:** Implementing the API endpoints (Command, Query, Message) based on OpenAPI and Avro contracts.
    *   **Data Mapping:** Mapping between the domain model and the API DTOs.
    *   **Event Handling:** Processing events from Kafka and updating the State Store accordingly.
    *   **Integration:** Integrating with external systems (e.g., markets and brokers, settlement systems, market and reference data systems).
    *   **User Interface Logic:** Implementing the logic for the Trade Blotter and other user interfaces.
*   **Responsibilities:**
    *   Understanding the business requirements for a specific sub-domain.
    *   Implementing the business logic and workflows.
    *   Integrating with external systems.
    *   Ensuring that the application meets the business requirements.

**3.3 Development Architecture**

*   **Scope:** The tools, processes, and standards used to develop and maintain the software. This pillar focuses on developer productivity and code quality.
*   **Key Areas:**
    *   **Software Development Toolchain:** The IDEs, build tools (e.g. Gradle, GitLab), and testing frameworks used by the development team.
    *   **CI/CD Pipelines:** The automated pipelines for building, testing, and deploying the software.
    *   **Coding Standards:** The coding conventions, style guides, and best practices followed by the development team.
    *   **Code Quality Standards:** The metrics and tools used to measure code quality (e.g., static analysis, code coverage).
    *   **Branching and Release Process:** The strategy for managing code branches and releasing new versions of the software.
    *   **Versioning:** The system for versioning code, APIs, and data schemas.
    *   **Documentation:** The process for creating and maintaining documentation.
*   **Responsibilities:**
    *   Selecting and configuring the software development toolchain.
    *   Designing and implementing the CI/CD pipelines.
    *   Defining and enforcing the coding and code quality standards.
    *   Managing the branching and release process.
    *   Ensuring that the software is well-documented.

**3.4 Operations Architecture**

*   **Scope:** How the software is monitored, managed, and operated in a production environment. This pillar focuses on system reliability and maintainability.
*   **Key Areas:**
    *   **Monitoring:** The tools and techniques used to monitor the health and performance of the system (e.g., Prometheus, Grafana).
    *   **Logging:** The system for collecting and analyzing logs.
    *   **Performance Metrics:** The key performance indicators (KPIs) that are tracked to measure the success of the system.
    *   **Alerting:** The system for alerting operators to potential problems.
    *   **Incident Management:** The process for responding to and resolving incidents.
    *   **Capacity Planning:** The process for planning for future capacity needs.
    *   **Disaster Recovery:** The plan for recovering from disasters.
    *   **Infrastructure as Code (IaC):** Managing infrastructure using code (e.g., Terraform, Ansible).
*   **Responsibilities:**
    *   Implementing the monitoring and logging infrastructure.
    *   Defining the KPIs and alerts.
    *   Responding to and resolving incidents.
    *   Planning for future capacity needs.
    *   Ensuring that the system can recover from disasters.
 
**4. Relationships**

Below is a single, aligned wireframe that illustrates the relationships between the pillars and the business flow.

```
+------------------------+
|   Business Objectives  |
+------------------------+
         |
         v
+------------------------+
|      Requirements      |
+------------------------+
         |
         v
+----------------------------------------------+
|        OMS Architecture Framework            |
+----------------------------------------------+
|  +--------------------+                      |
|  |    Application     |  implements domain   |
|  |    Architecture    |-------------------+  |
|  +--------------------+                   |  |
|             ^                             |  |
|             | relies on                   |  |
|  +--------------------+                   |  |
|  |     Execution      |  platform & core  |  |
|  |     Architecture   |  components       |  |
|  +--------------------+                   |  |
+----------------------------------------------+
         ^                                  |
         | enables (tools, standards)       |
  +-----------------------+                 |
  |   Development Arch    |  CI/CD, quality |
  +-----------------------+                 | 
         ^                                  |
         | feedback (metrics, lessons)      |
         +----------------------------------+
                                   |
                 monitoring, SLAs  v
               +-------------------------+---+
               |     Operations Arch         |
               |  monitoring, runbooks, DR   |
               +-----------------------------+
```

Legend:

- Application Architecture relies on Execution Architecture.
- Development Architecture enables both (tools, CI/CD, standards) and feeds back quality signals.
- Operations Architecture monitors, enforces SLOs, and provides feedback to improve the system.
- Business Objectives and Requirements drive the architectural work.

**5. Advantages of the Methodology**

*   **Improved Clarity:** Provides a clear framework for understanding the different aspects of software architecture.
*   **Enhanced Specialization:** Allows team members to specialize in specific areas of architecture, fostering expertise and ownership.
*   **Better Communication:** Facilitates communication between different teams and stakeholders by providing a common vocabulary.
*   **Increased Efficiency:** Streamlines the development process by clearly defining responsibilities and reducing overlap.
*   **Reduced Risk:** Helps to identify and mitigate risks early in the development lifecycle.
*   **Improved Quality:** Leads to higher-quality software by ensuring that all aspects of the architecture are well-defined and implemented.
*   **Easier Maintenance:** Makes the system easier to maintain and operate by providing a well-defined and documented architecture.
*   **Knowledge Sharing:** Encourages knowledge sharing and collaboration within the team.
*   **Career Development:** Provides a framework for team members to focus on their areas of interest and build subject matter expertise, aiding in career growth.

**6. Conclusion**

The Layered Architecture Framework methodology provides a structured and effective approach to designing, developing, and operating complex software systems. By clearly defining the scope of each pillar and assigning responsibilities accordingly, this methodology can help to improve the quality, maintainability, and operability of the OMS and foster a culture of specialization and expertise within the development team.

