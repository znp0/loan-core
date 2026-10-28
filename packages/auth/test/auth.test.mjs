import "reflect-metadata";

import assert from "node:assert/strict";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { request } from "node:http";
import test from "node:test";

import { Controller, Get, Module, Req, UseGuards } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";

import { HttpModule } from "@repo/http";

import {
  AccessAuthModule,
  InternalAuthModule,
  InternalTokenGuard,
  RequireInternalToken,
  RequireRoles,
  RoleGuard,
  internalTokensMatch,
  requireJwtSecret,
} from "../dist/index.js";

class AccessController {
  customer(request) {
    return request.user;
  }

  staff(request) {
    return request.user;
  }

  both(request) {
    return request.user;
  }
}
Controller("access")(AccessController);
UseGuards(RoleGuard)(AccessController);
RequireRoles("CUSTOMER")(AccessController);
for (const method of ["customer", "staff", "both"]) {
  const descriptor = Object.getOwnPropertyDescriptor(AccessController.prototype, method);
  Get(method)(AccessController.prototype, method, descriptor);
  Req()(AccessController.prototype, method, 0);
}
RequireRoles("STAFF")(
  AccessController.prototype,
  "staff",
  Object.getOwnPropertyDescriptor(AccessController.prototype, "staff"),
);
RequireRoles("CUSTOMER", "STAFF")(
  AccessController.prototype,
  "both",
  Object.getOwnPropertyDescriptor(AccessController.prototype, "both"),
);

class UndeclaredController {
  get() {
    return { unexpected: true };
  }
}
Controller("undeclared")(UndeclaredController);
UseGuards(RoleGuard)(UndeclaredController);
Get()(
  UndeclaredController.prototype,
  "get",
  Object.getOwnPropertyDescriptor(UndeclaredController.prototype, "get"),
);

class InternalController {
  product() {
    return { service: "product" };
  }

  repayment() {
    return { service: "repayment" };
  }

  undeclared() {
    return { unexpected: true };
  }
}
Controller("internal")(InternalController);
UseGuards(InternalTokenGuard)(InternalController);
for (const method of ["product", "repayment", "undeclared"]) {
  const descriptor = Object.getOwnPropertyDescriptor(InternalController.prototype, method);
  Get(method)(InternalController.prototype, method, descriptor);
}
RequireInternalToken("PRODUCT_INTERNAL_TOKEN")(
  InternalController.prototype,
  "product",
  Object.getOwnPropertyDescriptor(InternalController.prototype, "product"),
);
RequireInternalToken("REPAYMENT_INTERNAL_TOKEN")(
  InternalController.prototype,
  "repayment",
  Object.getOwnPropertyDescriptor(InternalController.prototype, "repayment"),
);

class FixtureModule {}
Module({
  imports: [AccessAuthModule, InternalAuthModule, HttpModule],
  controllers: [AccessController, UndeclaredController, InternalController],
})(FixtureModule);

test("shared guards authenticate strict access cookies, explicit roles, and receiver-specific internal tokens", async () => {
  const credentials = {
    JWT_SECRET: randomBytes(32).toString("hex"),
    PRODUCT_INTERNAL_TOKEN: randomBytes(32).toString("hex"),
    REPAYMENT_INTERNAL_TOKEN: randomBytes(32).toString("hex"),
  };
  const previous = Object.fromEntries(
    Object.keys(credentials).map((key) => [key, process.env[key]]),
  );
  Object.assign(process.env, credentials);

  const app = await NestFactory.create(FixtureModule, { logger: false });
  await app.listen(0, "127.0.0.1");
  const base = await app.getUrl();
  const jwt = new JwtService({ secret: credentials.JWT_SECRET });
  const sub = randomUUID();
  const claims = {
    sub,
    role: "CUSTOMER",
    tokenType: "access",
    exp: Math.floor(Date.now() / 1000) + 900,
  };

  function cookie(payload = claims, secret = credentials.JWT_SECRET, algorithm = "HS256") {
    const header = Buffer.from(JSON.stringify({ alg: algorithm, typ: "JWT" })).toString(
      "base64url",
    );
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const unsigned = `${header}.${body}`;
    const digest = algorithm === "HS512" ? "sha512" : "sha256";
    return `access_token=${unsigned}.${createHmac(digest, secret).update(unsigned).digest("base64url")}`;
  }

  try {
    for (const [path, role, status] of [
      ["customer", "CUSTOMER", 200],
      ["customer", "STAFF", 403],
      ["staff", "STAFF", 200],
      ["staff", "CUSTOMER", 403],
      ["both", "CUSTOMER", 200],
      ["both", "STAFF", 200],
    ]) {
      const response = await fetch(`${base}/access/${path}`, {
        headers: { cookie: cookie({ ...claims, role }) },
      });
      assert.equal(response.status, status, `${path}: ${role}`);
      if (status === 200) {
        assert.deepEqual(await response.json(), { id: sub, role });
      }
    }

    const noRoles = await fetch(`${base}/undeclared`, { headers: { cookie: cookie() } });
    assert.equal(noRoles.status, 403);

    for (const invalidCookie of [
      "",
      "access_token=",
      "access_token=malformed",
      cookie(claims, "test-only-forged-signature"),
      cookie({ ...claims, exp: Math.floor(Date.now() / 1000) }),
      cookie({ ...claims, exp: Math.floor(Date.now() / 1000) - 1 }),
      cookie({ ...claims, exp: claims.exp + 0.5 }),
      cookie({ ...claims, exp: String(claims.exp) }),
      cookie({ ...claims, tokenType: "refresh" }),
      cookie({ ...claims, sub: "not-a-uuid" }),
      cookie({ ...claims, role: null }),
      cookie(null),
      cookie([claims]),
      cookie("payload"),
      cookie(claims, credentials.JWT_SECRET, "HS512"),
      `access_token=${jwt.sign({ sub, role: "CUSTOMER", tokenType: "access" })}`,
      `${cookie()}; ${cookie()}`,
      `${cookie()}; access_token=`,
    ]) {
      const response = await fetch(`${base}/access/customer`, {
        headers: { cookie: invalidCookie },
      });
      assert.equal(response.status, 401);
      assert.equal((await response.json()).code, "UNAUTHORIZED");
    }

    for (const [service, credential] of [
      ["product", "PRODUCT_INTERNAL_TOKEN"],
      ["repayment", "REPAYMENT_INTERNAL_TOKEN"],
    ]) {
      for (const supplied of [undefined, "wrong", "", credentials[credential]]) {
        const headers = supplied === undefined ? {} : { "X-Internal-Service-Token": supplied };
        const response = await fetch(`${base}/internal/${service}`, { headers });
        assert.equal(response.status, supplied === credentials[credential] ? 200 : 401);
      }

      const wrongReceiver =
        service === "product"
          ? credentials.REPAYMENT_INTERNAL_TOKEN
          : credentials.PRODUCT_INTERNAL_TOKEN;
      assert.equal(
        (
          await fetch(`${base}/internal/${service}`, {
            headers: { "X-Internal-Service-Token": wrongReceiver },
          })
        ).status,
        401,
      );
    }

    const duplicateStatus = await new Promise((resolve, reject) => {
      const child = request(
        `${base}/internal/product`,
        {
          headers: [
            "Host",
            new URL(base).host,
            "X-Internal-Service-Token",
            credentials.PRODUCT_INTERNAL_TOKEN,
            "X-Internal-Service-Token",
            credentials.PRODUCT_INTERNAL_TOKEN,
          ],
        },
        (response) => {
          response.resume();
          response.on("end", () => resolve(response.statusCode));
        },
      );
      child.on("error", reject);
      child.end();
    });
    assert.equal(duplicateStatus, 401);
    assert.equal(
      (
        await fetch(`${base}/internal/undeclared`, {
          headers: { "X-Internal-Service-Token": credentials.PRODUCT_INTERNAL_TOKEN },
        })
      ).status,
      401,
    );
    delete process.env.PRODUCT_INTERNAL_TOKEN;
    assert.equal(
      (
        await fetch(`${base}/internal/product`, {
          headers: { "X-Internal-Service-Token": credentials.PRODUCT_INTERNAL_TOKEN },
        })
      ).status,
      401,
    );

    for (const supplied of [undefined, [], "", "wrong"]) {
      assert.equal(internalTokensMatch(supplied, credentials.REPAYMENT_INTERNAL_TOKEN), false);
    }
    assert.equal(
      internalTokensMatch(
        credentials.REPAYMENT_INTERNAL_TOKEN,
        credentials.REPAYMENT_INTERNAL_TOKEN,
      ),
      true,
    );

    process.env.JWT_SECRET = "short";
    assert.throws(requireJwtSecret, /at least 32 bytes/);
    delete process.env.JWT_SECRET;
    assert.throws(requireJwtSecret, /at least 32 bytes/);
  } finally {
    await app.close();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
});
