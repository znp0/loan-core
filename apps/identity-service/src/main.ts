import "reflect-metadata";

import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

import { setupApiDocumentation } from "@repo/http";

import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
  if (existsSync(".env")) {
    loadEnvFile(".env");
  }

  const portValue = process.env.PORT ?? "3001";
  const port = Number(portValue);

  if (!/^\d+$/.test(portValue) || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }

  const host = process.env.HOST ?? "127.0.0.1";

  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix("api/v1");
  setupApiDocumentation(app, "identity-service");
  app.enableShutdownHooks();

  await app.listen(port, host);

  Logger.log(`Listening on ${await app.getUrl()}/api/v1`, "identity-service");
}

bootstrap().catch((error: unknown) => {
  Logger.error(error, "Bootstrap");

  process.exitCode = 1;
});
