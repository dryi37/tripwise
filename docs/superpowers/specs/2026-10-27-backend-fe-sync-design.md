# Thiết kế hoàn thiện backend và đồng bộ frontend Tripwise

## 1. Mục đích

Chuyển bản thử nghiệm Tripwise từ dữ liệu trình duyệt sang một ứng dụng chạy trên dữ liệu thật. PostgreSQL là nguồn dữ liệu chính; frontend mới giữ nguyên trải nghiệm hiện tại nhưng đọc/ghi qua API. Danh mục nhà cung cấp, báo giá chuyến đi, dịch vụ ngoài danh mục, trợ lý tạo tour và kho tri thức phải dùng chung một mô hình dữ liệu nhất quán.

## 2. Quyết định đã chốt

- Triển khai theo từng lát cắt nghiệp vụ hoàn chỉnh: dữ liệu → API → frontend → kiểm thử.
- Backend dùng TypeScript, Express, Prisma và kiến trúc Route → Middleware → Controller → Service → Repository hiện có.
- PostgreSQL là nguồn sự thật. `localStorage` không tiếp tục là cơ sở dữ liệu nghiệp vụ.
- Chưa triển khai đăng nhập hoặc phân quyền.
- Qdrant chạy local cho RAG; không thêm reranker ở giai đoạn này.
- Agent tiếp tục dùng Gemma qua Gemini API, có giới hạn vòng lặp và tổng số lần gọi tool như hiện tại.

## 3. Phạm vi

### Có trong lần triển khai này

1. Danh mục nhà cung cấp: nhà cung cấp, dịch vụ và nhiều báo giá nguồn cho mỗi dịch vụ.
2. Báo giá chuyến đi tham chiếu một báo giá nguồn cụ thể và giữ snapshot bất biến của nguồn, giá, điều kiện tại lúc chọn.
3. Dịch vụ ngoài danh mục; có thể chỉ thêm vào chuyến đi hoặc đồng thời lưu thành bản chưa xác minh trong danh mục.
4. API và frontend cho danh sách chuyến đi, chi tiết chuyến, lịch trình, báo giá và danh mục nhà cung cấp.
5. Nhập dữ liệu demo cũ từ `localStorage` đúng một lần khi database chưa có dữ liệu tương ứng.
6. Agent tools để tìm dịch vụ, đọc kho tri thức, thêm hoạt động và thêm dịch vụ vào báo giá.
7. Kho tri thức với PostgreSQL lưu metadata/nội dung chuẩn và Qdrant lưu vector; hỗ trợ thêm văn bản, lập chỉ mục, liệt kê, xóa và tìm kiếm.
8. Docker Compose cho PostgreSQL và Qdrant; backend dùng cổng không xung đột với ứng dụng đang chiếm cổng 3000.
9. Phiên bản phương án được lưu và khôi phục đầy đủ từ backend.

### Không làm

- Đặt dịch vụ hoặc thanh toán thật.
- Tìm kiếm web trực tiếp hay đồng bộ tự động với API nhà cung cấp.
- Phân quyền, multi-tenant hoặc audit theo người dùng.
- Reranking bằng model riêng.
- Đồng bộ offline hai chiều. Cache trình duyệt không được phép tự ghi đè dữ liệu server.
- Upload và bóc tách PDF/DOCX; endpoint kho tri thức nhận nội dung văn bản đã chuẩn hóa trong giai đoạn này.

## 4. Các phương án đã cân nhắc

1. **Lát cắt nghiệp vụ hoàn chỉnh — được chọn.** Mỗi lát cắt có migration, repository, service, API, FE và test. Có thể kiểm tra sớm và tránh một lần tích hợp lớn.
2. **Backend-first.** Mô hình backend hoàn chỉnh trước rồi mới nối FE; bị loại vì FE không xác nhận được hợp đồng cho đến cuối.
3. **Lớp API bắt chước `localStorage`.** Nhanh nhìn thấy dữ liệu nhưng duy trì cấu trúc demo yếu và tạo mã chuyển đổi dùng một lần; bị loại.

## 5. Mô hình dữ liệu

### Danh mục

- `Supplier`: `id`, `name`, `contactName?`, `phone?`, `email?`, `notes?`, timestamps.
- `Service`: `id`, `name`, `category`, `unit`, `description?`, `isActive`, timestamps.
- `SupplierOffer`: `id`, `serviceId`, `supplierId`, `unitPriceMinor`, `currency`, `validFrom?`, `validUntil?`, `terms?`, `status` (`UNVERIFIED | VERIFIED | INACTIVE`), `isPreferred`, timestamps.
- Mỗi dịch vụ chỉ có tối đa một offer ưu tiên đang hoạt động. Service chịu trách nhiệm bỏ cờ ưu tiên của offer cũ trong cùng transaction.
- Khi lưu dịch vụ thủ công vào danh mục, hệ thống tái sử dụng Supplier nếu tên sau khi trim và so sánh không phân biệt hoa thường trùng chính xác; luôn tạo Service mới để không tự ghép hai nhu cầu chỉ vì giống tên.

### Chuyến đi và phiên bản

- `Trip` bổ sung `adultCount`, `childCount`, `customerRequest?`, `planningStarted`; dữ liệu `travelers` cũ được chuyển sang `adultCount` và đặt `childCount = 0`.
- `tags` chỉ phục vụ trình bày hiện tại và không trở thành dữ liệu nghiệp vụ. Nội dung chat không được lưu như một trường Trip.
- `PlanVersion`: `id`, `tripId`, `name`, `revision`, `snapshot` JSON, `createdAt`. Snapshot chứa thông tin chuyến cần thiết, toàn bộ itinerary và quote tại thời điểm lưu.
- Khôi phục version diễn ra trong một transaction, thay thế draft/quote hiện tại, tăng revision và không sửa bản snapshot gốc.

### Báo giá

- `QuoteItem` bổ sung `serviceId?`, `supplierOfferId?`, `sourceType` (`CATALOG | MANUAL`), `sourceStatus`, `supplierNameSnapshot`, `serviceNameSnapshot`, `termsSnapshot?`, `validUntilSnapshot?`.
- `QuoteItem` có thêm `priceStatus` (`SOURCE | PRICE_OVERRIDDEN | MANUAL`). Khi sửa giá của dòng catalog, tham chiếu offer và snapshot gốc vẫn được giữ nhưng trạng thái chuyển thành `PRICE_OVERRIDDEN`.
- Các trường tên/category/unit/giá hiện có vẫn là snapshot để báo giá cũ không đổi khi danh mục thay đổi.
- Dòng từ danh mục bắt buộc có cả `serviceId` và `supplierOfferId`; dòng thủ công để hai khóa này rỗng.
- `amountMinor` và `Quote.totalAmountMinor` luôn được server tính lại. Frontend không phải nguồn tin cho thành tiền.
- Mọi thay đổi báo giá tiếp tục dùng `expectedRevision`; conflict trả `409 REVISION_CONFLICT` kèm revision mới nhất.

### Kho tri thức

- `KnowledgeDocument`: `id`, `title`, `sourceLabel?`, `content`, `status` (`PENDING | INDEXED | FAILED`), `contentHash`, timestamps.
- `KnowledgeChunk`: `id`, `documentId`, `ordinal`, `content`, `qdrantPointId`, `tokenEstimate`.
- PostgreSQL giữ nội dung chuẩn để có thể dựng lại index. Qdrant collection chỉ chứa vector và payload định danh.
- Xóa document phải xóa points liên quan; nếu Qdrant lỗi, document được đánh dấu cần đồng bộ lại thay vì giả vờ thành công hoàn toàn.

## 6. Hợp đồng API

Tất cả endpoint dưới `/api/v1`, dùng JSON camelCase, tiền ở số nguyên `amountMinor`, currency ISO-4217 và lỗi thống nhất:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Invalid request", "details": {} } }
```

### Danh mục nhà cung cấp

- `GET /catalog/services?q=&category=&status=&page=&pageSize=`: danh sách service kèm offers đã phân trang.
- `POST /catalog/services`, `PATCH /catalog/services/:serviceId`.
- `POST /catalog/services/:serviceId/offers`.
- `PATCH /catalog/services/:serviceId/offers/:offerId`.
- `POST /catalog/services/:serviceId/offers/:offerId/preference`: chọn offer ưu tiên trong transaction.
- `GET /suppliers?q=&page=&pageSize=`, `POST /suppliers`, `PATCH /suppliers/:supplierId`.

### Báo giá chuyến đi

- Giữ `GET /trips/:tripId/draft/quote`.
- `POST /trips/:tripId/draft/quote/items/from-offer` nhận `supplierOfferId`, `quantity`, `expectedRevision`; server tự lấy và snapshot offer.
- `POST /trips/:tripId/draft/quote/items/manual` nhận dữ liệu thủ công, `saveToCatalog`, `expectedRevision`; khi lưu danh mục, tạo Supplier/Service/Offer chưa xác minh trong cùng transaction.
- `PATCH /trips/:tripId/draft/quote/items/:itemId` chỉ sửa `quantity`, `unitPriceMinor` và các snapshot thủ công được phép; không đổi âm thầm offer tham chiếu.
- `DELETE /trips/:tripId/draft/quote/items/:itemId` giữ hợp đồng hiện có.

### Phiên bản phương án

- `GET /trips/:tripId/versions?page=&pageSize=`.
- `POST /trips/:tripId/versions` nhận `name`, `expectedRevision` và chụp trạng thái hiện tại.
- `POST /trips/:tripId/versions/:versionId/restore` nhận `expectedRevision`, khôi phục trong transaction và trả trip + draft + quote mới.

Hai endpoint tạo dòng hỗ trợ `Idempotency-Key`. Cùng key và cùng payload phát lại kết quả; cùng key khác payload trả `422`; request trùng đang xử lý trả `409`.

### Kho tri thức

- `GET /knowledge/documents?page=&pageSize=`.
- `POST /knowledge/documents` nhận `title`, `sourceLabel?`, `content` và lập chỉ mục đồng bộ trong giới hạn kích thước.
- `DELETE /knowledge/documents/:documentId`.
- `POST /knowledge/search` nhận `query`, `limit` và trả chunk, document metadata, score.

### Agent

- Giữ `POST /trips/:tripId/agent/runs`.
- Thêm tools nội bộ có schema chặt: `search_supplier_offers`, `search_knowledge`, `add_itinerary_item`, `add_quote_item_from_offer`.
- Tool tìm kiếm chỉ đọc; tool ghi bắt buộc đi qua Service, revision và transaction như request thường.
- Không cho model tự đặt giá, tự tạo offer đã xác minh hoặc truy cập Prisma/Qdrant trực tiếp.
- Mỗi run giữ giới hạn `maxIterations` và `maxToolCalls`; kết quả phải chỉ rõ đã thay đổi gì và mục nào cần người dùng xác minh.

## 7. Đồng bộ frontend

- Thêm một `apiClient` nhỏ dùng `fetch`, parse lỗi chuẩn và timeout; không đưa framework mới vào frontend buildless hiện tại.
- Khi mở trang, FE tải danh sách chuyến đi từ server; khi chọn chuyến, tải trip + draft + quote. Danh mục nhà cung cấp tải từ catalog API.
- Các thao tác hiện có (tạo/sửa chuyến, lịch trình, chọn offer, sửa số lượng/giá, dịch vụ ngoài danh mục) chuyển thành mutation API rồi thay state bằng response server.
- Trong lúc mutation: khóa đúng control, hiển thị trạng thái đang lưu. Lỗi giữ dữ liệu cũ và thông báo. `409` tải lại tài nguyên rồi yêu cầu người dùng thử lại; không last-write-wins.
- `localStorage` chỉ còn khóa cache có version và cờ migration. Nếu tìm thấy dữ liệu demo cũ, FE gọi endpoint bootstrap một lần với UUID ổn định của từng chuyến và `Idempotency-Key` ổn định theo đợt import. UUID là khóa chống trùng; đã tồn tại thì server trả bản hiện có. Sau thành công FE đánh dấu migrated và không gửi lại.
- Nếu backend mất kết nối, FE hiển thị chế độ chỉ đọc từ cache gần nhất; các nút ghi bị khóa. Không xếp hàng mutation offline.
- Chuyển nhãn “Mô phỏng AI” thành trạng thái thật khi agent được cấu hình; nếu thiếu API key, hiển thị rõ “Chưa cấu hình AI”.

## 8. Retrieval không rerank

- Chunk theo đoạn với kích thước mục tiêu và overlap nhỏ; không cắt giữa câu khi có thể.
- Sinh embedding qua adapter `EmbeddingProvider`; adapter mặc định dùng Gemini embedding API để không buộc host model embedding local.
- Qdrant tìm dense vector top-k; lọc theo document nếu request yêu cầu.
- Không rerank. Agent nhận tối đa số chunk cấu hình được và luôn kèm nguồn tài liệu.
- Khi embedding/Qdrant không sẵn sàng, API knowledge trả lỗi phụ thuộc có mã rõ; phần trip/catalog/quote vẫn hoạt động bình thường.

## 9. Thứ tự triển khai

1. Migration Prisma, seed dữ liệu mẫu và module catalog/supplier.
2. Mở rộng quote snapshot + manual service endpoints.
3. Nối FE danh mục và báo giá vào API; thêm migration/cache một chiều.
4. Nối trips và itinerary còn lại, loại bỏ ghi nghiệp vụ vào `localStorage`.
5. Thêm lưu/khôi phục phiên bản phương án trên backend và nối tab Phiên bản.
6. Thêm Qdrant, knowledge module và embedding adapter.
7. Mở agent tools, giới hạn và thông báo xác minh.
8. Chạy toàn bộ backend tests, typecheck/build, Prisma validation, QA frontend và browser smoke test.

## 10. Tiêu chí hoàn thành

- Refresh hoặc mở trình duyệt khác vẫn thấy cùng dữ liệu từ PostgreSQL.
- “Danh mục nhà cung cấp” quản lý được nhiều offer; “Báo giá” chọn đúng một offer và giữ snapshot sau khi catalog đổi.
- Dịch vụ ngoài danh mục hoạt động ở cả hai chế độ và bản lưu catalog luôn là `UNVERIFIED`.
- Tổng tiền chỉ do server tính; conflict revision không làm mất thay đổi âm thầm.
- Agent có thể tìm nguồn, tra kiến thức và tạo lịch trình/báo giá qua tools trong giới hạn; không tự bịa giá vào database.
- Qdrant có healthcheck và dữ liệu knowledge có thể lập chỉ mục/tìm lại/xóa.
- Không còn mutation nghiệp vụ nào chỉ ghi `localStorage`.
- Phiên bản phương án tồn tại sau refresh và khôi phục đúng lịch trình/báo giá mà không sửa snapshot đã lưu.
- Test, typecheck, build, Prisma validation, frontend QA và browser smoke test đều đạt.

## 11. Các quyết định triển khai do builder tự chọn

- Tên file cụ thể và cách chia nhỏ repository interfaces, miễn giữ đúng kiến trúc hiện có.
- Kích thước chunk/overlap ban đầu và ngưỡng score, có cấu hình môi trường và test.
- Cổng backend mặc định mới, miễn FE lấy từ một cấu hình duy nhất và không xung đột cổng 3000/8080.
- Chi tiết cache TTL và nội dung skeleton/loading, miễn tuân thủ hành vi đồng bộ ở trên.
