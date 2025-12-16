import React, { useRef, useEffect, useState, useMemo, useImperativeHandle, forwardRef } from 'react';
import * as d3 from 'd3';
import { Unit, UnitType, Faction, GeoFeatureCollection, TacticalGraphic, TacticalGraphicType, AnalysisOverlay } from '../types';
import { UnitIcon } from './UnitIcon';
import { MousePointer2, StickyNote, X, Trash2, Tag, Crosshair } from 'lucide-react';

interface WarMapProps {
  mapImage: string | null;
  mapData: GeoFeatureCollection | null;
  units: Unit[];
  setUnits: React.Dispatch<React.SetStateAction<Unit[]>>;
  graphics: TacticalGraphic[];
  setGraphics: React.Dispatch<React.SetStateAction<TacticalGraphic[]>>;
  analysisOverlay: AnalysisOverlay | null;
  highlightedAnalysisId: string | null;
  gridSize: number;
  showGrid: boolean;
  selectedFaction: Faction;
  selectedUnitType: UnitType;
  selectedGraphicType: TacticalGraphicType;
  selectedRole: string;
  mode: 'place' | 'select' | 'draw';
  onHistorySave: () => void;
}

// Designations for dropdown
const UNIT_DESIGNATIONS = [
    "第一班 (1st Sqd)", 
    "第二班 (2nd Sqd)", 
    "第三班 (3rd Sqd)", 
    "第一伍 (1st Team)", 
    "第二伍 (2nd Team)", 
    "第三伍 (3rd Team)",
    "火力班 (Wpn Sqd)",
    "排部 (HQ)"
];

// Tactical Actions list derived from TacticalGraphicType
const TACTICAL_ACTIONS = Object.values(TacticalGraphicType);

export const WarMap = forwardRef((props: WarMapProps, ref) => {
  const {
    mapImage,
    mapData,
    units,
    setUnits,
    graphics,
    setGraphics,
    analysisOverlay,
    highlightedAnalysisId,
    gridSize,
    showGrid,
    selectedFaction,
    selectedUnitType,
    selectedGraphicType,
    selectedRole,
    mode,
    onHistorySave
  } = props;

  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  
  // Interaction States
  const [isDraggingMap, setIsDraggingMap] = useState(false);
  const [mapDragStart, setMapDragStart] = useState({ x: 0, y: 0 });
  
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<{x: number, y: number} | null>(null);
  const [currentMousePos, setCurrentMousePos] = useState<{x: number, y: number} | null>(null);

  // Clicked Coordinate State
  const [clickedPos, setClickedPos] = useState<{x: number, y: number} | null>(null);

  // Mobile Long Press Logic
  const longPressTimer = useRef<any>(null);

  // Annotation/Edit UI
  const [selectedItem, setSelectedItem] = useState<{ type: 'unit' | 'graphic', id: string, x: number, y: number } | null>(null);

  // Expose methods to parent
  useImperativeHandle(ref, () => ({
      downloadMap: handleDownloadMap
  }));

  const handleDownloadMap = async () => {
    if (!svgRef.current) return;

    try {
        const svgElement = svgRef.current;
        const serializer = new XMLSerializer();
        const svgString = serializer.serializeToString(svgElement);
        
        // Create a canvas with the full map dimensions
        const canvas = document.createElement('canvas');
        canvas.width = dimensions.width;
        canvas.height = dimensions.height;
        const ctx = canvas.getContext('2d');
        
        if (!ctx) return;

        // Draw background (black)
        ctx.fillStyle = '#0f172a'; // slate-950
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Function to load image
        const loadImage = (src: string) => {
            return new Promise<HTMLImageElement>((resolve, reject) => {
                const img = new Image();
                img.crossOrigin = "anonymous";
                img.onload = () => resolve(img);
                img.onerror = reject;
                img.src = src;
            });
        };

        const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(svgBlob);
        
        const svgImg = await loadImage(url);
        ctx.drawImage(svgImg, 0, 0);
        
        // Export
        const pngUrl = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = `wargame-map-${Date.now()}.png`;
        link.href = pngUrl;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    } catch (err) {
        console.error("Map Download Error:", err);
        alert("下載地圖失敗，請稍後再試。");
    }
  };

  // Update dimensions based on loaded image or default
  useEffect(() => {
    if (mapImage) {
      const img = new Image();
      img.src = mapImage;
      img.onload = () => {
        setDimensions({ width: img.width, height: img.height });
        setScale(1);
        setPan({ x: 0, y: 0 });
      };
    } else if (mapData) {
      if (containerRef.current) {
         setDimensions({ 
             width: containerRef.current.parentElement?.clientWidth || 800, 
             height: containerRef.current.parentElement?.clientHeight || 600 
         });
      }
    }
  }, [mapImage, mapData]);

  // Calculate Map Projection for Vector Data
  const { pathGenerator, projectedFeatures } = useMemo(() => {
    if (!mapData || !mapData.features.length) return { pathGenerator: null, projectedFeatures: [] };

    const projection = d3.geoMercator();
    projection.fitSize([dimensions.width, dimensions.height], mapData as any);
    const pathGen = d3.geoPath().projection(projection);

    return { 
        pathGenerator: pathGen, 
        projectedFeatures: mapData.features 
    };
  }, [mapData, dimensions]);

  // Clamp helper for Analysis overlay
  const clamp = (val: number, max: number) => Math.max(0, Math.min(val, max));

  // Generate CRG Grid Lines using D3 logic
  const renderGrid = () => {
    if (!showGrid) return null;

    const cols = Math.ceil(dimensions.width / gridSize);
    const rows = Math.ceil(dimensions.height / gridSize);

    const xLines = d3.range(0, cols + 1).map(i => i * gridSize);
    const yLines = d3.range(0, rows + 1).map(i => i * gridSize);

    return (
      <g className="grid-layer pointer-events-none">
        {xLines.map((x, i) => (
          <line
            key={`v-${i}`}
            x1={x}
            y1={0}
            x2={x}
            y2={dimensions.height}
            stroke="rgba(255, 255, 255, 0.3)"
            strokeWidth={1}
            strokeDasharray="4 2"
          />
        ))}
        {yLines.map((y, i) => (
          <line
            key={`h-${i}`}
            x1={0}
            y1={y}
            x2={dimensions.width}
            y2={y}
            stroke="rgba(255, 255, 255, 0.3)"
            strokeWidth={1}
            strokeDasharray="4 2"
          />
        ))}
        {xLines.filter((_, i) => i % 2 === 0).map((x, i) => (
           <text key={`cx-${i}`} x={x + 2} y={12} fill="rgba(255,255,255,0.7)" fontSize="10">{`X:${i*2}`}</text>
        ))}
         {yLines.filter((_, i) => i % 2 === 0).map((y, i) => (
           <text key={`cy-${i}`} x={2} y={y + 12} fill="rgba(255,255,255,0.7)" fontSize="10">{`Y:${i*2}`}</text>
        ))}
      </g>
    );
  };

  // --- Analysis Overlay Rendering ---
  const renderAnalysisOverlay = () => {
    if (!analysisOverlay) return null;

    const shapes: React.ReactNode[] = [];
    const highlightShapes: React.ReactNode[] = [];
    const labels: { id: string; x: number; y: number; text: string; color: string; isHighlighted: boolean }[] = [];

    // 1. First pass: Collect shapes and initial label positions
    analysisOverlay.features.forEach((feature, idx) => {
      const color = feature.color || '#ffff00';
      const isHighlighted = feature.id === highlightedAnalysisId;
      const clampedPoints = feature.points.map(p => ({
          x: clamp(p.x, dimensions.width),
          y: clamp(p.y, dimensions.height)
      }));

      if (feature.type === 'arrow' && clampedPoints.length >= 2) {
        const markerId = `analysis-arrow-${idx}`;
        
        // Use CatmullRom curve for smooth arrow paths
        const pathData = d3.line<{x: number, y: number}>()
          .x(d => d.x)
          .y(d => d.y)
          .curve(d3.curveCatmullRom.alpha(0.5))
          (clampedPoints);
        
        // Highlight Glow for Arrow
        if (isHighlighted) {
            highlightShapes.push(
               <path 
                  key={`glow-arrow-${idx}`}
                  d={pathData || ''}
                  fill="none"
                  stroke={color}
                  strokeWidth={12}
                  strokeOpacity={0.4}
                  strokeLinecap="round"
                  className="animate-pulse"
               />
            );
        }

        shapes.push(
           <g key={`shape-${idx}`}>
              <defs>
                  <marker id={markerId} markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
                    <path d="M0,0 L0,6 L9,3 z" fill={color} />
                  </marker>
              </defs>
              <path 
                d={pathData || ''} 
                fill="none" 
                stroke={color} 
                strokeWidth={isHighlighted ? 6 : 4} 
                strokeDasharray={feature.style === 'dashed' ? "10,5" : "none"}
                markerEnd={`url(#${markerId})`} 
                className={isHighlighted ? "" : "animate-pulse"}
              />
           </g>
        );

        if (feature.label) {
            labels.push({
                id: `label-${idx}`,
                x: clampedPoints[0].x,
                y: clampedPoints[0].y - 10,
                text: feature.label,
                color,
                isHighlighted
            });
        }

      } else if (feature.type === 'zone' && clampedPoints.length >= 3) {
         const pathData = d3.line<{x: number, y: number}>()
          .x(d => d.x)
          .y(d => d.y)
          .curve(d3.curveLinearClosed)
          (clampedPoints);
        
         // Highlight Glow for Zone
        if (isHighlighted) {
            highlightShapes.push(
               <path 
                  key={`glow-zone-${idx}`}
                  d={pathData || ''}
                  fill={color}
                  fillOpacity={0.3}
                  stroke={color}
                  strokeWidth={6}
                  strokeOpacity={0.6}
                  className="animate-pulse"
               />
            );
        }

        shapes.push(
           <path 
              key={`shape-${idx}`}
              d={pathData || ''} 
              fill={color} 
              fillOpacity={isHighlighted ? 0.3 : 0.2} 
              stroke={color} 
              strokeWidth={isHighlighted ? 4 : 2}
              strokeDasharray={feature.style === 'dashed' ? "5,5" : "none"}
            />
        );

        if (feature.label) {
            labels.push({
                id: `label-${idx}`,
                x: clampedPoints[0].x,
                y: clampedPoints[0].y,
                text: feature.label,
                color,
                isHighlighted
            });
        }
      }
    });

    // 2. Collision Resolution for Labels
    const processedLabels = [...labels];
    
    processedLabels.sort((a, b) => a.y - b.y || a.x - b.x);

    for (let i = 0; i < processedLabels.length; i++) {
        for (let j = 0; j < i; j++) {
            const current = processedLabels[i];
            const prev = processedLabels[j];

            const distY = Math.abs(current.y - prev.y);
            const distX = Math.abs(current.x - prev.x);

            if (distY < 18 && distX < 100) {
                current.y = prev.y + 18; 
            }
        }
    }

    return (
      <g className="analysis-layer pointer-events-none">
        {/* Render Highlights first (bottom layer of this group) */}
        {highlightShapes}

        {/* Render Shapes */}
        {shapes}
        
        {/* Render Labels on top */}
        {processedLabels.map((lbl) => (
             <text 
                key={lbl.id}
                x={lbl.x} 
                y={lbl.y} 
                fill={lbl.isHighlighted ? '#ffffff' : lbl.color} 
                fontSize={lbl.isHighlighted ? "16" : "12"} 
                fontWeight="bold"
                paintOrder="stroke"
                stroke={lbl.isHighlighted ? lbl.color : "#000000"}
                strokeWidth={lbl.isHighlighted ? "6" : "4"}
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ 
                    textShadow: '0px 0px 2px black',
                    transition: 'all 0.3s ease'
                }}
              >
                {lbl.text}
              </text>
        ))}
      </g>
    );
  };

  // --- Tactical Graphic Rendering Logic ---
  const renderTacticalGraphic = (graphic: TacticalGraphic, isPreview = false) => {
    // ... (Existing implementation, no changes needed inside render logic, logic reused)
    const start = graphic.points[0];
    const end = graphic.points[1] || start;
    const color = graphic.faction === Faction.RED ? '#ef4444' : graphic.faction === Faction.BLUE ? '#3b82f6' : '#22c55e';
    const strokeWidth = 3;

    // Basic Math
    const angle = Math.atan2(end.y - start.y, end.x - start.x);
    const deg = angle * 180 / Math.PI;
    const dist = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2));

    // Common arrow markers
    const arrowId = `arrow-${graphic.id || 'preview'}`;
    const marker = (
      <marker id={arrowId} markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto-start-reverse" markerUnits="strokeWidth">
        <path d="M0,0 L0,6 L9,3 z" fill={color} />
      </marker>
    );

    let graphicContent;

    switch (graphic.type) {
        
        // --- MISSION VERBS FROM IMAGE ---

        case TacticalGraphicType.ATTACK_BY_FIRE: // Image: Bracket with arrow pointing OUT from center
             graphicContent = (
                <g className={isPreview ? "opacity-50" : ""}>
                    <defs>{marker}</defs>
                    <g transform={`translate(${start.x}, ${start.y}) rotate(${deg})`}>
                        {/* Bracket */}
                        <path d="M-20 20 L-30 0 L-20 -20" fill="none" stroke={color} strokeWidth={strokeWidth} />
                        <path d="M20 20 L30 0 L20 -20" fill="none" stroke={color} strokeWidth={strokeWidth} />
                        {/* Arrow */}
                        <line x1={0} y1={0} x2={dist} y2={0} stroke={color} strokeWidth={strokeWidth} markerEnd={`url(#${arrowId})`} />
                    </g>
                </g>
             );
             break;

        case TacticalGraphicType.BLOCK: 
            graphicContent = (
                <g className={isPreview ? "opacity-50" : ""}>
                    <g transform={`translate(${start.x}, ${start.y}) rotate(${deg})`}>
                        <line x1={0} y1={-25} x2={0} y2={25} stroke={color} strokeWidth={strokeWidth+1} />
                        <line x1={0} y1={0} x2={dist} y2={0} stroke={color} strokeWidth={strokeWidth} />
                    </g>
                </g>
            );
            break;

        case TacticalGraphicType.BREACH:
             graphicContent = (
                <g className={isPreview ? "opacity-50" : ""}>
                     <g transform={`translate(${start.x}, ${start.y}) rotate(${deg})`}>
                         <path d={`M0 -20 L0 20 L${dist} 20`} fill="none" stroke={color} strokeWidth={strokeWidth} />
                         <line x1={0} y1={-20} x2={dist} y2={-20} stroke={color} strokeWidth={strokeWidth} />
                     </g>
                </g>
             );
             break;

        case TacticalGraphicType.BYPASS:
             graphicContent = (
                 <g className={isPreview ? "opacity-50" : ""}>
                    <defs>{marker}</defs>
                     <g transform={`translate(${start.x}, ${start.y}) rotate(${deg})`}>
                        <path d={`M0 -20 L0 20 L${dist} 20`} fill="none" stroke={color} strokeWidth={strokeWidth} markerEnd={`url(#${arrowId})`} />
                        <line x1={0} y1={-20} x2={dist} y2={-20} stroke={color} strokeWidth={strokeWidth} markerEnd={`url(#${arrowId})`} />
                     </g>
                 </g>
             );
             break;
        
        case TacticalGraphicType.CANALIZE:
             graphicContent = (
                 <g className={isPreview ? "opacity-50" : ""}>
                     <g transform={`translate(${start.x}, ${start.y}) rotate(${deg})`}>
                        <path d={`M0 -30 L${dist} -30 L${dist} -10`} fill="none" stroke={color} strokeWidth={strokeWidth} />
                        <line x1={dist} y1={-30} x2={dist+10} y2={-40} stroke={color} strokeWidth={strokeWidth} />
                        <path d={`M0 30 L${dist} 30 L${dist} 10`} fill="none" stroke={color} strokeWidth={strokeWidth} />
                         <line x1={dist} y1={30} x2={dist+10} y2={40} stroke={color} strokeWidth={strokeWidth} />
                     </g>
                 </g>
             );
             break;

        case TacticalGraphicType.CLEAR:
             graphicContent = (
                 <g className={isPreview ? "opacity-50" : ""}>
                    <defs>{marker}</defs>
                     <g transform={`translate(${start.x}, ${start.y}) rotate(${deg})`}>
                        <line x1={dist} y1={-20} x2={dist} y2={20} stroke={color} strokeWidth={strokeWidth} />
                        <line x1={0} y1={-20} x2={dist} y2={-20} stroke={color} strokeWidth={strokeWidth} markerEnd={`url(#${arrowId})`} />
                        <line x1={0} y1={0} x2={dist} y2={0} stroke={color} strokeWidth={strokeWidth} markerEnd={`url(#${arrowId})`} />
                        <line x1={0} y1={20} x2={dist} y2={20} stroke={color} strokeWidth={strokeWidth} markerEnd={`url(#${arrowId})`} />
                     </g>
                 </g>
             );
             break;

        case TacticalGraphicType.CONTAIN:
             const rContain = 25;
             graphicContent = (
                 <g className={isPreview ? "opacity-50" : ""}>
                    <defs>{marker}</defs>
                     <g transform={`translate(${end.x}, ${end.y}) rotate(${deg})`}>
                        <path d={`M0 ${rContain} A ${rContain} ${rContain} 0 1 1 0 ${-rContain}`} fill="none" stroke={color} strokeWidth={strokeWidth} />
                        <line x1={20} y1={10} x2={10} y2={10} stroke={color} strokeWidth={2} />
                        <line x1={25} y1={0} x2={15} y2={0} stroke={color} strokeWidth={2} />
                        <line x1={20} y1={-10} x2={10} y2={-10} stroke={color} strokeWidth={2} />
                        <line x1={50} y1={0} x2={5} y2={0} stroke={color} strokeWidth={strokeWidth} markerEnd={`url(#${arrowId})`} />
                     </g>
                 </g>
             );
             break;

        case TacticalGraphicType.COUNTER_ATTACK:
             graphicContent = (
                 <g className={isPreview ? "opacity-50" : ""}>
                    <defs>{marker}</defs>
                    <g transform={`translate(${start.x}, ${start.y}) rotate(${deg})`}>
                         <line x1={0} y1={0} x2={dist} y2={0} stroke={color} strokeWidth={strokeWidth} strokeDasharray="10,5" markerEnd={`url(#${arrowId})`} />
                         <text x={dist/2} y={-5} fill={color} textAnchor="middle" fontSize="12" fontWeight="bold">CATK</text>
                    </g>
                 </g>
             );
             break;

        case TacticalGraphicType.COUNTER_ATTACK_BY_FIRE:
             graphicContent = (
                 <g className={isPreview ? "opacity-50" : ""}>
                    <defs>{marker}</defs>
                    <g transform={`translate(${start.x}, ${start.y}) rotate(${deg})`}>
                         <line x1={0} y1={0} x2={dist} y2={0} stroke={color} strokeWidth={strokeWidth} strokeDasharray="10,5" markerEnd={`url(#${arrowId})`} />
                         <path d={`M${dist} -15 L${dist-10} 0 L${dist} 15`} fill="none" stroke={color} strokeWidth={strokeWidth} />
                         <text x={dist/2} y={-5} fill={color} textAnchor="middle" fontSize="12" fontWeight="bold">CATK</text>
                    </g>
                 </g>
             );
             break;

        case TacticalGraphicType.COVER:
             graphicContent = (
                <g className={isPreview ? "opacity-50" : ""}>
                    <defs>{marker}</defs>
                    <path 
                        d={`M${start.x},${start.y} L${(start.x+end.x)/2},${(start.y+end.y)/2 - 10} L${(start.x+end.x)/2},${(start.y+end.y)/2 + 10} L${end.x},${end.y}`} 
                        fill="none" 
                        stroke={color} 
                        strokeWidth={strokeWidth} 
                        markerStart={`url(#${arrowId})`}
                        markerEnd={`url(#${arrowId})`}
                    />
                    <text x={(start.x+end.x)/2} y={(start.y+end.y)/2 - 15} textAnchor="middle" fill={color} fontSize="12" fontWeight="bold">C</text>
                </g>
             );
             break;
        
        case TacticalGraphicType.DELAY:
             graphicContent = (
                <g className={isPreview ? "opacity-50" : ""}>
                    <defs>{marker}</defs>
                    <g transform={`translate(${start.x}, ${start.y}) rotate(${deg})`}>
                        <path d={`M0 0 L${dist/2} 0 C ${dist} 0, ${dist} 40, ${dist/2} 40 C 0 40, 0 10, ${dist/2-20} 10`} fill="none" stroke={color} strokeWidth={strokeWidth} markerEnd={`url(#${arrowId})`} />
                        <text x={dist/2} y={0} dy={5} textAnchor="middle" fill={color} fontSize="14" fontWeight="bold">D</text>
                    </g>
                </g>
             );
             break;

        case TacticalGraphicType.DESTROY:
             graphicContent = (
                 <g className={isPreview ? "opacity-50" : ""}>
                    <g transform={`translate(${(start.x+end.x)/2}, ${(start.y+end.y)/2}) rotate(0)`}>
                        <line x1={-20} y1={-20} x2={20} y2={20} stroke={color} strokeWidth={strokeWidth} />
                        <line x1={-20} y1={20} x2={20} y2={-20} stroke={color} strokeWidth={strokeWidth} />
                    </g>
                 </g>
             );
             break;

        case TacticalGraphicType.DISRUPT:
             graphicContent = (
                 <g className={isPreview ? "opacity-50" : ""}>
                    <defs>{marker}</defs>
                    <g transform={`translate(${start.x}, ${start.y}) rotate(${deg})`}>
                        <line x1={0} y1={0} x2={dist/2} y2={0} stroke={color} strokeWidth={strokeWidth} />
                        <line x1={dist/2} y1={-15} x2={dist/2} y2={15} stroke={color} strokeWidth={strokeWidth} />
                        <line x1={dist/2} y1={0} x2={dist/2} y2={-30} stroke={color} strokeWidth={strokeWidth} markerEnd={`url(#${arrowId})`} />
                    </g>
                 </g>
             );
             break;
        
        case TacticalGraphicType.FIX:
            const mid = { x: (start.x + end.x)/2, y: (start.y + end.y)/2 };
            graphicContent = (
                <g className={isPreview ? "opacity-50" : ""}>
                    <defs>{marker}</defs>
                    <path 
                        d={`M${start.x},${start.y} L${(start.x+mid.x)/2},${(start.y+mid.y)/2 - 15} L${mid.x},${mid.y + 15} L${(mid.x+end.x)/2},${(mid.y+end.y)/2 - 15} L${end.x},${end.y}`} 
                        fill="none" 
                        stroke={color} 
                        strokeWidth={strokeWidth} 
                        markerEnd={`url(#${arrowId})`}
                    />
                </g>
            );
            break;

        case TacticalGraphicType.FOLLOW_AND_ASSUME:
             graphicContent = (
                 <g className={isPreview ? "opacity-50" : ""}>
                    <defs>{marker}</defs>
                    <g transform={`translate(${start.x}, ${start.y}) rotate(${deg})`}>
                        <path d="M-10 -10 L10 -10 L15 0 L10 10 L-10 10 L-10 -10" fill="none" stroke={color} strokeWidth={strokeWidth} />
                        <line x1={15} y1={0} x2={dist-15} y2={0} stroke={color} strokeWidth={strokeWidth} strokeDasharray="4,4" />
                        <path d={`M${dist-15} -15 L${dist} 0 L${dist-15} 15 M${dist-20} -15 L${dist-5} 0 L${dist-20} 15`} fill="none" stroke={color} strokeWidth={strokeWidth} />
                    </g>
                 </g>
             );
             break;

        case TacticalGraphicType.FOLLOW_AND_SUPPORT:
             graphicContent = (
                 <g className={isPreview ? "opacity-50" : ""}>
                    <defs>{marker}</defs>
                    <g transform={`translate(${start.x}, ${start.y}) rotate(${deg})`}>
                         <path d="M-10 -10 L10 -10 L15 0 L10 10 L-10 10 L-10 -10" fill="none" stroke={color} strokeWidth={strokeWidth} />
                         <line x1={15} y1={0} x2={dist-10} y2={0} stroke={color} strokeWidth={strokeWidth} />
                         <path d={`M${dist-15} -15 L${dist} 0 L${dist-15} 15`} fill="none" stroke={color} strokeWidth={strokeWidth} />
                    </g>
                 </g>
             );
             break;
        
        case TacticalGraphicType.GUARD:
             graphicContent = (
                <g className={isPreview ? "opacity-50" : ""}>
                    <defs>{marker}</defs>
                    <path 
                        d={`M${start.x},${start.y} L${(start.x+end.x)/2},${(start.y+end.y)/2 - 10} L${(start.x+end.x)/2},${(start.y+end.y)/2 + 10} L${end.x},${end.y}`} 
                        fill="none" 
                        stroke={color} 
                        strokeWidth={strokeWidth} 
                        markerStart={`url(#${arrowId})`}
                        markerEnd={`url(#${arrowId})`}
                    />
                    <text x={(start.x+end.x)/2} y={(start.y+end.y)/2 - 15} textAnchor="middle" fill={color} fontSize="12" fontWeight="bold">G</text>
                </g>
             );
             break;

        case TacticalGraphicType.INTERDICT:
             graphicContent = (
                 <g className={isPreview ? "opacity-50" : ""}>
                    <defs>{marker}</defs>
                    <g transform={`translate(${(start.x+end.x)/2}, ${(start.y+end.y)/2})`}>
                        <line x1={-30} y1={10} x2={30} y2={-10} stroke={color} strokeWidth={strokeWidth} markerEnd={`url(#${arrowId})`} />
                        <line x1={-30} y1={-10} x2={30} y2={10} stroke={color} strokeWidth={strokeWidth} markerEnd={`url(#${arrowId})`} />
                    </g>
                 </g>
             );
             break;

        case TacticalGraphicType.ISOLATE:
             graphicContent = (
                 <g className={isPreview ? "opacity-50" : ""}>
                    <defs>{marker}</defs>
                    <g transform={`translate(${(start.x+end.x)/2}, ${(start.y+end.y)/2})`}>
                        <circle cx={0} cy={0} r={20} fill="none" stroke={color} strokeWidth={strokeWidth} />
                        {[0, 45, 90, 135, 180, 225, 270, 315].map(ang => (
                            <line 
                                key={ang}
                                x1={30 * Math.cos(ang * Math.PI / 180)} 
                                y1={30 * Math.sin(ang * Math.PI / 180)} 
                                x2={20 * Math.cos(ang * Math.PI / 180)} 
                                y2={20 * Math.sin(ang * Math.PI / 180)} 
                                stroke={color} 
                                strokeWidth={2}
                                markerEnd={`url(#${arrowId})`} 
                            />
                        ))}
                    </g>
                 </g>
             );
             break;

        case TacticalGraphicType.NEUTRALIZE:
             graphicContent = (
                 <g className={isPreview ? "opacity-50" : ""}>
                    <g transform={`translate(${(start.x+end.x)/2}, ${(start.y+end.y)/2})`}>
                        <line x1={-20} y1={-20} x2={20} y2={20} stroke={color} strokeWidth={strokeWidth} />
                        <line x1={-20} y1={20} x2={20} y2={-20} stroke={color} strokeWidth={strokeWidth} />
                        <line x1={0} y1={-30} x2={0} y2={30} stroke={color} strokeWidth={strokeWidth} strokeDasharray="4,4" />
                    </g>
                 </g>
             );
             break;

        case TacticalGraphicType.OCCUPY:
             graphicContent = (
                 <g className={isPreview ? "opacity-50" : ""}>
                    <g transform={`translate(${(start.x+end.x)/2}, ${(start.y+end.y)/2})`}>
                        <circle cx={0} cy={0} r={25} fill="none" stroke={color} strokeWidth={strokeWidth} />
                        <g transform="translate(-25, 0)">
                             <line x1={-5} y1={-5} x2={5} y2={5} stroke={color} strokeWidth={strokeWidth} />
                             <line x1={-5} y1={5} x2={5} y2={-5} stroke={color} strokeWidth={strokeWidth} />
                        </g>
                    </g>
                 </g>
             );
             break;

        case TacticalGraphicType.PENETRATE:
             graphicContent = (
                 <g className={isPreview ? "opacity-50" : ""}>
                    <defs>{marker}</defs>
                    <g transform={`translate(${start.x}, ${start.y}) rotate(${deg})`}>
                        <line x1={dist} y1={-20} x2={dist} y2={20} stroke={color} strokeWidth={strokeWidth} />
                        <line x1={0} y1={0} x2={dist+10} y2={0} stroke={color} strokeWidth={strokeWidth} markerEnd={`url(#${arrowId})`} />
                    </g>
                 </g>
             );
             break;

        case TacticalGraphicType.RELIEF_IN_PLACE:
             graphicContent = (
                <g className={isPreview ? "opacity-50" : ""}>
                    <defs>{marker}</defs>
                    <g transform={`translate(${start.x}, ${start.y}) rotate(${deg})`}>
                        <path d={`M0 0 L${dist/2} 0 C ${dist} 0, ${dist} 30, ${dist/2} 30 L0 30`} fill="none" stroke={color} strokeWidth={strokeWidth} markerEnd={`url(#${arrowId})`} />
                        <line x1={dist/2} y1={15} x2={dist/2 + 10} y2={5} stroke={color} strokeWidth={2} />
                        <text x={dist/2} y={10} dy={0} textAnchor="middle" fill={color} fontSize="12" fontWeight="bold">RIP</text>
                    </g>
                </g>
             );
             break;

        case TacticalGraphicType.RETAIN:
             graphicContent = (
                 <g className={isPreview ? "opacity-50" : ""}>
                    <g transform={`translate(${(start.x+end.x)/2}, ${(start.y+end.y)/2})`}>
                        <circle cx={0} cy={0} r={25} fill="none" stroke={color} strokeWidth={strokeWidth} />
                        {[0, 45, 90, 135, 180, 225, 270, 315].map(ang => (
                            <line 
                                key={ang}
                                x1={25 * Math.cos(ang * Math.PI / 180)} 
                                y1={25 * Math.sin(ang * Math.PI / 180)} 
                                x2={20 * Math.cos(ang * Math.PI / 180)} 
                                y2={20 * Math.sin(ang * Math.PI / 180)} 
                                stroke={color} 
                                strokeWidth={2}
                            />
                        ))}
                    </g>
                 </g>
             );
             break;

        case TacticalGraphicType.SCREEN:
             graphicContent = (
                <g className={isPreview ? "opacity-50" : ""}>
                    <defs>{marker}</defs>
                    <path 
                        d={`M${start.x},${start.y} L${(start.x+end.x)/2},${(start.y+end.y)/2 - 10} L${(start.x+end.x)/2},${(start.y+end.y)/2 + 10} L${end.x},${end.y}`} 
                        fill="none" 
                        stroke={color} 
                        strokeWidth={strokeWidth} 
                        markerStart={`url(#${arrowId})`}
                        markerEnd={`url(#${arrowId})`}
                    />
                    <text x={(start.x+end.x)/2} y={(start.y+end.y)/2 - 15} textAnchor="middle" fill={color} fontSize="12" fontWeight="bold">S</text>
                </g>
             );
             break;

        case TacticalGraphicType.SECURE:
            graphicContent = (
                 <g className={isPreview ? "opacity-50" : ""}>
                    <defs>{marker}</defs>
                    <g transform={`translate(${(start.x+end.x)/2}, ${(start.y+end.y)/2})`}>
                        <path 
                            d="M 25 0 A 25 25 0 1 1 24 -5"
                            fill="none"
                            stroke={color}
                            strokeWidth={strokeWidth}
                            markerEnd={`url(#${arrowId})`}
                        />
                    </g>
                 </g>
             );
            break;

        case TacticalGraphicType.SEIZE:
            graphicContent = (
                <g className={isPreview ? "opacity-50" : ""}>
                    <defs>{marker}</defs>
                    <g transform={`translate(${(start.x+end.x)/2}, ${(start.y+end.y)/2})`}>
                         <circle cx={-30} cy={0} r={20} fill="none" stroke={color} strokeWidth={strokeWidth} />
                         <path d="M 0 0 Q 20 -20 30 10" fill="none" stroke={color} strokeWidth={strokeWidth} markerEnd={`url(#${arrowId})`} transform="translate(-10, -20)"/>
                    </g>
                </g>
            );
            break;

        case TacticalGraphicType.SUPPORT_BY_FIRE:
            // Custom SBF based on user request: "H" shape with arrows on top
            // Two parallel lines with a crossbar.
            const sbfWidth = 40; // Distance between shafts
            const sbfFrontLen = 30; // Length from crossbar to arrow tip
            const sbfBackLen = 15; // Length from crossbar to tail
            
            graphicContent = (
                <g className={isPreview ? "opacity-50" : ""}>
                    <defs>{marker}</defs>
                    <g transform={`translate(${start.x}, ${start.y}) rotate(${deg})`}>
                        {/* Crossbar */}
                        <line 
                            x1={0} y1={-sbfWidth/2} 
                            x2={0} y2={sbfWidth/2} 
                            stroke={color} 
                            strokeWidth={strokeWidth} 
                        />
                        
                        {/* Left Shaft (Top in rotated frame if x is forward) */}
                        {/* Note: y is negative for left */}
                        <line 
                            x1={-sbfBackLen} y1={-sbfWidth/2} 
                            x2={sbfFrontLen} y2={-sbfWidth/2} 
                            stroke={color} 
                            strokeWidth={strokeWidth} 
                            markerEnd={`url(#${arrowId})`} 
                        />
                        
                        {/* Right Shaft */}
                        <line 
                            x1={-sbfBackLen} y1={sbfWidth/2} 
                            x2={sbfFrontLen} y2={sbfWidth/2} 
                            stroke={color} 
                            strokeWidth={strokeWidth} 
                            markerEnd={`url(#${arrowId})`} 
                        />
                    </g>
                </g>
            );
            break;

        case TacticalGraphicType.RETIREMENT:
             graphicContent = (
                <g className={isPreview ? "opacity-50" : ""}>
                    <defs>{marker}</defs>
                    <g transform={`translate(${start.x}, ${start.y}) rotate(${deg})`}>
                        <path d={`M0 0 L${dist/2} 0 C ${dist} 0, ${dist} 30, ${dist/2} 30 L0 30`} fill="none" stroke={color} strokeWidth={strokeWidth} markerEnd={`url(#${arrowId})`} />
                        <text x={dist/2} y={10} dy={0} textAnchor="middle" fill={color} fontSize="12" fontWeight="bold">R</text>
                    </g>
                </g>
             );
             break;

        case TacticalGraphicType.WITHDRAW:
             graphicContent = (
                <g className={isPreview ? "opacity-50" : ""}>
                    <defs>{marker}</defs>
                    <g transform={`translate(${start.x}, ${start.y}) rotate(${deg})`}>
                        <path d={`M0 0 L${dist/2} 0 C ${dist} 0, ${dist} 30, ${dist/2} 30 L0 30`} fill="none" stroke={color} strokeWidth={strokeWidth} markerEnd={`url(#${arrowId})`} />
                        <text x={dist/2} y={10} dy={0} textAnchor="middle" fill={color} fontSize="12" fontWeight="bold">W</text>
                    </g>
                </g>
             );
             break;

        case TacticalGraphicType.AXIS_OF_ADVANCE:
            const width = 20;
            const headLen = 30;
            const perpAngle = angle + Math.PI / 2;
            const p1 = { x: start.x + width * Math.cos(perpAngle), y: start.y + width * Math.sin(perpAngle) };
            const p2 = { x: start.x - width * Math.cos(perpAngle), y: start.y - width * Math.sin(perpAngle) };
            const headBaseCenter = { x: end.x - headLen * Math.cos(angle), y: end.y - headLen * Math.sin(angle) };
            const p3 = { x: headBaseCenter.x - width * Math.cos(perpAngle), y: headBaseCenter.y - width * Math.sin(perpAngle) };
            const p4 = { x: headBaseCenter.x + width * Math.cos(perpAngle), y: headBaseCenter.y + width * Math.sin(perpAngle) };
            const p5 = { x: headBaseCenter.x - width * 1.8 * Math.cos(perpAngle), y: headBaseCenter.y - width * 1.8 * Math.sin(perpAngle) };
            const p6 = { x: headBaseCenter.x + width * 1.8 * Math.cos(perpAngle), y: headBaseCenter.y + width * 1.8 * Math.sin(perpAngle) };
            graphicContent = (
                <g className={isPreview ? "opacity-50" : ""}>
                    <path 
                        d={`M${p1.x},${p1.y} L${p4.x},${p4.y} L${p6.x},${p6.y} L${end.x},${end.y} L${p5.x},${p5.y} L${p3.x},${p3.y} L${p2.x},${p2.y}`}
                        fill="none"
                        stroke={color}
                        strokeWidth={strokeWidth}
                    />
                </g>
            );
            break;

        case TacticalGraphicType.BOUNDARY: 
            graphicContent = (
                 <g className={isPreview ? "opacity-50" : ""}>
                    <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke={color} strokeWidth={2} />
                    <circle cx={(start.x+end.x)/2} cy={(start.y+end.y)/2} r={3} fill={color} />
                    <text x={(start.x+end.x)/2} y={(start.y+end.y)/2} dy={-5} textAnchor="middle" fill={color} fontSize="10">(XX)</text>
                 </g>
            );
            break;

        case TacticalGraphicType.PHASE_LINE: 
            graphicContent = (
                 <g className={isPreview ? "opacity-50" : ""}>
                    <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke={color} strokeWidth={strokeWidth} strokeDasharray="15,10" />
                    <text x={start.x} y={start.y} fill={color} fontWeight="bold" fontSize="12">PL RED</text>
                    <text x={end.x} y={end.y} fill={color} fontWeight="bold" fontSize="12">PL RED</text>
                 </g>
            );
            break;

        case TacticalGraphicType.UAV:
             graphicContent = (
                <g className={isPreview ? "opacity-50" : ""}>
                    <defs>{marker}</defs>
                    {/* Dashed flight path curve */}
                    <path d={`M${start.x},${start.y} Q${(start.x+end.x)/2},${(start.y+end.y)/2 - 50} ${end.x},${end.y}`}
                          fill="none" stroke={color} strokeWidth={2} strokeDasharray="5,5" markerEnd={`url(#${arrowId})`} />
                    
                    {/* Drone icon at midpoint */}
                     <g transform={`translate(${(start.x+end.x)/2}, ${(start.y+end.y)/2 - 25})`}>
                         <g transform="scale(1.2)">
                            <path d="M-10 0 L10 0 M0 -5 L0 5" stroke={color} strokeWidth={2} />
                            <circle cx="0" cy="0" r="8" fill="none" stroke={color} strokeWidth={2} />
                         </g>
                     </g>
                </g>
             );
             break;

        case TacticalGraphicType.VEHICLE:
             graphicContent = (
                 <g className={isPreview ? "opacity-50" : ""}>
                    <defs>{marker}</defs>
                    {/* Thick road/path */}
                    <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke={color} strokeWidth={6} strokeOpacity={0.8} />
                    {/* Tire track effect */}
                    <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke="black" strokeWidth={2} strokeDasharray="10,10" />
                    {/* Wheel icon at end */}
                    <g transform={`translate(${end.x}, ${end.y})`}>
                        <circle cx={0} cy={0} r={6} fill={color} stroke="black" strokeWidth={2} />
                    </g>
                 </g>
             );
             break;

        default: // Default Arrow
             graphicContent = (
                <g className={isPreview ? "opacity-50" : ""}>
                    <defs>{marker}</defs>
                    <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke={color} strokeWidth={strokeWidth} markerEnd={`url(#${arrowId})`} />
                </g>
            );
    }
    
    // Add Annotation Icon if exists
    if (!isPreview && graphic.note) {
        const midX = (start.x + end.x) / 2;
        const midY = (start.y + end.y) / 2;
        return (
            <g>
                {graphicContent}
                <rect x={midX} y={midY} width="16" height="16" fill="#fbbf24" rx="4" />
                <text x={midX + 8} y={midY + 12} textAnchor="middle" fontSize="10" fill="black">i</text>
            </g>
        )
    }
    
    return graphicContent;
  };

  // --- Input Handlers ---

  const getMapCoordinates = (e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    const rawX = e.clientX - rect.left;
    const rawY = e.clientY - rect.top;
    return {
        x: (rawX - pan.x) / scale,
        y: (rawY - pan.y) / scale
    };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    // Capture Coordinate on Click
    const { x, y } = getMapCoordinates(e);
    setClickedPos({ x, y });

    // 1. Pan Mode (Middle Click or Select Mode)
    if (e.button === 1 || (e.button === 0 && mode === 'select')) { 
        setIsDraggingMap(true);
        setMapDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
        setSelectedItem(null);
        return;
    }
    
    // 2. Unit Placement
    if (mode === 'place' && e.button === 0) {
        const snappedX = Math.floor(x / gridSize) * gridSize + gridSize / 2;
        const snappedY = Math.floor(y / gridSize) * gridSize + gridSize / 2;

        if (x >= 0 && x <= dimensions.width && y >= 0 && y <= dimensions.height) {
             onHistorySave(); // Save history before adding unit
             const newUnit: Unit = {
                id: Math.random().toString(36).substr(2, 9),
                type: selectedUnitType,
                faction: selectedFaction,
                role: selectedRole,
                x: snappedX - 16,
                y: snappedY - 16,
            };
            setUnits([...units, newUnit]);
        }
    }

    // 3. Draw Tactical Graphic
    if (mode === 'draw' && e.button === 0) {
        const coords = getMapCoordinates(e);
        setIsDrawing(true);
        setDrawStart(coords);
        setCurrentMousePos(coords);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDraggingMap) {
      setPan({
        x: e.clientX - mapDragStart.x,
        y: e.clientY - mapDragStart.y
      });
    }

    if (isDrawing && drawStart) {
        setCurrentMousePos(getMapCoordinates(e));
    }
  };

  const handleMouseUp = () => {
    if (isDraggingMap) {
        setIsDraggingMap(false);
    }

    if (isDrawing && drawStart && currentMousePos) {
        // Commit Graphic
        onHistorySave(); // Save history before adding graphic
        const newGraphic: TacticalGraphic = {
            id: Math.random().toString(36).substr(2, 9),
            type: selectedGraphicType,
            faction: selectedFaction,
            points: [drawStart, currentMousePos]
        };
        setGraphics([...graphics, newGraphic]);
        setIsDrawing(false);
        setDrawStart(null);
        setCurrentMousePos(null);
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setScale(s => Math.min(Math.max(0.1, s * delta), 5));
  };

  const removeUnit = (id: string, e: React.MouseEvent | React.TouchEvent) => {
      e.stopPropagation();
      // e.preventDefault(); // allow click to bubble if needed
      onHistorySave(); // Save before delete
      setUnits(units.filter(u => u.id !== id));
      setSelectedItem(null);
  };

  const removeGraphic = (id: string, e: React.MouseEvent | React.TouchEvent) => {
      e.stopPropagation();
      // e.preventDefault();
      onHistorySave(); // Save before delete
      setGraphics(graphics.filter(g => g.id !== id));
      setSelectedItem(null);
  };

  const handleItemClick = (type: 'unit' | 'graphic', id: string, x: number, y: number, e: React.MouseEvent) => {
      e.stopPropagation();
      setSelectedItem({ type, id, x, y });
  };

  const updateNote = (text: string) => {
      if (!selectedItem) return;
      onHistorySave();
      
      if (selectedItem.type === 'unit') {
          setUnits(units.map(u => u.id === selectedItem.id ? { ...u, note: text } : u));
      } else {
          setGraphics(graphics.map(g => g.id === selectedItem.id ? { ...g, note: text } : g));
      }
  };

  const getSelectedNote = () => {
      if (!selectedItem) return '';
      if (selectedItem.type === 'unit') {
          return units.find(u => u.id === selectedItem.id)?.note || '';
      } else {
          return graphics.find(g => g.id === selectedItem.id)?.note || '';
      }
  };

  // Helper for Mobile Long Press
  const handleTouchStart = (e: React.TouchEvent, callback: () => void) => {
      // Start timer
      longPressTimer.current = setTimeout(() => {
          if (navigator.vibrate) navigator.vibrate(50); // Haptic feedback
          if (window.confirm('確定要刪除此項目嗎？')) {
              onHistorySave(); // Save before delete
              callback();
          }
      }, 600); // 600ms for long press
  };

  const handleTouchEnd = () => {
      if (longPressTimer.current) {
          clearTimeout(longPressTimer.current);
          longPressTimer.current = null;
      }
  };

  return (
    <div className="flex-1 relative bg-slate-900 overflow-hidden flex items-center justify-center cursor-crosshair h-full"
         onContextMenu={(e) => e.preventDefault()}
         onClick={() => setSelectedItem(null)} // Click bg to deselect
    >
      
      {!mapImage && !mapData && (
        <div className="text-slate-500 flex flex-col items-center p-4 text-center">
            <MousePointer2 className="w-16 h-16 mb-4 opacity-50" />
            <p>請上傳地圖檔案 (Image, KML, GeoJSON) 以開始兵推。</p>
        </div>
      )}

      {(mapImage || mapData) && (
        <div 
            ref={containerRef}
            className="origin-top-left shadow-2xl shadow-black bg-slate-950"
            style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
                width: dimensions.width,
                height: dimensions.height,
                cursor: isDraggingMap ? 'grabbing' : mode === 'place' || mode === 'draw' ? 'crosshair' : 'default'
            }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
        >
            <svg 
                ref={svgRef}
                width={dimensions.width} 
                height={dimensions.height} 
                className="absolute top-0 left-0 overflow-visible"
                xmlns="http://www.w3.org/2000/svg"
            >
                {/* 1. Background Image - inside SVG for single-file download */}
                {mapImage && (
                    <image href={mapImage} x="0" y="0" width={dimensions.width} height={dimensions.height} preserveAspectRatio="none" />
                )}

                {/* 2. Terrain Vector Data */}
                {pathGenerator && projectedFeatures.map((feature, i) => {
                    const isPolygon = feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon';
                    const isLine = feature.geometry.type === 'LineString' || feature.geometry.type === 'LineString';
                    
                    return (
                        <g key={`geo-${i}`}>
                          <path 
                              d={pathGenerator(feature as any) || ''}
                              fill={isPolygon ? "rgba(234, 179, 8, 0.2)" : "none"} 
                              stroke={isLine ? "#ef4444" : "rgba(234, 179, 8, 0.6)"}
                              strokeWidth={isLine ? 3 : 2}
                              className="pointer-events-none"
                          />
                        </g>
                    );
                })}

                {renderGrid()}
                
                {/* 3. Render Existing Graphics with Touch Support */}
                {graphics.map(g => (
                    <g 
                        key={g.id} 
                        onClick={(e) => handleItemClick('graphic', g.id, g.points[0].x, g.points[0].y, e)}
                        onContextMenu={(e) => removeGraphic(g.id, e as any)}
                        onTouchStart={(e) => handleTouchStart(e, () => setGraphics(prev => prev.filter(i => i.id !== g.id)))}
                        onTouchEnd={handleTouchEnd}
                        onTouchMove={handleTouchEnd} // Cancel on move
                        className="cursor-pointer hover:opacity-80"
                    >
                        {renderTacticalGraphic(g)}
                        <title>{g.type}{g.note ? `: ${g.note}` : ''}</title>
                    </g>
                ))}

                {/* 4. Render AI Analysis Overlay */}
                {renderAnalysisOverlay()}

                {/* 5. Drawing Preview */}
                {isDrawing && drawStart && currentMousePos && (
                    renderTacticalGraphic({
                        id: 'preview',
                        type: selectedGraphicType,
                        faction: selectedFaction,
                        points: [drawStart, currentMousePos]
                    }, true)
                )}

                {/* 6. Render Units with Touch Support */}
                {units.map((unit) => (
                    <g 
                        key={unit.id} 
                        transform={`translate(${unit.x}, ${unit.y})`}
                        onClick={(e) => handleItemClick('unit', unit.id, unit.x, unit.y, e)}
                        onContextMenu={(e) => removeUnit(unit.id, e as any)}
                        onTouchStart={(e) => handleTouchStart(e, () => setUnits(prev => prev.filter(u => u.id !== unit.id)))}
                        onTouchEnd={handleTouchEnd}
                        onTouchMove={handleTouchEnd} // Cancel on move
                        className="cursor-pointer hover:opacity-80 transition-opacity"
                    >
                        <UnitIcon type={unit.type} faction={unit.faction} role={unit.role} size={32} />
                        {unit.note && (
                            <circle cx="28" cy="4" r="4" fill="#fbbf24" stroke="black" strokeWidth="1" />
                        )}
                        <title>{`${unit.faction} - ${unit.role}`}{unit.note ? `: ${unit.note}` : ''}</title>
                    </g>
                ))}
            </svg>
        </div>
      )}

      {/* Annotation Popup */}
      {selectedItem && (
          <div 
            className="absolute z-50 bg-slate-800 p-2 rounded shadow-lg border border-slate-700 flex flex-col gap-2 w-56"
            style={{ 
                left: pan.x + (selectedItem.x * scale) + 20, 
                top: pan.y + (selectedItem.y * scale) - 20 
            }}
            onClick={(e) => e.stopPropagation()}
          >
              <div className="flex justify-between items-center text-xs text-slate-400 border-b border-slate-700 pb-1">
                  <span>編輯資訊</span>
                  <button onClick={() => setSelectedItem(null)}><X className="w-3 h-3" /></button>
              </div>
              
              {/* Unit Designation Selector */}
              <div className="flex items-center gap-1 bg-black border border-slate-700 rounded p-1">
                  <Tag className="w-3 h-3 text-slate-500" />
                  <select 
                    className="w-full bg-black text-xs text-white outline-none appearance-none"
                    value=""
                    onChange={(e) => {
                        const val = e.target.value;
                        if (!val) return;
                        const current = getSelectedNote();
                        updateNote(`${val} ${current}`.trim());
                    }}
                  >
                      <option value="">選擇建制/呼號...</option>
                      {UNIT_DESIGNATIONS.map(designation => (
                          <option key={designation} value={designation.split(' ')[0]}>{designation}</option>
                      ))}
                  </select>
              </div>

              {/* Tactical Action Selector */}
              <div className="flex items-center gap-1 bg-black border border-slate-700 rounded p-1">
                  <Crosshair className="w-3 h-3 text-slate-500" />
                  <select 
                    className="w-full bg-black text-xs text-white outline-none appearance-none"
                    value=""
                    onChange={(e) => {
                        const val = e.target.value;
                        if (!val) return;
                        const current = getSelectedNote();
                        // Append tactical action specifically
                        updateNote(`${current} [戰術動作: ${val}]`.trim());
                    }}
                  >
                      <option value="">選擇戰術動作...</option>
                      {TACTICAL_ACTIONS.map(action => (
                          <option key={action} value={action}>{action}</option>
                      ))}
                  </select>
              </div>

              <textarea 
                  className="w-full h-20 bg-slate-900 border border-slate-700 rounded p-1 text-xs text-white resize-none"
                  placeholder="輸入任務或備註..."
                  value={getSelectedNote()}
                  onChange={(e) => updateNote(e.target.value)}
              />
              <button 
                onClick={(e) => selectedItem.type === 'unit' ? removeUnit(selectedItem.id, e as any) : removeGraphic(selectedItem.id, e as any)}
                className="flex items-center gap-2 text-xs text-red-400 hover:bg-slate-700 p-1 rounded"
              >
                  <Trash2 className="w-3 h-3" /> 刪除物件
              </button>
          </div>
      )}

      <div className="absolute bottom-4 right-4 bg-slate-800/90 p-2 rounded-lg border border-slate-700 flex gap-2 z-10">
         {clickedPos && (
             <div className="text-xs text-slate-400 px-2 flex items-center border-r border-slate-700 mr-2">
                 <Crosshair className="w-3 h-3 mr-1" />
                 Grid: {Math.floor(clickedPos.x / gridSize)}, {Math.floor(clickedPos.y / gridSize)}
             </div>
         )}
         <div className="text-xs text-slate-400 px-2 flex items-center">
             縮放: {Math.round(scale * 100)}%
         </div>
         <button onClick={() => setScale(1)} className="p-1 hover:bg-slate-700 rounded text-slate-300" title="重置視圖">
            重置
         </button>
      </div>

      <div className="absolute top-4 right-4 bg-slate-800/90 p-2 rounded-lg border border-slate-700 z-10 hidden md:block">
         <div className="text-xs font-bold text-emerald-400 mb-1">操作模式</div>
         <div className="text-xs text-slate-200">
            {mode === 'place' && '左鍵: 部署 / 點擊: 編輯 / 長按: 刪除'}
            {mode === 'draw' && '拖曳: 繪製 / 點擊: 編輯 / 長按: 刪除'}
            {mode === 'select' && '拖曳: 移動地圖'}
         </div>
      </div>
    </div>
  );
});