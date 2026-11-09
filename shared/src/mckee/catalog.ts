// Catalog of the building blocks Robert McKee lays out in CHARACTER
// (Twelve, 2021). Every list here is the book's own taxonomy; descriptions
// are paraphrased summaries with chapter references, not quotations.
// Shared by the browser UI, the analysis engine and the AI coach prompt.

export const BOOK = {
  title: 'Character: The Art of Role and Cast Design for Page, Stage, and Screen',
  author: 'Robert McKee',
  year: 2021,
};

export const CHAPTERS: Record<number, string> = {
  1: 'Characters Versus People',
  2: 'The Aristotle Debate',
  3: 'An Author Prepares',
  4: 'Character Inspiration: Outside In',
  5: 'Character Inspiration: Inside Out',
  6: 'Roles Versus Characters',
  7: 'The Outer Character',
  8: 'The Inner Character',
  9: 'The Dimensional Character',
  10: 'The Complex Character',
  11: 'The Completed Character',
  12: 'The Symbolic Character',
  13: 'The Radical Character',
  14: 'Character in Genre',
  15: 'Character in Action',
  16: 'Character in Performance',
  17: 'Cast Design',
};

/** An option of a McKee list: stable id (stored), English label and description. */
export interface Opt {
  id: string;
  label: string;
  desc: string;
  left?: string;
  right?: string;
  short?: string;
  madMen?: string;
  ring?: number;
  level?: string;
  twist?: string;
  group?: string;
  char?: string;
  world?: string;
}

export interface Genre {
  id: string;
  label: string;
  family: 'fortune' | 'character';
  coreValue: string;
  coreEvent: string;
  coreEmotion: string;
  /** Core-cast positions: stored as values (English), translated only for display. */
  coreCast: string[];
  arc?: 'positive' | 'negative';
  quality?: string;
}

const opt = (id: string, label: string, desc = '', extra: Partial<Opt> = {}): Opt => ({ id, label, desc, ...extra });

// ── Ch. 3–5 · Inspiration ────────────────────────────────────────────────
export const INSPIRATION_SOURCES = [
  opt('reality', 'Reality', 'People, places, objects. Reimagine, never copy: look for the telling detail beneath the surface.'),
  opt('medium', 'Medium', 'Page, stage or screen shapes how a character must express herself.'),
  opt('genre', 'Genre', 'A line or image from the kind of story you love to read or watch.'),
  opt('events', 'Events · Magic If', '"What would happen if…?" — an inciting incident that summons the characters who react to it.'),
  opt('theme', 'Theme', 'Meaning discovered while exploring — never a belief imposed on the cast.'),
  opt('biography', 'Biography', 'Backstory patterns: repeated emotional experiences that deposit lifelong residues.'),
  opt('selfStory', 'Self-story', 'Sit the character down and let him tell his life — then judge truth from self-serving spin.'),
  opt('insideOut', 'Inside out', 'Writing in-character: "If I were this character in this situation, what would I do?"'),
];

export const RESEARCH_KINDS = [
  opt('personal', 'Personal', 'Inventory your own emotional memories and transfer, transform or reverse them.'),
  opt('imaginative', 'Imaginative', 'Walk around the character 360° in your mind before analysing anything.'),
  opt('bookBound', 'Book-bound', 'Study psychology, sociology, history until insight beats cliché.'),
  opt('grounded', 'Grounded', 'Go where the scenes happen; observe and interview like a documentarian.'),
];

export const APPROACHES = [
  opt('outsideIn', 'Outside in', 'Start from setting, society, genre and traits; dig down toward the core.'),
  opt('insideOut', 'Inside out', 'Start in the character’s consciousness and act outward, in-character.'),
  opt('alternating', 'Alternating', 'The double path most writers take: step in, act, step out, judge, repeat.'),
];

export const MEDIA = [
  opt('page', 'Page', 'Prose usually narrates in the past tense: keen memory, discerning eye, subtext.'),
  opt('stage', 'Stage', 'Present-tense, more verbal than visual: expressive dialogue.'),
  opt('screen', 'Screen', 'Present-tense, more visual than verbal: looks and gestures.'),
];

export const CAUSALITY = [
  opt('plot', 'Plot-driven', 'Physical, social and coincidental forces cause the major events.'),
  opt('character', 'Character-driven', 'The principal characters’ desires and choices cause the major events.'),
  opt('balanced', 'Balanced', 'Causes meld: what happens and to whom weigh equally.'),
];

// ── Ch. 6 · Roles versus characters ─────────────────────────────────────
export const CIRCLES = [
  opt('protagonist', 'Protagonist', 'The star at the centre of the cast’s solar system.', { ring: 0 }),
  opt('first', 'First circle', 'Major characters who help or hinder; potential for a story of their own.', { ring: 1 }),
  opt('second', 'Second circle', 'Middle-ground roles: one dimension or a single vivid trait.', { ring: 2 }),
  opt('third', 'Third circle', 'Bit parts, walk-ons and crowds: the social density of the setting.', { ring: 3 }),
];

export const CAST_FUNCTIONS = [
  opt('support', 'Support role', 'Changes the course of events.'),
  opt('service', 'Service role', 'Facilitates scenes but does not turn the story.'),
];

export const PROTAGONIST_TYPES = [
  opt('single', 'Single', 'One human being — the usual case.'),
  opt('co', 'Co-protagonists', 'A duet with sharply contrasting qualities (Thelma & Louise).'),
  opt('group', 'Group', 'Many who share one desire and rise or fall together.'),
  opt('multi', 'Multi-protagonist', 'Several story lines, each with its own protagonist.'),
  opt('split', 'Split', 'Two sides of one personality fight for control (Jekyll/Hyde).'),
  opt('passive', 'Passive', 'Outwardly adrift, inwardly at war.'),
  opt('switching', 'Switching', 'Appears to be the protagonist, then exits or turns.'),
  opt('metaphorical', 'Metaphorical', 'An animal, object or cartoon that makes free-will choices.'),
];

export const SPECIAL_ROLES = [
  opt('focal', 'Focal', 'Draws the most interest — usually, not always, the protagonist.'),
  opt('foil', 'Foil', 'Contrasting qualities that illuminate the protagonist.'),
  opt('pov', 'POV', 'Guides the reader/audience through the telling.'),
  opt('narrator', 'Narrator', 'Provides exposition in first, second or third person.'),
  opt('antagonist', 'Antagonist', 'Directly opposes the protagonist’s struggle to rebalance life.'),
  opt('subplot', 'Subplot protagonist', 'Leads a subplot that crosses (support) or parallels (service) the main plot.'),
];

export const PROTAGONIST_ESSENTIALS = [
  opt('willpower', 'Willpower', 'Can face the ultimate dilemma, decide, and act — exhausting her will before she fails.'),
  opt('capabilities', 'Multiple capabilities', 'Mental, emotional and physical capacities that make her choices credible.'),
  opt('underdog', 'Underdog status', 'Weighed against all forces of antagonism, she has a chance — just a chance.'),
  opt('empathy', 'Empathic nature', 'Holds the story’s Center of Good, where the audience attaches its empathy.'),
  opt('intrigue', 'Intrigue', 'Contradictions that make us ask, “Who is this person?”'),
  opt('depth', 'Length & depth', 'Occupies the most time; known in greatest depth by the climax.'),
  opt('change', 'Capacity for change', 'The cast member most able to arc (though realism rarely changes the core).'),
  opt('insight', 'Insight', 'Most likely to undergo an epiphany — a flash of hidden truth.'),
];

export const FOIL_FUNCTIONS = [
  opt('illuminate', 'Illuminates', 'Contrast sharpens our image of the protagonist.'),
  opt('sees', 'Sees what she cannot', 'A calm voice of reason when desire blinds her.'),
  opt('morality', 'Contradicts her morality', 'A morally superior or inferior counterpoint.'),
  opt('guides', 'Guides us to her', 'A window into a mysterious protagonist.'),
  opt('epiphany', 'Interprets her epiphany', 'Reads changes she keeps inward.'),
  opt('complexity', 'Interprets her complexities', 'One of several foils that reveal a many-sided lead.'),
  opt('grounds', 'Grounds her in the setting', 'Down-to-earth, typical of society — keeps a larger-than-life lead credible.'),
];

export const NARRATOR_PERSONS = [
  opt('first', 'First person', 'A character tells the story as autobiography.'),
  opt('second', 'Second person', '“You” turns the reader into the protagonist.'),
  opt('third', 'Third person', 'An author-invented voice of knowledge outside events.'),
];

export const RELIABILITY = [
  opt('reliable', 'Reliable', 'The audience can trust it not to bend the truth.'),
  opt('unreliable', 'Unreliable', 'Confused, ignorant or dishonest — for credibility or curiosity.'),
];

export const UNRELIABLE_CAUSES = [
  opt('memory', 'Faulty memory'),
  opt('knowledge', 'Faulty knowledge / immaturity'),
  opt('deceit', 'Deliberate deceit'),
  opt('instability', 'Unstable mind'),
];

// ── Ch. 7 · The outer character ─────────────────────────────────────────
export const CHARACTERIZATION_FUNCTIONS = [
  opt('credibility', 'Credibility', 'An honest link between traits and what she says, feels and does.'),
  opt('originality', 'Originality', 'Begins with specificity: researched, observed, one-of-a-kind detail.'),
  opt('intrigue', 'Intrigue', 'A surface that makes us want the truth behind the mask. Clichés kill it.'),
];

export const PUBLIC_SPECTRA = [
  opt('sophistication', 'Sophisticated ↔ Unsophisticated', '', { left: 'Unsophisticated', right: 'Sophisticated' }),
  opt('sociability', 'Social ↔ Antisocial', '', { left: 'Antisocial', right: 'Social' }),
  opt('charisma', 'Charismatic ↔ Boring', '', { left: 'Boring', right: 'Charismatic' }),
];

export const PRIVATE_SPECTRA = [
  opt('generosity', 'Generous ↔ Selfish', '', { left: 'Selfish', right: 'Generous' }),
  opt('encouragement', 'Encouraging ↔ Fault-finding', '', { left: 'Fault-finding', right: 'Encouraging' }),
  opt('concern', 'Concerned ↔ Unconcerned', '', { left: 'Unconcerned', right: 'Concerned' }),
];

export const BIG_FIVE = [
  opt('openness', 'Openness', 'Curiosity, independence, love of the new — or pragmatic, persevering, at worst dogmatic.', { left: 'Closedness', right: 'Openness' }),
  opt('conscientiousness', 'Conscientiousness', 'Honour, discipline, planning — or spontaneous, at worst unreliable and sloppy.', { left: 'Capriciousness', right: 'Conscientiousness' }),
  opt('extraversion', 'Extraversion', 'Sociable, talkative, assertive — or shy and reflective, perceived as aloof.', { left: 'Introversion', right: 'Extraversion' }),
  opt('agreeableness', 'Agreeableness', 'Compassionate and generous — or competitive, suspicious, antagonistic.', { left: 'Argumentativeness', right: 'Agreeableness' }),
  opt('rationality', 'Rationality', 'Calm and constant (at the limit, cold) — or quick, extreme negative emotion.', { left: 'Neuroticism', right: 'Rationality' }),
];

export const INTELLIGENCES = [
  opt('iq', 'IQ', 'Analytical thinking, spatial recognition, problem solving.'),
  opt('eq', 'EQ', 'Perceiving subtle feelings in oneself and others.'),
  opt('creative', 'Creative', 'The power of imagination.'),
  opt('curiosity', 'Curiosity', 'The drive to know.'),
  opt('cultural', 'Cultural', 'The ability to thrive in foreign settings.'),
];

export const HUMAN_NATURE_VIEWS = [
  opt('good', 'Good'), opt('evil', 'Evil'), opt('both', 'Some of both'), opt('unsure', 'Won’t say'),
];

export const CONFLICT_LEVELS = [
  opt('physical', 'Physical', 'Nature, the man-made world, the body, time.'),
  opt('social', 'Social', 'Institutions and the people inside them.'),
  opt('personal', 'Personal', 'Family, friends, lovers.'),
  opt('inner', 'Inner', 'Self against self — conscious and subconscious.'),
];

export const SETTING_RELATIONS = [
  opt('extension', 'Setting as extension', 'Home, car, job, club become extensions of her core self.'),
  opt('antagonism', 'Setting as antagonist', 'The world releases forces that block her desire.'),
  opt('metaphor', 'Setting & cast as metaphor', 'Like puzzle pieces, setting and cast define each other.'),
  opt('flood', 'Setting floods her mind', 'Objects, people and memories stream through her thoughts.'),
  opt('frame', 'Setting as frame', 'The world recedes; character portraits fill the foreground.'),
  opt('indifferent', 'Indifferent setting', 'A world so separate she seems marooned.'),
  opt('willful', 'Willful objects', 'Things seem to have a will of their own.'),
  opt('objectsCharacters', 'Objects become characters', 'Chess pieces, trees, raccoons join the cast.'),
];

export const CHARACTERIZATION_CHANGE = [
  opt('rebellion', 'Rebellion', 'She changes her setting to steer who she becomes.'),
  opt('travel', 'Travel', 'Life abroad breeds a hybrid identity.'),
  opt('timePocket', 'Time pocket', 'Nostalgic past, rat-race future, or hedonist present.'),
  opt('internet', 'The internet', 'Placeless, anonymous, instant — and yet real.'),
];

export const EXPRESSION_TECHNIQUES = [
  opt('simile', 'Simile', 'An analogy to other people or things.'),
  opt('metaphor', 'Metaphor', 'A direct link to a figure from history, myth or pop culture.'),
  opt('correlation', 'Correlation', 'Characterization as an extension of habits or possessions.'),
  opt('contrast', 'Contrast', 'A general difference from a type.'),
  opt('opposition', 'Opposition', 'A sharp contradiction in a phrase.'),
  opt('telling', 'Telling', 'Plain descriptive statement (prose needs it more than stage or screen).'),
  opt('showing', 'Showing', 'An action for the eye or ear that activates imagination.'),
  opt('selfAssessment', 'Self-assessment', 'What she says about herself — true or not, it’s a clue.'),
  opt('otherAssessment', 'Other-assessment', 'What another says about her — weigh the axe being ground.'),
];

// Explicit-trait topics from Ch. 7 (each can be marked as dramatized).
export const EXPLICIT_TRAITS = [
  opt('nameMeaning', 'Name & nickname', 'What the name connotes. Avoid blatant symbolism unless you want laughs or allegory.', { short: 'Name' }),
  opt('age', 'Age', '', { short: 'Age' }),
  opt('appearance', 'Naked', 'Height, weight, muscle and fat, hair, skin, posture, walk.', { short: 'Body' }),
  opt('wardrobe', 'Clothed', 'What she’d buy if she could — and what’s actually in her closet.', { short: 'Clothes' }),
  opt('gender', 'Gender', '', { short: 'Gender' }),
  opt('eros', 'Sex life', 'What she finds irresistibly erotic, and what (if anything) she does about it.', { short: 'Eros' }),
  opt('voice', 'Vocal tone & language', 'Vocabulary, sentence structure, pitch, diction, imagery.', { short: 'Voice' }),
  opt('face', 'Face & eyes', 'What lives in her eyes; the expressions that flit across her face.', { short: 'Face' }),
  opt('gestures', 'Gestures & energy', 'Illustrative, symbolic and imitative gestures; tics, mannerisms, energy.', { short: 'Gesture' }),
  opt('profession', 'Profession', 'What she does for a living and how much of her identity it holds.', { short: 'Job' }),
  opt('recreation', 'Recreation', 'A second identity taken from play.', { short: 'Play' }),
  opt('home', 'Home', 'The biggest extra-identity: picture it, then look inside.', { short: 'Home' }),
  opt('transport', 'Transportation', 'The other big extension of self.', { short: 'Wheels' }),
  opt('knowledge', 'Knowledge', 'Formal education and life lessons passed.', { short: 'Knows' }),
  opt('ignorance', 'Ignorance', 'What she doesn’t know — and lessons flunked.', { short: 'Blind spots' }),
  opt('beliefs', 'Religion & beliefs', 'From whether God exists to whether people can be trusted.', { short: 'Beliefs' }),
  opt('conversation', 'Conversation', 'Recurring topics: what she talks about is what she thinks about.', { short: 'Talk' }),
  opt('manners', 'Manners', 'The quality of respect she shows people.', { short: 'Manners' }),
];

// ── Ch. 5 · Four selves ──────────────────────────────────────────────────
export const SELF_LEVELS = [
  opt('social', 'Social self', 'Public personae shaped by power: boss/employee, cop/criminal, server/served.', { madMen: 'Work life', short: 'Social' }),
  opt('personal', 'Personal self', 'Intimate personae for family, friends, lovers.', { madMen: 'Intimate life', short: 'Personal' }),
  opt('core', 'Core (private) self', 'The observing consciousness that decides and judges.', { madMen: 'Secret life', short: 'Core' }),
  opt('hidden', 'Hidden self', 'The subconscious: contradictory drives that surface under sudden pressure.', { madMen: 'Subconscious life', short: 'Hidden' }),
];

export const SELF_VARIATIONS = [
  opt('stable', 'Stable core', 'A single identity observing its many past selves.'),
  opt('extended', 'Extended self', 'Identity includes everything “mine” — things, people, profession.'),
  opt('protected', 'Protected self', 'A secret back-shop of willpower, reason and moral sense.'),
  opt('vanished', 'Vanishing self', 'Extreme stress erodes the core; she de-dimensionalizes.'),
];

// ── Ch. 8 · The inner character ─────────────────────────────────────────
export const MOTIVATIONS = [
  opt('immortality', 'Immortality', 'Leave something behind that says “I was here.”'),
  opt('survival', 'Survival', 'Preserve self, family, tribe — even at moral cost.'),
  opt('balance', 'Balance', 'Restore sovereignty when life tilts (justice, revenge).'),
  opt('pleasure', 'Pleasure', 'Irresistible even when it buys future pain.'),
  opt('sex', 'Sex', 'Freud’s single cause — powerful, rarely the whole story.'),
  opt('power', 'Power', 'Constantly measuring rank above and below.'),
  opt('empathy', 'Empathy', 'The hunger to belong; shared suffering binds the tribe.'),
  opt('more', 'More', 'Greed → envy → jealousy: enough is never enough.'),
  opt('interest', 'Interest', '“Want to” over “have to”: doing things for their own sake.'),
  opt('meaning', 'Meaning', 'Purpose against the vertigo of a meaningless life.'),
  opt('fulfillment', 'Fulfillment', 'Realizing untapped mental and emotional potential.'),
  opt('transcendence', 'Transcendence', 'A longing for godlike knowledge beyond the mind’s reach.'),
];

export const MORE_KINDS = [
  opt('greed', 'Greed', 'The craving for more.'),
  opt('envy', 'Envy', 'Someone has what she can’t — so she’d destroy it.'),
  opt('jealousy', 'Jealousy', 'Envy plus a rival for the beloved.'),
];

export const CHARGES = [
  opt('positive', 'Positive (+)', 'Life swings sharply up — Romeo meets Juliet.'),
  opt('negative', 'Negative (−)', 'Life swings darkly down — Hamlet learns of the murder.'),
];

export const DESIRE_KINDS = [
  opt('physical', 'Something to hold', 'A physical object — the dead shark in Jaws.'),
  opt('situation', 'A situation', 'Committed love, a family reunion, a throne.'),
  opt('experience', 'An experience', 'An identity, a meaning, a spiritual transformation.'),
];

export const DILEMMA_KINDS = [
  opt('positive', 'Positive dilemma', 'Two equally desirable but irreconcilable goods.'),
  opt('negative', 'Negative dilemma', 'The lesser of two evils.'),
];

export const VALUE_SPECTRA = [
  opt('courage', 'Courage ↔ Cowardice', '', { left: 'Cowardice', right: 'Courage' }),
  opt('hope', 'Hope ↔ Despair', '', { left: 'Despair', right: 'Hope' }),
  opt('love', 'Love ↔ Hate', '', { left: 'Hate', right: 'Love' }),
  opt('honesty', 'Honesty ↔ Dishonesty', '', { left: 'Dishonesty', right: 'Honesty' }),
];

export const EMOTION_PAIRS = [
  opt('love', 'Love / Hate', '', { left: 'Hate', right: 'Love' }),
  opt('amity', 'Amity / Anger', '', { left: 'Anger', right: 'Amity' }),
  opt('joy', 'Joy / Grief', '', { left: 'Grief', right: 'Joy' }),
  opt('surprise', 'Surprise / Shock', '', { left: 'Shock', right: 'Surprise' }),
  opt('pleasure', 'Pleasure / Disgust', '', { left: 'Disgust', right: 'Pleasure' }),
  opt('courage', 'Courage / Fear', '', { left: 'Fear', right: 'Courage' }),
];

export const FEELINGS = [
  opt('pride', 'Pride ↔ Shame', '', { left: 'Shame', right: 'Pride' }),
  opt('hope', 'Hope ↔ Premonition', '', { left: 'Premonition', right: 'Hope' }),
  opt('heart', 'Light heart ↔ Grumpy soul', '', { left: 'Grumpy', right: 'Light-hearted' }),
  opt('trust', 'Trust ↔ Suspicion', '', { left: 'Suspicion', right: 'Trust' }),
];

export const DECISION_PATHS = [
  opt('circumstance', 'Circumstance decides', 'Life pushes her one way, like it or not.'),
  opt('subconscious', 'The subconscious decides', 'A choice her core self never notices or rationalizes away.'),
  opt('instinct', 'Instinct', 'Options flash; one takes hold.'),
  opt('deliberation', 'Deliberation', 'Pros, cons, consequences — often before her greatest mistakes.'),
];

// ── Ch. 9 · Dimensions ───────────────────────────────────────────────────
export const DIMENSION_TYPES = [
  opt('1', 'Characterization ↔ Characterization', 'Two outer traits clash (immaculate makeup, unbrushed teeth).'),
  opt('2', 'Characterization ↔ True character', 'The mask contradicts who she is.'),
  opt('3', 'Characterization ↔ Subconscious desire', 'Hyperactive outside, deeply calm beneath.'),
  opt('4', 'Conscious desire ↔ Conscious desire', 'Two wants she knows about and can’t reconcile.'),
  opt('5', 'Conscious desire ↔ Subconscious desire', 'Passion for the fiancée vs. fear of commitment.'),
  opt('6', 'Subconscious ↔ Subconscious', 'Sacrifice for loved ones vs. sacrifice others for ambition.'),
];

export const DIMENSION_SUGGESTIONS: [string, string][] = [
  ['Brilliant', 'Blundering'], ['Truthful', 'Deceitful'], ['Loyal', 'Treacherous'], ['Calm', 'Panicked'],
  ['Generous', 'Selfish'], ['Proud', 'Shamed'], ['Fearless', 'Terrified'], ['Guilt-ridden', 'Callous'],
  ['Pragmatic', 'Idealistic'], ['Obedient', 'Defiant'], ['Protecting', 'Jeopardizing'], ['Supportive', 'Subversive'],
  ['Intelligent', 'Foolish'], ['Impulsive', 'Reflective'], ['Independent', 'Dependent'], ['Kind', 'Cruel'],
  ['Strong', 'Weak'], ['Self-aware', 'Self-deceived'], ['Faithful', 'Unfaithful'], ['Cool', 'Raging'],
];

// ── Ch. 10 · The complex character ──────────────────────────────────────
export const ANTAGONISM_FORCES = [
  opt('nature', 'Nature', 'Random as a tornado, fierce as a wolf pack, morally indifferent.', { level: 'physical' }),
  opt('manmade', 'Man-made world', 'Pollution, war, systems we built and share blame for.', { level: 'physical' }),
  opt('body', 'The body', 'Illness, ageing, an unfortunate nose.', { level: 'physical' }),
  opt('time', 'Time', 'Never enough of it; in time it erases all.', { level: 'physical' }),
  opt('social', 'Institutions', 'Hierarchies that shape, use and dehumanize.', { level: 'social' }),
  opt('personal', 'Intimates', 'Family, friends, lovers: feelings run deepest here.', { level: 'personal' }),
  opt('inner', 'Herself', 'Dark impulses and contradictory desires within.', { level: 'inner' }),
];

export const INNER_CONFLICTS = [
  opt('lessMore', 'Less vs. More', 'The quiet life vs. the hunger to be seen.', { level: 'conscious' }),
  opt('beliefSkepticism', 'Belief vs. Skepticism', 'Idiot vs. convict: illusion animates action; doubt paralyses it.', { level: 'conscious' }),
  opt('loveHate', 'Love vs. Hate', 'Conscious love masking subconscious loathing.', { level: 'conscious-subconscious' }),
  opt('fearCourage', 'Fear vs. Courage', 'A conscious choice to act while fear grips her.', { level: 'conscious-subconscious' }),
  opt('selfOther', 'Self vs. Other', 'Self-love against love of others — the daily war beneath awareness.', { level: 'subconscious' }),
  opt('illusionDelusion', 'Illusion vs. Delusion', 'A false perception hardening into a false reality.', { level: 'subconscious' }),
];

export const DEPTH_TRAITS = [
  opt('ironicSelfAwareness', 'Ironic self-awareness', 'Rarely fooled by her own mind.'),
  opt('insightOthers', 'Insight into others', 'Never fooled by society’s pretensions.'),
  opt('intelligence', 'Intelligence', 'Gathers knowledge and commands the logic to use it.'),
  opt('suffering', 'A history of suffering', 'Has felt pain, caused pain, and lived with the guilt.'),
  opt('experience', 'Broad experience over time', 'Depth needs wide experience and, above all, time.'),
  opt('attention', 'Focused attention', 'Listens intently, reads subtext.'),
  opt('beauty', 'Love of beauty', 'Sensitivity so sharp beauty almost hurts.'),
  opt('calm', 'Calm', 'Passions under control whatever the threat.'),
  opt('skeptic', 'Cynic & skeptic', 'Tests every claim against her own mind.'),
  opt('meaning', 'Searcher for meaning', 'Looks for purpose between living for self and for others.'),
];

// ── Ch. 11 · The completed character ────────────────────────────────────
export const NEED_TYPES = [
  opt('intelligence', 'Unthought intelligence'),
  opt('emotion', 'Underfelt emotion'),
  opt('talent', 'Unused talent'),
  opt('life', 'Underlived life'),
];

export const POTENTIALS = [
  opt('iq', 'IQ'), opt('eq', 'EQ'), opt('willpower', 'Willpower'), opt('imagination', 'Imagination'),
  opt('empathy', 'Empathy'), opt('courage', 'Courage'),
];

export const IDENTITY_THEORIES = [
  opt('perpetual', 'Perpetual identity', 'Experience makes her more and more herself; the core holds.'),
  opt('changing', 'Changing identity', 'Change is possible — and arcs along her defining dimension.'),
];

export const ARC_TYPES = [
  opt('revealed', 'Revealed, not changed', 'The vast majority: the audience’s insight changes, she doesn’t.'),
  opt('positive', 'Positive arc', 'Ends on a positive charge after alternating cycles.'),
  opt('negative', 'Negative arc', 'Deepening cycles that end in tragedy.'),
  opt('double', 'Double / ironic arc', 'Crisscrossing arcs, or out and back again.'),
];

export const LIFE_VIEWS = [
  opt('fate', 'Life as Fate', 'Looks backward; trapped in a life not her own; self-alienated.'),
  opt('destiny', 'Life as Destiny', 'Looks forward; chooses her own path; self-empathetic.'),
];

export const CHANGE_REACTIONS = [
  opt('cosmetic', 'Merely cosmetic', 'She’ll be her old self soon.'),
  opt('better', 'Transformed for the better', 'A better self emerges.'),
  opt('grave', 'The grave of a better self', 'The past buries the woman she was.'),
  opt('trueSelf', 'Discovery of the true self', 'The self repressed since childhood finally lives.'),
];

export const PAST_EFFECTS = [
  opt('obsession', 'Obsession', 'Trauma re-enters with its original edge; no scar forms.'),
  opt('repression', 'Repression', 'Buried, it festers into neurosis.'),
  opt('fantasy', 'Fantasy', 'The mind rewrites the past into events it never lived.'),
  opt('balance', 'Balance', 'She faces the truth without excess or distortion.'),
];

// ── Ch. 12–13 · Symbolic and radical ────────────────────────────────────
export const SYMBOLIC_LEVELS = [
  opt('none', 'Realistic', 'Rooted in observation; personification outweighs symbol.'),
  opt('archetype', 'Archetype', 'Turns an essence into a character. Brightest, same inside as out.'),
  opt('allegory', 'Allegory', 'Turns a single value into a character.'),
  opt('type', 'Type', 'Turns a behaviour into a character — an animated adjective.'),
  opt('stock', 'Stock', 'Turns a job into a character.'),
];

export const ARCHETYPES = [
  'God', 'Devil', 'Angel', 'Demon', 'Mother / Queen', 'Father / King', 'Child / Prince / Princess', 'Servant',
  'Hero', 'Rebel', 'Monster / Villain', 'Trickster / Clown', 'Helper / Sage / Mentor', 'Magician / Wizard',
  'Earth Mother', 'Crone / Wise Woman', 'Outcast', 'Star-crossed Lover', 'Warrior', 'Healer', 'Goddess',
].map((label: string) => opt(label.toLowerCase().replace(/[^a-z]+/g, '-'), label));

export const REALITY_MODES = [
  opt('realism', 'Realism', 'Conventional character, conventional world.', { char: 'conventional', world: 'conventional' }),
  opt('nonrealism', 'Nonrealism', 'Conventional character, unconventional world (magic, the supernatural, song).', { char: 'conventional', world: 'unconventional' }),
  opt('radicalism', 'Radicalism', 'Unconventional character, unconventional world (absurdism, antistructure).', { char: 'unconventional', world: 'unconventional' }),
  opt('future', 'The future', 'Unconventional character in a conventional world — still largely unexplored.', { char: 'unconventional', world: 'conventional' }),
];

export const RADICAL_SUBTRACTIONS = [
  opt('selfAwareness', 'Subtract self-awareness', 'The dramatic becomes a comic obsessive — then a monomaniac.'),
  opt('depth', 'Subtract depth', 'Humanity shrinks into an inner void.'),
  opt('change', 'Subtract change', 'Flat characters contract into themselves.'),
  opt('identity', 'Subtract identity', 'No stable self to arc.'),
  opt('purpose', 'Subtract purpose', 'No desire to pursue.'),
  opt('unity', 'Subtract unity', 'Selves that no longer cohere.'),
  opt('maturity', 'Subtract maturity', 'Forever a child.'),
  opt('conscience', 'Subtract conscience', 'No moral pull at all.'),
  opt('belief', 'Subtract belief', 'Nothing animates action.'),
];

// ── Ch. 14 · Genre ───────────────────────────────────────────────────────
const genre = (
  id: string,
  label: string,
  family: Genre['family'],
  value: string,
  event: string,
  emotion: string,
  cast: string[],
  extra: Partial<Genre> = {},
): Genre => ({ id, label, family, coreValue: value, coreEvent: event, coreEmotion: emotion, coreCast: cast, ...extra });

export const PRIMARY_GENRES = [
  genre('action', 'Action', 'fortune', 'Life vs. Death', 'Hero at the mercy of the villain', 'Excitement', ['Hero', 'Villain', 'Victim']),
  genre('horror', 'Horror', 'fortune', 'Survival vs. Damnation', 'Victim at the mercy of the monster', 'Terror', ['Monster', 'Victim']),
  genre('crime', 'Crime', 'fortune', 'Justice vs. Injustice', 'Hero at the mercy of the villain', 'Suspense', ['Antihero', 'Villain', 'Victim']),
  genre('love', 'Love', 'fortune', 'Committed vs. Lost love', 'An act of love', 'Longing for love', ['Lover', 'Beloved']),
  genre('domestic', 'Domestic', 'fortune', 'Unity vs. Breakup', 'A family unites or splinters', 'Longing for togetherness', ['Family member']),
  genre('war', 'War', 'fortune', 'Victory vs. Defeat', 'The decisive battle', 'Harrowing fear', ['Soldier', 'Enemy']),
  genre('social', 'Social', 'fortune', 'Problem vs. Solution', 'Recognition of a crisis', 'Moral indignation', ['Social leader', 'Victim']),
  genre('political', 'Political', 'fortune', 'Powerful vs. Powerless', 'Power won or lost', 'Hunger for victory', ['Partisan (side A)', 'Partisan (side B)']),
  genre('epic', 'Modern Epic', 'fortune', 'Tyranny vs. Freedom', 'An act of rebellion', 'Moral outrage', ['Tyrant', 'Rebel']),
  genre('enterprise', 'Enterprise', 'fortune', 'Success vs. Failure', 'A professional loss', 'Rooting for success', ['Protagonist', 'Social institution']),
  genre('redemption', 'Redemption Plot', 'character', 'Morality vs. Immorality', 'An act of redeeming morality', 'Hope for change', ['Protagonist'], { arc: 'positive', quality: 'Morality' }),
  genre('degeneration', 'Degeneration Plot', 'character', 'Immorality vs. Morality', 'An act of irreversible immorality', 'Dread of loss', ['Protagonist'], { arc: 'negative', quality: 'Morality' }),
  genre('education', 'Education Plot', 'character', 'Meaning vs. Nihilism', 'Discovery of meaning', 'Longing for meaning', ['Protagonist', 'Teacher'], { arc: 'positive', quality: 'Mentality' }),
  genre('disillusionment', 'Disillusionment Plot', 'character', 'Meaning vs. Nihilism', 'Loss of belief', 'Dread of meaninglessness', ['Protagonist'], { arc: 'negative', quality: 'Mentality' }),
  genre('evolution', 'Evolution Plot', 'character', 'Full vs. Emptied humanity', 'A triumph of the core self', 'Longing for fulfillment', ['Protagonist'], { arc: 'positive', quality: 'Humanity' }),
  genre('devolution', 'Devolution Plot', 'character', 'Full vs. Lost humanity', 'Surrender of the core self', 'Dread of emptiness', ['Protagonist'], { arc: 'negative', quality: 'Humanity' }),
];

export const PRESENTATIONAL_GENRES = [
  'Comedy', 'Musical', 'Science Fiction', 'History', 'Fantasy', 'Documentary', 'Animation', 'Autobiography', 'Biography', 'High Art',
].map((label: string) => opt(label.toLowerCase().replace(/[^a-z]+/g, '-'), label));

export const GENRE_COMBINATIONS = [
  opt('single', 'Single genre', 'One primary genre carries the telling.'),
  opt('mixed', 'Mixed', 'Crosscut story lines whose themes counterpoint each other.'),
  opt('merged', 'Merged', 'One story inside another; one plot’s outcome decides the other’s.'),
];

// ── Ch. 15 · Character in action ────────────────────────────────────────
export const MO_THEMES = [
  opt('mysteryLover', 'The Mystery Lover', 'Bored by life, she seeks an enigmatic lover.', { group: 'Hollywood', twist: 'The mystery figure has nothing to hide — inscrutability is a lure.' }),
  opt('alienAdventurer', 'The Alien Adventurer', 'Estranged, she builds an outlandish self and seeks the weird.', { group: 'Hollywood', twist: 'The partner’s eccentricity is just a tactic to seem interesting.' }),
  opt('fairyTale', 'The Fairy Tale', 'She plays prince or princess.', { group: 'Hollywood', twist: 'The fairy tale turns grotesque: prince to knave, princess to witch.' }),
  opt('documentary', 'The Documentary', 'Compulsive analysis turns love into a field study.', { group: 'Hollywood', twist: 'Dissection becomes a fetish more thrilling than passion.' }),
  opt('xxx', 'The XXX-Rated Flick', 'Pleasure in inflicting or suffering humiliation.', { group: 'Hollywood', twist: 'Diminishing returns: the more she debases, the less she feels.' }),
  opt('tyranny', 'Tyranny', 'She plays the ruler; others are subjects.', { group: 'Political', twist: 'The slave revolts — then misses the old job.' }),
  opt('democracy', 'Democracy', 'She advocates balanced power.', { group: 'Political', twist: 'Her gentleness reads as weakness; they crave her fist.' }),
  opt('anarchy', 'Anarchy', 'Impulsive power that breeds chaos.', { group: 'Political', twist: 'Going rational bores her into discovering she loves chaos.' }),
  opt('collector', 'The Collector', 'Collects beautiful things — houses, art, lovers.', { group: 'Object', twist: 'The collector is collected.' }),
  opt('player', 'The Player', 'Life is a game; people are pieces.', { group: 'Object', twist: 'The player is played.' }),
  opt('obsessive', 'The Obsessive', 'One thing, constantly: sex, faith, drugs, art, love, herself.', { group: 'Object', twist: 'She finally gets what she wants — and hates it.' }),
  opt('businessman', 'The Businessman', 'Runs life like a machine; people are parts.', { group: 'Object', twist: 'The business goes bankrupt.' }),
];

export const COUNTERACTION_SOURCES = [
  opt('physical', 'Physical forces'), opt('social', 'Institutions'), opt('personal', 'Another character'), opt('inner', 'Dark impulses within'),
];

// ── Ch. 16 · Performance ─────────────────────────────────────────────────
export const PERFORMANCE_FUNCTIONS = [
  opt('intellect', 'Intellectual pleasure', 'Unique, surprising yet believable behaviour sparks insight.', { short: 'Intellect' }),
  opt('empathy', 'Empathy', 'A shared humanity — a mirror for the reader.', { short: 'Empathy' }),
  opt('suspense', 'Suspense', 'Curiosity about her nature plus concern for her well-being.', { short: 'Suspense' }),
  opt('puzzle', 'Puzzle within a puzzle', 'The story asks questions; she is one of them.', { short: 'Puzzle' }),
  opt('surprise', 'Surprise', 'Expectation violated, credibility kept.', { short: 'Surprise' }),
  opt('dimensionsOthers', 'Brings out others', 'Her presence activates dimensions in the cast.', { short: 'Draws out cast' }),
  opt('insight', 'Insight into human nature', 'We leave knowing people better.', { short: 'Insight' }),
];

// ── Ch. 17 · Cast design ────────────────────────────────────────────────
export const RELATIONSHIP_KINDS = [
  opt('family', 'Family'), opt('friend', 'Friend'), opt('lover', 'Lover'), opt('power', 'Power (boss, rank)'),
  opt('ally', 'Ally'), opt('mentor', 'Mentor'), opt('foil', 'Foil'), opt('rival', 'Rival'), opt('antagonist', 'Antagonist'),
];

export const RELATIONSHIP_EFFECTS = [
  opt('helps', 'Helps'), opt('hinders', 'Hinders'), opt('both', 'Both'),
];
