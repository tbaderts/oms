package org.example.mcp.kbexplorer;

import java.util.List;

import org.example.mcp.docs.DocumentRepository;
import org.example.mcp.docs.DocumentRepository.DocContent;
import org.example.mcp.docs.DocumentRepository.DocMeta;
import org.example.mcp.docs.MarkdownParser;
import org.example.mcp.docs.MarkdownParser.DocSection;
import org.example.mcp.index.KnowledgeIndexService;
import org.example.mcp.index.KnowledgeIndexService.SearchHit;
import org.example.mcp.index.KnowledgeIndexService.SearchMode;
import org.example.mcp.index.KnowledgeIndexService.SearchResponse;
import org.springframework.context.annotation.Profile;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import lombok.extern.slf4j.Slf4j;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

/**
 * REST API for the OMS Knowledge Base Explorer web application
 * (oms-kb-explorer). Backed by the embedded Lucene knowledge index.
 *
 * The endpoint paths and response shapes are kept compatible with the
 * frontend's api.ts; scoring semantics changed with the move to
 * BM25 + RRF (scores are fused rank scores, not term counts).
 *
 * Only active with the 'local' Spring profile for development.
 */
@Slf4j
@Profile("local")
@RestController
@RequestMapping("/api/kb")
@CrossOrigin(origins = {"http://localhost:5173", "http://localhost:5174", "http://localhost:5175", "http://localhost:5176", "http://localhost:5177"})
public class KbExplorerController {

    private final DocumentRepository documentRepository;
    private final MarkdownParser markdownParser;
    private final KnowledgeIndexService index;

    public KbExplorerController(DocumentRepository documentRepository,
                                MarkdownParser markdownParser,
                                KnowledgeIndexService index) {
        this.documentRepository = documentRepository;
        this.markdownParser = markdownParser;
        this.index = index;
    }

    @GetMapping("/documents")
    public ResponseEntity<List<DocMeta>> listDocuments() {
        log.info("[KB Explorer] GET /api/kb/documents");
        return ResponseEntity.ok(documentRepository.listAll());
    }

    @GetMapping("/documents/read")
    public ResponseEntity<DocContent> readDocument(
            @RequestParam String path,
            @RequestParam(required = false) Integer offset,
            @RequestParam(required = false) Integer limit) {
        log.info("[KB Explorer] GET /api/kb/documents/read?path={}", path);
        String content = documentRepository.readContent(path);
        int length = content.length();
        int from = offset == null ? 0 : Math.clamp(offset, 0, length);
        int to = limit == null ? length : Math.clamp((long) from + Math.max(0, limit), from, length);
        return ResponseEntity.ok(new DocContent(path, content.substring(from, to), length, from, to));
    }

    @GetMapping("/documents/sections")
    public ResponseEntity<List<DocSection>> listSections(@RequestParam String path) {
        log.info("[KB Explorer] GET /api/kb/documents/sections?path={}", path);
        return ResponseEntity.ok(markdownParser.extractSections(documentRepository.readContent(path)));
    }

    @GetMapping("/search/keyword")
    public ResponseEntity<List<KeywordHit>> keywordSearch(
            @RequestParam String query,
            @RequestParam(required = false, defaultValue = "10") Integer topK,
            @RequestParam(required = false) String filterStatus,
            @RequestParam(required = false) String filterCategory) {
        log.info("[KB Explorer] GET /api/kb/search/keyword?query={}", query);
        SearchResponse response = index.search(query, topK, filterCategory, filterStatus, SearchMode.KEYWORD);
        List<KeywordHit> hits = response.hits().stream()
                .map(h -> new KeywordHit(h.path(), h.score(), snippet(h)))
                .toList();
        return ResponseEntity.ok(hits);
    }

    @GetMapping("/search/semantic")
    public Mono<ResponseEntity<List<HybridHit>>> semanticSearch(
            @RequestParam String query,
            @RequestParam(required = false, defaultValue = "10") Integer topK) {
        log.info("[KB Explorer] GET /api/kb/search/semantic?query={}", query);
        return Mono.fromCallable(() ->
                ResponseEntity.ok(toHybridHits(index.search(query, topK, null, null, SearchMode.SEMANTIC))))
                .subscribeOn(Schedulers.boundedElastic());
    }

    @GetMapping("/search/hybrid")
    public Mono<ResponseEntity<List<HybridHit>>> hybridSearch(
            @RequestParam String query,
            @RequestParam(required = false, defaultValue = "10") Integer topK,
            @RequestParam(required = false) Double keywordWeight,
            @RequestParam(required = false) Double semanticWeight) {
        // Weights are accepted for API compatibility but ignored:
        // Reciprocal Rank Fusion is weight-free by design.
        log.info("[KB Explorer] GET /api/kb/search/hybrid?query={}", query);
        return Mono.fromCallable(() ->
                ResponseEntity.ok(toHybridHits(index.search(query, topK, null, null, SearchMode.HYBRID))))
                .subscribeOn(Schedulers.boundedElastic());
    }

    @GetMapping("/health")
    public ResponseEntity<HealthResponse> health() {
        var stats = index.getStats();
        return ResponseEntity.ok(new HealthResponse("KB Explorer API is running", stats.documentCount()));
    }

    // ----- mapping helpers -----

    private static List<HybridHit> toHybridHits(SearchResponse response) {
        return response.hits().stream().map(h -> new HybridHit(
                h.path(),
                rrfContribution(h.keywordRank()),
                rrfContribution(h.vectorRank()),
                h.score(),
                snippet(h),
                matchType(h)))
                .toList();
    }

    private static double rrfContribution(Integer rank) {
        return rank == null ? 0.0 : 1.0 / (60 + rank);
    }

    private static String matchType(SearchHit hit) {
        if (hit.keywordRank() != null && hit.vectorRank() != null) return "hybrid";
        return hit.keywordRank() != null ? "keyword" : "semantic";
    }

    private static String snippet(SearchHit hit) {
        String text = hit.text().strip().replace('\n', ' ');
        String prefix = "[" + hit.breadcrumb() + "] ";
        int max = 240;
        if (prefix.length() + text.length() <= max) return prefix + text;
        return prefix + text.substring(0, Math.max(0, max - prefix.length())) + " …";
    }

    // ----- response records (shapes kept compatible with oms-kb-explorer) -----

    public record KeywordHit(String path, double score, String snippet) {}
    public record HybridHit(String path, double keywordScore, double semanticScore,
                            double hybridScore, String snippet, String matchType) {}
    public record HealthResponse(String status, int documentCount) {}
}
