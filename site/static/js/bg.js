/* The presenter screen at /bg.
 *
 * This is the website's background — site/static/js/field.js — put on a
 * screen for the room, and it is deliberately the same mechanic and nothing
 * more. One or two walkers flood the generated mesh from a single vertex
 * each, by a direction-biased Dijkstra so the front travels rather than
 * spreading as a disc; a line starts drawing only when the flood reaches it,
 * out of the vertex it arrived at, on the poster's growth curve; behind the
 * head the field holds and the tail fades it out again. The website takes the
 * tail length from the scroll, and there is nothing to scroll here, so it is
 * fixed — short, so the picture is always turning over rather than filling
 * the plane and sitting there for the rest of the coffee break.
 *
 * The one addition is the VBF diagram: nine hand-drawn lines in the middle,
 * drawn a little heavier than the mesh, with the mesh kept off them. It is not
 * a fixture. Its lines are edges of the same graph the flood runs over, so it
 * appears when a front reaches it, draws itself out of the vertex the front
 * arrived at, and fades with the tail like everything else -- and every one
 * of its six legs is wired into the mesh at a legal vertex, so nothing about
 * it ends in a vacuum mark. It sits in the middle so that when it comes it is
 * noticed. An earlier version held it still on its own canvas at full
 * strength; that read as a diagram pasted on top of a field. Set
 * `diagram: false` in site/content/bg.md and the page is the website's field
 * exactly.
 *
 * Painting is batched the way site/static/js/field.js batches it: same-tone,
 * same-type lines go into one Path2D and are stroked together, marks once per
 * vertex. A projector is an unknown machine, often without a GPU, and this is
 * the difference between a smooth field and a slideshow.
 */
(function () {
  var live = document.getElementById('live');
  if (!live || !window.SMMNet || !window.SMMVBF) return;
  var lx = live.getContext('2d');

  var INK = getComputedStyle(document.documentElement).getPropertyValue('--ink').trim();
  var ACCENT = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  var PIXEL_BUDGET = 3.5e6;      // past this the fill rate costs more than the sharpness
  var WALKERS = 3;               // out of phase, so the field is never empty
  var TRAVERSE = 30;             // seconds for a walker to cross its whole flood
  var TAIL = 0.3;                // tail as a fraction of the flood, which is
                                 // how long a line lives: TAIL * TRAVERSE
                                 // seconds, so nine. Long, and the field fills
                                 // up and holds; this short, a band travels
                                 // through it and two thirds of what is lit
                                 // now was dark ten seconds ago. Measured over
                                 // a range of these: 0.85 left 79% of the lit
                                 // picture unchanged over ten seconds and then
                                 // drained the frame to almost nothing before
                                 // refilling, which is the fill-and-sit this
                                 // replaces.
  var FADE = 0.5;                // fraction of the tail spent fading out. A
                                 // short tail wants more of it spent fading,
                                 // or lines snap off rather than leave.
  var BUCKETS = 12;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var wantDiagram = window.SMM_BG_DIAGRAM !== false;

  var W = 0, H = 0, DPR = 1, U = 0, MESH_S = 1, CORE_S = 1;
  var drawn = null, mesh = null, baseTone = null, walkers = null;
  var eGrow = null, eTone = null, eRev = null, vIsX = null;
  var meshBend = null, vHeavy = null, unjoined = 0;

  function sizeOf() {
    W = Math.max(320, window.innerWidth);
    H = Math.max(240, window.innerHeight);
    // The budget only stops the canvas supersampling a big screen; it never
    // takes it below one device pixel per CSS pixel. adapt() does that, and
    // only on a machine that turns out to need it.
    DPR = Math.min(window.devicePixelRatio || 1,
                   Math.max(1, Math.sqrt(PIXEL_BUDGET / (W * H))));
    backing();
  }
  function backing() {
    live.width = Math.round(W * DPR);
    live.height = Math.round(H * DPR);
    lx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }

  /* A projector is an unknown machine. If the frames come back slow — a 4K
     panel driven without acceleration is the case that bites — trade some
     resolution for a steady rate rather than let the field stutter. It only
     ever steps down, after a warm-up, and stops at 0.6. */
  var SLOW_FRAME = 1 / 38, ADAPT_EVERY = 2, ADAPT_STEP = 0.8, DPR_FLOOR = 0.6;
  var frameEma = 1 / 60, adaptClock = 0, warmup = 3;
  function adapt(dt) {
    if (warmup > 0) { warmup -= dt; return; }
    frameEma += (dt - frameEma) * 0.08;
    adaptClock += dt;
    if (adaptClock < ADAPT_EVERY) return;
    adaptClock = 0;
    if (frameEma > SLOW_FRAME && DPR > DPR_FLOOR) {
      DPR = Math.max(DPR_FLOOR, DPR * ADAPT_STEP);
      backing();
      frameEma = 1 / 60;
    }
  }

  /* ---- wiring the diagram into the field --------------------------------- */
  /* The diagram's nine lines are edges of the mesh graph -- merged in before
     this runs -- so what is left is to connect its six loose legs to the rest,
     and to do that legally.

     It looks impossible at first. Every mesh vertex is already a legal
     interaction of degree three or four, and hanging another leg on one makes
     it four or five, and five is never legal. For a fermion leg the arithmetic
     closes off completely: a legal vertex never carries an odd number of
     fermion legs, so there is no vertex anywhere that can take one.

     But the mesh has loose ends of its own, and there are legal things to do
     with those, tried nearest-first:

       . An end of the same kind as the leg: one propagator carrying on, with a
         kink where the two were drawn from opposite ends. No interaction, so
         nothing to be legal about, and both vacuum marks go.
       . A leg running straight into a mesh vertex whose leg-set stays legal
         with it added. The table is asked, not second-guessed: it admits a
         Higgs onto an hVV or an hhh and turns every fermion attempt down.
       . A loose boson or Higgs end landing partway along a fermion leg -- ffV,
         or a Yukawa. A real interaction with a dot, and the mesh's own vacuum
         mark disappears in the bargain.
       . Failing all that, a boson the leg radiates into any mesh vertex that
         can legally carry one.

     Every leg must connect: a leg left dangling would end in a vacuum mark,
     and the diagram is meant to arise out of the field rather than be pinned
     onto it. So the reach widens in steps, and if a leg still finds nothing
     the caller grows a fresh mesh and tries again. */
  var LEGAL = { bff: 1, bbff: 1, ffh: 1, bbb: 1, bbbb: 1, bbh: 1, bbhh: 1,
                hhh: 1, hhhh: 1 };
  function legal(types, add) {
    var t = types.concat([add]);
    return t.length <= 4 && !!LEGAL[t.slice().sort().join('')];
  }
  function edgeLen(m, e) {
    var p = m.verts[e.a], q = m.verts[e.b];
    return Math.hypot(q[0] - p[0], q[1] - p[1]);
  }

  function joinDiagram(mesh, U) {
    var clear = U * 0.26;     // the berth a join keeps from everything else
    var minRun = U * 0.16;    // shorter than this and there is no line to see

    function side(a, b, c) {
      return Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
    }
    function crosses(p1, p2, p3, p4) {
      return side(p1, p2, p3) * side(p1, p2, p4) < 0
          && side(p3, p4, p1) * side(p3, p4, p2) < 0;
    }
    function ptSeg(p, s0, s1) {
      var vx = s1[0] - s0[0], vy = s1[1] - s0[1];
      var wx = p[0] - s0[0], wy = p[1] - s0[1];
      var L2 = vx * vx + vy * vy || 1;
      var t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / L2));
      return Math.hypot(wx - vx * t, wy - vy * t);
    }
    /* Clear of every line but the two being joined. The berth is not asked
       for near the join's own ends: lines that meet at a vertex touch there
       by definition, so measured from the last stretch of the join the test
       always failed, at the very junction it was aimed at. Crossings are
       still tested along the whole length. */
    function ok(from, to, skipA, skipB) {
      var free = clear * 1.15, edges = mesh.edges;
      for (var i = 0; i < edges.length; i++) {
        if (i === skipA || i === skipB) continue;
        var p = mesh.verts[edges[i].a], q = mesh.verts[edges[i].b];
        if (crosses(from, to, p, q)) return false;
        for (var k = 1; k < 10; k++) {
          var u = k / 10;
          var m = [from[0] + (to[0] - from[0]) * u, from[1] + (to[1] - from[1]) * u];
          if (Math.hypot(m[0] - from[0], m[1] - from[1]) < free) continue;
          if (Math.hypot(m[0] - to[0], m[1] - to[1]) < free) continue;
          if (ptSeg(m, p, q) < clear) return false;
        }
      }
      return true;
    }

    // What meets each vertex. Plain arrays: the joins add vertices as they go.
    var deg = [], one = [], types = [];
    for (var q = 0; q < mesh.verts.length; q++) { deg.push(0); one.push(-1); types.push([]); }
    mesh.edges.forEach(function (e, i) {
      deg[e.a]++; deg[e.b]++; one[e.a] = i; one[e.b] = i;
      types[e.a].push(e.type); types[e.b].push(e.type);
    });
    var isCore = mesh.isCore;

    // The mesh's loose ends, and the diagram's legs. A leg must not be
    // offered another leg: two fermion legs joined would close the fermion
    // line back through the diagram, legally and unreadably.
    var ends = [];
    for (var v = 0; v < mesh.verts.length; v++) {
      if (deg[v] === 1 && !isCore[v] && one[v] >= 0) {
        ends.push({ v: v, e: one[v], type: mesh.edges[one[v]].type, used: false });
      }
    }
    // A loose end that is already off the picture is a line that has left,
    // not a leg to be joined.
    var legs = [];
    for (var c = 0; c < mesh.verts.length; c++) {
      if (!isCore[c] || deg[c] !== 1) continue;
      var pc = mesh.verts[c];
      if (pc[0] < 0 || pc[1] < 0 || pc[0] > W || pc[1] > H) continue;
      legs.push({ v: c, e: one[c] });
    }

    function addEdge(a, b, type, s, kink) {
      var e = { a: a, b: b, type: type, s: s, xa: false, xb: false, join: true, kink: !!kink };
      e.len = edgeLen(mesh, e);
      mesh.edges.push(e);
      deg[a]++; deg[b]++; types[a].push(type); types[b].push(type);
    }
    function addVert(P, core) {
      var v = mesh.verts.push([P[0], P[1]]) - 1;
      deg.push(0); one.push(-1); types.push([]); isCore.push(!!core); mesh.bend.push(0);
      return v;
    }

    function tryLeg(leg, reach) {
      var ce = mesh.edges[leg.e], want = ce.type;
      var tipEnd = ce.a === leg.v ? 'xa' : 'xb';
      var from = mesh.verts[leg.v];

      // First: an end of the same kind, met head on.
      var best = null, bd = reach;
      ends.forEach(function (en) {
        if (en.used || en.type !== want) return;
        var d = Math.hypot(mesh.verts[en.v][0] - from[0], mesh.verts[en.v][1] - from[1]);
        if (d < bd && d > minRun && ok(from, mesh.verts[en.v], en.e, leg.e)) { bd = d; best = en; }
      });
      if (best) {
        addEdge(leg.v, best.v, want, mesh.edges[best.e].s, true);
        ce[tipEnd] = false;
        mesh.edges[best.e][mesh.edges[best.e].a === best.v ? 'xa' : 'xb'] = false;
        mesh.bend[leg.v] = 1; mesh.bend[best.v] = 1;        // one propagator, no marks
        best.used = true;
        return true;
      }

      // Second: straight into a mesh vertex that can legally take it. Our tip
      // becomes a kink -- the propagator carries on and interacts over there.
      var at = -1, ad = reach;
      for (var v2 = 0; v2 < mesh.verts.length; v2++) {
        if (isCore[v2] || !types[v2].length || !legal(types[v2], want)) continue;
        var d2 = Math.hypot(mesh.verts[v2][0] - from[0], mesh.verts[v2][1] - from[1]);
        if (d2 >= ad || d2 <= minRun) continue;
        if (!ok(from, mesh.verts[v2], -1, leg.e)) continue;
        ad = d2; at = v2;
      }
      if (at >= 0) {
        // A mesh kink is a bend, not an interaction; a third line makes it one.
        mesh.bend[at] = 0;
        addEdge(leg.v, at, want, mesh.edges[one[at] >= 0 ? one[at] : 0].s, false);
        ce[tipEnd] = false;
        mesh.bend[leg.v] = 1;
        return true;
      }
      if (want !== 'f') return false;
      return tapLeg(leg, reach);
    }

    /* Bremsstrahlung off a quark leg: a loose boson or Higgs end landing
       partway along it (ffV, or a Yukawa), or failing that a boson the leg
       radiates into any mesh vertex that can legally carry one. This never
       ends the leg -- a fermion cannot end inside the frame -- but it is how
       the quark lines are stitched to the field, so a front arriving along
       the mesh has somewhere to cross into the diagram. */
    function tapLeg(leg, reach) {
      var ce = mesh.edges[leg.e], want = ce.type;
      var tipEnd = ce.a === leg.v ? 'xa' : 'xb';
      var from = mesh.verts[leg.v];
      var other = mesh.verts[ce.a === leg.v ? ce.b : ce.a];
      var vx = from[0] - other[0], vy = from[1] - other[1];
      var L2 = vx * vx + vy * vy || 1;
      var pick = null, pd = reach, pAt = null;
      ends.forEach(function (en) {
        if (en.used || en.type === 'f') return;
        if (!legal([want, want], en.type)) return;
        var qq = mesh.verts[en.v];
        var t = ((qq[0] - other[0]) * vx + (qq[1] - other[1]) * vy) / L2;
        t = Math.max(0.34, Math.min(0.82, t));
        var P = [other[0] + vx * t, other[1] + vy * t];
        var d = Math.hypot(qq[0] - P[0], qq[1] - P[1]);
        // A Higgs tap is legal but draws in the accent and dashes; a handful
        // of them round the diagram reads as a different picture. Weighted
        // back, it wins only when clearly the nearer.
        var w = d * (en.type === 'h' ? 1.7 : 1);
        if (w < pd && d > minRun && ok(P, qq, en.e, leg.e)) { pd = w; pick = en; pAt = P; }
      });
      if (!pick) {
        for (var v3 = 0; v3 < mesh.verts.length; v3++) {
          if (isCore[v3] || !types[v3].length || !legal(types[v3], 'b')) continue;
          var r = mesh.verts[v3];
          var t3 = ((r[0] - other[0]) * vx + (r[1] - other[1]) * vy) / L2;
          t3 = Math.max(0.34, Math.min(0.82, t3));
          var P3 = [other[0] + vx * t3, other[1] + vy * t3];
          var d3 = Math.hypot(r[0] - P3[0], r[1] - P3[1]);
          if (d3 >= pd || d3 <= minRun || !ok(P3, r, -1, leg.e)) continue;
          pd = d3; pAt = P3;
          pick = { v: v3, e: one[v3], type: 'b', fresh: true };
        }
      }
      if (!pick) return false;

      // Split the leg at the landing point. A fermion is a plain stroke, so
      // the two halves read as the one straight line they were; the new
      // vertex is a real one and gets its dot from the mesh's own painting.
      var mid = addVert(pAt, true);
      var far = { a: mid, b: leg.v, type: want, s: ce.s, xa: false, xb: ce[tipEnd],
                  core: true, len: 0 };
      far.len = Math.hypot(from[0] - pAt[0], from[1] - pAt[1]);
      if (ce.a === leg.v) ce.a = mid; else ce.b = mid;
      ce[tipEnd] = false; ce.len = edgeLen(mesh, ce);
      ce.__p2d = ce.__pts = ce.__ptsR = null;
      mesh.edges.push(far);
      // The tip keeps its degree and kinds -- one fermion edge was swapped
      // for another -- and now belongs to `far`; `mid` carries both halves.
      one[leg.v] = mesh.edges.length - 1;
      deg[mid] = 2; types[mid] = [want, want];

      if (pick.fresh) mesh.bend[pick.v] = 0;
      addEdge(mid, pick.v, pick.type, mesh.edges[pick.e >= 0 ? pick.e : 0].s, !pick.fresh);
      if (!pick.fresh) {
        mesh.edges[pick.e][mesh.edges[pick.e].a === pick.v ? 'xa' : 'xb'] = false;
        mesh.bend[pick.v] = 1;                 // the mesh's end is a kink now
      }
      pick.used = true;
      return true;
    }

    // Everything close by first, so a leg with a neighbour takes it rather
    // than losing it to a leg on the far side reaching across; then wider.
    var rungs = [3.6, 5.6, 8.5, 13];
    var left = legs.slice();
    for (var ri = 0; ri < rungs.length && left.length; ri++) {
      var reach = U * rungs[ri];
      left = left.filter(function (l) {
        l.e = one[l.v];
        return deg[l.v] === 1 && !tryLeg(l, reach);
      });
    }

    // The quark legs have left the picture and need no ending; they still
    // want stitching to the field. Every fermion line of the diagram is a
    // quark leg, and its tip is the end that is not the radiation vertex.
    var taps = 0;
    mesh.edges.forEach(function (e, i) {
      if (!e.core || e.esc || e.type !== 'f') return;
      var tip = deg[e.a] === 2 ? e.a : (deg[e.b] === 2 ? e.b : -1);
      if (tip < 0) return;
      for (var rj = 0; rj < rungs.length; rj++) {
        if (tapLeg({ v: tip, e: i }, U * rungs[rj])) { taps++; break; }
      }
    });

    /* The quark lines that left the picture cut the field into sectors: an
       edge crossing their keep-out is pruned, so what lies either side of a
       quark is a separate component, and a front floods only the component
       it started in. Left like that, whole sectors go dark until a walker
       happens to re-seed inside them.

       The mesh's own fermion lines have bosons hanging off them everywhere,
       and that is the answer here too. A kink on a quark line is two fermion
       legs; a boson landing there makes it bff, which is legal, and turns
       the kink into a real vertex. So every kink on an escaped quark is
       offered a boson -- a loose end from the mesh for choice, a fresh line
       to any vertex that can take one otherwise -- on whichever side it can
       reach. The quark becomes indistinguishable from a mesh fermion line,
       which is the point, and the sectors are sewn back into one field the
       front can cross. */
    var stitches = 0;
    var kinks = [];
    for (var kv = 0; kv < mesh.verts.length; kv++) {
      if (!isCore[kv] || deg[kv] !== 2) continue;
      if (types[kv][0] !== 'f' || types[kv][1] !== 'f') continue;
      var kp = mesh.verts[kv];
      if (kp[0] < 0 || kp[1] < 0 || kp[0] > W || kp[1] > H) continue;
      kinks.push(kv);
    }
    kinks.forEach(function (kv) {
      var from = mesh.verts[kv];
      var reach = U * 2.4;
      var best = null, bd = reach;
      ends.forEach(function (en) {
        if (en.used || en.type !== 'b') return;
        var d = Math.hypot(mesh.verts[en.v][0] - from[0], mesh.verts[en.v][1] - from[1]);
        if (d < bd && d > minRun && ok(from, mesh.verts[en.v], en.e, -1)) { bd = d; best = en; }
      });
      if (best) {
        addEdge(kv, best.v, 'b', mesh.edges[best.e].s, true);
        mesh.edges[best.e][mesh.edges[best.e].a === best.v ? 'xa' : 'xb'] = false;
        mesh.bend[best.v] = 1;                 // the mesh's end carries on
        mesh.bend[kv] = 0;                     // and the kink is a vertex now
        best.used = true; stitches++;
        return;
      }
      var at = -1, ad = reach;
      for (var v4 = 0; v4 < mesh.verts.length; v4++) {
        if (isCore[v4] || !types[v4].length || !legal(types[v4], 'b')) continue;
        var d4 = Math.hypot(mesh.verts[v4][0] - from[0], mesh.verts[v4][1] - from[1]);
        if (d4 >= ad || d4 <= minRun || !ok(from, mesh.verts[v4], -1, -1)) continue;
        ad = d4; at = v4;
      }
      if (at >= 0) {
        mesh.bend[at] = 0;
        addEdge(kv, at, 'b', mesh.edges[one[at] >= 0 ? one[at] : 0].s, false);
        mesh.bend[kv] = 0;
        stitches++;
      }
    });

    // How much of the field one front can reach: the share of edges in the
    // largest connected component. Anything much below all of it means a
    // sector was walled off and will sit dark.
    var comp = new Int32Array(mesh.verts.length).fill(-1), ncomp = 0;
    var adj = mesh.verts.map(function () { return []; });
    mesh.edges.forEach(function (e, i) { adj[e.a].push(e.b); adj[e.b].push(e.a); });
    for (var s0 = 0; s0 < mesh.verts.length; s0++) {
      if (comp[s0] >= 0 || !adj[s0].length) continue;
      var stack = [s0]; comp[s0] = ncomp;
      while (stack.length) {
        var u = stack.pop();
        for (var ai = 0; ai < adj[u].length; ai++) {
          var w = adj[u][ai];
          if (comp[w] < 0) { comp[w] = ncomp; stack.push(w); }
        }
      }
      ncomp++;
    }
    var perComp = new Int32Array(ncomp);
    mesh.edges.forEach(function (e) { perComp[comp[e.a]]++; });
    var largest = 0;
    for (var ci = 0; ci < ncomp; ci++) if (perComp[ci] > largest) largest = perComp[ci];

    var joined = 0;
    mesh.edges.forEach(function (e) { if (e.join) joined++; });
    return { dangling: left.length, joined: joined, taps: taps, stitches: stitches,
             components: ncomp, reach: largest / Math.max(1, mesh.edges.length) };
  }

  var CX = 0, CY = 0;
  function build() {
    sizeOf();
    // The diagram is ten and a half units across, so on a tall screen the
    // width is what limits it, not the height. Taking the smaller of the two
    // keeps it inside the frame instead of running off both edges — and it is
    // a feature in a field rather than the whole screen, so it sits well
    // inside both.
    U = Math.min(H / 21, W / 16);
    // And the line scale follows that unit rather than the screen width. Tied
    // to width, a phone got a scale of 0.2 while the geometry stayed sized off
    // height: eleven wave cycles along an edge the desktop draws with three.
    var ref = U / (1080 / 17);
    CORE_S = 3.4 * ref;   // heavier than the mesh's 2.1: noticed when it comes
    MESH_S = 2.1 * ref;
    CX = W / 2;
    CY = H > W ? H * 0.56 : H / 2;      // held tall: down, clear of the masthead
    // Grow the diagram, then a mesh around it, then wire what is left. A leg
    // that finds nothing to meet even at the widest reach would end in a
    // vacuum mark, so both are thrown away and grown again.
    //
    // The quark legs are a special case, and the reason this cannot be done by
    // joining alone: a legal vertex never carries an odd number of fermion
    // legs, so a fermion line cannot end anywhere inside the frame. It can
    // only leave. So the four quarks wander out of the picture as kinked
    // lines at the mesh's weight -- the way the mesh's own long fermion lines
    // move -- and only the two Higgs legs are left for the joins to connect.
    // The two Higgs legs are joined into the mesh where they can be. When they
    // cannot -- the outgoing quarks sometimes wander out either side of them
    // and pinch the mesh there to nothing -- the later attempts let them leave
    // the picture as well, which is legal for an external Higgs and leaves the
    // stitching to the quark legs.
    // Attempts fail for two different reasons and get two different answers.
    // A Higgs leg that found nothing to meet is retried on a fresh mesh, and
    // only on the last attempt allowed to leave the picture -- an external
    // Higgs is legal, but a dashed accent line running to the edge is loud,
    // and two of them change what the picture is about. A field a front
    // cannot reach nearly all of is simply grown again.
    var result = null, higgsStuck = false;
    for (var attempt = 0; attempt < 5; attempt++) {
      // gens/minGens 0 stops after the nine hand-drawn lines: no growth, which
      // is what took this away from the website's design in the first place.
      drawn = wantDiagram ? window.SMMVBF.build({ w: W, h: H, unit: U, cx: CX, cy: CY,
        seed: (Math.random() * 1e9) | 0, coreScale: CORE_S, meshScale: MESH_S,
        gens: 0, minGens: 0,
        escapeTypes: higgsStuck && attempt === 4 ? ['f', 'h'] : ['f'],
        escapeScale: MESH_S, escapeReach: 4 }) : null;
      mesh = window.SMMNet.build({
        w: W, h: H, zones: drawn ? window.SMMVBF.zones(drawn, U * 0.3) : [],
        seed: (Math.random() * 1e9) | 0, seeds: [{ x: CX, y: CY }],
        // build() multiplies spacing by scaleAt, which is also the line weight,
        // so the separation is asked for in units of the frame and divided back
        // out — otherwise a 4K screen gets a field twice as coarse as a laptop.
        // 40k darts lands within a few per cent of the mesh 160k gives and
        // builds in a quarter of the time, which is what somebody waits
        // through when they pull this up mid-break.
        spacing: U * 0.93 / MESH_S, keep: 0.72, speed: 120, darts: 40000,
        pad: -U * 0.5, clearance: 0, clearanceAt: function () { return 0; },
        scaleAt: function () { return MESH_S; },
        cornerR: 0, maxLegs: 4, minSep: 0.42, minSepHard: 0.25, minComponent: 3,
        fermionShare: 0.5, higgsShare: 0.18, splitQuads: false,
        higgsPure: 7, higgsQuartics: 2,
      });
      // Plain arrays for the per-vertex flags: the joins add vertices.
      var bend = [], isCore = [];
      for (var v0 = 0; v0 < mesh.verts.length; v0++) {
        bend.push(mesh.bend && mesh.bend[v0] ? 1 : 0); isCore.push(false);
      }
      mesh.bend = bend; mesh.isCore = isCore;
      unjoined = 0;
      if (drawn) {
        var off = mesh.verts.length;
        drawn.verts.forEach(function (p, i) {
          mesh.verts.push([p[0], p[1]]);
          bend.push(drawn.bend && drawn.bend[i] ? 1 : 0); isCore.push(true);
        });
        drawn.edges.forEach(function (e) {
          var m = { a: e.a + off, b: e.b + off, type: e.type, s: e.s,
                    xa: !!e.xa, xb: !!e.xb, core: true, esc: !!e.esc };
          m.len = edgeLen(mesh, m);
          mesh.edges.push(m);
        });
        result = joinDiagram(mesh, U);
        unjoined = result.dangling;
      }
      // Done when nothing of the diagram ends in the frame, at least one line
      // ties it to the mesh, and one front can reach most of the field -- a
      // sector walled off by a quark line would otherwise sit dark until a
      // walker happened to re-seed inside it.
      if (unjoined) higgsStuck = true;
      if (!unjoined && (!drawn || (result.joined > 0 && result.reach >= 0.8))) break;
    }

    mesh.inc = mesh.verts.map(function () { return []; });
    mesh.edges.forEach(function (e, i) { mesh.inc[e.a].push(i); mesh.inc[e.b].push(i); });

    baseTone = new Float32Array(mesh.edges.length);
    mesh.edges.forEach(function (e, i) {
      var p = mesh.verts[e.a], q = mesh.verts[e.b];
      var d = Math.hypot(((p[0] + q[0]) / 2 - CX) / (W / 2),
                         ((p[1] + q[1]) / 2 - CY) / (H / 2));
      baseTone[i] = 0.5 * (1 - 0.4 * Math.min(1, d));   // the vignette
      e.__p2d = null; e.__pts = null; e.__ptsR = null;
    });
    eGrow = new Float32Array(mesh.edges.length);
    eTone = new Float32Array(mesh.edges.length);
    eRev = new Uint8Array(mesh.edges.length);
    vTone = new Float32Array(mesh.verts.length);
    vIsX = new Uint8Array(mesh.verts.length);
    vHeavy = new Uint8Array(mesh.verts.length);
    mesh.edges.forEach(function (e) {
      if (e.xa) vIsX[e.a] = 1;
      if (e.xb) vIsX[e.b] = 1;
      if (e.core && !e.esc) { vHeavy[e.a] = 1; vHeavy[e.b] = 1; }
    });
    // A vertex flagged as a bend is a kink in one propagator, not an
    // interaction: the diagram's own kinks, and every place a leg met a loose
    // end or ran on into a mesh vertex. No mark there.
    meshBend = new Uint8Array(mesh.verts.length);
    for (var vb = 0; vb < mesh.verts.length; vb++) if (mesh.bend[vb]) meshBend[vb] = 1;

    // The first walker starts at the diagram, so the page opens by growing out
    // of it; the ones that follow start wherever, and wander.
    //
    // Spread over the whole cycle rather than over one traverse. A walker's
    // life is 1 + TAIL traverses, not one, so phases at k/WALKERS bunch them
    // into the front of it and leave a trough at the end — which is what had
    // the frame draining to almost nothing between one pass and the next.
    walkers = [];
    for (var k = 0; k < WALKERS; k++) {
      walkers.push(seedWalker(k / WALKERS * (1 + TAIL), k === 0));
    }
  }

  /* ---- the flood -------------------------------------------------------- */
  /* Straight from the website. A plain Dijkstra from a vertex spreads as a
     disc; multiplying each edge's cost by how far it points from a slowly
     drifting heading makes the front travel instead — cheap along the
     heading, expensive across it. Each edge records the distance at which the
     flood reached it and which of its two ends it arrived at, which is the
     end the line then grows out of. */
  function flood(startVertex) {
    var n = mesh.edges.length;
    var arrive = new Float64Array(n), rev = new Uint8Array(n);
    for (var i = 0; i < n; i++) arrive[i] = Infinity;
    var seen = new Float64Array(mesh.verts.length);
    for (var v = 0; v < seen.length; v++) seen[v] = Infinity;

    var th0 = Math.random() * Math.PI * 2;
    var l1 = 900 + Math.random() * 1400, l2 = 320 + Math.random() * 500;
    var p1 = Math.random() * 6.28, p2 = Math.random() * 6.28;
    var heading = function (d) {
      return th0 + 1.15 * Math.sin(d / l1 + p1) + 0.5 * Math.sin(d / l2 + p2);
    };

    var heap = [[0, startVertex]];
    seen[startVertex] = 0;
    var far = 0;
    while (heap.length) {
      var top = heap[0], last = heap.pop();
      if (heap.length) { heap[0] = last; sift(heap, 0); }
      var d = top[0], u = top[1];
      if (d > seen[u] + 1e-9) continue;
      if (d > far) far = d;
      var list = mesh.inc[u];
      for (var j = 0; j < list.length; j++) {
        var ei = list[j], e = mesh.edges[ei];
        var o = e.a === u ? e.b : e.a;
        var phi = Math.atan2(mesh.verts[o][1] - mesh.verts[u][1],
                             mesh.verts[o][0] - mesh.verts[u][0]);
        var nd = d + e.len * (1 + 2.6 * (1 - Math.cos(phi - heading(d))));
        if (nd < arrive[ei]) { arrive[ei] = nd; rev[ei] = e.b === u ? 1 : 0; }
        if (nd < seen[o] - 1e-9) { seen[o] = nd; heap.push([nd, o]); up(heap, heap.length - 1); }
      }
    }
    return { arrive: arrive, rev: rev, far: far || 1 };
  }
  function up(h, i) {
    while (i > 0) {
      var pi = (i - 1) >> 1;
      if (h[pi][0] <= h[i][0]) break;
      var t = h[pi]; h[pi] = h[i]; h[i] = t; i = pi;
    }
  }
  function sift(h, i) {
    for (;;) {
      var l = i * 2 + 1, r = l + 1, m = i;
      if (l < h.length && h[l][0] < h[m][0]) m = l;
      if (r < h.length && h[r][0] < h[m][0]) m = r;
      if (m === i) break;
      var t = h[m]; h[m] = h[i]; h[i] = t; i = m;
    }
  }

  function seedWalker(phase, atDiagram) {
    var start = 0;
    if (atDiagram) {
      var best = Infinity;
      for (var v = 0; v < mesh.verts.length; v++) {
        if (!mesh.inc[v].length) continue;
        var d = Math.hypot(mesh.verts[v][0] - CX, mesh.verts[v][1] - CY);
        if (d < best) { best = d; start = v; }
      }
    } else {
      var live = [];
      mesh.edges.forEach(function (e) { live.push(e.a); });
      start = live.length ? live[(Math.random() * live.length) | 0] : 0;
    }
    var f = flood(start);
    return { arrive: f.arrive, rev: f.rev, far: f.far, head: phase * f.far };
  }

  // Each edge keeps the strongest state across the walkers: how far it has
  // grown, how lit it is, and which end it is growing out of.
  function gather(frac) {
    eGrow.fill(0); eTone.fill(0);
    var edges = mesh.edges;
    for (var k = 0; k < walkers.length; k++) {
      var w = walkers[k], tail = w.far * frac, lo = w.head - tail;
      for (var i = 0; i < edges.length; i++) {
        var a = w.arrive[i];
        if (!isFinite(a) || a > w.head || a < lo) continue;
        // The head end draws part-grown on the poster's curve: a quintic
        // ease-out, so each line leaps out of its vertex and then creeps.
        var lin = Math.min(1, (w.head - a) / (edges[i].len * 2.2));
        var grow = Math.max(0.02, 1 - Math.pow(1 - lin, 5.5));
        var age = (w.head - a) / tail;                 // 0 at the head, 1 at the tail
        var tone = age > 1 - FADE ? Math.max(0, (1 - age) / FADE) : 1;
        if (tone <= 0.01) continue;
        if (grow > eGrow[i]) { eGrow[i] = grow; eRev[i] = w.rev[i]; }
        if (tone > eTone[i]) eTone[i] = tone;
      }
    }
  }

  function p2d(e) {
    if (e.__p2d) return e.__p2d;
    var pts = window.SMMNet.pathPoints(mesh, e);
    var path = new Path2D();
    path.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) path.lineTo(pts[i][0], pts[i][1]);
    e.__p2d = path;
    return path;
  }

  var lines, dots, crosses, vTone;
  // Six sets of buckets, not three: the diagram's lines are drawn heavier
  // than the mesh's, so they are stroked separately at their own weight.
  var KEYS = ['f', 'b', 'h', 'F', 'B', 'H'];
  function allocate() {
    lines = {};
    KEYS.forEach(function (t) {
      lines[t] = [];
      for (var i = 0; i < BUCKETS; i++) lines[t].push(new Path2D());
    });
    dots = []; crosses = []; bigDots = [];
    for (var i = 0; i < BUCKETS; i++) {
      dots.push(new Path2D()); crosses.push(new Path2D()); bigDots.push(new Path2D());
    }
    vTone.fill(0);
  }
  var bigDots;
  var bucketOf = function (t) { return Math.max(0, Math.min(BUCKETS - 1, (t * BUCKETS) | 0)); };
  var toneOf = function (b) { return b === BUCKETS - 1 ? 1 : (b + 0.5) / BUCKETS; };

  function paint() {
    var N = window.SMMNet, edges = mesh.edges;
    var lwf = 0.8 + 0.3 * MESH_S;
    lx.clearRect(0, 0, W, H);
    allocate();

    var partial = [];
    for (var i = 0; i < edges.length; i++) {
      var g = eGrow[i];
      if (g <= 0) continue;
      var tone = eTone[i] * baseTone[i];          // the fade, under the vignette
      if (tone < 0.02) continue;
      if (g < 1) { partial.push(i); continue; }
      var e = edges[i], b = bucketOf(tone);
      lines[e.core && !e.esc ? e.type.toUpperCase() : e.type][b].addPath(p2d(e));
      if (tone > vTone[e.a]) vTone[e.a] = tone;
      if (tone > vTone[e.b]) vTone[e.b] = tone;
    }

    lx.lineCap = 'round';
    lx.lineJoin = 'round';
    var lwc = 0.8 + 0.3 * CORE_S;
    for (var b2 = 0; b2 < BUCKETS; b2++) {
      var tn = toneOf(b2);
      lx.setLineDash([]);
      lx.strokeStyle = N.rgba(INK, 0.88 * tn);
      lx.lineWidth = 1.35 * lwf; lx.stroke(lines.f[b2]);
      lx.lineWidth = 1.35 * lwc; lx.stroke(lines.F[b2]);
      lx.strokeStyle = N.rgba(INK, 0.72 * tn);
      lx.lineWidth = 1.15 * lwf; lx.stroke(lines.b[b2]);
      lx.lineWidth = 1.15 * lwc; lx.stroke(lines.B[b2]);
      lx.strokeStyle = N.rgba(ACCENT, 0.85 * tn);
      lx.setLineDash([6.5 * MESH_S, 6.5 * MESH_S]);
      lx.lineWidth = 1.35 * lwf; lx.stroke(lines.h[b2]);
      lx.setLineDash([6.5 * CORE_S, 6.5 * CORE_S]);
      lx.lineWidth = 1.35 * lwc; lx.stroke(lines.H[b2]);
    }
    lx.setLineDash([]);

    // A growing line keeps its own path, its direction and its origin mark, so
    // it goes through drawEdge rather than into a bucket. Only the thin band at
    // the head is ever in this state.
    for (var k = 0; k < partial.length; k++) {
      var j = partial[k];
      N.drawEdge(lx, mesh, edges[j], eGrow[j],
        { accent: ACCENT, ink: INK, tone: eTone[j] * baseTone[j], rev: !!eRev[j] });
    }

    // one mark per vertex, at the strongest tone of any line touching it;
    // a vertex of the diagram takes the diagram's heavier dot
    var rr = 1.8 * (0.72 + 0.5 * MESH_S), q = 3.4 * (0.72 + 0.5 * MESH_S);
    var rc = 1.8 * (0.72 + 0.5 * CORE_S);
    for (var v = 0; v < vTone.length; v++) {
      if (vTone[v] < 0.02 || meshBend[v]) continue;
      var bk = bucketOf(vTone[v]), P = mesh.verts[v];
      if (vIsX[v]) {
        crosses[bk].moveTo(P[0] - q, P[1] - q); crosses[bk].lineTo(P[0] + q, P[1] + q);
        crosses[bk].moveTo(P[0] + q, P[1] - q); crosses[bk].lineTo(P[0] - q, P[1] + q);
      } else if (vHeavy[v]) {
        bigDots[bk].moveTo(P[0] + rc, P[1]);
        bigDots[bk].arc(P[0], P[1], rc, 0, Math.PI * 2);
      } else {
        dots[bk].moveTo(P[0] + rr, P[1]);
        dots[bk].arc(P[0], P[1], rr, 0, Math.PI * 2);
      }
    }
    lx.lineWidth = 1.3 * lwf;
    for (var b3 = 0; b3 < BUCKETS; b3++) {
      var tn3 = toneOf(b3);
      lx.fillStyle = N.rgba(INK, 0.92 * tn3);
      lx.fill(dots[b3]);
      lx.fill(bigDots[b3]);
      lx.strokeStyle = N.rgba(INK, 0.88 * tn3);
      lx.stroke(crosses[b3]);
    }
  }

  var lastFrame = 0;
  function frame(now) {
    var t = now / 1000;
    var dt = lastFrame ? Math.min(0.05, t - lastFrame) : 1 / 60;
    lastFrame = t;
    adapt(dt);
    for (var k = 0; k < walkers.length; k++) {
      var w = walkers[k];
      w.head += (w.far / TRAVERSE) * dt;
      if (w.head - w.far * TAIL > w.far) walkers[k] = seedWalker(0, false);   // spent
    }
    gather(TAIL);
    paint();
    requestAnimationFrame(frame);
  }

  /* ---- the announcement ------------------------------------------------- */
  var input = document.getElementById('say-input');
  var say = document.getElementById('say');
  var body = document.body;

  function fit() {
    var text = input.value.replace(/\s+/g, ' ').trim();
    say.textContent = text;
    body.classList.toggle('has-say', !!text);
    if (!text) return;
    // Fit to the band rather than to a formula: a short announcement fills it,
    // a long one steps down until it does, and either way it is as large as it
    // can be from the back of the room.
    var budget = window.innerHeight * 0.24;
    var lo = window.innerHeight * 0.024, hi = window.innerHeight * 0.13;
    for (var i = 0; i < 16; i++) {
      var mid = (lo + hi) / 2;
      say.style.fontSize = mid + 'px';
      if (say.getBoundingClientRect().height <= budget) lo = mid; else hi = mid;
    }
    say.style.fontSize = lo + 'px';
  }
  var queued = false;
  function fitSoon() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(function () { queued = false; fit(); });
  }
  input.addEventListener('input', fitSoon);

  /* ---- music ------------------------------------------------------------ */
  /* Apple Music, and only if this page has been given a developer token and a
     playlist. The plain embed.music.apple.com iframe cannot do what was asked:
     it has no shuffle, and being cross-origin it cannot be told to start from
     out here — the listener has to press play inside it. MusicKit can do both,
     at the cost of a token.

     Full-length playback needs whoever is at the machine to be signed in to an
     Apple Music subscription; without one Apple serves previews or refuses.
     Everything below fails quietly: the screen is the point, and a room should
     not be looking at a stack trace because the wifi ate a token. */
  var music = (function () {
    var cfg = window.SMM_MUSIC;
    if (!cfg || !cfg.token || !cfg.playlist) return null;
    var kit = null, on = true;

    document.addEventListener('musickitloaded', function () {
      try {
        MusicKit.configure({
          developerToken: cfg.token,
          app: { name: cfg.name || 'sigma mu mu', build: '1' },
        }).then(function (m) { kit = m; }, function () {});
      } catch (e) {}
    });

    // authorize() opens Apple's sign-in window, so it has to be the first
    // thing a click does — after an await the browser no longer counts the
    // gesture and the window is blocked.
    function begin() {
      if (!kit) return Promise.reject();
      return kit.isAuthorized ? Promise.resolve() : kit.authorize();
    }
    return {
      enabled: function () { return on; },
      toggle: function () {
        on = !on;
        if (!on) { this.stop(); } else { begin().catch(function () {}); }
        return on;
      },
      start: function () {
        if (!on || !kit) return;
        begin()
          .then(function () { return kit.setQueue({ playlist: cfg.playlist, startPlaying: false }); })
          .then(function () { kit.shuffleMode = 1; return kit.play(); })
          .catch(function () {});
      },
      stop: function () {
        try { if (kit && kit.isPlaying) kit.pause(); } catch (e) {}
      },
    };
  })();

  /* ---- presenting ------------------------------------------------------- */
  /* iPhone Safari has no Fullscreen API — not on the document element, not
     prefixed — so a presenting mode that waits for requestFullscreen simply
     never starts, and the controls stay on screen. So presenting is our own
     state: the chrome goes on a class, and real full screen is asked for on
     top of that only where it exists. A tap or a click anywhere leaves, which
     is the only gesture a phone has; Esc leaves too, and so does the browser
     dropping out of full screen by itself. Nothing on screen says so — the
     bar says it before you go in, and a screen in a room should be clean. */
  var btn = document.getElementById('fs');
  var presenting = false, enteredAt = 0;

  function isFull() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }

  function enter() {
    presenting = true;
    enteredAt = Date.now();
    body.classList.add('present');
    var el = document.documentElement;
    var req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (req) { try { req.call(el); } catch (e) { /* denied is fine — the chrome is gone anyway */ } }
    if (music) music.start();          // before any await, so the gesture counts
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    // On a later tick, or the click that started this would end it.
    setTimeout(function () { document.addEventListener('click', leaveOnTap, true); }, 0);
  }

  function leave() {
    presenting = false;
    if (music) music.stop();
    body.classList.remove('present');
    document.removeEventListener('click', leaveOnTap, true);
    if (isFull()) {
      var ex = document.exitFullscreen || document.webkitExitFullscreen;
      if (ex) { try { ex.call(document); } catch (e) {} }
    }
  }

  function leaveOnTap(ev) {
    if (Date.now() - enteredAt < 350) return;
    ev.preventDefault();
    ev.stopPropagation();
    leave();
  }

  btn.addEventListener('click', function () { if (presenting) leave(); else enter(); });

  var mbtn = document.getElementById('music');
  if (mbtn && music) {
    mbtn.hidden = false;
    // Pressing it before the room fills gets Apple's sign-in out of the way.
    mbtn.addEventListener('click', function () {
      mbtn.textContent = music.toggle() ? 'Music: on' : 'Music: off';
    });
  }
  document.addEventListener('keydown', function (e) {
    if (presenting && (e.key === 'Escape' || e.key === 'Esc')) leave();
  });
  // Where full screen is real, Esc is handled by the browser: follow it out.
  function followBrowser() { if (presenting && !isFull()) leave(); }
  document.addEventListener('fullscreenchange', followBrowser);
  document.addEventListener('webkitfullscreenchange', followBrowser);

  /* ---- go --------------------------------------------------------------- */
  var resizeTimer = 0, lastW = 0, lastH = 0;
  window.addEventListener('resize', function () {
    // A phone's address bar sliding away changes the height and nothing else.
    // Rebuilding for that costs a second and hands back a different field, so
    // only a real change of screen counts.
    var w = window.innerWidth, h = window.innerHeight;
    if (w === lastW && Math.abs(h - lastH) / Math.max(1, lastH) < 0.2) return;
    lastW = w; lastH = h;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      warmup = 3; frameEma = 1 / 60;      // a new screen deserves a fresh look
      build(); fit();
    }, 250);
  });

  build();
  lastW = window.innerWidth; lastH = window.innerHeight;
  if (reduce) {
    // Asked for less motion: hand back the finished field and hold it. The
    // head is put well past the far end and the tail made longer still, so
    // every line is fully grown and none of them is inside the fade.
    walkers.forEach(function (w) { w.head = w.far * 3; });
    gather(10);
    paint();
  } else {
    requestAnimationFrame(frame);
  }
})();
