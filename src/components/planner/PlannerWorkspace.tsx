import { useState, useRef, useCallback } from 'react';
import { WeekBuilderPanel, type WeekBuilderPanelRef } from './WeekBuilderPanel';
import { LibraryPanel, type BenchId } from './LibraryPanel';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';

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

  const handleActiveWeeksChange = useCallback((visibleWeeks: string[]) => {
    setSelectedSlot(prev => (prev && !visibleWeeks.includes(prev.weekStart) ? null : prev));
  }, []);

  const weekBuilder = (
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
  );

  const library = (
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
  );

  return (
    <>
      {/* Mobile / tablet: stacked, no resizer */}
      <div className="flex flex-col gap-4 flex-1 min-h-0 lg:hidden">
        <div className="min-w-0 overflow-y-auto">{weekBuilder}</div>
        <div className="w-full h-[60vh] overflow-hidden">{library}</div>
      </div>

      {/* Desktop: resizable split */}
      <div className="hidden lg:block flex-1 min-h-0">
        <ResizablePanelGroup
          direction="horizontal"
          autoSaveId="planner-workspace-split"
          className="h-full w-full"
        >
          <ResizablePanel defaultSize={58} minSize={35} className="min-w-0">
            <div className="h-full overflow-y-auto pr-2">{weekBuilder}</div>
          </ResizablePanel>
          <ResizableHandle
            withHandle
            className="mx-1 bg-border hover:bg-primary/40 transition-colors w-1.5"
          />
          <ResizablePanel defaultSize={42} minSize={25} maxSize={60} className="min-w-0">
            <div className="h-full overflow-hidden pl-2">{library}</div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </>
  );
}

