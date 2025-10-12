import React, { useState, useEffect } from 'react';

function Home() {
  const [healthStatus, setHealthStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHealthStatus();
  }, []);

  const fetchHealthStatus = async () => {
    try {
      const response = await fetch('/api/health');
      const data = await response.json();
      setHealthStatus(data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching health status:', error);
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <div className="card">
        <h2>Welcome to OMS UI</h2>
        <p>
          This is a Spring Boot microservice serving a React.js application.
          The React app is built as part of the Gradle build process and served
          as static content by Spring MVC.
        </p>
      </div>

      <div className="card">
        <h2>Service Health Status</h2>
        {loading ? (
          <p>Loading...</p>
        ) : healthStatus ? (
          <div>
            <div className={`status-badge ${healthStatus.status === 'UP' ? 'success' : 'error'}`}>
              {healthStatus.status}
            </div>
            <p><strong>Service:</strong> {healthStatus.service}</p>
            <p><strong>Timestamp:</strong> {healthStatus.timestamp}</p>
            <button onClick={fetchHealthStatus}>Refresh Status</button>
          </div>
        ) : (
          <div className="status-badge error">Unable to fetch health status</div>
        )}
      </div>

      <div className="card">
        <h2>Features</h2>
        <ul>
          <li>React 18 with React Router for client-side routing</li>
          <li>Spring Boot 3 backend serving static content</li>
          <li>Gradle build process integrating React build</li>
          <li>RESTful API endpoints for backend communication</li>
          <li>Responsive design and modern UI</li>
        </ul>
      </div>
    </div>
  );
}

export default Home;
