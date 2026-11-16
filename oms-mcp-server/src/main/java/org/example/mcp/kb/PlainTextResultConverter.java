package org.example.mcp.kb;

import java.lang.reflect.Type;

import org.springframework.ai.tool.execution.DefaultToolCallResultConverter;
import org.springframework.ai.tool.execution.ToolCallResultConverter;

/**
 * Returns a tool's String result as written (SPEC-0065). Spring AI's default converter serialises
 * every result with Jackson, so a Markdown String reached MCP clients as one quoted JSON string with
 * escaped line breaks. Any other result type is converted as before.
 */
public class PlainTextResultConverter implements ToolCallResultConverter {

    private static final ToolCallResultConverter DEFAULT = new DefaultToolCallResultConverter();

    @Override
    public String convert(Object result, Type returnType) {
        return result instanceof String text ? text : DEFAULT.convert(result, returnType);
    }
}
