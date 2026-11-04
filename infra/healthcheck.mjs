import http from "node:http";
const request = http.get(
  {
    host: "127.0.0.1",
    port: process.env.PORT || 3001,
    path: "/api/ready",
    headers: { host: new URL(process.env.APP_ORIGIN).host },
    timeout: 3000,
  },
  (response) => {
    response.resume();
    process.exitCode = response.statusCode === 200 ? 0 : 1;
  },
);
request.on("timeout", () => request.destroy());
request.on("error", () => {
  process.exitCode = 1;
});
