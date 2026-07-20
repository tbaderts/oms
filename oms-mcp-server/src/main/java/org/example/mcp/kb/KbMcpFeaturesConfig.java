package org.example.mcp.kb;

import java.util.ArrayList;
import java.util.List;

import org.example.mcp.docs.DocumentRepository;
import org.example.mcp.docs.DocumentRepository.DocMeta;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import io.modelcontextprotocol.server.McpServerFeatures;
import io.modelcontextprotocol.spec.McpSchema;
import lombok.extern.slf4j.Slf4j;

/**
 * MCP-native features beyond tools:
 *
 * <ul>
 *   <li><b>Resources</b> — every knowledge base document is exposed as
 *       {@code kb://<path>} so MCP clients can attach specs directly to a
 *       conversation without a tool round-trip.</li>
 *   <li><b>Prompts</b> — reusable spec-driven development workflows
 *       (implement-from-spec, validate-against-spec).</li>
 * </ul>
 */
@Slf4j
@Configuration
public class KbMcpFeaturesConfig {

    @Bean
    public List<McpServerFeatures.SyncResourceSpecification> knowledgeBaseResources(
            DocumentRepository documentRepository) {
        List<McpServerFeatures.SyncResourceSpecification> resources = new ArrayList<>();
        for (DocMeta doc : documentRepository.listAll()) {
            String uri = "kb://" + doc.path();
            McpSchema.Resource resource = McpSchema.Resource.builder()
                    .uri(uri)
                    .name(doc.name())
                    .description(describe(doc))
                    .mimeType("text/markdown")
                    .build();
            resources.add(new McpServerFeatures.SyncResourceSpecification(resource,
                    (exchange, request) -> new McpSchema.ReadResourceResult(List.of(
                            new McpSchema.TextResourceContents(uri, "text/markdown",
                                    documentRepository.readContent(doc.path()))))));
        }
        log.info("[MCP] Registered {} knowledge base documents as MCP resources", resources.size());
        return resources;
    }

    @Bean
    public List<McpServerFeatures.SyncPromptSpecification> knowledgeBasePrompts() {
        List<McpServerFeatures.SyncPromptSpecification> prompts = new ArrayList<>();

        prompts.add(prompt(
                "implement-from-spec",
                "Implement a feature against an OMS specification, citing spec sections.",
                List.of(new McpSchema.PromptArgument("spec", "Knowledge base path of the specification "
                        + "(e.g. oms-knowledge-base/oms-framework/domain-model_spec.md)", true),
                        new McpSchema.PromptArgument("feature", "Short description of what to implement", true)),
                args -> """
                        Implement the following against the OMS specification, following \
                        spec-driven development:

                        Feature: %s
                        Specification: %s

                        Steps:
                        1. Call readKnowledgeBase("%s") and read the relevant sections in full.
                        2. Restate the constraints the spec imposes (states, transitions, \
                        validations, naming) with citations in path#anchor form.
                        3. Write tests first that encode those constraints.
                        4. Implement, keeping each design decision traceable to a cited spec section.
                        5. List any spec gaps or ambiguities you found, so the spec can be improved.
                        """.formatted(args.getOrDefault("feature", "(not specified)"),
                        args.getOrDefault("spec", "(not specified)"),
                        args.getOrDefault("spec", ""))));

        prompts.add(prompt(
                "validate-against-spec",
                "Review existing code for compliance with an OMS specification.",
                List.of(new McpSchema.PromptArgument("file", "Path of the source file to validate", true),
                        new McpSchema.PromptArgument("spec", "Knowledge base path of the specification", true)),
                args -> """
                        Validate %s against the OMS specification %s.

                        Steps:
                        1. Call readKnowledgeBase("%s") and identify the sections that govern this code.
                        2. Compare the implementation point by point with the spec.
                        3. Report each finding as: severity, code location, spec citation \
                        (path#anchor), and a suggested fix.
                        4. Explicitly confirm which spec requirements ARE correctly implemented.
                        """.formatted(args.getOrDefault("file", "(not specified)"),
                        args.getOrDefault("spec", "(not specified)"),
                        args.getOrDefault("spec", ""))));

        return prompts;
    }

    // ----- helpers -----

    private static String describe(DocMeta doc) {
        StringBuilder sb = new StringBuilder("OMS knowledge base document");
        if (doc.category() != null) sb.append(" [").append(doc.category()).append("]");
        if (doc.status() != null) sb.append(", status ").append(doc.status());
        sb.append(": ").append(doc.path());
        return sb.toString();
    }

    private static McpServerFeatures.SyncPromptSpecification prompt(
            String name, String description, List<McpSchema.PromptArgument> arguments,
            java.util.function.Function<java.util.Map<String, Object>, String> render) {
        McpSchema.Prompt prompt = new McpSchema.Prompt(name, description, arguments);
        return new McpServerFeatures.SyncPromptSpecification(prompt,
                (exchange, request) -> {
                    java.util.Map<String, Object> args = request.arguments() == null
                            ? java.util.Map.of() : request.arguments();
                    java.util.Map<String, Object> safeArgs = new java.util.HashMap<>();
                    args.forEach((k, v) -> safeArgs.put(k, v == null ? "" : v.toString()));
                    String text = render.apply(safeArgs);
                    return new McpSchema.GetPromptResult(description, List.of(
                            new McpSchema.PromptMessage(McpSchema.Role.USER,
                                    new McpSchema.TextContent(text))));
                });
    }
}
