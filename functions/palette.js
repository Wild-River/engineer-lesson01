/**
 * パーソナルカラー 4シーズン固定パレット（48色）
 * このファイルが色の「正」。フロントは診断結果として name/hex を受け取るだけ。
 * Claude には各シーズンの id と name を提示し、best_color_ids で選ばせる。
 */
const PALETTES = {
  spring: [
    { id: "sp01", name: "コーラルピンク",       hex: "#FF8A6E" },
    { id: "sp02", name: "ライトイエロー",       hex: "#FCE187" },
    { id: "sp03", name: "アップルグリーン",     hex: "#A8D86B" },
    { id: "sp04", name: "ピーチ",               hex: "#FFB59A" },
    { id: "sp05", name: "ブライトターコイズ",   hex: "#4FC9C0" },
    { id: "sp06", name: "クリアオレンジ",       hex: "#FF9D45" },
    { id: "sp07", name: "ウォームピンク",       hex: "#FF9CA8" },
    { id: "sp08", name: "ライトグラスグリーン", hex: "#8FD17A" },
    { id: "sp09", name: "サニーゴールド",       hex: "#FFC94D" },
    { id: "sp10", name: "アクアブルー",         hex: "#73CFE8" },
    { id: "sp11", name: "サーモン",             hex: "#FF9E7A" },
    { id: "sp12", name: "アイボリー",           hex: "#FBEFD4" },
  ],
  summer: [
    { id: "su01", name: "ローズピンク",         hex: "#E59AB0" },
    { id: "su02", name: "ラベンダー",           hex: "#B7A8D6" },
    { id: "su03", name: "パウダーブルー",       hex: "#A8C5E0" },
    { id: "su04", name: "ミントグリーン",       hex: "#A8D6C4" },
    { id: "su05", name: "スモーキーピンク",     hex: "#D9A8B0" },
    { id: "su06", name: "グレイッシュブルー",   hex: "#8FA8C2" },
    { id: "su07", name: "ライラック",           hex: "#C9B3D9" },
    { id: "su08", name: "ソフトネイビー",       hex: "#5E6E8C" },
    { id: "su09", name: "ローズベージュ",       hex: "#D9B5AE" },
    { id: "su10", name: "アクアミント",         hex: "#9ED3D0" },
    { id: "su11", name: "ペールピンク",         hex: "#F2C4D0" },
    { id: "su12", name: "オフホワイト",         hex: "#F0ECE8" },
  ],
  autumn: [
    { id: "au01", name: "テラコッタ",           hex: "#C66B47" },
    { id: "au02", name: "マスタード",           hex: "#D4A12E" },
    { id: "au03", name: "オリーブ",             hex: "#8A8B4A" },
    { id: "au04", name: "ブリックレッド",       hex: "#A8472F" },
    { id: "au05", name: "キャメル",             hex: "#C8975A" },
    { id: "au06", name: "フォレストグリーン",   hex: "#4E6645" },
    { id: "au07", name: "パンプキン",           hex: "#D77E3A" },
    { id: "au08", name: "ディープブラウン",     hex: "#6E4A30" },
    { id: "au09", name: "カーキ",               hex: "#9A8754" },
    { id: "au10", name: "サーモンベージュ",     hex: "#D69A78" },
    { id: "au11", name: "ボトルティール",       hex: "#3E6660" },
    { id: "au12", name: "クリームベージュ",     hex: "#E6D2A8" },
  ],
  winter: [
    { id: "wi01", name: "ロイヤルブルー",       hex: "#2B4FA0" },
    { id: "wi02", name: "マゼンタ",             hex: "#C8327D" },
    { id: "wi03", name: "ピュアホワイト",       hex: "#FBFBFD" },
    { id: "wi04", name: "トゥルーレッド",       hex: "#D11F3A" },
    { id: "wi05", name: "エメラルド",           hex: "#1F8C6E" },
    { id: "wi06", name: "アイシーピンク",       hex: "#F2B8D2" },
    { id: "wi07", name: "ディープバイオレット", hex: "#5E338C" },
    { id: "wi08", name: "ブラック",             hex: "#1C1E24" },
    { id: "wi09", name: "サファイア",           hex: "#1B5FAE" },
    { id: "wi10", name: "フューシャ",           hex: "#D6357F" },
    { id: "wi11", name: "アイスブルー",         hex: "#A8D0E8" },
    { id: "wi12", name: "チャコールグレー",     hex: "#3A3E48" },
  ],
};

const SEASON_LABELS = {
  spring: "イエベ春（スプリング）",
  summer: "ブルベ夏（サマー）",
  autumn: "イエベ秋（オータム）",
  winter: "ブルベ冬（ウィンター）",
};

// Claude に提示する「シーズンのパレット一覧」テキストを生成
function paletteListText(season) {
  return PALETTES[season]
    .map((c) => `${c.id} ${c.name}`)
    .join(" / ");
}

// best_color_ids を検証し、name/hex 付きの配列に変換（不正なIDは除外）
function resolveColors(season, ids) {
  const palette = PALETTES[season] || [];
  const byId = Object.fromEntries(palette.map((c) => [c.id, c]));
  const resolved = [];
  if (Array.isArray(ids)) {
    for (const id of ids) {
      if (byId[id] && !resolved.find((c) => c.id === id)) {
        resolved.push(byId[id]);
      }
    }
  }
  // 1色も解決できなかった場合は、そのシーズンの先頭4色をフォールバックで返す
  if (resolved.length === 0) {
    return palette.slice(0, 4);
  }
  return resolved;
}

module.exports = {
  PALETTES,
  SEASON_LABELS,
  paletteListText,
  resolveColors,
};
