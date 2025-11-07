import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

export function RecommenderGlossary() {
  return (
    <Accordion type="single" collapsible className="w-full">
      <AccordionItem value="glossary" className="border-none">
        <AccordionTrigger className="text-xs text-muted-foreground hover:no-underline py-2">
          What these mean
        </AccordionTrigger>
        <AccordionContent className="text-xs space-y-2 text-muted-foreground">
          <div>
            <span className="font-medium text-foreground">% at 1–2:</span> Share of recent scores that were marked 1 or 2.
          </div>
          <div>
            <span className="font-medium text-foreground">Avg confidence (last time):</span> Typical score the last time we assessed this move.
          </div>
          <div>
            <span className="font-medium text-foreground">Last practiced:</span> How long since we trained this move.
          </div>
          <div>
            <span className="font-medium text-foreground">Retest due:</span> We recently scheduled this because confidence was low; check if it improved.
          </div>
          <div>
            <span className="font-medium text-foreground">Need score:</span> Overall priority (0-100). Higher = more urgent.
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
