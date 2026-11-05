/**
 * Unit tests for the annotation attachment helpers.
 *
 * The helpers decide what the Host receives with an annotation: images ride
 * along as inline prompt parts, every other file is uploaded first and
 * referenced by the receipt the Host mints.
 *
 * Run with `node --test test/.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAttachmentParts,
  bytesToBase64,
  collectFiles,
  createAttachments,
  dropAttachment,
  isImageFile,
} from '../src/attachments.js';

/** One browser file handle with the given bytes and MIME type. */
const fileOf = (name, type, bytes) => new File([bytes], name, { type });

/** A context double that records every upload call. */
const ctxWith = (upload) => ({
  remote: {
    fileUploads: {
      upload: async (sessionId, request) => upload(sessionId, request),
    },
  },
});

test('isImageFile accepts only the four media types the Host admits', () => {
  assert.equal(isImageFile(fileOf('a.png', 'image/png', 'x')), true);
  assert.equal(isImageFile(fileOf('a.jpg', 'image/jpeg', 'x')), true);
  assert.equal(isImageFile(fileOf('a.webp', 'image/webp', 'x')), true);
  assert.equal(isImageFile(fileOf('a.gif', 'image/gif', 'x')), true);
  assert.equal(isImageFile(fileOf('a.svg', 'image/svg+xml', 'x')), false);
  assert.equal(isImageFile(fileOf('a.pdf', 'application/pdf', 'x')), false);
  assert.equal(isImageFile(null), false);
});

test('bytesToBase64 matches the canonical encoding', () => {
  const bytes = new Uint8Array([0, 1, 2, 250, 251, 255]);
  assert.equal(bytesToBase64(bytes), Buffer.from(bytes).toString('base64'));
  assert.equal(bytesToBase64(new Uint8Array([0])), 'AA==');
});

test('an image becomes an inline prompt part without an upload', async () => {
  let uploads = 0;
  const ctx = ctxWith(async () => { uploads += 1; return { ok: true, value: { receiptId: 'r' } }; });
  const parts = await buildAttachmentParts(ctx, 'session-1', [fileOf('shot.png', 'image/png', 'hello')]);

  assert.equal(uploads, 0);
  assert.equal(parts.length, 1);
  assert.equal(parts[0].type, 'image');
  assert.equal(parts[0].mediaType, 'image/png');
  assert.equal(parts[0].name, 'shot.png');
  assert.equal(parts[0].data, Buffer.from('hello').toString('base64'));
});

test('any other file is uploaded first and referenced by its receipt', async () => {
  const calls = [];
  const ctx = ctxWith(async (sessionId, request) => {
    calls.push({ sessionId, request });
    return { ok: true, value: { receiptId: 'receipt-7' } };
  });
  const parts = await buildAttachmentParts(ctx, 'session-9', [fileOf('spec.pdf', 'application/pdf', 'pdf-bytes')]);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].sessionId, 'session-9');
  assert.equal(calls[0].request.name, 'spec.pdf');
  assert.equal(calls[0].request.data, Buffer.from('pdf-bytes').toString('base64'));
  assert.deepEqual(parts, [{ type: 'file', receiptId: 'receipt-7' }]);
});

test('a refused upload surfaces the business error', async () => {
  const ctx = ctxWith(async () => ({ ok: false, error: { message: 'file too large' } }));
  await assert.rejects(
    () => buildAttachmentParts(ctx, 'session-1', [fileOf('spec.pdf', 'application/pdf', 'x')]),
    /file too large/,
  );
});

test('a build without the upload namespace refuses the file instead of dropping it', async () => {
  await assert.rejects(
    () => buildAttachmentParts({ remote: {} }, 'session-1', [fileOf('spec.pdf', 'application/pdf', 'x')]),
    /file upload is unavailable/,
  );
});

test('collectFiles flattens the attachments of every annotation in order', () => {
  const first = fileOf('a.png', 'image/png', 'a');
  const second = fileOf('b.png', 'image/png', 'b');
  const files = collectFiles([
    { attachments: [{ file: first }] },
    { attachments: [] },
    { attachments: [{ file: second }] },
  ]);
  assert.deepEqual(files, [first, second]);
  assert.deepEqual(collectFiles([{ attachments: [] }]), []);
});

test('dropAttachment removes one chip and keeps the others', () => {
  const attachments = createAttachments([fileOf('a.png', 'image/png', 'a'), fileOf('b.png', 'image/png', 'b')]);
  assert.equal(attachments.length, 2);
  const kept = dropAttachment(attachments, attachments[0].id);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].id, attachments[1].id);
});
