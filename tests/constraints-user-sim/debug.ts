// Debug script for specific constraints
import { __translatorInternal } from '../../src/features/timetable/ai/translator';
import { parseConstraint } from '../../src/lib/constraint-parser';
import type { AgentInputPayload, NormalizedAssignment } from '../../src/features/timetable/ai/types';

async function debugOne(text: string) {
  console.log(`\n=== "${text}" ===`);
  const teacherLabels = ['Hiếu', 'Long', 'Dung', 'Mai', 'Tuấn', 'Lan', 'Hoa', 'Minh', 'Quân', 'Nam', 'Phương', 'Trang', 'Bình', 'Cường', 'Đạt', 'Khánh', 'Thảo', 'Nhung', 'Toàn', 'Vân'];
  const classLabels = ['6A', '6B', '7A', '7B', '8A', '8B', '9A', '9B', '10A', '10B'];
  const subjectLabels = ['Toán', 'Văn', 'Anh', 'Lý', 'Hóa', 'Sinh', 'Sử', 'Địa', 'GDCD', 'Thể dục', 'Tin học', 'Công nghệ'];
  const dayIds: Record<string, string> = { monday: 'monday', tuesday: 'tuesday', wednesday: 'wednesday', thursday: 'thursday', friday: 'friday' };
  const sessionIds: Record<string, string> = { morning: 'morning', afternoon: 'afternoon' };

  const parsed = parseConstraint(text, {
    teacherLabels, classLabels, subjectLabels, dayIds, sessionIds,
  });
  console.log(`parseConstraint: kind=${parsed.kind}`);
  if (parsed.kind !== 'unparsed') {
    console.log(`  params: ${JSON.stringify(parsed).substring(0, 200)}`);
  }

  const input: AgentInputPayload = {
    days: [
      { id: 'monday', label: 'Thứ 2' },
      { id: 'tuesday', label: 'Thứ 3' },
      { id: 'wednesday', label: 'Thứ 4' },
      { id: 'thursday', label: 'Thứ 5' },
      { id: 'friday', label: 'Thứ 6' },
    ],
    sessions: [{ id: 'morning', label: 'Sáng' }, { id: 'afternoon', label: 'Chiều' }],
    periodCounts: { monday: 6, tuesday: 6, wednesday: 6, thursday: 6, friday: 6 },
    deletedPeriods: {},
    assignments: (() => {
      const arr: NormalizedAssignment[] = [];
      for (let ti = 0; ti < teacherLabels.length; ti++) {
        for (let ci = 0; ci < 2; ci++) {
          for (let si = 0; si < 2; si++) {
            arr.push({
              id: `asg_${ti}_${ci}_${si}`,
              teacher: { id: `t${ti}`, label: teacherLabels[ti] },
              subject: { id: `s${si}`, label: subjectLabels[si] },
              class: { id: `c${ci}`, label: classLabels[ci] },
              weeklyPeriods: 3,
            });
          }
        }
      }
      return arr;
    })(),
    constraints: [{ type: 'required', text }],
  };
  const specs = __translatorInternal.fallbackFromRuleParser(input);
  console.log(`Specs (${specs.length}):`);
  for (const s of specs) {
    console.log(`  - kind=${s.kind} params=${JSON.stringify(s.params).substring(0, 150)}`);
  }
}

async function main() {
  await debugOne('Phương không dạy thứ 6 các tiết buổi chiều');
  await debugOne('Thảo không dạy thứ 4 tiết buổi sáng');
  await debugOne('Phương không dạy cuối tuần');
  await debugOne('Bình không dạy đầu tuần');
  await debugOne('Cường chỉ dạy giữa tuần');
  await debugOne('Mai dạy tất cả các ngày trừ thứ 7');
  await debugOne('Trang dạy tất cả các ngày trong tuần');
  await debugOne('Quân không dạy thứ 7');
  await debugOne('Minh dạy từ thứ 2 đến thứ 5');
  await debugOne('Dung dạy từ tiết 1 đến tiết 3');
  await debugOne('Tuấn không dạy tiết cuối cùng');
  await debugOne('Nhung chỉ dạy các tiết lẻ');
  await debugOne('Toàn chỉ dạy các tiết chẵn');
  await debugOne('Phương dạy nhiều hơn Trang ít nhất 2 tiết');
  await debugOne('Trang dạy ít hơn Bình tối đa 3 tiết');
  await debugOne('Đạt dạy gấp đôi số tiết của Khánh');
  await debugOne('Khánh dạy bằng số tiết của Thảo');
  await debugOne('Vân dạy ít nhất 50% số tiết của Hiếu');
  await debugOne('Bình và Cường dạy tổng cộng 15 tiết');
  await debugOne('Nhung và Toàn dạy tổng cộng không quá 10 tiết');
  await debugOne('Long và Dung dạy tổng cộng ít nhất 16 tiết');
  await debugOne('Toàn dạy nhiều nhất trong tuần');
  await debugOne('Long dạy đúng tiết 4 vào thứ 3');
  await debugOne('Mai dạy từ 4 đến 7 tiết trong tuần');
  await debugOne('Nam dạy từ 6 đến 9 tiết trong tuần');
  await debugOne('Lan dạy tiết 2 và tiết 4');
  await debugOne('Quân dạy tiết 3');
  await debugOne('Nam không dạy tiết đầu tiên');
  await debugOne('Hiếu dạy thứ 2 tiết 1');
  await debugOne('Mai dạy thứ 6 tiết 2 hoặc tiết 3');
  await debugOne('Lan dạy thứ 3 tiết 1, 2, 3');
  await debugOne('Đạt dạy thứ 2 tiết 5');
  await debugOne('Quân dạy thứ 7 tiết 1 và tiết 2');
  await debugOne('Toàn dạy nhiều nhất trong tuần');
}

main();
