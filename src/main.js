import "./style.css";
import { canvasToBase64 } from "./white-balance.js";
import { captureViewHTML, setupCaptureView } from "./views/capture-view.js";
import { buildResultHTML, setupRing, setupCta } from "./views/result-view.js";

const DIAGNOSE_URL = "/api/diagnose";
// カウンセリングCTAの仮リンク（後で本番URLに差し替え）
const COUNSELING_URL = "https://beauty.hotpepper.jp/";

// 画面全体の骨組み。各 view は専用モジュールが生成する。
const app = document.getElementById("app");
app.innerHTML = /*html*/ `
  <div class="wrap">
    <header>
      <div class="eyebrow">Personal Color</div>
      <h1>パーソナルカラー診断</h1>
      <div class="sub">白い紙を顔の横に持って撮影 → 紙をタップ → 環境光を補正して診断します</div>
    </header>

    <div id="captureView">${captureViewHTML()}</div>

    <div class="hidden" id="resultView"><div id="resultBox"></div></div>
  </div>
`;

const resultView = document.getElementById("resultView");
const resultBox = document.getElementById("resultBox");

// 撮影画面をセットアップ。補正完了後に「診断する」が押されたら onDiagnose が呼ばれる。
const capture = setupCaptureView({ onDiagnose });

// === 診断の流れ ===
async function onDiagnose(correctedCanvas, setBtnState) {
  setBtnState("loading");
  resultView.classList.remove("hidden");
  showResultRaw("info", "Claude vision が診断しています…（10〜20秒ほどかかります）");
  resultView.scrollIntoView({ behavior: "smooth", block: "start" });

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
    showResult(data);
  } catch (err) {
    showResultRaw("warn", "通信エラーが発生しました: " + err.message);
  } finally {
    setBtnState("idle");
  }
}

// 結果画面を描画
function showResult(data) {
  resultBox.innerHTML = buildResultHTML(data);
  setupRing(data.colors || []);
  setupCta(COUNSELING_URL);

  const restartBtn = document.getElementById("restartBtn");
  if (restartBtn) {
    restartBtn.addEventListener("click", restart);
  }
  resultView.scrollIntoView({ behavior: "smooth", block: "start" });
}

// 初期状態に戻す
function restart() {
  resultView.classList.add("hidden");
  resultBox.innerHTML = "";
  capture.reset();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showResultRaw(type, msg) {
  resultBox.innerHTML = `<div class="status ${type}">${msg}</div>`;
}
