/**
 * ホワイトバランス補正モジュール
 *
 * 画像読み込み → 長辺1500pxへリサイズ → 紙のサンプリング →
 * 色かぶり補正 → 補正済み画像の取得 までを担う。
 * 全処理を縮小画像(baseCanvas)基準で行い、高解像度写真でもメモリ安定。
 */

export const MAX_EDGE = 1500; // 読み込み時に長辺をこのサイズへ縮小
const SAMPLE_RADIUS = 15; // タップ周辺サンプリング半径(baseCanvas座標系)
const CLIP_THRESHOLD = 250; // 白飛び判定しきい値

/**
 * File を読み込み、長辺 MAX_EDGE に縮小した canvas を返す。
 * @returns {Promise<HTMLCanvasElement>}
 */
export function loadAndResize(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        if (!img.naturalWidth || !img.naturalHeight) {
          reject(new Error("画像を読み込めませんでした。別の写真でお試しください。"));
          return;
        }
        img.onerror = null;
        const w = img.naturalWidth, h = img.naturalHeight;
        const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
        const bw = Math.max(1, Math.round(w * scale));
        const bh = Math.max(1, Math.round(h * scale));
        const canvas = document.createElement("canvas");
        canvas.width = bw;
        canvas.height = bh;
        canvas.getContext("2d", { willReadFrequently: true }).drawImage(img, 0, 0, bw, bh);
        resolve(canvas);
      };
      img.onerror = () => reject(new Error("画像の表示に失敗しました。HEIC形式の場合は設定でJPEGに変更してお試しください。"));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error("ファイルの読み込みに失敗しました。"));
    reader.readAsDataURL(file);
  });
}

/**
 * baseCanvas 上の (cx, cy) 周辺の平均RGBを取得。
 * @returns {{r:number,g:number,b:number}|null}
 */
export function sampleArea(baseCanvas, cx, cy) {
  const ctx = baseCanvas.getContext("2d", { willReadFrequently: true });
  const x0 = Math.max(0, cx - SAMPLE_RADIUS);
  const y0 = Math.max(0, cy - SAMPLE_RADIUS);
  const x1 = Math.min(baseCanvas.width, cx + SAMPLE_RADIUS);
  const y1 = Math.min(baseCanvas.height, cy + SAMPLE_RADIUS);
  const w = x1 - x0, h = y1 - y0;
  if (w <= 0 || h <= 0) return null;
  const d = ctx.getImageData(x0, y0, w, h).data;
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
  return { r: r / n, g: g / n, b: b / n };
}

/**
 * サンプル値から補正係数を算出。
 * 最も明るいチャンネルを白基準にし、色かぶりだけを補正(明度は保つ)。
 * @returns {{ coef:{kr,kg,kb}, status:'ok'|'clip'|'dark', sample:{r,g,b} }}
 */
export function calcCorrection(sample) {
  const { r, g, b } = sample;
  if (r >= CLIP_THRESHOLD && g >= CLIP_THRESHOLD && b >= CLIP_THRESHOLD) {
    return { status: "clip", sample, coef: null };
  }
  if (r < 90 && g < 90 && b < 90) {
    return { status: "dark", sample, coef: null };
  }
  const maxCh = Math.max(r, g, b);
  return {
    status: "ok",
    sample,
    coef: { kr: maxCh / r, kg: maxCh / g, kb: maxCh / b },
  };
}

/**
 * baseCanvas に補正係数を適用した新しい canvas を返す(元は変更しない)。
 */
export function applyCorrection(baseCanvas, coef) {
  const bw = baseCanvas.width, bh = baseCanvas.height;
  const out = document.createElement("canvas");
  out.width = bw;
  out.height = bh;
  const ctx = out.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(baseCanvas, 0, 0);
  const img = ctx.getImageData(0, 0, bw, bh);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = Math.min(255, d[i] * coef.kr);
    d[i + 1] = Math.min(255, d[i + 1] * coef.kg);
    d[i + 2] = Math.min(255, d[i + 2] * coef.kb);
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

/**
 * canvas を JPEG の base64 文字列(データ部のみ、接頭辞なし)に変換。
 * Claude vision へ送る形式。EXIF はここで自動的に除去される。
 */
export function canvasToBase64(canvas, quality = 0.92) {
  const dataUrl = canvas.toDataURL("image/jpeg", quality);
  return dataUrl.split(",")[1]; // "data:image/jpeg;base64," を除いた部分
}
