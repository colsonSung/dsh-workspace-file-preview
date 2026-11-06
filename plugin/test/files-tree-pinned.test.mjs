/**
 * DOM tests for the Pinned section of the workspace file tree.
 *
 * A reviewer pins a file or a folder; it then shows up under "Pinned" above
 * the tree. The reviewer asked to unpin such a row with the right mouse
 * button. These tests drive the real tree in jsdom: right-click a pinned
 * row, the context menu must lead with "unpin", and running it must take the
 * row out of the list and out of storage.
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
global.Event = dom.window.Event;
global.MouseEvent = dom.window.MouseEvent;
global.getComputedStyle = dom.window.getComputedStyle;
global.requestAnimationFrame = dom.window.requestAnimationFrame?.bind(dom.window) ?? ((fn) => setTimeout(fn, 0));
global.cancelAnimationFrame = dom.window.cancelAnimationFrame?.bind(dom.window) ?? clearTimeout;
global.IS_REACT_ACT_ENVIRONMENT = true;

const { createElement: h } = await import('react');
const { createRoot } = await import('react-dom/client');
const { act } = await import('react-dom/test-utils');
const { FilesTreeBody } = await import('../src/client-entry.js');

const ROOT = '/workspace/demo';
const PINNED_DIR = ROOT + '/docs';
const PINNED_FILE = ROOT + '/readme.md';
const STORAGE_KEY = `wfp-pinned::${ROOT}`;
/** The key the plugin wrote its pins under before it was renamed. */
const LEGACY_STORAGE_KEY = `mmd-pinned::${ROOT}`;

/** The tree's own host calls, stubbed so the test never touches the disk. */
const makeCtx = () => ({
  remote: {
    workspaceFiles: {
      list: async (_sessionId, path) => ({
        ok: true,
        value: {
          entries: path === ROOT
            ? [{ name: 'docs', type: 'directory' }, { name: 'readme.md', type: 'file' }]
            : [{ name: 'guide.md', type: 'file' }],
          truncated: false,
        },
      }),
    },
    fileReferences: { list: async () => ({ ok: true, value: [] }) },
    commands: { execute: async () => ({ ok: true, value: { kind: 'success', text: 'ok' } }) },
    session: { openWorkspacePath: async () => ({ ok: true }) },
  },
  sidebarRight: { openResource: () => {} },
});

const container = document.createElement('div');
document.body.appendChild(container);
const root = createRoot(container);

/** Every render mounts a fresh tree: the pinned list lives in component state. */
let mounts = 0;

/**
 * Render the tree with the given pins and wait for the first level.
 *
 * `seed: false` leaves the storage alone, so a test can put something else
 * there — the key the plugin used before it was renamed, for instance.
 */
const render = async (pinned, options = {}) => {
  if (options.seed !== false) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(pinned));
  await act(async () => {
    root.render(h(FilesTreeBody, {
      key: `tree-${mounts++}`,
      ctx: makeCtx(),
      useTabInfo: () => ({ tab: { navigation: {}, actions: { bindCommands: () => () => {} } } }),
      sessionId: 's1',
      useSessions: (selector) => selector({ byId: { s1: { cwd: ROOT } } }),
      renderSlot: () => null,
      inputActions: { setDraft: () => {} },
      t: (key) => key,
    }));
  });
  await act(async () => { await Promise.resolve(); });
};

/** Right-click an element and let the tree open its context menu. */
const rightClick = async (element) => {
  await act(async () => {
    element.dispatchEvent(new dom.window.MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: 120,
      clientY: 240,
    }));
  });
};

/** The labels of the open context menu, in the order they are shown. */
const menuLabels = () =>
  [...document.querySelectorAll('.wfp-ctx-menu .wfp-ctx-item')].map((item) => item.textContent);

/** Click one entry of the open context menu. */
const clickMenuItem = async (label) => {
  const item = [...document.querySelectorAll('.wfp-ctx-menu .wfp-ctx-item')]
    .find((entry) => entry.textContent === label);
  assert.ok(item, `the context menu offers "${label}"`);
  await act(async () => {
    item.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
  });
};

test('right-clicking a pinned row opens a menu that leads with unpin', async () => {
  await render([{ path: PINNED_DIR, isDir: true }]);
  const row = document.querySelector('.wfp-tree-pinned-row');
  assert.ok(row, 'the pinned row is rendered');

  await rightClick(row);

  const labels = menuLabels();
  assert.equal(labels[0], 'tree.unpin', 'unpin is the first entry of the menu');
  assert.ok(!labels.includes('tree.pin'), 'a pinned row never offers to pin again');
});

test('right-clicking a pinned row acts on the pinned path, not on the workspace root', async () => {
  await render([{ path: PINNED_FILE, isDir: false }]);
  const row = document.querySelector('.wfp-tree-pinned-row');
  assert.ok(row, 'the pinned row is rendered');

  await rightClick(row);

  const labels = menuLabels();
  assert.ok(labels.includes('tree.unpin'), 'the pinned file can be unpinned');
  assert.ok(
    !labels.includes('tree.newFile'),
    'the menu targets the pinned file: only a directory offers to create a file',
  );
});

test('running unpin takes the row out of the list and out of storage', async () => {
  await render([{ path: PINNED_DIR, isDir: true }, { path: PINNED_FILE, isDir: false }]);
  assert.equal(document.querySelectorAll('.wfp-tree-pinned-row').length, 2);

  const rows = [...document.querySelectorAll('.wfp-tree-pinned-row')];
  await rightClick(rows[0]);
  await clickMenuItem('tree.unpin');

  const left = [...document.querySelectorAll('.wfp-tree-pinned-row')];
  assert.equal(left.length, 1, 'one pinned row is gone');
  assert.ok(!left[0].textContent.includes('docs'), 'the un-pinned row is the other one');
  assert.deepEqual(
    JSON.parse(window.localStorage.getItem(STORAGE_KEY)),
    [{ path: PINNED_FILE, isDir: false }],
    'storage keeps the row that stayed pinned',
  );
});

test('unpin is explicit: running it twice does not pin the row back', async () => {
  await render([{ path: PINNED_DIR, isDir: true }]);
  const row = document.querySelector('.wfp-tree-pinned-row');
  await rightClick(row);
  await clickMenuItem('tree.unpin');
  assert.equal(document.querySelectorAll('.wfp-tree-pinned-row').length, 0);

  // The tree row for the same path is no longer pinned, so its menu offers
  // to pin it again instead of unpinning a row that is already gone.
  const treeRow = document.querySelector(`.wfp-locate-row[data-path="${PINNED_DIR}"]`);
  assert.ok(treeRow, 'the tree row is rendered');
  await rightClick(treeRow);
  const labels = menuLabels();
  assert.ok(labels.includes('tree.pin'), 'the path can be pinned again');
  assert.ok(!labels.includes('tree.unpin'), 'the path is no longer pinned');
});

test('right-clicking a tree row that is not pinned offers pin', async () => {
  await render([{ path: PINNED_DIR, isDir: true }]);
  const treeRow = document.querySelector(`.wfp-locate-row[data-path="${PINNED_FILE}"]`);
  assert.ok(treeRow, 'the tree row is rendered');

  await rightClick(treeRow);

  const labels = menuLabels();
  assert.ok(labels.includes('tree.pin'), 'an unpinned row can be pinned');
  assert.ok(!labels.includes('tree.unpin'), 'an unpinned row does not offer unpin');
});

test('right-clicking the empty space of the tree still opens the workspace-root menu', async () => {
  await render([{ path: PINNED_DIR, isDir: true }]);
  const tree = document.querySelector('.wfp-locate-tree');
  assert.ok(tree, 'the tree is rendered');

  await rightClick(tree);

  const labels = menuLabels();
  assert.ok(labels.includes('tree.newFile'), 'the root menu creates files in the root');
  assert.ok(labels.includes('tree.pin'), 'the root itself can be pinned');
  assert.ok(!labels.includes('tree.unpin'), 'the root is not pinned');
});

test('the pins written under the pre-rename key are still there', async () => {
  window.localStorage.removeItem(STORAGE_KEY);
  window.localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify([{ path: PINNED_FILE, isDir: false }]));
  try {
    await render([], { seed: false });
    const row = document.querySelector('.wfp-tree-pinned-row');
    assert.ok(row, 'the pinned row from the old key is rendered');
    assert.match(row.textContent, /readme/);
  } finally {
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  }
});
