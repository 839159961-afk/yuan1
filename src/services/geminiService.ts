import { GoogleGenAI } from "@google/genai";

function safeJsonParse(text: string | undefined, fallback: any) {
  if (!text) return fallback;
  try {
    // Remove markdown code blocks if present
    const cleanText = text.replace(/```json\n?|```/g, "").trim();
    return JSON.parse(cleanText);
  } catch (error) {
    console.error("JSON Parse error:", error, "Original text:", text);
    return fallback;
  }
}

const SYSTEM_PROMPT = `你是“缘 (YUÁN) - 关系宇宙 (RelationCosmos)”系统的核心算法引擎。你的任务是根据用户的性格指纹、他人的性格指纹以及关系事件日志，预测关系的演化趋势并提供深度洞察。

逻辑框架：
1. 现状诊断：分析当前关系的动态平衡与潜在冲突。
2. 趋势推演：预测在不干预的情况下，短期（1个月）、中期（6个月）、长期（1年）的关系走向。
3. 行动建议：提供基于心理学和博弈论的实质性建议。
4. 缘分箴言：给出一个富有哲学意蕴的总结。

输出风格：
冷静、深邃、富有洞察力。避免肤浅的建议，提供基于心理动力学的深度解析。
输出必须是 Markdown 格式。`;

const NETWORK_SYSTEM_PROMPT = `你是“缘 (YUÁN) - 关系宇宙 (RelationCosmos)”系统的网络分析引擎。你的任务是分析用户的整体社交网络，提供宏观洞察。

分析维度：
1. 健康度评分：根据所有关系的稳定性和质量给出 0-100 的评分。
2. 关系分布：分析关系类型的平衡性（如：是否过度依赖某类关系）。
3. 关注提醒：识别哪些关系处于高风险或急需关注的状态。
4. 关系模式洞察：识别用户在处理人际关系时的重复模式（如：总是吸引某种类型的人）。

输出风格：
专业、客观、具有前瞻性。
输出必须是 Markdown 格式。`;

export async function analyzeRelationship(userProfile: any, targetProfile: any, events: any[]) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  
  const eventsText = events.map(e => `[${e.timestamp}] ${e.content}`).join('\n');
  const chatHistoryText = targetProfile.chatHistory ? `\n导入的聊天记录：\n${targetProfile.chatHistory}\n` : '';
  const descriptionText = targetProfile.description ? `\n关系描述：\n${targetProfile.description}\n` : '';

  const prompt = `
用户资料：${JSON.stringify(userProfile)}
对方资料：${JSON.stringify(targetProfile)}
${descriptionText}${chatHistoryText}
事件日志：
${eventsText}

请提供深度关系预测报告。
返回 JSON 格式：
{
  "healthScore": 0-100 之间的整数,
  "analysis": "Markdown 格式的深度报告，包含现状诊断、短期/中期/长期走向、行动建议和缘分箴言",
  "reminder": "一句简短的个性化维护建议"
}`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        responseMimeType: "application/json"
      },
    });
    
    return safeJsonParse(response.text, { healthScore: 70, analysis: "天机难测，请稍后再试。", reminder: "保持关注" });
  } catch (error) {
    console.error("Relationship analysis failed:", error);
    return { healthScore: 70, analysis: "天机难测，请稍后再试。", reminder: "保持关注" };
  }
}

export async function analyzeNetwork(userProfile: any, relationships: any[]) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  
  const relsText = relationships.map(r => `- ${r.targetName} (${r.type}): ${r.status}`).join('\n');
  const prompt = `
用户资料：${JSON.stringify(userProfile)}
关系列表：
${relsText}

请提供整体关系网络分析报告，包含健康度评分、关系分布、关注提醒和关系模式洞察。`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        systemInstruction: NETWORK_SYSTEM_PROMPT,
      },
    });
    
    return response.text;
  } catch (error) {
    console.error("Network analysis failed:", error);
    return "星图模糊，请稍后再试。";
  }
}

export async function extractEntities(diaryContent: string, existingRelationships: any[]) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  
  const relsText = existingRelationships.map(r => `- ${r.targetName} (ID: ${r.id})`).join('\n');
  const prompt = `
日记内容：
${diaryContent}

现有关系列表：
${relsText}

请从日记中提取提到的现有关系 ID。如果提到了新的人物，请识别其姓名和可能的性格/关系类型。
返回 JSON 格式：
{
  "mentionedIds": ["id1", "id2"],
  "newEntities": [{"name": "姓名", "type": "关系类型", "personality": "性格描述"}]
}`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      },
    });
    
    return safeJsonParse(response.text, { mentionedIds: [], newEntities: [] });
  } catch (error) {
    console.error("Entity extraction failed:", error);
    return { mentionedIds: [], newEntities: [] };
  }
}

export async function analyzeMutualPerception(nodeA: any, nodeB: any, userProfile: any) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  
  const prompt = `
人物 A：${JSON.stringify(nodeA)}
人物 B：${JSON.stringify(nodeB)}
共同关联人（用户）：${JSON.stringify(userProfile)}

请基于他们的性格和背景，推测他们对彼此的看法和判断。
返回 JSON 格式：
{
  "perceptionAtoB": "A 对 B 的看法...",
  "perceptionBtoA": "B 对 A 的看法..."
}`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      },
    });
    
    return safeJsonParse(response.text, { perceptionAtoB: "无法推测", perceptionBtoA: "无法推测" });
  } catch (error) {
    console.error("Mutual perception analysis failed:", error);
    return { perceptionAtoB: "无法推测", perceptionBtoA: "无法推测" };
  }
}

const SELF_ANALYSIS_SYSTEM_PROMPT = `你是“缘 (YUÁN) - 关系宇宙 (RelationCosmos)”系统的自我镜像引擎。你的任务是基于用户的所有社交数据（个人资料、关系列表、日记记录），以极其客观、中立的视角剖析用户本人。

分析维度：
1. 性格底色：从用户的言行和关系处理模式中，挖掘其最深层的性格特征。
2. 社交舒适区：识别用户在社交中感到最安全和最焦虑的场景。
3. 潜意识偏好：分析用户在选择朋友或伴侣时，潜意识里在寻找什么。
4. 核心矛盾：识别用户内心深处存在的自我认知与现实表现之间的冲突。
5. 未来可能性推演：基于当前模式，客观描述用户未来可能的发展路径与潜在成就。
6. 停滞代价：如果用户不进行自我调整或不突破当前局限，可能会面临的后果与代价。
7. 进化建议：提供针对性的自我成长和心理调适建议。

输出风格：
客观冷静、直击灵魂、犀利但不失温情、充满哲学思辨。
输出必须是 Markdown 格式。`;

export async function analyzeSelf(userProfile: any, relationships: any[], diaries: any[]) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  
  const relsText = relationships.map(r => `- ${r.targetName} (${r.type}): ${r.status}`).join('\n');
  const diariesText = diaries.map(d => `[${d.timestamp}] ${d.content}`).join('\n');

  const prompt = `
用户资料：${JSON.stringify(userProfile)}
关系网络概览：
${relsText}

近期日记记录：
${diariesText}

请作为“镜像”，对我进行深度的灵魂剖析。`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        systemInstruction: SELF_ANALYSIS_SYSTEM_PROMPT,
      },
    });
    
    return response.text;
  } catch (error) {
    console.error("Self analysis failed:", error);
    return "镜像模糊，无法映照出你的灵魂。";
  }
}

export async function analyzePersonalityChange(oldProfile: any, newProfile: any) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  
  const prompt = `
旧个人资料：${JSON.stringify(oldProfile)}
新个人资料：${JSON.stringify(newProfile)}

请分析用户的性格、价值观或自我认知是否发生了重大转变。
如果发生了显著变化，请以“来时路”为题，为用户生成一篇深度反思日记。
这篇日记应该：
1. 反映性格的变化轨迹。
2. 融入对“新自我”的细腻描述。
3. 语气深邃、富有哲学意蕴，像是一位老友在旁观你的成长。
4. 长度约 300-500 字。

如果变化不显著，请返回 null。
返回 JSON 格式：
{
  "hasSignificantChange": boolean,
  "diaryContent": "生成的日记内容或 null"
}
`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      },
    });
    
    return safeJsonParse(response.text, { hasSignificantChange: false, diaryContent: null });
  } catch (error) {
    console.error("Personality change analysis failed:", error);
    return { hasSignificantChange: false, diaryContent: null };
  }
}
