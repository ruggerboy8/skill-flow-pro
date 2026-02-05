import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { ChevronLeft, ChevronRight, Check, Loader2, Info } from 'lucide-react';
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
  onPrevious?: () => void;
  onNext?: () => void;
  onComplete?: () => void;
  isCompleting?: boolean;
}

const SCORE_LABELS = [
  { value: 1, label: 'Developing', short: '1' },
  { value: 2, label: 'Emerging', short: '2' },
  { value: 3, label: 'Proficient', short: '3' },
  { value: 4, label: 'Mastery', short: '4' },
];

export function DomainAssessmentStep({
  domain,
  ratings,
  onRatingChange,
  onPrevious,
  onNext,
  onComplete,
  isCompleting,
}: DomainAssessmentStepProps) {
  const [selectedProMoveId, setSelectedProMoveId] = useState<number | null>(null);

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
              
              return (
                <div 
                  key={pm.action_id}
                  className="grid grid-cols-[1fr,auto] gap-4 px-3 py-3 rounded-lg hover:bg-muted/50 group"
                >
                  <div 
                    className="flex items-center gap-2 cursor-pointer"
                    onClick={() => setSelectedProMoveId(pm.action_id)}
                  >
                    <Info className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                    <span className="text-sm">{pm.action_statement}</span>
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
              );
            })}
          </div>

          {/* Legend */}
          <div className="mt-6 pt-4 border-t">
            <p className="text-xs text-muted-foreground mb-2">Rating Scale:</p>
            <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
              {SCORE_LABELS.map(s => (
                <span key={s.value}>
                  <strong>{s.value}</strong> = {s.label}
                </span>
              ))}
            </div>
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
        currentScore={selectedProMove ? ratings[selectedProMove.action_id]?.score : null}
        onScoreChange={(score) => {
          if (selectedProMoveId) {
            onRatingChange(selectedProMoveId, score);
          }
        }}
        onClose={() => setSelectedProMoveId(null)}
      />
    </>
  );
}