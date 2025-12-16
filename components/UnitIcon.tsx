import React from 'react';
import { UnitType, Faction } from '../types';

interface UnitIconProps {
  type: UnitType;
  faction: Faction;
  role: string;
  size: number;
}

export const UnitIcon: React.FC<UnitIconProps> = ({ type, faction, role, size }) => {
  // NATO Standard Colors
  const color = faction === Faction.BLUE ? '#80e0ff' : faction === Faction.RED ? '#ff8080' : '#90ee90'; // Light fill
  const stroke = faction === Faction.BLUE ? '#000000' : faction === Faction.RED ? '#000000' : '#000000'; // Black lines usually
  const mainColor = faction === Faction.BLUE ? '#0000FF' : faction === Faction.RED ? '#FF0000' : '#00AA00'; // For lines/symbols

  const label = role.length <= 5 ? role : role.substring(0, 3);

  // 1. Draw Frame (Frame varies by Faction)
  const renderFrame = () => {
    switch (faction) {
      case Faction.BLUE: // Rectangle
        return <rect x="5" y="15" width="90" height="70" fill={color} stroke={mainColor} strokeWidth="4" />;
      case Faction.RED: // Diamond
        return <polygon points="50,5 95,50 50,95 5,50" fill={color} stroke={mainColor} strokeWidth="4" />;
      case Faction.NEUTRAL: // Square
        return <rect x="10" y="10" width="80" height="80" fill={color} stroke={mainColor} strokeWidth="4" />;
      default:
        return <rect x="5" y="15" width="90" height="70" fill={color} stroke={mainColor} strokeWidth="4" />;
    }
  };

  // 2. Echelon Modifier (Size Indicator above frame)
  const renderEchelon = () => {
    switch (type) {
        case UnitType.INFANTRY_SQUAD: 
            // Squad: One filled dot
            return <circle cx="50" cy="8" r="5" fill={mainColor} />;
        
        case UnitType.INFANTRY_TEAM:
            // Team: Circle with diagonal slash (Ø)
            return (
                <g>
                    <circle cx="50" cy="8" r="5" fill="none" stroke={mainColor} strokeWidth="2" />
                    <line x1="46" y1="12" x2="54" y2="4" stroke={mainColor} strokeWidth="2" />
                </g>
            );
        default:
            return null;
    }
  };

  // 3. Draw Inner Symbol (Iconography)
  const renderSymbol = () => {
    const symbolProps = {
      stroke: mainColor,
      strokeWidth: "4",
      fill: "none"
    };

    switch (type) {
      case UnitType.INFANTRY:
      case UnitType.INFANTRY_SQUAD:
      case UnitType.INFANTRY_TEAM:
        return <path d="M10 20 L90 80 M90 20 L10 80" {...symbolProps} />; // X
      
      case UnitType.MECH_INF:
        return (
          <g>
            <path d="M10 20 L90 80 M90 20 L10 80" {...symbolProps} /> {/* X */}
            <ellipse cx="50" cy="50" rx="15" ry="25" {...symbolProps} /> {/* Oval track */}
          </g>
        );

      case UnitType.MOTORIZED_INF:
        return (
          <g>
            <path d="M10 20 L90 80 M90 20 L10 80" {...symbolProps} /> {/* X */}
            <line x1="50" y1="15" x2="50" y2="85" {...symbolProps} /> {/* Vertical line */}
          </g>
        );

      case UnitType.ARMOR:
        return <ellipse cx="50" cy="50" rx="35" ry="20" {...symbolProps} />; // Oval

      case UnitType.WHEELED_ARMOR:
         return (
          <g>
            <ellipse cx="50" cy="50" rx="35" ry="20" {...symbolProps} /> {/* Oval */}
            <line x1="50" y1="30" x2="50" y2="70" {...symbolProps} /> {/* Line implies wheeled */}
          </g>
         );

      case UnitType.RECON:
        return <path d="M10 80 L90 20" {...symbolProps} />; // Slash /
      
      case UnitType.ENGINEER:
        // PDF Page 18: Sideways E
        return <path d="M20 30 L80 30 M20 30 L20 70 M20 70 L80 70 M20 50 L60 50" {...symbolProps} fill="none" />;
      
      case UnitType.ARTILLERY:
        return <circle cx="50" cy="50" r="10" fill={mainColor} />; // Dot
      
      case UnitType.MORTAR:
         // PDF Page 19: Circle with arrow up
         return (
             <g>
                 <circle cx="50" cy="60" r="10" stroke={mainColor} strokeWidth="3" fill="none" />
                 <path d="M50 50 L50 20" {...symbolProps} markerEnd="url(#arrowhead)" />
                 <path d="M40 30 L50 20 L60 30" stroke={mainColor} strokeWidth="3" fill="none" />
             </g>
         );
      
      case UnitType.ANTI_TANK:
        return (
          <path d="M15 75 L50 25 L85 75" {...symbolProps} /> // Inverted V for Anti-Armor
        );

      case UnitType.AIR_DEFENSE:
        // PDF Page 21: Dome at bottom
        return <path d="M10 80 C 10 30, 90 30, 90 80" {...symbolProps} />;

      case UnitType.AVIATION: // Generic Aviation
      case UnitType.HELICOPTER:
        // Infinity Symbol / Bowtie
        return (
          <path 
            d="M10 50 C 10 20, 50 20, 50 50 C 50 80, 90 80, 90 50 C 90 20, 50 20, 50 50 C 50 80, 10 80, 10 50 Z" 
            {...symbolProps} 
          />
        );
      
      case UnitType.FIXED_WING:
         // Bowtie (sharp triangles)
         return (
            <path d="M10 20 L50 50 L10 80 Z M90 20 L50 50 L90 80 Z" {...symbolProps} />
         );

      case UnitType.UAV:
         // Drone silhouette
         return (
           <g>
             <path d="M20 50 L80 50 M50 30 L50 70" {...symbolProps} /> 
             <path d="M20 50 L10 40 M80 50 L90 40" {...symbolProps} />
           </g>
         );

      case UnitType.SIGNAL:
        // PDF Page 21: Lightning
        return <path d="M60 20 L30 50 L55 50 L25 80" {...symbolProps} />;
      
      case UnitType.SUPPLY:
        return <line x1="10" y1="50" x2="90" y2="50" {...symbolProps} />;

      case UnitType.MEDICAL:
        return <path d="M50 20 L50 80 M20 50 L80 50" {...symbolProps} />;

      case UnitType.HQ:
        // PDF Page 49: Flag staff
        return (
            <g>
                 <path d="M10 85 L10 15" stroke={mainColor} strokeWidth="5" />
                 <rect x="10" y="15" width="40" height="25" fill={mainColor} />
            </g>
        );

      case UnitType.SPECIAL_FORCES:
          return <path d="M10 70 L50 30 L90 70" {...symbolProps} />; 
          
      case UnitType.EOD:
           return <text x="50" y="60" textAnchor="middle" fontSize="30" fontWeight="bold" fill={mainColor}>EOD</text>;
      
      case UnitType.NAVAL:
           // Anchor
           return (
             <path d="M50 20 L50 80 M30 65 Q 50 95 70 65" {...symbolProps} />
           );

      default:
        return null;
    }
  };

  // 4. Modifiers (HQ Staff)
  const isHQ = role.includes('HQ') || type === UnitType.HQ;

  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className="overflow-visible filter drop-shadow-md">
      {renderFrame()}
      
      {/* Echelon Modifier (Size) */}
      {renderEchelon()}

      {/* Symbol */}
      {renderSymbol()}

      {/* HQ Staff (Standard line) */}
      {isHQ && type !== UnitType.HQ && (
           <path d="M5 85 L5 20" stroke={mainColor} strokeWidth="4" />
      )}

      {/* Text Label */}
      <text 
        x="50" 
        y="105" 
        textAnchor="middle" 
        fill="white" 
        fontSize="24" 
        fontWeight="bold"
        stroke="black" 
        strokeWidth="3" 
        paintOrder="stroke"
        style={{ textShadow: '1px 1px 1px black' }}
      >
        {label}
      </text>
    </svg>
  );
};