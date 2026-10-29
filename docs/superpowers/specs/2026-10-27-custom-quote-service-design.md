# Thiết kế: dịch vụ ngoài danh mục trong Báo giá

## Mục đích

Cho phép tư vấn viên thêm một dịch vụ chưa tồn tại trong danh mục mà không rời màn hình Báo giá thống nhất.

## Luồng được chọn

- Đặt nút “Dịch vụ ngoài danh mục” ở phần đầu bảng Báo giá.
- Nút mở biểu mẫu của ứng dụng gồm: tên dịch vụ, nhà cung cấp, nhóm, đơn vị, số lượng, đơn giá và điều kiện/ghi chú.
- Lưu thành công thêm ngay một dòng vào báo giá hiện tại với trạng thái “Chưa xác minh”.
- Dòng mới có nguồn dạng thủ công và snapshot riêng; chỉnh sửa danh mục sau này không tự thay đổi dòng này.
- Có lựa chọn “Lưu vào Danh mục nhà cung cấp để tái sử dụng”, mặc định tắt. Khi bật, hệ thống tạo một dịch vụ và báo giá nhà cung cấp chưa xác minh trong danh mục.
- Dữ liệu bắt buộc: tên dịch vụ, nhà cung cấp và đơn vị. Số lượng là số nguyên từ 1; đơn giá VND là số nguyên không âm.
- Không tạo trùng khi biểu mẫu được gửi nhiều lần; nút lưu bị khóa trong lúc xử lý.

## Không làm

- Không xác minh tự động nhà cung cấp, giá hoặc tình trạng còn chỗ.
- Không gọi API bên ngoài.
- Không tự động lưu mọi dịch vụ thủ công vào danh mục.

## Phương án đã cân nhắc

1. Dịch vụ ngoài danh mục ngay trong Báo giá, có tùy chọn lưu danh mục — được chọn vì nhanh cho tư vấn viên nhưng vẫn giữ danh mục sạch.
2. Bắt buộc tạo trong Danh mục nhà cung cấp trước — bị loại vì làm gián đoạn luồng báo giá.
3. Luôn tự lưu vào danh mục — bị loại vì dễ tạo dữ liệu tạm hoặc trùng lặp.

## Hoàn thành khi

- Có thể thêm dịch vụ thủ công và thấy tổng tiền cập nhật trong cùng bảng.
- Dòng mới hiển thị rõ “Chưa xác minh”.
- Tùy chọn lưu danh mục mặc định tắt và hoạt động có chủ đích.
- Validation giữ nguyên dữ liệu nhập, hiển thị lỗi và đưa focus tới trường cần sửa.
