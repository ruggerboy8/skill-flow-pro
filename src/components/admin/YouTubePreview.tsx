interface YouTubePreviewProps {
  videoId: string;
}

export function YouTubePreview({ videoId }: YouTubePreviewProps) {
  return (
    <div className="relative w-full pt-[56.25%] bg-muted rounded-lg overflow-hidden">
      <iframe
        className="absolute inset-0 w-full h-full"
        src={`https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1&playsinline=1`}
        title="YouTube video preview"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    </div>
  );
}
