import { useEffect, useRef, useState } from 'react';
import { useStore } from './store.js';
import { getSfxVolume, playForRollLogEntry, setSfxVolume } from './sound.js';
import { JoinScreen } from './components/JoinScreen.js';
import { BattleMap } from './components/BattleMap.js';
import { DiceWindow } from './components/DiceWindow.js';
import { InitiativeBar } from './components/InitiativeBar.js';
import { MoonChip } from './components/MoonChip.js';
import { SheetDock } from './components/SheetDock.js';
import { SettingsModal } from './components/Settings.js';
import { BestiaryPanel } from './components/BestiaryPanel.js';
import { NpcPanel } from './components/NpcPanel.js';
import { ReferencePanel } from './components/ReferencePanel.js';
import { MapLibrary } from './components/MapLibrary.js';
import { HomebrewPanel } from './components/HomebrewPanel.js';
import { HeirloomPanel } from './components/HeirloomPanel.js';
import { HEIRLOOMS, NPC_CATALOG } from './campaignData.js';
import { EquipmentSrdPanel } from './components/EquipmentSrdPanel.js';
import { DmPromptBanner } from './components/DmPromptBanner.js';
import { TopMenu, type TopMenuItem } from './components/TopMenu.js';
import { PartyBar } from './components/PartyBar.js';
import { fmtDuration } from '@dnd-table/shared';
import { openCharacterBuilder, useCharacterBuilder } from './characterBuilder.js';
import { GodsBanePanel } from './components/GodsBanePanel.js';

export function App() {
  const identity = useStore((s) => s.identity);
  // Narrow selectors: App must not re-render (and drag every child along) on each state push.
  const hasRoom = useStore((s) => !!s.room);
  const roomName = useStore((s) => s.room?.name);
  const rollLog = useStore((s) => s.room?.rollLog);
  const levelUp = useStore((s) => s.room?.levelUp);
  const sheetCount = useStore((s) => s.room?.sheets.length ?? 0);
  const levelUpOpen = useStore((s) => s.levelUpOpen);
  const levelUpClose = useStore((s) => s.levelUpClose);
  const status = useStore((s) => s.status);
  const error = useStore((s) => s.error);
  const me = useStore((s) => s.me());
  const [toast, setToast] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [bestiaryOpen, setBestiaryOpen] = useState(false);
  const bestiaryFocus = useStore((s) => s.bestiaryFocus);
  const openBestiary = useStore((s) => s.openBestiary);
  const [npcOpen, setNpcOpen] = useState(false);
  const [refOpen, setRefOpen] = useState(false);
  const [mapsOpen, setMapsOpen] = useState(false);
  const [homebrewOpen, setHomebrewOpen] = useState(false);
  const [heirloomOpen, setHeirloomOpen] = useState(false);
  const [eqSrdOpen, setEqSrdOpen] = useState(false);
  const [godsBaneOpen, setGodsBaneOpen] = useState(false);
  const godsBaneOn = useStore((s) => !!s.room?.godsBane?.enabled);
  const [dockOpen, setDockOpen] = useState(true);
  const isDm = me?.role === 'dm';
  const send = useStore((s) => s.send);
  const worldSeconds = useStore((s) => s.room?.worldSeconds ?? 0);
  const hasBuilder = useCharacterBuilder();
  const [sfxVolume, setSfxVolumeState] = useState(getSfxVolume);

  // Auto sound effects: play a swing/impact sound for each NEW attack/damage roll-log entry that
  // arrives via synced room state (so everyone at the table hears it, not just the roller). The
  // ref starts at the current tail on mount/reconnect so existing history never replays.
  const lastSfxIdRef = useRef<string | null>(null);
  const sfxInitedRef = useRef(false);
  useEffect(() => {
    if (!rollLog) return;
    if (!sfxInitedRef.current) {
      sfxInitedRef.current = true;
      lastSfxIdRef.current = rollLog.length ? rollLog[rollLog.length - 1].id : null;
      return;
    }
    // If the last-seen id fell off the log (200-entry cap), don't guess — just resync silently
    // rather than replaying the whole visible log at once.
    const lastIdx = lastSfxIdRef.current ? rollLog.findIndex((e) => e.id === lastSfxIdRef.current) : -1;
    const fresh = lastIdx >= 0 ? rollLog.slice(lastIdx + 1) : [];
    for (const entry of fresh) playForRollLogEntry(entry);
    if (rollLog.length) lastSfxIdRef.current = rollLog[rollLog.length - 1].id;
  }, [rollLog]);

  useEffect(() => {
    if (bestiaryFocus) setBestiaryOpen(true);
  }, [bestiaryFocus]);

  useEffect(() => {
    if (!error) return;
    setToast(error);
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [error]);

  // Everyone but the DM is told when a level-up round opens (once per round, also on reconnect).
  const levelUpId = levelUp?.id;
  const announcedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!levelUpId || announcedRef.current === levelUpId) return;
    announcedRef.current = levelUpId;
    if (isDm) return;
    setToast('⬆ DM đã mở thăng cấp! Bấm nút "LÊN CẤP" trên character sheet của bạn.');
    const t = setTimeout(() => setToast(null), 8000);
    return () => clearTimeout(t);
  }, [levelUpId, isDm]);

  if (!identity || !hasRoom || !me) {
    return <JoinScreen connecting={status === 'connecting'} />;
  }

  const sfxOn = sfxVolume > 0;
  const toggleSfx = () => {
    const next = sfxOn ? 0 : 0.5;
    setSfxVolume(next);
    setSfxVolumeState(next);
  };

  const dmItems: TopMenuItem[] = [
    { label: '🗺 Bản đồ & cảnh', title: 'Thư viện bản đồ theo chương', onClick: () => setMapsOpen(true) },
    { label: '👹 Quái (Bestiary)', onClick: () => setBestiaryOpen(true) },
    {
      label: '🌀 Madness cả nhóm',
      title: 'Bắt save madness cho mọi nhân vật người chơi đang có token trong cảnh',
      onClick: () => {
        const st = useStore.getState().room;
        const ids = (st?.tokens ?? []).filter((t) => st?.sheets.some((s) => s.tokenId === t.id)).map((t) => t.id);
        if (!ids.length) return;
        const dc = Number(window.prompt(`Madness cho ${ids.length} nhân vật: DC save WIS?`, '13'));
        if (!dc) return;
        const t = window.prompt('Cấp madness: 1 = ngắn hạn, 2 = dài hạn, 3 = vĩnh viễn', '1');
        send({ t: 'madnessSave', targetTokenIds: ids, dc, tier: t === '3' ? 'indefinite' : t === '2' ? 'long' : 'short', label: 'Madness' });
      },
    },
    ...([
      ['10 phút', 600],
      ['1 giờ', 3600],
      ['8 giờ (nghỉ dài)', 8 * 3600],
      ['1 ngày', 86400],
      ['1 tuần', 7 * 86400],
    ] as const).map(([lbl, sec]) => ({
      label: `⏳ Qua ${lbl}`,
      title: `Cho thời gian trong game trôi ${lbl} (madness hết hạn theo đồng hồ này). Đang ở: ${fmtDuration(worldSeconds) || '0'} từ đầu campaign`,
      onClick: () => send({ t: 'passTime', seconds: sec }),
    })),
    { label: "🗡 God's Bane", title: "Bảo vật nhóm (homebrew): bật/tắt, thức tỉnh, token kiếm, N, Cleaving Causality, người tuyên thệ", onClick: () => setGodsBaneOpen(true) },
    ...(NPC_CATALOG.length > 0 ? [{ label: '🧑 NPC', title: 'NPC của campaign', onClick: () => setNpcOpen(true) }] : []),
    ...(!levelUp
      ? [
          {
            label: '⬆ Tăng cấp',
            title: 'Mở thăng cấp: mọi người chơi nhận thông báo + nút "Lên cấp" trên sheet (tự roll HP)',
            onClick: () => {
              if (window.confirm('Mở thăng cấp cho TẤT CẢ người chơi? (mỗi người bấm 1 lần để lên 1 cấp)')) levelUpOpen();
            },
          },
        ]
      : []),
  ];

  // Owlbear-style shell: the map fills the window and everything else floats over it — action
  // icons top-left (menu, dice, sheet, lookup, DM tools), initiative top-centre, the party
  // top-right, map tools down the left edge (inside BattleMap), zoom bottom-right, and the
  // character sheet as a floating panel on the right (bottom on narrow screens).
  return (
    <div className="app">
      <div className="stage">
        <div className="map-area">
          <BattleMap />
          <div className="hud-top">
            <div className="hud-pill hud-actions">
              <TopMenu
                label={<span className="hud-seal" aria-hidden />}
                title="Menu"
                caret={false}
                header={
                  <>
                    <strong>{roomName}</strong>
                    <span>
                      {me.name} · {me.role === 'dm' ? 'DM' : 'Người chơi'}
                    </span>
                  </>
                }
                items={[
                  { label: '⚙ Cài đặt', onClick: () => setSettingsOpen(true) },
                  { label: sfxOn ? '🔇 Tắt âm thanh' : '🔊 Bật âm thanh', title: 'Mức âm lượng chỉnh trong Cài đặt', onClick: toggleSfx },
                  ...(hasBuilder
                    ? [{ label: '🧙 Tạo nhân vật (trang riêng)', title: 'Mở trang tạo nhân vật ở tab mới', onClick: openCharacterBuilder }]
                    : []),
                ]}
              />
              <DiceWindow />
              <button
                className={dockOpen ? 'on' : ''}
                title={dockOpen ? 'Ẩn character sheet' : 'Hiện character sheet'}
                onClick={() => setDockOpen((v) => !v)}
              >
                📜<span className="hud-label"> Sheet</span>
              </button>
              <TopMenu
                label={
                  <>
                    📚<span className="hud-label"> Tra cứu</span>
                  </>
                }
                title="Tra cứu"
                items={[
                  {
                    label: refOpen ? '✓ Bảng tra cứu (SRD, web)' : 'Bảng tra cứu (SRD, web)',
                    on: refOpen,
                    title: 'Mở/đóng panel tra cứu',
                    onClick: () => setRefOpen((v) => !v),
                  },
                  { label: '🧪 Luật nhà / Homebrew', title: 'Vật phẩm / luật nhà tự chế', onClick: () => setHomebrewOpen(true) },
                  ...(HEIRLOOMS.length > 0 ? [{ label: '🏺 Bảo vật', title: 'Bảo vật mở khóa theo cấp', onClick: () => setHeirloomOpen(true) }] : []),
                  ...(godsBaneOn && !isDm
                    ? [{ label: "🗡 God's Bane", title: 'Lời thề, hào quang của kiếm, Cleaving Causality', onClick: () => setGodsBaneOpen(true) }]
                    : []),
                  { label: '🎒 Trang bị SRD', title: 'Trang bị SRD — gửi thẳng vào túi đồ nhân vật', onClick: () => setEqSrdOpen(true) },
                ]}
              />
              {isDm && (
                <>
                  <button title="Quái (Bestiary)" onClick={() => setBestiaryOpen(true)}>
                    👹
                  </button>
                  <button title="Bản đồ & cảnh (thư viện theo chương)" onClick={() => setMapsOpen(true)}>
                    🗺
                  </button>
                  <TopMenu
                    label={
                      <>
                        🛠<span className="hud-label"> DM</span>
                      </>
                    }
                    title="Công cụ DM"
                    items={dmItems}
                  />
                </>
              )}
              {/* Level-up round in progress: its own highlighted button so the DM sees it and can close it. */}
              {isDm && levelUp && (
                <button
                  className="levelup-dm on"
                  title="Đang mở đợt thăng cấp — bấm để đóng đợt này"
                  onClick={() => {
                    if (window.confirm('Đóng đợt thăng cấp? Ai chưa bấm "Lên cấp" sẽ không bấm được nữa.')) levelUpClose();
                  }}
                >
                  ⬆ {levelUp.claimed.length}/{sheetCount} · đóng
                </button>
              )}
            </div>
            <MoonChip />
            <InitiativeBar />
            <PartyBar />
          </div>
          {status !== 'open' && (
            <div className="conn-banner" role="alert">
              Mất kết nối với bàn, đang nối lại… Thao tác lúc này sẽ không được gửi.
            </div>
          )}
          <DmPromptBanner />
          {refOpen && <ReferencePanel onClose={() => setRefOpen(false)} />}
          {dockOpen && <SheetDock />}
        </div>
      </div>

      {settingsOpen && (
        <SettingsModal
          onClose={() => {
            setSettingsOpen(false);
            setSfxVolumeState(getSfxVolume()); // the volume slider lives in Settings
          }}
        />
      )}
      {bestiaryOpen && isDm && (
        <BestiaryPanel
          onClose={() => {
            setBestiaryOpen(false);
            openBestiary(null);
          }}
        />
      )}
      {npcOpen && isDm && <NpcPanel onClose={() => setNpcOpen(false)} />}
      {mapsOpen && isDm && <MapLibrary onClose={() => setMapsOpen(false)} />}
      {homebrewOpen && <HomebrewPanel onClose={() => setHomebrewOpen(false)} />}
      {heirloomOpen && <HeirloomPanel onClose={() => setHeirloomOpen(false)} />}
      {eqSrdOpen && <EquipmentSrdPanel onClose={() => setEqSrdOpen(false)} />}
      {godsBaneOpen && <GodsBanePanel onClose={() => setGodsBaneOpen(false)} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
