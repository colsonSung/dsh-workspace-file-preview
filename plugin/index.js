/**
 * Host half of the local preview bundle: authenticated file commands for the
 * Markdown editor and the file-tree context menu, plus session-title commands,
 * plus the annotation draft route the preview's AI assist button calls, plus
 * the side chat question route.
 */
import { copyFile, mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import { isAbsolutePath, pathSegments } from './paths.js';
import { answerQuestion, draftAnnotation, serviceOf } from './host-ai.js';
export const inject = ['commands', 'fs', 'sessionTitle'];

/** The route the client half posts its annotation drafts to. */
export const ROUTE = '/api/workspace-file-preview';

export function apply(ctx) {
  ctx.effect(
    () =>
      ctx.commands.register({
        name: 'wfp-save',
        description: 'Write edited content back to a workspace file from the preview editor',
        input: { hint: '<json>' },
        recordInput: false,
        handler: async ({ rawInput }) => {
          try {
            const payload = JSON.parse(rawInput);
            const target = payload?.path;
            const content = payload?.content;
            if (typeof target !== 'string' || target.length === 0) return { kind: 'error', text: 'wfp-save: missing path' };
            if (typeof content !== 'string') return { kind: 'error', text: 'wfp-save: missing content' };
            if (!isAbsolutePath(target)) return { kind: 'error', text: 'wfp-save: absolute path required' };
            if (target.includes('..')) return { kind: 'error', text: 'wfp-save: path traversal refused' };
            if (content.length > 4 * 1024 * 1024) return { kind: 'error', text: 'wfp-save: content too large' };
            const info = await ctx.fs.lstat(target);
            if (info === undefined || info.type !== 'file') return { kind: 'error', text: 'wfp-save: not a regular file' };
            const file = await ctx.fs.resolve(target);
            await ctx.fs.writeText(file, content);
            return { kind: 'success', text: 'saved' };
          } catch (error) {
            return { kind: 'error', text: 'wfp-save: ' + (error instanceof Error ? error.message : String(error)) };
          }
        },
      }),
    'markdown-editor: save command',
  );

  ctx.effect(
    () =>
      ctx.commands.register({
        name: 'retitle',
        description: 'Regenerate this session title from the whole conversation',
        recordInput: false,
        handler: async ({ agent }) => {
          try {
            const session = agent?.session ?? agent;
            await ctx.sessionTitle.refresh(session);
            return { kind: 'success', text: 'title re-evaluated' };
          } catch (error) {
            return { kind: 'error', text: 'retitle: ' + (error instanceof Error ? error.message : String(error)) };
          }
        },
      }),
    'session-title: retitle command',
  );

  ctx.effect(
    () =>
      ctx.commands.register({
        name: 'rename',
        description: 'Rename this session',
        input: { hint: '<title>' },
        recordInput: false,
        handler: async ({ agent, rawInput }) => {
          const title = String(rawInput ?? '').trim();
          if (title === '') return { kind: 'error', text: 'usage: /rename <title>' };
          try {
            const session = agent?.session ?? agent;
            await ctx.sessionTitle.rename(session, title);
            return { kind: 'success', text: 'renamed to ' + title };
          } catch (error) {
            return { kind: 'error', text: 'rename: ' + (error instanceof Error ? error.message : String(error)) };
          }
        },
      }),
    'session-title: rename command',
  );

  ctx.effect(
    () =>
      ctx.commands.register({
        name: 'wfp-fs',
        description: 'File operations from the file-tree context menu',
        input: { hint: '<json>' },
        recordInput: false,
        handler: async ({ rawInput }) => {
          const guard = (value) => {
            if (typeof value !== 'string' || value.length === 0) throw new Error('path required');
            if (!isAbsolutePath(value)) throw new Error('absolute path required');
            if (value.includes('..')) throw new Error('path traversal refused');
            if (pathSegments(value).length < 2) throw new Error('path too shallow');
            return value;
          };
          try {
            const payload = JSON.parse(rawInput);
            const op = payload?.op;
            const path = guard(payload?.path);
            if (op === 'mkdir') await mkdir(path);
            else if (op === 'create') await writeFile(path, '', { flag: 'wx' });
            else if (op === 'rename' || op === 'move') await rename(path, guard(payload?.target));
            else if (op === 'copy') await copyFile(path, guard(payload?.target));
            else if (op === 'delete') await unlink(path);
            else return { kind: 'error', text: 'wfp-fs: unknown op ' + String(op) };
            return { kind: 'success', text: op };
          } catch (error) {
            return { kind: 'error', text: 'wfp-fs: ' + (error instanceof Error ? error.message : String(error)) };
          }
        },
      }),
    'file-tree: fs command',
  );

  // The preview's AI assist button asks the Host for one draft of the
  // annotation. The Host owns the model, so the route runs here: the page
  // never holds a key and never talks to a provider itself.
  ctx.inject(['connection'], (connectionCtx) => {
    connectionCtx.effect(() => {
      try {
        return connectionCtx.connection.fetch.register({
          path: ROUTE,
          methods: ['POST'],
          requestBody: 'buffered',
          fetch: async (request) => {
            let body;
            try {
              body = await request.json();
            } catch {
              return Response.json(failure('wfp-annotate/bad-request', 'body is not JSON'), { status: 400 });
            }
            const method = typeof body?.method === 'string' ? body.method : '';
            if (method !== 'annotate-draft' && method !== 'ask') {
              return Response.json(failure('wfp-annotate/unknown-method', `unsupported method: ${method}`), { status: 400 });
            }
            try {
              // The model services are read per request: the Host may mount
              // or replace them long after this plugin was applied.
              const deps = {
                get llm() {
                  return serviceOf(ctx, 'llm');
                },
                get agentDefaultModel() {
                  return serviceOf(ctx, 'agentDefaultModel');
                },
              };
              const result = method === 'ask'
                ? await answerQuestion(body?.payload ?? {}, deps)
                : await draftAnnotation(body?.payload ?? {}, deps);
              return Response.json({ ok: true, result });
            } catch (error) {
              return Response.json(
                failure('wfp-annotate/failed', error instanceof Error ? error.message : String(error)),
                { status: 200 },
              );
            }
          },
        });
      } catch (error) {
        // A reload can apply this plugin twice; the route already exists then.
        console.warn('[workspace-file-preview] route registration failed: ' + String(error));
        return () => {};
      }
    }, 'workspace-file-preview: ' + ROUTE);
  });
}

/**
 * Build the error body the client half understands.
 * @param {string} code - the machine readable code.
 * @param {string} message - the Chinese message for the reviewer.
 * @returns {object} the error body.
 */
function failure(code, message) {
  return { ok: false, error: { code, message, details: {} } };
}
