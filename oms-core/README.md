# OMS core

## Overview
OMS (Order Management System) is a Java-based application designed to manage orders, executions, quotes, and related financial operations. It leverages Spring Boot and integrates with various services and tools for monitoring, logging, and deployment.

## Features
- Order creation, acceptance, and management
- Execution tracking and reporting
- Quote and quote request handling
- Integration with Avro schemas for data serialization
- RESTful API endpoints
- Docker and Kubernetes deployment support
- Monitoring with Prometheus and logging with Loki/Promtail

## Project Structure
- `src/main/` - Main application source code
- `src/test/` - Test sources
- `build.gradle` - Gradle build configuration
- `Dockerfile` - Containerization setup
- `docker-compose.yml` - Multi-service orchestration
- `k8s/` - Kubernetes deployment manifests
- `prometheus.yml`, `loki-config.yml`, `promtail-config.yml` - Monitoring and logging configs
- `generated-avro/` - Avro schema definitions

## Getting Started
### Prerequisites
- Java 21s+
- Gradle
- Docker (optional, for containerization)
- Kubernetes (optional, for deployment)

### Build and Run
```bash
./gradlew build
./gradlew bootRun
```

### Docker
```bash
docker build -t oms:latest .
docker run -p 8080:8080 oms:latest
```

### Kubernetes
Apply the manifests in the `k8s/` directory:
```bash
kubectl apply -f k8s/oms-deployment.yaml
kubectl apply -f k8s/oms-service.yaml
```

## Monitoring & Logging
- Prometheus: Metrics collection (`prometheus.yml`)
- Loki & Promtail: Log aggregation (`loki-config.yml`, `promtail-config.yml`)

## Contributing
Contributions are welcome! Please fork the repository and submit a pull request.

## License
This project is licensed under the MIT License.

## Contact
For questions or support, please contact the repository owner.
