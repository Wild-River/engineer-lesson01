/**
 * 撮影〜ホワイトバランス補正の画面モジュール。
 *
 * この画面の中で完結する操作（写真読込・紙タップ・補正・比較表示）を持ち、
 * 補正が完了したら onComplete(correctedCanvas) で親に通知する。
 * 「診断する」ボタンが押されたら onDiagnose(correctedCanvas) を呼ぶ。
 */
import {
  loadAndResize,
  sampleArea,
  calcCorrection,
  applyCorrection,
} from "../white-balance.js";

const MAX_DISPLAY_W = 720;

// この画面のHTML（/*html*/ で es6-string-html のハイライトを有効化）
export function captureViewHTML() {
  return /*html*/ `
    <div class="step">
      <div class="step-head"><div class="step-no">1</div><div class="step-title">写真を選ぶ</div></div>
      <div class="step-desc">白い紙を顔の横に持った写真を撮影、または選択してください。</div>
      <button id="pickBtn">写真を選ぶ / 撮影する</button>
      <input type="file" id="file" accept="image/*" />
      <div id="loadStatus"></div>
    </div>

    <div class="step hidden" id="step2">
      <div class="step-head"><div class="step-no">2</div><div class="step-title">紙の部分をタップ</div></div>
      <div class="step-desc">画像の中の「白い紙」の部分をタップしてください。環境光のズレを測ります。</div>
      <div class="canvas-stage" id="stage">
        <canvas id="srcCanvas"></canvas>
        <div class="hint-tap" id="tapHint"><span>白い紙をタップ</span></div>
        <div class="marker" id="marker"></div>
      </div>
      <div id="statusBox"></div>
    </div>

    <div class="step hidden" id="step3">
      <div class="step-head"><div class="step-no">3</div><div class="step-title">補正結果</div></div>
      <div class="step-desc">左が元画像、右が補正後です。補正後の画像で診断します。</div>
      <div class="compare">
        <figure><figcaption>補正前</figcaption><canvas id="beforeCanvas"></canvas></figure>
        <figure><figcaption>補正後</figcaption><canvas id="afterCanvas"></canvas></figure>
      </div>
      <div style="margin-top:16px; display:flex; gap:10px; flex-wrap:wrap;">
        <button class="ghost" id="redoBtn">別の場所をタップし直す</button>
        <button id="diagnoseBtn">この画像で診断する</button>
      </div>
      <p class="muted-note">補正済み画像はこの後 Claude vision に送られます。EXIF（位置情報・撮影時刻）はcanvas処理で自動的に除去されます。</p>
    </div>
  `;
}

/**
 * 撮影画面のセットアップ。HTMLが既にDOMに挿入された後に呼ぶ。
 * @param {Object} handlers - { onDiagnose(correctedCanvas) }
 * @returns {Object} - { reset() } 画面状態を初期化する関数
 */
export function setupCaptureView({ onDiagnose }) {
  const els = {
    pickBtn: document.getElementById("pickBtn"),
    file: document.getElementById("file"),
    loadStatus: document.getElementById("loadStatus"),
    step2: document.getElementById("step2"),
    step3: document.getElementById("step3"),
    src: document.getElementById("srcCanvas"),
    tapHint: document.getElementById("tapHint"),
    marker: document.getElementById("marker"),
    statusBox: document.getElementById("statusBox"),
    before: document.getElementById("beforeCanvas"),
    after: document.getElementById("afterCanvas"),
    redoBtn: document.getElementById("redoBtn"),
    diagnoseBtn: document.getElementById("diagnoseBtn"),
  };

  let baseCanvas = null;
  let correctedCanvas = null;
  let displayScale = 1;

  els.pickBtn.addEventListener("click", () => { els.file.value = ""; els.file.click(); });
  els.file.addEventListener("change", onFile);
  els.src.addEventListener("click", onTapCanvas);
  els.redoBtn.addEventListener("click", () => {
    els.step3.classList.add("hidden");
    els.tapHint.style.display = "grid";
    els.marker.style.display = "none";
    els.statusBox.innerHTML = "";
  });
  els.diagnoseBtn.addEventListener("click", () => {
    if (correctedCanvas) onDiagnose(correctedCanvas, setBtnState);
  });

  async function onFile(e) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    showLoad("info", "画像を読み込んでいます…");
    try {
      baseCanvas = await loadAndResize(f);
      drawSource();
      showLoad("", "");
      els.step2.classList.remove("hidden");
      els.step3.classList.add("hidden");
      els.tapHint.style.display = "grid";
      els.marker.style.display = "none";
      els.statusBox.innerHTML = "";
      els.step2.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (err) {
      showLoad("warn", err.message);
    }
  }

  function drawSource() {
    const bw = baseCanvas.width, bh = baseCanvas.height;
    displayScale = Math.min(1, MAX_DISPLAY_W / bw);
    const dw = Math.round(bw * displayScale), dh = Math.round(bh * displayScale);
    els.src.width = dw; els.src.height = dh;
    els.src.getContext("2d").drawImage(baseCanvas, 0, 0, dw, dh);
  }

  function onTapCanvas(e) {
    if (!baseCanvas) return;
    const rect = els.src.getBoundingClientRect();
    const cssX = e.clientX - rect.left;
    const cssY = e.clientY - rect.top;
    const canvX = cssX * (els.src.width / rect.width);
    const canvY = cssY * (els.src.height / rect.height);
    const baseX = Math.round(canvX / displayScale);
    const baseY = Math.round(canvY / displayScale);

    els.marker.style.left = cssX + "px";
    els.marker.style.top = cssY + "px";
    els.marker.style.display = "block";
    els.tapHint.style.display = "none";

    const sample = sampleArea(baseCanvas, baseX, baseY);
    if (!sample) { showStatus("warn", "サンプリングに失敗しました。画像の内側をタップしてください。"); return; }

    const result = calcCorrection(sample);
    const sr = Math.round(sample.r), sg = Math.round(sample.g), sb = Math.round(sample.b);
    if (result.status === "clip") {
      showStatus("warn", `この部分は明るすぎます (${sr}, ${sg}, ${sb})。白飛びしていると正しく補正できません。少し影になった紙の部分をタップするか、露出を下げて撮り直してください。`);
      return;
    }
    if (result.status === "dark") {
      showStatus("warn", `この部分は暗すぎます (${sr}, ${sg}, ${sb})。白い紙の部分をタップしてください。`);
      return;
    }

    correctedCanvas = applyCorrection(baseCanvas, result.coef);
    showStatus("ok", `補正しました。サンプル領域 (${sr}, ${sg}, ${sb}) を白の基準にしています。`);
    renderCompare();
  }

  function renderCompare() {
    const bw = baseCanvas.width, bh = baseCanvas.height;
    const scale = Math.min(1, MAX_DISPLAY_W / bw);
    const dw = Math.round(bw * scale), dh = Math.round(bh * scale);

    els.before.width = dw; els.before.height = dh;
    els.before.getContext("2d").drawImage(baseCanvas, 0, 0, dw, dh);

    els.after.width = dw; els.after.height = dh;
    els.after.getContext("2d").drawImage(correctedCanvas, 0, 0, dw, dh);

    els.step3.classList.remove("hidden");
    els.step3.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // 診断ボタンの状態を親から制御できるようにする
  function setBtnState(state) {
    if (state === "loading") {
      els.diagnoseBtn.disabled = true;
      els.diagnoseBtn.textContent = "診断中…";
    } else {
      els.diagnoseBtn.disabled = false;
      els.diagnoseBtn.textContent = "この画像で診断する";
    }
  }

  function showLoad(type, msg) {
    els.loadStatus.innerHTML = msg ? `<div class="status ${type}" style="margin-top:12px">${msg}</div>` : "";
  }
  function showStatus(type, msg) {
    els.statusBox.innerHTML = `<div class="status ${type}">${msg}</div>`;
  }

  // 画面を初期状態に戻す（リスタート用）
  function reset() {
    baseCanvas = null;
    correctedCanvas = null;
    els.file.value = "";
    els.step2.classList.add("hidden");
    els.step3.classList.add("hidden");
    els.tapHint.style.display = "grid";
    els.marker.style.display = "none";
    els.statusBox.innerHTML = "";
    showLoad("", "");
  }

  return { reset };
}
