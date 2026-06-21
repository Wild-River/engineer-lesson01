/**
 * 骨格診断の結果画面の描画モジュール（サロン風）。
 *
 * 判定タイプの人物イラストを主役に、3観点の評価・似合うスタイル（ネックライン
 * 図案＋素材/ポイントのタグ）・アドバイス・カウンセリングCTAを構成する。
 * タイプに応じてアクセント色が切り替わる（イラストの色味に合わせる）。
 */
import { SKELETON_STYLES } from "../skeleton-styles.js";
import { necklineSVG } from "../skeleton-figures.js";

// タイプ別のテーマ（人物イラストの色味に合わせたアクセント）
const TYPE_THEME = {
  straight: { accent: "#7fb0c4", accentDeep: "#4f8195", tint: "#eaf3f6", img: "/skeleton-straight.jpg" },
  wave:     { accent: "#e0a3b8", accentDeep: "#bd7089", tint: "#fbeef2", img: "/skeleton-wave.jpg" },
  natural:  { accent: "#9bb58c", accentDeep: "#6f8a5e", tint: "#eef3e9", img: "/skeleton-natural.jpg" },
};

// 3観点の表示定義
const AXIS_DEFS = [
  { key: "frame", name: "フレーム感", map: { fine: "華奢", medium: "中程度", strong: "しっかり" } },
  { key: "flesh", name: "肉感・質感", map: { soft: "柔らかい", muscular: "ハリがある", bony: "骨感がある" } },
  { key: "gravity", name: "重心", map: { lower: "下重心", balanced: "偏りが少ない", upper: "上重心" } },
];

const CONFIDENCE_LABEL = { high: "高", medium: "中", low: "低" };

export function buildSkeletonResultHTML(data) {
  const theme = TYPE_THEME[data.type] || TYPE_THEME.straight;
  const style = SKELETON_STYLES[data.type] || SKELETON_STYLES.straight;
  const conf = CONFIDENCE_LABEL[data.confidence] || "—";
  const axes = data.axes || {};

  // 3観点
  const axesHTML = AXIS_DEFS.map((ax) => {
    const val = axes[ax.key];
    const label = ax.map[val] || "—";
    return /*html*/ `
      <div class="sk-axis">
        <div class="sk-axis-name">${ax.name}</div>
        <div class="sk-axis-val">${label}</div>
      </div>`;
  }).join("");

  // タグ生成ヘルパー
  const tags = (arr, cls = "") =>
    (arr || []).map((t) => `<span class="sk-tag ${cls}">${t}</span>`).join("");

  return /*html*/ `
    <div class="sk-result" style="
      --sk-accent:${theme.accent};
      --sk-accent-deep:${theme.accentDeep};
      --sk-tint:${theme.tint};
    ">
      <div class="sk-masthead">
        <div class="sk-label">Skeleton Type Analysis</div>
        <div class="sk-type-en">${style.en}</div>
        <h2 class="sk-type-jp">${style.label}</h2>
        <div class="sk-catch">${style.catch}</div>
        <div class="sk-confidence"><span class="sk-dot"></span>診断の確度 — ${conf}</div>
      </div>

      <div class="sk-section sk-figure-section">
        <img class="sk-figure" src="${theme.img}" alt="${style.label}タイプの体型イラスト" />
      </div>

      <div class="sk-section">
        <div class="sk-section-label">診断の根拠</div>
        <div class="sk-axes">${axesHTML}</div>
      </div>

      <div class="sk-section">
        <div class="sk-section-label">見立て</div>
        <div class="sk-features">
          <div class="sk-feature"><div class="sk-ft-label">骨格</div><div class="sk-ft-text">${data.features?.frame || "—"}</div></div>
          <div class="sk-feature"><div class="sk-ft-label">肉感</div><div class="sk-ft-text">${data.features?.flesh || "—"}</div></div>
          <div class="sk-feature"><div class="sk-ft-label">バランス</div><div class="sk-ft-text">${data.features?.balance || "—"}</div></div>
        </div>
      </div>

      <div class="sk-section">
        <div class="sk-section-label">似合うスタイル</div>
        <div class="sk-neckline">
          <div class="sk-neck-fig">${necklineSVG(style.neckline)}</div>
          <div class="sk-neck-info">
            <div class="sk-neck-label">おすすめのネックライン</div>
            <div class="sk-neck-name">${style.necklineLabel}</div>
            <div class="sk-sil-name">シルエット：${style.silhouetteLabel}</div>
          </div>
        </div>
        <div class="sk-tag-group">
          <div class="sk-tag-title">得意な素材</div>
          <div class="sk-tags">${tags(style.materials)}</div>
        </div>
        <div class="sk-tag-group">
          <div class="sk-tag-title">着こなしのポイント</div>
          <div class="sk-tags">${tags(style.points)}</div>
        </div>
        <div class="sk-tag-group">
          <div class="sk-tag-title">控えたい要素</div>
          <div class="sk-tags">${tags(style.avoid, "avoid")}</div>
        </div>
      </div>

      <div class="sk-section">
        <div class="sk-advice">${data.advice || style.advice}</div>
      </div>

      <div class="sk-counseling">
        <div class="sk-c-eyebrow">For You</div>
        <div class="sk-c-text">${data.counseling_hook || "プロの対面診断では、骨や関節、質感を直接見て、あなたに本当に似合うスタイルをさらに丁寧に見立てます。"}</div>
        <a class="sk-cta-btn" id="skCounselingCta" href="#" target="_blank" rel="noopener">カウンセリングを予約する</a>
      </div>

      <div class="sk-restart"><button id="skRestartBtn" class="ghost">もう一度診断する</button></div>

      <div class="sk-disclaimer">
        この診断は写真から読み取れる範囲での目安です。<br>
        姿勢や角度、服装により結果が変わることがあります。
      </div>
    </div>
  `;
}

/** カウンセリングCTAのリンク先を設定 */
export function setupSkeletonCta(url) {
  const cta = document.getElementById("skCounselingCta");
  if (cta) cta.href = url || "#";
}
