import type { SchemaObject } from "@nestjs/swagger";

import { jsonArray, jsonObject } from "@repo/http";

const money: SchemaObject = {
  type: "integer",
  minimum: 0,
  maximum: Number.MAX_SAFE_INTEGER,
  description: "Amount in VND.",
};
const integer: SchemaObject = { type: "integer" };
const uuid: SchemaObject = { type: "string", format: "uuid" };
const timestamp: SchemaObject = { type: "string", format: "date-time" };

export const productSchema = jsonObject({
  id: uuid,
  name: { type: "string" },
  description: { type: "string" },
  status: { type: "string", enum: ["ACTIVE", "INACTIVE"] },
  currency: { type: "string", enum: ["VND"] },
  minAmount: money,
  maxAmount: money,
  allowedTerms: jsonArray(integer),
  annualInterestRate: {
    type: "number",
    description: "Annual percentage rate, e.g. 12 means 12% per year.",
  },
  minAge: integer,
  maxAge: integer,
  requiredDocumentTypes: jsonArray({ type: "string", enum: ["ID_FRONT", "ID_BACK"] }),
  createdAt: timestamp,
  updatedAt: timestamp,
});

export const productPageSchema = jsonObject({
  data: jsonArray(productSchema),
  page: { type: "integer", minimum: 0 },
  size: integer,
  totalElements: integer,
  totalPages: integer,
});

export const validationTermsSchema = jsonObject({
  id: uuid,
  minAmount: money,
  maxAmount: money,
  allowedTerms: jsonArray(integer),
  annualInterestRate: {
    type: "string",
    example: "12.0000",
    description: "Annual percentage rate represented as an exact decimal string.",
  },
  minAge: integer,
  maxAge: integer,
  requiredDocumentTypes: jsonArray({ type: "string", enum: ["ID_FRONT", "ID_BACK"] }),
});
