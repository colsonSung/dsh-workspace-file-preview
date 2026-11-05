/**
 * DOM tests for the annotation card.
 *
 * The card is the reviewer's handle on one annotation: it shows the number,
 * the wording and the files, and it carries the two actions — rewrite the
 * wording (edit) or drop the annotation (delete).
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
global.Event = dom.window.Event;
global.getComputedStyle = dom.window.getComputedStyle;
global.requestAnimationFrame = dom.window.requestAnimationFrame?.bind(dom.window) ?? ((fn) => setTimeout(fn, 0));
global.cancelAnimationFrame = dom.window.cancelAnimationFrame?.bind(dom.window) ?? clearTimeout;
global.IS_REACT_ACT_ENVIRONMENT = true;

const { createElement: h } = await import('react');
const { createRoot } = await import('react-dom/client');
const { act } = await import('react-dom/test-utils');
const { AnnotationItem } = await import('../src/client-entry.js');

const root = createRoot(document.body);

/** The translator double: the key is the label. */
const t = (key, params) => {
  if (params === undefined) return key;
  return `${key}:${JSON.stringify(params)}`;
};

/** Render one card and return the queries a reviewer would use. */
const render = async (props) => {
  await act(async () => {
    root.render(h(AnnotationItem, {
      item: { comment: '改成「审核中」', attachments: [] },
      index: 2,
      text: 'div：改成「审核中」',
      title: 'body > div',
      t,
      onEdit: () => {},
      onRemove: () => {},
      ...props,
    }));
  });
  return {
    badge: () => document.querySelector('.mmd-anno-badge'),
    text: () => document.querySelector('.mmd-anno-text'),
    edit: () => document.querySelector('.mmd-anno-edit'),
    remove: () => document.querySelector('.mmd-anno-del'),
    files: () => document.querySelector('.mmd-anno-files'),
  };
};

const unmount = async () => {
  await act(async () => { root.render(null); });
};

test('the card shows the number, the wording and the selector', async () => {
  const view = await render({});
  assert.equal(view.badge().textContent, '3');
  assert.match(view.text().textContent, /改成「审核中」/);
  assert.equal(view.text().getAttribute('title'), 'body > div');
  await unmount();
});

test('the card counts the attached files', async () => {
  const view = await render({ item: { comment: 'x', attachments: [{}, {}] } });
  assert.ok(view.files(), 'the file counter renders');
  assert.match(view.files().textContent, /2/);
  await unmount();
});

test('the edit button asks for the annotation to be rewritten', async () => {
  const edited = [];
  const view = await render({ onEdit: (index) => edited.push(index) });
  await act(async () => { view.edit().dispatchEvent(new dom.window.Event('click', { bubbles: true })); });
  assert.deepEqual(edited, [2]);
  await unmount();
});

test('the delete button asks for the annotation to be dropped', async () => {
  const removed = [];
  const view = await render({ onRemove: (index) => removed.push(index) });
  await act(async () => { view.remove().dispatchEvent(new dom.window.Event('click', { bubbles: true })); });
  assert.deepEqual(removed, [2]);
  await unmount();
});
