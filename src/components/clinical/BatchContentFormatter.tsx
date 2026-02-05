import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Wand2, Loader2, CheckCircle2, AlertCircle, Eye, EyeOff } from 'lucide-react';

const DOCTOR_TYPES = ['doctor_why', 'doctor_script', 'doctor_gut_check', 'doctor_good_looks_like'] as const;
type DoctorType = typeof DOCTOR_TYPES[number];

const TYPE_LABELS: Record<DoctorType, string> = {
  doctor_why: 'Why It Matters',
  doctor_script: 'Scripting',
  doctor_gut_check: 'Gut Check',
  doctor_good_looks_like: 'Good Looks Like',
};

interface ResourceToFormat {
  id: string;
  action_id: number;
  type: DoctorType;
  content_md: string;
  formatted?: string;
  status: 'pending' | 'processing' | 'done' | 'error';
  error?: string;
}

interface BatchContentFormatterProps {
  onComplete?: () => void;
}

export function BatchContentFormatter({ onComplete }: BatchContentFormatterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'loading' | 'formatting' | 'preview' | 'saving'>('idle');
  const [resources, setResources] = useState<ResourceToFormat[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showPreview, setShowPreview] = useState(true);
  const [selectedPreview, setSelectedPreview] = useState<ResourceToFormat | null>(null);

  const loadResources = async () => {
    setPhase('loading');
    try {
      const { data, error } = await supabase
        .from('pro_move_resources')
        .select('id, action_id, type, content_md')
        .in('type', DOCTOR_TYPES)
        .not('content_md', 'is', null)
        .order('action_id');

      if (error) throw error;

      const formatted: ResourceToFormat[] = (data || [])
        .filter(r => r.content_md && r.content_md.trim().length > 0)
        .map(r => ({
          id: r.id,
          action_id: r.action_id,
          type: r.type as DoctorType,
          content_md: r.content_md!,
          status: 'pending' as const,
        }));

      setResources(formatted);
      setCurrentIndex(0);
      setPhase('formatting');
      
      // Start formatting
      await formatResources(formatted);
    } catch (error) {
      console.error('Error loading resources:', error);
      toast({
        title: 'Error',
        description: 'Failed to load resources',
        variant: 'destructive',
      });
      setPhase('idle');
    }
  };

  const formatResources = async (items: ResourceToFormat[]) => {
    const CHUNK_SIZE = 5;
    const DELAY_BETWEEN_CHUNKS = 1000; // 1 second between chunks

    for (let i = 0; i < items.length; i += CHUNK_SIZE) {
      const chunk = items.slice(i, i + CHUNK_SIZE);
      
      await Promise.all(
        chunk.map(async (item, chunkIndex) => {
          const globalIndex = i + chunkIndex;
          
          setResources(prev => prev.map((r, idx) => 
            idx === globalIndex ? { ...r, status: 'processing' } : r
          ));

          try {
            const { data, error } = await supabase.functions.invoke('format-pro-move-content', {
              body: {
                content: item.content_md,
                contentType: item.type,
              },
            });

            if (error) throw error;

            setResources(prev => prev.map((r, idx) => 
              idx === globalIndex 
                ? { ...r, status: 'done', formatted: data.formatted } 
                : r
            ));
          } catch (error) {
            console.error(`Error formatting resource ${item.id}:`, error);
            setResources(prev => prev.map((r, idx) => 
              idx === globalIndex 
                ? { ...r, status: 'error', error: 'Failed to format' } 
                : r
            ));
          }

          setCurrentIndex(globalIndex + 1);
        })
      );

      // Delay between chunks to avoid rate limiting
      if (i + CHUNK_SIZE < items.length) {
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_CHUNKS));
      }
    }

    setPhase('preview');
  };

  const saveAllChanges = async () => {
    setPhase('saving');
    
    const toSave = resources.filter(r => r.status === 'done' && r.formatted);
    let saved = 0;
    let errors = 0;

    for (const item of toSave) {
      try {
        const { error } = await supabase
          .from('pro_move_resources')
          .update({ 
            content_md: item.formatted,
            updated_at: new Date().toISOString(),
          })
          .eq('id', item.id);

        if (error) throw error;
        saved++;
      } catch (error) {
        console.error(`Error saving resource ${item.id}:`, error);
        errors++;
      }
    }

    toast({
      title: 'Formatting Complete',
      description: `${saved} materials updated${errors > 0 ? `, ${errors} errors` : ''}`,
    });

    setPhase('idle');
    setIsOpen(false);
    onComplete?.();
  };

  const handleCancel = () => {
    setPhase('idle');
    setResources([]);
    setCurrentIndex(0);
    setIsOpen(false);
  };

  const progress = resources.length > 0 ? (currentIndex / resources.length) * 100 : 0;
  const doneCount = resources.filter(r => r.status === 'done').length;
  const errorCount = resources.filter(r => r.status === 'error').length;

  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Wand2 className="h-4 w-4" />
          Format All Materials
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {phase === 'idle' && 'Format All Doctor Materials'}
            {phase === 'loading' && 'Loading Materials...'}
            {phase === 'formatting' && 'Formatting Materials...'}
            {phase === 'preview' && 'Review Formatted Materials'}
            {phase === 'saving' && 'Saving Changes...'}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {phase === 'idle' && (
              <>
                This will use AI to auto-format all doctor learning materials 
                (scripts, gut check questions, etc.) into clean, readable markdown.
                You'll be able to preview changes before saving.
              </>
            )}
            {phase === 'formatting' && (
              <div className="space-y-3 mt-2">
                <Progress value={progress} className="h-2" />
                <p className="text-sm">
                  Processing {currentIndex} of {resources.length} materials...
                </p>
              </div>
            )}
            {phase === 'preview' && (
              <div className="flex items-center gap-4 mt-2">
                <Badge variant="outline" className="gap-1">
                  <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                  {doneCount} formatted
                </Badge>
                {errorCount > 0 && (
                  <Badge variant="outline" className="gap-1">
                    <AlertCircle className="h-3 w-3 text-destructive" />
                    {errorCount} errors
                  </Badge>
                )}
              </div>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {phase === 'preview' && (
          <div className="flex-1 overflow-hidden">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">
                Click an item to preview before/after
              </span>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setShowPreview(!showPreview)}
                className="gap-1"
              >
                {showPreview ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                {showPreview ? 'Hide' : 'Show'} Preview
              </Button>
            </div>
            
            <ScrollArea className="h-[300px] border rounded-md">
              <div className="p-2 space-y-1">
                {resources.map((item, idx) => (
                  <div
                    key={item.id}
                    className={`p-2 rounded text-sm cursor-pointer transition-colors ${
                      selectedPreview?.id === item.id 
                        ? 'bg-primary/10 border border-primary/30' 
                        : 'hover:bg-muted'
                    }`}
                    onClick={() => setSelectedPreview(item)}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs text-muted-foreground">
                        #{item.action_id}
                      </span>
                      <Badge variant="secondary" className="text-xs">
                        {TYPE_LABELS[item.type]}
                      </Badge>
                    </div>
                    <p className="truncate mt-1">
                      {item.content_md.slice(0, 60)}...
                    </p>
                    {item.status === 'error' && (
                      <span className="text-xs text-destructive">{item.error}</span>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>

            {showPreview && selectedPreview && (
              <div className="mt-4 grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Before</p>
                  <ScrollArea className="h-32 border rounded-md bg-muted/30 p-2">
                    <pre className="text-xs whitespace-pre-wrap">{selectedPreview.content_md}</pre>
                  </ScrollArea>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">After</p>
                  <ScrollArea className="h-32 border rounded-md bg-emerald-50/50 dark:bg-emerald-950/20 p-2">
                    <pre className="text-xs whitespace-pre-wrap">{selectedPreview.formatted || 'N/A'}</pre>
                  </ScrollArea>
                </div>
              </div>
            )}
          </div>
        )}

        <AlertDialogFooter>
          {phase === 'idle' && (
            <>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={loadResources}>
                Start Formatting
              </AlertDialogAction>
            </>
          )}
          {(phase === 'loading' || phase === 'formatting' || phase === 'saving') && (
            <Button disabled>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              {phase === 'loading' && 'Loading...'}
              {phase === 'formatting' && 'Formatting...'}
              {phase === 'saving' && 'Saving...'}
            </Button>
          )}
          {phase === 'preview' && (
            <>
              <Button variant="outline" onClick={handleCancel}>
                Cancel
              </Button>
              <Button onClick={saveAllChanges} disabled={doneCount === 0}>
                Apply {doneCount} Changes
              </Button>
            </>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
