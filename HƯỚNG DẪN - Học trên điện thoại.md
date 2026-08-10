# Học trên điện thoại — hướng dẫn

Tất cả đều **miễn phí**, không cần thẻ ngân hàng.

---

## Cách 1 — Đưa lên mạng, mở ở bất cứ đâu (khuyên dùng)

Làm **một lần**, sau đó đi trực chỉ cần mở link trên điện thoại.

### Bước 1: Dựng bản web cho điện thoại

Mở PowerShell tại thư mục này rồi chạy:

```bash
cd quiz-app && npm run build
```

Lệnh này đọc toàn bộ file `.docx`, dựng ra thư mục `docs/` (~1 MB) chứa web hoàn chỉnh, không cần server.

### Bước 2: Đẩy lên GitHub

Chạy lần lượt (thay `TEN-GITHUB-CUA-BAN` bằng tên tài khoản của bạn):

```bash
git init && git add . && git commit -m "Quiz on tap y khoa"
```

Vào https://github.com/new tạo một repository trống tên `quiz`, **KHÔNG** tick "Add a README". Rồi chạy:

```bash
git remote add origin https://github.com/TEN-GITHUB-CUA-BAN/quiz.git && git branch -M main && git push -u origin main
```

### Bước 3: Bật GitHub Pages

Vào repo vừa tạo → tab **Settings** → mục **Pages** (cột trái) → phần **Build and deployment**:

- **Source**: chọn `Deploy from a branch`
- **Branch**: chọn `main`, thư mục chọn **`/docs`**
- Bấm **Save**

Đợi 1–2 phút. Link của bạn sẽ là:

```
https://TEN-GITHUB-CUA-BAN.github.io/quiz/
```

### Bước 4: Cài vào điện thoại như một app

Mở link đó trên điện thoại:

- **Android (Chrome)**: menu ⋮ → *Thêm vào Màn hình chính*
- **iPhone (Safari)**: nút Chia sẻ → *Thêm vào MH chính*

Từ giờ có biểu tượng 🧬 ngay màn hình chính, bấm vào là học, **không cần mạng** (lần đầu cần mạng để tải về máy).

### Khi thêm đề mới

Bỏ file `.docx` mới vào thư mục môn học, rồi:

```bash
cd quiz-app && npm run build && cd .. && git add . && git commit -m "Them de moi" && git push
```

Lần sau mở app trên điện thoại (có mạng) là tự có đề mới.

---

## Cách 2 — Chung Wi-Fi với máy tính (không cần làm gì thêm)

Khi điện thoại và máy tính **cùng một Wi-Fi**:

1. Mở `Mở Quiz.bat` trên máy tính như bình thường
2. Lấy địa chỉ IP của máy tính — mở PowerShell chạy:

```bash
ipconfig | findstr IPv4
```

3. Trên điện thoại mở trình duyệt, gõ: `http://<IP-vừa-lấy>:3000`
   (ví dụ `http://192.168.1.12:3000`)

Nếu không vào được, Windows Firewall đang chặn — lần đầu chạy `node` nó sẽ hỏi, chọn **Allow access** cho mạng Private.

> Cách này chỉ dùng được khi ở gần máy tính và máy tính đang bật. Đi trực thì dùng Cách 1.

---

## Cách 3 — Không muốn đưa gì lên mạng

Chép nguyên thư mục `docs/` vào điện thoại (qua cáp USB, Google Drive, Zalo...).

Cách này bị hạn chế: trình duyệt điện thoại chặn việc đọc file `.json` từ bộ nhớ máy, nên phải dùng một app "web server offline" miễn phí:

- **Android**: cài *Simple HTTP Server* hoặc *KSWEB* (bản miễn phí) → trỏ vào thư mục `docs` → mở `http://localhost:8080`
- **iPhone**: khó hơn nhiều, gần như không làm được nếu không jailbreak

> Cách 1 đã chạy offline sẵn rồi, nên thường **không cần** đến cách này.

---

## Vài điều nên biết

**Link là công khai.** Ai có link đều mở được. Tôi đã đặt thẻ `noindex, nofollow` trong trang để Google không đưa nó lên kết quả tìm kiếm — thẻ này có tác dụng thật. (Tôi cũng tạo file `robots.txt`, nhưng nói thẳng: với địa chỉ dạng `github.io/quiz/` thì file đó **không có tác dụng**, vì Google chỉ đọc `robots.txt` ở gốc tên miền mà bạn không sở hữu. Cứ để đó, vô hại.)

Dù sao đây cũng **không phải bảo mật thật** — ai biết link vẫn xem được đề và đáp án. Cân nhắc nếu trường bạn khó tính chuyện này.

**Ghim và ghi chú không đồng bộ giữa máy tính và điện thoại.** Chúng chỉ tồn tại trong một lượt làm bài, mất khi bạn làm lại đề mới.

**Upload file Word ngay trên điện thoại vẫn dùng được.** Bấm vùng "Kéo thả nhiều file" rồi chọn file `.docx` từ điện thoại. Lần đầu dùng cần mạng để tải bộ đọc file Word (~600 KB), sau đó dùng offline được.

**GitHub Pages miễn phí vĩnh viễn** với repo công khai: 1 GB dung lượng, 100 GB băng thông/tháng. App của bạn nặng 1 MB — dùng cả đời không hết.
