type FeesRow = {
  fee_id: string;
  name: string;
  tcs_app_id: string;
  is_variable: boolean;
  amount: number;
  description: string;
};

// Insert new fee_ids here to get them registered in the DB. Added via seeding.
export const generateFees = (): FeesRow[] => {
  const fees = [
    {
      fee_id: 'PETITION_FILING_FEE',
      name: 'Petition Filing Fee',
      tcs_app_id: 'TCSUSTAXCOURTPETITION',
      is_variable: false,
      amount: 60,
      description: 'Fee charged for filing a petition with the U.S. Tax Court.',
    },
    {
      fee_id: 'NONATTORNEY_EXAM_REGISTRATION_FEE',
      name: 'Non-Attorney Exam Registration Fee',
      tcs_app_id: 'TCSUSTAXCOURTANAEF',
      is_variable: false,
      amount: 250,
      description: 'Fee for non-attorneys to register for an examination with the U.S. Tax Court.',
    },
  ];
  return fees;
};
