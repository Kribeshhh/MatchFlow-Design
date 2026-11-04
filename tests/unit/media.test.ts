import assert from "node:assert/strict";
import { test } from "node:test";
import sharp from "sharp";
import { normalizeImage } from "../../apps/api/src/modules/media/image.js";
test("media re-encoding validates content, removes metadata/payloads and caps dimensions", async () => {
  for (const format of ["png", "jpeg", "webp"] as const) {
    const raw = await sharp({ create: { width: 800, height: 700, channels: 3, background: "red" } })
      .toFormat(format)
      .toBuffer();
    const image = await normalizeImage(Buffer.concat([raw, Buffer.from("UNTRUSTED_APPENDIX")]));
    const meta = await sharp(image).metadata();
    assert.equal(meta.format, "webp");
    assert.equal(meta.width, 512);
    assert.equal(meta.height, 512);
    assert.equal(meta.exif, undefined);
    assert.equal(image.includes(Buffer.from("UNTRUSTED_APPENDIX")), false);
  }
  for (const bytes of [
    Buffer.from("not an image"),
    Buffer.from("<svg/>"),
    Buffer.from("GIF89a"),
    Buffer.alloc(2 * 1024 * 1024 + 1),
  ])
    await assert.rejects(() => normalizeImage(bytes));
  const huge = await sharp({
    create: { width: 4100, height: 4000, channels: 3, background: "red" },
  })
    .png()
    .toBuffer();
  await assert.rejects(() => normalizeImage(huge));
});

test("animated images are rejected even when their outer container is supported", async () => {
  const bytes = await sharp(Buffer.concat([Buffer.alloc(300, 255), Buffer.alloc(300, 0)]), {
    raw: { width: 10, height: 20, channels: 3, pageHeight: 10 },
  })
    .webp({ loop: 0, delay: [100, 100] })
    .toBuffer();
  assert.equal((await sharp(bytes, { animated: true }).metadata()).pages, 2);
  await assert.rejects(() => normalizeImage(bytes));
});
