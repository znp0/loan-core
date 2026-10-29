import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  UsePipes,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  ApiBody,
  ApiConsumes,
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";

import { RoleGuard, RequireRoles, type AuthenticatedRequest } from "@repo/auth";
import { ApiFailureResponses, RequestValidationPipe } from "@repo/http";

import { applicationSchema, documentSchema } from "../../common/api.schemas";
import { ValidationException } from "../../common/exceptions/app.exceptions";
import { MAX_DOCUMENT_SIZE } from "./loan-applications.constants";
import {
  CreateApplicationDto,
  UpdateApplicationDto,
  UploadDocumentDto,
} from "./loan-applications.dto";
import { LoanApplicationsService } from "./loan-applications.service";
import type { UploadedDocument } from "./uploaded-document";

const applicationIdPipe = new ParseUUIDPipe({
  exceptionFactory: () =>
    new ValidationException([
      { field: "applicationId", message: "Application ID must be a UUID." },
    ]),
});

@ApiTags("Loan applications")
@ApiFailureResponses(500, 503)
@ApiCookieAuth("accessCookie")
@Controller("loan-applications")
@UseGuards(RoleGuard)
@RequireRoles("CUSTOMER")
@UsePipes(new RequestValidationPipe())
export class LoanApplicationsController {
  constructor(private readonly loanApplicationsService: LoanApplicationsService) {}

  @Post()
  @ApiOperation({
    summary: "Create a draft application",
    description:
      "CUSTOMER. Product amount and term limits apply. Existing DRAFT/SUBMITTED/APPROVED applications or ACTIVE/OVERDUE loans block creation. Eligibility dependency failures return 503.",
  })
  @ApiResponse({ status: 201, schema: applicationSchema })
  @ApiFailureResponses(400, 401, 403, 404, 409)
  create(@Req() request: AuthenticatedRequest, @Body() dto: CreateApplicationDto) {
    return this.loanApplicationsService.create(request.user!.id, dto);
  }

  @Patch(":applicationId")
  @ApiOperation({
    summary: "Update a draft application",
    description:
      "CUSTOMER owner. Current HTTP validation requires all root and nested fields; null values are rejected. Changes to identity details invalidate verification. Name/account changes invalidate account verification. Identity expiry must be on or after issue date.",
  })
  @ApiResponse({ status: 200, schema: applicationSchema })
  @ApiFailureResponses(400, 401, 403, 404, 409)
  @ApiParam({ name: "applicationId", format: "uuid" })
  update(
    @Req() request: AuthenticatedRequest,
    @Param("applicationId", applicationIdPipe) id: string,
    @Body() dto: UpdateApplicationDto,
  ) {
    return this.loanApplicationsService.update(request.user!.id, id, dto);
  }

  @Post(":applicationId/documents")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: MAX_DOCUMENT_SIZE, files: 1, fields: 1, fieldSize: 128 },
    }),
  )
  @ApiOperation({
    summary: "Upload an identity document",
    description:
      "CUSTOMER owner, DRAFT only. One nonempty PDF, JPEG or PNG file, at most 10 MiB, plus type. Replacing a type keeps historical metadata and makes the new document current. Only document types required by the product are accepted.",
  })
  @ApiResponse({ status: 201, schema: documentSchema })
  @ApiFailureResponses(400, 401, 403, 404, 409, 413, 415, 422)
  @ApiParam({ name: "applicationId", format: "uuid" })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      required: ["type", "file"],
      properties: {
        type: { type: "string", enum: ["ID_FRONT", "ID_BACK"] },
        file: { type: "string", format: "binary" },
      },
    },
  })
  upload(
    @Req() request: AuthenticatedRequest,
    @Param("applicationId", applicationIdPipe) id: string,
    @Body() dto: UploadDocumentDto,
    @UploadedFile() file?: UploadedDocument,
  ) {
    return this.loanApplicationsService.uploadDocument(request.user!.id, id, dto, file);
  }
}
