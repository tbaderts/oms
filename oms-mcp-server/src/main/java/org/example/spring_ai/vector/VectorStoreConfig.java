package org.example.spring_ai.vector;

import org.springframework.ai.embedding.EmbeddingModel;
import org.springframework.ai.vectorstore.VectorStore;
import org.springframework.ai.vectorstore.qdrant.QdrantVectorStore;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import io.qdrant.client.QdrantClient;
import io.qdrant.client.QdrantGrpcClient;
import lombok.extern.slf4j.Slf4j;

/**
 * Configuration for vector store and embedding model.
 * Enables semantic search capabilities using Qdrant and Ollama.
 * 
 * Note: OllamaEmbeddingModel is auto-configured via Spring Boot properties.
 * We only need to configure the Qdrant VectorStore here.
 * 
 * This configuration explicitly disables Spring AI's QdrantVectorStoreAutoConfiguration
 * to avoid bean naming conflicts.
 */
@Slf4j
@Configuration
@ConditionalOnProperty(name = "vector.store.enabled", havingValue = "true", matchIfMissing = false)
@EnableAutoConfiguration(exclude = {
    org.springframework.ai.vectorstore.qdrant.autoconfigure.QdrantVectorStoreAutoConfiguration.class
})
public class VectorStoreConfig {

    @Value("${spring.ai.qdrant.base-url}")
    private String qdrantUrl;

    @Value("${spring.ai.qdrant.collection-name}")
    private String collectionName;

    @Value("${spring.ai.qdrant.initialize-schema:true}")
    private boolean initializeSchema;

    /**
     * Qdrant client for vector database operations.
     */
    @Bean
    public QdrantClient qdrantClient() {
        log.info("[Vector] Configuring Qdrant client: {}", qdrantUrl);
        
        // Extract host and port from URL
        String host = qdrantUrl.replace("http://", "").replace("https://", "").split(":")[0];
        int port = 6334; // gRPC port
        
        return new QdrantClient(
                QdrantGrpcClient.newBuilder(host, port, false)
                        .build()
        );
    }

    /**
     * Qdrant Vector Store for storing and retrieving document embeddings.
     * The EmbeddingModel is auto-configured by Spring Boot from application.yml
     */
    @Bean
    public VectorStore vectorStore(QdrantClient qdrantClient, EmbeddingModel embeddingModel) {
        log.info("[Vector] Configuring Qdrant vector store with collection: {}", collectionName);
        log.info("[Vector] Using embedding model: {}", embeddingModel.getClass().getSimpleName());
        
        return QdrantVectorStore.builder(qdrantClient, embeddingModel)
                .collectionName(collectionName)
                .initializeSchema(initializeSchema)
                .build();
    }
}
