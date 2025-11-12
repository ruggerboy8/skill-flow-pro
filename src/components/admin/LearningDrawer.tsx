import { useState, useEffect } from 'react';
import { GraduationCap, Video, FileText, Link as LinkIcon, Plus, Trash2, Volume2, Loader2 } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { YouTubePreview } from './YouTubePreview';
import { LinkEditor } from './LinkEditor';
import { DraggableList } from './DraggableList';
import { extractYouTubeId, isValidYouTubeUrl } from '@/lib/youtubeHelpers';
import { getDomainColor } from '@/lib/domainColors';

// Simple hash function for script integrity checking
function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString(36);
}

// Tone presets for audio generation
const TONE_PRESETS = [
  {
    name: "Warm Professional",
    description: "Everyday communication, bookings, intros",
    instructions: "Speak with a calm, friendly tone—confident but relaxed, like someone who's genuinely happy to help and knows what they're doing."
  },
  {
    name: "Empathetic Reassurance",
    description: "Cancellations, objections, worried parents",
    instructions: "Sound steady and kind, keeping your voice soft but certain—like you're helping someone feel taken care of, not corrected."
  },
  {
    name: "Bright Hospitality",
    description: "Greetings, confirmations, light rapport",
    instructions: "Bring an upbeat, welcoming tone—as if you're smiling while you talk and want the other person to feel instantly comfortable."
  },
  {
    name: "Clear Instructional",
    description: "Policies, directions, next steps",
    instructions: "Speak slowly and clearly, with patience and warmth—guiding the listener step by step so they never feel rushed or confused."
  },
  {
    name: "Confident Caregiver",
    description: "Treatment explanations, credibility, reassurance",
    instructions: "Use a calm, assured tone that blends professionalism with empathy—like a trusted team member explaining something important in simple terms."
  }
];

interface LearningDrawerProps {
  actionId: number;
  proMoveTitle: string;
  domainName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onResourcesChange?: (summary: { video: boolean; script: boolean; links: number; total: number }) => void;
}

interface LinkResource {
  id?: string;
  url: string;
  title?: string;
  display_order: number;
}

export function LearningDrawer({
  actionId,
  proMoveTitle,
  domainName,
  open,
  onOpenChange,
  onResourcesChange,
}: LearningDrawerProps) {
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [description, setDescription] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [videoId, setVideoId] = useState<string | null>(null);
  const [videoResourceId, setVideoResourceId] = useState<string>();
  const [script, setScript] = useState('');
  const [scriptResourceId, setScriptResourceId] = useState<string>();
  const [links, setLinks] = useState<LinkResource[]>([]);
  const [editingLink, setEditingLink] = useState<LinkResource | null>(null);
  const [showLinkEditor, setShowLinkEditor] = useState(false);
  const [videoError, setVideoError] = useState<string>();
  const [initialSnap, setInitialSnap] = useState<string>('');
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  
  // Audio state machine
  type AudioState = 'empty' | 'draft' | 'saved';
  const [audioState, setAudioState] = useState<AudioState>('empty');
  const [audioUrl, setAudioUrl] = useState<string>();
  const [audioResourceId, setAudioResourceId] = useState<string>();
  const [generatingAudio, setGeneratingAudio] = useState(false);
  const [savingAudio, setSavingAudio] = useState(false);
  const [voiceName, setVoiceName] = useState('Ava Song');
  const [tonePreset, setTonePreset] = useState(TONE_PRESETS[0].name);
  
  // Draft audio (in memory, not saved)
  const [draftAudioBlob, setDraftAudioBlob] = useState<string>();
  const [draftMetadata, setDraftMetadata] = useState<{
    scriptHash: string;
    generationId: string;
    durationSec: number;
    voice: string;
  }>();
  
  // Saved audio metadata
  const [savedScriptHash, setSavedScriptHash] = useState<string>();
  const [savedVersion, setSavedVersion] = useState<number>();
  
  // Computed properties
  const hasAudio = audioState === 'draft' || audioState === 'saved';

  useEffect(() => {
    if (!open || !actionId) return;

    loadData();
  }, [open, actionId]);

  async function loadData() {
    setLoading(true);
    try {
      // Fetch description from pro_moves
      const { data: pm } = await supabase
        .from('pro_moves')
        .select('description')
        .eq('action_id', actionId)
        .single();

      // Fetch all resources
      const { data: resources } = await supabase
        .from('pro_move_resources')
        .select('*')
        .eq('action_id', actionId)
        .order('display_order');

      setDescription(pm?.description || '');

      const video = resources?.find((r) => r.type === 'video');
      if (video) {
        setVideoUrl(video.url || '');
        setVideoId(extractYouTubeId(video.url || ''));
        setVideoResourceId(video.id);
      } else {
        setVideoUrl('');
        setVideoId(null);
        setVideoResourceId(undefined);
      }

      const scriptRes = resources?.find((r) => r.type === 'script');
      if (scriptRes) {
        setScript(scriptRes.content_md || '');
        setScriptResourceId(scriptRes.id);
      } else {
        setScript('');
        setScriptResourceId(undefined);
      }

      const linkResources = resources?.filter((r) => r.type === 'link') || [];
      const linksData = linkResources.map((r) => ({
        id: r.id,
        url: r.url || '',
        title: r.title || undefined,
        display_order: r.display_order,
      }));
      setLinks(linksData);

      // Load audio resource (only active)
      const audioRes = resources?.find((r) => r.type === 'audio' && r.status === 'active');
      if (audioRes) {
        const metadata = audioRes.metadata as any;
        setSavedScriptHash(metadata?.script_sha256);
        setSavedVersion(metadata?.version || 1);
        setVoiceName(metadata?.voice || 'Ava Song');
        setAudioResourceId(audioRes.id);
        
        // Get public URL for preview
        const { data: publicData } = supabase.storage
          .from('pro-move-audio')
          .getPublicUrl(audioRes.url);
        
        if (publicData?.publicUrl) {
          setAudioUrl(publicData.publicUrl);
          setAudioState('saved');
        }
      } else {
        setAudioUrl(undefined);
        setAudioResourceId(undefined);
        setAudioState('empty');
        setSavedScriptHash(undefined);
        setSavedVersion(undefined);
      }

      // Set initial snapshot for dirty tracking
      setInitialSnap(JSON.stringify({
        description: pm?.description || '',
        videoUrl: video?.url || '',
        script: scriptRes?.content_md || '',
        links: linksData,
        audio: audioRes?.url || '',
      }));
    } catch (error) {
      console.error('Error loading learning resources:', error);
      toast({
        title: 'Error',
        description: 'Failed to load learning resources',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  function emitSummary(overrides?: { video?: boolean; script?: boolean; links?: number; audio?: boolean }) {
    const summary = {
      video: overrides?.video ?? !!videoResourceId,
      script: overrides?.script ?? !!scriptResourceId,
      links: overrides?.links ?? links.length,
      total: 0,
    };
    summary.total = (summary.video ? 1 : 0) + (summary.script ? 1 : 0) + summary.links + (overrides?.audio ?? !!audioResourceId ? 1 : 0);
    onResourcesChange?.(summary);
  }

  const isDirty = initialSnap !== JSON.stringify({ description, videoUrl, script, links, audio: audioUrl });

  async function saveAll() {
    setIsSaving(true);
    try {
      // Save description
      await supabase
        .from('pro_moves')
        .update({ description })
        .eq('action_id', actionId);

      // Save or remove video
      await saveVideoInternal(videoUrl);

      // Save or remove script
      await saveScriptInternal();

      // Save audio draft if present
      if (audioState === 'draft' && draftMetadata) {
        await saveAudio();
      }

      setInitialSnap(JSON.stringify({ description, videoUrl, script, links, audio: audioUrl }));
      
      toast({
        title: 'Success',
        description: 'All changes saved',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to save changes',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function saveVideoInternal(nextUrl: string) {
    setVideoError(undefined);
    
    if (!nextUrl.trim()) {
      await removeVideoInternal();
      return;
    }

    const extractedId = extractYouTubeId(nextUrl);
    if (!extractedId) {
      setVideoError('Invalid YouTube URL. Please use a valid YouTube link.');
      throw new Error('Invalid YouTube URL');
    }

    if (videoResourceId) {
      // Update existing
      await supabase
        .from('pro_move_resources')
        .update({ url: nextUrl, provider: 'youtube' })
        .eq('id', videoResourceId);
    } else {
      // Insert new
      const { data } = await supabase
        .from('pro_move_resources')
        .insert({
          action_id: actionId,
          type: 'video',
          provider: 'youtube',
          url: nextUrl,
          display_order: 0,
          status: 'active',
        })
        .select()
        .single();
      setVideoResourceId(data?.id);
    }

    setVideoUrl(nextUrl);
    setVideoId(extractedId);
    emitSummary({ video: true });
  }

  async function removeVideoInternal() {
    if (videoResourceId) {
      await supabase
        .from('pro_move_resources')
        .delete()
        .eq('id', videoResourceId);
    } else {
      await supabase
        .from('pro_move_resources')
        .delete()
        .eq('action_id', actionId)
        .eq('type', 'video');
    }

    setVideoResourceId(undefined);
    setVideoUrl('');
    setVideoId(null);
    emitSummary({ video: false });
  }

  async function removeVideo() {
    setIsSaving(true);
    try {
      await removeVideoInternal();
      setInitialSnap(JSON.stringify({ description, videoUrl: '', script, links, audio: audioUrl }));
      
      toast({
        title: 'Success',
        description: 'Video removed',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to remove video',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function saveScriptInternal() {
    // Check if script is truly empty (strip HTML tags to get actual text)
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = script;
    const textContent = tempDiv.textContent || tempDiv.innerText || '';
    const isEmpty = textContent.trim().length === 0;
    
    if (isEmpty) {
      // Delete the script if it exists
      if (scriptResourceId) {
        await supabase
          .from('pro_move_resources')
          .delete()
          .eq('id', scriptResourceId);
        setScriptResourceId(undefined);
      }
      setScript('');
      emitSummary({ script: false });
      return;
    }

    if (scriptResourceId) {
      // Update existing
      await supabase
        .from('pro_move_resources')
        .update({ content_md: script })
        .eq('id', scriptResourceId);
    } else {
      // Insert new
      const { data } = await supabase
        .from('pro_move_resources')
        .insert({
          action_id: actionId,
          type: 'script',
          content_md: script,
          display_order: 1,
          status: 'active',
        })
        .select()
        .single();
      
      setScriptResourceId(data?.id);
    }

    emitSummary({ script: true });
  }

  function handleAddLink() {
    setEditingLink(null);
    setShowLinkEditor(true);
  }

  function handleEditLink(link: LinkResource) {
    setEditingLink(link);
    setShowLinkEditor(true);
  }

  async function handleSaveLink(link: { id?: string; url: string; title?: string }) {
    setIsSaving(true);
    try {
      let updatedLinks: LinkResource[];
      
      if (link.id) {
        // Update existing
        await supabase
          .from('pro_move_resources')
          .update({ url: link.url, title: link.title })
          .eq('id', link.id);
        
        updatedLinks = links.map((l) => (l.id === link.id ? { ...l, url: link.url, title: link.title } : l));
        setLinks(updatedLinks);
      } else {
        // Insert new
        const { data } = await supabase
          .from('pro_move_resources')
          .insert({
            action_id: actionId,
            type: 'link',
            url: link.url,
            title: link.title,
            display_order: links.length + 10,
            status: 'active',
          })
          .select()
          .single();
        
        if (data) {
          updatedLinks = [
            ...links,
            { id: data.id, url: link.url, title: link.title, display_order: links.length + 10 },
          ];
          setLinks(updatedLinks);
        } else {
          updatedLinks = links;
        }
      }

      setShowLinkEditor(false);
      setEditingLink(null);
      setInitialSnap(JSON.stringify({ description, videoUrl, script, links: updatedLinks, audio: audioUrl }));
      
      toast({
        title: 'Success',
        description: 'Link saved',
      });

      emitSummary({ links: updatedLinks.length });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to save link',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteLink(link: LinkResource) {
    if (!link.id) return;

    setIsSaving(true);
    try {
      await supabase
        .from('pro_move_resources')
        .delete()
        .eq('id', link.id);

      const updatedLinks = links.filter((l) => l.id !== link.id);
      setLinks(updatedLinks);
      setInitialSnap(JSON.stringify({ description, videoUrl, script, links: updatedLinks, audio: audioUrl }));
      
      toast({
        title: 'Success',
        description: 'Link deleted',
      });

      emitSummary({ links: updatedLinks.length });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete link',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleReorderLinks(reorderedLinks: LinkResource[]) {
    setLinks(reorderedLinks);

    setIsSaving(true);
    try {
      // Update display_order for all links
      const updates = reorderedLinks.map((link, index) => 
        supabase
          .from('pro_move_resources')
          .update({ display_order: index + 10 })
          .eq('id', link.id!)
      );

      await Promise.all(updates);

      setInitialSnap(JSON.stringify({ description, videoUrl, script, links: reorderedLinks, audio: audioUrl }));
      emitSummary({ links: reorderedLinks.length });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to reorder links',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function generateAudio() {
    if (!script || !script.trim()) {
      toast({
        title: 'Error',
        description: 'Script is empty. Please add content before generating audio.',
        variant: 'destructive',
      });
      return;
    }

    setGeneratingAudio(true);
    setDraftAudioBlob(undefined);
    setDraftMetadata(undefined);
    
    try {
      const selectedPreset = TONE_PRESETS.find(p => p.name === tonePreset);
      const { data, error } = await supabase.functions.invoke('generate-audio', {
        body: {
          scriptMd: script,
          voiceName,
          actingInstructions: selectedPreset?.instructions
        }
      });

      if (error) throw error;

      // Convert base64 to blob URL for preview
      const audioBytes = Uint8Array.from(atob(data.audioBase64), c => c.charCodeAt(0));
      const blob = new Blob([audioBytes], { type: 'audio/wav' });
      const blobUrl = URL.createObjectURL(blob);
      
      setDraftAudioBlob(blobUrl);
      setDraftMetadata({
        scriptHash: data.scriptHash,
        generationId: data.generationId,
        durationSec: data.durationSec,
        voice: voiceName
      });
      setAudioState('draft');
      
      // Store base64 for later save
      (window as any).__draftAudioBase64 = data.audioBase64;
      
      toast({
        title: 'Audio Generated',
        description: 'Preview the audio below. Click Save to store it.',
      });

      emitSummary({ audio: false }); // Draft doesn't count yet
    } catch (e: any) {
      console.error('Audio generation error:', e);
      toast({
        title: 'Error',
        description: e?.message || 'Failed to generate audio',
        variant: 'destructive',
      });
    } finally {
      setGeneratingAudio(false);
    }
  }

  async function saveAudio() {
    if (audioState !== 'draft' || !draftMetadata) {
      toast({
        title: 'Error',
        description: 'No draft audio to save',
        variant: 'destructive',
      });
      return;
    }

    setSavingAudio(true);
    try {
      const audioBase64 = (window as any).__draftAudioBase64;
      if (!audioBase64) {
        throw new Error('Draft audio not found in memory');
      }

      const requestId = crypto.randomUUID();
      const currentScriptHash = script ? hashString(script) : '';
      
      const { data, error } = await supabase.functions.invoke('save-audio', {
        body: {
          actionId,
          audioBase64,
          voiceName: draftMetadata.voice,
          durationSec: draftMetadata.durationSec,
          generationId: draftMetadata.generationId,
          scriptHash: currentScriptHash, // Use current script hash
          requestId
        }
      });

      if (error) throw error;

      // Get public URL for the saved file
      const { data: publicData } = supabase.storage
        .from('pro-move-audio')
        .getPublicUrl(data.url);
      
      if (publicData?.publicUrl) {
        // Clean up draft
        if (draftAudioBlob) URL.revokeObjectURL(draftAudioBlob);
        setDraftAudioBlob(undefined);
        delete (window as any).__draftAudioBase64;
        
        // Switch to saved state
        setAudioUrl(publicData.publicUrl);
        setAudioResourceId(data.resourceId);
        setSavedScriptHash(currentScriptHash);
        setSavedVersion(data.version);
        setAudioState('saved');
        
        toast({
          title: 'Audio Saved',
          description: 'Audio saved successfully',
        });

        emitSummary({ audio: true });
      } else {
        throw new Error('Failed to get public URL for saved audio');
      }
    } catch (e: any) {
      console.error('Audio save error:', e);
      toast({
        title: 'Error',
        description: e?.message || 'Failed to save audio',
        variant: 'destructive',
      });
    } finally {
      setSavingAudio(false);
    }
  }

  async function clearAudio() {
    if (!window.confirm('Delete this audio recording?')) return;
    
    setSavingAudio(true);
    try {
      // Clean up draft state
      if (draftAudioBlob) {
        URL.revokeObjectURL(draftAudioBlob);
        setDraftAudioBlob(undefined);
      }
      delete (window as any).__draftAudioBase64;
      setDraftMetadata(undefined);
      
      // If saved, delete from DB
      if (audioResourceId) {
        const { error } = await supabase
          .from('pro_move_resources')
          .delete()
          .eq('id', audioResourceId);
        
        if (error) throw error;
      }
      
      // Reset all audio state
      setAudioState('empty');
      setAudioUrl(undefined);
      setAudioResourceId(undefined);
      setSavedScriptHash(undefined);
      setSavedVersion(undefined);
      
      toast({
        title: 'Audio Deleted',
        description: 'Audio recording removed successfully',
      });
      
      emitSummary({ audio: false });
    } catch (e: any) {
      console.error('Clear audio error:', e);
      toast({
        title: 'Error',
        description: e?.message || 'Failed to delete audio',
        variant: 'destructive',
      });
    } finally {
      setSavingAudio(false);
    }
  }

  return (
    <>
      <Sheet 
        open={open} 
        onOpenChange={(next) => {
          if (!next) {
            if (isSaving) return;
            if (isDirty) {
              setShowUnsavedDialog(true);
              return;
            }
          }
          onOpenChange(next);
        }}
      >
      <SheetContent className="sm:max-w-[600px] overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-primary" />
            <SheetTitle>Learning Materials</SheetTitle>
          </div>
          <div className="space-y-2 pt-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Pro Move</p>
              <p className="text-sm font-medium leading-snug">{proMoveTitle}</p>
            </div>
            <Badge 
              variant="secondary"
              style={{ 
                backgroundColor: `${getDomainColor(domainName)}20`,
                color: getDomainColor(domainName),
                borderColor: getDomainColor(domainName)
              }}
              className="border"
            >
              {domainName}
            </Badge>
          </div>
        </SheetHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : (
          <div className="space-y-6 py-6">
            {/* Description Section */}
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <h3 className="font-medium">Description</h3>
              </div>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description of this pro-move..."
                className="min-h-[100px]"
              />
            </section>

            <Separator />

            {/* Video Section */}
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Video className="h-4 w-4 text-muted-foreground" />
                <h3 className="font-medium">Video (YouTube)</h3>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="video-url">YouTube URL</Label>
                <Input
                  id="video-url"
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  placeholder="https://youtube.com/watch?v=..."
                  className={videoError ? 'border-destructive' : ''}
                />
                {videoError && <p className="text-sm text-destructive">{videoError}</p>}
              </div>

              {videoId && <YouTubePreview videoId={videoId} />}

              {videoResourceId && (
                <Button
                  type="button"
                  onClick={removeVideo}
                  variant="outline"
                  size="sm"
                  disabled={isSaving}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Remove Video
                </Button>
              )}
            </section>

            <Separator />

            {/* Script Section */}
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <h3 className="font-medium">Script</h3>
              </div>
              
              <p className="text-xs text-muted-foreground italic">
                Please check spelling and grammar before saving.
              </p>
              
              <Textarea
                value={script}
                onChange={(e) => setScript(e.target.value)}
                placeholder="Add script content here..."
                className="min-h-[200px] font-mono text-sm"
              />

              {scriptResourceId && script && (
                <Button
                  type="button"
                  onClick={async () => {
                    setIsSaving(true);
                    try {
                      setScript('');
                      await saveScriptInternal();
                      setInitialSnap(JSON.stringify({ description, videoUrl, script: '', links, audio: audioUrl }));
                      toast({
                        title: 'Success',
                        description: 'Script cleared',
                      });
                    } catch (error) {
                      toast({
                        title: 'Error',
                        description: 'Failed to clear script',
                        variant: 'destructive',
                      });
                    } finally {
                      setIsSaving(false);
                    }
                  }}
                  variant="outline"
                  size="sm"
                  disabled={isSaving}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Clear Script
                </Button>
              )}
            </section>

            <Separator />

            {/* Audio Section */}
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Volume2 className="h-4 w-4 text-muted-foreground" />
                <h3 className="font-medium">Audio Narration</h3>
              </div>
              
              <div className="space-y-3">
                {/* Voice selection - always visible */}
                <div className="space-y-2">
                  <Label htmlFor="voice-select">Voice</Label>
                  <Select value={voiceName} onValueChange={setVoiceName} disabled={generatingAudio || savingAudio}>
                    <SelectTrigger id="voice-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Ava Song">Ava Song (Warm, Clear)</SelectItem>
                      <SelectItem value="Kora">Kora (Professional)</SelectItem>
                      <SelectItem value="Dacher">Dacher (Authoritative)</SelectItem>
                      <SelectItem value="Stella">Stella (Friendly)</SelectItem>
                      <SelectItem value="Whimsy">Whimsy (Energetic)</SelectItem>
                      <SelectItem value="Jessica">Jessica</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tone-preset">Tone & Style</Label>
                  <Select value={tonePreset} onValueChange={setTonePreset} disabled={generatingAudio || savingAudio}>
                    <SelectTrigger id="tone-preset">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-background">
                      {TONE_PRESETS.map(preset => (
                        <SelectItem key={preset.name} value={preset.name}>
                          <div className="flex flex-col gap-0.5 py-1">
                            <span className="font-medium">{preset.name}</span>
                            <span className="text-xs text-muted-foreground italic">{preset.description}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Audio preview */}
                {(audioState === 'draft' && draftAudioBlob) && (
                  <div className="space-y-2">
                    <Label>Preview Draft</Label>
                    <audio 
                      controls 
                      preload="metadata" 
                      src={draftAudioBlob}
                      className="w-full"
                    />
                  </div>
                )}
                
                {(audioState === 'saved' && audioUrl) && (
                  <div className="space-y-2">
                    <Label>Saved Audio</Label>
                    <audio 
                      controls 
                      preload="metadata" 
                      src={audioUrl}
                      className="w-full"
                    />
                  </div>
                )}

                {/* Controls */}
                <div className="flex gap-2 flex-wrap">
                  <Button
                    type="button"
                    onClick={generateAudio}
                    size="sm"
                    variant={hasAudio ? "outline" : "default"}
                    disabled={generatingAudio || savingAudio || !script}
                  >
                    {generatingAudio ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Volume2 className="h-4 w-4 mr-1" />
                        Generate
                      </>
                    )}
                  </Button>
                  
                  {hasAudio && (
                    <Button
                      type="button"
                      onClick={clearAudio}
                      variant="outline"
                      size="sm"
                      disabled={generatingAudio || savingAudio}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Clear
                    </Button>
                  )}
                </div>

                {!script && (
                  <p className="text-xs text-muted-foreground">
                    Add a script above to generate audio
                  </p>
                )}
              </div>
            </section>

            <Separator />

            {/* Links Section */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <LinkIcon className="h-4 w-4 text-muted-foreground" />
                  <h3 className="font-medium">Additional Links</h3>
                </div>
                <Button onClick={handleAddLink} size="sm" variant="outline">
                  <Plus className="h-4 w-4 mr-1" />
                  Add Link
                </Button>
              </div>

              {showLinkEditor && (
                <LinkEditor
                  link={editingLink || undefined}
                  onSave={handleSaveLink}
                  onCancel={() => {
                    setShowLinkEditor(false);
                    setEditingLink(null);
                  }}
                />
              )}

              <DraggableList
                items={links}
                onReorder={handleReorderLinks}
                onEdit={handleEditLink}
                onDelete={handleDeleteLink}
                renderItem={(link) => (
                  <div className="min-w-0">
                    {link.title && (
                      <p className="font-medium text-sm truncate">{link.title}</p>
                    )}
                    <p className="text-xs text-muted-foreground truncate">{link.url}</p>
                  </div>
                )}
              />
            </section>
          </div>
        )}

        <SheetFooter className="flex-row justify-end gap-2">
          <Button onClick={() => onOpenChange(false)} variant="outline" disabled={isSaving}>
            Close
          </Button>
          <Button onClick={saveAll} disabled={isSaving || !isDirty}>
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              'Save'
            )}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>

    <AlertDialog open={showUnsavedDialog} onOpenChange={setShowUnsavedDialog}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
          <AlertDialogDescription>
            You have unsaved changes. If you close now, your changes will be lost.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep Editing</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              setShowUnsavedDialog(false);
              onOpenChange(false);
            }}
          >
            Discard Changes
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>
  );
}
