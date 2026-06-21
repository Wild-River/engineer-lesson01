/**
 * 骨格診断 Cloud Function（第2世代）
 *
 * フロントから「MediaPipeで計算した4つの比率」＋「全身画像（base64）」を受け取り、
 * Claude vision で骨格タイプ（ストレート/ウェーブ/ナチュラル）を判定する。
 *
 * 設計の要点（役割分担）：
 * - 画像分析が主軸：質感（筋肉のハリ/脂肪の柔らかさ/骨のフレーム感）、立体感
 *   （デコルテの厚み、鎖骨の出方）、関節の大きさなど、数値化できない部分を見る。
 * - 数値は補強：重心（上半身/下半身比）やフレームの比率を、客観的な裏付けに使う。
 * - 骨格は単純な数式では割り切れず、ミックスタイプも存在するため、総合判断させる。
 *
 * APIキーは defineSecret で秘匿。
 */
const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const Anthropic = require("@anthropic-ai/sdk");

const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");
const MODEL = "claude-sonnet-4-6";

const SKELETON_LABELS = {
  straight: "ストレート",
  wave: "ウェーブ",
  natural: "ナチュラル",
};

function buildSystemPrompt() {
  return `あなたは骨格診断の専門家です。送られた全身写真と、画像解析で得られた身体の比率データをもとに、骨格タイプ（ストレート / ウェーブ / ナチュラル）を判定してください。

【重要な前提】
- 骨格診断は本来、対面で骨や関節、筋肉や脂肪のつき方、質感を見て総合的に判断するものです。写真からの判定には限界があるため、confidence（確度）を必ず付けてください。
- 「絶対的な断定」ではなく「写真から読み取れる範囲での目安」として判定してください。
- すべての特徴がひとつのタイプに完全に当てはまる人はむしろ少なく、ミックスタイプも存在します。複数の要素を総合して、最も近いタイプを選んでください。

【判定の手順】必ずこの順序で分析すること
1. まず画像から、以下の3つの観点を評価する（これが主軸）：
   - frame（骨格のフレーム感）: 骨や関節が目立つか。strong（太く目立つ）/ medium / fine（華奢で目立たない）
   - flesh（肉感・質感）: muscular（筋肉のハリ・弾力）/ soft（柔らかい脂肪感）/ bony（骨感が中心で肉感が少ない）
   - gravity（重心）: upper（上重心）/ balanced（偏りが少ない）/ lower（下重心）
2. 補助として、与えられた比率データを上の評価の裏付けに使う：
   - shoulderHipRatio（肩幅/腰幅）, upperLowerRatio（上半身/下半身。大きいほど上重心）,
     limbBodyRatio（手足/胴体。大きいほど手足が長い）, neckRatio（首/肩幅。大きいほど首が長い）
3. 3観点の総合から、最も近いタイプを判定する：
   - straight（ストレート）: 筋肉のハリがあり立体的（flesh=muscular）、上重心（gravity=upper）、鎖骨が目立ちにくくデコルテに厚み。フレームは medium。
   - wave（ウェーブ）: 華奢で柔らかい曲線（frame=fine, flesh=soft）、下重心（gravity=lower）、上半身が薄い。
   - natural（ナチュラル）: 骨や関節のフレーム感が強い（frame=strong, flesh=bony）、手足が長めで関節が目立つ。重心の偏りは小さい傾向だが、上重心・下重心のナチュラルも存在する。

【出力形式】
必ず以下のJSON形式のみを返すこと。前後に説明文やマークダウン記法（\`\`\`）を一切付けないこと。JSONのみ。`;
}

function buildUserText(metrics) {
  const m = metrics || {};
  return `この全身写真から骨格タイプを診断してください。

画像解析で得られた身体の比率データ（補助情報）:
- 肩幅 / 腰幅 比: ${m.shoulderHipRatio ?? "不明"}
- 上半身 / 下半身 比（大きいほど上重心）: ${m.upperLowerRatio ?? "不明"}
- 手足 / 胴体 比（大きいほど手足が長い）: ${m.limbBodyRatio ?? "不明"}
- 首 / 肩幅 比（大きいほど首が長い）: ${m.neckRatio ?? "不明"}

写真が斜めや横向きの場合、比率データは歪むことがあります。その場合は画像の見た目を優先して判断してください。

以下のJSON形式で返してください（このJSONのみ。前後に文章やコードブロック記法を付けない）:
{
  "axes": { "frame": "strong|medium|fine", "flesh": "muscular|soft|bony", "gravity": "upper|balanced|lower" },
  "type": "straight|wave|natural",
  "confidence": "high|medium|low",
  "features": { "frame": "骨格・関節の印象（日本語40字程度）", "flesh": "肉感・質感の印象", "balance": "重心・体のバランスの印象" },
  "advice": "似合うファッションの方向性のアドバイス（日本語80字程度）",
  "counseling_hook": "プロの対面診断へ自然につなげる一言（日本語60字程度）"
}`;
}

function extractJson(text) {
  if (!text) return null;
  let t = text.trim();
  t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(t.slice(start, end + 1));
  } catch (e) {
    return null;
  }
}

const VALID_TYPES = ["straight", "wave", "natural"];

exports.diagnoseSkeleton = onRequest(
  {
    region: "asia-northeast1",
    secrets: [ANTHROPIC_API_KEY],
    cors: true,
    memory: "512MiB",
    timeoutSeconds: 60,
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "POST のみ受け付けます" });
      return;
    }

    try {
      const { imageBase64, mediaType, metrics } = req.body || {};
      if (!imageBase64) {
        res.status(400).json({ error: "画像データがありません" });
        return;
      }

      const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() });

      const message = await client.messages.create({
        model: MODEL,
        max_tokens: 1024,
        system: buildSystemPrompt(),
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mediaType || "image/jpeg",
                  data: imageBase64,
                },
              },
              { type: "text", text: buildUserText(metrics) },
            ],
          },
        ],
      });

      const rawText = (message.content || [])
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n");

      const parsed = extractJson(rawText);
      if (!parsed) {
        logger.error("JSON parse failed", { rawText });
        res.status(502).json({ error: "診断結果の解析に失敗しました。もう一度お試しください。" });
        return;
      }

      const type = VALID_TYPES.includes(parsed.type) ? parsed.type : null;
      if (!type) {
        logger.error("Invalid type", { parsed });
        res.status(502).json({ error: "診断結果が不正でした。もう一度お試しください。" });
        return;
      }

      res.status(200).json({
        type,
        type_label: SKELETON_LABELS[type],
        axes: parsed.axes || null,
        confidence: parsed.confidence || "medium",
        features: parsed.features || null,
        advice: parsed.advice || "",
        counseling_hook: parsed.counseling_hook || "",
      });
    } catch (err) {
      logger.error("diagnoseSkeleton error", { message: err.message, stack: err.stack });
      const status = err.status || 500;
      if (status === 401) {
        res.status(500).json({ error: "APIキーの認証に失敗しました（サーバー設定を確認してください）" });
      } else if (status === 429) {
        res.status(429).json({ error: "アクセスが集中しています。少し時間をおいてお試しください。" });
      } else {
        res.status(500).json({ error: "診断中にエラーが発生しました。もう一度お試しください。" });
      }
    }
  }
);
