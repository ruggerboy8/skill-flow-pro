import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Loader2, ChevronDown, Sparkles, Eye } from 'lucide-react';
import { AIContentAssistant } from './AIContentAssistant';
import { DoctorMaterialsSheet } from '@/components/doctor/DoctorMaterialsSheet';

interface DoctorMaterialsDrawerProps {
  actionId: number;
  proMoveStatement: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ResourceData {
  id: string;
  type: string;
  content_md: string | null;
}

const MATERIAL_SECTIONS = [
  { type: 'doctor_why', title: 'Why It Matters', placeholder: 'Explain why this behavior matters for patient care...' },
  { type: 'doctor_script', title: 'Scripting', placeholder: 'Example phrases the doctor should use...' },
  { type: 'doctor_gut_check', title: 'Gut Check Questions', placeholder: '- Did I...?\n- Was the patient...?' },
  { type: 'doctor_good_looks_like', title: 'What Good Looks Like', placeholder: '- Observable behavior 1\n- Observable behavior 2' },
];

export function DoctorMaterialsDrawer({
  actionId,
  proMoveStatement,
  open,
  onOpenChange,
}: DoctorMaterialsDrawerProps) {
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [resources, setResources] = useState<Record<string, { id?: string; content: string }>>({});
  const [initialSnap, setInitialSnap] = useState<string>('');
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [showAIAssistant, setShowAIAssistant] = useState(false);
  const [aiGeneratedContent, setAIGeneratedContent] = useState<Record<string, string> | null>(null);
  const [showLearnerPreview, setShowLearnerPreview] = useState(false);

  useEffect(() => {
    if (!open || !actionId) return;
    loadResources();
  }, [open, actionId]);

  const loadResources = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('pro_move_resources')
        .select('id, type, content_md')
        .eq('action_id', actionId)
        .in('type', MATERIAL_SECTIONS.map(s => s.type));

      if (error) throw error;

      const resourceMap: Record<string, { id?: string; content: string }> = {};
      MATERIAL_SECTIONS.forEach(s => {
        resourceMap[s.type] = { content: '' };
      });

      (data || []).forEach((r: ResourceData) => {
        resourceMap[r.type] = {
          id: r.id,
          content: r.content_md || '',
        };
      });

      setResources(resourceMap);
      setInitialSnap(JSON.stringify(resourceMap));
      setAIGeneratedContent(null);
    } catch (error) {
      console.error('Error loading resources:', error);
      toast({
        title: 'Error',
        description: 'Failed to load learning materials',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const isDirty = initialSnap !== JSON.stringify(resources);

  const handleClose = () => {
    if (isDirty) {
      setShowUnsavedDialog(true);
    } else {
      onOpenChange(false);
    }
  };

  const handleContentChange = (type: string, content: string) => {
    setResources(prev => ({
      ...prev,
      [type]: { ...prev[type], content },
    }));
  };

  const handleAIGenerated = (content: Record<string, string>) => {
    setAIGeneratedContent(content);
    // Auto-populate fields
    Object.entries(content).forEach(([type, value]) => {
      if (value && MATERIAL_SECTIONS.some(s => s.type === type)) {
        handleContentChange(type, value);
      }
    });
    setShowAIAssistant(false);
    toast({
      title: 'Content Generated',
      description: 'AI-generated content has been added. Review and edit before saving.',
    });
  };

  const saveAll = async () => {
    setIsSaving(true);
    try {
      for (const section of MATERIAL_SECTIONS) {
        const resource = resources[section.type];
        const content = resource?.content?.trim() || '';

        if (resource?.id) {
          if (content) {
            // Update existing
            await supabase
              .from('pro_move_resources')
              .update({ content_md: content, updated_at: new Date().toISOString() })
              .eq('id', resource.id);
          } else {
            // Delete if empty
            await supabase
              .from('pro_move_resources')
              .delete()
              .eq('id', resource.id);
          }
        } else if (content) {
          // Insert new
          await supabase
            .from('pro_move_resources')
            .insert({
              action_id: actionId,
              type: section.type,
              content_md: content,
              display_order: MATERIAL_SECTIONS.findIndex(s => s.type === section.type),
              status: 'active',
            });
        }
      }

      await loadResources();
      toast({
        title: 'Saved',
        description: 'Learning materials updated successfully',
      });
    } catch (error) {
      console.error('Error saving resources:', error);
      toast({
        title: 'Error',
        description: 'Failed to save learning materials',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={handleClose}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <SheetTitle className="text-left">
                  Learning Materials
                </SheetTitle>
                <p className="text-sm text-muted-foreground text-left mt-1">{proMoveStatement}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowLearnerPreview(true)}
                className="flex-shrink-0"
              >
                <Eye className="h-4 w-4 mr-2" />
                View as Learner
              </Button>
            </div>
          </SheetHeader>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="mt-6 space-y-6">
              {/* Material Sections */}
              {MATERIAL_SECTIONS.map((section, idx) => {
                const resource = resources[section.type];
                const isAIGenerated = aiGeneratedContent?.[section.type] === resource?.content;
                
                return (
                  <div key={section.type} className="space-y-2">
                    <Label className="flex items-center gap-2">
                      {section.title}
                      {isAIGenerated && (
                        <span className="text-xs bg-warning/20 text-warning-foreground px-2 py-0.5 rounded">
                          AI Generated
                        </span>
                      )}
                    </Label>
                    <Textarea
                      value={resource?.content || ''}
                      onChange={(e) => handleContentChange(section.type, e.target.value)}
                      placeholder={section.placeholder}
                      rows={4}
                      className={`font-mono text-sm ${isAIGenerated ? 'bg-warning/10 border-warning' : ''}`}
                    />
                    {idx < MATERIAL_SECTIONS.length - 1 && <Separator className="mt-4" />}
                  </div>
                );
              })}

              {/* AI Assistant Section */}
              <Separator />
              <Collapsible open={showAIAssistant} onOpenChange={setShowAIAssistant}>
                <CollapsibleTrigger asChild>
                  <Button variant="outline" className="w-full justify-between">
                    <span className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-warning" />
                      AI Content Assistant
                    </span>
                    <ChevronDown className={`h-4 w-4 transition-transform ${showAIAssistant ? 'rotate-180' : ''}`} />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-4">
                  <AIContentAssistant
                    proMoveStatement={proMoveStatement}
                    onGenerated={handleAIGenerated}
                  />
                </CollapsibleContent>
              </Collapsible>
            </div>
          )}

          <SheetFooter className="mt-6 pt-4 border-t">
            <Button variant="outline" onClick={handleClose} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={saveAll} disabled={isSaving || loading}>
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save All
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <AlertDialog open={showUnsavedDialog} onOpenChange={setShowUnsavedDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Are you sure you want to close without saving?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Editing</AlertDialogCancel>
            <AlertDialogAction onClick={() => onOpenChange(false)}>
              Discard Changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Learner Preview Sheet */}
      <DoctorMaterialsSheet
        proMoveId={showLearnerPreview ? actionId : null}
        proMoveStatement={proMoveStatement}
        onClose={() => setShowLearnerPreview(false)}
      />
    </>
  );
}
