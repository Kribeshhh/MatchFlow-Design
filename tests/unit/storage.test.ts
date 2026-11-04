import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { createStorage } from "../../apps/api/src/modules/media/storage.js";
test("S3 adapter sends signed put/get/delete requests without public ACLs", async () => {
  const stored = new Map<string, Buffer>();
  let calls = 0;
  const server = createServer(async (req, res) => {
    assert.ok(req.headers.authorization?.startsWith("AWS4-HMAC-SHA256"));
    assert.equal(req.headers["x-amz-acl"], undefined);
    const key = req.url!.split("?")[0];
    calls++;
    if (req.method === "PUT") {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      stored.set(key, Buffer.concat(chunks));
      res.end();
    } else if (req.method === "GET") {
      const data = stored.get(key)!;
      res.setHeader("Content-Length", data.length);
      res.end(data);
    } else {
      stored.delete(key);
      res.statusCode = 204;
      res.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address() as { port: number };
    const storage = createStorage({
      S3_REGION: "test-region",
      S3_BUCKET: "test-bucket",
      S3_ENDPOINT: `http://127.0.0.1:${address.port}`,
      S3_FORCE_PATH_STYLE: true,
      S3_ACCESS_KEY_ID: randomBytes(10).toString("hex"),
      S3_SECRET_ACCESS_KEY: randomBytes(24).toString("hex"),
    })!;
    await storage.put("matchflow/test.webp", Buffer.from("fixture"));
    assert.equal(Buffer.from(await storage.get("matchflow/test.webp")).toString(), "fixture");
    await storage.remove("matchflow/test.webp");
    assert.equal(stored.size, 0);
    assert.equal(calls, 3);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
  }
});
