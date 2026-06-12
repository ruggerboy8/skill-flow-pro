import { useState, useRef, useCallback } from 'react';
import { WeekBuilderPanel, type WeekBuilderPanelRef } from './WeekBuilderPanel';
import { LibraryPanel, type BenchId } from './LibraryPanel';

interface PlannerWorkspaceProps {
  roleId: number;
  roleName: string;
  orgId?: string;
  practiceType?: string;
}

export function PlannerWorkspace({ roleId, roleName, orgId, practiceType }: PlannerWorkspaceProps) {
  const weekBuilderRef = useRef<WeekBuilderPanelRef>(null);
  const [selectedSlot, setSelectedSlot] = useState<{ weekStart: string; displayOrder: number } | null>(null);
  const [benchIds, setBenchIds] = useState<BenchId[]>([]);

  const handleSlotActivate = (weekStart: string, displayOrder: number) => {
    setSelectedSlot(prev =>
      prev?.weekStart === weekStart && prev?.displayOrder === displayOrder ? null : { weekStart, displayOrder }
    );
  };

  const handleSelectMove = async (actionId: number | null, orgMoveId?: string | null) => {
    if (!selectedSlot) return;
    const slot = selectedSlot;
    console.info('[Planner.save] handleSelectMove', {
      weekStart: slot.weekStart,
      displayOrder: slot.displayOrder,
      actionId,
      orgMoveId,
      orgId,
    });
    await weekBuilderRef.current?.selectMove(actionId, slot.weekStart, slot.displayOrder, orgMoveId);
    setSelectedSlot(null);
  };

  const handleBenchToggle = (benchId: BenchId) => {
    setBenchIds(prev =>
      prev.includes(benchId) ? prev.filter(id => id !== benchId) : [...prev, benchId]
    );
  };

  // Clear stale selection when the active week scrolls out of the visible range.
  const handleActiveWeeksChange = useCallback((visibleWeeks: string[]) => {
    setSelectedSlot(prev => (prev && !visibleWeeks.includes(prev.weekStart) ? null : prev));
  }, []);

  return (
    <div className="flex flex-col lg:flex-row gap-4 flex-1 min-h-0">
      <div className="flex-[55] min-w-0 overflow-y-auto lg:block">
        <WeekBuilderPanel
          ref={weekBuilderRef}
          roleId={roleId}
          roleName={roleName}
          orgId={orgId}
          practiceType={practiceType}
          onSlotActivate={handleSlotActivate}
          activeSlot={selectedSlot}
          onActiveWeeksChange={handleActiveWeeksChange}
        />
      </div>

      <div className="flex-none w-full lg:w-[420px] lg:max-w-[480px] h-full overflow-hidden">
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
  );
}
