import "./style.css";
import {
  loadAndResize,
  sampleArea,
  calcCorrection,
  applyCorrection,
  canvasToBase64,
} from "./white-balance.js";
import { buildResultHTML, setupRing, setupCta } from "./result-view.js";

const MAX_DISPLAY_W = 720;
const DIAGNOSE_URL = "/api/diagnose";
// カウンセリングCTAの仮リンク（後で本番URLに差し替え）
const COUNSELING_URL = "https://example.com/counseling";

// 画面の骨組み
const app = document.getElementById("app");
app.innerHTML = `
  <div class="wrap">
    <header>
      <div class="eyebrow">Personal Color</div>
      <h1>パーソナルカラー診断</h1>
      <div class="sub">白い紙を顔の横に持って撮影 → 紙をタップ → 環境光を補正して診断します</div>
    </header>

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

    <div class="hidden" id="step4">
      <div id="resultBox"></div>
    </div>
  </div>
`;

const els = {
  pickBtn: document.getElementById("pickBtn"),
  file: document.getElementById("file"),
  loadStatus: document.getElementById("loadStatus"),
  step2: document.getElementById("step2"),
  step3: document.getElementById("step3"),
  step4: document.getElementById("step4"),
  src: document.getElementById("srcCanvas"),
  tapHint: document.getElementById("tapHint"),
  marker: document.getElementById("marker"),
  statusBox: document.getElementById("statusBox"),
  before: document.getElementById("beforeCanvas"),
  after: document.getElementById("afterCanvas"),
  redoBtn: document.getElementById("redoBtn"),
  diagnoseBtn: document.getElementById("diagnoseBtn"),
  resultBox: document.getElementById("resultBox"),
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
els.diagnoseBtn.addEventListener("click", onDiagnose);

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
    els.step4.classList.add("hidden");
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
  els.step4.classList.add("hidden");
  els.step3.scrollIntoView({ behavior: "smooth", block: "start" });
}

// === 診断呼び出し ===
async function onDiagnose() {
  if (!correctedCanvas) return;
  if (!DIAGNOSE_URL) {
    showResultRaw("warn", "診断APIのURLが設定されていません（.env の VITE_DIAGNOSE_URL を確認してください）。");
    els.step4.classList.remove("hidden");
    return;
  }

  els.diagnoseBtn.disabled = true;
  els.diagnoseBtn.textContent = "診断中…";
  els.step4.classList.remove("hidden");
  showResultRaw("info", "Claude vision が診断しています…（10〜20秒ほどかかります）");
  els.step4.scrollIntoView({ behavior: "smooth", block: "start" });

  try {
    const imageBase64 = canvasToBase64(correctedCanvas, 0.92);
    const res = await fetch(DIAGNOSE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageBase64, mediaType: "image/jpeg" }),
    });

    const data = await res.json();
    if (!res.ok) {
      showResultRaw("warn", data.error || "診断に失敗しました。もう一度お試しください。");
      return;
    }
    renderResult(data);
  } catch (err) {
    showResultRaw("warn", "通信エラーが発生しました: " + err.message);
  } finally {
    els.diagnoseBtn.disabled = false;
    els.diagnoseBtn.textContent = "この画像で診断する";
  }
}

// 本番の結果画面を描画
function renderResult(data) {
  els.resultBox.innerHTML = buildResultHTML(data);
  // 円環の色玉を配置（DOM挿入後に呼ぶ）
  setupRing(data.colors || []);
  // カウンセリングCTAの仮リンクを設定
  setupCta(COUNSELING_URL);
  // リスタートボタン
  const restartBtn = document.getElementById("restartBtn");
  if (restartBtn) {
    restartBtn.addEventListener("click", () => {
      els.step4.classList.add("hidden");
      els.step2.classList.add("hidden");
      els.step3.classList.add("hidden");
      els.resultBox.innerHTML = "";
      els.file.value = "";
      baseCanvas = null;
      correctedCanvas = null;
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }
  els.step4.scrollIntoView({ behavior: "smooth", block: "start" });
}

function showResultRaw(type, msg) {
  els.resultBox.innerHTML = `<div class="status ${type}">${msg}</div>`;
}
function showLoad(type, msg) {
  els.loadStatus.innerHTML = msg ? `<div class="status ${type}" style="margin-top:12px">${msg}</div>` : "";
}
function showStatus(type, msg) {
  els.statusBox.innerHTML = `<div class="status ${type}">${msg}</div>`;
}