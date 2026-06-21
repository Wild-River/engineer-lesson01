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

/**
 * 撮影〜補正画面のHTML文字列を生成して返す。
 *
 * この画面は3つのステップ（写真選択・紙タップ・補正結果）で構成される。
 * 初期状態ではステップ2・3は hidden クラスで隠れており、写真の読み込みや
 * 補正の進行に応じて setupCaptureView 側で表示が切り替わる。
 *
 * 関数として切り出しているのは、main.js の骨組みHTMLにこの画面を埋め込む
 * ため（main.js が ${captureViewHTML()} の形で呼び出す）。HTMLとロジックを
 * 同じモジュールに置くことで、撮影画面に関わるものを1ファイルに集約している。
 *
 * @returns {string} 撮影画面のHTML文字列。
 */
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
 * 撮影〜補正画面をセットアップし、すべての操作を有効化する。
 *
 * captureViewHTML() で挿入されたHTMLに対して、DOM要素の取得・イベントの結線・内部状態の管理を行う。
 * この画面で完結する操作（写真読み込み・紙タップによる補正・補正前後の比較表示）をこの関数の中に閉じ込めている。
 *
 * 親（main.js）とのやり取りは最小限のインターフェースに絞っている：
 *   - 受け取る: onDiagnose（「診断する」が押されたとき呼ぶコールバック）
 *   - 返す: { reset } （画面を初期状態に戻す関数）
 *
 * 内部状態（クロージャで保持）：
 *   - baseCanvas: 読み込んで縮小した処理用canvas
 *   - correctedCanvas: 補正後のcanvas（診断対象）
 *   - displayScale: 表示canvasと実画像の表示倍率（タップ座標の変換に使う）
 *
 * @param {Object} handlers - 親から渡されるコールバック群。
 * @param {function(HTMLCanvasElement, function): void} handlers.onDiagnose -
 *   補正済み画像で診断を実行する関数。補正済みcanvasとボタン状態制御関数を渡す。
 * @returns {{reset: function(): void}} 画面を初期状態に戻す reset を持つオブジェクト。
 */
export function setupCaptureView({ onDiagnose }) { // 渡されたオブジェクトからonDiagnoseを取り出す「分割代入」。
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

  //  内部状態（クロージャで保持）：
  //  - baseCanvas: 読み込んで縮小した処理用canvas
  //  - correctedCanvas: 補正後のcanvas（診断対象）
  //  - displayScale: 表示canvasと実画像の表示倍率（タップ座標の変換に使う）
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

  /**
   * 選択された画像ファイルを読み込み、補正画面（ステップ2）へ進める。
   * @param {Event} e - input[type=file] の change イベント。
   * @returns {Promise<void>}
   */
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

  /**
   * baseCanvas を表示用に縮小して画面のcanvasに描画する。表示倍率も記録する。
   * @returns {void}
   */
  function drawSource() {
    const bw = baseCanvas.width, bh = baseCanvas.height;
    displayScale = Math.min(1, MAX_DISPLAY_W / bw);
    const dw = Math.round(bw * displayScale), dh = Math.round(bh * displayScale);
    els.src.width = dw; els.src.height = dh;
    els.src.getContext("2d").drawImage(baseCanvas, 0, 0, dw, dh);
  }

  /**
   * 表示canvas上でタップされた位置の「白い紙」の色を測り、補正を実行する。
   *
   * この画面で最も中心的な操作。ユーザーが紙の部分をタップすると呼ばれる。
   *
   * 座標変換が必要な理由：
   * 表示しているcanvasは画面に合わせて縮小されており、実際の処理用canvas（baseCanvas）とはサイズが違う。
   * canvasが画面のどこにあるか(位置のズレ)→ rect.leftで吸収
   * 見た目の大きさと中身の解像度のズレ → els.src.width / rect.widthで吸収
   * 表示canvasとbaseCanvasの縮小のズレ → displayScaleで吸収

   * @param {MouseEvent} e - 表示canvas（els.src）の click イベント。
   *   e.clientX / e.clientY からタップ位置を取得する。
   * @returns {void} 戻り値はなく、補正結果の表示（副作用）が目的。
   */
  function onTapCanvas(e) {
    if (!baseCanvas) return;
    // タップ位置（画面座標）を baseCanvas のピクセル座標に変換する

    // 段階1: 画面座標 → rect(getBoundingClientRect=CSS上の表示位置・サイズ)
    // e.clientXは画面全体での位置。rect.leftはcanvasが画面のどこにあるか(左端の位置)。引き算すると「canvasの左端から測った位置」になる。
    const rect = els.src.getBoundingClientRect();
    const cssX = e.clientX - rect.left;
    const cssY = e.clientY - rect.top;

    // 段階2: 表示canvas座標 → canvas解像度座標
    // canvasには2つの「サイズ」がある:
    // els.src.width — canvasの解像度(中身のピクセル数)
    // rect.width — CSS上の表示幅(画面での見た目の大きさ)
    // els.src.width / rect.widthは、「見た目と中身の比率」
    const canvX = cssX * (els.src.width / rect.width);
    const canvY = cssY * (els.src.height / rect.height);

    // 段階3: canvas解像度座標 → baseCanvas座標(displayScale を使う)
    // drawSourceの中でbaseCanvasをさらに縮小して描いている。その縮小率がdisplayScale
    const baseX = Math.round(canvX / displayScale);
    const baseY = Math.round(canvY / displayScale);

    // マーカーを表示し、タップを促すヒントを消す
    els.marker.style.left = cssX + "px";
    els.marker.style.top = cssY + "px";
    els.marker.style.display = "block";
    els.tapHint.style.display = "none";

    // sampleArea でタップ周辺の平均色を取得する
    const sample = sampleArea(baseCanvas, baseX, baseY);
    if (!sample) { showStatus("warn", "サンプリングに失敗しました。画像の内側をタップしてください。"); return; }

    // calcCorrection で補正の可否を判定（白飛び・暗すぎは警告して中断）
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

    // 問題なければ applyCorrection で補正し、比較表示（ステップ3）へ進む
    correctedCanvas = applyCorrection(baseCanvas, result.coef);
    showStatus("ok", `補正しました。サンプル領域 (${sr}, ${sg}, ${sb}) を白の基準にしています。`);
    renderCompare();
  }

  /**
   * 補正前（baseCanvas）と補正後（correctedCanvas）を並べて表示する。
   * @returns {void}
   */
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

  /**
   * 診断ボタンの表示を切り替える。親（main.js）から診断中の制御に使われる。
   * @param {string} state - "loading" で「診断中…」表示、それ以外で通常表示に戻す。
   * @returns {void}
   */
  function setBtnState(state) {
    if (state === "loading") {
      els.diagnoseBtn.disabled = true;
      els.diagnoseBtn.textContent = "診断中…";
    } else {
      els.diagnoseBtn.disabled = false;
      els.diagnoseBtn.textContent = "この画像で診断する";
    }
  }

  /**
   * ステップ1の読み込み状態メッセージを表示する（空文字で消去）。
   * @param {string} type - メッセージ種別（CSSクラス名。"info"|"warn"など）。
   * @param {string} msg - 表示文。空文字なら何も表示しない。
   * @returns {void}
   */
  function showLoad(type, msg) {
    els.loadStatus.innerHTML = msg ? `<div class="status ${type}" style="margin-top:12px">${msg}</div>` : "";
  }
  /**
   * ステップ2のサンプリング結果メッセージ（成功・警告）を表示する。
   * @param {string} type - メッセージ種別（"ok"|"warn"など、CSSクラス名）。
   * @param {string} msg - 表示文。
   * @returns {void}
   */
  function showStatus(type, msg) {
    els.statusBox.innerHTML = `<div class="status ${type}">${msg}</div>`;
  }

  /**
   * 撮影画面を初期状態に戻す。内部状態と表示をクリアする（リスタート時に親が呼ぶ）。
   * @returns {void}
   */
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
