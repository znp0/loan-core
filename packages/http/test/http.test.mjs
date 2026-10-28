import "reflect-metadata";

import assert from "node:assert/strict";
import test from "node:test";

import {
  Body,
  Controller,
  Get,
  HttpException,
  Module,
  PayloadTooLargeException,
  Post,
  UnauthorizedException,
  UsePipes,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { Type } from "class-transformer";
import { IsString, ValidateNested } from "class-validator";

import { AppException, HttpModule, RequestValidationPipe } from "../dist/index.js";

class ChildDto {}
IsString()(ChildDto.prototype, "name");

class InputDto {}
ValidateNested()(InputDto.prototype, "child");
Type(() => ChildDto)(InputDto.prototype, "child");

class FixtureController {
  validate(input) {
    return input;
  }

  unauthorized() {
    throw new UnauthorizedException("private authentication detail");
  }

  conflict() {
    throw new AppException(409, "DOMAIN_CONFLICT", "The record already exists.");
  }

  upload() {
    throw new PayloadTooLargeException("private upload path");
  }

  unavailable() {
    throw Object.assign(new Error("private connection URL"), { code: "P1001" });
  }

  unexpected() {
    throw new Error("private connection URL");
  }

  httpFailure() {
    throw new HttpException({ code: "SECRET", message: "private stack", details: [] }, 502);
  }
}
Controller("fixture")(FixtureController);
for (const method of [
  "unauthorized",
  "conflict",
  "upload",
  "unavailable",
  "unexpected",
  "httpFailure",
]) {
  Get(method)(
    FixtureController.prototype,
    method,
    Object.getOwnPropertyDescriptor(FixtureController.prototype, method),
  );
}
Post("validate")(
  FixtureController.prototype,
  "validate",
  Object.getOwnPropertyDescriptor(FixtureController.prototype, "validate"),
);
Body()(FixtureController.prototype, "validate", 0);
Reflect.defineMetadata("design:paramtypes", [InputDto], FixtureController.prototype, "validate");
UsePipes(new RequestValidationPipe())(
  FixtureController.prototype,
  "validate",
  Object.getOwnPropertyDescriptor(FixtureController.prototype, "validate"),
);

class FixtureModule {}
Module({ imports: [HttpModule], controllers: [FixtureController] })(FixtureModule);

test("global HTTP errors retain statuses and domain codes without leaking implementation details", async () => {
  const app = await NestFactory.create(FixtureModule, { logger: false });
  await app.listen(0, "127.0.0.1");
  const base = await app.getUrl();

  try {
    for (const [path, status, code] of [
      ["fixture/unauthorized", 401, "UNAUTHORIZED"],
      ["fixture/conflict", 409, "DOMAIN_CONFLICT"],
      ["fixture/upload", 413, "FILE_TOO_LARGE"],
      ["fixture/unavailable", 503, "DATABASE_ERROR"],
      ["fixture/unexpected", 500, "INTERNAL_SERVER_ERROR"],
      ["fixture/httpFailure", 502, "INTERNAL_SERVER_ERROR"],
      ["missing", 404, "NOT_FOUND"],
    ]) {
      const response = await fetch(`${base}/${path}`);
      const body = await response.json();

      assert.equal(response.status, status, path);
      assert.equal(body.code, code, path);
      assert.deepEqual(body.details, []);
      assert.deepEqual(Object.keys(body).sort(), ["code", "details", "message"]);
      assert.doesNotMatch(JSON.stringify(body), /private|SECRET/);
    }

    const malformed = await fetch(`${base}/fixture/validate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: '{"private":',
    });
    assert.equal(malformed.status, 400);
    assert.deepEqual(await malformed.json(), {
      code: "VALIDATION_ERROR",
      message: "The request contains invalid fields.",
      details: [],
    });

    const invalid = await fetch(`${base}/fixture/validate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ child: { name: 123 }, unknown: "discard" }),
    });
    assert.equal(invalid.status, 400);
    const validation = await invalid.json();
    assert.equal(validation.code, "VALIDATION_ERROR");
    assert.deepEqual(
      new Set(validation.details.map((detail) => detail.field)),
      new Set(["child.name", "unknown"]),
    );
  } finally {
    await app.close();
  }
});
