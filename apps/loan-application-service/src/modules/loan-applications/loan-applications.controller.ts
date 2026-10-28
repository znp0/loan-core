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

import { RequestValidationPipe } from "@repo/http";
import { RoleGuard, RequireRoles, type AuthenticatedRequest } from "@repo/auth";

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

@Controller("loan-applications")
@UseGuards(RoleGuard)
@RequireRoles("CUSTOMER")
@UsePipes(new RequestValidationPipe())
export class LoanApplicationsController {
  constructor(private readonly loanApplicationsService: LoanApplicationsService) {}

  @Post()
  create(@Req() request: AuthenticatedRequest, @Body() dto: CreateApplicationDto) {
    return this.loanApplicationsService.create(request.user!.id, dto);
  }

  @Patch(":applicationId")
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
  upload(
    @Req() request: AuthenticatedRequest,
    @Param("applicationId", applicationIdPipe) id: string,
    @Body() dto: UploadDocumentDto,
    @UploadedFile() file?: UploadedDocument,
  ) {
    return this.loanApplicationsService.uploadDocument(request.user!.id, id, dto, file);
  }
}
