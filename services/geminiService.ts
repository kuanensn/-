import { GoogleGenAI, GenerateContentResponse, Schema } from "@google/genai";
import { ChatMessage, Unit, GeoFeatureCollection, AnalysisOverlay, UnitType, Faction, TacticalGraphic } from "../types";

const SYSTEM_INSTRUCTION = `
你是一位「AI 兵棋推演參謀官」，專精於軍事戰術分析與輔助決策。
你的目標是協助指揮官（使用者）分析地形、規劃行動方案 (COA) 並模擬敵軍反應。
你的系統基於 RAG (檢索增強生成) 概念，旨在提供專業且符合教範的建議。

原則：
1. 使用標準軍事術語 (如：包圍、壓制、阻絕、A2/AD、火網重疊)。
2. 批判性地分析「紅軍」(敵軍) 的可能行動。
3. 當被問及部署時，請參考上下文提供的單位列表 (美軍步兵排編制)。
4. 保持簡潔、專業、客觀。
5. 假設你熟知美軍 FM 3-0 作戰教範與步兵排戰術。
`;

export const sendMessageToGemini = async (
  history: ChatMessage[], 
  currentMessage: string, 
  units: Unit[],
  apiKey: string
): Promise<string> => {
  if (!apiKey) return "錯誤: 未檢測到 API Key。";

  try {
    const ai = new GoogleGenAI({ apiKey });
    
    // Construct context from current board state
    const boardStateDescription = units.length > 0 
      ? `當前地圖部署情況:\n${units.map(u => `- ${u.faction} ${u.type} [職務: ${u.role}] 位於座標網格 (${Math.round(u.x)}, ${Math.round(u.y)})`).join('\n')}`
      : "地圖上目前無單位部署。";

    const contents = [
        { role: 'user', parts: [{ text: `[系統情境: ${boardStateDescription}]\n\n${currentMessage}` }] }
    ];

    const model = ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: contents.map(c => ({ role: c.role, parts: c.parts })),
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.7,
      }
    });

    const response: GenerateContentResponse = await model;
    return response.text || "已收到指令，但無法生成回應。";

  } catch (error) {
    console.error("Gemini API Error:", error);
    return "通訊失敗: 無法聯絡 AI 參謀官。";
  }
};

// Helper to map string codes to UnitType enum
const mapStringToUnitType = (code: string): UnitType => {
    const map: Record<string, UnitType> = {
        'INFANTRY': UnitType.INFANTRY,
        'INFANTRY_SQUAD': UnitType.INFANTRY_SQUAD,
        'MECH_INF': UnitType.MECH_INF,
        'ARMOR': UnitType.ARMOR,
        'RECON': UnitType.RECON,
        'ENGINEER': UnitType.ENGINEER,
        'ARTILLERY': UnitType.ARTILLERY,
        'MORTAR': UnitType.MORTAR,
        'AIR_DEFENSE': UnitType.AIR_DEFENSE,
        'SIGNAL': UnitType.SIGNAL,
        'SUPPLY': UnitType.SUPPLY,
        'MEDICAL': UnitType.MEDICAL,
        'HQ': UnitType.HQ,
        'HELICOPTER': UnitType.HELICOPTER,
        'UAV': UnitType.UAV,
        'SPECIAL_FORCES': UnitType.SPECIAL_FORCES,
        'ANTI_TANK': UnitType.ANTI_TANK
    };
    return map[code] || UnitType.INFANTRY;
};

export const generateMapFromOpord = async (
  opordText: string,
  apiKey: string
): Promise<{ geoJson: GeoFeatureCollection | null, units: Unit[] }> => {
  if (!apiKey) return { geoJson: null, units: [] };

  try {
    const ai = new GoogleGenAI({ apiKey });
    const prompt = `
      分析以下 OPORD (作戰命令) 文字，執行兩項任務：
      1. 提取關鍵地形特徵、機動路線、目標區和邊界，轉換為 GeoJSON FeatureCollection。
      2. 提取內文中提到的軍事單位 (我軍與敵軍)，並推斷其大概位置。

      輸出格式必須為一個 JSON 物件，包含兩個屬性：
      {
        "geoJson": { ...標準 GeoJSON FeatureCollection... },
        "units": [
          {
            "type": "INFANTRY" | "ARMOR" | "MECH_INF" | "HQ" | "MORTAR" | "RECON" | "ENGINEER" | "ARTILLERY" | "HELICOPTER",
            "faction": "BLUE" | "RED",
            "role": "單位名稱 (如 1st Platoon, Enemy T-90)",
            "x": 數字 (0-1000),
            "y": 數字 (0-1000)
          }
        ]
      }
      
      規則：
      1. 地圖座標系範圍為 0-1000。請根據文字描述的相對位置 (如: "北方", "Grid 500,500") 進行估算。
      2. GeoJSON 中必須包含 "Objective" (Polygon/Point), "Route" (LineString), "PhaseLine" (LineString)。
      3. 若文中提到具體單位 (例如 "第一排", "敵軍機槍班")，請務必產生對應的 Unit 物件。
      4. 僅回傳純 JSON 字串，不要包含 Markdown 格式標記。

      OPORD 內容:
      "${opordText}"
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      }
    });

    const jsonText = response.text?.trim();
    if (!jsonText) return { geoJson: null, units: [] };
    
    const parsed = JSON.parse(jsonText);
    
    // Process Units
    const extractedUnits: Unit[] = (parsed.units || []).map((u: any) => ({
        id: Math.random().toString(36).substr(2, 9),
        type: mapStringToUnitType(u.type),
        faction: u.faction === 'RED' ? Faction.RED : Faction.BLUE,
        role: u.role || 'Unit',
        x: u.x || 500,
        y: u.y || 500
    }));

    return {
        geoJson: parsed.geoJson as GeoFeatureCollection,
        units: extractedUnits
    };

  } catch (error) {
    console.error("OPORD Generation Error:", error);
    return { geoJson: null, units: [] };
  }
};

export const analyzeBattlefield = async (
  analysisType: 'ENEMY_MLCOA' | 'FRIENDLY_COA' | 'RISK_ASSESSMENT' | 'CONTINGENCY_PLAN',
  units: Unit[],
  graphics: TacticalGraphic[],
  mapDimensions: { width: number, height: number },
  apiKey: string,
  opordText?: string,
  mapImage?: string | null
): Promise<AnalysisOverlay | null> => {
  if (!apiKey) return null;

  try {
    const ai = new GoogleGenAI({ apiKey });
    
    // Pass note in unit description so AI can identify specific squads (1st Sqd, etc.)
    const unitDesc = units.map(u => 
      `${u.faction} ${u.type} (${u.role}) at x:${Math.round(u.x)}, y:${Math.round(u.y)}${u.note ? ` [詳細資訊: ${u.note}]` : ''}`
    ).join('\n');

    // Enhanced Graphics Description with Note emphasis
    const graphicsDesc = graphics.length > 0 
      ? graphics.map(g => {
          const pStr = g.points.map(p => `(${Math.round(p.x)},${Math.round(p.y)})`).join('->');
          return `- [${g.type}] (${g.faction}) 路徑:${pStr}。${g.note ? `【重要任務備註】: "${g.note}" (請將此備註納入分析，例如 SBF 代表火力支援，Assault 代表突擊)` : ''}`;
        }).join('\n')
      : "無";

    let specificInstruction = "";
    if (analysisType === 'ENEMY_MLCOA') {
      specificInstruction = "分析紅軍(敵軍)最可能的行動方案(MLCOA)。結合影像中的地形特徵（如樹林提供掩蔽、道路利於機動）與地圖上的戰術圖形。繪製其進攻軸線(Arrow)與可能集結區(Zone)。進攻路線應考慮地形，避免直線，展示迂迴或包圍機動。";
    } else if (analysisType === 'FRIENDLY_COA') {
      specificInstruction = "分析藍軍(我軍)的最佳行動方案。請務必詳細檢視每個單位的【兵種】、【建制】與賦予的【戰術動作】(標註在詳細資訊中，如 [戰術動作: SBF])。例如：若機槍班 (Machine Gun Squad) 被賦予 SBF 任務，請評估其射界是否涵蓋殺傷區。若步兵班賦予 Breach，請評估其掩護與路徑。";
    } else if (analysisType === 'CONTINGENCY_PLAN') {
      specificInstruction = "制定緊急應變計畫 (Contingency Plan)。假設關鍵單位(請參考單位備註中的建制名稱，如第一班、主攻部隊或位處危險區的單位)遭受重創或陣亡。請分析：1. 傷患後送路線 (CASEVAC) 到相對安全區。 2. 預備隊支援路線。 3. 緊急撤退路線。 請使用紫色或橙色標示這些應變動線。";
    } else {
      specificInstruction = "分析戰場高風險區域(Kill Zones, Engagement Areas)。識別影像中的開闊地（Kill Zone）或視線受阻區。結合單位位置與圖形任務(如SBF, Block)來評估。繪製危險區域(Zone)並標註原因。";
    }

    // Add OPORD context if available
    let contextPrompt = `當前戰場單位資訊:\n${unitDesc}\n\n當前地圖上的戰術圖形與任務分配:\n${graphicsDesc}`;
    
    if (opordText && opordText.trim().length > 0) {
        contextPrompt += `\n\n[重要參考資料 - 作戰命令 OPORD]:\n"${opordText}"\n\n請務必依據上述 OPORD 中描述的任務目標、攻擊發起線(LD)、目標區(OBJ)及指揮官意圖來進行分析。`;
    }

    // Build parts array (text + optional image)
    const promptText = `
      ${specificInstruction}
      
      請同時分析附帶的地圖影像(若有)，識別：
      1. 道路網 (機動走廊)
      2. 樹林/植被 (隱蔽掩蔽)
      3. 建築物/城鎮 (城鎮戰/阻礙)
      4. 開闊地 (火制區)
      
      ${contextPrompt}
      
      地圖尺寸: ${mapDimensions.width} x ${mapDimensions.height} 像素。
      請輸出一個 JSON 物件，格式如下:
      {
        "title": "分析標題",
        "features": [
          {
            "id": "unique_id",
            "type": "arrow" | "zone", 
            "label": "簡短標籤 (如: 主攻)",
            "description": "詳細說明 (包含地形分析與任務關聯)",
            "points": [{"x": 100, "y": 100}, {"x": 150, "y": 120}, {"x": 200, "y": 200}], 
            "color": "#HEXCODE",
            "style": "solid" | "dashed"
          }
        ]
      }

      規則:
      1. 對於 "arrow" (箭頭)，請生成【3到5個座標點】來形成一條曲線或折線，展示戰術機動路徑，嚴禁僅使用起點和終點的直線。
      2. "zone" (區域) 的 points 應構成一個封閉多邊形。
      3. 敵軍行動通常使用紅色 (#ef4444)，我軍使用藍色 (#3b82f6)，風險區使用黃色 (#eab308) 或紅色。
      4. 預判或未來的行動使用 "dashed" 樣式。
      5. 確保座標在地圖尺寸範圍內。
    `;

    const parts: any[] = [{ text: promptText }];
    
    // Add Image part if available
    if (mapImage) {
        // Remove data URL header if present (e.g., "data:image/png;base64,")
        const base64Data = mapImage.includes(',') ? mapImage.split(',')[1] : mapImage;
        if (base64Data) {
            parts.push({
                inlineData: {
                    mimeType: "image/png", // Assuming PNG or JPEG, Gemini handles standard formats
                    data: base64Data
                }
            });
        }
    }

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash', // Flash model supports vision
      contents: [{ role: 'user', parts: parts }],
      config: {
        responseMimeType: "application/json"
      }
    });

    const jsonText = response.text?.trim();
    if (!jsonText) return null;

    return JSON.parse(jsonText) as AnalysisOverlay;

  } catch (error) {
    console.error("Battlefield Analysis Error:", error);
    return null;
  }
};