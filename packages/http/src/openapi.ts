import { applyDecorators, type INestApplication } from "@nestjs/common";
import {
  ApiHeader,
  ApiResponse,
  DocumentBuilder,
  SwaggerModule,
  type OpenAPIObject,
  type SchemaObject,
} from "@nestjs/swagger";

export function jsonObject(properties: Record<string, SchemaObject>): SchemaObject {
  return { type: "object", required: Object.keys(properties), properties };
}

export function jsonArray(items: SchemaObject): SchemaObject {
  return { type: "array", items };
}

const errorSchema = jsonObject({
  code: { type: "string", example: "VALIDATION_ERROR" },
  message: { type: "string" },
  details: jsonArray(jsonObject({ field: { type: "string" }, message: { type: "string" } })),
});

const errorDescriptions: Record<number, string> = {
  400: "Invalid input, identifier or header. See code and details for the rejected fields.",
  401: "Missing, invalid or expired credentials.",
  403: "The caller does not have the required role or own this resource.",
  404: "The requested resource does not exist.",
  409: "The current state or an idempotency conflict prevents this operation.",
  413: "The uploaded file exceeds 10 MiB.",
  415: "Upload a PDF, JPEG or PNG file.",
  422: "Required information is incomplete or the document type is not required.",
  500: "An unexpected failure occurred. Internal details are not returned.",
  503: "A database or required service is unavailable. Retry after availability is restored.",
};

export function ApiFailureResponses(...statuses: number[]) {
  return applyDecorators(
    ...statuses.map((status) =>
      ApiResponse({ status, description: errorDescriptions[status], schema: errorSchema }),
    ),
  );
}

export function ApiIdempotencyKey() {
  return ApiHeader({
    name: "Idempotency-Key",
    required: true,
    description:
      "Scoped to this action and resource. Matching retries replay the saved result; a reused key with different input returns 409.",
    schema: { type: "string", minLength: 1, maxLength: 128, pattern: "^[A-Za-z0-9._:-]{1,128}$" },
  });
}

function specification(document: OpenAPIObject, internal: boolean): OpenAPIObject {
  const result = structuredClone(document);

  result.info.title += internal ? " — Internal API" : " — Public API";
  result.paths = Object.fromEntries(
    Object.entries(result.paths).filter(
      ([path]) => path.startsWith("/api/v1/internal/") === internal,
    ),
  );

  // Include only models reachable from this specification's routes, including nested references.
  const used = new Set<string>();
  const visit = (value: unknown): void => {
    if (typeof value !== "object" || value === null) {
      return;
    }

    for (const [key, item] of Object.entries(value)) {
      if (key === "$ref" && typeof item === "string" && item.startsWith("#/components/schemas/")) {
        const name = item.slice("#/components/schemas/".length);

        if (!used.has(name)) {
          used.add(name);
          visit(result.components?.schemas?.[name]);
        }
      } else {
        visit(item);
      }
    }
  };

  visit(result.paths);
  result.components = {
    schemas: Object.fromEntries(
      Object.entries(result.components?.schemas ?? {}).filter(([name]) => used.has(name)),
    ),
    securitySchemes: internal
      ? { internalToken: { type: "apiKey", in: "header", name: "X-Internal-Service-Token" } }
      : { accessCookie: { type: "apiKey", in: "cookie", name: "access_token" } },
  };

  return result;
}

export function createApiDocuments(app: INestApplication, title: string) {
  const config = new DocumentBuilder()
    .setTitle(title)
    .setVersion("1.0")
    .setDescription(
      "Money is returned as safe integer VND amounts; dates use YYYY-MM-DD and timestamps include a timezone. Customer access uses the HttpOnly access_token cookie. Financial eligibility remains a staff assessment.",
    )
    .addCookieAuth("access_token", { type: "apiKey", in: "cookie" }, "accessCookie")
    .addApiKey({ type: "apiKey", in: "header", name: "X-Internal-Service-Token" }, "internalToken")
    .build();
  const document = SwaggerModule.createDocument(app, config);

  return { public: specification(document, false), internal: specification(document, true) };
}

export function setupApiDocumentation(app: INestApplication, title: string): void {
  const documents = createApiDocuments(app, title);

  SwaggerModule.setup("api/docs", app, documents.public, {
    jsonDocumentUrl: "api/openapi.json",
    yamlDocumentUrl: "api/openapi.yaml",
    swaggerOptions: { withCredentials: true },
  });

  if (Object.keys(documents.internal.paths).length > 0) {
    SwaggerModule.setup("api/internal/docs", app, documents.internal, {
      jsonDocumentUrl: "api/internal/openapi.json",
      yamlDocumentUrl: "api/internal/openapi.yaml",
    });
  }
}
