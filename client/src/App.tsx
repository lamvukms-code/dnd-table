import { useEffect, useRef, useState } from 'react';
import { useStore } from './store.js';
import { getSfxVolume, playForRollLogEntry, setSfxVolume } from './sound.js';
import { JoinScreen } from './components/JoinScreen.js';
import { BattleMap } from './components/BattleMap.js';
import { DiceWindow } from './components/DiceWindow.js';
import { InitiativeBar } from './components/InitiativeBar.js';
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
import { TopMenu } from './components/TopMenu.js';

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
  const [dockOpen, setDockOpen] = useState(true);
  const isDm = me?.role === 'dm';
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

  return (
    <div className="app">
      <header className="topbar">
        <strong>{roomName}</strong>
        <span className={`conn ${status}`}>
          {me.name} · {me.role === 'dm' ? 'DM' : 'Người chơi'}
          {status !== 'open' ? ' · mất kết nối…' : ''}
        </span>
        {/* Level-up round in progress: its own highlighted button so the DM sees it and can close it. */}
        {isDm && levelUp && (
          <button
            className="levelup-dm on"
            title="Đang mở đợt thăng cấp — bấm để đóng đợt này"
            onClick={() => {
              if (window.confirm('Đóng đợt thăng cấp? Ai chưa bấm "Lên cấp" sẽ không bấm được nữa.')) levelUpClose();
            }}
          >
            ⬆ Đang thăng cấp {levelUp.claimed.length}/{sheetCount} · đóng
          </button>
        )}
        {isDm && (
          <TopMenu
            label="🛠 Công cụ DM"
            items={[
              { label: '🗺 Bản đồ & cảnh', title: 'Thư viện bản đồ theo chương', onClick: () => setMapsOpen(true) },
              { label: '👹 Quái (Bestiary)', onClick: () => setBestiaryOpen(true) },
              ...(NPC_CATALOG.length > 0
                ? [{ label: '🧑 NPC', title: 'NPC của campaign', onClick: () => setNpcOpen(true) }]
                : []),
              ...(!levelUp
                ? [
                    {
                      label: '⬆ Tăng cấp',
                      title: 'Mở thăng cấp: mọi người chơi nhận thông báo + nút "Lên cấp" trên sheet (tự roll HP)',
                      onClick: () => {
                        if (window.confirm('Mở thăng cấp cho TẤT CẢ người chơi? (mỗi người bấm 1 lần để lên 1 cấp)'))
                          levelUpOpen();
                      },
                    },
                  ]
                : []),
            ]}
          />
        )}
        <TopMenu
          label="📚 Tra cứu"
          items={[
            {
              label: refOpen ? '✓ Bảng tra cứu (SRD, web)' : 'Bảng tra cứu (SRD, web)',
              on: refOpen,
              title: 'Mở/đóng cột tra cứu bên phải',
              onClick: () => setRefOpen((v) => !v),
            },
            { label: '🧪 Luật nhà / Homebrew', title: 'Vật phẩm / luật nhà tự chế', onClick: () => setHomebrewOpen(true) },
            ...(HEIRLOOMS.length > 0
              ? [{ label: '🏺 Bảo vật', title: 'Bảo vật mở khóa theo cấp', onClick: () => setHeirloomOpen(true) }]
              : []),
            {
              label: '🎒 Trang bị SRD',
              title: 'Trang bị SRD — gửi thẳng vào túi đồ nhân vật',
              onClick: () => setEqSrdOpen(true),
            },
          ]}
        />
        <button
          className={dockOpen ? 'on' : ''}
          title={dockOpen ? 'Ẩn character sheet (cho bản đồ rộng hơn)' : 'Hiện character sheet'}
          onClick={() => setDockOpen((v) => !v)}
        >
          ◧ Sheet
        </button>
        <button
          className="sfx-toggle"
          title={sfxVolume <= 0 ? 'Bật âm thanh (chỉnh mức trong Cài đặt)' : 'Tắt âm thanh (chỉnh mức trong Cài đặt)'}
          onClick={() => {
            const next = sfxVolume > 0 ? 0 : 0.5;
            setSfxVolume(next);
            setSfxVolumeState(next);
          }}
        >
          {sfxVolume <= 0 ? '🔇' : '🔊'}
        </button>
        <button className="gear" title="Cài đặt" onClick={() => setSettingsOpen(true)}>
          ⚙
        </button>
      </header>

      {status !== 'open' && (
        <div className="conn-banner" role="alert">
          Mất kết nối với bàn, đang nối lại… Thao tác lúc này sẽ không được gửi.
        </div>
      )}
      {/* .stage is a row: [map + sheet] | reference column. Inside .stage-main the sheet sits to the
          right of the map on wide screens and under it on narrower ones (iPad portrait). The
          reference panel takes its own column so it never covers end-turn or the sheet tabs. */}
      <div className="stage">
        <div className="stage-main">
          <div className="map-area">
            <DmPromptBanner />
            <InitiativeBar />
            <BattleMap />
            <DiceWindow />
          </div>
          {dockOpen && <SheetDock />}
        </div>
        {refOpen && <ReferencePanel onClose={() => setRefOpen(false)} />}
      </div>

      {settingsOpen && (
        <SettingsModal
          onClose={() => {
            setSettingsOpen(false);
            setSfxVolumeState(getSfxVolume()); // the volume slider lives in Settings
          }}
        />
      )}
      {bestiaryOpen && isDm && <BestiaryPanel
          onClose={() => {
            setBestiaryOpen(false);
            openBestiary(null);
          }}
        />}
      {npcOpen && isDm && <NpcPanel onClose={() => setNpcOpen(false)} />}
      {mapsOpen && isDm && <MapLibrary onClose={() => setMapsOpen(false)} />}
      {homebrewOpen && <HomebrewPanel onClose={() => setHomebrewOpen(false)} />}
      {heirloomOpen && <HeirloomPanel onClose={() => setHeirloomOpen(false)} />}
      {eqSrdOpen && <EquipmentSrdPanel onClose={() => setEqSrdOpen(false)} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
