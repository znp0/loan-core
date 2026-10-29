import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiOkResponse, ApiTags } from "@nestjs/swagger";

@ApiTags("Health")
@Controller("health")
export class HealthController {
  @Get()
  @ApiOperation({ summary: "Read service health" })
  @ApiOkResponse({
    schema: {
      type: "object",
      required: ["status", "service"],
      properties: {
        status: { type: "string", enum: ["ok"] },
        service: { type: "string", enum: ["loan-product-service"] },
      },
    },
  })
  getHealth() {
    return {
      status: "ok",
      service: "loan-product-service",
    };
  }
}
