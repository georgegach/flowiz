# flowiz Learn Panel — Authored Content

> **Purpose of this file.** This is the *complete, ready-to-transplant* prose for the
> in-app "Learn" panel. Every section below maps 1:1 to a section object in
> `viewer/src/learn-content.ts`. The implementer (Opus) should copy this text
> verbatim into typed content strings — **do not paraphrase, re-summarize, or
> "improve" the wording**, and **do not invent new citations**. Figure markers of the
> form `<!-- FIG:id -->` correspond to entries in the Figure Inventory in
> `LEARN-PANEL-SDD.md`; place the live canvas figure at that anchor.
>
> **Voice.** Teach-me style (after Matt Pocock): each section opens with a concrete,
> literal hook ("look at this"), then builds intuition, then gives the formal
> treatment, then closes with *why you should care*. Short paragraphs. Plain language
> first, jargon defined on first use. No quizzes, no gamification.
>
> **Reading level.** A curious engineer or a first-year grad student should never feel
> lost; an expert should never feel talked down to. Achieve this by layering:
> intuition in the body, precision in the asides.

---

## Section 0 — `orientation` · "What you're looking at"

<!-- FIG:hero-triptych -->

You just dropped a file full of numbers onto this page and it turned into a swirl of
color. That swirl is **optical flow** — a picture of *motion*. Every pixel's color is
answering one question: *which way, and how fast, did this point in the image move
between one video frame and the next?*

Here is the whole idea in one breath:

- **Hue (the color itself)** tells you the **direction** of motion. Rightward motion is
  one color, upward another, and so on around the wheel.
- **Saturation / brightness (how vivid the color is)** tells you the **speed**. Pale,
  washed-out regions barely moved; deep, saturated regions moved fast.
- **White or near-white** means *no motion here* — the background, or anything that
  held still.

<!-- FIG:read-the-wheel -->

That is enough to start reading these images like a map. The rest of this guide explains
where this idea came from, the surprisingly deep math hiding under it, why we chose
*these particular colors*, and what people actually *do* with optical flow — from the
video codec compressing this very page's animations to a self-driving car deciding
whether the shape ahead is drifting into its lane.

> **You don't need any of the math to use flowiz.** Read Section 0 and Section 4 ("How
> flow becomes color") and you can interpret any flow field with confidence. The deeper
> sections are here when you want them.

---

## Section 1 — `what-is-flow` · "What is optical flow?"

Point a camera at the world and press record. Between two consecutive frames, the pattern
of brightness on the sensor shifts a little: an edge slides two pixels to the right, a
face tilts, a car crosses the frame. **Optical flow is the field of tiny 2-D
displacements that describes that shift, one arrow per pixel.**

Formally, for every pixel at image location `(x, y)` we assign a vector `(u, v)`:

- `u` — how far that point moved **horizontally** (positive = rightward), in pixels.
- `v` — how far it moved **vertically** (positive = downward, following image
  convention), in pixels.

Stack all those vectors together and you get a **dense flow field** the same width and
height as the image, but with two numbers per pixel instead of three color channels. That
is exactly what a `.flo` file stores, and exactly what this viewer paints.

<!-- FIG:vector-field-quiver -->

**One subtlety worth internalizing early.** Optical flow is the apparent motion of
*brightness patterns*, which is not always the same as the true motion of *objects in the
scene*. The classic thought experiment: a smooth, uniformly-colored sphere rotating under
a fixed light produces **zero** optical flow (nothing about the image changes), while a
**stationary** sphere under a *moving* light produces plenty of flow (the shading slides
across it). The genuine 3-D motion projected onto the image plane is called the **motion
field**; optical flow is our best *estimate* of it from brightness alone. They usually
agree, but the gap is real and it is why hard cases (shadows, reflections, transparency)
stay hard. This distinction was made precise by Verri and Poggio (1989).

**Why you care.** Everything downstream — compression, tracking, interpolation, robotics —
is really consuming this `(u, v)` field. If you understand that flow is *per-pixel apparent
displacement, estimated from brightness*, you understand both its power and its failure
modes.

---

## Section 2 — `history` · "Where it comes from"

Optical flow is older than computer vision as a discipline. Its lineage runs through
psychology, then variational calculus, and finally deep learning.

**1950 — Gibson and ecological optics.** The psychologist James J. Gibson coined the term
"optic flow" to describe the streaming pattern of motion an animal sees as it moves through
the world. Stand in a train and watch the landscape rush past: points near you sweep by
fast, distant points crawl, and everything radiates out from the point you're heading
toward (the *focus of expansion*). Gibson argued that this flow field is a direct source
of information for navigation — no reconstruction required. Vision science still builds on
this idea.

**1981 — the two foundational algorithms.** Computer vision's version of optical flow was
born in a single year, in two papers that remain the two ends of a spectrum every modern
method still lives on:

- **Horn & Schunck** posed flow as a **global, variational** problem: find the flow field
  that keeps brightness constant *and* is spatially smooth, by minimizing an energy that
  trades off the two. It produces dense flow everywhere but blurs across motion
  boundaries.
- **Lucas & Kanade** solved it **locally**: assume the flow is constant over a small window
  and solve a tiny least-squares system per window. Fast, robust where there's texture,
  but silent where the window is ambiguous.

<!-- FIG:aperture-problem -->

**The aperture problem** — why one equation isn't enough. Look at a moving edge through a
small hole (an "aperture"). You can see it sliding *perpendicular* to itself, but you
*cannot* tell if it's also sliding *along* itself — the two look identical. A single local
patch of a straight edge simply does not contain enough information to pin down both
components of `(u, v)`. This is not an engineering limitation; it is a fundamental
ambiguity, and resolving it — by aggregating over larger regions, adding smoothness
assumptions, or learning priors — is what *every* flow method is really doing. We make
this concrete with the math in Section 3.

**The classical decades (1980s–2010s).** Between the foundations and deep learning came a
long, productive era of energy-minimization methods: coarse-to-fine **image pyramids** to
handle large motions (estimate flow on a blurred, shrunk image, then refine), robust
penalty functions to preserve motion edges, and careful engineering. Landmark work
includes Black & Anandan's robust estimation, Brox et al. (2004) with a high-accuracy
warping scheme, and — essential reading — Sun, Roth & Black's **"Secrets of Optical Flow
Estimation and Their Principles" (2010)**, which showed that much of the progress came from
implementation details rather than new models.

**2015–now — the deep-learning era.** Learning replaced hand-designed energies with
networks trained on large datasets:

- **FlowNet** (Dosovitskiy et al., 2015) — the first end-to-end CNN for optical flow, and
  the synthetic **FlyingChairs** dataset that made training it possible.
- **PWC-Net** (Sun et al., 2018) — folded the classical wisdom (**P**yramid,
  **W**arping, **C**ost volume) back into a compact, accurate network.
- **RAFT** (Teed & Deng, 2020) — **R**ecurrent **A**ll-Pairs **F**ield **T**ransforms:
  builds a 4-D correlation volume over all pairs of pixels and iteratively refines the
  flow with a recurrent update operator. It set a new standard for accuracy and
  generalization and is still the field's reference architecture.
- **Transformer era** (2021–) — **FlowFormer** (Huang et al., 2022) and
  **SEA-RAFT** (Wang et al., 2024) push accuracy and efficiency further with attention and
  refined training recipes.

<!-- FIG:history-timeline -->

**Why you care.** The output of *all* of these — a Horn–Schunck field from 1981 or a
RAFT prediction from 2020 — is the same object: a dense `(u, v)` field. flowiz reads,
visualizes, and evaluates that field regardless of what produced it. Knowing the lineage
tells you *why* a given method fails the way it does (smoothing across edges, struggling
with large or fast motion, hallucinating on textureless regions).

---

## Section 3 — `the-math` · "The math, gently"

You can skip this section and still use flowiz. But the central equation is short, and it
explains the aperture problem exactly, so it's worth five minutes.

**The brightness constancy assumption.** The core idea of Horn & Schunck: a small patch of
the world keeps the *same brightness* as it moves from one frame to the next. If a point at
`(x, y)` at time `t` has brightness `I(x, y, t)`, and it moves by `(u, v)` over a short
time `dt`, then:

```
I(x + u·dt,  y + v·dt,  t + dt)  =  I(x, y, t)
```

Expand the left side to first order (a Taylor expansion — the calculus of "how does a
function change when you nudge its inputs") and the constants cancel, leaving the
**optical flow constraint equation**:

```
Iₓ · u  +  I_y · v  +  I_t  =  0
```

where `Iₓ, I_y` are how fast brightness changes across space (the image gradient) and `I_t`
is how fast it changes in time between the two frames. Everything except `u` and `v` is
something you can *measure directly* from the two images.

<!-- FIG:brightness-constancy -->

**Here is the whole problem in one line.** That equation has **two unknowns** (`u` and
`v`) but is only **one equation**. One equation can never determine two unknowns. Geometry
makes it vivid: the equation says `(u, v)` lies on a *line*, and any point on that line
satisfies it. We can recover the component of motion *along the gradient* (perpendicular to
edges) but not the component *along the edge*. **That is the aperture problem, exactly.**

**How everyone escapes it.** You need a second source of information:

- **Horn & Schunck** add a **smoothness** term: neighboring pixels should have similar
  flow. Minimizing "brightness error + smoothness cost" over the *whole image* couples the
  pixels together so the ambiguous ones borrow from confident neighbors.
- **Lucas & Kanade** assume the flow is **constant over a small window**, giving many
  copies of the constraint equation — now it's over-determined and solvable by least
  squares (as long as the window has gradients in more than one direction, i.e. a corner,
  not a straight edge).
- **Deep networks** replace the hand-written prior with one **learned** from millions of
  examples — effectively a very rich smoothness-and-context model.

**Why you care.** When you see a flow result smear across an object boundary, or go blank
on a clear-blue sky, you're seeing this equation's limits — not a bug. The prior did the
best it could where the data was silent.

---

## Section 4 — `flow-to-color` · "How flow becomes color"

This is the section that makes you fluent at *reading* the images in this app.

We have two numbers per pixel, `(u, v)`, and we want one color. The standard answer — the
one flowiz uses, and the one nearly every paper uses — is the **Middlebury color coding**,
introduced with the Middlebury benchmark by Baker et al. (2007/2011). It is a mapping from
a 2-D vector to a color built around a **color wheel**:

- **Direction → hue.** Convert `(u, v)` to an angle and read a color off the wheel.
  Every direction gets its own hue; opposite directions get opposite (complementary)
  colors.
- **Magnitude → saturation.** The length `√(u² + v²)` sets how far from white the color
  sits. Zero motion is white; larger motion is a more saturated, vivid version of the
  direction's hue.

<!-- FIG:color-wheel-anatomy -->

**Reading a flow image like a pro.** Once the wheel is in your eye, whole classes of motion
become recognizable at a glance:

- **One flat color across a region** → pure **translation**: everything there moved the
  same way (e.g. camera panning, or a rigid object sliding).
- **Colors cycling around a center point** → **rotation**: direction rotates as you go
  around, so the hue rotates too.
- **A radial rainbow bursting outward from a point** → **zoom / expansion** (or an object
  approaching): motion points outward in every direction, so every hue appears, arranged
  radially. The center of the burst is the *focus of expansion* — often where the camera
  is heading.
- **A sharp seam where color flips to its complement** → a **motion boundary**: two
  surfaces moving differently, e.g. a foreground object against its background. This is
  where estimation is hardest and where you should look to judge a method's quality.

<!-- FIG:motion-archetypes -->

**The 55-color wheel, precisely.** The Baker wheel isn't a smooth mathematical HSV circle;
it's a specific sequence of 55 colors built by walking through six hue transitions — Red→
Yellow→Green→Cyan→Blue→Magenta→Red — with a hand-tuned number of steps in each
(15, 6, 4, 11, 13, 6). The uneven spacing gives *more* color resolution to directions the
human eye discriminates well. flowiz reproduces this table exactly, which is why its output
is **bit-for-bit compatible** with the widely used `flow_vis` reference implementation —
important when you're comparing your figures against published ones. This very viewer paints
its wheel from the same 55 entries used by the Python library (`colorwheel.ts`,
`makeColorwheel`).

**The one pitfall that ruins videos: normalization.** Magnitude has to be scaled to the
`[0, 1]` range before it becomes saturation, and *what you divide by* matters enormously.
Divide each frame by *its own* maximum magnitude and a single frame looks great — but play a
sequence and it **flickers and pulses**, because the scaling jumps around frame to frame as
the fastest-moving pixel changes. The fix is a **global** (or windowed) normalization
constant shared across the whole sequence, so a given speed always maps to the same
brightness. flowiz's video pipeline handles this for you; the "Max flow" slider in this
viewer lets you set that constant by hand and watch its effect.

<!-- FIG:normalization-flicker -->

**Why you care.** Ninety percent of "why does my flow visualization look wrong" questions
are really a normalization question or a convention mismatch (u/v sign, or a different
color wheel). Get the wheel and the normalization right and your figures will match the
literature.

---

## Section 5 — `formats-datasets` · "Files, formats & benchmarks"

Optical flow research accumulated a small zoo of file formats and datasets. flowiz's whole
reason for existing is to read them all through one function (`fz.read`) and give them one
consistent look.

**File formats you'll meet:**

| Format | Origin | What's inside |
| --- | --- | --- |
| `.flo` | Middlebury | Little-endian float32 `u,v`, a magic number, width/height header. The de-facto standard. |
| 16-bit PNG | KITTI | `u,v` packed into two 16-bit channels with a fixed scale + offset, plus a validity bit in the third channel. |
| `.pfm` | MPI-Sintel & stereo | Portable float map; also used for disparity/depth. |
| `.flo5` | Spring | HDF5-based, for very high-resolution 1080p+ ground truth. |
| `.npy` / `.npz` | NumPy / PyTorch users | Raw arrays, e.g. a `(H, W, 2)` prediction straight out of a model. |

<!-- FIG:format-family -->

**The benchmark lineage** — each dataset pushed the field somewhere new:

- **Middlebury** (2007/2011) — the first modern benchmark with dense ground truth; small,
  clean, sub-pixel accurate. It also gave us the color coding you just learned.
- **KITTI 2012 / 2015** — real driving scenes with LiDAR-derived (sparse) ground truth.
  Introduced the **Fl** error metric and the realities of automotive vision: large motions,
  reflective surfaces, occlusions.
- **MPI-Sintel** (2012) — frames from an open-source animated film, with *perfect* dense
  ground truth (it's rendered, so the true motion is known exactly). Adds motion blur,
  atmospheric effects, and long-range motion. Still one of the hardest benchmarks.
- **Spring** (2023) — a modern high-resolution, high-detail dataset that exposes where even
  today's best methods break down.

**How you measure a flow method** — the two metrics flowiz computes:

- **EPE (End-Point Error)** — the average Euclidean distance between the predicted `(u, v)`
  and the ground-truth `(u, v)`, in pixels. The all-purpose accuracy number. Lower is
  better.
- **Fl (Flow outlier percentage)** — the KITTI metric: the fraction of pixels whose error
  exceeds a threshold (3 px *and* 5% of the true magnitude). It reports *how often you're
  badly wrong* rather than the average, which matters for safety-critical use.

<!-- FIG:epe-errormap -->

**Why you care.** When you download someone's model output, it might be a `.flo`, a KITTI
PNG, or a bare `.npy` with a different sign convention — and it means nothing until you can
view it and score it against ground truth. That reconcile-everything-to-one-view job is
precisely what flowiz automates.

---

## Section 6 — `applications` · "What it's for in real life"

Optical flow is one of those quiet technologies that is *everywhere* once you know to look.

- **Video compression.** Every modern codec (H.264/AVC, HEVC, AV1) is built on **motion
  estimation**: instead of storing each frame whole, it stores motion vectors that say
  "this block is like that block from the last frame, shifted here" and only encodes the
  small residual. Block-based motion estimation is a coarse cousin of optical flow, and
  it's why your video streams at all.
- **Slow-motion & frame interpolation.** To turn 30 fps into silky 240 fps, software
  **synthesizes** in-between frames by warping along the optical flow between real frames.
  This is how phone "smooth slow-mo," TV "motion smoothing," and research systems like
  **RIFE** and **DAIN** work.
- **Video editing & VFX.** Flow drives **stabilization** (undo camera shake), **rotoscoping
  and masking** (propagate a hand-drawn mask across frames), motion blur synthesis, and
  content-aware retiming. Tools like After Effects' warp stabilizer live on it.
- **Autonomous driving & robotics.** Flow reveals **independently moving objects** (a
  pedestrian stepping off a curb has motion inconsistent with the static scene) and
  **ego-motion / time-to-collision** from the focus of expansion — Gibson's insight, now in
  silicon.
- **Visual odometry & SLAM.** Robots and AR headsets track how features flow across frames
  to estimate their own movement through space and build maps.
- **Medical imaging.** Flow measures **cardiac strain** (how heart-wall tissue deforms
  through a beat), tracks **respiratory motion** to keep radiotherapy beams on target, and
  registers moving anatomy across scans.
- **Meteorology & remote sensing.** **Atmospheric Motion Vectors** — cloud motion tracked
  across successive satellite images — are a primary global wind-measurement input to
  weather forecasts.
- **Fluid dynamics.** **Particle Image Velocimetry (PIV)** seeds a flow with tracer
  particles and uses optical-flow-like correlation to measure velocity fields in wind
  tunnels and water channels.
- **Biology & microscopy.** Flow quantifies **cell migration**, tissue morphogenesis, and
  crowd/animal collective motion.
- **Action recognition.** The influential **two-stream** networks feed optical flow as a
  dedicated "motion" input alongside RGB, because *how* things move is often more telling
  than *what* they look like. Sports analytics and gesture recognition build on the same
  idea.

<!-- FIG:applications-grid -->

**Why you care.** If you're reading this, you're probably producing or consuming flow for
one of these. Seeing the breadth is a reminder that the humble `(u, v)` field you're
visualizing is the same primitive powering your video call, your car's driver assist, and
tomorrow's weather report.

---

## Section 7 — `using-flowiz` · "Where flowiz fits"

flowiz is a small toolkit for the *last mile* of optical flow work: once you have a flow
field — from a dataset, a classical method, or a neural net — flowiz reads it, shows it,
turns it into figures and videos, and scores it. Three surfaces, one core:

- **The Python library.** `fz.read` ingests any format into one array; `fz.colorize`
  applies the Middlebury coding you learned in Section 4; `fz.from_tensor` takes a PyTorch
  prediction straight from your model; `fz.compare_grid` lays methods side by side. The
  color output is bit-compatible with `flow_vis`, so your figures match the literature.
- **The CLI.** `flowiz` batch-converts folders of flow files to PNGs or stitches them into
  a flicker-free MP4/WebM/GIF (with the global normalization from Section 4 handled for
  you), no ffmpeg install required.
- **This viewer.** Drag a flow file onto the page to inspect it interactively — switch
  between color / raw UV / magnitude / angle encodings, hover to read exact values, set the
  normalization by hand, and play multi-frame sequences. Everything runs client-side in
  your browser; nothing is uploaded.

**A typical workflow.** You train or download a model, dump its predictions as `.npy` or
`.flo`, drag one onto this viewer to sanity-check it (Is the motion boundary crisp? Is the
sky blank as it should be?), then use the library to render a publication figure and
compute EPE/Fl against ground truth, and the CLI to compile a sequence into a video for a
talk.

Full API docs and examples live under the **Docs** link in the header.

---

## Section 8 — `further-reading` · "Further reading"

An annotated path deeper, roughly from surveys to specifics. (These are the canonical
references; cite these rather than this panel.)

**Surveys & foundations**
- **Barron, Fleet & Beauchemin, "Performance of Optical Flow Techniques," IJCV 1994.** The
  classic comparative survey of the classical era; defines how flow is evaluated.
- **Baker, Scharstein, Lewis, Roth, Black & Szeliski, "A Database and Evaluation
  Methodology for Optical Flow," IJCV 2011** (Middlebury). The benchmark — and the source of
  the color coding flowiz uses.
- **Sun, Roth & Black, "Secrets of Optical Flow Estimation and Their Principles," CVPR
  2010** (and the 2014 IJCV extension). Why implementation details dominate; essential for
  anyone building a method.
- **Fortun, Bouthemy & Kervrann, "Optical Flow Modeling and Computation: A Survey," CVIU
  2015.** A thorough modern survey bridging classical and early-learning methods.

**The founding papers**
- **Horn & Schunck, "Determining Optical Flow," Artificial Intelligence, 1981.** The
  variational, global, brightness-constancy-plus-smoothness formulation.
- **Lucas & Kanade, "An Iterative Image Registration Technique...," IJCAI 1981.** The
  local, windowed, least-squares formulation.
- **Verri & Poggio, "Motion Field and Optical Flow: Qualitative Properties," PAMI 1989.**
  The precise account of when optical flow does and doesn't equal the true motion field.

**The deep-learning line**
- **Dosovitskiy et al., "FlowNet," ICCV 2015.** First end-to-end CNN for flow.
- **Sun et al., "PWC-Net," CVPR 2018.** Classical principles inside a compact network.
- **Teed & Deng, "RAFT," ECCV 2020** (Best Paper). The reference architecture; recurrent
  all-pairs refinement.
- **Huang et al., "FlowFormer," ECCV 2022** and **Wang et al., "SEA-RAFT," ECCV 2024.** The
  transformer / refined-recipe frontier.

**Tooling & visualization**
- **`flow_vis`** — the reference color-coding implementation flowiz is bit-compatible with.
- **flowiz Docs** (header link) — API reference, format notes, and examples.

---

<!-- FIG:closing-wheel -->

*That's the whole picture: a per-pixel field of apparent motion, born in perception
science, formalized in 1981, learned by networks today, painted with a 55-color wheel, and
quietly running much of the moving-image world. Now go drag a flow file onto the page.*
