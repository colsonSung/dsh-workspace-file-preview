/**
 * Guard tests for the host half's absolute-path handling.
 *
 * The `wfp-fs` command validates its path before it dispatches on the
 * operation, so an unknown operation exercises the guard without touching the
 * filesystem. `wfp-save` writes through `ctx.fs`, which the double below
 * stubs out.
 *
 * Run with `node --test test/`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apply, ROUTE } from '../index.js';

/** Mount the host half against a double and return what it registered. */
const mount = () => {
  const commands = new Map();
  const routes = new Map();
  const ctx = {
    effect: (fn) => {
      const disposer = fn();
      return typeof disposer === 'function' ? disposer : () => {};
    },
    inject: (names, callback) => {
      callback({
        effect: (fn) => {
          const disposer = fn();
          return typeof disposer === 'function' ? disposer : () => {};
        },
        connection: {
          fetch: {
            register: (descriptor) => {
              routes.set(descriptor.path, descriptor);
              return () => {};
            },
          },
        },
      });
    },
    commands: {
      register: (descriptor) => {
        commands.set(descriptor.name, descriptor);
        return () => {};
      },
    },
    fs: {
      lstat: async () => ({ type: 'file' }),
      resolve: (path) => path,
      writeText: async () => {},
    },
    sessionTitle: {
      refresh: async () => {},
      rename: async () => {},
    },
  };
  apply(ctx);
  return { commands, routes };
};

const run = async (name, payload) => {
  const { commands } = mount();
  const descriptor = commands.get(name);
  assert.ok(descriptor, `${name} is registered`);
  return descriptor.handler({ rawInput: JSON.stringify(payload) });
};

/** An operation the command does not know, so the guard is the only thing that can fail. */
const NOOP = 'noop';

test('wfp-save accepts the path spellings the Harness reports', async () => {
  for (const path of [
    '/home/user/note.md',
    'D:\\workspace\\note.md',
    'D:\\workspace\\docs\\note.md',
    '\\\\server\\share\\note.md',
  ]) {
    const result = await run('wfp-save', { path, content: '# hi' });
    assert.equal(result.kind, 'success', `${path} should be accepted`);
  }
});

test('wfp-save refuses a relative path and a traversal', async () => {
  const relative = await run('wfp-save', { path: 'note.md', content: '# hi' });
  assert.equal(relative.kind, 'error');
  assert.match(relative.text, /absolute path required/);

  const traversal = await run('wfp-save', { path: 'D:\\workspace\\a\\..\\b.md', content: '# hi' });
  assert.equal(traversal.kind, 'error');
  assert.match(traversal.text, /path traversal refused/);
});

test('wfp-fs accepts every absolute spelling', async () => {
  for (const path of [
    '/home/user/dir',
    'D:\\workspace\\dir',
    'D:\\workspace\\docs\\dir',
    '\\\\server\\share\\dir',
  ]) {
    const result = await run('wfp-fs', { op: NOOP, path });
    assert.match(result.text, /unknown op/, `${path} should reach the operation dispatch`);
  }
});

test('wfp-fs refuses a relative path, a traversal and a drive root', async () => {
  const relative = await run('wfp-fs', { op: NOOP, path: 'dir' });
  assert.match(relative.text, /absolute path required/);

  const traversal = await run('wfp-fs', { op: NOOP, path: 'D:\\workspace\\a\\..\\b' });
  assert.match(traversal.text, /path traversal refused/);

  const driveRoot = await run('wfp-fs', { op: NOOP, path: 'D:\\' });
  assert.match(driveRoot.text, /path too shallow/);
});

/** Post one body to the annotation draft route. */
const post = async (body) => {
  const { routes } = mount();
  const descriptor = routes.get(ROUTE);
  assert.ok(descriptor, `the route ${ROUTE} is registered`);
  const request = new Request(`http://localhost${ROUTE}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const response = await descriptor.fetch(request);
  return { status: response.status, body: await response.json() };
};

test('the annotation draft route refuses a method it does not know', async () => {
  const { status, body } = await post({ method: 'something-else' });
  assert.equal(status, 400);
  assert.equal(body.ok, false);
  assert.equal(body.error.code, 'wfp-annotate/unknown-method');
});

test('the annotation draft route answers with a readable error when no model is mounted', async () => {
  const { status, body } = await post({
    method: 'annotate-draft',
    payload: { kind: 'element', path: 'prototype.html', tag: 'div', intent: 'copy' },
  });
  assert.equal(status, 200);
  assert.equal(body.ok, false);
  assert.equal(body.error.code, 'wfp-annotate/failed');
  assert.match(body.error.message, /未配置可用模型/);
});
