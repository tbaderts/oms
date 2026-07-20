package org.example.mcp.index;

import org.springframework.boot.context.properties.ConfigurationProperties;

import lombok.Data;

/**
 * Configuration for the embedded Lucene knowledge index.
 *
 * <pre>
 * knowledge:
 *   index:
 *     cache-dir: .kb-index
 *     min-section-chars: 200
 *     max-section-chars: 6000
 *     embeddings:
 *       enabled: true
 *       query-prefix: "..."     # model-specific instruction prefix for queries
 *       document-prefix: ""     # model-specific instruction prefix for documents
 *       batch-size: 16
 * </pre>
 */
@Data
@ConfigurationProperties(prefix = "knowledge.index")
public class KnowledgeIndexProperties {

    /** Directory for the persistent embedding cache (relative to working dir). */
    private String cacheDir = ".kb-index";

    /** Sections shorter than this (in characters) are merged with a neighbor. */
    private int minSectionChars = 200;

    /** Sections longer than this (in characters) are split at paragraph boundaries. */
    private int maxSectionChars = 6000;

    private Embeddings embeddings = new Embeddings();

    @Data
    public static class Embeddings {
        /** Master switch for vector search. BM25 keyword search always works. */
        private boolean enabled = true;

        /**
         * Instruction prefix prepended to queries before embedding.
         * Model-specific, e.g. for mxbai-embed-large:
         * "Represent this sentence for searching relevant passages: "
         * or for nomic-embed-text: "search_query: ".
         */
        private String queryPrefix = "";

        /**
         * Instruction prefix prepended to document chunks before embedding.
         * E.g. for nomic-embed-text: "search_document: " (mxbai uses none).
         */
        private String documentPrefix = "";

        /** Number of chunks embedded per Ollama call batch. */
        private int batchSize = 16;
    }
}
