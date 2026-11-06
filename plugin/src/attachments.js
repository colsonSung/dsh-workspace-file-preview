/**
 * Attachment plumbing for the AI annotation dialogs.
 *
 * Images travel with the prompt as inline base64 parts; every other file is
 * staged through the Host upload route and referenced by its receipt id. The
 * module stays free of React so the unit tests can drive it directly.
 */

/** Image media types the Host prompt admission accepts. */
export const IMAGE_MEDIA_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

/** Monotonic id source for the attachment chips. */
let attachmentSeq = 0;

/** @param {File} file - browser file handle. */
export function isImageFile(file) {
  return file !== null && typeof file === 'object' && IMAGE_MEDIA_TYPES.includes(file.type);
}

/**
 * Canonical base64 of raw bytes, without depending on a host Buffer.
 * @param {Uint8Array} bytes - exact file bytes.
 * @returns {string} base64 payload.
 */
export function bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(index, index + chunkSize));
  }
  if (typeof btoa === 'function') return btoa(binary);
  const nodeBuffer = globalThis.Buffer;
  if (nodeBuffer !== undefined) return nodeBuffer.from(bytes).toString('base64');
  throw new Error('no base64 encoder is available in this runtime');
}

/**
 * Raw bytes of one browser File.
 * @param {File} file - browser file handle.
 * @returns {Promise<Uint8Array>} exact file bytes.
 */
export async function fileBytes(file) {
  if (typeof file.arrayBuffer === 'function') return new Uint8Array(await file.arrayBuffer());
  return new Uint8Array(await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('file read failed'));
    reader.readAsArrayBuffer(file);
  }));
}

/**
 * Build the prompt parts for one attachment list.
 *
 * Images become inline parts the Host promotes to durable references; other
 * files are uploaded first and referenced by the receipt the Host mints.
 * @param {object} ctx - client context carrying the remote upload namespace.
 * @param {string} sessionId - target session identity.
 * @param {File[]} files - attachments chosen by the user.
 * @returns {Promise<object[]>} prompt content parts.
 */
export async function buildAttachmentParts(ctx, sessionId, files) {
  const parts = [];
  for (const file of files) {
    const data = bytesToBase64(await fileBytes(file));
    const name = typeof file.name === 'string' && file.name !== '' ? file.name : undefined;
    if (isImageFile(file)) {
      parts.push({ type: 'image', mediaType: file.type, data, ...(name === undefined ? {} : { name }) });
      continue;
    }
    const uploads = ctx?.remote?.fileUploads;
    if (uploads === undefined || typeof uploads.upload !== 'function') {
      throw new Error('file upload is unavailable in this build');
    }
    const result = await uploads.upload(sessionId, { data, ...(name === undefined ? {} : { name }) });
    if (result === null || typeof result !== 'object' || result.ok !== true) {
      throw new Error(result?.error?.message ?? 'file upload failed');
    }
    parts.push({ type: 'file', receiptId: result.value.receiptId });
  }
  return parts;
}

/**
 * Browser-side descriptors for the chips the dialog shows.
 * @param {File[]} files - files chosen by the user.
 * @returns {{id: string, file: File, url: string}[]} attachment descriptors.
 */
export function createAttachments(files) {
  return Array.from(files ?? []).map((file) => {
    attachmentSeq += 1;
    return {
      id: `wfp-att-${attachmentSeq}`,
      file,
      url: typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : '',
    };
  });
}

/**
 * Release the object URLs of one attachment list.
 * @param {{url: string}[]} attachments - descriptors to release.
 */
export function revokeAttachments(attachments) {
  for (const attachment of attachments ?? []) {
    if (attachment.url === '' || attachment.url === undefined) continue;
    if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(attachment.url);
  }
}

/**
 * Remove one descriptor and release its object URL.
 * @param {{id: string, url: string}[]} attachments - current descriptors.
 * @param {string} id - descriptor identity.
 * @returns {{id: string, url: string}[]} the remaining descriptors.
 */
export function dropAttachment(attachments, id) {
  revokeAttachments((attachments ?? []).filter((attachment) => attachment.id === id));
  return (attachments ?? []).filter((attachment) => attachment.id !== id);
}

/**
 * Flatten the attachments of every annotation into one file list.
 * @param {{attachments?: {file: File}[]}[]} items - annotations or regions.
 * @returns {File[]} every attached file, in annotation order.
 */
export function collectFiles(items) {
  const files = [];
  for (const item of items ?? []) {
    for (const attachment of item.attachments ?? []) files.push(attachment.file);
  }
  return files;
}
