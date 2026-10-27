"""Shared palette and building blocks for the OMS explainer animations."""

from manim import *

config.background_color = "#0f172a"

INK = "#e2e8f0"
MUTED = "#94a3b8"
UI_C = "#f472b6"
CORE = "#38bdf8"
DB_C = "#34d399"
KAFKA_C = "#fbbf24"
STREAM = "#a78bfa"
WARN = "#f87171"
MONO = "Consolas"
SANS = "Segoe UI"


def label(text, size=14, color=INK, mono=False, bold=False):
    kwargs = {"font_size": size, "color": color, "font": MONO if mono else SANS}
    if bold:
        kwargs["weight"] = BOLD
    return Text(text, **kwargs)


def component(title, subtitle, color, width, height, center):
    """A titled box; index 0 is the frame, index 1 the heading."""
    frame = RoundedRectangle(
        corner_radius=0.12, width=width, height=height,
        stroke_color=color, stroke_width=2.5, fill_color=color, fill_opacity=0.07,
    ).move_to(center)
    head = VGroup(label(title, 20, color, bold=True), label(subtitle, 12, MUTED, mono=True))
    head.arrange(DOWN, buff=0.06).next_to(frame.get_top(), DOWN, buff=0.12)
    return VGroup(frame, head)


def chip(text, color, size=12):
    t = label(text, size, INK, mono=True)
    bg = RoundedRectangle(
        corner_radius=0.08, width=t.width + 0.22, height=t.height + 0.16,
        stroke_color=color, stroke_width=1.5, fill_color=color, fill_opacity=0.4,
    )
    return VGroup(bg, t.move_to(bg))


def link(start, end, text=None, side=UP):
    """An arrow with an optional caption; index 0 is the arrow."""
    arrow = Arrow(start, end, buff=0.06, stroke_width=2.5, color=MUTED,
                  max_tip_length_to_length_ratio=0.18)
    if text is None:
        return VGroup(arrow)
    return VGroup(arrow, label(text, 10, MUTED, mono=True).next_to(arrow, side, buff=0.06))


def show_link(group):
    anims = [GrowArrow(group[0])]
    if len(group) > 1:
        anims.append(FadeIn(group[1]))
    return anims


class Narrated(Scene):
    """A scene with a single caption line along the bottom edge."""

    caption = None
    # Seconds a caption stays up before the next may replace it: a base plus reading time per character.
    READ_BASE = 1.0
    READ_PER_CHAR = 0.055

    def say(self, text):
        new = label(text, 20).move_to(DOWN * 3.7)
        if new.width > 13.4:
            new.scale_to_fit_width(13.4)
        if self.caption is not None:
            shown = self.renderer.time - self.caption_at
            needed = self.READ_BASE + self.READ_PER_CHAR * len(self.caption_text)
            if shown < needed:
                self.wait(needed - shown)
            self.play(FadeOut(self.caption, shift=UP * 0.15), run_time=0.25)
        self.play(FadeIn(new, shift=UP * 0.15), run_time=0.4)
        self.caption = new
        self.caption_text = text
        self.caption_at = self.renderer.time

    def title_card(self, title, subtitle):
        t = label(title, 44, bold=True)
        s = label(subtitle, 24, MUTED)
        card = VGroup(t, s).arrange(DOWN, buff=0.35)
        if card.width > 13:
            card.scale_to_fit_width(13)
        self.play(Write(t), run_time=1.2)
        self.play(FadeIn(s, shift=UP * 0.2))
        self.wait(1.5)
        self.play(FadeOut(card))
