import { rmSync } from "node:fs";
// Only generated API output; Vite cleans its own apps/web/dist directory.
rmSync(new URL("../dist/api", import.meta.url), { recursive: true, force: true });
