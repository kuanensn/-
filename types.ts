
export enum UnitType {
  INFANTRY = '步兵 (INF)',
  INFANTRY_SQUAD = '步兵班 (Squad)',
  INFANTRY_TEAM = '步兵伍 (Team)',
  MECH_INF = '機械化步兵 (MECH)',
  ARMOR = '裝甲 (ARM)',
  RECON = '偵察 (REC)',
  ENGINEER = '工兵 (ENG)',
  ARTILLERY = '砲兵 (ART)',
  MORTAR = '迫擊砲 (MOR)',
  AIR_DEFENSE = '防空 (AD)',
  AVIATION = '航空 (AVN)',
  SIGNAL = '通信 (SIG)',
  SUPPLY = '補給 (SUP)',
  MEDICAL = '醫療 (MED)',
  HQ = '指揮部 (HQ)',
  SPECIAL_FORCES = '特種部隊 (SF)',
  EOD = '未爆彈處理 (EOD)',
  // New Vehicles / Specialized
  ANTI_TANK = '反裝甲 (Anti-Tank)',
  MOTORIZED_INF = '摩托化步兵 (Motorized)',
  WHEELED_ARMOR = '輪式裝甲 (Wheeled)',
  HELICOPTER = '直升機 (Helo)',
  FIXED_WING = '定翼機 (Fixed Wing)',
  UAV = '無人機 (UAV)',
  NAVAL = '海軍 (Naval)'
}

// Tactical Mission Task Symbols based on the "Mission Verbs" image
export enum TacticalGraphicType {
  ATTACK_BY_FIRE = '火力攻擊 (ABF)',
  BLOCK = '阻絕 (Block)',
  BREACH = '突穿 (Breach)',
  BYPASS = '繞越 (Bypass)',
  CANALIZE = '導引/限制 (Canalize)',
  CLEAR = '肅清 (Clear)',
  CONTAIN = '圍堵 (Contain)',
  COUNTER_ATTACK = '逆襲 (Counter-Attack)',
  COUNTER_ATTACK_BY_FIRE = '火力逆襲 (CATK by Fire)',
  COVER = '掩護 (Cover)',
  DELAY = '遲滯 (Delay)',
  DESTROY = '摧毀 (Destroy)',
  DISRUPT = '擾亂 (Disrupt)',
  FIX = '拘束 (Fix)',
  FOLLOW_AND_ASSUME = '跟隨並接替 (Follow & Assume)',
  FOLLOW_AND_SUPPORT = '跟隨並支援 (Follow & Support)',
  GUARD = '衛戍 (Guard)',
  INTERDICT = '阻絕/遮斷 (Interdict)',
  ISOLATE = '孤立 (Isolate)',
  NEUTRALIZE = '壓制 (Neutralize)',
  OCCUPY = '佔領 (Occupy)',
  PENETRATE = '突破 (Penetrate)',
  RELIEF_IN_PLACE = '原地接替 (RIP)',
  RETAIN = '確保/留駐 (Retain)',
  SCREEN = '警戒 (Screen)',
  SECURE = '確保 (Secure)',
  SEIZE = '奪取 (Seize)',
  SUPPORT_BY_FIRE = '火力支援 (SBF)',
  RETIREMENT = '轉進 (Retirement)',
  WITHDRAW = '撤退 (Withdraw)',
  // Legacy or Helper
  BOUNDARY = '地境線 (Boundary)',
  PHASE_LINE = '統制線 (Phase Line)',
  AXIS_OF_ADVANCE = '前進軸線 (AoA)',
  // New Additions
  UAV = '無人機航線 (UAV Route)',
  VEHICLE = '載具動線 (Vehicle Route)',
}

export enum Faction {
  BLUE = '藍軍 (友軍)',
  RED = '紅軍 (敵軍)',
  NEUTRAL = '民用/中立'
}

export interface Unit {
  id: string;
  type: UnitType;
  role: string; // Specific role like "PL", "SL", "Rifleman"
  faction: Faction;
  x: number;
  y: number;
  label?: string;
  note?: string; // New: Annotation
}

export interface TacticalGraphic {
  id: string;
  type: TacticalGraphicType;
  faction: Faction;
  points: { x: number; y: number }[]; // Usually [start, end]
  label?: string;
  note?: string; // New: Annotation
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model' | 'system';
  text: string;
  timestamp: Date;
}

export interface AppSettings {
  useRAG: boolean;
  promptMode: 'General' | 'CoT' | 'Creative'; // Chain of Thought
  gridSize: number;
  showGrid: boolean;
}

// GeoJSON Types Helper
export interface GeoFeature {
  type: "Feature";
  geometry: {
    type: string;
    coordinates: any;
  };
  properties?: any;
}

export interface GeoFeatureCollection {
  type: "FeatureCollection";
  features: GeoFeature[];
}

// AI Analysis Types
export interface AnalysisFeature {
  id: string;
  type: 'arrow' | 'zone' | 'point';
  label: string;
  description: string;
  points: { x: number; y: number }[];
  color: string; // Hex code
  style?: 'dashed' | 'solid';
}

export interface AnalysisOverlay {
  title: string;
  features: AnalysisFeature[];
}
