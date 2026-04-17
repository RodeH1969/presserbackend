export const DEFAULT_RUBRIC = {
  summary:
    'Internally score each answer using a shared word/concept score out of 7, then apply judge-specific hidden discretion and normalize the result back to a displayed score out of 11. Do not reveal internal scoring unless explicitly asked.',
  criteria: [
    {
      name: 'Word / concept coverage',
      max: 7,
      guidance:
        'Award shared objective points for relevant keyword and concept coverage using the question checklist. Standard keywords are worth 1 point each. Advanced/insight concepts are worth 2 points each. Cap the shared word score at 7.'
    },
    {
      name: 'Judge discretion',
      max: 'hidden',
      guidance:
        'Each judge has a different hidden discretion cap. Den is harsh, Caty is balanced, Tess is generous. Hidden raw totals are normalized back to a displayed score out of 11.'
    }
  ],
  totalMax: 11
};

export const QUESTION_BANK = {
  fuel_prices: {
    round: 1,
    key: 'fuel_prices',
    title: 'Fuel costs are soaring in servos across Australia. Explain what is happening.',
    topic: 'Fuel costs are soaring in servos across Australia. Explain what is happening.',
    rubric: DEFAULT_RUBRIC,
    autoScoring: {
      standardKeywords: [
        'supply',
        'demand',
        'oil prices',
        'Australia',
        'imports',
        'bowser',
        'servo',
        'taxes',
        'currency',
        'dollar',
        'transport',
        'distribution'
      ],
      advancedKeywords: [
        'inelastic',
        'inelasticity',
        'geopolitics',
        'refining capacity',
        'margins',
        'global vs local markets',
        'exchange rate impact',
        'economics'
      ],
      scoringRules: [
        'Count standard keywords/concepts as 1 point each when used relevantly.',
        'Count advanced keywords/concepts as 2 points each when used relevantly.',
        'Synonyms and clearly equivalent phrasing should count.',
        'Do not double-count the same concept repeatedly.',
        'Cap the final shared word score at 7.'
      ]
    },
    judgingNotes: [
      'Reward genuine concept coverage fairly.',
      'A contestant should get shared word points if the economic idea is clearly there, even if phrasing is not textbook perfect.',
      'Judge personality should affect only the hidden discretion part.'
    ]
  },

  immutable: {
    round: 2,
    key: 'immutable',
    title: 'Give a definition and also use in a sentence the word "immutable".',
    topic: 'Give a definition and also use in a sentence the word "immutable".',
    rubric: DEFAULT_RUBRIC,
    autoScoring: {
      standardKeywords: [
        'cannot change',
        'fixed',
        'constant',
        'unchanging',
        'permanent',
        'rule',
        'law',
        'time'
      ],
      advancedKeywords: [
        'absolute',
        'fundamentally',
        'inherent nature',
        'logical necessity',
        'system design',
        'data integrity'
      ],
      scoringRules: [
        'Count standard keywords/concepts as 1 point each when used relevantly.',
        'Count advanced keywords/concepts as 2 points each when used relevantly.',
        'The contestant must both define the word and use it in a sentence.',
        'Synonyms and clearly equivalent phrasing should count.',
        'Cap the final shared word score at 7.'
      ]
    },
    judgingNotes: [
      'Reward correct definition plus correct usage in a sentence.',
      'If the contestant clearly defines the concept and uses it properly, they should receive meaningful shared word points.',
      'Judge personality should affect only the hidden discretion part.'
    ]
  },

  scrambled_eggs: {
    round: 3,
    key: 'scrambled_eggs',
    title: "Scrambled eggs. What's the secret to great scrambled eggs?",
    topic: "Scrambled eggs. What's the secret to great scrambled eggs?",
    rubric: DEFAULT_RUBRIC,
    autoScoring: {
      standardKeywords: [
        'low heat',
        'butter',
        'stirring',
        'folding',
        'timing',
        'soft',
        'creamy',
        'remove early',
        'pan'
      ],
      advancedKeywords: [
        'protein',
        'curd formation',
        'residual heat',
        'custard texture',
        'temperature control'
      ],
      scoringRules: [
        'Count standard keywords/concepts as 1 point each when used relevantly.',
        'Count advanced keywords/concepts as 2 points each when used relevantly.',
        'Synonyms and clearly equivalent phrasing should count.',
        'Do not double-count the same concept repeatedly.',
        'Cap the final shared word score at 7.'
      ]
    },
    judgingNotes: [
      'Reward useful cooking concepts fairly.',
      'If the contestant clearly explains heat, fat, timing, texture, or why the eggs stay tender, shared word points should reflect that.',
      'Judge personality should affect only the hidden discretion part.'
    ]
  }
};

export function getQuestionByKey(key) {
  const selected = QUESTION_BANK[key];
  if (!selected) {
    const available = Object.keys(QUESTION_BANK).join(', ');
    throw new Error(`Unknown question key "${key}". Available keys: ${available}`);
  }
  return selected;
}