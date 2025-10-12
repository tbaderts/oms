package org.example.spring_ai.vector;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.ai.document.Document;
import org.springframework.ai.tool.annotation.Tool;
import org.springframework.ai.vectorstore.SearchRequest;
import org.springframework.ai.vectorstore.VectorStore;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import io.qdrant.client.QdrantClient;
import lombok.extern.slf4j.Slf4j;

/**
 * MCP tools for semantic search using vector embeddings.
 * Complements the keyword-based search in DomainDocsTools.
 */
@Slf4j
@Component
@ConditionalOnProperty(name = "vector.store.enabled", havingValue = "true", matchIfMissing = false)
public class SemanticSearchTools {

    private final VectorStore vectorStore;
    private final QdrantClient qdrantClient;
    private final String collectionName;

    public SemanticSearchTools(
            VectorStore vectorStore, 
            QdrantClient qdrantClient,
            @org.springframework.beans.factory.annotation.Value("${spring.ai.qdrant.collection-name}") String collectionName) {
        this.vectorStore = vectorStore;
        this.qdrantClient = qdrantClient;
        this.collectionName = collectionName;
        log.info("[MCP] SemanticSearchTools initialized with vector store");
    }

    /**
     * Perform semantic search across domain documents using vector embeddings.
     * This finds documents based on meaning, not just keyword matching.
     * 
     * @param query Natural language query describing what you're looking for
     * @param topK Number of most similar results to return (default: 5, max: 20)
     * @param similarityThreshold Minimum similarity score (0.0-1.0, default: 0.5)
     * @return List of semantically similar document chunks with metadata
     */
    @Tool(
        name = "semanticSearchDocs",
        description = "Semantic search across domain documents using vector embeddings. " +
                     "Finds documents based on meaning and context, not just keywords. " +
                     "Use this for natural language queries or when keyword search returns insufficient results. " +
                     "Default similarity threshold is 0.5 (lower = more results, higher = more precise)."
    )
    public List<SemanticSearchResult> semanticSearchDocs(
            String query, 
            Integer topK, 
            Double similarityThreshold) {
        
        if (!StringUtils.hasText(query)) {
            log.warn("[MCP] semanticSearchDocs called with empty query");
            return List.of();
        }

        int k = (topK == null || topK <= 0) ? 5 : Math.min(topK, 20);
        double threshold = (similarityThreshold == null || similarityThreshold < 0) 
                ? 0.5  // Lowered from 0.7 to 0.5 for better recall
                : Math.min(similarityThreshold, 1.0);

        log.info("[MCP] semanticSearchDocs: query='{}', topK={}, threshold={}", query, k, threshold);

        try {
            // Perform similarity search  
            SearchRequest searchRequest = SearchRequest.builder()
                    .query(query)
                    .topK(k)
                    .similarityThreshold(threshold)
                    .build();
            
            List<Document> results = vectorStore.similaritySearch(searchRequest);
            
            log.info("[MCP] semanticSearchDocs returned {} results", results.size());
            
            // Log similarity scores for debugging
            if (results.isEmpty()) {
                log.warn("[MCP] No results found. Try lowering the similarity threshold (current: {})", threshold);
            } else {
                for (int i = 0; i < Math.min(3, results.size()); i++) {
                    Document doc = results.get(i);
                    Object scoreObj = doc.getMetadata().get("distance");
                    log.debug("[MCP] Result {}: filename={}, score={}", 
                            i + 1, 
                            doc.getMetadata().get("filename"), 
                            scoreObj);
                }
            }
            
            // Convert to result objects
            return results.stream()
                    .map(this::toSearchResult)
                    .collect(Collectors.toList());
            
        } catch (Exception e) {
            log.error("[MCP] semanticSearchDocs failed: {}", e.getMessage(), e);
            throw new SemanticSearchException("Semantic search failed: " + e.getMessage(), e);
        }
    }

    /**
     * Get embedding statistics and vector store information.
     */
    @Tool(
        name = "getVectorStoreInfo",
        description = "Get information about the vector store including number of indexed documents and configuration."
    )
    public VectorStoreInfo getVectorStoreInfo() {
        log.info("[MCP] getVectorStoreInfo called");
        
        try {
            // Get collection info from Qdrant
            var collectionInfo = qdrantClient.getCollectionInfoAsync(collectionName).get();
            
            // Extract statistics
            long pointsCount = collectionInfo.getPointsCount();
            long vectorsCount = collectionInfo.getVectorsCount();
            long segmentsCount = collectionInfo.getSegmentsCount();
            String status = collectionInfo.getStatus().name();
            
            // Get optimizer status
            var optimizerStatus = collectionInfo.getOptimizerStatus();
            boolean indexing = optimizerStatus.getOk();
            
            // Get vector config
            var vectorsConfig = collectionInfo.getConfig().getParams().getVectorsConfig();
            long vectorSize = 0L;
            String distance = "unknown";
            
            if (vectorsConfig.hasParams()) {
                vectorSize = vectorsConfig.getParams().getSize();
                distance = vectorsConfig.getParams().getDistance().name();
            }
            
            log.info("[MCP] Vector store stats: points={}, vectors={}, segments={}, status={}", 
                    pointsCount, vectorsCount, segmentsCount, status);
            
            return new VectorStoreInfo(
                "Qdrant",
                collectionName,
                status,
                pointsCount,
                vectorsCount,
                segmentsCount,
                vectorSize,
                distance,
                indexing,
                "Vector store is operational with " + pointsCount + " indexed vectors"
            );
            
        } catch (Exception e) {
            log.error("[MCP] getVectorStoreInfo failed: {}", e.getMessage(), e);
            return new VectorStoreInfo(
                "Qdrant",
                collectionName,
                "ERROR",
                0L,
                0L,
                0L,
                0L,
                "unknown",
                false,
                "Error retrieving stats: " + e.getMessage()
            );
        }
    }

    /**
     * Convert Document to SemanticSearchResult with extracted metadata.
     */
    private SemanticSearchResult toSearchResult(Document doc) {
        String source = doc.getMetadata().getOrDefault("source", "unknown").toString();
        String filename = doc.getMetadata().getOrDefault("filename", "unknown").toString();
        
        Integer chunkIndex = null;
        Integer totalChunks = null;
        Double score = null;
        
        try {
            Object chunkIdxObj = doc.getMetadata().get("chunk_index");
            Object totalChunksObj = doc.getMetadata().get("total_chunks");
            Object scoreObj = doc.getMetadata().get("distance");
            
            if (chunkIdxObj != null) chunkIndex = Integer.parseInt(chunkIdxObj.toString());
            if (totalChunksObj != null) totalChunks = Integer.parseInt(totalChunksObj.toString());
            if (scoreObj != null) {
                score = Double.parseDouble(scoreObj.toString());
                log.debug("[MCP] Document score: {} for {}", score, filename);
            }
        } catch (NumberFormatException e) {
            log.debug("Could not parse chunk metadata: {}", e.getMessage());
        }
        
        // Create snippet (first 300 chars)
        String content = doc.getText();
        String snippet = content.length() <= 300 
                ? content 
                : content.substring(0, 300) + "...";
        
        // Add score to metadata if available
        Map<String, Object> enrichedMetadata = new HashMap<>(doc.getMetadata());
        if (score != null) {
            enrichedMetadata.put("similarity_score", score);
        }
        
        return new SemanticSearchResult(
            source,
            filename,
            snippet,
            content,
            chunkIndex,
            totalChunks,
            enrichedMetadata
        );
    }

    /**
     * Result object for semantic search.
     */
    public record SemanticSearchResult(
        String source,
        String filename,
        String snippet,
        String fullContent,
        Integer chunkIndex,
        Integer totalChunks,
        java.util.Map<String, Object> metadata
    ) {}

    /**
     * Vector store information.
     */
    public record VectorStoreInfo(
        String type,
        String collectionName,
        String status,
        Long pointsCount,
        Long vectorsCount,
        Long segmentsCount,
        Long vectorSize,
        String distanceMetric,
        Boolean indexing,
        String notes
    ) {}

    /**
     * Exception for semantic search failures.
     */
    public static class SemanticSearchException extends RuntimeException {
        public SemanticSearchException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
