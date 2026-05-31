import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildExhaustionError,
  classifySolverFailureStatus,
  describeSolverFailure,
} from './local-agent-utils';

test('describeSolverFailure returns contextual Vietnamese messages per status', () => {
  assert.match(describeSolverFailure('infeasible'), /ràng buộc quá chặt/);
  assert.match(describeSolverFailure('timeout'), /hết thời gian/i);
  assert.match(describeSolverFailure('crashed'), /lỗi khi chạy mã Python/);
  assert.match(describeSolverFailure('invalid_solver'), /không tạo được solver/i);
  assert.match(describeSolverFailure('empty_schedule'), /không còn tiết học/i);
  assert.match(describeSolverFailure('unknown'), /không tìm được thời khóa biểu/i);
});

test('describeSolverFailure appends detail when provided', () => {
  assert.equal(
    describeSolverFailure('infeasible', 'conflict at slot'),
    'Không có nghiệm vì ràng buộc quá chặt. Chi tiết: conflict at slot'
  );
});

test('classifySolverFailureStatus maps execution statuses', () => {
  assert.equal(classifySolverFailureStatus('infeasible'), 'infeasible');
  assert.equal(classifySolverFailureStatus('timeout'), 'timeout');
  assert.equal(classifySolverFailureStatus('crashed'), 'crashed');
  assert.equal(classifySolverFailureStatus('empty_schedule'), 'empty_schedule');
  assert.equal(classifySolverFailureStatus('feasible'), 'unknown');
  assert.equal(classifySolverFailureStatus(undefined), 'unknown');
});

test('buildExhaustionError keeps actionable digest for crashes but localizes infeasible', () => {
  assert.equal(
    buildExhaustionError('crashed', 'RuntimeError: bad generated code'),
    'Coder could not produce an executable schedule. Last failure: RuntimeError: bad generated code'
  );
  assert.match(buildExhaustionError('infeasible', ''), /ràng buộc quá chặt/);
  assert.match(buildExhaustionError('timeout', ''), /hết thời gian/i);
});
