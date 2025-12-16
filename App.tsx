import React, { useState, useRef } from 'react';
import { 
  Upload, 
  MessageSquare, 
  Map as MapIcon, 
  ShieldAlert, 
  BrainCircuit,
  FileText,
  ChevronRight,
  ChevronLeft,
  Users,
  ScrollText,
  Loader2,
  PenTool,
  ScanEye,
  Crosshair,
  AlertTriangle,
  Minimize2,
  Maximize2,
  Send,
  History,
  Layers,
  Activity,
  MousePointer2,
  X,
  RotateCcw,
  Trash2,
  ImagePlus,
  Download,
  Menu
} from 'lucide-react';
import { WarMap } from './components/WarMap';
import { sendMessageToGemini, generateMapFromOpord, analyzeBattlefield } from './services/geminiService';
import { Unit, UnitType, Faction, ChatMessage, AppSettings, GeoFeatureCollection, TacticalGraphic, TacticalGraphicType, AnalysisOverlay } from './types';
import { UnitIcon } from './components/UnitIcon';
import { parseMapFile } from './utils/geoParser';

// 美軍步兵排編制資料結構 (依據 FM 3-21.8)
const INFANTRY_PLATOON_TOE = {
  // ... (Keep existing data)
  hq: {
    label: 'HQ 排部',
    units: [
      { role: 'PL', type: UnitType.HQ, label: '排長 (PL)' },
      { role: 'PSG', type: UnitType.HQ, label: '排士官 (PSG)' },
      { role: 'RTO', type: UnitType.INFANTRY, label: '無線電 (RTO)' },
      { role: 'FO', type: UnitType.ARTILLERY, label: '觀測 (FO)' },
      { role: 'MED', type: UnitType.MEDICAL, label: '醫護 (Medic)' }
    ]
  },
  // ... (Rest of TOE is the same, omitted for brevity if unchanged logic, but including fully for safety)
   squad1: {
    label: '1st 步兵班',
    units: [
      { role: 'SL', type: UnitType.INFANTRY, label: '班長 (SL)' },
      { role: 'A-TL', type: UnitType.INFANTRY, label: 'A伍長 (TL)' },
      { role: 'A-AR', type: UnitType.INFANTRY, label: 'A自動步槍' },
      { role: 'A-GRN', type: UnitType.INFANTRY, label: 'A榴彈兵' },
      { role: 'A-RFL', type: UnitType.INFANTRY, label: 'A步槍兵' },
      { role: 'B-TL', type: UnitType.INFANTRY, label: 'B伍長 (TL)' },
      { role: 'B-AR', type: UnitType.INFANTRY, label: 'B自動步槍' },
      { role: 'B-GRN', type: UnitType.INFANTRY, label: 'B榴彈兵' },
      { role: 'B-RFL', type: UnitType.INFANTRY, label: 'B步槍兵' },
    ]
  },
  squad2: {
    label: '2nd 步兵班',
    units: [
      { role: 'SL', type: UnitType.INFANTRY, label: '班長' },
      { role: 'A-TL', type: UnitType.INFANTRY, label: 'A伍長' },
      { role: 'A-AR', type: UnitType.INFANTRY, label: 'A機槍' },
      { role: 'A-GRN', type: UnitType.INFANTRY, label: 'A榴彈' },
      { role: 'A-RFL', type: UnitType.INFANTRY, label: 'A步槍' },
      { role: 'B-TL', type: UnitType.INFANTRY, label: 'B伍長' },
      { role: 'B-AR', type: UnitType.INFANTRY, label: 'B機槍' },
      { role: 'B-GRN', type: UnitType.INFANTRY, label: 'B榴彈' },
      { role: 'B-RFL', type: UnitType.INFANTRY, label: 'B步槍' },
    ]
  },
  squad3: {
    label: '3rd 步兵班',
    units: [
      { role: 'SL', type: UnitType.INFANTRY, label: '班長' },
      { role: 'A-TL', type: UnitType.INFANTRY, label: 'A伍長' },
      { role: 'A-AR', type: UnitType.INFANTRY, label: 'A機槍' },
      { role: 'A-GRN', type: UnitType.INFANTRY, label: 'A榴彈' },
      { role: 'A-RFL', type: UnitType.INFANTRY, label: 'A步槍' },
      { role: 'B-TL', type: UnitType.INFANTRY, label: 'B伍長' },
      { role: 'B-AR', type: UnitType.INFANTRY, label: 'B機槍' },
      { role: 'B-GRN', type: UnitType.INFANTRY, label: 'B榴彈' },
      { role: 'B-RFL', type: UnitType.INFANTRY, label: 'B步槍' },
    ]
  },
  weapons: {
    label: 'Wpn 火力班',
    units: [
      { role: 'WSL', type: UnitType.INFANTRY, label: '班長' },
      { role: 'MG1', type: UnitType.INFANTRY, label: '機槍1' },
      { role: 'AG1', type: UnitType.INFANTRY, label: '副手1' },
      { role: 'MG2', type: UnitType.INFANTRY, label: '機槍2' },
      { role: 'AG2', type: UnitType.INFANTRY, label: '副手2' },
      { role: 'JAV1', type: UnitType.INFANTRY, label: '標槍1' },
      { role: 'AH1', type: UnitType.INFANTRY, label: '彈藥1' },
      { role: 'JAV2', type: UnitType.INFANTRY, label: '標槍2' },
      { role: 'AH2', type: UnitType.INFANTRY, label: '彈藥2' },
    ]
  },
  attachments: {
    label: 'Vehicles 載具',
    units: [
      { role: 'TANK', type: UnitType.ARMOR, label: 'M1 戰車' },
      { role: 'IFV', type: UnitType.MECH_INF, label: 'Bradley' },
      { role: 'STRYKER', type: UnitType.WHEELED_ARMOR, label: 'Stryker' },
      { role: 'AH', type: UnitType.HELICOPTER, label: 'AH-64' },
      { role: 'UAV', type: UnitType.UAV, label: 'RQ-11' },
      { role: 'TRUCK', type: UnitType.MOTORIZED_INF, label: 'LMTV' }
    ]
  }
};

// NATO Library for manual selection
const NATO_LIBRARY = [
  // Basic Units
  { type: UnitType.INFANTRY, label: '步兵', role: 'INF' },
  { type: UnitType.INFANTRY_SQUAD, label: '步兵班 (●)', role: 'SQD' },
  { type: UnitType.INFANTRY_TEAM, label: '步兵伍 (Ø)', role: 'TM' },
  { type: UnitType.MECH_INF, label: '機械化步兵', role: 'MECH' },
  { type: UnitType.ARMOR, label: '裝甲部隊', role: 'ARM' },
  { type: UnitType.RECON, label: '偵察部隊', role: 'REC' },
  { type: UnitType.ENGINEER, label: '工兵', role: 'ENG' },
  { type: UnitType.ARTILLERY, label: '野戰砲兵', role: 'ART' },
  
  // Support
  { type: UnitType.MORTAR, label: '迫擊砲', role: 'MOR' },
  { type: UnitType.AIR_DEFENSE, label: '防空部隊', role: 'AD' },
  { type: UnitType.SIGNAL, label: '通信部隊', role: 'SIG' },
  { type: UnitType.SUPPLY, label: '後勤補給', role: 'SUP' },
  { type: UnitType.MEDICAL, label: '醫療單位', role: 'MED' },
  
  // Specialized & Vehicles
  { type: UnitType.ANTI_TANK, label: '反裝甲', role: 'AT' },
  { type: UnitType.MOTORIZED_INF, label: '摩托化步兵', role: 'MOT' },
  { type: UnitType.WHEELED_ARMOR, label: '輪式裝甲', role: 'WHL' },
  { type: UnitType.HELICOPTER, label: '直升機', role: 'HELO' },
  { type: UnitType.FIXED_WING, label: '定翼機', role: 'FIX' },
  { type: UnitType.UAV, label: '無人機', role: 'UAV' },
  { type: UnitType.SPECIAL_FORCES, label: '特種部隊', role: 'SF' },
  { type: UnitType.EOD, label: '未爆彈處理', role: 'EOD' },
  { type: UnitType.NAVAL, label: '海軍艦艇', role: 'NAV' },
  { type: UnitType.HQ, label: '指揮部', role: 'HQ' },
];

const TACTICAL_GRAPHICS_LIST = Object.values(TacticalGraphicType).map(t => ({
  type: t,
  label: t
}));

const App: React.FC = () => {
  // State definitions
  const [units, setUnits] = useState<Unit[]>([]);
  const [graphics, setGraphics] = useState<TacticalGraphic[]>([]);
  const [historyStack, setHistoryStack] = useState<{units: Unit[], graphics: TacticalGraphic[]}[]>([]);

  const [mapImage, setMapImage] = useState<string | null>(null);
  const [mapData, setMapData] = useState<GeoFeatureCollection | null>(null);
  const [analysisOverlay, setAnalysisOverlay] = useState<AnalysisOverlay | null>(null);
  const [highlightedAnalysisId, setHighlightedAnalysisId] = useState<string | null>(null);
  
  // UI State
  const [mode, setMode] = useState<'place' | 'select' | 'draw'>('select');
  const [selectedFaction, setSelectedFaction] = useState<Faction>(Faction.BLUE);
  const [selectedUnitType, setSelectedUnitType] = useState<UnitType>(UnitType.INFANTRY);
  const [selectedRole, setSelectedRole] = useState<string>('INF');
  const [selectedGraphicType, setSelectedGraphicType] = useState<TacticalGraphicType>(TacticalGraphicType.AXIS_OF_ADVANCE);
  
  const [showGrid, setShowGrid] = useState(true);
  const [gridSize, setGridSize] = useState(50);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<'units' | 'chat' | 'analysis'>('units');

  // OPORD State
  const [showOpordModal, setShowOpordModal] = useState(false);
  const [opordText, setOpordText] = useState("");
  const [isOpordLoading, setIsOpordLoading] = useState(false);

  // Chat State
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isAiLoading, setIsAiLoading] = useState(false);
  
  // Refs
  const warMapRef = useRef<any>(null); // To access download function

  // Constants
  const apiKey = process.env.API_KEY || ""; 

  // --- History Management ---
  const addToHistory = () => {
    // Save current state to stack before modification
    setHistoryStack(prev => [...prev, { units, graphics }]);
  };

  const handleUndo = () => {
    if (historyStack.length === 0) return;
    const lastState = historyStack[historyStack.length - 1];
    setUnits(lastState.units);
    setGraphics(lastState.graphics);
    setHistoryStack(prev => prev.slice(0, -1));
  };

  const handleClearAll = () => {
      if (units.length === 0 && graphics.length === 0) return;
      if (window.confirm("確定要清除地圖上所有單位與標記嗎？(可透過上一步復原)")) {
          addToHistory();
          setUnits([]);
          setGraphics([]);
      }
  };
  
  const handleDownloadMap = () => {
      if (warMapRef.current) {
          warMapRef.current.downloadMap();
      }
  };

  // Handlers
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (ev) => setMapImage(ev.target?.result as string);
        reader.readAsDataURL(file);
        setMapData(null);
    } else {
        const data = await parseMapFile(file);
        if (data) {
            setMapData(data);
            setMapImage(null);
        }
    }
  };

  const handleOpordSubmit = async () => {
    if (!opordText.trim()) return;
    setIsOpordLoading(true);
    
    // Destructure result from updated service
    const { geoJson, units: extractedUnits } = await generateMapFromOpord(opordText, apiKey);
    
    if (geoJson) {
      addToHistory(); // Save state before applying OPORD results
      setMapData(geoJson);
      // Append detected units to existing units
      if (extractedUnits && extractedUnits.length > 0) {
          setUnits(prev => [...prev, ...extractedUnits]);
      }

      setShowOpordModal(false);
      setChatHistory(prev => [...prev, {
        id: Date.now().toString(),
        role: 'system',
        text: `OPORD 分析完成。\n- 地形特徵已生成。\n- 自動部署了 ${extractedUnits.length} 個單位。`,
        timestamp: new Date()
      }]);
    } else {
        alert("無法從 OPORD 生成地形。請檢查 API Key 或內容。");
    }
    setIsOpordLoading(false);
  };

  const handleSendMessage = async () => {
      if (!inputMessage.trim()) return;
      
      const newUserMsg: ChatMessage = {
          id: Date.now().toString(),
          role: 'user',
          text: inputMessage,
          timestamp: new Date()
      };
      
      setChatHistory(prev => [...prev, newUserMsg]);
      setInputMessage("");
      setIsAiLoading(true);

      const response = await sendMessageToGemini(chatHistory, inputMessage, units, apiKey);
      
      const newAiMsg: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: 'model',
          text: response,
          timestamp: new Date()
      };
      setChatHistory(prev => [...prev, newAiMsg]);
      setIsAiLoading(false);
  };

  const handleAnalysis = async (type: 'ENEMY_MLCOA' | 'FRIENDLY_COA' | 'RISK_ASSESSMENT' | 'CONTINGENCY_PLAN') => {
      setIsAiLoading(true);
      setHighlightedAnalysisId(null);
      // Pass opordText to provide context for AI analysis
      // Added graphics argument and mapImage
      const result = await analyzeBattlefield(type, units, graphics, { width: 1000, height: 800 }, apiKey, opordText, mapImage); 
      if (result) {
          setAnalysisOverlay(result);
          // Also add a system message
          setChatHistory(prev => [...prev, {
              id: Date.now().toString(),
              role: 'system',
              text: `分析完成: ${result.title}`,
              timestamp: new Date()
          }]);
      }
      setIsAiLoading(false);
  };

  const handleAnalysisClick = (id: string) => {
      setHighlightedAnalysisId(prev => prev === id ? null : id);
  };

  // Render logic...
  return (
    <div className="flex flex-col md:flex-row h-screen bg-slate-900 text-slate-100 font-sans overflow-hidden">
        {/* Mobile Header / Toolbar */}
        <div className="md:hidden h-14 bg-slate-950 border-b border-slate-800 flex items-center justify-between px-4 z-20">
            <div className="flex items-center gap-2">
                 <ShieldAlert className="w-6 h-6 text-blue-500" />
                 <div className="leading-tight">
                    <div className="font-bold">AI Staff Officer</div>
                    <div className="text-[10px] text-slate-500">Dev: Oscar Kuan</div>
                 </div>
            </div>
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2">
                <Menu className="w-6 h-6" />
            </button>
        </div>

        {/* Left Toolbar (Desktop & Mobile Landscape Optimized) */}
        <div className="w-full md:w-16 h-14 md:h-full flex flex-row md:flex-col items-center justify-around md:justify-start py-2 md:py-4 bg-slate-950 border-b md:border-r border-slate-800 gap-2 md:gap-4 z-10 overflow-x-auto">
             <div className="hidden md:flex p-2 bg-blue-600 rounded-lg mb-4 shadow-lg shadow-blue-900/50">
                <ShieldAlert className="w-6 h-6 text-white" />
             </div>
             
             <button 
                onClick={() => setMode('select')}
                className={`p-2 rounded hover:bg-slate-800 ${mode === 'select' ? 'bg-slate-800 text-blue-400' : 'text-slate-400'}`} 
                title="選擇/移動"
             >
                <Crosshair className="w-6 h-6" />
             </button>
             
             <button 
                onClick={() => setMode('place')}
                className={`p-2 rounded hover:bg-slate-800 ${mode === 'place' ? 'bg-slate-800 text-green-400' : 'text-slate-400'}`}
                title="部署單位"
             >
                <Users className="w-6 h-6" />
             </button>

             <button 
                onClick={() => setMode('draw')}
                className={`p-2 rounded hover:bg-slate-800 ${mode === 'draw' ? 'bg-slate-800 text-yellow-400' : 'text-slate-400'}`}
                title="繪製圖形"
             >
                <PenTool className="w-6 h-6" />
             </button>
            
             <div className="w-px h-8 md:w-8 md:h-px bg-slate-800 my-1" />

             <button 
                onClick={handleUndo}
                disabled={historyStack.length === 0}
                className={`p-2 rounded hover:bg-slate-800 ${historyStack.length === 0 ? 'text-slate-600 cursor-not-allowed' : 'text-slate-400 hover:text-white'}`}
                title="上一步 (Undo)"
             >
                <RotateCcw className="w-6 h-6" />
             </button>

             <button 
                onClick={handleClearAll}
                className="p-2 rounded hover:bg-red-900/30 text-slate-400 hover:text-red-400"
                title="清除所有 (Clear All)"
             >
                <Trash2 className="w-6 h-6" />
             </button>

             <div className="w-px h-8 md:w-8 md:h-px bg-slate-800 my-1" />

             <button 
                onClick={() => setShowOpordModal(true)}
                className="p-2 rounded hover:bg-slate-800 text-slate-400 hover:text-white"
                title="輸入 OPORD"
             >
                <ScrollText className="w-6 h-6" />
             </button>

             <button 
                onClick={handleDownloadMap}
                disabled={!mapImage && !mapData}
                className="p-2 rounded hover:bg-slate-800 text-slate-400 hover:text-blue-300 disabled:opacity-30"
                title="下載戰術圖 (Download Map)"
             >
                <Download className="w-6 h-6" />
             </button>

             <div className="flex-1 hidden md:block" />
             
             <label className="p-2 rounded hover:bg-slate-800 text-slate-400 cursor-pointer hover:text-white" title="匯入地圖 (Upload Map)">
                 <ImagePlus className="w-6 h-6" />
                 <input type="file" className="hidden" accept="image/*,.json,.geojson,.kml" onChange={handleFileUpload} />
             </label>
        </div>

        {/* Main Map Area */}
        <div className="flex-1 relative bg-slate-900 overflow-hidden">
             <WarMap 
                ref={warMapRef}
                mapImage={mapImage}
                mapData={mapData}
                units={units}
                setUnits={setUnits}
                graphics={graphics}
                setGraphics={setGraphics}
                analysisOverlay={analysisOverlay}
                highlightedAnalysisId={highlightedAnalysisId}
                gridSize={gridSize}
                showGrid={showGrid}
                selectedFaction={selectedFaction}
                selectedUnitType={selectedUnitType}
                selectedGraphicType={selectedGraphicType}
                selectedRole={selectedRole}
                mode={mode}
                onHistorySave={addToHistory}
             />
             
             {/* Map Controls Overlay */}
             <div className="absolute top-4 left-4 bg-slate-950/80 p-2 rounded border border-slate-800 backdrop-blur z-10 shadow-xl">
                 <div className="flex items-center gap-2 mb-2">
                     <label className="text-xs text-slate-400">Grid</label>
                     <input type="checkbox" checked={showGrid} onChange={e => setShowGrid(e.target.checked)} />
                 </div>
                 <div className="flex items-center gap-2">
                     <label className="text-xs text-slate-400">Size</label>
                     <input 
                        type="range" min="20" max="100" value={gridSize} 
                        onChange={e => setGridSize(Number(e.target.value))} 
                        className="w-20"
                     />
                 </div>
             </div>
        </div>

        {/* Right Sidebar - Collapsible on Mobile/Tablet */}
        <div className={`
            fixed md:relative right-0 top-0 bottom-0 z-30
            transition-all duration-300 bg-slate-950 border-l border-slate-800 flex flex-col 
            ${sidebarOpen ? 'w-80 md:w-96 translate-x-0' : 'w-0 translate-x-full md:translate-x-0 md:w-0'}
        `}>
            <div className="flex items-center justify-between p-4 border-b border-slate-800">
                <div className="flex items-center gap-2">
                    <BrainCircuit className="text-blue-500 w-6 h-6" />
                    <div>
                        <h2 className="font-bold text-lg leading-none">戰術參謀系統</h2>
                        <span className="text-xs text-slate-500">Dev: Oscar Kuan</span>
                    </div>
                </div>
                <button onClick={() => setSidebarOpen(false)} className="text-slate-400 hover:text-white"><ChevronRight /></button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-slate-800">
                <button 
                    onClick={() => setActiveTab('units')}
                    className={`flex-1 py-3 text-sm font-medium ${activeTab === 'units' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-slate-500 hover:text-slate-300'}`}
                >
                    單位
                </button>
                <button 
                    onClick={() => setActiveTab('chat')}
                    className={`flex-1 py-3 text-sm font-medium ${activeTab === 'chat' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-slate-500 hover:text-slate-300'}`}
                >
                    AI 參謀
                </button>
                <button 
                    onClick={() => setActiveTab('analysis')}
                    className={`flex-1 py-3 text-sm font-medium ${activeTab === 'analysis' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-slate-500 hover:text-slate-300'}`}
                >
                    分析
                </button>
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                
                {activeTab === 'units' && (
                    <div className="space-y-6">
                        {/* Faction Selector */}
                        <div className="flex bg-slate-900 rounded-lg p-1">
                            {Object.values(Faction).map(f => (
                                <button
                                    key={f}
                                    onClick={() => setSelectedFaction(f)}
                                    className={`flex-1 text-xs py-2 rounded ${selectedFaction === f ? 'bg-slate-700 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                                >
                                    {f.split(' ')[0]}
                                </button>
                            ))}
                        </div>

                        {mode === 'place' ? (
                           <div className="space-y-4">
                               <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">選擇單位</h3>
                               <div className="grid grid-cols-4 gap-2">
                                   {NATO_LIBRARY.map(unit => (
                                       <button
                                          key={unit.type}
                                          onClick={() => {
                                              setSelectedUnitType(unit.type);
                                              setSelectedRole(unit.role);
                                          }}
                                          className={`aspect-square flex flex-col items-center justify-center p-1 rounded border ${selectedUnitType === unit.type ? 'border-blue-500 bg-blue-500/20' : 'border-slate-800 hover:bg-slate-900'}`}
                                       >
                                           <div className="transform scale-75">
                                               <UnitIcon type={unit.type} faction={selectedFaction} role={unit.role} size={40} />
                                           </div>
                                           <span className="text-[10px] text-center truncate w-full">{unit.label}</span>
                                       </button>
                                   ))}
                               </div>
                           </div>
                        ) : mode === 'draw' ? (
                           <div className="space-y-4">
                               <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">戰術圖形</h3>
                               <div className="space-y-2">
                                   {TACTICAL_GRAPHICS_LIST.map(g => (
                                       <button
                                           key={g.type}
                                           onClick={() => setSelectedGraphicType(g.type)}
                                           className={`w-full text-left px-3 py-2 rounded text-sm ${selectedGraphicType === g.type ? 'bg-blue-600/30 text-blue-300 border border-blue-500/50' : 'bg-slate-900 text-slate-400 hover:bg-slate-800'}`}
                                       >
                                           {g.label}
                                       </button>
                                   ))}
                               </div>
                           </div>
                        ) : (
                           <div className="text-center text-slate-500 py-10">
                               <MousePointer2 className="w-12 h-12 mx-auto mb-2 opacity-50" />
                               <p>請選擇「部署」或「繪製」模式</p>
                           </div>
                        )}
                    </div>
                )}

                {activeTab === 'chat' && (
                    <div className="flex flex-col h-full">
                        <div className="flex-1 space-y-4 mb-4">
                            {chatHistory.length === 0 && (
                                <div className="text-center text-slate-500 text-sm mt-10">
                                    <MessageSquare className="w-10 h-10 mx-auto mb-2 opacity-30" />
                                    AI 參謀官已就位。<br/>請下達指令或詢問戰術建議。
                                </div>
                            )}
                            {chatHistory.map(msg => (
                                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-[85%] rounded-lg p-3 text-sm ${
                                        msg.role === 'user' ? 'bg-blue-600 text-white' : 
                                        msg.role === 'system' ? 'bg-yellow-900/30 text-yellow-200 border border-yellow-700' :
                                        'bg-slate-800 text-slate-200'
                                    }`}>
                                        {msg.text}
                                    </div>
                                </div>
                            ))}
                            {isAiLoading && (
                                <div className="flex justify-start">
                                    <div className="bg-slate-800 rounded-lg p-3 flex items-center gap-2">
                                        <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                                        <span className="text-xs text-slate-400">AI 思考中...</span>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="mt-auto">
                            <div className="flex gap-2">
                                <input 
                                    type="text" 
                                    value={inputMessage}
                                    onChange={e => setInputMessage(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                                    placeholder="輸入戰術指令..."
                                    className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                                />
                                <button 
                                    onClick={handleSendMessage}
                                    disabled={isAiLoading || !inputMessage.trim()}
                                    className="p-2 bg-blue-600 rounded-lg hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <Send className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'analysis' && (
                    <div className="space-y-4">
                        <div className="p-4 bg-slate-900 rounded-lg border border-slate-800">
                             <h3 className="font-semibold mb-2 flex items-center gap-2 text-blue-400">
                                 <Activity className="w-4 h-4" />
                                 戰場情報準備 (IPB)
                             </h3>
                             <p className="text-xs text-slate-500 mb-4">
                                 利用 AI 分析當前戰場態勢，預判敵我行動。
                             </p>
                             
                             <div className="space-y-2">
                                 <button 
                                     onClick={() => handleAnalysis('ENEMY_MLCOA')}
                                     disabled={isAiLoading}
                                     className="w-full py-2 px-3 bg-red-900/30 border border-red-800 text-red-200 rounded hover:bg-red-900/50 text-sm text-left flex items-center justify-between"
                                 >
                                     <span>敵軍最可能行動 (MLCOA)</span>
                                     <ScanEye className="w-4 h-4" />
                                 </button>
                                 
                                 <button 
                                     onClick={() => handleAnalysis('FRIENDLY_COA')}
                                     disabled={isAiLoading}
                                     className="w-full py-2 px-3 bg-blue-900/30 border border-blue-800 text-blue-200 rounded hover:bg-blue-900/50 text-sm text-left flex items-center justify-between"
                                 >
                                     <span>我軍最佳行動方案 (COA)</span>
                                     <BrainCircuit className="w-4 h-4" />
                                 </button>

                                 <button 
                                     onClick={() => handleAnalysis('RISK_ASSESSMENT')}
                                     disabled={isAiLoading}
                                     className="w-full py-2 px-3 bg-yellow-900/30 border border-yellow-800 text-yellow-200 rounded hover:bg-yellow-900/50 text-sm text-left flex items-center justify-between"
                                 >
                                     <span>風險區域分析</span>
                                     <AlertTriangle className="w-4 h-4" />
                                 </button>

                                 <button 
                                     onClick={() => handleAnalysis('CONTINGENCY_PLAN')}
                                     disabled={isAiLoading}
                                     className="w-full py-2 px-3 bg-purple-900/30 border border-purple-800 text-purple-200 rounded hover:bg-purple-900/50 text-sm text-left flex items-center justify-between"
                                 >
                                     <span>緊急應變計畫 (Contingency)</span>
                                     <ShieldAlert className="w-4 h-4" />
                                 </button>
                             </div>
                        </div>
                        
                        {/* Loading State */}
                        {isAiLoading && (
                            <div className="p-4 bg-slate-900 rounded-lg border border-slate-800 flex flex-col items-center justify-center py-10 text-slate-400">
                                <Loader2 className="w-8 h-8 animate-spin text-emerald-500 mb-3" />
                                <span className="text-sm font-medium animate-pulse">正在進行戰場分析...</span>
                                <span className="text-xs text-slate-500 mt-1">計算路徑與威脅評估中</span>
                            </div>
                        )}

                        {analysisOverlay && !isAiLoading && (
                            <div className="p-4 bg-slate-900 rounded-lg border border-slate-800">
                                <h3 className="font-bold text-white mb-2">{analysisOverlay.title}</h3>
                                <div className="space-y-2">
                                    {analysisOverlay.features.map(f => (
                                        <div 
                                          key={f.id} 
                                          onClick={() => handleAnalysisClick(f.id)}
                                          className={`text-xs p-2 rounded border-l-4 cursor-pointer transition-all hover:bg-slate-800 ${highlightedAnalysisId === f.id ? 'bg-slate-800 ring-1 ring-white/20 scale-[1.02]' : 'bg-slate-950 opacity-80'}`}
                                          style={{ borderColor: f.color }}
                                        >
                                            <div className="font-bold text-slate-300 flex justify-between">
                                                {f.label}
                                                {highlightedAnalysisId === f.id && <MousePointer2 className="w-3 h-3 text-blue-400" />}
                                            </div>
                                            <div className="text-slate-500 mt-1">{f.description}</div>
                                        </div>
                                    ))}
                                </div>
                                <button 
                                    onClick={() => setAnalysisOverlay(null)}
                                    className="w-full mt-2 py-1 text-xs text-slate-500 hover:text-white border border-slate-800 rounded"
                                >
                                    清除分析圖層
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
        
        {/* Toggle Sidebar Button (when closed, Desktop only) */}
        {!sidebarOpen && (
            <button 
                onClick={() => setSidebarOpen(true)}
                className="hidden md:block absolute top-4 right-4 bg-slate-800 p-2 rounded text-slate-400 hover:text-white z-20"
            >
                <ChevronLeft />
            </button>
        )}

        {/* OPORD Modal */}
        {showOpordModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                <div className="bg-slate-900 border border-slate-700 w-full max-w-2xl rounded-xl shadow-2xl flex flex-col max-h-[90vh]">
                    <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                        <h3 className="font-bold text-lg text-emerald-400 flex items-center gap-2">
                            <ScrollText className="w-5 h-5" />
                            OPORD 地形分析系統
                        </h3>
                        <button onClick={() => setShowOpordModal(false)} className="text-slate-500 hover:text-white">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                    
                    <div className="p-4 flex-1 flex flex-col gap-4">
                        <div className="bg-slate-950/50 p-3 rounded text-sm text-slate-400 border border-slate-800">
                            請貼上您的作戰命令 (OPORD) 段落。AI 參謀官將自動識別地形特徵、目標區與機動路線，並將其視覺化。
                        </div>
                        <textarea 
                            className="flex-1 min-h-[200px] bg-slate-950 border border-slate-800 rounded p-4 text-sm font-mono focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 resize-none"
                            placeholder="例如：第一排沿軸線 BLUE 向北攻擊，奪取 OBJ FOX (Grid 500, 500)..."
                            value={opordText}
                            onChange={(e) => setOpordText(e.target.value)}
                        />
                    </div>

                    <div className="p-4 border-t border-slate-800 flex justify-end gap-3">
                        <button 
                            onClick={() => setShowOpordModal(false)}
                            className="px-4 py-2 text-slate-400 hover:bg-slate-800 rounded transition-colors text-sm"
                        >
                            取消
                        </button>
                        <button 
                            onClick={handleOpordSubmit}
                            disabled={isOpordLoading || !opordText.trim()}
                            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded shadow-lg shadow-emerald-900/20 disabled:opacity-50 flex items-center gap-2 transition-colors text-sm"
                        >
                            {isOpordLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <BrainCircuit className="w-4 h-4" />}
                            開始分析生成
                        </button>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};

export default App;