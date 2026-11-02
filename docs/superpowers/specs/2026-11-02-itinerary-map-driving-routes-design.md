# Tuyến đường và khoảng cách trên bản đồ lịch trình

## Ý định
Giúp tư vấn viên thấy đường đi thực tế giữa các địa điểm theo thứ tự lịch trong ngày và khoảng cách của từng chặng ngay trên bản đồ.

## Phạm vi
- Gọi OSRM công khai với profile lái xe, dùng tọa độ các địa điểm đã phân giải trong ngày.
- Vẽ hình học đường đi và nhãn khoảng cách từng chặng trên bản đồ Leaflet.
- Chỉ hiển thị thông tin tuyến trên bản đồ; không sửa timeline, thẻ hoạt động hay dữ liệu lưu trữ.
- Nếu không lấy được tuyến, giữ các ghim và hiển thị thông báo tuyến chưa khả dụng.

## Hướng thực hiện
Dùng một yêu cầu OSRM Route cho chuỗi tọa độ theo thứ tự lịch, `steps=true`, `geometries=geojson`, `overview=false`. Hình học từng bước trong mỗi leg được ghép thành đường riêng cho leg; khoảng cách leg từ phản hồi OSRM được đặt tại trung điểm hình học của leg. Giữ hành vi ghim hiện tại độc lập với lỗi dịch vụ định tuyến.

## Ràng buộc
Tọa độ địa điểm được gửi tới `router.project-osrm.org`. Màu tuyến và nhãn dùng token xanh thương hiệu hiện có. Không thêm thư viện hay tùy chọn phương tiện.
