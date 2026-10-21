const port = process.env.PORT ?? "3000";
const url = `http://127.0.0.1:${port}/api/v1/health`;

try {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(3000),
  });

  if (!response.ok) {
    process.exitCode = 1;
  }
} catch {
  process.exitCode = 1;
}
