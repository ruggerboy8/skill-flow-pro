-- Add missing foreign key relationship between competencies and domains
ALTER TABLE public.competencies 
ADD CONSTRAINT competencies_domain_id_fkey 
FOREIGN KEY (domain_id) REFERENCES public.domains(domain_id);