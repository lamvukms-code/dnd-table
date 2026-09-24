import type { BackgroundDef } from '@dnd-table/shared';
import crookedMoonBackgrounds from './data/crookedMoonBackgrounds.json';

/**
 * Background definitions. Unlike species/subclasses (arbitrary published-setting content the
 * repo can't ship), Crooked Moon's 13 backgrounds are this campaign's own bundled reference data
 * — paraphrased from the book, same convention as `crookedMoonNpcs.json`/`crookedMoonZones.json`.
 */
export const BACKGROUND_DEFS: BackgroundDef[] = crookedMoonBackgrounds as BackgroundDef[];
