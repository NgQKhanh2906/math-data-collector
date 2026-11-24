# Math Ink Collector

Ứng dụng web bảng trắng thu thập dữ liệu chữ viết tay biểu thức toán học phục vụ huấn luyện mô hình AI (Image-to-Expression / OCR). Người dùng có thể vẽ bằng chuột, trackpad, bút cảm ứng hoặc ngón tay trên điện thoại, sau đó gửi ảnh PNG nền trắng chuẩn `1200 x 500 px` kèm nhãn biểu thức trực tiếp vào Google Drive và Google Sheet.

## Tính năng chính

- **Bảng vẽ nền trắng chuẩn dữ liệu train AI:** Hỗ trợ 3 màu mực bắt buộc (Đen `#111111`, Xanh biển `#1D4ED8`, Đỏ `#DC2626`), tùy chỉnh cỡ ngòi từ `2 px` đến `24 px` kèm 3 mức nhanh (`Mảnh 3px`, `Vừa 6px`, `Đậm 12px`).
- **Công cụ chỉnh sửa đầy đủ:** Bút viết, Tẩy nét, Hoàn tác (`Ctrl+Z`), Làm lại (`Ctrl+Y`), Dòng kẻ căn chữ (chỉ hiển thị khi vẽ, không dính vào ảnh xuất), Xóa bảng.
- **2 chế độ thu thập nhãn (Ground Truth):**
  - **Đề bài gợi ý:** Tự động sinh biểu thức đa dạng (cơ bản `+ - * /`, số thập phân, ngoặc đơn, lũy thừa, căn bậc hai, phương trình bậc 1/2) để người dùng chép lại, đảm bảo nhãn sạch 100%.
  - **Viết tự do:** Người dùng tự viết biểu thức bất kỳ và nhập nhãn tương ứng (có nút chèn nhanh ký tự toán học hoặc tùy chọn lưu tạm không nhãn để gán sau).
- **Đồng bộ Google Drive & Google Sheet:** Tự động lưu từng ảnh `math_YYYYMMDD_HHmmss_<id>.png` vào thư mục Google Drive và ghi thêm 1 dòng log vào Google Sheet `Math_Dataset_Labels` (xử lý an toàn các nhãn bắt đầu bằng `=`, `+`, `-`).
- **Hoạt động đa thiết bị:** Thiết kế responsive, hỗ trợ Pointer Events và khóa cuộn trang (`touch-action: none`) trên màn hình cảm ứng.

## Cấu trúc thư mục

```text
math-data-collector/
├── .gitignore
├── index.html          # Giao diện chính của bảng vẽ và thanh công cụ
├── styles.css          # CSS tối giản, responsive cho desktop và mobile
├── config.js           # Cấu hình URL Google Apps Script Web App và kích thước ảnh
├── prompts.js          # Bộ sinh ngẫu nhiên biểu thức toán học chuẩn ASCII
├── app.js              # Logic vẽ Vector Strokes, xuất PNG và gửi POST request
├── README.md           # Tài liệu hướng dẫn cấu hình và triển khai
└── apps-script/
    └── Code.gs         # Mã nguồn Google Apps Script cầu nối Drive và Google Sheet
```

---

## Bước 1: Cấu hình Google Apps Script kết nối Google Drive

Để đẩy được ảnh vào thư mục Google Drive cá nhân (`1EJpOyHiLZC5NbozPsghEwcYTZoLa3z4_`) mà không gặp lỗi giới hạn dung lượng của Service Account và không lo hết hạn OAuth token sau 7 ngày, dự án sử dụng Google Apps Script Web App chạy dưới quyền chính chủ tài khoản của bạn.

1. Truy cập [https://script.google.com](https://script.google.com) bằng tài khoản Google có quyền **Chỉnh sửa (Editor)** hoặc **Chủ sở hữu (Owner)** đối với thư mục Google Drive đích.
2. Nhấn **Dự án mới (New project)**.
3. Xóa toàn bộ mã mặc định trong file `Code.gs`, sao chép toàn bộ nội dung từ file `apps-script/Code.gs` trong dự án này và dán vào.
4. Nhấn **Lưu (Save)** (`Ctrl+S`), đặt tên dự án là `Math Ink Collector API`.
5. Trên thanh công cụ phía trên vùng code, chọn hàm **`testSetup`** ở ô danh sách hàm rồi nhấn **Chạy (Run)**.
6. Khi hộp thoại **Yêu cầu cấp quyền (Authorization required)** hiện lên:
   - Chọn **Xem lại quyền (Review permissions)** -> chọn tài khoản Google của bạn.
   - Nếu xuất hiện màn hình cảnh báo *"Google hasn't verified this app"*, nhấn **Nâng cao (Advanced)** -> chọn **Go to Math Ink Collector API (unsafe)** -> nhấn **Cho phép (Allow)**.
   - Quan sát **Nhật ký thực thi (Execution log)**: nếu hiển thị thông báo kết nối thành công thư mục Drive và đường dẫn file Google Sheet `Math_Dataset_Labels` nghĩa là đã cấp quyền thành công.
7. Chọn **Triển khai (Deploy)** -> **Tùy chọn triển khai mới (New deployment)**.
8. Nhấn biểu tượng bánh răng bên cạnh *Chọn loại (Select type)* -> chọn **Ứng dụng web (Web app)**:
   - **Mô tả (Description):** `Math Ink Collector v1`
   - **Thực thi dưới tên (Execute as):** `Tôi (Me)`
   - **Ai có quyền truy cập (Who has access):** `Bất kỳ ai (Anyone)` *(bắt buộc chọn mục này để người đóng góp dữ liệu mở link web lên là gửi được ngay không cần đăng nhập).*
9. Nhấn **Triển khai (Deploy)** và sao chép **URL ứng dụng web (Web app URL)** (có dạng `https://script.google.com/macros/s/.../exec`).
10. Mở file `config.js` trong thư mục `math-data-collector`, thay giá trị `PASTE_YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE` ở dòng `APPS_SCRIPT_URL` bằng URL vừa sao chép.

> **Lưu ý quan trọng:** Nếu bạn có bất kỳ chỉnh sửa nào trong `Code.gs` trên Google Apps Script về sau (ví dụ đổi `SHARED_SECRET` hoặc `TARGET_FOLDER_ID`), bạn bắt buộc phải vào **Deploy -> Manage deployments -> nhấn biểu tượng cây bút (Edit) -> mục Version chọn New version -> Deploy**. Nếu chỉ nhấn Save mà không tạo New version, Web App vẫn chạy phiên bản code cũ.

---

## Bước 2: Tạo GitHub Repository và đẩy code lên

1. Đăng nhập GitHub và truy cập [https://github.com/new](https://github.com/new).
2. Đặt tên repository là `math-data-collector`, chọn chế độ **Public** (nếu dùng GitHub Pages miễn phí; với Vercel có thể dùng Public hoặc Private). Không tích chọn tạo sẵn `README.md` hay `.gitignore` vì thư mục code đã có đầy đủ. Nhấn **Create repository**.
3. Mở terminal (PowerShell hoặc Command Prompt) tại thư mục `math-data-collector` và chạy lần lượt các lệnh sau:

```bash
git init
git add .
git commit -m "feat: initialize math ink collector web app"
git branch -M main
git remote add origin https://github.com/<TEN_GITHUB_CUA_BAN>/math-data-collector.git
git push -u origin main
```

*(Thay `<TEN_GITHUB_CUA_BAN>` bằng username GitHub của bạn).*

---

## Bước 3: Deploy miễn phí

### Lựa chọn 1: GitHub Pages (Nhanh gọn, miễn phí 100%)

1. Vào repository `math-data-collector` trên GitHub -> chọn tab **Settings**.
2. Ở menu bên trái, chọn **Pages**.
3. Tại mục **Build and deployment**:
   - **Source:** chọn `Deploy from a branch`.
   - **Branch:** chọn `main`, thư mục `/ (root)` -> nhấn **Save**.
4. Chờ khoảng 1 - 2 phút rồi tải lại trang Settings -> Pages, bạn sẽ nhận được đường link public dạng:
   `https://<TEN_GITHUB_CUA_BAN>.github.io/math-data-collector/`

### Lựa chọn 2: Vercel (Triển khai tức thì sau mỗi lần push)

1. Truy cập [https://vercel.com](https://vercel.com) và đăng nhập bằng tài khoản GitHub.
2. Nhấn **Add New...** -> **Project**.
3. Tìm và nhấn **Import** bên cạnh repository `math-data-collector`.
4. Ở phần cấu hình:
   - **Framework Preset:** giữ nguyên `Other`.
   - **Build Command** và **Output Directory:** để mặc định.
5. Nhấn **Deploy**. Sau khoảng 20 - 30 giây, Vercel sẽ cấp một tên miền `.vercel.app` để bạn chia sẻ ngay cho mọi người cùng vẽ.

---

## Bước 4: Thu hoạch dữ liệu để train AI

Sau khi thu thập đủ dữ liệu, bạn mở thư mục Google Drive đích (`1EJpOyHiLZC5NbozPsghEwcYTZoLa3z4_`):

1. Mở file Google Sheet **`Math_Dataset_Labels`** -> chọn **File -> Download -> Comma Separated Values (.csv)** và lưu thành `labels.csv`.
2. Chọn các ảnh PNG trong thư mục (hoặc tải cả thư mục về máy) và giải nén vào thư mục `images/`.
3. Đọc cặp ảnh và nhãn trong Python:

```python
import csv
from pathlib import Path
from PIL import Image

images_dir = Path("images")
samples = []

with open("labels.csv", mode="r", encoding="utf-8") as f:
    reader = csv.DictReader(f)
    for row in reader:
        img_path = images_dir / row["file_name"]
        label = row["label"]
        if img_path.exists() and label:
            samples.append((img_path, label))

print(f"Tong so mau hop le: {len(samples)}")
if samples:
    sample_img = Image.open(samples[0][0])
    print("Kich thuoc anh:", sample_img.size, "| Nhan:", samples[0][1])
```

---

## Xử lý sự cố thường gặp (Troubleshooting)

1. **Báo lỗi `Exception: No item with the given ID could be found` hoặc `Access denied`:**
   - Kiểm tra xem tài khoản Google dùng để deploy Apps Script có quyền truy cập và ghi vào thư mục `1EJpOyHiLZC5NbozPsghEwcYTZoLa3z4_` hay chưa.
   - Đảm bảo bạn đã chạy hàm `testSetup()` trong Apps Script Editor ít nhất 1 lần để hoàn tất cấp quyền Drive và Sheets.

2. **Báo lỗi CORS hoặc `Failed to fetch` khi bấm Lưu & Gửi dữ liệu:**
   - Kiểm tra mục **Who has access** khi Deploy Apps Script đã được đặt thành **Anyone** chưa.
   - Kiểm tra URL dán trong `config.js` có phải là Web App URL kết thúc bằng `/exec` (không phải URL chỉnh sửa `/edit` trên thanh địa chỉ trình duyệt).

3. **Đã sửa `Code.gs` (như đổi `SHARED_SECRET` hoặc `TARGET_FOLDER_ID`) nhưng web vẫn báo lỗi cũ:**
   - Bạn chưa tạo phiên bản deploy mới. Hãy vào **Deploy -> Manage deployments -> Edit -> chọn New version -> Deploy**.
   - Đảm bảo `SHARED_SECRET` trong `config.js` và `apps-script/Code.gs` giống hệt nhau.

4. **Trang web hiện cảnh báo vàng *"Chưa gắn URL Google Apps Script trong config.js"*:**
   - Kiểm tra lại file `config.js` xem `APPS_SCRIPT_URL` đã được thay bằng link `https://script.google.com/macros/s/.../exec` hay chưa, sau đó đẩy commit mới lên GitHub để hệ thống deploy cập nhật.
