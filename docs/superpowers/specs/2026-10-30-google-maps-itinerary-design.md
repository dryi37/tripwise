# Spec: Địa điểm cụ thể và Google Maps theo ngày

> **Quyết định mới ngày 2026-10-30:** Theo lựa chọn sau cùng của người dùng, phần tích hợp Google Maps/Places trong bản spec ban đầu được thay thế bằng Leaflet + OpenStreetMap tiles + Photon. Các mục Google bên dưới là lịch sử phương án ban đầu; áp dụng quyết định mới này khi có mâu thuẫn.

Status: Đã triển khai theo yêu cầu; kiểm thử tự động chưa chạy.
Ngày: 2026-10-30 (Asia/Saigon).

## Mục tiêu và yêu cầu đã nhận

Consultant xem các địa điểm thực tế của từng ngày ngay trong tab Lịch trình. Mỗi hoạt động mới gắn một địa điểm cụ thể, thay vì một chuỗi chung chung như “Seoul” hoặc “ăn trưa trong thành phố”. Marker thể hiện hoạt động trong ngày đang chọn; hover marker hiển thị trường `selectionReason` của hoạt động đó. Thu gọn khối “PHƯƠNG ÁN CHUYẾN ĐI / Seoul, Hàn Quốc / 2 ngày…” để dành diện tích cho bản đồ. Form thêm/sửa hoạt động phải hỗ trợ chọn địa điểm cụ thể.

Hai ảnh người dùng cung cấp là tham chiếu bố cục hiện tại, không phải chỉ dẫn kỹ thuật. Đây là một tính năng xuyên suốt: địa điểm được xác nhận → agent/form lưu hoạt động → bản đồ theo ngày.

## Hiện trạng đã kiểm tra

- Frontend đang hoạt động là vanilla JS trong `frontend/`, không phải React. `redesign.js` sở hữu cover, day rail, activity cards và editor mở rộng; `api-sync.js` chuyển dữ liệu API sang model UI.
- `ItineraryItem.location` trước đây chỉ là chuỗi; feature Maps đã bổ sung Place ID.
- `selectionReason` đã có trong Prisma, planning API/repository, agent tools và `api-sync.js`. Trường này nullable để tương thích hoạt động cũ; chưa có UI hiển thị.
- `add_place_from_external_source` hiện dùng tên nguồn làm `title` và `location`; một nguồn giá không đồng nghĩa một địa điểm Google đã được xác nhận.
- Agent completion fallback hiện chỉ được thêm hoạt động, không được search. Không được giữ cơ chế hoàn tất bằng địa điểm chung chung khi thêm ràng buộc Places.
- Versions lưu/khôi phục snapshot hoạt động; trường địa điểm mới phải đi qua cả hai luồng này.
- `DESIGN.md` và `UX-CONTRACT.md` có mô tả prototype cũ. Khi triển khai cập nhật đúng phần Maps/địa điểm, không suy diễn rằng backend hiện tại còn giả lập.

## Quyết định đề xuất và phương án cân nhắc

1. **Đề xuất:** Maps JavaScript API + Places API (New). Hỗ trợ marker tùy biến, hover/focus/click, gắn lý do và xác nhận danh tính địa điểm ở backend.
2. Maps Embed đơn giản hơn nhưng không đáp ứng tốt marker từng hoạt động với popup `selectionReason` tùy biến.
3. Geocoding chuỗi `location` lúc render ít thay đổi schema nhưng dễ chọn nhầm chi nhánh, không chặn agent tiếp tục tạo hoạt động chung chung. Không chọn.

Giả định trong bản nháp: mỗi hoạt động có một địa điểm neo cụ thể. Hoạt động di chuyển dùng một điểm neo như ga/sân bay; nếu cần nhiều điểm dừng thì tách thành nhiều hoạt động. Chưa mô hình hóa tuyến nhiều điểm trong một activity. Đây là quyết định đề xuất, chưa phải xác nhận của người dùng.

## Phạm vi

- Places search/details, liên kết Place ID cho hoạt động, thay đổi contract agent và form.
- Map theo ngày đang chọn, marker và popup lý do, đồng bộ map với activity card.
- Dữ liệu cũ, snapshot/restore, lỗi provider, quota, cấu hình và kiểm thử.
- Không gồm Routes/Directions, tối ưu thứ tự hành trình, thời gian/quãng đường di chuyển, Street View, ảnh/review Places, booking hoặc xác minh giá qua Google.
- Giữ web/internal price research và quote provenance hiện tại. Xác nhận địa điểm không xác nhận giá, giờ mở cửa cho ngày đi hay khả năng đặt chỗ.

## Trải nghiệm màn hình

Thứ tự trong cột lịch trình desktop:

```text
Thông tin chuyến đi và tabs hiện tại
Phương án chuyến đi · Seoul, Hàn Quốc · 2 ngày · Khách thử agent  [compact]
[Ngày 1] [Ngày 2] ...
[Google Map của ngày đang chọn, marker đánh số theo lịch trình]
Ngày 1 / tiêu đề ngày / Thêm hoạt động
Timeline hoạt động
```

- Bỏ ảnh hero lớn ở cover; giữ heading và mô tả trong một khối cao khoảng 88–112px trên desktop, tự co giãn khi nội dung dài. Không hardcode Seoul cho các chuyến khác.
- Map cao dự kiến 320px desktop, 260px mobile; giữ rail trợ lý bên phải theo breakpoint hiện tại. Mobile map và timeline xếp dọc, không gây cuộn ngang.
- Chuyển ngày thay toàn bộ marker sang đúng ngày đó, đóng popup cũ và fit bounds một lần. Không hiện marker ngày khác.
- Sắp thứ tự theo `localStartTime`, rồi `id` để ổn định; số marker khớp số thứ tự card. Một điểm duy nhất dùng zoom phù hợp venue; ngày trống hiển thị empty state.
- Hover/focus marker mở một popup: số hoạt động, giờ, tên hoạt động, địa điểm, nhãn “Lý do chọn” và nguyên văn `selectionReason` dưới dạng text an toàn. Click/tap giữ popup mở; Escape/đóng explicit sẽ đóng. Popup có thể rê chuột vào và đọc được, không biến mất khi di chuyển từ marker sang popup.
- Nếu thiếu lý do, hiển thị “Chưa có lý do lựa chọn”; không tạo lý do giả. Keyboard và touch có hành vi tương đương hover.
- Click marker có thể đưa card tương ứng vào vùng nhìn; action “Xem trên bản đồ” của card focus đúng marker, không can thiệp action click tiêu đề mở editor.
- Nhiều hoạt động cùng Place ID/tọa độ dùng marker nhóm có số lượng, popup liệt kê từng hoạt động và lý do riêng; không để các pin chồng nhau không thể chọn. Số điểm phân biệt với số hoạt động.
- Lỗi Maps/khóa/quota không che timeline. Hiển thị lỗi ngắn và Retry; link Google Maps theo Place ID vẫn dùng được khi đã biết ID. Giữ logo/attribution của Google rõ ràng.

## Form thêm/sửa hoạt động

- Trường “Địa điểm” thành ô tìm và danh sách kết quả có tên, địa chỉ để phân biệt chi nhánh. Consultant phải chọn kết quả cụ thể; nhập text rồi Save chưa được coi là chọn địa điểm.
- Sau khi chọn có trạng thái đã chọn và hành động thay đổi/xóa. Gõ lại nội dung làm mất selection cũ, tránh giữ Place ID cũ với text mới.
- Search có debounce, hủy/bỏ qua response cũ khi query đổi; dùng destination của trip làm ngữ cảnh, không gửi tên khách hoặc toàn bộ brief cho Google.
- Đề xuất dùng cùng backend Places search với agent để thống nhất validation, quota và keys. Đây là dropdown tự xây, không bắt buộc dùng widget Autocomplete của Google.
- Địa điểm và nguồn giá là hai dữ liệu độc lập. Đổi nguồn giá không tự đổi địa điểm. Đổi địa điểm làm xóa lý do cũ; editor cho phép nhập lại `selectionReason` tùy chọn.
- Hoạt động manual không có lý do vẫn hợp lệ; hoạt động mới do agent tạo bắt buộc có lý do không rỗng.

## Dữ liệu, lưu trữ và tương thích

- Thêm `googlePlaceId String? @map("google_place_id")` cho `ItineraryItem`, migration additive nullable. `selectionReason` giữ nguyên; không thêm trường lý do thứ hai.
- **Cập nhật theo yêu cầu người dùng ngày 2026-10-30:** bỏ hẳn `ItineraryItem.location` khỏi Prisma, API, agent và frontend. Chỉ lưu Place ID làm định danh venue; tên và địa chỉ hiển thị được lấy trực tiếp từ Google Places khi mở ngày/bản đồ. Không lưu Google name/address/lat/lng/raw payload vào DB, snapshot, localStorage, Qdrant hay log.
- Migration xóa cột `itinerary_items.location` và xóa key `location` khỏi snapshot phiên bản cũ. Hoạt động cũ thiếu Place ID sẽ không còn nhãn địa điểm; UI báo chưa liên kết và yêu cầu chọn lại trên Google Maps khi sửa.
- DTO map tạm thời: `{ activityId, googlePlaceId, latitude, longitude, displayName, formattedAddress, googleMapsUri }`. DTO không đi vào version snapshot hoặc browser last-server-snapshot.
- Google cung cấp quyền lưu Place ID riêng; các trường khác có hạn chế caching. Nếu cần persistent cache tọa độ sau này phải xác nhận điều khoản cụ thể trước, không tự đặt TTL dài hạn.
- Item cũ null Place ID vẫn đọc/hiển thị/snapshot/restore được. Không bulk geocode và tự chọn kết quả cho data cũ.
- Cho phép sửa giờ/mô tả/lý do của item cũ chưa liên kết; khi tạo mới hoặc thay địa điểm phải chọn Place hợp lệ. Cũ chưa resolve được ghi “Chưa gắn địa điểm trên bản đồ” và có action chọn địa điểm. X/Y hoạt động đã có điểm trên map phải rõ.
- Snapshot lưu Place ID và authored fields; restore snapshot cũ thiếu field map thành null. Restore snapshot có Place ID phải giữ ID, không phụ thuộc Google online; render map có thể resolve lại sau.

## Module Places và API đề xuất

Boundary: `PlacesService` gọi provider Google qua interface inject được. Không gọi Google trực tiếp trong controller, planning repository hoặc model adapter.

1. `POST /api/v1/trips/:tripId/places/search` body `{ query }`: xác thực trip, trim/giới hạn query, lấy destination làm ngữ cảnh; trả tối đa `AGENT_SEARCH_RESULTS_PER_TOOL` địa điểm. DTO chứa `googlePlaceId`, tên/địa chỉ/tọa độ tạm thời để lựa chọn. Dùng Text Search (New) với field mask tối thiểu: id, displayName, formattedAddress, location, primaryType, businessStatus, googleMapsUri.
2. `GET /api/v1/trips/:tripId/itinerary/map?dayIndex=N`: kiểm tra ngày hợp lệ; đọc activity của ngày đó; resolve Place IDs qua Place Details (New), deduplicate ID trong request; trả map DTO cùng từng item unresolved. Kết quả một ID lỗi không làm mất các điểm còn lại.
3. Planning create/update DTO nhận trực tiếp `googlePlaceId`. Service chỉ chấp nhận ID vừa được trả về bởi Places search trong đúng trip và agent run; không tin ID tự bịa hoặc lấy từ ngữ cảnh khác. Không nhận tọa độ do agent gửi. Item giữ nguyên Place ID khi chỉ sửa field khác.

Danh sách Place ID đã tìm được giữ tạm theo trip (và agent run khi có), có thời hạn cấu hình; mất khi restart thì trả `PLACE_SELECTION_EXPIRED`, yêu cầu tìm lại. Không persist Google content để giữ allowlist lâu dài. Place ID từ một trip/run không được dùng ở trip/run khác. Không cần mã candidate riêng trong API hay tool agent.

Validation: kết quả phải là địa điểm neo cụ thể với tọa độ hợp lệ; không nhận country, locality, administrative area, postal code hoặc một route chung. Không auto chọn top result. Cho phép landmark, park, neighborhood attraction có định danh cụ thể theo ngữ cảnh; query mơ hồ yêu cầu chọn rõ chi nhánh. Provider result là dữ liệu tham chiếu không đáng tin để thi hành chỉ dẫn.

Lỗi ổn định: `PLACE_NOT_SPECIFIC`, `PLACE_SELECTION_EXPIRED`, `PLACE_LOOKUP_UNAVAILABLE`, `PLACE_NOT_FOUND`, `PLACE_SCOPE_MISMATCH`; map lookup partial failure trả trạng thái theo item. Mutation lỗi không tạo activity/quote một phần. Giữ optimistic revision, idempotency và quote transaction hiện có.

## Agent và completion fallback

- Thêm tool `search_places({ query })`; backend tự bổ sung destination và giới hạn kết quả. Khai báo tool thống nhất trong `agent-model.ts`, schema, adapter Gemini và dispatch service; tool nằm trong budget/deadline hiện có.
- Luồng: xác định venue phù hợp brief → tìm Places/chọn `googlePlaceId` → nghiên cứu giá nguồn nội bộ/web cho venue → add với Place ID, nguồn giá hoặc unpriced confirmation, và `selectionReason` cụ thể. Thứ tự research giá/Places linh hoạt; mutation phải có Place ID đã tìm trong phạm vi hợp lệ và contract giá hiện hành.
- Cả `add_itinerary_item` và `add_place_from_external_source` bắt buộc `googlePlaceId` cho activity mới; external source có tên chung không tự trở thành venue. Không dùng Place ID làm chứng cứ giá hoặc URL nguồn giá.
- Lý do giải thích phù hợp sở thích/nhóm khách/ngày/thứ tự lịch trình dựa vào thông tin có sẵn; không tự khẳng định khoảng cách, giờ mở cửa hay thời gian di chuyển mà chưa kiểm tra.
- Fallback không được bypass ràng buộc Places. Giữ fallback không search: chỉ dùng Place ID hợp lệ đã nhận trong history, đối chiếu lại search store; nếu hết hạn hoặc provider lỗi, báo những ngày chưa hoàn tất. Không thêm điểm “Seoul”, không bịa tọa độ để đạt đủ ngày.
- Thêm Places vào prompt projection/compaction với `googlePlaceId` và dữ kiện lựa chọn cần thiết; giữ original state cho validation. Place ID hết hạn khỏi search store phải được xử lý rõ, không âm thầm tái sử dụng.

## Cấu hình và vận hành

- Browser: `googleMapsBrowserApiKey`, `googleMapsMapId` trong runtime config; browser key công khai theo thiết kế nhưng giới hạn HTTP referrers và Maps JavaScript API. Không dùng backend key ở frontend.
- Backend `.env`: `GOOGLE_PLACES_API_KEY`, `GOOGLE_PLACES_API_URL`, `GOOGLE_PLACES_TIMEOUT_MS`, `GOOGLE_PLACES_CANDIDATE_TTL_MS`, `GOOGLE_PLACES_RATE_LIMIT_MAX_REQUESTS`, `GOOGLE_PLACES_RATE_LIMIT_WINDOW_MS`. Chọn giá trị local/example khi triển khai, ghi rõ đơn vị; không thêm mặc định ngầm. Giới hạn kết quả dùng cấu hình hiện có.
- Enable Maps JavaScript API và Places API (New), billing, map ID cho Advanced Markers. Thiếu cấu hình phải có trạng thái feature unavailable có thể đọc được; các tính năng cũ tiếp tục khởi động.
- Rate limit Places endpoints và agent tool cùng quota tổng; request abort/deadline truyền xuống provider. Không retry vô hạn; không ghi API key, response Places hoặc thông tin khách vào log. Field masks cố định ở provider; không lấy ảnh/reviews.
- Google yêu cầu attribution, điều khoản sử dụng/chính sách riêng tư phù hợp; bổ sung link trước khi bật sử dụng ngoài local. Chưa có auth trong dự án: không mở proxy Places công khai không giới hạn.

## Tiêu chí chấp nhận

1. Ngày có ba hoạt động ở ba địa điểm khác nhau hiển thị đúng ba marker; đổi ngày loại bỏ marker và popup ngày cũ.
2. Popup qua hover, keyboard và touch hiển thị đúng `selectionReason` của từng activity, không XSS; lý do thiếu có fallback trung thực.
3. Hai activity cùng venue vẫn chọn/đọc được hai lý do; không mất activity vì deduplicate tọa độ.
4. Agent không thể thêm activity mới nếu thiếu Place ID đã tìm hợp lệ; API không nhận `location` tự do. ID tự bịa/cross-trip/expired bị từ chối và không để quote mồ côi.
5. Cả hai agent mutation paths và fallback tuân thủ ràng buộc venue; thiếu Places thì kết quả incomplete rõ ràng.
6. Form yêu cầu chọn địa điểm; gõ lại text bỏ lựa chọn cũ; request cũ không ghi đè lựa chọn mới; manual reason không bắt buộc.
7. Reload và version restore giữ Place ID/reason. Snapshot cũ vẫn đọc được; dữ liệu Google tạm thời không bị lưu cùng snapshot/localStorage.
8. Provider timeout/quota, Place ID cũ không tìm được, map SDK lỗi, ngày trống và ngày chỉ có dữ liệu cũ đều có UI thích hợp; timeline vẫn dùng được.
9. Cover thu gọn; map không bị dựng lại hoặc reset zoom mỗi lần chat/quote rerender; 390px mobile không cuộn ngang, attribution không bị che.
10. Giá/báo giá, source link, optimistic revision và tổng tiền không đổi ngoài các thao tác được yêu cầu.

## Nguồn chính thức và kiểm chứng khi triển khai

- [Advanced Markers cần map ID](https://developers.google.com/maps/documentation/javascript/advanced-markers/start)
- [Text Search (New)](https://developers.google.com/maps/documentation/places/web-service/text-search)
- [Place Details (New)](https://developers.google.com/maps/documentation/places/web-service/place-details)
- [Place IDs và lưu trữ](https://developers.google.com/maps/documentation/places/web-service/place-id)
- [Places policies và caching](https://developers.google.com/maps/documentation/places/web-service/policies)
- [Maps JavaScript policies](https://developers.google.com/maps/documentation/javascript/policies)

Tài liệu này là draft spec; các lựa chọn UX một-venue-per-activity, không Routes và giữ legacy unresolved là đề xuất cần review. Không có API key/billing giả định sẵn; không gọi Google trả phí trong bước soạn tài liệu.

## Quyết định triển khai thay thế

- Dùng Leaflet 1.9.4 và tile layer OpenStreetMap; map giữ attribution hiển thị.
- Tìm địa điểm qua Photon, có debounce phía giao diện, Tripwise tự giới hạn 1 request/giây phía backend và cache kết quả. Không cần Google API key, Map ID hoặc Google billing.
- Gửi `placeId` trực tiếp trong contract agent/form, định dạng `node/<id>`, `way/<id>` hoặc `relation/<id>`. Backend xác thực ID thuộc tập kết quả tìm kiếm còn hiệu lực theo trip/run.
- Lưu `placeProvider`, `placeId`, tên, địa chỉ và tọa độ đã chọn trong hoạt động để bản đồ dựng marker mà không geocode lại. `selectionReason` hiện trong popup marker theo ngày.
- Migration chuyển ID cũ sang `GOOGLE_LEGACY`, giữ nguyên nội dung và snapshot; hoạt động legacy không được coi là OSM và cần chọn lại kết quả để có marker.
- Photon demo và tile server công khai là dịch vụ cộng đồng có giới hạn và best-effort; phù hợp phát triển/lưu lượng vừa phải. Sản phẩm production cần nhà cung cấp tile/geocoder có SLA hoặc tự host. Attributions và cache policy phải tuân theo [Photon API/demo guidance](https://github.com/komoot/photon/blob/master/README.md#demo-server) và [OSM tile policy](https://operations.osmfoundation.org/policies/tiles/).
