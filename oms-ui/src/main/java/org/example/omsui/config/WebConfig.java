package org.example.omsui.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.ViewControllerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Web MVC configuration for serving the React application.
 * This configuration ensures that all routes are forwarded to index.html
 * to support client-side routing in React.
 */
@Configuration
public class WebConfig implements WebMvcConfigurer {

    @Override
    public void addViewControllers(ViewControllerRegistry registry) {
        // Forward all non-API routes to index.html for React Router
        registry.addViewController("/").setViewName("forward:/index.html");
        registry.addViewController("/{path:[^\\.]*}").setViewName("forward:/index.html");
    }
}
