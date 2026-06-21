/**
 * 骨格分析モジュール。
 *
 * MediaPipe Pose が検出した33個のランドマークから、骨格診断に使う比率・重心
 * などの数値を計算する。あわせて「全身が写っているか」「複数人でないか」の
 * 異常系チェックも行う。判定そのものは行わず、Claude に渡す材料を整える役。
 *
 * 役割分担：このモジュール（フロント）で検出・計算・チェック → 問題なければ
 * 数値と画像を Functions に送り、Claude vision が最終的なタイプ判定を行う。
 */

// MediaPipe Pose の33ランドマークのうち、骨格診断で使う点のインデックス
export const LM = {
  nose: 0,
  leftEar: 7,
  rightEar: 8,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
};

// visibility（その点が実際に写っているかの信頼度 0〜1）のしきい値
const VISIBILITY_THRESHOLD = 0.5;

/**
 * 2点間の距離を計算する（正規化座標。アスペクト比を考慮してピクセル換算）。
 * @param {Object} a - ランドマークa（x, y は 0〜1 の正規化座標）。
 * @param {Object} b - ランドマークb。
 * @param {number} w - 画像の幅（px）。
 * @param {number} h - 画像の高さ（px）。
 * @returns {number} 2点間のピクセル距離。
 */
function dist(a, b, w, h) {
  const dx = (a.x - b.x) * w;
  const dy = (a.y - b.y) * h;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * 2点の中点を返す。
 * @param {Object} a - ランドマークa。
 * @param {Object} b - ランドマークb。
 * @returns {{x:number, y:number}} 中点の正規化座標。
 */
function midpoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * 検出結果が骨格診断に使えるかを検証する（全身・複数人チェック）。
 *
 * @param {Array} allLandmarks - MediaPipe が返した検出結果の landmarks 配列
 *   （要素1つが1人分の33点。複数人いれば複数要素）。
 * @returns {{ok:boolean, reason?:string}} 使える場合 ok:true。
 *   使えない場合 ok:false と、ユーザー向けの理由(reason)を返す。
 */
export function validateDetection(allLandmarks) {
  // 人物が検出されなかった
  if (!allLandmarks || allLandmarks.length === 0) {
    return { ok: false, reason: "人物の骨格を検出できませんでした。全身がはっきり写った写真でお試しください。" };
  }
  // 複数人が写っている
  if (allLandmarks.length >= 2) {
    return { ok: false, reason: "複数の人物が写っています。お一人で写った写真でお試しください。" };
  }

  const lm = allLandmarks[0];

  // 全身チェック：重心や手足の計算に必要な主要点が写っているか
  // 特に足首が写っていないと下半身の長さ（重心）が測れない
  const required = [
    { idx: LM.leftShoulder, name: "肩" },
    { idx: LM.rightShoulder, name: "肩" },
    { idx: LM.leftHip, name: "腰" },
    { idx: LM.rightHip, name: "腰" },
    { idx: LM.leftAnkle, name: "足首" },
    { idx: LM.rightAnkle, name: "足首" },
  ];
  for (const { idx, name } of required) {
    const point = lm[idx];
    // visibility が低い = その部位が写っていない/見切れている
    if (!point || (point.visibility ?? 0) < VISIBILITY_THRESHOLD) {
      return {
        ok: false,
        reason: `${name}がはっきり写っていません。頭から足先まで全身が入る写真で、正面から撮影してください。`,
      };
    }
  }

  return { ok: true };
}

/**
 * 33点から骨格診断に使う数値を計算する。
 *
 * 計算する数値（すべて比率なので、身長や撮影距離に依存しない）：
 *   - shoulderHipRatio: 肩幅 / 腰幅。フレームのバランス。
 *   - upperLowerRatio: 上半身 / 下半身 の長さ比。重心の上下（>1で上重心）。
 *   - limbBodyRatio: 手足の長さ / 胴体の長さ。手足の長短（ナチュラル傾向）。
 *   - neckRatio: 首の長さ / 肩幅。首の長短。
 *
 * @param {Array} landmarks - 1人分の33ランドマーク。
 * @param {number} w - 画像の幅（px）。
 * @param {number} h - 画像の高さ（px）。
 * @returns {Object} 上記の比率を含むオブジェクト（各数値は小数）。
 */
export function computeMetrics(landmarks, w, h) {
  const lm = landmarks;

  const shoulderMid = midpoint(lm[LM.leftShoulder], lm[LM.rightShoulder]);
  const hipMid = midpoint(lm[LM.leftHip], lm[LM.rightHip]);
  const ankleMid = midpoint(lm[LM.leftAnkle], lm[LM.rightAnkle]);
  const earMid = midpoint(lm[LM.leftEar], lm[LM.rightEar]);

  // 肩幅・腰幅
  const shoulderW = dist(lm[LM.leftShoulder], lm[LM.rightShoulder], w, h);
  const hipW = dist(lm[LM.leftHip], lm[LM.rightHip], w, h);

  // 上半身（肩中点〜腰中点）と下半身（腰中点〜足首中点）の長さ
  const upperLen = dist(shoulderMid, hipMid, w, h);
  const lowerLen = dist(hipMid, ankleMid, w, h);

  // 腕の長さ（肩〜肘〜手首）と脚の長さ（腰〜膝〜足首）。左右平均
  const leftArm = dist(lm[LM.leftShoulder], lm[LM.leftElbow], w, h) + dist(lm[LM.leftElbow], lm[LM.leftWrist], w, h);
  const rightArm = dist(lm[LM.rightShoulder], lm[LM.rightElbow], w, h) + dist(lm[LM.rightElbow], lm[LM.rightWrist], w, h);
  const armLen = (leftArm + rightArm) / 2;

  const leftLeg = dist(lm[LM.leftHip], lm[LM.leftKnee], w, h) + dist(lm[LM.leftKnee], lm[LM.leftAnkle], w, h);
  const rightLeg = dist(lm[LM.rightHip], lm[LM.rightKnee], w, h) + dist(lm[LM.rightKnee], lm[LM.rightAnkle], w, h);
  const legLen = (leftLeg + rightLeg) / 2;

  // 胴体の長さ（肩中点〜腰中点）を基準に手足の長さを正規化
  const torsoLen = upperLen;

  // 首の長さの目安（肩中点〜耳中点）
  const neckLen = dist(shoulderMid, earMid, w, h);

  return {
    shoulderHipRatio: round2(hipW > 0 ? shoulderW / hipW : 0),
    upperLowerRatio: round2(lowerLen > 0 ? upperLen / lowerLen : 0),
    limbBodyRatio: round2(torsoLen > 0 ? (armLen + legLen) / 2 / torsoLen : 0),
    neckRatio: round2(shoulderW > 0 ? neckLen / shoulderW : 0),
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
