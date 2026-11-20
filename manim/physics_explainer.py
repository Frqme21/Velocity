from manim import *

BG = "#0D1117"
FG = "#F0F4F8"
SLATE = "#94A3B8"
CYAN = "#38BDF8"
PINK = "#F472B6"
FONT = "Monochrome Aviation"

config.background_color = BG


def txt(text, size=28, color=FG, **kwargs):
    return Text(text, font=FONT, font_size=size, color=color, **kwargs)


def fit(mob, width=None):
    target = width or (config.frame_width - 1.5)
    if mob.width > target:
        mob.scale_to_fit_width(target)
    return mob


def chip(text, size=20, color=FG, stroke=SLATE):
    box = Rectangle(
        width=max(2.2, len(text) * size * 0.0074),
        height=0.58,
        color=stroke,
        stroke_width=1.2,
        fill_color=BG,
        fill_opacity=0.85,
    )
    word = fit(txt(text, size=size, color=color), width=box.width - 0.25)
    word.move_to(box)
    return VGroup(box, word)


def formula(text, size=26, color=FG, background=True, width=None):
    mob = fit(txt(text, size=size, color=color), width)
    if background:
        mob.add_background_rectangle(color=BG, opacity=0.92, buff=0.12)
    mob.set_z_index(10)
    return mob


def side_card(items, width=5.6):
    group = VGroup(*items).arrange(DOWN, aligned_edge=LEFT, buff=0.32)
    group.to_edge(RIGHT, buff=0.6).shift(DOWN * 0.5)
    group.scale_to_fit_width(min(width, group.width))
    return group


class VelocityPhysics(Scene):
    def header(self, title, subtitle=""):
        head = txt(title, size=38, color=FG).to_edge(UP, buff=0.5)
        group = VGroup(head)
        if subtitle:
            sub = txt(subtitle, size=20, color=SLATE)
            sub.next_to(head, DOWN, buff=0.16)
            group.add(sub)
        return group

    def chapter(self, title, subtitle=""):
        group = self.header(title, subtitle)
        self.play(FadeIn(group, shift=DOWN * 0.18), run_time=0.7)
        self.wait(0.35)
        return group

    def construct(self):
        self.intro()
        self.clock()
        self.ground_and_jump()
        self.dash()
        self.sensory()
        self.grapple()
        self.projectiles()
        self.mech()
        self.outro()

    def intro(self):
        title = txt("VELOCITY", size=76, color=FG)
        subtitle = txt("THE PHYSICS BEHIND THE PARKOUR", size=29, color=CYAN)
        tag = txt("BABYLON.JS + RAPIER3D", size=20, color=SLATE)
        group = VGroup(title, subtitle, tag).arrange(DOWN, buff=0.34).center()

        self.play(
            LaggedStart(
                FadeIn(title, shift=DOWN * 0.25),
                FadeIn(subtitle, shift=DOWN * 0.2),
                FadeIn(tag, shift=DOWN * 0.15),
                lag_ratio=0.18,
            ),
            run_time=1.4,
        )
        self.wait(1.0)
        self.play(FadeOut(group, shift=UP * 0.2), run_time=0.6)

    def clock(self):
        head = self.chapter("ONE FRAME, THREE CLOCKS", "dt is clamped. hit-stop freezes. sensory boost scales.")

        cards = VGroup(
            chip("REAL dt: 0.016 s", size=21, stroke=CYAN),
            chip("SIM dt: 0.016 s", size=21, stroke=CYAN),
            chip("WORLD SCALE: 1.00", size=21, stroke=CYAN),
        ).arrange(DOWN, aligned_edge=LEFT, buff=0.38)
        cards.to_edge(LEFT, buff=0.7).shift(DOWN * 0.4)

        eqs = side_card([
            formula("sim_dt = frozen ? 0 : dt", size=24),
            formula("world_dt = sim_dt * timeScale", size=24, color=CYAN),
            formula("frame dt cap = 0.05 s", size=22, color=SLATE),
        ])

        self.play(LaggedStart(*[FadeIn(c, shift=RIGHT * 0.2) for c in cards], lag_ratio=0.14), run_time=0.8)
        self.play(FadeIn(eqs, shift=LEFT * 0.2), run_time=0.7)
        self.wait(0.5)

        sim_text = fit(txt("SIM dt: 0.000 s", size=21, color=PINK), width=cards[1].width - 0.25)
        sim_text.move_to(cards[1][1])
        self.play(ReplacementTransform(cards[1][1], sim_text), run_time=0.5)
        self.play(Indicate(sim_text, color=PINK), run_time=0.6)
        self.wait(0.4)
        self.play(ReplacementTransform(sim_text, cards[1][1]), run_time=0.5)

        world_text = fit(txt("WORLD SCALE: 0.20", size=21, color=PINK), width=cards[2].width - 0.25)
        world_text.move_to(cards[2][1])
        self.play(ReplacementTransform(cards[2][1], world_text), run_time=0.5)
        self.play(Indicate(world_text, color=PINK), run_time=0.6)
        self.wait(0.4)
        self.play(ReplacementTransform(world_text, cards[2][1]), run_time=0.5)
        self.wait(0.6)

        self.play(FadeOut(VGroup(head, cards, eqs), shift=UP * 0.2), run_time=0.6)

    def ground_and_jump(self):
        head = self.chapter("GROUND MOTION AND THE JUMP", "80 m/s^2 on the floor. 2.17 m of apex.")

        forms = side_card([
            formula("drop = max(speed, 2.03) * 7 * dt", size=23),
            formula("a = min(8 * 10 * dt, 10 - currentSpeed)", size=23, color=CYAN),
            formula("run speed = 10 m/s", size=23, color=PINK),
        ])

        track = Line(LEFT * 6.0, RIGHT * 0.2, color=SLATE, stroke_width=2)
        track.shift(DOWN * 2.2)
        self.play(Create(track), FadeIn(forms), run_time=0.8)

        progress = ValueTracker(0)
        self.add(progress)

        runner = always_redraw(
            lambda: Dot(
                track.point_from_proportion(progress.get_value()),
                color=PINK,
                radius=0.13,
            ).set_z_index(10)
        )
        vel_arrow = always_redraw(
            lambda: Arrow(
                track.point_from_proportion(progress.get_value()) + UP * 0.25,
                track.point_from_proportion(progress.get_value()) + UP * 0.25 + RIGHT * (0.4 + 2.0 * progress.get_value()),
                buff=0,
                color=PINK,
                stroke_width=4,
            ).set_z_index(8)
        )
        self.play(FadeIn(runner), Create(vel_arrow), run_time=0.6)
        self.play(progress.animate.set_value(1), run_time=2.2, rate_func=smooth)
        self.wait(0.4)
        self.play(FadeOut(VGroup(track, runner, vel_arrow, forms)), run_time=0.5)

        axes = Axes(
            x_range=[0, 10, 2],
            y_range=[0, 2.6, 0.5],
            x_length=6.2,
            y_length=3.2,
            axis_config={"color": SLATE, "stroke_width": 2, "include_ticks": False},
        ).shift(LEFT * 2.7 + DOWN * 1.1)

        g = 20.32
        v0 = 9.4
        run = 10.0

        def height(t):
            return v0 * t - 0.5 * g * t * t

        curve = axes.plot(lambda x: height(x / run), x_range=[0, 2 * v0 / g * run], color=CYAN, stroke_width=4)
        apex_dot = Dot(axes.c2p(v0 / g * run, height(v0 / g)), color=PINK, radius=0.1).set_z_index(10)

        jforms = side_card([
            formula("apex = v0^2 / (2g) = 2.17 m", size=23, color=PINK),
            formula("g_up = 20.32, g_down = 30.48", size=23),
            formula("rise time = v0 / g = 0.463 s", size=23, color=CYAN),
        ])

        self.play(Create(axes), Create(curve), run_time=1.0)
        self.play(FadeIn(apex_dot), FadeIn(jforms), run_time=0.7)

        t = ValueTracker(0)
        self.add(t)
        mover = always_redraw(
            lambda: Dot(
                axes.c2p(run * t.get_value(), height(t.get_value())),
                color=PINK,
                radius=0.11,
            ).set_z_index(10)
        )
        self.play(FadeIn(mover), run_time=0.4)
        self.play(t.animate.set_value(2 * v0 / g), run_time=2.2, rate_func=smooth)
        self.play(Indicate(apex_dot, color=PINK), run_time=0.8)
        self.wait(0.8)

        self.play(FadeOut(VGroup(head, axes, curve, apex_dot, mover, jforms)), run_time=0.6)

    def dash(self):
        head = self.chapter("DASH VECTOR", "Look direction decides the impulse. Pitch only adds vertical speed.")

        origin = LEFT * 3.2 + DOWN * 1.0
        flat_end = origin + RIGHT * 3.4
        flat = Arrow(origin, flat_end, buff=0, color=CYAN, stroke_width=5)

        forms = side_card([
            formula("flat = normalize((dx, 0, dz))", size=22, color=CYAN),
            formula("v_xz = 24 * flat", size=22, color=PINK),
            formula("y = (pitch - sign(pitch) * 0.38) / 0.62", size=22),
            formula("v_y = clamp(24 * y * 0.55, -14, 6.5)", size=22, color=PINK),
        ])

        self.play(Create(flat), FadeIn(forms), run_time=0.8)
        self.wait(0.4)

        angle_label = txt("dead zone = 22.3 deg", size=19, color=SLATE)
        angle_label.next_to(flat, DOWN, buff=0.4).align_to(flat, LEFT)
        self.play(FadeIn(angle_label), run_time=0.5)

        sweep = ValueTracker(0.0)
        self.add(sweep)

        moving_look = always_redraw(
            lambda: Arrow(
                origin,
                origin + RIGHT * 3.0 + UP * (0.2 + 2.6 * sweep.get_value()),
                buff=0,
                color=PINK,
                stroke_width=5,
            ).set_z_index(8)
        )
        drop_line = always_redraw(
            lambda: DashedLine(
                origin + RIGHT * 3.0 + UP * (0.2 + 2.6 * sweep.get_value()),
                origin + RIGHT * 3.0,
                color=SLATE,
                dashed_ratio=0.5,
            )
        )
        readout = always_redraw(
            lambda: formula(
                "vertical speed = {:.1f} m/s".format(
                    max(-14, min(6.5, (max(0, 0.2 + 2.6 * sweep.get_value() - 0.38) / 0.62) * 24 * 0.55))
                ),
                size=20,
                color=PINK,
                width=5.4,
            ).next_to(angle_label, DOWN, buff=0.35).align_to(angle_label, LEFT)
        )
        self.play(FadeIn(moving_look), Create(drop_line), FadeIn(readout), run_time=0.6)
        self.play(sweep.animate.set_value(1.0), run_time=1.8, rate_func=smooth)
        self.wait(0.5)

        note = txt("dash distance = 24 * 0.2 = 4.8 m", size=20, color=CYAN)
        note.to_edge(DOWN, buff=0.6).align_to(flat, LEFT)
        self.play(FadeIn(note), run_time=0.5)
        self.wait(0.6)

        self.play(FadeOut(VGroup(head, flat, moving_look, drop_line, forms, angle_label, readout, note)), run_time=0.6)

    def sensory(self):
        head = self.chapter("SENSORY BOOST", "The player stays fast while the world slows to 20 percent.")

        real_track = Line(LEFT * 6.0, RIGHT * 0.2, color=SLATE, stroke_width=2).shift(UP * 0.8)
        world_track = Line(LEFT * 6.0, RIGHT * 0.2, color=SLATE, stroke_width=2).shift(DOWN * 1.0)

        real_label = txt("REAL TIME  1.00", size=19, color=CYAN)
        real_label.next_to(real_track, UP, buff=0.25).align_to(real_track, LEFT)
        world_label = txt("WORLD TIME  1.00", size=19, color=PINK)
        world_label.next_to(world_track, UP, buff=0.25).align_to(world_track, LEFT)

        forms = side_card([
            formula("smooth = r^2 * (3 - 2r), r = t / 0.25", size=22),
            formula("timeScale = lerp(1, 0.2, smooth)", size=22, color=PINK),
            formula("duration = 3 s", size=22, color=CYAN),
        ])

        p = ValueTracker(0)
        self.add(p)

        real_dot = always_redraw(
            lambda: Dot(
                real_track.point_from_proportion(min(1, p.get_value() / 3)),
                color=CYAN,
                radius=0.12,
            ).set_z_index(10)
        )

        def world_fraction():
            seconds = p.get_value()
            r = min(1, seconds / 0.25)
            eased = r * r * (3 - 2 * r)
            scale = 1 - 0.8 * eased
            return min(1, seconds * scale / 3)

        world_dot = always_redraw(
            lambda: Dot(world_track.point_from_proportion(world_fraction()), color=PINK, radius=0.12).set_z_index(10)
        )

        self.play(Create(real_track), Create(world_track), FadeIn(VGroup(real_label, world_label)), run_time=0.8)
        self.play(FadeIn(forms), FadeIn(real_dot), FadeIn(world_dot), run_time=0.7)
        self.play(p.animate.set_value(3), run_time=3.0, rate_func=smooth)
        self.wait(0.6)

        self.play(FadeOut(VGroup(head, real_track, world_track, real_label, world_label, forms, real_dot, world_dot)), run_time=0.6)

    def grapple(self):
        head = self.chapter("GRAPPLE: AIM, PULL, ARC", "A cone picks the ring. A ramp pulls you in. A parabola lands you.")

        cam = Dot(LEFT * 5.4 + DOWN * 1.0, color=FG, radius=0.13)
        upper = cam.get_center() + RIGHT * 5.0 + UP * 2.0
        lower = cam.get_center() + RIGHT * 5.0 + DOWN * 1.6
        cone = VGroup(
            Line(cam.get_center(), upper, color=SLATE, stroke_width=2),
            Line(cam.get_center(), lower, color=SLATE, stroke_width=2),
        )
        target = Dot(LEFT * 1.0 + UP * 0.3, color=PINK, radius=0.16)
        other = Dot(LEFT * 0.3 + DOWN * 1.5, color=SLATE, radius=0.11)
        far = Dot(RIGHT * 3.4 + UP * 1.0, color=SLATE, radius=0.11)

        cam_label = txt("camera", size=17, color=SLATE).next_to(cam, DOWN, buff=0.25)
        pick_label = txt("picked", size=17, color=PINK).next_to(target, UP, buff=0.25)
        aim_group = VGroup(cam, cone, target, other, far, cam_label, pick_label)

        gforms = side_card([
            formula("range = 34 m, cone = 35.5 deg", size=22, color=CYAN),
            formula("score = angle / 0.62 - 0.45 * sticky", size=22, color=PINK),
            formula("LOS sphere radius = 0.4 m", size=22),
        ])

        self.play(Create(cam), Create(cone), FadeIn(VGroup(cam_label, pick_label)), run_time=0.8)
        self.play(LaggedStart(*[FadeIn(d) for d in [target, other, far]], lag_ratio=0.2), run_time=0.7)
        self.play(FadeIn(gforms), run_time=0.7)
        self.play(Indicate(target, color=PINK), run_time=0.7)
        self.wait(0.6)
        self.play(FadeOut(VGroup(aim_group, gforms), shift=UP * 0.2), run_time=0.5)

        start = LEFT * 5.2 + DOWN * 1.2
        anchor = RIGHT * 0.6 + UP * 1.2
        tether = Line(start, anchor, color=SLATE, stroke_width=2)
        a_dot = Dot(anchor, color=PINK, radius=0.15)
        p_dot = Dot(start, color=FG, radius=0.13)

        pforms = side_card([
            formula("v = min(22 + 8 * progress, 34) m/s", size=22, color=CYAN),
            formula("blend = 1 - exp(-9 * dt)", size=22, color=PINK),
        ])

        q = ValueTracker(0)
        self.add(q)
        mover = always_redraw(
            lambda: Dot(start + (anchor - start) * q.get_value(), color=PINK, radius=0.13).set_z_index(10)
        )
        speed_readout = always_redraw(
            lambda: formula(
                "speed = {:.1f} m/s".format(min(34, 22 + 8 * q.get_value())),
                size=20,
                color=PINK,
                width=5.4,
            ).next_to(pforms, DOWN, buff=0.4).align_to(pforms, LEFT)
        )

        self.play(Create(tether), FadeIn(VGroup(a_dot, p_dot)), FadeIn(pforms), run_time=0.8)
        self.play(FadeIn(mover), FadeIn(speed_readout), run_time=0.4)
        self.play(q.animate.set_value(0.93), run_time=2.0, rate_func=smooth)
        self.wait(0.4)
        self.play(FadeOut(VGroup(tether, a_dot, p_dot, mover, pforms, speed_readout), shift=UP * 0.2), run_time=0.5)

        ledge = Rectangle(width=2.6, height=0.4, color=SLATE, fill_color=SLATE, fill_opacity=0.25)
        ledge.shift(RIGHT * 1.6 + DOWN * 1.1)
        lstart = LEFT * 4.6 + DOWN * 2.6
        lend = ledge.get_center() + UP * 0.7
        arc = VMobject(color=PINK, stroke_width=4)
        arc.set_points_smoothly([
            lstart,
            lstart + RIGHT * 1.4 + UP * 1.3,
            lstart + RIGHT * 3.0 + UP * 1.7,
            lend,
        ])

        vforms = side_card([
            formula("v_up = 6.2 m/s", size=22, color=PINK),
            formula("apex = 6.2^2 / (2 * 20.32) = 0.946 m", size=22),
            formula("v_forward = distance / (t_up + t_down)", size=22, color=CYAN),
        ])

        r = ValueTracker(0)
        self.add(r)
        flyer = always_redraw(lambda: Dot(arc.point_from_proportion(r.get_value()), color=PINK, radius=0.13).set_z_index(10))

        self.play(Create(ledge), Create(arc), FadeIn(vforms), run_time=0.9)
        self.play(FadeIn(flyer), run_time=0.4)
        self.play(r.animate.set_value(1), run_time=2.0, rate_func=smooth)
        self.wait(0.6)

        self.play(FadeOut(VGroup(head, ledge, arc, flyer, vforms), shift=UP * 0.2), run_time=0.6)

    def projectiles(self):
        head = self.chapter("STRAIGHT BOLTS, CURVING STARS", "No gravity on bullets. Homing steering on shuriken.")

        shooter = Dot(LEFT * 6.0 + UP * 1.0, color=SLATE, radius=0.12)
        victim = Dot(RIGHT * 0.0 + UP * 1.8, color=FG, radius=0.12)
        bolt_line = Line(shooter.get_center(), victim.get_center(), color=CYAN, stroke_width=4)
        b_label = txt("BOLT  26 m/s", size=19, color=CYAN)
        b_label.next_to(bolt_line, UP, buff=0.25).align_to(bolt_line, LEFT)

        s_start = LEFT * 6.0 + DOWN * 2.2
        s_target = RIGHT * 0.0 + DOWN * 1.1
        star_path = VMobject(color=PINK, stroke_width=4)
        star_path.set_points_smoothly([
            s_start,
            LEFT * 3.0 + DOWN * 1.4,
            LEFT * 0.8 + DOWN * 2.5,
            s_target,
        ])
        s_label = txt("SHURIKEN  30 m/s", size=19, color=PINK)
        s_label.next_to(star_path, DOWN, buff=0.25).align_to(star_path, LEFT)

        forms = side_card([
            formula("bolt: v = dir * 26, no gravity", size=21, color=CYAN),
            formula("star: heading = lerp(heading, desired, 9 * dt)", size=21, color=PINK),
            formula("energy cost = 0.5, hit radius = 1.1 m", size=21),
        ])

        self.play(Create(bolt_line), FadeIn(VGroup(b_label, shooter, victim)), run_time=0.8)
        self.play(Create(star_path), FadeIn(s_label), run_time=0.8)
        self.play(FadeIn(forms), run_time=0.7)

        bp = ValueTracker(0)
        sp = ValueTracker(0)
        self.add(bp, sp)
        bolt_dot = always_redraw(lambda: Dot(bolt_line.point_from_proportion(bp.get_value()), color=CYAN, radius=0.12).set_z_index(10))
        star_dot = always_redraw(lambda: Dot(star_path.point_from_proportion(sp.get_value()), color=PINK, radius=0.12).set_z_index(10))
        self.play(FadeIn(bolt_dot), FadeIn(star_dot), run_time=0.4)
        self.play(bp.animate.set_value(1), run_time=1.6, rate_func=smooth)
        self.play(sp.animate.set_value(1), run_time=2.0, rate_func=smooth)

        parry = txt("parry window 0.18 s -> deflect 45.5 m/s", size=19, color=PINK)
        parry.to_edge(DOWN, buff=0.6).align_to(forms, LEFT)
        self.play(FadeIn(parry), run_time=0.5)
        self.wait(0.7)

        self.play(FadeOut(VGroup(head, shooter, victim, bolt_line, b_label, star_path, s_label, forms, bolt_dot, star_dot, parry)), run_time=0.6)

    def mech(self):
        head = self.chapter("THE MECH LOCKS THE PAST", "It snapshots your position, turns once, then fires a growing wall.")

        mech = Dot(LEFT * 6.0 + DOWN * 0.8, color=SLATE, radius=0.16)
        old = Dot(LEFT * 1.4 + UP * 1.2, color=PINK, radius=0.14)
        new = Dot(LEFT * 2.2 + DOWN * 2.2, color=CYAN, radius=0.14)

        snap_line = Line(mech.get_center(), old.get_center(), color=PINK, stroke_width=3)
        snap_label = txt("snapshot", size=17, color=PINK).next_to(old, UP, buff=0.25)
        move_label = txt("you strafe", size=17, color=CYAN).next_to(new, DOWN, buff=0.25)
        mech_label = txt("yaw locked", size=17, color=SLATE).next_to(mech, DOWN, buff=0.25)

        mforms = side_card([
            formula("yaw = atan2(dx, dz) from snapshot", size=21, color=PINK),
            formula("wave speed = 17 m/s", size=21, color=CYAN),
            formula("width = 0.4 + 5.2 * clamp(t / 1.2, 0, 1)", size=21, color=PINK),
        ])

        self.play(FadeIn(VGroup(mech, old, new, mech_label, snap_label, move_label)), run_time=0.7)
        self.play(Create(snap_line), run_time=0.6)
        self.play(FadeIn(mforms), run_time=0.7)
        self.play(Indicate(snap_label, color=PINK), run_time=0.6)

        w = ValueTracker(0)
        self.add(w)
        wall = always_redraw(
            lambda: Rectangle(
                width=0.4 + 5.2 * min(1, w.get_value() / 1.2),
                height=2.2,
                color=PINK,
                fill_color=PINK,
                fill_opacity=0.18,
                stroke_width=3,
            ).move_to(snap_line.point_from_proportion(min(1, w.get_value() / 1.3))).set_z_index(8)
        )
        self.play(FadeIn(wall), run_time=0.4)
        self.play(w.animate.set_value(1.3), run_time=2.2, rate_func=smooth)
        self.wait(0.6)

        note = txt("hit radius = max(1.5, width / 2)", size=19, color=CYAN)
        note.to_edge(DOWN, buff=0.6).align_to(mforms, LEFT)
        self.play(FadeIn(note), run_time=0.5)
        self.wait(0.5)

        self.play(FadeOut(VGroup(head, mech, old, new, snap_line, snap_label, move_label, mech_label, mforms, wall, note)), run_time=0.6)

    def outro(self):
        head = self.chapter("THE WHOLE SYSTEM", "Every number is a decision you can feel.")

        items = [
            ("g = 20.32, fall = 30.48", CYAN),
            ("jump apex = 2.17 m", FG),
            ("dash = 24 m/s for 0.2 s", PINK),
            ("grapple cone = 35.5 deg", CYAN),
            ("bolt = 26, deflect = 45.5", FG),
            ("shuriken = 30 m/s", PINK),
            ("mech wall = 17 m/s", CYAN),
            ("world scale = 0.2", PINK),
        ]
        cards = VGroup(*[chip(text, size=19, color=color, stroke=color) for text, color in items])
        cards.arrange_in_grid(rows=4, cols=2, buff=(0.45, 0.7))
        cards.next_to(head, DOWN, buff=0.7).set_x(0)
        cards.scale_to_fit_height(5.2)

        self.play(LaggedStart(*[FadeIn(c, shift=UP * 0.2) for c in cards], lag_ratio=0.1), run_time=1.5)
        self.wait(0.8)
        self.play(FadeOut(VGroup(head, cards)), run_time=0.6)

        final = txt("PHYSICS IS THE FEEL", size=42, color=FG).shift(UP * 0.3)
        brand = txt("VELOCITY", size=24, color=PINK).next_to(final, DOWN, buff=0.35)
        credit = txt("Made by - Frqme", size=26, color=FG).to_edge(DOWN, buff=0.7)

        self.play(FadeIn(VGroup(final, brand), shift=DOWN * 0.2), run_time=0.8)
        self.play(
            DrawBorderThenFill(
                credit,
                stroke_color=CYAN,
                stroke_width=2.5,
            ),
            run_time=1.8,
        )
        self.wait(1.2)
        self.play(FadeOut(VGroup(final, brand, credit)), run_time=0.6)
