/**
 * Behaviour tests for the post-render normalizer.
 *
 * The normalizer is the piece a theme cannot do: it rewrites the SVG Mermaid
 * hands back (shadows, corner radii, zone eyebrows, mono micro type, the one
 * accent) and it must never lose a label. jsdom cannot lay out or render, so
 * nothing here calls Mermaid: the fixtures are the input, the normalizer is the
 * unit under test.
 *
 * Fixtures are real Mermaid v12 output captured from a browser, except
 * flowchart-latin-zone.svg, which is hand-written because the capture set has no
 * Latin-only cluster title. Tests read the *effective* value of a property
 * (inline style first, presentation attribute second) because the normalizer
 * writes the properties Mermaid's #id-scoped stylesheet would otherwise win.
 *
 * Run with: node --test test/mermaid-svg.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });

global.window = dom.window;
global.document = dom.window.document;
global.DOMParser = dom.window.DOMParser;
global.XMLSerializer = dom.window.XMLSerializer;
global.NodeFilter = dom.window.NodeFilter;

const { normalizeMermaidSvg } = await import('../src/mermaid-svg.js');
const { FONTS, GEOMETRY, TYPE, composite, contrastRatio, parseColor, tokens } = await import('../src/mermaid-skin.js');

const parser = new dom.window.DOMParser();

/** Every fixture this suite normalizes. */
const FIXTURES = ['flowchart-cjk', 'sequence-cjk', 'state-cjk', 'er', 'flowchart-latin-zone'];
const FLOWCHART = 'flowchart-cjk';
const SEQUENCE = 'sequence-cjk';
const STATE = 'state-cjk';
const ER = 'er';
const LATIN_ZONE = 'flowchart-latin-zone';

/** Prefixes an assertion message with the fixture name. */
const at = (name, message) => name + ': ' + message;

/** Read a fixture. */
const fixture = (name) => readFileSync(new URL('./fixtures/mermaid/' + name + '.svg', import.meta.url), 'utf8');

/** Parse an SVG string with the same parser the normalizer uses. */
const parse = (svg) => parser.parseFromString(svg, 'image/svg+xml');

/** Normalize with the shared parser. */
const normalize = (svg, options = {}) => normalizeMermaidSvg(svg, { document: parser, ...options });

/** The documentElement of an SVG string. */
const rootOf = (svg) => parse(svg).documentElement;

/** Read a property out of an inline style attribute, including SVG-only ones. */
const styleOf = (element, property) => {
  const style = element.getAttribute('style') ?? '';
  const match = new RegExp('(?:^|;)\\s*' + property + '\\s*:\\s*([^;]*)').exec(style);
  return match === null ? null : match[1].trim();
};

/** The value the browser paints: inline style beats a presentation attribute. */
const valueOf = (element, property) => {
  const styled = styleOf(element, property);
  return styled === null || styled === '' ? element.getAttribute(property) : styled;
};

/** The node shape: the first direct child Mermaid drew the node with. */
const shapeOf = (node) => node.querySelector(':scope > rect, :scope > polygon, :scope > path, :scope > circle');

/** Compare two colour strings by channel, not by notation (hex vs rgb()). */
const sameColor = (left, right) => {
  const a = parseColor(left);
  const b = parseColor(right);
  return a !== null && b !== null && a.join('|') === b.join('|');
};

const assertSameColor = (actual, expected, message) => {
  assert.ok(sameColor(actual, expected), message + ': expected ' + expected + ', got ' + actual);
};

/** A font stack without quotes or spacing, so jsdom's re-serialisation cannot fail the compare. */
const cssStack = (value) => String(value ?? '').replace(/["']/g, '').replace(/\s+/g, ' ').trim();

/** Multiset of non-empty text-node values, sorted for comparison. */
const textNodes = (svg) => {
  const doc = parse(svg);
  const walker = doc.createTreeWalker(doc.documentElement, dom.window.NodeFilter.SHOW_TEXT);
  const texts = [];
  let node = walker.nextNode();
  while (node !== null) {
    const text = (node.nodeValue ?? '').trim();
    if (text !== '') texts.push(text);
    node = walker.nextNode();
  }
  return texts.sort();
};

/** Pull the two numbers out of a translate() transform. */
const translateOf = (label) => {
  const match = /^translate\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)$/.exec(label.getAttribute('transform') ?? '');
  assert.ok(match, 'the zone label is translated');
  return [Number(match[1]), Number(match[2])];
};

test('the shadow pass and the neo markers are gone', () => {
  for (const name of FIXTURES) {
    const root = rootOf(normalize(fixture(name)));
    // Mermaid v12 tags nodes and containers with data-look="neo" and ships
    // #id-scoped rules that re-apply a drop shadow and a blue stroke. The
    // attribute is what makes those rules match, so removing it is the real
    // fix. The selectors themselves stay in the embedded <style>; they are
    // harmless once nothing carries the attribute, so do not "fix" them back.
    assert.equal(root.querySelectorAll('[data-look]').length, 0, at(name, 'a data-look marker survives'));
    assert.equal(root.querySelectorAll('[filter]').length, 0, at(name, 'a filter attribute survives'));
    assert.equal(root.querySelectorAll('filter').length, 0, at(name, 'a filter definition survives'));
    const styled = [...root.querySelectorAll('[style]')].filter((element) =>
      /drop-shadow|box-shadow/.test(element.getAttribute('style') ?? ''),
    );
    assert.equal(styled.length, 0, at(name, 'an inline style still asks for a shadow'));
  }
});

test('the root is tagged for the wrapper and carries an intrinsic size', () => {
  for (const name of FIXTURES) {
    const source = fixture(name);
    const input = rootOf(source);
    const role = input.getAttribute('aria-roledescription');
    assert.ok(role, at(name, 'the fixture names its grammar'));
    const box = (input.getAttribute('viewBox') ?? '').trim().split(/[\s,]+/).map(Number);
    assert.equal(box.length, 4, at(name, 'the fixture has a viewBox'));

    const root = rootOf(normalize(source));
    assert.equal(root.tagName.toLowerCase(), 'svg');
    assert.equal(root.getAttribute('data-wfp-type'), role, at(name, 'the wrapper hook mirrors the grammar'));
    assert.equal(root.getAttribute('focusable'), 'false', at(name, 'keyboard focus must not land on the figure'));
    // Mermaid writes width="100%". The wrapper sizes the stage from the viewBox,
    // and an SVG with no intrinsic size collapses to 0x0 there, so the root gets
    // the viewBox dimensions as numbers. (The original brief said "no
    // width/height"; the Lead ruled that this comment is the contract.)
    assert.notEqual(root.getAttribute('width'), '100%', at(name, 'the 100% width is replaced'));
    assert.equal(root.getAttribute('width'), String(Math.round(box[2])), at(name, 'the intrinsic width comes from the viewBox'));
    assert.equal(root.getAttribute('height'), String(Math.round(box[3])), at(name, 'the intrinsic height comes from the viewBox'));
    assert.equal(root.getAttribute('style'), null, at(name, 'the wrapper stylesheet owns the root style'));
  }
});

test('node and cluster corners are rounded to the skin geometry', () => {
  for (const name of [FLOWCHART, STATE]) {
    const root = rootOf(normalize(fixture(name)));
    const rects = [...root.querySelectorAll('.node > rect')];
    assert.ok(rects.length > 0, at(name, 'the fixture has rect nodes'));
    for (const rect of rects) {
      assert.equal(rect.getAttribute('rx'), String(GEOMETRY.radiusNode), at(name, 'node corner radius'));
      assert.equal(rect.getAttribute('ry'), String(GEOMETRY.radiusNode), at(name, 'node corner radius'));
    }
  }
  const flow = rootOf(normalize(fixture(FLOWCHART)));
  const clusters = [...flow.querySelectorAll('.cluster > rect')];
  assert.equal(clusters.length, 2, 'the flowchart fixture has two zones');
  for (const rect of clusters) {
    assert.equal(rect.getAttribute('rx'), String(GEOMETRY.radiusZone), 'zone corner radius');
    assert.equal(rect.getAttribute('ry'), String(GEOMETRY.radiusZone), 'zone corner radius');
  }
});

test('a CJK cluster title becomes a plain sans eyebrow inside the frame', () => {
  const root = rootOf(normalize(fixture(FLOWCHART)));
  const labels = [...root.querySelectorAll('.cluster-label')];
  assert.equal(labels.length, 2, 'the flowchart fixture has two zone titles');
  for (const label of labels) {
    const cluster = label.parentElement;
    const rect = cluster.querySelector(':scope > rect');
    const [x, y] = translateOf(label);
    assert.equal(x, Number(rect.getAttribute('x')) + GEOMETRY.zoneLabelInset, 'the eyebrow sits 10px inside the frame');
    assert.equal(y, Number(rect.getAttribute('y')) + GEOMETRY.zoneLabelOffset, 'the eyebrow sits 7px down');
    assert.match(label.getAttribute('class'), /wfp-zone-label/, 'the label carries the wrapper hook');
    assert.doesNotMatch(label.getAttribute('class'), /wfp-zone-latin/, 'CJK is not tracked as Latin');

    const div = label.querySelector('div');
    assert.ok(div, 'mermaid renders htmlLabels, so the eyebrow is a div');
    assert.equal(styleOf(div, 'letter-spacing'), 'normal', 'tracking shatters CJK rhythm');
    assert.equal(styleOf(div, 'text-transform'), 'none', 'CJK is never uppercased');
    assert.equal(cssStack(styleOf(div, 'font-family')), cssStack(FONTS.sans), 'a CJK eyebrow keeps the sans face');
    assert.equal(styleOf(div, 'font-size'), TYPE.zoneCjk + 'px', 'a CJK eyebrow takes the larger zone size');
  }
});

test('a Latin-only cluster title is tracked, uppercased and mono', () => {
  const root = rootOf(normalize(fixture(LATIN_ZONE)));
  const label = root.querySelector('.cluster-label');
  assert.ok(label, 'the fixture has one zone title');
  assert.match(label.getAttribute('class'), /wfp-zone-latin/, 'Latin copy is marked as Latin');
  const div = label.querySelector('div');
  assert.ok(div);
  assert.equal(styleOf(div, 'letter-spacing'), '0.14em', 'Latin eyebrow tracking');
  assert.equal(styleOf(div, 'text-transform'), 'uppercase', 'Latin eyebrows are uppercased');
  assert.equal(cssStack(styleOf(div, 'font-family')), cssStack(FONTS.mono), 'Latin micro copy is mono');
  assert.equal(styleOf(div, 'font-size'), TYPE.zone + 'px', 'Latin eyebrows take the small zone size');

  const rect = label.parentElement.querySelector(':scope > rect');
  const [x, y] = translateOf(label);
  assert.equal(x, Number(rect.getAttribute('x')) + GEOMETRY.zoneLabelInset);
  assert.equal(y, Number(rect.getAttribute('y')) + GEOMETRY.zoneLabelOffset);
});

test('every text node survives normalization byte for byte', () => {
  // The regression that matters most: losing a label is worse than any colour.
  for (const name of FIXTURES) {
    const source = fixture(name);
    const before = textNodes(source);
    const after = textNodes(normalize(source));
    assert.ok(before.length > 0, at(name, 'the fixture has text'));
    assert.deepEqual(after, before, at(name, 'the multiset of text nodes changed'));
  }
});

test('ER field types take the mono micro scale and the rows keep their fills', () => {
  const table = tokens(false);
  const root = rootOf(normalize(fixture(ER)));
  const types = [...root.querySelectorAll('.label.attribute-type')];
  assert.ok(types.length > 0, 'the fixture has attribute rows');
  for (const type of types) {
    assert.equal(cssStack(styleOf(type, 'font-family')), cssStack(FONTS.mono), 'a field type is mono');
    assert.equal(styleOf(type, 'font-size'), '10px', 'the ER micro scale is 10px');
  }
  const odd = [...root.querySelectorAll('.row-rect-odd path[stroke="none"]')];
  const even = [...root.querySelectorAll('.row-rect-even path[stroke="none"]')];
  assert.ok(odd.length > 0 && even.length > 0, 'the fixture has striped rows');
  for (const path of odd) assertSameColor(path.getAttribute('fill'), table.paper, 'an odd row sits on paper');
  for (const path of even) assertSameColor(path.getAttribute('fill'), table.zoneFill, 'an even row sits on the zone fill');
});

test('ER entities stay square', () => {
  const root = rootOf(normalize(fixture(ER)));
  const nodes = [...root.querySelectorAll('.node')];
  assert.equal(nodes.length, 4, 'the fixture has four entities');
  for (const node of nodes) {
    // An attribute table is drawn from paths (outer-path + row groups + labels),
    // so "square" is structural: there is no rect to round. A standalone entity
    // with no attributes is a plain rect. Rounding only one of them would make a
    // single diagram mix a 6px rounded box with a sharp table, so the normalizer
    // leaves every -entity- node unrounded.
    const rect = node.querySelector(':scope > rect');
    const table = node.querySelector(':scope > .outer-path');
    assert.ok(rect !== null || table !== null, node.id + ': is drawn as a table or a box');
    if (rect !== null) {
      assert.notEqual(rect.getAttribute('rx'), String(GEOMETRY.radiusNode), node.id + ': an entity box is square');
    } else {
      const band = table.querySelector('path[stroke="none"]');
      assertSameColor(band.getAttribute('fill'), tokens(false).paper2, 'the header band is paper-2');
    }
  }
  const tables = nodes.filter((node) => node.querySelector(':scope > .outer-path') !== null);
  assert.equal(tables.length, 2, 'two entities carry attribute rows');
  for (const table of tables) {
    assert.equal(table.querySelector(':scope > rect'), null, 'an attribute table has no direct rect child to round');
  }
});

// Skipped pending a decision, not because it is unclear that this is wrong.
//
// Mermaid's embedded stylesheet carries
//   "#d4 .node rect,#d4 .node circle,...{fill:#e6f1ff;stroke:#8fb8ec;stroke-width:1;}".
// Every other node is protected by an inline fill/stroke; an -entity- node is
// skipped before those are written, and the two attribute-less entities are the
// only ER nodes drawn as a bare rect. Observed on the fixture in both modes:
// d4-entity-ORDER-2 and d4-entity-SESSION-3 have no fill, no stroke and no
// inline style, so a browser paints those two boxes in Mermaid's pale blue even
// in dark mode. The decision is which way to fix it (skin fill on the rect, or
// drop the stylesheet rule), so the assertion stays here, skipped, until the
// Lead chooses.
test('a standalone ER entity box carries a skin fill, not mermaid blue', () => {
  const table = tokens(false);
  const root = rootOf(normalize(fixture(ER)));
  const rects = [...root.querySelectorAll('.node[id*="-entity-"] > rect')];
  assert.ok(rects.length > 0, 'the fixture has standalone entity boxes');
  for (const rect of rects) {
    assertSameColor(valueOf(rect, 'fill'), table.paper, 'an entity box sits on paper');
    assertSameColor(valueOf(rect, 'stroke'), table.ruleSolid, 'an entity box has the hairline');
  }
});

test('sequence boxes, notes and text carry the skin fills', () => {
  for (const dark of [false, true]) {
    const mode = dark ? 'dark' : 'light';
    const table = tokens(dark);
    const root = rootOf(normalize(fixture(SEQUENCE), { dark }));
    const actorFill = composite(table.nodeFill, table.paper);

    const actors = [...root.querySelectorAll('rect.actor')];
    assert.ok(actors.length > 0, 'the fixture has actor boxes');
    for (const actor of actors) {
      assertSameColor(valueOf(actor, 'fill'), actorFill, mode + ' actor box fill');
      assertSameColor(valueOf(actor, 'stroke'), table.ruleSolid, mode + ' actor box stroke');
      assert.equal(actor.getAttribute('rx'), String(GEOMETRY.radiusNode), 'an actor box is a node');
    }

    const notes = [...root.querySelectorAll('rect.note')];
    assert.ok(notes.length > 0, 'the fixture has notes');
    for (const note of notes) {
      assertSameColor(valueOf(note, 'fill'), table.paper2, mode + ' note fill');
      assertSameColor(valueOf(note, 'stroke'), table.ruleSolid, mode + ' note stroke');
      assert.equal(note.getAttribute('rx'), String(GEOMETRY.radiusNote), 'a note is a quiet card');
    }

    const noteText = root.querySelector('.noteText');
    assert.ok(noteText, 'the fixture has note text');
    assertSameColor(valueOf(noteText, 'fill'), table.muted, mode + ' note text');
    assert.equal(styleOf(noteText, 'font-size'), TYPE.note + 'px', mode + ' note text size');

    const actorText = root.querySelector('text.actor');
    assert.ok(actorText, 'the fixture has actor text');
    assertSameColor(valueOf(actorText, 'fill'), table.ink, mode + ' actor text');
  }
});

test('autonumber discs, lifelines and message strokes are the skin hairlines', () => {
  for (const dark of [false, true]) {
    const mode = dark ? 'dark' : 'light';
    const table = tokens(dark);
    const root = rootOf(normalize(fixture(SEQUENCE), { dark }));

    const discs = [...root.querySelectorAll('marker[id$="-sequencenumber"] circle')];
    assert.ok(discs.length > 0, 'the fixture uses autonumber');
    for (const disc of discs) {
      assertSameColor(disc.getAttribute('fill'), table.paper, mode + ' step disc fill');
      assertSameColor(disc.getAttribute('stroke'), table.ruleSolid, mode + ' step disc stroke');
      assert.equal(disc.getAttribute('stroke-width'), String(GEOMETRY.hairline), mode + ' step disc hairline');
    }

    const lifelines = [...root.querySelectorAll('line.actor-line')];
    assert.ok(lifelines.length > 0, 'the fixture has lifelines');
    for (const lifeline of lifelines) {
      assertSameColor(lifeline.getAttribute('stroke'), table.rule, mode + ' lifeline stroke');
      assert.equal(lifeline.getAttribute('stroke-width'), String(GEOMETRY.hairline), mode + ' lifeline hairline');
    }

    const messages = [...root.querySelectorAll('.messageLine0, .messageLine1')];
    assert.ok(messages.length > 0, 'the fixture has messages');
    for (const message of messages) {
      // Mermaid writes stroke-width as a presentation attribute; only the inline
      // style beats it (the fixture carries stroke-width="2").
      assert.equal(styleOf(message, 'stroke-width'), String(GEOMETRY.edgeWidth), mode + ' message stroke');
    }
  }
});

test('the focal directive accents exactly one node', () => {
  const table = tokens(false);
  const normalized = normalize(fixture(FLOWCHART), { focal: ['A'] });
  const root = rootOf(normalized);
  const nodes = [...root.querySelectorAll('.node')];
  const focal = nodes.filter((node) => node.classList.contains('wfp-focal'));
  assert.equal(focal.length, 1, 'exactly one node carries the accent');
  assert.equal(focal[0].getAttribute('id'), 'd1-flowchart-A-0', 'the named node is the focal one');

  const shape = shapeOf(focal[0]);
  // applyFocal writes inline style, because Mermaid's #id-scoped stylesheet beats
  // a presentation attribute; read the effective value, not the attribute.
  assertSameColor(valueOf(shape, 'stroke'), table.accent, 'the focal stroke is the accent');
  const surface = composite(table.nodeFill, table.paper);
  const tint = valueOf(shape, 'fill');
  assertSameColor(tint, composite(table.accentTint, surface), 'the focal fill is the accent tint over the node surface');
  assert.ok(!sameColor(tint, surface), 'the focal fill is visibly tinted');

  // The label takes whichever ink role wins the contrast pick on that tint.
  const ink = contrastRatio(table.ink, tint) >= contrastRatio(table.inkStrong, tint) ? table.ink : table.inkStrong;
  const labels = [...focal[0].querySelectorAll('.nodeLabel, .nodeLabel p, .label span')];
  assert.ok(labels.length > 0, 'the focal node has a label');
  for (const label of labels) assertSameColor(styleOf(label, 'color'), ink, 'the focal label keeps the winning ink');

  for (const node of nodes) {
    if (node === focal[0]) continue;
    const other = shapeOf(node);
    assert.equal(styleOf(other, 'stroke'), null, node.id + ': no inline stroke override');
    assertSameColor(other.getAttribute('stroke'), table.ruleSolid, node.id + ': keeps its hairline');
  }
  assert.ok(normalized.includes('#f5f5f5'), 'the light paper is still the ambient surface');
});

test('dark mode uses the dark accent, paper and node surface', () => {
  const table = tokens(true);
  const normalized = normalize(fixture(FLOWCHART), { dark: true, focal: ['A'] });
  const root = rootOf(normalized);
  const focal = root.querySelector('.node.wfp-focal');
  assert.ok(focal, 'the focal node is marked');

  // CSSOM canonicalises the hex to rgb() inside the style attribute, so the
  // assertions compare colour values, not notation.
  assertSameColor(valueOf(shapeOf(focal), 'stroke'), table.accent, 'the dark accent mark');
  assertSameColor(table.accent, '#f08a59', 'the dark accent is the warm mark');
  assertSameColor(table.paper, '#2d3142', 'the dark paper');
  assert.ok(normalized.includes('#2d3142'), 'the dark paper appears in the output');

  const others = [...root.querySelectorAll('.node')].filter((node) => !node.classList.contains('wfp-focal'));
  assert.ok(others.length > 0, 'the fixture has ambient nodes');
  for (const node of others) {
    assert.equal(shapeOf(node).getAttribute('fill'), table.paper, 'an ambient node sits on the dark paper');
  }
  for (const shape of root.querySelectorAll('.node > rect')) {
    assert.notEqual(shape.getAttribute('fill'), '#f5f5f5', 'no light-mode paper on a node shape');
  }
});

test('a tie for the top hub names at most two focal nodes', () => {
  // The skin sanctions one or two focal nodes. In the fixture A, B and D all
  // have degree 3: two tied hubs read as a structure, three or more is noise,
  // so the pass names the first two and leaves the rest ambient.
  const table = tokens(false);
  const root = rootOf(normalize(fixture(FLOWCHART), { focal: [] }));
  const focal = [...root.querySelectorAll('.wfp-focal')];
  assert.equal(focal.length, 2, 'a three-way tie is capped at two focal nodes');
  for (const node of focal) {
    const shape = shapeOf(node);
    assertSameColor(valueOf(shape, 'stroke'), table.accent, node.id + ': the accent border');
    assert.ok(valueOf(shape, 'fill') !== null, node.id + ': the accent fill is written');
  }
  const ambient = [...root.querySelectorAll('.node')].filter((node) => !node.classList.contains('wfp-focal'));
  assert.ok(ambient.length > 0, 'the fixture still has ambient nodes');
  for (const node of ambient) {
    const shape = shapeOf(node);
    assert.equal(styleOf(shape, 'stroke'), null, node.id + ': no inline stroke override');
    assert.ok(!sameColor(shape.getAttribute('stroke'), table.accent), node.id + ': no accent stroke');
  }
});

test('a graph with no hub of degree three gets no accent', () => {
  // Five nodes in a chain: every degree is at most 2, so there is nothing the
  // diagram is "about" and nothing is accented.
  const chain = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 100" aria-roledescription="flowchart-v2"><style>#c .node rect{fill:#e6f1ff;stroke:#8fb8ec}</style>',
  ];
  const names = ['A', 'B', 'C', 'D', 'E'];
  for (let index = 0; index < names.length; index += 1) {
    chain.push(
      '<g class="node default" id="c-flowchart-' +
        names[index] +
        '-' +
        index +
        '" transform="translate(' +
        (20 + index * 80) +
        ', 60)"><rect width="60" height="30" x="-30" y="-15"/></g>',
    );
  }
  for (let index = 0; index < names.length - 1; index += 1) {
    chain.push(
      '<path class="flowchart-link" id="c-L_' +
        names[index] +
        '_' +
        names[index + 1] +
        '_0" d="M0,0 L1,1"/>',
    );
  }
  chain.push('</svg>');
  const root = rootOf(normalize(chain.join(''), { focal: [] }));
  assert.equal(root.querySelectorAll('.wfp-focal').length, 0, 'nothing is focal in a chain');
});

test('an unknown focal id is ignored', () => {
  let root;
  assert.doesNotThrow(() => {
    root = rootOf(normalize(fixture(FLOWCHART), { focal: ['NOPE'] }));
  }, 'an unknown id must not throw');
  assert.equal(root.querySelectorAll('.wfp-focal').length, 0, 'nothing is focal');
  for (const node of root.querySelectorAll('.node')) {
    assert.ok(!sameColor(shapeOf(node).getAttribute('stroke'), tokens(false).accent), node.id + ': no accent stroke');
  }
});

test('normalizing twice is a no-op', () => {
  for (const name of FIXTURES) {
    for (const dark of [false, true]) {
      const once = normalize(fixture(name), { dark });
      const twice = normalize(once, { dark });
      assert.equal(twice, once, at(name, (dark ? 'dark' : 'light') + ' output changed on a second pass'));
    }
  }
});

test('bad input comes back untouched', () => {
  const cases = ['', undefined, '<not-svg>', '<svg><g></svg>', '   '];
  for (const input of cases) {
    let result;
    assert.doesNotThrow(() => {
      result = normalize(input);
    }, 'normalize threw on ' + String(input));
    assert.equal(result, input, 'normalize mangled ' + String(input));
  }
  assert.doesNotThrow(() => normalize(null));
  assert.equal(normalize(null), null);
});

test('the output re-parses as one svg with the same node count', () => {
  for (const name of FIXTURES) {
    const source = fixture(name);
    const output = normalize(source);
    assert.ok(output.includes('<svg'), at(name, 'the output is svg markup'));
    assert.ok(output.trimEnd().endsWith('</svg>'), at(name, 'the output is closed'));
    const before = rootOf(source).querySelectorAll('.node').length;
    const root = rootOf(output);
    assert.equal(root.tagName.toLowerCase(), 'svg', at(name, 're-parses as an svg'));
    assert.equal(root.querySelectorAll('.node').length, before, at(name, 'no node is lost'));
  }
});
