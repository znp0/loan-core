import "reflect-metadata";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../dist/generated/prisma/client.js";
import { DocumentStorage } from "../dist/modules/loan-applications/document.storage.js";
import { LoanApplicationsService } from "../dist/modules/loan-applications/loan-applications.service.js";
import { memoryPrisma } from "./memory-prisma.mjs";

const databaseUrl = process.env.TEST_DATABASE_URL;
const databaseTag = `upload-cleanup-${randomUUID()}`;

test("upload cleanup preserves metadata consistency across failed and uncertain transactions", async (t) => {
  if (databaseUrl) {
    const target = new URL(databaseUrl);

    assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(target.hostname));
    assert.ok(target.pathname.endsWith("_test"));
  }

  const prisma = databaseUrl
    ? new PrismaClient({
        adapter: new PrismaPg({ connectionString: databaseUrl, application_name: databaseTag }),
      })
    : memoryPrisma();
  const root = await mkdtemp(join(tmpdir(), "loan-upload-cleanup-"));
  const previousRoot = process.env.DOCUMENT_STORAGE_PATH;
  const applicationIds = [];
  const file = {
    originalname: "private-identity-document.png",
    mimetype: "image/png",
    size: 4,
    buffer: Buffer.from("test"),
  };

  process.env.DOCUMENT_STORAGE_PATH = root;

  async function fixture() {
    const application = await prisma.loanApplication.create({
      data: {
        customerId: randomUUID(),
        productId: randomUUID(),
        applicationNumber: randomUUID(),
        requestedAmount: 100n,
        termMonths: 1,
        purpose: "Test upload consistency",
      },
    });
    const storage = new DocumentStorage();
    const product = {
      async getById() {
        return { requiredDocumentTypes: ["ID_FRONT"] };
      },
    };
    let fault;
    let lookupFailed = false;
    let cleanupRead = false;
    const events = [];
    const logs = [];
    const repository = {
      loanApplication: prisma.loanApplication,
      async $transaction(work) {
        const activeFault = fault;

        fault = undefined;

        if (activeFault) {
          return activeFault(work);
        }

        events.push("fresh-read");
        cleanupRead = true;

        return prisma.$transaction(async (tx) => {
          if (lookupFailed) {
            throw new Error("test-only private database connection details");
          }

          return work(tx);
        });
      },
    };
    const originalRemove = storage.remove.bind(storage);

    storage.remove = async (key) => {
      assert.ok(cleanupRead, "Deletion must follow the fresh metadata check");
      events.push("remove");

      await originalRemove(key);
    };

    const service = new LoanApplicationsService(repository, product, storage, {});

    service.logger = {
      warn(message) {
        logs.push(message);
      },
      error(message) {
        logs.push(message);
      },
    };
    applicationIds.push(application.id);

    return {
      application,
      storage,
      service,
      events,
      logs,
      fail(work) {
        fault = work;
      },
      failLookup() {
        lookupFailed = true;
      },
      upload() {
        return service.uploadDocument(
          application.customerId,
          application.id,
          { type: "ID_FRONT" },
          file,
        );
      },
      files() {
        return readdir(join(root, application.id));
      },
    };
  }

  try {
    await t.test(
      "confirmed rollback deletes only the new upload and restores the old current version",
      async () => {
        const f = await fixture();

        await f.upload();
        const oldFiles = await f.files();
        const failure = new Error("test-only metadata failure");

        f.events.length = 0;
        f.fail(async (work) =>
          prisma.$transaction(async (tx) => {
            await work(tx);
            throw failure;
          }),
        );

        await assert.rejects(f.upload(), (error) => error === failure);
        assert.deepEqual(await f.files(), oldFiles);
        assert.deepEqual(f.events, ["fresh-read", "remove"]);

        const records = await prisma.applicationDocument.findMany({
          where: { applicationId: f.application.id },
        });

        assert.equal(records.length, 1);
        assert.equal(records[0].isCurrent, true);
      },
    );

    await t.test(
      "a lost commit acknowledgement preserves the committed document and reports the failure",
      async () => {
        const f = await fixture();
        const failure = new Error("test-only lost commit acknowledgement");

        f.fail(async (work) => {
          await prisma.$transaction(work);
          throw failure;
        });

        await assert.rejects(f.upload(), (error) => error === failure);

        const records = await prisma.applicationDocument.findMany({
          where: { applicationId: f.application.id },
        });

        assert.equal(records.length, 1);
        assert.deepEqual(await readFile(join(root, records[0].storageKey)), file.buffer);
        assert.deepEqual(f.events, ["fresh-read"]);
        assert.match(f.logs[0], /metadata reference exists/);
        assert.ok(!f.logs.join().includes(file.originalname));
        assert.ok(!f.logs.join().includes(failure.message));
      },
    );

    await t.test(
      "database uncertainty retains the file and logs only investigation identifiers",
      async () => {
        const f = await fixture();
        const failure = new Error("test-only uncertain commit");

        f.fail(async () => {
          throw failure;
        });
        f.failLookup();

        await assert.rejects(f.upload(), (error) => error === failure);
        assert.equal((await f.files()).length, 1);
        assert.deepEqual(f.events, ["fresh-read"]);
        assert.match(f.logs[0], /outcome could not be confirmed/);
        assert.ok(f.logs[0].includes(f.application.id));
        assert.match(f.logs[0], /documentId=/);
        assert.ok(!f.logs.join().includes("private database"));
      },
    );

    await t.test(
      "an uncertain writer must settle before cleanup can confirm absence",
      { skip: !databaseUrl },
      async () => {
        const f = await fixture();
        const entered = Promise.withResolvers();
        const release = Promise.withResolvers();
        const failure = new Error("test-only connection lost during commit");
        let writer;

        f.fail(async (work) => {
          writer = prisma.$transaction(
            async (tx) => {
              const document = await work(tx);

              entered.resolve();
              await release.promise;

              return document;
            },
            { timeout: 10000 },
          );
          void writer.catch(entered.reject);

          await entered.promise;

          throw failure;
        });

        const uploading = f.upload();
        const rejected = assert.rejects(uploading, (error) => error === failure);
        void rejected.catch(() => {});

        try {
          await entered.promise;
          const deadline = Date.now() + 3000;
          let waiting = false;

          while (Date.now() < deadline) {
            const locks =
              await prisma.$queryRaw`SELECT 1 FROM pg_stat_activity WHERE application_name = ${databaseTag} AND wait_event_type = 'Lock'`;

            if (locks.length > 0) {
              waiting = true;
              break;
            }

            await delay(20);
          }

          assert.ok(waiting, "Cleanup must wait for the original writer's PostgreSQL row lock");
          assert.equal((await f.files()).length, 1);
          assert.ok(!f.events.includes("remove"));
        } finally {
          release.resolve();
          await writer;
          await rejected;
        }

        assert.equal((await f.files()).length, 1);
        assert.match(f.logs[0], /metadata reference exists/);
      },
    );

    await t.test(
      "historical committed references also preserve files after an acknowledgement failure",
      async () => {
        const f = await fixture();

        f.fail(async (work) => {
          await prisma.$transaction(work);
          await prisma.applicationDocument.updateMany({
            where: { applicationId: f.application.id, type: "ID_FRONT", isCurrent: true },
            data: { isCurrent: false },
          });

          throw new Error("test-only acknowledgement lost before another replacement");
        });

        await assert.rejects(f.upload());
        assert.equal((await f.files()).length, 1);
        assert.deepEqual(f.events, ["fresh-read"]);
      },
    );

    await t.test(
      "cleanup failure retains the file without replacing the original metadata error",
      async () => {
        const f = await fixture();
        const failure = new Error("test-only original metadata failure");

        f.fail(async () => {
          throw failure;
        });
        f.storage.remove = async () => {
          throw new Error("test-only private storage details");
        };

        await assert.rejects(f.upload(), (error) => error === failure);
        assert.equal((await f.files()).length, 1);
        assert.match(f.logs[0], /cleanup failed/);
        assert.ok(f.logs[0].includes(f.application.id));
        assert.ok(!f.logs.join().includes("private storage"));
      },
    );

    await t.test(
      "a real filesystem cleanup error is logged with the generated storage key",
      async () => {
        const f = await fixture();
        const failure = new Error("test-only metadata failure");
        const originalPut = f.storage.put.bind(f.storage);
        let key;
        const logs = [];

        f.storage.logger = {
          error(message) {
            logs.push(message);
          },
        };
        f.storage.put = async (storageKey, bytes) => {
          await originalPut(storageKey, bytes);
          key = storageKey;
          // unlink cannot remove a directory; use this instead of platform-specific permissions.
          await rm(join(root, key));
          await mkdir(join(root, key));
        };
        f.fail(async () => {
          throw failure;
        });

        await assert.rejects(f.upload(), (error) => error === failure);
        assert.equal((await f.files()).length, 1);
        assert.ok(logs[0].includes(key));
      },
    );
  } finally {
    if (previousRoot === undefined) {
      delete process.env.DOCUMENT_STORAGE_PATH;
    } else {
      process.env.DOCUMENT_STORAGE_PATH = previousRoot;
    }

    try {
      if (databaseUrl) {
        await prisma.applicationDocument.deleteMany({
          where: { applicationId: { in: applicationIds } },
        });
        await prisma.loanApplication.deleteMany({ where: { id: { in: applicationIds } } });
        await prisma.$disconnect();
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});
