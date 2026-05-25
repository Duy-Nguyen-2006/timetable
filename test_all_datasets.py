#!/usr/bin/env python3
"""Full integration test for all 6 datasets using tool-calling approach."""
import json, sys, os, subprocess, tempfile, urllib.request, re, time

API_KEY = "lpr_4sGk0witr0lgsG1Ahh8ivzVVBB8Go1GGF6BF5OUc9OE"
BASE_URL = "https://api.lowprizo.com/v1"
MODEL = "devstral-latest"
REPO_DIR = "/tmp/timetable"

with open(f'{REPO_DIR}/python/timetable_solver/base_solver_template.py') as f: base_tpl = f.read()
with open(f'{REPO_DIR}/python/timetable_solver/template_solver.py') as f: ref_solver = f.read()

SYSTEM_PROMPT = f"""You are a coding agent that writes Python OR-Tools CP-SAT solver code for timetable scheduling.
You MUST use the submit_solver_code tool to submit your Python code.
If execution fails, fix and resubmit.

## BASE TEMPLATE (timetable_solver.base_solver_template)
```python
{base_tpl}
```

## REFERENCE SOLVER (timetable_solver.template_solver)
```python
{ref_solver}
```

## RULES: Import from timetable_solver.base_solver_template. Define solve_timetable(problem). Use solve_base_model(problem, extra_setup=fn). Include ALL helpers (_normalize_parsed, _slots, _labels_to_asgs, _force_zero, _sorted_day_slots, _all_slots, _slot_ids_for_day_period, _slot_ids_for_session_day). Handle ALL constraint kinds from the reference solver.
"""

TOOLS = [{"type":"function","function":{"name":"submit_solver_code","description":"Submit solver code",
    "parameters":{"type":"object","properties":{"code":{"type":"string"}},"required":["code"]}}}]

VN_DAY = {"thứ 2":"monday","thứ hai":"monday","thứ 3":"tuesday","thứ ba":"tuesday",
    "thứ 4":"wednesday","thứ tư":"wednesday","thứ 5":"thursday","thứ năm":"thursday",
    "thứ 6":"friday","thứ sáu":"friday","thứ 7":"saturday","chủ nhật":"sunday"}

def extract_days(text):
    t = text.lower()
    # Check compact form "thứ 3 4 5"
    m = re.search(r'thứ\s*([2-7](?:\s+[2-7])+)', t)
    if m:
        num_map = {"2":"monday","3":"tuesday","4":"wednesday","5":"thursday","6":"friday","7":"saturday"}
        return [num_map[n] for n in m.group(1).split() if n in num_map]
    for pat, day_id in VN_DAY.items():
        if pat in t: return [day_id]
    return []

def extract_periods(text):
    t = text.lower()
    r = re.search(r'tiết\s*(\d+)\s*[-–]\s*(\d+)', t)
    if r: return list(range(int(r.group(1)), int(r.group(2))+1))
    singles = re.findall(r'tiết\s*(\d+)', t)
    return [int(p) for p in singles]

def extract_sessions(text):
    t = text.lower()
    s = []
    if 'sáng' in t or 'sang' in t: s.append('morning')
    if 'chiều' in t or 'chieu' in t: s.append('afternoon')
    return s

def match_labels(text, labels):
    t = text.lower()
    return [l for l in sorted(labels, key=len, reverse=True) if l.lower() in t]

def parse_constraint(text, teachers, subjects, classes):
    t = text.lower()
    tl = match_labels(t, teachers)
    sl = match_labels(t, subjects)
    cl = match_labels(t, classes)
    days = extract_days(t)
    periods = extract_periods(t)
    sessions = extract_sessions(t)

    # teacher_max_consecutive
    if ('không dạy quá' in t or 'không quá' in t) and 'liên tiếp' in t:
        m = re.search(r'(\d+)', t)
        mx = int(m.group(1)) if m else 4
        return {"kind":"teacher_max_consecutive","teacherLabels":"*" if 'mỗi' in t else tl,"max":mx}
    # teacher_min_off_days
    if 'ngày nghỉ tối thiểu' in t:
        m = re.search(r'(\d+)', t)
        mn = int(m.group(1)) if m else 1
        return {"kind":"teacher_min_off_days","teacherLabels":"*" if ('mỗi' in t or not tl) else tl,"min":mn}
    # class_daily_subject_any
    if 'mỗi ngày' in t and 'mỗi lớp' in t and sl:
        return {"kind":"class_daily_subject_any","classLabels":"*","subjectLabels":sl}
    # subjects_not_consecutive
    if 'không liên tiếp' in t and len(sl)>=2:
        return {"kind":"subjects_not_consecutive","subjectLabels":sl}
    # teacher block
    if ('không dạy' in t or 'không có lịch' in t) and tl:
        if days and periods: return {"kind":"teacher_block_day_period","teacherLabels":tl,"dayIds":days,"periods":periods}
        if sessions and days: return {"kind":"teacher_block_session_day","teacherLabels":tl,"sessionIds":sessions,"dayIds":days}
        if days: return {"kind":"teacher_block_days","teacherLabels":tl,"dayIds":days}
        if periods: return {"kind":"teacher_block_periods","teacherLabels":tl,"periods":periods}
        if sessions: return {"kind":"teacher_block_sessions","teacherLabels":tl,"sessionIds":sessions}
    # teacher allow only
    if ('chỉ dạy' in t or 'chỉ' in t) and tl:
        if days: return {"kind":"teacher_allow_only_days","teacherLabels":tl,"dayIds":days}
        if sessions: return {"kind":"teacher_allow_only_sessions","teacherLabels":tl,"sessionIds":sessions}
    # subject block periods
    if ('không xếp' in t or ('không' in t and sl)) and sl and periods:
        return {"kind":"subject_block_periods","subjectLabels":sl,"periods":periods}
    # subject_only_sessions (hard)
    if sl and sessions and 'không' not in t and 'nên' not in t:
        if 'buổi' in t or sessions:
            return {"kind":"subject_only_sessions","subjectLabels":sl,"sessionIds":sessions}
    # subject pin periods
    if ('bắt buộc' in t or 'chỉ tiết' in t) and sl and periods:
        return {"kind":"subject_pin_periods","subjectLabels":sl,"periods":periods}
    # subject block consecutive (hard)
    if sl and ('phải block' in t or ('phải' in t and 'block' in t) or ('phải' in t and 'liên tiếp' in t)):
        m = re.search(r'(\d+)', t)
        bs = int(m.group(1)) if m else 2
        return {"kind":"subject_block_consecutive","subjectLabels":sl,"blockSize":bs}
    # soft: subject_prefer_periods
    if sl and periods and ('nên' in t or 'xếp' in t):
        cf = match_labels(t, classes)
        r = {"kind":"subject_prefer_periods","subjectLabels":sl,"periods":periods}
        if cf: r["classFilter"] = cf
        return r
    # soft: subject_prefer_sessions
    if sl and sessions and 'nên' in t:
        return {"kind":"subject_prefer_sessions","subjectLabels":sl,"sessionIds":sessions}
    # soft: subject_block_consecutive
    if sl and 'liên tiếp' in t:
        m = re.search(r'(\d+)', t)
        bs = int(m.group(1)) if m else 2
        return {"kind":"subject_block_consecutive","subjectLabels":sl,"blockSize":bs}
    return {"kind":"unparsed","reason":f"Cannot parse: {text}"}

def build_dataset(ds_id):
    """Parse datasets.txt and return problem for ds_id"""
    with open(f'{REPO_DIR}/datasets.txt') as f: raw = f.read()
    blocks = re.split(r'\n(?=DATASET\s+\d+)', raw)
    for block in blocks:
        m = re.search(r'DATASET\s+(\d+)', block)
        if not m or int(m.group(1))!=ds_id: continue
        lines = [l.strip() for l in block.split('\n') if l.strip()]
        ds = {"days":"","time":"","max_periods":0,"teachers":[],"subjects":[],"classes":[],
              "assignments":[],"hard":[],"soft":[]}
        section=""
        for line in lines:
            if line.startswith("Days:"): ds["days"]=line.replace("Days:","").strip()
            elif line.startswith("Time:"): ds["time"]=line.replace("Time:","").strip()
            elif line.startswith("Max periods:"): ds["max_periods"]=int(line.replace("Max periods:","").strip())
            elif line=="Teachers:": section="teachers"
            elif line=="Subjects:": section="subjects"
            elif line=="Classes:": section="classes"
            elif line=="Assignments:": section="assignments"
            elif line=="Hard constraints:": section="hard"
            elif line=="Soft constraints:": section="soft"
            elif section=="teachers": ds["teachers"].append(line)
            elif section=="subjects": ds["subjects"].append(line)
            elif section=="classes": ds["classes"].append(line)
            elif section=="assignments":
                parts = line.split("-")
                ds["assignments"].append({"teacher":parts[0],"subject":parts[1],"className":parts[2],"weeklyPeriods":int(parts[3])})
            elif section=="hard": ds["hard"].append(line)
            elif section=="soft": ds["soft"].append(line)
        return ds
    return None

def build_problem(ds):
    days_map = [("monday","Thứ 2"),("tuesday","Thứ 3"),("wednesday","Thứ 4"),("thursday","Thứ 5"),("friday","Thứ 6")]
    lt = ds["time"].lower()
    if "morning-afternoon" in lt: sessions_list=[("morning","Sáng"),("afternoon","Chiều")]
    elif "afternoon" in lt: sessions_list=[("afternoon","Chiều")]
    else: sessions_list=[("morning","Sáng")]

    problem = {"slots":[],"assignments":[],"hardConstraints":[],"softConstraints":[],
        "solverConfig":{"maxTimeSeconds":30,"numWorkers":4,"randomSeed":1},
        "parsedHard":[],"parsedSoft":[],
        "meta":{"teacherToAsgIds":{},"classToAsgIds":{},"subjectToAsgIds":{},
                "slotsByDayId":{},"slotsBySessionId":{},"slotsByPeriod":{},
                "slotsByDayPeriod":{},"slotsByDaySession":{}}}

    for day_id, day_label in days_map:
        for ses_id, ses_label in sessions_list:
            for p in range(1, ds["max_periods"]+1):
                sid = f"{day_id}-{ses_id}-{p}"
                problem["slots"].append({"slotId":sid,"dayId":day_id,"dayLabel":day_label,
                    "sessionId":ses_id,"sessionLabel":ses_label,"period":p})
                problem["meta"]["slotsByDayId"].setdefault(day_id,[]).append(sid)
                problem["meta"]["slotsBySessionId"].setdefault(ses_id,[]).append(sid)
                problem["meta"]["slotsByPeriod"].setdefault(str(p),[]).append(sid)
                problem["meta"]["slotsByDayPeriod"].setdefault(f"{day_id}__{p}",[]).append(sid)
                problem["meta"]["slotsByDaySession"].setdefault(f"{day_id}__{ses_id}",[]).append(sid)

    for i, a in enumerate(ds["assignments"]):
        aid = f"asg_{i+1}"
        problem["assignments"].append({"assignmentId":aid,"teacherId":a["teacher"],"teacherLabel":a["teacher"],
            "classId":a["className"],"classLabel":a["className"],"subjectId":a["subject"],"subjectLabel":a["subject"],
            "weeklyPeriods":a["weeklyPeriods"]})
        problem["meta"]["teacherToAsgIds"].setdefault(a["teacher"],[]).append(aid)
        problem["meta"]["classToAsgIds"].setdefault(a["className"],[]).append(aid)
        problem["meta"]["subjectToAsgIds"].setdefault(a["subject"],[]).append(aid)

    for i, text in enumerate(ds["hard"]):
        cid = f"hc_{i+1}"
        parsed = parse_constraint(text, ds["teachers"], ds["subjects"], ds["classes"])
        problem["hardConstraints"].append({"id":cid,"text":text})
        problem["parsedHard"].append({"id":cid,"original":text,"parsed":{"kind":parsed["kind"],**{k:v for k,v in parsed.items() if k!="kind"}}})

    for i, text in enumerate(ds["soft"]):
        cid = f"sc_{i+1}"
        parsed = parse_constraint(text, ds["teachers"], ds["subjects"], ds["classes"])
        problem["softConstraints"].append({"id":cid,"text":text,"weight":5})
        problem["parsedSoft"].append({"id":cid,"original":text,"parsed":{"kind":parsed["kind"],**{k:v for k,v in parsed.items() if k!="kind"}},"weight":5})

    return problem

def call_llm_with_tools(problem, max_iters=3):
    messages = [
        {"role":"system","content":SYSTEM_PROMPT},
        {"role":"user","content":json.dumps({"task":"Generate OR-Tools solver code. Submit via submit_solver_code tool.","problem":problem})}
    ]
    last_code = None
    for iteration in range(max_iters):
        payload = {"model":MODEL,"messages":messages,"tools":TOOLS,
            "tool_choice":{"type":"function","function":{"name":"submit_solver_code"}} if iteration==0 else "auto",
            "temperature":0.2}
        req = urllib.request.Request(f"{BASE_URL}/chat/completions",data=json.dumps(payload).encode(),
            headers={"Content-Type":"application/json","Authorization":f"Bearer {API_KEY}"})
        with urllib.request.urlopen(req, timeout=180) as res:
            result = json.loads(res.read())
        choice = result["choices"][0]
        msg = choice["message"]
        messages.append(msg)
        if not msg.get("tool_calls"): break
        tc = msg["tool_calls"][0]
        code = json.loads(tc["function"]["arguments"])["code"]
        last_code = code
        # Execute
        tmp_dir = tempfile.mkdtemp()
        with open(os.path.join(tmp_dir,"generated_solver.py"),'w') as f: f.write(code)
        env = os.environ.copy()
        env["PYTHONPATH"] = os.path.join(REPO_DIR,"python")
        runner_input = json.dumps({"problem":problem,"solverArtifactPath":os.path.join(tmp_dir,"generated_solver.py"),"entrypoint":"solve_timetable"})
        r = subprocess.run([sys.executable, f"{REPO_DIR}/python/timetable_solver/runner.py"],
            input=runner_input, capture_output=True, text=True, timeout=60, env=env)
        if r.returncode==0 and r.stdout.strip():
            try:
                output = json.loads(r.stdout)
                if output["status"] in ("solved","infeasible"):
                    messages.append({"role":"tool","tool_call_id":tc["id"],
                        "content":json.dumps({"status":"success","solver_status":output["status"]})})
                    return output, last_code
                messages.append({"role":"tool","tool_call_id":tc["id"],
                    "content":json.dumps({"status":"error","error":output.get("message",""),"diagnostics":output.get("diagnostics",[])[:3]})})
            except: messages.append({"role":"tool","tool_call_id":tc["id"],"content":json.dumps({"status":"error","error":r.stdout[:500]})})
        else:
            err = r.stderr[:1000] if r.stderr else "No output"
            messages.append({"role":"tool","tool_call_id":tc["id"],"content":json.dumps({"status":"error","error":err})})
    return None, last_code

def verify_hard(ds, output):
    issues = []
    for text in ds["hard"]:
        t = text.lower()
        tl = match_labels(t, ds["teachers"])
        sl = match_labels(t, ds["subjects"])
        days = extract_days(t)
        periods = extract_periods(t)
        sessions = extract_sessions(t)
        for cell in output.get("cells",[]):
            for entry in cell.get("entries",[]):
                teacher = entry.get("teacher","")
                subject = entry.get("subject","")
                # Teacher block days
                if 'không dạy' in t and tl and days and teacher in tl and cell["dayId"] in days and not periods and not sessions:
                    issues.append(f"{text}: {teacher} teaches on {cell['dayId']}")
                # Teacher block periods
                if 'không dạy' in t and tl and periods and not days and teacher in tl and cell["period"] in periods:
                    issues.append(f"{text}: {teacher} teaches period {cell['period']}")
                # Teacher block day+period
                if 'không dạy' in t and tl and days and periods and teacher in tl and cell["dayId"] in days and cell["period"] in periods:
                    issues.append(f"{text}: {teacher} teaches on {cell['dayId']} period {cell['period']}")
                # Subject block periods
                if 'không xếp' in t and sl and periods and subject in sl and cell["period"] in periods:
                    issues.append(f"{text}: {subject} at period {cell['period']}")
                # Subject only sessions
                if sl and sessions and 'không' not in t and 'nên' not in t and 'buổi' in t and subject in sl and cell.get("sessionId") not in sessions:
                    issues.append(f"{text}: {subject} in wrong session {cell.get('sessionId')}")
    return issues

# ==================== MAIN ====================
results = {}
for ds_id in [1,2,3,4,5,6]:
    print(f"\n{'='*60}")
    print(f"DATASET {ds_id}")
    print(f"{'='*60}")
    ds = build_dataset(ds_id)
    if not ds:
        print(f"  ERROR: Dataset {ds_id} not found!")
        results[ds_id] = "NOT_FOUND"
        continue

    problem = build_problem(ds)
    print(f"  Slots: {len(problem['slots'])}, Assignments: {len(problem['assignments'])}")
    print(f"  Hard: {len(ds['hard'])}, Soft: {len(ds['soft'])}")
    print(f"  Parsed hard kinds: {[p['parsed']['kind'] for p in problem['parsedHard']]}")
    print(f"  Parsed soft kinds: {[p['parsed']['kind'] for p in problem['parsedSoft']]}")

    start = time.time()
    try:
        output, code = call_llm_with_tools(problem)
    except Exception as e:
        print(f"  ERROR: {e}")
        results[ds_id] = f"ERROR: {e}"
        continue
    elapsed = time.time()-start

    if output is None:
        print(f"  FAIL: No output from LLM/sandbox ({elapsed:.1f}s)")
        results[ds_id] = "NO_OUTPUT"
        continue

    status = output["status"]
    cells = output.get("cells",[])
    filled = [c for c in cells if c.get("entries")]
    print(f"  Status: {status} ({elapsed:.1f}s)")
    print(f"  Cells: {len(cells)}, Filled: {len(filled)}")
    print(f"  Message: {output.get('message','')[:100]}")

    if status == "solved":
        # Check assignment coverage
        asg_counts = {}
        for c in cells:
            for e in c.get("entries",[]):
                k = f"{e['teacher']}-{e['subject']}-{e['className']}"
                asg_counts[k] = asg_counts.get(k,0)+1
        all_ok = all(asg_counts.get(f"{a['teacher']}-{a['subject']}-{a['className']}",0)==a["weeklyPeriods"] for a in ds["assignments"])
        print(f"  Assignment coverage: {'OK' if all_ok else 'MISMATCH'}")
        if not all_ok:
            for a in ds["assignments"]:
                k = f"{a['teacher']}-{a['subject']}-{a['className']}"
                actual = asg_counts.get(k,0)
                if actual != a["weeklyPeriods"]:
                    print(f"    {k}: got {actual}, expected {a['weeklyPeriods']}")

        # Check hard constraints
        issues = verify_hard(ds, output)
        if issues:
            print(f"  Hard violations: {len(issues)}")
            for i in issues[:5]: print(f"    [X] {i}")
        else:
            print(f"  Hard constraints: ALL PASS")
        results[ds_id] = f"SOLVED ({'PASS' if all_ok and not issues else 'ISSUES'})"

    elif status == "infeasible":
        print(f"  IIS: {output.get('iisConstraintIds',[])}")
        results[ds_id] = "INFEASIBLE"
    else:
        print(f"  Error: {output.get('diagnostics',[][:3])}")
        results[ds_id] = f"ERROR: {status}"

print(f"\n{'='*60}")
print("SUMMARY")
print(f"{'='*60}")
for ds_id, result in sorted(results.items()):
    expected = "INFEASIBLE" if ds_id==3 else "SOLVED"
    actual_ok = ("SOLVED" in result and "PASS" in result) if ds_id!=3 else ("INFEASIBLE" in result)
    marker = "✓" if actual_ok else "✗"
    print(f"  Dataset {ds_id}: {result} (expected {expected}) [{marker}]")
