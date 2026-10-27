"""
Two OMS architectures, one order: how data flows in each, animated with Manim.

The same scenario runs through both: order O-1 (BUY 100 AAPL) goes UNACK -> LIVE -> FILLED with two
executions, E-1 60 @ 190.00 and E-2 40 @ 190.10. Companion to
oms-methodolgy/architecture-convergence-assessment.md.

Scenes
  ApproachA   custom: current state in tables, event log + outbox in the same transaction, a read-only
              query-service on a PostgreSQL replica
  ApproachB   Axon Framework on PostgreSQL: event-sourced aggregate hydrated per command, event store as
              the source of truth, tracking processors building a read model and forwarding to Kafka
  SideBySide  what each approach has stored once the order is FILLED, and what that means

Render (Manim Community >= 0.18; only Text is used, so no LaTeX install is needed):
  uvx --from manim manim -pql approaches.py ApproachA     # quick 480p preview
  uvx --from manim manim -pqh approaches.py ApproachA ApproachB SideBySide
"""

from manim import *

from common import *


def fit(mob, width, height=None):
    if mob.width > width:
        mob.scale_to_fit_width(width)
    if height is not None and mob.height > height:
        mob.scale_to_fit_height(height)
    return mob


class FlowScene(Narrated):
    """Helpers shared by both approach scenes."""

    def send(self, token, group, run_time=0.8, reverse=False):
        arrow = group[0]
        start, end = (arrow.get_end(), arrow.get_start()) if reverse else (arrow.get_start(), arrow.get_end())
        token.move_to(start)
        self.play(FadeIn(token, scale=0.6), run_time=0.25)
        self.play(token.animate.move_to(end), run_time=run_time)

    def hop(self, mob, points, run_time=0.4):
        for p in points:
            self.play(mob.animate.move_to(p), run_time=run_time, rate_func=linear)

    def text_in(self, text, cell, size=10, color=INK):
        return fit(label(text, size, color, mono=True), cell.width - 0.14, cell.height - 0.06).move_to(cell)

    def swap(self, old, new):
        return [FadeIn(new)] if old is None else [FadeOut(old), FadeIn(new)]

    def commit(self, around, at):
        tx = DashedVMobject(SurroundingRectangle(around, buff=0.08, color=DB_C, corner_radius=0.06),
                            num_dashes=70)
        done = chip("COMMIT", DB_C, 11).move_to(at)
        self.play(Create(tx), run_time=0.6)
        self.play(FadeIn(done, scale=1.3), Flash(done, color=DB_C, flash_radius=0.45), run_time=0.6)
        self.play(FadeOut(tx), FadeOut(done), run_time=0.3)

    def bands(self):
        write = label("COMMAND SIDE · write", 14, CORE, bold=True).to_corner(UL, buff=0.25)
        read = label("QUERY SIDE · read", 14, STREAM, bold=True).move_to([-6.9, -1.6, 0], aligned_edge=LEFT)
        return write, read

    def takeaways(self, heading, points):
        self.play(*[FadeOut(m) for m in self.mobjects])
        self.caption = None
        head = label(heading, 32, bold=True).to_edge(UP, buff=0.7)
        lines = VGroup()
        y = 1.6
        for key, color, text in points:
            k = label(key, 21, color, bold=True).move_to([-6.3, y, 0], aligned_edge=LEFT)
            v = fit(label(text, 19, INK), 9.6).move_to([-3.2, y, 0], aligned_edge=LEFT)
            lines.add(VGroup(k, v))
            y -= 0.8
        self.play(Write(head))
        self.play(LaggedStart(*[FadeIn(line, shift=RIGHT * 0.2) for line in lines], lag_ratio=0.4),
                  run_time=2.5)
        self.wait(4)


# ======================================================================================= Approach A

# (command, caption, processor, loads, orders row, executions, event, kafka messages, replica row)
COMMANDS_A = [
    ("NewOrderCmd", "A trader sends a new order: BUY 100 AAPL",
     "OrderCreateCommandProcessor\nvalidate · assign O-1 · → UNACK", False,
     "O-1  AAPL BUY 100 · UNACK · cum 0", None, "v1 NEW_ORDER",
     ["O-1 v1\nUNACK"], "O-1 · UNACK · cum 0"),
    ("OrderAcceptCmd", "The order is acknowledged: OrderAcceptCmd",
     "OrderAcceptCommandProcessor\nUNACK → LIVE", True,
     "O-1  AAPL BUY 100 · LIVE · cum 0", None, "v2 ACK",
     ["O-1 v2\nLIVE"], "O-1 · LIVE · cum 0"),
    ("Execution E-1", "First execution arrives: 60 @ 190.00",
     "Execution processing\nfill 60 @ 190.00", True,
     "O-1  AAPL BUY 100 · LIVE · cum 60", "E-1  60 @ 190.00", "v3 PARTIAL_FILL",
     ["O-1 v3\nLIVE 60", "E-1\n60"], "O-1 · LIVE · cum 60"),
    ("Execution E-2", "Second execution: 40 @ 190.10 completes the order",
     "Execution processing\nfill 40 @ 190.10 → FILLED", True,
     "O-1  AAPL BUY 100 · FILLED · cum 100", "E-1  60 @ 190.00   E-2  40 @ 190.10", "v4 FILL",
     ["O-1 v4\nFILLED", "E-2\n40"], "O-1 · FILLED · cum 100"),
]


class ApproachA(FlowScene):
    def construct(self):
        self.title_card("Approach A · State-stored with event log",
                        "One order: UNACK → LIVE → FILLED with two executions")
        self.build()
        for i, c in enumerate(COMMANDS_A):
            self.command(i, *c, detail=i < 2)
        self.query()
        self.recap()

    def build(self):
        self.client = component("Client", "FIX / REST", UI_C, 1.9, 1.4, [-5.75, 1.85, 0])
        self.core = component("oms-core", "command instance", CORE, 3.6, 1.8, [-1.9, 1.85, 0])
        self.core_text = None

        self.pg = component("PostgreSQL primary", "current state = source of truth", DB_C, 5.6, 2.9,
                            [4.0, 1.85, 0])
        self.cells = VGroup(*[Rectangle(width=3.6, height=h, stroke_color=DB_C, stroke_width=1.2)
                              for h in (0.36, 0.36, 0.62, 0.36)]).arrange(DOWN, buff=0.1)
        self.cells.next_to(self.pg[1], DOWN, buff=0.15).set_x(4.85)
        self.names = VGroup(*[label(n, 12, DB_C, mono=True).next_to(c, LEFT, buff=0.12)
                              for n, c in zip(["orders", "executions", "order_events", "outbox"], self.cells)])
        self.orders_cell, self.exec_cell, self.events_cell, self.outbox_cell = self.cells
        self.orders_text = self.exec_text = self.outbox_text = None
        self.event_chips = VGroup()

        self.relay = component("OutboxRelay", "polls outbox", KAFKA_C, 2.3, 0.85, [2.6, -0.55, 0])
        self.slots = VGroup(*[Rectangle(width=0.85, height=0.55, stroke_color=KAFKA_C, stroke_width=1.5)
                              for _ in range(6)]).arrange(RIGHT, buff=0).move_to([-2.2, -0.55, 0])
        offsets = VGroup(*[label(str(i), 10, MUTED, mono=True).next_to(s, DOWN, buff=0.05)
                           for i, s in enumerate(self.slots)])
        kafka_title = label("Kafka · oms_orders / oms_executions", 14, KAFKA_C, bold=True)
        kafka_title.next_to(self.slots, UP, buff=0.1, aligned_edge=LEFT)
        self.kafka = VGroup(self.slots, offsets, kafka_title)
        self.next_slot = 0

        self.replica = component("PostgreSQL replica", "read-only copy", DB_C, 3.6, 1.3, [4.9, -2.55, 0])
        self.replica_cell = Rectangle(width=3.0, height=0.34, stroke_color=DB_C, stroke_width=1.2)
        self.replica_cell.move_to([4.9, -2.92, 0])
        self.replica_text = None
        self.qs = component("query-service", "oms-core · read-only", CORE, 3.4, 1.3, [-0.2, -2.55, 0])
        self.ui = component("Blotter / UI", "queries", UI_C, 2.6, 1.3, [-5.2, -2.55, 0])

        self.l_cmd = link([-4.75, 1.85, 0], [-3.75, 1.85, 0], "command")
        self.l_tx = link([-0.05, 1.85, 0], [1.15, 1.85, 0], "one tx")
        self.l_poll = link([2.6, 0.37, 0], [2.6, -0.1, 0], "poll", side=LEFT)
        self.l_pub = link([1.42, -0.55, 0], [0.4, -0.55, 0], "send")
        self.l_down = link([-4.8, -0.55, 0], [-6.2, -0.55, 0], "downstream")
        self.l_repl = link([6.25, 0.37, 0], [6.25, -1.87, 0], "replication", side=LEFT)
        self.l_sel = link([1.53, -2.55, 0], [3.07, -2.55, 0], "SELECT")
        self.l_q = link([-3.87, -2.55, 0], [-1.93, -2.55, 0], "GET /search")

        write, read = self.bands()
        self.say("Commands are written on top; queries are answered below from a replica")
        self.play(LaggedStart(FadeIn(write), FadeIn(self.client), FadeIn(self.core), FadeIn(self.pg),
                              FadeIn(self.cells), FadeIn(self.names), lag_ratio=0.15), run_time=1.8)
        self.play(*show_link(self.l_cmd), *show_link(self.l_tx))
        self.play(FadeIn(self.relay), FadeIn(self.kafka), *show_link(self.l_poll), *show_link(self.l_pub),
                  *show_link(self.l_down))
        self.play(LaggedStart(FadeIn(read), FadeIn(self.replica), FadeIn(self.replica_cell), FadeIn(self.qs),
                              FadeIn(self.ui), lag_ratio=0.15), run_time=1.4)
        self.play(*show_link(self.l_repl), *show_link(self.l_sel), *show_link(self.l_q))
        self.wait(0.5)

    def command(self, i, cmd, caption, proc, loads, order, execution, event, msgs, replica, detail):
        self.say(caption)
        tok = chip(cmd, UI_C, 11)
        self.send(tok, self.l_cmd)
        new_core = fit(label(proc, 12, CORE, mono=True), 3.3).move_to([-1.9, 1.45, 0])
        self.play(FadeOut(tok, scale=0.5), *self.swap(self.core_text, new_core), run_time=0.5)
        self.core_text = new_core

        if loads:
            if detail:
                self.say("It loads the order's current state: one row, no matter how long its history")
            row = chip("O-1 row", DB_C, 10)
            self.play(Indicate(self.orders_cell, color=DB_C, scale_factor=1.05), run_time=0.5)
            self.send(row, self.l_tx, reverse=True, run_time=0.5 if detail else 0.35)
            self.play(FadeOut(row, scale=0.5), run_time=0.2)

        if i == 0:
            self.say("One transaction writes the current state, appends an event and stages an outbox row")
        elif detail:
            self.say("The orders row is updated in place; the event log gets a new version")
        elif execution and i == 2:
            self.say("The fill is inserted into executions; the order's cumulative quantity is updated")
        else:
            self.say("Same transaction shape: update state, append event, stage outbox")

        anims = []
        new_order = self.text_in(order, self.orders_cell)
        anims += self.swap(self.orders_text, new_order)
        self.orders_text = new_order
        if execution:
            new_exec = self.text_in(execution, self.exec_cell)
            anims += self.swap(self.exec_text, new_exec)
            self.exec_text = new_exec
        ev = chip(event, DB_C, 8)
        cell = self.events_cell
        ev.move_to([cell.get_left()[0] + 0.08 + (i % 2) * 1.78 + ev.width / 2,
                    cell.get_center()[1] + (0.15 if i < 2 else -0.15), 0])
        self.event_chips.add(ev)
        pending = f"O-1 v{i + 1}" + (f" + E-{i - 1}" if execution else "")
        self.outbox_text = self.text_in(pending + "  pending", self.outbox_cell)
        anims += [FadeIn(ev, shift=LEFT * 0.15), FadeIn(self.outbox_text)]
        self.play(*anims, Indicate(self.orders_cell, color=DB_C, scale_factor=1.04), run_time=0.7)

        if i == 0:
            self.say("Each event row also stores the command, the resulting state and a full order snapshot")
            self.play(Indicate(ev, color=DB_C, scale_factor=1.25), run_time=1.0)
            self.wait(0.8)

        self.commit(VGroup(self.cells, self.names), [6.15, 3.05, 0])

        if i == 0:
            self.say("OutboxRelay publishes the staged messages to Kafka, then removes them from the outbox")
        elif i == 2:
            self.say("A fill publishes twice: the updated order and the execution, each on its own topic")
        speed = 1.0 if detail or i == 2 else 0.6
        self.play(Indicate(self.relay[0], color=KAFKA_C, scale_factor=1.08), run_time=0.4 * speed)
        for text in msgs:
            pkt = chip(text.replace("\n", " "), KAFKA_C, 9).move_to(self.outbox_cell)
            self.play(FadeIn(pkt, scale=0.6), run_time=0.2)
            slot = self.slots[self.next_slot]
            self.hop(pkt, [self.l_poll[0].get_start(), self.l_poll[0].get_end(),
                           self.l_pub[0].get_start(), self.l_pub[0].get_end(), slot.get_center()],
                     run_time=0.3 * speed)
            msg = fit(label(text, 9, INK, mono=True), slot.width - 0.08).move_to(slot)
            self.play(ReplacementTransform(pkt, msg), slot.animate.set_fill(KAFKA_C, opacity=0.25),
                      run_time=0.4)
            self.next_slot += 1
        self.play(FadeOut(self.outbox_text, shift=RIGHT * 0.3), run_time=0.35)

        if i == 0:
            self.say("PostgreSQL streaming replication copies the changed rows to the replica")
        wal = chip("WAL", DB_C, 10)
        self.send(wal, self.l_repl, run_time=0.7 * speed)
        new_replica = self.text_in(replica, self.replica_cell)
        self.play(FadeOut(wal, scale=0.5), *self.swap(self.replica_text, new_replica),
                  Indicate(self.replica_cell, color=DB_C, scale_factor=1.05), run_time=0.5)
        self.replica_text = new_replica
        self.wait(0.4)

    def query(self):
        self.say("The blotter asks the query-service, which reads the replica, never the primary")
        tok = chip("GET O-1", UI_C, 11)
        self.send(tok, self.l_q, run_time=0.7)
        self.hop(tok, [self.l_sel[0].get_start(), self.l_sel[0].get_end()], run_time=0.5)
        self.play(Indicate(self.replica_cell, color=DB_C, scale_factor=1.05), run_time=0.5)
        res = chip("O-1 FILLED 100 · avg 190.04", CORE, 10).move_to(self.l_sel[0].get_end())
        self.play(FadeOut(tok), FadeIn(res, scale=0.6), run_time=0.3)
        self.hop(res, [self.l_sel[0].get_start(), self.l_q[0].get_end(), self.l_q[0].get_start()], run_time=0.5)
        self.say("Read and write tables have the same shape. Replica reads can lag by milliseconds")
        self.play(FadeOut(res), run_time=0.4)
        self.wait(0.8)

    def recap(self):
        beats = [
            (VGroup(self.orders_cell, self.exec_cell, self.names[:2]), DB_C,
             "orders + executions: the current state, and the source of truth"),
            (VGroup(self.events_cell, self.names[2]), DB_C,
             "order_events: four versions, each carrying the full order as it was"),
            (self.slots, KAFKA_C, "Kafka: full order and execution state, delivered through the outbox"),
            (VGroup(self.replica[0], self.qs[0]), STREAM, "Read side: a replica of the write tables"),
        ]
        for target, color, text in beats:
            self.say(text)
            self.play(Circumscribe(target, color=color, buff=0.08), run_time=1.2)
            self.wait(0.5)
        self.wait(1.5)
        self.takeaways("Approach A in short", [
            ("Truth", DB_C, "orders and executions tables hold the current state"),
            ("Event log", DB_C, "4 rows in order_events, each with a full order snapshot"),
            ("Loading", CORE, "the next command reads one row; history length doesn't matter"),
            ("Publishing", KAFKA_C, "outbox → Kafka, written in the same transaction as the state"),
            ("Read side", STREAM, "query-service on a replica: same tables, same shape"),
        ])


# ======================================================================================= Approach B

# (command, caption, handler, event, payload, state after applying, read model row, kafka label)
COMMANDS_B = [
    ("CreateOrder", "A trader sends a new order: BUY 100 AAPL",
     "@CommandHandler (constructor)\nvalidate · O-1", "OrderCreated", "AAPL BUY 100",
     "state  UNACK\ncum    0 / 100", "O-1 · UNACK · cum 0", "Created"),
    ("AcceptOrder", "The order is acknowledged: AcceptOrder",
     "@CommandHandler accept()\nrequires state UNACK", "OrderAccepted", "",
     "state  LIVE\ncum    0 / 100", "O-1 · LIVE · cum 0", "Accepted"),
    ("RecordExecution E-1", "First execution arrives: 60 @ 190.00",
     "@CommandHandler execute()\n60 ≤ leaves 100", "OrderExecuted", "E-1 60 @ 190.00",
     "state  LIVE\ncum    60 / 100", "O-1 · LIVE · cum 60", "Exec\nE-1"),
    ("RecordExecution E-2", "Second execution: 40 @ 190.10 completes the order",
     "@CommandHandler execute()\n40 ≤ leaves 40", "OrderExecuted", "E-2 40 @ 190.10",
     "state  FILLED\ncum    100 / 100", "O-1 · FILLED · cum 100", "Exec\nE-2"),
]


class ApproachB(FlowScene):
    def construct(self):
        self.title_card("Approach B · Event-sourced with Axon",
                        "One order: UNACK → LIVE → FILLED with two executions")
        self.build()
        for i, c in enumerate(COMMANDS_B):
            self.command(i, *c)
        self.query()
        self.rebuild()
        self.recap()

    def build(self):
        self.client = component("Client", "FIX / REST", UI_C, 1.9, 1.4, [-5.75, 1.85, 0])
        self.agg = component("Order aggregate", "event-sourced · in memory", CORE, 3.6, 1.9, [-1.7, 1.85, 0])
        self.state_cell = Rectangle(width=3.1, height=0.58, stroke_color=CORE, stroke_width=1.2)
        self.state_cell.move_to([-1.7, 1.2, 0])
        self.handler_text = self.state_text = None

        self.store = component("PostgreSQL · event store", "domain_event_entry · append-only", DB_C, 5.0, 2.4,
                               [4.3, 1.9, 0])
        self.row_y = [2.05, 1.72, 1.39, 1.06]
        col_head = label("seq  type            payload", 10, MUTED, mono=True)
        col_head.move_to([2.0, 2.35, 0], aligned_edge=LEFT)
        self.rows = []

        self.proj = component("Projection", "tracking processor · token —", STREAM, 3.0, 0.9, [1.4, -0.55, 0])
        self.pub = component("Kafka publisher", "event processor · optional", KAFKA_C, 2.8, 0.9, [5.3, -0.55, 0])
        self.hydr = None

        self.view = component("order_view", "read model · PostgreSQL", STREAM, 3.0, 1.3, [1.4, -2.55, 0])
        self.view_cell = Rectangle(width=2.7, height=0.34, stroke_color=STREAM, stroke_width=1.2)
        self.view_cell.move_to([1.4, -2.92, 0])
        self.view_text = None
        self.kafka = component("Kafka", "oms_orders", KAFKA_C, 2.8, 1.3, [5.3, -2.55, 0])
        self.slots = VGroup(*[Rectangle(width=0.6, height=0.42, stroke_color=KAFKA_C, stroke_width=1.5)
                              for _ in range(4)]).arrange(RIGHT, buff=0).move_to([5.3, -2.92, 0])
        self.qh = component("Query handler", "@QueryHandler", CORE, 2.6, 1.3, [-2.3, -2.55, 0])
        self.ui = component("Blotter / UI", "QueryGateway", UI_C, 2.2, 1.3, [-5.6, -2.55, 0])

        self.l_cmd = link([-4.75, 1.85, 0], [-3.55, 1.85, 0], "command")
        self.l_append = link([0.15, 2.2, 0], [1.75, 2.2, 0], "append")
        self.l_load = link([1.75, 1.45, 0], [0.15, 1.45, 0], "load events", side=DOWN)
        self.l_proj = link([2.4, 0.66, 0], [2.4, -0.07, 0], "tail", side=RIGHT)
        self.l_pubk = link([5.3, 0.66, 0], [5.3, -0.07, 0], "tail", side=RIGHT)
        self.l_apply = link([1.4, -1.03, 0], [1.4, -1.87, 0], "update", side=RIGHT)
        self.l_kafka = link([5.3, -1.03, 0], [5.3, -1.87, 0], "send", side=RIGHT)
        self.l_sel = link([-0.97, -2.55, 0], [-0.13, -2.55, 0])
        self.l_q = link([-4.47, -2.55, 0], [-3.63, -2.55, 0])

        write, read = self.bands()
        self.say("A typical Axon setup on PostgreSQL, without Axon Server. Team B to confirm the details")
        self.play(LaggedStart(FadeIn(write), FadeIn(self.client), FadeIn(self.agg), FadeIn(self.state_cell),
                              FadeIn(self.store), FadeIn(col_head), lag_ratio=0.15), run_time=1.8)
        self.play(*show_link(self.l_cmd), *show_link(self.l_append), *show_link(self.l_load))
        self.play(FadeIn(self.proj), FadeIn(self.pub), *show_link(self.l_proj), *show_link(self.l_pubk))
        self.play(LaggedStart(FadeIn(read), FadeIn(self.view), FadeIn(self.view_cell), FadeIn(self.kafka),
                              FadeIn(self.slots), FadeIn(self.qh), FadeIn(self.ui), lag_ratio=0.15),
                  run_time=1.4)
        self.play(*show_link(self.l_apply), *show_link(self.l_kafka), *show_link(self.l_sel), *show_link(self.l_q))
        self.wait(0.5)

    def set_state(self, text, run_time=0.35):
        new = fit(label(text, 11, INK, mono=True), 2.9).move_to(self.state_cell)
        self.play(*self.swap(self.state_text, new), run_time=run_time)
        self.state_text = new

    def set_hydr(self, text):
        new = label(text, 13, CORE, mono=True).move_to([-4.0, -0.55, 0])
        self.play(*self.swap(self.hydr, new), run_time=0.3)
        self.hydr = new

    def set_token(self, text):
        old = self.proj[1][1]
        new = label(f"tracking processor · token {text}", 12, MUTED, mono=True).move_to(old)
        self.play(Transform(old, new), run_time=0.25)

    def hydrate(self, n):
        detail = n == 1
        if detail:
            self.say("Before handling it, Axon rebuilds the aggregate by replaying its events: hydration")
        elif n == 3:
            self.say("Every command replays the whole stream. For long streams, snapshots or caching cut this")
        self.set_state("(empty)")
        self.set_hydr(f"hydrating: 0 / {n} events")
        for j in range(n):
            ev = COMMANDS_B[j][3]
            self.play(Indicate(self.rows[j], color=DB_C, scale_factor=1.05), run_time=0.35 if detail else 0.2)
            tok = chip(ev, DB_C, 9)
            self.send(tok, self.l_load, run_time=0.5 if detail else 0.3)
            self.play(FadeOut(tok, scale=0.5), run_time=0.15)
            self.set_state(COMMANDS_B[j][5], run_time=0.3 if detail else 0.2)
            self.set_hydr(f"hydrating: {j + 1} / {n} events")

    def command(self, i, cmd, caption, handler, event, payload, state, view_row, kafka_label):
        detail = i < 2
        self.say(caption)
        tok = chip(cmd, UI_C, 11)
        self.send(tok, self.l_cmd)
        self.play(FadeOut(tok, scale=0.5), run_time=0.3)

        if i == 0:
            self.say("A new aggregate: nothing to load")
            self.set_hydr("hydrating: none (new)")
        else:
            self.hydrate(i)

        if detail:
            self.say("The handler checks its rules against the rebuilt state and emits an event")
        new_handler = fit(label(handler, 11, CORE, mono=True), 3.3).move_to([-1.7, 1.78, 0])
        self.play(*self.swap(self.handler_text, new_handler), run_time=0.4)
        self.handler_text = new_handler

        ev = chip(event, DB_C, 9)
        self.send(ev, self.l_append, run_time=0.6)
        row = label(f"{i:<4} {event:<15} {payload}".rstrip(), 10, INK, mono=True)
        row.move_to([2.0, self.row_y[i], 0], aligned_edge=LEFT)
        fit(row, 4.6)
        self.play(FadeOut(ev, scale=0.5), FadeIn(row), FadeOut(self.hydr), run_time=0.4)
        self.hydr = None
        self.rows.append(row)
        if i == 0:
            self.say("Only the event is stored, with just what changed. There is no orders table")
            self.play(Indicate(row, color=DB_C, scale_factor=1.1), run_time=0.9)

        if detail:
            self.say("Applying the event to the aggregate gives its new state")
        elif i == 3:
            self.say("FILLED isn't stored anywhere: it follows from cum = qty when the event is applied")
        self.set_state(state)
        if i == 0:
            self.say("Without caching, the in-memory aggregate is dropped after the command")
        self.play(FadeOut(self.state_text), FadeOut(self.handler_text), run_time=0.4)
        self.state_text = self.handler_text = None

        if i == 0:
            self.say("Event processors tail the store independently, each tracking its own position")
        speed = 1.0 if detail else 0.6
        p1 = chip(event, STREAM, 9).move_to(self.l_proj[0].get_start())
        p2 = chip(event, KAFKA_C, 9).move_to(self.l_pubk[0].get_start())
        self.play(FadeIn(p1, scale=0.6), FadeIn(p2, scale=0.6), run_time=0.25)
        self.play(p1.animate.move_to(self.l_proj[0].get_end()), p2.animate.move_to(self.l_pubk[0].get_end()),
                  run_time=0.5 * speed)
        self.set_token(str(i))
        slot = self.slots[i]
        self.play(p1.animate.move_to(self.l_apply[0].get_end()), p2.animate.move_to(slot.get_center()),
                  run_time=0.6 * speed)
        new_view = self.text_in(view_row, self.view_cell)
        msg = fit(label(kafka_label, 8, INK, mono=True), slot.width - 0.06).move_to(slot)
        self.play(FadeOut(p1, scale=0.5), *self.swap(self.view_text, new_view),
                  ReplacementTransform(p2, msg), slot.animate.set_fill(KAFKA_C, opacity=0.25),
                  Indicate(self.view_cell, color=STREAM, scale_factor=1.05), run_time=0.5)
        self.view_text = new_view
        if i == 0:
            self.say("The projection turns the event into a query-friendly row in order_view")
            self.wait(0.6)
        self.wait(0.3)

    def query(self):
        self.say("The blotter asks a query handler, which reads the projection")
        tok = chip("GET O-1", UI_C, 10)
        self.send(tok, self.l_q, run_time=0.5)
        self.hop(tok, [self.l_sel[0].get_start(), self.l_sel[0].get_end()], run_time=0.4)
        self.play(Indicate(self.view_cell, color=STREAM, scale_factor=1.05), run_time=0.5)
        res = chip("O-1 FILLED 100 · avg 190.04", CORE, 10).move_to(self.l_sel[0].get_end())
        self.play(FadeOut(tok), FadeIn(res, scale=0.6), run_time=0.3)
        self.hop(res, [self.l_sel[0].get_start(), self.l_q[0].get_end(), self.l_q[0].get_start()], run_time=0.45)
        self.say("The read model can lag the event store by milliseconds to seconds")
        self.play(FadeOut(res), run_time=0.4)
        self.wait(0.6)

    def rebuild(self):
        self.say("Read models are derived: reset the token and the projection rebuilds from the events")
        self.set_token("—")
        self.play(FadeOut(self.view_text), run_time=0.4)
        self.view_text = None
        for i, c in enumerate(COMMANDS_B):
            p = chip(c[3], STREAM, 9).move_to(self.rows[i])
            self.play(FadeIn(p, scale=0.6), Indicate(self.rows[i], color=DB_C, scale_factor=1.05), run_time=0.2)
            self.hop(p, [self.l_proj[0].get_start(), self.l_proj[0].get_end(), self.l_apply[0].get_end()],
                     run_time=0.2)
            self.set_token(str(i))
            new_view = self.text_in(c[6], self.view_cell)
            self.play(FadeOut(p, scale=0.5), *self.swap(self.view_text, new_view), run_time=0.25)
            self.view_text = new_view
        self.say("The same replay can build new views, e.g. a blotter per desk, from the full history")
        self.wait(1.2)

    def recap(self):
        beats = [
            (VGroup(*self.rows), DB_C, "The event store: four events, each holding only what changed"),
            (VGroup(self.agg[0]), CORE, "The aggregate's state exists only in memory, rebuilt for each command"),
            (VGroup(self.view[0], self.qh[0]), STREAM, "Read side: a projection, shaped for queries and rebuildable"),
            (VGroup(self.pub[0], self.kafka[0]), KAFKA_C, "Kafka: fed by another processor, with its own position"),
        ]
        for target, color, text in beats:
            self.say(text)
            self.play(Circumscribe(target, color=color, buff=0.08), run_time=1.2)
            self.wait(0.5)
        self.wait(1.5)
        self.takeaways("Approach B in short", [
            ("Truth", DB_C, "the event store: 4 events, each holding only what changed"),
            ("Loading", CORE, "each command replays the stream; snapshots or caching shorten it"),
            ("Concurrency", CORE, "the aggregate's sequence number rejects conflicting appends"),
            ("Publishing", KAFKA_C, "an event processor forwards events, tracking its own position"),
            ("Read side", STREAM, "projections build query tables; reset the token to rebuild them"),
        ])


# ======================================================================================= Side by side

ROWS = [
    ("Stored once FILLED", "orders 1 · executions 2\norder_events 4, each a full snapshot",
     "domain_event_entry 4\nchanges only"),
    ("Source of truth", "current-state tables", "the events"),
    ("Next command loads O-1", "reads 1 row", "replays 4 events\n(or snapshot + newer events)"),
    ("State after accept (v2)", "reads the snapshot stored with v2", "replays the first 2 events"),
    ("Read side", "replica: a copy of the write tables", "projection: derived, rebuildable"),
    ("Kafka carries", "full order / execution state", "the domain events (if forwarded)"),
]


class SideBySide(Narrated):
    def construct(self):
        title = label("Same order, two sources of truth", 32, bold=True).to_edge(UP, buff=0.35)
        self.play(Write(title))

        xs = [-6.7, -1.0, 4.2]
        heads = VGroup(
            label("O-1 · UNACK → LIVE → FILLED", 14, MUTED).move_to([xs[0], 2.7, 0], aligned_edge=LEFT),
            label("A · state-stored + event log", 18, DB_C, bold=True).move_to([xs[1], 2.7, 0]),
            label("B · event-sourced (Axon)", 18, CORE, bold=True).move_to([xs[2], 2.7, 0]),
        )
        rule = Line([-6.8, 2.38, 0], [6.8, 2.38, 0], stroke_color=MUTED, stroke_width=1)
        self.play(FadeIn(heads), Create(rule))

        y = 1.85
        for key, a, b in ROWS:
            k = fit(label(key, 15, INK, bold=True), 3.3).move_to([xs[0], y, 0], aligned_edge=LEFT)
            va = fit(label(a, 14, INK, mono=True), 4.8).move_to([xs[1], y, 0])
            vb = fit(label(b, 14, INK, mono=True), 4.8).move_to([xs[2], y, 0])
            self.play(FadeIn(k, shift=RIGHT * 0.15), run_time=0.4)
            self.play(FadeIn(va, shift=UP * 0.1), FadeIn(vb, shift=UP * 0.1), run_time=0.5)
            self.wait(2.0)
            y -= 0.82

        self.say("Same business outcome. The difference is what is stored as the truth, and what is derived")
        self.wait(4)
