package org.example.spring_ai.vector;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Stream;

import org.springframework.ai.document.Document;
import org.springframework.ai.reader.TextReader;
import org.springframework.ai.transformer.splitter.TextSplitter;
import org.springframework.ai.transformer.splitter.TokenTextSplitter;
import org.springframework.ai.vectorstore.VectorStore;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.io.FileSystemResource;
import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

/**
 * Service for indexing domain documents into the vector store.
 * Automatically indexes documents on application startup if enabled.
 */
@Slf4j
@Service
@ConditionalOnProperty(name = "vector.store.enabled", havingValue = "true", matchIfMissing = false)
public class DocumentIndexerService {

    private final VectorStore vectorStore;
    private final List<Path> baseDirs;
    private final int chunkSize;
    private final int chunkOverlap;
    private final boolean autoIndexOnStartup;

    public DocumentIndexerService(
            VectorStore vectorStore,
            @Value("${domain.docs.paths:oms/specs}") String paths,
            @Value("${vector.store.chunk-size:1000}") int chunkSize,
            @Value("${vector.store.chunk-overlap:200}") int chunkOverlap,
            @Value("${vector.store.auto-index-on-startup:true}") boolean autoIndexOnStartup) {
        
        this.vectorStore = vectorStore;
        this.chunkSize = chunkSize;
        this.chunkOverlap = chunkOverlap;
        this.autoIndexOnStartup = autoIndexOnStartup;
        
        // Parse base directories
        this.baseDirs = new ArrayList<>();
        for (String part : paths.split(",")) {
            String trimmed = part.trim();
            if (!trimmed.isEmpty()) {
                Path p = Paths.get(trimmed).toAbsolutePath().normalize();
                if (Files.exists(p)) {
                    baseDirs.add(p);
                }
            }
        }
        
        log.info("[Vector] DocumentIndexer configured:");
        log.info("  - Base dirs: {}", baseDirs);
        log.info("  - Chunk size: {}", chunkSize);
        log.info("  - Chunk overlap: {}", chunkOverlap);
        log.info("  - Auto-index on startup: {}", autoIndexOnStartup);
    }

    /**
     * Auto-index documents on application startup if enabled.
     */
    @EventListener(ApplicationReadyEvent.class)
    public void autoIndexOnStartup() {
        if (autoIndexOnStartup) {
            log.info("[Vector] Auto-indexing enabled, starting document indexing...");
            try {
                indexAllDocuments();
            } catch (Exception e) {
                log.error("[Vector] Auto-indexing failed: {}", e.getMessage(), e);
            }
        } else {
            log.info("[Vector] Auto-indexing disabled, skipping initial indexing");
        }
    }

    /**
     * Index all documents from configured base directories.
     */
    public void indexAllDocuments() {
        log.info("[Vector] Starting document indexing...");
        
        List<Document> allChunks = new ArrayList<>();
        int fileCount = 0;
        
        for (Path baseDir : baseDirs) {
            if (!Files.isDirectory(baseDir)) continue;
            
            try (Stream<Path> stream = Files.walk(baseDir)) {
                List<Path> docFiles = stream
                        .filter(Files::isRegularFile)
                        .filter(this::isDocFile)
                        .toList();
                
                log.info("[Vector] Found {} documents in {}", docFiles.size(), baseDir);
                
                for (Path filePath : docFiles) {
                    try {
                        List<Document> chunks = indexDocument(filePath, baseDir);
                        allChunks.addAll(chunks);
                        fileCount++;
                        log.debug("[Vector] Indexed {}: {} chunks", filePath.getFileName(), chunks.size());
                    } catch (Exception e) {
                        log.warn("[Vector] Failed to index {}: {}", filePath, e.getMessage());
                    }
                }
            } catch (IOException e) {
                log.warn("[Vector] Failed to walk directory {}: {}", baseDir, e.getMessage());
            }
        }
        
        if (!allChunks.isEmpty()) {
            log.info("[Vector] Adding {} chunks from {} files to vector store...", allChunks.size(), fileCount);
            vectorStore.add(allChunks);
            log.info("[Vector] ✅ Successfully indexed {} documents ({} chunks)", fileCount, allChunks.size());
        } else {
            log.warn("[Vector] No documents found to index");
        }
    }

    /**
     * Index a single document file.
     */
    private List<Document> indexDocument(Path filePath, Path baseDir) throws IOException {
        log.debug("[Vector] Indexing document: {}", filePath);
        
        // Read the document
        FileSystemResource resource = new FileSystemResource(filePath.toFile());
        TextReader textReader = new TextReader(resource);
        List<Document> documents = textReader.get();
        
        if (documents.isEmpty()) {
            log.warn("[Vector] No content extracted from {}", filePath);
            return List.of();
        }
        
        // Get the document
        Document doc = documents.get(0);
        
        // Add metadata
        String relativePath = baseDir.relativize(filePath).toString().replace('\\', '/');
        String baseName = baseDir.getFileName() == null ? baseDir.toString() : baseDir.getFileName().toString();
        String fullPath = baseName + "/" + relativePath;
        
        Map<String, Object> metadata = new HashMap<>(doc.getMetadata());
        metadata.put("source", fullPath);
        metadata.put("filename", filePath.getFileName().toString());
        metadata.put("path", relativePath);
        metadata.put("base_dir", baseName);
        
        try {
            metadata.put("file_size", Files.size(filePath));
            metadata.put("last_modified", Files.getLastModifiedTime(filePath).toString());
        } catch (IOException e) {
            log.debug("[Vector] Could not get file metadata: {}", e.getMessage());
        }
        
        // Create new document with metadata
        Document documentWithMetadata = new Document(doc.getText(), metadata);
        
        // Split into chunks
        TextSplitter splitter = new TokenTextSplitter(chunkSize, chunkOverlap, 5, 10000, true);
        List<Document> chunks = splitter.split(documentWithMetadata);
        
        // Add chunk metadata
        for (int i = 0; i < chunks.size(); i++) {
            chunks.get(i).getMetadata().put("chunk_index", i);
            chunks.get(i).getMetadata().put("total_chunks", chunks.size());
        }
        
        return chunks;
    }

    /**
     * Check if a file is a documentation file.
     */
    private boolean isDocFile(Path p) {
        String name = p.getFileName().toString().toLowerCase(Locale.ROOT);
        return name.endsWith(".md") || 
               name.endsWith(".markdown") || 
               name.endsWith(".txt") || 
               name.endsWith(".adoc");
    }

    /**
     * Clear all documents from the vector store and re-index.
     */
    public void reindexAllDocuments() {
        log.info("[Vector] Clearing vector store and re-indexing all documents...");
        // Note: Qdrant doesn't have a built-in delete all method in Spring AI
        // You may need to delete and recreate the collection via Qdrant client
        indexAllDocuments();
    }
}
