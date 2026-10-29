import assert from "node:assert/strict";

import SwaggerParser from "@apidevtools/swagger-parser";

import { createTestCredentials } from "./test-environment.mjs";
import { services, serviceRequire } from "./workflow/environment.mjs";

Object.assign(process.env, createTestCredentials(), {
  DATABASE_URL: "postgresql://test_only:test_only@127.0.0.1:1/openapi_test",
});

for (const service of services) {
  const require = serviceRequire(service);

  require("reflect-metadata");
  const { NestFactory, ModulesContainer } = require("@nestjs/core");
  const { PATH_METADATA, METHOD_METADATA } = require("@nestjs/common/constants");
  const { RequestMethod } = require("@nestjs/common");
  const { createApiDocuments } = require("@repo/http");
  const { AppModule } = require("./dist/app.module.js");
  const app = await NestFactory.create(AppModule, { logger: false });

  try {
    // Do not call app.init/listen: schema generation must not connect to PostgreSQL.
    app.setGlobalPrefix("api/v1");
    const documents = createApiDocuments(app, service);
    const documented = new Set();

    for (const [kind, document] of Object.entries(documents)) {
      await SwaggerParser.validate(structuredClone(document));

      for (const [path, methods] of Object.entries(document.paths)) {
        assert.equal(path.startsWith("/api/v1/internal/"), kind === "internal");

        for (const [method, operation] of Object.entries(methods)) {
          documented.add(`${method} ${path}`);
          assert.ok(operation.summary, `${service}: ${method} ${path} needs an operation summary`);
          const successes = Object.entries(operation.responses).filter(([status]) =>
            /^2\d\d$/.test(status),
          );

          assert.ok(successes.length > 0);

          for (const [, response] of successes) {
            assert.ok(
              response.content?.["application/json"]?.schema,
              `${service}: ${method} ${path} needs a response schema`,
            );
          }
        }
      }
    }

    const actual = new Set();

    for (const module of app.get(ModulesContainer).values()) {
      for (const { metatype } of module.controllers.values()) {
        const base = Reflect.getMetadata(PATH_METADATA, metatype);

        for (const name of Object.getOwnPropertyNames(metatype.prototype)) {
          const handler = metatype.prototype[name];
          const method = Reflect.getMetadata(METHOD_METADATA, handler);

          if (method === undefined) {
            continue;
          }

          const route = Reflect.getMetadata(PATH_METADATA, handler);
          const path = `/api/v1/${base}/${route}`
            .replace(/\/+$/, "")
            .replace(/\/+/g, "/")
            .replace(/:([^/]+)/g, "{$1}");

          actual.add(`${RequestMethod[method].toLowerCase()} ${path}`);
        }
      }
    }

    assert.deepEqual(
      [...documented].sort(),
      [...actual].sort(),
      `${service}: OpenAPI must cover exactly the implemented routes`,
    );
    const serialized = JSON.stringify(documents.public);

    assert.ok(
      !serialized.includes("X-Internal-Service-Token"),
      "Public specifications must not expose internal authentication",
    );
    console.log(
      `PASS ${service}: ${actual.size} operations, valid separate public/internal specifications, no database connection`,
    );
  } finally {
    await app.close();
  }
}
