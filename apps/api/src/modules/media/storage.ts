import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { env } from "../../config/env.js";
import { ApiError } from "../../database/client.js";
export interface ObjectStorage {
  put(key: string, bytes: Buffer): Promise<void>;
  get(key: string): Promise<Uint8Array>;
  remove(key: string): Promise<void>;
}
export function createStorage(
  config: Pick<
    typeof env,
    | "S3_BUCKET"
    | "S3_REGION"
    | "S3_ENDPOINT"
    | "S3_FORCE_PATH_STYLE"
    | "S3_ACCESS_KEY_ID"
    | "S3_SECRET_ACCESS_KEY"
  > = env,
): ObjectStorage | undefined {
  if (!config.S3_BUCKET) return undefined;
  const client = new S3Client({
    region: config.S3_REGION,
    endpoint: config.S3_ENDPOINT,
    forcePathStyle: config.S3_FORCE_PATH_STYLE,
    credentials: {
      accessKeyId: config.S3_ACCESS_KEY_ID!,
      secretAccessKey: config.S3_SECRET_ACCESS_KEY!,
    },
    maxAttempts: 2,
  });
  const sendOptions = () => ({ abortSignal: AbortSignal.timeout(10000) });
  return {
    async put(key, bytes) {
      await client.send(
        new PutObjectCommand({
          Bucket: config.S3_BUCKET,
          Key: key,
          Body: bytes,
          ContentType: "image/webp",
          CacheControl: "private, no-store",
        }),
        sendOptions(),
      );
    },
    async get(key) {
      const r = await client.send(
        new GetObjectCommand({ Bucket: config.S3_BUCKET, Key: key }),
        sendOptions(),
      );
      if (!r.Body || !r.ContentLength || r.ContentLength > 2 * 1024 * 1024)
        throw new ApiError(503, "Image is unavailable.");
      return r.Body.transformToByteArray();
    },
    async remove(key) {
      await client.send(
        new DeleteObjectCommand({ Bucket: config.S3_BUCKET, Key: key }),
        sendOptions(),
      );
    },
  };
}
