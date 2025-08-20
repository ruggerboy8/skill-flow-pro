-- Create evaluations table
CREATE TABLE public.evaluations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  staff_id uuid NOT NULL,
  role_id bigint NOT NULL,
  location_id uuid NOT NULL,
  type text NOT NULL DEFAULT 'quarterly',
  program_year integer NOT NULL,
  quarter text NOT NULL CHECK (quarter IN ('Q1', 'Q2', 'Q3', 'Q4')),
  evaluator_id uuid NOT NULL,
  observed_at timestamp with time zone,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted')),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(staff_id, program_year, quarter, type)
);

-- Create evaluation_items table
CREATE TABLE public.evaluation_items (
  evaluation_id uuid NOT NULL REFERENCES public.evaluations(id) ON DELETE CASCADE,
  competency_id bigint NOT NULL,
  competency_name_snapshot text NOT NULL,
  observer_score integer CHECK (observer_score >= 1 AND observer_score <= 4),
  observer_note text,
  self_score integer CHECK (self_score >= 1 AND self_score <= 4),
  self_note text,
  PRIMARY KEY (evaluation_id, competency_id)
);

-- Enable RLS on both tables
ALTER TABLE public.evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluation_items ENABLE ROW LEVEL SECURITY;

-- RLS policies for evaluations
CREATE POLICY "Coaches can manage evaluations"
ON public.evaluations
FOR ALL
USING (is_coach_or_admin(auth.uid()))
WITH CHECK (is_coach_or_admin(auth.uid()));

-- RLS policies for evaluation_items
CREATE POLICY "Coaches can manage evaluation items"
ON public.evaluation_items
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.evaluations e
    WHERE e.id = evaluation_items.evaluation_id
    AND is_coach_or_admin(auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.evaluations e
    WHERE e.id = evaluation_items.evaluation_id
    AND is_coach_or_admin(auth.uid())
  )
);

-- Create trigger for updating updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_evaluations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_evaluations_updated_at
  BEFORE UPDATE ON public.evaluations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_evaluations_updated_at();