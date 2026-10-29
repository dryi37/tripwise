# Tripwise — Thiết kế backend theo giao diện
## 1. Phạm vi
Bản frontend là prototype dùng dữ liệu minh họa và localStorage. Các màn hình đã có: Chuyến đi, Không gian tư vấn (Hành trình, Báo giá, Kiểm tra, Phiên bản), Kho tri thức, Bảng giá dịch vụ, Cài đặt & dữ liệu.
AI trong prototype chỉ mô phỏng hai ý định: đổi ngân sách và giãn thời gian nghỉ. Chưa có xác thực, AI thực, nguồn bản đồ, dự báo hoặc đặt dịch vụ. Các thao tác đánh dấu rà soát không xác nhận tính sẵn có của dịch vụ.
Tài liệu này đề xuất kiến trúc backend triển khai sau khi chốt UI. Không phải backend đã hoạt động.

## 2. Kiến trúc
Backend FastAPI theo modular monolith. Worker Python chạy riêng để lập hành trình, tối ưu, nhập tài liệu và xuất file. PostgreSQL là nguồn dữ liệu nghiệp vụ. Redis/Celery hỗ trợ xử lý nền. LangGraph điều phối workflow; checkpointer PostgreSQL lưu trạng thái thực thi, tách khỏi bảng phương án nghiệp vụ. S3 lưu file gốc và file xuất. pgvector + PostgreSQL full-text phục vụ kho tri thức.
Không cần tạo microservice cho từng module ban đầu. API process và worker dùng cùng domain service và contract. Worker có thể scale riêng.

## 3. Ánh xạ giao diện tới API
API prefix /api/v1. IDs UUID; JSON camelCase. Đăng nhập phải có trước khi dùng dữ liệu thật.

| Giao diện / thao tác | API đề xuất | Xử lý |
| --- | --- | --- |
| Danh sách chuyến đi | GET /trips?q=&status=&cursor=&pageSize=20 | Lọc theo tổ chức và quyền truy cập, phân trang |
| Tạo chuyến đi | POST /trips | Validate yêu cầu, tạo draft |
| Yêu cầu chuyến đi | GET /trips/{tripId} | Yêu cầu, revision, trạng thái |
| Sửa yêu cầu | PATCH /trips/{tripId} | expectedRevision, vô hiệu kết quả kiểm tra cũ |
| Hành trình | GET /trips/{tripId}/draft | Hoạt động, ngày, mục khóa |
| Thêm / sửa / xóa hoạt động | POST /trips/{tripId}/draft/items; PATCH/DELETE .../items/{itemId} | Kiểm tra khóa và revision, tính lại tác động |
| Khóa hoạt động | PATCH .../items/{itemId} với isLocked | Khóa giá trị xác định, có audit |
| Trợ lý chat | POST /trips/{tripId}/messages | Lưu message, trả runId khi xử lý nền |
| Tạo hoặc điều chỉnh phương án | POST /trips/{tripId}/runs | 202, runId và statusUrl |
| Tiến độ | GET /runs/{runId}; GET /runs/{runId}/events | Polling và SSE có eventId |
| Báo giá | GET /trips/{tripId}/draft/quote | Line items, tổng tiền, nguồn giá |
| Sửa số lượng / giá | PATCH .../quote/items/{itemId} | Server tính lại, yêu cầu lý do override |
| Áp dụng bảng giá mới | POST /trips/{tripId}/quote-recalculations | Reprice có chủ đích, trả diff |
| Kiểm tra | POST /trips/{tripId}/validations; GET .../validations/latest | Lỗi, cảnh báo, ruleVersion |
| Lưu phiên bản | POST /trips/{tripId}/versions | Snapshot nguyên tử của yêu cầu + hành trình + báo giá |
| Danh sách / so sánh phiên bản | GET .../versions; GET .../version-comparisons?from=&to= | Diff theo item ID, giá, thời gian, điều kiện |
| Khôi phục | POST /trips/{tripId}/restorations | Tạo draft mới từ snapshot, giữ lịch sử cũ |
| Rà soát phương án | POST /trips/{tripId}/reviews | Duyệt đúng revision, chặn lỗi bắt buộc |
| Xuất file | POST /trips/{tripId}/exports; GET /exports/{exportId} | Job render PDF/ICS, URL tải có hạn |
| Kho tri thức | GET/POST /documents; GET/PATCH /documents/{id} | Quyền truy cập, phiên bản tài liệu |
| Nhập file | POST /document-uploads; POST /document-ingestions | Upload có hạn, xử lý và duyệt nội dung |
| Bảng giá | GET/POST /rate-cards; GET/POST/PATCH /rate-cards/{id}/items | Duyệt và quản lý ngày hiệu lực |
| Cấu hình kết nối (tương lai) | GET/PATCH /integrations/{provider} | Backend giữ secret, FE chỉ nhận trạng thái |

Mọi mutation quan trọng hỗ trợ Idempotency-Key. Claim key bằng unique constraint trong DB với actor, operation, requestHash. Cùng key khác payload trả 422; tác vụ cùng key đang chạy trả 202 và cùng runId hoặc 409 tùy endpoint. Không sinh key mới trong mỗi lần retry.
PATCH yêu cầu expectedRevision hoặc If-Match. Revision không còn hiện hành trả 409 kèm currentRevision. UI yêu cầu tải dữ liệu mới, không tự ghi đè.

## 4. Hợp đồng dữ liệu chính
### TripRequirements
tripId, revision, origin, destinationIds, startDate, endDate, destinationTimezone, adults, childrenAges[], budgetAmountMinor, budgetCurrency, interests[], mobilityPreferences, hotelPreferences, dietaryRequirements, mustHave[], exclusions[].
Dates chuyến đi là ngày địa phương; mỗi item lưu timezone của điểm đến. Không dùng UTC date ngầm cho lịch tham quan.

### ItineraryItem
id, tripId, dayIndex, activityId, placeId, localStartTime, localEndTime, timezone, durationMinutes, travelToNextMinutes, travelSource, isLocked, lockedFields[], description, sourceRefs[], verificationStatus.
lockedFields hỗ trợ khóa điểm đến, dịch vụ, ngày hoặc giờ riêng. Lock là quy tắc server, không chỉ khóa nút FE.

### QuoteItem
id, itineraryItemIds[], serviceId, rateCardVersionId, rateRuleId, serviceDate, quantity, unit, unitPriceMinor, currency, fxSnapshotId, taxes[], adjustments[], amountMinor, sourceRef, pricedAt, validUntil, overrideReason.
Dùng Decimal cho tính toán và integer minor units cho lưu kết quả tiền tệ. Quy tắc làm tròn khai báo riêng. Phân biệt giá theo phòng/đêm, người/ngày, xe/ngày, vé theo tuổi và gói theo đoàn. Không dùng float JS làm nguồn tính tiền chính thức.
Báo giá có status COMPLETE / PARTIAL / EXPIRED. Thiếu giá không tự biến thành giá 0 và không cho nhãn đủ ngân sách khi tổng chưa đầy đủ.

### ValidationResult
id, tripId, draftRevision, ruleVersion, status, checkedAt, issues[].
Issue có code, severity ERROR/WARNING/INFO, itemIds[], message, evidence[], suggestedFix. Thay đổi draft làm kết quả trước đó STALE. FE phải hiển thị trạng thái này cho tới khi có kiểm tra mới.

### GenerationRun
id, tripId, requestedBy, baseRevision, status QUEUED/RUNNING/NEEDS_INPUT/SUCCEEDED/FAILED/CANCELLED, stage, createdAt, updatedAt, resultRevision, errorCode, retryable, traceId.
Không cam kết tiến độ phần trăm nếu chỉ biết stage. SSE có eventId; reconnect dùng Last-Event-ID và có GET run fallback.

## 5. Database
- organizations, users, memberships, trip_access: tổ chức, nhân sự, phạm vi truy cập.
- trips, trip_requirements, traveler_groups: chuyến đi và yêu cầu.
- itinerary_drafts, itinerary_items, item_locks: draft và hoạt động.
- services, suppliers, rate_cards, rate_card_versions, rate_rules: giá và chính sách.
- quotes, quote_items, fx_snapshots: giá đã tính và tỷ giá khóa theo phiên bản.
- itinerary_versions: snapshot bất biến, có parentVersionId và contentHash.
- validations, validation_issues, reviews: kết quả kiểm tra và rà soát.
- conversations, messages, generation_runs, run_events: trao đổi và tiến độ.
- documents, document_versions, document_chunks: tri thức và chỉ mục.
- exports, audit_events, idempotency_keys, outbox_events: file xuất, truy vết, retry an toàn.

FK cần kiểm tra cùng organizationId. Unique (tripId, versionNumber). Index theo (organizationId, updatedAt, id) cho phân trang chuyến đi, (tripId, draftRevision) cho validations. Dữ liệu bảng giá gốc có ngày hiệu lực và ngày dịch vụ áp dụng.
Snapshot lưu trong một transaction để yêu cầu, lịch trình, báo giá và kết quả kiểm tra luôn cùng revision. Có thể dùng JSONB cho payload snapshot; dữ liệu vận hành vẫn được chuẩn hóa theo bảng quan hệ.

## 6. Workflow lập phương án
1. Load trip theo actor và quyền truy cập.
2. Parse ý định từ chat với structured output, validate bằng Pydantic.
3. Thiếu thông tin quan trọng: NEEDS_INPUT; hỏi rõ tuổi trẻ em, ngày, phạm vi ngân sách.
4. Retrieve tour mẫu và kinh nghiệm có quyền truy cập.
5. Query danh mục, bảng giá có cấu trúc; retrieve thêm nguồn bên ngoài qua adapter nếu đã kết nối.
6. LLM đề xuất candidate activities và nhu cầu dịch vụ bằng IDs.
7. ItineraryPlanner phân ngày, thời gian và tuyến; bảo toàn lockedFields.
8. PricingEngine tính từng phương án.
9. ValidationEngine kiểm tra thời gian, di chuyển, ngân sách, thông tin thiếu và dữ liệu cũ.
10. Repair có giới hạn vòng lặp. Không được âm thầm nới điều kiện bắt buộc.
11. Lưu kết quả bằng compare-and-swap với baseRevision; nếu người dùng đã sửa, trả conflict/proposed result, không ghi đè.
12. LLM diễn giải từ kết quả đã tính. Nhân viên rà soát revision cụ thể.

Structured output chỉ bảo đảm cấu trúc, không chứng minh tính đúng thực tế. LLM không được tạo đơn giá chính thức hay thao tác đặt dịch vụ. Tool registry backend chỉ cho các hàm nghiệp vụ có schema, không cho query SQL tùy ý.
OR-Tools là module nội bộ của worker. Cần phân biệt FEASIBLE, INFEASIBLE và TIMEOUT/UNKNOWN. Giải bài toán du lịch cần mô hình lựa chọn hoạt động và ngân sách bổ sung, không chỉ gọi ví dụ VRPTW có sẵn.

## 7. Tri thức và dữ liệu ngoài
RAG dùng cho tài liệu kinh nghiệm, tour mẫu, mô tả. Giá và quy tắc sử dụng truy vấn có cấu trúc.
Tài liệu nhập qua parse/OCR -> review -> version -> chunk -> index. Kiểm tra ACL trước retrieval; chunk giữ source document/version/page. Cập nhật hoặc xóa tài liệu phải loại chỉ mục cũ.
Provider adapters: PlaceProvider, RoutingProvider, WeatherProvider, RateProvider. Có timeout, giới hạn đồng thời, rate limit và retry có backoff với lỗi tạm thời. Lỗi provider trả PARTIAL hoặc NEEDS_REVIEW, không tự bịa kết quả.
Cache chỉ theo quyền sử dụng của nhà cung cấp; không mặc định giữ dữ liệu Google Places hoặc review trong vector DB. Giữ trạng thái fetchedAt/expiresAt/source cho các trường được phép lưu.

## 8. Rà soát, an toàn và vận hành
Đề xuất vai trò cần chốt trước triển khai: consultant, reviewer, data manager, admin. Backend enforce role + organization + trip access. Frontend hide nút chỉ hỗ trợ UX.
Sau khi sửa hành trình hoặc giá, review cũ không còn hiệu lực. Đánh dấu rà soát nội bộ khác với xác nhận giá, tồn chỗ và booking.
Secrets nằm trong secret manager hoặc kho mã hóa backend, không trả raw key cho browser, không lưu .env thông qua màn hình admin.
Ngoại vi chứa nội dung có thể là prompt injection; tool chỉ chấp nhận tham số đã validate, không thực thi chỉ dẫn lấy từ tài liệu.
API ghi outbox cùng transaction tạo run. Dispatcher đưa job vào queue. Worker idempotent theo runId, có lease/heartbeat và recovery. Checkpoints không tự bảo đảm exactly-once side effects.
Audit actor, sourceRevision, resultRevision, old/new diff. Log traceId/runId; che PII và secrets. Theo dõi token/API cost, thời gian tạo, lỗi validation, tỷ lệ nhân viên chỉnh sửa.
Auth, upload validation và API limits phải hoàn tất trước dữ liệu thật.

## 9. Triển khai
React/TypeScript UI hoặc chuyển các mẫu HTML sang component sau khi chốt luồng.
FastAPI API container + worker container, PostgreSQL/pgvector, Redis, S3. Local bằng Docker Compose. Cloud: ECS cho API và worker, RDS PostgreSQL nếu hỗ trợ extension cần dùng, ElastiCache hoặc queue được chọn, S3 và Secrets Manager. HTTPS tại ingress.
Tác vụ CPU solver chạy worker riêng, không chặn event loop API. Có timeout cứng và budget token theo run.
Sao lưu DB, migration có rollback, healthcheck, graceful shutdown. Không cần Kafka hoặc Kubernetes chỉ cho phạm vi hiện tại.

## 10. Thứ tự triển khai theo luồng nghiệp vụ
- Chuyến đi và yêu cầu + auth/ACL.
- Draft lịch trình + bảng giá + bộ tính báo giá.
- Kiểm tra + snapshot + review.
- Queue/runs/SSE, rồi nối LangGraph và nhà cung cấp LLM.
- Ingestion tài liệu và retrieval.
- Nguồn dữ liệu ngoài và export PDF/ICS.
Chốt dữ liệu và API theo màn hình trước khi thay localStorage bằng backend. Mỗi lát hoàn tất input, xử lý, lỗi, UI feedback và lưu trữ.

## 11. Tài liệu kỹ thuật nền
- Gemini structured output: https://ai.google.dev/gemini-api/docs/structured-output
- Gemini function calling: https://ai.google.dev/gemini-api/docs/function-calling
- LangGraph persistence: https://docs.langchain.com/oss/python/langgraph/persistence
- LangGraph interrupts: https://docs.langchain.com/oss/python/langgraph/interrupts
- OR-Tools VRPTW: https://developers.google.com/optimization/routing/vrptw
- OR-Tools CP-SAT: https://developers.google.com/optimization/cp/cp_solver
- pgvector: https://github.com/pgvector/pgvector
- Places policies: https://developers.google.com/maps/documentation/places/web-service/policies

