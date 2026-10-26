import { mkdir, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { Injectable, Logger } from "@nestjs/common";

@Injectable()
export class DocumentStorage {
  private readonly logger = new Logger(DocumentStorage.name);

  private root(): string {
    const root = process.env.DOCUMENT_STORAGE_PATH;

    if (!root) {
      throw new Error("DOCUMENT_STORAGE_PATH must name a private durable directory");
    }

    return resolve(root);
  }

  private path(key: string): string {
    if (!/^[0-9a-f-]{36}\/[0-9a-f-]{36}$/.test(key)) {
      throw new Error("Invalid storage key");
    }

    return join(this.root(), key);
  }

  async put(key: string, bytes: Buffer): Promise<void> {
    const path = this.path(key);

    await mkdir(resolve(path, ".."), { recursive: true, mode: 0o700 });

    try {
      await writeFile(path, bytes, { flag: "wx", mode: 0o600 });
    } catch (error) {
      if (!(
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "EEXIST"
      )) {
        await this.remove(key);
      }
      throw error;
    }
  }

  async remove(key: string): Promise<void> {
    try {
      await unlink(this.path(key));
    } catch (error) {
      if (!(
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "ENOENT"
      )) {
        this.logger.error("Failed to clean up an unreferenced application document");
      }
    }
  }
}
