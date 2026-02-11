import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, Eye, MessageSquare } from 'lucide-react';

interface ReflectionSectionProps {
  formatted: string;
  original: string | null;
}

export function ReflectionSection({ formatted, original }: ReflectionSectionProps) {
  const [showOriginal, setShowOriginal] = useState(false);

  return (
    <Card className="border-0 shadow-lg overflow-hidden">
      <Collapsible>
        <CollapsibleTrigger className="w-full">
          <CardHeader className="flex flex-row items-center gap-3 py-4">
            <MessageSquare className="h-5 w-5 text-primary" />
            <CardTitle className="text-base flex-1 text-left">Reflection</CardTitle>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-3">
            <div className="rounded-lg border p-4 bg-muted/30">
              <p className="text-sm whitespace-pre-wrap">
                {showOriginal ? (original || formatted) : formatted}
              </p>
            </div>
            {original && original !== formatted && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowOriginal(!showOriginal)}
                className="text-xs gap-1"
              >
                <Eye className="h-3 w-3" />
                {showOriginal ? 'Show formatted' : 'View original'}
              </Button>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
