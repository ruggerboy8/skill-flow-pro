import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { 
  Lightbulb, 
  MessageSquareQuote, 
  HelpCircle, 
  CheckCircle2 
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface DoctorMaterialsSheetProps {
  proMoveId: number | null;
  proMoveStatement: string;
  onClose: () => void;
}

interface ResourceData {
  type: string;
  content_md: string | null;
}

const MATERIAL_SECTIONS = [
  { 
    type: 'doctor_why', 
    title: 'Why It Matters', 
    icon: Lightbulb,
    color: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-50 dark:bg-amber-950/30',
    borderColor: 'border-amber-200 dark:border-amber-800',
  },
  { 
    type: 'doctor_script', 
    title: 'Scripting', 
    icon: MessageSquareQuote,
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-50 dark:bg-blue-950/30',
    borderColor: 'border-blue-200 dark:border-blue-800',
  },
  { 
    type: 'doctor_gut_check', 
    title: 'Gut Check Questions', 
    icon: HelpCircle,
    color: 'text-purple-600 dark:text-purple-400',
    bgColor: 'bg-purple-50 dark:bg-purple-950/30',
    borderColor: 'border-purple-200 dark:border-purple-800',
  },
  { 
    type: 'doctor_good_looks_like', 
    title: 'What Good Looks Like', 
    icon: CheckCircle2,
    color: 'text-emerald-600 dark:text-emerald-400',
    bgColor: 'bg-emerald-50 dark:bg-emerald-950/30',
    borderColor: 'border-emerald-200 dark:border-emerald-800',
  },
];

export function DoctorMaterialsSheet({
  proMoveId,
  proMoveStatement,
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
  const hasAnyContent = MATERIAL_SECTIONS.some(s => getResourceContent(s.type));

  return (
    <Sheet open={!!proMoveId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader className="pb-4 border-b">
          <SheetTitle className="text-left text-lg leading-relaxed">
            {proMoveStatement}
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Description */}
          {description && (
            <div className="prose prose-sm max-w-none text-muted-foreground">
              <ReactMarkdown>{description}</ReactMarkdown>
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
            </div>
          ) : (
            <>
              {/* Material sections as styled cards */}
              {hasAnyContent ? (
                <div className="space-y-4">
                  {MATERIAL_SECTIONS.map(section => {
                    const content = getResourceContent(section.type);
                    if (!content) return null;
                    
                    const Icon = section.icon;
                    
                    return (
                      <Card 
                        key={section.type} 
                        className={`${section.bgColor} ${section.borderColor} border`}
                      >
                        <CardContent className="pt-4 pb-4">
                          <div className="flex items-center gap-2 mb-3">
                            <Icon className={`h-5 w-5 ${section.color}`} />
                            <h3 className={`font-semibold ${section.color}`}>
                              {section.title}
                            </h3>
                          </div>
                          <div className="prose prose-sm max-w-none prose-p:my-2 prose-ul:my-2 prose-li:my-0.5">
                            <ReactMarkdown
                              components={{
                                p: ({ children }) => (
                                  <p className="text-foreground/90">{children}</p>
                                ),
                                ul: ({ children }) => (
                                  <ul className="list-disc pl-4 space-y-1">{children}</ul>
                                ),
                                li: ({ children }) => (
                                  <li className="text-foreground/90">{children}</li>
                                ),
                                blockquote: ({ children }) => (
                                  <blockquote className="border-l-4 border-current/30 pl-4 italic text-foreground/80">
                                    {children}
                                  </blockquote>
                                ),
                                strong: ({ children }) => (
                                  <strong className="font-semibold text-foreground">{children}</strong>
                                ),
                              }}
                            >
                              {content}
                            </ReactMarkdown>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <p>No learning materials available yet.</p>
                </div>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}