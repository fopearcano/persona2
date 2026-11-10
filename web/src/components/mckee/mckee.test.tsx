import type { CastMember } from '@persona/shared/client';
import { mckeeData, mt, newBuild, newStoryDesign, type CharacterBuild } from '@persona/shared/mckee';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { applyCapture, undoCapture } from '../../lib/mckee';
import { CastMap } from './CastMap';
import { FieldView, type FieldCtx } from './Fields';
import { StationVisual, type VizCtx } from './Viz';

afterEach(cleanup);

function richBuild(): CharacterBuild {
  const b = newBuild();
  b.cast.circle = 'protagonist';
  b.concept.inspiration = ['reality', 'events'];
  b.concept.tellingDetail = 'Conta le stelle a voce bassa';
  b.outer.explicit.voice = 'Bassa';
  b.outer.expressed.voice = true;
  b.outer.implicit.bigFive = { openness: 80, rationality: 40 };
  b.selves.social = 'Severa';
  b.selves.hidden = 'Teme il padre';
  b.inner.motivations = { meaning: 9, power: 4 };
  b.inner.pressure = { risk: 8, freedom: 6, notes: '' };
  b.inner.dilemma = { kind: 'positive', optionA: 'Scienza', optionB: 'Famiglia', choice: '' };
  b.dimensions = [
    { id: 'd1', positive: 'Coraggiosa', negative: 'Codarda', defining: true },
    { id: 'd2', positive: 'Leale', negative: 'Traditrice' },
  ];
  b.complexity.antagonism = { nature: 5, inner: 7 };
  b.complexity.capacity = 4;
  b.arc.turningPoints = [
    { id: 't1', label: 'Arrivo', charge: 2 },
    { id: 't2', label: 'Perdita', charge: -3 },
  ];
  b.action.scenes = [{ id: 's1', title: 'Osservatorio', from: -1, to: 2, value: 'Verità' }];
  b.performance.functions = ['empathy'];
  b.relationships = [{ id: 'r1', targetId: 'other', kind: 'rival', effect: 'hinders', dimensionId: 'd2' }];
  return b;
}

const other: CastMember = { id: 'other', name: 'Bruno Neri', portrait: null, occupation: null, build: { ...newBuild(), cast: { ...newBuild().cast, circle: 'first' } } };

describe('McKee builder components', () => {
  it.each(['it', 'en'])('renders every station and its infographic (%s)', (lang) => {
    const M = mckeeData(lang);
    const story = { ...newStoryDesign(), genre: { primary: ['crime', 'redemption'], presentational: [], combination: '' } };
    const build = richBuild();
    const fieldCtx: FieldCtx = { M, story, cast: [other] };
    const vizCtx: VizCtx = { M, story, cast: [other], onTurningPoint() {} };
    for (const s of M.SECTIONS) {
      const { unmount } = render(
        <div>
          {s.groups.flatMap((g) => g.fields).map((f, i) => (
            <FieldView key={i} f={f} data={build} edit={() => {}} ctx={fieldCtx} build={build} />
          ))}
          <StationVisual visual={s.visual} c={{ ...build, id: 'me', name: 'Irina Volkova' }} ctx={vizCtx} />
        </div>,
      );
      unmount();
    }
  });

  it('edits a copy of the build through the field renderer', () => {
    const M = mckeeData('it');
    let build = newBuild();
    const edit = (fn: (d: CharacterBuild) => void) => {
      const next = structuredClone(build);
      fn(next);
      build = next;
    };
    const field = M.SECTION_BY_ID.spark.groups[1].fields[0]; // fonti d'ispirazione (chips)
    render(<FieldView f={field} data={build} edit={edit} ctx={{ M, story: null, cast: [] }} build={build} />);
    fireEvent.click(screen.getByRole('button', { name: /Realtà/ }));
    expect(build.concept.inspiration).toEqual(['reality']);
  });

  it('draws the cast map with every member', () => {
    const M = mckeeData('it');
    const me: CastMember = { id: 'me', name: 'Irina Volkova', portrait: null, occupation: null, build: richBuild() };
    render(<CastMap cast={[me, other]} M={M} title="Saga" onMove={() => {}} onOpen={() => {}} />);
    expect(screen.getByRole('button', { name: 'Irina Volkova' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Bruno Neri' })).toBeTruthy();
  });
});

describe('McKee translations', () => {
  it('translates every McKee string written in the builder components', () => {
    const dir = __dirname;
    const files = [...readdirSync(dir).filter((f) => f.endsWith('.tsx') && !f.endsWith('.test.tsx')).map((f) => join(dir, f)), join(dir, '../../pages/BuildPage.tsx'), join(dir, '../../pages/StoryPage.tsx')];
    const used = new Set<string>();
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      // M.t('…') / t('…') con testo inglese (le chiavi i18next contengono punti e niente spazi).
      for (const m of src.matchAll(/\b(?:M\.)?tn?\(\s*(?:\w+,\s*)?'((?:[^'\\]|\\.)+)'/g)) {
        const s = m[1].replace(/\\'/g, "'");
        if (!/^[a-z]+(\.[\w]+)+$/.test(s)) used.add(s);
      }
    }
    // Parole identiche in italiano.
    const same = new Set(['+', '−', 'No', 'Media', 'climax', 'vs.', 'Suspense', '{power} vs {capacity}', 'Cast']);
    const untranslated = [...used].filter((s) => mt('it', s) === s && !same.has(s));
    expect(untranslated).toEqual([]);
    expect(used.size).toBeGreaterThan(150);
  });
});

describe('building assistant captures', () => {
  it('applies captures to build and identity drafts and undoes them exactly', () => {
    const build = newBuild();
    build.concept.logline = 'prima';
    build.dimensions = [{ id: 'd1', positive: 'A', negative: 'B', defining: true }];
    const identity = { name: 'Mara', occupation: null };
    const updates = [
      { path: 'concept.logline', op: 'set' as const, value: 'dopo' },
      { path: 'inner.motivations.meaning', op: 'set' as const, value: 8 },
      { path: 'dimensions', op: 'append' as const, value: { id: 'd2', positive: 'C', negative: 'D', defining: true } },
      { path: 'identity.occupation', op: 'set' as const, value: 'Biologa marina' },
    ];
    const r = applyCapture(build, identity, updates);
    expect(r.build.concept.logline).toBe('dopo');
    expect(r.build.inner.motivations).toEqual({ meaning: 8 });
    expect(r.build.dimensions.map((d) => [d.id, d.defining])).toEqual([
      ['d1', false],
      ['d2', true],
    ]);
    expect(r.identity.occupation).toBe('Biologa marina');
    expect(build.concept.logline).toBe('prima'); // la bozza precedente non cambia

    const back = undoCapture(r.build, r.identity, r.undo);
    expect(back.build).toEqual(build);
    expect(back.identity).toEqual(identity);
  });
});
