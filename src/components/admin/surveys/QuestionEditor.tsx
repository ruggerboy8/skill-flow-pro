import { Trash2, GripVertical, Plus, ChevronUp, ChevronDown } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  QUESTION_TYPE_LABELS,
  type SurveyQuestionType,
} from '@/integrations/supabase/surveyTypes';
import type { DraftQuestion } from '@/hooks/useSurveys';

interface Props {
  question: DraftQuestion;
  index: number;
  total: number;
  onChange: (q: DraftQuestion) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}

export function QuestionEditor({ question, index, total, onChange, onRemove, onMove }: Props) {
  const setType = (type: SurveyQuestionType) => {
    // Reset config to sensible defaults per type.
    if (type === 'rating') {
      onChange({ ...question, type, config: { min: 0, max: 10, minLabel: '', maxLabel: '' } });
    } else if (type === 'single_choice' || type === 'multi_choice') {
      const choices = question.config.choices?.length ? question.config.choices : ['', ''];
      onChange({ ...question, type, config: { choices } });
    } else {
      onChange({ ...question, type, config: {} });
    }
  };

  const choices = question.config.choices ?? [];
  const setChoice = (i: number, val: string) => {
    const next = [...choices];
    next[i] = val;
    onChange({ ...question, config: { ...question.config, choices: next } });
  };
  const addChoice = () =>
    onChange({ ...question, config: { ...question.config, choices: [...choices, ''] } });
  const removeChoice = (i: number) =>
    onChange({
      ...question,
      config: { ...question.config, choices: choices.filter((_, ci) => ci !== i) },
    });

  const isChoice = question.type === 'single_choice' || question.type === 'multi_choice';

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start gap-2">
          <GripVertical className="mt-2.5 h-4 w-4 shrink-0 text-muted-foreground/50" />
          <div className="flex-1 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-muted-foreground">Q{index + 1}</span>
              <div className="ml-auto flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  disabled={index === 0}
                  onClick={() => onMove(-1)}
                >
                  <ChevronUp className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  disabled={index === total - 1}
                  onClick={() => onMove(1)}
                >
                  <ChevronDown className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive"
                  onClick={onRemove}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <Input
              placeholder="Question prompt"
              value={question.prompt}
              onChange={(e) => onChange({ ...question, prompt: e.target.value })}
            />

            <div className="flex flex-wrap items-center gap-4">
              <div className="w-64">
                <Select value={question.type} onValueChange={(v) => setType(v as SurveyQuestionType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(QUESTION_TYPE_LABELS) as SurveyQuestionType[]).map((t) => (
                      <SelectItem key={t} value={t}>
                        {QUESTION_TYPE_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id={`req-${index}`}
                  checked={question.required}
                  onCheckedChange={(v) => onChange({ ...question, required: v })}
                />
                <Label htmlFor={`req-${index}`} className="text-sm">
                  Required
                </Label>
              </div>
            </div>

            {/* Choice options */}
            {isChoice && (
              <div className="space-y-2 rounded-md border border-dashed p-3">
                <Label className="text-xs text-muted-foreground">Options</Label>
                {choices.map((c, ci) => (
                  <div key={ci} className="flex items-center gap-2">
                    <Input
                      placeholder={`Option ${ci + 1}`}
                      value={c}
                      onChange={(e) => setChoice(ci, e.target.value)}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground"
                      disabled={choices.length <= 2}
                      onClick={() => removeChoice(ci)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={addChoice}>
                  <Plus className="h-3.5 w-3.5 mr-1.5" /> Add option
                </Button>
              </div>
            )}

            {/* Rating config */}
            {question.type === 'rating' && (
              <div className="grid grid-cols-2 gap-3 rounded-md border border-dashed p-3 sm:grid-cols-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Min</Label>
                  <Input
                    type="number"
                    value={question.config.min ?? 0}
                    onChange={(e) =>
                      onChange({ ...question, config: { ...question.config, min: Number(e.target.value) } })
                    }
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Max</Label>
                  <Input
                    type="number"
                    value={question.config.max ?? 10}
                    onChange={(e) =>
                      onChange({ ...question, config: { ...question.config, max: Number(e.target.value) } })
                    }
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Low label</Label>
                  <Input
                    placeholder="e.g. Not likely"
                    value={question.config.minLabel ?? ''}
                    onChange={(e) =>
                      onChange({ ...question, config: { ...question.config, minLabel: e.target.value } })
                    }
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">High label</Label>
                  <Input
                    placeholder="e.g. Very likely"
                    value={question.config.maxLabel ?? ''}
                    onChange={(e) =>
                      onChange({ ...question, config: { ...question.config, maxLabel: e.target.value } })
                    }
                  />
                </div>
                {question.config.min === 0 && question.config.max === 10 && (
                  <p className="col-span-full text-2xs text-muted-foreground">
                    0–10 scale — results will also report an NPS score.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
