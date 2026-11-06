import { readFile, rename, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';

/**
 * The package name is the bundle's module id.
 *
 * The Harness client loader keys its factory table by the package name, so a
 * bundle whose id drifts from the manifest loads "without registering". The
 * published form of this plugin drops the `@local/` prefix, so the id is read
 * from package.json instead of being written here: the local shape and the
 * published shape then cannot drift apart.
 */
const { name: PACKAGE_NAME } = JSON.parse(await readFile(new URL('package.json', import.meta.url), 'utf8'));

const wrap = (chunk) => ({
  banner: {
    js: `window.__ModuleLoader__.load({
	id: "${PACKAGE_NAME}",
${chunk ? `\tchunk: "${chunk}",\n` : ''}	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;`,
  },
  footer: {
    js: `		return module.exports;
	}
});`,
  },
});

const shared = {
  bundle: true,
  format: 'cjs',
  target: 'es2020',
  platform: 'browser',
  minify: true,
  logLevel: 'info',
  // The Harness provides these at runtime through the module loader; bundling
  // them would ship a second copy of React inside the client.
  external: ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/dsh-client-ui-primitives'],
};

/**
 * Publish one bundle.
 *
 * The Harness client watches a linked package and re-reads a bundle as soon as
 * it changes. A plain write opens a window in which the watcher reads a
 * half-written file, and the client then reports the module as "loaded
 * without registering" through __ModuleLoader__.load. Writing a sibling file
 * and renaming it into place is atomic on the same filesystem, so a reader
 * sees either the previous bundle or the new one, never a partial one.
 */
const publish = async (outputFile) => {
  const temporary = `${outputFile.path}.tmp`;
  await writeFile(temporary, outputFile.text);
  await rename(temporary, outputFile.path);
};

const bundle = async (entry, outfile, chunk) => {
  const result = await build({
    ...shared,
    entryPoints: [entry],
    outfile,
    write: false,
    ...wrap(chunk),
  });
  await publish(result.outputFiles[0]);
};

await bundle('src/client-entry.js', 'client.js', null);
await bundle('src/mermaid-chunk.js', 'client.mermaid.js', 'client.mermaid.js');
await bundle('src/editor-chunk.js', 'client.editor.js', 'client.editor.js');
