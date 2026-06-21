/**
 * 診断結果画面の描画モジュール（サロン風・円環パレット）
 *
 * 診断データ（Functionsの返り値）を受け取り、結果画面のHTMLを構築する。
 * シーズンに応じてアクセント色が切り替わる。
 */

// シーズンごとのアクセント色・表示情報
const SEASON_THEME = {
  spring: {
    en: "Spring", jp: "イエベ春", sub: "明るく澄んだ暖色",
    accent: "#e89a6c", accentDeep: "#c97849", tint: "#fbeee3",
  },
  summer: {
    en: "Summer", jp: "ブルベ夏", sub: "やわらかく涼やかな色",
    accent: "#a9b6d4", accentDeep: "#7585ab", tint: "#eef0f6",
  },
  autumn: {
    en: "Autumn", jp: "イエベ秋", sub: "深く落ち着いたアース色",
    accent: "#bf8a4f", accentDeep: "#9a6b35", tint: "#f4ecdd",
  },
  winter: {
    en: "Winter", jp: "ブルベ冬", sub: "澄んで鮮やかな色",
    accent: "#8d6ba8", accentDeep: "#5e4480", tint: "#efeaf3",
  },
};

// 4軸の表示定義（左ラベル / 右ラベル / アクティブ側）
// value は診断結果の文字列、posは0〜100でドット位置を決める
function axisPosition(axisKey, value) {
  // 各軸の値を 0〜100 の位置に変換
  const maps = {
    hue: { warm: 22, cool: 78 },
    value: { low: 18, mid: 50, high: 82 },
    chroma: { low: 18, mid: 50, high: 82 },
    clarity: { clear: 22, soft: 78 },
  };
  return maps[axisKey]?.[value] ?? 50;
}

const AXIS_DEFS = [
  { key: "hue", name: "色相", left: "黄み", right: "青み", leftVal: "warm", rightVal: "cool" },
  { key: "value", name: "明度", left: "暗い", right: "明るい", leftVal: "low", rightVal: "high" },
  { key: "chroma", name: "彩度", left: "穏やか", right: "鮮やか", leftVal: "low", rightVal: "high" },
  { key: "clarity", name: "清濁", left: "澄んだ", right: "濁った", leftVal: "clear", rightVal: "soft" },
];

const CONFIDENCE_LABEL = { high: "高", medium: "中", low: "低" };

/**
 * 結果画面のHTML文字列を生成
 */
export function buildResultHTML(data) {
  const theme = SEASON_THEME[data.season] || SEASON_THEME.spring;
  const colors = data.colors || [];
  const conf = CONFIDENCE_LABEL[data.confidence] || "—";

  // 4軸のドット位置を計算してマークアップ
  const axesHTML = AXIS_DEFS.map((ax) => {
    const val = data.axes?.[ax.key];
    const pos = axisPosition(ax.key, val);
    const leftActive = val === ax.leftVal ? "axis-pole-active" : "";
    const rightActive = val === ax.rightVal ? "axis-pole-active" : "";
    // mid の場合は中央寄り（明度・彩度のみ）
    return /*html*/ `
      <div class="axis">
        <div class="axis-name">${ax.name}</div>
        <div>
          <div class="axis-track"><div class="axis-dot" style="left:${pos}%;"></div></div>
          <div class="axis-scale">
            <span class="${leftActive}">${ax.left}</span>
            <span class="${rightActive}">${ax.right}</span>
          </div>
        </div>
      </div>`;
  }).join("");

  return /*html*/ `
    <div class="result" style="
      --season:${theme.accent};
      --season-deep:${theme.accentDeep};
      --season-tint:${theme.tint};
    ">
      <div class="r-masthead">
        <div class="r-label">Personal Color Analysis</div>
        <div class="r-season-en">${theme.en}</div>
        <h2 class="r-season-jp">${theme.jp}</h2>
        <div class="r-confidence"><span class="r-dot"></span>診断の確度 — ${conf}</div>
      </div>

      <div class="r-section">
        <div class="r-section-label">あなたに似合う色</div>
        <div class="ring-stage" id="ringStage">
          <div class="ring-center" id="ringCenter">
            <div class="rc-default">
              <div class="rc-en">${theme.en}</div>
              <div class="rc-jp">${theme.jp}</div>
              <div class="rc-sub">${theme.sub}</div>
            </div>
            <div class="rc-colorname" id="ringColorName"></div>
          </div>
        </div>
        <div class="ring-hint">色をタップすると名前が表示されます</div>
      </div>

      <div class="r-section">
        <div class="r-section-label">診断の根拠</div>
        <div class="axes">${axesHTML}</div>
      </div>

      <div class="r-section">
        <div class="r-section-label">見立て</div>
        <div class="features">
          <div class="feature"><div class="ft-label">肌</div><div class="ft-text">${data.features?.skin || "—"}</div></div>
          <div class="feature"><div class="ft-label">髪</div><div class="ft-text">${data.features?.hair || "—"}</div></div>
          <div class="feature"><div class="ft-label">瞳</div><div class="ft-text">${data.features?.eyes || "—"}</div></div>
        </div>
      </div>

      <div class="r-section">
        <div class="advice">${data.advice || ""}</div>
      </div>

      <div class="counseling">
        <div class="c-eyebrow">For You</div>
        <div class="c-text">${data.counseling_hook || "プロのドレープ診断では、あなたに本当に似合う色の幅を対面で丁寧に見立てます。"}</div>
        <a class="cta-btn" id="counselingCta" href="#" target="_blank" rel="noopener">カウンセリングを予約する</a>
      </div>

      <div class="restart"><button id="restartBtn">もう一度診断する</button></div>

      <div class="r-disclaimer">
        この診断は写真から読み取れる範囲での目安です。<br>
        照明や撮影環境により結果が変わることがあります。
      </div>
    </div>
  `;
}

/**
 * 結果画面のHTMLを挿入した後に呼ぶ。円環の色玉配置とタップ動作をセットアップ。
 */
export function setupRing(colors) {
  const stage = document.getElementById("ringStage");
  const center = document.getElementById("ringCenter");
  const nameEl = document.getElementById("ringColorName");
  if (!stage) return;

  const size = stage.offsetWidth;
  const radius = size <= 320 ? 0.37 * size : 0.37 * size; // 半径は舞台の37%
  let selectedIdx = null;

  colors.forEach((c, i) => {
    const angle = (i / colors.length) * Math.PI * 2 - Math.PI / 2;
    const x = 50 + (radius / size) * 100 * Math.cos(angle);
    const y = 50 + (radius / size) * 100 * Math.sin(angle);

    const dot = document.createElement("div");
    dot.className = "ring-dot";
    dot.style.background = c.hex;
    dot.style.left = x + "%";
    dot.style.top = y + "%";
    dot.addEventListener("click", () => {
      const dots = stage.querySelectorAll(".ring-dot");
      if (selectedIdx === i) {
        dot.classList.remove("selected");
        center.classList.remove("show-color");
        selectedIdx = null;
        return;
      }
      dots.forEach((d) => d.classList.remove("selected"));
      dot.classList.add("selected");
      nameEl.textContent = c.name;
      center.classList.add("show-color");
      selectedIdx = i;
    });
    stage.appendChild(dot);
  });
}

/**
 * カウンセリングCTAのリンク先を設定（後で差し替え可能な仮リンク）
 */
export function setupCta(url) {
  const cta = document.getElementById("counselingCta");
  if (cta) cta.href = url || "#";
}
