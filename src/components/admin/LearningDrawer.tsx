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
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { YouTubePreview } from './YouTubePreview';
import { MarkdownPreview } from './MarkdownPreview';
import { LinkEditor } from './LinkEditor';
import { DraggableList } from './DraggableList';
import { extractYouTubeId, isValidYouTubeUrl } from '@/lib/youtubeHelpers';
import { getDomainColor } from '@/lib/domainColors';

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
  
  // Audio state
  const [audioUrl, setAudioUrl] = useState<string>();
  const [audioResourceId, setAudioResourceId] = useState<string>();
  const [generatingAudio, setGeneratingAudio] = useState(false);
  const [voiceName, setVoiceName] = useState('Ava Song');
  const [actingInstructions, setActingInstructions] = useState('');

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

      // Load audio resource
      const audioRes = resources?.find((r) => r.type === 'audio');
      if (audioRes) {
        setAudioUrl(audioRes.url || '');
        setAudioResourceId(audioRes.id);
        const metadata = audioRes.metadata as any;
        setVoiceName(metadata?.voiceName || 'Ava Song');
      } else {
        setAudioUrl(undefined);
        setAudioResourceId(undefined);
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

  async function saveDescription() {
    setIsSaving(true);
    try {
      await supabase
        .from('pro_moves')
        .update({ description })
        .eq('action_id', actionId);
      
      setInitialSnap(JSON.stringify({ description, videoUrl, script, links, audio: audioUrl }));
      
      toast({
        title: 'Success',
        description: 'Description saved',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to save description',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function saveVideo(nextUrl: string) {
    setVideoError(undefined);
    setIsSaving(true);
    
    try {
      if (!nextUrl.trim()) {
        await removeVideo();
        return;
      }

      const extractedId = extractYouTubeId(nextUrl);
      if (!extractedId) {
        setVideoError('Invalid YouTube URL. Please use a valid YouTube link.');
        return;
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
          })
          .select()
          .single();
        setVideoResourceId(data?.id);
      }

      setVideoUrl(nextUrl);
      setVideoId(extractedId);

      toast({
        title: 'Success',
        description: 'Video saved',
      });

      setInitialSnap(JSON.stringify({ description, videoUrl: nextUrl, script, links, audio: audioUrl }));
      emitSummary({ video: true });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to save video',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function removeVideo() {
    setIsSaving(true);
    try {
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

      toast({
        title: 'Success',
        description: 'Video removed',
      });

      setInitialSnap(JSON.stringify({ description, videoUrl: '', script, links, audio: audioUrl }));
      emitSummary({ video: false });
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

  async function saveScript() {
    setIsSaving(true);
    try {
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
        
        toast({
          title: 'Success',
          description: 'Script removed',
        });
        setInitialSnap(JSON.stringify({ description, videoUrl, script: '', links, audio: audioUrl }));
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
          })
          .select()
          .single();
        
        setScriptResourceId(data?.id);
      }

      setInitialSnap(JSON.stringify({ description, videoUrl, script, links, audio: audioUrl }));

      toast({
        title: 'Success',
        description: 'Script saved',
      });

      emitSummary({ script: true });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to save script',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
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
    try {
      const { data, error } = await supabase.functions.invoke('generate-audio', {
        body: {
          actionId,
          scriptMd: script,
          voiceName,
          actingInstructions: actingInstructions.trim() || undefined
        }
      });

      if (error) throw error;

      setAudioUrl(data.url);
      setAudioResourceId(data.resourceId);
      
      toast({
        title: 'Success',
        description: 'Audio generated successfully',
      });

      emitSummary({ audio: true });
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

  async function deleteAudio() {
    setIsSaving(true);
    try {
      if (audioResourceId) {
        await supabase
          .from('pro_move_resources')
          .delete()
          .eq('id', audioResourceId);
      } else {
        await supabase
          .from('pro_move_resources')
          .delete()
          .eq('action_id', actionId)
          .eq('type', 'audio');
      }

      setAudioUrl(undefined);
      setAudioResourceId(undefined);

      toast({
        title: 'Success',
        description: 'Audio removed',
      });

      emitSummary({ audio: false });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete audio',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Sheet 
      open={open} 
      onOpenChange={(next) => {
        if (!next) {
          if (isSaving) return;
          if (isDirty) {
            if (!window.confirm('Discard unsaved changes?')) return;
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
              <Button type="button" onClick={saveDescription} size="sm">
                Save Description
              </Button>
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

              <div className="flex gap-2">
                <Button type="button" onClick={() => saveVideo(videoUrl)} size="sm" disabled={isSaving}>
                  Save Video
                </Button>
                {videoResourceId && (
                  <Button
                    type="button"
                    onClick={removeVideo}
                    variant="outline"
                    size="sm"
                    disabled={isSaving}
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Remove
                  </Button>
                )}
              </div>
            </section>

            <Separator />

            {/* Script Section */}
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <h3 className="font-medium">Script</h3>
              </div>
              
              <MarkdownPreview value={script} onChange={setScript} />

              <div className="flex gap-2">
                <Button type="button" onClick={saveScript} size="sm" disabled={isSaving}>
                  Save Script
                </Button>
                {scriptResourceId && script && (
                  <Button
                    type="button"
                    onClick={async () => {
                      setScript('');
                      await saveScript();
                    }}
                    variant="outline"
                    size="sm"
                    disabled={isSaving}
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Clear
                  </Button>
                )}
              </div>
            </section>

            <Separator />

            {/* Audio Section */}
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Volume2 className="h-4 w-4 text-muted-foreground" />
                <h3 className="font-medium">Audio Narration</h3>
              </div>
              
              {audioUrl ? (
                <div className="space-y-3">
                  <audio 
                    controls 
                    preload="metadata" 
                    src={audioUrl}
                    className="w-full"
                  />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      onClick={generateAudio}
                      size="sm"
                      variant="outline"
                      disabled={generatingAudio || isSaving || !script}
                    >
                      {generatingAudio ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                          Generating...
                        </>
                      ) : (
                        'Replace Audio'
                      )}
                    </Button>
                    <Button
                      type="button"
                      onClick={deleteAudio}
                      variant="outline"
                      size="sm"
                      disabled={isSaving || generatingAudio}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Delete
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="voice-select">Voice</Label>
                    <Select value={voiceName} onValueChange={setVoiceName}>
                      <SelectTrigger id="voice-select">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Ava Song">Ava Song (Warm, Clear)</SelectItem>
                        <SelectItem value="Kora">Kora (Professional)</SelectItem>
                        <SelectItem value="Dacher">Dacher (Authoritative)</SelectItem>
                        <SelectItem value="Stella">Stella (Friendly)</SelectItem>
                        <SelectItem value="Whimsy">Whimsy (Energetic)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="acting-instructions">Acting Instructions (Optional)</Label>
                    <Input
                      id="acting-instructions"
                      value={actingInstructions}
                      onChange={(e) => setActingInstructions(e.target.value)}
                      placeholder="e.g., enthusiastic, calm, professional"
                    />
                    <p className="text-xs text-muted-foreground">
                      Describe how the voice should sound (tone, energy, mood)
                    </p>
                  </div>

                  <Button
                    type="button"
                    onClick={generateAudio}
                    size="sm"
                    disabled={generatingAudio || isSaving || !script}
                  >
                    {generatingAudio ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        Generating Audio...
                      </>
                    ) : (
                      <>
                        <Volume2 className="h-4 w-4 mr-1" />
                        Generate Audio from Script
                      </>
                    )}
                  </Button>
                  {!script && (
                    <p className="text-xs text-muted-foreground">
                      Add a script above to generate audio
                    </p>
                  )}
                </div>
              )}
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

        <SheetFooter>
          <Button onClick={() => onOpenChange(false)} variant="outline">
            Close
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
