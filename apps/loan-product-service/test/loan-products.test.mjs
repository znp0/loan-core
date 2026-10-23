import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { setTimeout } from "node:timers/promises";
import test from "node:test";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../dist/generated/prisma/client.js";

const databaseUrl = process.env.TEST_DATABASE_URL;

if (
  !databaseUrl ||
  (process.env.CI !== "true" && !new URL(databaseUrl).pathname.endsWith("_test"))
) {
  throw new Error(
    "TEST_DATABASE_URL must point to a disposable CI database or a dedicated *_test database",
  );
}

const ids = [1, 2, 3, 4].map(
  (number) => `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`,
);

async function availablePort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

test("public loan product reads expose only active products", async () => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  const port = await availablePort();
  const child = spawn(process.execPath, ["dist/main.js"], {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, DATABASE_URL: databaseUrl, HOST: "127.0.0.1", PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  child.stdout.on("data", (chunk) => {
    logs += chunk;
  });
  child.stderr.on("data", (chunk) => {
    logs += chunk;
  });
  const exited = once(child, "exit");
  exited.catch(() => {});
  let inserted = false;

  try {
    assert.equal(
      await prisma.loanProduct.count(),
      0,
      "Test database must start with no loan products",
    );
    const base = `http://127.0.0.1:${port}/api/v1/loan-products`;
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null) throw new Error(`Service exited before ready: ${logs}`);
      try {
        ready = (await fetch(`http://127.0.0.1:${port}/api/v1/health`)).ok;
        if (ready) break;
      } catch {
        await setTimeout(100);
      }
    }
    assert.ok(ready, `Service did not start: ${logs}`);

    const empty = await fetch(base);
    assert.equal(empty.status, 200);
    assert.deepEqual(await empty.json(), {
      data: [],
      page: 0,
      size: 20,
      totalElements: 0,
      totalPages: 0,
    });

    const common = {
      description: "Test product",
      currency: "VND",
      minAmount: 1000000n,
      maxAmount: 5000000n,
      allowedTerms: [6, 12],
      annualInterestRate: "12.5000",
      minAge: 20,
      maxAge: 60,
      requiredDocumentTypes: ["ID_FRONT", "ID_BACK"],
      updatedAt: new Date("2026-10-24T00:00:00.000Z"),
    };
    await prisma.loanProduct.createMany({
      data: [
        {
          ...common,
          id: ids[0],
          name: "Older",
          status: "ACTIVE",
          createdAt: new Date("2026-10-20T00:00:00.000Z"),
        },
        {
          ...common,
          id: ids[1],
          name: "Second",
          status: "ACTIVE",
          createdAt: new Date("2026-10-21T00:00:00.000Z"),
        },
        {
          ...common,
          id: ids[2],
          name: "First",
          status: "ACTIVE",
          createdAt: new Date("2026-10-21T00:00:00.000Z"),
        },
        {
          ...common,
          id: ids[3],
          name: "Hidden",
          status: "INACTIVE",
          createdAt: new Date("2026-10-22T00:00:00.000Z"),
        },
      ],
    });
    inserted = true;

    const first = await fetch(`${base}?page=0&size=2`);
    assert.equal(first.status, 200);
    const page = await first.json();
    assert.deepEqual(
      page.data.map((product) => product.id),
      [ids[2], ids[1]],
    );
    assert.deepEqual([page.page, page.size, page.totalElements, page.totalPages], [0, 2, 3, 2]);
    assert.deepEqual(page.data[0], {
      id: ids[2],
      name: "First",
      description: "Test product",
      status: "ACTIVE",
      currency: "VND",
      minAmount: 1000000,
      maxAmount: 5000000,
      allowedTerms: [6, 12],
      annualInterestRate: 12.5,
      minAge: 20,
      maxAge: 60,
      requiredDocumentTypes: ["ID_FRONT", "ID_BACK"],
      createdAt: "2026-10-21T00:00:00.000Z",
      updatedAt: "2026-10-24T00:00:00.000Z",
    });
    const second = await fetch(`${base}?page=1&size=2`);
    assert.deepEqual(
      (await second.json()).data.map((product) => product.id),
      [ids[0]],
    );
    const detail = await fetch(`${base}/${ids[0]}`);
    assert.equal(detail.status, 200);
    assert.equal((await detail.json()).id, ids[0]);

    for (const id of [ids[3], "00000000-0000-4000-8000-000000000005"]) {
      const response = await fetch(`${base}/${id}`);
      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), {
        code: "PRODUCT_NOT_FOUND",
        message: "The requested loan product was not found.",
        details: [],
      });
    }
    for (const query of ["page=-1", "page=1.5", "size=0", "size=101", "status=INACTIVE"]) {
      const response = await fetch(`${base}?${query}`);
      assert.equal(response.status, 400);
      assert.equal((await response.json()).code, "VALIDATION_ERROR");
    }
    const badId = await fetch(`${base}/not-a-uuid`);
    assert.equal(badId.status, 400);
    assert.deepEqual(await badId.json(), {
      code: "VALIDATION_ERROR",
      message: "The request contains invalid fields.",
      details: [{ field: "productId", message: "Product ID must be a UUID." }],
    });
    const unknown = await fetch(`http://127.0.0.1:${port}/api/v1/not-a-route`);
    assert.deepEqual(await unknown.json(), {
      code: "NOT_FOUND",
      message: "Not Found",
      details: [],
    });
  } finally {
    if (child.exitCode === null) child.kill("SIGTERM");
    await exited;
    if (inserted) await prisma.loanProduct.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  }
});
