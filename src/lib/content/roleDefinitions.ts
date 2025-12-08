export type RoleType = 'DFI' | 'RDA';

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
  }
};

// Ordered list of domains for consistent display
export const DOMAIN_ORDER = ['Clinical', 'Clerical', 'Cultural', 'Case Acceptance'] as const;
