/**
 * The 2nd - AI判定サービスモジュール (Google Generative AI SDK)
 */
require('dotenv').config();
const { GoogleGenerativeAI, SchemaType } = require('@google/generative-ai');

const apiKey = process.env.GEMINI_API_KEY || '';
const genAI = new GoogleGenerativeAI(apiKey);

const PRIMARY_MODEL = process.env.PRIMARY_MODEL || 'gemini-1.5-flash';
const FALLBACK_MODEL = process.env.FALLBACK_MODEL || 'gemini-1.5-flash-8b';

/**
 * 提出された回答群をAIに評価させ、知名度ランキングと客観的解説を高速生成する
 * 
 * @param {string} topicText お題テキスト
 * @param {Array<{playerId: string, playerName: string, answerText: string}>} submissions プレイヤーの回答群
 * @returns {Promise<Object>} 判定結果
 */
async function judgeAnswers(topicText, submissions) {
    const prompt = `
あなたはパーティーゲーム「The 2nd」の公正かつスピーディなAI審判です。
このゲームはお題に対して「あえて世間一般で2番目にメジャーな回答」を競うゲームです。

【お題】: "${topicText}"

【提出された回答一覧】:
${JSON.stringify(submissions, null, 2)}

【評価手順・指示（高速判定ルール）】:
1. **お題不適合・無関係回答の判定 (isExcluded)**:
   - お題の条件やカテゴリーを明らかに満たしていない回答は失格（isExcluded: true, rank: 999）としてください。
   - 例: お題「週刊少年ジャンプ作品」に対する「名探偵コナン」(サンデー作品)や無関係な単語。
   - 適合している回答は isExcluded: false としてください。

2. **表記揺れ・最新後継機の迅速な統合 (normalizedCanonicalName)**:
   - 表記揺れ（「ワンピ」「ワンピース」等）は同一グループとして共通の正式名称を割り当ててください。
   - ※重要（思考遅延防止）: 最新後継機や新世代・派生版（例: 「Switch2」「スイッチ2」など）が入力された場合、実在性や発売時期の検証に時間を費やさず、大元の親シリーズ・ブランド（例: 「Nintendo Switch」または「Nintendo Switchシリーズ」）と同等もしくはその派生として柔軟かつ迅速に統合・判定してください。

3. **世間一般的なメジャー度・知名度ランキング (rank)**:
   - 有効な回答（isExcluded: false）のみを対象に、日本国内の一般的な知名度・歴史的定着度の高い順に 1, 2, 3... と順位を決定してください。
   - 同一対象・同一グループと判定された回答群には同じ rank（同順位）を付与してください。
   - 失格回答は rank を 999 としてください。

4. **客観的な解説文 (explanation)**:
   - ※重要: 「ポイント獲得」「失格」「勝利」などのゲーム勝敗文言は含めないでください（勝敗テキストはシステムが表示します）。
   - なぜその順位・知名度と評価されたのか、世間一般の知名度・位置づけ、または除外理由に関する客観的な理由のみを簡潔に1〜2文で記述してください。

必ず指定されたJSONスキーマに従って迅速に出力してください。
`;

    const responseSchema = {
        type: SchemaType.OBJECT,
        properties: {
            results: {
                type: SchemaType.ARRAY,
                description: "提出された各プレイヤーの判定結果一覧",
                items: {
                    type: SchemaType.OBJECT,
                    properties: {
                        playerId: { type: SchemaType.STRING },
                        playerName: { type: SchemaType.STRING },
                        answerText: { type: SchemaType.STRING },
                        normalizedCanonicalName: {
                            type: SchemaType.STRING,
                            description: "表記揺れを統合した正式名称"
                        },
                        isExcluded: {
                            type: SchemaType.BOOLEAN,
                            description: "お題不適合による失格の場合は true"
                        },
                        rank: {
                            type: SchemaType.INTEGER,
                            description: "有効回答内での知名度順位 (1, 2, 3...)。除外時は 999"
                        },
                        explanation: {
                            type: SchemaType.STRING,
                            description: "知名度・位置づけに関する客観的解説（勝敗文言なし）"
                        }
                    },
                    required: ["playerId", "playerName", "answerText", "normalizedCanonicalName", "isExcluded", "rank", "explanation"]
                }
            },
            summaryComment: {
                type: SchemaType.STRING,
                description: "ラウンド全体の回答群に対するAIの総評コメント"
            }
        },
        required: ["results", "summaryComment"]
    };

    // 第1優先モデルで試行
    try {
        return await callGemini(PRIMARY_MODEL, prompt, responseSchema);
    } catch (primaryErr) {
        console.warn(`[AI Service] 第1優先モデル (${PRIMARY_MODEL}) でのエラー: ${primaryErr.message}。第2優先モデル (${FALLBACK_MODEL}) にフォールバックします。`);
        try {
            return await callGemini(FALLBACK_MODEL, prompt, responseSchema);
        } catch (fallbackErr) {
            console.error(`[AI Service] 第2優先モデル (${FALLBACK_MODEL}) も失敗しました:`, fallbackErr);
            return generateFallbackResults(submissions);
        }
    }
}

/**
 * Gemini API 呼び出し共通処理
 */
async function callGemini(modelName, prompt, schema) {
    const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: schema,
            temperature: 0.2
        }
    });

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    return JSON.parse(text);
}

/**
 * 通信遮断時のフェイルセーフ用判定
 */
function generateFallbackResults(submissions) {
    const sorted = [...submissions].sort((a, b) => a.answerText.localeCompare(b.answerText));
    const results = sorted.map((sub, index) => {
        const rank = index + 1;
        return {
            playerId: sub.playerId,
            playerName: sub.playerName,
            answerText: sub.answerText,
            normalizedCanonicalName: sub.answerText,
            isExcluded: false,
            rank: rank,
            explanation: `世間的な知名度・代表性において第${rank}位の回答として評価されました。`
        };
    });

    return {
        results,
        summaryComment: "通信環境または制限のため、オフライン判定モードで集計されました。"
    };
}

module.exports = {
    judgeAnswers
};