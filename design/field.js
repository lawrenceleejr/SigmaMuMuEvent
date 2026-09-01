/* σμμ generative field engine — letterpress plates drawn on canvas 2D. */
(function () {
  const INK = '#201e1d';

  function rand(seed) {
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

  function grid(ctx, w, h, m, cols, alpha) {
    ctx.save();
    ctx.strokeStyle = rgba(INK, alpha == null ? 0.07 : alpha);
    ctx.lineWidth = 1;
    const cw = (w - m * 2) / cols;
    for (let i = 0; i <= cols; i++) {
      const x = Math.round(m + i * cw) + 0.5;
      ctx.beginPath(); ctx.moveTo(x, m * 0.5); ctx.lineTo(x, h - m * 0.5); ctx.stroke();
    }
    ctx.restore();
  }

  function rings(ctx, r, o) {
    const R = rand(o.seed || 11), acc = o.accent;
    const cx = r.x + r.w * (o.cxf == null ? 0.62 : o.cxf);
    const cy = r.y + r.h * (o.cyf == null ? 0.58 : o.cyf);
    const gap = o.gap || 30;
    const max = o.max || Math.hypot(r.w, r.h) * 1.05;
    ctx.save();
    ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
    for (let rad = gap * 1.4; rad < max; rad += gap) {
      const a0 = -Math.PI * (0.1 + R() * 0.75), sweep = Math.PI * (0.5 + R() * 1.3);
      const hot = R() < 0.13;
      ctx.strokeStyle = hot ? rgba(acc, 0.85) : rgba(INK, 0.4);
      ctx.lineWidth = hot ? 2.4 : (R() < 0.2 ? 2.2 : 1);
      ctx.beginPath(); ctx.arc(cx, cy, rad, a0, a0 + sweep); ctx.stroke();
    }
    ctx.strokeStyle = rgba(INK, 0.2); ctx.lineWidth = 1;
    for (let i = 0; i < (o.chords || 7); i++) {
      const a = R() * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * max, cy + Math.sin(a) * max);
      ctx.lineTo(cx - Math.cos(a) * max, cy - Math.sin(a) * max);
      ctx.stroke();
    }
    ctx.strokeStyle = acc; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, 13, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 34, cy); ctx.lineTo(cx + 34, cy);
    ctx.moveTo(cx, cy - 34); ctx.lineTo(cx, cy + 34);
    ctx.stroke();
    ctx.restore();
  }

  function detector(ctx, r, o) {
    const cx = r.x + r.w * (o.ipx == null ? 0.13 : o.ipx);
    const cy = r.y + r.h * (o.ipy == null ? 0.93 : o.ipy);
    ctx.save();
    ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
    for (let i = 1; i <= 6; i++) {
      const rad = i * (r.h * 0.19);
      ctx.strokeStyle = rgba(INK, i % 3 === 0 ? 0.2 : 0.1);
      ctx.lineWidth = i % 3 === 0 ? 2 : 1;
      ctx.setLineDash(i % 2 ? [] : [3, 6]);
      ctx.beginPath(); ctx.arc(cx, cy, rad, -Math.PI, 0.02); ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();
  }

  function tracksGen(r, seed, dens) {
    const R = rand(seed || 97);
    const ip = { x: r.w * (r.ipx == null ? 0.13 : r.ipx), y: r.h * (r.ipy == null ? 0.93 : r.ipy) };
    const n = Math.round((r.n || 30) * (dens == null ? 1 : dens));
    const curler = function (i) { return i % 13 === 5; };
    const out = [];
    for (let i = 0; i < n; i++) {
      const mom = 0.1 + Math.pow(R(), 1.8) * 0.9;
      let a = -Math.PI * (0.03 + R() * 0.94);
      const k = (R() < 0.5 ? -1 : 1) * (0.0018 + (curler(i) ? 0.05 : 0.012) * Math.pow(1 - mom, 2.2));
      const step = 5, pts = [[ip.x, ip.y]];
      let x = ip.x, y = ip.y;
      const turnLimit = (Math.PI * 0.85) / Math.abs(k);
      const maxLen = Math.min(300 + mom * (r.w * 2.1), turnLimit);
      for (let s = 0; s < maxLen; s += step) {
        x += Math.cos(a) * step; y += Math.sin(a) * step; a += k * step;
        if (x < -40 || x > r.w + 40 || y < -40 || y > r.h + 40) break;
        pts.push([x, y]);
      }
      out.push({ pts: pts, lw: 0.55 + mom * 2.3, hot: i % 8 === 3, mom: mom, off: (i * 0.031) % 0.46 });
    }
    return { list: out, ip: ip };
  }

  function tracks(ctx, r, t, p, o) {
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, r.w, r.h); ctx.clip();
    ctx.lineCap = 'round';
    t.list.forEach(function (k) {
      const local = Math.max(0, Math.min(1, (p - k.off) / 0.54));
      if (local <= 0) return;
      const eased = 1 - Math.pow(1 - local, 2);
      const nMax = Math.max(2, Math.floor(k.pts.length * eased));
      ctx.strokeStyle = k.hot ? rgba(o.accent, 0.92) : rgba(INK, 0.4 + k.mom * 0.5);
      ctx.lineWidth = k.lw;
      ctx.beginPath();
      ctx.moveTo(k.pts[0][0], k.pts[0][1]);
      for (let i = 1; i < nMax; i++) ctx.lineTo(k.pts[i][0], k.pts[i][1]);
      ctx.stroke();
      if (k.hot && nMax > 4) {
        const e = k.pts[nMax - 1];
        ctx.fillStyle = o.accent;
        ctx.beginPath(); ctx.arc(e[0], e[1], 3, 0, Math.PI * 2); ctx.fill();
      }
    });
    ctx.fillStyle = o.accent;
    ctx.beginPath(); ctx.arc(t.ip.x, t.ip.y, 5.5, 0, Math.PI * 2); ctx.fill();
    if (o.beam !== false) {
      ctx.strokeStyle = INK; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, t.ip.y); ctx.lineTo(r.w, t.ip.y); ctx.stroke();
    }
    ctx.restore();
  }

  function sigma(ctx, r, o) {
    const R = rand(o.seed || 37), acc = o.accent;
    const nC = o.curves || 5;
    const padL = o.padL || 34, padB = o.padB || 30, padT = o.padT || 26;
    const px = r.x + padL, pw = r.w - padL, py = r.y + padT, ph = r.h - padT - padB;
    ctx.save();
    ctx.strokeStyle = rgba(INK, 0.75); ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px + 0.5, py); ctx.lineTo(px + 0.5, py + ph); ctx.lineTo(px + pw, py + ph);
    ctx.stroke();
    ctx.strokeStyle = rgba(INK, 0.45);
    const nx = o.xticks || 5;
    for (let i = 1; i <= nx; i++) {
      const x = px + (pw * i) / nx;
      ctx.beginPath(); ctx.moveTo(x, py + ph); ctx.lineTo(x, py + ph + 6); ctx.stroke();
    }
    for (let i = 0; i < 5; i++) {
      const y = py + (ph * i) / 5;
      ctx.beginPath(); ctx.moveTo(px - 6, y); ctx.lineTo(px, y); ctx.stroke();
    }
    if (o.gridlines) {
      ctx.strokeStyle = rgba(INK, 0.09);
      for (let i = 1; i < nx; i++) {
        const x = px + (pw * i) / nx;
        ctx.beginPath(); ctx.moveTo(x, py); ctx.lineTo(x, py + ph); ctx.stroke();
      }
      for (let i = 1; i < 5; i++) {
        const y = py + (ph * i) / 5;
        ctx.beginPath(); ctx.moveTo(px, y); ctx.lineTo(px + pw, y); ctx.stroke();
      }
    }
    for (let j = 0; j < nC; j++) {
      const x0 = 0.2 + j * (0.72 / nC), g = 0.012 + R() * 0.04, amp = 0.6 + R() * 1.3;
      const top = j === Math.floor(nC / 3);
      const N = 400, vals = [];
      let vmax = 0;
      for (let i = 0; i <= N; i++) {
        const u = i / N;
        const v = 0.1 / (0.08 + u) + amp * (g * g) / ((u - x0) * (u - x0) + g * g);
        vals.push(v);
        if (v > vmax) vmax = v;
      }
      const head = top ? 0.95 : 0.6 + (j / Math.max(1, nC - 1)) * 0.28;
      ctx.strokeStyle = top ? acc : rgba(INK, 0.5);
      ctx.lineWidth = top ? (o.big ? 3 : 2) : (o.big ? 1.2 : 0.8);
      ctx.beginPath();
      for (let i = 0; i <= N; i++) {
        const y = py + ph - (vals[i] / vmax) * ph * head;
        const x = px + (i / N) * pw;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.fillStyle = rgba(INK, 0.7);
    ctx.font = '700 ' + (o.big ? 12 : 9) + 'px Archivo, sans-serif';
    ctx.fillText('σ [pb]', r.x, py - 10);
    ctx.textAlign = 'right';
    ctx.fillText('Ecm [TeV]', r.x + r.w, py + ph + 22);
    if (o.big) {
      ctx.textAlign = 'left';
      ctx.font = '600 11px Archivo, sans-serif';
      const labels = ['2', '4', '6', '8', '10'];
      for (let i = 1; i <= Math.min(nx, labels.length); i++) {
        ctx.fillText(labels[i - 1], px + (pw * i) / nx - 3, py + ph + 22);
      }
    }
    ctx.restore();
  }

  function web(ctx, r, o) {
    const R = rand(o.seed || 23);
    const n = Math.round((o.n || 26) * (o.dens == null ? 1 : o.dens));
    const pts = [];
    const cols = Math.max(2, Math.round(Math.sqrt(n * (r.w / r.h))));
    const rows = Math.max(2, Math.ceil(n / cols));
    const cw = r.w / cols, ch = r.h / rows;
    for (let gy = 0; gy < rows; gy++) {
      for (let gx = 0; gx < cols; gx++) {
        pts.push([r.x + (gx + 0.15 + R() * 0.7) * cw, r.y + (gy + 0.15 + R() * 0.7) * ch]);
      }
    }
    ctx.save();
    ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
    ctx.globalAlpha = o.alpha == null ? 0.2 : o.alpha;
    ctx.strokeStyle = INK; ctx.lineWidth = o.lw || 0.8;
    pts.forEach(function (a, i) {
      const near = pts.map(function (b, j) { return [j, Math.hypot(a[0] - b[0], a[1] - b[1])]; })
        .filter(function (d) { return d[0] !== i; })
        .sort(function (x, y) { return x[1] - y[1]; }).slice(0, o.links || 3);
      near.forEach(function (d) {
        const b = pts[d[0]], len = d[1];
        if (R() < 0.35 && len > 12) {
          const steps = Math.max(6, Math.floor(len / 5));
          const nx = -(b[1] - a[1]) / len, ny = (b[0] - a[0]) / len;
          ctx.beginPath();
          for (let s = 0; s <= steps; s++) {
            const u = s / steps, w = Math.sin(u * Math.PI * 6) * 4;
            const x = a[0] + (b[0] - a[0]) * u + nx * w, y = a[1] + (b[1] - a[1]) * u + ny * w;
            if (s === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.stroke();
        } else {
          ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
        }
      });
    });
    pts.forEach(function (a, i) {
      ctx.fillStyle = i % 9 === 4 ? o.accent : INK;
      ctx.beginPath(); ctx.arc(a[0], a[1], o.dot || 2.2, 0, Math.PI * 2); ctx.fill();
    });
    ctx.restore();
  }

  function lattice(ctx, r, o) {
    const R = rand(o.seed || 53);
    const cell = o.cell || 30;
    const cols = Math.ceil(r.w / cell), rows = Math.max(1, Math.round(r.h / cell));
    const rh = r.h / rows;
    const weights = [400, 500, 600, 700, 800, 900];
    ctx.save();
    ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
    ctx.globalAlpha = o.alpha == null ? 1 : o.alpha;
    for (let ry = 0; ry < rows; ry++) {
      for (let cxi = 0; cxi < cols; cxi++) {
        const w = weights[Math.floor(R() * weights.length)];
        const size = Math.round(cell * (0.66 + R() * 0.4));
        const x = r.x + cxi * cell + cell * 0.1, y = r.y + (ry + 1) * rh - rh * 0.22;
        ctx.font = w + ' ' + size + 'px Archivo, sans-serif';
        if (R() < 0.26) { ctx.fillStyle = rgba(o.accent, 0.3); ctx.fillText('μ', x + 1.8, y + 1.8); }
        ctx.fillStyle = R() < 0.08 ? rgba(o.accent, 0.9) : rgba(INK, 0.72);
        ctx.fillText('μ', x, y);
      }
    }
    ctx.restore();
  }

  function qr(ctx, q, o) {
    const R = rand(o && o.seed || 71);
    const N = 25, m = q.s / N;
    ctx.save();
    ctx.fillStyle = INK;
    for (let a = 0; a < N; a++) {
      for (let b = 0; b < N; b++) {
        const inF = (a < 8 && b < 8) || (a > N - 9 && b < 8) || (a < 8 && b > N - 9);
        if (inF || R() > 0.48) continue;
        ctx.fillRect(q.x + a * m, q.y + b * m, m, m);
      }
    }
    const finder = function (gx, gy) {
      ctx.fillRect(q.x + gx * m, q.y + gy * m, 7 * m, 7 * m);
      ctx.clearRect(q.x + (gx + 1) * m, q.y + (gy + 1) * m, 5 * m, 5 * m);
      ctx.fillRect(q.x + (gx + 2) * m, q.y + (gy + 2) * m, 3 * m, 3 * m);
    };
    finder(0, 0); finder(N - 7, 0); finder(0, N - 7);
    ctx.restore();
  }

  function grain(ctx, w, h, o) {
    const R = rand(o.seed || (5 + w));
    const n = Math.floor((w * h) / 1500 * (o.bite == null ? 0.7 : o.bite));
    ctx.save();
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = rgba(INK, 0.03 + R() * 0.09);
      const s = R() < 0.12 ? 2 : 1;
      ctx.fillRect(Math.floor(R() * w), Math.floor(R() * h), s, s);
    }
    if (o.marks) {
      ctx.strokeStyle = rgba(o.accent, 0.9); ctx.lineWidth = 1;
      const d = 24, off = (o.m || 64) * 0.42;
      [[off, off], [w - off, off], [off, h - off], [w - off, h - off]].forEach(function (c) {
        ctx.beginPath();
        ctx.moveTo(c[0] - d, c[1]); ctx.lineTo(c[0] + d, c[1]);
        ctx.moveTo(c[0], c[1] - d); ctx.lineTo(c[0], c[1] + d);
        ctx.stroke();
        ctx.beginPath(); ctx.arc(c[0], c[1], 8, 0, Math.PI * 2); ctx.stroke();
      });
    }
    ctx.restore();
  }

  window.SMM = { INK: INK, rand: rand, rgba: rgba, grid: grid, rings: rings, detector: detector,
    tracksGen: tracksGen, tracks: tracks, sigma: sigma, web: web, lattice: lattice, qr: qr, grain: grain };
})();
