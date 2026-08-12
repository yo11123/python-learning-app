/* app.js - アプリ状態 + UI配線
 * 依存: blocks, model, templates, iso, editor, materials, storage
 */
(function () {
  'use strict';
  var T = MCBP.templates, ST = MCBP.storage, ED = MCBP.editor, ISO = MCBP.iso,
      MAT = MCBP.materials, MODEL = MCBP.model, BLK = MCBP.blocks;

  var state = {
    bp: null, curY: 0, tool: 'pencil', selectedBlock: 3,
    rot: 0, zoom: 1, pan: { x: 0, y: 0 }, onion: true, version: '1.21'
  };
  var el = {};
  var fieldVals = {};
  var manualEdited = false;
  var rafPending = false, matTimer = null, saveTimer = null;

  function $(id) { return document.getElementById(id); }
  function getState() { return state; }

  function init() {
    ['bpName', 'verSel', 'typeSel', 'typeFields', 'genNote', 'palette', 'selBlockName',
     'editorCanvas', 'isoCanvas', 'layerSlider', 'layerLabel', 'onionChk',
     'dimX', 'dimY', 'dimZ', 'matPanel', 'rotLabel', 'fileInput'].forEach(function (id) { el[id] = $(id); });

    buildVersionSelect();
    buildTypeSelect();
    renderTypeFields(el.typeSel.value);
    buildPalette();
    ED.init(el.editorCanvas, getState, onEdit);
    wire();

    var auto = ST.loadAuto();
    if (auto && window.confirm('前回の設計図が見つかりました。復元しますか?')) {
      setBlueprint(auto, true);
    } else {
      generate(false); // 既定の家を生成
    }
    window.addEventListener('resize', function () { ED.render(); render3D(); });
  }

  // ---- UI 構築 ----
  function buildVersionSelect() {
    el.verSel.innerHTML = '';
    MCBP.VERSIONS.slice().reverse().forEach(function (v) {
      var o = document.createElement('option'); o.value = v.id; o.textContent = v.label;
      el.verSel.appendChild(o);
    });
    el.verSel.value = state.version;
  }

  function buildTypeSelect() {
    el.typeSel.innerHTML = '';
    var groups = {};
    T.TYPES.forEach(function (t) { (groups[t.group] = groups[t.group] || []).push(t); });
    Object.keys(groups).forEach(function (g) {
      var og = document.createElement('optgroup'); og.label = g;
      groups[g].forEach(function (t) {
        var o = document.createElement('option'); o.value = t.key; o.textContent = t.label; og.appendChild(o);
      });
      el.typeSel.appendChild(og);
    });
    el.typeSel.value = 'house';
  }

  function renderTypeFields(typeKey) {
    var t = T.byKey(typeKey);
    el.typeFields.innerHTML = '';
    fieldVals = {};
    if (!t) return;
    t.fields.forEach(function (f) {
      fieldVals[f.key] = f.def;
      var row = document.createElement('div'); row.className = 'field';
      var lab = document.createElement('label'); lab.textContent = f.label; row.appendChild(lab);
      var input;
      if (f.type === 'int') {
        input = document.createElement('input'); input.type = 'number';
        input.value = f.def; input.min = f.min; input.max = f.max;
      } else if (f.type === 'bool') {
        input = document.createElement('input'); input.type = 'checkbox'; input.checked = !!f.def;
        lab.classList.add('inline');
      } else {
        input = document.createElement('select');
        var opts = f.type === 'style' ? T.STYLE_OPTIONS
          : f.type === 'roof' ? T.ROOF_OPTIONS
          : f.type === 'purpose' ? T.PURPOSE_OPTIONS
          : blockOptions();
        opts.forEach(function (op) {
          var o = document.createElement('option');
          o.value = (op.v != null ? op.v : op.id); o.textContent = op.l != null ? op.l : op.name;
          input.appendChild(o);
        });
        input.value = f.def;
      }
      input.addEventListener('change', function () {
        fieldVals[f.key] = (f.type === 'bool') ? input.checked
          : (f.type === 'int') ? (+input.value)
          : (f.type === 'block') ? (+input.value) : input.value;
      });
      row.appendChild(input);
      el.typeFields.appendChild(row);
    });
  }

  function blockOptions() {
    return BLK.palette(state.version, '建材').map(function (b) { return { v: b.id, l: b.name }; });
  }

  function buildPalette() {
    var groups = [['建材', '建材ブロック'], ['機能', '機能・装飾ブロック']];
    var html = '';
    groups.forEach(function (g) {
      var list = BLK.palette(state.version, g[0]);
      if (!list.length) return;
      html += '<div class="pal-grp">' + g[1] + '</div><div class="pal-row">';
      list.forEach(function (b) {
        html += '<button class="sw-btn' + (b.id === state.selectedBlock ? ' on' : '') + '" data-id="' + b.id +
          '" title="' + b.name + '" style="background:' + b.color + '"></button>';
      });
      html += '</div>';
    });
    el.palette.innerHTML = html;
    updateSelName();
  }

  function updateSelName() {
    el.selBlockName.textContent = '選択中: ' + BLK.name(state.selectedBlock);
  }

  // ---- イベント配線 ----
  function wire() {
    el.verSel.addEventListener('change', function () {
      state.version = el.verSel.value;
      buildPalette();
      renderTypeFields(el.typeSel.value); // block選択肢を更新
    });
    el.typeSel.addEventListener('change', function () { renderTypeFields(el.typeSel.value); });
    $('btnGen').addEventListener('click', function () { generate(true); });

    // ツール
    document.querySelectorAll('#tools [data-tool]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.tool = btn.getAttribute('data-tool');
        document.querySelectorAll('#tools [data-tool]').forEach(function (b) { b.classList.toggle('on', b === btn); });
      });
    });

    // パレット(委譲)
    el.palette.addEventListener('click', function (e) {
      var b = e.target.closest('.sw-btn'); if (!b) return;
      state.selectedBlock = +b.getAttribute('data-id');
      el.palette.querySelectorAll('.sw-btn').forEach(function (x) { x.classList.toggle('on', x === b); });
      updateSelName();
    });

    // ヘッダ
    el.bpName.addEventListener('input', function () { if (state.bp) { state.bp.name = el.bpName.value; scheduleSave(); } });
    $('btnNew').addEventListener('click', function () {
      if (MODEL.totalSolid(state.bp) > 0 && !window.confirm('新規作成します。現在の設計図を消してよいですか?')) return;
      setBlueprint(MODEL.createBlueprint(+el.dimX.value || 9, +el.dimY.value || 6, +el.dimZ.value || 7, '無題の設計図'), true);
    });
    $('btnSaveJSON').addEventListener('click', function () { if (state.bp) ST.downloadJSON(state.bp); });
    $('btnLoad').addEventListener('click', function () { el.fileInput.click(); });
    el.fileInput.addEventListener('change', function () {
      var f = el.fileInput.files[0]; if (!f) return;
      ST.loadFromFile(f, function (bp) { setBlueprint(bp, true); }, function (err) { alert('読み込み失敗: ' + err.message); });
      el.fileInput.value = '';
    });
    $('btnPNG3D').addEventListener('click', function () { if (state.bp) ST.exportPNG(state.bp, { rot: state.rot }); });
    $('btnPNGLayers').addEventListener('click', function () { if (state.bp) ST.exportLayersPNG(state.bp); });
    $('btnText').addEventListener('click', function () { if (state.bp) ST.exportText(state.bp); });

    // レイヤー
    el.layerSlider.addEventListener('input', function () { state.curY = +el.layerSlider.value; updateLayerUI(); ED.render(); });
    $('layerUp').addEventListener('click', function () { setLayer(state.curY + 1); });
    $('layerDown').addEventListener('click', function () { setLayer(state.curY - 1); });
    el.onionChk.addEventListener('change', function () { state.onion = el.onionChk.checked; ED.render(); });
    $('btnResize').addEventListener('click', doResize);

    // 3D
    $('btnRot').addEventListener('click', function () { state.rot = (state.rot + 1) & 3; fit3D(); render3D(); });
    $('btnZoomIn').addEventListener('click', function () { state.zoom = Math.min(6, state.zoom * 1.25); render3D(); });
    $('btnZoomOut').addEventListener('click', function () { state.zoom = Math.max(0.15, state.zoom / 1.25); render3D(); });
    $('btnFit').addEventListener('click', function () { fit3D(); render3D(); });
    enableIsoPan();
  }

  function enableIsoPan() {
    var dragging = false, lx = 0, ly = 0;
    el.isoCanvas.addEventListener('mousedown', function (e) { dragging = true; lx = e.clientX; ly = e.clientY; });
    window.addEventListener('mouseup', function () { dragging = false; });
    window.addEventListener('mousemove', function (e) {
      if (!dragging) return;
      state.pan.x += (e.clientX - lx); state.pan.y += (e.clientY - ly); lx = e.clientX; ly = e.clientY;
      render3D();
    });
  }

  // ---- 動作 ----
  function generate(confirmOverwrite) {
    // 手動で編集した内容がある場合のみ確認(生成を繰り返すときは邪魔しない)
    if (confirmOverwrite && manualEdited && MODEL.totalSolid(state.bp) > 0 &&
        !window.confirm('手動で編集した内容があります。生成して置き換えますか?')) return;
    var opts = {};
    for (var k in fieldVals) opts[k] = fieldVals[k];
    opts.version = state.version;
    var bp = T.gen(el.typeSel.value, opts);
    if (!bp) return;
    setBlueprint(bp, true);
    el.genNote.textContent = MCBP._note || '';
  }

  function setBlueprint(bp, doFit) {
    state.bp = bp;
    state.curY = 0;
    manualEdited = false;
    el.bpName.value = bp.name || '';
    el.dimX.value = bp.dims.x; el.dimY.value = bp.dims.y; el.dimZ.value = bp.dims.z;
    updateLayerUI();
    if (doFit) fit3D();
    ED.render();
    render3D();
    renderMaterials();
    scheduleSave();
  }

  function setLayer(y) {
    if (!state.bp) return;
    state.curY = Math.max(0, Math.min(state.bp.dims.y - 1, y));
    el.layerSlider.value = state.curY;
    updateLayerUI(); ED.render();
  }

  function updateLayerUI() {
    if (!state.bp) return;
    el.layerSlider.max = state.bp.dims.y - 1;
    el.layerSlider.value = state.curY;
    el.layerLabel.textContent = '層 ' + (state.curY + 1) + ' / ' + state.bp.dims.y;
    el.onionChk.checked = state.onion;
  }

  function doResize() {
    if (!state.bp) return;
    var nx = +el.dimX.value || state.bp.dims.x, ny = +el.dimY.value || state.bp.dims.y, nz = +el.dimZ.value || state.bp.dims.z;
    if ((nx < state.bp.dims.x || ny < state.bp.dims.y || nz < state.bp.dims.z) &&
        !window.confirm('小さくすると範囲外のブロックは削除されます。続けますか?')) return;
    MODEL.resize(state.bp, nx, ny, nz);
    state.curY = Math.min(state.curY, state.bp.dims.y - 1);
    updateLayerUI(); fit3D(); ED.render(); render3D(); renderMaterials(); scheduleSave();
  }

  function fit3D() {
    if (!state.bp) return;
    var v = ISO.fit(el.isoCanvas, state.bp, state.rot);
    state.zoom = v.zoom; state.pan = v.pan;
  }

  function render3D() {
    if (!state.bp) return;
    ISO.render(el.isoCanvas, state.bp, { rot: state.rot, zoom: state.zoom, pan: state.pan });
    el.rotLabel.textContent = '向き ' + (state.rot + 1) + '/4';
  }

  function renderMaterials() { if (state.bp) MAT.render(el.matPanel, state.bp); }

  function onEdit(light) {
    manualEdited = true;
    if (!rafPending) {
      rafPending = true;
      requestAnimationFrame(function () { rafPending = false; render3D(); });
    }
    if (matTimer) clearTimeout(matTimer);
    matTimer = setTimeout(renderMaterials, 150);
    scheduleSave();
  }

  function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () { if (state.bp) ST.autosave(state.bp); }, 800);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
