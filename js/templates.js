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

  // ===== 質感ミックス(60-30-10) ==========================================
  // 位置で決まる決定的ハッシュ。縞にならないよう散らす。
  function hash01(x, y, z, seed) {
    var h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(z | 0, 2246822519) + Math.imul(seed | 0, 3266489917)) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    h = (h ^ (h >>> 16)) >>> 0;
    return h / 4294967296;
  }
  // mix = [[id,重み],...] を重み付き抽選
  function pickMix(mix, r) {
    if (!mix || !mix.length) return 0;
    var total = 0, i; for (i = 0; i < mix.length; i++) total += mix[i][1];
    var t = r * total;
    for (i = 0; i < mix.length; i++) { t -= mix[i][1]; if (t <= 0) return mix[i][0]; }
    return mix[mix.length - 1][0];
  }
  function resolveMix(mix, ver) {
    if (!mix) return null;
    var out = [];
    for (var i = 0; i < mix.length; i++) { var id = resolve(mix[i][0], ver); if (id) out.push([id, mix[i][1]]); }
    return out.length ? out : null;
  }
  // 外周リングを配合で埋める
  function ringFillMix(bp, y, x0, z0, x1, z1, mix, seed) {
    var cells = perimeterCells(x0, z0, x1, z1);
    for (var i = 0; i < cells.length; i++)
      M.setSafe(bp, cells[i][0], y, cells[i][1], pickMix(mix, hash01(cells[i][0], y, cells[i][1], seed)));
  }

  // ===== スタイル(材料プリセット) =========================================
  // 役割: wall(=漆喰/壁面) / floor / roof / pillar(=柱・梁の木材) / glass / accent
  // 装飾フラグ: framing 木組み / foundation 石の土台id / foundationH 段数 / chimney 煙突 / overhang 軒の出
  var STYLE_PRESETS = {
    '和風':       { wall: 15, floor: 12, roof: 39, pillar: 11, glass: 4, accent: 1,  roofShape: 'japanese',
                    wallMix: [[15, 85], [70, 15]], foundMix: [[1, 60], [2, 30], [67, 10]] },
    'モダン':     { wall: 34, floor: 33, roof: 35, pillar: 32, glass: 4, accent: 36, roofShape: 'flat',
                    wallMix: [[34, 70], [35, 22], [33, 8]], foundMix: [[33, 60], [35, 25], [1, 15]] },
    '西洋':       { wall: 14, floor: 3,  roof: 5,  pillar: 10, glass: 4, accent: 2,  roofShape: 'gable',
                    wallMix: [[14, 60], [2, 25], [66, 10], [67, 5]], foundMix: [[2, 55], [67, 25], [14, 15], [66, 5]] },
    'サバイバル': { wall: 3,  floor: 3,  roof: 2,  pillar: 2,  glass: 4, accent: 6,  roofShape: 'gable',
                    wallMix: [[3, 70], [2, 20], [10, 10]], foundMix: [[2, 70], [1, 20], [67, 10]] },
    'デフォルト': { wall: 3,  floor: 3,  roof: 2,  pillar: 10, glass: 4, accent: 2,  roofShape: 'gable',
                    wallMix: [[3, 70], [2, 20], [14, 10]], foundMix: [[2, 70], [1, 20], [67, 10]] },
    // オシャレ建築(木組み・中世・コテージ)
    '中世ファンタジー': { wall: 69, floor: 64, roof: 68, pillar: 11, glass: 4, accent: 14,
                          roofShape: 'gable', framing: true, foundation: 2, foundationH: 2, chimney: true, overhang: 1,
                          wallMix: [[69, 80], [70, 20]], foundMix: [[2, 55], [67, 25], [14, 15], [66, 5]] },
    'コテージ':         { wall: 15, floor: 3,  roof: 68, pillar: 10, glass: 4, accent: 2,
                          roofShape: 'gable', framing: true, foundation: 2, foundationH: 1, chimney: true, overhang: 1,
                          wallMix: [[15, 82], [70, 18]], foundMix: [[2, 55], [67, 30], [14, 15]] },
    '山小屋':           { wall: 64, floor: 64, roof: 63, pillar: 63, glass: 4, accent: 67,
                          roofShape: 'aframe', framing: true, foundation: 67, foundationH: 1, chimney: true, overhang: 1,
                          wallMix: [[64, 70], [12, 20], [10, 10]], foundMix: [[67, 50], [2, 35], [66, 15]] }
  };
  function styleOf(name) { return STYLE_PRESETS[name] || STYLE_PRESETS['デフォルト']; }

  // ===== 屋根(ROOFS) =======================================================
  // 各関数: (bp, {x0,z0,x1,z1(=壁の外周), baseY(=壁の1つ上), block, overhang, cap(=妻壁材)})
  // 最下段は必ず baseY(壁の直上)に置くので浮かない。overhang は外側へ張り出す軒。
  // 家側でキャンバスを軒ぶん広げてあるので張り出しが収まる。戻り値=屋根の高さ。

  function eaveLip(bp, o) {
    var oh = o.overhang || 0;
    if (oh <= 0) return;
    for (var x = o.x0 - oh; x <= o.x1 + oh; x++)
      for (var z = o.z0 - oh; z <= o.z1 + oh; z++)
        if (x < o.x0 || x > o.x1 || z < o.z0 || z > o.z1)
          M.setSafe(bp, x, o.baseY, z, o.block);
  }

  // 切妻/A字。pitch=1で45°、pitch=2で急勾配。妻側(端)は cap 材で塞いで立体的に。
  function gableRoof(bp, o, pitch) {
    eaveLip(bp, o);
    var cap = o.cap || o.block, oh = o.overhang || 0;
    var alongX = (o.x1 - o.x0) >= (o.z1 - o.z0); // 棟は長い方の軸に沿わせる
    var lo = alongX ? o.z0 : o.x0, hi = alongX ? o.z1 : o.x1;
    var aLo = (alongX ? o.x0 : o.z0) - oh, aHi = (alongX ? o.x1 : o.z1) + oh;
    var k = 0, top = o.baseY;
    while (lo + k <= hi - k) {
      var s0 = lo + k, s1 = hi - k;
      var yLo = o.baseY + k * pitch, yHi = (s0 === s1) ? o.baseY + k * pitch : o.baseY + (k + 1) * pitch - 1;
      for (var yy = yLo; yy <= yHi; yy++) {
        for (var a = aLo; a <= aHi; a++) {
          if (alongX) { M.setSafe(bp, a, yy, s0, o.block); M.setSafe(bp, a, yy, s1, o.block); }
          else { M.setSafe(bp, s0, yy, a, o.block); M.setSafe(bp, s1, yy, a, o.block); }
        }
        for (var s = s0; s <= s1; s++) { // 妻壁(端の三角)を塞ぐ
          if (alongX) { M.setSafe(bp, o.x0, yy, s, cap); M.setSafe(bp, o.x1, yy, s, cap); }
          else { M.setSafe(bp, s, yy, o.z0, cap); M.setSafe(bp, s, yy, o.z1, cap); }
        }
        top = yy;
      }
      k++;
    }
    return (top - o.baseY) + 1;
  }

  // 寄棟/方形。外周リングを内側に詰めて頂点/棟へ。最下段は baseY。
  function hipRoof(bp, o) {
    eaveLip(bp, o);
    var ax0 = o.x0, ax1 = o.x1, az0 = o.z0, az1 = o.z1, k = 0, top = o.baseY;
    while (ax0 <= ax1 && az0 <= az1) {
      ringFill(bp, o.baseY + k, ax0, az0, ax1, az1, o.block);
      top = o.baseY + k; ax0++; ax1--; az0++; az1--; k++;
    }
    return (top - o.baseY) + 1;
  }

  var ROOFS = {
    none: function () { return 0; },
    flat: function (bp, o) {
      fillRect(bp, o.baseY, o.x0, o.z0, o.x1, o.z1, o.block);
      ringFill(bp, o.baseY + 1, o.x0, o.z0, o.x1, o.z1, o.cap || o.block); // パラペット(立ち上がり)
      return 2;
    },
    gable: function (bp, o) { return gableRoof(bp, o, 1); },
    aframe: function (bp, o) { return gableRoof(bp, o, 2); },
    hip: hipRoof,
    pyramid: function (bp, o) {
      var o2 = { x0: o.x0, z0: o.z0, x1: o.x1, z1: o.z1, baseY: o.baseY, block: o.block, overhang: 0, cap: o.cap };
      return hipRoof(bp, o2);
    },
    japanese: function (bp, o) {
      o.overhang = Math.max(1, o.overhang || 1);
      return hipRoof(bp, o);
    },
    shed: function (bp, o) {
      eaveLip(bp, o);
      var oh = o.overhang || 0, cap = o.cap || o.block, depth = o.z1 - o.z0;
      for (var j = 0; j <= depth; j++) {
        var y = o.baseY + j;
        for (var x = o.x0 - oh; x <= o.x1 + oh; x++) M.setSafe(bp, x, y, o.z0 + j, o.block);
        for (var yy = o.baseY; yy <= y; yy++) { M.setSafe(bp, o.x0, yy, o.z0 + j, cap); M.setSafe(bp, o.x1, yy, o.z0 + j, cap); }
      }
      return depth + 1;
    },
    dome: function (bp, o) {
      var cx = (o.x0 + o.x1) / 2, cz = (o.z0 + o.z1) / 2;
      var r = Math.min(o.x1 - o.x0, o.z1 - o.z0) / 2 + 0.5;
      var h = Math.ceil(r);
      for (var y = 0; y <= h; y++)
        for (var x = o.x0 - 1; x <= o.x1 + 1; x++)
          for (var z = o.z0 - 1; z <= o.z1 + 1; z++) {
            var d = sphereDist(x, o.baseY + y, z, cx, o.baseY, cz);
            if (d >= r - 0.85 && d <= r + 0.15) M.setSafe(bp, x, o.baseY + y, z, o.block);
          }
      return h + 1;
    }
  };
  function roofHeight(shape, X, D) {
    if (shape === 'flat') return 2;
    if (shape === 'none') return 0;
    if (shape === 'shed') return D;
    if (shape === 'dome') return Math.ceil(Math.min(X, D) / 2) + 1;
    if (shape === 'aframe') return Math.floor(Math.min(X, D) / 2) * 2 + 2;
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

  // 家(用途別内装・スタイル・屋根形状・階数・木組み/土台/煙突 対応)
  function house(opts) {
    var Xin = cd(opts.X, 9), Din = cd(opts.D, 7);
    var ver = opts.version || '1.21';
    var st = styleOf(opts.style);
    var floors = Math.max(1, Math.min(8, opts.floors || 1));
    var framing = !!st.framing;
    var floorH = framing ? 5 : 4;
    var roofShape = (opts.roofShape && opts.roofShape !== 'auto') ? opts.roofShape : st.roofShape;
    var wall = resolve(st.wall, ver), floor = resolve(st.floor, ver), glass = resolve(st.glass, ver);
    var roofBlk = resolve(st.roof, ver), timber = resolve(st.pillar, ver), accent = resolve(st.accent, ver);
    var foundBlk = st.foundation ? resolve(st.foundation, ver) : 0;
    var foundH = Math.min(st.foundationH || 0, floorH - 1);
    var oh = st.overhang != null ? st.overhang : roofOverhang(roofShape);
    var seed = opts.seed != null ? opts.seed : 7;
    var wallMix = resolveMix(st.wallMix, ver) || [[wall, 100]];
    var foundMix = resolveMix(st.foundMix, ver) || (foundBlk ? [[foundBlk, 100]] : null);

    // 軒の張り出し + 巾木ぶんキャンバスを広げ、壁を内側にオフセット(凹凸のため)
    var pad = Math.max(oh, foundBlk ? 1 : 0);
    var X = Xin + 2 * pad, D = Din + 2 * pad;
    var bx0 = pad, bz0 = pad, bx1 = pad + Xin - 1, bz1 = pad + Din - 1;

    var baseY = floors * floorH;          // 屋根がのる高さ
    var rH = roofHeight(roofShape, Xin, Din);
    var totalY = baseY + Math.max(1, rH) + (st.chimney ? 2 : 0);
    var bp = M.createBlueprint(X, totalY, D, '家');

    // 各階の床スラブ
    for (var f = 0; f < floors; f++) fillRect(bp, f * floorH, bx0, bz0, bx1, bz1, floor);
    // 壁(質感ミックスで散らす → のっぺり防止)
    for (var y = 1; y < baseY; y++) ringFillMix(bp, y, bx0, bz0, bx1, bz1, wallMix, seed);
    // 石の土台 + 1マス張り出した巾木(凹凸)
    if (foundMix && foundH) {
      for (var yf = 1; yf <= foundH; yf++) ringFillMix(bp, yf, bx0, bz0, bx1, bz1, foundMix, seed + 101);
      if (pad >= 1) ringFillMix(bp, 1, bx0 - 1, bz0 - 1, bx1 + 1, bz1 + 1, foundMix, seed + 101); // 張り出し巾木
    }

    var sillY = foundH > 0 ? foundH + 1 : 1;
    if (framing) applyFraming(bp, bx0, bz0, bx1, bz1, baseY, floors, floorH, timber, sillY);
    else [[bx0, bz0], [bx1, bz0], [bx0, bz1], [bx1, bz1]].forEach(function (c) { pillarY(bp, c[0], c[1], 1, baseY - 1, timber); });

    // 窓(各階の中段、木組み時は枠付き)+ 正面に小さな庇(凹凸)
    if (opts.windows !== false) {
      for (var ff = 0; ff < floors; ff++) {
        var wy = ff * floorH + (ff === 0 && foundH ? foundH + 1 : Math.floor(floorH / 2));
        addWindows(bp, wy, bx0, bz0, bx1, bz1, glass, wall, framing ? timber : 0, roofBlk, pad);
      }
    }
    // ドア(正面 z=bz0 中央、高さ2)+ 木組み時は枠
    var dx = Math.floor((bx0 + bx1) / 2);
    if (framing) {
      pillarY(bp, dx - 1, bz0, sillY, sillY + 2, timber);
      pillarY(bp, dx + 1, bz0, sillY, sillY + 2, timber);
      M.setSafe(bp, dx, sillY + 3, bz0, timber);
    }
    M.setSafe(bp, dx, 1, bz0, 0);
    M.setSafe(bp, dx, 2, bz0, 0);
    // 出窓・バルコニー(木組みスタイルの立体装飾)
    if (framing && opts.details !== false && pad >= 1) {
      var gLo = (foundH ? foundH + 1 : 1) + 1;
      bayWindow(bp, bx0, bz0, bx1, gLo, gLo + 1, glass, timber, roofBlk, dx);
      if (floors >= 2) balcony(bp, bx0, bz0, bx1, floorH, timber, floor);
    }
    // 屋根(妻壁は漆喰材 cap で塞ぐ)
    (ROOFS[roofShape] || ROOFS.gable)(bp, { x0: bx0, z0: bz0, x1: bx1, z1: bz1, baseY: baseY, block: roofBlk, overhang: oh, cap: wall });
    // 煙突
    if (st.chimney) buildChimney(bp, bx0, bz0, bx1, bz1, baseY + rH, accent || foundBlk || resolve(2, ver));
    // 内装(1階)
    placeFurniture(bp, { x0: bx0 + 1, z0: bz0 + 1, x1: bx1 - 1, z1: bz1 - 1, y: 1, doorX: dx }, opts.purpose || 'none', ver);
    bp.name = '家(' + (opts.style || 'デフォルト') + ')';
    return bp;
  }

  // 木組み(ハーフティンバー): 梁(横木)+ スタッド(縦柱)を漆喰壁に重ねる
  function applyFraming(bp, x0, z0, x1, z1, baseY, floors, floorH, timber, sillY) {
    var lines = {};
    lines[sillY] = 1; lines[baseY - 1] = 1;
    for (var f = 1; f < floors; f++) { lines[f * floorH] = 1; lines[f * floorH + 1] = 1; }
    Object.keys(lines).forEach(function (ys) {
      var y = +ys; if (y >= 1 && y < baseY) ringFill(bp, y, x0, z0, x1, z1, timber);
    });
    var sx = studPositions(x0, x1), sz = studPositions(z0, z1);
    for (var y = sillY; y < baseY; y++) {
      sx.forEach(function (x) { M.setSafe(bp, x, y, z0, timber); M.setSafe(bp, x, y, z1, timber); });
      sz.forEach(function (z) { M.setSafe(bp, x0, y, z, timber); M.setSafe(bp, x1, y, z, timber); });
    }
    // 斜めの筋かい(各パネルの下部にV字) — チューダー様式の質感
    var braceTop = Math.min(baseY - 2, sillY + 2);
    for (var i = 0; i < sx.length - 1; i++) {
      braceV(bp, sx[i], sx[i + 1], sillY, braceTop, z0, true, timber);
      braceV(bp, sx[i], sx[i + 1], sillY, braceTop, z1, true, timber);
    }
    for (var j = 0; j < sz.length - 1; j++) {
      braceV(bp, sz[j], sz[j + 1], sillY, braceTop, x0, false, timber);
      braceV(bp, sz[j], sz[j + 1], sillY, braceTop, x1, false, timber);
    }
  }
  // パネル内にV字の筋かいを描く(alongX: 壁が x 方向に伸びる面)
  function braceV(bp, a, b, yLo, yHi, fixed, alongX, t) {
    var w = b - a; if (w < 2) return;
    var h = Math.min(w, yHi - yLo);
    for (var k = 0; k <= h; k++) {
      if (alongX) { M.setSafe(bp, a + k, yLo + k, fixed, t); M.setSafe(bp, b - k, yLo + k, fixed, t); }
      else { M.setSafe(bp, fixed, yLo + k, a + k, t); M.setSafe(bp, fixed, yLo + k, b - k, t); }
    }
  }
  function studPositions(a0, a1) {
    var a = []; for (var i = a0; i <= a1; i += 3) a.push(i);
    if (a[a.length - 1] !== a1) a.push(a1);
    return a;
  }

  // 出窓(正面 z0 に1マス張り出すガラスの箱 + 小庇 + 持ち送り)
  function bayWindow(bp, bx0, bz0, bx1, yLo, yHi, glass, frame, roofB, doorX) {
    var cx = doorX - 3; if (cx - 1 < bx0 + 1) cx = doorX + 3;
    if (cx - 1 < bx0 + 1 || cx + 1 > bx1 - 1) return;
    var z = bz0 - 1;
    for (var y = yLo; y <= yHi; y++)
      for (var x = cx - 1; x <= cx + 1; x++)
        M.setSafe(bp, x, y, z, x === cx ? glass : frame);
    M.setSafe(bp, cx, yLo, z, glass);
    for (var x2 = cx - 1; x2 <= cx + 1; x2++) {
      M.setSafe(bp, x2, yLo - 1, z, frame);   // 持ち送り(下の支え)
      M.setSafe(bp, x2, yHi + 1, z, roofB);   // 小庇
    }
  }

  // バルコニー(2階以上・正面に張り出す床 + 手すり)
  function balcony(bp, bx0, bz0, bx1, floorY, timber, plank) {
    var z = bz0 - 1;
    for (var x = bx0 + 1; x <= bx1 - 1; x++) {
      M.setSafe(bp, x, floorY, z, plank);          // 張り出し床
      M.setSafe(bp, x, floorY + 1, z, timber);     // 手すり
      M.setSafe(bp, x, floorY - 1, z, timber);     // 下の支え
    }
  }

  // 煙突(石)を屋根から突き出す
  function buildChimney(bp, x0, z0, x1, z1, topY, blk) {
    var cx = Math.max(x0, Math.min(x1, Math.round(x0 + (x1 - x0) * 0.72)));
    var cz = Math.max(z0, Math.min(z1, Math.round(z0 + (z1 - z0) * 0.28)));
    pillarY(bp, cx, cz, 1, topY + 1, blk);
  }

  function addWindows(bp, wy, x0, z0, x1, z1, glass, wall, frame, awning, pad) {
    function isWall(id) { return id !== 0 && id !== frame && id !== glass; }
    function put(x, z, front) {
      if (!isWall(M.get(bp, x, wy, z))) return; // 壁面のみ
      M.setSafe(bp, x, wy, z, glass);
      if (frame) {
        if (isWall(M.get(bp, x, wy + 1, z))) M.setSafe(bp, x, wy + 1, z, frame);
        if (isWall(M.get(bp, x, wy - 1, z))) M.setSafe(bp, x, wy - 1, z, frame);
      }
      // 正面窓の下に張り出す庇(凹凸)
      if (front && pad >= 1 && awning) M.setSafe(bp, x, wy - 1, z - 1, awning);
    }
    var x, z;
    for (x = x0 + 2; x < x1; x += 2) { put(x, z0, true); put(x, z1, false); }
    for (z = z0 + 2; z < z1; z += 2) { put(x0, z, false); put(x1, z, false); }
  }
  function roofOverhang(shape) {
    if (shape === 'flat' || shape === 'none') return 0;
    return 1;
  }

  // ビル(多階・平屋根)
  function building(opts) {
    var o = {
      X: opts.X, D: opts.D, floors: Math.max(2, opts.floors || 4),
      style: opts.style || 'モダン', roofShape: opts.roofShape || 'flat',
      windows: true, purpose: 'none', version: opts.version, seed: opts.seed
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
      windows: true, purpose: opts.purpose || 'kyoten', version: opts.version, seed: opts.seed
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

  // 風車小屋
  function windmill(opts) {
    var bodyW = cd(opts.W, 7), Hh = cd(opts.H, 16);
    var ver = opts.version || '1.21';
    var wallB = resolve(64, ver), post = resolve(11, ver), stone = resolve(2, ver);
    var roofB = resolve(68, ver), bladeB = resolve(11, ver), sailB = resolve(15, ver), glass = resolve(4, ver);
    var bladeLen = Math.min(7, Math.max(4, Math.floor(Hh / 2)));
    var margin = bladeLen;
    var sizeX = bodyW + margin * 2, sizeZ = bodyW;
    var roofH = Math.ceil(bodyW / 2) + 1;
    var totalY = Hh + roofH + bladeLen + 1;
    var bp = M.createBlueprint(sizeX, totalY, sizeZ, '風車');
    var bx0 = margin, bx1 = margin + bodyW - 1, bz0 = 0, bz1 = bodyW - 1;
    // 床 + 本体(石2段 + トウヒ板材)
    fillRect(bp, 0, bx0, bz0, bx1, bz1, stone);
    for (var y = 1; y < Hh; y++) ringFill(bp, y, bx0, bz0, bx1, bz1, y <= 2 ? stone : wallB);
    // 角柱(ダークオーク)
    [[bx0, bz0], [bx1, bz0], [bx0, bz1], [bx1, bz1]].forEach(function (c) { pillarY(bp, c[0], c[1], 1, Hh - 1, post); });
    // ドア + 窓
    var dx = Math.floor((bx0 + bx1) / 2);
    M.setSafe(bp, dx, 1, bz0, 0); M.setSafe(bp, dx, 2, bz0, 0);
    for (var wy = 4; wy < Hh - 1; wy += 4) { M.setSafe(bp, dx, wy, bz0, glass); M.setSafe(bp, dx, wy, bz1, glass); }
    // 屋根
    ROOFS.hip(bp, { x0: bx0, z0: bz0, x1: bx1, z1: bz1, baseY: Hh, block: roofB, overhang: 1 });
    // 羽根(前面 z=bz0 に X字)
    var hubY = Hh - 2, hubX = dx;
    M.setSafe(bp, hubX, hubY, bz0, post);
    [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(function (d) {
      for (var i = 1; i <= bladeLen; i++) {
        M.setSafe(bp, hubX + d[0] * i, hubY + d[1] * i, bz0, bladeB);
        if (i >= 2) M.setSafe(bp, hubX + d[0] * i - d[1], hubY + d[1] * i + d[0], bz0, sailB);
      }
    });
    return bp;
  }

  // 教会(身廊 + 鐘楼 + 尖塔)
  function church(opts) {
    var W = cd(opts.W, 11), L = cd(opts.L, 17), H = cd(opts.H, 8);
    var ver = opts.version || '1.21';
    var stone = resolve(14, ver), floor = resolve(2, ver), roof = resolve(38, ver), glass = resolve(4, ver), gold = resolve(27, ver);
    var towerW = 5, towerH = H + 8, pad = 1;
    var X = W + 2 * pad, D = L + towerW + 2 * pad;
    var totalY = towerH + Math.ceil(towerW / 2) + 3;
    var bp = M.createBlueprint(X, totalY, D, '教会');
    var hx0 = pad, hx1 = pad + W - 1;
    var hz0 = pad + towerW, hz1 = pad + towerW + L - 1;
    // 身廊
    fillRect(bp, 0, hx0, hz0, hx1, hz1, floor);
    for (var y = 1; y < H; y++) ringFill(bp, y, hx0, hz0, hx1, hz1, stone);
    for (var z = hz0 + 2; z < hz1; z += 3) { // アーチ窓
      for (var yy = 2; yy <= 4; yy++) { M.setSafe(bp, hx0, yy, z, glass); M.setSafe(bp, hx1, yy, z, glass); }
      M.setSafe(bp, hx0, 5, z, glass); M.setSafe(bp, hx1, 5, z, glass);
    }
    ROOFS.gable(bp, { x0: hx0, z0: hz0, x1: hx1, z1: hz1, baseY: H, block: roof, overhang: 1, cap: stone });
    // 鐘楼(前方)
    var tx0 = pad + Math.floor((W - towerW) / 2), tx1 = tx0 + towerW - 1, tz0 = pad, tz1 = pad + towerW - 1;
    var tcx = Math.floor((tx0 + tx1) / 2), tcz = Math.floor((tz0 + tz1) / 2);
    fillRect(bp, 0, tx0, tz0, tx1, tz1, floor);
    for (var ty = 1; ty < towerH; ty++) ringFill(bp, ty, tx0, tz0, tx1, tz1, stone);
    for (var by = towerH - 3; by < towerH - 1; by++) { // 鐘楼の開口
      M.setSafe(bp, tcx, by, tz0, 0); M.setSafe(bp, tcx, by, tz1, 0);
      M.setSafe(bp, tx0, by, tcz, 0); M.setSafe(bp, tx1, by, tcz, 0);
    }
    ROOFS.pyramid(bp, { x0: tx0, z0: tz0, x1: tx1, z1: tz1, baseY: towerH, block: roof, overhang: 0, cap: roof });
    M.setSafe(bp, tcx, towerH + Math.ceil(towerW / 2) + 1, tcz, gold); // 頂華
    M.setSafe(bp, tcx, 1, tz0, 0); M.setSafe(bp, tcx, 2, tz0, 0); M.setSafe(bp, tcx, 3, tz0, 0); // 大扉
    return bp;
  }

  // 宿屋(2階建て木組み + 吊り看板)
  function inn(opts) {
    var ver = opts.version || '1.21';
    var bp = house({ X: opts.X || 13, D: opts.D || 9, floors: 2, style: '中世ファンタジー',
      roofShape: 'gable', windows: true, purpose: opts.purpose || 'none', details: true, version: ver, seed: opts.seed });
    var wood = resolve(11, ver), sign = resolve(3, ver);
    var y = 8;
    M.setSafe(bp, 2, y, 0, wood); M.setSafe(bp, 2, y + 1, 1, wood);
    M.setSafe(bp, 2, y - 1, 0, sign); M.setSafe(bp, 2, y - 2, 0, sign);
    bp.name = '宿屋';
    return bp;
  }

  // 市場の露店(4本柱 + カウンター + 縞のオーニング)
  function stall(opts) {
    var W = cd(opts.W, 5), Dp = cd(opts.D, 4);
    var ver = opts.version || '1.21';
    var post = resolve(10, ver), counter = resolve(3, ver), a1 = resolve(17, ver), a2 = resolve(15, ver), barrel = resolve(52, ver);
    var bp = M.createBlueprint(W, 4 + Math.ceil(Dp / 2) + 1, Dp, '露店');
    fillRect(bp, 0, 0, 0, W - 1, Dp - 1, resolve(2, ver));
    [[0, 0], [W - 1, 0], [0, Dp - 1], [W - 1, Dp - 1]].forEach(function (c) { pillarY(bp, c[0], c[1], 1, 3, post); });
    for (var x = 1; x < W - 1; x++) M.setSafe(bp, x, 1, 0, counter); // カウンター
    for (var j = 0; j < Dp; j++) { // 縞のオーニング(片流れ)
      var yy = 4 + Math.floor(j / 2);
      for (var xx = 0; xx < W; xx++) M.setSafe(bp, xx, yy, j, (xx % 2 === 0) ? a1 : a2);
    }
    if (barrel) M.setSafe(bp, 1, 1, Dp - 1, barrel);
    return bp;
  }

  // 鐘楼(開いた鐘楼 + 鐘 + 尖り屋根)
  function belltower(opts) {
    var W = cd(opts.W, 5), H = cd(opts.H, 18);
    var ver = opts.version || '1.21';
    var stone = resolve(14, ver), roof = resolve(38, ver), bell = resolve(27, ver), wood = resolve(10, ver);
    var bp = M.createBlueprint(W, H + Math.ceil(W / 2) + 2, W, '鐘楼');
    var cxm = Math.floor((W - 1) / 2);
    fillRect(bp, 0, 0, 0, W - 1, W - 1, resolve(2, ver));
    for (var y = 1; y < H - 3; y++) ringFill(bp, y, 0, 0, W - 1, W - 1, stone);
    for (var by = H - 3; by < H; by++) // 開いた鐘楼(四隅の柱のみ)
      [[0, 0], [W - 1, 0], [0, W - 1], [W - 1, W - 1]].forEach(function (c) { M.setSafe(bp, c[0], by, c[1], wood); });
    M.setSafe(bp, cxm, H - 1, cxm, wood);  // 梁
    M.setSafe(bp, cxm, H - 2, cxm, bell);  // 鐘
    ROOFS.pyramid(bp, { x0: 0, z0: 0, x1: W - 1, z1: W - 1, baseY: H, block: roof, overhang: 0, cap: roof });
    M.setSafe(bp, cxm, 1, 0, 0); M.setSafe(bp, cxm, 2, 0, 0); // ドア
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
  var STYLE_FIELD = { key: 'style', label: 'スタイル', type: 'style', def: '中世ファンタジー' };
  var ROOF_FIELD = { key: 'roofShape', label: '屋根の形', type: 'roof', def: 'auto' };
  var PURPOSE_FIELD = { key: 'purpose', label: '用途(内装)', type: 'purpose', def: 'none' };

  var TYPES = [
    { key: 'house', label: '家', group: '住居・建物', gen: house,
      fields: [
        { key: 'X', label: '幅X', type: 'int', def: 9, min: 5, max: 32 },
        { key: 'D', label: '奥行Z', type: 'int', def: 7, min: 5, max: 32 },
        { key: 'floors', label: '階数', type: 'int', def: 1, min: 1, max: 6 },
        STYLE_FIELD, ROOF_FIELD, PURPOSE_FIELD,
        { key: 'windows', label: '窓をつける', type: 'bool', def: true },
        { key: 'details', label: '装飾(出窓/筋かい/バルコニー)', type: 'bool', def: true }
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
    { key: 'church', label: '教会', group: '住居・建物', gen: church,
      fields: [
        { key: 'W', label: '身廊の幅', type: 'int', def: 11, min: 7, max: 21 },
        { key: 'L', label: '身廊の長さ', type: 'int', def: 17, min: 9, max: 40 },
        { key: 'H', label: '壁の高さ', type: 'int', def: 8, min: 5, max: 16 }
      ] },
    { key: 'inn', label: '宿屋', group: '住居・建物', gen: inn,
      fields: [
        { key: 'X', label: '幅X', type: 'int', def: 13, min: 9, max: 24 },
        { key: 'D', label: '奥行Z', type: 'int', def: 9, min: 7, max: 20 },
        PURPOSE_FIELD
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
    { key: 'windmill', label: '風車', group: '構造物', gen: windmill,
      fields: [
        { key: 'W', label: '本体の幅', type: 'int', def: 7, min: 5, max: 15 },
        { key: 'H', label: '高さ', type: 'int', def: 16, min: 8, max: 40 }
      ] },
    { key: 'belltower', label: '鐘楼', group: '構造物', gen: belltower,
      fields: [
        { key: 'W', label: '幅', type: 'int', def: 5, min: 3, max: 11 },
        { key: 'H', label: '高さ', type: 'int', def: 18, min: 8, max: 40 }
      ] },
    { key: 'stall', label: '市場の露店', group: '構造物', gen: stall,
      fields: [
        { key: 'W', label: '幅', type: 'int', def: 5, min: 3, max: 12 },
        { key: 'D', label: '奥行', type: 'int', def: 4, min: 3, max: 10 }
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
      { v: '中世ファンタジー', l: '中世ファンタジー(木組み)' }, { v: 'コテージ', l: 'コテージ' },
      { v: '山小屋', l: '山小屋(A字)' },
      { v: '和風', l: '和風' }, { v: 'モダン', l: 'モダン' }, { v: '西洋', l: '西洋' },
      { v: 'サバイバル', l: 'サバイバル素材' }, { v: 'デフォルト', l: 'デフォルト' }
    ],
    PURPOSE_OPTIONS: PURPOSE_OPTIONS,
    // 純ロジックのテスト用に公開
    _fillRect: fillRect, _ringFill: ringFill, _placeFurniture: placeFurniture, _perimeterCells: perimeterCells
  };
})();
