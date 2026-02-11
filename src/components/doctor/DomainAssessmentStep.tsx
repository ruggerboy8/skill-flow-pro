import { useState, useRef, useCallback, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ChevronLeft, ChevronRight, Check, Loader2, MessageSquare } from 'lucide-react';
import { DoctorMaterialsSheet } from './DoctorMaterialsSheet';

interface ProMoveItem {
  action_id: number;
  action_statement: string;
  competency_name: string;
}

interface DomainGroup {
  domain_id: number;
  domain_name: string;
  color_hex: string;
  proMoves: ProMoveItem[];
}

interface DomainAssessmentStepProps {
  domain: DomainGroup;
  ratings: Record<number, { score: number | null; note: string }>;
  onRatingChange: (actionId: number, score: number | null, note?: string) => void;
  onNoteChange?: (actionId: number, noteText: string) => void;
  onPrevious?: () => void;
  onNext?: () => void;
  onComplete?: () => void;
  isCompleting?: boolean;
  forceOpenProMoveId?: number | null;
}

const SCORE_LABELS = [
  { value: 1, label: 'I rarely do this or didn\'t know I should', short: '1' },
  { value: 2, label: 'Some room for improvement', short: '2' },
  { value: 3, label: 'I do this 95% of the time', short: '3' },
  { value: 4, label: 'I am a master, I do it all the time', short: '4' },
];

const SCORE_COLORS: Record<number, { selected: string; dot: string }> = {
  1: { selected: 'bg-amber-100 border-amber-400 text-amber-800', dot: 'bg-amber-400' },
  2: { selected: 'bg-orange-100 border-orange-400 text-orange-800', dot: 'bg-orange-400' },
  3: { selected: 'bg-blue-100 border-blue-400 text-blue-800', dot: 'bg-blue-400' },
  4: { selected: 'bg-emerald-100 border-emerald-400 text-emerald-800', dot: 'bg-emerald-400' },
};

export function DomainAssessmentStep({
  domain,
  ratings,
  onRatingChange,
  onNoteChange,
  onPrevious,
  onNext,
  onComplete,
  isCompleting,
  forceOpenProMoveId,
}: DomainAssessmentStepProps) {
  const [selectedProMoveId, setSelectedProMoveId] = useState<number | null>(null);
  const [expandedNoteId, setExpandedNoteId] = useState<number | null>(null);
  const debounceTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const noteRefs = useRef<Record<number, HTMLTextAreaElement | null>>({});

  // Allow external force-open of materials sheet (e.g. from tutorial)
  useEffect(() => {
    if (forceOpenProMoveId != null) {
      setSelectedProMoveId(forceOpenProMoveId);
      // Dispatch event so tutorial knows materials opened
      setTimeout(() => {
        window.dispatchEvent(new Event('tutorial-materials-opened'));
      }, 300);
    }
  }, [forceOpenProMoveId]);

  const handleNoteChange = useCallback((actionId: number, noteText: string) => {
    if (debounceTimers.current[actionId]) {
      clearTimeout(debounceTimers.current[actionId]);
    }
    debounceTimers.current[actionId] = setTimeout(() => {
      onNoteChange?.(actionId, noteText);
    }, 600);
  }, [onNoteChange]);

  const handleToggleNote = (actionId: number) => {
    const isExpanded = expandedNoteId === actionId;
    setExpandedNoteId(isExpanded ? null : actionId);
    if (!isExpanded) {
      requestAnimationFrame(() => {
        noteRefs.current[actionId]?.focus();
      });
    }
  };

  const domainRatedCount = domain.proMoves.filter(
    pm => ratings[pm.action_id]?.score !== null && ratings[pm.action_id]?.score !== undefined
  ).length;
  const allDomainRated = domainRatedCount === domain.proMoves.length;

  const selectedProMove = domain.proMoves.find(pm => pm.action_id === selectedProMoveId);

  return (
    <>
      <Card>
        <CardHeader style={{ backgroundColor: `${domain.color_hex}15` }}>
          <div className="flex items-center gap-3">
            <div 
              className="w-5 h-5 rounded-full" 
              style={{ backgroundColor: domain.color_hex }}
            />
            <CardTitle className="font-bold text-lg">{domain.domain_name}</CardTitle>
            <span className="text-sm text-muted-foreground ml-auto">
              {domainRatedCount}/{domain.proMoves.length} rated
            </span>
          </div>
        </CardHeader>
        <CardContent>
          {/* Legend */}
          <div className="mb-4 p-3 bg-muted/50 rounded-lg border">
            <p className="text-xs italic text-muted-foreground mb-2">
              Rate yourself on each one. Be honest — that's what makes this useful.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-1 gap-x-4 text-xs">
              {SCORE_LABELS.map(s => (
                <span key={s.value} className="flex items-center gap-1.5">
                  <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${SCORE_COLORS[s.value].dot}`} />
                  <strong>{s.short}</strong> — {s.label}
                </span>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            {/* Header row */}
            <div className="grid grid-cols-[auto,1fr,auto] gap-2 px-3 py-2 text-sm font-medium text-muted-foreground border-b">
              <div className="w-7" />
              <div>Pro Move</div>
              <div className="flex gap-2">
                {SCORE_LABELS.map(s => (
                  <div key={s.value} className="w-10 text-center text-xs">
                    {s.short}
                  </div>
                ))}
              </div>
            </div>

            {/* Pro Move rows grouped by competency */}
            {(() => {
              const competencyGroups: Record<string, ProMoveItem[]> = {};
              domain.proMoves.forEach(pm => {
                const key = pm.competency_name;
                if (!competencyGroups[key]) competencyGroups[key] = [];
                competencyGroups[key].push(pm);
              });
              const groupEntries = Object.entries(competencyGroups);

              return groupEntries.map(([compName, moves], gi) => (
                <div key={compName}>
                  {groupEntries.length > 1 && (
                    <div className={`px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide ${gi > 0 ? 'mt-3 border-t pt-2.5' : ''}`}>
                      {compName}
                    </div>
                  )}
                  {moves.map((pm) => {
                    const currentRating = ratings[pm.action_id]?.score;
                    const currentNote = ratings[pm.action_id]?.note || '';
                    const hasNote = currentNote.trim().length > 0;
                    const isNoteExpanded = expandedNoteId === pm.action_id;
                    
                    return (
                      <div key={pm.action_id} className="rounded-lg hover:bg-muted/80 transition-colors group">
                        <div className="grid grid-cols-[auto,1fr,auto] gap-2 px-3 py-3">
                          {/* Note button (left) */}
                          <button
                            id={`note-btn-${pm.action_id}`}
                            type="button"
                            onClick={() => handleToggleNote(pm.action_id)}
                            className={`w-7 h-7 rounded-full border flex items-center justify-center flex-shrink-0 transition-colors ${
                              hasNote 
                                ? 'bg-primary/10 border-primary text-primary' 
                                : 'border-muted-foreground/30 text-muted-foreground/40 hover:text-muted-foreground hover:border-muted-foreground/50'
                            }`}
                            title={hasNote ? 'Edit note' : 'Add note'}
                          >
                            <MessageSquare className="h-3.5 w-3.5" />
                          </button>

                          {/* Pro move text */}
                          <button
                            type="button"
                            onClick={() => setSelectedProMoveId(pm.action_id)}
                            className="cursor-pointer flex items-center gap-2 text-left min-w-0 hover:underline"
                            id={`pm-text-${pm.action_id}`}
                          >
                            <span className="text-sm">{pm.action_statement}</span>
                          </button>
                          
                          {/* Score buttons */}
                          <RadioGroup
                            value={currentRating?.toString() || ''}
                            onValueChange={(val) => onRatingChange(pm.action_id, parseInt(val))}
                            className="flex gap-2"
                            id={`score-btns-${pm.action_id}`}
                          >
                            {SCORE_LABELS.map((s) => (
                              <div key={s.value} className="w-10 flex justify-center">
                                <Label
                                  htmlFor={`${pm.action_id}-${s.value}`}
                                  className={`
                                    w-8 h-8 rounded-full border-2 flex items-center justify-center cursor-pointer
                                    transition-all
                                    ${currentRating === s.value 
                                      ? SCORE_COLORS[s.value].selected
                                      : 'border-muted-foreground/30 hover:border-primary/50'
                                    }
                                  `}
                                >
                                  <RadioGroupItem
                                    value={s.value.toString()}
                                    id={`${pm.action_id}-${s.value}`}
                                    className="sr-only"
                                  />
                                  <span className="text-xs font-medium">{s.value}</span>
                                </Label>
                              </div>
                            ))}
                          </RadioGroup>
                        </div>

                        {/* Inline note textarea */}
                        {isNoteExpanded && (
                          <div className="px-3 pb-3">
                            <Textarea
                              ref={(el) => { noteRefs.current[pm.action_id] = el; }}
                              placeholder="Add a note, question, or reflection..."
                              defaultValue={currentNote}
                              onChange={(e) => handleNoteChange(pm.action_id, e.target.value)}
                              onBlur={(e) => {
                                if (debounceTimers.current[pm.action_id]) {
                                  clearTimeout(debounceTimers.current[pm.action_id]);
                                }
                                onNoteChange?.(pm.action_id, e.target.value);
                              }}
                              className="min-h-[60px] text-sm"
                              rows={2}
                            />
                            <p className="text-xs text-muted-foreground mt-1">
                              Notes auto-save. Visible to you and your coach.
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ));
            })()}
          </div>

          {/* Navigation */}
          <div className="flex justify-between mt-6 pt-4 border-t">
            <Button
              variant="outline"
              onClick={onPrevious}
              disabled={!onPrevious}
            >
              <ChevronLeft className="w-4 h-4 mr-2" />
              Previous
            </Button>

            {onComplete ? (
              <Button
                onClick={onComplete}
                disabled={!allDomainRated || isCompleting}
              >
                {isCompleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                <Check className="w-4 h-4 mr-2" />
                Complete Assessment
              </Button>
            ) : (
              <Button
                onClick={onNext}
                disabled={!onNext}
              >
                Next Domain
                <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Materials Sheet */}
      <DoctorMaterialsSheet
        proMoveId={selectedProMoveId}
        proMoveStatement={selectedProMove?.action_statement || ''}
        onClose={() => setSelectedProMoveId(null)}
      />
    </>
  );
}
