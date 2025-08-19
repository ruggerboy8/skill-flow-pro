-- Add explicit foreign key constraints to ensure Supabase recognizes the relationships

-- Add foreign key constraint from pro_moves to roles
ALTER TABLE public.pro_moves 
DROP CONSTRAINT IF EXISTS fk_pro_moves_role_id;

ALTER TABLE public.pro_moves 
ADD CONSTRAINT fk_pro_moves_role_id 
FOREIGN KEY (role_id) REFERENCES public.roles(role_id);

-- Add foreign key constraint from pro_moves to competencies  
ALTER TABLE public.pro_moves 
DROP CONSTRAINT IF EXISTS fk_pro_moves_competency_id;

ALTER TABLE public.pro_moves 
ADD CONSTRAINT fk_pro_moves_competency_id 
FOREIGN KEY (competency_id) REFERENCES public.competencies(competency_id);

-- Add foreign key constraint from competencies to roles
ALTER TABLE public.competencies 
DROP CONSTRAINT IF EXISTS fk_competencies_role_id;

ALTER TABLE public.competencies 
ADD CONSTRAINT fk_competencies_role_id 
FOREIGN KEY (role_id) REFERENCES public.roles(role_id);

-- Add foreign key constraint from competencies to domains
ALTER TABLE public.competencies 
DROP CONSTRAINT IF EXISTS fk_competencies_domain_id;

ALTER TABLE public.competencies 
ADD CONSTRAINT fk_competencies_domain_id 
FOREIGN KEY (domain_id) REFERENCES public.domains(domain_id);