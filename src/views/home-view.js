/**
 * トップ画面（診断の選択）。
 *
 * パーソナルカラー診断・骨格診断の2つを選ばせる入り口。
 * カラーカードには4シーズンの色をミニチュア円環で、骨格カードには
 * タイプ別の体型イラストを表示する。
 * カードを選ぶと、対応する診断フローに遷移する（onSelect コールバック）。
 */

// カラーカードのミニチュア円環用：4シーズンから2色ずつ（春→夏→秋→冬の順）
const RING_COLORS = [
  "#FF8A6E", "#FFC94D", // 春（コーラル / サニーゴールド）
  "#A8C5E0", "#B7A8D6", // 夏（パウダーブルー / ラベンダー）
  "#C66B47", "#D4A12E", // 秋（テラコッタ / マスタード）
  "#2B4FA0", "#C8327D", // 冬（ロイヤルブルー / マゼンタ）
];

// 骨格カードの画像（public配下）。実画像のファイル名に合わせて調整可。
const SKELETON_CARD_IMG = "/skeleton-card.jpg";

// ミニチュア円環のSVGを生成（8色を円周に均等配置、中央にラベル）
function miniRingSVG() {
  const size = 120, cx = 60, cy = 60, r = 42, dotR = 11;
  const dots = RING_COLORS.map((hex, i) => {
    const angle = (i / RING_COLORS.length) * Math.PI * 2 - Math.PI / 2;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${dotR}" fill="${hex}" />`;
  }).join("");
  return `
    <svg viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
      ${dots}
      <text x="${cx}" y="${cy - 3}" text-anchor="middle" font-size="9"
        font-family="sans-serif" letter-spacing="1" fill="#2a2723">4</text>
      <text x="${cx}" y="${cy + 8}" text-anchor="middle" font-size="7.5"
        font-family="sans-serif" letter-spacing="0.5" fill="#76716a">Seasons</text>
    </svg>`;
}

export function homeViewHTML() {
  return /*html*/ `
    <div class="home">

      <div class="home-cards">
        <button class="home-card" data-diagnosis="color">
          <div class="hc-visual hc-visual-ring">${miniRingSVG()}</div>
          <div class="hc-body">
            <div class="hc-en">Personal Color</div>
            <div class="hc-jp">パーソナルカラー診断</div>
            <div class="hc-desc">肌・髪・瞳の色味から、似合う色の系統（4シーズン）を診断します。</div>
            <div class="hc-go">診断する →</div>
          </div>
        </button>

        <button class="home-card" data-diagnosis="skeleton">
          <div class="hc-visual">
            <img src="${SKELETON_CARD_IMG}" alt="骨格診断" />
          </div>
          <div class="hc-body">
            <div class="hc-en">Skeleton Type</div>
            <div class="hc-jp">骨格診断</div>
            <div class="hc-desc">全身写真から骨格タイプ（ストレート / ウェーブ / ナチュラル）を診断します。</div>
            <div class="hc-go">診断する →</div>
          </div>
        </button>
      </div>
    </div>
  `;
}

/**
 * トップ画面のセットアップ。
 * @param {Object} handlers - { onSelect(type) } "color" | "skeleton" を受け取る。
 */
export function setupHomeView({ onSelect }) {
  document.querySelectorAll(".home-card").forEach((card) => {
    card.addEventListener("click", () => {
      onSelect(card.dataset.diagnosis);
    });
  });
}