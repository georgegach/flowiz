/**
 * Authored content for the Learn panel — prose transplanted verbatim from
 * docs/LEARN-PANEL-CONTENT.md. Figure anchors are `<figure data-fig="id">`
 * placeholders that learn.ts fills with live diagrams (see learn-figures.ts).
 *
 * Do not add a Markdown parser — content is hand-written HTML on purpose.
 */

export interface Section {
  id: string;
  nav: string;
  title: string;
  html: string;
}

const fig = (id: string) => `<figure class="learn-fig" data-fig="${id}"></figure>`;

export const SECTIONS: Section[] = [
  {
    id: "orientation",
    nav: "Start here",
    title: "What you're looking at",
    html: `
      ${fig("hero-triptych")}
      <p>You just dropped a file full of numbers onto this page and it turned into a swirl of
      color. That swirl is <strong>optical flow</strong> — a picture of <em>motion</em>. Every
      pixel's color is answering one question: <em>which way, and how fast, did this point in
      the image move between one video frame and the next?</em></p>
      <p>Here is the whole idea in one breath:</p>
      <ul>
        <li><strong>Hue (the color itself)</strong> tells you the <strong>direction</strong> of
        motion. Rightward motion is one color, upward another, and so on around the wheel.</li>
        <li><strong>Saturation / brightness (how vivid the color is)</strong> tells you the
        <strong>speed</strong>. Pale, washed-out regions barely moved; deep, saturated regions
        moved fast.</li>
        <li><strong>White or near-white</strong> means <em>no motion here</em> — the background,
        or anything that held still.</li>
      </ul>
      ${fig("read-the-wheel")}
      <p>That is enough to start reading these images like a map. The rest of this guide explains
      where this idea came from, the surprisingly deep math hiding under it, why we chose
      <em>these particular colors</em>, and what people actually <em>do</em> with optical flow —
      from the video codec compressing this very page's animations to a self-driving car deciding
      whether the shape ahead is drifting into its lane.</p>
      <blockquote>You don't need any of the math to use flowiz. Read this section and
      “How flow becomes color” and you can interpret any flow field with confidence. The deeper
      sections are here when you want them.</blockquote>`,
  },
  {
    id: "what-is-flow",
    nav: "What is optical flow",
    title: "What is optical flow?",
    html: `
      <p>Point a camera at the world and press record. Between two consecutive frames, the pattern
      of brightness on the sensor shifts a little: an edge slides two pixels to the right, a face
      tilts, a car crosses the frame. <strong>Optical flow is the field of tiny 2-D displacements
      that describes that shift, one arrow per pixel.</strong></p>
      <p>Formally, for every pixel at image location <code>(x, y)</code> we assign a vector
      <code>(u, v)</code>:</p>
      <ul>
        <li><code>u</code> — how far that point moved <strong>horizontally</strong>
        (positive = rightward), in pixels.</li>
        <li><code>v</code> — how far it moved <strong>vertically</strong> (positive = downward,
        following image convention), in pixels.</li>
      </ul>
      <p>Stack all those vectors together and you get a <strong>dense flow field</strong> the same
      width and height as the image, but with two numbers per pixel instead of three color
      channels. That is exactly what a <code>.flo</code> file stores, and exactly what this viewer
      paints.</p>
      ${fig("vector-field-quiver")}
      <p><strong>One subtlety worth internalizing early.</strong> Optical flow is the apparent
      motion of <em>brightness patterns</em>, which is not always the same as the true motion of
      <em>objects in the scene</em>. The classic thought experiment: a smooth, uniformly-colored
      sphere rotating under a fixed light produces <strong>zero</strong> optical flow (nothing about
      the image changes), while a <strong>stationary</strong> sphere under a <em>moving</em> light
      produces plenty of flow (the shading slides across it). The genuine 3-D motion projected onto
      the image plane is called the <strong>motion field</strong>; optical flow is our best
      <em>estimate</em> of it from brightness alone. They usually agree, but the gap is real and it
      is why hard cases (shadows, reflections, transparency) stay hard. This distinction was made
      precise by Verri and Poggio (1989).</p>
      <p><strong>Why you care.</strong> Everything downstream — compression, tracking, interpolation,
      robotics — is really consuming this <code>(u, v)</code> field. If you understand that flow is
      <em>per-pixel apparent displacement, estimated from brightness</em>, you understand both its
      power and its failure modes.</p>`,
  },
  {
    id: "history",
    nav: "Where it comes from",
    title: "Where it comes from",
    html: `
      <p>Optical flow is older than computer vision as a discipline. Its lineage runs through
      psychology, then variational calculus, and finally deep learning.</p>
      <p><strong>1950 — Gibson and ecological optics.</strong> The psychologist James J. Gibson
      coined the term “optic flow” to describe the streaming pattern of motion an animal sees as it
      moves through the world. Stand in a train and watch the landscape rush past: points near you
      sweep by fast, distant points crawl, and everything radiates out from the point you're heading
      toward (the <em>focus of expansion</em>). Gibson argued that this flow field is a direct source
      of information for navigation — no reconstruction required.</p>
      <p><strong>1981 — the two foundational algorithms.</strong> Computer vision's version of
      optical flow was born in a single year, in two papers that remain the two ends of a spectrum
      every modern method still lives on:</p>
      <ul>
        <li><strong>Horn &amp; Schunck</strong> posed flow as a <strong>global, variational</strong>
        problem: find the flow field that keeps brightness constant <em>and</em> is spatially smooth.
        Dense everywhere, but blurs across motion boundaries.</li>
        <li><strong>Lucas &amp; Kanade</strong> solved it <strong>locally</strong>: assume the flow
        is constant over a small window and solve a tiny least-squares system per window. Fast and
        robust where there's texture, but silent where the window is ambiguous.</li>
      </ul>
      ${fig("aperture-problem")}
      <p><strong>The aperture problem</strong> — why one equation isn't enough. Look at a moving edge
      through a small hole (an “aperture”). You can see it sliding <em>perpendicular</em> to itself,
      but you <em>cannot</em> tell if it's also sliding <em>along</em> itself — the two look
      identical. A single local patch of a straight edge simply does not contain enough information
      to pin down both components of <code>(u, v)</code>. This is not an engineering limitation; it
      is a fundamental ambiguity, and resolving it is what <em>every</em> flow method is really
      doing.</p>
      <p><strong>The classical decades (1980s–2010s).</strong> Between the foundations and deep
      learning came a long, productive era of energy-minimization methods: coarse-to-fine
      <strong>image pyramids</strong> to handle large motions, robust penalty functions to preserve
      motion edges, and careful engineering — Black &amp; Anandan's robust estimation, Brox et al.
      (2004) with a high-accuracy warping scheme, and Sun, Roth &amp; Black's
      <strong>“Secrets of Optical Flow Estimation and Their Principles” (2010)</strong>, which showed
      that much of the progress came from implementation details rather than new models.</p>
      <p><strong>2015–now — the deep-learning era.</strong> Learning replaced hand-designed energies
      with networks trained on large datasets:</p>
      <ul>
        <li><strong>FlowNet</strong> (Dosovitskiy et al., 2015) — the first end-to-end CNN for
        optical flow, and the synthetic FlyingChairs dataset that made training it possible.</li>
        <li><strong>PWC-Net</strong> (Sun et al., 2018) — folded the classical wisdom
        (<strong>P</strong>yramid, <strong>W</strong>arping, <strong>C</strong>ost volume) back into
        a compact, accurate network.</li>
        <li><strong>RAFT</strong> (Teed &amp; Deng, 2020) — Recurrent All-Pairs Field Transforms:
        a 4-D correlation volume over all pairs of pixels, iteratively refined by a recurrent update
        operator. Still the field's reference architecture.</li>
        <li><strong>Transformer era</strong> (2021–) — FlowFormer (Huang et al., 2022) and SEA-RAFT
        (Wang et al., 2024) push accuracy and efficiency further.</li>
      </ul>
      ${fig("history-timeline")}
      <p><strong>Why you care.</strong> The output of <em>all</em> of these — a Horn–Schunck field
      from 1981 or a RAFT prediction from 2020 — is the same object: a dense <code>(u, v)</code>
      field. flowiz reads, visualizes, and evaluates that field regardless of what produced it.
      Knowing the lineage tells you <em>why</em> a given method fails the way it does.</p>`,
  },
  {
    id: "the-math",
    nav: "The math, gently",
    title: "The math, gently",
    html: `
      <p>You can skip this section and still use flowiz. But the central equation is short, and it
      explains the aperture problem exactly, so it's worth five minutes.</p>
      <p><strong>The brightness constancy assumption.</strong> The core idea of Horn &amp; Schunck:
      a small patch of the world keeps the <em>same brightness</em> as it moves from one frame to the
      next. If a point at <code>(x, y)</code> at time <code>t</code> has brightness
      <code>I(x, y, t)</code>, and it moves by <code>(u, v)</code> over a short time
      <code>dt</code>, then:</p>
      <pre><code>I(x + u·dt,  y + v·dt,  t + dt)  =  I(x, y, t)</code></pre>
      <p>Expand the left side to first order (a Taylor expansion) and the constants cancel, leaving
      the <strong>optical flow constraint equation</strong>:</p>
      <pre><code>Iₓ · u  +  I_y · v  +  I_t  =  0</code></pre>
      <p>where <code>Iₓ, I_y</code> are how fast brightness changes across space (the image gradient)
      and <code>I_t</code> is how fast it changes in time between the two frames. Everything except
      <code>u</code> and <code>v</code> is something you can <em>measure directly</em> from the two
      images.</p>
      ${fig("brightness-constancy")}
      <p><strong>Here is the whole problem in one line.</strong> That equation has <strong>two
      unknowns</strong> (<code>u</code> and <code>v</code>) but is only <strong>one equation</strong>.
      One equation can never determine two unknowns. Geometry makes it vivid: the equation says
      <code>(u, v)</code> lies on a <em>line</em>, and any point on that line satisfies it. We can
      recover the component of motion <em>along the gradient</em> (perpendicular to edges) but not
      the component <em>along the edge</em>. <strong>That is the aperture problem, exactly.</strong></p>
      <p><strong>How everyone escapes it.</strong> You need a second source of information:</p>
      <ul>
        <li><strong>Horn &amp; Schunck</strong> add a <strong>smoothness</strong> term: neighboring
        pixels should have similar flow, so ambiguous pixels borrow from confident neighbors.</li>
        <li><strong>Lucas &amp; Kanade</strong> assume the flow is <strong>constant over a small
        window</strong>, giving an over-determined system solvable by least squares (as long as the
        window has gradients in more than one direction — a corner, not a straight edge).</li>
        <li><strong>Deep networks</strong> replace the hand-written prior with one <strong>learned</strong>
        from millions of examples.</li>
      </ul>
      <p><strong>Why you care.</strong> When you see a flow result smear across an object boundary,
      or go blank on a clear-blue sky, you're seeing this equation's limits — not a bug. The prior
      did the best it could where the data was silent.</p>`,
  },
  {
    id: "flow-to-color",
    nav: "How flow becomes color",
    title: "How flow becomes color",
    html: `
      <p>This is the section that makes you fluent at <em>reading</em> the images in this app.</p>
      <p>We have two numbers per pixel, <code>(u, v)</code>, and we want one color. The standard
      answer — the one flowiz uses, and the one nearly every paper uses — is the
      <strong>Middlebury color coding</strong>, introduced with the Middlebury benchmark by Baker
      et al. (2007/2011). It is a mapping from a 2-D vector to a color built around a
      <strong>color wheel</strong>:</p>
      <ul>
        <li><strong>Direction → hue.</strong> Convert <code>(u, v)</code> to an angle and read a
        color off the wheel. Every direction gets its own hue; opposite directions get opposite
        (complementary) colors.</li>
        <li><strong>Magnitude → saturation.</strong> The length <code>√(u² + v²)</code> sets how far
        from white the color sits. Zero motion is white; larger motion is a more saturated, vivid
        version of the direction's hue.</li>
      </ul>
      ${fig("color-wheel-anatomy")}
      <p><strong>Reading a flow image like a pro.</strong> Once the wheel is in your eye, whole
      classes of motion become recognizable at a glance:</p>
      <ul>
        <li><strong>One flat color across a region</strong> → pure <strong>translation</strong>.</li>
        <li><strong>Colors cycling around a center point</strong> → <strong>rotation</strong>.</li>
        <li><strong>A radial rainbow bursting outward from a point</strong> → <strong>zoom /
        expansion</strong> (or an object approaching). The center of the burst is the
        <em>focus of expansion</em> — often where the camera is heading.</li>
        <li><strong>A sharp seam where color flips to its complement</strong> → a <strong>motion
        boundary</strong>: where estimation is hardest, and where you should look to judge a
        method's quality.</li>
      </ul>
      ${fig("motion-archetypes")}
      <p><strong>The 55-color wheel, precisely.</strong> The Baker wheel isn't a smooth mathematical
      HSV circle; it's a specific sequence of 55 colors built by walking through six hue transitions —
      Red→Yellow→Green→Cyan→Blue→Magenta→Red — with a hand-tuned number of steps in each
      (15, 6, 4, 11, 13, 6). flowiz reproduces this table exactly, which is why its output is
      <strong>bit-for-bit compatible</strong> with the widely used <code>flow_vis</code> reference
      implementation. This very viewer paints its wheel from the same 55 entries used by the Python
      library.</p>
      <p><strong>The one pitfall that ruins videos: normalization.</strong> Magnitude has to be
      scaled to the <code>[0, 1]</code> range before it becomes saturation, and <em>what you divide
      by</em> matters enormously. Divide each frame by <em>its own</em> maximum magnitude and a single
      frame looks great — but play a sequence and it <strong>flickers and pulses</strong>, because
      the scaling jumps around frame to frame. The fix is a <strong>global</strong> normalization
      constant shared across the whole sequence. flowiz's video pipeline handles this for you; the
      “Max flow” slider in this viewer lets you set that constant by hand.</p>
      ${fig("normalization-flicker")}
      <p><strong>Why you care.</strong> Ninety percent of “why does my flow visualization look wrong”
      questions are really a normalization question or a convention mismatch. Get the wheel and the
      normalization right and your figures will match the literature.</p>`,
  },
  {
    id: "formats-datasets",
    nav: "Files & benchmarks",
    title: "Files, formats & benchmarks",
    html: `
      <p>Optical flow research accumulated a small zoo of file formats and datasets. flowiz's whole
      reason for existing is to read them all through one function (<code>fz.read</code>) and give
      them one consistent look.</p>
      ${fig("format-family")}
      <p><strong>File formats you'll meet:</strong></p>
      <div class="learn-table">
      <table>
        <thead><tr><th>Format</th><th>Origin</th><th>What's inside</th></tr></thead>
        <tbody>
          <tr><td><code>.flo</code></td><td>Middlebury</td><td>Little-endian float32 <code>u,v</code>, a magic number, width/height header. The de-facto standard.</td></tr>
          <tr><td>16-bit PNG</td><td>KITTI</td><td><code>u,v</code> packed into two 16-bit channels with a fixed scale + offset, plus a validity bit.</td></tr>
          <tr><td><code>.pfm</code></td><td>MPI-Sintel &amp; stereo</td><td>Portable float map; also used for disparity/depth.</td></tr>
          <tr><td><code>.flo5</code></td><td>Spring</td><td>HDF5-based, for very high-resolution 1080p+ ground truth.</td></tr>
          <tr><td><code>.npy</code> / <code>.npz</code></td><td>NumPy / PyTorch</td><td>Raw arrays, e.g. a <code>(H, W, 2)</code> prediction straight out of a model.</td></tr>
        </tbody>
      </table>
      </div>
      <p><strong>The benchmark lineage</strong> — each dataset pushed the field somewhere new:</p>
      <ul>
        <li><strong>Middlebury</strong> (2007/2011) — the first modern benchmark with dense ground
        truth; small, clean, sub-pixel accurate. It also gave us the color coding you just learned.</li>
        <li><strong>KITTI 2012 / 2015</strong> — real driving scenes with LiDAR-derived (sparse)
        ground truth. Introduced the <strong>Fl</strong> error metric and automotive realities:
        large motions, reflective surfaces, occlusions.</li>
        <li><strong>MPI-Sintel</strong> (2012) — frames from an open-source animated film with
        <em>perfect</em> dense ground truth (it's rendered). Adds motion blur, atmospheric effects,
        and long-range motion. Still one of the hardest benchmarks.</li>
        <li><strong>Spring</strong> (2023) — a modern high-resolution, high-detail dataset that
        exposes where even today's best methods break down.</li>
      </ul>
      <p><strong>How you measure a flow method</strong> — the two metrics flowiz computes:</p>
      <ul>
        <li><strong>EPE (End-Point Error)</strong> — the average Euclidean distance between the
        predicted <code>(u, v)</code> and the ground-truth <code>(u, v)</code>, in pixels. Lower is
        better.</li>
        <li><strong>Fl (Flow outlier percentage)</strong> — the KITTI metric: the fraction of pixels
        whose error exceeds a threshold (3 px <em>and</em> 5% of the true magnitude). It reports
        <em>how often you're badly wrong</em>, which matters for safety-critical use.</li>
      </ul>
      ${fig("epe-errormap")}
      <p><strong>Why you care.</strong> When you download someone's model output, it might be a
      <code>.flo</code>, a KITTI PNG, or a bare <code>.npy</code> with a different sign convention —
      and it means nothing until you can view it and score it against ground truth. That
      reconcile-everything-to-one-view job is precisely what flowiz automates.</p>`,
  },
  {
    id: "applications",
    nav: "Real-life utility",
    title: "What it's for in real life",
    html: `
      <p>Optical flow is one of those quiet technologies that is <em>everywhere</em> once you know
      to look.</p>
      ${fig("applications-grid")}
      <ul>
        <li><strong>Video compression.</strong> Every modern codec (H.264/AVC, HEVC, AV1) is built
        on <strong>motion estimation</strong>: store motion vectors that say “this block is like that
        block from the last frame, shifted here” and only encode the small residual. It's why your
        video streams at all.</li>
        <li><strong>Slow-motion &amp; frame interpolation.</strong> To turn 30 fps into silky 240 fps,
        software <strong>synthesizes</strong> in-between frames by warping along the optical flow — how
        phone “smooth slow-mo”, TV “motion smoothing”, and systems like RIFE and DAIN work.</li>
        <li><strong>Video editing &amp; VFX.</strong> Flow drives <strong>stabilization</strong>,
        <strong>rotoscoping and masking</strong> (propagate a hand-drawn mask across frames), motion
        blur synthesis, and content-aware retiming.</li>
        <li><strong>Autonomous driving &amp; robotics.</strong> Flow reveals
        <strong>independently moving objects</strong> and <strong>ego-motion / time-to-collision</strong>
        from the focus of expansion — Gibson's insight, now in silicon.</li>
        <li><strong>Visual odometry &amp; SLAM.</strong> Robots and AR headsets track how features
        flow across frames to estimate their own movement and build maps.</li>
        <li><strong>Medical imaging.</strong> Flow measures <strong>cardiac strain</strong>, tracks
        <strong>respiratory motion</strong> to keep radiotherapy beams on target, and registers moving
        anatomy across scans.</li>
        <li><strong>Meteorology &amp; remote sensing.</strong> <strong>Atmospheric Motion Vectors</strong>
        — cloud motion tracked across satellite images — are a primary global wind-measurement input
        to weather forecasts.</li>
        <li><strong>Fluid dynamics.</strong> <strong>Particle Image Velocimetry (PIV)</strong> measures
        velocity fields in wind tunnels and water channels.</li>
        <li><strong>Biology &amp; microscopy.</strong> Flow quantifies <strong>cell migration</strong>,
        tissue morphogenesis, and collective motion.</li>
        <li><strong>Action recognition.</strong> The influential <strong>two-stream</strong> networks
        feed optical flow as a dedicated “motion” input alongside RGB, because <em>how</em> things move
        is often more telling than <em>what</em> they look like.</li>
      </ul>
      <p><strong>Why you care.</strong> The humble <code>(u, v)</code> field you're visualizing is the
      same primitive powering your video call, your car's driver assist, and tomorrow's weather
      report.</p>`,
  },
  {
    id: "using-flowiz",
    nav: "Where flowiz fits",
    title: "Where flowiz fits",
    html: `
      <p>flowiz is a small toolkit for the <em>last mile</em> of optical flow work: once you have a
      flow field — from a dataset, a classical method, or a neural net — flowiz reads it, shows it,
      turns it into figures and videos, and scores it. Three surfaces, one core:</p>
      <ul>
        <li><strong>The Python library.</strong> <code>fz.read</code> ingests any format into one
        array; <code>fz.colorize</code> applies the Middlebury coding; <code>fz.from_tensor</code>
        takes a PyTorch prediction straight from your model; <code>fz.compare_grid</code> lays
        methods side by side. Output is bit-compatible with <code>flow_vis</code>.</li>
        <li><strong>The CLI.</strong> <code>flowiz</code> batch-converts folders of flow files to
        PNGs or stitches them into a flicker-free MP4/WebM/GIF (global normalization handled for you),
        no ffmpeg install required.</li>
        <li><strong>This viewer.</strong> Drag a flow file onto the page to inspect it interactively —
        switch between color / raw UV / magnitude / angle encodings, hover to read exact values, set
        the normalization by hand, and play multi-frame sequences. Everything runs client-side;
        nothing is uploaded.</li>
      </ul>
      <p><strong>A typical workflow.</strong> You train or download a model, dump its predictions as
      <code>.npy</code> or <code>.flo</code>, drag one onto this viewer to sanity-check it (Is the
      motion boundary crisp? Is the sky blank as it should be?), then use the library to render a
      publication figure and compute EPE/Fl against ground truth, and the CLI to compile a sequence
      into a video for a talk.</p>
      <p>Full API docs and examples live under the <strong>Docs</strong> link in the header.</p>`,
  },
  {
    id: "further-reading",
    nav: "Further reading",
    title: "Further reading",
    html: `
      <p>An annotated path deeper, roughly from surveys to specifics. (These are the canonical
      references; cite these rather than this panel.)</p>
      <p><strong>Surveys &amp; foundations</strong></p>
      <ul>
        <li><strong>Barron, Fleet &amp; Beauchemin, “Performance of Optical Flow Techniques,” IJCV
        1994.</strong> The classic comparative survey of the classical era.</li>
        <li><strong>Baker, Scharstein, Lewis, Roth, Black &amp; Szeliski, “A Database and Evaluation
        Methodology for Optical Flow,” IJCV 2011</strong> (Middlebury). The benchmark — and the source
        of the color coding flowiz uses.</li>
        <li><strong>Sun, Roth &amp; Black, “Secrets of Optical Flow Estimation and Their Principles,”
        CVPR 2010</strong> (and the 2014 IJCV extension). Why implementation details dominate.</li>
        <li><strong>Fortun, Bouthemy &amp; Kervrann, “Optical Flow Modeling and Computation: A
        Survey,” CVIU 2015.</strong> A thorough modern survey bridging classical and early-learning
        methods.</li>
      </ul>
      <p><strong>The founding papers</strong></p>
      <ul>
        <li><strong>Horn &amp; Schunck, “Determining Optical Flow,” Artificial Intelligence, 1981.</strong>
        The variational, global formulation.</li>
        <li><strong>Lucas &amp; Kanade, “An Iterative Image Registration Technique…,” IJCAI 1981.</strong>
        The local, windowed, least-squares formulation.</li>
        <li><strong>Verri &amp; Poggio, “Motion Field and Optical Flow: Qualitative Properties,” PAMI
        1989.</strong> When optical flow does and doesn't equal the true motion field.</li>
      </ul>
      <p><strong>The deep-learning line</strong></p>
      <ul>
        <li><strong>Dosovitskiy et al., “FlowNet,” ICCV 2015.</strong> First end-to-end CNN for flow.</li>
        <li><strong>Sun et al., “PWC-Net,” CVPR 2018.</strong> Classical principles inside a compact
        network.</li>
        <li><strong>Teed &amp; Deng, “RAFT,” ECCV 2020</strong> (Best Paper). The reference
        architecture.</li>
        <li><strong>Huang et al., “FlowFormer,” ECCV 2022</strong> and <strong>Wang et al., “SEA-RAFT,”
        ECCV 2024.</strong> The transformer / refined-recipe frontier.</li>
      </ul>
      <p><strong>Tooling &amp; visualization</strong></p>
      <ul>
        <li><strong><code>flow_vis</code></strong> — the reference color-coding implementation flowiz
        is bit-compatible with.</li>
        <li><strong>flowiz Docs</strong> (header link) — API reference, format notes, and examples.</li>
      </ul>
      ${fig("closing-wheel")}
      <p class="learn-signoff">That's the whole picture: a per-pixel field of apparent motion, born in
      perception science, formalized in 1981, learned by networks today, painted with a 55-color wheel,
      and quietly running much of the moving-image world. Now go drag a flow file onto the page.</p>`,
  },
];
