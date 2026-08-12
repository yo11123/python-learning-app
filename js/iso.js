/* iso.js - アイソメトリック(2:1)3D描画
 * MCBP.iso.render(canvas, bp, view)  view={rot,zoom,pan:{x,y}}
 * MCBP.iso.fit(canvas, bp)           -> {zoom, pan}
 * 依存: blocks, model
 */
(function () {
  'use strict';
  window.MCBP = window.MCBP || {};
  var M = MCBP.model, B = MCBP.blocks;

  function rot90(x, z, X, Z, r) {
    switch (r & 3) {
      case 0: return [x, z];
      case 1: return [z, X - 1 - x];
      case 2: return [X - 1 - x, Z - 1 - z];
      default: return [Z - 1 - z, x];
    }
  }
  function rotDims(X, Z, r) { return (r & 1) ? [Z, X] : [X, Z]; }

  function project(x, y, z, u, ox, oy) {
    return { sx: ox + (x - z) * u, sy: oy + (x + z) * (u * 0.5) - y * u };
  }

  function parseHex(hex) {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    return [parseInt(hex.substr(0, 2), 16), parseInt(hex.substr(2, 2), 16), parseInt(hex.substr(4, 2), 16)];
  }
  function shade(hex, f) {
    var c = parseHex(hex);
    var r = Math.max(0, Math.min(255, Math.round(c[0] * f)));
    var g = Math.max(0, Math.min(255, Math.round(c[1] * f)));
    var b = Math.max(0, Math.min(255, Math.round(c[2] * f)));
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  // 可視ボクセルを回転後座標で収集
  function collect(bp, rot) {
    var d = bp.dims;
    var rd = rotDims(d.x, d.z, rot);
    var list = [];
    M.forEachSolid(bp, function (x, y, z, id) {
      // 6隣接が全て不透明なら省略(半透明は常に描画)
      if (B.isOpaque(id)) {
        if (B.isOpaque(M.get(bp, x + 1, y, z)) && B.isOpaque(M.get(bp, x - 1, y, z)) &&
            B.isOpaque(M.get(bp, x, y + 1, z)) && B.isOpaque(M.get(bp, x, y - 1, z)) &&
            B.isOpaque(M.get(bp, x, y, z + 1)) && B.isOpaque(M.get(bp, x, y, z - 1)))
          return;
      }
      var rc = rot90(x, z, d.x, d.z, rot);
      list.push({ rx: rc[0], ry: y, rz: rc[1], id: id });
    });
    list.sort(function (a, b2) { return (a.rx + a.rz) - (b2.rx + b2.rz) || a.ry - b2.ry; });
    return { list: list, rd: rd };
  }

  function bounds(rd, ry, u) {
    // 回転後 X=rd[0], Z=rd[1], 高さ ry。8頂点を投影して bbox
    var pts = [];
    for (var xi = 0; xi <= rd[0]; xi += rd[0])
      for (var zi = 0; zi <= rd[1]; zi += rd[1])
        for (var yi = 0; yi <= ry; yi += (ry || 1))
          pts.push(project(xi, yi, zi, u, 0, 0));
    var minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    pts.forEach(function (p) { minX = Math.min(minX, p.sx); maxX = Math.max(maxX, p.sx); minY = Math.min(minY, p.sy); maxY = Math.max(maxY, p.sy); });
    return { w: maxX - minX, h: maxY - minY, minX: minX, minY: minY };
  }

  function fit(canvas, bp, rot) {
    rot = rot || 0;
    var d = bp.dims, rd = rotDims(d.x, d.z, rot);
    var W = canvas.width, H = canvas.height;
    var u = 16;
    var b = bounds(rd, d.y, u);
    var margin = 24;
    var s = Math.min((W - margin) / (b.w || 1), (H - margin) / (b.h || 1));
    var zoom = Math.max(0.15, Math.min(6, (u * s) / 16));
    return { zoom: zoom, pan: { x: 0, y: 0 } };
  }

  function render(canvas, bp, view) {
    view = view || {};
    var rot = view.rot || 0, zoom = view.zoom || 1, pan = view.pan || { x: 0, y: 0 };
    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    var u = 16 * zoom;
    var d = bp.dims;
    var col = collect(bp, rot);
    var b = bounds(col.rd, d.y, u);
    var ox = canvas.width / 2 - (b.minX + b.w / 2) + pan.x;
    var oy = canvas.height / 2 - (b.minY + b.h / 2) + pan.y;

    ctx.lineJoin = 'round';
    col.list.forEach(function (v) {
      drawCube(ctx, v.rx, v.ry, v.rz, u, ox, oy, v.id);
    });
  }

  function quad(ctx, p1, p2, p3, p4, fill, stroke) {
    ctx.beginPath();
    ctx.moveTo(p1.sx, p1.sy); ctx.lineTo(p2.sx, p2.sy); ctx.lineTo(p3.sx, p3.sy); ctx.lineTo(p4.sx, p4.sy);
    ctx.closePath();
    ctx.fillStyle = fill; ctx.fill();
    ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke();
  }

  function drawCube(ctx, x, y, z, u, ox, oy, id) {
    var color = B.color(id), a = B.alpha(id);
    var p = function (dx, dy, dz) { return project(x + dx, y + dy, z + dz, u, ox, oy); };
    // 視点に向く3面: 上(dy=1) / 右=+x面(dx=1) / 左=+z面(dz=1)
    var tA = p(0, 1, 0), tB = p(1, 1, 0), tC = p(1, 1, 1), tD = p(0, 1, 1);           // 上
    var rE = p(1, 1, 0), rF = p(1, 1, 1), rG = p(1, 0, 1), rH = p(1, 0, 0);           // 右(+x)
    var lI = p(0, 1, 1), lJ = p(1, 1, 1), lK = p(1, 0, 1), lL = p(0, 0, 1);           // 左(+z)

    if (a < 1) ctx.globalAlpha = a;
    var stroke = shade(color, 0.45);
    quad(ctx, rE, rF, rG, rH, shade(color, 0.62), stroke); // 右面
    quad(ctx, lI, lJ, lK, lL, shade(color, 0.80), stroke); // 左面
    quad(ctx, tA, tB, tC, tD, shade(color, 1.0), stroke);  // 上面
    if (a < 1) ctx.globalAlpha = 1;
  }

  MCBP.iso = { render: render, fit: fit, project: project, rot90: rot90, shade: shade };
})();
