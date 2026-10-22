import { Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../generated/prisma/client";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
      throw new Error(
        "DATABASE_URL is required. Configure this service's environment before starting.",
      );
    }

    const adapter = new PrismaPg({
      connectionString,
      connectionTimeoutMillis: 5000,
      max: 5,
    });

    super({ adapter });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      await this.$queryRaw`SELECT 1`;
    } catch {
      await this.$disconnect();

      throw new Error(
        "Database connection failed. Check this service's DATABASE_URL and database availability.",
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
