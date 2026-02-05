import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface DoctorMaterialsSheetProps {
  proMoveId: number | null;
  proMoveStatement: string;
  currentScore: number | null;
  onScoreChange: (score: number) => void;
  onClose: () => void;
}

interface ResourceData {
  type: string;
  content_md: string | null;
}

const SCORE_LABELS = [
  { value: 1, label: 'Developing' },
  { value: 2, label: 'Emerging' },
  { value: 3, label: 'Proficient' },
  { value: 4, label: 'Mastery' },
];

const MATERIAL_SECTIONS = [
  { type: 'doctor_why', title: 'Why It Matters' },
  { type: 'doctor_script', title: 'Scripting' },
  { type: 'doctor_gut_check', title: 'Gut Check Questions' },
  { type: 'doctor_good_looks_like', title: 'What Good Looks Like' },
];

export function DoctorMaterialsSheet({
  proMoveId,
  proMoveStatement,
  currentScore,
  onScoreChange,
  onClose,
}: DoctorMaterialsSheetProps) {
  const { data: resources, isLoading } = useQuery({
    queryKey: ['doctor-pro-move-resources', proMoveId],
    queryFn: async () => {
      if (!proMoveId) return [];
      
      const { data, error } = await supabase
        .from('pro_move_resources')
        .select('type, content_md')
        .eq('action_id', proMoveId)
        .in('type', ['doctor_text', 'doctor_why', 'doctor_script', 'doctor_gut_check', 'doctor_good_looks_like']);
      
      if (error) throw error;
      return data as ResourceData[];
    },
    enabled: !!proMoveId,
  });

  const getResourceContent = (type: string) => {
    return resources?.find(r => r.type === type)?.content_md || null;
  };

  const description = getResourceContent('doctor_text');

  return (
    <Sheet open={!!proMoveId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-left">{proMoveStatement}</SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Description */}
          {description && (
            <div className="prose prose-sm max-w-none">
              <ReactMarkdown>{description}</ReactMarkdown>
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
            </div>
          ) : (
            <>
              {/* Collapsible sections */}
              {MATERIAL_SECTIONS.map(section => {
                const content = getResourceContent(section.type);
                if (!content) return null;
                
                return (
                  <Collapsible key={section.type} defaultOpen>
                    <CollapsibleTrigger className="flex items-center justify-between w-full py-2 text-left font-medium hover:text-primary">
                      {section.title}
                      <ChevronDown className="h-4 w-4 transition-transform duration-200 [[data-state=open]>svg&]:-rotate-180" />
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="prose prose-sm max-w-none py-2 pl-2 border-l-2 border-muted">
                        <ReactMarkdown>{content}</ReactMarkdown>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                );
              })}
            </>
          )}

          {/* Rating section at bottom */}
          <div className="pt-6 border-t">
            <Label className="text-sm font-medium">Your Rating</Label>
            <RadioGroup
              value={currentScore?.toString() || ''}
              onValueChange={(val) => onScoreChange(parseInt(val))}
              className="mt-3 grid grid-cols-4 gap-2"
            >
              {SCORE_LABELS.map((s) => (
                <Label
                  key={s.value}
                  htmlFor={`sheet-${s.value}`}
                  className={`
                    flex flex-col items-center gap-1 p-3 rounded-lg border-2 cursor-pointer
                    transition-all text-center
                    ${currentScore === s.value 
                      ? 'bg-primary border-primary text-primary-foreground' 
                      : 'border-muted hover:border-primary/50'
                    }
                  `}
                >
                  <RadioGroupItem
                    value={s.value.toString()}
                    id={`sheet-${s.value}`}
                    className="sr-only"
                  />
                  <span className="text-lg font-bold">{s.value}</span>
                  <span className="text-xs">{s.label}</span>
                </Label>
              ))}
            </RadioGroup>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}