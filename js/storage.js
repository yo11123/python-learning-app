/* storage.js - 保存 / 読み込み / 書き出し / 自動保存
 * 依存: blocks, model, iso
 */
(function () {
  'use strict';
  window.MCBP = window.MCBP || {};
  var M = MCBP.model, B = MCBP.blocks;
  var KEY = 'mcbp:autosave';

  function serialize(bp) {
    return JSON.stringify({ version: 1, name: bp.name, dims: bp.dims, voxels: bp.voxels });
  }

  function deserialize(str) {
    var o = JSON.parse(str);
    if (!o || !o.dims || !o.voxels) throw new Error('設計図データが不正です');
    var d = o.dims;
    var bp = M.createBlueprint(d.x, d.y, d.z, o.name || '読み込んだ設計図');
    for (var y = 0; y < bp.dims.y; y++)
      for (var z = 0; z < bp.dims.z; z++)
        for (var x = 0; x < bp.dims.x; x++) {
          var v = 0;
          try { v = o.voxels[y][z][x] | 0; } catch (e) { v = 0; }
          if (!B.byId(v)) v = 0; // 未知idは空気に
          bp.voxels[y][z][x] = v;
        }
    return bp;
  }

  function download(name, blob) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  function downloadJSON(bp) {
    download((bp.name || 'blueprint') + '.json', new Blob([serialize(bp)], { type: 'application/json' }));
  }

  function loadFromFile(file, cb, err) {
    var fr = new FileReader();
    fr.onload = function () {
      try { cb(deserialize(fr.result)); }
      catch (e) { if (err) err(e); }
    };
    fr.onerror = function () { if (err) err(new Error('ファイルの読み込みに失敗しました')); };
    fr.readAsText(file);
  }

  // ---- 自動保存(localStorage) ----
  function autosave(bp) {
    try { localStorage.setItem(KEY, serialize(bp)); } catch (e) { /* file:// 等で不可 */ }
  }
  function loadAuto() {
    try {
      var s = localStorage.getItem(KEY);
      return s ? deserialize(s) : null;
    } catch (e) { return null; }
  }
  function clearAuto() { try { localStorage.removeItem(KEY); } catch (e) {} }

  // ---- PNG(3Dプレビュー) ----
  function exportPNG(bp, view) {
    var c = document.createElement('canvas');
    c.width = 1400; c.height = 1000;
    var ctx = c.getContext('2d');
    ctx.fillStyle = '#0d1017'; ctx.fillRect(0, 0, c.width, c.height);
    var v = MCBP.iso.fit(c, bp, view ? view.rot : 0);
    MCBP.iso.render(c, bp, { rot: view ? view.rot : 0, zoom: v.zoom, pan: v.pan });
    download((bp.name || 'blueprint') + '_3D.png', dataURLtoBlob(c.toDataURL('image/png')));
  }

  // ---- PNG(層ごとの平面図コンタクトシート) ----
  function exportLayersPNG(bp) {
    var d = bp.dims, cell = 14, pad = 10, label = 18;
    var tileW = d.x * cell + pad * 2, tileH = d.z * cell + pad + label;
    var cols = Math.min(d.y, Math.max(1, Math.floor(1400 / tileW)));
    var rows = Math.ceil(d.y / cols);
    var c = document.createElement('canvas');
    c.width = cols * tileW; c.height = rows * tileH + 8;
    var ctx = c.getContext('2d');
    ctx.fillStyle = '#0d1017'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.font = '12px sans-serif';
    for (var y = 0; y < d.y; y++) {
      var col = y % cols, row = Math.floor(y / cols);
      var ox = col * tileW + pad, oy = row * tileH + label;
      ctx.fillStyle = '#cdd6e3';
      ctx.fillText('層 ' + (y + 1) + '/' + d.y, ox, row * tileH + 13);
      for (var z = 0; z < d.z; z++)
        for (var x = 0; x < d.x; x++) {
          var id = M.get(bp, x, y, z);
          ctx.fillStyle = id ? B.color(id) : '#1a2029';
          ctx.fillRect(ox + x * cell, oy + z * cell, cell - 1, cell - 1);
        }
    }
    download((bp.name || 'blueprint') + '_layers.png', dataURLtoBlob(c.toDataURL('image/png')));
  }

  // ---- テキスト書き出し ----
  function exportText(bp) {
    var mats = MCBP.materials.count(bp);
    var chars = '#%*=+o8xX@$&AWMHKPQRSTUVYZ0123456789';
    var map = {}, legend = [];
    mats.forEach(function (m, i) { var ch = chars[i] || '?'; map[m.id] = ch; legend.push(ch + ' = ' + B.name(m.id) + ' (' + m.n + ')'); });
    var out = '=== ' + (bp.name || '設計図') + ' ===\n';
    out += 'サイズ 幅' + bp.dims.x + ' 奥行' + bp.dims.z + ' 高さ' + bp.dims.y + '\n\n';
    for (var y = 0; y < bp.dims.y; y++) {
      out += '--- 層 ' + (y + 1) + '/' + bp.dims.y + ' ---\n';
      for (var z = 0; z < bp.dims.z; z++) {
        var line = '';
        for (var x = 0; x < bp.dims.x; x++) {
          var id = M.get(bp, x, y, z);
          line += id ? (map[id] || '?') : '.';
        }
        out += line + '\n';
      }
      out += '\n';
    }
    out += '凡例:\n' + legend.join('\n') + '\n';
    download((bp.name || 'blueprint') + '.txt', new Blob([out], { type: 'text/plain' }));
  }

  function dataURLtoBlob(url) {
    var parts = url.split(','), bin = atob(parts[1]), n = bin.length, u8 = new Uint8Array(n);
    while (n--) u8[n] = bin.charCodeAt(n);
    return new Blob([u8], { type: 'image/png' });
  }

  MCBP.storage = {
    serialize: serialize, deserialize: deserialize,
    downloadJSON: downloadJSON, loadFromFile: loadFromFile,
    autosave: autosave, loadAuto: loadAuto, clearAuto: clearAuto,
    exportPNG: exportPNG, exportLayersPNG: exportLayersPNG, exportText: exportText
  };
})();
