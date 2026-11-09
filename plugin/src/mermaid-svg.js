/**
 * The post-render pass.
 *
 * Mermaid decides its own geometry and writes colours as inline attributes,
 * so a theme alone cannot produce an editorial figure. This module rewrites
 * the SVG Mermaid hands back:
 *
 * - drops the drop-shadow filters Mermaid v12 attaches to nodes and containers;
 * - rounds node and container corners to the skin radius;
 * - turns subgraph titles into a small tracked eyebrow inside the frame;
 * - sets arrow labels, ER field types and eyebrow copy in the mono micro
 *   scale, with tracking only for Latin text (tracking shatters CJK rhythm);
 * - applies the 1-accent rule to the focal node, and only to it.
 *
 * Every operation is idempotent: normalizing an already normalized SVG is a
 * no-op. The functions take a parsed element so they can be tested without a
 * browser, and every selector is one that Mermaid v12 actually emits.
 */

import {
  FONTS,
  GEOMETRY,
  TYPE,
  composite,
  contrastRatio,
  isLatinLabel,
  tokens,
} from './mermaid-skin.js';

/** Attribute Mermaid uses for the diagram flavour, if the root class is absent. */
const ROLE_ATTRIBUTE = 'aria-roledescription';

/**
 * Strip the shadow pass.
 *
 * Mermaid v12 draws neo nodes with a filter attribute and a matching filter
 * definition. The skin has no shadows, so both the reference and the
 * definition go; the class is left alone so Mermaid own CSS keeps working.
 * @param {Element} root - the SVG root.
 */
function removeShadows(root) {
  const shadowed = root.querySelectorAll('[filter]');
  for (const element of shadowed) element.removeAttribute('filter');
  const filters = root.querySelectorAll('filter');
  for (const element of filters) element.remove();
  // Mermaid v12 tags nodes and containers with data-look="neo" and ships
  // #id-scoped rules that re-apply the drop shadow and a blue stroke to those
  // targets. The rules are CSS, so removing the attribute (not the rule) is
  // what actually stops them; the rest of the embedded stylesheet still works.
  const themed = root.querySelectorAll('[data-look]');
  for (const element of themed) element.removeAttribute('data-look');
  const styled = root.querySelectorAll('[style*="drop-shadow"], [style*="box-shadow"]');
  for (const element of styled) {
    const style = element.getAttribute('style') ?? '';
    const cleaned = style
      .replace(/filter\s*:\s*[^;]+;?/gi, '')
      .replace(/box-shadow\s*:\s*[^;]+;?/gi, '');
    if (cleaned.trim() === '') element.removeAttribute('style');
    else element.setAttribute('style', cleaned);
  }
}

/**
 * Round a rectangle element.
 * @param {Element} element - a rect.
 * @param {number} radius - the corner radius in user units.
 */
function roundRect(element, radius) {
  if (element === null || element === undefined) return;
  if (element.tagName.toLowerCase() !== 'rect') return;
  element.setAttribute('rx', String(radius));
  element.setAttribute('ry', String(radius));
}

/** Corner radius and hairline borders on graph nodes. */
function restyleNodes(root, dark) {
  const t = tokens(dark);
  const nodes = root.querySelectorAll('.node');
  for (const node of nodes) {
    const shape = node.querySelector(':scope > rect, :scope > polygon, :scope > path, :scope > circle');
    if (shape === null) continue;
    // ER entities are tables: their outline is a path with square corners, and
    // the attribute-less ones Mermaid draws as a plain rect. Both stay square so
    // one diagram does not mix a rounded box with a table. Their surface is
    // written inline as well, because Mermaid's embedded "#id .node rect" rule
    // is not data-look-scoped and would repaint them with the theme fill.
    if (node.id.includes('-entity-')) {
      shape.setAttribute('stroke-width', String(GEOMETRY.hairline));
      shape.style.setProperty('fill', t.paper);
      shape.style.setProperty('stroke', t.ruleSolid);
      continue;
    }
    if (shape.tagName.toLowerCase() === 'rect') roundRect(shape, GEOMETRY.radiusNode);
    shape.setAttribute('stroke-width', String(GEOMETRY.hairline));
    if (!shape.getAttribute('stroke')) shape.setAttribute('stroke', t.ruleSolid);
    if (!shape.getAttribute('fill')) shape.setAttribute('fill', t.paper);
  }
}

/** Connectors: one hairline weight, no styling per edge. */
function restyleEdges(root, dark) {
  const t = tokens(dark);
  const edges = root.querySelectorAll(
    '.flowchart-link, .edgePaths .path, .messageLine0, .messageLine1, .transition, .relation, .relationshipLine',
  );
  for (const edge of edges) {
    if (edge.getAttribute('stroke') === 'none') continue;
    edge.setAttribute('stroke-width', String(GEOMETRY.edgeWidth));
    if (!edge.getAttribute('stroke')) edge.setAttribute('stroke', t.muted);
    edge.setAttribute('stroke-linecap', 'round');
  }
  const markers = root.querySelectorAll('marker path, marker polygon');
  for (const marker of markers) {
    marker.setAttribute('fill', t.muted);
    marker.setAttribute('stroke', t.muted);
  }
}

/**
 * Rewrite every subgraph title as a zone eyebrow.
 *
 * Mermaid centres the cluster label on the frame top edge, which collides
 * with the border and reads as a caption. The skin sets it inside the frame,
 * top-left, at micro scale: mono and tracked for Latin text, plain sans for
 * CJK so the glyphs keep their square rhythm.
 * @param {Element} root - the SVG root.
 */
function restyleZones(root, dark) {
  const soft = tokens(dark).soft;
  const clusters = root.querySelectorAll('.cluster');
  for (const cluster of clusters) {
    const rect = cluster.querySelector(':scope > rect');
    const label = cluster.querySelector('.cluster-label');
    if (rect === null || label === null) continue;
    const x = Number(rect.getAttribute('x') ?? 0);
    const y = Number(rect.getAttribute('y') ?? 0);
    label.setAttribute(
      'transform',
      'translate(' + (x + GEOMETRY.zoneLabelInset) + ', ' + (y + GEOMETRY.zoneLabelOffset) + ')',
    );
    const text = (label.textContent ?? '').trim();
    label.classList.add('wfp-zone-label');
    if (isLatinLabel(text)) label.classList.add('wfp-zone-latin');
    const latin = isLatinLabel(text);
    const div = label.querySelector('div');
    if (div !== null) {
      div.style.display = 'block';
      div.style.textAlign = 'left';
      div.style.lineHeight = '1';
      div.style.whiteSpace = 'nowrap';
      div.style.textTransform = latin ? 'uppercase' : 'none';
      div.style.fontFamily = latin ? FONTS.mono : FONTS.sans;
      div.style.fontSize = (latin ? TYPE.zone : TYPE.zoneCjk) + 'px';
      div.style.fontWeight = latin ? '500' : '600';
      div.style.letterSpacing = latin ? '0.14em' : 'normal';
      div.style.color = soft;
      div.style.fill = soft;
    }
    const zoneText = label.querySelector('text');
    if (zoneText !== null) {
      zoneText.style.fill = soft;
      zoneText.style.fontFamily = latin ? FONTS.mono : FONTS.sans;
      zoneText.style.fontSize = (latin ? TYPE.zone : TYPE.zoneCjk) + 'px';
      zoneText.style.letterSpacing = latin ? '0.14em' : 'normal';
    }
    const box = label.querySelector('foreignObject');
    if (box !== null && box.getAttribute('height') !== null) box.setAttribute('height', '14');
    roundRect(rect, GEOMETRY.radiusZone);
  }
}

/**
 * Apply the mono micro scale to a label element.
 *
 * The same rule as the zone eyebrow: mono and tracking belong to Latin micro
 * copy; a CJK label keeps the sans face at a slightly larger size.
 * @param {Element} element - the label container (foreignObject div or text).
 * @param {object} options - size for Latin, size for CJK, weight, color.
 */
function microLabel(element, options) {
  if (element === null || element === undefined) return;
  const text = (element.textContent ?? '').trim();
  const latin = isLatinLabel(text);
  const set = (property, value) => element.style.setProperty(property, value);
  set('font-family', FONTS.mono);
  set('font-size', (latin ? options.latinSize : options.cjkSize) + 'px');
  if (latin) {
    set('letter-spacing', options.tracking);
    if (options.uppercase) set('text-transform', 'uppercase');
  } else {
    set('font-family', FONTS.sans);
    set('letter-spacing', 'normal');
    set('text-transform', 'none');
  }
  if (options.color !== undefined) set('color', options.color);
  if (options.weight !== undefined) set('font-weight', options.weight);
}

/** Arrow labels and edge label backdrops. */
function restyleEdgeLabels(root, dark) {
  const t = tokens(dark);
  const labels = root.querySelectorAll('.edgeLabel');
  for (const label of labels) {
    const div = label.querySelector('div');
    if (div !== null) {
      microLabel(div, { latinSize: TYPE.edge, cjkSize: TYPE.edge + 1, tracking: '0.06em', color: t.muted });
    }
    const spans = label.querySelectorAll('span');
    for (const span of spans) span.style.setProperty('background-color', 'transparent');
    const background = label.querySelector('rect');
    if (background !== null) background.setAttribute('fill', t.paper);
  }
  const backgrounds = root.querySelectorAll('.labelBkg');
  for (const background of backgrounds) {
    background.style.setProperty('background-color', 'transparent');
    if (background.tagName.toLowerCase() !== 'svg') background.style.setProperty('fill', 'transparent');
  }
}

/**
 * Give the focal node the one accent.
 *
 * Focal comes from the focal directive, or, in a flowchart that has a single
 * hub, from that hub. The accent is a fill tint plus a 1px accent border; the
 * label stays ink because accent-on-accent fails the contrast contract at
 * this size. No edge is recoloured: a hub with six outgoing edges would turn
 * the accent into a highlighter.
 * @param {Element} root - the SVG root.
 * @param {boolean} dark - the mode.
 * @param {string[]} focalIds - node ids named by the directive.
 */
function applyFocal(root, dark, focalIds) {
  if (focalIds.length === 0) return;
  const t = tokens(dark);
  const tint = composite(t.accentTint, composite(t.nodeFill, t.paper));
  const labelColor = contrastRatio(t.ink, tint) >= contrastRatio(t.inkStrong, tint) ? t.ink : t.inkStrong;
  const wanted = new Set(focalIds);
  const nodes = root.querySelectorAll('.node');
  for (const node of nodes) {
    const id = node.getAttribute('id') ?? '';
    const match = /-(?:flowchart|state|entity|classId|class)-(.+)-\d+$/.exec(id);
    const name = match === null ? null : match[1];
    if (name === null || !wanted.has(name)) continue;
    const shape = node.querySelector(':scope > rect, :scope > polygon, :scope > path, :scope > circle');
    if (shape !== null) {
      // Inline style, not attributes: Mermaid's own #id-scoped stylesheet sets
      // the node fill and stroke, and a presentation attribute loses to it.
      shape.style.fill = tint;
      shape.style.stroke = t.accent;
      shape.style.strokeWidth = String(GEOMETRY.edgeWidth);
    }
    node.classList.add('wfp-focal');
    const labels = node.querySelectorAll('.nodeLabel, .nodeLabel p, .label span');
    for (const label of labels) label.style.color = labelColor;
  }
}

/**
 * Pick the hub of a flowchart when no directive names one.
 *
 * The degree is read from the edge ids Mermaid emits, matched against the node
 * ids that actually exist so an underscore inside an id cannot split it in the
 * wrong place. Only a single, unambiguous hub of degree 3 or more earns the
 * accent; a tie means the diagram has no single subject, and inventing one
 * would mislead the reader.
 * @param {Element} root - the SVG root.
 * @returns {string[]} zero or one node ids.
 */
function inferFocal(root) {
  const nodes = root.querySelectorAll('.node');
  if (nodes.length < 5) return [];
  const ids = new Set();
  for (const node of nodes) {
    const match = /-(?:flowchart|state|entity|classId|class)-(.+)-\d+$/.exec(node.getAttribute('id') ?? '');
    if (match !== null) ids.add(match[1]);
  }
  if (ids.size < 5) return [];
  const degree = new Map();
  for (const id of ids) degree.set(id, 0);
  const links = root.querySelectorAll('.flowchart-link');
  for (const link of links) {
    const middle = /-L_(.+)_\d+$/.exec(link.getAttribute('id') ?? '');
    if (middle === null) continue;
    const body = middle[1];
    for (let index = 0; index < body.length; index += 1) {
      if (body[index] !== '_') continue;
      const from = body.slice(0, index);
      const to = body.slice(index + 1);
      if (!ids.has(from) || !ids.has(to)) continue;
      degree.set(from, (degree.get(from) ?? 0) + 1);
      degree.set(to, (degree.get(to) ?? 0) + 1);
      break;
    }
  }
  const ranked = [...degree.entries()]
    .filter(([id]) => !/^(start|end|开始|结束)$/i.test(id))
    .sort((a, b) => b[1] - a[1]);
  if (ranked.length === 0) return [];
  const top = ranked[0][1];
  if (top < 3) return [];
  // The skin sanctions one or two focal nodes. Two tied hubs are a structure
  // ("these two carry the flow"), not an invented subject, so both are named;
  // three or more is noise, and the first two are as arbitrary as any pick.
  return ranked
    .filter(([, value]) => value === top)
    .slice(0, 2)
    .map(([id]) => id);
}

/** Sequence diagrams: actor columns, notes and activations. */
function restyleSequence(root, dark) {
  const t = tokens(dark);
  const nodeFill = composite(t.nodeFill, t.paper);
  // The sequence renderer hardcodes #eaeaea / #666 for actor boxes and
  // #EDF2AE / #666 for notes, so these are patched by element, not by theme.
  const actors = root.querySelectorAll('rect.actor');
  for (const actor of actors) {
    roundRect(actor, GEOMETRY.radiusNode);
    actor.setAttribute('stroke-width', String(GEOMETRY.hairline));
    actor.style.setProperty('fill', nodeFill);
    actor.style.setProperty('stroke', t.ruleSolid);
  }
  const notes = root.querySelectorAll('rect.note');
  for (const note of notes) {
    roundRect(note, GEOMETRY.radiusNote);
    note.setAttribute('stroke-width', String(GEOMETRY.hairline));
    note.style.setProperty('fill', t.paper2);
    note.style.setProperty('stroke', t.ruleSolid);
  }
  const noteTexts = root.querySelectorAll('.noteText, text.note');
  for (const noteText of noteTexts) {
    noteText.style.setProperty('fill', t.muted);
    noteText.style.setProperty('font-size', TYPE.note + 'px');
  }
  const actorTexts = root.querySelectorAll('text.actor');
  for (const actorText of actorTexts) {
    actorText.style.setProperty('fill', t.ink);
  }
  const activations = root.querySelectorAll('rect.activation');
  for (const activation of activations) {
    roundRect(activation, 2);
    activation.setAttribute('stroke-width', String(GEOMETRY.hairline));
  }
  // Autonumber: Mermaid marks each message with a filled circle marker and puts
  // the number on top of it. The skin turns the marker into a quiet hairline
  // disc so the number reads as a step index, not as a status dot.
  const numberDiscs = root.querySelectorAll('marker[id$="-sequencenumber"] circle');
  for (const disc of numberDiscs) {
    disc.setAttribute('fill', t.paper);
    disc.setAttribute('stroke', t.ruleSolid);
    disc.setAttribute('stroke-width', String(GEOMETRY.hairline));
  }
  // Lifelines: one hairline in the rule token, not Mermaid's hardcoded #999.
  const lifelines = root.querySelectorAll('line.actor-line');
  for (const lifeline of lifelines) {
    lifeline.setAttribute('stroke', t.rule);
    lifeline.setAttribute('stroke-width', String(GEOMETRY.hairline));
  }
  // Message strokes are a presentation attribute, so set them inline to beat it.
  const messageLines = root.querySelectorAll('.messageLine0, .messageLine1');
  for (const messageLine of messageLines) {
    messageLine.style.setProperty('stroke-width', String(GEOMETRY.edgeWidth));
  }
  const loops = root.querySelectorAll('.loopText');
  for (const loop of loops) {
    if (!isLatinLabel((loop.textContent ?? '').trim())) continue;
    const style = loop.getAttribute('style') ?? '';
    loop.setAttribute('style', style + '; font-family: ' + FONTS.mono + '; letter-spacing: 0.08em;');
  }
  const numbers = root.querySelectorAll('.sequenceNumber');
  for (const number of numbers) {
    number.setAttribute('style', 'font-family: ' + FONTS.mono + '; font-size: 9px; fill: ' + t.muted + ';');
  }
}

/** ER diagrams: a quiet header band, hairline row grid, mono field types. */
function restyleEr(root, dark) {
  const t = tokens(dark);
  const background = root.querySelectorAll('.outer-path path[stroke="none"]');
  for (const path of background) path.setAttribute('fill', t.paper2);
  const outlines = root.querySelectorAll('.outer-path path[stroke]');
  for (const path of outlines) {
    if (path.getAttribute('stroke') === 'none') continue;
    path.setAttribute('stroke', t.ruleSolid);
    path.setAttribute('stroke-width', String(GEOMETRY.hairline));
  }
  const odd = root.querySelectorAll('.row-rect-odd path[stroke="none"]');
  for (const path of odd) path.setAttribute('fill', t.paper);
  const even = root.querySelectorAll('.row-rect-even path[stroke="none"]');
  for (const path of even) path.setAttribute('fill', t.zoneFill);
  const grid = root.querySelectorAll('.row-rect-odd path[stroke]:not([stroke="none"]), .row-rect-even path[stroke]:not([stroke="none"])');
  for (const path of grid) {
    path.setAttribute('stroke', t.rule);
    path.setAttribute('stroke-width', '0.8');
  }
  const dividers = root.querySelectorAll('.divider path, .divider line');
  for (const divider of dividers) {
    divider.setAttribute('stroke', t.rule);
    divider.setAttribute('stroke-width', '0.8');
  }
  const types = root.querySelectorAll('.label.attribute-type, .label.attribute-type span');
  for (const type of types) {
    type.style.fontFamily = FONTS.mono;
    type.style.fontSize = TYPE.erType + 'px';
    type.style.letterSpacing = isLatinLabel(type.textContent ?? '') ? '0.02em' : 'normal';
  }
  const keys = root.querySelectorAll('.label.attribute-keys, .label.attribute-keys span');
  for (const key of keys) {
    key.style.fontFamily = FONTS.mono;
    key.style.fontSize = '9px';
    key.style.letterSpacing = '0.04em';
  }
  const names = root.querySelectorAll('.label.name, .label.name span');
  for (const name of names) {
    name.style.fontWeight = '600';
    name.style.fontSize = TYPE.nodeSmall + 'px';
  }
  const markers = root.querySelectorAll('.marker path, .marker line');
  for (const marker of markers) marker.setAttribute('fill', t.muted);
}

/** Add the hooks the wrapper stylesheet needs. */
function tagRoot(root) {
  root.setAttribute('data-wfp-type', root.getAttribute(ROLE_ATTRIBUTE) ?? '');
  root.setAttribute('focusable', 'false');
  root.removeAttribute('style');
  root.setAttribute('preserveAspectRatio', 'xMidYMin meet');
  // Mermaid writes width="100%" so the diagram fills its container. The
  // wrapper sizes the stage from the viewBox instead, so the SVG needs an
  // intrinsic size: without one an auto-sized preview collapses to 0x0.
  const box = (root.getAttribute('viewBox') ?? '').trim().split(/[\s,]+/).map(Number);
  if (box.length === 4 && box[2] > 0 && box[3] > 0) {
    root.setAttribute('width', String(Math.round(box[2])));
    root.setAttribute('height', String(Math.round(box[3])));
  }
}

/**
 * Normalize a Mermaid SVG string.
 * @param {string} svg - the SVG string Mermaid produced.
 * @param {object} options - render options.
 * @param {boolean} options.dark - whether the host is in dark mode.
 * @param {string[]} [options.focal] - node ids named by the source directive.
 * @param {Element} [options.parserRoot] - a parsed element to reuse (tests).
 * @param {Function} [options.parse] - a parser factory (tests).
 * @returns {string} the normalized SVG markup.
 */
export function normalizeMermaidSvg(svg, options) {
  const config = options ?? {};
  const dark = config.dark === true;
  const focal = Array.isArray(config.focal) ? config.focal : [];
  if (typeof svg !== 'string' || svg.trim() === '') return svg;
  let parsed;
  try {
    const doc = config.document ?? (typeof DOMParser === 'undefined' ? null : new DOMParser());
    if (doc === null) return svg;
    parsed = doc.parseFromString(svg, 'image/svg+xml');
  } catch {
    return svg;
  }
  const root = parsed === null || parsed === undefined ? null : parsed.documentElement;
  if (root === null || root === undefined) return svg;
  if (!root.tagName || root.tagName.toLowerCase() !== 'svg') return svg;
  try {
    removeShadows(root);
    restyleNodes(root, dark);
    restyleEdges(root, dark);
    restyleZones(root, dark);
    restyleEdgeLabels(root, dark);
    restyleSequence(root, dark);
    restyleEr(root, dark);
    const type = root.getAttribute(ROLE_ATTRIBUTE) ?? '';
    const focalIds = focal.length > 0 ? focal : type === 'flowchart-v2' ? inferFocal(root) : [];
    applyFocal(root, dark, focalIds);
    tagRoot(root);
    return new XMLSerializer().serializeToString(root);
  } catch {
    return svg;
  }
}
