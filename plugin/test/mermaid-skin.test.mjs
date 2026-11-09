/**
 * Contract tests for the diagram skin.
 *
 * The skin is the single source of truth for how a diagram looks: colour roles,
 * the type scale, the "one accent" rule, the Mermaid theme and the layout
 * config. A theme change is invisible in a diff review, so the rules a reader
 * depends on (contrast, paper/ink polarity, no Mermaid default blue, CJK
 * typography, the focal directive) are asserted here instead.
 *
 * Everything is computed from the exported functions and the exported token
 * tables, never from a copy of the hex values, so the tests follow the skin
 * rather than pinning a snapshot of it.
 *
 * Run with: node --test test/mermaid-skin.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CONTRAST_CONTRACT,
  DECORATIVE_CONTRACT,
  FONTS,
  GEOMETRY,
  SKIN,
  TYPE,
  composite,
  contrastRatio,
  cssVars,
  isLatinLabel,
  luminance,
  mermaidConfig,
  modes,
  parseColor,
  readFocalDirective,
  stripOwnDirectives,
  themeVariables,
  tokens,
} from '../src/mermaid-skin.js';

const MODES = ['light', 'dark'];
const isDark = (mode) => mode === 'dark';

/** Prefixes an assertion message with the mode and the token role. */
const at = (mode, role, message) => mode + ' ' + role + ': ' + message;

/** Mermaid's stock v12 palette. None of it may survive into a token. */
const MERMAID_DEFAULT_COLORS = [
  '#e6f1ff', // pale blue node fill
  '#8fb8ec', // blue node border
  '#1c56b8', // blue label
  '#334155', // slate root text
  '#f7fafe', // near-white blue surface
  '#d5e0f0', // blue hairline
  '#EdF2AE', // amber sequence note
  '#eaeaea', // grey sequence actor
];

/** The CJK families the sans stack has to reach. */
const CJK_FAMILIES = ['PingFang SC', 'Microsoft YaHei', 'Noto Sans SC'];

test('the contrast contract holds in both modes', () => {
  for (const mode of MODES) {
    const table = tokens(isDark(mode));
    for (const row of CONTRAST_CONTRACT) {
      const background = table[row.against];
      // A translucent role is measured as it is painted: composited on its surface.
      const foreground = composite(table[row.role], background);
      const ratio = contrastRatio(foreground, background);
      assert.equal(typeof ratio, 'number', at(mode, row.role, 'the ratio must be a number'));
      assert.ok(Number.isFinite(ratio), at(mode, row.role, 'the ratio must be finite'));
      assert.ok(ratio >= 1 && ratio <= 21, at(mode, row.role, ratio + ' is outside the WCAG range'));
      assert.ok(
        ratio >= row.minimum,
        at(
          mode,
          row.role,
          '(' + row.kind + ') against ' + row.against + ': ' + ratio.toFixed(3) + ':1 is under the ' + row.minimum + ':1 contract',
        ),
      );
    }
  }
});

test('the decorative fills clear their visibility floor and stay quiet', () => {
  for (const mode of MODES) {
    const table = tokens(isDark(mode));
    for (const row of DECORATIVE_CONTRACT) {
      const background = table[row.against];
      const ratio = contrastRatio(composite(table[row.role], background), background);
      assert.ok(
        ratio >= row.minimum,
        at(mode, row.role, ratio.toFixed(3) + ':1 is under the ' + row.minimum + ':1 visibility floor'),
      );
      // The skin documents these as "deliberately quiet, 1.6-1.7:1". A rule that
      // suddenly reads as a black frame is a design change, not a fix.
      assert.ok(ratio < 3, at(mode, row.role, ratio.toFixed(3) + ':1 is no longer a quiet fill'));
    }
  }
});

test('no Mermaid default colour leaks into a token', () => {
  const surfaces = {
    skin: SKIN,
    fonts: FONTS,
    typeScale: TYPE,
    geometry: GEOMETRY,
    cssLight: cssVars(false),
    cssDark: cssVars(true),
    themeLight: themeVariables(false),
    themeDark: themeVariables(true),
    configLight: mermaidConfig(false),
    configDark: mermaidConfig(true),
  };
  const blob = JSON.stringify(surfaces).toLowerCase();
  for (const color of MERMAID_DEFAULT_COLORS) {
    assert.ok(!blob.includes(color.toLowerCase()), 'Mermaid default ' + color + ' leaked into the skin tables');
  }
});

test('every colour token parses', () => {
  for (const mode of MODES) {
    for (const [role, value] of Object.entries(tokens(isDark(mode)))) {
      if (Array.isArray(value)) {
        for (const color of value) {
          assert.ok(parseColor(color), mode + '.' + role + ' series entry ' + color + ' is not a colour');
        }
        continue;
      }
      assert.ok(parseColor(value), mode + '.' + role + ' = ' + value + ' is not a colour');
    }
  }
});

test('the palette is paper, ink and one accent', () => {
  // Paper is the light surface in light mode and the dark surface in dark mode;
  // ink is its inverse. If either polarity flips, every diagram flips with it.
  assert.ok(luminance(SKIN.light.paper) > 0.8, 'light paper must be a bright sheet');
  assert.ok(luminance(SKIN.dark.paper) < 0.1, 'dark paper must be a dark sheet');
  assert.ok(luminance(SKIN.light.ink) < luminance(SKIN.light.paper), 'light ink is darker than paper');
  assert.ok(luminance(SKIN.dark.ink) > luminance(SKIN.dark.paper), 'dark ink is lighter than paper');
  assert.deepEqual(modes(), ['light', 'dark']);
  assert.equal(tokens(false), SKIN.light, 'tokens(false) is the light table');
  assert.equal(tokens(true), SKIN.dark, 'tokens(true) is the dark table');
});

test('the sans stack names a CJK family and the mono stack does not', () => {
  for (const family of CJK_FAMILIES) {
    assert.ok(FONTS.sans.includes(family), 'the sans stack must reach ' + family);
  }
  // Resolving CJK through a mono face renders it too wide; the stack must not
  // offer a CJK family as its monospace face.
  for (const family of CJK_FAMILIES) {
    assert.ok(!FONTS.mono.includes(family), 'the mono stack must not name ' + family);
  }
  assert.ok(!/(Songti|Noto Serif SC|serif)/.test(FONTS.mono), 'the mono stack must not fall through to a serif CJK face');
  assert.match(FONTS.sans, /sans-serif$/, 'the sans stack ends in its generic family');
  assert.match(FONTS.mono, /monospace$/, 'the mono stack ends in its generic family');
});

test('the type scale keeps node labels readable and micro labels smaller', () => {
  assert.ok(TYPE.node >= 13, 'node labels must stay >= 13px for Chinese glyphs, got ' + TYPE.node);
  assert.ok(TYPE.edge < TYPE.node, 'arrow labels are smaller than node labels');
  assert.ok(TYPE.nodeSmall < TYPE.node, 'the small node size is smaller than the node size');
  assert.ok(TYPE.zone < TYPE.zoneCjk, 'a CJK eyebrow needs the larger zone size');
});

test('the geometry carries the documented radii and zone offsets', () => {
  assert.equal(GEOMETRY.radiusNode, 6);
  assert.equal(GEOMETRY.radiusZone, 8);
  assert.equal(GEOMETRY.zoneLabelInset, 10);
  assert.equal(GEOMETRY.zoneLabelOffset, 7);
  assert.equal(GEOMETRY.hairline, 1);
});

test('themeVariables is assembled from the same tokens', () => {
  for (const mode of MODES) {
    const dark = isDark(mode);
    const table = tokens(dark);
    const theme = themeVariables(dark);
    assert.equal(theme.fontFamily, FONTS.sans, 'Mermaid text uses the skin sans stack');
    assert.equal(theme.fontSize, TYPE.node + 'px', 'the root font size is the node size in px');
    assert.equal(theme.darkMode, dark);
    for (const [key, value] of Object.entries(theme)) {
      if (!/size$/i.test(key)) continue;
      assert.equal(typeof value, 'string', at(mode, key, 'a size must be a CSS length'));
      assert.match(value, /^-?\d+(\.\d+)?px$/, at(mode, key, value + ' must be in px'));
    }
    for (const key of ['actorFontSize', 'messageFontSize', 'noteFontSize']) {
      assert.ok(Object.hasOwn(theme, key), 'sequence diagrams need ' + key);
      assert.match(theme[key], /px$/, key + ' is a px size');
    }
    assert.equal(theme.attributeBackgroundColorOdd, table.paper, 'ER odd rows sit on paper');
    assert.equal(theme.attributeBackgroundColorEven, table.zoneFill, 'ER even rows sit on the zone fill');
    assert.equal(theme.errorTextColor, table.accent, 'an error is marked with the accent');
    assert.equal(theme.errorBkgColor, table.accentTint, 'the error backdrop is the accent tint');
    assert.equal(theme.primaryTextColor, table.ink, 'node text is ink');
    assert.equal(theme.edgeLabelBackground, table.paper, 'edge labels sit on paper');
  }
});

test('the Mermaid config kills the shadow pass and the max-width shrink', () => {
  for (const mode of MODES) {
    const config = mermaidConfig(isDark(mode));
    assert.equal(config.theme, 'base', 'the config builds on the base theme');
    assert.equal(config.look, 'classic', 'v12 look:neo is what adds the drop shadow pass');
    assert.equal(config.securityLevel, 'strict');
    assert.equal(config.startOnLoad, false, 'the preview decides when to render');
    assert.equal(config.flowchart.htmlLabels, true, 'htmlLabels is what the zone eyebrow edits');
    for (const grammar of ['flowchart', 'sequence', 'er', 'state', 'class', 'gantt']) {
      assert.equal(config[grammar].useMaxWidth, false, grammar + ' must not clamp its width');
    }
    assert.deepEqual(config.themeVariables, themeVariables(isDark(mode)), 'the config carries the skin theme');
    assert.equal(config.fontFamily, FONTS.sans, 'the outer font family is the skin sans stack');
  }
});

test('cssVars publishes the literal tokens the wrapper stylesheet reads', () => {
  for (const mode of MODES) {
    const table = tokens(isDark(mode));
    const vars = cssVars(isDark(mode));
    for (const [name, value] of Object.entries(vars)) {
      assert.match(name, /^--wfp-/, name + ' must be a --wfp- custom property');
      assert.equal(typeof value, 'string', name + ' must be a CSS value');
      assert.ok(value.length > 0, name + ' must not be empty');
    }
    // Colour roles carry the token table verbatim; the two type roles carry the
    // stacks, so they are checked as stacks rather than as colours.
    const colourRoles = [
      ['--wfp-paper', 'paper'],
      ['--wfp-paper-2', 'paper2'],
      ['--wfp-ink', 'ink'],
      ['--wfp-muted', 'muted'],
      ['--wfp-soft', 'soft'],
      ['--wfp-rule', 'rule'],
      ['--wfp-rule-solid', 'ruleSolid'],
      ['--wfp-accent', 'accent'],
      ['--wfp-accent-tint', 'accentTint'],
      ['--wfp-link', 'link'],
      ['--wfp-dot', 'dot'],
    ];
    for (const [name, role] of colourRoles) {
      assert.ok(parseColor(vars[name]), name + ' = ' + vars[name] + ' must be a colour');
      assert.equal(vars[name], table[role], name + ' mirrors the ' + role + ' token');
    }
    assert.equal(vars['--wfp-node'], composite(table.nodeFill, table.paper), 'the node surface is the node fill over paper');
    assert.equal(vars['--wfp-sans'], FONTS.sans, 'the wrapper gets the sans stack');
    assert.equal(vars['--wfp-mono'], FONTS.mono, 'the wrapper gets the mono stack');
  }
});

test('isLatinLabel accepts only Latin labels', () => {
  assert.equal(isLatinLabel('Flow'), true);
  assert.equal(isLatinLabel('API Gateway 2.0'), true);
  assert.equal(isLatinLabel('A-B_1'), true);
  assert.equal(isLatinLabel('cafe'), true);
  assert.equal(isLatinLabel('\u7f51\u5173'), false, 'pure Chinese is not Latin');
  assert.equal(isLatinLabel('API \u7f51\u5173'), false, 'mixed Chinese is not Latin');
  assert.equal(isLatinLabel(''), false);
  assert.equal(isLatinLabel('   '), true, 'spaces are ASCII; an empty-looking label is still Latin');
  assert.equal(isLatinLabel(undefined), false);
  assert.equal(isLatinLabel(null), false);
  assert.equal(isLatinLabel(42), false);
});

test('readFocalDirective reads the focal directive', () => {
  assert.deepEqual(
    readFocalDirective('%% focal: A, C\nflowchart TD\n  A-->B'),
    { ids: ['A', 'C'], explicit: true },
  );
  assert.deepEqual(readFocalDirective('%% focal: none\nflowchart TD'), { ids: [], explicit: true }, 'none opts out explicitly');
  assert.deepEqual(readFocalDirective('flowchart TD\n  A-->B'), { ids: [], explicit: false }, 'absent is not explicit');
  assert.deepEqual(
    readFocalDirective('flowchart TD\n  %% focal: B\n  A-->B'),
    { ids: ['B'], explicit: true },
    'the directive is found after the graph header',
  );
  assert.deepEqual(readFocalDirective('%% focal: A\uff0cC'), { ids: ['A', 'C'], explicit: true }, 'a Chinese comma separates ids');
  assert.deepEqual(readFocalDirective('%% focus: A'), { ids: [], explicit: false }, 'a different directive does not match');
  assert.deepEqual(readFocalDirective(undefined), { ids: [], explicit: false });
  assert.deepEqual(readFocalDirective(null), { ids: [], explicit: false });
});

test('stripOwnDirectives removes only the focal line', () => {
  const source = '%% focal: A, C\nflowchart TD\n  %% another comment\n  A-->B\n%% focal: B';
  const stripped = stripOwnDirectives(source);
  assert.equal(stripped, 'flowchart TD\n  %% another comment\n  A-->B\n');
  assert.ok(!/focal/.test(stripped), 'no focal directive survives');
  assert.match(stripped, /another comment/, 'other comments survive');
  assert.match(stripped, /A-->B/, 'the graph survives');
  assert.equal(stripOwnDirectives(undefined), '');
  assert.equal(stripOwnDirectives(null), '');
});

test('parseColor parses hex and rgb()/rgba()', () => {
  assert.deepEqual(parseColor('#f5f5f5'), [245, 245, 245, 1]);
  assert.deepEqual(parseColor('#ABC'), [170, 187, 204, 1], 'short hex is expanded');
  assert.deepEqual(parseColor(' #ffffff '), [255, 255, 255, 1], 'the colour is trimmed');
  assert.deepEqual(parseColor('rgb(1, 2, 3)'), [1, 2, 3, 1]);
  assert.deepEqual(parseColor('rgba(191, 69, 32, 0.08)'), [191, 69, 32, 0.08]);
  assert.deepEqual(parseColor('rgb(45 49 66)'), [45, 49, 66, 1], 'space-separated channels parse');
  assert.equal(parseColor('nope'), null);
  assert.equal(parseColor(''), null);
  assert.equal(parseColor(undefined), null);
  assert.equal(parseColor(12), null);
});

test('composite lays a translucent colour over its background', () => {
  assert.equal(composite('rgba(0, 0, 0, 0.5)', '#ffffff'), 'rgb(128, 128, 128)');
  assert.equal(composite('#2d3142', '#f5f5f5'), 'rgb(45, 49, 66)', 'an opaque colour is returned as its channels');
  assert.equal(composite('rgba(45,49,66,0.12)', '#f5f5f5'), 'rgb(221, 221, 224)');
  assert.equal(composite('nope', '#ffffff'), 'nope', 'an unparseable colour is returned unchanged');
  assert.equal(composite('#000000', 'not-a-colour'), '#000000', 'an unparseable background leaves the colour unchanged');
});

test('luminance and contrastRatio are WCAG 2.x', () => {
  assert.ok(Math.abs(luminance('#ffffff') - 1) < 1e-9);
  assert.ok(Math.abs(luminance('#000000') - 0) < 1e-9);
  assert.equal(luminance('nope'), 0, 'an unparseable colour has no luminance');
  assert.ok(luminance('#f5f5f5') > 0.8);
  assert.ok(luminance('#2d3142') < 0.1);

  assert.equal(contrastRatio('#f5f5f5', '#2d3142').toFixed(3), '11.820', 'paper against ink is the documented ratio');
  assert.ok(Math.abs(contrastRatio('#000000', '#ffffff') - 21) < 1e-9, 'black on white is the maximum ratio');
  assert.equal(contrastRatio('#777777', '#777777'), 1, 'a colour against itself is 1:1');
  assert.equal(contrastRatio('#f5f5f5', '#2d3142'), contrastRatio('#2d3142', '#f5f5f5'), 'the ratio is symmetric');
  // A translucent foreground is composited before it is measured.
  const composed = contrastRatio('rgba(45,49,66,0.12)', '#f5f5f5');
  assert.ok(composed > 1 && composed < 1.5, 'a 12% rule measures ' + composed.toFixed(3) + ':1');
});
