# Loan Core

Backend quản lý hồ sơ vay, hợp đồng, giải ngân và trả nợ, xây dựng bằng NestJS, TypeScript, pnpm và Turborepo. [English](README.en.md).

## Yêu cầu

Node.js 24.15.0 trở lên thuộc nhánh 24 LTS hoặc Node.js 26+, pnpm 11.25.0 và PostgreSQL. Mỗi service sở hữu một database riêng. Cấu hình phát triển của nhóm được quản lý bằng Doppler; cần quyền truy cập workspace `v2t`, project `loan-core`.

## Kiến trúc

| Service           | Cổng | Trách nhiệm                                             |
| ----------------- | ---- | ------------------------------------------------------- |
| Identity          | 3001 | Đăng ký, đăng nhập khách hàng và cookie xác thực        |
| Loan products     | 3002 | Sản phẩm, giới hạn và điều kiện vay                     |
| Loan applications | 3003 | Hồ sơ, tài liệu, xác minh, hợp đồng, duyệt và giải ngân |
| Repayment         | 3004 | Khoản vay, lịch trả nợ, thanh toán và đóng khoản vay    |

Client gọi trực tiếp từng service. Các service trao đổi qua HTTP khi cần dữ liệu của domain khác. Nhân viên đánh giá khả năng chi trả dựa trên thu nhập khai báo và lịch trả nợ dự kiến.

Mỗi service cung cấp health tại `/api/v1/health`, Swagger UI tại `/api/docs` và OpenAPI JSON tại `/api/openapi.json`. API nội bộ của products và repayment có tài liệu riêng tại `/api/internal/docs` và `/api/internal/openapi.json`.

## Cài đặt và chạy

```sh
pnpm install --frozen-lockfile
pnpm secrets:setup
pnpm secrets:pull
pnpm db:generate
pnpm --filter identity-service db:deploy
pnpm --filter loan-product-service db:deploy
pnpm --filter loan-application-service db:deploy
pnpm --filter repayment-service db:deploy
pnpm dev
```

Nếu tự cấu hình, dùng `.env.example` của từng app làm mẫu cho `.env`, điền database riêng và các khóa xác thực phù hợp. Các service xác minh cùng JWT phải dùng chung `JWT_SECRET`; internal token của bên gọi phải khớp bên nhận. Prisma CLI ưu tiên `DIRECT_URL` nếu có, sau đó dùng `DATABASE_URL`.

Chạy một service bằng `pnpm --filter identity-service dev`.

## Lệnh thường dùng

```sh
pnpm build
pnpm lint
pnpm check-types
pnpm db:validate
pnpm format:check
pnpm test
pnpm test:openapi
```

`pnpm test` chạy toàn bộ test bằng môi trường Docker Compose dùng chung cho local và CI, cố định Node 24.15.0, pnpm 11.25.0 và PostgreSQL 17.11. Bộ test tự chuẩn bị database/role riêng và dọn sau khi chạy; không cần PostgreSQL, `.env` hay Doppler trên máy host.

```sh
pnpm test:services
pnpm test:e2e
pnpm test:smoke
```

Các lệnh trên lần lượt chạy service tests, E2E luồng vay và smoke. `pnpm test:openapi` vẫn có thể kiểm tra specs trực tiếp mà không cần database.

Nếu máy chỉ có Docker Engine hoặc Docker Desktop chạy Linux containers, cùng Compose và Buildx, chạy trực tiếp:

```sh
docker compose --env-file docker/test.env --file compose.test.yaml up --build --abort-on-container-exit --exit-code-from tests
docker compose --env-file docker/test.env --file compose.test.yaml down --volumes --remove-orphans
```

Lệnh `pnpm test` tự thực hiện cả bước chạy và dọn Compose trong project test riêng. PostgreSQL test không mở cổng ra máy host.

## Docker

Cần Docker Engine, Compose và Buildx. Mỗi service nạp `.env` riêng lúc chạy.

```sh
pnpm docker:up
pnpm docker:down
```

## Thuật ngữ trong code

| Trường hoặc khái niệm | Ý nghĩa |
| --- | --- |
| `principalAmount` | Tiền gốc của khoản vay hoặc phần gốc của một kỳ |
| `annualInterestRate` | Lãi suất năm tính theo phần trăm; `12` nghĩa là 12%/năm |
| `termMonths` | Kỳ hạn vay theo tháng |
| `installment` / `dueDate` | Kỳ trả nợ / ngày đến hạn theo múi giờ Việt Nam |
| `interestAmount` / `totalInterest` | Tiền lãi của một kỳ / tổng tiền lãi |
| `totalPayable` | Tổng gốc và lãi phải trả theo lịch |
| `outstandingAmount` | Phần gốc và lãi còn phải trả |
| `DECLINING_BALANCE_EQUAL_PRINCIPAL` | Chia gốc theo kỳ, tính lãi trên gốc còn lại; kỳ cuối nhận phần gốc dư do chia số nguyên |
| `disbursement` | Giải ngân tiền vay vào tài khoản đã xác minh |
| `payment` / `closedAt` | Thanh toán một kỳ / thời điểm đóng khoản vay sau khi trả hết |
| `snapshot` | Bản dữ liệu được chốt cho hợp đồng và xử lý tiếp theo |
| `Idempotency-Key` | Khóa giúp retry một thao tác mà không ghi nhận giao dịch trùng |

Các khoản tiền dùng số nguyên VND. Thanh toán phải trả toàn bộ số còn lại của kỳ chưa trả sớm nhất và kỳ đó phải đến hạn.

## Giấy phép

[MIT](LICENSE).
