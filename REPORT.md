# BÁO CÁO TEST 150 CONSTRAINTS - Vai trò: Người dùng thật

**Ngày test:** 2026-06-12
**AI model:** deepseek/deepseek-v3-flash (OpenRouter)
**Test fixture:** 80 assignments, 5 days (T2-T6), 6 periods/day

## Tổng quan

| Metric | Count | % |
|---|---|---|
| Tổng constraints test | 150 | 100% |
| **PASS** (rule + AI cho ra spec hợp lệ) | 103 | 68.7% |
| **PARTIAL** (cần user feedback/custom_dsl) | 47 | 31.3% |
| **FAIL** (không parse được) | 0 | 0.0% |
| Rule parser HIGH confidence (fast-path, không gọi AI) | 30 | 20.0% |

## Phân tích theo nhóm

| Nhóm | Mô tả | Pass | Partial | Fail | Tỷ lệ Pass |
|---|---|---|---|---|---|
| 1-days | Cơ bản về ngày | 13 | 7 | 0 | 65% |
| 2-periods | Cơ bản về tiết | 15 | 5 | 0 | 75% |
| 3-day-period | Kết hợp ngày + tiết | 14 | 6 | 0 | 70% |
| 4-if-then-simple | IF/THEN đơn giản | 17 | 3 | 0 | 85% |
| 5-if-then-complex | IF/THEN phức tạp | 20 | 0 | 0 | 100% |
| 6-order-distance | Khoảng cách / thứ tự | 7 | 13 | 0 | 35% |
| 7-frequency | Tần suất / tổng số | 7 | 13 | 0 | 35% |
| 8-multi-cond | Multi-condition phức tạp | 10 | 0 | 0 | 100% |

## Chi tiết từng constraint

### Nhóm 1-days: Cơ bản về ngày

| # | Input | Rule Conf | Source | Final Conf | #Specs | Custom DSL | Status | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| 1 | Hiếu không dạy thứ 2 | high | rule | high | 1 | - | ✅ PASS | - |
| 2 | Long không dạy thứ 6 | high | rule | high | 1 | - | ✅ PASS | - |
| 3 | Dung chỉ dạy thứ 4 | medium | translator | medium | 4 | - | ✅ PASS | - |
| 4 | Mai dạy tất cả các ngày trừ thứ 7 | low | translator | medium | 1 | Có | ⚠️ PARTIAL | - |
| 5 | Tuấn không dạy thứ 3 và thứ 5 | medium | translator | medium | 2 | - | ✅ PASS | - |
| 6 | Lan chỉ dạy thứ 2, thứ 4, thứ 6 | medium | translator | medium | 2 | - | ✅ PASS | - |
| 7 | Hoa không dạy vào các ngày thứ 2, thứ 3 | medium | translator | medium | 2 | - | ✅ PASS | - |
| 8 | Minh dạy từ thứ 2 đến thứ 5 | low | translator | medium | 1 | Có | ⚠️ PARTIAL | - |
| 9 | Quân không dạy thứ 7 | low | translator | medium | 1 | Có | ⚠️ PARTIAL | - |
| 10 | Nam chỉ dạy thứ 3 và thứ 5 | medium | translator | medium | 3 | - | ✅ PASS | - |
| 11 | Phương không dạy cuối tuần | medium | translator | medium | 3 | - | ✅ PASS | - |
| 12 | Trang dạy tất cả các ngày trong tuần | low | translator | medium | 1 | Có | ⚠️ PARTIAL | - |
| 13 | Bình không dạy đầu tuần | medium | translator | medium | 3 | - | ✅ PASS | - |
| 14 | Cường chỉ dạy giữa tuần | medium | translator | medium | 4 | - | ✅ PASS | - |
| 15 | Đạt không dạy thứ 4 | high | rule | high | 1 | - | ✅ PASS | - |
| 16 | Khánh dạy ít nhất 3 ngày trong tuần | medium | translator | medium | 1 | - | ✅ PASS | - |
| 17 | Thảo không dạy quá 2 ngày trong tuần | low | translator | medium | 1 | Có | ⚠️ PARTIAL | - |
| 18 | Nhung dạy đúng 4 ngày trong tuần | low | translator | medium | 1 | Có | ⚠️ PARTIAL | - |
| 19 | Toàn không dạy vào thứ 2 và thứ 6 | medium | translator | medium | 2 | - | ✅ PASS | - |
| 20 | Vân chỉ dạy 1 ngày trong tuần | low | translator | medium | 1 | Có | ⚠️ PARTIAL | - |

### Nhóm 2-periods: Cơ bản về tiết

| # | Input | Rule Conf | Source | Final Conf | #Specs | Custom DSL | Status | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| 21 | Hiếu chỉ dạy tiết 1 | medium | translator | medium | 5 | - | ✅ PASS | - |
| 22 | Long không dạy tiết 5 | medium | translator | medium | 1 | - | ✅ PASS | - |
| 23 | Dung dạy từ tiết 1 đến tiết 3 | medium | translator | medium | 3 | - | ✅ PASS | - |
| 24 | Mai chỉ dạy các tiết buổi sáng | medium | translator | medium | 3 | - | ✅ PASS | - |
| 25 | Tuấn không dạy tiết cuối cùng | medium | translator | medium | 1 | - | ✅ PASS | - |
| 26 | Lan dạy tiết 2 và tiết 4 | low | translator | medium | 1 | Có | ⚠️ PARTIAL | - |
| 27 | Hoa không dạy tiết 1 và tiết 5 | medium | translator | medium | 2 | - | ✅ PASS | - |
| 28 | Minh chỉ dạy tiết buổi chiều | medium | translator | medium | 3 | - | ✅ PASS | - |
| 29 | Quân dạy tiết 3 | low | translator | medium | 1 | Có | ⚠️ PARTIAL | - |
| 30 | Nam không dạy tiết đầu tiên | low | translator | medium | 1 | Có | ⚠️ PARTIAL | - |
| 31 | Phương chỉ dạy tiết 1, 2, 3 | medium | translator | medium | 5 | - | ✅ PASS | - |
| 32 | Trang không dạy tiết 4 | medium | translator | medium | 1 | - | ✅ PASS | - |
| 33 | Bình dạy tối đa 2 tiết mỗi ngày | medium | translator | medium | 1 | - | ✅ PASS | - |
| 34 | Cường dạy ít nhất 3 tiết mỗi ngày | medium | translator | medium | 1 | - | ✅ PASS | - |
| 35 | Đạt chỉ dạy 1 tiết mỗi ngày | low | translator | medium | 1 | Có | ⚠️ PARTIAL | - |
| 36 | Khánh không dạy quá 4 tiết mỗi ngày | low | translator | medium | 1 | Có | ⚠️ PARTIAL | - |
| 37 | Thảo dạy đúng 2 tiết mỗi ngày | medium | translator | medium | 1 | - | ✅ PASS | - |
| 38 | Nhung chỉ dạy các tiết lẻ | medium | translator | medium | 3 | - | ✅ PASS | - |
| 39 | Toàn chỉ dạy các tiết chẵn | medium | translator | medium | 3 | - | ✅ PASS | - |
| 40 | Vân không dạy tiết 2 và tiết 3 | medium | translator | medium | 2 | - | ✅ PASS | - |

### Nhóm 3-day-period: Kết hợp ngày + tiết

| # | Input | Rule Conf | Source | Final Conf | #Specs | Custom DSL | Status | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| 41 | Hiếu dạy thứ 2 tiết 1 | low | translator | medium | 1 | Có | ⚠️ PARTIAL | - |
| 42 | Long không dạy thứ 3 tiết 5 | medium | translator | medium | 1 | - | ✅ PASS | - |
| 43 | Dung chỉ dạy thứ 4 tiết 1 và thứ 5 | medium | translator | medium | 5 | - | ✅ PASS | - |
| 44 | Mai dạy thứ 6 tiết 2 hoặc tiết 3 | low | translator | medium | 1 | Có | ⚠️ PARTIAL | - |
| 45 | Tuấn không dạy thứ 2 tiết 4 | medium | translator | medium | 1 | - | ✅ PASS | - |
| 46 | Lan dạy thứ 3 tiết 1, 2, 3 | low | translator | medium | 1 | Có | ⚠️ PARTIAL | - |
| 47 | Hoa chỉ dạy thứ 5 tiết buổi sáng | medium | translator | medium | 16 | - | ✅ PASS | - |
| 48 | Minh không dạy thứ 4 tiết 5 | medium | translator | medium | 1 | - | ✅ PASS | - |
| 49 | Quân dạy thứ 7 tiết 1 và tiết 2 | low | translator | medium | 1 | Có | ⚠️ PARTIAL | - |
| 50 | Nam chỉ dạy thứ 2 tiết 3 | medium | translator | medium | 5 | - | ✅ PASS | - |
| 51 | Phương không dạy thứ 6 các tiết buổi chiều | medium | translator | medium | 3 | - | ✅ PASS | - |
| 52 | Trang dạy thứ 4 từ tiết 1 đến tiết 3 | medium | translator | medium | 3 | - | ✅ PASS | - |
| 53 | Bình chỉ dạy thứ 3 tiết 4 | medium | translator | medium | 5 | - | ✅ PASS | - |
| 54 | Cường không dạy thứ 5 tiết 1, 2 | medium | translator | medium | 1 | - | ✅ PASS | - |
| 55 | Đạt dạy thứ 2 tiết 5 | low | translator | medium | 1 | Có | ⚠️ PARTIAL | - |
| 56 | Khánh chỉ dạy thứ 6 tiết 2 và thứ 7 tiết 3 | medium | translator | medium | 4 | - | ✅ PASS | - |
| 57 | Thảo không dạy thứ 4 tiết buổi sáng | medium | translator | medium | 3 | - | ✅ PASS | - |
| 58 | Nhung dạy thứ 3 tiết lẻ | low | translator | medium | 1 | Có | ⚠️ PARTIAL | - |
| 59 | Toàn chỉ dạy thứ 5 tiết chẵn | medium | translator | medium | 3 | - | ✅ PASS | - |
| 60 | Vân không dạy thứ 2 tiết 1 và thứ 6 tiết 5 | medium | translator | medium | 1 | - | ✅ PASS | - |

### Nhóm 4-if-then-simple: IF/THEN đơn giản

| # | Input | Rule Conf | Source | Final Conf | #Specs | Custom DSL | Status | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| 61 | Nếu Hiếu dạy thứ 2 thì Long không dạy thứ 2 | high | rule | high | 1 | - | ✅ PASS | - |
| 62 | Nếu Long dạy tiết 1 thì Dung không dạy tiết 1 | medium | translator | medium | 1 | - | ✅ PASS | - |
| 63 | Nếu Dung dạy thứ 3 thì Mai phải dạy thứ 4 | high | rule | high | 1 | - | ✅ PASS | - |
| 64 | Nếu Mai không dạy thứ 5 thì Tuấn phải dạy thứ 5 | high | rule | high | 1 | - | ✅ PASS | - |
| 65 | Nếu Tuấn dạy tiết 2 thì Lan dạy tiết 3 | medium | translator | medium | 4 | - | ✅ PASS | - |
| 66 | Nếu Lan dạy thứ 2 thì Hoa không dạy thứ 2 | high | rule | high | 1 | - | ✅ PASS | - |
| 67 | Nếu Hoa dạy tiết 4 thì Minh không dạy tiết 4 | medium | translator | medium | 1 | - | ✅ PASS | - |
| 68 | Nếu Minh dạy thứ 6 thì Quân dạy thứ 7 | medium | translator | low | 1 | - | ✅ PASS | - |
| 69 | Nếu Quân không dạy tiết 1 thì Nam dạy tiết 1 | medium | translator | medium | 1 | - | ✅ PASS | - |
| 70 | Nếu Nam dạy thứ 3 thì Phương không dạy thứ 4 | high | rule | high | 1 | - | ✅ PASS | - |
| 71 | Nếu Phương dạy tiết 5 thì Trang dạy tiết 5 | low | translator | medium | 1 | Có | ⚠️ PARTIAL | - |
| 72 | Nếu Trang không dạy thứ 2 thì Bình phải dạy thứ 2 | high | rule | high | 1 | - | ✅ PASS | - |
| 73 | Nếu Bình dạy tiết 3 thì Cường không dạy tiết 3 | medium | translator | medium | 1 | - | ✅ PASS | - |
| 74 | Nếu Cường dạy thứ 4 thì Đạt phải dạy thứ 5 | high | rule | high | 1 | - | ✅ PASS | - |
| 75 | Nếu Đạt không dạy tiết 2 thì Khánh dạy tiết 2 | medium | translator | medium | 1 | - | ✅ PASS | - |
| 76 | Nếu Khánh dạy thứ 6 thì Thảo không dạy thứ 6 | high | rule | high | 1 | - | ✅ PASS | - |
| 77 | Nếu Thảo dạy tiết 1 thì Nhung phải dạy tiết 2 | low | translator | medium | 1 | Có | ⚠️ PARTIAL | - |
| 78 | Nếu Nhung không dạy thứ 7 thì Toàn dạy thứ 7 | low | translator | medium | 1 | Có | ⚠️ PARTIAL | - |
| 79 | Nếu Toàn dạy tiết 4 thì Vân không dạy tiết 4 | medium | translator | medium | 1 | - | ✅ PASS | - |
| 80 | Nếu Vân dạy thứ 3 thì Hiếu phải dạy thứ 3 | high | rule | high | 1 | - | ✅ PASS | - |

### Nhóm 5-if-then-complex: IF/THEN phức tạp

| # | Input | Rule Conf | Source | Final Conf | #Specs | Custom DSL | Status | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| 81 | Nếu Hiếu dạy thứ 2 và dạy tiết 1 thì Long không dạy thứ 3 | high | rule | high | 1 | - | ✅ PASS | - |
| 82 | Nếu Long dạy thứ 4 tiết 2 thì Dung phải dạy thứ 5 tiết 2 | high | rule | high | 1 | - | ✅ PASS | - |
| 83 | Nếu Dung không dạy thứ 6 hoặc không dạy tiết 3 thì Mai dạy t | high | rule | high | 1 | - | ✅ PASS | - |
| 84 | Nếu Mai dạy thứ 2 tiết 1 và tiết 2 thì Tuấn không dạy thứ 2 | high | rule | high | 1 | - | ✅ PASS | - |
| 85 | Nếu Tuấn dạy thứ 3 hoặc thứ 4 thì Lan phải dạy tiết 5 | medium | translator | low | 1 | - | ✅ PASS | - |
| 86 | Nếu Lan không dạy thứ 5 tiết 1 thì Hoa dạy thứ 5 tiết 1 hoặc | high | rule | high | 1 | - | ✅ PASS | - |
| 87 | Nếu Hoa dạy thứ 6 và Minh dạy thứ 6 thì Quân không dạy thứ 7 | medium | translator | low | 1 | - | ✅ PASS | - |
| 88 | Nếu Minh dạy tiết 3 hoặc tiết 4 thì Nam không dạy các tiết n | medium | translator | medium | 2 | - | ✅ PASS | - |
| 89 | Nếu Quân dạy thứ 2 tiết 1 thì Nam dạy thứ 2 tiết 2 và Phương | high | rule | high | 1 | - | ✅ PASS | - |
| 90 | Nếu Nam không dạy thứ 3 và không dạy thứ 4 thì Phương phải d | medium | translator | low | 1 | - | ✅ PASS | - |
| 91 | Nếu Phương dạy thứ 5 tiết buổi sáng thì Trang không dạy thứ  | high | rule | high | 1 | - | ✅ PASS | - |
| 92 | Nếu Trang dạy thứ 6 hoặc thứ 7 thì Bình phải dạy ít nhất 1 t | medium | translator | low | 1 | - | ✅ PASS | - |
| 93 | Nếu Bình dạy tiết 1, 2, 3 vào thứ 2 thì Cường không dạy thứ  | high | rule | high | 1 | - | ✅ PASS | - |
| 94 | Nếu Cường không dạy thứ 3 tiết 4 thì Đạt phải dạy thứ 3 tiết | high | rule | high | 1 | - | ✅ PASS | - |
| 95 | Nếu Đạt dạy thứ 4 và thứ 5 thì Khánh chỉ dạy thứ 6 hoặc thứ  | high | rule | high | 1 | - | ✅ PASS | - |
| 96 | Nếu Khánh dạy tiết 5 vào bất kỳ ngày nào thì Thảo không dạy  | medium | translator | medium | 1 | - | ✅ PASS | - |
| 97 | Nếu Thảo không dạy thứ 2, thứ 3, thứ 4 thì Nhung phải dạy ít | medium | translator | low | 1 | - | ✅ PASS | - |
| 98 | Nếu Nhung dạy thứ 5 tiết lẻ thì Toàn dạy thứ 5 tiết chẵn | high | rule | high | 1 | - | ✅ PASS | - |
| 99 | Nếu Toàn dạy thứ 6 và Vân dạy thứ 6 thì ít nhất 1 người phải | medium | translator | medium | 1 | - | ✅ PASS | - |
| 100 | Nếu Vân không dạy thứ 7 tiết 5 thì Hiếu và Long phải dạy thứ | low | translator | medium | 1 | - | ✅ PASS | - |

### Nhóm 6-order-distance: Khoảng cách / thứ tự

| # | Input | Rule Conf | Source | Final Conf | #Specs | Custom DSL | Status | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| 101 | Hiếu và Long không dạy cùng tiết | medium | translator | medium | 1 | - | ✅ PASS | - |
| 102 | Dung phải dạy sau Mai trong cùng ngày | low | translator | medium | 1 | Có | ⚠️ PARTIAL | - |
| 103 | Tuấn dạy trước Lan ít nhất 1 tiết | low | translator | medium | 1 | Có | ⚠️ PARTIAL | - |
| 104 | Hoa và Minh không dạy liên tiếp | low | translator | medium | 1 | Có | ⚠️ PARTIAL | - |
| 105 | Quân dạy ngay sau Nam trong tuần | low | translator | medium | 1 | Có | ⚠️ PARTIAL | - |
| 106 | Phương phải dạy cách Trang ít nhất 1 ngày | medium | translator | medium | 1 | - | ✅ PASS | - |
| 107 | Bình và Cường không dạy cùng ngày | medium | translator | medium | 1 | - | ✅ PASS | - |
| 108 | Đạt dạy trước Khánh ít nhất 2 tiết | low | translator | medium | 1 | Có | ⚠️ PARTIAL | - |
| 109 | Thảo phải dạy ngay sau Nhung | low | translator | medium | 1 | Có | ⚠️ PARTIAL | - |
| 110 | Toàn và Vân cách nhau đúng 1 tiết | medium | translator | medium | 1 | - | ✅ PASS | - |
| 111 | Hiếu dạy sau Long ít nhất 1 ngày | medium | translator | medium | 1 | - | ✅ PASS | - |
| 112 | Dung không dạy liền kề với Mai | low | translator | medium | 1 | Có | ⚠️ PARTIAL | - |
| 113 | Tuấn và Lan cách nhau đúng 2 tiết | medium | translator | medium | 1 | - | ✅ PASS | - |
| 114 | Hoa dạy trước Minh trong tuần | low | translator | medium | 1 | Có | ⚠️ PARTIAL | - |
| 115 | Quân phải dạy cách Nam đúng 1 ngày | low | translator | medium | 1 | Có | ⚠️ PARTIAL | - |
| 116 | Phương không dạy ngay trước hoặc ngay sau Trang | low | translator | medium | 1 | Có | ⚠️ PARTIAL | - |
| 117 | Bình dạy sau Cường ít nhất 3 tiết | low | translator | medium | 1 | Có | ⚠️ PARTIAL | - |
| 118 | Đạt và Khánh không dạy các tiết liên tiếp | low | translator | medium | 1 | Có | ⚠️ PARTIAL | - |
| 119 | Thảo dạy trước Nhung đúng 1 ngày | low | translator | medium | 1 | Có | ⚠️ PARTIAL | - |
| 120 | Toàn phải dạy cách Vân ít nhất 2 ngày | medium | translator | medium | 1 | - | ✅ PASS | - |

### Nhóm 7-frequency: Tần suất / tổng số

| # | Input | Rule Conf | Source | Final Conf | #Specs | Custom DSL | Status | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| 121 | Hiếu dạy đúng 5 tiết trong tuần | medium | translator | medium | 1 | - | ✅ PASS | - |
| 122 | Long dạy ít nhất 8 tiết trong tuần | low | translator | medium | 1 | Có | ⚠️ PARTIAL | - |
| 123 | Dung không dạy quá 6 tiết trong tuần | low | translator | medium | 1 | Có | ⚠️ PARTIAL | - |
| 124 | Mai dạy từ 4 đến 7 tiết trong tuần | low | translator | medium | 1 | Có | ⚠️ PARTIAL | - |
| 125 | Tuấn dạy đúng 2 tiết mỗi ngày trong 3 ngày | medium | translator | medium | 1 | - | ✅ PASS | - |
| 126 | Lan dạy tối đa 10 tiết trong tuần | medium | translator | medium | 1 | - | ✅ PASS | - |
| 127 | Hoa dạy ít nhất 1 tiết mỗi ngày | medium | translator | medium | 1 | - | ✅ PASS | - |
| 128 | Minh không dạy quá 3 tiết mỗi ngày | medium | translator | medium | 1 | - | ✅ PASS | - |
| 129 | Quân dạy đúng 12 tiết trong tuần | medium | translator | medium | 1 | - | ✅ PASS | - |
| 130 | Nam dạy từ 6 đến 9 tiết trong tuần | low | translator | medium | 1 | Có | ⚠️ PARTIAL | - |
| 131 | Phương dạy nhiều hơn Trang ít nhất 2 tiết | low | translator | medium | 1 | Có | ⚠️ PARTIAL | - |
| 132 | Trang dạy ít hơn Bình tối đa 3 tiết | low | translator | medium | 1 | Có | ⚠️ PARTIAL | - |
| 133 | Bình và Cường dạy tổng cộng 15 tiết | low | translator | medium | 1 | Có | ⚠️ PARTIAL | - |
| 134 | Đạt dạy gấp đôi số tiết của Khánh | low | translator | medium | 1 | Có | ⚠️ PARTIAL | - |
| 135 | Khánh dạy bằng số tiết của Thảo | low | translator | medium | 1 | Có | ⚠️ PARTIAL | - |
| 136 | Thảo dạy nhiều hơn Nhung đúng 4 tiết | medium | translator | medium | 1 | - | ✅ PASS | - |
| 137 | Nhung và Toàn dạy tổng cộng không quá 10 tiết | low | translator | medium | 1 | Có | ⚠️ PARTIAL | - |
| 138 | Vân dạy ít nhất 50% số tiết của Hiếu | low | translator | medium | 1 | Có | ⚠️ PARTIAL | - |
| 139 | Toàn dạy nhiều nhất trong tuần | low | translator | medium | 1 | Có | ⚠️ PARTIAL | - |
| 140 | Long và Dung dạy tổng cộng ít nhất 16 tiết | low | translator | medium | 1 | Có | ⚠️ PARTIAL | - |

### Nhóm 8-multi-cond: Multi-condition phức tạp

| # | Input | Rule Conf | Source | Final Conf | #Specs | Custom DSL | Status | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| 141 | Nếu Hiếu dạy thứ 2 tiết 1 và Long dạy thứ 2 tiết 2 thì Dung  | high | rule | high | 1 | - | ✅ PASS | - |
| 142 | Nếu Tuấn dạy ít nhất 3 tiết vào thứ 4 thì Lan không dạy thứ  | high | rule | high | 1 | - | ✅ PASS | - |
| 143 | Nếu Minh không dạy thứ 6 hoặc Quân dạy thứ 6 tiết 5 thì Nam  | medium | translator | low | 1 | - | ✅ PASS | - |
| 144 | Nếu Trang dạy thứ 3 tiết lẻ và Bình dạy thứ 3 tiết chẵn thì  | high | rule | high | 1 | - | ✅ PASS | - |
| 145 | Nếu Đạt dạy nhiều hơn 8 tiết trong tuần thì Khánh dạy ít hơn | medium | translator | medium | 2 | - | ✅ PASS | - |
| 146 | Nếu Nhung dạy thứ 2 và thứ 4 cùng tiết thì Toàn phải dạy thứ | high | rule | low | 1 | - | ✅ PASS | - |
| 147 | Nếu Hiếu và Long cùng dạy thứ 6 thì Dung dạy thứ 7 tiết 1, M | medium | translator | low | 1 | - | ✅ PASS | - |
| 148 | Nếu Lan dạy từ tiết 1 đến tiết 4 vào thứ 2 thì Hoa, Minh, Qu | high | rule | low | 1 | - | ✅ PASS | - |
| 149 | Nếu Nam dạy thứ 4 tiết 3 hoặc Phương dạy thứ 5 tiết 3 thì Tr | high | rule | high | 1 | - | ✅ PASS | - |
| 150 | Nếu Cường không dạy thứ 2, thứ 3 và Đạt dạy cả 2 ngày này th | high | rule | high | 1 | - | ✅ PASS | - |

## Nhận xét và khuyến nghị

### Điểm mạnh
- LLM fallback hoạt động cho các constraints phức tạp hơn (nhóm 5, 7, 8).

### Điểm cần cải thiện
- 47 constraints cần user feedback. Ví dụ điển hình:
  - #4: "Mai dạy tất cả các ngày trừ thứ 7" → translator (1 specs)
  - #8: "Minh dạy từ thứ 2 đến thứ 5" → translator (1 specs)
  - #9: "Quân không dạy thứ 7" → translator (1 specs)
  - #12: "Trang dạy tất cả các ngày trong tuần" → translator (1 specs)
  - #17: "Thảo không dạy quá 2 ngày trong tuần" → translator (1 specs)
  - #18: "Nhung dạy đúng 4 ngày trong tuần" → translator (1 specs)
  - #20: "Vân chỉ dạy 1 ngày trong tuần" → translator (1 specs)
  - #26: "Lan dạy tiết 2 và tiết 4" → translator (1 specs)
  - #29: "Quân dạy tiết 3" → translator (1 specs)
  - #30: "Nam không dạy tiết đầu tiên" → translator (1 specs)
- Multi-condition (nhóm 8): cần xử lý tốt hơn các IF với nhiều branches AND/OR phức tạp.
- Frequency/range (nhóm 7): cần parser nhận diện "ít nhất", "tối đa", "đúng", "từ X đến Y".

## Kết luận

Với 150 constraints đa dạng, hệ thống đạt **68.7%** tỷ lệ pass (không cần user feedback). Kết hợp rule parser + LLM (deepseek/deepseek-v4-flash) cho kết quả khả quan. Các constraints còn lại (47 partial, 0 fail) thuộc nhóm phức tạp và cần user feedback hoặc custom DSL.
