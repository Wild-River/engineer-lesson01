/**
 * 骨格タイプ別のシルエット・ネックラインを描く SVG 図案モジュール。
 *
 * 写実的なイラストではなく、トルソー（マネキン）を模した図案的な線画で、
 * 各タイプの似合うシルエットとネックラインを表現する。サロン風の上品な線。
 * 結果画面で、判定されたタイプの図案を表示するために使う。
 *
 * silhouette: i-line（直線的）/ fit-flare（くびれ＋裾広がり）/ relaxed（ゆとり直線）
 * neckline:   v-neck / round-neck / loose-neck
 */

// 共通のスタイル（線の色・太さはCSS変数で上書き可能に）
const STROKE = 'stroke="var(--fig-line, #3a3631)" fill="none" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"';
const FILL = 'fill="var(--fig-fill, #f3ede2)"';

/**
 * シルエット図案のSVGパスを返す（トルソー形状）。
 * @param {string} type - "i-line" | "fit-flare" | "relaxed"
 * @returns {string} svg内に置く図形要素のHTML文字列。
 */
function silhouettePath(type) {
  if (type === "i-line") {
    // ストレート: 肩から裾までほぼ直線的、縦長で立体的
    return `
      <path ${FILL} ${STROKE} d="
        M 60 40
        L 90 52 L 92 200 L 88 320 L 62 322 L 58 200 Z" transform="translate(8,0)"/>
      <path ${FILL} ${STROKE} d="
        M 60 40
        C 48 44 42 56 40 70
        L 36 120 L 30 122 L 34 66
        C 38 46 48 36 60 40 Z"/>
      <path ${FILL} ${STROKE} d="
        M 60 40
        C 72 44 78 56 80 70
        L 84 120 L 90 122 L 86 66
        C 82 46 72 36 60 40 Z" transform="translate(48,0) scale(-1,1)" transform-origin="center"/>
    `;
  }
  if (type === "fit-flare") {
    // ウェーブ: くびれがあり裾がフレアに広がる、曲線的
    return `
      <path ${FILL} ${STROKE} d="
        M 64 42
        C 84 48 88 70 86 95
        C 84 120 76 135 78 150
        C 82 175 96 220 104 320
        L 70 322
        C 68 240 66 200 64 180
        C 62 200 60 240 58 322
        L 24 320
        C 32 220 46 175 50 150
        C 52 135 44 120 42 95
        C 40 70 44 48 64 42 Z"/>
    `;
  }
  // relaxed: ナチュラル、ゆとりのある直線でフレーム感
  return `
    <path ${FILL} ${STROKE} d="
      M 50 44
      L 96 44
      L 104 90 L 98 96 L 96 92
      L 100 200 L 96 322 L 70 322
      L 68 210 L 62 210 L 60 322 L 34 322
      L 30 200 L 34 92 L 32 96 L 26 90 Z"/>
  `;
}

/**
 * ネックライン図案のSVGパスを返す（首元のアップ）。
 * @param {string} type - "v-neck" | "round-neck" | "loose-neck"
 * @returns {string} svg内に置く図形要素のHTML文字列。
 */
function necklinePath(type) {
  // 肩のベースライン（共通）
  const shoulders = `<path ${FILL} ${STROKE} d="M 20 50 L 50 30 L 70 30 L 100 50 L 100 95 L 20 95 Z"/>`;
  if (type === "v-neck") {
    // V字に深く開く
    return `${shoulders}
      <path ${STROKE} fill="var(--fig-bg, #fff)" d="M 50 30 L 60 64 L 70 30 Z"/>`;
  }
  if (type === "round-neck") {
    // 浅めの丸い開き
    return `${shoulders}
      <path ${STROKE} fill="var(--fig-bg, #fff)" d="M 50 30 Q 60 50 70 30 Z"/>`;
  }
  // loose-neck: ゆるめ・抜け感のある広く浅い開き
  return `${shoulders}
    <path ${STROKE} fill="var(--fig-bg, #fff)" d="M 46 30 Q 60 46 74 30 Z"/>`;
}

/**
 * シルエットのSVG全体を返す。
 * @param {string} type - silhouette種別。
 * @returns {string} 完結したsvg要素。
 */
export function silhouetteSVG(type) {
  return `<svg viewBox="0 0 128 340" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">${silhouettePath(type)}</svg>`;
}

/**
 * ネックラインのSVG全体を返す。
 * @param {string} type - neckline種別。
 * @returns {string} 完結したsvg要素。
 */
export function necklineSVG(type) {
  return `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">${necklinePath(type)}</svg>`;
}
