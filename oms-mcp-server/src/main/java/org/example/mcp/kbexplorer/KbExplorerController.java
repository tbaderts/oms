package org.example.mcp.kbexplorer;

import java.util.List;

import org.example.mcp.docs.DocumentRepository.DocContent;
import org.example.mcp.docs.DocumentRepository.DocMeta;
import org.example.mcp.docs.DomainDocsTools;
import org.example.mcp.docs.DomainDocsTools.HybridSearchHit;
import org.example.mcp.docs.DomainDocsTools.SearchHit;
import org.example.mcp.docs.DomainDocsTools.SectionSearchHit;
import org.example.mcp.docs.MarkdownParser.DocSection;
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
 * REST API controller for the OMS Knowledge Base Explorer web application.
 *
 * Provides HTTP endpoints for:
 * - Listing documents with metadata
 * - Reading document content
 * - Navigating document sections
 * - Searching documents (keyword, semantic, and hybrid modes)
 *
 * Only active with the 'local' Spring profile for development.
 */
@Slf4j
@Profile("local")
@RestController
@RequestMapping("/api/kb")
@CrossOrigin(origins = {"http://localhost:5173", "http://localhost:5174", "http://localhost:5175", "http://localhost:5176", "http://localhost:5177"})
public class KbExplorerController {

    private final DomainDocsTools domainDocsTools;

    public KbExplorerController(DomainDocsTools domainDocsTools) {
        this.domainDocsTools = domainDocsTools;
    }

    /**
     * List all available documents with metadata.
     *
     * GET /api/kb/documents
     *
     * @return list of document metadata including path, name, size, timestamps,
     *         version, status, and category
     */
    @GetMapping("/documents")
    public ResponseEntity<List<DocMeta>> listDocuments() {
        log.info("[KB Explorer] GET /api/kb/documents");
        List<DocMeta> documents = domainDocsTools.listDomainDocs();
        return ResponseEntity.ok(documents);
    }

    /**
     * Read the content of a specific document.
     *
     * GET /api/kb/documents/read?path={path}&offset={offset}&limit={limit}
     *
     * @param path relative path to the document (e.g., "oms-knowledge-base/oms-concepts/order-lifecycle.md")
     * @param offset starting character position (optional, default 0)
     * @param limit maximum number of characters to return (optional, returns entire document if not specified)
     * @return document content with metadata
     */
    @GetMapping("/documents/read")
    public ResponseEntity<DocContent> readDocument(
            @RequestParam String path,
            @RequestParam(required = false) Integer offset,
            @RequestParam(required = false) Integer limit) {
        log.info("[KB Explorer] GET /api/kb/documents/read?path={}&offset={}&limit={}", path, offset, limit);
        DocContent content = domainDocsTools.readDomainDoc(path, offset, limit);
        return ResponseEntity.ok(content);
    }

    /**
     * List all sections/headings in a document for table of contents navigation.
     *
     * GET /api/kb/documents/sections?path={path}
     *
     * @param path relative path to the document
     * @return list of document sections with title, level, and line number
     */
    @GetMapping("/documents/sections")
    public ResponseEntity<List<DocSection>> listSections(@RequestParam String path) {
        log.info("[KB Explorer] GET /api/kb/documents/sections?path={}", path);
        List<DocSection> sections = domainDocsTools.listDocSections(path);
        return ResponseEntity.ok(sections);
    }

    /**
     * Search documents using keyword-based search.
     *
     * GET /api/kb/search/keyword?query={query}&topK={topK}&filterStatus={status}&filterCategory={category}
     *
     * @param query search query string
     * @param topK maximum number of results (optional, default 10)
     * @param filterStatus filter by document status (optional, e.g., "Complete", "Draft")
     * @param filterCategory filter by document category (optional)
     * @return list of search hits with path, score, and snippet
     */
    @GetMapping("/search/keyword")
    public ResponseEntity<List<SearchHit>> keywordSearch(
            @RequestParam String query,
            @RequestParam(required = false, defaultValue = "10") Integer topK,
            @RequestParam(required = false) String filterStatus,
            @RequestParam(required = false) String filterCategory) {
        log.info("[KB Explorer] GET /api/kb/search/keyword?query={}&topK={}&filterStatus={}&filterCategory={}",
                 query, topK, filterStatus, filterCategory);
        List<SearchHit> results = domainDocsTools.searchDomainDocs(query, topK, filterStatus, filterCategory);
        return ResponseEntity.ok(results);
    }

    /**
     * Search within document sections for more precise results.
     *
     * GET /api/kb/search/sections?query={query}&topK={topK}
     *
     * @param query search query string
     * @param topK maximum number of results (optional, default 10)
     * @return list of section search hits with path, section title, level, score, and snippet
     */
    @GetMapping("/search/sections")
    public ResponseEntity<List<SectionSearchHit>> sectionSearch(
            @RequestParam String query,
            @RequestParam(required = false, defaultValue = "10") Integer topK) {
        log.info("[KB Explorer] GET /api/kb/search/sections?query={}&topK={}", query, topK);
        List<SectionSearchHit> results = domainDocsTools.searchDocSections(query, topK);
        return ResponseEntity.ok(results);
    }

    /**
     * Semantic search using AI embeddings for meaning-based search.
     *
     * GET /api/kb/search/semantic?query={query}&topK={topK}
     *
     * @param query search query string
     * @param topK maximum number of results (optional, default 10)
     * @return list of hybrid search hits (100% semantic weight)
     *
     * NOTE: This method returns Mono to handle blocking I/O operations
     * on a separate thread pool (boundedElastic) to avoid blocking the reactive event loop.
     */
    @GetMapping("/search/semantic")
    public Mono<ResponseEntity<List<HybridSearchHit>>> semanticSearch(
            @RequestParam String query,
            @RequestParam(required = false, defaultValue = "10") Integer topK) {
        log.info("[KB Explorer] GET /api/kb/search/semantic?query={}&topK={}", query, topK);

        // Call hybrid search with 100% semantic weight (0% keyword)
        return Mono.fromCallable(() -> {
            List<HybridSearchHit> results = domainDocsTools.hybridSearchDocs(query, topK, 0.0, 1.0);
            return ResponseEntity.ok(results);
        }).subscribeOn(Schedulers.boundedElastic());
    }

    /**
     * Hybrid search combining keyword and semantic search for best results.
     *
     * GET /api/kb/search/hybrid?query={query}&topK={topK}&keywordWeight={kw}&semanticWeight={sw}
     *
     * @param query search query string
     * @param topK maximum number of results (optional, default 10)
     * @param keywordWeight weight for keyword scoring (optional, default 0.4, range 0.0-1.0)
     * @param semanticWeight weight for semantic scoring (optional, default 0.6, range 0.0-1.0)
     * @return list of hybrid search hits with both keyword and semantic scores, plus combined score
     *
     * NOTE: This method returns Mono to handle blocking I/O operations (semantic search)
     * on a separate thread pool (boundedElastic) to avoid blocking the reactive event loop.
     */
    @GetMapping("/search/hybrid")
    public Mono<ResponseEntity<List<HybridSearchHit>>> hybridSearch(
            @RequestParam String query,
            @RequestParam(required = false, defaultValue = "10") Integer topK,
            @RequestParam(required = false) Double keywordWeight,
            @RequestParam(required = false) Double semanticWeight) {
        log.info("[KB Explorer] GET /api/kb/search/hybrid?query={}&topK={}&keywordWeight={}&semanticWeight={}",
                 query, topK, keywordWeight, semanticWeight);

        // Wrap the blocking call in Mono.fromCallable and schedule on boundedElastic
        // This prevents blocking the reactive event loop threads
        return Mono.fromCallable(() -> {
            List<HybridSearchHit> results = domainDocsTools.hybridSearchDocs(query, topK, keywordWeight, semanticWeight);
            return ResponseEntity.ok(results);
        }).subscribeOn(Schedulers.boundedElastic());
    }

    /**
     * Health check endpoint for KB Explorer API.
     *
     * GET /api/kb/health
     */
    @GetMapping("/health")
    public ResponseEntity<HealthResponse> health() {
        int docCount = domainDocsTools.listDomainDocs().size();
        return ResponseEntity.ok(new HealthResponse("KB Explorer API is running", docCount));
    }

    public record HealthResponse(String status, int documentCount) {}
}
