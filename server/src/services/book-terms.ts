/**
 * Il libro è l'edizione originale inglese. Le ricerche in italiano vengono ampliate con il
 * lessico inglese di McKee, così «dimensione definitoria» o «incidente scatenante» trovano
 * comunque i passaggi giusti. (Da CharBuild.)
 */


const fold = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');

// Multi-word terms first (matched as phrases), then word stems: a stem
// matches any word that starts with it and is at most 3 letters longer
// (personagg → personaggio, personaggi).
const PHRASES: [string, string][] = [
  ['incidente scatenante', 'inciting incident'], ['oggetto del desiderio', 'object of desire'],
  ['centro del bene', 'center of good'], ['dettaglio rivelatore', 'telling detail'], ['se magico', 'magic if'],
  ['racconto di se', 'self-story'], ['vero carattere', 'true character'], ['punto di svolta', 'turning point'],
  ['punti di svolta', 'turning points'], ['dimensione definitoria', 'defining dimension'],
  ['forze antagoniste', 'forces of antagonism'], ['forza antagonista', 'force of antagonism'],
  ['super obiettivo', 'super-objective'], ['super-obiettivo', 'super-objective'], ['modus operandi', 'modus operandi'],
  ['primo cerchio', 'first circle'], ['secondo cerchio', 'second circle'], ['terzo cerchio', 'third circle'],
  ['se nucleare', 'core self'], ['se nascosto', 'hidden self'], ['se sociale', 'social self'], ['se personale', 'personal self'],
  ['desiderio inconscio', 'subconscious desire'], ['scelta sotto pressione', 'choice under pressure'],
  ['trama di fortuna', 'plot of fortune'], ['trame di fortuna', 'plots of fortune'], ['trama di carattere', 'plot of character'],
  ['figura di repertorio', 'stock character'], ['valore centrale', 'core value'], ['evento centrale', 'core event'],
  ['emozione centrale', 'core emotion'], ['cast centrale', 'core cast'], ['obiettivo di scena', 'scene objective'],
  ['valore in gioco', 'value at stake'], ['progettazione del cast', 'cast design'], ['dall esterno', 'outside in'],
  ['dall interno', 'inside out'], ['big five', 'big five'], ['ruolo di supporto', 'support role'], ['ruolo di servizio', 'service role'],
];

const STEMS: [string, string][] = [
  ['personagg', 'character'], ['caratterizzazion', 'characterization'], ['carattere', 'character'], ['protagonist', 'protagonist'],
  ['antagonist', 'antagonist antagonism'], ['antagonism', 'antagonism'], ['contraltar', 'foil'], ['narrator', 'narrator'],
  ['ruol', 'role'], ['cast', 'cast'], ['desider', 'desire'], ['controdesider', 'counterdesire'], ['inconsci', 'subconscious'],
  ['subconsci', 'subconscious'], ['consci', 'conscious'], ['motivazion', 'motivation'], ['bisogn', 'need'], ['dilemm', 'dilemma'],
  ['scelt', 'choice'], ['pressione', 'pressure'], ['rischi', 'risk'], ['dimension', 'dimension'], ['contraddizion', 'contradiction'],
  ['complessit', 'complexity complex'], ['profondit', 'depth'], ['arco', 'arc'], ['archi', 'arcs'], ['svolt', 'turning'],
  ['climax', 'climax'], ['epifani', 'epiphany'], ['rivelazion', 'revelation'], ['cambiament', 'change'], ['completament', 'completion'],
  ['trasformazion', 'transformation change'], ['sfavorit', 'underdog'], ['empati', 'empathy'], ['simpati', 'sympathy'],
  ['ispirazion', 'inspiration'], ['ricerc', 'research'], ['memori', 'memory'], ['infanzi', 'childhood'], ['adolescenz', 'adolescence'],
  ['antefatt', 'backstory'], ['passat', 'past'], ['futur', 'future'], ['present', 'present'], ['maschera', 'mask persona'],
  ['maschere', 'masks personae'], ['person', 'persona'], ['personalit', 'personality'], ['temperament', 'temperament'],
  ['intelligenz', 'intelligence'], ['umor', 'mood'], ['emozion', 'emotion'], ['sentiment', 'feeling'], ['credenz', 'belief'],
  ['fede', 'faith belief'], ['valor', 'value'], ['moral', 'morality moral'], ['coscienz', 'conscience'], ['identit', 'identity'],
  ['destin', 'destiny'], ['fato', 'fate'], ['ossession', 'obsession'], ['rimozion', 'repression'], ['repression', 'repression'],
  ['fantasi', 'fantasy'], ['realism', 'realism'], ['simbol', 'symbol symbolic'], ['archetip', 'archetype'], ['allegori', 'allegory'],
  ['stereotip', 'stereotype'], ['cliche', 'cliche'], ['tipo', 'type'], ['tipi', 'types'], ['radical', 'radical'],
  ['gener', 'genre'], ['tram', 'plot'], ['scen', 'scene'], ['sottotest', 'subtext'], ['segret', 'secret'], ['conflitt', 'conflict'],
  ['ambientazion', 'setting'], ['mondo', 'world'], ['natur', 'nature'], ['corpo', 'body'], ['tempo', 'time'],
  ['istituzion', 'institution'], ['societ', 'society social'], ['social', 'social'], ['intimit', 'intimacy intimate'],
  ['famigli', 'family'], ['amic', 'friend'], ['amant', 'lover'], ['amor', 'love'], ['odi', 'hate'], ['paur', 'fear'],
  ['coraggi', 'courage'], ['speranz', 'hope'], ['disperazion', 'despair'], ['verit', 'truth'], ['menzogn', 'lie'], ['bugi', 'lie'],
  ['inganno', 'deception'], ['autoinganno', 'self-deception'], ['potere', 'power'], ['giustizi', 'justice'], ['vendett', 'revenge'],
  ['sopravvivenz', 'survival'], ['piacer', 'pleasure'], ['sesso', 'sex'], ['significat', 'meaning'], ['senso', 'meaning'],
  ['immortalit', 'immortality'], ['trascendenz', 'transcendence'], ['avidit', 'greed'], ['invidi', 'envy'], ['gelosi', 'jealousy'],
  ['suspense', 'suspense'], ['curiosit', 'curiosity'], ['apprension', 'concern'], ['preoccupazion', 'concern'], ['mister', 'mystery'],
  ['sorpres', 'surprise'], ['scopert', 'discovery'], ['riconosciment', 'recognition'], ['pubblic', 'audience'], ['lettor', 'reader'],
  ['spettator', 'audience'], ['autor', 'author writer'], ['scrittor', 'writer'], ['romanz', 'novel'], ['teatr', 'theater stage'],
  ['palcoscenic', 'stage'], ['scherm', 'screen'], ['pagin', 'page'], ['cinema', 'film'], ['film', 'film'], ['serie', 'series'],
  ['sceneggiatur', 'screenplay'], ['dialog', 'dialogue'], ['azion', 'action'], ['reazion', 'reaction'], ['tattic', 'tactics'],
  ['eroe', 'hero'], ['eroi', 'heroes'], ['cattiv', 'villain'], ['vittim', 'victim'], ['mostr', 'monster'], ['mentor', 'mentor'],
  ['rival', 'rival'], ['alleat', 'ally'], ['nemic', 'enemy'], ['commedi', 'comedy'], ['tragedi', 'tragedy'], ['crimin', 'crime'],
  ['orror', 'horror'], ['guerr', 'war'], ['redenzion', 'redemption'], ['degenerazion', 'degeneration'], ['educazion', 'education'],
  ['disillusion', 'disillusionment'], ['evoluzion', 'evolution'], ['involuzion', 'devolution'], ['umanit', 'humanity'],
  ['ironi', 'irony ironic'], ['dettagl', 'detail'], ['specific', 'specific specificity'], ['originalit', 'originality'],
  ['credibilit', 'credibility'], ['tratt', 'trait'], ['aspett', 'appearance'], ['voce', 'voice'], ['gest', 'gesture'],
  ['professio', 'profession'], ['lavor', 'work job'], ['casa', 'home'], ['conoscenz', 'knowledge'], ['ignoranz', 'ignorance'],
  ['buon', 'good'], ['bene', 'good'], ['malvag', 'evil'], ['dio', 'god'], ['volont', 'willpower will'], ['talent', 'talent'],
  ['vita', 'life'], ['morte', 'death'], ['liberta', 'freedom'], ['successo', 'success'], ['fallimento', 'failure'],
];

export function expandItalianQuery(query: string): string {
  const q = fold(String(query || '')).replace(/[’']/g, ' ');
  const extra: string[] = [];
  for (const [it, en] of PHRASES) if (q.includes(it)) extra.push(en);
  for (const w of q.match(/[a-z]+/g) || []) {
    for (const [stem, en] of STEMS) {
      if (w.startsWith(stem) && w.length <= stem.length + 3) extra.push(en);
    }
  }
  return extra.length ? `${query} ${[...new Set(extra)].join(' ')}` : query;
}
