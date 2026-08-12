/* editor.js - 平面(層)エディタ
 * MCBP.editor.init(canvas, getState, onEdit)
 * MCBP.editor.render()
 * ツール: pencil / eraser / bucket / rect
 * 依存: blocks, model
 */
(function () {
  'use strict';
  window.MCBP = window.MCBP || {};
  var M = MCBP.model, B = MCBP.blocks;

  var canvas, ctx, getState, onEdit;
  var cell = 22, offX = 0, offZ = 0;
  var drag = null; // {sx,sz,cx,cz} for rect / painting flag

  function init(cv, gs, oe) {
    canvas = cv; ctx = cv.getContext('2d'); getState = gs; onEdit = oe;
    canvas.addEventListener('mousedown', onDown);
    canvas.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    canvas.addEventListener('mouseleave', function () { hover = null; render(); });
    canvas.addEventListener('touchstart', touch(onDown), { passive: false });
    canvas.addEventListener('touchmove', touch(onMove), { passive: false });
    window.addEventListener('touchend', function () { onUp(); });
  }

  function touch(fn) {
    return function (e) {
      if (!e.touches || !e.touches[0]) return;
      e.preventDefault();
      var t = e.touches[0];
      fn({ clientX: t.clientX, clientY: t.clientY });
    };
  }

  var hover = null;

  function computeLayout() {
    var s = getState(); if (!s.bp) return;
    var d = s.bp.dims;
    var pad = 8;
    var c = Math.floor(Math.min((canvas.width - pad * 2) / d.x, (canvas.height - pad * 2) / d.z));
    cell = Math.max(4, Math.min(30, c));
    offX = Math.floor((canvas.width - d.x * cell) / 2);
    offZ = Math.floor((canvas.height - d.z * cell) / 2);
  }

  function cellAt(e) {
    var r = canvas.getBoundingClientRect();
    var px = (e.clientX - r.left) * (canvas.width / r.width);
    var pz = (e.clientY - r.top) * (canvas.height / r.height);
    var gx = Math.floor((px - offX) / cell);
    var gz = Math.floor((pz - offZ) / cell);
    return [gx, gz];
  }

  function inGrid(gx, gz) {
    var s = getState(); if (!s.bp) return false;
    return gx >= 0 && gz >= 0 && gx < s.bp.dims.x && gz < s.bp.dims.z;
  }

  function paintCell(gx, gz) {
    var s = getState();
    if (!inGrid(gx, gz)) return;
    var id = (s.tool === 'eraser') ? 0 : s.selectedBlock;
    M.set(s.bp, gx, s.curY, gz, id);
  }

  function floodFill(bp, y, sx, sz, newId) {
    var target = M.get(bp, sx, y, sz);
    if (target === newId) return;
    var stack = [[sx, sz]], d = bp.dims;
    while (stack.length) {
      var c = stack.pop(), x = c[0], z = c[1];
      if (x < 0 || z < 0 || x >= d.x || z >= d.z) continue;
      if (M.get(bp, x, y, z) !== target) continue;
      M.set(bp, x, y, z, newId);
      stack.push([x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]);
    }
  }

  function onDown(e) {
    var s = getState(); if (!s.bp) return;
    var c = cellAt(e); hover = c;
    if (!inGrid(c[0], c[1])) return;
    if (s.tool === 'bucket') {
      var id = (s.tool === 'eraser') ? 0 : s.selectedBlock;
      floodFill(s.bp, s.curY, c[0], c[1], id);
      commit();
    } else if (s.tool === 'rect') {
      drag = { sx: c[0], sz: c[1], cx: c[0], cz: c[1], rect: true };
      render();
    } else { // pencil / eraser
      drag = { paint: true, last: null };
      paintCell(c[0], c[1]);
      drag.last = c;
      commit(true);
    }
  }

  function onMove(e) {
    var s = getState(); if (!s.bp) return;
    var c = cellAt(e); hover = c;
    if (drag && drag.paint) {
      if (!drag.last || drag.last[0] !== c[0] || drag.last[1] !== c[1]) {
        paintCell(c[0], c[1]); drag.last = c; commit(true);
      }
    } else if (drag && drag.rect) {
      drag.cx = c[0]; drag.cz = c[1]; render();
    } else {
      render();
    }
  }

  function onUp() {
    var s = getState(); if (!s.bp) { drag = null; return; }
    if (drag && drag.rect) {
      var x0 = Math.min(drag.sx, drag.cx), x1 = Math.max(drag.sx, drag.cx);
      var z0 = Math.min(drag.sz, drag.cz), z1 = Math.max(drag.sz, drag.cz);
      var id = (s.tool === 'eraser') ? 0 : s.selectedBlock;
      for (var x = x0; x <= x1; x++)
        for (var z = z0; z <= z1; z++)
          if (inGrid(x, z)) M.set(s.bp, x, s.curY, z, id);
      drag = null; commit();
    }
    drag = null;
  }

  function commit(light) {
    if (onEdit) onEdit(!!light);
    render();
  }

  // ---- 描画 ----
  function render() {
    var s = getState(); if (!s.bp) return;
    computeLayout();
    var d = s.bp.dims;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#10141a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (var z = 0; z < d.z; z++) {
      for (var x = 0; x < d.x; x++) {
        var px = offX + x * cell, pz = offZ + z * cell;
        // 空セル背景(市松)
        ctx.fillStyle = ((x + z) & 1) ? '#171c24' : '#1b212a';
        ctx.fillRect(px, pz, cell, cell);
        // オニオンスキン(下層)
        if (s.onion && s.curY > 0) {
          var below = M.get(s.bp, x, s.curY - 1, z);
          if (below) { ctx.globalAlpha = 0.28; ctx.fillStyle = B.color(below); ctx.fillRect(px, pz, cell, cell); ctx.globalAlpha = 1; }
        }
        // 現在層
        var id = M.get(s.bp, x, s.curY, z);
        if (id) {
          ctx.globalAlpha = B.alpha(id) < 1 ? 0.6 : 1;
          ctx.fillStyle = B.color(id);
          ctx.fillRect(px, pz, cell, cell);
          ctx.globalAlpha = 1;
        }
      }
    }
    // rect プレビュー
    if (drag && drag.rect) {
      var rx0 = Math.min(drag.sx, drag.cx), rx1 = Math.max(drag.sx, drag.cx);
      var rz0 = Math.min(drag.sz, drag.cz), rz1 = Math.max(drag.sz, drag.cz);
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = s.tool === 'eraser' ? '#ff5555' : B.color(s.selectedBlock);
      ctx.fillRect(offX + rx0 * cell, offZ + rz0 * cell, (rx1 - rx0 + 1) * cell, (rz1 - rz0 + 1) * cell);
      ctx.globalAlpha = 1;
    }
    drawGrid(d);
    // ホバー枠
    if (hover && inGrid(hover[0], hover[1])) {
      ctx.strokeStyle = '#ffd479'; ctx.lineWidth = 2;
      ctx.strokeRect(offX + hover[0] * cell + 1, offZ + hover[1] * cell + 1, cell - 2, cell - 2);
    }
  }

  function drawGrid(d) {
    ctx.strokeStyle = '#2b323d'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (var x = 0; x <= d.x; x++) { ctx.moveTo(offX + x * cell, offZ); ctx.lineTo(offX + x * cell, offZ + d.z * cell); }
    for (var z = 0; z <= d.z; z++) { ctx.moveTo(offX, offZ + z * cell); ctx.lineTo(offX + d.x * cell, offZ + z * cell); }
    ctx.stroke();
    // 太線(4マスごと)
    ctx.strokeStyle = '#3c4657'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (var x2 = 0; x2 <= d.x; x2 += 4) { ctx.moveTo(offX + x2 * cell, offZ); ctx.lineTo(offX + x2 * cell, offZ + d.z * cell); }
    for (var z2 = 0; z2 <= d.z; z2 += 4) { ctx.moveTo(offX, offZ + z2 * cell); ctx.lineTo(offX + d.x * cell, offZ + z2 * cell); }
    ctx.stroke();
  }

  MCBP.editor = { init: init, render: render, floodFill: floodFill };
})();
