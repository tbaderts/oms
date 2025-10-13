package org.example.mcp.tools;

import org.springframework.ai.tool.annotation.Tool;
import org.springframework.stereotype.Component;

/**
 * Simple health/debug MCP tool to verify discovery works.
 */
@Component
public class HealthTools {

    @Tool(name = "ping", description = "Health check tool to verify MCP tool discovery.")
    public String ping() {
        return "pong";
    }
}
