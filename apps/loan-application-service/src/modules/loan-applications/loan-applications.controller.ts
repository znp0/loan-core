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

import { CustomerGuard, type CustomerRequest } from "../../common/auth/customer.guard";
import { ValidationException } from "../../common/exceptions/app.exceptions";
import { RequestValidationPipe } from "../../common/pipes/request-validation.pipe";
import {
  CreateApplicationDto,
  UpdateApplicationDto,
  UploadDocumentDto,
} from "./loan-applications.dto";
import {
  LoanApplicationsService,
  MAX_DOCUMENT_SIZE,
  type UploadedDocument,
} from "./loan-applications.service";

const applicationIdPipe = new ParseUUIDPipe({
  exceptionFactory: () =>
    new ValidationException([
      { field: "applicationId", message: "Application ID must be a UUID." },
    ]),
});

@Controller("loan-applications")
@UseGuards(CustomerGuard)
@UsePipes(new RequestValidationPipe())
export class LoanApplicationsController {
  constructor(private readonly applications: LoanApplicationsService) {}

  @Post()
  create(@Req() request: CustomerRequest, @Body() dto: CreateApplicationDto) {
    return this.applications.create(request.customerId, dto);
  }

  @Patch(":applicationId")
  update(
    @Req() request: CustomerRequest,
    @Param("applicationId", applicationIdPipe) id: string,
    @Body() dto: UpdateApplicationDto,
  ) {
    return this.applications.update(request.customerId, id, dto);
  }

  @Post(":applicationId/documents")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: MAX_DOCUMENT_SIZE, files: 1, fields: 1, fieldSize: 128 },
    }),
  )
  upload(
    @Req() request: CustomerRequest,
    @Param("applicationId", applicationIdPipe) id: string,
    @Body() dto: UploadDocumentDto,
    @UploadedFile() file?: UploadedDocument,
  ) {
    return this.applications.upload(request.customerId, id, dto, file);
  }
}
