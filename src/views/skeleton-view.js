/**
 * 骨格診断の画面モジュール。
 *
 * 全身写真アップロード → MediaPipe Pose で33点検出 → 異常系チェック →
 * 4つの比率を計算 → 画像と数値を Functions に送って Claude が判定 →
 * 結果を表示する。
 *
 * MediaPipe のモデル読み込みは時間がかかるため、画面セットアップ時に
 * 裏で先読みしておく。
 */
import { PoseLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { validateDetection, computeMetrics } from "../skeleton-analysis.js";
import { buildSkeletonResultHTML, setupSkeletonCta } from "./skeleton-result-view.js";

const MAX_EDGE = 1000;
const SKELETON_URL = "/api/diagnose-skeleton";
const COUNSELING_URL = "https://example.com/counseling";

// 骨格の線（描画用）
const CONNECTIONS = [
  [11, 12], [11, 23], [12, 24], [23, 24],
  [11, 13], [13, 15], [12, 14], [14, 16],
  [23, 25], [25, 27], [24, 26], [26, 28],
];

export function skeletonViewHTML() {
  return /*html*/ `
    <div class="step">
      <div class="step-head"><div class="step-no">1</div><div class="step-title">全身写真を選ぶ</div></div>
      <div class="step-desc">頭から足先まで全身が入る写真を、正面・お一人で写ったものをお選びください。</div>
      <button id="skPickBtn" disabled>全身写真を選ぶ</button>
      <input type="file" id="skFile" accept="image/*" />
      <div id="skLoadStatus"></div>
    </div>

    <div class="step hidden" id="skStep2">
      <div class="step-head"><div class="step-no">2</div><div class="step-title">骨格の検出結果</div></div>
      <div class="step-desc">検出された骨格点です。問題なければ診断に進みます。</div>
      <div class="canvas-stage"><canvas id="skCanvas"></canvas></div>
      <div id="skStatusBox"></div>
      <div style="margin-top:16px;">
        <button id="skDiagnoseBtn">この写真で診断する</button>
      </div>
    </div>

    <div class="hidden" id="skResultView"><div id="skResultBox"></div></div>
  `;
}

/**
 * 骨格診断画面をセットアップする。
 * @param {Object} handlers - { onResult(data) } 判定結果を受け取るコールバック（任意）。
 * @returns {{reset: function}} 初期化用の reset を持つオブジェクト。
 */
export function setupSkeletonView({ onResult } = {}) {
  const els = {
    pickBtn: document.getElementById("skPickBtn"),
    file: document.getElementById("skFile"),
    loadStatus: document.getElementById("skLoadStatus"),
    step2: document.getElementById("skStep2"),
    canvas: document.getElementById("skCanvas"),
    statusBox: document.getElementById("skStatusBox"),
    diagnoseBtn: document.getElementById("skDiagnoseBtn"),
    resultView: document.getElementById("skResultView"),
    resultBox: document.getElementById("skResultBox"),
  };

  let poseLandmarker = null;
  let currentMetrics = null;     // 計算した比率
  let currentImageBase64 = null; // Functionsに送る画像

  // MediaPipe を裏で先読み
  initPose();

  els.pickBtn.addEventListener("click", () => { els.file.value = ""; els.file.click(); });
  els.file.addEventListener("change", onFile);
  els.diagnoseBtn.addEventListener("click", onDiagnose);

  async function initPose() {
    showLoad("info", "骨格検出の準備をしています…（初回は数秒かかります）");
    try {
      const vision = await FilesetResolver.forVisionTasks(
        `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${__MEDIAPIPE_VERSION__}/wasm`
      );
      poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
          delegate: "GPU",
        },
        runningMode: "IMAGE",
        numPoses: 2,
      });
      els.pickBtn.disabled = false;
      showLoad("", "");
    } catch (err) {
      showLoad("warn", "骨格検出の準備に失敗しました: " + err.message);
    }
  }

  function onFile(e) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    if (!poseLandmarker) { showLoad("warn", "準備中です。少し待ってからお試しください。"); return; }
    showLoad("info", "画像を読み込んでいます…");

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => { img.onerror = null; processImage(img); };
      img.onerror = () => showLoad("warn", "画像の読み込みに失敗しました。");
      img.src = reader.result;
    };
    reader.onerror = () => showLoad("warn", "ファイルの読み込みに失敗しました。");
    reader.readAsDataURL(f);
  }

  function processImage(img) {
    const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);
    els.canvas.width = w;
    els.canvas.height = h;
    const ctx = els.canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, w, h);

    showLoad("", "");
    els.step2.classList.remove("hidden");
    els.resultView.classList.add("hidden");
    els.statusBox.innerHTML = "";

    try {
      const result = poseLandmarker.detect(els.canvas);
      const check = validateDetection(result.landmarks);
      if (!check.ok) {
        showStatus("warn", check.reason);
        els.diagnoseBtn.disabled = true;
        if (result.landmarks && result.landmarks[0]) drawSkeleton(result.landmarks[0], w, h);
        return;
      }
      const landmarks = result.landmarks[0];
      drawSkeleton(landmarks, w, h);
      currentMetrics = computeMetrics(landmarks, w, h);
      // 補正なしの画像をbase64化（Claudeに送る）
      currentImageBase64 = els.canvas.toDataURL("image/jpeg", 0.9).split(",")[1];
      showStatus("ok", "骨格を検出しました。診断に進めます。");
      els.diagnoseBtn.disabled = false;
    } catch (err) {
      showStatus("warn", "検出中にエラーが発生しました: " + err.message);
      els.diagnoseBtn.disabled = true;
    }

    els.step2.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function drawSkeleton(landmarks, w, h) {
    const ctx = els.canvas.getContext("2d");
    ctx.strokeStyle = "rgba(80, 200, 160, 0.9)";
    ctx.lineWidth = 3;
    for (const [a, b] of CONNECTIONS) {
      const pa = landmarks[a], pb = landmarks[b];
      if (!pa || !pb) continue;
      ctx.beginPath();
      ctx.moveTo(pa.x * w, pa.y * h);
      ctx.lineTo(pb.x * w, pb.y * h);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(230, 90, 60, 0.95)";
    for (const p of landmarks) {
      ctx.beginPath();
      ctx.arc(p.x * w, p.y * h, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  async function onDiagnose() {
    if (!currentImageBase64 || !currentMetrics) return;
    els.diagnoseBtn.disabled = true;
    els.diagnoseBtn.textContent = "診断中…";
    els.resultView.classList.remove("hidden");
    showResultRaw("info", "Claude vision が診断しています…（10〜20秒ほどかかります）");
    els.resultView.scrollIntoView({ behavior: "smooth", block: "start" });

    try {
      const res = await fetch(SKELETON_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: currentImageBase64,
          mediaType: "image/jpeg",
          metrics: currentMetrics,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showResultRaw("warn", data.error || "診断に失敗しました。もう一度お試しください。");
        return;
      }
      renderResultMinimal(data);
      if (onResult) onResult(data);
    } catch (err) {
      showResultRaw("warn", "通信エラーが発生しました: " + err.message);
    } finally {
      els.diagnoseBtn.disabled = false;
      els.diagnoseBtn.textContent = "この写真で診断する";
    }
  }

  // 本番の結果画面を描画
  function renderResultMinimal(d) {
    els.resultBox.innerHTML = buildSkeletonResultHTML(d);
    setupSkeletonCta(COUNSELING_URL);
    const restartBtn = document.getElementById("skRestartBtn");
    if (restartBtn) restartBtn.addEventListener("click", () => {
      reset();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    // 結果が表示されたら結果画面の先頭まで自動スクロール。
    // 描画（イラストやレイアウト）が反映されてからスクロールするため
    // requestAnimationFrame で次の描画タイミングまで待つ。
    requestAnimationFrame(() => {
      els.resultView.scrollIntoView({ behavior: "smooth", block: "start" });
    });
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

  function reset() {
    currentMetrics = null;
    currentImageBase64 = null;
    els.file.value = "";
    els.step2.classList.add("hidden");
    els.resultView.classList.add("hidden");
    els.statusBox.innerHTML = "";
    els.resultBox.innerHTML = "";
  }

  return { reset };
}