/* materials.js - 必要ブロック集計
 * MCBP.materials.count(bp) -> [{id,n}]
 * MCBP.materials.stackText(n)
 * MCBP.materials.render(el, bp)
 * 依存: blocks, model
 */
(function () {
  'use strict';
  window.MCBP = window.MCBP || {};
  var M = MCBP.model, B = MCBP.blocks;

  function count(bp) {
    var map = {};
    M.forEachSolid(bp, function (x, y, z, id) { map[id] = (map[id] || 0) + 1; });
    var arr = [];
    for (var k in map) if (map.hasOwnProperty(k)) arr.push({ id: +k, n: map[k] });
    arr.sort(function (a, b) { return b.n - a.n; });
    return arr;
  }

  function stackText(n) {
    var s = Math.floor(n / 64), r = n % 64;
    if (s === 0) return n + '個';
    if (r === 0) return s + 'スタック (' + n + '個)';
    return s + 'スタック + ' + r + '個 (計' + n + '個)';
  }

  function render(el, bp) {
    var list = count(bp);
    var total = 0, types = list.length;
    list.forEach(function (r) { total += r.n; });
    var html = '<div class="mat-head">合計 <b>' + total + '</b> ブロック / <b>' + types + '</b> 種類</div>';
    if (!list.length) {
      html += '<div class="mat-empty">まだブロックがありません</div>';
    } else {
      html += '<ul class="mat-list">';
      list.forEach(function (r) {
        html += '<li><span class="sw" style="background:' + B.color(r.id) + '"></span>' +
          '<span class="mn">' + esc(B.name(r.id)) + '</span>' +
          '<span class="mc">' + stackText(r.n) + '</span></li>';
      });
      html += '</ul>';
    }
    el.innerHTML = html;
  }

  function esc(s) { return String(s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }

  MCBP.materials = { count: count, stackText: stackText, render: render };
})();
