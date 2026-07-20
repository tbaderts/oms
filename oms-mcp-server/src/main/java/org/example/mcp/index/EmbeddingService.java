package org.example.mcp.index;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.ai.embedding.EmbeddingModel;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import lombok.extern.slf4j.Slf4j;

/**
 * Embeddings for the knowledge index, via the auto-configured Ollama
 * {@link EmbeddingModel}.
 *
 * Responsibilities:
 * <ul>
 *   <li>Applies the model-specific instruction prefixes (query vs document) —
 *       retrieval-tuned models like nomic-embed-text and mxbai-embed-large are
 *       trained with them and underperform without.</li>
 *   <li>Caches document embeddings on disk keyed by content hash, so restarts
 *       only embed new or changed sections (incremental indexing).</li>
 *   <li>Degrades gracefully: if Ollama is unreachable or disabled, the index
 *       falls back to BM25-only and search keeps working.</li>
 * </ul>
 */
@Slf4j
@Service
public class EmbeddingService {

    private final ObjectProvider<EmbeddingModel> embeddingModelProvider;
    private final KnowledgeIndexProperties properties;
    private final String modelName;
    private final ObjectMapper objectMapper = new ObjectMapper();

    private final Map<String, float[]> cache = new HashMap<>();
    private boolean cacheDirty = false;
    private volatile boolean unavailable = false;

    public EmbeddingService(ObjectProvider<EmbeddingModel> embeddingModelProvider,
                            KnowledgeIndexProperties properties,
                            @Value("${spring.ai.ollama.embedding.options.model:unknown}") String modelName) {
        this.embeddingModelProvider = embeddingModelProvider;
        this.properties = properties;
        this.modelName = modelName;
    }

    public boolean isEnabled() {
        return properties.getEmbeddings().isEnabled()
                && !unavailable
                && embeddingModelProvider.getIfAvailable() != null;
    }

    public String getModelName() {
        return modelName;
    }

    /**
     * Embed document chunks, serving unchanged chunks from the disk cache.
     *
     * @return embeddings parallel to {@code texts}, or empty if embeddings are
     *         disabled/unavailable
     */
    public Optional<List<float[]>> embedDocuments(List<String> texts) {
        if (!isEnabled()) return Optional.empty();
        loadCacheIfNeeded();

        String prefix = properties.getEmbeddings().getDocumentPrefix();
        List<float[]> result = new ArrayList<>(texts.size());
        List<Integer> missingIndexes = new ArrayList<>();
        List<String> missingKeys = new ArrayList<>();

        for (String text : texts) {
            String key = cacheKey(prefix, text);
            float[] cached = cache.get(key);
            result.add(cached); // may be null, filled below
            if (cached == null) {
                missingIndexes.add(result.size() - 1);
                missingKeys.add(key);
            }
        }

        if (!missingIndexes.isEmpty()) {
            log.info("[Index] Embedding {} new/changed chunks ({} from cache) with model '{}'",
                    missingIndexes.size(), texts.size() - missingIndexes.size(), modelName);
            int batchSize = Math.max(1, properties.getEmbeddings().getBatchSize());
            try {
                EmbeddingModel model = embeddingModelProvider.getObject();
                for (int from = 0; from < missingIndexes.size(); from += batchSize) {
                    int to = Math.min(from + batchSize, missingIndexes.size());
                    List<String> batch = new ArrayList<>();
                    for (int i = from; i < to; i++) {
                        batch.add(prefix + texts.get(missingIndexes.get(i)));
                    }
                    List<float[]> embedded = model.embed(batch);
                    for (int i = from; i < to; i++) {
                        float[] vector = embedded.get(i - from);
                        result.set(missingIndexes.get(i), vector);
                        cache.put(missingKeys.get(i), vector);
                        cacheDirty = true;
                    }
                }
            } catch (Exception e) {
                log.warn("[Index] Embedding failed ({}). Falling back to BM25-only search. "
                        + "Is Ollama running with model '{}' pulled?", e.getMessage(), modelName);
                unavailable = true;
                return Optional.empty();
            }
        }
        saveCacheIfDirty();
        return Optional.of(result);
    }

    /** Embed a search query with the query instruction prefix (not cached). */
    public Optional<float[]> embedQuery(String query) {
        if (!isEnabled()) return Optional.empty();
        try {
            EmbeddingModel model = embeddingModelProvider.getObject();
            return Optional.of(model.embed(properties.getEmbeddings().getQueryPrefix() + query));
        } catch (Exception e) {
            log.warn("[Index] Query embedding failed ({}). Falling back to BM25-only.", e.getMessage());
            unavailable = true;
            return Optional.empty();
        }
    }

    // ----- disk cache -----

    private Path cacheFile() {
        return Paths.get(properties.getCacheDir()).resolve("embedding-cache-" + sanitize(modelName) + ".json");
    }

    private boolean cacheLoaded = false;

    private synchronized void loadCacheIfNeeded() {
        if (cacheLoaded) return;
        cacheLoaded = true;
        Path file = cacheFile();
        if (!Files.exists(file)) return;
        try {
            Map<String, float[]> loaded = objectMapper.readValue(
                    Files.readAllBytes(file), new TypeReference<HashMap<String, float[]>>() {});
            cache.putAll(loaded);
            log.info("[Index] Loaded {} cached embeddings from {}", cache.size(), file);
        } catch (IOException e) {
            log.warn("[Index] Could not read embedding cache {} ({}); re-embedding everything.",
                    file, e.getMessage());
        }
    }

    private synchronized void saveCacheIfDirty() {
        if (!cacheDirty) return;
        Path file = cacheFile();
        try {
            Files.createDirectories(file.getParent());
            objectMapper.writeValue(file.toFile(), cache);
            cacheDirty = false;
            log.debug("[Index] Saved {} embeddings to {}", cache.size(), file);
        } catch (IOException e) {
            log.warn("[Index] Could not persist embedding cache to {}: {}", file, e.getMessage());
        }
    }

    private String cacheKey(String prefix, String text) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            digest.update(modelName.getBytes(StandardCharsets.UTF_8));
            digest.update((byte) 0);
            digest.update(prefix.getBytes(StandardCharsets.UTF_8));
            digest.update((byte) 0);
            digest.update(text.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest.digest());
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 not available", e);
        }
    }

    private static String sanitize(String name) {
        return name.replaceAll("[^a-zA-Z0-9._-]", "_");
    }
}
