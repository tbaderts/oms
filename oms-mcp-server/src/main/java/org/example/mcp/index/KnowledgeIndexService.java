package org.example.mcp.index;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

import org.apache.lucene.analysis.Analyzer;
import org.apache.lucene.analysis.en.EnglishAnalyzer;
import org.apache.lucene.document.Document;
import org.apache.lucene.document.Field;
import org.apache.lucene.document.KnnFloatVectorField;
import org.apache.lucene.document.StoredField;
import org.apache.lucene.document.StringField;
import org.apache.lucene.document.TextField;
import org.apache.lucene.index.DirectoryReader;
import org.apache.lucene.index.IndexWriter;
import org.apache.lucene.index.IndexWriterConfig;
import org.apache.lucene.index.Term;
import org.apache.lucene.index.VectorSimilarityFunction;
import org.apache.lucene.search.BooleanClause;
import org.apache.lucene.search.BooleanQuery;
import org.apache.lucene.search.BoostQuery;
import org.apache.lucene.search.IndexSearcher;
import org.apache.lucene.search.KnnFloatVectorQuery;
import org.apache.lucene.search.Query;
import org.apache.lucene.search.ScoreDoc;
import org.apache.lucene.search.TermQuery;
import org.apache.lucene.search.TopDocs;
import org.apache.lucene.search.similarities.BM25Similarity;
import org.apache.lucene.store.ByteBuffersDirectory;
import org.apache.lucene.store.Directory;
import org.apache.lucene.util.QueryBuilder;
import org.example.mcp.docs.DocumentRepository;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

/**
 * Embedded Lucene index over the knowledge base.
 *
 * Section-granular hybrid retrieval:
 * <ul>
 *   <li><b>BM25</b> keyword search (EnglishAnalyzer: tokenization, stemming,
 *       stopwords) over section chunks, with the heading boosted.</li>
 *   <li><b>Vector</b> search (HNSW, cosine) over the same chunks when
 *       embeddings are available.</li>
 *   <li><b>Reciprocal Rank Fusion</b> (k=60) combines both ranked lists;
 *       ranks, not raw scores, so BM25 and cosine never need to be
 *       comparable.</li>
 * </ul>
 *
 * The index lives in memory and is rebuilt from the knowledge base at startup;
 * embeddings are cached on disk by content hash, so unchanged sections are
 * never re-embedded (see {@link EmbeddingService}).
 */
@Slf4j
@Service
public class KnowledgeIndexService {

    private static final int RRF_K = 60;
    private static final String FIELD_BODY = "body";
    private static final String FIELD_TITLE = "title";
    private static final String FIELD_VECTOR = "vector";
    private static final String FIELD_CATEGORY_FILTER = "category_f";
    private static final String FIELD_STATUS_FILTER = "status_f";

    private final DocumentRepository documentRepository;
    private final SectionChunker sectionChunker;
    private final EmbeddingService embeddingService;
    private final Analyzer analyzer = new EnglishAnalyzer();

    private volatile Snapshot snapshot;

    /** Immutable view of one index generation. */
    private record Snapshot(Directory directory, DirectoryReader reader, IndexSearcher searcher,
                            IndexStats stats) {
    }

    public KnowledgeIndexService(DocumentRepository documentRepository,
                                 SectionChunker sectionChunker,
                                 EmbeddingService embeddingService) {
        this.documentRepository = documentRepository;
        this.sectionChunker = sectionChunker;
        this.embeddingService = embeddingService;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void onStartup() {
        try {
            rebuild();
        } catch (Exception e) {
            log.error("[Index] Failed to build knowledge index: {}", e.getMessage(), e);
        }
    }

    /** (Re)build the index from the knowledge base. Safe to call at any time. */
    public synchronized IndexStats rebuild() {
        long startNanos = System.nanoTime();
        List<Path> files = documentRepository.findAllDocFiles();
        List<SectionChunk> chunks = new ArrayList<>();
        long totalBytes = 0;
        for (Path file : files) {
            String path = documentRepository.relativize(file);
            try {
                String content = documentRepository.readContent(path);
                totalBytes += content.getBytes(java.nio.charset.StandardCharsets.UTF_8).length;
                chunks.addAll(sectionChunker.chunk(path, content));
            } catch (Exception e) {
                log.warn("[Index] Skipping {}: {}", path, e.getMessage());
            }
        }

        Optional<List<float[]>> vectors = embeddingService.embedDocuments(
                chunks.stream().map(SectionChunk::text).toList());
        int dims = vectors.filter(v -> !v.isEmpty()).map(v -> v.get(0).length).orElse(0);

        try {
            Directory directory = new ByteBuffersDirectory();
            IndexWriterConfig config = new IndexWriterConfig(analyzer);
            try (IndexWriter writer = new IndexWriter(directory, config)) {
                for (int i = 0; i < chunks.size(); i++) {
                    float[] vector = vectors.isPresent() ? vectors.get().get(i) : null;
                    writer.addDocument(toLuceneDoc(chunks.get(i), vector));
                }
            }
            DirectoryReader reader = DirectoryReader.open(directory);
            IndexSearcher searcher = new IndexSearcher(reader);
            searcher.setSimilarity(new BM25Similarity());

            IndexStats stats = new IndexStats(files.size(), chunks.size(), totalBytes,
                    Instant.now().toString(), vectors.isPresent(),
                    vectors.isPresent() ? embeddingService.getModelName() : null, dims);

            Snapshot old = this.snapshot;
            this.snapshot = new Snapshot(directory, reader, searcher, stats);
            closeQuietly(old);

            log.info("[Index] Indexed {} documents as {} section chunks in {} ms (vector search: {})",
                    files.size(), chunks.size(), (System.nanoTime() - startNanos) / 1_000_000,
                    vectors.isPresent() ? "enabled, " + dims + "-dim " + embeddingService.getModelName()
                                        : "disabled, BM25 only");
            return stats;
        } catch (IOException e) {
            throw new UncheckedIOException("Failed to build Lucene index", e);
        }
    }

    public boolean isReady() {
        return snapshot != null;
    }

    public IndexStats getStats() {
        Snapshot snap = snapshot;
        return snap == null
                ? new IndexStats(0, 0, 0, null, false, null, 0)
                : snap.stats();
    }

    /** Which retrievers participate in a search. */
    public enum SearchMode { HYBRID, KEYWORD, SEMANTIC }

    /**
     * Hybrid search: BM25 + vector retrieval fused with Reciprocal Rank
     * Fusion, de-duplicated by citation (one hit per section).
     */
    public SearchResponse search(String query, int topK, String category, String status) {
        return search(query, topK, category, status, SearchMode.HYBRID);
    }

    public SearchResponse search(String query, int topK, String category, String status, SearchMode mode) {
        Snapshot snap = snapshot;
        if (snap == null) {
            return new SearchResponse(List.of(), 0, false);
        }
        int candidates = Math.max(50, topK * 10);
        Query filter = buildFilter(category, status);

        List<ScoreDoc> keywordDocs = mode == SearchMode.SEMANTIC
                ? List.of() : searchBm25(snap.searcher(), query, filter, candidates);
        List<ScoreDoc> vectorDocs = mode == SearchMode.KEYWORD
                ? List.of() : searchVector(snap.searcher(), query, filter, candidates);

        // Reciprocal Rank Fusion over Lucene doc ids
        Map<Integer, Fused> fused = new LinkedHashMap<>();
        for (int rank = 0; rank < keywordDocs.size(); rank++) {
            Fused f = fused.computeIfAbsent(keywordDocs.get(rank).doc, d -> new Fused());
            f.score += 1.0 / (RRF_K + rank + 1);
            f.keywordRank = rank + 1;
        }
        for (int rank = 0; rank < vectorDocs.size(); rank++) {
            Fused f = fused.computeIfAbsent(vectorDocs.get(rank).doc, d -> new Fused());
            f.score += 1.0 / (RRF_K + rank + 1);
            f.vectorRank = rank + 1;
        }

        // Resolve stored fields, de-duplicate by citation keeping the best chunk
        Map<String, SearchHit> byCitation = new HashMap<>();
        try {
            var storedFields = snap.searcher().storedFields();
            for (Map.Entry<Integer, Fused> entry : fused.entrySet()) {
                Document doc = storedFields.document(entry.getKey());
                SearchHit hit = toHit(doc, entry.getValue());
                byCitation.merge(hit.citation(), hit,
                        (a, b) -> a.score() >= b.score() ? a : b);
            }
        } catch (IOException e) {
            throw new UncheckedIOException("Failed to read search results", e);
        }

        List<SearchHit> hits = new ArrayList<>(byCitation.values());
        hits.sort(Comparator.comparingDouble(SearchHit::score).reversed()
                .thenComparing(SearchHit::citation));
        int totalMatches = hits.size();
        if (hits.size() > topK) {
            hits = new ArrayList<>(hits.subList(0, topK));
        }
        return new SearchResponse(hits, totalMatches, !vectorDocs.isEmpty());
    }

    // ----- internals -----

    private List<ScoreDoc> searchBm25(IndexSearcher searcher, String query, Query filter, int n) {
        QueryBuilder builder = new QueryBuilder(analyzer);
        Query bodyQuery = builder.createBooleanQuery(FIELD_BODY, query);
        Query titleQuery = builder.createBooleanQuery(FIELD_TITLE, query);
        if (bodyQuery == null && titleQuery == null) {
            return List.of();
        }
        BooleanQuery.Builder text = new BooleanQuery.Builder();
        if (bodyQuery != null) text.add(bodyQuery, BooleanClause.Occur.SHOULD);
        if (titleQuery != null) text.add(new BoostQuery(titleQuery, 2.0f), BooleanClause.Occur.SHOULD);

        BooleanQuery.Builder full = new BooleanQuery.Builder();
        full.add(text.build(), BooleanClause.Occur.MUST);
        if (filter != null) full.add(filter, BooleanClause.Occur.FILTER);

        try {
            TopDocs topDocs = searcher.search(full.build(), n);
            return List.of(topDocs.scoreDocs);
        } catch (IOException e) {
            throw new UncheckedIOException("BM25 search failed", e);
        }
    }

    private List<ScoreDoc> searchVector(IndexSearcher searcher, String query, Query filter, int n) {
        if (!getStats().vectorSearchEnabled()) {
            return List.of();
        }
        Optional<float[]> queryVector = embeddingService.embedQuery(query);
        if (queryVector.isEmpty()) {
            return List.of();
        }
        Query knn = filter == null
                ? new KnnFloatVectorQuery(FIELD_VECTOR, queryVector.get(), n)
                : new KnnFloatVectorQuery(FIELD_VECTOR, queryVector.get(), n, filter);
        try {
            TopDocs topDocs = searcher.search(knn, n);
            return List.of(topDocs.scoreDocs);
        } catch (IOException e) {
            throw new UncheckedIOException("Vector search failed", e);
        }
    }

    private static Query buildFilter(String category, String status) {
        BooleanQuery.Builder builder = new BooleanQuery.Builder();
        boolean any = false;
        if (category != null && !category.isBlank()) {
            builder.add(new TermQuery(new Term(FIELD_CATEGORY_FILTER,
                    category.trim().toLowerCase(Locale.ROOT))), BooleanClause.Occur.FILTER);
            any = true;
        }
        if (status != null && !status.isBlank()) {
            builder.add(new TermQuery(new Term(FIELD_STATUS_FILTER,
                    status.trim().toLowerCase(Locale.ROOT))), BooleanClause.Occur.FILTER);
            any = true;
        }
        return any ? builder.build() : null;
    }

    private static Document toLuceneDoc(SectionChunk chunk, float[] vector) {
        Document doc = new Document();
        doc.add(new StringField("path", chunk.path(), Field.Store.YES));
        doc.add(new StoredField("anchor", chunk.anchor()));
        doc.add(new StoredField("breadcrumb", chunk.breadcrumb()));
        doc.add(new TextField(FIELD_TITLE, chunk.breadcrumb(), Field.Store.NO));
        doc.add(new TextField(FIELD_BODY, chunk.text(), Field.Store.NO));
        doc.add(new StoredField("text", chunk.text()));
        doc.add(new StoredField("titleStored", chunk.title()));
        doc.add(new StoredField("startLine", chunk.startLine()));
        doc.add(new StoredField("endLine", chunk.endLine()));
        if (chunk.category() != null) {
            doc.add(new StringField(FIELD_CATEGORY_FILTER,
                    chunk.category().toLowerCase(Locale.ROOT), Field.Store.NO));
            doc.add(new StoredField("category", chunk.category()));
        }
        if (chunk.status() != null) {
            doc.add(new StringField(FIELD_STATUS_FILTER,
                    chunk.status().toLowerCase(Locale.ROOT), Field.Store.NO));
            doc.add(new StoredField("status", chunk.status()));
        }
        if (vector != null) {
            doc.add(new KnnFloatVectorField(FIELD_VECTOR, vector, VectorSimilarityFunction.COSINE));
        }
        return doc;
    }

    private static SearchHit toHit(Document doc, Fused fused) {
        String path = doc.get("path");
        String anchor = doc.get("anchor");
        String citation = anchor == null || anchor.isEmpty() ? path : path + "#" + anchor;
        return new SearchHit(
                path,
                anchor,
                citation,
                doc.get("breadcrumb"),
                doc.get("titleStored"),
                intField(doc, "startLine"),
                intField(doc, "endLine"),
                doc.get("text"),
                doc.get("category"),
                doc.get("status"),
                fused.score,
                fused.keywordRank,
                fused.vectorRank);
    }

    private static int intField(Document doc, String name) {
        var field = doc.getField(name);
        return field == null || field.numericValue() == null ? 0 : field.numericValue().intValue();
    }

    private static void closeQuietly(Snapshot snapshot) {
        if (snapshot == null) return;
        try {
            snapshot.reader().close();
            snapshot.directory().close();
        } catch (IOException e) {
            log.debug("[Index] Error closing previous index generation: {}", e.getMessage());
        }
    }

    private static final class Fused {
        double score;
        Integer keywordRank;
        Integer vectorRank;
    }

    // ----- result types -----

    public record SearchHit(String path, String anchor, String citation, String breadcrumb,
                            String title, int startLine, int endLine, String text,
                            String category, String status,
                            double score, Integer keywordRank, Integer vectorRank) {
    }

    public record SearchResponse(List<SearchHit> hits, int totalMatches, boolean usedVectorSearch) {
    }

    public record IndexStats(int documentCount, int chunkCount, long totalBytes, String lastIndexedIso,
                             boolean vectorSearchEnabled, String embeddingModel, int vectorDimensions) {
    }
}
