// Doctor-specific role content (separate from staff roles)
export interface DoctorDomainContent {
  description: string;
  valueProp: string;
}

export const DOCTOR_ROLE_CONTENT: Record<string, DoctorDomainContent> = {
  'Clinical': {
    description: 'Excellence in examination, diagnosis, treatment planning, and clinical documentation.',
    valueProp: 'Accurate charting and clear communication create the foundation for exceptional patient care.'
  },
  'Clerical': {
    description: 'Timely documentation, referrals, and follow-through that keep care on track.',
    valueProp: 'Completing tasks at the chair prevents delays and builds trust with families and your team.'
  },
  'Cultural': {
    description: 'Professional presence, team partnership, and empathetic family communication.',
    valueProp: 'Your calm, aligned presence sets the tone for every patient visit and team interaction.'
  },
  'Case Acceptance': {
    description: 'Values-first discovery, clear treatment options, and predictable care experiences.',
    valueProp: 'When families feel heard and informed, they move forward with confidence in their care decisions.'
  }
};

// Doctor domains in display order
export const DOCTOR_DOMAIN_ORDER = ['Clinical', 'Clerical', 'Cultural', 'Case Acceptance'] as const;
