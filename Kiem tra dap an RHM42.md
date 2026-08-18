# Kiểm tra đáp án đề RHM42 (2018-2019) – Nội Bệnh Lý

Tôi tự làm độc lập cả 60 câu rồi đối chiếu với đáp án đang có sẵn trong file.

| Kết quả | Số câu |
|---|---|
| Đồng ý với đáp án trong file | **57** |
| Không đồng ý / cần xem lại (đã tô vàng) | **3** |
| **Tổng** | **60** |

> Đáp án cũ **được giữ nguyên 100%** – tôi chỉ tô vàng, không sửa câu nào.

---

## 3 câu tô vàng

### Câu 14 — Vị trí đúng khi xoa bóp tim ngoài lồng ngực
- Đáp án trong file: **b. 1/3 dưới xương ức**
- Tôi chọn: **d. 1/2 dưới xương ức**
- Lý do: AHA và ERC đều ghi vị trí ép tim là "lower half of the sternum" = **1/2 dưới xương ức**. Hướng dẫn cấp cứu ngừng tuần hoàn của Bộ Y tế cũng dùng 1/2 dưới xương ức. "1/3 dưới" là cách ghi trong một số giáo trình cũ.
- Ghi chú: các câu hồi sức khác trong bộ đề đều bám sát AHA (câu 34 đề này, RHM43 #33, RHM45 #56, RHM47 #35), nên câu này lệch chuẩn so với phần còn lại.

### Câu 25 — CURB-65 bao nhiêu điểm thì xem xét vào khoa hồi sức
- Đáp án trong file: **b. > 3 điểm** (tức ≥ 4 điểm)
- Tôi chọn: **c. > 2 điểm** (tức ≥ 3 điểm)
- Lý do: phân tầng CURB-65 kinh điển là 0–1 điểm điều trị ngoại trú, 2 điểm nhập viện nội trú, **≥ 3 điểm là viêm phổi nặng → xem xét khoa hồi sức**. Mốc 4–5 điểm là "nguy cơ tử vong rất cao", không phải ngưỡng bắt đầu cân nhắc ICU.

### Câu 47 — Gọi là tăng áp lực tĩnh mạch cửa khi
- Đáp án trong file: **a. áp lực tĩnh mạch cửa > 15 mmHg**
- Tôi phân vân giữa **b** và **d**
- Lý do: chuẩn quốc tế dùng **chênh áp tĩnh mạch gan (HVPG)**: > 5 mmHg là tăng áp cửa, **> 10 mmHg là tăng áp cửa có ý nghĩa lâm sàng** → khớp với phương án b. Việc đề có sẵn phương án **d "a và c đúng"** cho thấy giáo trình gốc nhiều khả năng định nghĩa bằng *cả hai* mốc (>15 mmHg và chênh áp >11 mmHg) → khi đó đáp án phải là d chứ không phải a.
- Đề nghị: đối chiếu lại giáo trình Nội Bệnh Lý của bộ môn để chốt.


---

## Cảnh báo: `run_update.py` đã lỗi thời

Script `run_update.py` chứa bảng đáp án cứng cho RHM42, hiện **lệch 1 câu** so với file:

| Câu | Trong script | Trong file | Đúng |
|---|---|---|---|
| 41 | D (= II) | A (= I) | **A** – mMRC 1 đúng là "khó thở khi đi nhanh trên mặt bằng"; mMRC 2 là "đi chậm hơn người cùng tuổi / phải dừng lại để thở" |

Nếu chạy lại `run_update.py` nguyên trạng thì câu 41 sẽ bị ghi đè ngược lại thành D (sai) và **toàn bộ tô vàng cũng bị xóa** (script quét sạch ký tự ✅ và ghi lại file). Nên cập nhật câu 41 thành `A` trong script, hoặc không chạy lại nữa.
