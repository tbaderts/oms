package org.example.mcp.index;

import org.example.mcp.docs.DocumentRepository;
import org.example.mcp.docs.MarkdownParser;
import org.springframework.ai.embedding.EmbeddingModel;
import org.springframework.beans.factory.ObjectProvider;

/**
 * Builds fully wired index components for tests, with embeddings disabled
 * (BM25-only) so no Ollama instance is required.
 */
public final class IndexTestSupport {

    private IndexTestSupport() {
    }

    public static KnowledgeIndexProperties bm25OnlyProperties() {
        KnowledgeIndexProperties properties = new KnowledgeIndexProperties();
        properties.getEmbeddings().setEnabled(false);
        return properties;
    }

    public static EmbeddingService disabledEmbeddings(KnowledgeIndexProperties properties) {
        ObjectProvider<EmbeddingModel> none = new ObjectProvider<>() {
            @Override
            public EmbeddingModel getObject(Object... args) {
                throw new UnsupportedOperationException("no embedding model in tests");
            }

            @Override
            public EmbeddingModel getIfAvailable() {
                return null;
            }
        };
        return new EmbeddingService(none, properties, "test-model");
    }

    /** Index with production chunking defaults (used by the retrieval eval). */
    public static KnowledgeIndexService buildIndex(String docPaths) {
        return buildIndex(docPaths, bm25OnlyProperties());
    }

    public static KnowledgeIndexService buildIndex(String docPaths, KnowledgeIndexProperties properties) {
        MarkdownParser parser = new MarkdownParser();
        DocumentRepository repository = new DocumentRepository(docPaths, parser);
        KnowledgeIndexService index = new KnowledgeIndexService(
                repository, new SectionChunker(parser, properties), disabledEmbeddings(properties));
        index.rebuild();
        return index;
    }
}
