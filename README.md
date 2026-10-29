# Loan Core

Backend quản lý hồ sơ vay, hợp đồng, giải ngân và trả nợ, xây dựng bằng NestJS, TypeScript, pnpm và Turborepo. [English](README.en.md).

## Bài toán và phạm vi

Loan Core hỗ trợ khách hàng cá nhân lựa chọn sản phẩm vay, cung cấp thông tin và tài liệu, xem hợp đồng, theo dõi giải ngân và trả nợ. Nhân viên xem hồ sơ cùng thu nhập khai báo và lịch trả nợ dự kiến để đánh giá khả năng chi trả, sau đó phê duyệt hoặc từ chối.

Luồng nghiệp vụ hiện có: đăng ký/đăng nhập → chọn sản phẩm → tạo và hoàn thiện hồ sơ → xác minh thông tin → tạo hợp đồng → khách hàng xác nhận và nộp → nhân viên xét duyệt → giải ngân → thanh toán các kỳ đến hạn → tất toán → có thể tạo hồ sơ vay mới. Hệ thống kiểm tra tính đầy đủ, điều kiện sản phẩm và khoản vay đang hoạt động ở các bước phù hợp.

Khách hàng chỉ thanh toán toàn bộ số tiền còn thiếu của kỳ chưa trả sớm nhất khi kỳ đó đến hạn. Số tiền được biểu diễn bằng số nguyên VND; ngày hết hạn căn cước và ngày đến hạn trả nợ được xét theo múi giờ Việt Nam. Hợp đồng lưu snapshot dữ liệu đã chốt; giải ngân và thanh toán dùng khóa idempotency để xử lý yêu cầu lặp lại.

Các kết nối định danh, ký và chuyển tiền trong phạm vi hiện tại chưa kết nối dịch vụ thực tế. Chưa có đăng nhập nhân viên, trả một phần, trả trước hạn, tính phí phạt, tự động chuyển quá hạn hoặc đối soát tự động. Danh sách API đã triển khai và schema được cung cấp qua OpenAPI của từng service.

## Yêu cầu

Node.js 24.15.0 trở lên thuộc nhánh 24 LTS hoặc Node.js 26+, pnpm 11.25.0 và PostgreSQL. Mỗi service sở hữu một database riêng.

## Kiến trúc

| Service           | Port | Trách nhiệm                                             |
| ----------------- | ---- | ------------------------------------------------------- |
| Identity          | 3001 | Đăng ký, đăng nhập khách hàng và cookie xác thực        |
| Loan products     | 3002 | Sản phẩm, giới hạn và điều kiện vay                     |
| Loan applications | 3003 | Hồ sơ, tài liệu, xác minh, hợp đồng, duyệt và giải ngân |
| Repayment         | 3004 | Khoản vay, lịch trả nợ, thanh toán và đóng khoản vay    |

Client gọi trực tiếp từng service; không có API gateway. Application service gọi product service để lấy điều kiện sản phẩm và repayment service để kiểm tra khoản vay hoặc tạo khoản vay sau giải ngân. Mỗi service sở hữu PostgreSQL và Prisma client riêng. `@repo/http` và `@repo/auth` cung cấp hạ tầng HTTP và xác thực dùng chung.

Mỗi service cung cấp health tại `/api/v1/health`, Swagger UI tại `/api/docs` và OpenAPI JSON tại `/api/openapi.json`. API nội bộ của products và repayment có tài liệu riêng tại `/api/internal/docs` và `/api/internal/openapi.json`.

## Cài đặt và chạy

```sh
pnpm install --frozen-lockfile
pnpm db:generate
pnpm --filter identity-service db:deploy
pnpm --filter loan-product-service db:deploy
pnpm --filter loan-application-service db:deploy
pnpm --filter repayment-service db:deploy
pnpm dev
```

Dùng `.env.example` của từng app làm mẫu cho `.env`, điền database riêng và các secrets phù hợp. Các service xác minh cùng JWT phải dùng chung `JWT_SECRET`; internal token của bên gọi phải khớp bên nhận. Prisma CLI ưu tiên `DIRECT_URL` cho migrations, nếu không có thì dùng `DATABASE_URL`.

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

`pnpm test` chạy toàn bộ test bằng môi trường Docker Compose dùng chung cho local và CI, cố định Node 24.15.0, pnpm 11.25.0 và PostgreSQL 17.11. Bộ test tự chuẩn bị database/role riêng và dọn sau khi chạy; không cần PostgreSQL hay `.env` trên máy host.

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

Cần Docker Engine, Compose và Buildx. Mỗi service nạp `.env` riêng lúc chạy. Dockerfile build ứng dụng thành image runtime với dependency production; container khởi động service. Bộ test dùng Compose và build target riêng, được chạy bằng các lệnh test ở trên.

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
