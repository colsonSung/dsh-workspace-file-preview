/**
 * DOM tests for the annotation dialog's attachment affordances.
 *
 * The dialog is the place the reviewer types the change and (now) attaches a
 * screenshot or a spec file. These tests drive the real component in jsdom:
 * the paperclip, the chips, the remove button and the paste shortcut.
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
const { InstructionPopover } = await import('../src/client-entry.js');

/**
 * One root on document.body: the dialog renders through a portal into the
 * body, so the React tree has to own the body for its events to arrive.
 */
const root = createRoot(document.body);

/** One browser file handle the dialog can stage. */
const fileOf = (name, type) => new dom.window.File(['bytes'], name, { type });

/** Render the dialog with the given props and return its queries. */
const render = async (props) => {
  await act(async () => { root.render(h(InstructionPopover, props)); });
  return {
    attach: () => document.querySelector('.mmd-pop-attach'),
    chips: () => [...document.querySelectorAll('.mmd-pop-file')],
    textarea: () => document.querySelector('.mmd-pop-text'),
    fileInput: () => document.querySelector('input[type="file"]'),
  };
};

/** Unmount the dialog so the next test starts from a clean body. */
const unmount = async () => {
  await act(async () => { root.render(null); });
};

/** Stage files through the hidden file input, the way the paperclip does. */
const stageFiles = async (view, files) => {
  const input = view.fileInput();
  Object.defineProperty(input, 'files', { value: files, configurable: true });
  await act(async () => { input.dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
};

test('the dialog shows the paperclip only when the caller accepts attachments', async () => {
  const withoutAttach = await render({
    anchor: { top: 10, left: 10 },
    title: '标注',
    placeholder: '这里要改成…',
    value: '',
    onChange: () => {},
    onSubmit: () => {},
    onClose: () => {},
    t: (key) => key,
  });
  assert.equal(withoutAttach.attach(), null);
  assert.equal(withoutAttach.fileInput(), null);

  const withAttach = await render({
    anchor: { top: 10, left: 10 },
    title: '标注',
    placeholder: '这里要改成…',
    value: '',
    onChange: () => {},
    onSubmit: () => {},
    onClose: () => {},
    t: (key) => key,
    onAttach: () => {},
  });
  assert.ok(withAttach.attach(), 'the paperclip button renders');
  assert.ok(withAttach.fileInput(), 'the hidden file input renders');
  assert.equal(withAttach.fileInput().multiple, true);
  await unmount();
});

test('staged files become chips that carry the file name', async () => {
  const staged = [];
  const view = await render({
    anchor: { top: 10, left: 10 },
    title: '标注',
    placeholder: '这里要改成…',
    value: '',
    onChange: () => {},
    onSubmit: () => {},
    onClose: () => {},
    t: (key) => key,
    onAttach: (files) => { staged.push(...files); },
  });

  await stageFiles(view, [fileOf('shot.png', 'image/png'), fileOf('spec.pdf', 'application/pdf')]);
  assert.equal(staged.length, 2);
  assert.equal(staged[0].name, 'shot.png');
  assert.equal(staged[1].type, 'application/pdf');
  await unmount();
});

test('a pasted screenshot lands in the attachment list', async () => {
  const staged = [];
  const view = await render({
    anchor: { top: 10, left: 10 },
    title: '标注',
    placeholder: '这里要改成…',
    value: '',
    onChange: () => {},
    onSubmit: () => {},
    onClose: () => {},
    t: (key) => key,
    onAttach: (files) => { staged.push(...files); },
  });

  const pasted = fileOf('pasted.png', 'image/png');
  const event = new dom.window.Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', {
    value: { items: [{ kind: 'file', getAsFile: () => pasted }] },
  });
  await act(async () => { view.textarea().dispatchEvent(event); });

  assert.equal(staged.length, 1);
  assert.equal(staged[0].name, 'pasted.png');
  await unmount();
});

test('the chips render the file name and remove themselves on demand', async () => {
  const detached = [];
  const attachment = { id: 'mmd-att-1', file: fileOf('shot.png', 'image/png'), url: '' };
  const view = await render({
    anchor: { top: 10, left: 10 },
    title: '标注',
    placeholder: '这里要改成…',
    value: '',
    onChange: () => {},
    onSubmit: () => {},
    onClose: () => {},
    t: (key) => key,
    attachments: [attachment],
    onAttach: () => {},
    onDetach: (id) => { detached.push(id); },
  });

  assert.equal(view.chips().length, 1);
  assert.match(view.chips()[0].textContent, /shot\.png/);

  await act(async () => { view.chips()[0].querySelector('button').dispatchEvent(new dom.window.Event('click', { bubbles: true })); });
  assert.deepEqual(detached, ['mmd-att-1']);
  await unmount();
});
