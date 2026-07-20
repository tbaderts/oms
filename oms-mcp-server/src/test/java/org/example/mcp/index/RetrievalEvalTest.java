package org.example.mcp.index;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.example.mcp.index.KnowledgeIndexService.SearchHit;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.yaml.snakeyaml.Yaml;

import lombok.extern.slf4j.Slf4j;

/**
 * Retrieval quality evaluation against the real knowledge base.
 *
 * Runs the golden queries from {@code retrieval-evals/golden-queries.yaml}
 * through the BM25 retriever (embeddings disabled so CI needs no Ollama) and
 * computes document-level recall@5 and MRR.
 *
 * Every retrieval change (scoring, chunking, analyzers, fusion) must keep
 * recall@5 at or above the pinned baseline. When you improve retrieval,
 * raise the baseline. Run with hybrid search manually (Ollama up) to compare.
 */
@Slf4j
@Tag("eval")
class RetrievalEvalTest {

    /** Pinned BM25-only baseline. Raise when retrieval improves; never lower silently.
     *  Measured 2026-06-10: recall@5 = 1.000, MRR = 0.903 (25 queries). */
    private static final double RECALL_AT_5_BASELINE = 0.90;

    private static final Path KB_PATH = Paths.get("../oms-knowledge-base");

    private static KnowledgeIndexService index;

    record GoldenQuery(String query, List<String> expected) {}

    @BeforeAll
    static void buildIndex() {
        assumeTrue(Files.isDirectory(KB_PATH),
                "knowledge base not found at " + KB_PATH.toAbsolutePath() + " — skipping eval");
        index = IndexTestSupport.buildIndex(KB_PATH.toString());
    }

    @Test
    void recallAt5AndMrrMeetBaseline() {
        List<GoldenQuery> golden = loadGoldenQueries();
        assumeTrue(!golden.isEmpty(), "no golden queries found");

        int recalled = 0;
        double reciprocalRankSum = 0;
        List<String> misses = new ArrayList<>();

        for (GoldenQuery gq : golden) {
            // Rank distinct documents by their best section hit
            var response = index.search(gq.query(), 20, null, null);
            Set<String> rankedDocs = new LinkedHashSet<>();
            for (SearchHit hit : response.hits()) {
                rankedDocs.add(hit.path());
            }

            int rank = 0;
            int found = 0;
            for (String doc : rankedDocs) {
                rank++;
                if (rank > 5) break;
                if (gq.expected().contains(doc)) {
                    found = rank;
                    break;
                }
            }
            if (found > 0) {
                recalled++;
                reciprocalRankSum += 1.0 / found;
            } else {
                misses.add(gq.query() + "  -> got: " + rankedDocs.stream().limit(5).toList());
            }
        }

        double recallAt5 = (double) recalled / golden.size();
        double mrr = reciprocalRankSum / golden.size();

        log.info("=== Retrieval eval (BM25-only, doc-level) ===");
        log.info("Queries: {}   recall@5: {}   MRR: {}",
                golden.size(), "%.3f".formatted(recallAt5), "%.3f".formatted(mrr));
        misses.forEach(m -> log.info("MISS: {}", m));

        assertTrue(recallAt5 >= RECALL_AT_5_BASELINE,
                "recall@5 regression: %.3f < baseline %.2f. Misses:%n%s"
                        .formatted(recallAt5, RECALL_AT_5_BASELINE, String.join("\n", misses)));
    }

    @SuppressWarnings("unchecked")
    private static List<GoldenQuery> loadGoldenQueries() {
        InputStream in = RetrievalEvalTest.class.getResourceAsStream("/retrieval-evals/golden-queries.yaml");
        if (in == null) return List.of();
        Map<String, Object> root = new Yaml().load(in);
        List<Map<String, Object>> queries = (List<Map<String, Object>>) root.get("queries");
        return queries.stream()
                .map(q -> new GoldenQuery((String) q.get("query"), (List<String>) q.get("expected")))
                .toList();
    }
}
