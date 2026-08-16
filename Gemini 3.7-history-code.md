# Nhật Ký Thay Đổi & Sửa Lỗi - Gemini 3.7 (Gemini 3.7-history-code.md)

## 1. Thông tin chung
- **Ngày thực hiện**: 16/08/2026
- **Mục tiêu**: Khắc phục lỗi không kéo/cuộn (scroll) được danh sách đề lên xuống trên màn hình điện thoại (giao diện PWA/web tĩnh trên di động).
- **Yêu cầu tuân thủ**:
  1. Sao lưu (backup) các file cũ trước khi can thiệp vào thư mục `backup/`.
  2. Tạo file `Gemini 3.7-history-code.md` ghi nhận toàn bộ quá trình, danh sách file tạo mới, file chỉnh sửa và xác nhận tình trạng backup.
  3. Commit và đẩy thay đổi lên GitHub sau khi hoàn tất.

---

## 2. Phân tích nguyên nhân lỗi trên điện thoại
- **Hiện tượng**: Khi mở danh sách đề thi (ví dụ môn *Ngoại Bệnh Lý RHM* có 8 đề), các đề ở phía dưới (từ K46 trở đi) bị cắt cụt ngang màn hình. Người dùng dùng ngón tay vuốt/kéo màn hình lên xuống thì danh sách không cuộn được hoặc bị kẹt/khựng, không thể kéo xuống để xem hết các đề còn lại hay nhấn nút nạp đề và cài đặt bài làm.
- **Nguyên nhân kỹ thuật**:
  1. Trong file CSS (`style.css`), class `.library-grid` bị gán thuộc tính `max-height: min(60vh, 460px)` kết hợp `overflow-y: auto`.
  2. Điều này tạo ra một khung cuộn con (nested scroll container) cục bộ nằm lọt thỏm giữa trang. Trên trình duyệt điện thoại (Chrome Mobile, Safari, Mi Browser,...), việc cuộn lồng nhau thường xuyên làm mất cử chỉ chạm (touch gesture), bắt nhầm sự kiện chạm vào các thẻ `<button class="lib-card">` và làm kẹt thao tác cuộn của toàn trang (scroll trap).
  3. Thiếu các thuộc tính tối ưu hóa cảm ứng như `touch-action: pan-y`, `touch-action: manipulation`, `-webkit-overflow-scrolling: touch` và `overscroll-behavior: contain`.

---

## 3. Trạng thái sao lưu (Backup)
Trước khi tiến hành bất kỳ chỉnh sửa nào vào mã nguồn, các file gốc đã được sao chép và lưu trữ an toàn vào thư mục `backup/`:
- **Đã bỏ file sắp được chỉnh sửa vô backup**: **CÓ (ĐÃ HOÀN TẤT)**
  - `backup/quiz-app/public/style.css` (sao lưu từ `quiz-app/public/style.css` gốc)
  - `backup/docs/style.css` (sao lưu từ `docs/style.css` gốc)

---

## 4. Danh sách các file tạo mới
1. `backup/quiz-app/public/style.css`: File CSS gốc sao lưu trước khi can thiệp.
2. `backup/docs/style.css`: File CSS web tĩnh gốc sao lưu trước khi can thiệp.
3. `Gemini 3.7-history-code.md`: File tài liệu này, ghi nhận chi tiết quá trình xử lý.

---

## 5. Danh sách các file đã chỉnh sửa
1. `quiz-app/public/style.css`:
   - **Xóa bỏ** `max-height: min(60vh, 460px);` và `overflow-y: auto;` trên `.library-grid`. Danh sách đề giờ đây mở rộng tự nhiên theo chiều dọc trang web, giúp toàn bộ trang web cuộn mượt mà không bị kẹt hay cắt cụt đề thi.
   - **Thêm** `touch-action: pan-y;` và `-webkit-overflow-scrolling: touch;` cho `body`, `.library-grid`, `.file-list`.
   - **Thêm** `min-height: 100dvh;` cho `body` để tương thích chuẩn xác với thanh điều hướng động trên trình duyệt điện thoại.
   - **Thêm** `touch-action: manipulation;`, `-webkit-tap-highlight-color: transparent;`, `user-select: none;` cho `.lib-card`, `.lib-subject-toggle`, `.lib-subject-all` giúp các nút phản hồi bấm tức thì và không làm cản trở cử chỉ vuốt kéo trang.
   - **Thêm** `overscroll-behavior: contain;` cho `.file-list`.
2. `docs/style.css`:
   - Được cập nhật đồng bộ từ `quiz-app/public/style.css` thông qua lệnh build.
3. `docs/sw.js`:
   - Tự động cập nhật phiên bản Service Worker mới (`20260816023525`) để điện thoại tự động tải CSS mới nhất khi truy cập lại app.

---

## 6. Quy trình thực hiện & Kết quả kiểm tra
1. **Bước 1**: Tạo thư mục `backup/` và copy các file gốc trước khi can thiệp.
2. **Bước 2**: Sửa đổi `quiz-app/public/style.css` với các giải pháp tối ưu cuộn và cử chỉ chạm trên di động.
3. **Bước 3**: Chạy `npm run build` trong thư mục `quiz-app` để biên dịch sang `docs/`. Quá trình build đọc thành công 1556 câu hỏi từ 25 bộ đề, đồng bộ file CSS và Service Worker.
4. **Bước 4**: Tạo file nhật ký `Gemini 3.7-history-code.md`.
5. **Bước 5**: Kiểm tra `git status`, chuẩn bị commit và push lên GitHub theo yêu cầu.
