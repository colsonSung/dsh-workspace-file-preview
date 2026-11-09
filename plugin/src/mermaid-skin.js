/**
 * The diagram skin.
 *
 * Mermaid ships a generic business theme: pale blue boxes, blue labels, a
 * drop shadow under every container, one font size for every label. A file
 * preview is read next to prose, so a diagram has to behave like a figure in
 * a document rather than like a dashboard widget.
 *
 * This module is the single source of truth for that figure: colour tokens,
 * the type scale, per-grammar size settings, the "one accent" rule, and the
 * Mermaid theme assembled from them.
 *
 * Provenance: the token values, the type scale and the geometry conventions
 * are ported from the MIT-licensed diagram-design skill
 * (https://github.com/cathrynlavery/diagram-design,
 * skills/diagram-design/references/style-guide.md). No upstream asset, icon,
 * font file or HTML template is redistributed; see ATTRIBUTION.md.
 */

/**
 * Semantic colour tokens, one object per mode.
 *
 * Roles, not hex values, are what the rest of the plugin refers to: a node
 * fill is always "paper", a hairline is always "rule", and a focal mark is
 * always "accent". Swapping a mode swaps the table, not the roles.
 */
export const SKIN = {
  light: {
    paper: '#f5f5f5',
    paper2: '#ececec',
    ink: '#2d3142',
    inkStrong: '#111111',
    muted: '#4f5d75',
    soft: '#5a6580',
    rule: 'rgba(45,49,66,0.12)',
    ruleSolid: '#bfc0c0',
    accent: '#bf4520',
    accentTint: 'rgba(191,69,32,0.08)',
    link: '#2e5aa8',
    dot: 'rgba(45,49,66,0.10)',
    zoneFill: 'rgba(45,49,66,0.02)',
    nodeFill: 'rgba(79,93,117,0.10)',
    activation: 'rgba(45,49,66,0.06)',
    series: ['#7c8f6f', '#5e7a9b', '#b8915a', '#9c6b50', '#6e6479'],
  },
  dark: {
    paper: '#2d3142',
    paper2: '#393e53',
    ink: '#f5f5f5',
    inkStrong: '#111111',
    muted: '#bfc0c0',
    soft: '#949eb2',
    rule: 'rgba(245,245,245,0.12)',
    ruleSolid: 'rgba(191,192,192,0.25)',
    accent: '#f08a59',
    accentTint: 'rgba(240,138,89,0.10)',
    link: '#739fdf',
    dot: 'rgba(245,245,245,0.10)',
    zoneFill: 'rgba(245,245,245,0.03)',
    nodeFill: 'rgba(191,192,192,0.10)',
    activation: 'rgba(245,245,245,0.07)',
    series: ['#9caf8f', '#82a0c0', '#d3ad7a', '#b88670', '#8d8298'],
  },
};

/**
 * Font stacks.
 *
 * The upstream skin sets Instrument Serif / Geist / Geist Mono. Neither face
 * is installed on a stock machine and a file preview must not make a network
 * request to draw a diagram, so this is the skin's documented "system" mode:
 * every stack names the upstream face first (a reader who has it installed
 * gets it) and then falls through to the platform face. The CJK families sit
 * after the Latin ones on purpose: Chinese labels are common here, and a
 * stack that resolves CJK through a mono face renders it too wide.
 */
export const FONTS = {
  sans:
    "'Geist', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', " +
    "'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans SC', 'Noto Sans', sans-serif",
  mono:
    "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, 'Cascadia Mono', Consolas, 'Liberation Mono', monospace",
  serif: "'Instrument Serif', ui-serif, 'Songti SC', 'Noto Serif SC', Georgia, serif",
};

/**
 * Type scale, in px.
 *
 * Node labels stay at 14px because the preview panel is not a print page: a
 * diagram that fits a 700px pane is scaled to roughly 0.8, and 12px would
 * land under 10px for Chinese glyphs. The editorial register is carried by
 * the micro labels (zone eyebrow, arrow label, ER field type) being small and
 * mono instead of by shrinking the node text.
 */
export const TYPE = {
  node: 14,
  nodeSmall: 13,
  edge: 10,
  zone: 9.5,
  zoneCjk: 10.5,
  sublabel: 9,
  sequence: 12,
  actor: 13,
  note: 11,
  erField: 11,
  erType: 10,
};

/** Geometry, in px or unitless. */
export const GEOMETRY = {
  radiusNode: 6,
  radiusZone: 8,
  radiusNote: 3,
  hairline: 1,
  edgeWidth: 1.2,
  edgeWidthAccent: 1.5,
  dotGrid: 22,
  zoneLabelInset: 10,
  zoneLabelOffset: 7,
};

/** Mermaid reads sizes as CSS lengths; the token table stores numbers. */
function px(value) {
  return String(value) + 'px';
}

/**
 * Token table for a mode.
 * @param {boolean} dark - whether the host is in dark mode.
 * @returns {object} the token table.
 */
export function tokens(dark) {
  return dark ? SKIN.dark : SKIN.light;
}

/**
 * The CSS custom properties a diagram figure carries.
 * @param {boolean} dark - whether the host is in dark mode.
 * @returns {Record<string, string>} the variables.
 */
export function cssVars(dark) {
  const t = tokens(dark);
  return {
    '--wfp-sans': FONTS.sans,
    '--wfp-mono': FONTS.mono,
    '--wfp-paper': t.paper,
    '--wfp-paper-2': t.paper2,
    '--wfp-ink': t.ink,
    '--wfp-muted': t.muted,
    '--wfp-soft': t.soft,
    '--wfp-rule': t.rule,
    '--wfp-rule-solid': t.ruleSolid,
    '--wfp-accent': t.accent,
    '--wfp-accent-tint': t.accentTint,
    '--wfp-link': t.link,
    '--wfp-dot': t.dot,
    '--wfp-node': composite(t.nodeFill, t.paper),
  };
}

/**
 * Mermaid themeVariables for the "base" theme.
 *
 * Only values Mermaid actually reads are set here; anything the renderer
 * cannot express (corner radii, filters, zone label placement) is handled by
 * the post-render pass in mermaid-svg.js.
 * @param {boolean} dark - whether the host is in dark mode.
 * @returns {Record<string, unknown>} the theme variables.
 */
export function themeVariables(dark) {
  const t = tokens(dark);
  const series = t.series;
  return {
    darkMode: dark,
    background: 'transparent',
    fontFamily: FONTS.sans,
    fontSize: px(TYPE.node),

    // Graph nodes and clusters.
    primaryColor: composite(t.nodeFill, t.paper),
    primaryTextColor: t.ink,
    primaryBorderColor: t.ruleSolid,
    secondaryColor: t.paper2,
    secondaryTextColor: t.muted,
    secondaryBorderColor: t.ruleSolid,
    tertiaryColor: t.paper,
    tertiaryTextColor: t.muted,
    tertiaryBorderColor: t.rule,
    lineColor: t.muted,
    textColor: t.ink,
    mainBkg: composite(t.nodeFill, t.paper),
    nodeBorder: t.ruleSolid,
    nodeTextColor: t.ink,
    clusterBkg: t.zoneFill,
    clusterBorder: t.rule,
    titleColor: t.soft,
    edgeLabelBackground: t.paper,

    // Sequence diagrams: actors are columns with a hairline box, messages are
    // ink on paper, notes are a quiet paper-2 block (not the default amber).
    actorBkg: t.paper,
    actorBorder: t.ruleSolid,
    actorTextColor: t.ink,
    actorLineColor: t.rule,
    actorFontSize: px(TYPE.actor),
    actorFontFamily: FONTS.sans,
    actorFontWeight: 600,
    signalColor: t.muted,
    signalTextColor: t.ink,
    messageFontSize: px(TYPE.sequence),
    messageFontFamily: FONTS.sans,
    messageAlign: 'center',
    noteBkgColor: t.paper2,
    noteBorderColor: t.ruleSolid,
    noteTextColor: t.muted,
    noteFontSize: px(TYPE.note),
    noteFontFamily: FONTS.sans,
    labelBoxBkgColor: t.paper,
    labelBoxBorderColor: t.ruleSolid,
    labelTextColor: t.ink,
    labelFontSize: px(TYPE.edge),
    loopTextColor: t.muted,
    activationBkgColor: t.activation,
    activationBorderColor: t.ruleSolid,
    sequenceNumberColor: t.muted,

    // ER diagrams.
    attributeBackgroundColorOdd: t.paper,
    attributeBackgroundColorEven: t.zoneFill,
    attributeFontSize: px(TYPE.erField),

    // Class diagrams.
    classText: t.ink,

    // Gantt / timeline.
    sectionBkgColor: t.zoneFill,
    sectionBkgColor2: t.paper,
    altSectionBkgColor: 'transparent',
    gridColor: t.rule,
    taskBkgColor: t.paper2,
    taskBorderColor: t.ruleSolid,
    taskTextColor: t.ink,
    taskTextDarkColor: t.ink,
    taskTextLightColor: t.ink,
    taskTextOutsideColor: t.muted,
    taskTextClickableColor: t.link,
    activeTaskBkgColor: t.accentTint,
    activeTaskBorderColor: t.accent,
    doneTaskBkgColor: t.paper2,
    doneTaskBorderColor: t.ruleSolid,
    critBkgColor: t.accent,
    critBorderColor: t.accent,
    todayLineColor: t.link,

    // Charts and diagrams that need a series: the accent is still reserved
    // for the focal series, so the series palette starts at the muted set.
    pie1: t.accent,
    pie2: series[0],
    pie3: series[1],
    pie4: series[2],
    pie5: series[3],
    pie6: series[4],
    pie7: t.paper2,
    pie8: t.muted,
    pie9: t.soft,
    pie10: t.ruleSolid,
    pie11: t.ink,
    pie12: t.paper,
    pieTitleTextSize: px(13),
    pieSectionTextSize: px(TYPE.edge),
    pieLegendTextSize: px(TYPE.sublabel),
    cScale0: t.paper2,
    cScale1: series[0],
    cScale2: series[1],
    cScale3: series[2],
    cScale4: series[3],
    cScale5: series[4],

    // Git graph.
    git0: t.muted,
    git1: series[1],
    git2: series[0],
    git3: series[2],
    git4: series[3],
    git5: series[4],
    git6: t.accent,
    git7: t.soft,
    gitBranchLabel0: t.paper,
    gitBranchLabel1: t.paper,
    gitBranchLabel2: t.paper,
    gitBranchLabel3: t.paper,
    gitBranchLabel4: t.paper,
    gitBranchLabel5: t.paper,
    gitBranchLabel6: t.paper,
    gitBranchLabel7: t.paper,

    // Errors (Mermaid draws a syntax error inside the SVG).
    errorBkgColor: t.accentTint,
    errorTextColor: t.accent,
  };
}

/**
 * Mermaid config for every grammar this preview can meet.
 *
 * The layout settings matter as much as the colours: "look: classic" drops
 * the drop-shadow pass Mermaid v12 adds to every node, straight connectors
 * read as drafted rather than extruded, and the cluster/rank spacing leaves
 * room for the zone eyebrow the post-pass writes inside the frame.
 * @param {boolean} dark - whether the host is in dark mode.
 * @returns {Record<string, unknown>} the Mermaid initialize payload.
 */
export function mermaidConfig(dark) {
  return {
    startOnLoad: false,
    securityLevel: 'strict',
    theme: 'base',
    look: 'classic',
    themeVariables: themeVariables(dark),
    fontFamily: FONTS.sans,
    flowchart: {
      look: 'classic',
      htmlLabels: true,
      curve: 'linear',
      padding: 10,
      nodeSpacing: 44,
      rankSpacing: 52,
      diagramPadding: 10,
      useMaxWidth: false,
    },
    sequence: {
      look: 'classic',
      diagramMarginX: 16,
      diagramMarginY: 12,
      actorMargin: 44,
      boxMargin: 10,
      boxTextMargin: 6,
      noteMargin: 10,
      messageMargin: 34,
      mirrorActors: true,
      wrap: false,
      useMaxWidth: false,
    },
    er: {
      look: 'classic',
      diagramPadding: 12,
      layoutDirection: 'TB',
      minEntityWidth: 100,
      minEntityHeight: 60,
      entityPadding: 12,
      useMaxWidth: false,
      stroke: 'gray',
    },
    state: {
      look: 'classic',
      diagramPadding: 8,
      nodeSpacing: 42,
      rankSpacing: 44,
      useMaxWidth: false,
    },
    class: {
      look: 'classic',
      diagramPadding: 10,
      useMaxWidth: false,
    },
    gantt: {
      useMaxWidth: false,
      leftPadding: 90,
      gridLineStartPadding: 32,
      barHeight: 22,
      barGap: 4,
    },
    pie: { useMaxWidth: false, textPosition: 0.62 },
  };
}

/**
 * True when a label is written in Latin script, digits and ASCII punctuation.
 *
 * Tracking and uppercasing are a Latin micro-label convention. Applied to CJK
 * they push glyphs apart and destroy the square rhythm, so every place that
 * adds letter-spacing asks this first.
 * @param {string} text - the label text.
 * @returns {boolean} whether the label is Latin only.
 */
export function isLatinLabel(text) {
  if (typeof text !== 'string' || text.length === 0) return false;
  return /^[\x20-\x7E\u00A0-\u024F]*$/.test(text);
}

/**
 * Read the focal directive out of a Mermaid source block.
 *
 * "%% focal: A, C" names the one or two nodes the diagram is about;
 * "%% focal: none" opts out of the automatic pick. The directive is stripped
 * before rendering, so Mermaid never sees it.
 * @param {string} code - the Mermaid source.
 * @returns {{ids: string[], explicit: boolean}} the directive, if any.
 */
export function readFocalDirective(code) {
  if (typeof code !== 'string') return { ids: [], explicit: false };
  const match = /^[ \t]*%%[ \t]*focal[ \t]*:[ \t]*(.+)$/im.exec(code);
  if (match === null) return { ids: [], explicit: false };
  const value = match[1].trim();
  if (value === '' || /^none$/i.test(value)) return { ids: [], explicit: true };
  return {
    ids: value
      .split(/[,，]/)
      .map((id) => id.trim())
      .filter((id) => id.length > 0),
    explicit: true,
  };
}

/**
 * Remove the focal directive so the parser does not trip over it.
 * @param {string} code - the Mermaid source.
 * @returns {string} the source without the directive comments this plugin owns.
 */
export function stripOwnDirectives(code) {
  if (typeof code !== 'string') return '';
  return code.replace(/^[ \t]*%%[ \t]*focal[ \t]*:[^\n]*\n?/gim, '');
}

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const RGBA = /^rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*(?:[,/]\s*([\d.]+)\s*)?\)$/i;

/**
 * Parse a colour into [r, g, b, a] with 0-255 channels and 0-1 alpha.
 * @param {string} color - a hex or rgb()/rgba() colour.
 * @returns {number[] | null} the channels, or null when unparseable.
 */
export function parseColor(color) {
  if (typeof color !== 'string') return null;
  const text = color.trim();
  const hex = HEX.exec(text);
  if (hex !== null) {
    const body = hex[1];
    const full =
      body.length === 3
        ? body
            .split('')
            .map((c) => c + c)
            .join('')
        : body;
    return [
      Number.parseInt(full.slice(0, 2), 16),
      Number.parseInt(full.slice(2, 4), 16),
      Number.parseInt(full.slice(4, 6), 16),
      1,
    ];
  }
  const rgba = RGBA.exec(text);
  if (rgba !== null) {
    return [Number(rgba[1]), Number(rgba[2]), Number(rgba[3]), rgba[4] === undefined ? 1 : Number(rgba[4])];
  }
  return null;
}

/**
 * Composite a possibly translucent colour over an opaque background.
 * @param {string} color - the foreground colour.
 * @param {string} background - the opaque background colour.
 * @returns {string} an rgb() string.
 */
export function composite(color, background) {
  const fg = parseColor(color);
  const bg = parseColor(background);
  if (fg === null || bg === null) return color;
  const alpha = fg[3];
  const mix = [0, 1, 2].map((i) => Math.round(fg[i] * alpha + bg[i] * (1 - alpha)));
  return 'rgb(' + mix[0] + ', ' + mix[1] + ', ' + mix[2] + ')';
}

/**
 * WCAG 2.x relative luminance.
 * @param {string} color - an opaque colour.
 * @returns {number} the relative luminance, 0-1.
 */
export function luminance(color) {
  const channels = parseColor(color);
  if (channels === null) return 0;
  const [r, g, b] = channels.map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * WCAG 2.x contrast ratio between two colours.
 * @param {string} foreground - the text or mark colour.
 * @param {string} background - the surface it sits on.
 * @returns {number} the ratio, 1-21.
 */
export function contrastRatio(foreground, background) {
  const solid =
    HEX.test(foreground) || /^rgba?\(/i.test(foreground) ? composite(foreground, background) : foreground;
  const a = luminance(solid);
  const b = luminance(background);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * The contrast contract from the skin, as data.
 *
 * A theme change that silently drops body text under 4.5:1 is the kind of
 * regression a screenshot review misses, so it is asserted in the test suite
 * instead. Text roles clear 4.5:1; the two roles a reader has to see on their
 * own, an accent mark and a connector, clear 3:1. Rules, borders and tinted
 * fills are decorative by the skin's definition and carry no minimum: at
 * 1.6-1.7:1 they are deliberately quiet, and meaning never rests on them
 * alone.
 */
export const CONTRAST_CONTRACT = [
  { role: 'ink', kind: 'text', against: 'paper', minimum: 4.5 },
  { role: 'muted', kind: 'text', against: 'paper', minimum: 4.5 },
  { role: 'soft', kind: 'text', against: 'paper', minimum: 4.5 },
  { role: 'accent', kind: 'text', against: 'paper', minimum: 4.5 },
  { role: 'link', kind: 'text', against: 'paper', minimum: 4.5 },
  { role: 'accent', kind: 'mark', against: 'paper', minimum: 3 },
  { role: 'muted', kind: 'mark', against: 'paper', minimum: 3 },
];

/**
 * Fills the skin uses as a surface rather than as a mark.
 *
 * They must stay distinguishable from paper (a zone has to read as a zone)
 * but they are never the only carrier of meaning, so they are held to a
 * visibility floor instead of to a WCAG ratio.
 */
export const DECORATIVE_CONTRACT = [
  { role: 'ruleSolid', against: 'paper', minimum: 1.3 },
  { role: 'rule', against: 'paper', minimum: 1.05 },
  { role: 'zoneFill', against: 'paper', minimum: 1.02 },
];

/**
 * The modes this skin defines.
 * @returns {string[]} the mode names.
 */
export function modes() {
  return ['light', 'dark'];
}
