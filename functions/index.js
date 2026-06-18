/**
 * パーソナルカラー診断 Cloud Function（第2世代）
 *
 * フロントから補正済み画像（base64）を受け取り、Claude vision で
 * 4軸評価 → 4シーズン判定 → パレットから best_color_ids を選ばせ、
 * Functions 側で検証・色解決してフロントに返す。
 *
 * APIキーは defineSecret で秘匿（コードにも環境にも平文で残さない）。
 */
const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const Anthropic = require("@anthropic-ai/sdk");
const {
    SEASON_LABELS,
    paletteListText,
    resolveColors,
} = require("./palette");

// Secret Manager に登録した ANTHROPIC_API_KEY を参照
const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");

const MODEL = "claude-sonnet-4-6";

// 診断用システムプロンプト（4軸 → 4シーズンの二段構え）
function buildSystemPrompt() {
    return `あなたはパーソナルカラー診断の専門家です。送られた顔写真を分析し、4シーズン（イエベ春/ブルベ夏/イエベ秋/ブルベ冬）のいずれかを判定してください。

【重要な前提】
- この画像はホワイトバランス補正済みです（白い紙を基準に環境光の色かぶりを除去済み）。ただし完全な色精度は保証されないため、判定には confidence を必ず付けてください。
- 診断は「絶対的な断定」ではなく「写真から読み取れる範囲での目安」として行ってください。

【診断の手順】必ずこの順序で分析すること
1. 肌・髪・瞳それぞれを観察し、以下の4軸で評価する：
   - hue（色相）: 黄み寄り(warm) か 青み寄り(cool) か
   - value（明度）: 明るい(high) / 中間(mid) / 暗い(low)
   - chroma（彩度）: 鮮やか(high) / 中間(mid) / 穏やか(low)
   - clarity（清濁）: 澄んだ清色(clear) / 濁りのある濁色(soft)
2. 4軸の総合から、最も近いシーズンを判定する：
   - spring: warm × 明度high × 彩度high × clear（明るく澄んだ暖色）
   - summer: cool × 明度high × 彩度low × soft（やわらかく涼しげ）
   - autumn: warm × 明度low × 彩度low × soft（深く落ち着いたアース系）
   - winter: cool × 明度mid〜low × 彩度high × clear（鮮やかでコントラスト強）
3. イエベ/ブルベの境界が曖昧な場合は、明度・彩度・清濁を優先して判断する。

【出力形式】
必ず以下のJSON形式のみを返すこと。前後に説明文やマークダウン記法（\`\`\`）を一切付けないこと。JSONのみ。`;
}

// シーズン判定後に「色選び」を依頼する指示は、判定とまとめて1回で返させる。
// 全シーズンのパレットを提示し、判定したシーズンのIDから選ばせる。
function buildUserText() {
    return `この顔写真をパーソナルカラー診断してください。

判定後、その人に特に似合う色を、判定したシーズンの下記パレットから4〜6個選び、その id を best_color_ids に入れてください。パレットにない id を作らないこと。

春パレット: ${paletteListText("spring")}
夏パレット: ${paletteListText("summer")}
秋パレット: ${paletteListText("autumn")}
冬パレット: ${paletteListText("winter")}

以下のJSON形式で返してください（このJSONのみ。前後に文章やコードブロック記法を付けない）:
{
  "axes": { "hue": "warm|cool", "value": "high|mid|low", "chroma": "high|mid|low", "clarity": "clear|soft" },
  "season": "spring|summer|autumn|winter",
  "confidence": "high|medium|low",
  "features": { "skin": "肌の特徴（日本語30字程度）", "hair": "髪の特徴", "eyes": "瞳の特徴" },
  "best_color_ids": ["判定シーズンのidを4〜6個"],
  "advice": "似合う色の傾向と着こなしのアドバイス（日本語80字程度）",
  "counseling_hook": "プロのカウンセリングへ自然につなげる一言（日本語60字程度）"
}`;
}

// Claude応答からJSONを安全に取り出す（前後の余計な文字やコードブロックを除去）
function extractJson(text) {
    if (!text) return null;
    let t = text.trim();
    // ```json ... ``` のコードブロックを除去
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
    // 最初の { から最後の } までを抜き出す
    const start = t.indexOf("{");
    const end = t.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return null;
    const slice = t.slice(start, end + 1);
    try {
        return JSON.parse(slice);
    } catch (e) {
        return null;
    }
}

const VALID_SEASONS = ["spring", "summer", "autumn", "winter"];

exports.diagnose = onRequest(
    {
        region: "asia-northeast1",
        secrets: [ANTHROPIC_API_KEY],
        cors: true, // 開発中は true。公開時は Hosting 同一オリジンなので問題なし
        memory: "512MiB",
        timeoutSeconds: 60,
    },
    async (req, res) => {
        if (req.method !== "POST") {
            res.status(405).json({ error: "POST のみ受け付けます" });
            return;
        }

        try {
            const { imageBase64, mediaType } = req.body || {};
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
                            { type: "text", text: buildUserText() },
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

            // シーズン検証
            const season = VALID_SEASONS.includes(parsed.season) ? parsed.season : null;
            if (!season) {
                logger.error("Invalid season", { parsed });
                res.status(502).json({ error: "診断結果が不正でした。もう一度お試しください。" });
                return;
            }

            // best_color_ids をパレットと照合して name/hex 付きに解決
            const colors = resolveColors(season, parsed.best_color_ids);

            // フロントに返す整形済みデータ
            res.status(200).json({
                season,
                season_label: SEASON_LABELS[season],
                axes: parsed.axes || null,
                confidence: parsed.confidence || "medium",
                features: parsed.features || null,
                colors, // [{ id, name, hex }]
                advice: parsed.advice || "",
                counseling_hook: parsed.counseling_hook || "",
            });
        } catch (err) {
            logger.error("diagnose error", { message: err.message, stack: err.stack });
            // Anthropic APIのエラーを切り分け
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
