import { Badge } from '@/components/ui/badge';
import { getDomainColor } from '@/lib/domainColors';
import { cn } from '@/lib/utils';

interface DomainBadgeProps {
  domain: string | null | undefined;
  className?: string;
}

/**
 * Global domain pill with solid background color and black text.
 * Use this everywhere a domain name is shown as a badge/pill.
 */
export function DomainBadge({ domain, className }: DomainBadgeProps) {
  if (!domain) return null;

  return (
    <Badge
      variant="outline"
      className={cn(
        'shrink-0 text-xs font-medium border-transparent text-foreground',
        className
      )}
      style={{ backgroundColor: getDomainColor(domain) }}
    >
      {domain}
    </Badge>
  );
}
