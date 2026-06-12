import { useState, useRef, useCallback } from 'react';
import { WeekBuilderPanel, type WeekBuilderPanelRef } from './WeekBuilderPanel';
import { LibraryPanel, type BenchId } from './LibraryPanel';
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable';

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
    <div className="flex flex-col h-full">
      <ResizablePanelGroup
        direction="horizontal"
        autoSaveId={`planner-workspace-${roleId}`}
        className="flex-1 min-h-0"
      >
        {/* Week builder — left */}
        <ResizablePanel defaultSize={55} minSize={35} className="min-w-0">
          <div className="h-full overflow-y-auto pr-2">
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
        </ResizablePanel>

        <ResizableHandle withHandle className="mx-1" />

        {/* Library panel — right */}
        <ResizablePanel defaultSize={45} minSize={25} className="min-w-0">
          <div className="h-full overflow-hidden pl-2">
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
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
