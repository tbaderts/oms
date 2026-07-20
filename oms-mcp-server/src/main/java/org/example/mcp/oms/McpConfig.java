package org.example.mcp.oms;

import org.example.mcp.kb.KnowledgeBaseTools;
import org.example.mcp.tools.HealthTools;
import org.springframework.ai.tool.ToolCallbackProvider;
import org.springframework.ai.tool.method.MethodToolCallbackProvider;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class McpConfig {

    @Bean
    public ToolCallbackProvider tools(
            OrderSearchMcpTools orderTools,
            KnowledgeBaseTools knowledgeBaseTools,
            HealthTools healthTools) {

        return MethodToolCallbackProvider.builder()
                .toolObjects(orderTools, knowledgeBaseTools, healthTools)
                .build();
    }
}
