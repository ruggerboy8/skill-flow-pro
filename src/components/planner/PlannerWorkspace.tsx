import { useState, useRef } from 'react';
import { WeekBuilderPanel, type WeekBuilderPanelRef } from './WeekBuilderPanel';
import { LibraryPanel } from './LibraryPanel';
import { HistoryStrip } from './HistoryStrip';

interface PlannerWorkspaceProps {
  roleId: number;
  roleName: string;
  orgId?: string;
  practiceType?: string;
}

export function PlannerWorkspace({ roleId, roleName, orgId, practiceType }: PlannerWorkspaceProps) {
  const weekBuilderRef = useRef<WeekBuilderPanelRef>(null);
  const [selectedSlot, setSelectedSlot] = useState<{ weekStart: string; displayOrder: number } | null>(null);
  const [benchIds, setBenchIds] = useState<number[]>([]);

  const handleSlotActivate = (weekStart: string, displayOrder: number) => {
    setSelectedSlot(prev =>
      prev?.weekStart === weekStart && prev?.displayOrder === displayOrder ? null : { weekStart, displayOrder }
    );
  };

  const handleSelectMove = async (actionId: number | null, orgMoveId?: string | null) => {
    if (!selectedSlot) return;
    await weekBuilderRef.current?.selectMove(actionId, selectedSlot.weekStart, selectedSlot.displayOrder, orgMoveId);
    setSelectedSlot(null);
  };

  const handleBenchToggle = (actionId: number) => {
    setBenchIds(prev =>
      prev.includes(actionId) ? prev.filter(id => id !== actionId) : [...prev, actionId]
    );
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* History strip */}
      <HistoryStrip roleId={roleId} orgId={orgId} />

      {/* Main two-column layout */}
      <div className="flex gap-4 flex-1 min-h-0">
        {/* Week builder — left, ~55% */}
        <div className="flex-[55] min-w-0 overflow-y-auto">
          <WeekBuilderPanel
            ref={weekBuilderRef}
            roleId={roleId}
            roleName={roleName}
            orgId={orgId}
            practiceType={practiceType}
            onSlotActivate={handleSlotActivate}
            activeSlot={selectedSlot}
          />
        </div>

        {/* Library panel — right, ~45% */}
        <div className="flex-[45] min-w-[360px] max-w-[480px] flex-none h-full overflow-hidden">
          <LibraryPanel
            roleId={roleId}
            roleName={roleName}
            orgId={orgId}
            practiceType={practiceType}
            selectedSlot={selectedSlot}
            onSelect={handleSelectMove}
            benchIds={benchIds}
            onBenchToggle={handleBenchToggle}
          />
        </div>
      </div>
    </div>
  );
}
