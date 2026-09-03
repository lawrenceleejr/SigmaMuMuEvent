/* σμμ — the vector-boson-fusion diagram, and the field grown out of it.

   The centre is drawn, not generated: two quarks come in, each radiates a weak
   boson, the two bosons fuse to a Higgs, and that Higgs splits into the pair.
   Everything outward of it grows from those six external legs, one legal
   Standard Model vertex at a time —

     a fermion carries on and radiates a boson (ffV) or a Higgs (ffh)
     a boson splits (VVV) or turns into a Higgs (hVV)
     a Higgs splits (hhh) or goes back to bosons (hVV)

   — refusing any placement that would come within a line's width of what is
   already drawn, so no leg ever crosses another. The result hands back the
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
    const CX = W / 2, CY = H / 2;
    const R = window.SMMNet.rng(cfg.seed == null ? 2026 : cfg.seed);
    const pick = arr => arr[Math.floor(R() * arr.length) % arr.length];

    const verts = [];
    const edges = [];
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
    const A = V(-1.7, -1.45), B = V(-1.7, 1.45), C = V(0.2, 0), D = V(2.0, 0);
    const f1in = V(-5.2, -2.35), f1out = V(5.3, -3.0);
    const f2in = V(-5.2, 2.35), f2out = V(5.3, 3.0);
    const h1 = V(5.0, -1.35), h2 = V(5.0, 1.35);

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
      for (let i = 0; i < edges.length; i++) {
        const p = verts[edges[i].a], q = verts[edges[i].b];
        const own = skip.indexOf(edges[i].a) >= 0 || skip.indexOf(edges[i].b) >= 0;
        const near = own ? SEP * 0.34 : SEP;
        for (let k = 0; k <= 12; k++) {
          const u = k / 12;
          if (own && u < 0.25) continue;
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
    let frontier = tips;
    for (let gen = 0; gen < GENS && frontier.length; gen++) {
      const next = [];
      // The step shortens as the field gets away from the centre, so it
      // densifies outward rather than reaching the frame in three strides.
      const step = U * (0.95 - 0.07 * gen) * (gen === 0 ? 1.15 : 1);
      for (let li = 0; li < frontier.length; li++) {
        const leg = frontier[li];
        const out = pick(RULES[leg.type]);
        // Legs open around the direction this one was already going, nudged
        // toward straight out from the centre so nothing folds back in.
        const radial = Math.atan2(verts[leg.v][1] - CY, verts[leg.v][0] - CX);
        let bias = radial - leg.dir;
        while (bias > Math.PI) bias -= Math.PI * 2;
        while (bias < -Math.PI) bias += Math.PI * 2;
        const base = leg.dir + bias * 0.35;
        // A fermion carries on nearly straight with the boson coming off it; a
        // splitting scalar or boson opens symmetrically.
        const straight = leg.type === 'f' && out[0] === 'f';
        const wide = (0.34 + R() * 0.3) * (straight ? 1.55 : 1);
        const angles = straight
          ? [base + (R() - 0.5) * 0.24, base + (R() < 0.5 ? -wide : wide)]
          : [base - wide * (0.75 + R() * 0.5), base + wide * (0.75 + R() * 0.5)];
        const placed = [];
        for (let i = 0; i < out.length; i++) {
          const L = step * (0.82 + R() * 0.42);
          const to = [verts[leg.v][0] + Math.cos(angles[i]) * L,
                      verts[leg.v][1] + Math.sin(angles[i]) * L];
          const skip = [leg.v].concat(placed.map(p => p.v));
          if (!placeable(verts[leg.v], to, skip)) continue;
          placed.push({ v: V((to[0] - CX) / U, (to[1] - CY) / U),
                        type: out[i], dir: angles[i] });
        }
        // A vertex is only legal whole: unless both legs went down, this leg
        // stays a single line ending in the vacuum.
        if (placed.length < out.length) { placed.forEach(() => verts.pop()); continue; }
        const was = endMark.get(leg.v);
        if (was) edges[was[0]][was[1]] = false;      // a junction now, not an end
        const taper = Math.max(MESH_S, CORE_S - gen * 0.14);
        placed.forEach(p => {
          const ei = E(leg.v, p.v, p.type, taper, gen + 1);
          edges[ei].xb = true;                       // until something grows out of it
          endMark.set(p.v, [ei, 'xb']);
          next.push(p);
        });
      }
      frontier = next;
    }
    return { verts: verts, edges: edges, coreEdges: coreEdges, unit: U, gens: GENS };
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
