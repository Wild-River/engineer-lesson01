import "./style.css";
import { canvasToBase64 } from "./white-balance.js";
import { homeViewHTML, setupHomeView } from "./views/home-view.js";
import { guideViewHTML, setupGuideView } from "./views/guide-view.js";
import { captureViewHTML, setupCaptureView } from "./views/capture-view.js";
import { buildResultHTML, setupRing, setupCta } from "./views/result-view.js";
import { skeletonViewHTML, setupSkeletonView } from "./views/skeleton-view.js";

const DIAGNOSE_URL = "/api/diagnose";
// カウンセリングCTAの仮リンク（後で本番URLに差し替え）
const COUNSELING_URL = "https://example.com/counseling";

// 画面全体の骨組み。トップ（診断選択）+ パーソナルカラー + 骨格の各セクションを持つ。
// 各 view は専用モジュールが生成する。
const app = document.getElementById("app");
app.innerHTML = /*html*/ `
  <div class="wrap">
    <header>
      <div class="eyebrow">Beauty Analysis</div>
      <h1>骨格＆パーソナルカラー診断</h1>
    </header>

    <!-- トップ（診断選択） -->
    <div id="homeView">${homeViewHTML()}</div>

    <!-- パーソナルカラー診断のフロー -->
    <div class="hidden" id="colorFlow">
      <button class="back-link" data-back>← 診断を選び直す</button>
      <div id="guideView">${guideViewHTML()}</div>
      <div class="hidden" id="captureView">${captureViewHTML()}</div>
      <div class="hidden" id="resultView"><div id="resultBox"></div></div>
    </div>

    <!-- 骨格診断のフロー -->
    <div class="hidden" id="skeletonFlow">
      <button class="back-link" data-back>← 診断を選び直す</button>
      <div id="skeletonView">${skeletonViewHTML()}</div>
    </div>
  </div>
`;

const homeView = document.getElementById("homeView");
const colorFlow = document.getElementById("colorFlow");
const skeletonFlow = document.getElementById("skeletonFlow");
const guideView = document.getElementById("guideView");
const captureView = document.getElementById("captureView");
const resultView = document.getElementById("resultView");
const resultBox = document.getElementById("resultBox");

// トップ画面: カードを選ぶと selectDiagnosis に "color" | "skeleton" が渡る
setupHomeView({ onSelect: selectDiagnosis });

/**
 * トップで選ばれた診断のフローを表示する。
 * @param {string} type - "color"（パーソナルカラー）| "skeleton"（骨格）。
 * @returns {void}
 */
function selectDiagnosis(type) {
  homeView.classList.add("hidden");
  if (type === "color") {
    colorFlow.classList.remove("hidden");
    colorFlow.scrollIntoView({ behavior: "smooth", block: "start" });
  } else if (type === "skeleton") {
    skeletonFlow.classList.remove("hidden");
    skeletonFlow.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

// 「← 診断を選び直す」でトップに戻る（両フローの戻りボタン共通）
document.querySelectorAll("[data-back]").forEach((btn) => {
  btn.addEventListener("click", backToHome);
});

/**
 * 両フローを隠して初期化し、トップ（診断選択）に戻す。
 * @returns {void}
 */
function backToHome() {
  colorFlow.classList.add("hidden");
  skeletonFlow.classList.add("hidden");
  restart();          // パーソナルカラーを初期化
  skeleton.reset();   // 骨格を初期化（skeleton-view.js の reset に委ねる）
  homeView.classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ガイド画面: 「診断をはじめる」で撮影画面へ
setupGuideView({ onStart: showCapture });

// 撮影画面をセットアップ。補正完了後に「診断する」が押されたら onDiagnose が呼ばれる。
//  { onDiagnose: onDiagnose } キー名と変数名が同じときは、省略できる「ショートハンド」
// オブジェクトで渡すと、後で渡すものが増えても対応しやすい（引数の順番を気にしなくて良い）
const capture = setupCaptureView({ onDiagnose });

// ガイド → 撮影 への遷移
function showCapture() {
  guideView.classList.add("hidden");
  captureView.classList.remove("hidden");
  captureView.scrollIntoView({ behavior: "smooth", block: "start" });
}

/**
 * 補正済み画像を診断APIへ送り、結果を受け取って結果画面に表示する。
 *
 * 撮影画面で「この画像で診断する」が押されたときに呼ばれる。
 * （setupCaptureView に onDiagnose として渡している）
 *
 * fetch 先の /api/diagnose は、
 * 本番では Firebase Hosting の rewrites が、（firebase.jsonの"rewrites"）
 * 開発では Vite の proxy が、（vite.config.jsの"/api/diagnose"）
 * それぞれ裏で Cloud Functions に転送する。「転送役」だけが本番(Hosting)と開発(Vite)で違う。
 * フロントは常に同一オリジンのパスを呼ぶためCORS(Cross-Origin Resource Sharing)が発生しない。
 *
 * @param {HTMLCanvasElement} correctedCanvas - 撮影画面から渡される補正済み画像。
 * @param {function(string): void} setBtnState - 診断ボタンの表示を切り替える関数
 *   （撮影画面が提供）。"loading" で「診断中…」、"idle" で元に戻す。
 * @returns {Promise<void>} 表示更新のみで値は返さない（副作用的に画面を更新）。
 */
async function onDiagnose(correctedCanvas, setBtnState) {
  setBtnState("loading"); // ボタンを「診断中…」表示に
  resultView.classList.remove("hidden");
  // 結果欄に待機メッセージを出す
  showResultRaw("info", "Claude vision が診断しています…（10〜20秒ほどかかります）");
  resultView.scrollIntoView({ behavior: "smooth", block: "start" });

  // canvas を base64 に変換して /api/diagnose へ POST
  // 返ってきた JSON を結果画面に渡す（成功時）、またはエラー表示（失敗時）
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
    setBtnState("idle"); // 診断ボタンの表示を元に戻す
  }
}

/**
 * 診断結果データから結果画面を構築し、画面に表示する。
 *
 * onDiagnose が診断成功時に呼ぶ。結果画面のHTMLを生成して挿入したあと、
 * その画面が動作するために必要なセットアップを順に行う：
 *
 * @param {Object} data - 診断APIが返したJSON。season（シーズン）、colors
 *   （似合う色8色）、axes（4軸）、features（特徴）、advice、confidence などを含む。
 * @returns {void}
 */
function showResult(data) {
  // buildResultHTML/setupRing/setupCta(すべてresult-view.jsの関数）
  resultBox.innerHTML = buildResultHTML(data); //結果画面のHTMLを生成し resultBox に挿入
  setupRing(data.colors || []); //円環パレットの色玉を配置し、タップ動作を有効化
  setupCta(COUNSELING_URL); //カウンセリングボタンのリンク先を設定

  // 「もう一度診断する」ボタンに restart を結線
  const restartBtn = document.getElementById("restartBtn");
  if (restartBtn) {
    restartBtn.addEventListener("click", restart);
  }
  resultView.scrollIntoView({ behavior: "smooth", block: "start" });
}

/**
 * パーソナルカラー診断を初期状態（ガイド画面）に戻す。
 *
 * 撮影画面の状態リセットは capture.reset() に委ねている。
 * main.js は reset() を呼ぶだけ
 *
 * @returns {void}
 */
function restart() {
  resultView.classList.add("hidden");
  captureView.classList.add("hidden");
  resultBox.innerHTML = "";
  capture.reset();
  // 入り口（ガイド画面）に戻す
  guideView.classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/**
 * 結果欄に状態メッセージ（待機中・エラーなど）を表示する簡易ヘルパー。
 * @param {string} type - メッセージの種類（"info"|"warn"など、CSSクラス名になる）。
 * @param {string} msg - 表示するメッセージ文。
 * @returns {void}
 */
function showResultRaw(type, msg) {
  resultBox.innerHTML = `<div class="status ${type}">${msg}</div>`;
}

// === 骨格診断 ===
// 骨格診断画面をセットアップ。ページ読み込み時から裏で MediaPipe を準備し始める。
// 返り値の reset は、トップに戻るとき（backToHome）に初期化用として呼ぶ。
const skeleton = setupSkeletonView();