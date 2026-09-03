/* σμμ — the vector-boson-fusion diagram, and the field grown out of it.

   The centre is drawn, not generated: two quarks come in, each radiates a weak
   boson, the two bosons fuse to a Higgs, and that Higgs splits into the pair.
   Everything outward of it grows from those six external legs, one legal
   Standard Model vertex at a time —

     a fermion carries on and radiates a boson (ffV) or a Higgs (ffh)
     a boson splits (VVV) or turns into a Higgs (hVV)
     a Higgs splits (hhh) or goes back to bosons (hVV)

   — refusing any placement that would come within a line's width of what is
   already drawn, or that would cross it, so the whole thing stays planar.

   The six legs of the diagram are laid down first, on an empty frame, and
   every side branch they throw off is set aside until they are finished; the
   branches then fill in around them. Grown all together instead, a leg is
   boxed in by its own siblings within four or five generations and has to
   stop. That ordering, and a leg that bends rather than stopping when there
   is nowhere to put a whole vertex, is what keeps each of them running the
   `minGens` generations asked of it. The result hands back the
   same {verts, edges} shape design/network.js draws, so SMMNet.drawEdge takes
   it unchanged, plus `coreEdges` (how many of the edges are the hand-drawn
   diagram, which come first) and a `gen` on every edge: 0 for the diagram, 1
   and up for each generation grown out of it.

   Requires design/network.js for its seeded rng. */
(function () {
  const RULES = {
    f: [['f', 'b'], ['f', 'b'], ['f', 'b'], ['f', 'h']],   // ffV, and a Yukawa now and then
    b: [['b', 'b'], ['b', 'h']],                           // VVV, hVV
    h: [['h', 'h'], ['h', 'h'], ['b', 'b']],               // hhh, and back to bosons
  };

    // Do two segments properly cross? Kept separate from the distance test
  // below, which now ignores the stretch nearest the vertex being grown from.
  function side(a, b, c) {
    return Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
  }
  function crosses(p1, p2, p3, p4) {
    return side(p1, p2, p3) * side(p1, p2, p4) < 0
        && side(p3, p4, p1) * side(p3, p4, p2) < 0;
  }

  function ptSeg(p, s0, s1) {
    const vx = s1[0] - s0[0], vy = s1[1] - s0[1];
    const wx = p[0] - s0[0], wy = p[1] - s0[1];
    const L2 = vx * vx + vy * vy || 1;
    const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / L2));
    return Math.hypot(wx - vx * t, wy - vy * t);
  }

  function build(cfg) {
    const W = cfg.w, H = cfg.h;
    const U = cfg.unit || H / 17;
    const CORE_S = cfg.coreScale == null ? 2.9 : cfg.coreScale;
    const MESH_S = cfg.meshScale == null ? 2.1 : cfg.meshScale;
    // Where the diagram sits. Middle of the frame unless told otherwise — a
    // tall screen wants it lower, under the masthead.
    const CX = cfg.cx == null ? W / 2 : cfg.cx;
    const CY = cfg.cy == null ? H / 2 : cfg.cy;
    const R = window.SMMNet.rng(cfg.seed == null ? 2026 : cfg.seed);
    const pick = arr => arr[Math.floor(R() * arr.length) % arr.length];

    const verts = [];
    const edges = [];
    const bend = [];        // vertices that are a kink in one line, not a junction
    const V = (x, y) => { verts.push([CX + x * U, CY + y * U]); return verts.length - 1; };
    const E = (i, j, type, s, gen) => {
      const A = verts[i], B = verts[j];
      edges.push({ a: i, b: j, type: type, s: s, gen: gen,
                   len: Math.hypot(B[0] - A[0], B[1] - A[1]), xa: false, xb: false });
      return edges.length - 1;
    };

    // Time runs left to right. A and B are the quark radiation vertices, C the
    // fusion, D the Higgs self-coupling. Laid out so the outgoing quarks open
    // wider than the Higgses they enclose, which keeps the whole thing planar.
    // The external legs are kept short: they carry on into the grown field
    // anyway, so their drawn length only sets how far out the first branch
    // happens. The outgoing quarks stay the widest thing in the picture, which
    // is what keeps the Higgses they enclose from crossing them — and they are
    // the long ones by the topology, since a quark leaving A has to get past D
    // before it can open out at all.
    const A = V(-1.7, -1.45), B = V(-1.7, 1.45), C = V(0.1, 0), D = V(1.5, 0);
    const f1in = V(-3.9, -2.0), f1out = V(3.3, -2.5);
    const f2in = V(-3.9, 2.0), f2out = V(3.3, 2.5);
    const h1 = V(2.7, -0.85), h2 = V(2.7, 0.85);

    E(f1in, A, 'f', CORE_S, 0); E(A, f1out, 'f', CORE_S, 0);
    E(f2in, B, 'f', CORE_S, 0); E(B, f2out, 'f', CORE_S, 0);
    E(A, C, 'b', CORE_S, 0); E(B, C, 'b', CORE_S, 0);
    E(C, D, 'h', CORE_S, 0);
    E(D, h1, 'h', CORE_S, 0); E(D, h2, 'h', CORE_S, 0);
    const coreEdges = edges.length;

    // The six ends the field grows out of, each with the direction it arrived
    // on and the end of the edge that carries the vacuum mark until something
    // grows out of it.
    const endMark = new Map();
    const tips = [f1in, f1out, f2in, f2out, h1, h2].map(i => {
      const ei = edges.findIndex(e => e.a === i || e.b === i);
      const e = edges[ei];
      const other = verts[e.a === i ? e.b : e.a];
      const which = e.a === i ? 'xa' : 'xb';
      endMark.set(i, [ei, which]);
      e[which] = true;
      return { v: i, type: e.type,
               dir: Math.atan2(verts[i][1] - other[1], verts[i][0] - other[0]) };
    });

    const PAD = U * 0.28;
    const SEP = (cfg.sep == null ? 0.42 : cfg.sep) * U;
    function placeable(from, to, skip) {
      if (to[0] < PAD || to[1] < PAD || to[0] > W - PAD || to[1] > H - PAD) return false;
      const L = Math.hypot(to[0] - from[0], to[1] - from[1]) || 1;
      for (let i = 0; i < edges.length; i++) {
        const p = verts[edges[i].a], q = verts[edges[i].b];
        if (crosses(from, to, p, q)) return false;
        const own = skip.indexOf(edges[i].a) >= 0 || skip.indexOf(edges[i].b) >= 0;
        const near = own ? SEP * 0.34 : SEP;
        for (let k = 0; k <= 12; k++) {
          const u = k / 12;
          // The stretch nearest the vertex being grown from is exempt. It is
          // already inside the keep-out of whatever else leaves that junction
          // — two legs of one vertex are meant to be close there — and testing
          // it meant a leg whose sibling left at a narrow angle was blocked in
          // every direction and at every reach, permanently, by its own
          // family. Crossings are caught above instead, exactly.
          if (u * L < (own ? L * 0.25 : SEP)) continue;
          const m = [from[0] + (to[0] - from[0]) * u, from[1] + (to[1] - from[1]) * u];
          if (ptSeg(m, p, q) < near) return false;
        }
      }
      for (let v = 0; v < verts.length; v++) {
        if (skip.indexOf(v) >= 0) continue;
        if (Math.hypot(verts[v][0] - to[0], verts[v][1] - to[1]) < SEP) return false;
      }
      return true;
    }

    const GENS = cfg.gens == null ? 10 : cfg.gens;
    /* How many generations a leg of the diagram must run before it is allowed
       to stop in the vacuum.

       This cannot be a promise about every line. If each one branched in two
       every generation, the tips at generation g would number 6·2^g and each
       would need its own SEP of arc, so they would have to sit on a ring of
       radius 6·2^g·SEP/2π — 660px by generation 5, 1300 by 6, 5300 by 8. The
       frame's half-diagonal is about 1100px. Eight generations of that would
       want a picture ten thousand pixels across.

       What is promised instead is what was actually asked for: the six legs
       of the diagram. Each one's own continuation — the fermion carrying on,
       the scalar's first branch — is kept alive this many generations, trying
       progressively harder for somewhere to put the vertex. Side branches try
       harder too, they are simply allowed to end when there is nowhere left. */
    const MIN_GENS = cfg.minGens == null ? 8 : cfg.minGens;

    // One go at putting a vertex down: place every outgoing leg, or place none
    // and leave the vertex list as it was found.
    function attempt(leg, out, angles, reach) {
      const placed = [];
      for (let i = 0; i < out.length; i++) {
        const L = reach * (0.82 + R() * 0.42);
        const to = [verts[leg.v][0] + Math.cos(angles[i]) * L,
                    verts[leg.v][1] + Math.sin(angles[i]) * L];
        const skip = [leg.v].concat(placed.map(p => p.v));
        if (!placeable(verts[leg.v], to, skip)) {
          placed.forEach(() => verts.pop());
          return null;
        }
        placed.push({ v: V((to[0] - CX) / U, (to[1] - CY) / U),
                      type: out[i], dir: angles[i] });
      }
      return placed;
    }

    // One go at putting a vertex down, at a given reach and set of angles.
    function search(leg, gen, trunk) {
      const radial = Math.atan2(verts[leg.v][1] - CY, verts[leg.v][0] - CX);
      let bias = radial - leg.dir;
      while (bias > Math.PI) bias -= Math.PI * 2;
      while (bias < -Math.PI) bias += Math.PI * 2;
      let base = leg.dir + bias * 0.35;
      // Near the frame that outward push walks the leg straight off it, which
      // is where most of the ones that stopped short were stopping. Lean the
      // heading back inside so it runs along the edge instead.
      const near = U * 1.9;
      let wx = 0, wy = 0;
      if (verts[leg.v][0] < near) wx = 1; else if (verts[leg.v][0] > W - near) wx = -1;
      if (verts[leg.v][1] < near) wy = 1; else if (verts[leg.v][1] > H - near) wy = -1;
      if (wx || wy) base = Math.atan2(Math.sin(base) + wy * 0.85, Math.cos(base) + wx * 0.85);
      const step = U * (0.95 - 0.07 * Math.min(gen, 9)) * (gen === 0 ? 1.15 : 1);
      // The legs start nearer the middle now that they are short, so they
      // are into each other's way sooner and it is worth looking harder.
      const tries = trunk ? 200 : (gen < MIN_GENS ? 24 : 1);

      for (let k = 0; k < tries; k++) {
        const out = pick(RULES[leg.type]);
        const ease = k / tries;
        const straight = leg.type === 'f' && out[0] === 'f';
        const wide = (0.34 + R() * 0.3) * (straight ? 1.55 : 1);
        const spin = k ? (R() - 0.5) * 1.5 * ease : 0;
        const angles = straight
          ? [base + spin + (R() - 0.5) * 0.24, base + spin + (R() < 0.5 ? -wide : wide)]
          : [base + spin - wide * (0.75 + R() * 0.5), base + spin + wide * (0.75 + R() * 0.5)];
        // Never below about a separation and a half: a shorter reach puts the
        // new vertex inside a neighbour's keep-out, so the shortest attempts
        // could not have fitted whatever the angle.
        const reach = Math.max(SEP * 1.45, step * (1 - 0.55 * ease));
        const got = attempt(leg, out, angles, reach);
        if (got) return got;
      }
      // A leg of the diagram with nowhere to put a whole vertex carries on as
      // a kink instead: its side branch has nowhere to go, but a propagator
      // drawn with a bend is still one propagator, no interaction, so there is
      // nothing there to be legal or illegal about. It takes no mark, and the
      // audit is told to skip it. Swept rather than sampled — one leg to place,
      // so walk the forward arc and take the first gap.
      if (trunk) {
        for (let a = 0; a < 21; a++) {
          const turn = (a % 2 ? -1 : 1) * Math.ceil(a / 2) * 0.14;
          for (let r = 0; r < 3; r++) {
            const reach = Math.max(SEP * 1.45, step * (1.15 - 0.3 * r));
            const got = attempt(leg, [leg.type], [base + turn], reach);
            if (got) { bend[leg.v] = 1; return got; }
          }
        }
      }
      return null;
    }

    function lay(leg, gen, placed) {
      const was = endMark.get(leg.v);
      if (was) edges[was[0]][was[1]] = false;        // a junction now, not an end
      const taper = Math.max(MESH_S, CORE_S - gen * 0.14);
      placed.forEach(p => {
        const ei = E(leg.v, p.v, p.type, taper, gen + 1);
        edges[ei].xb = true;                         // until something grows out of it
        endMark.set(p.v, [ei, 'xb']);
      });
    }

    /* The six legs go down first, on an empty frame.
       Grown all together with everything else, a leg is boxed in by its own
       siblings' branches within four or five generations and has to stop —
       measured, before this: not one leg in a hundred and eighty reached
       eight. So the legs are laid first, alone, and every side branch they
       throw off is set aside; those fill in around them afterwards, into
       whatever room is left, and may end where they run out. */
    const deferred = [];
    let trunkFront = tips.map(t => ({ v: t.v, type: t.type, dir: t.dir }));
    for (let gen = 0; gen < MIN_GENS && trunkFront.length; gen++) {
      const next = [];
      for (let i = 0; i < trunkFront.length; i++) {
        const leg = trunkFront[i];
        const placed = search(leg, gen, true);
        if (!placed) continue;
        lay(leg, gen, placed);
        next.push(placed[0]);                        // the leg carries on
        for (let j = 1; j < placed.length; j++) {
          deferred.push({ leg: placed[j], gen: gen + 1 });
        }
      }
      trunkFront = next;
    }

    // Then everything hanging off them, into what is left.
    const queue = deferred;
    for (let qi = 0; qi < queue.length; qi++) {
      const item = queue[qi];
      if (item.gen >= GENS) continue;
      const placed = search(item.leg, item.gen, false);
      if (!placed) continue;
      lay(item.leg, item.gen, placed);
      placed.forEach(p => queue.push({ leg: p, gen: item.gen + 1 }));
    }

    return { verts: verts, edges: edges, coreEdges: coreEdges, bend: bend,
             unit: U, gens: GENS, cx: CX, cy: CY };
  }

  /* Keep-out for the generated mesh: build() takes rectangles and discs, so a
     line's is a row of small discs along it. One disc per segment would clear a
     circle as wide as the segment is long, which on the core's own legs punches
     holes across half the frame. The hand-drawn centre gets a wider berth than
     the branches — the mesh crowding it would cost the one thing meant to be
     read. */
  function zones(net, keep) {
    const out = [];
    for (let i = 0; i < net.edges.length; i++) {
      const e = net.edges[i];
      const p = net.verts[e.a], q = net.verts[e.b];
      const r = e.gen === 0 ? keep * 2.1 : keep;
      const L = Math.hypot(q[0] - p[0], q[1] - p[1]);
      const n = Math.max(1, Math.ceil(L / (r * 0.8)));
      for (let k = 0; k <= n; k++) {
        const u = k / n;
        out.push({ cx: p[0] + (q[0] - p[0]) * u, cy: p[1] + (q[1] - p[1]) * u, r: r });
      }
    }
    return out;
  }

  window.SMMVBF = { build: build, zones: zones };
})();
