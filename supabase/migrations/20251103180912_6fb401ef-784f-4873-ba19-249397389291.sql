-- Create reminder_templates table
CREATE TABLE IF NOT EXISTS public.reminder_templates (
  key text PRIMARY KEY,
  subject text NOT NULL,
  body text NOT NULL,
  updated_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create reminder_log table
CREATE TABLE IF NOT EXISTS public.reminder_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_user_id uuid NOT NULL REFERENCES auth.users(id),
  target_user_id uuid NOT NULL REFERENCES auth.users(id),
  type text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_reminder_log_sender ON public.reminder_log(sender_user_id);
CREATE INDEX IF NOT EXISTS idx_reminder_log_target ON public.reminder_log(target_user_id);
CREATE INDEX IF NOT EXISTS idx_reminder_log_sent_at ON public.reminder_log(sent_at);

-- Enable RLS
ALTER TABLE public.reminder_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminder_log ENABLE ROW LEVEL SECURITY;

-- RLS policies for reminder_templates
CREATE POLICY "Coaches can read templates"
  ON public.reminder_templates
  FOR SELECT
  TO authenticated
  USING (is_coach_or_admin(auth.uid()));

CREATE POLICY "Super admins can update templates"
  ON public.reminder_templates
  FOR ALL
  TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

-- RLS policies for reminder_log
CREATE POLICY "Coaches can read reminder logs"
  ON public.reminder_log
  FOR SELECT
  TO authenticated
  USING (is_coach_or_admin(auth.uid()));

CREATE POLICY "Authenticated users can insert their own logs"
  ON public.reminder_log
  FOR INSERT
  TO authenticated
  WITH CHECK (sender_user_id = auth.uid());

-- Seed default templates
INSERT INTO public.reminder_templates (key, subject, body) VALUES
  ('confidence', 'Quick reminder: confidence check-in', 'Hi {{first_name}},

Your confidence check-in for {{week_label}} is still outstanding. Please complete when you''re next on shift.

Thanks,
{{coach_name}}'),
  ('performance', 'Quick reminder: performance check-out', 'Hi {{first_name}},

Your performance check-out for {{week_label}} is still outstanding. Please complete when you''re next on shift.

Thanks,
{{coach_name}}')
ON CONFLICT (key) DO NOTHING;