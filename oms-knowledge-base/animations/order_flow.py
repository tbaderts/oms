"""
Order flow through the OMS, animated with Manim: Event Sourcing, the transactional outbox and CQRS.

Scenes
  OrderFlow       an order is created and accepted: ticket -> oms-core -> Postgres -> outbox
                  -> Kafka -> oms-streaming-service -> blotter
  EventLogReplay  how order_events records history and how OrderReplayService rebuilds an order

Render (Manim Community >= 0.18; only Text is used, so no LaTeX install is needed):
  manim -pql order_flow.py OrderFlow          # quick 480p preview
  manim -pqh order_flow.py OrderFlow          # 1080p
  manim -pqh order_flow.py EventLogReplay

Names, topics, states and events mirror oms-core: OrderCreateCommandProcessor, OrderEventAppender,
OutboxRelay, KafkaEventStreamProvider and TradeBlotterController.
"""

from manim import *

from common import *


class OrderFlow(Narrated):
    def construct(self):
        self.intro()
        self.build()
        self.snapshot_on_subscribe()
        self.create_order()
        self.relay_and_stream("O-1001\nUNACK", slot=3, cache="O-1000:LIVE  O-1001:UNACK")
        self.new_blotter_row()
        self.accept_order()
        self.relay_and_stream("O-1001\nLIVE", slot=4, cache="O-1000:LIVE  O-1001:LIVE", fast=True)
        self.update_blotter_row()
        self.recap()

    # ---------------------------------------------------------------- helpers

    def send(self, token, group, run_time=0.9):
        arrow = group[0]
        token.move_to(arrow.get_start())
        self.play(FadeIn(token, scale=0.6), run_time=0.25)
        self.play(token.animate.move_to(arrow.get_end()), run_time=run_time)

    def hop(self, mob, points, run_time=0.45):
        for p in points:
            self.play(mob.animate.move_to(p), run_time=run_time, rate_func=linear)

    def step_chip(self, text):
        bg = RoundedRectangle(
            corner_radius=0.06, width=2.15, height=0.27,
            stroke_color=CORE, stroke_width=1.2, fill_color=CORE, fill_opacity=0.12,
        )
        t = label(text, 12, INK, mono=True).move_to(bg).align_to(bg, LEFT).shift(RIGHT * 0.1)
        return VGroup(bg, t)

    def cell_text(self, text, cell):
        return label(text, 11, INK, mono=True).move_to(cell)

    def row(self, values, y, color=INK, size=11):
        return VGroup(*[label(v, size, color, mono=True).move_to([x, y, 0])
                        for v, x in zip(values, self.cols)])

    def set_cache(self, text):
        new = label(text, 10, INK, mono=True).move_to(self.cache_cell)
        anims = [FadeIn(new), Indicate(self.cache_cell, color=STREAM, scale_factor=1.06)]
        if self.cache_text is not None:
            anims.append(FadeOut(self.cache_text))
        self.play(*anims, run_time=0.6)
        self.cache_text = new

    def highlight_row(self, y):
        return Rectangle(width=4.0, height=0.24, stroke_width=0,
                         fill_color=UI_C, fill_opacity=0.3).move_to([4.3, y, 0])

    # ---------------------------------------------------------------- beats

    def intro(self):
        title = label("From order ticket to blotter", 46, bold=True)
        sub = label("Event Sourcing · Transactional Outbox · CQRS in the OMS", 24, MUTED)
        card = VGroup(title, sub).arrange(DOWN, buff=0.35)
        self.play(Write(title), run_time=1.2)
        self.play(FadeIn(sub, shift=UP * 0.2))
        self.wait(1.5)
        self.play(FadeOut(card))

    def build(self):
        # Write side
        self.ticket = component("oms-ui", "Order Ticket", UI_C, 2.2, 1.5, [-5.7, 2.1, 0])
        self.ticket.add(label("AAPL  BUY 100\n@ 190.00", 13, INK, mono=True).move_to([-5.7, 1.75, 0]))

        self.core = component("oms-core", "CommandController → pipeline", CORE, 4.0, 2.7, [-1.35, 2.1, 0])
        names = ["1 ValidateOrder", "2 AssignOrderId", "3 SetOrderState", "4 PersistOrder",
                 "5 PublishOrderEvent"]
        self.steps = VGroup(*[self.step_chip(n) for n in names]).arrange(DOWN, buff=0.07)
        self.steps.next_to(self.core[1], DOWN, buff=0.15).align_to(self.core[0], LEFT).shift(RIGHT * 0.2)

        self.pg = component("PostgreSQL", "oms-core schema", DB_C, 4.2, 2.2, [4.3, 2.1, 0])
        self.tables = VGroup(*[Rectangle(width=2.4, height=0.36, stroke_color=DB_C, stroke_width=1.2)
                               for _ in range(3)]).arrange(DOWN, buff=0.1).move_to([5.1, 1.75, 0])
        self.table_names = VGroup(*[label(n, 13, DB_C, mono=True).next_to(cell, LEFT, buff=0.12)
                                    for n, cell in zip(["orders", "order_events", "outbox"], self.tables)])
        self.orders_cell, self.events_cell, self.outbox_cell = self.tables

        # The bridge
        self.relay = component("OutboxRelay", "@Scheduled drain()", KAFKA_C, 2.2, 0.9, [4.6, -0.35, 0])
        self.slots = VGroup(*[Rectangle(width=0.75, height=0.5, stroke_color=KAFKA_C, stroke_width=1.5)
                              for _ in range(8)]).arrange(RIGHT, buff=0).move_to([-0.5, -0.35, 0])
        offsets = VGroup(*[label(str(i), 10, MUTED, mono=True).next_to(s, DOWN, buff=0.06)
                           for i, s in enumerate(self.slots)])
        kafka_title = label("Kafka · topic oms_orders", 16, KAFKA_C, bold=True)
        kafka_title.next_to(self.slots, UP, buff=0.1, aligned_edge=LEFT)
        older = VGroup(*[label(t, 9, MUTED, mono=True).move_to(self.slots[i])
                         for i, t in enumerate(["O-0998\nLIVE", "O-0999\nFILLED", "O-1000\nLIVE"])])
        self.kafka = VGroup(self.slots, offsets, kafka_title, older)

        # Read side
        self.query = component("Query API", "oms-core GET /search", CORE, 2.2, 1.45, [-5.7, -2.55, 0])
        self.query.add(label("reads orders table", 11, MUTED).move_to([-5.7, -2.95, 0]))

        self.stream = component("oms-streaming-service", "reactive Kafka consumer", STREAM, 4.0, 1.45,
                                [-1.35, -2.55, 0])
        self.cache_cell = Rectangle(width=2.3, height=0.34, stroke_color=STREAM, stroke_width=1.2)
        self.cache_cell.move_to([-0.6, -2.95, 0])
        self.stream.add(self.cache_cell,
                        label("orderCache", 13, STREAM, mono=True).next_to(self.cache_cell, LEFT, buff=0.12))
        self.cache_text = None

        self.blotter = component("oms-ui", "Order Blotter · live", UI_C, 4.2, 1.45, [4.3, -2.55, 0])
        self.cols = [2.85, 3.7, 4.4, 5.0, 5.75]
        self.row_y = [-2.88, -3.12]
        grid_head = self.row(["orderId", "symbol", "side", "qty", "state"], -2.62, MUTED, 10)

        # Links
        self.l_cmd = link([-4.6, 2.1, 0], [-3.35, 2.1, 0], "POST /execute")
        self.l_tx = link([0.65, 2.1, 0], [2.2, 2.1, 0], "@Transactional")
        self.l_poll = link([4.6, 1.0, 0], [4.6, 0.1, 0], "poll 200 ms", side=RIGHT)
        self.l_pub = link([3.5, -0.35, 0], [2.5, -0.35, 0], "send")
        self.l_consume = link([-1.35, -0.85, 0], [-1.35, -1.825, 0], "consume", side=RIGHT)
        self.l_push = link([0.65, -2.55, 0], [2.2, -2.55, 0], "RSocket\norders.stream")
        self.l_snap = link([-4.6, -2.55, 0], [-3.35, -2.55, 0], "snapshot")

        write_band = label("COMMAND SIDE · write", 14, CORE, bold=True).to_corner(UL, buff=0.25)
        read_band = label("QUERY SIDE · read", 14, STREAM, bold=True).move_to([-6.9, -1.55, 0], aligned_edge=LEFT)

        self.say("Commands write on top, Kafka carries the events, queries read below")
        self.play(LaggedStart(FadeIn(write_band), FadeIn(self.ticket), FadeIn(self.core), FadeIn(self.steps),
                              FadeIn(self.pg), FadeIn(self.tables), FadeIn(self.table_names),
                              lag_ratio=0.15), run_time=2)
        self.play(*show_link(self.l_cmd), *show_link(self.l_tx))
        self.play(FadeIn(self.relay), FadeIn(self.kafka), *show_link(self.l_poll), *show_link(self.l_pub))
        self.play(LaggedStart(FadeIn(read_band), FadeIn(self.query), FadeIn(self.stream),
                              FadeIn(self.blotter), FadeIn(grid_head), lag_ratio=0.15), run_time=1.5)
        self.play(*show_link(self.l_consume), *show_link(self.l_push), *show_link(self.l_snap))
        self.wait(0.5)

    def snapshot_on_subscribe(self):
        self.say("When the blotter subscribes, it first gets a snapshot from the Query API")
        tok = chip("O-1000", CORE, 11)
        self.send(tok, self.l_snap)
        self.set_cache("O-1000:LIVE")
        self.hop(tok, [self.l_push[0].get_start(), self.l_push[0].get_end()], run_time=0.6)
        self.blotter_rows = [self.row(["O-1000", "MSFT", "SELL", "50", "LIVE"], self.row_y[0])]
        self.play(FadeOut(tok), FadeIn(self.blotter_rows[0]))
        self.say("After the snapshot, the blotter follows the live Kafka stream")
        self.wait(1)

    def create_order(self):
        self.say("A trader submits an order: an OrderCreateCmd is posted to oms-core")
        tok = chip("OrderCreateCmd", UI_C, 11)
        self.send(tok, self.l_cmd)
        self.play(FadeOut(tok, scale=0.5), run_time=0.3)

        self.say("OrderCreateCommandProcessor runs five tasks inside one transaction")
        notes = ["rules ok", "O-1001", "→ UNACK", "→ orders", "→ events + outbox"]
        self.notes = VGroup()
        for i, (step, note) in enumerate(zip(self.steps, notes)):
            if i == 3:
                self.say("PersistOrder writes the order's current state to the orders table")
            if i == 4:
                self.say("PublishOrderEvent appends v1 to order_events and adds a row to the outbox")
            n = label(note, 11, CORE, mono=True).next_to(step, RIGHT, buff=0.15)
            self.notes.add(n)
            self.play(step[0].animate.set_fill(CORE, opacity=0.55), FadeIn(n, shift=RIGHT * 0.1), run_time=0.45)
            if i == 3:
                self.orders_text = self.cell_text("O-1001 AAPL UNACK", self.orders_cell)
                self.play(FadeIn(self.orders_text), run_time=0.4)
            if i == 4:
                self.event_chips = VGroup(chip("v1 NEW_ORDER", DB_C, 10))
                self.event_chips.move_to(self.events_cell).align_to(self.events_cell, LEFT).shift(RIGHT * 0.06)
                self.outbox_text = self.cell_text("O-1001 v1 pending", self.outbox_cell)
                self.play(FadeIn(self.event_chips[0]), FadeIn(self.outbox_text), run_time=0.5)

        self.say("All three rows commit together, or none of them do")
        tx = DashedVMobject(SurroundingRectangle(VGroup(self.tables, self.table_names), buff=0.08,
                                                 color=DB_C, corner_radius=0.06), num_dashes=60)
        commit = chip("COMMIT", DB_C, 12).next_to(self.pg[1], RIGHT, buff=0.3)
        self.play(Create(tx), run_time=0.8)
        self.play(FadeIn(commit, scale=1.3), Flash(commit, color=DB_C, flash_radius=0.5))
        self.play(FadeOut(tx), FadeOut(commit))

        self.say("The HTTP call returns after the commit. Kafka is not on the request path")
        resp = chip("orderId O-1001", CORE, 11).move_to(self.l_cmd[0].get_end())
        self.play(FadeIn(resp, scale=0.6), run_time=0.25)
        self.play(resp.animate.move_to(self.l_cmd[0].get_start()), run_time=0.8)
        self.play(FadeOut(resp), FadeOut(self.notes),
                  *[s[0].animate.set_fill(CORE, opacity=0.12) for s in self.steps])

    def relay_and_stream(self, kafka_label, slot, cache, fast=False):
        one_line = kafka_label.replace("\n", " ")
        speed = 0.6 if fast else 1.0
        if fast:
            self.say("Same path as before: outbox → Kafka → streaming service → blotter")
        else:
            self.say("OutboxRelay polls the outbox and publishes pending rows in commit order")
        self.play(Indicate(self.relay[0], color=KAFKA_C, scale_factor=1.08), run_time=0.6 * speed)

        pkt = chip(one_line, KAFKA_C, 10).move_to(self.outbox_cell)
        self.play(FadeIn(pkt, scale=0.6), run_time=0.3)
        self.hop(pkt, [self.l_poll[0].get_start(), self.l_poll[0].get_end(),
                       self.l_pub[0].get_start(), self.l_pub[0].get_end(),
                       self.slots[slot].get_center()], run_time=0.45 * speed)
        msg = label(kafka_label, 9, INK, mono=True).move_to(self.slots[slot])
        self.play(ReplacementTransform(pkt, msg),
                  self.slots[slot].animate.set_fill(KAFKA_C, opacity=0.25), run_time=0.5)

        if not fast:
            self.say("The outbox row is deleted only after Kafka acknowledges the message")
        self.play(FadeOut(self.outbox_text, shift=RIGHT * 0.3), run_time=0.5)

        if not fast:
            self.say("oms-streaming-service consumes the message and updates its orderCache")
        pkt = chip(one_line, STREAM, 10).move_to(self.slots[slot])
        self.play(FadeIn(pkt, scale=0.6), run_time=0.3)
        self.hop(pkt, [self.l_consume[0].get_start(), self.l_consume[0].get_end()], run_time=0.5 * speed)
        self.set_cache(cache)

        if not fast:
            self.say("Then it pushes the update over RSocket to every blotter that has subscribed")
        self.hop(pkt, [self.l_push[0].get_start(), self.l_push[0].get_end()], run_time=0.6 * speed)
        self.play(FadeOut(pkt, scale=0.5), run_time=0.3)

    def new_blotter_row(self):
        new = self.row(["O-1001", "AAPL", "BUY", "100", "UNACK"], self.row_y[0])
        hl = self.highlight_row(self.row_y[0])
        self.play(self.blotter_rows[0].animate.shift(DOWN * (self.row_y[0] - self.row_y[1])), run_time=0.4)
        self.play(FadeIn(hl), FadeIn(new, shift=DOWN * 0.1))
        self.play(FadeOut(hl), run_time=0.8)
        self.blotter_rows.insert(0, new)
        self.say("The new order is on the blotter: the read side has caught up with the write side")
        self.wait(1.2)

    def accept_order(self):
        self.say("Later the order is accepted: an OrderAcceptCmd arrives on the same /execute endpoint")
        tok = chip("OrderAcceptCmd", UI_C, 11)
        self.send(tok, self.l_cmd)
        accept = label("OrderAcceptCommandProcessor\nUNACK → LIVE", 13, CORE, mono=True).move_to(self.steps)
        self.play(FadeOut(tok, scale=0.5), FadeOut(self.steps), FadeIn(accept), run_time=0.6)

        self.say("The orders row is updated in place: it only holds the latest state")
        self.play(Transform(self.orders_text, self.cell_text("O-1001 AAPL LIVE", self.orders_cell)),
                  Indicate(self.orders_cell, color=DB_C, scale_factor=1.05))

        self.say("order_events gets a new version: history is appended, never rewritten")
        v2 = chip("v2 ACK", DB_C, 10).next_to(self.event_chips[-1], RIGHT, buff=0.06)
        self.outbox_text = self.cell_text("O-1001 v2 pending", self.outbox_cell)
        self.play(FadeIn(v2, shift=LEFT * 0.2), FadeIn(self.outbox_text))
        self.event_chips.add(v2)
        self.wait(0.6)
        self.play(FadeOut(accept), FadeIn(self.steps), run_time=0.5)

    def update_blotter_row(self):
        state_cell = self.blotter_rows[0][4]
        hl = self.highlight_row(self.row_y[0])
        self.play(FadeIn(hl), Transform(state_cell, label("LIVE", 11, INK, mono=True).move_to(state_cell)))
        self.play(FadeOut(hl), run_time=0.8)
        self.say("The blotter row changes from UNACK to LIVE")
        self.wait(1)

    def recap(self):
        beats = [
            (VGroup(self.events_cell, self.table_names[1]), DB_C,
             "order_events: the append-only history (v1 NEW_ORDER, v2 ACK)"),
            (VGroup(self.orders_cell, self.table_names[0]), DB_C,
             "orders: the current state, which always matches the latest event"),
            (self.slots, KAFKA_C,
             "Kafka: the same changes, published reliably through the outbox"),
            (VGroup(self.stream[0], self.blotter[0]), STREAM,
             "Read side: a snapshot plus the event stream. Commands never write here"),
        ]
        for target, color, text in beats:
            self.say(text)
            self.play(Circumscribe(target, color=color, buff=0.08), run_time=1.2)
            self.wait(0.6)

        self.play(*[FadeOut(m) for m in self.mobjects])
        self.caption = None

        heading = label("Takeaways", 34, bold=True).to_edge(UP, buff=0.8)
        points = [
            ("Event sourcing", CORE, "every change appends a new version to order_events"),
            ("Outbox", KAFKA_C, "state, event and outbox row commit in one transaction"),
            ("CQRS", STREAM, "commands write via /execute; reads use /search + the live stream"),
            ("Today", MUTED, "commands and queries still share the orders table"),
        ]
        lines = VGroup()
        y = 1.4
        for key, color, text in points:
            k = label(key, 22, color, bold=True).move_to([-6.2, y, 0], aligned_edge=LEFT)
            v = label(text, 20, INK).move_to([-3.4, y, 0], aligned_edge=LEFT)
            if v.width > 10.2:
                v.scale_to_fit_width(10.2).move_to([-3.4, y, 0], aligned_edge=LEFT)
            lines.add(VGroup(k, v))
            y -= 0.85
        self.play(Write(heading))
        self.play(LaggedStart(*[FadeIn(line, shift=RIGHT * 0.2) for line in lines], lag_ratio=0.4), run_time=2.5)
        self.wait(3)


class EventLogReplay(Narrated):
    def construct(self):
        title = label("order_events: the history of O-1001", 30, DB_C, bold=True).to_edge(UP, buff=0.4)
        self.play(Write(title))

        cols = [-5.6, -3.7, -1.5, 0.3]
        head = VGroup(*[label(h, 14, MUTED, mono=True).move_to([x, 2.3, 0])
                        for h, x in zip(["version", "event", "resultingState", "cumQty"], cols)])
        rule = Line([-6.4, 2.05, 0], [1.1, 2.05, 0], stroke_color=MUTED, stroke_width=1)
        current = component("orders", "current state", DB_C, 3.6, 1.6, [4.6, 1.4, 0])
        self.play(FadeIn(head), Create(rule), FadeIn(current))

        events = [
            (("v1", "NEW_ORDER", "UNACK", "0"), "OrderCreateCmd appends v1 NEW_ORDER. State: UNACK"),
            (("v2", "ACK", "LIVE", "0"), "OrderAcceptCmd appends v2 ACK. State: LIVE"),
            (("v3", "PARTIAL_FILL", "LIVE", "40"), "A fill of 40 appends v3 PARTIAL_FILL. cumQty: 40"),
            (("v4", "FILL", "FILLED", "100"), "The remaining 60 fill: v4 FILL. State: FILLED"),
        ]
        rows = VGroup()
        state_text = None
        for i, (values, text) in enumerate(events):
            y = 1.7 - i * 0.55
            row = VGroup(*[label(v, 16, INK, mono=True).move_to([x, y, 0]) for v, x in zip(values, cols)])
            new_state = label(f"state  {values[2]}\ncumQty {values[3]}", 16, INK, mono=True).move_to([4.6, 1.15, 0])
            self.say(text)
            if state_text is None:
                self.play(FadeIn(row, shift=LEFT * 0.4), FadeIn(new_state))
                state_text = new_state
            else:
                self.play(FadeIn(row, shift=LEFT * 0.4), Transform(state_text, new_state))
            rows.add(row)
            self.wait(0.6)

        self.say("The log keeps every step. The orders row keeps only the last one")
        self.wait(1.5)

        # Time travel: replayAt reads the snapshot stored with an earlier version.
        self.say("replayAt(O-1001, v2) reads the order snapshot stored with version 2")
        marker = SurroundingRectangle(rows[1], color=KAFKA_C, buff=0.08)
        replay = component("replayAt(v2)", "OrderReplayService", KAFKA_C, 3.6, 1.6, [4.6, -1.0, 0])
        replay_text = label("state  LIVE\ncumQty 0", 16, INK, mono=True).move_to([4.6, -1.25, 0])
        self.play(Create(marker), *[r.animate.set_opacity(0.25) for r in rows[2:]])
        self.play(FadeIn(replay), FadeIn(replay_text))
        self.say("Each event stores the order it produced, so replay is a lookup, not a fold over deltas")
        self.wait(2)

        # Consistency check: the latest replay must equal the live row.
        self.say("replay() must equal the orders row. A mismatch means a change bypassed the log")
        self.play(*[r.animate.set_opacity(1) for r in rows[2:]],
                  marker.animate.become(SurroundingRectangle(rows[3], color=KAFKA_C, buff=0.08)),
                  Transform(replay[1][0], label("replay()", 20, KAFKA_C, bold=True).move_to(replay[1][0])),
                  Transform(replay_text, label("state  FILLED\ncumQty 100", 16, INK, mono=True).move_to(replay_text)))
        check = label("replay() == orders  ✓", 18, DB_C, bold=True).next_to(replay, DOWN, buff=0.3)
        self.play(FadeIn(check, shift=UP * 0.1), Indicate(current[0], color=DB_C, scale_factor=1.04))
        self.wait(1.2)

        self.say("Versions 1 to 4 with no gaps: isContiguous() is true")
        versions = VGroup(*[r[0] for r in rows])
        self.play(FadeOut(marker), Circumscribe(versions, color=DB_C, buff=0.12), run_time=1.5)
        self.wait(2)
