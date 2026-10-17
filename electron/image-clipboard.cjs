async function writeClipboardImage({ clipboard, ClipboardItem }, image) {
  if (image.isEmpty()) throw new Error('이미지를 복사하지 못했습니다.');
  await clipboard.write([
    new ClipboardItem({ 'image/png': new Blob([image.toPNG()], { type: 'image/png' }) }),
  ]);
}

module.exports = { writeClipboardImage };
