// The builder: sixteen stations that walk McKee's CHARACTER from first
// spark to cast design. Each station declares its fields (bound by path
// into the character model), the chapter(s) it draws on, a guiding
// principle, the questions McKee asks, and which infographic visualizes it.
// Guidance text is paraphrase with chapter references.

import * as K from './catalog.js';
import type { Opt } from './catalog.js';
import type { CharacterBuild, StoryDesign } from './model.js';

const has = (arr: string[] | undefined, id: string) => Array.isArray(arr) && arr.includes(id);

export type FieldType = 'text' | 'textarea' | 'trait' | 'select' | 'radio' | 'chips' | 'checklist' | 'slider' | 'spectra' | 'sliders' | 'toggle' | 'custom';
export type CustomComponent =
  | 'personae'
  | 'dimensions'
  | 'antagonism'
  | 'dimensionPicker'
  | 'turningPoints'
  | 'scenes'
  | 'relationships'
  | 'genreInfo'
  | 'coreCastPicker'
  | 'moPicker'
  | 'genrePicker';
export type ShowIf = (c: CharacterBuild, story?: StoryDesign | null) => boolean;

export interface FieldDef {
  path: string;
  type: FieldType;
  label?: string;
  placeholder?: string;
  help?: string;
  rows?: number;
  /** Tratto esplicito (tipo 'trait'): id in EXPLICIT_TRAITS. */
  key?: string;
  options?: (Opt | { id: string; label: string; desc?: string })[];
  items?: Opt[];
  min?: number;
  max?: number;
  step?: number;
  left?: string;
  right?: string;
  showDesc?: boolean;
  compact?: boolean;
  columns?: number;
  component?: CustomComponent;
  showIf?: ShowIf;
}

export interface GroupDef {
  title: string;
  hint?: string;
  showIf?: ShowIf;
  fields: FieldDef[];
}

export interface SectionDef {
  id: string;
  part: string;
  num: string;
  title: string;
  subtitle: string;
  chapters: number[];
  accent: string;
  visual: string;
  principle: string;
  questions: string[];
  groups: GroupDef[];
}

export interface PartDef {
  id: string;
  title: string;
  subtitle: string;
}

export type SectionField = FieldDef & { group: GroupDef };

export const PARTS: PartDef[] = [
  { id: 'foundations', title: 'Foundations', subtitle: 'Spark & role' },
  { id: 'outer', title: 'Outer Character', subtitle: 'Characterization' },
  { id: 'inner', title: 'Inner Character', subtitle: 'True character' },
  { id: 'complexity', title: 'Complexity', subtitle: 'Dimension, depth, arc' },
  { id: 'universe', title: 'Character Universe', subtitle: 'Symbol, genre, action' },
  { id: 'cast', title: 'Cast', subtitle: 'Relationships' },
];

export const SECTIONS: SectionDef[] = [
  {
    id: 'spark', part: 'foundations', num: '01', title: 'The Spark', subtitle: 'Inspiration & concept',
    chapters: [3, 4, 5], accent: 'spark', visual: 'sparkSpheres',
    principle: 'Inspiration rarely arrives whole. A sliver of intuition — a telling detail, a "what if" — sets off chains of association. Most first ideas dead-end in cliché; keep improvising until one detail implies a whole humanity.',
    questions: [
      'What single, specific detail makes you believe in this person?',
      'What would happen if…? Which inciting event summons this character?',
      'Am I working outside in, inside out, or alternating between the two?',
    ],
    groups: [
      {
        title: 'Identity', fields: [
          { path: 'concept.nickname', label: 'Nickname / alias', type: 'text', placeholder: 'What others call her' },
          { path: 'concept.roleLabel', label: 'Generic role', type: 'text', placeholder: 'Mother, Boss, Artist, Loner…', help: 'A role is a position in the story’s social order. The character is what fills that frame in a one-of-a-kind way. (Ch. 6)' },
          { path: 'concept.logline', label: 'One-line concept', type: 'textarea', rows: 2, placeholder: 'A ___ who ___ but ___.' },
        ],
      },
      {
        title: 'Where the spark came from', hint: 'Five nested spheres surround the writer: actuality → media → genre → the story’s own backstory, events and themes → the author’s creative self. (Ch. 4)',
        fields: [
          { path: 'concept.inspiration', label: 'Sources', type: 'chips', options: K.INSPIRATION_SOURCES },
          { path: 'concept.tellingDetail', label: 'The telling detail', type: 'textarea', rows: 2, placeholder: 'The one unique facet that suddenly implies an entire humanity.', help: 'Credibility grows trait by trait until one detail lifts the idea from what is into what could be. (Ch. 4)' },
          { path: 'concept.magicIf', label: 'The Magic If', type: 'textarea', rows: 2, placeholder: 'If ___ happened, what kind of person would ___?', help: 'Stanislavsky’s “Magic If” often yields the inciting incident, which in turn summons the characters who react to it. (Ch. 4)' },
        ],
      },
      {
        title: 'Author’s method', fields: [
          { path: 'concept.approach', label: 'Approach', type: 'radio', options: K.APPROACHES },
          { path: 'concept.inCharacter', label: 'In-character improvisation', type: 'textarea', rows: 3, placeholder: '“If I were this character in this situation, what would I do?” Write the answer in her voice.', help: 'Not “what would I do” (you are not her) nor “what would she do” (you’re in the audience, guessing). Act it as her. (Ch. 5)' },
          { path: 'concept.research', label: 'Research roads', type: 'chips', options: K.RESEARCH_KINDS },
          { path: 'concept.researchNotes', label: 'Research notes', type: 'textarea', rows: 2 },
        ],
      },
    ],
  },
  {
    id: 'role', part: 'foundations', num: '02', title: 'Role in the Cast', subtitle: 'Position, function, essentials',
    chapters: [6], accent: 'role', visual: 'castOrbit',
    principle: 'Picture the cast as a solar system: the protagonist blazes at the centre, three rings of supporting roles orbit at decreasing influence, and a narrator views the cosmos from afar. Design from the star outward.',
    questions: [
      'Does this role change the course of events (support) or only facilitate scenes (service)?',
      'Weighed against every force of antagonism, is the protagonist clearly an underdog?',
      'Where is the story’s Center of Good — the positive quality that draws empathy?',
    ],
    groups: [
      {
        title: 'Position', fields: [
          { path: 'cast.circle', label: 'Orbit', type: 'radio', options: K.CIRCLES },
          { path: 'cast.function', label: 'Function', type: 'radio', options: K.CAST_FUNCTIONS, showIf: (c) => c.cast.circle !== 'protagonist' },
          { path: 'cast.protagonistType', label: 'Protagonist variation', type: 'select', options: K.PROTAGONIST_TYPES, showIf: (c) => c.cast.circle === 'protagonist' },
          { path: 'cast.specialRoles', label: 'Special roles', type: 'chips', options: K.SPECIAL_ROLES },
        ],
      },
      {
        title: 'The eight essentials of a protagonist', hint: 'McKee’s checklist for the role that deserves a major chunk of the audience’s time. (Ch. 6)',
        showIf: (c) => c.cast.circle === 'protagonist' || !c.cast.circle,
        fields: [
          { path: 'cast.essentials', label: 'Essentials met', type: 'checklist', options: K.PROTAGONIST_ESSENTIALS },
          { path: 'cast.centerOfGood', label: 'Center of Good', type: 'textarea', rows: 2, placeholder: 'Loyalty in a world of betrayal; wit and courtesy in hell…', help: 'A positive charge glowing within that contrasts with the darkness around it — the place the audience attaches empathy. (Ch. 6)' },
          { path: 'cast.essentialsNotes', label: 'Notes', type: 'textarea', rows: 2 },
        ],
      },
      {
        title: 'Foil', showIf: (c) => has(c.cast.specialRoles, 'foil'),
        fields: [
          { path: 'cast.foilOf', label: 'Foil to', type: 'text', placeholder: 'Whom does she illuminate?' },
          { path: 'cast.foilFunctions', label: 'Foil functions', type: 'checklist', options: K.FOIL_FUNCTIONS },
        ],
      },
      {
        title: 'Narrator', showIf: (c) => has(c.cast.specialRoles, 'narrator'),
        fields: [
          { path: 'cast.narrator.person', label: 'Person', type: 'radio', options: K.NARRATOR_PERSONS },
          { path: 'cast.narrator.reliability', label: 'Reliability', type: 'radio', options: K.RELIABILITY },
          { path: 'cast.narrator.cause', label: 'Cause of unreliability', type: 'select', options: K.UNRELIABLE_CAUSES, showIf: (c) => c.cast.narrator.reliability === 'unreliable' },
        ],
      },
    ],
  },
  {
    id: 'explicit', part: 'outer', num: '03', title: 'Explicit Traits', subtitle: 'The observable surface',
    chapters: [7], accent: 'outer', visual: 'traitDensity',
    principle: 'Characterization is the sum of observable traits — the masks a character wears. It serves credibility, originality and intrigue. Specificity breeds originality; generality breeds cliché. Express about three-tenths and let the audience imagine the rest.',
    questions: [
      'Follow her around 24/7: what do you see, hear, notice?',
      'Which traits will you actually dramatize? What is lost if you cut one?',
      'Does the surface make us ask “But who is she really?” — or answer itself?',
    ],
    groups: [
      {
        title: 'Name, body, wardrobe', hint: 'Tap the eye to mark a trait as dramatized on the page/stage/screen. The density meter tracks the 3/10 rule. (Ch. 7)',
        fields: [
          { path: 'outer.explicit.nameMeaning', key: 'nameMeaning', type: 'trait', rows: 2 },
          { path: 'outer.explicit.age', key: 'age', type: 'trait', rows: 1 },
          { path: 'outer.explicit.appearance', key: 'appearance', type: 'trait' },
          { path: 'outer.explicit.wardrobe', key: 'wardrobe', type: 'trait' },
          { path: 'outer.explicit.gender', key: 'gender', type: 'trait', rows: 1 },
          { path: 'outer.explicit.eros', key: 'eros', type: 'trait' },
        ],
      },
      {
        title: 'Voice, face, gesture', fields: [
          { path: 'outer.explicit.voice', key: 'voice', type: 'trait' },
          { path: 'outer.explicit.face', key: 'face', type: 'trait' },
          { path: 'outer.explicit.gestures', key: 'gestures', type: 'trait' },
        ],
      },
      {
        title: 'Work, play, possessions', fields: [
          { path: 'outer.explicit.profession', key: 'profession', type: 'trait' },
          { path: 'outer.explicit.workIdentity', label: 'How much of her identity is her job?', type: 'slider', min: 0, max: 10, left: 'None', right: 'All of it' },
          { path: 'outer.explicit.recreation', key: 'recreation', type: 'trait' },
          { path: 'outer.explicit.home', key: 'home', type: 'trait' },
          { path: 'outer.explicit.transport', key: 'transport', type: 'trait', rows: 1 },
        ],
      },
      {
        title: 'Mind, talk, manners', fields: [
          { path: 'outer.explicit.knowledge', key: 'knowledge', type: 'trait' },
          { path: 'outer.explicit.ignorance', key: 'ignorance', type: 'trait' },
          { path: 'outer.explicit.beliefs', key: 'beliefs', type: 'trait' },
          { path: 'outer.explicit.conversation', key: 'conversation', type: 'trait' },
          { path: 'outer.explicit.manners', key: 'manners', type: 'trait' },
        ],
      },
      {
        title: 'Trait spectra', hint: 'Every observable trait sits on a spectrum from positive to negative — public ones with strangers, private ones with intimates. (Ch. 7)',
        fields: [
          { path: 'outer.spectra', label: 'In public', type: 'spectra', items: K.PUBLIC_SPECTRA, min: -5, max: 5 },
          { path: 'outer.spectra', label: 'In private', type: 'spectra', items: K.PRIVATE_SPECTRA, min: -5, max: 5 },
          { path: 'outer.functions', label: 'This characterization delivers…', type: 'checklist', options: K.CHARACTERIZATION_FUNCTIONS },
        ],
      },
    ],
  },
  {
    id: 'implicit', part: 'outer', num: '04', title: 'Implicit Traits', subtitle: 'Personality, mind, temperament',
    chapters: [7], accent: 'outer', visual: 'bigFive',
    principle: 'The audience reads outer traits as clues to inner ones: talents, intelligence, attitudes, moods. Personality fits inside five grand spectra — but coincidence and relationships bend it endlessly.',
    questions: [
      'Ask her: “Who are you?” Does she describe her nature or name her profession?',
      'Is she smart enough to do the smart things — or convincingly dumb in all ways?',
      'What would her fifth-grade teacher say about her temperament?',
    ],
    groups: [
      {
        title: 'The five galaxies of personality', fields: [
          { path: 'outer.implicit.bigFive', type: 'spectra', items: K.BIG_FIVE, min: 0, max: 100, showDesc: true },
        ],
      },
      {
        title: 'Varieties of intelligence', fields: [
          { path: 'outer.implicit.intelligence', type: 'sliders', items: K.INTELLIGENCES, min: 0, max: 10 },
          { path: 'outer.implicit.habitsOfThought', label: 'Habits of thought', type: 'textarea', rows: 2, placeholder: 'Her personal strategy for relationships, for problems…' },
          { path: 'outer.implicit.flexibility', label: 'Mental flexibility', type: 'slider', min: 0, max: 10, left: 'Rigid', right: 'Supple' },
        ],
      },
      {
        title: 'Attitudes, beliefs, values', fields: [
          { path: 'outer.implicit.likes', label: 'Likes & loves', type: 'textarea', rows: 2 },
          { path: 'outer.implicit.dislikes', label: 'Dislikes & hates', type: 'textarea', rows: 2 },
          { path: 'outer.implicit.fears', label: 'Fears & dreads', type: 'textarea', rows: 2 },
          { path: 'outer.implicit.outlook', label: 'Outlook', type: 'slider', min: -5, max: 5, left: 'Pessimist', right: 'Optimist' },
        ],
      },
      {
        title: 'Interrogate her', hint: 'McKee’s big questions. Answer in her words, then judge the self-deception. (Ch. 7)',
        fields: [
          { path: 'outer.implicit.whoAreYou', label: '“Who are you?”', type: 'textarea', rows: 2 },
          { path: 'outer.implicit.achieve', label: '“What do you wish to achieve?”', type: 'textarea', rows: 2 },
          { path: 'outer.implicit.mustDo', label: '“What must you do — for yourself, for others?”', type: 'textarea', rows: 2 },
          { path: 'outer.implicit.mustNever', label: '“What must you never do?”', type: 'textarea', rows: 2 },
          { path: 'outer.implicit.humanNature', label: '“Is mankind good or evil?”', type: 'radio', options: K.HUMAN_NATURE_VIEWS, compact: true },
        ],
      },
      {
        title: 'Emotion, mood, temperament', fields: [
          { path: 'outer.implicit.mood', label: 'Prevailing mood', type: 'textarea', rows: 2, help: 'A mood draws the same reaction from different experiences. (Ch. 7)' },
          { path: 'outer.implicit.temperament', label: 'Childhood temperament', type: 'textarea', rows: 2, help: 'Children have temperaments, adults personalities — but the temperament follows like a shadow. (Ch. 7)' },
          { path: 'outer.implicit.authority', label: 'Toward authority', type: 'slider', min: -5, max: 5, left: 'Authoritarian', right: 'Anti-authoritarian' },
          { path: 'outer.implicit.mirror', label: 'The mirror', type: 'textarea', rows: 2, placeholder: 'How does she reinterpret her past to explain who she sees in the mirror?' },
        ],
      },
    ],
  },
  {
    id: 'world', part: 'outer', num: '05', title: 'World & Expression', subtitle: 'Setting and how she’s rendered',
    chapters: [7], accent: 'outer', visual: 'settingRings',
    principle: 'Time, place and people buffet and mold the outer selves. A moral imagination charges every element of the setting with value — nothing neutral. Then choose the techniques that render her: what she is, is not, and is like.',
    questions: [
      'How do time, space and objects shape her personality? How do they thwart her desire?',
      'Which groups anchor her identity — the ones she aspires to, the ones she rebels against?',
      'What must she never do here — and what would she do with nothing to lose?',
    ],
    groups: [
      {
        title: 'Time & space', fields: [
          { path: 'outer.setting.period', label: 'Period', type: 'text', placeholder: 'Contemporary, historical, future, timeless' },
          { path: 'outer.setting.location', label: 'Location', type: 'text', placeholder: 'A certain room in a certain building on a certain street…' },
          { path: 'outer.setting.levels', label: 'Levels of conflict in her world', type: 'chips', options: K.CONFLICT_LEVELS },
        ],
      },
      {
        title: 'Settings that shape her', fields: [
          { path: 'outer.setting.physical', label: 'Physical setting', type: 'textarea', rows: 2 },
          { path: 'outer.setting.social', label: 'Social setting', type: 'textarea', rows: 2, placeholder: 'Nationality, religion, neighbourhood, profession — and the price of membership.' },
          { path: 'outer.setting.personal', label: 'Personal setting', type: 'textarea', rows: 2, placeholder: 'The intimacies — the richest level for originality and nuance.' },
          { path: 'outer.setting.restraints', label: 'Cultural restraints', type: 'textarea', rows: 2, help: 'The more positive relationships surround her, the more restrained her behaviour; with nothing to lose, she’s capable of anything. (Ch. 7)' },
          { path: 'outer.setting.values', label: 'Charged values', type: 'textarea', rows: 2, placeholder: 'Which values ring positive, negative or ironic in her world? Rank them.' },
        ],
      },
      {
        title: 'Setting versus characterization', fields: [
          { path: 'outer.setting.relation', label: 'Primary relationship to setting', type: 'radio', options: K.SETTING_RELATIONS },
          { path: 'outer.setting.extendedSelf', label: 'Her shell', type: 'textarea', rows: 2, placeholder: 'The cluster of things she calls her own.' },
          { path: 'outer.setting.change', label: 'Forces changing her characterization', type: 'chips', options: K.CHARACTERIZATION_CHANGE },
        ],
      },
      {
        title: 'Expressing characterization', hint: 'Nine techniques — by what she is, is not, and is like. (Ch. 7)',
        fields: K.EXPRESSION_TECHNIQUES.map((t): FieldDef => ({ path: `outer.expression.${t.id}`, label: t.label, type: 'textarea', rows: 1, placeholder: t.desc })),
      },
    ],
  },
  {
    id: 'selves', part: 'inner', num: '06', title: 'The Four Selves', subtitle: 'Social, personal, core, hidden',
    chapters: [5], accent: 'selves', visual: 'fourSelves',
    principle: 'A character is a cast of selves: the core self observes and decides; its agent self performs personal and social personae; beneath all, a hidden self struggles with contradictory desires. Major characters should be known at all four levels.',
    questions: [
      'Work life, intimate life, secret life, subconscious life — what is true at each level?',
      'How does her voice, gesture and energy change with each person and balance of power?',
      'Which personal self is the one her loved ones love?',
    ],
    groups: [
      {
        title: 'Four levels of self', hint: 'Mad Men’s writers built each role at three levels — work, intimate, secret; McKee adds the subconscious. (Ch. 5)',
        fields: K.SELF_LEVELS.map((s): FieldDef => ({ path: `selves.${s.id}`, label: `${s.label} · ${s.madMen}`, type: 'textarea', rows: 3, placeholder: s.desc })),
      },
      {
        title: 'Variations', fields: [
          { path: 'selves.variation', label: 'State of the core self', type: 'radio', options: K.SELF_VARIATIONS },
        ],
      },
      {
        title: 'Personae — her repertoire of masks', hint: 'Personal selves vary by intimacy, social selves by power. Each has its own voice, eyes, posture, nervosity. (Ch. 5)',
        fields: [{ path: 'selves.personae', type: 'custom', component: 'personae' }],
      },
    ],
  },
  {
    id: 'desire', part: 'inner', num: '07', title: 'Motivation & Desire', subtitle: 'What pushes, what pulls',
    chapters: [8], accent: 'inner', visual: 'motivationLadder',
    principle: 'Motivations push from the past; desires pull toward the future. A motivation is an unfocused hunger until an inciting incident throws life out of balance, arousing a super-objective to restore equilibrium and focusing it on an object of desire.',
    questions: [
      'Ask “why?” like an annoying five-year-old until rationalizations run out.',
      'What event throws her life radically out of balance — up or down?',
      'What does she believe would put her life back on an even keel?',
    ],
    groups: [
      {
        title: 'Inside-out motivations', hint: 'Twelve drives ranked from primal to elevated. Rate how strongly each pushes her. (Ch. 8)',
        fields: [
          { path: 'inner.motivations', type: 'sliders', items: K.MOTIVATIONS, min: 0, max: 10, showDesc: true },
          { path: 'inner.moreKind', label: '“More” takes the form of…', type: 'radio', options: K.MORE_KINDS, compact: true, showIf: (c) => Number(c.inner.motivations?.more) > 0 },
        ],
      },
      {
        title: 'Outside-in motivations', fields: [
          { path: 'inner.outsideIn', label: 'Social forces at work on her', type: 'textarea', rows: 2, help: 'Poverty and wealth are conditions, not causes: social forces must pass through her unique psychology before they move her. (Ch. 8)' },
        ],
      },
      {
        title: 'Backstory patterns', hint: 'Look for patterns rather than singularities; focus on early adolescence. (Ch. 4)',
        fields: [
          { path: 'inner.backstory.patterns', label: 'Repeated emotional experiences', type: 'textarea', rows: 2, placeholder: 'Repeated traumas, daily coddling… what residues did they leave?' },
          { path: 'inner.backstory.adolescence', label: 'Early adolescence', type: 'textarea', rows: 2, placeholder: 'Her first dream of the future — and whether it turned positive or negative.' },
          { path: 'inner.backstory.identity', label: 'How her identity solidified', type: 'textarea', rows: 2 },
        ],
      },
      {
        title: 'From inciting incident to object of desire', fields: [
          { path: 'inner.incitingIncident', label: 'Inciting incident', type: 'textarea', rows: 2 },
          { path: 'inner.incitingCharge', label: 'It swings her life…', type: 'radio', options: K.CHARGES, compact: true },
          { path: 'inner.superObjective', label: 'Super-objective', type: 'textarea', rows: 2, placeholder: 'Her need to rebalance life, from the inciting incident on.' },
          { path: 'inner.objectOfDesire', label: 'Conscious object of desire', type: 'textarea', rows: 2 },
          { path: 'inner.desireKind', label: 'Kind of object', type: 'radio', options: K.DESIRE_KINDS, compact: true },
        ],
      },
    ],
  },
  {
    id: 'choice', part: 'inner', num: '08', title: 'Choice, Pressure & Emotion', subtitle: 'True character revealed',
    chapters: [8], accent: 'inner', visual: 'choiceDepth',
    principle: 'True character is revealed only by choices under pressure. Clear choices between good and bad are trivial; only a dilemma between two things of near-equal value reveals who she is. The greater the risk, the deeper the choice — and the freer the choice, deeper still.',
    questions: [
      'What two goods (or two evils) must she choose between?',
      'What will she lose in order to gain?',
      'Beyond her choices, what never-seen-before reactions make her one of a kind?',
    ],
    groups: [
      {
        title: 'The dilemma', fields: [
          { path: 'inner.dilemma.kind', label: 'Kind', type: 'radio', options: K.DILEMMA_KINDS, compact: true },
          { path: 'inner.dilemma.optionA', label: 'Option A', type: 'textarea', rows: 2 },
          { path: 'inner.dilemma.optionB', label: 'Option B', type: 'textarea', rows: 2 },
          { path: 'inner.dilemma.choice', label: 'What she chooses — and what it costs', type: 'textarea', rows: 2 },
        ],
      },
      {
        title: 'Pressure', hint: 'Three principles: choice under pressure expresses true character; greater risk, deeper choice; freer choice, deeper still. (Ch. 8)',
        fields: [
          { path: 'inner.pressure.risk', label: 'Risk & pressure at the crisis', type: 'slider', min: 0, max: 10, left: 'Nothing at stake', right: 'Everything, even life' },
          { path: 'inner.pressure.freedom', label: 'Freedom of the choice', type: 'slider', min: 0, max: 10, left: 'Forced by fate, vows, others', right: 'Wholly hers' },
          { path: 'inner.pressure.notes', label: 'Notes', type: 'textarea', rows: 2 },
        ],
      },
      {
        title: 'Value spectra under pressure', fields: [
          { path: 'inner.values', type: 'spectra', items: K.VALUE_SPECTRA, min: -5, max: 5 },
        ],
      },
      {
        title: 'Emotion & feeling', hint: 'Emotion is the side effect of change in a value’s charge. Twelve emotions in six oppositions; feelings are the slow background weather. (Ch. 8)',
        fields: [
          { path: 'inner.emotions', label: 'Emotional range — which pole she swings toward', type: 'spectra', items: K.EMOTION_PAIRS, min: -5, max: 5 },
          { path: 'inner.emotionStyle', label: 'How her characterization shades emotion', type: 'textarea', rows: 2, placeholder: 'Joy as song-and-dance — or a smile at the edges of the eyes?' },
          { path: 'inner.feelings', label: 'Background feelings', type: 'spectra', items: K.FEELINGS, min: -5, max: 5 },
        ],
      },
      {
        title: 'Reactions & decisions', fields: [
          { path: 'inner.reactions', label: 'Signature reactions', type: 'textarea', rows: 2, help: 'Choices express true character; detailed, never-seen-before reactions make her distinctive. (Ch. 8)' },
          { path: 'inner.decisionPath', label: 'How she usually arrives at decisions', type: 'radio', options: K.DECISION_PATHS },
        ],
      },
    ],
  },
  {
    id: 'dimensions', part: 'complexity', num: '09', title: 'Dimensions', subtitle: 'A unity of opposites',
    chapters: [9], accent: 'dimension', visual: 'dimensionWheel',
    principle: 'A dimension is a consistent contradiction within or between the planes of a character’s nature. Contradiction binds outer, inner and hidden selves into one person. One dimension stands forward as the defining dimension; remove it and she vanishes.',
    questions: [
      'Think of any adjective, imagine its opposite: is that a war she wages?',
      'Is each dimension consistent, variable and seemingly unresolvable?',
      'Which contradiction is so essential that without it she would be someone else?',
    ],
    groups: [
      {
        title: 'Her dimensions', hint: 'Protagonists may hold many; first-circle roles one or two; second-circle roles a single trait. (Ch. 9, 17)',
        fields: [{ path: 'dimensions', type: 'custom', component: 'dimensions' }],
      },
    ],
  },
  {
    id: 'complexity', part: 'complexity', num: '10', title: 'Antagonism & Depth', subtitle: 'Conflict at every level',
    chapters: [10], accent: 'antagonism', visual: 'underdogScale',
    principle: 'A character becomes only as multidimensional as the forces of antagonism that conflict within her. Conflict ranges from the physical to the social, the personal and the inner. In a complex protagonist the subconscious adds a counterdesire that contradicts the conscious one.',
    questions: [
      'Weigh her capacities in one hand and every antagonistic force in the other. Is she overwhelmed?',
      'What does she want consciously — and what does her hidden self want instead?',
      'What does she say, what does she mean, and what can she never know about herself?',
    ],
    groups: [
      {
        title: 'Forces of antagonism', hint: 'Rate each force bearing down on her over the story. (Ch. 6, 10)',
        fields: [{ path: 'complexity.antagonism', type: 'custom', component: 'antagonism' }],
      },
      {
        title: 'Desire vs. counterdesire', fields: [
          { path: 'inner.objectOfDesire', label: 'Conscious object of desire', type: 'textarea', rows: 2 },
          { path: 'complexity.subconsciousDesire', label: 'Subconscious object of desire', type: 'textarea', rows: 2, help: 'If the two desires are the same, who would notice? The counterdesire must contradict or sharply contrast with the conscious want, making her her own worst enemy. (Ch. 10)' },
          { path: 'complexity.innerConflicts', label: 'Inner conflict patterns', type: 'chips', options: K.INNER_CONFLICTS },
        ],
      },
      {
        title: 'Depth of character', hint: 'Ten traits audiences sense as depth. All ten together often make the antihero. (Ch. 10)',
        fields: [{ path: 'complexity.depthTraits', type: 'checklist', options: K.DEPTH_TRAITS, columns: 2 }],
      },
      {
        title: 'Life in the subtext', fields: [
          { path: 'complexity.subtext.text', label: 'Text — what she says and does', type: 'textarea', rows: 2 },
          { path: 'complexity.subtext.sub', label: 'Subtext — what she thinks and feels but never says', type: 'textarea', rows: 2 },
          { path: 'complexity.subtext.unsayable', label: 'Below awareness — what she can’t know about herself', type: 'textarea', rows: 2 },
          { path: 'complexity.secrets', label: 'Secrets', type: 'textarea', rows: 2 },
        ],
      },
    ],
  },
  {
    id: 'arc', part: 'complexity', num: '11', title: 'Arc & Completion', subtitle: 'Preparation → revelation → change → completion',
    chapters: [11], accent: 'arc', visual: 'arcChart',
    principle: 'At the inciting incident major characters are incomplete. Events reveal true character in contrast to characterization; a few genres change it along the defining dimension. At the climax the finest stories fulfil need and desire at the limits of human experience — nothing left to reveal, nothing left to change.',
    questions: [
      'What does her humanity lack: unthought intelligence, underfelt emotion, unused talent, underlived life?',
      'What event would propel her to the limit of her being? (That is your inciting incident.)',
      'Who do we think she is at the start? Who do we know she is at the climax?',
    ],
    groups: [
      {
        title: '1 · Preparation', fields: [
          { path: 'arc.need', label: 'Need (the void only the author sees)', type: 'textarea', rows: 2 },
          { path: 'arc.needTypes', label: 'Nature of the need', type: 'chips', options: K.NEED_TYPES },
          { path: 'arc.potential', label: 'Take her measure', type: 'sliders', items: K.POTENTIALS, min: 0, max: 10 },
          { path: 'arc.incitingTuned', label: 'Why this inciting incident fits this need', type: 'textarea', rows: 2 },
        ],
      },
      {
        title: '2 · Revelation', fields: [
          { path: 'arc.seemsAtStart', label: 'Who we think she is at the beginning', type: 'textarea', rows: 2 },
          { path: 'arc.isAtClimax', label: 'Who we know she is at the climax', type: 'textarea', rows: 2 },
        ],
      },
      {
        title: '3 · Change', fields: [
          { path: 'arc.theory', label: 'Your theory of identity', type: 'radio', options: K.IDENTITY_THEORIES, compact: true },
          { path: 'arc.type', label: 'Arc', type: 'radio', options: K.ARC_TYPES },
          { path: 'arc.dimensionId', label: 'Arcs along dimension', type: 'custom', component: 'dimensionPicker', showIf: (c) => ['positive', 'negative', 'double'].includes(c.arc.type) },
          { path: 'arc.from', label: 'From', type: 'text', placeholder: 'e.g. Selfishness', showIf: (c) => ['positive', 'negative', 'double'].includes(c.arc.type) },
          { path: 'arc.to', label: 'To', type: 'text', placeholder: 'e.g. Selflessness', showIf: (c) => ['positive', 'negative', 'double'].includes(c.arc.type) },
          { path: 'arc.plot', label: 'Plot of character', type: 'select', options: K.PRIMARY_GENRES.filter((g) => g.family === 'character'), showIf: (c) => ['positive', 'negative', 'double'].includes(c.arc.type) },
          { path: 'arc.lifeView', label: 'She sees life as…', type: 'radio', options: K.LIFE_VIEWS, compact: true },
          { path: 'arc.reaction', label: 'Her reaction to change', type: 'radio', options: K.CHANGE_REACTIONS },
          { path: 'arc.pastEffect', label: 'How the past inflicts itself', type: 'radio', options: K.PAST_EFFECTS },
        ],
      },
      {
        title: 'Turning points', hint: 'Arcs zigzag. If values never change charge the telling freezes into a portrait — repetition is the writer’s mortal enemy. Drag points on the chart to set their charge. (Ch. 11)',
        fields: [{ path: 'arc.turningPoints', type: 'custom', component: 'turningPoints' }],
      },
      {
        title: '4 · Completion', fields: [
          { path: 'arc.climax', label: 'Climax — her final action', type: 'textarea', rows: 2 },
          { path: 'arc.epiphany', label: 'Epiphany (if any)', type: 'textarea', rows: 2, help: 'All-or-nothing: the most magnificent moment, or the most overwritten. (Ch. 6)' },
          { path: 'arc.completion', label: 'How she is completed', type: 'textarea', rows: 2, placeholder: 'Nothing left undiscovered, unexplored, unused, unfelt, unexpressed.' },
        ],
      },
    ],
  },
  {
    id: 'symbolic', part: 'universe', num: '12', title: 'Symbol & Radical', subtitle: 'Realism ↔ symbolism',
    chapters: [12, 13], accent: 'symbol', visual: 'symbolicSpectrum',
    principle: 'Every character is a metaphor for a social or inner identity. The spectrum runs from the radiance of archetypes to allegories, types and the grey outlines of stocks. Veil the symbol behind a never-seen-before characterization: the moment the audience thinks “she’s a symbol for…”, the role flattens.',
    questions: [
      'Which ancient pattern does she echo — and how do you freshen it?',
      'Have you tested her against stereotype — “all Xs are Y”?',
      'Does your audience want realism, nonrealism… or (rarely) radicalism?',
    ],
    groups: [
      {
        title: 'The symbolic spectrum', fields: [
          { path: 'symbolic.spectrum', label: 'Realistic ↔ Symbolic', type: 'slider', min: 0, max: 10, left: 'Realism (personification)', right: 'Symbolism (the symbol)' },
          { path: 'symbolic.level', label: 'Symbolic mode', type: 'radio', options: K.SYMBOLIC_LEVELS },
          { path: 'symbolic.archetypes', label: 'Archetypal chords', type: 'chips', options: K.ARCHETYPES, showIf: (c) => c.symbolic.level === 'archetype' || (c.symbolic.archetypes || []).length > 0 || Number(c.symbolic.spectrum) >= 5 },
          { path: 'symbolic.allegory', label: 'Value personified', type: 'text', placeholder: 'Pettiness, Knowledge, Death…', showIf: (c) => c.symbolic.level === 'allegory' },
          { path: 'symbolic.typeAdjective', label: 'The animated adjective', type: 'text', placeholder: 'The fanatic, the hipster, the cool…', showIf: (c) => c.symbolic.level === 'type' },
          { path: 'symbolic.stockJob', label: 'The job', type: 'text', placeholder: 'Doctor, house painter, golf pro…', showIf: (c) => c.symbolic.level === 'stock' },
          { path: 'symbolic.veil', label: 'The veil — what makes this version never-seen-before', type: 'textarea', rows: 2 },
          { path: 'symbolic.stereotypeChecked', label: 'I have tested her against stereotype (“All Xs are Y”)', type: 'toggle' },
        ],
      },
      {
        title: 'Conventional or radical', fields: [
          { path: 'symbolic.mode', label: 'Character × world', type: 'radio', options: K.REALITY_MODES },
          { path: 'symbolic.subtractions', label: 'Radical subtractions', type: 'chips', options: K.RADICAL_SUBTRACTIONS, showIf: (c) => ['radicalism', 'future'].includes(c.symbolic.mode) },
        ],
      },
    ],
  },
  {
    id: 'genre', part: 'universe', num: '13', title: 'Character in Genre', subtitle: 'Conventions that make expression possible',
    chapters: [14], accent: 'genre', visual: 'genreCard',
    principle: 'Primary genres create content — characters, events, values, emotions — each with a core value, core event, core emotion and core cast. Ten plots of fortune change outer conditions; six plots of character change morality, mentality or humanity.',
    questions: [
      'Which core-cast position does she fill in the story’s genre?',
      'If a subplot merges a second genre, how does it pull her inner life in a new direction?',
    ],
    groups: [
      {
        title: 'Her place in the story’s genre', fields: [
          { path: 'genre', type: 'custom', component: 'genreInfo' },
          { path: 'genre.coreCastRole', label: 'Core-cast position', type: 'custom', component: 'coreCastPicker' },
          { path: 'genre.subplotGenre', label: 'Genre of her subplot', type: 'select', options: K.PRIMARY_GENRES },
          { path: 'genre.notes', label: 'Genre notes', type: 'textarea', rows: 2 },
        ],
      },
    ],
  },
  {
    id: 'action', part: 'universe', num: '14', title: 'Character in Action', subtitle: 'Self-story, MO, scenes',
    chapters: [15, 4], accent: 'action', visual: 'sceneBeats',
    principle: 'Every character tells herself three stories — past, present, future. The future story shapes her modus operandi: the pattern of tactics she uses to pursue desire. In each scene she wants something now, acts on her sense of probability, meets a surprising counteraction, and the value at stake changes charge.',
    questions: [
      'What do the characters want at the moment? What do they do to get it?',
      'What surprising counteraction blocks the way? How do they react? What next?',
    ],
    groups: [
      {
        title: 'Self-story', hint: 'All statements of self are self-serving. Decide what is true, false, or both. (Ch. 4, 15)',
        fields: [
          { path: 'action.selfStory.past', label: 'Past — how she explains who she became', type: 'textarea', rows: 2 },
          { path: 'action.selfStory.present', label: 'Present — her reading of where she stands', type: 'textarea', rows: 2 },
          { path: 'action.selfStory.future', label: 'Future — her wished-for life and ideal identity', type: 'textarea', rows: 2 },
        ],
      },
      {
        title: 'Modus operandi', fields: [
          { path: 'action.mo.theme', label: 'MO theme', type: 'custom', component: 'moPicker' },
          { path: 'action.mo.description', label: 'Her MO in her own words', type: 'textarea', rows: 2 },
          { path: 'action.mo.twist', label: 'The twist', type: 'textarea', rows: 2 },
          { path: 'action.probability', label: 'Sense of probability', type: 'textarea', rows: 2, placeholder: '“Given this situation, if I do X, in all probability Y will happen.”' },
        ],
      },
      {
        title: 'Scenes', hint: 'Build scenes around the turning point: scene-objective → action → counteraction → surprise → value change → reaction. (Ch. 15)',
        fields: [{ path: 'action.scenes', type: 'custom', component: 'scenes' }],
      },
    ],
  },
  {
    id: 'performance', part: 'universe', num: '15', title: 'Character in Performance', subtitle: 'Discovery & recognition',
    chapters: [16], accent: 'performance', visual: 'performanceStar',
    principle: 'Audiences want discovery — strangers they have never met — and recognition — a humanity that mirrors their own. Characters perform seven functions for them, from intellectual pleasure to insight into human nature.',
    questions: [
      'What will the audience discover in her that they have never seen?',
      'Where will they recognise themselves?',
    ],
    groups: [
      {
        title: 'Seven functions', fields: [
          { path: 'performance.functions', type: 'checklist', options: K.PERFORMANCE_FUNCTIONS, columns: 2 },
          { path: 'performance.notes', label: 'Notes', type: 'textarea', rows: 2 },
        ],
      },
      {
        title: 'Discovery & recognition', fields: [
          { path: 'performance.discovery', label: 'Discovery — what is new and strange in her', type: 'textarea', rows: 2 },
          { path: 'performance.recognition', label: 'Recognition — the humanity we share', type: 'textarea', rows: 2 },
        ],
      },
      {
        title: 'Suspense = curiosity + concern', hint: 'Curiosity without concern makes a case study; concern without curiosity, mindless longing. (Ch. 16)',
        fields: [
          { path: 'performance.curiosity', label: 'Curiosity about her nature', type: 'slider', min: 0, max: 10, left: 'None', right: 'Burning' },
          { path: 'performance.concern', label: 'Concern for her well-being', type: 'slider', min: 0, max: 10, left: 'None', right: 'Deep' },
        ],
      },
    ],
  },
  {
    id: 'relationships', part: 'cast', num: '16', title: 'Cast Relationships', subtitle: 'Every member draws out every other',
    chapters: [17], accent: 'cast', visual: 'relationshipWeb',
    principle: 'No one reveals her complete self to anyone. Surround her with a cast, each member geared to draw out a specific trait or dimension, so that by the climax the audience knows her better than she knows herself. Oppose characters in complex ways, never on a single axle.',
    questions: [
      'Which of her dimensions does each cast member activate?',
      'Do the contrasts between cast members distinguish every role from every other?',
    ],
    groups: [
      { title: 'Links', fields: [{ path: 'relationships', type: 'custom', component: 'relationships' }] },
      { title: 'Notes', fields: [{ path: 'notes', label: 'Free notes', type: 'textarea', rows: 4 }] },
    ],
  },
];

export const SECTION_BY_ID: Record<string, SectionDef> = Object.fromEntries(SECTIONS.map((s) => [s.id, s]));

export function sectionFields(section: SectionDef): SectionField[] {
  return section.groups.flatMap((g) => g.fields.map((f) => ({ ...f, group: g })));
}

// Story-level settings (the world and genre all characters share).
export const STORY_FIELDS: FieldDef[] = [
  { path: 'logline', label: 'Logline', type: 'textarea', rows: 2 },
  { path: 'media', label: 'Medium', type: 'chips', options: K.MEDIA },
  { path: 'format', label: 'Format', type: 'text', placeholder: 'Novel, play, feature, longform series…' },
  { path: 'causality', label: 'What makes things happen?', type: 'radio', options: K.CAUSALITY, compact: true },
  { path: 'theme', label: 'Meaning — how and why life changes', type: 'textarea', rows: 2, help: 'Discovered while exploring character, never imposed. (Ch. 4)' },
  { path: 'coreValue.positive', label: 'Core value (+)', type: 'text', placeholder: 'Love, Justice, Freedom…' },
  { path: 'coreValue.negative', label: 'Core value (−)', type: 'text', placeholder: 'Hate, Injustice, Slavery…' },
  { path: 'genre.primary', label: 'Primary genres', type: 'custom', component: 'genrePicker' },
  { path: 'genre.presentational', label: 'Presentational genres', type: 'chips', options: K.PRESENTATIONAL_GENRES },
  { path: 'genre.combination', label: 'Genre combination', type: 'radio', options: K.GENRE_COMBINATIONS, compact: true },
  { path: 'world.period', label: 'Period', type: 'text' },
  { path: 'world.duration', label: 'Duration of the telling', type: 'text', placeholder: 'Two hours? A lifetime?' },
  { path: 'world.location', label: 'Location', type: 'text' },
  { path: 'world.levels', label: 'Levels of conflict', type: 'chips', options: K.CONFLICT_LEVELS },
  { path: 'world.notes', label: 'World notes', type: 'textarea', rows: 3 },
];
