/* blocks.js - ブロック定義表 / バージョン管理 / フォールバック
 * MCBP.BLOCKS   : ブロック定義(id, name, color, alpha?, group, func?, since)
 * MCBP.VERSIONS : 対応バージョン一覧(ランク付き)
 * MCBP.blocks   : ヘルパ(byId, isAvailable, resolveBlock, verGE, palette ...)
 * 依存なし
 */
(function () {
  'use strict';
  window.MCBP = window.MCBP || {};

  // ---- 対応バージョン(ランクが大きいほど新しい) -------------------------
  var VERSIONS = [
    { id: '1.7',  label: '1.7 以前',  rank: 0 },
    { id: '1.12', label: '1.12',      rank: 1 },
    { id: '1.13', label: '1.13',      rank: 2 },
    { id: '1.14', label: '1.14',      rank: 3 },
    { id: '1.16', label: '1.16',      rank: 4 },
    { id: '1.17', label: '1.17',      rank: 5 },
    { id: '1.18', label: '1.18',      rank: 6 },
    { id: '1.19', label: '1.19',      rank: 7 },
    { id: '1.20', label: '1.20',      rank: 8 },
    { id: '1.21', label: '1.21 (最新)', rank: 9 }
  ];
  var RANK = {};
  VERSIONS.forEach(function (v) { RANK[v.id] = v.rank; });
  function rankOf(verId) { return RANK[verId] != null ? RANK[verId] : 9; }

  // ---- ブロック定義表 -----------------------------------------------------
  // group: '建材' | '機能'   func:true = 機能ブロック(内装で配置)
  // since: 登場バージョンid(省略時は全バージョンで利用可)
  // alpha: 半透明(3Dで globalAlpha、遮蔽カリングしない)
  var B = [
    { id: 0,  name: '空気',              color: '#000000', alpha: 0, group: '建材' },

    // --- 建材(classic) ---
    { id: 1,  name: '石',                color: '#7f7f7f', group: '建材' },
    { id: 2,  name: '丸石',              color: '#828282', group: '建材' },
    { id: 3,  name: 'オークの板材',      color: '#b8945f', group: '建材' },
    { id: 4,  name: 'ガラス',            color: '#bfe3ec', alpha: 0.4, group: '建材' },
    { id: 5,  name: 'レンガ',            color: '#96402e', group: '建材' },
    { id: 6,  name: '土',                color: '#866043', group: '建材' },
    { id: 7,  name: '草ブロック',        color: '#6a9a3d', group: '建材' },
    { id: 8,  name: '砂',                color: '#dbd3a0', group: '建材' },
    { id: 9,  name: '砂岩',              color: '#d9d0a1', group: '建材' },
    { id: 10, name: 'オークの原木',      color: '#6d5533', group: '建材' },
    { id: 11, name: 'ダークオークの原木', color: '#3e2e17', group: '建材' },
    { id: 12, name: 'ダークオークの板材', color: '#4b3721', group: '建材' },
    { id: 13, name: '樫の葉',            color: '#3f6d28', group: '建材' },
    { id: 14, name: '石レンガ',          color: '#7d7d7d', group: '建材' },
    { id: 15, name: '白色の羊毛',        color: '#e9ecec', group: '建材' },
    { id: 16, name: '橙色の羊毛',        color: '#f07613', group: '建材' },
    { id: 17, name: '赤色の羊毛',        color: '#a02722', group: '建材' },
    { id: 18, name: '黄色の羊毛',        color: '#f8c527', group: '建材' },
    { id: 19, name: '黄緑色の羊毛',      color: '#5ea918', group: '建材' },
    { id: 20, name: '緑色の羊毛',        color: '#546d1b', group: '建材' },
    { id: 21, name: '水色の羊毛',        color: '#3aafd9', group: '建材' },
    { id: 22, name: '青色の羊毛',        color: '#3c44a9', group: '建材' },
    { id: 23, name: '紫色の羊毛',        color: '#7e34bf', group: '建材' },
    { id: 24, name: '桃色の羊毛',        color: '#ed8dac', group: '建材' },
    { id: 25, name: '灰色の羊毛',        color: '#474f52', group: '建材' },
    { id: 26, name: '黒色の羊毛',        color: '#1d1d21', group: '建材' },
    { id: 27, name: '金ブロック',        color: '#f8d33a', group: '建材' },
    { id: 28, name: '鉄ブロック',        color: '#d8d8d8', group: '建材' },
    { id: 29, name: 'ダイヤモンドブロック', color: '#64e0d6', group: '建材' },
    { id: 30, name: '黒曜石',            color: '#14121f', group: '建材' },
    { id: 31, name: '水',                color: '#3f5fdd', alpha: 0.5, group: '建材' },
    { id: 32, name: 'クォーツブロック',  color: '#e6e0d8', group: '建材' },

    // --- 建材(バージョン依存) ---
    { id: 33, name: '磨かれた石',        color: '#9a9a9a', group: '建材', since: '1.14' },
    { id: 34, name: '白色のコンクリート', color: '#cfd5d6', group: '建材', since: '1.12' },
    { id: 35, name: '灰色のコンクリート', color: '#373a3e', group: '建材', since: '1.12' },
    { id: 36, name: '黒色のコンクリート', color: '#08090d', group: '建材', since: '1.12' },
    { id: 37, name: '水色のコンクリート', color: '#2489c7', group: '建材', since: '1.12' },
    { id: 38, name: '深層岩',            color: '#4f4f52', group: '建材', since: '1.17' },
    { id: 39, name: '磨かれた深層岩',    color: '#45454a', group: '建材', since: '1.17' },
    { id: 40, name: '銅ブロック',        color: '#c06d4f', group: '建材', since: '1.17' },

    // --- 機能・装飾(classic〜1.4) ---
    { id: 41, name: 'チェスト',          color: '#9a7132', group: '機能', func: true },
    { id: 42, name: '作業台',            color: '#7a5a34', group: '機能', func: true },
    { id: 43, name: 'かまど',            color: '#6b6b6b', group: '機能', func: true },
    { id: 44, name: 'エンチャントテーブル', color: '#46344f', group: '機能', func: true },
    { id: 45, name: '本棚',              color: '#9c7a44', group: '機能', func: true },
    { id: 46, name: '金床',              color: '#4b4b4f', group: '機能', func: true },
    { id: 47, name: '額縁',              color: '#b08a55', group: '機能', func: true },
    { id: 48, name: '醸造台',            color: '#8a7f6b', group: '機能', func: true },
    { id: 49, name: '大釜',              color: '#4a4a4d', group: '機能', func: true },
    { id: 50, name: 'ベッド',            color: '#c1352b', group: '機能', func: true },
    { id: 51, name: 'たいまつ',          color: '#f7d05a', group: '機能', func: true },

    // --- 機能・装飾(1.14〜) ---
    { id: 52, name: '樽',                color: '#7a5b32', group: '機能', func: true, since: '1.14' },
    { id: 53, name: '溶鉱炉',            color: '#57606b', group: '機能', func: true, since: '1.14' },
    { id: 54, name: '燻製器',            color: '#55463a', group: '機能', func: true, since: '1.14' },
    { id: 55, name: '書見台',            color: '#a07d40', group: '機能', func: true, since: '1.14' },
    { id: 56, name: '石切台',            color: '#7f7f83', group: '機能', func: true, since: '1.14' },
    { id: 57, name: '砥石',              color: '#8a8f94', group: '機能', func: true, since: '1.14' },
    { id: 58, name: '織機',              color: '#b08a5a', group: '機能', func: true, since: '1.14' },
    { id: 59, name: '製図台',            color: '#cbb98f', group: '機能', func: true, since: '1.14' },
    { id: 60, name: '鍛冶台',            color: '#4a4038', group: '機能', func: true, since: '1.14' },
    { id: 61, name: 'コンポスター',      color: '#6b4f2a', group: '機能', func: true, since: '1.14' },
    { id: 62, name: 'ランタン',          color: '#f4a63a', group: '機能', func: true, since: '1.14' },

    // --- オシャレ建築向け建材(木組み・中世・コテージ) ---
    { id: 63, name: 'トウヒの原木',      color: '#4a3a23', group: '建材' },
    { id: 64, name: 'トウヒの板材',      color: '#735a37', group: '建材' },
    { id: 65, name: '樺の板材',          color: '#c8b77a', group: '建材' },
    { id: 66, name: '安山岩',            color: '#8a8a8d', group: '建材', since: '1.13' },
    { id: 67, name: '苔むした丸石',      color: '#6f7a5a', group: '建材' },
    { id: 68, name: '橙色のテラコッタ',  color: '#a75129', group: '建材', since: '1.12' },
    { id: 69, name: '白色のテラコッタ',  color: '#d1b2a1', group: '建材', since: '1.12' },
    { id: 70, name: '薄灰色のテラコッタ', color: '#876b62', group: '建材', since: '1.12' }
  ];

  // id -> 定義
  var BY_ID = {};
  B.forEach(function (b) { BY_ID[b.id] = b; });

  // ---- フォールバック連鎖(使えないブロック -> 代替id、0=省略) ----------
  var FALLBACK = {
    33: 1,   // 磨かれた石 -> 石
    34: 15,  // 白コンクリート -> 白羊毛
    35: 25,  // 灰コンクリート -> 灰羊毛
    36: 26,  // 黒コンクリート -> 黒羊毛
    37: 21,  // 水色コンクリート -> 水色羊毛
    38: 1,   // 深層岩 -> 石
    39: 14,  // 磨かれた深層岩 -> 石レンガ
    40: 5,   // 銅ブロック -> レンガ
    52: 41,  // 樽 -> チェスト
    53: 43,  // 溶鉱炉 -> かまど
    54: 43,  // 燻製器 -> かまど
    55: 45,  // 書見台 -> 本棚
    56: 0,   // 石切台 -> 省略
    57: 0,   // 砥石 -> 省略
    58: 0,   // 織機 -> 省略
    59: 42,  // 製図台 -> 作業台
    60: 42,  // 鍛冶台 -> 作業台
    61: 0,   // コンポスター -> 省略
    62: 51,  // ランタン -> たいまつ
    66: 1,   // 安山岩 -> 石
    68: 5,   // 橙色テラコッタ -> レンガ
    69: 15,  // 白色テラコッタ -> 白羊毛
    70: 25   // 薄灰色テラコッタ -> 灰羊毛
  };

  // ---- ヘルパ -------------------------------------------------------------
  function byId(id) { return BY_ID[id] || null; }

  function verGE(a, b) { return rankOf(a) >= rankOf(b); }

  // ブロックがそのバージョンで使えるか
  function isAvailable(id, verId) {
    var b = byId(id);
    if (!b) return false;
    if (b.since == null) return true;
    return rankOf(verId) >= rankOf(b.since);
  }

  // 指定ブロックが使えなければ代替をたどる。全滅時は 0(=省略/空気)
  function resolveBlock(id, verId) {
    var cur = id, guard = 0;
    while (cur && guard++ < 30) {
      if (isAvailable(cur, verId)) return cur;
      cur = (FALLBACK[cur] != null) ? FALLBACK[cur] : 0;
    }
    return cur; // 0
  }

  // 指定バージョンで使えるブロック一覧(パレット用)。任意で group で絞る
  function palette(verId, group) {
    return B.filter(function (b) {
      if (b.id === 0) return false;
      if (group && b.group !== group) return false;
      return isAvailable(b.id, verId);
    });
  }

  function isOpaque(id) {
    var b = byId(id);
    return !!(b && id !== 0 && b.alpha == null);
  }

  MCBP.BLOCKS = B;
  MCBP.VERSIONS = VERSIONS;
  MCBP.FALLBACK = FALLBACK;
  MCBP.blocks = {
    byId: byId,
    name: function (id) { var b = byId(id); return b ? b.name : '?'; },
    color: function (id) { var b = byId(id); return b ? b.color : '#000'; },
    alpha: function (id) { var b = byId(id); return b && b.alpha != null ? b.alpha : 1; },
    isOpaque: isOpaque,
    isAvailable: isAvailable,
    resolveBlock: resolveBlock,
    palette: palette,
    verGE: verGE,
    rankOf: rankOf
  };
})();
