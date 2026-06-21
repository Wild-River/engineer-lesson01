/**
 * 撮影ガイド画面のHTML文字列を生成して返す。
 *
 * 診断を始める前の入り口画面。
 * 診断精度に効く撮影のコツを3点（白い紙を持つ・自然光・すっぴんに近い状態）に絞って提示し、
 * 「診断をはじめる」ボタンで撮影画面へ進ませる。
 * main.js の骨組みに ${guideViewHTML()} で埋め込まれる。
 *
 * @returns {string} ガイド画面のHTML文字列。
 */
export function guideViewHTML() {
  return /*html*/ `
    <div class="guide">
      <div class="guide-lead">
        正確に診断するために、<br>次の3つを意識して撮影してください。
      </div>

      <div class="guide-points">
        <div class="guide-point">
          <div class="gp-num">01</div>
          <div class="gp-body">
            <div class="gp-title">白い紙を顔の横に持つ</div>
            <div class="gp-text">コピー用紙などの白い紙を、顔のすぐ横に持って一緒に写してください。照明による色のズレを、この紙を基準に補正します。</div>
          </div>
        </div>

        <div class="guide-point">
          <div class="gp-num">02</div>
          <div class="gp-body">
            <div class="gp-title">自然光のもとで</div>
            <div class="gp-text">日中の窓際など、自然光が当たる場所が理想です。蛍光灯や電球の光は、肌の色味を変えてしまうことがあります。</div>
          </div>
        </div>

        <div class="guide-point">
          <div class="gp-num">03</div>
          <div class="gp-body">
            <div class="gp-title">すっぴんに近い状態で</div>
            <div class="gp-text">メイクが薄いほど、肌本来の色味を正確に読み取れます。難しい場合は、できる範囲で構いません。</div>
          </div>
        </div>
      </div>

      <div class="guide-action">
        <button id="startBtn" class="guide-start">診断をはじめる</button>
      </div>
    </div>
  `;
}

/**
 * ガイド画面の「診断をはじめる」ボタンに、撮影画面への遷移を結線する。
 *
 * @param {Object} handlers - 親（main.js）から渡されるコールバック。
 * @param {function(): void} handlers.onStart - 「診断をはじめる」が押されたとき呼ばれる関数。
 * @returns {void}
 */
export function setupGuideView({ onStart }) {
  const btn = document.getElementById("startBtn");
  if (btn) btn.addEventListener("click", onStart);
}
