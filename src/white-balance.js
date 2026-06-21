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
 * 画像ファイルを読み込み、長辺が MAX_EDGE（1500px）以下になるよう縮小したcanvas を返す。
 *
 * このアプリの画像処理すべての起点となる関数。読み込んだ時点で縮小することで、
 * 以降の処理（サンプリング・補正・base64化）をすべて軽い縮小画像に対して行え、
 * iPhoneの高解像度写真（1200万画素級）でもメモリ不足でブラウザが落ちるのを防ぐ。
 *
 * 読み込みは FileReader で dataURL に変換してから Image に渡す方式。
 * 一部の環境で URL.createObjectURL が onload を発火させない問題を避けるため。
 *
 * @param {File} file - ユーザーが選択・撮影した画像ファイル（input[type=file]から取得）。
 * @returns {Promise<HTMLCanvasElement>} 縮小済みのcanvasを解決するPromise。
 * @throws {Error} 画像が読み込めない場合（壊れたファイル、未対応のHEIC形式など）に
 *   reject される。エラーメッセージはユーザー向けの日本語文言。
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
      img.src = reader.result; // ← これがdataURL
    };
    reader.onerror = () => reject(new Error("ファイルの読み込みに失敗しました。"));
    reader.readAsDataURL(file);
  });
}

/**
 * canvas上の指定座標を中心とした周辺領域の平均RGBを取得する。
 *
 * ホワイトバランス補正で「白い紙」の実際の写り色を測るために使う。
 * 1ピクセルだけだとノイズの影響を受けやすいため、中心から SAMPLE_RADIUS（15px）四方の
 * 矩形領域を平均してなめらかな代表色を得る。
 * 領域が canvas の端にかかる場合は、はみ出さないよう自動でクランプする。
 *
 * @param {HTMLCanvasElement} baseCanvas - サンプリング対象のcanvas（縮小済みの処理用canvas）。
 * @param {number} cx - サンプリング中心のX座標（baseCanvasのピクセル座標系）。
 * @param {number} cy - サンプリング中心のY座標（baseCanvasのピクセル座標系）。
 * @returns {{r:number, g:number, b:number}|null} 平均RGB値（各0〜255、小数を含む）。
 *   サンプリング領域の幅・高さが0以下になる場合（座標が範囲外など）は null を返す。
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
 * サンプリングした「白い紙」の色から、ホワイトバランス補正の係数を算出する。
 *
 * 白い紙は本来どのチャンネルも同じ値（R=G=B）で写るはず。しかし環境光に
 * 色味があると、例えば電球色なら R が高く B が低い、といったズレが生じる。
 * このズレを打ち消す係数を求めるのがこの関数。
 *
 * 算出方式は「サンプルの最も明るいチャンネルを基準にし、他の2チャンネルをそれに合わせる」。
 *
 * @param {{r:number, g:number, b:number}} sample - sampleArea で取得した紙の平均RGB。
 * @returns {{status:string, sample:Object, coef:{kr:number, kg:number, kb:number}|null}}
 */
export function calcCorrection(sample) {
  const { r, g, b } = sample;
  // "clip"（白飛び）/"dark"（暗すぎ）のときは coef は null で、呼び出し側(onTapCanvas)で撮り直しを促す。
  // coef = coefficient = 係数(掛ける数)
  // 全チャンネルが250以上
  if (r >= CLIP_THRESHOLD && g >= CLIP_THRESHOLD && b >= CLIP_THRESHOLD) {
    return { status: "clip", sample, coef: null };
  }
  // 全チャンネルが90未満
  if (r < 90 && g < 90 && b < 90) {
    return { status: "dark", sample, coef: null };
  }
  const maxCh = Math.max(r, g, b);
  // status が "ok" のときのみ coef に補正係数が入る（kr/kg/kbは各チャンネルの倍率）。
  // ドイツ語のKoeffizientに由来 kr/kg/kb = R/G/Bそれぞれの係数
  return {
    status: "ok",
    sample,
    coef: { kr: maxCh / r, kg: maxCh / g, kb: maxCh / b },
  };
}

/**
 * baseCanvas に補正係数を適用し、色かぶりを除去した新しいcanvasを返す。
 *
 * calcCorrection で求めた係数（kr/kg/kb）を、画像の全ピクセルのR/G/B各値に
 * 掛けることで、画像全体から環境光の色かぶりを打ち消す。紙が白く写るのと
 * 同じ補正が顔にもかかるため、結果として肌・髪・瞳が「補正された色」になる。
 *
 * @param {HTMLCanvasElement} baseCanvas - 補正前の縮小済みcanvas（変更されない）。
 * @param {{kr:number, kg:number, kb:number}} coef - calcCorrection が返した補正係数。
 * @returns {HTMLCanvasElement} 補正を適用した新しいcanvas。
 */
export function applyCorrection(baseCanvas, coef) {
  // 元の baseCanvas は変更せず、新しいcanvasにコピーしてから加工する（非破壊）。
  const bw = baseCanvas.width, bh = baseCanvas.height;
  const out = document.createElement("canvas");
  out.width = bw;
  out.height = bh;
  const ctx = out.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(baseCanvas, 0, 0);
  const img = ctx.getImageData(0, 0, bw, bh);
  const d = img.data;
  // 各ピクセルの値は Math.min で255を上限にクランプする。
  // 1ピクセルが4つの数字でできているから、ループを4つずつ進める
  for (let i = 0; i < d.length; i += 4) {
    d[i] = Math.min(255, d[i] * coef.kr);// 赤に係数krを掛ける
    d[i + 1] = Math.min(255, d[i + 1] * coef.kg);// 緑に係数kgを掛ける
    d[i + 2] = Math.min(255, d[i + 2] * coef.kb);// 青に係数kbを掛ける
    // d[i + 3] = A(透明度) ← これは触らない
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

/**
 * canvas の内容を JPEG の base64 文字列（データ部分のみ）に変換する。
 *
 * 補正済みの画像を Claude vision API へ送るための形式。Anthropic の API は
 * 画像を base64 文字列で受け取る仕様のため、canvas をこの形式に変換する。
 *
 * この変換の過程で EXIF（位置情報・撮影時刻などのメタデータ）は自動的に
 * 除去される。canvas に描画した時点で元画像のメタデータは引き継がれないため、
 * 別途削除処理を書かなくても、プライバシー情報を含まない画像が送られる。
 *
 * @param {HTMLCanvasElement} canvas - 変換対象のcanvas（通常は補正済みの画像）。
 * @param {number} [quality=0.92] - JPEG圧縮品質（0〜1）。高いほど高画質・大容量。
 * @returns {string} base64エンコードされた画像データ（dataURLの接頭辞を含まない）。
 */
export function canvasToBase64(canvas, quality = 0.92) {
  const dataUrl = canvas.toDataURL("image/jpeg", quality);
  return dataUrl.split(",")[1]; // "data:image/jpeg;base64," を除いた部分
}
