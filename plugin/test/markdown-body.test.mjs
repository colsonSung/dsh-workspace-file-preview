/**
 * Smoke tests for the Markdown preview body.
 *
 * The body is the piece every Markdown file goes through: the review bar, the
 * marks and the side chat all live in it. A test that mounts it proves the
 * whole thing renders without throwing, and that the review bar and its
 * annotation count are where a reader expects them.
 *
 * Run with `node --test test/.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });

global.window = dom.window;
global.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
global.HTMLElement = dom.window.HTMLElement;
global.Node = dom.window.Node;
global.Element = dom.window.Element;
global.NodeFilter = dom.window.NodeFilter;
global.Event = dom.window.Event;
global.getComputedStyle = dom.window.getComputedStyle;
global.requestAnimationFrame = dom.window.requestAnimationFrame?.bind(dom.window) ?? ((fn) => setTimeout(fn, 0));
global.cancelAnimationFrame = dom.window.cancelAnimationFrame?.bind(dom.window) ?? clearTimeout;
global.IS_REACT_ACT_ENVIRONMENT = true;

// jsdom has no layout, and so no Range.getBoundingClientRect. The selection
// bar only needs a box to sit next to.
dom.window.Element.prototype.getBoundingClientRect = () => ({
  top: 0, left: 0, width: 420, height: 640, right: 420, bottom: 640, x: 0, y: 0,
});
if (typeof dom.window.Range.prototype.getBoundingClientRect !== 'function') {
  dom.window.Range.prototype.getBoundingClientRect = () => ({
    top: 120, left: 40, width: 200, height: 18, right: 240, bottom: 138, x: 40, y: 120,
  });
}

const { createElement: h } = await import('react');
const { createRoot } = await import('react-dom/client');
const { act } = await import('react-dom/test-utils');
const { MarkdownBody } = await import('../src/client-entry.js');

const root = createRoot(document.body);

/** The translator double: the key is the label. */
const t = (key, params) => {
  if (params === undefined) return key;
  return `${key}:${JSON.stringify(params)}`;
};

/** The props a preview hands the body. */
const props = {
  ctx: {},
  content: { kind: 'text', text: '# Title\n\nA paragraph to review.\n' },
  resourceAddress: 'file://doc.md',
  useResource: () => ({ value: { absolutePath: '/tmp/doc.md' } }),
  useSessions: () => undefined,
  useInput: () => '',
  inputActions: { setDraft: () => {} },
  sessionId: 'session-1',
  t,
};

/** Mount the body. */
const render = async () => {
  await act(async () => { root.render(h(MarkdownBody, props)); });
};

/** Unmount it. */
const unmount = async () => {
  await act(async () => { root.render(null); });
};

test('the preview renders the document and its review bar', async () => {
  await render();
  assert.ok(document.querySelector('[data-document-markdown-mermaid]'), 'the document body is there');
  assert.ok(document.querySelector('.wfp-md-bar'), 'the review bar is there');
  const toggle = document.querySelector('.wfp-md-bar .wfp-anno-toggle');
  assert.ok(toggle, 'the annotate toggle is there');
  assert.equal(toggle.textContent, 'mdAnnotate.toggle');
  await unmount();
});

test('a document without annotations shows no count', async () => {
  await render();
  assert.equal(document.querySelector('.wfp-anno-pill'), null);
  await unmount();
});

test('turning the annotate mode on marks the document for picking', async () => {
  await render();
  const toggle = document.querySelector('.wfp-md-bar .wfp-anno-toggle');
  await act(async () => { toggle.dispatchEvent(new dom.window.Event('click', { bubbles: true })); });
  assert.match(document.querySelector('.wfp-document').className, /wfp-picking/);
  assert.equal(document.querySelector('.wfp-md-bar .wfp-anno-toggle').textContent, 'mdAnnotate.hint');
  await unmount();
});

test('the side chat and the selection bar stay out of the way until they are asked for', async () => {
  await render();
  assert.equal(document.querySelector('.wfp-side-chat'), null);
  assert.equal(document.querySelector('.wfp-sel-actions'), null);
  await unmount();
});

test('selecting text offers the two actions, and the side chat opens with the passage', async () => {
  await render();
  const body = document.querySelector('[data-document-markdown-mermaid]');
  const paragraph = body.querySelector('.wfp-plain') ?? body.querySelector('p');
  const range = document.createRange();
  range.selectNodeContents(paragraph);
  const selection = document.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  await act(async () => { document.dispatchEvent(new dom.window.Event('selectionchange')); });

  const bar = document.querySelector('.wfp-sel-actions');
  assert.ok(bar, 'the selection bar follows the selection');
  const buttons = [...document.querySelectorAll('.wfp-sel-btn')];
  assert.equal(buttons.length, 2);

  await act(async () => { buttons[1].dispatchEvent(new dom.window.Event('click', { bubbles: true })); });
  const chat = document.querySelector('.wfp-side-chat');
  assert.ok(chat, 'the side chat opens');
  assert.match(chat.textContent, /A paragraph to review/);
  await unmount();
});

test('a right click on a selection opens the chat actions', async () => {
  await render();
  const body = document.querySelector('[data-document-markdown-mermaid]');
  const paragraph = body.querySelector('.wfp-plain');
  const range = document.createRange();
  range.selectNodeContents(paragraph);
  const selection = document.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);

  await act(async () => {
    paragraph.dispatchEvent(new dom.window.MouseEvent('contextmenu', { bubbles: true, clientX: 120, clientY: 260 }));
  });

  const menu = document.querySelector('.wfp-menu');
  assert.ok(menu, 'the menu opens');
  const items = [...document.querySelectorAll('.wfp-menu-item')].map((item) => item.textContent);
  assert.deepEqual(items, ['chat.copy', 'chat.addSelection', 'chat.askSide', 'mdAnnotate.pickTitle']);
  await unmount();
});

test('a right click without a selection still offers the block', async () => {
  await render();
  const body = document.querySelector('[data-document-markdown-mermaid]');
  const paragraph = body.querySelector('.wfp-plain');
  await act(async () => {
    paragraph.dispatchEvent(new dom.window.MouseEvent('contextmenu', { bubbles: true, clientX: 120, clientY: 260 }));
  });
  const items = [...document.querySelectorAll('.wfp-menu-item')].map((item) => item.textContent);
  assert.deepEqual(items, ['mdAnnotate.pickTitle']);
  await unmount();
});

test('the menu closes when the reader clicks elsewhere', async () => {
  await render();
  const body = document.querySelector('[data-document-markdown-mermaid]');
  const paragraph = body.querySelector('.wfp-plain');
  await act(async () => {
    paragraph.dispatchEvent(new dom.window.MouseEvent('contextmenu', { bubbles: true, clientX: 120, clientY: 260 }));
  });
  assert.ok(document.querySelector('.wfp-menu'));
  await act(async () => {
    document.body.dispatchEvent(new dom.window.Event('pointerdown', { bubbles: true }));
  });
  assert.equal(document.querySelector('.wfp-menu'), null);
  await unmount();
});
