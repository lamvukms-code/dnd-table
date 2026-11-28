import type { ReactNode } from 'react';

/**
 * Tabletop-flavoured line icons for the HUD and the map tool column (drawn here, no icon font):
 * a d20 for dice, a scroll for the sheet, a tome for lookups, a lyre for the soundboard, a horned
 * skull for monsters, a treasure chest for the token library… They take the text colour
 * (`currentColor`) and the font size, so they sit where the emoji used to.
 */
function Svg({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <svg
      className="ico"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title && <title>{title}</title>}
      {children}
    </svg>
  );
}

/** Icosahedron seen face-on, with the 20 on its top face. */
export const IconD20 = () => (
  <Svg>
    <path d="M12 2 L20.7 7 V17 L12 22 L3.3 17 V7 Z" />
    <path d="M12 6.6 L17.3 15.6 H6.7 Z" />
    <path d="M12 2 V6.6 M3.3 7 L12 6.6 L20.7 7 M3.3 7 L6.7 15.6 L3.3 17 M20.7 7 L17.3 15.6 L20.7 17 M6.7 15.6 L12 22 L17.3 15.6" strokeWidth={1.1} />
    <text x="12" y="13.9" textAnchor="middle" fontSize="5.2" fontWeight="700" fill="currentColor" stroke="none" fontFamily="Georgia, serif">
      20
    </text>
  </Svg>
);

/** Character sheet: a parchment scroll with rolled ends. */
export const IconScroll = () => (
  <Svg>
    <path d="M7 4 H18 a2 2 0 0 1 0 4 H17 V18 a2 2 0 0 1 -2 2 H6 a2 2 0 0 1 0 -4 H7 Z" />
    <path d="M7 4 a2 2 0 0 0 -2 2 V16" />
    <path d="M17 8 V6 M10 9 H14 M10 12 H14 M10 15 H13" strokeWidth={1.2} />
  </Svg>
);

/** Lookups: a clasped tome with a rune on its cover. */
export const IconTome = () => (
  <Svg>
    <path d="M5 4.5 A1.5 1.5 0 0 1 6.5 3 H19 V18 H6.5 A1.5 1.5 0 0 0 5 19.5 Z" />
    <path d="M5 19.5 A1.5 1.5 0 0 0 6.5 21 H19 V18" />
    <path d="M12 6.5 L14.5 10.5 L12 14.5 L9.5 10.5 Z M12 6.5 V14.5" strokeWidth={1.2} />
    <path d="M19 9 H20.5 V12 H19" strokeWidth={1.2} />
  </Svg>
);

/** Soundboard: a bard's lyre. */
export const IconLyre = () => (
  <Svg>
    <path d="M7 4 C4 6 4 11 7 13 C7.5 16 9 18 12 18 C15 18 16.5 16 17 13 C20 11 20 6 17 4" />
    <path d="M7 6.5 H17" />
    <path d="M10 6.5 V16.5 M12 6.5 V17 M14 6.5 V16.5" strokeWidth={1.1} />
    <path d="M9 21 H15 M12 18 V21" />
  </Svg>
);

/** Monsters: a horned skull. */
export const IconSkull = () => (
  <Svg>
    <path d="M6 9.5 C6 5.5 8.7 3.5 12 3.5 C15.3 3.5 18 5.5 18 9.5 C18 12 17 13.2 16 14 V17 H8 V14 C7 13.2 6 12 6 9.5 Z" />
    <path d="M6.6 7 C4.5 6 3.5 4 4 2.5 M17.4 7 C19.5 6 20.5 4 20 2.5" />
    <circle cx="9.5" cy="10" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="14.5" cy="10" r="1.5" fill="currentColor" stroke="none" />
    <path d="M12 12 L11.2 13.6 H12.8 Z M10 17 V20 M12 17 V20.5 M14 17 V20" strokeWidth={1.2} />
  </Svg>
);

/** Maps: a folded map with a dotted path to an X. */
export const IconMap = () => (
  <Svg>
    <path d="M3 6 L8.5 4 L15.5 6 L21 4 V18 L15.5 20 L8.5 18 L3 20 Z" />
    <path d="M8.5 4 V18 M15.5 6 V20" strokeWidth={1.1} />
    <path d="M5.5 15 C7 13 9.5 14 11 12 S13.5 9 15 10" strokeWidth={1.1} strokeDasharray="1.4 1.6" />
    <path d="M16.5 8.5 L18.5 10.5 M18.5 8.5 L16.5 10.5" strokeWidth={1.5} />
  </Svg>
);

/** DM tools: the three-panel DM screen. */
export const IconDmScreen = () => (
  <Svg>
    <path d="M2.5 7 L8 5 V18 L2.5 20 Z M8 5 H16 V18 H8 M16 5 L21.5 7 V20 L16 18" />
    <path d="M10.5 9 H13.5 M10.5 12 H13.5" strokeWidth={1.2} />
    <circle cx="12" cy="15" r="1" fill="currentColor" stroke="none" />
  </Svg>
);

/** Token library: a treasure chest. */
export const IconChest = () => (
  <Svg>
    <path d="M4 11 V19 H20 V11 Z" />
    <path d="M4 11 V9 C4 6 6.5 5 12 5 C17.5 5 20 6 20 9 V11" />
    <path d="M8 5.6 V19 M16 5.6 V19" strokeWidth={1.1} />
    <path d="M10.5 10 H13.5 V13.5 H10.5 Z" />
  </Svg>
);

/** Characters: a knight's helm with a T visor. */
export const IconHelm = () => (
  <Svg>
    <path d="M5 13 C5 7 8 3.5 12 3.5 C16 3.5 19 7 19 13 V19 C17 20.5 14.5 21 12 21 C9.5 21 7 20.5 5 19 Z" />
    <path d="M7.5 10.5 H16.5 M12 10.5 V17" strokeWidth={2} />
    <path d="M12 3.5 C12.5 2.5 14 1.8 15.5 2" strokeWidth={1.2} />
  </Svg>
);

/** NPCs: a hooded figure. */
export const IconHood = () => (
  <Svg>
    <path d="M12 3 C7.5 3 5.5 7 5.5 11 C5.5 15 4 18 3 21 H21 C20 18 18.5 15 18.5 11 C18.5 7 16.5 3 12 3 Z" />
    <path d="M8.5 12 C8.5 9 10 7.5 12 7.5 C14 7.5 15.5 9 15.5 12 C15.5 14 14 15.5 12 15.5 C10 15.5 8.5 14 8.5 12 Z" />
    <path d="M10.5 11.5 H11 M13 11.5 H13.5" strokeWidth={1.8} />
  </Svg>
);

/** Add a token: a game pawn with a plus. */
export const IconPawnPlus = () => (
  <Svg>
    <circle cx="10" cy="6" r="2.6" />
    <path d="M7.8 8.2 L8.6 13 H11.4 L12.2 8.2 M8.6 13 C7 14 6 16 6 18 H14 C14 16 13 14 11.4 13 M5 20.5 H15" />
    <path d="M18.5 3.5 V9.5 M15.5 6.5 H21.5" strokeWidth={1.8} />
  </Svg>
);

/** Token from a picture: a framed portrait. */
export const IconPortrait = () => (
  <Svg>
    <rect x="4" y="3" width="16" height="18" rx="2" />
    <rect x="6.5" y="5.5" width="11" height="13" rx="5.5" strokeWidth={1.1} />
    <circle cx="12" cy="10.2" r="2" />
    <path d="M8.5 16.5 C9.2 14.3 10.5 13.3 12 13.3 C13.5 13.3 14.8 14.3 15.5 16.5" />
  </Svg>
);

/** Fog & sight: a lantern. */
export const IconLantern = () => (
  <Svg>
    <path d="M9 3 H15 M12 3 V5 M8 6 H16 L15 8 H9 Z" />
    <path d="M9 8 V17 H15 V8" />
    <path d="M8 17 H16 L15 20 H9 Z" />
    <path d="M12 10.5 C13.2 12 13.2 13.5 12 14.8 C10.8 13.5 10.8 12 12 10.5 Z" fill="currentColor" strokeWidth={0.8} />
  </Svg>
);

/** Duplicate a token: two pawns. */
export const IconPawns = () => (
  <Svg>
    <circle cx="8" cy="7" r="2.3" />
    <path d="M6.2 9 L6.8 13 C5.4 14 4.5 15.6 4.5 17.5 H11.5 C11.5 15.6 10.6 14 9.2 13 L9.8 9" />
    <circle cx="16" cy="9" r="2.3" />
    <path d="M14.2 11 L14.8 15 C13.4 16 12.5 17.3 12.5 19.5 H19.5 C19.5 17.3 18.6 16 17.2 15 L17.8 11" />
  </Svg>
);

/** Group initiative: crossed swords. */
export const IconSwords = () => (
  <Svg>
    <path d="M4 4 L14 14 M4 4 H7 L15.5 12.5 M4 4 V7 L12.5 15.5" strokeWidth={1.3} />
    <path d="M20 4 L10 14 M20 4 H17 L8.5 12.5 M20 4 V7 L11.5 15.5" strokeWidth={1.3} />
    <path d="M12.5 15.5 L15.5 12.5 M17 16 L20 19 M18 14 L16 18 M8.5 12.5 L11.5 15.5 M7 16 L4 19 M6 14 L8 18" strokeWidth={1.3} />
  </Svg>
);

/** Draw zones: a dungeon room plan with a door gap. */
export const IconRoomPlan = () => (
  <Svg>
    <path d="M4 4 H11 M14 4 H20 V20 H4 V4" />
    <path d="M4 12 H9 M13 12 H20 M12 12 V20" strokeWidth={1.1} />
    <path d="M11 4 A3 3 0 0 0 14 4" strokeWidth={1.1} />
  </Svg>
);

/** Map & scene settings: a cogwheel. */
export const IconCog = () => (
  <Svg>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2.8 V5.2 M12 18.8 V21.2 M2.8 12 H5.2 M18.8 12 H21.2 M5.5 5.5 L7.2 7.2 M16.8 16.8 L18.5 18.5 M5.5 18.5 L7.2 16.8 M16.8 7.2 L18.5 5.5" strokeWidth={2.2} />
    <circle cx="12" cy="12" r="6.6" />
  </Svg>
);
