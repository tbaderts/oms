# OMS UI Microservice

A Spring Boot 3 microservice that serves a React.js single-page application (SPA). The React application is built as part of the Gradle build process and served as static content by Spring MVC.

## Overview

This microservice demonstrates a modern approach to building web applications where:
- The frontend is a React.js application with client-side routing
- The backend is a Spring Boot 3 application serving static content and providing REST APIs
- The build process is unified through Gradle, which orchestrates both the Java and JavaScript builds

## Technology Stack

### Backend
- **Java 21**: Latest LTS version
- **Spring Boot 3.2.0**: Modern Java framework
- **Spring MVC**: For serving static content and REST endpoints
- **Spring Boot Actuator**: For health checks and metrics
- **Gradle 8.x**: Build automation

### Frontend
- **React 18.2.0**: Modern UI library
- **React Router 6.x**: Client-side routing
- **Create React App**: React toolchain
- **Node.js 20.x**: JavaScript runtime for build

## Project Structure

```
oms-ui/
├── build.gradle                    # Gradle build configuration
├── settings.gradle                 # Gradle settings
├── src/
│   ├── main/
│   │   ├── java/
│   │   │   └── org/example/omsui/
│   │   │       ├── OmsUiApplication.java          # Main Spring Boot application
│   │   │       ├── config/
│   │   │       │   └── WebConfig.java             # Web MVC configuration
│   │   │       └── controller/
│   │   │           └── HealthController.java      # Health check API
│   │   └── resources/
│   │       └── application.yml                    # Spring Boot configuration
│   └── test/
│       └── java/
│           └── org/example/omsui/
│               └── OmsUiApplicationTests.java     # Integration tests
└── frontend/                                       # React application
    ├── package.json                                # npm dependencies
    ├── public/
    │   └── index.html                              # HTML template
    └── src/
        ├── index.js                                # React entry point
        ├── index.css                               # Global styles
        ├── App.js                                  # Main App component
        ├── App.css                                 # App styles
        ├── App.test.js                             # App tests
        └── pages/
            ├── Home.js                             # Home page component
            └── About.js                            # About page component
```

## Build Process

The build process integrates React and Spring Boot seamlessly:

1. **npm install**: Installs all Node.js dependencies
2. **npm build**: Builds the React application (creates optimized production bundle)
3. **copyReactBuild**: Copies the React build output to Spring Boot's static resources
4. **processResources**: Includes the copied React build in the final JAR
5. **bootJar**: Creates the executable Spring Boot JAR with embedded React app

### Gradle Tasks

- `./gradlew build` - Builds the entire application (React + Spring Boot)
- `./gradlew bootRun` - Runs the application locally
- `./gradlew clean` - Cleans build artifacts (including React build)
- `./gradlew npmInstall` - Installs npm dependencies only
- `./gradlew npmBuild` - Builds React app only
- `./gradlew test` - Runs all tests

## Configuration

### Application Properties

The application is configured via `src/main/resources/application.yml`:

```yaml
server:
  port: 8080                    # HTTP port
  compression:
    enabled: true               # Enable gzip compression

management:
  endpoints:
    web:
      exposure:
        include: health,info,metrics,prometheus
```

### Environment Variables

You can override configuration using environment variables:
- `SERVER_PORT` - HTTP port (default: 8080)
- `SPRING_PROFILES_ACTIVE` - Active Spring profile

## Running the Application

### Development Mode

For development, you can run the React app and Spring Boot separately:

**Terminal 1 - React Development Server:**
```powershell
cd frontend
npm install
npm start
```
This starts the React dev server on port 3000 with hot reloading.

**Terminal 2 - Spring Boot:**
```powershell
./gradlew bootRun
```
The React dev server proxies API calls to Spring Boot on port 8080.

### Production Mode

Build and run the complete application:

```powershell
# Build everything
./gradlew build

# Run the application
./gradlew bootRun
```

Or run the JAR directly:
```powershell
java -jar build/libs/oms-ui-0.0.1-SNAPSHOT.jar
```

Access the application at: http://localhost:8080

## API Endpoints

### REST API
- `GET /api/health` - Health check endpoint

### Actuator Endpoints
- `GET /actuator/health` - Detailed health information
- `GET /actuator/info` - Application information
- `GET /actuator/metrics` - Metrics
- `GET /actuator/prometheus` - Prometheus metrics

### Static Content
- `GET /` - Serves the React application
- All other routes are handled by React Router (client-side routing)

## Routing

The application uses client-side routing via React Router. The `WebConfig` class ensures that all non-API routes are forwarded to `index.html`, allowing React Router to handle navigation:

```java
@Override
public void addViewControllers(ViewControllerRegistry registry) {
    registry.addViewController("/").setViewName("forward:/index.html");
    registry.addViewController("/{x:[\\w\\-]+}").setViewName("forward:/index.html");
    registry.addViewController("/{x:^(?!api$).*$}/**/{y:[\\w\\-]+}")
        .setViewName("forward:/index.html");
}
```

## Development Workflow

1. **Make React changes**: Edit files in `frontend/src/`
   - In dev mode: Changes hot-reload automatically
   - In prod mode: Run `./gradlew npmBuild` to rebuild

2. **Make Spring Boot changes**: Edit Java files in `src/main/java/`
   - Rebuild: `./gradlew compileJava`
   - Restart: `./gradlew bootRun`

3. **Add new API endpoints**: Create controllers in `src/main/java/org/example/omsui/controller/`

4. **Add new React pages**: 
   - Create components in `frontend/src/pages/`
   - Add routes in `frontend/src/App.js`

## Testing

### Backend Tests
```powershell
./gradlew test
```

### Frontend Tests
```powershell
cd frontend
npm test
```

## Deployment

### Docker

Create a Dockerfile:
```dockerfile
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
COPY build/libs/oms-ui-0.0.1-SNAPSHOT.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
```

Build and run:
```powershell
docker build -t oms-ui .
docker run -p 8080:8080 oms-ui
```

### Kubernetes

Deploy using the standard Spring Boot deployment patterns with the generated JAR file.

## Troubleshooting

### Build Issues

**Problem**: npm install fails
- **Solution**: Ensure Node.js is accessible or let Gradle download it (configured in build.gradle)

**Problem**: React build not included in JAR
- **Solution**: Run `./gradlew clean build` to ensure proper task execution order

### Runtime Issues

**Problem**: 404 on React routes after refresh
- **Solution**: Verify `WebConfig` is properly configured to forward routes to index.html

**Problem**: API calls fail from React
- **Solution**: Check that API endpoints are under `/api/*` path and CORS is configured if needed

## Performance Considerations

- **Compression**: Enabled for all text-based content (HTML, CSS, JS, JSON)
- **Caching**: Static resources are served with appropriate cache headers
- **Production Build**: React production build is optimized and minified
- **JAR Size**: The complete application (Spring Boot + React) is packaged in a single JAR

## Future Enhancements

- Add authentication/authorization (Spring Security + JWT)
- Implement WebSocket support for real-time updates
- Add state management (Redux/Context API)
- Integrate with other OMS microservices
- Add comprehensive error handling and logging
- Implement CI/CD pipeline
- Add end-to-end testing (Cypress/Playwright)

## License

This project is part of the OMS (Order Management System) suite.
