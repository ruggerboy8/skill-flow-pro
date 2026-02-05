// Doctor-specific role content (separate from staff roles)
export interface DoctorDomainContent {
  description: string;
  valueProp: string;
}

export const DOCTOR_ROLE_CONTENT: Record<string, DoctorDomainContent> = {
  'Clinical': {
    description: 'Excellence in examination, diagnosis, treatment planning, and clinical documentation.',
    valueProp: 'Accurate charting and clear communication create the foundation for exceptional patient care.'
  }
  // Additional domains will be added as doctor pro moves expand
};

// Doctor domains in display order
export const DOCTOR_DOMAIN_ORDER = ['Clinical'] as const;
