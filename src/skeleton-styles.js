/**
 * 骨格診断 3タイプの「似合う服」データ。
 *
 * プロの骨格診断の知見をもとに、各タイプのシルエット・ネックライン・得意素材・
 * 着こなしのポイント・避けたい要素を構造化したもの。
 * neckline は画像(necklineImg)で表示、タグは materials / points / avoid を使う。
 *
 * Functions 側でも参照し、Claude が判定したタイプに対応するデータを返す。
 */
export const SKELETON_STYLES = {
  straight: {
    label: "ストレート",
    en: "Straight",
    catch: "上重心・メリハリのある立体的なボディ",
    // SVGシルエットの種別（図案側で分岐）
    silhouette: "i-line",      // Iライン・縦長・直線的
    silhouetteLabel: "Iライン（縦長・直線的）",
    neckline: "v-neck",        // Vネックなど開きのあるネックライン
    necklineLabel: "Vネック・開きのあるネックライン",
    necklineImg: "/neck-straight.webp",
    materials: ["ハリのある素材", "上質な素材", "厚みのある素材"],
    points: ["ジャストサイズ", "シンプルなデザイン", "引き算のスタイル"],
    avoid: ["過度な装飾", "オーバーサイズ", "首元に厚みが出るデザイン"],
    advice: "厚みとハリのある上質な素材を、ジャストサイズで。首元を適度に開けて縦のラインを意識すると、立体的な体型がすっきり映えます。",
  },
  wave: {
    label: "ウェーブ",
    en: "Wave",
    catch: "下重心・華奢で柔らかい曲線的なボディ",
    silhouette: "fit-flare",   // フィット&フレア・曲線的
    silhouetteLabel: "フィット&フレア（曲線的）",
    neckline: "round-neck",    // ラウンド・浅めのネックラインで華奢さを活かす
    necklineLabel: "ラウンドネック・浅めのネックライン",
    necklineImg: "/neck-wave.webp",
    materials: ["柔らかい素材", "とろみ素材", "シフォン・レース"],
    points: ["ハイウエスト", "上半身にボリューム", "装飾やデザインを活かす"],
    avoid: ["厚手の素材", "ビッグシルエット", "重い・硬い素材"],
    advice: "柔らかくとろみのある素材で、ウエストを高めに。上半身にボリュームや装飾を添えると、華奢な曲線が女性らしく引き立ちます。",
  },
  natural: {
    label: "ナチュラル",
    en: "Natural",
    catch: "骨や関節のフレーム感が特徴的なボディ",
    silhouette: "relaxed",     // リラックス感のあるシルエット
    silhouetteLabel: "リラックス感のあるシルエット",
    neckline: "loose-neck",    // ゆるめ・抜け感
    necklineLabel: "ゆるめ・抜け感のある首元",
    necklineImg: "/neck-natural.webp",
    materials: ["麻・コットン", "デニム", "ツイード・厚手"],
    points: ["適度な余白", "ラフな着こなし", "大ぶりの小物"],
    avoid: ["タイトすぎる服", "コンパクトすぎる服", "華奢な小物"],
    advice: "麻やデニムなど天然素材を、適度な余白を持たせて。ロングジレやワイドパンツ、大ぶりの小物で、骨格のフレーム感をスタイリッシュに活かせます。",
  },
};

export const SKELETON_LABELS = {
  straight: "ストレート",
  wave: "ウェーブ",
  natural: "ナチュラル",
};