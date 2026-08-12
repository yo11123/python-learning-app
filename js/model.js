/* model.js - 設計図(blueprint)データモデル
 * voxels[y][z][x] = blockId, 0 = 空気
 * 依存: blocks
 */
(function () {
  'use strict';
  window.MCBP = window.MCBP || {};

  var MAX = 96; // 1軸あたりの最大サイズ(性能上限)

  function clampDim(n, def) {
    n = Math.floor(Number(n));
    if (!isFinite(n) || n < 1) n = def || 1;
    if (n > MAX) n = MAX;
    return n;
  }

  // 空(全て空気)のボクセル配列を確保
  function allocVoxels(x, y, z) {
    var vy = new Array(y);
    for (var iy = 0; iy < y; iy++) {
      var vz = new Array(z);
      for (var iz = 0; iz < z; iz++) {
        var vx = new Array(x);
        for (var ix = 0; ix < x; ix++) vx[ix] = 0;
        vz[iz] = vx;
      }
      vy[iy] = vz;
    }
    return vy;
  }

  function createBlueprint(x, y, z, name) {
    x = clampDim(x, 9); y = clampDim(y, 6); z = clampDim(z, 7);
    return {
      version: 1,
      name: name || '無題の設計図',
      dims: { x: x, y: y, z: z },
      voxels: allocVoxels(x, y, z)
    };
  }

  function inBounds(bp, x, y, z) {
    var d = bp.dims;
    return x >= 0 && y >= 0 && z >= 0 && x < d.x && y < d.y && z < d.z;
  }

  function get(bp, x, y, z) {
    if (!inBounds(bp, x, y, z)) return 0;
    return bp.voxels[y][z][x] || 0;
  }

  function set(bp, x, y, z, id) {
    if (!inBounds(bp, x, y, z)) return false;
    bp.voxels[y][z][x] = id | 0;
    return true;
  }

  // 範囲外は無視して安全に置く(ジェネレータ用)
  function setSafe(bp, x, y, z, id) {
    if (id == null) return;
    if (inBounds(bp, Math.round(x), Math.round(y), Math.round(z))) {
      bp.voxels[Math.round(y)][Math.round(z)][Math.round(x)] = id | 0;
    }
  }

  function forEachSolid(bp, cb) {
    var d = bp.dims, v = bp.voxels;
    for (var y = 0; y < d.y; y++) {
      for (var z = 0; z < d.z; z++) {
        var row = v[y][z];
        for (var x = 0; x < d.x; x++) {
          var id = row[x];
          if (id) cb(x, y, z, id);
        }
      }
    }
  }

  // 重なる範囲をコピーしてリサイズ
  function resize(bp, nx, ny, nz) {
    nx = clampDim(nx, bp.dims.x); ny = clampDim(ny, bp.dims.y); nz = clampDim(nz, bp.dims.z);
    var out = allocVoxels(nx, ny, nz);
    var cx = Math.min(nx, bp.dims.x), cy = Math.min(ny, bp.dims.y), cz = Math.min(nz, bp.dims.z);
    for (var y = 0; y < cy; y++)
      for (var z = 0; z < cz; z++)
        for (var x = 0; x < cx; x++)
          out[y][z][x] = bp.voxels[y][z][x];
    bp.dims = { x: nx, y: ny, z: nz };
    bp.voxels = out;
    return bp;
  }

  function totalSolid(bp) {
    var n = 0;
    forEachSolid(bp, function () { n++; });
    return n;
  }

  MCBP.model = {
    MAX: MAX,
    clampDim: clampDim,
    createBlueprint: createBlueprint,
    allocVoxels: allocVoxels,
    inBounds: inBounds,
    get: get,
    set: set,
    setSafe: setSafe,
    forEachSolid: forEachSolid,
    resize: resize,
    totalSolid: totalSolid
  };
})();
