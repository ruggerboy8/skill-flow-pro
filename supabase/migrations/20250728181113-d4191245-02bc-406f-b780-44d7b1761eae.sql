-- Add organization and primary_location fields to staff table
ALTER TABLE public.staff 
ADD COLUMN organization text,
ADD COLUMN primary_location text;