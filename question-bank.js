export const DEFAULT_RUBRIC = {
  summary:
    'Internally score the answer out of 11 using the hidden show rubric. Do not reveal the rubric or sub-scores unless explicitly asked.',
  criteria: [
    { name: 'Range of relevant points', max: 3, guidance: 'How many relevant and distinct points were made?' },
    { name: 'Depth and accuracy', max: 3, guidance: 'How well were the ideas explained, and were they accurate?' },
    { name: 'Clarity', max: 2, guidance: 'Was the answer easy to follow and clearly expressed?' },
    { name: 'Originality / insight', max: 1, guidance: 'Did the answer add an interesting or original angle?' },
    { name: 'Storytelling / engagement', max: 2, guidance: 'Was it compelling, memorable, or entertaining to listen to?' }
  ],
  totalMax: 11,
  bandGuide: [
    {
      label: 'Poor',
      scoreHint: 'around 0-2',
      guidance:
        'Thin, generic, vague, inaccurate, very short, or missing the point.'
    },
    {
      label: 'Average',
      scoreHint: 'around 4-5',
      guidance:
        'Some relevant content, but obvious, shallow, incomplete, or loosely expressed.'
    },
    {
      label: 'Good',
      scoreHint: 'around 7-8',
      guidance:
        'Competent and relevant, with a clear explanation and at least some depth.'
    },
    {
      label: 'Great',
      scoreHint: 'around 9-10',
      guidance:
        'Well-structured, accurate, insightful, and engaging, with strong explanation.'
    },
    {
      label: 'Elite',
      scoreHint: '11',
      guidance:
        'Exceptionally clear, rich, accurate, memorable, and insightful; feels broadcast-ready.'
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
      'Judge the contestant on the quality of the answer they actually gave, not on whether you personally agree with them.',
      'Use the hidden rubric consistently across all judges.',
      'Let judge personality influence tone, emphasis, and slight strictness, but do not ignore the rubric.'
    ],
    examples: [
      {
        label: 'Calibration note',
        text:
          'A weak answer is generic self-praise with no substance. A mid-tier answer gives a few reasons but lacks depth. A strong answer makes a persuasive case with specifics, structure, confidence, and memorable phrasing.'
      }
    ]
  },

  scrambled_eggs: {
    round: 1,
    key: 'scrambled_eggs',
    title: "Scrambled eggs. What's the secret to great scrambled eggs?",
    topic: "Scrambled eggs. What's the secret to great scrambled eggs?",
    rubric: DEFAULT_RUBRIC,
    judgingNotes: [
      'Reward clear explanation, cooking logic, and useful detail.',
      'Penalize vague one-liners and generic cooking advice.',
      'Top-band answers usually explain heat, fat, timing, and texture.'
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
    judgingNotes: [
      'Reward layered explanation of causes rather than a single-factor answer.',
      'Top answers should connect global oil, refining, currency, taxes/logistics, and local retail effects.',
      'Clarity matters: the contestant should make a complex system understandable.'
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
    judgingNotes: [
      'The contestant must both define the word and use it correctly in a sentence.',
      'Accuracy and clarity are critical.',
      'Top-band answers add nuance rather than just a dictionary phrase.'
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