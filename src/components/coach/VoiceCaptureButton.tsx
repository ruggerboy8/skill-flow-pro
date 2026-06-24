import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Mic, Square, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAudioRecording } from "@/hooks/useAudioRecording";
import { useToast } from "@/hooks/use-toast";

interface VoiceCaptureButtonProps {
  /** Called with the transcribed text when a clip finishes transcribing. */
  onTranscript: (text: string) => void;
  disabled?: boolean;
}

/**
 * Records a single short take and transcribes it via the existing
 * transcribe-audio function. Per the transcription spike, the per-domain
 * capture uses short single-take clips (no pause, no segmentation), which
 * sidesteps the webm corruption that plagued the long-take recorder.
 */
export function VoiceCaptureButton({ onTranscript, disabled }: VoiceCaptureButtonProps) {
  const { state, controls } = useAudioRecording();
  const [transcribing, setTranscribing] = useState(false);
  const { toast } = useToast();

  async function handleStop() {
    const blob = await controls.stopAndGetBlob();
    if (!blob) return;
    setTranscribing(true);
    try {
      const fd = new FormData();
      fd.append("audio", blob, "clip.webm");
      const { data, error } = await supabase.functions.invoke("transcribe-audio", { body: fd });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      const transcript = (data?.transcript || "").trim();
      if (transcript) {
        onTranscript(transcript);
      } else {
        toast({ title: "Nothing transcribed", description: "The clip was empty or too short." });
      }
    } catch (e) {
      toast({
        title: "Transcription failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setTranscribing(false);
    }
  }

  if (transcribing) {
    return (
      <Button type="button" size="sm" variant="ghost" disabled>
        <Loader2 className="h-4 w-4 mr-1 animate-spin" /> Transcribing
      </Button>
    );
  }

  if (state.isRecording) {
    return (
      <Button type="button" size="sm" variant="destructive" onClick={handleStop}>
        <Square className="h-4 w-4 mr-1" /> Stop ({state.recordingTime}s)
      </Button>
    );
  }

  return (
    <Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={() => controls.startRecording()}>
      <Mic className="h-4 w-4 mr-1" /> Record
    </Button>
  );
}
