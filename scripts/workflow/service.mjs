import { serviceRequire } from "./environment.mjs";

const service = process.argv[2];
const require = serviceRequire(service);

require("reflect-metadata");

const { NestFactory } = require("@nestjs/core");
const { AppModule } = require("./dist/app.module.js");
const { setupApiDocumentation } = require("@repo/http");
let app;

if (service === "repayment-service") {
  const { Test } = require("@nestjs/testing");
  const { PaymentClock } = require("./dist/modules/loan/payment-clock.js");
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PaymentClock)
    .useValue({ now: () => new Date("2100-01-01T00:00:00Z") })
    .compile();

  app = module.createNestApplication({ logger: false });
} else {
  app = await NestFactory.create(AppModule, { logger: false });
}

app.setGlobalPrefix("api/v1");
setupApiDocumentation(app, service);
app.enableShutdownHooks();

await app.listen(Number(process.env.PORT), "127.0.0.1");
