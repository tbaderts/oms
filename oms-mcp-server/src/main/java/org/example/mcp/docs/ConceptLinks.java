package org.example.mcp.docs;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;

/**
 * The link graph of the knowledge base: each document's outgoing markdown links and the
 * documents linking to it ("cited by").
 *
 * <p>Links follow the OKF rules (§6): a target starting with {@code /} is relative to the bundle
 * root, any other target to the linking document; external URLs and pure anchors are ignored, as
 * are links inside code. A link to a folder points at its {@code index.md}. Links to missing files
 * are kept and marked, never an error (consumers must tolerate broken links). The same rules are
 * enforced by {@code tools/okf-check}.
 *
 * <p>The graph is built on first use and cached until {@link #invalidate()}, which the index
 * rebuild calls; the knowledge base only changes between restarts.
 */
@Slf4j
@Component
public class ConceptLinks {

    /** A resolved link: portable target path and whether that file exists. */
    public record Link(String target, boolean exists) {}

    private record Graph(Map<String, List<Link>> outgoing, Map<String, List<String>> backlinks) {}

    private static final Pattern LINK = Pattern.compile("\\[[^\\]]*\\]\\(\\s*<?([^)\\s>]+)>?(?:\\s+\"[^\"]*\")?\\s*\\)");
    private static final Pattern SCHEME = Pattern.compile("^[a-zA-Z][a-zA-Z0-9+.-]*:");
    private static final Pattern INLINE_CODE = Pattern.compile("`[^`]*`");

    private final DocumentRepository documentRepository;
    private volatile Graph graph;

    public ConceptLinks(DocumentRepository documentRepository) {
        this.documentRepository = documentRepository;
    }

    /** Outgoing links of a document, in order of appearance, without duplicates. */
    public List<Link> outgoing(String path) {
        return graph().outgoing().getOrDefault(canonical(path), List.of());
    }

    /** Documents that link to this one, sorted by path. */
    public List<String> backlinks(String path) {
        return graph().backlinks().getOrDefault(canonical(path), List.of());
    }

    /** Drops the cached graph; waits for a build in progress so that build cannot republish stale data. */
    public synchronized void invalidate() {
        graph = null;
    }

    // ----- building -----

    private Graph graph() {
        Graph g = graph;
        if (g == null) {
            synchronized (this) {
                g = graph;
                if (g == null) {
                    g = build();
                    graph = g;
                }
            }
        }
        return g;
    }

    private Graph build() {
        Map<String, List<Link>> outgoing = new TreeMap<>();
        Map<String, TreeSet<String>> backlinks = new TreeMap<>();
        for (Path file : documentRepository.findAllDocFiles()) {
            String path = documentRepository.relativize(file);
            String body;
            try {
                body = documentRepository.readBody(path);
            } catch (RuntimeException e) {
                log.debug("[Links] Cannot read {}: {}", path, e.getMessage());
                continue;
            }
            Map<String, Link> links = new LinkedHashMap<>();
            for (String target : linkTargets(body)) {
                Link link = resolve(path, target);
                if (link != null && !link.target().equals(path)) {
                    links.putIfAbsent(link.target(), link);
                }
            }
            outgoing.put(path, List.copyOf(links.values()));
            if (DocumentFileUtils.isReserved(file)) {
                continue; // index.md / log.md navigate; they do not cite
            }
            for (Link link : links.values()) {
                backlinks.computeIfAbsent(link.target(), t -> new TreeSet<>()).add(path);
            }
        }
        Map<String, List<String>> back = new TreeMap<>();
        backlinks.forEach((target, sources) -> back.put(target, List.copyOf(sources)));
        log.info("[Links] Link graph built: {} documents, {} linked targets", outgoing.size(), back.size());
        return new Graph(outgoing, back);
    }

    /** Markdown link targets outside fenced code blocks and inline code spans. */
    static List<String> linkTargets(String body) {
        List<String> targets = new ArrayList<>();
        boolean inFence = false;
        for (String line : body.split("\n")) {
            if (MarkdownParser.isFence(line.trim())) {
                inFence = !inFence;
                continue;
            }
            if (inFence) {
                continue;
            }
            Matcher m = LINK.matcher(INLINE_CODE.matcher(line).replaceAll(""));
            while (m.find()) {
                targets.add(m.group(1));
            }
        }
        return targets;
    }

    /**
     * Resolves a link target against the linking document's portable path
     * ({@code <base>/dir/doc.md}); returns null for external links and pure anchors.
     *
     * <p>Like {@code tools/okf-check}: any existing file is a valid target, a folder resolves to its
     * {@code index.md}, and a link that leaves the bundle is broken (kept with its normalised path).
     */
    private Link resolve(String fromPath, String target) {
        if (SCHEME.matcher(target).find() || target.startsWith("#")) {
            return null;
        }
        String path = target.replaceAll("[#?].*$", "");
        path = URLDecoder.decode(path, StandardCharsets.UTF_8);
        if (path.isEmpty()) {
            return null;
        }
        String base = fromPath.contains("/") ? fromPath.substring(0, fromPath.indexOf('/')) : "";
        Path resolved = path.startsWith("/")
                ? Path.of(base, path.substring(1))
                : Path.of(fromPath).getParent().resolve(path);
        String portable = resolved.normalize().toString().replace('\\', '/');
        if (!portable.startsWith(base + "/")) {
            return new Link(portable, false);
        }
        if (!path.endsWith("/") && exists(portable)) {
            return new Link(portable, true);
        }
        if (path.endsWith("/") || !portable.endsWith(".md")) {
            String index = portable + "/index.md";
            return new Link(index, exists(index));
        }
        return new Link(portable, false);
    }

    /** True if the path names an existing file inside a configured base directory. */
    private boolean exists(String portablePath) {
        return documentRepository.resolveAgainstBases(portablePath) != null;
    }

    /** Accepts paths with or without the base-directory prefix. */
    private String canonical(String path) {
        Path resolved = documentRepository.resolveAgainstBases(path);
        return resolved == null ? path : documentRepository.relativize(resolved);
    }
}
