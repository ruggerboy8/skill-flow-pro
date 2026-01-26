export type RoleType = 'DFI' | 'RDA' | 'OM';

export interface DomainContent {
  description: string;
  valueProp: string;
}

export const ROLE_CONTENT: Record<RoleType, Record<string, DomainContent>> = {
  DFI: {
    'Clinical': {
      description: 'Managing patient flow, communicating vital information to the clinical team, responding to daily scheduling changes, and possessing essential knowledge of dental procedures.',
      valueProp: 'Contributes directly to positive patient outcomes by effectively bridging the front and back office.'
    },
    'Clerical': {
      description: 'Skillfully handling administrative duties, from managing patient records and coordinating insurance details to mastering the scheduling system.',
      valueProp: 'Your organizational skills and attention to detail contribute to the smooth, accurate, and efficient operation of the practice.'
    },
    'Cultural': {
      description: 'Creating a welcoming, trust-filled atmosphere through empathetic communication.',
      valueProp: 'Reflects the practice\'s core values and sets a positive tone for every patient visit.'
    },
    'Case Acceptance': {
      description: 'Skillfully addressing patient objections, clearly explaining treatment options, and establishing practice credibility.',
      valueProp: 'Empowers patients to make informed decisions about their health.'
    }
  },
  RDA: {
    'Clinical': {
      description: 'Ensuring proper sterilization, mastering dental procedures, accurately charting information, and maintaining effective communication during treatment.',
      valueProp: 'By continuously centering the patient\'s experience and comfort, you directly contribute to high-quality care and clinical outcomes.'
    },
    'Clerical': {
      description: 'Efficiently managing office tasks, coordinating patient flow seamlessly, and maintaining accurate patient records.',
      valueProp: 'Ensures all clerical requirements for procedures are met accurately and promptly.'
    },
    'Cultural': {
      description: 'Communicating practice policies with empathy, demonstrating high emotional intelligence, and building genuine connections with patients.',
      valueProp: 'Fosters trust and allows you to respond to feedback calmly and professionally.'
    },
    'Case Acceptance': {
      description: 'Addressing patient objections to treatment, clearly explaining plans, and establishing the dental team\'s credibility.',
      valueProp: 'Empowers patients to make informed decisions without feeling pressured.'
    }
  },
  OM: {
    'Clinical': {
      description: 'Understanding clinical workflows, supporting procedure scheduling, and ensuring patient care coordination across the practice.',
      valueProp: 'Your oversight ensures clinical operations run smoothly and patients receive timely, coordinated care.'
    },
    'Clerical': {
      description: 'Managing practice operations, overseeing scheduling efficiency, coordinating staff coverage, and maintaining accurate financial records.',
      valueProp: 'Your organizational leadership keeps the practice running efficiently and profitably.'
    },
    'Cultural': {
      description: 'Fostering a positive team environment, mentoring staff, and serving as the primary point of contact for patient escalations.',
      valueProp: 'You set the tone for the practice culture and model professional excellence.'
    },
    'Case Acceptance': {
      description: 'Supporting treatment presentation, understanding financial options, and coaching staff on effective patient communication.',
      valueProp: 'Your guidance helps the team convert treatment plans into accepted care.'
    }
  }
};

// Helper to convert role_id to RoleType
export function getRoleType(roleId: number | null | undefined): RoleType {
  if (roleId === 1) return 'DFI';
  if (roleId === 2) return 'RDA';
  return 'OM'; // Default to OM for role_id=3 or others
}

// Ordered list of domains for consistent display
export const DOMAIN_ORDER = ['Clinical', 'Clerical', 'Cultural', 'Case Acceptance'] as const;
