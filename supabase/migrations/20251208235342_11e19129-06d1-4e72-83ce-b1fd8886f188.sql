-- Add friendly_description column to competencies table
ALTER TABLE public.competencies 
ADD COLUMN IF NOT EXISTS friendly_description text;

-- Update DFI competencies (role_id = 1)
UPDATE public.competencies SET friendly_description = 'You are the conductor of the front office! By keeping check-ins and check-outs smooth, you ensure every patient feels cared for and no one is left waiting.' WHERE code = 'DFI.CLIN 1';
UPDATE public.competencies SET friendly_description = 'You are the bridge between the front and the back. Passing critical info to the clinical team instantly ensures they are ready to give the best care possible.' WHERE code = 'DFI.CLIN 2';
UPDATE public.competencies SET friendly_description = 'Schedules change, but you stay cool! Your ability to adapt to cancellations and walk-ins keeps the team productive and ensures patients get seen.' WHERE code = 'DFI.CLIN 3';
UPDATE public.competencies SET friendly_description = 'You speak the language of dentistry. Knowing your codes and procedures builds confidence with patients and makes you a huge asset to the clinical team.' WHERE code = 'DFI.CLIN 4';

UPDATE public.competencies SET friendly_description = 'Great care starts with great data. Your meticulous attention to patient records ensures nothing gets missed and every visit is safe and seamless.' WHERE code = 'DFI.CLER 1';
UPDATE public.competencies SET friendly_description = 'You are the master of multitasking. Balancing phones, emails, and smiles means every patient feels heard and the practice never misses a beat.' WHERE code = 'DFI.CLER 2';
UPDATE public.competencies SET friendly_description = 'You don''t just fill slots; you orchestrate the day. A strategically built schedule maximizes our impact and ensures the team works efficiently.' WHERE code = 'DFI.CLER 3';
UPDATE public.competencies SET friendly_description = 'First impressions happen here. By keeping the reception area welcoming and organized, you tell every patient, "We care about excellence."' WHERE code = 'DFI.CLER 4';

UPDATE public.competencies SET friendly_description = 'You are the warmth of the practice. Your calm, welcoming presence can turn a nervous patient into a relaxed one the moment they walk in.' WHERE code = 'DFI.CUL 1';
UPDATE public.competencies SET friendly_description = 'You handle tough conversations with grace. Educating patients on policies without losing the connection is a superpower that builds long-term respect.' WHERE code = 'DFI.CUL 2';
UPDATE public.competencies SET friendly_description = 'You make people feel known, not just treated. Remembering the little details builds a bond that turns patients into raving fans.' WHERE code = 'DFI.CUL 3';
UPDATE public.competencies SET friendly_description = 'Feedback is an opportunity, and you handle it like a pro. Turning a complaint into a solution shows maturity and deep care for the patient experience.' WHERE code = 'DFI.CUL 4';

UPDATE public.competencies SET friendly_description = 'You are a champion for their health. When you help a patient overcome hesitation, you aren''t just filling a slot—you''re ensuring they get the care they need.' WHERE code = 'DFI.CASE 1';
UPDATE public.competencies SET friendly_description = 'You clarify the complex. Answering questions with confidence (or knowing when to grab the doctor) empowers patients to move forward with trust.' WHERE code = 'DFI.CASE 2';
UPDATE public.competencies SET friendly_description = 'You are the team''s biggest fan. When you highlight our doctors'' expertise, you give patients the peace of mind that they are in the best hands.' WHERE code = 'DFI.CASE 3';
UPDATE public.competencies SET friendly_description = 'You make the logistics invisible. By handling the paperwork and details effortlessly, you let the patient focus entirely on their health and happiness.' WHERE code = 'DFI.CASE 4';

-- Update RDA competencies (role_id = 2)
UPDATE public.competencies SET friendly_description = 'Safety starts with you. By maintaining a pristine clinical environment, you protect every patient and set the stage for flawless procedures.' WHERE code = 'RDA.CLIN 1';
UPDATE public.competencies SET friendly_description = 'You are the dentist''s right hand. Executing procedures with precision and anticipating needs makes the appointment smoother for everyone.' WHERE code = 'RDA.CLIN 2';
UPDATE public.competencies SET friendly_description = 'You write the history of their care. Accurate, professional charting ensures that every future decision is based on the full picture.' WHERE code = 'RDA.CLIN 3';
UPDATE public.competencies SET friendly_description = 'You are the patient''s advocate in the chair. Monitoring their comfort and easing their fears turns a scary appointment into a safe one.' WHERE code = 'RDA.CLIN 4';

UPDATE public.competencies SET friendly_description = 'A great practice runs on details. Managing inventory and equipment behind the scenes guarantees the clinical team never has to hit pause.' WHERE code = 'RDA.CLER 1';
UPDATE public.competencies SET friendly_description = 'You keep the rhythm of the back office going. Coordinating with the front desk minimizes wait times and respects everyone''s schedule.' WHERE code = 'RDA.CLER 2';
UPDATE public.competencies SET friendly_description = 'Accuracy is your hallmark. Maintaining airtight patient records protects the practice and ensures the highest standard of care continuity.' WHERE code = 'RDA.CLER 3';
UPDATE public.competencies SET friendly_description = 'You close the loop on care. Handling consents and follow-ups promptly means the patient''s journey is complete and compliant.' WHERE code = 'RDA.CLER 4';

UPDATE public.competencies SET friendly_description = 'You guide patients with kindness. Helping them understand our policies prevents frustration and keeps the relationship positive.' WHERE code = 'RDA.CUL 1';
UPDATE public.competencies SET friendly_description = 'You read the room perfectly. Managing emotions—yours and theirs—creates a supportive atmosphere where everyone feels safe.' WHERE code = 'RDA.CUL 2';
UPDATE public.competencies SET friendly_description = 'You are the face of care. Remembering personal details and treating patients like friends builds a trust that keeps them coming back.' WHERE code = 'RDA.CUL 3';
UPDATE public.competencies SET friendly_description = 'You listen to understand. Responding to concerns with calm professionalism turns a moment of friction into a moment of connection.' WHERE code = 'RDA.CUL 4';

UPDATE public.competencies SET friendly_description = 'You help them see the value. When you gently address a concern about treatment, you act as a partner in their long-term health.' WHERE code = 'RDA.CASE 1';
UPDATE public.competencies SET friendly_description = 'You make the complex simple. Explaining treatment in plain language removes fear and empowers patients to take ownership of their smile.' WHERE code = 'RDA.CASE 2';
UPDATE public.competencies SET friendly_description = 'You validate their choice. Reminding patients of the team''s expertise reassures them that they are receiving world-class care.' WHERE code = 'RDA.CASE 3';
UPDATE public.competencies SET friendly_description = 'You empower action. By clearly outlining the "why" behind the treatment, you help patients make the best decision for their future without feeling pressured.' WHERE code = 'RDA.CASE 4';