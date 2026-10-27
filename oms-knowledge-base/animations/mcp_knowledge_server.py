"""
How coding agents use oms-mcp-server, animated with Manim.

Scenes, in story order
  Chunking      markdown is cut at headings into citable section chunks
  Indexing      every chunk is indexed twice: BM25 terms and a 1024-dim embedding
  HybridSearch  keyword and vector rankings fused with Reciprocal Rank Fusion
  AgentSession  a coding agent connects over MCP, breaks a request down and enriches its context

Render:
  manim -pql mcp_knowledge_server.py AgentSession                                  # 480p preview
  manim -qh  mcp_knowledge_server.py Chunking Indexing HybridSearch AgentSession   # 1080p

Rankings, tool names and schemas, citations, line ranges and payload sizes are real output of
oms-mcp-server (26 docs, 702 sections, mxbai-embed-large), captured 2026-10-03 over MCP Streamable
HTTP. The agent's reasoning in AgentSession is illustrative.
"""

from manim import *

from common import *

_CHAR_W = {}


def char_w(size):
    if size not in _CHAR_W:
        _CHAR_W[size] = label("M" * 20, size, mono=True).width / 20
    return _CHAR_W[size]


def code_lines(lines, size=11, color=INK):
    """Monospaced lines on a fixed pitch; leading spaces become indentation."""
    pitch = 0.021 * size + 0.02
    rows = VGroup()
    for i, line in enumerate(lines):
        indent = len(line) - len(line.lstrip(" "))
        t = label(line.strip(), size, color, mono=True)
        t.move_to(ORIGIN, aligned_edge=LEFT).shift(DOWN * i * pitch + RIGHT * indent * char_w(size))
        rows.add(t)
    return rows


def msg_card(title, lines, color, size=11, max_width=5.3):
    head = label(title, 11, color, mono=True, bold=True)
    body = code_lines(lines, size)
    content = VGroup(head, body).arrange(DOWN, aligned_edge=LEFT, buff=0.14)
    bg = RoundedRectangle(corner_radius=0.1, width=content.width + 0.36, height=content.height + 0.32,
                          stroke_color=color, stroke_width=1.5, fill_color="#0f172a", fill_opacity=0.94)
    bg.move_to(content)
    card = VGroup(bg, content)
    if card.width > max_width:
        card.scale_to_fit_width(max_width)
    return card


def chunk_card(anchor, crumb, meta, color=CORE, width=6.3):
    a = label(anchor, 13, color, mono=True, bold=True)
    c = label(crumb, 11, INK)
    m = label(meta, 11, MUTED, mono=True)
    content = VGroup(a, c, m).arrange(DOWN, aligned_edge=LEFT, buff=0.08)
    if content.width > width - 0.36:
        content.scale_to_fit_width(width - 0.36)
    bg = RoundedRectangle(corner_radius=0.1, width=width, height=content.height + 0.3,
                          stroke_color=color, stroke_width=1.5, fill_color=color, fill_opacity=0.1)
    content.move_to(bg).align_to(bg, LEFT).shift(RIGHT * 0.18)
    return VGroup(bg, content)


def note(lines, color, width=4.1, size=12):
    body = VGroup(*[label(l, size, INK) for l in lines]).arrange(DOWN, aligned_edge=LEFT, buff=0.06)
    if body.width > width - 0.3:
        body.scale_to_fit_width(width - 0.3)
    bg = RoundedRectangle(corner_radius=0.08, width=width, height=body.height + 0.26,
                          stroke_color=color, stroke_width=1.5, fill_color=color, fill_opacity=0.15)
    body.move_to(bg).align_to(bg, LEFT).shift(RIGHT * 0.15)
    return VGroup(bg, body)


# ====================================================================== Chunking


class Chunking(Narrated):
    ROWS = [
        ("335", "## 5. Order Cancel Workflow", "h"),
        ("337", "### 5.1 Cancel Request Flow", "h"),
        ("339", "```mermaid", "code"),
        ("347", "Client->>OMS: OrderCancelRequest", "code"),
        ("", "…", "code"),
        ("383", "### 5.2 Cancel State Transitions", "h"),
        ("385", "```mermaid", "code"),
        ("", "…", "code"),
        ("401", "### 5.3 Cancel Request Validation Rules", "h"),
        ("403", "**Pre-validation Checks:**", "text"),
        ("404", "1. Order exists in OMS", "text"),
        ("406", "3. Order not in terminal state", "text"),
        ("", "…", "text"),
        ("420", "### 5.4 Cancel Propagation Rules", "h"),
    ]
    PITCH = 0.37
    TOP = 2.75

    def row_y(self, i):
        return self.TOP - i * self.PITCH

    def span(self, first, last):
        h = (last - first + 1) * self.PITCH
        y = (self.row_y(first) + self.row_y(last)) / 2
        return Rectangle(width=5.4, height=h, stroke_width=0, fill_color=CORE, fill_opacity=0.14).move_to([-3.9, y, 0])

    def construct(self):
        self.title_card("Chunking the knowledge base", "Documents are split by their structure into citable sections")

        page = RoundedRectangle(corner_radius=0.1, width=5.6, height=6.25, stroke_color=MUTED, stroke_width=1.5,
                                fill_color=MUTED, fill_opacity=0.05).move_to([-3.9, 0.3, 0])
        page_title = label("oms-concepts/order-replace.md", 14, MUTED, mono=True).next_to(page.get_top(), DOWN, buff=0.14)
        rows = VGroup()
        for i, (num, text, kind) in enumerate(self.ROWS):
            y = self.row_y(i)
            color = {"h": CORE, "code": KAFKA_C, "text": INK}[kind]
            t = label(text, 12, color, mono=True, bold=(kind == "h")).move_to([-5.95, y, 0], aligned_edge=LEFT)
            parts = [t]
            if num:
                parts.insert(0, label(num, 11, MUTED, mono=True).move_to([-6.2, y, 0], aligned_edge=RIGHT))
            rows.add(VGroup(*parts))

        self.say("A knowledge-base document is plain markdown: headings, prose and code fences")
        self.play(FadeIn(page), FadeIn(page_title))
        self.play(LaggedStart(*[FadeIn(r, shift=RIGHT * 0.1) for r in rows], lag_ratio=0.08), run_time=2)
        self.wait(0.6)

        self.say("SectionChunker cuts at every heading, so each chunk is exactly one section")
        heading_rows = [0, 1, 5, 8, 13]
        cuts = VGroup(*[DashedLine([-6.55, self.row_y(i) + 0.185, 0], [-1.25, self.row_y(i) + 0.185, 0],
                                   color=KAFKA_C, dash_length=0.08, stroke_width=2) for i in heading_rows])
        self.play(LaggedStart(*[Create(c) for c in cuts], lag_ratio=0.2), run_time=1.5)
        self.play(*[Indicate(rows[i][-1], color=KAFKA_C, scale_factor=1.04) for i in heading_rows])
        self.wait(0.4)

        # Chunk A is too small and merges into B.
        span_a = self.span(0, 0)
        card_a = chunk_card("#5-order-cancel-workflow", "order-replace.md > … > 5. Order Cancel Workflow",
                            "lines 335-336 · 29 chars", WARN).move_to([3.55, 2.45, 0])
        self.say("“5. Order Cancel Workflow” holds only its heading: 29 characters, below the 200 minimum")
        self.play(FadeIn(span_a))
        self.play(TransformFromCopy(span_a, card_a))
        self.wait(0.6)

        span_b = self.span(1, 4)
        card_b = chunk_card("#51-cancel-request-flow",
                            "order-replace.md > … > 5. Order Cancel Workflow > 5.1 Cancel Request Flow",
                            "lines 337-382 · status Active").move_to([3.55, 1.2, 0])
        self.play(FadeOut(span_a), FadeIn(span_b))
        self.play(TransformFromCopy(span_b, card_b))

        self.say("Tiny sections merge into a neighbour, and the larger one keeps the citation")
        merged_meta = label("lines 335-382 · status Active", 11, MUTED, mono=True).move_to(card_b[1][2], aligned_edge=LEFT)
        self.play(card_a.animate.move_to(card_b).set_opacity(0), run_time=0.8)
        self.remove(card_a)
        self.play(Transform(card_b[1][2], merged_meta), Indicate(card_b[1][0], color=CORE, scale_factor=1.05))
        self.play(card_b.animate.move_to([3.55, 2.45, 0]), FadeOut(span_b))
        self.wait(0.5)

        self.say("Every chunk carries its address: path, anchor, breadcrumb and line range")
        cards = []
        for (first, last), (anchor, crumb, meta), y in [
            ((5, 7), ("#52-cancel-state-transitions", "order-replace.md > … > 5. Order Cancel Workflow > 5.2 Cancel State Transitions",
                      "lines 383-400 · status Active"), 1.2),
            ((8, 12), ("#53-cancel-request-validation-rules",
                       "order-replace.md > … > 5. Order Cancel Workflow > 5.3 Cancel Request Validation Rules",
                       "lines 401-419 · status Active"), -0.05),
        ]:
            sp = self.span(first, last)
            c = chunk_card(anchor, crumb, meta).move_to([3.55, y, 0])
            self.play(FadeIn(sp), run_time=0.4)
            self.play(TransformFromCopy(sp, c), FadeOut(sp))
            cards.append(c)
        self.wait(0.8)

        # Oversized sections: a generic illustration, not a section of this document.
        self.say("Sections over 6,000 characters split at blank lines, never inside a code fence")
        big = RoundedRectangle(corner_radius=0.1, width=6.3, height=1.3, stroke_color=MUTED, stroke_width=1.5,
                               fill_color=MUTED, fill_opacity=0.1).move_to([3.55, -1.75, 0])
        big_text = label("any section over 6,000 characters", 12, MUTED).move_to(big)
        self.play(FadeIn(big), FadeIn(big_text))
        cut = DashedLine([0.4, -1.75, 0], [6.7, -1.75, 0], color=KAFKA_C, dash_length=0.08)
        self.play(Create(cut), FadeOut(big_text))
        part1 = chunk_card("#long-section", "part 1", "same anchor", MUTED).move_to([3.55, -1.2, 0])
        part2 = chunk_card("#long-section", "[breadcrumb (cont.)] part 2", "same anchor", MUTED).move_to([3.55, -2.3, 0])
        self.play(FadeOut(big), FadeOut(cut), FadeIn(part1, shift=UP * 0.1), FadeIn(part2, shift=DOWN * 0.1))
        self.say("Every part keeps the section's anchor, so a citation always points at the whole section")
        self.wait(1.5)

        self.play(*[FadeOut(m) for m in self.mobjects])
        self.caption = None
        big_num = label("26 documents  →  702 section chunks", 40, bold=True).move_to(UP * 1.4)
        cite = chip("oms-knowledge-base/oms-concepts/order-replace.md#53-cancel-request-validation-rules", CORE, 14).move_to(UP * 0.1)
        same = label("keyword search, vector search and readKnowledgeBase all address the same unit", 20, MUTED).move_to(DOWN * 0.9)
        self.play(Write(big_num))
        self.play(FadeIn(cite, scale=0.9))
        self.play(FadeIn(same, shift=UP * 0.1))
        self.wait(2.5)


# ====================================================================== Indexing


class Indexing(Narrated):
    def token_chips(self, words, color, size=12):
        return VGroup(*[chip(w, color, size) for w in words]).arrange(RIGHT, buff=0.1)

    def construct(self):
        self.title_card("Indexing every chunk twice", "Keyword terms for BM25 and an embedding for semantic search")

        card = chunk_card("#53-cancel-request-validation-rules",
                          "order-replace.md > … > 5. Order Cancel Workflow > 5.3 Cancel Request Validation Rules",
                          "“2. Cancel for partially filled order cancels remaining quantity” …", width=7.0)
        card.move_to([-3.1, 2.95, 0])
        lucene = component("Lucene index", "in memory · rebuilt at startup", DB_C, 3.0, 4.6, [5.4, 0.35, 0])
        self.say("Take one chunk: section 5.3 of order-replace.md")
        self.play(FadeIn(card, shift=DOWN * 0.1))
        self.play(FadeIn(lucene))

        # ---- keyword lane
        lane_a = label("KEYWORD · BM25", 14, CORE, bold=True).move_to([-6.9, 1.95, 0], aligned_edge=LEFT)
        words = "Cancel for partially filled order cancels remaining quantity".split()
        toks = self.token_chips(words, CORE).move_to([-6.9, 1.4, 0], aligned_edge=LEFT)
        self.say("For keyword search, Lucene's EnglishAnalyzer splits the text into tokens")
        self.play(FadeIn(lane_a))
        self.play(LaggedStart(*[FadeIn(t, shift=DOWN * 0.15) for t in toks], lag_ratio=0.08), run_time=1.2)

        step = label("lowercase", 12, MUTED, mono=True).move_to([-6.9, 0.9, 0], aligned_edge=LEFT)
        self.play(FadeIn(step), Transform(toks[0], chip("cancel", CORE).move_to(toks[0])))

        self.say("…drops stopwords such as “for”…")
        self.play(Transform(step, label("drop stopwords", 12, MUTED, mono=True).move_to(step, aligned_edge=LEFT)),
                  toks[1][0].animate.set_fill(WARN, 0.5).set_stroke(WARN))
        self.play(FadeOut(toks[1], shift=DOWN * 0.2))
        kept = VGroup(*[t for i, t in enumerate(toks) if i != 1])
        self.play(kept.animate.arrange(RIGHT, buff=0.1).move_to([-6.9, 1.4, 0], aligned_edge=LEFT), run_time=0.5)

        self.say("…and stems words to their root, so “cancels” and “cancel” become one term")
        stems = ["cancel", "partial", "fill", "order", "cancel", "remain", "quantiti"]
        new = self.token_chips(stems, CORE).move_to([-6.9, 1.4, 0], aligned_edge=LEFT)
        self.play(Transform(step, label("Porter stemmer", 12, MUTED, mono=True).move_to(step, aligned_edge=LEFT)),
                  *[Transform(k, n) for k, n in zip(kept, new)], run_time=1.2)
        self.wait(0.5)

        postings = code_lines(["cancel   → #51 #53 #54 #55 #92 …",
                               "fill     → #53 #55 …",
                               "quantiti → #53 …"], 12, INK).move_to([-6.9, 0.3, 0], aligned_edge=LEFT)
        self.say("Each term points to the sections that contain it: an inverted index, ranked with BM25")
        self.play(FadeIn(postings, shift=DOWN * 0.1))
        self.wait(0.8)

        lucene_lines = VGroup()

        def into_lucene(source, text, color):
            line = label(text, 11, color, mono=True)
            if lucene_lines:
                line.next_to(lucene_lines[-1], DOWN, buff=0.12, aligned_edge=LEFT)
            else:
                line.move_to([4.1, 1.75, 0], aligned_edge=LEFT)
            lucene_lines.add(line)
            return ReplacementTransform(source, line)

        self.play(into_lucene(VGroup(kept, postings, step), "body, title → BM25", CORE), FadeOut(lane_a))

        # ---- semantic lane
        lane_b = label("SEMANTIC · VECTOR", 14, STREAM, bold=True).move_to([-6.9, 0.95, 0], aligned_edge=LEFT)
        ollama = component("Ollama", "mxbai-embed-large", STREAM, 2.5, 0.95, [-5.6, 0.0, 0])
        self.say("For semantic search, the whole section text goes to a local embedding model")
        self.play(FadeIn(lane_b), FadeIn(ollama))
        ghost = card.copy()
        self.play(ghost.animate.scale(0.2).move_to(ollama).set_opacity(0), run_time=0.8)
        self.remove(ghost)

        vec = chip("[-0.018, -0.002, 0.017, 0.048, …, 0.018]", STREAM, 12).move_to([-2.0, 0.0, 0])
        dims = label("1024 numbers", 11, MUTED, mono=True).next_to(vec, DOWN, buff=0.08)
        self.play(FadeIn(vec, shift=RIGHT * 0.2), FadeIn(dims))
        self.say("Out comes a vector of 1024 numbers that encodes what the section means")
        self.wait(0.8)

        cache = VGroup(label("cache key = SHA-256(model · prefix · text)", 11, MUTED, mono=True),
                       label("at startup: 702 of 702 served from .kb-index/", 11, MUTED, mono=True))
        cache.arrange(DOWN, aligned_edge=LEFT, buff=0.06).move_to([-6.9, -0.85, 0], aligned_edge=LEFT)
        self.say("Embeddings are cached by content hash, so a restart only embeds new or changed sections")
        self.play(FadeIn(cache))
        self.wait(1)

        # A 2-D sketch of the vector space, positions illustrative.
        space = RoundedRectangle(corner_radius=0.1, width=4.6, height=1.8, stroke_color=MUTED, stroke_width=1,
                                 fill_opacity=0).move_to([-1.0, -2.05, 0])
        space_lbl = label("2-D sketch of the 1024-D space", 10, MUTED).next_to(space, DOWN, buff=0.05)
        rng = np.random.default_rng(7)
        clusters = [((-2.5, -1.6), "executions"), ((0.3, -2.5), "testing"), ((-2.4, -2.6), "streaming")]
        dots = VGroup()
        tags = VGroup()
        for (cx, cy), name in clusters:
            for _ in range(5):
                dots.add(Dot([cx + rng.normal(0, 0.18), cy + rng.normal(0, 0.1), 0], radius=0.04, color=MUTED))
            tags.add(label(name, 10, MUTED).move_to([cx, cy + 0.28, 0]))
        cancel_c = (0.5, -1.55)
        cancel_dots = VGroup(*[Dot([cancel_c[0] + rng.normal(0, 0.18), cancel_c[1] + rng.normal(0, 0.08), 0],
                                   radius=0.045, color=STREAM) for _ in range(5)])
        cancel_tag = label("cancel sections", 10, STREAM).move_to([cancel_c[0], cancel_c[1] + 0.28, 0])
        self.say("Sections with similar meaning get nearby vectors; an HNSW graph finds neighbours fast")
        self.play(FadeIn(space), FadeIn(space_lbl), FadeIn(dots), FadeIn(tags), FadeIn(cancel_dots), FadeIn(cancel_tag))
        me = Dot(vec.get_center(), radius=0.07, color=STREAM)
        self.play(ReplacementTransform(vec, me), FadeOut(dims))
        self.play(me.animate.move_to([cancel_c[0] - 0.05, cancel_c[1] - 0.02, 0]), run_time=0.9)
        self.play(Flash(me, color=STREAM, flash_radius=0.25))
        self.wait(0.6)

        self.play(into_lucene(VGroup(me, ollama, lane_b, cache), "vector → HNSW, cosine", STREAM))
        self.say("The same Lucene document also stores filters and everything a citation needs")
        extra = []
        for text in ["category, status → filters", "path, anchor, lines → citations"]:
            line = label(text, 11, MUTED, mono=True).next_to(lucene_lines[-1], DOWN, buff=0.12, aligned_edge=LEFT)
            lucene_lines.add(line)
            extra.append(FadeIn(line, shift=RIGHT * 0.1))
        self.play(LaggedStart(*extra, lag_ratio=0.3))

        stats = VGroup(label("26 docs", 18, DB_C, bold=True), label("702 chunks", 18, DB_C, bold=True),
                       label("≈ 1.2 s rebuild", 14, MUTED)).arrange(DOWN, buff=0.1).move_to([5.4, -1.1, 0])
        self.say("Everything rebuilds in memory at startup: 26 documents, 702 chunks, in about 1.2 seconds")
        self.play(FadeIn(stats, shift=UP * 0.1))
        self.wait(1.2)
        self.say("No Ollama? Indexing skips the vectors and search runs as BM25 only, and says so")
        self.play(lucene_lines[1].animate.set_opacity(0.3))
        self.wait(2)


# ====================================================================== HybridSearch


KW_CANCEL = [("5.4 Cancel Propagation Rules", "order-replace.md"),
             ("7. Best Practices & Pitfalls › Do", "ai-augmented-development.md"),
             ("10.2 Propagation Decision Tree", "order-replace.md"),
             ("5.5 Partial Cancel Scenarios", "order-replace.md"),
             ("4.5 Replace Propagation Rules", "order-replace.md")]
SEM_CANCEL = [("9.2 Cancel Orchestration", "order-replace.md"),
              ("5.1 Cancel Request Flow", "order-replace.md"),
              ("8.2 Cancel Order API", "order-replace.md"),
              ("5.5 Partial Cancel Scenarios", "order-replace.md"),
              ("7.4 Child Order Cancellation", "order-quantity-calculations.md")]
# section, keyword rank, semantic rank, formula, RRF score
FUSED = [("5.5 Partial Cancel Scenarios", "4", "4", "1/64 + 1/64", "0.0312"),
         ("5.1 Cancel Request Flow", "8", "2", "1/68 + 1/62", "0.0308"),
         ("5.4 Cancel Propagation Rules", "1", "12", "1/61 + 1/72", "0.0303"),
         ("9.2 Cancel Orchestration", "12", "1", "1/72 + 1/61", "0.0303"),
         ("5.3 Cancel Request Validation Rules", "6", "9", "1/66 + 1/69", "0.0296")]
KW_PULL = [("2.2 State Categories", "order-lifecycle.md"),
           ("4. ReadySet Caching Layer › How it Works", "state-query-store_spec.md"),
           ("2. PostgreSQL Hyperscale (Citus) › How it Works", "state-query-store_spec.md"),
           ("3. Event Sourcing + CQRS › How it Works", "state-query-store_spec.md"),
           ("3.2 Why This Structure Works for Both Channels", "oms-knowledge-base-strategy.md")]
SEM_PULL = [("5.1 Cancel Request Flow", "order-replace.md"),
            ("5.5 Partial Cancel Scenarios", "order-replace.md"),
            ("Scenario 2: MKT Leg Order …", "order-state-indicator-spec.md"),
            ("8.2 Cancel Order API", "order-replace.md"),
            ("5.2 Limit Order - Partial Fill Then Cancel", "order-lifecycle.md")]


class HybridSearch(Narrated):
    ROW_TOP = 1.75
    ROW_STEP = 0.62

    def ranking(self, items, x_left, title, color):
        head = label(title, 18, color, bold=True).move_to([x_left, 2.45, 0], aligned_edge=LEFT)
        rows = VGroup()
        for i, (section, doc) in enumerate(items):
            y = self.ROW_TOP - i * self.ROW_STEP
            n = label(str(i + 1), 16, MUTED, mono=True, bold=True).move_to([x_left, y, 0], aligned_edge=LEFT)
            s = label(section, 15, INK).move_to([x_left + 0.4, y + 0.1, 0], aligned_edge=LEFT)
            d = label(doc, 10, MUTED, mono=True).move_to([x_left + 0.4, y - 0.16, 0], aligned_edge=LEFT)
            rows.add(VGroup(n, s, d))
        return head, rows

    def query_bar(self, text):
        t = label(f"“{text}”", 22, INK)
        bg = RoundedRectangle(corner_radius=0.15, width=t.width + 0.6, height=0.6, stroke_color=UI_C,
                              stroke_width=2, fill_color=UI_C, fill_opacity=0.1)
        return VGroup(bg, t.move_to(bg)).move_to([0, 3.3, 0])

    def mark(self, row, color):
        return SurroundingRectangle(row, color=color, buff=0.06, corner_radius=0.06, stroke_width=2)

    def construct(self):
        self.title_card("Hybrid search", "BM25 and vector rankings, fused by rank")

        q = self.query_bar("how do I cancel an order")
        self.say("A coding agent asks the knowledge base: how do I cancel an order?")
        self.play(FadeIn(q, shift=DOWN * 0.15))

        kw_head, kw_rows = self.ranking(KW_CANCEL, -6.8, "Keyword · BM25", CORE)
        sem_head, sem_rows = self.ranking(SEM_CANCEL, 0.4, "Semantic · vector", STREAM)
        self.say("BM25 ranks sections by shared words, weighting rare words higher")
        self.play(FadeIn(kw_head))
        self.play(LaggedStart(*[FadeIn(r, shift=RIGHT * 0.1) for r in kw_rows], lag_ratio=0.15), run_time=1.2)
        noise = self.mark(kw_rows[1], WARN)
        self.say("On its own, it ranks an unrelated “Best Practices › Do” section second")
        self.play(Create(noise))
        self.wait(0.8)

        self.say("Vector search ranks by meaning: every hit is about cancelling")
        self.play(FadeIn(sem_head))
        self.play(LaggedStart(*[FadeIn(r, shift=RIGHT * 0.1) for r in sem_rows], lag_ratio=0.15), run_time=1.2)
        self.wait(1)

        # ---- Reciprocal Rank Fusion
        self.say("Reciprocal Rank Fusion adds 1 / (60 + rank) from each list. Only rank counts, so no weights")
        formula = label("score(section) = Σ  1 / (60 + rank)", 26, KAFKA_C, bold=True).move_to([0, 2.45, 0])
        self.play(FadeOut(VGroup(kw_head, kw_rows, sem_head, sem_rows, noise)), FadeIn(formula))
        cols = {"kw": 0.2, "sem": 1.6, "f": 3.75, "rrf": 6.0}
        header = VGroup(label("section", 13, MUTED).move_to([-6.6, 1.85, 0], aligned_edge=LEFT),
                        label("keyword", 13, CORE).move_to([cols["kw"], 1.85, 0]),
                        label("semantic", 13, STREAM).move_to([cols["sem"], 1.85, 0]),
                        label("1/(60+k) + 1/(60+s)", 13, MUTED, mono=True).move_to([cols["f"], 1.85, 0]),
                        label("RRF", 13, KAFKA_C, bold=True).move_to([cols["rrf"], 1.85, 0]))
        self.play(FadeIn(header))
        table = VGroup()
        for i, (section, k, s, f, score) in enumerate(FUSED + [("7. Best Practices › Do", "2", "> 50", "1/62 + 0", "0.0161")]):
            y = 1.3 - i * 0.5
            noisy = i == len(FUSED)
            ink = WARN if noisy else INK
            row = VGroup(label(section, 15, ink).move_to([-6.6, y, 0], aligned_edge=LEFT),
                         label(k, 15, CORE, mono=True).move_to([cols["kw"], y, 0]),
                         label(s, 15, STREAM, mono=True).move_to([cols["sem"], y, 0]),
                         label(f, 14, MUTED, mono=True).move_to([cols["f"], y, 0]),
                         label(score, 15, WARN if noisy else KAFKA_C, mono=True, bold=True).move_to([cols["rrf"], y, 0]))
            table.add(row)
        self.play(LaggedStart(*[FadeIn(r, shift=UP * 0.1) for r in table[:-1]], lag_ratio=0.25), run_time=2)
        self.say("Sections both retrievers like rise to the top")
        self.play(Indicate(table[0], color=KAFKA_C, scale_factor=1.03))
        self.wait(0.5)

        self.say("Each retriever contributes 50 candidates, so ranks beyond the top 5 still count")
        self.play(Circumscribe(table[1][1], color=CORE), Circumscribe(table[2][2], color=STREAM), run_time=1.2)
        self.wait(0.5)

        self.say("The “Do” section was liked by keyword search only, so it falls out of the top 5")
        self.play(FadeIn(table[-1], shift=UP * 0.1))
        strike = Line(table[-1].get_left() + LEFT * 0.05, table[-1].get_right() + RIGHT * 0.05, color=WARN, stroke_width=2)
        self.play(Create(strike))
        self.wait(1.2)

        # ---- What the agent receives
        self.play(FadeOut(VGroup(formula, header, table, strike)))
        resp = msg_card("← searchKnowledgeBase response (excerpt)", [
            'Mode: hybrid (BM25 + semantic, rank-fused) — 5 of 76 matching sections',
            '1. …/order-replace.md#55-partial-cancel-scenarios         (lines 448-472)',
            '2. …/order-replace.md#51-cancel-request-flow              (lines 335-382)',
            '3. …/order-replace.md#54-cancel-propagation-rules         (lines 420-447)',
            '4. …/order-replace.md#92-cancel-orchestration             (lines 966-1049)',
            '5. …/order-replace.md#53-cancel-request-validation-rules  (lines 401-419)',
            'To read any result in full: readKnowledgeBase(path, anchor).',
        ], CORE, size=14, max_width=13).move_to([0, 0.6, 0])
        self.say("What the agent gets back: compact markdown, a citation per hit, and a hint for the next call")
        self.play(FadeIn(resp, shift=UP * 0.15))
        self.wait(3)

        # ---- Vocabulary mismatch
        self.play(FadeOut(resp), FadeOut(q))
        q2 = self.query_bar("pull back an order that is still working at the exchange")
        self.say("Now a question that never says “cancel”")
        self.play(FadeIn(q2, shift=DOWN * 0.15))
        kw_head, kw_rows = self.ranking(KW_PULL, -6.8, "Keyword · BM25", CORE)
        sem_head, sem_rows = self.ranking(SEM_PULL, 0.4, "Semantic · vector", STREAM)
        self.play(FadeIn(kw_head), LaggedStart(*[FadeIn(r, shift=RIGHT * 0.1) for r in kw_rows], lag_ratio=0.12), run_time=1.2)
        self.say("BM25 stems “working” to “work”, and matches sections titled “How it Works”")
        marks = VGroup(*[self.mark(kw_rows[i], WARN) for i in (1, 2, 3, 4)])
        self.play(LaggedStart(*[Create(m) for m in marks], lag_ratio=0.15))
        self.wait(0.8)
        self.play(FadeIn(sem_head), LaggedStart(*[FadeIn(r, shift=RIGHT * 0.1) for r in sem_rows], lag_ratio=0.12), run_time=1.2)
        self.say("The embedding understands that pulling back a working order means cancelling it")
        good = VGroup(*[self.mark(sem_rows[i], DB_C) for i in (0, 1, 3, 4)])
        self.play(LaggedStart(*[Create(m) for m in good], lag_ratio=0.15))
        self.wait(1.2)
        self.say("Keyword search still wins on exact identifiers like PENDING_CANCEL or leavesQty, so both always run")
        self.wait(2.5)


# ====================================================================== AgentSession


BAR_Y = -2.8
BAR_LEFT = -6.95
CENTER = np.array([0.2, 1.65, 0])


class AgentSession(Narrated):
    def construct(self):
        self.title_card("How a coding agent uses the knowledge server",
                        "MCP tools · breaking down a request · enriching the context")
        self.build()
        self.connect()
        self.request_and_plan()
        self.orient()
        self.search_and_read()
        self.code_lookup()
        self.act()
        self.recap()

    # ------------------------------------------------------------ layout

    def build(self):
        self.agent = component("Coding agent", "e.g. Claude Code, Copilot", UI_C, 4.4, 5.1, [-4.75, 0.65, 0])
        self.server = component("oms-mcp-server", "Spring AI MCP · :8091/mcp", CORE, 4.0, 3.2, [4.95, 1.6, 0])
        names = ["getKnowledgeBaseOverview", "searchKnowledgeBase", "readKnowledgeBase", "searchOrders", "ping"]
        self.tools = VGroup(*[chip(n, CORE, 12) for n in names]).arrange(DOWN, buff=0.08).move_to([4.95, 1.55, 0])
        self.extras = label("26 resources kb://…  ·  2 prompts", 11, MUTED, mono=True).move_to([4.95, 0.28, 0])
        self.lucene = component("Lucene index", "702 sections", DB_C, 1.9, 0.7, [3.95, -0.7, 0])
        self.core = component("oms-core", ":8090 /search", KAFKA_C, 1.9, 0.7, [5.95, -0.7, 0])
        self.workspace = component("Workspace", "oms-core/src · built-in tools", MUTED, 4.0, 0.7, [4.95, -1.65, 0])
        for box in (self.lucene, self.core, self.workspace):
            box[1].scale(0.8).next_to(box[0].get_top(), DOWN, buff=0.08)

        self.wire = VGroup(
            label("MCP · JSON-RPC 2.0 over Streamable HTTP", 13, MUTED, mono=True).move_to([0.2, 3.45, 0]),
            DashedLine([-2.45, 3.2, 0], [2.85, 3.2, 0], color=MUTED, dash_length=0.1, stroke_width=1.5),
        )
        self.tag = label("tool calls & responses: real server output · agent reasoning: illustrative", 11, MUTED)
        self.tag.to_corner(UL, buff=0.2)

        bar = Rectangle(width=13.9, height=0.4, stroke_color=MUTED, stroke_width=1).move_to([0, BAR_Y, 0])
        bar_title = label("Agent context window", 14, INK, bold=True).move_to([BAR_LEFT, BAR_Y + 0.62, 0], aligned_edge=LEFT)
        self.ctx_x = BAR_LEFT
        self.kb_tokens = 0.0
        self.counter = self.counter_text()

        self.play(FadeIn(self.tag), FadeIn(self.agent), FadeIn(self.server), FadeIn(self.wire))
        self.play(FadeIn(self.lucene), FadeIn(self.core), FadeIn(self.workspace), FadeIn(bar), FadeIn(bar_title),
                  FadeIn(self.counter))
        self.add_ctx(1.2, "system prompt", MUTED, animate=False)

    def counter_text(self):
        t = f"from knowledge server: ≈ {self.kb_tokens:.1f}K tokens" if self.kb_tokens else "from knowledge server: 0"
        return label(t, 13, CORE, mono=True).move_to([6.95, BAR_Y + 0.62, 0], aligned_edge=RIGHT)

    def add_ctx(self, width, text, color, source=None, side=DOWN, kb_k=0.0, animate=True):
        seg = Rectangle(width=width, height=0.4, stroke_color="#0f172a", stroke_width=1.5,
                        fill_color=color, fill_opacity=0.8).move_to([self.ctx_x + width / 2, BAR_Y, 0])
        lab = label(text, 10, color).next_to(seg, side, buff=0.07)
        self.ctx_x += width
        anims = [FadeIn(lab)]
        if source is not None:
            anims += [ReplacementTransform(source[0], seg), FadeOut(source[1])]
        else:
            anims.append(FadeIn(seg))
        if kb_k:
            self.kb_tokens += kb_k
            new_counter = self.counter_text()
            anims.append(Transform(self.counter, new_counter))
        if animate:
            self.play(*anims, run_time=0.9)
        else:
            self.add(seg, lab)
        return seg

    # ------------------------------------------------------------ helpers

    def request(self, title, lines, tool_index=None, internals=None):
        card = msg_card("→ " + title, lines, UI_C).move_to(CENTER)
        self.play(FadeIn(card, shift=RIGHT * 0.4))
        self.wait(1.2)
        target = self.tools[tool_index] if tool_index is not None else self.server[0]
        self.play(card.animate.scale(0.15).move_to(target).set_opacity(0), run_time=0.6)
        self.remove(card)
        if tool_index is not None:
            self.play(self.tools[tool_index][0].animate.set_fill(CORE, 0.9), run_time=0.2)
        if internals:
            internals()
        if tool_index is not None:
            self.play(self.tools[tool_index][0].animate.set_fill(CORE, 0.4), run_time=0.2)

    def response(self, title, lines, color=CORE, hold=2.0):
        card = msg_card("← " + title, lines, color).move_to(CENTER)
        self.play(FadeIn(card, shift=LEFT * 0.4))
        self.wait(hold)
        return card

    def lucene_flash(self):
        tag = label("BM25 + vector → RRF", 10, DB_C, mono=True).next_to(self.lucene, UP, buff=0.05)
        self.play(Indicate(self.lucene[0], color=DB_C, scale_factor=1.08), FadeIn(tag), run_time=0.7)
        self.play(FadeOut(tag), run_time=0.3)

    def think(self, lines, color=UI_C):
        n = note(lines, color).move_to([-4.75, -1.3, 0])
        anims = [FadeIn(n, shift=UP * 0.1)]
        if getattr(self, "thought", None) is not None:
            anims.append(FadeOut(self.thought))
        self.play(*anims, run_time=0.6)
        self.thought = n

    def tick(self, i):
        dot, text = self.plan[i]
        self.play(dot.animate.set_fill(DB_C, 1).set_stroke(DB_C), text.animate.set_color(DB_C), run_time=0.5)

    def focus(self, i):
        self.play(Indicate(self.plan[i][1], color=UI_C, scale_factor=1.06), run_time=0.6)

    # ------------------------------------------------------------ beats

    def connect(self):
        self.say("When a session starts, the agent connects to the server and asks what it can do")
        self.request("initialize", ['{"method": "initialize",',
                                    ' "params": {"protocolVersion": "2025-06-18"}}'])
        resp = self.response("result", ['{"serverInfo": {"name": "mcp-server"},',
                                        ' "capabilities": tools · resources · prompts',
                                        '                 · logging · completions}',
                                        'header  Mcp-Session-Id: …'], hold=1.5)
        self.play(FadeOut(resp))

        self.request("tools/list", ['{"method": "tools/list"}'])
        resp = self.response("result: 5 tools", [
            'getKnowledgeBaseOverview()',
            'searchKnowledgeBase(query, topK, category, status)',
            'readKnowledgeBase(path, anchor, offset, limit)',
            'searchOrders(filters, page, size, sort)',
            'ping()',
        ], hold=0.8)
        self.say("Tool names, descriptions and JSON schemas: nothing about the server is hard-coded in the agent")
        self.play(LaggedStart(*[FadeIn(t, shift=LEFT * 0.2) for t in self.tools], lag_ratio=0.12),
                  FadeIn(self.extras))
        hint = msg_card("searchKnowledgeBase · description (excerpt)", [
            '"Hybrid retrieval: BM25 keyword search + semantic vector',
            ' search, fused by rank. … Call getKnowledgeBaseOverview',
            ' first in a session to see what documentation exists."',
        ], MUTED).move_to(CENTER)
        self.play(FadeOut(resp), FadeIn(hint))
        self.say("The descriptions also teach the workflow: overview first, then search, then read")
        self.wait(2)
        self.add_ctx(0.9, "tool schemas", CORE, source=hint, kb_k=0.9)

    def request_and_plan(self):
        bubble_text = label("“Add cancel support to oms-core:\n a trader can cancel a LIVE order.”", 14, INK)
        bubble_bg = RoundedRectangle(corner_radius=0.12, width=4.0, height=bubble_text.height + 0.3,
                                     stroke_color=UI_C, stroke_width=1.5, fill_color=UI_C, fill_opacity=0.15)
        bubble = VGroup(bubble_bg, bubble_text.move_to(bubble_bg)).move_to([-4.75, 2.25, 0])
        self.say("A developer gives the agent a task")
        self.play(FadeIn(bubble, shift=DOWN * 0.15))
        self.add_ctx(0.2, "request", UI_C, side=UP)

        self.say("Before writing code, the agent turns the request into questions it can answer")
        items = ["What do the specs say about cancel?",
                 "Which states and rules apply?",
                 "How are commands built today?",
                 "Tests first, then implement",
                 "Cite the specs, flag any gaps"]
        self.plan = VGroup()
        for i, text in enumerate(items):
            y = 1.35 - i * 0.4
            dot = Circle(radius=0.08, stroke_color=MUTED, stroke_width=2, fill_opacity=0).move_to([-6.6, y, 0])
            t = label(text, 14, INK).move_to([-6.38, y, 0], aligned_edge=LEFT)
            self.plan.add(VGroup(dot, t))
        plan_title = label("Plan", 13, MUTED, bold=True).move_to([-6.7, 1.72, 0], aligned_edge=LEFT)
        self.play(FadeIn(plan_title), LaggedStart(*[FadeIn(p, shift=RIGHT * 0.15) for p in self.plan], lag_ratio=0.3),
                  run_time=2.2)
        self.wait(1)

    def orient(self):
        self.say("It orients itself first: one overview call per session")
        self.request("tools/call", ['{"name": "getKnowledgeBaseOverview",', ' "arguments": {}}'], tool_index=0,
                     internals=lambda: self.play(Indicate(self.lucene[0], color=DB_C, scale_factor=1.08), run_time=0.5))
        resp = self.response("result · 15,445 chars", [
            '# OMS Knowledge Base Overview',
            '- Documents: 26 (636 KB, 702 indexed sections)',
            '- Search: hybrid — BM25 + semantic embeddings',
            '### oms-concepts/order-lifecycle.md',
            '### oms-concepts/order-replace.md',
            '### oms-framework/validation-rules.md',
            '…  every doc with a summary and section anchors',
        ], hold=1.5)
        self.think(["Likely relevant:", "order-lifecycle.md · order-replace.md", "validation-rules.md"])
        self.add_ctx(3.9, "getKnowledgeBaseOverview ≈ 3.9K", CORE, source=resp, kb_k=3.9)

    def search_and_read(self):
        self.focus(0)
        self.say("Question 1 becomes a search: hybrid retrieval runs inside the server")
        self.request("tools/call", ['{"name": "searchKnowledgeBase",',
                                    ' "arguments": {"query": "how do I cancel an order",',
                                    '               "topK": 5, "category": "", "status": ""}}'],
                     tool_index=1, internals=self.lucene_flash)
        resp = self.response("result · 3,867 chars", [
            'Mode: hybrid (BM25 + semantic) — 5 of 76 sections',
            '1. order-replace.md#55-partial-cancel-scenarios',
            '2. order-replace.md#51-cancel-request-flow',
            '3. order-replace.md#54-cancel-propagation-rules',
            '4. order-replace.md#92-cancel-orchestration',
            '5. order-replace.md#53-cancel-request-validation-rules',
            'To read any result in full: readKnowledgeBase(path, anchor)',
        ], KAFKA_C, hold=2)
        self.add_ctx(1.0, "search ≈ 1K", KAFKA_C, source=resp, kb_k=1.0)
        self.tick(0)

        self.focus(1)
        self.say("A citation is also an address: the agent reads exactly that section, nothing more")
        self.request("tools/call", ['{"name": "readKnowledgeBase",',
                                    ' "arguments": {"path": "…/order-replace.md",',
                                    '   "anchor": "53-cancel-request-validation-rules",',
                                    '   "offset": 0, "limit": 0}}'], tool_index=2)
        resp = self.response("result · lines 401-419", [
            '### 5.3 Cancel Request Validation Rules',
            '3. Order not in terminal state (FILLED, CANCELED, …)',
            '4. Order not already in PENDING_CANCEL',
            '1. Cannot cancel if leavesQty = 0 (fully filled)',
            '2. Cancel for partially filled order cancels remaining qty',
        ], DB_C, hold=2)
        self.add_ctx(0.25, "read ≈ 0.2K", DB_C, source=resp, side=UP, kb_k=0.2)

        self.say("It refines with a second, narrower search for the state transition")
        self.request("tools/call", ['{"name": "searchKnowledgeBase",',
                                    ' "arguments": {"query": "LIVE to CXL cancel accepted", …}}'],
                     tool_index=1, internals=self.lucene_flash)
        resp = self.response("result · 3,688 chars", [
            '1. order-lifecycle.md#49-live-cxl-cancel-accepted  (lines 260-276)',
            '   Set state = CXL · Set leavesQty = 0',
            '   Preserve cumQty (partial fills remain)',
            '2. order-lifecycle.md#43-new-cxl-cancel-before-send',
            '3. order-lifecycle.md#92-cancel-while-filling',
        ], KAFKA_C, hold=2)
        self.add_ctx(0.9, "search ≈ 0.9K", KAFKA_C, source=resp, kb_k=0.9)
        self.tick(1)

        self.say("Comparing the two specs, it spots a naming conflict and decides to report it, not guess")
        self.think(["Conflict: order-replace.md says CANCELED,",
                    "order-lifecycle.md says CXL",
                    "→ follow the code, flag the spec"], WARN)
        self.wait(2)

    def code_lookup(self):
        self.focus(2)
        self.say("For the codebase it uses its own built-in tools. MCP adds to them, it doesn't replace them")
        path = DashedLine([-2.5, -1.65, 0], [2.9, -1.65, 0], color=MUTED, dash_length=0.1)
        path_lbl = label("built-in Grep / Read · not MCP", 10, MUTED, mono=True).next_to(path, UP, buff=0.05)
        self.play(Create(path), FadeIn(path_lbl))
        self.play(Indicate(self.workspace[0], color=INK, scale_factor=1.05), run_time=0.6)
        resp = self.response("built-in tools", [
            'Grep "isValidTransition" → OrderAcceptCommandProcessor.java',
            'Read OrderStateMachineConfig.java',
            '     LIVE → FILLED, CXL, REJ',
            'Read Event.java: CXL already exists',
        ], MUTED, hold=2)
        self.add_ctx(2.5, "code via built-in tools (estimate)", MUTED, source=resp)
        self.play(FadeOut(path), FadeOut(path_lbl))
        self.tick(2)

    def act(self):
        self.say("Only now does it write code: the test first, then the processor, citing the specs")
        card = msg_card("agent writes", [
            'OrderCancelCommandProcessorTest          ← first',
            'OrderCancelCommandProcessor',
            '  LIVE → CXL · leavesQty = 0 · keep cumQty',
            '  appends Event.CXL via OrderEventAppender',
            '/** @see order-lifecycle.md#49-live-cxl-cancel-accepted',
            ' *  @see order-replace.md#53-cancel-request-validation-rules */',
        ], UI_C).move_to(CENTER)
        self.play(FadeIn(card, shift=UP * 0.15))
        self.tick(3)
        self.wait(1.5)
        self.think(["Done: cancel for LIVE orders, with tests.",
                    "Spec gap: order-replace.md uses CANCELED,",
                    "the code and order-lifecycle.md use CXL."], DB_C)
        self.tick(4)
        self.wait(2)
        self.play(FadeOut(card))

    def recap(self):
        self.say("All the knowledge it needed came in about 7K tokens, not the whole 636 KB (≈ 160K tokens)")
        self.play(Indicate(self.counter, color=CORE, scale_factor=1.1))
        self.wait(2)

        keep = [m for m in self.mobjects if m.get_center()[1] < BAR_Y + 0.7]
        self.play(*[FadeOut(m) for m in self.mobjects if m not in keep and m is not self.caption])
        steps = [("orient", "getKnowledgeBaseOverview", CORE),
                 ("search", "searchKnowledgeBase", KAFKA_C),
                 ("read", "readKnowledgeBase", DB_C),
                 ("cite & act", "code · tests · PR", UI_C)]
        nodes = VGroup()
        for title, sub, color in steps:
            body = VGroup(label(title, 22, color, bold=True), label(sub, 12, MUTED, mono=True)).arrange(DOWN, buff=0.08)
            bg = RoundedRectangle(corner_radius=0.15, width=3.0, height=1.1, stroke_color=color, stroke_width=2,
                                  fill_color=color, fill_opacity=0.1)
            nodes.add(VGroup(bg, body.move_to(bg)))
        nodes.arrange(RIGHT, buff=0.45).move_to([0, 1.0, 0])
        arrows = VGroup(*[Arrow(nodes[i].get_right(), nodes[i + 1].get_left(), buff=0.05, color=MUTED,
                                stroke_width=2.5, max_tip_length_to_length_ratio=0.35) for i in range(3)])
        back = CurvedArrow(nodes[3].get_top() + UP * 0.05, nodes[1].get_top() + UP * 0.05, angle=TAU / 6,
                           color=MUTED, stroke_width=2.5)
        back_lbl = label("repeat per question", 13, MUTED).next_to(back, UP, buff=0.05)
        heading = label("The agent loop", 30, bold=True).move_to([0, 3.2, 0])
        self.say("The same loop for every question: orient once, then search, read, cite and act")
        self.play(Write(heading))
        self.play(LaggedStart(*[FadeIn(n, shift=UP * 0.1) for n in nodes], lag_ratio=0.3), Create(arrows), run_time=2)
        self.play(Create(back), FadeIn(back_lbl))
        self.wait(3)
