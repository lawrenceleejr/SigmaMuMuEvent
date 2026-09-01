/* σμμ Feynman network.
   Blue-noise points at band-varying density -> Delaunay (planar, no crossings)
   -> thinned so every vertex keeps degree >= 3 (no dangling legs, no direction-only
   vertices) -> vertex legs capped at 4 and tight leg angles opened out
   -> line types assigned -> growth timed by graph distance from the roots.
   Drawn crisp: every line is exactly the weight it says it is. */
(function () {
  const INK = '#201e1d';

  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function rgba(hex, a) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  function angDiff(a, b) {
    let d = Math.abs(a - b) % (Math.PI * 2);
    if (d > Math.PI) d = Math.PI * 2 - d;
    return d;
  }

  function inCircum(p, a, b, c) {
    const ax = a[0] - p[0], ay = a[1] - p[1];
    const bx = b[0] - p[0], by = b[1] - p[1];
    const cx = c[0] - p[0], cy = c[1] - p[1];
    const d = (ax * ax + ay * ay) * (bx * cy - by * cx)
            - (bx * bx + by * by) * (ax * cy - ay * cx)
            + (cx * cx + cy * cy) * (ax * by - ay * bx);
    const ori = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    return ori > 0 ? d > 0 : d < 0;
  }

  function delaunay(P, n) {
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    for (let i = 0; i < n; i++) {
      if (P[i][0] < minx) minx = P[i][0];
      if (P[i][1] < miny) miny = P[i][1];
      if (P[i][0] > maxx) maxx = P[i][0];
      if (P[i][1] > maxy) maxy = P[i][1];
    }
    const dx = maxx - minx, dy = maxy - miny, dm = Math.max(dx, dy) || 1;
    const mx = (minx + maxx) / 2, my = (miny + maxy) / 2;
    P.push([mx - 20 * dm, my - dm], [mx, my + 20 * dm], [mx + 20 * dm, my - dm]);
    let tris = [[n, n + 1, n + 2]];
    for (let i = 0; i < n; i++) {
      const p = P[i], bad = [], good = [];
      for (let t = 0; t < tris.length; t++) {
        const tr = tris[t];
        if (inCircum(p, P[tr[0]], P[tr[1]], P[tr[2]])) bad.push(tr); else good.push(tr);
      }
      const ed = [];
      for (let t = 0; t < bad.length; t++) {
        ed.push([bad[t][0], bad[t][1]], [bad[t][1], bad[t][2]], [bad[t][2], bad[t][0]]);
      }
      for (let a = 0; a < ed.length; a++) {
        let shared = false;
        for (let b = 0; b < ed.length; b++) {
          if (a === b) continue;
          if ((ed[a][0] === ed[b][0] && ed[a][1] === ed[b][1]) ||
              (ed[a][0] === ed[b][1] && ed[a][1] === ed[b][0])) { shared = true; break; }
        }
        if (!shared) good.push([ed[a][0], ed[a][1], i]);
      }
      tris = good;
    }
    return tris.filter(t => t[0] < n && t[1] < n && t[2] < n);
  }

  function build(cfg) {
    const R = rng(cfg.seed || 7);
    const W = cfg.w, H = cfg.h;
    const pad = cfg.pad == null ? 18 : cfg.pad;
    const clear = cfg.clearance == null ? 6 : cfg.clearance;
    const speed = cfg.speed || 200;
    const scaleAt = cfg.scaleAt || function () { return 1; };
    const minSep = cfg.minSep == null ? 0.52 : cfg.minSep;   // ~30 degrees
    const maxLegs = cfg.maxLegs == null ? 4 : cfg.maxLegs;
    const spacing = cfg.spacing || 42;
    // just knock the sharp point off each corner -- a small radius that breathes
    // around the arc, so the boundary reads struck by hand rather than by compass
    const corner = cfg.cornerR == null ? Math.min(W, H) * 0.055 : cfg.cornerR;
    const cornerWob = cfg.cornerWobble == null ? 0.3 : cfg.cornerWobble;
    const cornerPhase = R() * Math.PI * 2;
    const clearAt = cfg.clearanceAt || function () { return clear; };
    const zones = (cfg.zones || []).map(z => {
      const c = clearAt(z.y + z.h / 2);
      return { x: z.x - c, y: z.y - c, w: z.w + c * 2, h: z.h + c * 2 };
    });

    function blocked(x, y) {
      if (x < pad || y < pad || x > W - pad || y > H - pad) return true;
      if (corner > 0) {
        const x0 = pad + corner, y0 = pad + corner;
        const x1 = W - pad - corner, y1 = H - pad - corner;
        const qx = x < x0 ? x0 : (x > x1 ? x1 : x);
        const qy = y < y0 ? y0 : (y > y1 ? y1 : y);
        if (qx !== x || qy !== y) {
          const ax = x - qx, ay = y - qy;
          const a = Math.atan2(ay, ax);
          const r = corner * (1 + cornerWob * (0.62 * Math.sin(a * 3 + cornerPhase)
                                             + 0.38 * Math.sin(a * 5 - cornerPhase * 1.7)));
          if (Math.hypot(ax, ay) > r) return true;
        }
      }
      for (let i = 0; i < zones.length; i++) {
        const z = zones[i];
        if (x > z.x && x < z.x + z.w && y > z.y && y < z.y + z.h) return true;
      }
      return false;
    }
    function segBlocked(x0, y0, x1, y1) {
      const n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 6));
      for (let i = 0; i <= n; i++) {
        const u = i / n;
        if (blocked(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u)) return true;
      }
      return false;
    }
    const rad = y => spacing * scaleAt(y);

    // ---- blue-noise points, denser where the band scale is smaller ----
    const CELL = 24;
    const cols = Math.ceil(W / CELL) + 1, rows = Math.ceil(H / CELL) + 1;
    const grid = new Map();
    const pts = [];
    function gkey(cx, cy) { return cx * 4096 + cy; }
    function fits(x, y, r) {
      const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
      const span = Math.ceil((r + spacing * 2) / CELL);
      for (let a = -span; a <= span; a++) {
        for (let b = -span; b <= span; b++) {
          const arr = grid.get(gkey(cx + a, cy + b));
          if (!arr) continue;
          for (let i = 0; i < arr.length; i++) {
            const p = pts[arr[i]];
            const need = Math.max(r, rad(p[1]));
            if (Math.hypot(p[0] - x, p[1] - y) < need) return false;
          }
        }
      }
      return true;
    }
    function addPt(x, y) {
      const i = pts.length;
      pts.push([x, y]);
      const k = gkey(Math.floor(x / CELL), Math.floor(y / CELL));
      let arr = grid.get(k);
      if (!arr) { arr = []; grid.set(k, arr); }
      arr.push(i);
      return i;
    }
    const tries = cfg.darts || 40000;
    for (let i = 0; i < tries; i++) {
      const x = R() * W, y = R() * H;
      if (blocked(x, y)) continue;
      if (!fits(x, y, rad(y))) continue;
      addPt(x, y);
    }
    if (pts.length < 8) return { verts: pts, edges: [], duration: 1 };

    // ---- Delaunay -> candidate edges ----
    const P = pts.map(p => [p[0], p[1]]);
    const tris = delaunay(P, pts.length);
    const seen = new Set();
    let cand = [];
    const addCand = (a, b) => {
      const k = a < b ? a * 100000 + b : b * 100000 + a;
      if (seen.has(k)) return;
      seen.add(k);
      const A = pts[a], B = pts[b];
      const len = Math.hypot(B[0] - A[0], B[1] - A[1]);
      const my = (A[1] + B[1]) / 2;
      if (len > rad(my) * 2.6) return;
      if (segBlocked(A[0], A[1], B[0], B[1])) return;
      cand.push({ a: a, b: b, len: len, s: scaleAt(my) });
    };
    tris.forEach(t => { addCand(t[0], t[1]); addCand(t[1], t[2]); addCand(t[2], t[0]); });

    // ---- thin to a sparse mesh, never dropping a vertex below degree 3 ----
    const deg = new Array(pts.length).fill(0);
    cand.forEach(e => { deg[e.a]++; deg[e.b]++; });
    const order = cand.map((e, i) => [i, e.len * (0.6 + R() * 0.8)]).sort((x, y) => y[1] - x[1]);
    const dead = new Uint8Array(cand.length);
    const keepFrac = cfg.keep == null ? 0.62 : cfg.keep;
    let live = cand.length;
    const floor = Math.max(1, Math.round(cand.length * keepFrac));
    for (let i = 0; i < order.length && live > floor; i++) {
      const ei = order[i][0], e = cand[ei];
      if (deg[e.a] <= 3 || deg[e.b] <= 3) continue;
      dead[ei] = 1; deg[e.a]--; deg[e.b]--; live--;
    }

    // ---- vertex hygiene: at most `maxLegs` legs, and no tight angle between two
    //      legs of the same vertex. Both are hard rules, so an offending edge goes
    //      even when that leaves a short leg behind; the passes below reconnect
    //      what they can and the rest ends in the vacuum as an x. ----
    const incOf = () => {
      const inc = pts.map(() => []);
      cand.forEach((e, i) => { if (!dead[i]) { inc[e.a].push(i); inc[e.b].push(i); } });
      return inc;
    };
    const dirFrom = (v, ei) => {
      const e = cand[ei], o = e.a === v ? e.b : e.a;
      return Math.atan2(pts[o][1] - pts[v][1], pts[o][0] - pts[v][0]);
    };
    const kill = ei => { const e = cand[ei]; dead[ei] = 1; deg[e.a]--; deg[e.b]--; };
    // an edge's cost to keep: long ones and ones bridging already-busy vertices go first
    const cost = ei => {
      const e = cand[ei];
      return e.len * (0.75 + 0.25 * R()) + 26 * (deg[e.a] + deg[e.b]);
    };

    for (let pass = 0; pass < 8; pass++) {
      const inc = incOf();
      let changed = 0;
      for (let v = 0; v < pts.length; v++) {
        // 1. cap the number of legs
        let list = inc[v].filter(ei => !dead[ei]);
        while (list.length > maxLegs) {
          let worst = list[0], wc = -Infinity;
          list.forEach(ei => { const c = cost(ei); if (c > wc) { wc = c; worst = ei; } });
          kill(worst);
          list = list.filter(ei => ei !== worst);
          changed++;
        }
        // 2. open out tight angles, dropping the costlier of the offending pair
        for (let guard = 0; guard < maxLegs * 2; guard++) {
          let hit = null;
          for (let i = 0; i < list.length && !hit; i++) {
            for (let j = i + 1; j < list.length; j++) {
              if (angDiff(dirFrom(v, list[i]), dirFrom(v, list[j])) < minSep) {
                hit = [list[i], list[j]];
                break;
              }
            }
          }
          if (!hit) break;
          const drop = cost(hit[0]) >= cost(hit[1]) ? hit[0] : hit[1];
          kill(drop);
          list = list.filter(ei => ei !== drop);
          changed++;
        }
      }
      if (!changed) break;
    }

    // ---- no direction-only vertices: a degree-2 vertex sheds its longer edge.
    //      whatever is left with a single line ends in the vacuum (drawn as an x). ----
    let edges = cand.filter((e, i) => !dead[i]);
    for (let pass = 0; pass < 40; pass++) {
      const d = new Array(pts.length).fill(0);
      const inc2 = pts.map(() => []);
      edges.forEach((e, i) => { d[e.a]++; d[e.b]++; inc2[e.a].push(i); inc2[e.b].push(i); });
      const drop = new Set();
      for (let v = 0; v < pts.length; v++) {
        if (d[v] !== 2) continue;
        const i1 = inc2[v][0], i2 = inc2[v][1];
        if (drop.has(i1) || drop.has(i2)) continue;
        drop.add(edges[i1].len >= edges[i2].len ? i1 : i2);
      }
      if (!drop.size) break;
      edges = edges.filter((e, i) => !drop.has(i));
    }
    if (!edges.length) return { verts: pts, edges: [], duration: 1 };

    // rescue dangling ends: restore two dropped Delaunay edges (always planar) where the
    // angles allow, so only ends that truly cannot reconnect keep their vacuum x
    for (let pass = 0; pass < 3; pass++) {
      const d = new Array(pts.length).fill(0);
      const dirs = pts.map(() => []);
      edges.forEach(e => {
        d[e.a]++; d[e.b]++;
        dirs[e.a].push(Math.atan2(pts[e.b][1] - pts[e.a][1], pts[e.b][0] - pts[e.a][0]));
        dirs[e.b].push(Math.atan2(pts[e.a][1] - pts[e.b][1], pts[e.a][0] - pts[e.b][0]));
      });
      const have = new Set();
      edges.forEach(e => have.add(e.a < e.b ? e.a * 100000 + e.b : e.b * 100000 + e.a));
      let added = 0;
      for (let v = 0; v < pts.length; v++) {
        if (d[v] !== 1) continue;
        const opts = [];
        for (let i = 0; i < cand.length; i++) {
          const e = cand[i];
          if (e.a !== v && e.b !== v) continue;
          const k = e.a < e.b ? e.a * 100000 + e.b : e.b * 100000 + e.a;
          if (have.has(k)) continue;
          const o = e.a === v ? e.b : e.a;
          if (d[o] < 2 || d[o] >= maxLegs) continue;
          const dv = Math.atan2(pts[o][1] - pts[v][1], pts[o][0] - pts[v][0]);
          let ok = true;
          for (let j = 0; j < dirs[v].length; j++) if (angDiff(dv, dirs[v][j]) < minSep) { ok = false; break; }
          for (let j = 0; ok && j < dirs[o].length; j++) if (angDiff(dv + Math.PI, dirs[o][j]) < minSep) { ok = false; break; }
          if (!ok) continue;
          opts.push({ e: e, dv: dv, o: o });
        }
        if (opts.length < 2 || d[v] + 2 > maxLegs) continue;
        opts.sort((x, y) => x.e.len - y.e.len);
        let picked = null;
        for (let i = 0; i < opts.length && !picked; i++) {
          for (let j = i + 1; j < opts.length; j++) {
            if (angDiff(opts[i].dv, opts[j].dv) >= minSep) { picked = [opts[i], opts[j]]; break; }
          }
        }
        if (!picked) continue;
        picked.forEach(p => {
          edges.push(p.e);
          have.add(p.e.a < p.e.b ? p.e.a * 100000 + p.e.b : p.e.b * 100000 + p.e.a);
          d[v]++; d[p.o]++;
          dirs[v].push(p.dv);
          dirs[p.o].push(p.dv + Math.PI);
        });
        added++;
      }
      if (!added) break;
    }

    // ---- sweep up the debris: a stub or a stranded pair reads as dirt, not physics,
    //      so only components big enough to look like a diagram survive ----
    {
      const minComp = cfg.minComponent == null ? 5 : cfg.minComponent;
      const parent = new Int32Array(pts.length);
      for (let i = 0; i < parent.length; i++) parent[i] = i;
      const find = x => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
      const join = (x, y) => { const rx = find(x), ry = find(y); if (rx !== ry) parent[rx] = ry; };
      edges.forEach(e => join(e.a, e.b));
      const size = new Map();
      edges.forEach(e => { const r = find(e.a); size.set(r, (size.get(r) || 0) + 1); });
      edges = edges.filter(e => (size.get(find(e.a)) || 0) >= minComp);
    }
    if (!edges.length) return { verts: pts, edges: [], duration: 1 };

    {
      const d = new Array(pts.length).fill(0);
      edges.forEach(e => { d[e.a]++; d[e.b]++; });
      edges.forEach(e => { e.xa = d[e.a] === 1; e.xb = d[e.b] === 1; });
    }

    // ---- line types ----
    const inc = pts.map(() => []);
    edges.forEach((e, i) => { inc[e.a].push(i); inc[e.b].push(i); });
    const locked = new Uint8Array(edges.length);
    edges.forEach(e => { e.type = null; });

    // pure Higgs vertices: 3 or 4 dashed lines and nothing else
    const wanted = cfg.higgsQuads || 5;
    const chosen = [];
    const cands2 = [];
    for (let v = 0; v < pts.length; v++) {
      if (inc[v].length === 3 || inc[v].length === 4) cands2.push(v);
    }
    for (let i = cands2.length - 1; i > 0; i--) {
      const j = Math.floor(R() * (i + 1));
      const tmp = cands2[i]; cands2[i] = cands2[j]; cands2[j] = tmp;
    }
    for (let i = 0; i < cands2.length && chosen.length < wanted; i++) {
      const v = cands2[i];
      let ok = true;
      for (let c = 0; c < chosen.length; c++) {
        if (Math.hypot(pts[chosen[c]][0] - pts[v][0], pts[chosen[c]][1] - pts[v][1]) < 260) { ok = false; break; }
      }
      if (!ok) continue;
      let clash = false;
      inc[v].forEach(ei => { if (locked[ei]) clash = true; });
      if (clash) continue;
      chosen.push(v);
      inc[v].forEach(ei => { edges[ei].type = 'h'; edges[ei].special = true; locked[ei] = 1; });
    }
    const pure = new Set(chosen);

    // fermion lines: walk as straight as possible across the mesh
    const fermionTarget = Math.round(edges.length * (cfg.fermionShare || 0.38));
    let fermions = 0, guard = 0;
    while (fermions < fermionTarget && guard++ < edges.length * 4) {
      let start = Math.floor(R() * edges.length);
      if (edges[start].type || locked[start]) continue;
      edges[start].type = 'f'; fermions++;
      for (let dirEnd = 0; dirEnd < 2; dirEnd++) {
        let prev = dirEnd ? edges[start].b : edges[start].a;
        let cur = dirEnd ? edges[start].a : edges[start].b;
        for (let step = 0; step < 14; step++) {
          if (pure.has(cur)) break;
          const inDir = Math.atan2(pts[cur][1] - pts[prev][1], pts[cur][0] - pts[prev][0]);
          let best = -1, bestD = 1.15;
          inc[cur].forEach(ei => {
            const e = edges[ei];
            if (e.type || locked[ei]) return;
            const o = e.a === cur ? e.b : e.a;
            if (o === prev) return;
            const d = Math.atan2(pts[o][1] - pts[cur][1], pts[o][0] - pts[cur][0]);
            const off = angDiff(d, inDir);
            if (off < bestD) { bestD = off; best = ei; }
          });
          if (best < 0) break;
          edges[best].type = 'f'; fermions++;
          const nxt = edges[best].a === cur ? edges[best].b : edges[best].a;
          prev = cur; cur = nxt;
        }
      }
    }
    edges.forEach(e => { if (!e.type) e.type = R() < 0.82 ? 'b' : 'h'; });

    // a vertex with 3+ dashed lines must be all dashed
    for (let pass = 0; pass < 6; pass++) {
      let changed = 0;
      for (let v = 0; v < pts.length; v++) {
        if (pure.has(v) || inc[v].length < 3) continue;
        const hs = inc[v].filter(ei => edges[ei].type === 'h');
        if (hs.length < 3 || hs.length === inc[v].length) continue;
        for (let i = 0; i < hs.length && inc[v].filter(ei => edges[ei].type === 'h').length > 2; i++) {
          if (locked[hs[i]]) continue;
          edges[hs[i]].type = 'b';
          changed++;
        }
      }
      if (!changed) break;
    }

    // ---- growth timing: graph distance from the roots ----
    const dist = new Float64Array(pts.length).fill(Infinity);
    const adj = pts.map(() => []);
    edges.forEach((e, i) => { adj[e.a].push([e.b, e.len]); adj[e.b].push([e.a, e.len]); });
    const roots = [];
    (cfg.seeds || []).forEach(s => {
      let best = -1, bd = Infinity;
      for (let v = 0; v < pts.length; v++) {
        if (!adj[v].length) continue;
        const d = Math.hypot(pts[v][0] - s.x, pts[v][1] - s.y);
        if (d < bd) { bd = d; best = v; }
      }
      if (best >= 0) { dist[best] = 0; roots.push(best); }
    });
    if (!roots.length) { dist[edges[0].a] = 0; roots.push(edges[0].a); }
    const q = roots.slice();
    while (q.length) {
      let bi = 0;
      for (let i = 1; i < q.length; i++) if (dist[q[i]] < dist[q[bi]]) bi = i;
      const v = q.splice(bi, 1)[0];
      adj[v].forEach(nb => {
        const nd = dist[v] + nb[1];
        if (nd < dist[nb[0]] - 0.01) { dist[nb[0]] = nd; q.push(nb[0]); }
      });
    }
    let far = 0;
    for (let v = 0; v < pts.length; v++) if (isFinite(dist[v]) && dist[v] > far) far = dist[v];
    edges.forEach(e => {
      const da = isFinite(dist[e.a]) ? dist[e.a] : far;
      const db = isFinite(dist[e.b]) ? dist[e.b] : far;
      if (db < da) {
        const t = e.a; e.a = e.b; e.b = t;
        const x = e.xa; e.xa = e.xb; e.xb = x;
      }
      const vs = speed / (0.55 + 0.6 * (e.s || 1));
      e.t0 = Math.min(da, db) / speed;
      e.t1 = e.t0 + e.len / vs;
    });
    let dur = 0;
    edges.forEach(e => { if (e.t1 > dur) dur = e.t1; });
    edges.sort((a, b) => a.t0 - b.t0);
    return { verts: pts, edges: edges, duration: dur };
  }

  // ---- rendering ---------------------------------------------------------
  // Clean, even linework: straight propagators, a drawn wave for the bosons,
  // dashed for the scalars, a filled node at every junction and an x wherever a
  // line ends in the vacuum. No spread, no halo -- what is drawn is what prints.
  function pathPoints(net, e) {
    if (e.__pts) return e.__pts;
    const a = net.verts[e.a], b = net.verts[e.b];
    if (e.type !== 'b') { e.__pts = [a, b]; return e.__pts; }
    const s = e.s || 1;
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
    const px = -dy / len, py = dx / len;
    const lam = 15 * s, amp = 4.4 * s;
    const cycles = Math.max(1, Math.round(len / lam));
    const steps = Math.max(18, Math.ceil(len / 1.6));
    const out = [];
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const taper = Math.min(1, Math.sin(Math.PI * u) * 2.2);
      const off = Math.sin(u * Math.PI * 2 * cycles) * amp * taper;
      out.push([a[0] + dx * u + px * off, a[1] + dy * u + py * off]);
    }
    e.__pts = out;
    return out;
  }

  function stroke(ctx, pts, frac) {
    const total = pts.length - 1;
    const reach = total * Math.max(0.015, Math.min(1, frac));
    const whole = Math.floor(reach);
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i <= Math.min(whole, total); i++) ctx.lineTo(pts[i][0], pts[i][1]);
    if (whole < total) {
      const u = reach - whole, p = pts[whole], q = pts[whole + 1];
      ctx.lineTo(p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u);
    }
    ctx.stroke();
  }

  function drawEdge(ctx, net, e, frac, o) {
    const acc = o.accent, s = e.s || 1, lwf = 0.8 + 0.3 * s;
    const pts = pathPoints(net, e);
    let dash = null, color, lw;
    if (e.type === 'h') {
      dash = [6.5 * s, 6.5 * s];
      color = e.special ? acc : rgba(acc, 0.85);
      lw = (e.special ? 2.1 : 1.35) * lwf;
    } else if (e.type === 'b') {
      color = rgba(INK, 0.72); lw = 1.15 * lwf;
    } else {
      color = rgba(INK, 0.88); lw = 1.35 * lwf;
    }
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash(dash || []);
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    stroke(ctx, pts, frac);
    ctx.setLineDash([]);

    if (frac >= 1) {
      const rr = 1.8 * (0.72 + 0.5 * s);
      const q = 3.4 * (0.72 + 0.5 * s);
      ctx.fillStyle = rgba(INK, 0.92);
      ctx.strokeStyle = rgba(INK, 0.88);
      ctx.lineWidth = 1.3 * lwf;
      const dot = r => { ctx.beginPath(); ctx.arc(r[0], r[1], rr, 0, Math.PI * 2); ctx.fill(); };
      const cross = r => {
        ctx.beginPath();
        ctx.moveTo(r[0] - q, r[1] - q); ctx.lineTo(r[0] + q, r[1] + q);
        ctx.moveTo(r[0] + q, r[1] - q); ctx.lineTo(r[0] - q, r[1] + q);
        ctx.stroke();
      };
      if (e.xa) cross(net.verts[e.a]); else dot(net.verts[e.a]);
      if (e.xb) cross(net.verts[e.b]); else dot(net.verts[e.b]);
    }
  }

  window.SMMNet = { INK: INK, rgba: rgba, rng: rng, build: build, drawEdge: drawEdge };
})();
