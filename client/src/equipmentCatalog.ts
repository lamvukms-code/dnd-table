import type { EquipmentPreset } from '@dnd-table/shared';

/**
 * The equipment catalog: SRD gear (`/srd/equipment.json`, in the repo) plus the DM's own setting gear
 * (`/campaign/equipment.json`, git-ignored — e.g. a campaign's firearms / trick weapons). The local
 * file is optional; its entries come first so the setting's gear is easy to find.
 */
let cache: Promise<EquipmentPreset[]> | null = null;

const get = (url: string) =>
  fetch(url, { cache: 'no-cache' })
    .then((r) => (r.ok && (r.headers.get('content-type') ?? '').includes('json') ? r.json() : []))
    .then((j) => (Array.isArray(j) ? (j as EquipmentPreset[]) : []))
    .catch(() => [] as EquipmentPreset[]);

export function loadEquipmentCatalog(): Promise<EquipmentPreset[]> {
  cache ??= Promise.all([get('/campaign/equipment.json'), get('/srd/equipment.json')]).then(([local, srd]) => {
    const ids = new Set(local.map((d) => d.id));
    return [...local, ...srd.filter((d) => !ids.has(d.id))];
  });
  return cache;
}
