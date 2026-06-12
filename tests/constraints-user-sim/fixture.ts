// Test dataset cho 150 constraints
// Tạo fixture với 20 giáo viên, 10 lớp, 12 môn, 5 ngày (T2-T6)

import type { AgentInputPayload, NormalizedAssignment } from '../../src/features/timetable/ai/types';

const teacherNames = [
  'Hiếu', 'Long', 'Dung', 'Mai', 'Tuấn', 'Lan', 'Hoa', 'Minh', 'Quân', 'Nam',
  'Phương', 'Trang', 'Bình', 'Cường', 'Đạt', 'Khánh', 'Thảo', 'Nhung', 'Toàn', 'Vân'
];

const classNames = ['6A', '6B', '7A', '7B', '8A', '8B', '9A', '9B', '10A', '10B'];

const subjectNames = [
  'Toán', 'Văn', 'Anh', 'Lý', 'Hóa', 'Sinh', 'Sử', 'Địa', 'GDCD', 'Thể dục', 'Tin học', 'Công nghệ'
];

const days = [
  { id: 'monday', label: 'Thứ 2' },
  { id: 'tuesday', label: 'Thứ 3' },
  { id: 'wednesday', label: 'Thứ 4' },
  { id: 'thursday', label: 'Thứ 5' },
  { id: 'friday', label: 'Thứ 6' }
];

const sessions = [{ id: 'morning', label: 'Sáng' }, { id: 'afternoon', label: 'Chiều' }];

// Mỗi giáo viên dạy 2 lớp × 2 môn = 4 assignments
const assignments: NormalizedAssignment[] = [];
let asgId = 0;
for (let t = 0; t < teacherNames.length; t++) {
  for (let c = 0; c < 2; c++) {
    for (let s = 0; s < 2; s++) {
      assignments.push({
        id: `asg_${asgId++}`,
        teacher: { id: `t${t}`, label: teacherNames[t] },
        subject: { id: `s${s}`, label: subjectNames[s] },
        class: { id: `c${c}`, label: classNames[c] },
        weeklyPeriods: 3,
      });
    }
  }
}

export const testFixture: AgentInputPayload = {
  days,
  sessions,
  periodCounts: { monday: 6, tuesday: 6, wednesday: 6, thursday: 6, friday: 6 },
  deletedPeriods: {},
  assignments,
  constraints: [],
};

// Danh sách 150 constraints từ file
export const testConstraints: { id: number; text: string; group: string }[] = [
  // NHÓM 1: 1-20
  { id: 1, text: 'Hiếu không dạy thứ 2', group: '1-days' },
  { id: 2, text: 'Long không dạy thứ 6', group: '1-days' },
  { id: 3, text: 'Dung chỉ dạy thứ 4', group: '1-days' },
  { id: 4, text: 'Mai dạy tất cả các ngày trừ thứ 7', group: '1-days' },
  { id: 5, text: 'Tuấn không dạy thứ 3 và thứ 5', group: '1-days' },
  { id: 6, text: 'Lan chỉ dạy thứ 2, thứ 4, thứ 6', group: '1-days' },
  { id: 7, text: 'Hoa không dạy vào các ngày thứ 2, thứ 3', group: '1-days' },
  { id: 8, text: 'Minh dạy từ thứ 2 đến thứ 5', group: '1-days' },
  { id: 9, text: 'Quân không dạy thứ 7', group: '1-days' },
  { id: 10, text: 'Nam chỉ dạy thứ 3 và thứ 5', group: '1-days' },
  { id: 11, text: 'Phương không dạy cuối tuần', group: '1-days' },
  { id: 12, text: 'Trang dạy tất cả các ngày trong tuần', group: '1-days' },
  { id: 13, text: 'Bình không dạy đầu tuần', group: '1-days' },
  { id: 14, text: 'Cường chỉ dạy giữa tuần', group: '1-days' },
  { id: 15, text: 'Đạt không dạy thứ 4', group: '1-days' },
  { id: 16, text: 'Khánh dạy ít nhất 3 ngày trong tuần', group: '1-days' },
  { id: 17, text: 'Thảo không dạy quá 2 ngày trong tuần', group: '1-days' },
  { id: 18, text: 'Nhung dạy đúng 4 ngày trong tuần', group: '1-days' },
  { id: 19, text: 'Toàn không dạy vào thứ 2 và thứ 6', group: '1-days' },
  { id: 20, text: 'Vân chỉ dạy 1 ngày trong tuần', group: '1-days' },
  // NHÓM 2: 21-40
  { id: 21, text: 'Hiếu chỉ dạy tiết 1', group: '2-periods' },
  { id: 22, text: 'Long không dạy tiết 5', group: '2-periods' },
  { id: 23, text: 'Dung dạy từ tiết 1 đến tiết 3', group: '2-periods' },
  { id: 24, text: 'Mai chỉ dạy các tiết buổi sáng', group: '2-periods' },
  { id: 25, text: 'Tuấn không dạy tiết cuối cùng', group: '2-periods' },
  { id: 26, text: 'Lan dạy tiết 2 và tiết 4', group: '2-periods' },
  { id: 27, text: 'Hoa không dạy tiết 1 và tiết 5', group: '2-periods' },
  { id: 28, text: 'Minh chỉ dạy tiết buổi chiều', group: '2-periods' },
  { id: 29, text: 'Quân dạy tiết 3', group: '2-periods' },
  { id: 30, text: 'Nam không dạy tiết đầu tiên', group: '2-periods' },
  { id: 31, text: 'Phương chỉ dạy tiết 1, 2, 3', group: '2-periods' },
  { id: 32, text: 'Trang không dạy tiết 4', group: '2-periods' },
  { id: 33, text: 'Bình dạy tối đa 2 tiết mỗi ngày', group: '2-periods' },
  { id: 34, text: 'Cường dạy ít nhất 3 tiết mỗi ngày', group: '2-periods' },
  { id: 35, text: 'Đạt chỉ dạy 1 tiết mỗi ngày', group: '2-periods' },
  { id: 36, text: 'Khánh không dạy quá 4 tiết mỗi ngày', group: '2-periods' },
  { id: 37, text: 'Thảo dạy đúng 2 tiết mỗi ngày', group: '2-periods' },
  { id: 38, text: 'Nhung chỉ dạy các tiết lẻ', group: '2-periods' },
  { id: 39, text: 'Toàn chỉ dạy các tiết chẵn', group: '2-periods' },
  { id: 40, text: 'Vân không dạy tiết 2 và tiết 3', group: '2-periods' },
  // NHÓM 3: 41-60
  { id: 41, text: 'Hiếu dạy thứ 2 tiết 1', group: '3-day-period' },
  { id: 42, text: 'Long không dạy thứ 3 tiết 5', group: '3-day-period' },
  { id: 43, text: 'Dung chỉ dạy thứ 4 tiết 1 và thứ 5', group: '3-day-period' },
  { id: 44, text: 'Mai dạy thứ 6 tiết 2 hoặc tiết 3', group: '3-day-period' },
  { id: 45, text: 'Tuấn không dạy thứ 2 tiết 4', group: '3-day-period' },
  { id: 46, text: 'Lan dạy thứ 3 tiết 1, 2, 3', group: '3-day-period' },
  { id: 47, text: 'Hoa chỉ dạy thứ 5 tiết buổi sáng', group: '3-day-period' },
  { id: 48, text: 'Minh không dạy thứ 4 tiết 5', group: '3-day-period' },
  { id: 49, text: 'Quân dạy thứ 7 tiết 1 và tiết 2', group: '3-day-period' },
  { id: 50, text: 'Nam chỉ dạy thứ 2 tiết 3', group: '3-day-period' },
  { id: 51, text: 'Phương không dạy thứ 6 các tiết buổi chiều', group: '3-day-period' },
  { id: 52, text: 'Trang dạy thứ 4 từ tiết 1 đến tiết 3', group: '3-day-period' },
  { id: 53, text: 'Bình chỉ dạy thứ 3 tiết 4', group: '3-day-period' },
  { id: 54, text: 'Cường không dạy thứ 5 tiết 1, 2', group: '3-day-period' },
  { id: 55, text: 'Đạt dạy thứ 2 tiết 5', group: '3-day-period' },
  { id: 56, text: 'Khánh chỉ dạy thứ 6 tiết 2 và thứ 7 tiết 3', group: '3-day-period' },
  { id: 57, text: 'Thảo không dạy thứ 4 tiết buổi sáng', group: '3-day-period' },
  { id: 58, text: 'Nhung dạy thứ 3 tiết lẻ', group: '3-day-period' },
  { id: 59, text: 'Toàn chỉ dạy thứ 5 tiết chẵn', group: '3-day-period' },
  { id: 60, text: 'Vân không dạy thứ 2 tiết 1 và thứ 6 tiết 5', group: '3-day-period' },
  // NHÓM 4: 61-80
  { id: 61, text: 'Nếu Hiếu dạy thứ 2 thì Long không dạy thứ 2', group: '4-if-then-simple' },
  { id: 62, text: 'Nếu Long dạy tiết 1 thì Dung không dạy tiết 1', group: '4-if-then-simple' },
  { id: 63, text: 'Nếu Dung dạy thứ 3 thì Mai phải dạy thứ 4', group: '4-if-then-simple' },
  { id: 64, text: 'Nếu Mai không dạy thứ 5 thì Tuấn phải dạy thứ 5', group: '4-if-then-simple' },
  { id: 65, text: 'Nếu Tuấn dạy tiết 2 thì Lan dạy tiết 3', group: '4-if-then-simple' },
  { id: 66, text: 'Nếu Lan dạy thứ 2 thì Hoa không dạy thứ 2', group: '4-if-then-simple' },
  { id: 67, text: 'Nếu Hoa dạy tiết 4 thì Minh không dạy tiết 4', group: '4-if-then-simple' },
  { id: 68, text: 'Nếu Minh dạy thứ 6 thì Quân dạy thứ 7', group: '4-if-then-simple' },
  { id: 69, text: 'Nếu Quân không dạy tiết 1 thì Nam dạy tiết 1', group: '4-if-then-simple' },
  { id: 70, text: 'Nếu Nam dạy thứ 3 thì Phương không dạy thứ 4', group: '4-if-then-simple' },
  { id: 71, text: 'Nếu Phương dạy tiết 5 thì Trang dạy tiết 5', group: '4-if-then-simple' },
  { id: 72, text: 'Nếu Trang không dạy thứ 2 thì Bình phải dạy thứ 2', group: '4-if-then-simple' },
  { id: 73, text: 'Nếu Bình dạy tiết 3 thì Cường không dạy tiết 3', group: '4-if-then-simple' },
  { id: 74, text: 'Nếu Cường dạy thứ 4 thì Đạt phải dạy thứ 5', group: '4-if-then-simple' },
  { id: 75, text: 'Nếu Đạt không dạy tiết 2 thì Khánh dạy tiết 2', group: '4-if-then-simple' },
  { id: 76, text: 'Nếu Khánh dạy thứ 6 thì Thảo không dạy thứ 6', group: '4-if-then-simple' },
  { id: 77, text: 'Nếu Thảo dạy tiết 1 thì Nhung phải dạy tiết 2', group: '4-if-then-simple' },
  { id: 78, text: 'Nếu Nhung không dạy thứ 7 thì Toàn dạy thứ 7', group: '4-if-then-simple' },
  { id: 79, text: 'Nếu Toàn dạy tiết 4 thì Vân không dạy tiết 4', group: '4-if-then-simple' },
  { id: 80, text: 'Nếu Vân dạy thứ 3 thì Hiếu phải dạy thứ 3', group: '4-if-then-simple' },
  // NHÓM 5: 81-100
  { id: 81, text: 'Nếu Hiếu dạy thứ 2 và dạy tiết 1 thì Long không dạy thứ 3', group: '5-if-then-complex' },
  { id: 82, text: 'Nếu Long dạy thứ 4 tiết 2 thì Dung phải dạy thứ 5 tiết 2', group: '5-if-then-complex' },
  { id: 83, text: 'Nếu Dung không dạy thứ 6 hoặc không dạy tiết 3 thì Mai dạy thứ 6 tiết 3', group: '5-if-then-complex' },
  { id: 84, text: 'Nếu Mai dạy thứ 2 tiết 1 và tiết 2 thì Tuấn không dạy thứ 2', group: '5-if-then-complex' },
  { id: 85, text: 'Nếu Tuấn dạy thứ 3 hoặc thứ 4 thì Lan phải dạy tiết 5', group: '5-if-then-complex' },
  { id: 86, text: 'Nếu Lan không dạy thứ 5 tiết 1 thì Hoa dạy thứ 5 tiết 1 hoặc tiết 2', group: '5-if-then-complex' },
  { id: 87, text: 'Nếu Hoa dạy thứ 6 và Minh dạy thứ 6 thì Quân không dạy thứ 7', group: '5-if-then-complex' },
  { id: 88, text: 'Nếu Minh dạy tiết 3 hoặc tiết 4 thì Nam không dạy các tiết này', group: '5-if-then-complex' },
  { id: 89, text: 'Nếu Quân dạy thứ 2 tiết 1 thì Nam dạy thứ 2 tiết 2 và Phương dạy thứ 2 tiết 3', group: '5-if-then-complex' },
  { id: 90, text: 'Nếu Nam không dạy thứ 3 và không dạy thứ 4 thì Phương phải dạy cả 2 ngày này', group: '5-if-then-complex' },
  { id: 91, text: 'Nếu Phương dạy thứ 5 tiết buổi sáng thì Trang không dạy thứ 5', group: '5-if-then-complex' },
  { id: 92, text: 'Nếu Trang dạy thứ 6 hoặc thứ 7 thì Bình phải dạy ít nhất 1 trong 2 ngày này', group: '5-if-then-complex' },
  { id: 93, text: 'Nếu Bình dạy tiết 1, 2, 3 vào thứ 2 thì Cường không dạy thứ 2', group: '5-if-then-complex' },
  { id: 94, text: 'Nếu Cường không dạy thứ 3 tiết 4 thì Đạt phải dạy thứ 3 tiết 4 hoặc thứ 4 tiết 4', group: '5-if-then-complex' },
  { id: 95, text: 'Nếu Đạt dạy thứ 4 và thứ 5 thì Khánh chỉ dạy thứ 6 hoặc thứ 7', group: '5-if-then-complex' },
  { id: 96, text: 'Nếu Khánh dạy tiết 5 vào bất kỳ ngày nào thì Thảo không dạy tiết 5 ngày đó', group: '5-if-then-complex' },
  { id: 97, text: 'Nếu Thảo không dạy thứ 2, thứ 3, thứ 4 thì Nhung phải dạy ít nhất 2 trong 3 ngày này', group: '5-if-then-complex' },
  { id: 98, text: 'Nếu Nhung dạy thứ 5 tiết lẻ thì Toàn dạy thứ 5 tiết chẵn', group: '5-if-then-complex' },
  { id: 99, text: 'Nếu Toàn dạy thứ 6 và Vân dạy thứ 6 thì ít nhất 1 người phải dạy tiết 1', group: '5-if-then-complex' },
  { id: 100, text: 'Nếu Vân không dạy thứ 7 tiết 5 thì Hiếu và Long phải dạy thứ 7', group: '5-if-then-complex' },
  // NHÓM 6: 101-120
  { id: 101, text: 'Hiếu và Long không dạy cùng tiết', group: '6-order-distance' },
  { id: 102, text: 'Dung phải dạy sau Mai trong cùng ngày', group: '6-order-distance' },
  { id: 103, text: 'Tuấn dạy trước Lan ít nhất 1 tiết', group: '6-order-distance' },
  { id: 104, text: 'Hoa và Minh không dạy liên tiếp', group: '6-order-distance' },
  { id: 105, text: 'Quân dạy ngay sau Nam trong tuần', group: '6-order-distance' },
  { id: 106, text: 'Phương phải dạy cách Trang ít nhất 1 ngày', group: '6-order-distance' },
  { id: 107, text: 'Bình và Cường không dạy cùng ngày', group: '6-order-distance' },
  { id: 108, text: 'Đạt dạy trước Khánh ít nhất 2 tiết', group: '6-order-distance' },
  { id: 109, text: 'Thảo phải dạy ngay sau Nhung', group: '6-order-distance' },
  { id: 110, text: 'Toàn và Vân cách nhau đúng 1 tiết', group: '6-order-distance' },
  { id: 111, text: 'Hiếu dạy sau Long ít nhất 1 ngày', group: '6-order-distance' },
  { id: 112, text: 'Dung không dạy liền kề với Mai', group: '6-order-distance' },
  { id: 113, text: 'Tuấn và Lan cách nhau đúng 2 tiết', group: '6-order-distance' },
  { id: 114, text: 'Hoa dạy trước Minh trong tuần', group: '6-order-distance' },
  { id: 115, text: 'Quân phải dạy cách Nam đúng 1 ngày', group: '6-order-distance' },
  { id: 116, text: 'Phương không dạy ngay trước hoặc ngay sau Trang', group: '6-order-distance' },
  { id: 117, text: 'Bình dạy sau Cường ít nhất 3 tiết', group: '6-order-distance' },
  { id: 118, text: 'Đạt và Khánh không dạy các tiết liên tiếp', group: '6-order-distance' },
  { id: 119, text: 'Thảo dạy trước Nhung đúng 1 ngày', group: '6-order-distance' },
  { id: 120, text: 'Toàn phải dạy cách Vân ít nhất 2 ngày', group: '6-order-distance' },
  // NHÓM 7: 121-140
  { id: 121, text: 'Hiếu dạy đúng 5 tiết trong tuần', group: '7-frequency' },
  { id: 122, text: 'Long dạy ít nhất 8 tiết trong tuần', group: '7-frequency' },
  { id: 123, text: 'Dung không dạy quá 6 tiết trong tuần', group: '7-frequency' },
  { id: 124, text: 'Mai dạy từ 4 đến 7 tiết trong tuần', group: '7-frequency' },
  { id: 125, text: 'Tuấn dạy đúng 2 tiết mỗi ngày trong 3 ngày', group: '7-frequency' },
  { id: 126, text: 'Lan dạy tối đa 10 tiết trong tuần', group: '7-frequency' },
  { id: 127, text: 'Hoa dạy ít nhất 1 tiết mỗi ngày', group: '7-frequency' },
  { id: 128, text: 'Minh không dạy quá 3 tiết mỗi ngày', group: '7-frequency' },
  { id: 129, text: 'Quân dạy đúng 12 tiết trong tuần', group: '7-frequency' },
  { id: 130, text: 'Nam dạy từ 6 đến 9 tiết trong tuần', group: '7-frequency' },
  { id: 131, text: 'Phương dạy nhiều hơn Trang ít nhất 2 tiết', group: '7-frequency' },
  { id: 132, text: 'Trang dạy ít hơn Bình tối đa 3 tiết', group: '7-frequency' },
  { id: 133, text: 'Bình và Cường dạy tổng cộng 15 tiết', group: '7-frequency' },
  { id: 134, text: 'Đạt dạy gấp đôi số tiết của Khánh', group: '7-frequency' },
  { id: 135, text: 'Khánh dạy bằng số tiết của Thảo', group: '7-frequency' },
  { id: 136, text: 'Thảo dạy nhiều hơn Nhung đúng 4 tiết', group: '7-frequency' },
  { id: 137, text: 'Nhung và Toàn dạy tổng cộng không quá 10 tiết', group: '7-frequency' },
  { id: 138, text: 'Vân dạy ít nhất 50% số tiết của Hiếu', group: '7-frequency' },
  { id: 139, text: 'Toàn dạy nhiều nhất trong tuần', group: '7-frequency' },
  { id: 140, text: 'Long và Dung dạy tổng cộng ít nhất 16 tiết', group: '7-frequency' },
  // NHÓM 8: 141-150
  { id: 141, text: 'Nếu Hiếu dạy thứ 2 tiết 1 và Long dạy thứ 2 tiết 2 thì Dung không dạy thứ 2 và Mai phải dạy thứ 3 tiết 1', group: '8-multi-cond' },
  { id: 142, text: 'Nếu Tuấn dạy ít nhất 3 tiết vào thứ 4 thì Lan không dạy thứ 4 và Hoa phải dạy thứ 5 từ tiết 1 đến tiết 3', group: '8-multi-cond' },
  { id: 143, text: 'Nếu Minh không dạy thứ 6 hoặc Quân dạy thứ 6 tiết 5 thì Nam dạy thứ 7 tiết 1 và Phương dạy thứ 7 tiết 2', group: '8-multi-cond' },
  { id: 144, text: 'Nếu Trang dạy thứ 3 tiết lẻ và Bình dạy thứ 3 tiết chẵn thì Cường không dạy thứ 3, thứ 4 và phải dạy thứ 5', group: '8-multi-cond' },
  { id: 145, text: 'Nếu Đạt dạy nhiều hơn 8 tiết trong tuần thì Khánh dạy ít hơn 5 tiết và Thảo không dạy thứ 2, thứ 4', group: '8-multi-cond' },
  { id: 146, text: 'Nếu Nhung dạy thứ 2 và thứ 4 cùng tiết thì Toàn phải dạy thứ 3 và thứ 5 cùng tiết đó và Vân không dạy tiết đó', group: '8-multi-cond' },
  { id: 147, text: 'Nếu Hiếu và Long cùng dạy thứ 6 thì Dung dạy thứ 7 tiết 1, Mai dạy thứ 7 tiết 2 và Tuấn không dạy thứ 7', group: '8-multi-cond' },
  { id: 148, text: 'Nếu Lan dạy từ tiết 1 đến tiết 4 vào thứ 2 thì Hoa, Minh, Quân không dạy thứ 2 và ít nhất 2 người phải dạy thứ 3', group: '8-multi-cond' },
  { id: 149, text: 'Nếu Nam dạy thứ 4 tiết 3 hoặc Phương dạy thứ 5 tiết 3 thì Trang dạy cả thứ 4 và thứ 5 tiết 4 và Bình không dạy tiết 3, tiết 4', group: '8-multi-cond' },
  { id: 150, text: 'Nếu Cường không dạy thứ 2, thứ 3 và Đạt dạy cả 2 ngày này thì Khánh dạy thứ 4 từ tiết 1 đến tiết 5 và Thảo, Nhung không dạy thứ 4', group: '8-multi-cond' },
];
