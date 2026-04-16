export const DEFAULT_RUBRIC = {
  summary:
    'Internally score the answer out of 11. The first 8 points come from keyword/concept coverage using the question checklist. The final 3 points come from judge discretion for overall quality, clarity, flair, and persuasion. Do not reveal internal scoring unless explicitly asked.',
  criteria: [
    {
      name: 'Auto keyword/concept coverage',
      max: 8,
      guidance:
        'Award points only for relevant keyword or concept coverage defined for the question. Standard keywords are worth 1 point each. Advanced or insight keywords are worth 2 points each. Cap the total auto score at 8.'
    },
    {
      name: 'Judge discretion',
      max: 3,
      guidance:
        'Award 0-3 points for overall quality, clarity, flair, and persuasion. This is where judge personality shows up.'
    }
  ],
  totalMax: 11,
  bandGuide: [
    {
      label: 'Poor',
      scoreHint: 'around 0-3',
      guidance:
        'Very little relevant concept coverage and weak overall quality.'
    },
    {
      label: 'Average',
      scoreHint: 'around 4-6',
      guidance:
        'Some useful keyword coverage and a basically competent response, but limited breadth or flair.'
    },
    {
      label: 'Good',
      scoreHint: 'around 7-8',
      guidance:
        'Strong concept coverage with a solid overall answer.'
    },
    {
      label: 'Great',
      scoreHint: 'around 9-10',
      guidance:
        'Broad and accurate concept coverage plus strong clarity, persuasion, or flair.'
    },
    {
      label: 'Elite',
      scoreHint: '11',
      guidance:
        'Excellent concept coverage and standout overall delivery.'
    }
  ]
};

export const QUESTION_BANK = {
  round1: {
    round: 1,
    key: 'round1',
    title: 'Why should you win this one-question speech battle?',
    topic: 'Why should you win this one-question speech battle?',
    rubric: DEFAULT_RUBRIC,
    judgingNotes: [
      'This is one question only.',
      'Score using 8 auto points for keyword/concept coverage and 3 judge discretion points.',
      'Judge personality should affect ONLY the 0-3 discretion score.',
      'Do not let judge personality override factual coverage.',
      'Coverage should be rewarded fairly whenever the contestant genuinely includes relevant concepts.'
    ],
    examples: [
      {
        label: 'Calibration note',
        text:
          'A weak answer has little substance. A mid-tier answer covers a few useful points. A strong answer covers several relevant ideas and delivers them clearly and persuasively.'
      }
    ]
  },

  scrambled_eggs: {
    round: 1,
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
        'Synonyms or clearly equivalent phrasing should count.',
        'Cap total auto points at 8.'
      ]
    },
    judgingNotes: [
      'Reward relevant cooking logic and useful detail through the auto score.',
      'Judge discretion should focus only on quality, clarity, flair, and persuasion.',
      'Do not withhold auto points just because the answer is not elegant; if the concept is there, count it.'
    ],
    examples: [
      { label: 'Poor', score: 2, text: 'Just cook them in a pan and stir until they’re done.' },
      { label: 'Average', score: 5, text: 'Use butter, cook on medium heat, and stir so they don’t burn.' },
      { label: 'Good', score: 8, text: 'Cook eggs slowly on low heat with butter, stirring gently to keep them soft. Take them off before they fully set so they don’t go dry.' },
      { label: 'Great', score: 10, text: 'Great scrambled eggs come down to heat control, fat, and timing. Low heat prevents the proteins from tightening too quickly, butter adds richness, and constant folding creates soft curds. Pulling them off early lets residual heat finish the job, keeping them creamy instead of rubbery.' },
      { label: 'Elite', score: 11, text: 'Perfect scrambled eggs are less about cooking and more about restraint. Start with eggs and butter in a cold pan, then coax them slowly over low heat, folding rather than scrambling aggressively. Heat control keeps the proteins tender, fat carries flavour, and timing is everything—remove them just before they look done. The final texture should feel closer to a custard than breakfast, soft, glossy, and barely holding together.' }
    ]
  },

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
        'exchange rate impact'
      ],
      scoringRules: [
        'Count standard keywords/concepts as 1 point each when used relevantly.',
        'Count advanced keywords/concepts as 2 points each when used relevantly.',
        'Synonyms or clearly equivalent phrasing should count.',
        'Cap total auto points at 8.'
      ]
    },
    judgingNotes: [
      'Reward layered explanation through the auto score whenever the concepts are genuinely present.',
      'Judge discretion should capture how clear, persuasive, and well-put the answer is.',
      'Example calibration: “Fuel prices are rising due to supply and demand, global oil prices, and a weak dollar affecting imports at the bowser.” should score 6 auto points before discretion.'
    ],
    examples: [
      { label: 'Poor', score: 2, text: 'Fuel prices are going up because everything is expensive.' },
      { label: 'Average', score: 5, text: 'Oil prices are rising globally, so petrol costs more in Australia.' },
      { label: 'Good', score: 8, text: 'Fuel prices are increasing due to higher global oil prices, supply constraints, and the Australian dollar weakening, which makes imports more expensive.' },
      { label: 'Great', score: 10, text: 'Fuel prices in Australia reflect a chain reaction: global crude oil markets set the baseline, where supply limits and geopolitical tensions push prices up. Refining capacity adds another bottleneck, increasing wholesale costs. A weaker Australian dollar amplifies these increases, and by the time fuel reaches local servos, taxes and distribution costs further raise the final price.' },
      { label: 'Elite', score: 11, text: 'Think of fuel pricing as a relay race across systems. It starts with global crude markets shaped by supply discipline, geopolitical instability, and demand recovery. That price is handed to refiners, where tight capacity drives margins higher. Australia then imports much of its refined fuel, so a weaker currency magnifies every global increase. Add in domestic taxes, transport logistics, and retail pricing cycles, and by the time it hits the bowser, what looks like a simple price jump is actually the result of layered economic forces interacting across global and local scales.' }
    ]
  },

  immutable: {
    round: 1,
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
        'Synonyms or clearly equivalent phrasing should count.',
        'Cap total auto points at 8.'
      ]
    },
    judgingNotes: [
      'Accuracy matters, but reward genuine conceptual coverage fairly.',
      'Judge discretion should distinguish dry correctness from elegant, confident delivery.',
      'If the contestant both defines the word correctly and uses it correctly in a sentence, that should already support a respectable score before flair is considered.'
    ],
    examples: [
      { label: 'Poor', score: 2, text: 'Immutable means something. Sentence: It is immutable.' },
      { label: 'Average', score: 5, text: 'Immutable means something cannot change. Sentence: The rule is immutable.' },
      { label: 'Good', score: 8, text: 'Immutable means not able to be changed or altered. Sentence: His belief in honesty was immutable.' },
      { label: 'Great', score: 10, text: 'Immutable refers to something that is fixed and unchangeable over time, either by nature or by rule. Sentence: In the system, the core data is immutable, ensuring it cannot be accidentally altered.' },
      { label: 'Elite', score: 11, text: 'Immutable describes something fundamentally resistant to change—whether due to physical law, logical necessity, or deliberate design. Sentence: Like the laws of mathematics, the system’s foundational rules were treated as immutable, forming a stable base that everything else could rely on.' }
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