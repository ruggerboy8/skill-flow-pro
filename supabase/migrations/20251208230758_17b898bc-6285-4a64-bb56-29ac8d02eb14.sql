-- Add tagline column to competencies table
ALTER TABLE public.competencies
ADD COLUMN tagline text;

-- Update DFI competencies (role_id = 1)
UPDATE public.competencies SET tagline = 'Keep the lobby flowing' WHERE name = 'Patient Flow Coordination' AND role_id = 1;
UPDATE public.competencies SET tagline = 'Tell the back right away' WHERE name = 'Clinical Team Communication' AND role_id = 1;
UPDATE public.competencies SET tagline = 'Fill the schedule' WHERE name = 'Daily Schedule Adaptability' AND role_id = 1;
UPDATE public.competencies SET tagline = 'Know your dental codes and procedures' WHERE name = 'Fundamental Dental Knowledge' AND role_id = 1;
UPDATE public.competencies SET tagline = 'Perfect patient data' WHERE name = 'Patient Record Maintenance' AND role_id = 1;
UPDATE public.competencies SET tagline = 'Nothing falls through the cracks' WHERE name = 'Communication Balancing' AND role_id = 1;
UPDATE public.competencies SET tagline = 'Full schedule, no cancellations' WHERE name = 'Strategic Scheduling' AND role_id = 1;
UPDATE public.competencies SET tagline = 'Reception always ready' WHERE name = 'Welcoming Environment' AND role_id = 1;
UPDATE public.competencies SET tagline = 'Unreasonable hospitality' WHERE name = 'Welcoming Presence' AND role_id = 1;
UPDATE public.competencies SET tagline = 'Strict policies delivered with a soft hand' WHERE name = 'Empathetic Practice Policy Education' AND role_id = 1;
UPDATE public.competencies SET tagline = 'Our patients are our friends' WHERE name = 'Trust Building Interactions' AND role_id = 1;
UPDATE public.competencies SET tagline = 'Defuse & improve' WHERE name = 'Handling Critical Feedback' AND role_id = 1;
UPDATE public.competencies SET tagline = 'ABC: Always Be Closing - Adapt and overcome' WHERE name = 'Effective Objection Handling' AND role_id = 1;
UPDATE public.competencies SET tagline = 'Explain or escalate' WHERE name = 'Treatment Communication' AND role_id = 1;
UPDATE public.competencies SET tagline = 'Make sure they know we are the best' WHERE name = 'Establishing Credibility' AND role_id = 1;
UPDATE public.competencies SET tagline = 'Creating Magic - make it a magical experience' WHERE name = 'Facilitating Smooth Processes' AND role_id = 1;

-- Update RDA competencies (role_id = 2)
UPDATE public.competencies SET tagline = 'Room ready, gear clean' WHERE name = 'Sterilization and Procedure Preparation' AND role_id = 2;
UPDATE public.competencies SET tagline = 'Procedures on point' WHERE name = 'Mastery of Dental Procedures' AND role_id = 2;
UPDATE public.competencies SET tagline = 'Chart like a pro' WHERE name = 'Accurate Charting' AND role_id = 2;
UPDATE public.competencies SET tagline = 'Keep patient calm' WHERE name = 'Patient Comfort and Communication During Procedures' AND role_id = 2;
UPDATE public.competencies SET tagline = 'Stock & fix stuff' WHERE name = 'Office Task Management' AND role_id = 2;
UPDATE public.competencies SET tagline = 'Move ''em smoothly' WHERE name = 'Coordinating Patient Flow' AND role_id = 2;
UPDATE public.competencies SET tagline = 'Records airtight' WHERE name = 'Patient Record Management' AND role_id = 2;
UPDATE public.competencies SET tagline = 'Paperwork done right' WHERE name = 'Clerical Procedure Requirements' AND role_id = 2;
UPDATE public.competencies SET tagline = 'Rules with care' WHERE name = 'Empathetic Practice Policy Education' AND role_id = 2;
UPDATE public.competencies SET tagline = 'EQ on display' WHERE name = 'Demonstrating Emotional Intelligence' AND role_id = 2;
UPDATE public.competencies SET tagline = 'Earn their trust' WHERE name = 'Trust Building Interactions' AND role_id = 2;
UPDATE public.competencies SET tagline = 'Turn complaints into wins' WHERE name = 'Handling Constructive Feedback' AND role_id = 2;
UPDATE public.competencies SET tagline = 'Overcome "no"' WHERE name = 'Effective Objection Handling' AND role_id = 2;
UPDATE public.competencies SET tagline = 'Explain in plain talk' WHERE name = 'Clear Treatment Communication' AND role_id = 2;
UPDATE public.competencies SET tagline = 'Show we''re experts' WHERE name = 'Establishing Credibility' AND role_id = 2;
UPDATE public.competencies SET tagline = 'Help them choose care' WHERE name = 'Empowering Informed Decisions' AND role_id = 2;