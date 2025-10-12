import React from 'react';

function About() {
  return (
    <div className="page">
      <div className="card">
        <h2>About OMS UI</h2>
        <p>
          OMS UI is a microservice that demonstrates the integration of React.js
          with Spring Boot. This architecture allows you to build modern, interactive
          user interfaces while leveraging the power and reliability of Spring Boot
          for serving the application.
        </p>
      </div>

      <div className="card">
        <h2>Technology Stack</h2>
        <div style={{ marginTop: '1rem' }}>
          <h3>Frontend</h3>
          <ul>
            <li><strong>React 18:</strong> Modern JavaScript library for building user interfaces</li>
            <li><strong>React Router:</strong> Declarative routing for React applications</li>
            <li><strong>Create React App:</strong> Toolchain for React development</li>
          </ul>

          <h3>Backend</h3>
          <ul>
            <li><strong>Spring Boot 3:</strong> Java framework for building enterprise applications</li>
            <li><strong>Spring MVC:</strong> Web framework for serving static content and REST APIs</li>
            <li><strong>Java 21:</strong> Latest LTS version of Java</li>
          </ul>

          <h3>Build Tools</h3>
          <ul>
            <li><strong>Gradle:</strong> Build automation tool</li>
            <li><strong>Node.js Gradle Plugin:</strong> Integrates npm/node build into Gradle</li>
          </ul>
        </div>
      </div>

      <div className="card">
        <h2>Architecture</h2>
        <p>
          The application follows a simple but effective architecture:
        </p>
        <ol>
          <li>React application is developed in the <code>frontend</code> directory</li>
          <li>Gradle build process compiles the React app using npm</li>
          <li>Static build output is copied to Spring Boot's resources directory</li>
          <li>Spring MVC serves the static content and handles routing</li>
          <li>REST API endpoints are available under <code>/api/*</code></li>
        </ol>
      </div>
    </div>
  );
}

export default About;
