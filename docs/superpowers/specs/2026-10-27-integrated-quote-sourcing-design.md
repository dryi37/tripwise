# Thiết kế: gộp tìm dịch vụ vào Báo giá

## Mục đích

Rút ngắn luồng làm việc của tư vấn viên. Thay vì chuyển qua tab “Tìm dịch vụ” rồi quay lại “Báo giá”, tư vấn viên tìm, so sánh, chọn nguồn và tính tiền trong cùng tab “Báo giá”.

## Phạm vi

- Bỏ tab độc lập “Tìm dịch vụ” khỏi không gian tư vấn.
- Tab “Báo giá” giữ bảng các dịch vụ đã chọn và bổ sung hành động “Thêm dịch vụ”.
- “Thêm dịch vụ” mở khu vực chọn dịch vụ ngay trong tab: tìm kiếm, lọc, xem nhà cung cấp/đơn giá/điều kiện và thêm một báo giá nguồn vào phương án.
- Sau khi thêm, khu vực chọn đóng lại và dòng mới xuất hiện trong bảng báo giá; số lượng, đơn giá, thành tiền và tổng ngân sách cập nhật tại chỗ.
- Mỗi dòng tiếp tục tham chiếu chính xác `rateId` và `offerId`, đồng thời giữ snapshot nguồn đã chọn.
- “Danh mục nhà cung cấp” vẫn là màn hình quản trị dữ liệu gốc: thêm/sửa dịch vụ, nhà cung cấp, hiệu lực, điều kiện và trạng thái xác minh.
- Các liên kết hiện trỏ tới `tab=sources` được chuyển sang `tab=quote&picker=open`.

## Không làm trong thay đổi này

- Không thay đổi mô hình dữ liệu nhà cung cấp hoặc cơ chế snapshot báo giá.
- Không thêm tìm kiếm trực tuyến/API thật.
- Không cho sửa dữ liệu danh mục ngay trong bộ chọn của Báo giá.

## Trạng thái và quy tắc

- Bộ chọn có các trạng thái: mặc định, đang lọc, không có kết quả và đã thêm.
- Dịch vụ đã có trong báo giá được nhận diện rõ và không bị thêm trùng ngoài ý muốn.
- Chỉ báo giá nguồn hợp lệ theo quy tắc hiện có mới được áp dụng; dữ liệu chưa xác minh vẫn hiển thị cảnh báo và không giả định là hợp lệ.
- Trên màn hình hẹp, bộ chọn xếp một cột; bảng báo giá vẫn cuộn trong bề mặt riêng.

## Các phương án đã cân nhắc

1. Gộp bộ chọn trực tiếp vào tab “Báo giá” — được chọn vì ít chuyển ngữ cảnh và phù hợp quy mô hiện tại.
2. Mở bộ chọn trong modal — gọn hơn nhưng không thuận tiện để so sánh nhiều nguồn và điều kiện dài.
3. Giữ tab “Tìm dịch vụ” riêng — bị loại vì trùng chức năng và tạo thêm một bước điều hướng.

## Tiêu chí hoàn thành

- Không còn tab “Tìm dịch vụ”.
- Có thể mở bộ chọn, tìm/chọn một báo giá nguồn và thấy nó xuất hiện trong bảng Báo giá mà không đổi tab.
- Không còn liên kết nội bộ nào điều hướng tới tab `sources`.
- Luồng “Xem báo giá nguồn” vẫn mở đúng dịch vụ và nhà cung cấp trong “Danh mục nhà cung cấp”.
- Kiểm tra cú pháp, QA hiện có, audit giao diện và kiểm thử trình duyệt đều đạt.
