-- Create user_backlog table to track incomplete site moves
CREATE TABLE public.user_backlog (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  pro_move_id BIGINT NOT NULL,
  added_week_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
  resolved_week_id UUID NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Prevent duplicate open backlog items for same user/pro_move
  CONSTRAINT unique_open_backlog UNIQUE (user_id, pro_move_id, status) 
    DEFERRABLE INITIALLY DEFERRED
);

-- Create weekly_self_select table for better UX persistence
CREATE TABLE public.weekly_self_select (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  weekly_focus_id UUID NOT NULL,
  slot_index INTEGER NOT NULL,
  selected_pro_move_id BIGINT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'backlog')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- One selection per user per weekly_focus slot
  CONSTRAINT unique_user_weekly_slot UNIQUE (user_id, weekly_focus_id, slot_index)
);

-- Enable RLS
ALTER TABLE public.user_backlog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_self_select ENABLE ROW LEVEL SECURITY;

-- RLS policies for user_backlog
CREATE POLICY "Users can view their own backlog" 
ON public.user_backlog 
FOR SELECT 
USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own backlog" 
ON public.user_backlog 
FOR INSERT 
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own backlog" 
ON public.user_backlog 
FOR UPDATE 
USING (user_id = auth.uid());

CREATE POLICY "Coaches can view all backlogs" 
ON public.user_backlog 
FOR SELECT 
USING (is_coach_or_admin(auth.uid()));

-- RLS policies for weekly_self_select
CREATE POLICY "Users can manage their own selections" 
ON public.weekly_self_select 
FOR ALL 
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Coaches can view all selections" 
ON public.weekly_self_select 
FOR SELECT 
USING (is_coach_or_admin(auth.uid()));

-- Add indexes for performance
CREATE INDEX idx_user_backlog_user_status ON public.user_backlog (user_id, status);
CREATE INDEX idx_user_backlog_added_week ON public.user_backlog (added_week_id);
CREATE INDEX idx_weekly_self_select_user_focus ON public.weekly_self_select (user_id, weekly_focus_id);

-- Create function to update timestamps on weekly_self_select
CREATE OR REPLACE FUNCTION public.update_weekly_self_select_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_weekly_self_select_updated_at
BEFORE UPDATE ON public.weekly_self_select
FOR EACH ROW
EXECUTE FUNCTION public.update_weekly_self_select_timestamp();