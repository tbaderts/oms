# OMS UI - Quick Start Guide

This guide will help you get the OMS UI microservice up and running quickly.

## Prerequisites

- **Java 21** installed (check with `java -version`)
- **Gradle** (or use the included Gradle wrapper)
- **Node.js** (optional - Gradle will download it if not present)

## Quick Start

### 1. Build the Application

```powershell
cd oms-ui
./gradlew build
```

This command will:
- Download and install Node.js (if needed)
- Install npm dependencies
- Build the React application
- Compile Java code
- Package everything into a single JAR file

### 2. Run the Application

```powershell
./gradlew bootRun
```

### 3. Access the Application

Open your browser and navigate to:
```
http://localhost:8080
```

You should see the OMS UI home page with:
- Navigation menu (Home, About)
- Service health status
- Feature list

## Development Mode

For faster development with hot-reloading:

### Terminal 1 - Start React Dev Server
```powershell
cd frontend
npm install
npm start
```
React will start on http://localhost:3000 with hot-reloading enabled.

### Terminal 2 - Start Spring Boot
```powershell
./gradlew bootRun
```
Spring Boot will run on http://localhost:8080.

The React dev server will proxy API requests to Spring Boot automatically.

## Testing the API

### Health Check
```powershell
curl http://localhost:8080/api/health
```

Expected response:
```json
{
  "status": "UP",
  "service": "oms-ui",
  "timestamp": "2025-10-09T..."
}
```

### Actuator Health
```powershell
curl http://localhost:8080/actuator/health
```

## Common Commands

| Command | Description |
|---------|-------------|
| `./gradlew build` | Build entire application |
| `./gradlew bootRun` | Run the application |
| `./gradlew clean` | Clean build artifacts |
| `./gradlew test` | Run Java tests |
| `cd frontend && npm test` | Run React tests |
| `cd frontend && npm start` | Run React dev server |

## Project Structure Overview

```
oms-ui/
├── frontend/           # React application source
│   ├── src/            # React components and pages
│   └── public/         # Static HTML template
├── src/
│   ├── main/java/      # Spring Boot application code
│   └── resources/      # Application configuration
└── build.gradle        # Build configuration
```

## Next Steps

1. **Explore the UI**: Navigate between Home and About pages
2. **Check the Code**: Look at the React components in `frontend/src/pages/`
3. **Add a New Page**: Create a new component and add a route
4. **Create an API**: Add a new controller in `src/main/java/org/example/omsui/controller/`
5. **Customize Styling**: Modify `frontend/src/App.css`

## Troubleshooting

### Port Already in Use
If port 8080 is already in use, change it in `src/main/resources/application.yml`:
```yaml
server:
  port: 8081
```

### Build Fails
Try cleaning first:
```powershell
./gradlew clean build
```

### React Changes Not Visible
In production mode, rebuild the React app:
```powershell
./gradlew npmBuild
```

## Getting Help

- See the [full README](README.md) for detailed documentation
- Check the `frontend/src/` directory for React component examples
- Review `src/main/java/org/example/omsui/` for Spring Boot examples

## What's Included

✅ Spring Boot 3 with Java 21  
✅ React 18 with React Router  
✅ Gradle build integration  
✅ REST API example  
✅ Health check endpoints  
✅ Responsive UI design  
✅ Client-side routing  
✅ Production-ready build process  

Happy coding! 🚀
