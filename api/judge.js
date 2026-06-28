// Vercel Serverless Function: POST /api/judge
//
// APIキーは Vercel のプロジェクト設定 → Environment Variables に
// CLAUDE_API_KEY という名前で設定してください。コードには書かないこと。

const CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";
const CLAUDE_MODEL   = "claude-sonnet-4-6";

const SYSTEM_PROMPT = `あなたは自動車の「低排出ガス認定ラベル」を画像から判定する専門システムです。
判定対象ラベルの特徴
* 形状: 青色系の楕円形
* 内容: 星マーク（0〜5個）と「低排出ガス車」の文字
* 位置: 車のボディに貼付
判定ルール
以下のいずれかに分類してください。
1. OK: ラベルが画像内に明確に1枚確認でき、特徴（青楕円・低排出ガス車の文字）が判別できる
2. 要確認: 以下のいずれかに該当する場合
   * ラベルらしきものは見えるが、不鮮明・ぼけ・反射などで確信できない
   * ラベルが複数枚写っている
3. NG: ラベルが画像内に存在しない、または全く別のものが写っている

星の数え方（重要・慎重に行うこと）
* 星マークは楕円の上部に横一列に並んでいます。
* 左端から右端まで、星を1つずつ順番に指差し確認するように数えてください。一目見て概算してはいけません。
* 隣り合う星はくっついて見えることがあるため、見落とさないよう注意してください。多くのラベルは星が5個です。
* reason の中で、必ず左から数えた結果を明示してください（例:「星を左から順に数えると1,2,3,4,5で計5個」）。その数を stars に入れてください。

レスポンス形式
必ず以下のJSON形式のみで返答してください。他のテキストは含めないでください。
{ "judgment": "OK" | "要確認" | "NG", "stars": 0〜5の整数（上記「星の数え方」に従って正確に数えた数。判定がNGまたは要確認でラベルが不明な場合はnull）, "confidence": 0〜100の整数（判定の確信度）, "reason": "判定根拠を1〜3文で簡潔に。星を左から数えた結果を必ず含めること" }`;

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "POSTメソッドを使用してください。" });
    return;
  }

  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "サーバー設定エラー: CLAUDE_API_KEY が未設定です。" });
    return;
  }

  // Vercel は application/json のボディを自動でパースして req.body に入れる
  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  const { image, mediaType } = body;

  if (!image || !mediaType) {
    res.status(400).json({ error: "image と mediaType は必須です。" });
    return;
  }

  const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  if (!allowedTypes.includes(mediaType)) {
    res.status(400).json({ error: "対応していない画像形式です。" });
    return;
  }

  try {
    const claudeRes = await fetch(CLAUDE_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 512,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType, data: image } },
              { type: "text", text: "この画像の低排出ガス認定ラベルを判定してください。" }
            ]
          }
        ]
      })
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text().catch(() => "");
      res.status(502).json({ error: `Claude APIエラー (${claudeRes.status}): ${errText.slice(0, 200)}` });
      return;
    }

    const data = await claudeRes.json();
    const text = data?.content?.[0]?.text ?? "";

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      res.status(200).json({
        judgment: "要確認", stars: null, confidence: 0,
        reason: `APIレスポンスからJSONを取得できませんでした。生レスポンス: ${text.slice(0, 200)}`
      });
      return;
    }

    let result;
    try {
      result = JSON.parse(jsonMatch[0]);
    } catch {
      result = {
        judgment: "要確認", stars: null, confidence: 0,
        reason: `JSONパースに失敗しました。生レスポンス: ${text.slice(0, 200)}`
      };
    }

    res.status(200).json(result);

  } catch (err) {
    res.status(500).json({ error: `内部エラー: ${err.message}` });
  }
};
