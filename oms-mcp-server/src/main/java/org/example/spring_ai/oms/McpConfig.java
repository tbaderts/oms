package org.example.spring_ai.oms;

import java.util.ArrayList;
import java.util.List;

import org.example.spring_ai.docs.DomainDocsTools;
import org.example.spring_ai.tools.HealthTools;
import org.example.spring_ai.vector.SemanticSearchTools;
import org.springframework.ai.tool.ToolCallbackProvider;
import org.springframework.ai.tool.method.MethodToolCallbackProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class McpConfig {

    @Bean
    public ToolCallbackProvider tools(
            OrderSearchMcpTools orderTools, 
            DomainDocsTools docsTools, 
            HealthTools healthTools,
            @Autowired(required = false) SemanticSearchTools semanticSearchTools) {
        
        List<Object> toolObjects = new ArrayList<>();
        toolObjects.add(orderTools);
        toolObjects.add(docsTools);
        toolObjects.add(healthTools);
        
        // Add semantic search tools if vector store is enabled
        if (semanticSearchTools != null) {
            toolObjects.add(semanticSearchTools);
        }
        
        return MethodToolCallbackProvider.builder()
                .toolObjects(toolObjects.toArray())
                .build();
    }
}
