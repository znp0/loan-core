import "reflect-metadata";

import assert from "node:assert/strict";
import { createHash, randomInt, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { after, before, test } from "node:test";

import { Test } from "@nestjs/testing";
import { JwtService } from "@nestjs/jwt";
import { compare } from "bcrypt";

const require = createRequire(import.meta.url);
const { AppModule } = require("../dist/app.module.js");
const { PrismaService } = require("../dist/modules/prisma/prisma.service.js");
const { Prisma } = require("../dist/generated/prisma/client.js");
const databaseUrl = process.env.TEST_DATABASE_URL;
const customers = new Map();
const createdIds = new Set();
const originalEnvironment = {
  DATABASE_URL: process.env.DATABASE_URL,
  JWT_SECRET: process.env.JWT_SECRET,
};
let app;
let database;
let url;

// Only persistence is replaced: Nest routing, DTO validation, bcrypt and JWT run for real.
const repository = {
  customer: {
    async create({ data, select }) {
      if (customers.has(data.phone)) {
        throw new Prisma.PrismaClientKnownRequestError("Duplicate phone", {
          code: "P2002",
          clientVersion: "test",
          meta: { target: ["phone"] },
        });
      }
      const customer = { id: randomUUID(), ...data };

      customers.set(data.phone, customer);

      return Object.fromEntries(Object.keys(select).map((key) => [key, customer[key]]));
    },
    async findUnique({ where }) {
      return customers.get(where.phone) ?? null;
    },
  },
};

before(async () => {
  process.env.JWT_SECRET = "test-only-identity-jwt-signing-secret";
  process.env.DATABASE_URL = databaseUrl ?? "postgresql://localhost/unused";
  let builder = Test.createTestingModule({ imports: [AppModule] });

  if (!databaseUrl) {
    builder = builder.overrideProvider(PrismaService).useValue(repository);
  }
  const module = await builder.compile();

  database = module.get(PrismaService);
  app = module.createNestApplication({ logger: false });
  app.setGlobalPrefix("api/v1");
  await app.listen(0, "127.0.0.1");
  url = `${await app.getUrl()}/api/v1/auth`;
});

after(async () => {
  try {
    if (databaseUrl && database) {
      await database.customer.deleteMany({ where: { id: { in: [...createdIds] } } });
    }
  } finally {
    await app?.close();

    for (const [key, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
});

function account(password = "a-secure-password") {
  const subscriberNumber = String(randomInt(100_000_000)).padStart(8, "0");

  return {
    fullName: "Test Customer",
    phone: `09${subscriberNumber}`,
    email: `${randomUUID()}@example.com`,
    password,
  };
}

async function post(path, input) {
  const response = await fetch(`${url}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(10000),
  });

  // Track only this run's accounts; cleanup must never delete unrelated data.
  if (path === "register" && response.status === 201) {
    const customer = await database.customer.findUnique({ where: { phone: input.phone.trim() } });

    createdIds.add(customer.id);
  }

  return response;
}

async function assertError(response, status, code, message) {
  assert.equal(response.status, status);
  assert.deepEqual(await response.json(), { code, message, details: [] });
  assert.deepEqual(response.headers.getSetCookie(), []);
}

function assertTokens(response, customer) {
  const cookies = response.headers.getSetCookie();

  assert.equal(cookies.length, 2);
  const claims = [];

  for (const [name, path, seconds, tokenType] of [
    ["access_token", "/", 900, "access"],
    ["refresh_token", "/api/v1/auth", 604800, "refresh"],
  ]) {
    const cookie = cookies.find((value) => value.startsWith(`${name}=`));

    assert.ok(cookie, `${name} must be set`);
    const parts = cookie.split("; ");

    for (const attribute of [
      "HttpOnly",
      "Secure",
      "SameSite=Strict",
      `Path=${path}`,
      `Max-Age=${seconds}`,
    ]) {
      assert.ok(parts.includes(attribute), `${name}: ${attribute}`);
    }
    const token = parts[0].slice(name.length + 1);
    const jwt = app.get(JwtService);
    const payload = jwt.verify(token, { algorithms: ["HS256"] });

    assert.equal(payload.sub, customer.id);
    assert.equal(payload.tokenType, tokenType);
    assert.equal(payload.exp - payload.iat, seconds);
    assert.equal(typeof payload.jti, "string");
    assert.throws(() => jwt.verify(`${token}tampered`));
    assert.throws(() => jwt.verify(token, { clockTimestamp: payload.exp + 1 }));
    assert.ok(!JSON.stringify(payload).includes(customer.passwordHash));

    if (tokenType === "access") {
      assert.equal(payload.role, "CUSTOMER");
    }
    claims.push(payload);
  }
  assert.notEqual(claims[0].jti, claims[1].jti);

  return claims;
}

test("register persists a CUSTOMER with a salted bcrypt hash and returns only the success message", async () => {
  const input = account();
  const response = await post("register", input);

  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { message: "Register successful" });
  const customer = await database.customer.findUnique({ where: { phone: input.phone } });

  assert.match(customer.id, /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/);
  assert.equal(customer.fullName, input.fullName);
  assert.equal(customer.email, input.email);
  assert.equal(customer.role, "CUSTOMER");
  assert.match(customer.passwordHash, /^\$2[ab]\$12\$/);
  const prehash = createHash("sha256").update(input.password).digest("base64");

  assert.ok(await compare(prehash, customer.passwordHash));
  assertTokens(response, customer);
});

test("registration trims phone and normalizes email; login uses the normalized phone", async () => {
  const input = account();
  const response = await post("register", {
    ...input,
    phone: ` ${input.phone} `,
    email: ` ${input.email.toUpperCase()} `,
  });

  assert.equal(response.status, 201);
  const customer = await database.customer.findUnique({ where: { phone: input.phone } });

  assert.equal(customer.email, input.email);
  assert.equal(
    (await post("login", { phone: ` ${input.phone} `, password: input.password })).status,
    200,
  );
});

test("duplicate phone returns PHONE_ALREADY_EXISTS and does not replace the existing account", async () => {
  const input = account();

  await post("register", input);
  const before = await database.customer.findUnique({ where: { phone: input.phone } });
  const response = await post("register", {
    ...input,
    password: "different-password",
    fullName: "Other Name",
  });

  await assertError(
    response,
    409,
    "PHONE_ALREADY_EXISTS",
    "An account with this phone number already exists.",
  );
  assert.deepEqual(await database.customer.findUnique({ where: { phone: input.phone } }), before);
});

test("concurrent duplicate registration yields one success and one PHONE_ALREADY_EXISTS", async () => {
  const input = account();
  const responses = await Promise.all([post("register", input), post("register", input)]);

  assert.deepEqual(responses.map((response) => response.status).sort(), [201, 409]);
  await assertError(
    responses.find((response) => response.status === 409),
    409,
    "PHONE_ALREADY_EXISTS",
    "An account with this phone number already exists.",
  );
});

test("email is contact information: two different phones can share one email", async () => {
  const first = account();

  assert.equal((await post("register", first)).status, 201);
  assert.equal((await post("register", { ...account(), email: first.email })).status, 201);
});

test("login accepts only phone and password, returns only a message, and sets both cookies", async () => {
  const input = account();

  await post("register", input);
  const response = await post("login", { phone: input.phone, password: input.password });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { message: "Login successful" });
  const customer = await database.customer.findUnique({ where: { phone: input.phone } });

  assertTokens(response, customer);
});

test("unknown phone and wrong password return identical INVALID_CREDENTIALS responses without cookies", async () => {
  const input = account();

  await post("register", input);

  for (const credentials of [
    { phone: input.phone, password: "wrong-password" },
    { phone: account().phone, password: input.password },
  ]) {
    await assertError(
      await post("login", credentials),
      401,
      "INVALID_CREDENTIALS",
      "The phone or password is incorrect.",
    );
  }
});

async function assertValidation(path, input, field) {
  const response = await post(path, input);

  assert.equal(response.status, 400, `${path}: invalid ${field}`);
  const body = await response.json();

  assert.equal(body.code, "VALIDATION_ERROR");
  assert.equal(body.message, "Invalid request input.");
  assert.ok(
    body.details.some((detail) => detail.field === field && typeof detail.message === "string"),
  );
  assert.ok(body.details.every((detail) => Object.keys(detail).sort().join() === "field,message"));
  assert.deepEqual(response.headers.getSetCookie(), []);
}

test("both endpoints reject missing, blank and non-string phone/password values", async () => {
  for (const path of ["register", "login"]) {
    for (const phone of [undefined, null, "", "   ", 123, [], {}]) {
      await assertValidation(path, { ...account(), phone }, "phone");
    }

    for (const password of [undefined, null, "", 123, [], {}]) {
      await assertValidation(path, { ...account(), password }, "password");
    }
  }
});

test("register requires a valid email, nonblank fullName and at least eight password characters", async () => {
  for (const email of [undefined, null, "", "   ", "invalid", 123, [], {}]) {
    await assertValidation("register", { ...account(), email }, "email");
  }

  for (const fullName of [undefined, null, "", "   ", 123, [], {}]) {
    await assertValidation("register", { ...account(), fullName }, "fullName");
  }
  await assertValidation("register", account("1234567"), "password");
});

test("login accepts short nonempty passwords as input but rejects incorrect credentials with 401", async () => {
  await assertError(
    await post("login", { phone: account().phone, password: "x" }),
    401,
    "INVALID_CREDENTIALS",
    "The phone or password is incorrect.",
  );
});

test("unknown fields cannot override role, id or passwordHash", async () => {
  const input = account();
  const response = await post("register", {
    ...input,
    role: "ADMIN",
    id: randomUUID(),
    passwordHash: "injected",
  });

  assert.equal(response.status, 201);
  const customer = await database.customer.findUnique({ where: { phone: input.phone } });

  assert.equal(customer.role, "CUSTOMER");
  assert.notEqual(customer.passwordHash, "injected");
  assertTokens(response, customer);
});

test("eight-character and long Unicode passwords authenticate without bcrypt truncation", async () => {
  for (const password of ["12345678", "a".repeat(129), "?".repeat(128)]) {
    const input = account(password);

    assert.equal((await post("register", input)).status, 201);
    assert.equal((await post("login", { phone: input.phone, password })).status, 200);
    await assertError(
      await post("login", { phone: input.phone, password: `${password.slice(0, -1)}X` }),
      401,
      "INVALID_CREDENTIALS",
      "The phone or password is incorrect.",
    );
  }
});

test(
  "unexpected storage failures return generic 500 responses without cookies or internal details",
  { skip: Boolean(databaseUrl) },
  async () => {
    for (const [path, operation] of [
      ["register", "create"],
      ["login", "findUnique"],
    ]) {
      const original = repository.customer[operation];

      try {
        repository.customer[operation] = async () => {
          throw new Error("private database detail");
        };
        const response = await post(path, account());

        assert.equal(response.status, 500);
        assert.deepEqual(await response.json(), {
          statusCode: 500,
          message: "Internal server error",
        });
        assert.deepEqual(response.headers.getSetCookie(), []);
      } finally {
        repository.customer[operation] = original;
      }
    }
  },
);
