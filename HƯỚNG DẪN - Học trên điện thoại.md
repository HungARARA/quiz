# Học trên điện thoại

## Link của bạn

```
https://hungarara.github.io/quiz/
```

Đã chạy sẵn. Mở link này trên điện thoại là học được ngay, ở bất cứ đâu, không cần máy tính.

Repo: https://github.com/HungARARA/quiz

---

## Cài vào điện thoại như một app (nên làm)

Mở link trên điện thoại rồi:

- **Android (Chrome/Cốc Cốc)**: menu ⋮ → *Thêm vào Màn hình chính*
- **iPhone (Safari)**: nút Chia sẻ → *Thêm vào MH chính*

Xong sẽ có biểu tượng 🧬 ngay màn hình chính. Bấm vào mở toàn màn hình như app thật, **không còn thanh địa chỉ**.

Quan trọng: sau lần mở đầu tiên, toàn bộ 695 câu hỏi được lưu vào máy. Từ đó **mất mạng vẫn học bình thường** — đi trực, xuống hầm, hết 4G đều không sao.

---

## Khi thêm đề mới

Bỏ file `.docx` mới vào thư mục môn học, rồi mở PowerShell tại thư mục dự án và chạy:

```bash
cd quiz-app && npm run build && cd .. && git add -A && git commit -m "Them de moi" && git push
```

Đợi 1–2 phút cho GitHub cập nhật. Lần sau mở app trên điện thoại (lúc có mạng) là tự có đề mới.

Nếu lệnh trên báo lỗi, chạy riêng từng phần để biết hỏng ở đâu:

```bash
cd quiz-app && npm run build
```

Script build sẽ tự kiểm tra và báo lỗi rõ ràng nếu có gì sai, chứ không lặng lẽ tạo ra bản cũ.

---

## Cách khác: chung Wi-Fi với máy tính

Khi ở nhà, muốn dùng bản trên máy tính (có thể upload file, quét thư mục trực tiếp):

1. Chạy `Mở Quiz.bat`
2. Lấy IP máy tính:

```bash
ipconfig | findstr IPv4
```

3. Trên điện thoại vào `http://<IP-đó>:3000`

Nếu không vào được thì Windows Firewall đang chặn — chọn **Allow access** khi nó hỏi.

---

## Những điều nên biết

**Link là công khai.** Ai có link đều mở được đề và đáp án. Trang có thẻ `noindex, nofollow` nên Google không đưa lên kết quả tìm kiếm, nhưng đó không phải bảo mật. Muốn gỡ xuống: vào repo → Settings → kéo xuống cuối → *Delete this repository*. Hoặc chỉ tắt web mà giữ code: Settings → Pages → Source → chọn *None*.

**Những file KHÔNG được đẩy lên** (vẫn nằm nguyên trên máy bạn): ảnh chụp đề thi, file `.zip`, và file `GPB KT GIỮA KỲ 2023.pptx` nặng 12 MB. App không cần chúng vì câu hỏi đã được đọc sẵn thành dữ liệu rồi.

**Email của bạn không bị lộ.** Commit dùng địa chỉ `HungARARA@users.noreply.github.com` chứ không phải Gmail thật.

**Ghim và ghi chú không đồng bộ** giữa máy tính và điện thoại, và chỉ tồn tại trong một lượt làm bài.

**Upload file Word ngay trên điện thoại vẫn được.** Bấm vùng "Kéo thả nhiều file" rồi chọn file `.docx` từ điện thoại. Lần đầu cần mạng để tải bộ đọc file Word (~600 KB), sau đó offline vẫn dùng được.

**Miễn phí vĩnh viễn.** GitHub Pages cho repo công khai: 1 GB dung lượng, 100 GB băng thông/tháng. App của bạn nặng 1,5 MB.
