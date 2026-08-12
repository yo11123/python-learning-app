/* templates.js - 建物ジェネレータ / 屋根 / スタイル / 用途別インテリア
 * MCBP.templates.TYPES : UI用の登録表(タイプ一覧 + fields + 生成関数)
 * MCBP.templates.gen(typeKey, opts) : 生成
 * 依存: blocks, model
 */
(function () {
  'use strict';
  window.MCBP = window.MCBP || {};
  var M = MCBP.model;
  var resolve = MCBP.blocks.resolveBlock;
  var cd = M.clampDim;

  // ===== 共有プリミティブ ===================================================
  function norm(a, b) { return a <= b ? [a, b] : [b, a]; }

  function fillRect(bp, y, x0, z0, x1, z1, id) {
    var xs = norm(x0, x1), zs = norm(z0, z1);
    for (var x = xs[0]; x <= xs[1]; x++)
      for (var z = zs[0]; z <= zs[1]; z++)
        M.setSafe(bp, x, y, z, id);
  }

  function ringFill(bp, y, x0, z0, x1, z1, id) {
    var xs = norm(x0, x1), zs = norm(z0, z1);
    for (var x = xs[0]; x <= xs[1]; x++) { M.setSafe(bp, x, y, zs[0], id); M.setSafe(bp, x, y, zs[1], id); }
    for (var z = zs[0]; z <= zs[1]; z++) { M.setSafe(bp, xs[0], y, z, id); M.setSafe(bp, xs[1], y, z, id); }
  }

  function fillBox(bp, x0, y0, z0, x1, y1, z1, id) {
    var ys = norm(y0, y1);
    for (var y = ys[0]; y <= ys[1]; y++) fillRect(bp, y, x0, z0, x1, z1, id);
  }

  function pillarY(bp, x, z, y0, y1, id) {
    var ys = norm(y0, y1);
    for (var y = ys[0]; y <= ys[1]; y++) M.setSafe(bp, x, y, z, id);
  }

  // 楕円ディスク判定
  function inDisk(x, z, cx, cz, rx, rz) {
    var dx = (x - cx) / (rx || 0.0001), dz = (z - cz) / (rz || 0.0001);
    return dx * dx + dz * dz <= 1.0;
  }
  function diskRing(bp, y, cx, cz, rx, rz, id) {
    var x0 = Math.floor(cx - rx - 1), x1 = Math.ceil(cx + rx + 1);
    var z0 = Math.floor(cz - rz - 1), z1 = Math.ceil(cz + rz + 1);
    for (var x = x0; x <= x1; x++)
      for (var z = z0; z <= z1; z++)
        if (inDisk(x, z, cx, cz, rx, rz)) {
          // 縁(隣接が外側)のみ
          if (!inDisk(x + 1, z, cx, cz, rx, rz) || !inDisk(x - 1, z, cx, cz, rx, rz) ||
              !inDisk(x, z + 1, cx, cz, rx, rz) || !inDisk(x, z - 1, cx, cz, rx, rz))
            M.setSafe(bp, x, y, z, id);
        }
  }
  function diskFill(bp, y, cx, cz, rx, rz, id) {
    var x0 = Math.floor(cx - rx - 1), x1 = Math.ceil(cx + rx + 1);
    var z0 = Math.floor(cz - rz - 1), z1 = Math.ceil(cz + rz + 1);
    for (var x = x0; x <= x1; x++)
      for (var z = z0; z <= z1; z++)
        if (inDisk(x, z, cx, cz, rx, rz)) M.setSafe(bp, x, y, z, id);
  }

  function sphereDist(x, y, z, cx, cy, cz) {
    var dx = x - cx, dy = y - cy, dz = z - cz;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  // ===== スタイル(材料プリセット) =========================================
  // 役割: wall 壁 / floor 床 / roof 屋根 / pillar 柱・梁 / glass 窓 / accent
  var STYLE_PRESETS = {
    '和風':       { wall: 15, floor: 12, roof: 39, pillar: 11, glass: 4, accent: 1,  roofShape: 'japanese' },
    'モダン':     { wall: 34, floor: 33, roof: 35, pillar: 32, glass: 4, accent: 36, roofShape: 'flat' },
    '西洋':       { wall: 14, floor: 3,  roof: 5,  pillar: 10, glass: 4, accent: 2,  roofShape: 'gable' },
    'サバイバル': { wall: 3,  floor: 3,  roof: 2,  pillar: 2,  glass: 4, accent: 6,  roofShape: 'gable' },
    'デフォルト': { wall: 3,  floor: 3,  roof: 2,  pillar: 10, glass: 4, accent: 2,  roofShape: 'gable' }
  };
  function styleOf(name) { return STYLE_PRESETS[name] || STYLE_PRESETS['デフォルト']; }

  // ===== 屋根(ROOFS) =======================================================
  // 各関数: (bp, {x0,z0,x1,z1, baseY, block, overhang}) 壁の上に屋根を積む。戻り値=屋根の高さ
  var ROOFS = {
    flat: function (bp, o) {
      fillRect(bp, o.baseY, o.x0, o.z0, o.x1, o.z1, o.block);
      return 1;
    },
    none: function () { return 0; },
    gable: function (bp, o) {
      var oh = o.overhang || 0;
      var xA = o.x0 - oh, xB = o.x1 + oh;
      var zA = o.z0 - oh, zB = o.z1 + oh;
      var i = 0;
      while (zA + i <= zB - i) {
        var y = o.baseY + i;
        for (var x = xA; x <= xB; x++) {
          M.setSafe(bp, x, y, zA + i, o.block);
          M.setSafe(bp, x, y, zB - i, o.block);
        }
        i++;
      }
      return i;
    },
    hip: function (bp, o) {
      var oh = o.overhang || 0;
      var xA = o.x0 - oh, xB = o.x1 + oh, zA = o.z0 - oh, zB = o.z1 + oh;
      var i = 0;
      while (xA + i <= xB - i && zA + i <= zB - i) {
        ringFill(bp, o.baseY + i, xA + i, zA + i, xB - i, zB - i, o.block);
        i++;
      }
      return i;
    },
    pyramid: function (bp, o) {
      // 方形(四角錐)。軒なしでリングを内側に詰めて頂点へ
      var xA = o.x0, xB = o.x1, zA = o.z0, zB = o.z1, i = 0;
      while (xA + i <= xB - i && zA + i <= zB - i) {
        ringFill(bp, o.baseY + i, xA + i, zA + i, xB - i, zB - i, o.block);
        i++;
      }
      return i;
    },
    japanese: function (bp, o) {
      // 反り屋根: 大きな軒 + 段状の寄棟
      var oh = Math.max(1, o.overhang || 1);
      // 軒の出(最下段を外側に張り出す)
      fillRect(bp, o.baseY, o.x0 - oh, o.z0 - oh, o.x1 + oh, o.z1 + oh, o.block);
      var xA = o.x0, xB = o.x1, zA = o.z0, zB = o.z1, i = 1;
      while (xA + i <= xB - i && zA + i <= zB - i) {
        ringFill(bp, o.baseY + i, xA + i, zA + i, xB - i, zB - i, o.block);
        i++;
      }
      return i;
    },
    aframe: function (bp, o) {
      // 急勾配の切妻(2段で1マスしか詰めない=高く尖る)
      var oh = o.overhang || 0;
      var xA = o.x0 - oh, xB = o.x1 + oh;
      var zA = o.z0, zB = o.z1;
      var i = 0, step = 0;
      while (zA + step <= zB - step) {
        var y = o.baseY + i;
        for (var x = xA; x <= xB; x++) {
          M.setSafe(bp, x, y, zA + step, o.block);
          M.setSafe(bp, x, y, zB - step, o.block);
        }
        i += 1;
        if (i % 2 === 0) step += 1; // 2段ごとに1マス詰める → 急勾配
      }
      return i;
    },
    shed: function (bp, o) {
      // 片流れ(Z方向へ単傾斜)
      var oh = o.overhang || 0;
      var xA = o.x0 - oh, xB = o.x1 + oh;
      var depth = o.z1 - o.z0;
      for (var j = 0; j <= depth; j++) {
        var y = o.baseY + Math.floor(j / 1); // 1マスにつき1段
        for (var x = xA; x <= xB; x++) M.setSafe(bp, x, y, o.z0 + j, o.block);
      }
      return depth + 1;
    },
    dome: function (bp, o) {
      var cx = (o.x0 + o.x1) / 2, cz = (o.z0 + o.z1) / 2;
      var r = Math.min(o.x1 - o.x0, o.z1 - o.z0) / 2 + 0.5;
      var h = Math.ceil(r);
      for (var y = 0; y <= h; y++) {
        for (var x = o.x0 - 1; x <= o.x1 + 1; x++)
          for (var z = o.z0 - 1; z <= o.z1 + 1; z++) {
            var d = sphereDist(x, o.baseY + y, z, cx, o.baseY, cz);
            if (d >= r - 0.85 && d <= r + 0.15) M.setSafe(bp, x, o.baseY + y, z, o.block);
          }
      }
      return h + 1;
    }
  };
  function roofHeight(shape, X, D) {
    if (shape === 'flat') return 1;
    if (shape === 'none') return 0;
    if (shape === 'shed') return D;
    if (shape === 'dome') return Math.ceil(Math.min(X, D) / 2) + 1;
    if (shape === 'aframe') return D + 2;
    return Math.ceil(Math.min(X, D) / 2) + 2;
  }

  // ===== 用途別インテリア ==================================================
  // 各要素 = 1個。並び順に壁沿いへ配置。
  var PURPOSE_FURNITURE = {
    'kyoten':  [50, 42, 43, 41],                       // 拠点(基本)
    'souko':   [41, 41, 41, 41, 52, 52, 42, 47],       // 倉庫
    'sagyou':  [42, 43, 53, 54, 46, 57, 56, 41],       // 作業場
    'jouzou':  [48, 49, 45, 41],                       // 醸造室
    'shinshitsu': [50, 41, 62, 55],                    // 寝室
    'kitchen': [54, 43, 52, 41, 61, 49],               // キッチン
    'kaji':    [53, 46, 57, 60, 56, 41],               // 鍛冶場
    'none':    []                                      // なし
    // 'enchant' と 'library' は専用処理
  };
  var PURPOSE_OPTIONS = [
    { v: 'none', l: 'なし(空)' },
    { v: 'kyoten', l: '拠点(基本)' },
    { v: 'souko', l: '倉庫' },
    { v: 'sagyou', l: '作業場' },
    { v: 'enchant', l: 'エンチャント部屋' },
    { v: 'jouzou', l: '醸造室' },
    { v: 'shinshitsu', l: '寝室' },
    { v: 'kitchen', l: 'キッチン' },
    { v: 'library', l: '図書館' },
    { v: 'kaji', l: '鍛冶場' }
  ];

  function perimeterCells(x0, z0, x1, z1) {
    var cells = [], x, z;
    if (x1 < x0 || z1 < z0) return cells;
    for (x = x0; x <= x1; x++) cells.push([x, z0]);
    for (z = z0 + 1; z <= z1; z++) cells.push([x1, z]);
    for (x = x1 - 1; x >= x0; x--) cells.push([x, z1]);
    for (z = z1 - 1; z >= z0 + 1; z--) cells.push([x0, z]);
    return cells;
  }

  function placeEnchantingRoom(bp, it, ver) {
    var y = it.y;
    var cx = Math.floor((it.x0 + it.x1) / 2), cz = Math.floor((it.z0 + it.z1) / 2);
    M.setSafe(bp, cx, y, cz, resolve(44, ver)); // エンチャントテーブル
    var shelf = resolve(45, ver);
    var placed = 0;
    // テーブル中心の 5x5 外周(16マス)に本棚を最大15個、入口側1マスを空ける
    var ring = perimeterCells(cx - 2, cz - 2, cx + 2, cz + 2);
    for (var k = 0; k < ring.length && placed < 15; k++) {
      var x = ring[k][0], z = ring[k][1];
      if (x < it.x0 || x > it.x1 || z < it.z0 || z > it.z1) continue; // 内部に収まる分だけ
      if (x === it.doorX && z === it.z0) continue; // 入口側
      M.setSafe(bp, x, y, z, shelf);
      placed++;
    }
    // 補助: 金床・書見台・チェスト
    var extras = [46, 55, 41];
    var free = perimeterCells(it.x0, it.z0, it.x1, it.z1).filter(function (c) {
      return M.get(bp, c[0], y, c[1]) === 0 && !(c[0] === it.doorX && c[1] === it.z0);
    });
    for (var e = 0; e < extras.length && e < free.length; e++)
      M.setSafe(bp, free[e][0], y, free[e][1], resolve(extras[e], ver));
    if (placed < 15) MCBP._note = '本棚は ' + placed + '/15 個配置(部屋が小さいため)。5x5以上の内部で最大レベルになります。';
  }

  function placeLibrary(bp, it, ver) {
    var y = it.y;
    var shelf = resolve(45, ver);
    var cells = perimeterCells(it.x0, it.z0, it.x1, it.z1);
    cells.forEach(function (c) {
      if (c[0] === it.doorX && c[1] === it.z0) return;
      M.setSafe(bp, c[0], y, c[1], shelf);
      M.setSafe(bp, c[0], y + 1, c[1], shelf); // 2段の本棚壁
    });
    // 中央に書見台
    M.setSafe(bp, Math.floor((it.x0 + it.x1) / 2), y, Math.floor((it.z0 + it.z1) / 2), resolve(55, ver));
  }

  function placeFurniture(bp, it, purpose, ver) {
    if (!purpose || purpose === 'none') return;
    if (it.x1 < it.x0 || it.z1 < it.z0) return;
    if (purpose === 'enchant') { placeEnchantingRoom(bp, it, ver); return; }
    if (purpose === 'library') { placeLibrary(bp, it, ver); return; }
    var list = PURPOSE_FURNITURE[purpose] || [];
    var cells = perimeterCells(it.x0, it.z0, it.x1, it.z1).filter(function (c) {
      return !(c[0] === it.doorX && c[1] === it.z0); // 入口前は空ける
    });
    var ci = 0;
    for (var i = 0; i < list.length && ci < cells.length; i++) {
      var id = resolve(list[i], ver);
      if (!id) continue; // 省略ブロック
      M.setSafe(bp, cells[ci][0], it.y, cells[ci][1], id);
      ci++;
    }
  }

  // ===== 建物ジェネレータ ==================================================

  // 家(用途別内装・スタイル・屋根形状・階数対応)
  function house(opts) {
    var X = cd(opts.X, 9), D = cd(opts.D, 7);
    var ver = opts.version || '1.21';
    var st = styleOf(opts.style);
    var floors = Math.max(1, Math.min(8, opts.floors || 1));
    var floorH = 4;
    var roofShape = (opts.roofShape && opts.roofShape !== 'auto') ? opts.roofShape : st.roofShape;
    var wall = resolve(st.wall, ver), floor = resolve(st.floor, ver), glass = resolve(st.glass, ver);
    var roofBlk = resolve(st.roof, ver), pillar = resolve(st.pillar, ver);

    var baseY = floors * floorH;          // 屋根がのる高さ(最上階の天井上)
    var rH = roofHeight(roofShape, X, D);
    var totalY = baseY + Math.max(1, rH);
    var bp = M.createBlueprint(X, totalY, D, '家');

    // 各階の床スラブ
    for (var f = 0; f < floors; f++) fillRect(bp, f * floorH, 0, 0, X - 1, D - 1, floor);
    // 壁(全高)
    for (var y = 1; y < baseY; y++) ringFill(bp, y, 0, 0, X - 1, D - 1, wall);
    // 角柱(アクセント)
    [[0, 0], [X - 1, 0], [0, D - 1], [X - 1, D - 1]].forEach(function (c) {
      pillarY(bp, c[0], c[1], 1, baseY - 1, pillar);
    });
    // 窓(各階の中段)
    if (opts.windows !== false) {
      for (var ff = 0; ff < floors; ff++) {
        var wy = ff * floorH + 2;
        addWindows(bp, wy, X, D, glass, wall);
      }
    }
    // ドア(正面 z=0 中央、1階、高さ2)
    var dx = Math.floor(X / 2);
    M.setSafe(bp, dx, 1, 0, 0);
    if (baseY > 2) M.setSafe(bp, dx, 2, 0, 0);
    // 屋根
    var oh = roofOverhang(roofShape);
    (ROOFS[roofShape] || ROOFS.gable)(bp, { x0: 0, z0: 0, x1: X - 1, z1: D - 1, baseY: baseY, block: roofBlk, overhang: oh });
    // 内装(1階)
    placeFurniture(bp, { x0: 1, z0: 1, x1: X - 2, z1: D - 2, y: 1, doorX: dx }, opts.purpose || 'none', ver);
    bp.name = '家(' + (opts.style || 'デフォルト') + ')';
    return bp;
  }

  function addWindows(bp, wy, X, D, glass, wall) {
    var x, z;
    for (x = 2; x < X - 1; x += 2) {
      if (M.get(bp, x, wy, 0) === wall) M.setSafe(bp, x, wy, 0, glass);
      if (M.get(bp, x, wy, D - 1) === wall) M.setSafe(bp, x, wy, D - 1, glass);
    }
    for (z = 2; z < D - 1; z += 2) {
      if (M.get(bp, 0, wy, z) === wall) M.setSafe(bp, 0, wy, z, glass);
      if (M.get(bp, X - 1, wy, z) === wall) M.setSafe(bp, X - 1, wy, z, glass);
    }
  }
  function roofOverhang(shape) {
    if (shape === 'japanese') return 1;
    if (shape === 'flat' || shape === 'none') return 0;
    return 1;
  }

  // ビル(多階・平屋根)
  function building(opts) {
    var o = {
      X: opts.X, D: opts.D, floors: Math.max(2, opts.floors || 4),
      style: opts.style || 'モダン', roofShape: opts.roofShape || 'flat',
      windows: true, purpose: 'none', version: opts.version
    };
    var bp = house(o);
    bp.name = 'ビル(' + o.floors + '階)';
    return bp;
  }

  // 小屋(小さめの家)
  function cabin(opts) {
    var bp = house({
      X: opts.X || 6, D: opts.D || 5, floors: 1,
      style: opts.style || 'サバイバル', roofShape: opts.roofShape || 'gable',
      windows: true, purpose: opts.purpose || 'kyoten', version: opts.version
    });
    bp.name = '小屋';
    return bp;
  }

  // 塔(四角/丸)
  function tower(opts) {
    var X = cd(opts.X, 7), D = cd(opts.D, 7), H = cd(opts.H, 12);
    var ver = opts.version || '1.21';
    var st = styleOf(opts.style || '西洋');
    var wall = resolve(st.wall, ver), floor = resolve(st.floor, ver);
    var round = !!opts.round;
    var rH = (opts.roofShape && opts.roofShape !== 'auto' && opts.roofShape !== 'none')
      ? roofHeight(opts.roofShape, X, D) : 0;
    var bp = M.createBlueprint(X, H + rH, D, '塔');
    var cx = (X - 1) / 2, cz = (D - 1) / 2, rx = (X - 1) / 2, rz = (D - 1) / 2;
    fillRect(bp, 0, 0, 0, X - 1, D - 1, floor);
    for (var y = 1; y < H; y++) {
      if (round) diskRing(bp, y, cx, cz, rx, rz, wall);
      else ringFill(bp, y, 0, 0, X - 1, D - 1, wall);
    }
    // 銃眼(上端リングを交互に)
    if (opts.battlements !== false) {
      var top = perimeterCells(0, 0, X - 1, D - 1);
      for (var k = 0; k < top.length; k++)
        if (k % 2 === 1) M.setSafe(bp, top[k][0], H, top[k][1], wall);
    }
    // 矢狭間(側面に隙間)
    for (var yy = 3; yy < H - 1; yy += 3) {
      M.setSafe(bp, 0, yy, Math.floor(cz), 0);
      M.setSafe(bp, X - 1, yy, Math.floor(cz), 0);
    }
    if (rH) (ROOFS[opts.roofShape] || ROOFS.pyramid)(bp, { x0: 0, z0: 0, x1: X - 1, z1: D - 1, baseY: H, block: resolve(st.roof, ver), overhang: 0 });
    bp.name = round ? '塔(丸)' : '塔(四角)';
    return bp;
  }

  // 城(外壁 + 四隅の塔 + 中央キープ)
  function castle(opts) {
    var X = cd(opts.X, 21), D = cd(opts.D, 21), H = cd(opts.H, 7);
    var ver = opts.version || '1.21';
    var st = styleOf(opts.style || '西洋');
    var wall = resolve(st.wall, ver), floor = resolve(st.floor, ver);
    var towerH = H + 3;
    var bp = M.createBlueprint(X, towerH + 3, D, '城');
    // 地面
    fillRect(bp, 0, 0, 0, X - 1, D - 1, floor);
    // 外壁 + 銃眼
    for (var y = 1; y <= H; y++) ringFill(bp, y, 0, 0, X - 1, D - 1, wall);
    var top = perimeterCells(0, 0, X - 1, D - 1);
    for (var k = 0; k < top.length; k++) if (k % 2 === 1) M.setSafe(bp, top[k][0], H + 1, top[k][1], wall);
    // 四隅の塔
    var ts = 3;
    [[0, 0], [X - ts, 0], [0, D - ts], [X - ts, D - ts]].forEach(function (c) {
      for (var ty = 1; ty <= towerH; ty++) ringFill(bp, ty, c[0], c[1], c[0] + ts - 1, c[1] + ts - 1, wall);
      var tt = perimeterCells(c[0], c[1], c[0] + ts - 1, c[1] + ts - 1);
      for (var j = 0; j < tt.length; j++) if (j % 2 === 0) M.setSafe(bp, tt[j][0], towerH + 1, tt[j][1], wall);
    });
    // 中央キープ(小さな家)
    var kw = Math.max(5, Math.floor(X / 3));
    var kd = Math.max(5, Math.floor(D / 3));
    var kx = Math.floor((X - kw) / 2), kz = Math.floor((D - kd) / 2);
    var keep = house({ X: kw, D: kd, floors: 1, style: opts.style || '西洋', roofShape: 'hip', windows: true, purpose: 'none', version: ver });
    stamp(bp, keep, kx, 0, kz);
    bp.name = '城';
    return bp;
  }

  // 別blueprintを (ox,oy,oz) にコピー
  function stamp(bp, src, ox, oy, oz) {
    M.forEachSolid(src, function (x, y, z, id) { M.setSafe(bp, x + ox, y + oy, z + oz, id); });
  }

  // 壁/塀
  function wall(opts) {
    var L = cd(opts.L, 15), T = cd(opts.T, 1), H = cd(opts.H, 4);
    var ver = opts.version || '1.21';
    var blk = resolve(opts.block != null ? opts.block : 2, ver);
    var bp = M.createBlueprint(L, H + 1, T, '壁');
    fillBox(bp, 0, 1, 0, L - 1, H, T - 1, blk);
    if (opts.battlements !== false)
      for (var x = 0; x < L; x++) if (x % 2 === 1) fillRect(bp, H + 1, x, 0, x, T - 1, blk);
    return bp;
  }

  // 橋
  function bridge(opts) {
    var L = cd(opts.L, 21), W = cd(opts.W, 5), sup = cd(opts.support, 6);
    var ver = opts.version || '1.21';
    var deck = resolve(opts.deck != null ? opts.deck : 3, ver);
    var rail = resolve(opts.rail != null ? opts.rail : 10, ver);
    var pil = resolve(2, ver);
    var bp = M.createBlueprint(L, sup + 2, W, '橋');
    var dy = sup; // 床の高さ
    fillRect(bp, dy, 0, 0, L - 1, W - 1, deck);
    // 手すり
    for (var x = 0; x < L; x++) { M.setSafe(bp, x, dy + 1, 0, rail); M.setSafe(bp, x, dy + 1, W - 1, rail); }
    // 支柱(一定間隔)
    for (var px = 2; px < L - 1; px += 5) {
      pillarY(bp, px, 0, 0, dy - 1, pil);
      pillarY(bp, px, W - 1, 0, dy - 1, pil);
    }
    return bp;
  }

  // 門/アーチ
  function arch(opts) {
    var X = cd(opts.X, 9), H = cd(opts.H, 7), T = cd(opts.T, 1);
    var ver = opts.version || '1.21';
    var blk = resolve(opts.block != null ? opts.block : 14, ver);
    var bp = M.createBlueprint(X, H + 1, Math.max(1, T), '門');
    var cx = (X - 1) / 2, r = (X - 1) / 2;
    var pillH = H - Math.ceil(r);
    // 2本の脚
    for (var t = 0; t < T; t++) {
      pillarY(bp, 0, t, 0, pillH, blk);
      pillarY(bp, X - 1, t, 0, pillH, blk);
    }
    // 半円アーチ
    for (var x = 0; x < X; x++) {
      var dx = (x - cx) / r;
      if (dx * dx <= 1) {
        var yy = pillH + Math.round(Math.sqrt(1 - dx * dx) * r);
        for (var tt = 0; tt < T; tt++) M.setSafe(bp, x, yy, tt, blk);
      }
    }
    return bp;
  }

  // 井戸
  function well(opts) {
    var ver = opts.version || '1.21';
    var st = resolve(2, ver), post = resolve(10, ver), roof = resolve(5, ver), water = resolve(31, ver);
    var bp = M.createBlueprint(3, 5, 3, '井戸');
    ringFill(bp, 0, 0, 0, 2, 2, st);
    ringFill(bp, 1, 0, 0, 2, 2, st);
    M.setSafe(bp, 1, 0, 1, water);
    [[0, 0], [2, 0], [0, 2], [2, 2]].forEach(function (c) { pillarY(bp, c[0], c[1], 2, 3, post); });
    fillRect(bp, 4, 0, 0, 2, 2, roof);
    return bp;
  }

  // 噴水
  function fountain(opts) {
    var R = cd(opts.R, 7);
    var ver = opts.version || '1.21';
    var st = resolve(14, ver), water = resolve(31, ver);
    var r = (R - 1) / 2, cx = (R - 1) / 2, cz = (R - 1) / 2;
    var bp = M.createBlueprint(R, 4, R, '噴水');
    diskRing(bp, 0, cx, cz, r, r, st);
    diskFill(bp, 0, cx, cz, r - 1, r - 1, water);
    diskRing(bp, 1, cx, cz, r - 1.5, r - 1.5, st);
    diskFill(bp, 1, cx, cz, r - 2.5, r - 2.5, water);
    pillarY(bp, cx, cz, 1, 3, st);
    M.setSafe(bp, cx, 3, cz, water);
    return bp;
  }

  // 灯台
  function lighthouse(opts) {
    var H = cd(opts.H, 16), baseR = cd(opts.R, 4);
    var ver = opts.version || '1.21';
    var red = resolve(17, ver), white = resolve(15, ver), glass = resolve(4, ver), light = resolve(51, ver);
    var bp = M.createBlueprint(baseR * 2 + 1, H + 3, baseR * 2 + 1, '灯台');
    var cx = baseR, cz = baseR;
    var lampY = H;
    for (var y = 0; y < lampY; y++) {
      var t = y / lampY;
      var r = baseR * (1 - 0.45 * t); // 上へ細く
      var band = (Math.floor(y / 2) % 2 === 0) ? red : white;
      if (y === 0) diskFill(bp, y, cx, cz, r, r, band);
      else diskRing(bp, y, cx, cz, r, r, band);
    }
    // ランタン室(ガラス)
    var lr = baseR * 0.6;
    diskRing(bp, lampY, cx, cz, lr, lr, glass);
    diskRing(bp, lampY + 1, cx, cz, lr, lr, glass);
    M.setSafe(bp, cx, lampY, cz, light);
    diskFill(bp, lampY + 2, cx, cz, lr, lr, resolve(25, ver));
    return bp;
  }

  // 鳥居
  function torii(opts) {
    var W = cd(opts.W, 7), H = cd(opts.H, 7);
    var ver = opts.version || '1.21';
    var red = resolve(17, ver), dark = resolve(11, ver);
    var bp = M.createBlueprint(W, H + 1, 3, '鳥居');
    var zc = 1;
    // 2本の柱
    pillarY(bp, 1, zc, 0, H - 1, red);
    pillarY(bp, W - 2, zc, 0, H - 1, red);
    // 貫(下の横木)
    for (var x = 1; x <= W - 2; x++) M.setSafe(bp, x, H - 2, zc, red);
    // 笠木(上の横木、軒を張り出す・黒っぽく)
    for (var x2 = 0; x2 < W; x2++) M.setSafe(bp, x2, H, zc, dark);
    for (var x3 = 0; x3 < W; x3++) M.setSafe(bp, x3, H - 1, zc, red);
    return bp;
  }

  // ピラミッド
  function pyramid(opts) {
    var base = cd(opts.base, 15);
    var ver = opts.version || '1.21';
    var blk = resolve(opts.block != null ? opts.block : 9, ver);
    var solid = !!opts.solid;
    var h = Math.ceil(base / 2);
    var bp = M.createBlueprint(base, h, base, 'ピラミッド');
    for (var y = 0; y < h; y++) {
      var a = y, b = base - 1 - y;
      if (b < a) break;
      if (solid) fillRect(bp, y, a, a, b, b, blk);
      else ringFill(bp, y, a, a, b, b, blk);
    }
    return bp;
  }

  // ドーム / 球
  function dome(opts) { return ball(opts, true); }
  function sphere(opts) { return ball(opts, false); }
  function ball(opts, half) {
    var r = cd(opts.r, 6);
    var ver = opts.version || '1.21';
    var blk = resolve(opts.block != null ? opts.block : 4, ver);
    var shell = opts.shell !== false;
    var size = r * 2 + 1;
    var cy = half ? 0 : r;
    var Y = half ? r + 1 : size;
    var bp = M.createBlueprint(size, Y, size, half ? 'ドーム' : '球');
    var c = r;
    for (var y = 0; y < Y; y++)
      for (var x = 0; x < size; x++)
        for (var z = 0; z < size; z++) {
          var d = sphereDist(x, y, z, c, cy, c);
          var on = shell ? (d >= r - 0.85 && d <= r + 0.15) : (d <= r + 0.15);
          if (on) M.setSafe(bp, x, y, z, blk);
        }
    return bp;
  }

  // 温室
  function greenhouse(opts) {
    var X = cd(opts.X, 9), D = cd(opts.D, 7), H = cd(opts.H, 5);
    var ver = opts.version || '1.21';
    var frame = resolve(28, ver), glass = resolve(4, ver), floor = resolve(9, ver);
    var bp = M.createBlueprint(X, H + Math.ceil(D / 2) + 1, D, '温室');
    fillRect(bp, 0, 0, 0, X - 1, D - 1, floor);
    // ガラス壁
    for (var y = 1; y < H; y++) ringFill(bp, y, 0, 0, X - 1, D - 1, glass);
    // フレーム(角柱)
    [[0, 0], [X - 1, 0], [0, D - 1], [X - 1, D - 1]].forEach(function (c) { pillarY(bp, c[0], c[1], 1, H - 1, frame); });
    // ドア
    M.setSafe(bp, Math.floor(X / 2), 1, 0, 0);
    if (H > 2) M.setSafe(bp, Math.floor(X / 2), 2, 0, 0);
    // ガラスの切妻屋根
    ROOFS.gable(bp, { x0: 0, z0: 0, x1: X - 1, z1: D - 1, baseY: H, block: glass, overhang: 0 });
    return bp;
  }

  // 木
  function tree(opts) {
    var trunkH = cd(opts.trunkH, 5);
    var ver = opts.version || '1.21';
    var log = resolve(10, ver), leaves = resolve(13, ver);
    var R = 2;
    var size = R * 2 + 3;
    var bp = M.createBlueprint(size, trunkH + 3, size, '木');
    var c = Math.floor(size / 2);
    pillarY(bp, c, c, 0, trunkH, log);
    // 樹冠
    for (var ly = 0; ly < 4; ly++) {
      var yy = trunkH - 1 + ly;
      var rr = (ly < 2) ? 2 : 1;
      for (var x = c - rr; x <= c + rr; x++)
        for (var z = c - rr; z <= c + rr; z++) {
          if (Math.abs(x - c) === rr && Math.abs(z - c) === rr) continue; // 角を落とす
          if (M.get(bp, x, yy, z) === 0) M.setSafe(bp, x, yy, z, leaves);
        }
    }
    M.setSafe(bp, c, trunkH + 2, c, leaves);
    return bp;
  }

  // ===== タイプ登録表(UI用) ===============================================
  var STYLE_FIELD = { key: 'style', label: 'スタイル', type: 'style', def: 'デフォルト' };
  var ROOF_FIELD = { key: 'roofShape', label: '屋根の形', type: 'roof', def: 'auto' };
  var PURPOSE_FIELD = { key: 'purpose', label: '用途(内装)', type: 'purpose', def: 'none' };

  var TYPES = [
    { key: 'house', label: '家', group: '住居・建物', gen: house,
      fields: [
        { key: 'X', label: '幅X', type: 'int', def: 9, min: 5, max: 32 },
        { key: 'D', label: '奥行Z', type: 'int', def: 7, min: 5, max: 32 },
        { key: 'floors', label: '階数', type: 'int', def: 1, min: 1, max: 6 },
        STYLE_FIELD, ROOF_FIELD, PURPOSE_FIELD,
        { key: 'windows', label: '窓をつける', type: 'bool', def: true }
      ] },
    { key: 'building', label: 'ビル', group: '住居・建物', gen: building,
      fields: [
        { key: 'X', label: '幅X', type: 'int', def: 9, min: 5, max: 32 },
        { key: 'D', label: '奥行Z', type: 'int', def: 9, min: 5, max: 32 },
        { key: 'floors', label: '階数', type: 'int', def: 4, min: 2, max: 12 },
        STYLE_FIELD, ROOF_FIELD
      ] },
    { key: 'cabin', label: '小屋', group: '住居・建物', gen: cabin,
      fields: [
        { key: 'X', label: '幅X', type: 'int', def: 6, min: 4, max: 16 },
        { key: 'D', label: '奥行Z', type: 'int', def: 5, min: 4, max: 16 },
        STYLE_FIELD, ROOF_FIELD, PURPOSE_FIELD
      ] },
    { key: 'tower', label: '塔', group: '住居・建物', gen: tower,
      fields: [
        { key: 'X', label: '幅X', type: 'int', def: 7, min: 3, max: 24 },
        { key: 'D', label: '奥行Z', type: 'int', def: 7, min: 3, max: 24 },
        { key: 'H', label: '高さY', type: 'int', def: 12, min: 4, max: 48 },
        { key: 'round', label: '丸い塔', type: 'bool', def: false },
        { key: 'battlements', label: '銃眼', type: 'bool', def: true },
        STYLE_FIELD, ROOF_FIELD
      ] },
    { key: 'castle', label: '城', group: '住居・建物', gen: castle,
      fields: [
        { key: 'X', label: '幅X', type: 'int', def: 21, min: 11, max: 48 },
        { key: 'D', label: '奥行Z', type: 'int', def: 21, min: 11, max: 48 },
        { key: 'H', label: '壁の高さ', type: 'int', def: 7, min: 4, max: 20 },
        STYLE_FIELD
      ] },
    { key: 'wall', label: '壁・塀', group: '構造物', gen: wall,
      fields: [
        { key: 'L', label: '長さ', type: 'int', def: 15, min: 3, max: 64 },
        { key: 'T', label: '厚み', type: 'int', def: 1, min: 1, max: 5 },
        { key: 'H', label: '高さ', type: 'int', def: 4, min: 1, max: 24 },
        { key: 'block', label: '材料', type: 'block', def: 2 },
        { key: 'battlements', label: '銃眼', type: 'bool', def: true }
      ] },
    { key: 'bridge', label: '橋', group: '構造物', gen: bridge,
      fields: [
        { key: 'L', label: '長さ', type: 'int', def: 21, min: 5, max: 64 },
        { key: 'W', label: '幅', type: 'int', def: 5, min: 2, max: 16 },
        { key: 'support', label: '支柱の高さ', type: 'int', def: 6, min: 1, max: 32 },
        { key: 'deck', label: '床材', type: 'block', def: 3 },
        { key: 'rail', label: '手すり材', type: 'block', def: 10 }
      ] },
    { key: 'arch', label: '門・アーチ', group: '構造物', gen: arch,
      fields: [
        { key: 'X', label: '幅', type: 'int', def: 9, min: 3, max: 32 },
        { key: 'H', label: '高さ', type: 'int', def: 7, min: 3, max: 24 },
        { key: 'T', label: '厚み', type: 'int', def: 1, min: 1, max: 6 },
        { key: 'block', label: '材料', type: 'block', def: 14 }
      ] },
    { key: 'well', label: '井戸', group: '構造物', gen: well, fields: [] },
    { key: 'fountain', label: '噴水', group: '構造物', gen: fountain,
      fields: [{ key: 'R', label: '直径', type: 'int', def: 7, min: 5, max: 21 }] },
    { key: 'lighthouse', label: '灯台', group: '構造物', gen: lighthouse,
      fields: [
        { key: 'H', label: '高さ', type: 'int', def: 16, min: 6, max: 48 },
        { key: 'R', label: '半径', type: 'int', def: 4, min: 2, max: 10 }
      ] },
    { key: 'torii', label: '鳥居', group: '構造物', gen: torii,
      fields: [
        { key: 'W', label: '幅', type: 'int', def: 7, min: 5, max: 21 },
        { key: 'H', label: '高さ', type: 'int', def: 7, min: 4, max: 20 }
      ] },
    { key: 'pyramid', label: 'ピラミッド', group: '地形・装飾', gen: pyramid,
      fields: [
        { key: 'base', label: '底辺', type: 'int', def: 15, min: 3, max: 48 },
        { key: 'block', label: '材料', type: 'block', def: 9 },
        { key: 'solid', label: '中身を詰める', type: 'bool', def: false }
      ] },
    { key: 'dome', label: 'ドーム', group: '地形・装飾', gen: dome,
      fields: [
        { key: 'r', label: '半径', type: 'int', def: 6, min: 2, max: 24 },
        { key: 'block', label: '材料', type: 'block', def: 4 },
        { key: 'shell', label: '殻のみ', type: 'bool', def: true }
      ] },
    { key: 'sphere', label: '球', group: '地形・装飾', gen: sphere,
      fields: [
        { key: 'r', label: '半径', type: 'int', def: 6, min: 2, max: 24 },
        { key: 'block', label: '材料', type: 'block', def: 4 },
        { key: 'shell', label: '殻のみ', type: 'bool', def: true }
      ] },
    { key: 'greenhouse', label: '温室', group: '地形・装飾', gen: greenhouse,
      fields: [
        { key: 'X', label: '幅X', type: 'int', def: 9, min: 5, max: 32 },
        { key: 'D', label: '奥行Z', type: 'int', def: 7, min: 5, max: 32 },
        { key: 'H', label: '壁の高さ', type: 'int', def: 5, min: 3, max: 16 }
      ] },
    { key: 'tree', label: '木', group: '地形・装飾', gen: tree,
      fields: [{ key: 'trunkH', label: '幹の高さ', type: 'int', def: 5, min: 3, max: 16 }] }
  ];
  var BY_KEY = {};
  TYPES.forEach(function (t) { BY_KEY[t.key] = t; });

  function gen(typeKey, opts) {
    var t = BY_KEY[typeKey];
    if (!t) return null;
    MCBP._note = '';
    return t.gen(opts || {});
  }

  MCBP.templates = {
    TYPES: TYPES,
    byKey: function (k) { return BY_KEY[k]; },
    gen: gen,
    STYLE_PRESETS: STYLE_PRESETS,
    ROOFS: ROOFS,
    ROOF_OPTIONS: [
      { v: 'auto', l: 'スタイルに従う' }, { v: 'flat', l: '平屋根' }, { v: 'gable', l: '切妻' },
      { v: 'hip', l: '寄棟' }, { v: 'pyramid', l: '方形' }, { v: 'japanese', l: '和風(反り)' },
      { v: 'aframe', l: 'A字' }, { v: 'shed', l: '片流れ' }, { v: 'dome', l: 'ドーム' }, { v: 'none', l: 'なし' }
    ],
    STYLE_OPTIONS: [
      { v: '和風', l: '和風' }, { v: 'モダン', l: 'モダン' }, { v: '西洋', l: '西洋' },
      { v: 'サバイバル', l: 'サバイバル素材' }, { v: 'デフォルト', l: 'デフォルト' }
    ],
    PURPOSE_OPTIONS: PURPOSE_OPTIONS,
    // 純ロジックのテスト用に公開
    _fillRect: fillRect, _ringFill: ringFill, _placeFurniture: placeFurniture, _perimeterCells: perimeterCells
  };
})();
