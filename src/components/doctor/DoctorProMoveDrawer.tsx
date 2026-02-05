import { useState, useEffect } from "react";
import { GraduationCap, Lightbulb, MessageSquareQuote, HelpCircle, CheckCircle2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { getDomainColorRichRaw } from "@/lib/domainColors";
import ReactMarkdown from "react-markdown";
import type { DoctorProMoveDetail } from "@/hooks/useDoctorDomainDetail";

interface DoctorProMoveDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  move: DoctorProMoveDetail | null;
  domainName: string;
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
    type: 'doctor_good_looks_like', 
    title: 'What Good Looks Like', 
    icon: CheckCircle2,
    color: 'text-emerald-600 dark:text-emerald-400',
    bgColor: 'bg-emerald-50 dark:bg-emerald-950/30',
    borderColor: 'border-emerald-200 dark:border-emerald-800',
  },
  { 
    type: 'doctor_gut_check', 
    title: 'Gut Check Questions', 
    icon: HelpCircle,
    color: 'text-purple-600 dark:text-purple-400',
    bgColor: 'bg-purple-50 dark:bg-purple-950/30',
    borderColor: 'border-purple-200 dark:border-purple-800',
  },
];

export function DoctorProMoveDrawer({
  open,
  onOpenChange,
  move,
  domainName,
}: DoctorProMoveDrawerProps) {
  const [loading, setLoading] = useState(true);
  const [resources, setResources] = useState<ResourceData[]>([]);

  const richColor = getDomainColorRichRaw(domainName);

  useEffect(() => {
    if (!open || !move?.action_id) return;
    
    async function loadResources() {
      setLoading(true);
      
      const { data, error } = await supabase
        .from('pro_move_resources')
        .select('type, content_md')
        .eq('action_id', move!.action_id)
        .in('type', ['doctor_why', 'doctor_script', 'doctor_gut_check', 'doctor_good_looks_like']);
      
      if (!error && data) {
        setResources(data);
      }
      setLoading(false);
    }

    loadResources();
  }, [open, move?.action_id]);

  if (!move) return null;

  const getResourceContent = (type: string) => {
    return resources.find(r => r.type === type)?.content_md || null;
  };

  const hasAnyContent = MATERIAL_SECTIONS.some(s => getResourceContent(s.type));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl h-[100dvh] p-0 flex flex-col gap-0 border-l-0 sm:border-l">
        {/* Header */}
        <SheetHeader 
          className="px-6 py-6 text-left border-b"
          style={{ backgroundColor: `hsl(${richColor} / 0.08)` }}
        >
          <div className="flex items-center gap-2 mb-2">
            <Badge 
              variant="outline" 
              className="bg-background/50 backdrop-blur text-xs font-normal"
              style={{ 
                color: `hsl(${richColor})`,
                borderColor: `hsl(${richColor} / 0.3)`
              }}
            >
              {domainName}
            </Badge>
          </div>
          <SheetTitle className="text-xl md:text-2xl font-bold leading-tight">
            {move.action_statement}
          </SheetTitle>
          <SheetDescription className="text-xs text-muted-foreground flex items-center gap-1">
            <GraduationCap className="w-3 h-3" />
            Learning Materials
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 px-6">
          <div className="py-6 space-y-4">
            {loading ? (
              <div className="space-y-4">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            ) : !hasAnyContent ? (
              <div className="text-center py-12 text-muted-foreground">
                <GraduationCap className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p className="text-sm">No learning materials available yet.</p>
              </div>
            ) : (
              <>
                {/* Material sections as styled cards - matching DoctorMaterialsSheet */}
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
              </>
            )}
          </div>
        </ScrollArea>

        <div className="p-4 border-t bg-background">
          <Button onClick={() => onOpenChange(false)} className="w-full" variant="outline">
            Close
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
