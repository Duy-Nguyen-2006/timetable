#!/usr/bin/env python3
import re
from collections import defaultdict

def parse_datasets(filename):
    with open(filename, 'r', encoding='utf-8') as f:
        content = f.read()

    datasets = []
    dataset_blocks = content.strip().split('DATASET ')

    for i, block in enumerate(dataset_blocks[1:], 1):
        lines = block.strip().split('\n')
        dataset = {
            'id': i,
            'days': '',
            'time': '',
            'max_periods': 0,
            'teachers': [],
            'subjects': [],
            'classes': [],
            'assignments': [],
            'hard_constraints': [],
            'soft_constraints': []
        }

        current_section = None

        for line in lines:
            line = line.strip()
            if not line:
                continue

            if line.startswith('Days:'):
                dataset['days'] = line.replace('Days:', '').strip()
            elif line.startswith('Time:'):
                dataset['time'] = line.replace('Time:', '').strip()
            elif line.startswith('Max periods:'):
                dataset['max_periods'] = int(line.replace('Max periods:', '').strip())
            elif line == 'Teachers:':
                current_section = 'teachers'
            elif line == 'Subjects:':
                current_section = 'subjects'
            elif line == 'Classes:':
                current_section = 'classes'
            elif line == 'Assignments:':
                current_section = 'assignments'
            elif line == 'Hard constraints:':
                current_section = 'hard_constraints'
            elif line == 'Soft constraints:':
                current_section = 'soft_constraints'
            else:
                if current_section:
                    if current_section in ['teachers', 'subjects', 'classes']:
                        dataset[current_section].append(line)
                    else:
                        dataset[current_section].append(line)

        datasets.append(dataset)

    return datasets

def validate_dataset(dataset):
    errors = []
    warnings = []

    ds_id = dataset['id']

    # 1. Check basic info
    if not dataset['days']:
        errors.append(f"DS{ds_id}: Missing days information")
    if not dataset['time']:
        errors.append(f"DS{ds_id}: Missing time information")
    if dataset['max_periods'] <= 0:
        errors.append(f"DS{ds_id}: Invalid max_periods")

    # 2. Check lists not empty
    if not dataset['teachers']:
        errors.append(f"DS{ds_id}: No teachers defined")
    if not dataset['subjects']:
        errors.append(f"DS{ds_id}: No subjects defined")
    if not dataset['classes']:
        errors.append(f"DS{ds_id}: No classes defined")
    if not dataset['assignments']:
        errors.append(f"DS{ds_id}: No assignments defined")

    # 3. Calculate expected periods
    num_classes = len(dataset['classes'])
    num_days = 5  # Mon-Fri
    max_periods = dataset['max_periods']
    expected_total = num_classes * num_days * max_periods

    # 4. Validate assignments format and sum
    assignment_total = 0
    class_periods = defaultdict(int)
    teacher_assignments = defaultdict(list)

    for assignment in dataset['assignments']:
        parts = assignment.split('-')
        if len(parts) != 4:
            errors.append(f"DS{ds_id}: Invalid assignment format: {assignment}")
            continue

        teacher, subject, cls, periods_str = parts
        try:
            periods = int(periods_str)
        except ValueError:
            errors.append(f"DS{ds_id}: Invalid periods in assignment: {assignment}")
            continue

        if teacher not in dataset['teachers']:
            errors.append(f"DS{ds_id}: Teacher '{teacher}' not in teacher list")
        if subject not in dataset['subjects']:
            errors.append(f"DS{ds_id}: Subject '{subject}' not in subject list")
        if cls not in dataset['classes']:
            errors.append(f"DS{ds_id}: Class '{cls}' not in class list")
        if periods <= 0:
            errors.append(f"DS{ds_id}: Non-positive periods in assignment: {assignment}")

        assignment_total += periods
        class_periods[cls] += periods
        teacher_assignments[teacher].append((subject, cls, periods))

    # 5. Check periods per class
    for cls in dataset['classes']:
        if cls not in class_periods:
            warnings.append(f"DS{ds_id}: Class '{cls}' has no assignments")
        else:
            periods = class_periods[cls]
            if periods > expected_total / num_classes:
                errors.append(f"DS{ds_id}: Class '{cls}' has {periods} periods, exceeds max {expected_total / num_classes}")

    # 6. Check total assignment matches expected
    if assignment_total != expected_total:
        errors.append(f"DS{ds_id}: Total periods {assignment_total} != expected {expected_total}")
    else:
        warnings.append(f"DS{ds_id}: ✓ Total periods correct ({assignment_total})")

    # 7. Check teacher workload
    for teacher in dataset['teachers']:
        if teacher not in teacher_assignments:
            warnings.append(f"DS{ds_id}: Teacher '{teacher}' has no assignments")
        else:
            total = sum(periods for _, _, periods in teacher_assignments[teacher])
            if total > expected_total:
                errors.append(f"DS{ds_id}: Teacher '{teacher}' overloaded ({total} periods)")

    # 8. Check constraints exist
    if not dataset['hard_constraints']:
        warnings.append(f"DS{ds_id}: No hard constraints defined")
    if not dataset['soft_constraints']:
        warnings.append(f"DS{ds_id}: No soft constraints defined")

    return errors, warnings

def print_report(datasets):
    print("\n" + "="*70)
    print("DATASET VALIDATION REPORT")
    print("="*70 + "\n")

    total_errors = 0
    total_warnings = 0

    for dataset in datasets:
        errors, warnings = validate_dataset(dataset)

        total_errors += len(errors)
        total_warnings += len(warnings)

        ds_id = dataset['id']
        num_classes = len(dataset['classes'])
        num_teachers = len(dataset['teachers'])
        num_subjects = len(dataset['subjects'])
        num_assignments = len(dataset['assignments'])

        print(f"DATASET {ds_id}")
        print(f"  Days: {dataset['days']}")
        print(f"  Time: {dataset['time']}")
        print(f"  Max periods/day: {dataset['max_periods']}")
        print(f"  Classes: {num_classes} ({', '.join(dataset['classes'])})")
        print(f"  Teachers: {num_teachers}")
        print(f"  Subjects: {num_subjects}")
        print(f"  Assignments: {num_assignments}")

        if errors:
            print(f"  ERRORS ({len(errors)}):")
            for error in errors:
                print(f"    ✗ {error}")

        if warnings:
            print(f"  WARNINGS ({len(warnings)}):")
            for warning in warnings:
                print(f"    ⚠ {warning}")

        if not errors and not warnings:
            print(f"  ✓ VALID")

        print()

    print("="*70)
    print(f"SUMMARY: {total_errors} errors, {total_warnings} warnings")
    print("="*70 + "\n")

    return total_errors == 0

if __name__ == '__main__':
    try:
        datasets = parse_datasets('/home/user/timetable/datasets.txt')
        print(f"Loaded {len(datasets)} datasets")

        all_valid = print_report(datasets)

        if all_valid:
            print("✓ ALL DATASETS PASSED VALIDATION\n")
            exit(0)
        else:
            print("✗ SOME DATASETS HAVE ERRORS\n")
            exit(1)
    except Exception as e:
        print(f"ERROR: {e}")
        import traceback
        traceback.print_exc()
        exit(2)
