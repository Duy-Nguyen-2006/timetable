export type SlotFillAtom = {
  kind: string | 'custom';
  params: Record<string, unknown>;
  confidence: 'high' | 'medium' | 'low';
  missingParams: string[];
};

export type SlotFillResponse = {
  atoms: SlotFillAtom[];
  condition?: {
    op: string;
    teachers?: string[];
    teacher?: string;
    day?: string;
    period?: number;
  };
};
