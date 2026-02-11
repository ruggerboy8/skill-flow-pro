import { useState, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ChevronLeft, ChevronRight, Check, Loader2, Info, MessageSquare } from 'lucide-react';
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
}

const SCORE_LABELS = [
  { value: 1, label: 'Needs focus', short: '1' },
  { value: 2, label: 'Room to grow', short: '2' },
  { value: 3, label: 'Excellent', short: '3' },
  { value: 4, label: 'Exceptional', short: '4' },
];

export function DomainAssessmentStep({
  domain,
  ratings,
  onRatingChange,
  onNoteChange,
  onPrevious,
  onNext,
  onComplete,
  isCompleting,
}: DomainAssessmentStepProps) {
  const [selectedProMoveId, setSelectedProMoveId] = useState<number | null>(null);
  const [expandedNoteId, setExpandedNoteId] = useState<number | null>(null);
  const debounceTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  const handleNoteChange = useCallback((actionId: number, noteText: string) => {
    // Clear existing debounce timer
    if (debounceTimers.current[actionId]) {
      clearTimeout(debounceTimers.current[actionId]);
    }
    // Debounce save at 600ms
    debounceTimers.current[actionId] = setTimeout(() => {
      onNoteChange?.(actionId, noteText);
    }, 600);
  }, [onNoteChange]);

  const domainRatedCount = domain.proMoves.filter(
    pm => ratings[pm.action_id]?.score !== null && ratings[pm.action_id]?.score !== undefined
  ).length;
  const allDomainRated = domainRatedCount === domain.proMoves.length;

  const selectedProMove = domain.proMoves.find(pm => pm.action_id === selectedProMoveId);

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div 
              className="w-4 h-4 rounded-full" 
              style={{ backgroundColor: domain.color_hex }}
            />
            <CardTitle>{domain.domain_name}</CardTitle>
            <span className="text-sm text-muted-foreground ml-auto">
              {domainRatedCount}/{domain.proMoves.length} rated
            </span>
          </div>
        </CardHeader>
        <CardContent>
          {/* Sticky Legend at top */}
          <div className="mb-4 p-3 bg-muted/50 rounded-lg border">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
              <span className="font-medium text-muted-foreground">Key:</span>
              <span><strong className="text-primary">4</strong> = Exceptional, above & beyond</span>
              <span><strong className="text-primary">3</strong> = Excellent, consistent</span>
              <span><strong className="text-primary">2</strong> = Good, room to grow</span>
              <span><strong className="text-primary">1</strong> = Needs focus</span>
            </div>
          </div>

          <div className="space-y-1">
            {/* Header row */}
            <div className="grid grid-cols-[1fr,auto] gap-4 px-3 py-2 text-sm font-medium text-muted-foreground border-b">
              <div>Pro Move</div>
              <div className="flex gap-2">
                {SCORE_LABELS.map(s => (
                  <div key={s.value} className="w-10 text-center text-xs">
                    {s.short}
                  </div>
                ))}
              </div>
            </div>

            {/* Pro Move rows */}
            {domain.proMoves.map((pm) => {
              const currentRating = ratings[pm.action_id]?.score;
              const currentNote = ratings[pm.action_id]?.note || '';
              const hasNote = currentNote.trim().length > 0;
              const isNoteExpanded = expandedNoteId === pm.action_id;
              
              return (
                <div key={pm.action_id} className="rounded-lg hover:bg-muted/50 group">
                  <div className="grid grid-cols-[1fr,auto] gap-4 px-3 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedProMoveId(pm.action_id)}
                        className="cursor-pointer flex items-center gap-2 text-left flex-1 min-w-0"
                      >
                        <Info className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                        <span className="text-sm">{pm.action_statement}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setExpandedNoteId(isNoteExpanded ? null : pm.action_id)}
                        className={`flex-shrink-0 p-1 rounded transition-colors ${
                          hasNote 
                            ? 'text-primary' 
                            : 'text-muted-foreground/40 hover:text-muted-foreground'
                        }`}
                        title={hasNote ? 'Edit note' : 'Add note'}
                      >
                        <MessageSquare className="h-4 w-4" />
                      </button>
                    </div>
                    
                    <RadioGroup
                      value={currentRating?.toString() || ''}
                      onValueChange={(val) => onRatingChange(pm.action_id, parseInt(val))}
                      className="flex gap-2"
                    >
                      {SCORE_LABELS.map((s) => (
                        <div key={s.value} className="w-10 flex justify-center">
                          <Label
                            htmlFor={`${pm.action_id}-${s.value}`}
                            className={`
                              w-8 h-8 rounded-full border-2 flex items-center justify-center cursor-pointer
                              transition-all
                              ${currentRating === s.value 
                                ? 'bg-primary border-primary text-primary-foreground' 
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
                        placeholder="Add a note, question, or reflection..."
                        defaultValue={currentNote}
                        onChange={(e) => handleNoteChange(pm.action_id, e.target.value)}
                        onBlur={(e) => {
                          // Flush on blur immediately
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