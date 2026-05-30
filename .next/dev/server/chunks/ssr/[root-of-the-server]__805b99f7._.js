module.exports = [
"[externals]/next/dist/compiled/next-server/app-page-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-page-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[project]/src/features/timetable/ai/budget-guard.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "TokenBudgetGuard",
    ()=>TokenBudgetGuard,
    "estimateTokens",
    ()=>estimateTokens
]);
function estimateTokens(value) {
    if (!value) return 0;
    return Math.ceil(value.length / 2.5);
}
class TokenBudgetGuard {
    capTokens;
    usedTokens;
    constructor(capTokens){
        this.capTokens = capTokens;
        this.usedTokens = 0;
    }
    consumeText(...chunks) {
        const delta = chunks.reduce((sum, chunk)=>sum + estimateTokens(chunk), 0);
        this.usedTokens += delta;
        return this.usedTokens;
    }
    consumeUsage(totalTokens) {
        const value = Number(totalTokens);
        if (!Number.isFinite(value) || value <= 0) {
            return this.usedTokens;
        }
        this.usedTokens += Math.ceil(value);
        return this.usedTokens;
    }
    ensureWithinLimit() {
        if (this.usedTokens > this.capTokens) {
            throw new Error(`Token budget exceeded (${this.usedTokens}/${this.capTokens}).`);
        }
    }
    getUsage() {
        return {
            used: this.usedTokens,
            cap: this.capTokens,
            remaining: Math.max(0, this.capTokens - this.usedTokens)
        };
    }
}
}),
"[project]/src/features/timetable/ai/parse-model-json.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "__parseModelJsonInternal",
    ()=>__parseModelJsonInternal,
    "parseModelJson",
    ()=>parseModelJson
]);
function stripCodeFence(raw) {
    const trimmed = raw.trim();
    const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    return fenced ? fenced[1].trim() : trimmed;
}
function extractFirstJsonObject(raw) {
    const start = raw.indexOf('{');
    if (start < 0) return null;
    let inString = false;
    let escaped = false;
    let depth = 0;
    for(let i = start; i < raw.length; i += 1){
        const char = raw[i];
        if (inString) {
            if (escaped) {
                escaped = false;
            } else if (char === '\\') {
                escaped = true;
            } else if (char === '"') {
                inString = false;
            }
            continue;
        }
        if (char === '"') {
            inString = true;
            continue;
        }
        if (char === '{') depth += 1;
        if (char === '}') {
            depth -= 1;
            if (depth === 0) {
                return raw.slice(start, i + 1);
            }
        }
    }
    return null;
}
function escapeControlCharsInStrings(raw) {
    let inString = false;
    let escaped = false;
    let changed = false;
    let repaired = '';
    for(let i = 0; i < raw.length; i += 1){
        const char = raw[i];
        if (inString) {
            if (escaped) {
                repaired += char;
                escaped = false;
                continue;
            }
            if (char === '\\') {
                repaired += char;
                escaped = true;
                continue;
            }
            if (char === '"') {
                repaired += char;
                inString = false;
                continue;
            }
            if (char === '\n') {
                repaired += '\\n';
                changed = true;
                continue;
            }
            if (char === '\r') {
                repaired += '\\r';
                changed = true;
                continue;
            }
            if (char === '\t') {
                repaired += '\\t';
                changed = true;
                continue;
            }
            if (char.charCodeAt(0) < 0x20) {
                repaired += `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`;
                changed = true;
                continue;
            }
            repaired += char;
            continue;
        }
        if (char === '"') inString = true;
        repaired += char;
    }
    return changed ? repaired : raw;
}
function parseModelJson(content) {
    const raw = stripCodeFence(content ?? '{}');
    const candidates = [
        raw
    ];
    const extracted = extractFirstJsonObject(raw);
    if (extracted && extracted !== raw) candidates.push(extracted);
    const repaired = candidates.map((candidate)=>escapeControlCharsInStrings(candidate)).filter((candidate, index, list)=>candidate !== candidates[index] && list.indexOf(candidate) === index);
    candidates.push(...repaired);
    for (const candidate of candidates){
        try {
            return JSON.parse(candidate);
        } catch  {
        // try next candidate
        }
    }
    const preview = raw.slice(0, 220);
    throw new Error(`Invalid JSON from model response. Preview: ${preview}`);
}
const __parseModelJsonInternal = {
    extractFirstJsonObject,
    stripCodeFence
};
}),
"[project]/src/features/timetable/ai/chat-client.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "invokeChat",
    ()=>invokeChat
]);
async function invokeChat(payload) {
    const { apiKey, ...rest } = payload;
    const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Provider-Key': apiKey
        },
        body: JSON.stringify(rest)
    });
    const body = await response.json().catch(()=>null);
    if (!response.ok || !body?.ok) {
        throw new Error(body?.error || `Chat API failed with status ${response.status}`);
    }
    return {
        content: String(body.content ?? ''),
        usage: body.usage
    };
}
}),
"[project]/src/features/timetable/ai/coder.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "runCoderTurn",
    ()=>runCoderTurn
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__ = __turbopack_context__.i("[project]/node_modules/zod/v4/classic/external.js [app-ssr] (ecmascript) <export * as z>");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$ai$2f$parse$2d$model$2d$json$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/features/timetable/ai/parse-model-json.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$ai$2f$chat$2d$client$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/features/timetable/ai/chat-client.ts [app-ssr] (ecmascript)");
;
;
;
const coderResponseSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].object({
    plan_summary: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string(),
    constraint_code: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string(),
    covered_constraint_ids: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].array(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string()),
    assumptions: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].array(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string())
});
const defaultInvokeChat = (payload)=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$ai$2f$chat$2d$client$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["invokeChat"])(payload);
function isAiCodedSpec(spec) {
    return spec.kind === 'custom_dsl' && spec.severity === 'hard';
}
function loadCoderSystemPrompt() {
    return fetch('/prompts/coder.system.md').then(async (response)=>{
        if (!response.ok) {
            return 'You are a CP-SAT coder. Return strict JSON.';
        }
        return response.text();
    }).catch(()=>'You are a CP-SAT coder. Return strict JSON.');
}
function ensureCoverage(result, specs) {
    const customIds = specs.filter(isAiCodedSpec).map((spec)=>spec.id);
    const hardCustomIds = specs.filter((spec)=>spec.severity === 'hard' && isAiCodedSpec(spec)).map((spec)=>spec.id);
    const customIdSet = new Set(customIds);
    const covered = new Set(result.covered_constraint_ids.filter((id)=>customIdSet.has(id)));
    const assumptions = [
        ...result.assumptions
    ];
    for (const id of hardCustomIds){
        if (covered.has(id)) continue;
        // Dùng word-boundary regex thay vì includes() để tránh false-positive
        // khi id 'c1' trùng với 'c10', 'c12'... (fix bug #15).
        const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const referenceRegex = new RegExp(`(^|[^A-Za-z0-9_])${escaped}([^A-Za-z0-9_]|$)`, 'm');
        if (!referenceRegex.test(result.constraint_code)) {
            throw new Error(`Coder failed to cover hard custom_dsl constraint ${id}: no code reference`);
        }
        covered.add(id);
        assumptions.push(`auto_added_coverage:${id}`);
    }
    return {
        ...result,
        covered_constraint_ids: [
            ...covered
        ],
        assumptions
    };
}
async function runCoderTurn(config, payload, invokeChat = defaultInvokeChat) {
    const customSpecs = payload.dataset.constraints.filter(isAiCodedSpec);
    if (customSpecs.length === 0) {
        return {
            plan_summary: 'No AI-coded constraints. Built-in registry handles all constraints.',
            constraint_code: 'pass',
            covered_constraint_ids: [],
            assumptions: [
                'built_in_registry_handles_non_custom_constraints'
            ]
        };
    }
    const systemPrompt = await loadCoderSystemPrompt();
    const chatPayload = {
        baseURL: config.baseURL || 'https://openrouter.ai/api/v1',
        apiKey: config.apiKey,
        model: config.model,
        messages: [
            {
                role: 'system',
                content: systemPrompt
            },
            {
                role: 'user',
                content: JSON.stringify({
                    datasetDigest: payload.dataset.datasetDigest,
                    assignments: payload.dataset.assignments,
                    constraints: customSpecs,
                    plan: payload.plan,
                    previousAttemptSummary: payload.previousAttemptSummary ?? ''
                })
            }
        ],
        temperature: 0.1,
        max_tokens: 30000,
        cache_control: {
            enable: true
        },
        response_format: {
            type: 'json_schema',
            json_schema: {
                name: 'coder_output',
                schema: {
                    type: 'object',
                    properties: {
                        plan_summary: {
                            type: 'string'
                        },
                        constraint_code: {
                            type: 'string'
                        },
                        covered_constraint_ids: {
                            type: 'array',
                            items: {
                                type: 'string'
                            }
                        },
                        assumptions: {
                            type: 'array',
                            items: {
                                type: 'string'
                            }
                        }
                    },
                    required: [
                        'plan_summary',
                        'constraint_code',
                        'covered_constraint_ids',
                        'assumptions'
                    ],
                    additionalProperties: false
                }
            }
        }
    };
    const response = await invokeChat(chatPayload);
    const parsed = coderResponseSchema.parse((0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$ai$2f$parse$2d$model$2d$json$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["parseModelJson"])(response.content));
    return ensureCoverage({
        ...parsed,
        rawResponse: response.content,
        usageTokens: response.usage?.total_tokens
    }, customSpecs);
}
}),
"[project]/src/features/timetable/ai/cp-sat-roundtrip.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "verifyCpSatRoundTrip",
    ()=>verifyCpSatRoundTrip
]);
function verifyCpSatRoundTrip(schedule, assignments, domain) {
    const assignmentById = new Map(assignments.map((assignment)=>[
            assignment.id,
            assignment
        ]));
    const validDays = new Set((domain?.days ?? []).map((day)=>String(day)));
    const validPeriods = new Set((domain?.periods ?? []).map((period)=>Number(period)));
    const periodsByDay = domain?.periodsByDay ?? {};
    for (const entry of schedule){
        const assignmentId = entry.assignmentId ? String(entry.assignmentId) : '';
        const matchingAssignments = assignments.filter((assignment)=>entry.class === assignment.class && entry.subject === assignment.subject && entry.teacher === assignment.teacher);
        const resolvedAssignmentId = assignmentId || (matchingAssignments.length === 1 ? matchingAssignments[0].id : '');
        if (!resolvedAssignmentId) {
            return {
                ok: false,
                message: `Round-trip missing assignmentId for ${entry.class}/${entry.subject}/${entry.teacher}`
            };
        }
        const assignment = assignmentById.get(resolvedAssignmentId);
        if (!assignment) {
            return {
                ok: false,
                message: `Round-trip unknown assignmentId: ${resolvedAssignmentId}`
            };
        }
        if (entry.class !== assignment.class || entry.subject !== assignment.subject || entry.teacher !== assignment.teacher) {
            return {
                ok: false,
                message: `Round-trip assignment tuple mismatch for ${resolvedAssignmentId}`
            };
        }
        if (validDays.size > 0 && !validDays.has(String(entry.day))) {
            return {
                ok: false,
                message: `Round-trip invalid day '${entry.day}' (không thuộc domain.days=${[
                    ...validDays
                ].slice(0, 5).join(',')}...)`
            };
        }
        const period = Number(entry.period);
        const dayPeriods = periodsByDay[String(entry.day)];
        if (Array.isArray(dayPeriods) && dayPeriods.length > 0 && !dayPeriods.includes(period)) {
            return {
                ok: false,
                message: `Round-trip invalid period ${entry.period} for day ${entry.day} (allowed=${dayPeriods.slice(0, 6).join(',')})`
            };
        }
        // Chỉ check validPeriods khi KHÔNG có periodsByDay-specific bộ lọc;
        // nếu periodsByDay trống hoàn toàn thì mới fall back về validPeriods.
        // (fix bug #12 — trước đây mặc định check cả 2, ra lỗi khó hiểu.)
        if ((!Array.isArray(dayPeriods) || dayPeriods.length === 0) && validPeriods.size > 0 && !validPeriods.has(period)) {
            return {
                ok: false,
                message: `Round-trip invalid period ${entry.period} (allowed=${[
                    ...validPeriods
                ].slice(0, 6).join(',')})`
            };
        }
    }
    for (const assignment of assignments){
        const count = schedule.filter((entry)=>{
            const assignmentId = entry.assignmentId ? String(entry.assignmentId) : '';
            if (assignmentId) return assignmentId === assignment.id;
            return entry.class === assignment.class && entry.subject === assignment.subject && entry.teacher === assignment.teacher;
        }).length;
        if (count !== assignment.weeklyPeriods) {
            return {
                ok: false,
                message: `Round-trip weekly mismatch for ${assignment.id}: expected ${assignment.weeklyPeriods}, got ${count}`
            };
        }
    }
    return {
        ok: true,
        message: 'Round-trip verified.'
    };
}
}),
"[project]/src/features/timetable/ai/deterministic-validator.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "validateSchedule",
    ()=>validateSchedule
]);
function toPeriod(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const n = Number(String(value));
    return Number.isFinite(n) ? n : null;
}
function slotKey(entry) {
    return `${entry.day}::${entry.period}`;
}
function pushViolation(list, constraintId, kind, message, offendingEntries) {
    list.push({
        constraintId,
        kind,
        message,
        offendingEntries
    });
}
function evaluateCondition(condition, schedule) {
    switch(condition.op){
        case 'teacher_teaches_on_day':
            return schedule.some((entry)=>entry.teacher === condition.teacher && entry.day === condition.day);
        case 'teacher_teaches_at_slot':
            return schedule.some((entry)=>entry.teacher === condition.teacher && entry.day === condition.day && toPeriod(entry.period) === condition.period);
        case 'and':
            return condition.args.every((arg)=>evaluateCondition(arg, schedule));
        case 'or':
            return condition.args.some((arg)=>evaluateCondition(arg, schedule));
        case 'not':
            return !evaluateCondition(condition.arg, schedule);
        default:
            return false;
    }
}
function checkBaseConstraints(schedule, ctx) {
    const violations = [];
    const teacherSlotMap = new Map();
    const classSlotMap = new Map();
    const assignmentById = new Map((ctx.assignments ?? []).map((assignment)=>[
            assignment.id,
            assignment
        ]));
    for (const entry of schedule){
        if (ctx.assignments?.length) {
            const assignmentId = entry.assignmentId ? String(entry.assignmentId) : '';
            if (!assignmentId) {
                pushViolation(violations, 'base_missing_assignment_id', 'base_constraint', `Schedule entry thiếu assignmentId: ${entry.class}/${entry.subject}/${entry.teacher}`, [
                    entry
                ]);
                continue;
            }
            const assignment = assignmentById.get(assignmentId);
            if (!assignment) {
                pushViolation(violations, 'base_unknown_assignment_id', 'base_constraint', `Schedule entry có assignmentId không tồn tại: ${assignmentId}`, [
                    entry
                ]);
                continue;
            }
            if (entry.class !== assignment.class || entry.subject !== assignment.subject || entry.teacher !== assignment.teacher) {
                pushViolation(violations, 'base_assignment_tuple_mismatch', 'base_constraint', `assignmentId ${assignmentId} không khớp class/subject/teacher.`, [
                    entry
                ]);
            }
        }
        const teacherKey = `${entry.teacher}::${slotKey(entry)}`;
        const classKey = `${entry.class}::${slotKey(entry)}`;
        teacherSlotMap.set(teacherKey, [
            ...teacherSlotMap.get(teacherKey) ?? [],
            entry
        ]);
        classSlotMap.set(classKey, [
            ...classSlotMap.get(classKey) ?? [],
            entry
        ]);
    }
    for (const entries of teacherSlotMap.values()){
        if (entries.length > 1) {
            pushViolation(violations, 'base_teacher_clash', 'base_constraint', `Teacher clash tại ${entries[0].day}/${entries[0].period} cho ${entries[0].teacher}.`, entries);
        }
    }
    for (const entries of classSlotMap.values()){
        if (entries.length > 1) {
            pushViolation(violations, 'base_class_clash', 'base_constraint', `Class clash tại ${entries[0].day}/${entries[0].period} cho lớp ${entries[0].class}.`, entries);
        }
    }
    if (ctx.assignments?.length) {
        for (const assignment of ctx.assignments){
            const count = schedule.filter((entry)=>String(entry.assignmentId ?? '') === assignment.id).length;
            if (count !== assignment.weeklyPeriods) {
                pushViolation(violations, `base_weekly_${assignment.id}`, 'base_constraint', `Weekly periods mismatch for ${assignment.id}: expected ${assignment.weeklyPeriods}, got ${count}.`, schedule.filter((entry)=>String(entry.assignmentId ?? '') === assignment.id));
            }
        }
    }
    return violations;
}
const checkTeacherBlockDay = (spec, schedule)=>{
    const teacher = String(spec.params.teacher ?? '');
    const day = String(spec.params.day ?? '');
    const offendingEntries = schedule.filter((entry)=>entry.teacher === teacher && entry.day === day);
    if (!offendingEntries.length) return [];
    return [
        {
            constraintId: spec.id,
            kind: spec.kind,
            message: `${teacher} không được dạy ${day} nhưng có ${offendingEntries.length} entry.`,
            offendingEntries
        }
    ];
};
const checkTeacherBlockPeriod = (spec, schedule)=>{
    const teacher = String(spec.params.teacher ?? '');
    const period = Number(spec.params.period ?? NaN);
    const offendingEntries = schedule.filter((entry)=>entry.teacher === teacher && toPeriod(entry.period) === period);
    if (!offendingEntries.length) return [];
    return [
        {
            constraintId: spec.id,
            kind: spec.kind,
            message: `${teacher} không được dạy tiết ${period} nhưng có ${offendingEntries.length} entry.`,
            offendingEntries
        }
    ];
};
const checkTeacherBlockSlot = (spec, schedule)=>{
    const teacher = String(spec.params.teacher ?? '');
    const day = String(spec.params.day ?? '');
    const period = Number(spec.params.period ?? NaN);
    const offendingEntries = schedule.filter((entry)=>entry.teacher === teacher && entry.day === day && toPeriod(entry.period) === period);
    if (!offendingEntries.length) return [];
    return [
        {
            constraintId: spec.id,
            kind: spec.kind,
            message: `${teacher} không được dạy ${day} tiết ${period}.`,
            offendingEntries
        }
    ];
};
const checkTeacherMaxPerDay = (spec, schedule)=>{
    const teacher = String(spec.params.teacher ?? '');
    const maxPerDay = Number(spec.params.maxPerDay ?? NaN);
    const violations = [];
    const byDay = new Map();
    for (const entry of schedule){
        if (entry.teacher !== teacher) continue;
        byDay.set(entry.day, [
            ...byDay.get(entry.day) ?? [],
            entry
        ]);
    }
    for (const [day, entries] of byDay.entries()){
        if (entries.length > maxPerDay) {
            violations.push({
                constraintId: spec.id,
                kind: spec.kind,
                message: `${teacher} dạy ${entries.length} tiết ở ${day}, vượt max ${maxPerDay}.`,
                offendingEntries: entries
            });
        }
    }
    return violations;
};
const checkTeacherMaxConsecutive = (spec, schedule)=>{
    const teacher = String(spec.params.teacher ?? '');
    const maxConsecutive = Number(spec.params.maxConsecutive ?? NaN);
    const violations = [];
    const byDay = new Map();
    for (const entry of schedule){
        if (entry.teacher !== teacher) continue;
        byDay.set(entry.day, [
            ...byDay.get(entry.day) ?? [],
            entry
        ]);
    }
    for (const [day, entries] of byDay.entries()){
        const sortedPeriods = entries.map((entry)=>toPeriod(entry.period)).filter((period)=>period !== null).sort((a, b)=>a - b);
        if (sortedPeriods.length === 0) continue;
        let streak = 1;
        let maxSeen = 1;
        for(let i = 1; i < sortedPeriods.length; i += 1){
            if (sortedPeriods[i] === sortedPeriods[i - 1] + 1) {
                streak += 1;
            } else {
                streak = 1;
            }
            if (streak > maxSeen) maxSeen = streak;
        }
        if (maxSeen > maxConsecutive) {
            violations.push({
                constraintId: spec.id,
                kind: spec.kind,
                message: `${teacher} có chuỗi liên tiếp ${maxSeen} tiết ở ${day}, vượt max ${maxConsecutive}.`,
                offendingEntries: entries
            });
        }
    }
    return violations;
};
const checkSubjectPinPeriod = (spec, schedule)=>{
    const subject = String(spec.params.subject ?? '');
    const classes = Array.isArray(spec.params.classes) ? spec.params.classes.map((value)=>String(value)) : null;
    const allowedPeriods = new Set((Array.isArray(spec.params.periods) ? spec.params.periods : []).map((value)=>Number(value)));
    const offendingEntries = schedule.filter((entry)=>{
        if (entry.subject !== subject) return false;
        if (classes && !classes.includes(entry.class)) return false;
        const period = toPeriod(entry.period);
        return period === null || !allowedPeriods.has(period);
    });
    if (!offendingEntries.length) return [];
    return [
        {
            constraintId: spec.id,
            kind: spec.kind,
            message: `Môn ${subject} nằm ngoài periods cho phép.`,
            offendingEntries
        }
    ];
};
const checkSubjectConsecutive = (spec, schedule)=>{
    const subject = String(spec.params.subject ?? '');
    const length = Number(spec.params.length ?? 2);
    const classes = Array.isArray(spec.params.classes) ? spec.params.classes.map((value)=>String(value)) : null;
    const violations = [];
    const target = schedule.filter((entry)=>{
        if (entry.subject !== subject) return false;
        if (classes && !classes.includes(entry.class)) return false;
        return true;
    });
    const byClass = new Map();
    for (const entry of target){
        byClass.set(entry.class, [
            ...byClass.get(entry.class) ?? [],
            entry
        ]);
    }
    for (const entries of byClass.values()){
        if (entries.length < length) continue;
        const totalPeriodsForSubject = entries.length;
        // Rule A: subject_consecutive chỉ yêu cầu floor(total / length) block liên tiếp.
        // Nếu total % length != 0, phần dư được phép xếp lẻ ở cùng ngày hoặc ngày khác;
        // KHÔNG báo violation chỉ vì có tiết lẻ và không yêu cầu total chia hết cho length.
        // Đếm số streak liên tiếp đủ dài length trong từng ngày, không nối streak qua ngày khác.
        let runsOfCorrectLength = 0;
        const byDay = new Map();
        for (const entry of entries){
            byDay.set(entry.day, [
                ...byDay.get(entry.day) ?? [],
                entry
            ]);
        }
        for (const dayEntries of byDay.values()){
            const periods = dayEntries.map((entry)=>toPeriod(entry.period)).filter((period)=>period !== null).sort((a, b)=>a - b);
            if (periods.length < length) continue;
            let streak = 1;
            for(let i = 1; i < periods.length; i += 1){
                if (periods[i] === periods[i - 1] + 1) {
                    streak += 1;
                } else {
                    if (streak >= length) runsOfCorrectLength += Math.floor(streak / length);
                    streak = 1;
                }
            }
            if (streak >= length) runsOfCorrectLength += Math.floor(streak / length);
        }
        const requiredRuns = Math.floor(totalPeriodsForSubject / length);
        if (requiredRuns > 0 && runsOfCorrectLength < requiredRuns) {
            violations.push({
                constraintId: spec.id,
                kind: spec.kind,
                message: `Môn ${subject} cần các block liên tiếp độ dài ${length}.`,
                offendingEntries: entries
            });
        }
    }
    return violations;
};
const checkClassNoDoubleSubjectDay = (spec, schedule)=>{
    const klass = String(spec.params.class ?? '');
    const subjectFilter = spec.params.subject ? String(spec.params.subject) : null;
    // maxPerDay: số tiết cùng môn tối đa/ngày. Mặc định 1 (giữ tương thích cũ),
    // nhưng cho phép "≤ N" (vd ≤ 2). (fix bug #3)
    const parsedMax = Number(spec.params.maxPerDay);
    const maxPerDay = Number.isFinite(parsedMax) && parsedMax >= 1 ? parsedMax : 1;
    const violations = [];
    const byDaySubject = new Map();
    for (const entry of schedule){
        if (entry.class !== klass) continue;
        if (subjectFilter && entry.subject !== subjectFilter) continue;
        const key = `${entry.day}::${entry.subject}`;
        byDaySubject.set(key, [
            ...byDaySubject.get(key) ?? [],
            entry
        ]);
    }
    for (const [key, entries] of byDaySubject.entries()){
        if (entries.length <= maxPerDay) continue;
        const [day, subject] = key.split('::');
        violations.push({
            constraintId: spec.id,
            kind: spec.kind,
            message: `Lớp ${klass} học môn ${subject} ${entries.length} lần trong ngày ${day} (tối đa ${maxPerDay}).`,
            offendingEntries: entries
        });
    }
    return violations;
};
const checkClassSubjectsNotSameDay = (spec, schedule)=>{
    const subjects = Array.isArray(spec.params.subjects) ? spec.params.subjects.map((value)=>String(value)) : [];
    if (subjects.length < 2) return [];
    const targetClass = spec.params.class ? String(spec.params.class) : null;
    const parsedMax = Number(spec.params.maxSubjectsPerDay);
    const maxSubjectsPerDay = Number.isFinite(parsedMax) && parsedMax >= 1 ? parsedMax : 1;
    const subjectSet = new Set(subjects);
    const violations = [];
    const byClassDay = new Map();
    for (const entry of schedule){
        if (targetClass && entry.class !== targetClass) continue;
        if (!subjectSet.has(entry.subject)) continue;
        const key = `${entry.class}::${entry.day}`;
        if (!byClassDay.has(key)) byClassDay.set(key, new Map());
        const subjectMap = byClassDay.get(key);
        subjectMap.set(entry.subject, [
            ...subjectMap.get(entry.subject) ?? [],
            entry
        ]);
    }
    for (const [key, subjectMap] of byClassDay.entries()){
        if (subjectMap.size <= maxSubjectsPerDay) continue;
        const [klass, day] = key.split('::');
        violations.push({
            constraintId: spec.id,
            kind: spec.kind,
            message: `Lớp ${klass} có ${subjectMap.size} môn {${subjects.join(', ')}} cùng ngày ${day} (tối đa ${maxSubjectsPerDay}).`,
            offendingEntries: [
                ...subjectMap.values()
            ].flat()
        });
    }
    return violations;
};
const checkTeacherMaxWorkingDays = (spec, schedule)=>{
    const teacher = spec.params.teacher ? String(spec.params.teacher) : null;
    const totalDays = new Set(schedule.map((entry)=>entry.day)).size;
    let maxDays;
    if (spec.params.maxDays !== undefined && spec.params.maxDays !== null) {
        maxDays = Number(spec.params.maxDays);
    } else if (spec.params.minDaysOff !== undefined && spec.params.minDaysOff !== null) {
        maxDays = totalDays - Number(spec.params.minDaysOff);
    } else {
        maxDays = totalDays - 1;
    }
    const teachers = teacher ? [
        teacher
    ] : [
        ...new Set(schedule.map((entry)=>entry.teacher))
    ];
    const violations = [];
    for (const targetTeacher of teachers){
        const entries = schedule.filter((entry)=>entry.teacher === targetTeacher);
        const workingDays = new Set(entries.map((entry)=>entry.day));
        if (workingDays.size > maxDays) {
            violations.push({
                constraintId: spec.id,
                kind: spec.kind,
                message: `${targetTeacher} dạy ${workingDays.size} ngày/tuần (tối đa ${maxDays}).`,
                offendingEntries: entries
            });
        }
    }
    return violations;
};
const checkSubjectMaxConsecutive = (spec, schedule)=>{
    const subject = String(spec.params.subject ?? '');
    const parsedMax = Number(spec.params.maxConsecutive);
    const maxConsecutive = Number.isFinite(parsedMax) && parsedMax >= 1 ? parsedMax : 1;
    const classes = Array.isArray(spec.params.classes) ? spec.params.classes.map((value)=>String(value)) : null;
    const violations = [];
    const byClassDay = new Map();
    for (const entry of schedule){
        if (entry.subject !== subject) continue;
        if (classes && !classes.includes(entry.class)) continue;
        const key = `${entry.class}::${entry.day}`;
        byClassDay.set(key, [
            ...byClassDay.get(key) ?? [],
            entry
        ]);
    }
    for (const [key, entries] of byClassDay.entries()){
        const periods = entries.map((entry)=>toPeriod(entry.period)).filter((period)=>period !== null).sort((a, b)=>a - b);
        let streak = 1;
        let maxSeen = periods.length ? 1 : 0;
        for(let i = 1; i < periods.length; i += 1){
            if (periods[i] === periods[i - 1] + 1) streak += 1;
            else streak = 1;
            if (streak > maxSeen) maxSeen = streak;
        }
        if (maxSeen > maxConsecutive) {
            const [klass, day] = key.split('::');
            violations.push({
                constraintId: spec.id,
                kind: spec.kind,
                message: `Lớp ${klass} có ${maxSeen} tiết ${subject} liên tiếp ngày ${day} (tối đa ${maxConsecutive}).`,
                offendingEntries: entries
            });
        }
    }
    return violations;
};
const checkWeeklyPeriodsExact = (spec, schedule, ctx)=>{
    if (spec.tags?.includes('auto_base')) return [];
    const weeklyPeriods = Number(spec.params.weeklyPeriods ?? NaN);
    let teacher = spec.params.teacher ? String(spec.params.teacher) : null;
    const subject = spec.params.subject ? String(spec.params.subject) : null;
    const klass = spec.params.class ? String(spec.params.class) : null;
    const assignmentId = spec.params.assignmentId ? String(spec.params.assignmentId) : null;
    if (assignmentId && ctx.assignments?.length) {
        const match = ctx.assignments.find((assignment)=>assignment.id === assignmentId);
        if (match) {
            teacher = teacher ?? match.teacher;
        }
    }
    const filtered = schedule.filter((entry)=>{
        if (teacher && entry.teacher !== teacher) return false;
        if (subject && entry.subject !== subject) return false;
        if (klass && entry.class !== klass) return false;
        return true;
    });
    if (filtered.length === weeklyPeriods) return [];
    return [
        {
            constraintId: spec.id,
            kind: spec.kind,
            message: `Weekly exact mismatch: expected ${weeklyPeriods}, got ${filtered.length}.`,
            offendingEntries: filtered
        }
    ];
};
const checkPairNotSameSlot = (spec, schedule)=>{
    const teachers = Array.isArray(spec.params.teachers) ? spec.params.teachers.map((value)=>String(value)) : [];
    if (teachers.length !== 2) return [];
    const scope = spec.params.scope ?? {};
    const relevant = schedule.filter((entry)=>{
        if (!teachers.includes(entry.teacher)) return false;
        if (scope.day && entry.day !== scope.day) return false;
        return true;
    });
    const bySlot = new Map();
    for (const entry of relevant){
        const key = `${entry.day}::${entry.period}`;
        bySlot.set(key, [
            ...bySlot.get(key) ?? [],
            entry
        ]);
    }
    const violations = [];
    for (const entries of bySlot.values()){
        const uniqTeachers = new Set(entries.map((entry)=>entry.teacher));
        if (uniqTeachers.size > 1) {
            violations.push({
                constraintId: spec.id,
                kind: spec.kind,
                message: `${teachers[0]} và ${teachers[1]} cùng dạy một slot.`,
                offendingEntries: entries
            });
        }
    }
    return violations;
};
const checkIfThen = (spec, schedule, ctx)=>{
    const condition = spec.params.if;
    const thenList = Array.isArray(spec.params.then) ? spec.params.then : [];
    if (!condition || thenList.length === 0) return [];
    if (!evaluateCondition(condition, schedule)) return [];
    const violations = [];
    for(let index = 0; index < thenList.length; index += 1){
        const thenItem = thenList[index];
        const nestedSpec = {
            id: `${spec.id}:then:${index + 1}`,
            original: spec.original,
            severity: spec.severity,
            kind: thenItem.kind ?? 'custom_dsl',
            params: thenItem.params ?? {},
            notes: spec.notes
        };
        const checker = checkerByKind[nestedSpec.kind];
        if (!checker) continue;
        for (const violation of checker(nestedSpec, schedule, ctx)){
            violations.push({
                ...violation,
                constraintId: spec.id,
                kind: spec.kind,
                message: `IF_THEN violation: ${violation.message}`
            });
        }
    }
    return violations;
};
const checkResourceCapacity = (spec, schedule)=>{
    const subject = String(spec.params.subject ?? '');
    const capacity = Number(spec.params.capacity ?? 1);
    const violations = [];
    const bySlot = new Map();
    for (const entry of schedule){
        if (entry.subject !== subject) continue;
        const key = `${entry.day}::${entry.period}`;
        bySlot.set(key, [
            ...bySlot.get(key) ?? [],
            entry
        ]);
    }
    for (const [key, entries] of bySlot.entries()){
        if (entries.length <= capacity) continue;
        const [day, period] = key.split('::');
        violations.push({
            constraintId: spec.id,
            kind: spec.kind,
            message: `Phòng ${subject} vượt quá dung lượng: ${entries.length} lớp trong ngày ${day} tiết ${period} (tối đa ${capacity}).`,
            offendingEntries: entries
        });
    }
    return violations;
};
const checkSessionLimit = (spec, schedule)=>{
    const teacher = String(spec.params.teacher ?? '');
    const maxPeriods = Number(spec.params.maxPeriods ?? 1);
    const violations = [];
    if (!teacher) return [];
    const byDay = new Map();
    for (const entry of schedule){
        if (entry.teacher !== teacher) continue;
        byDay.set(entry.day, [
            ...byDay.get(entry.day) ?? [],
            entry
        ]);
    }
    for (const [day, entries] of byDay.entries()){
        if (entries.length <= maxPeriods) continue;
        violations.push({
            constraintId: spec.id,
            kind: spec.kind,
            message: `Giáo viên ${teacher} dạy ${entries.length} tiết trong ngày ${day} (tối đa ${maxPeriods}).`,
            offendingEntries: entries
        });
    }
    return violations;
};
const checkSubjectGroupDailyLimit = (spec, schedule)=>{
    const groupName = String(spec.params.groupName ?? '');
    const maxPerDay = Number(spec.params.maxPerDay ?? 1);
    const targetClass = spec.params.class ? String(spec.params.class) : null;
    const violations = [];
    const filtered = schedule.filter((entry)=>{
        if (targetClass && entry.class !== targetClass) return false;
        return true;
    });
    const byDaySubject = new Map();
    const byDayEntries = new Map();
    for (const entry of filtered){
        const dayKey = entry.day;
        if (!byDaySubject.has(dayKey)) byDaySubject.set(dayKey, new Set());
        byDaySubject.get(dayKey).add(entry.subject);
        byDayEntries.set(dayKey, [
            ...byDayEntries.get(dayKey) ?? [],
            entry
        ]);
    }
    for (const [day, subjects] of byDaySubject.entries()){
        if (subjects.size <= maxPerDay) continue;
        const entries = byDayEntries.get(day) ?? [];
        violations.push({
            constraintId: spec.id,
            kind: spec.kind,
            message: `Nhóm môn ${groupName} vượt quá giới hạn: ${subjects.size} môn khác nhau trong ngày ${day} (tối đa ${maxPerDay}).`,
            offendingEntries: entries
        });
    }
    return violations;
};
const checkerByKind = {
    teacher_block_day: checkTeacherBlockDay,
    teacher_block_period: checkTeacherBlockPeriod,
    teacher_block_slot: checkTeacherBlockSlot,
    teacher_max_per_day: checkTeacherMaxPerDay,
    teacher_max_consecutive: checkTeacherMaxConsecutive,
    subject_pin_period: checkSubjectPinPeriod,
    subject_consecutive: checkSubjectConsecutive,
    class_no_double_subject_day: checkClassNoDoubleSubjectDay,
    class_subjects_not_same_day: checkClassSubjectsNotSameDay,
    teacher_max_working_days: checkTeacherMaxWorkingDays,
    subject_max_consecutive: checkSubjectMaxConsecutive,
    weekly_periods_exact: checkWeeklyPeriodsExact,
    pair_not_same_slot: checkPairNotSameSlot,
    if_then: checkIfThen,
    resource_capacity: checkResourceCapacity,
    session_limit: checkSessionLimit,
    subject_group_daily_limit: checkSubjectGroupDailyLimit
};
function validateSchedule(schedule, constraintSpecs, ctx = {}) {
    const baseViolations = checkBaseConstraints(schedule, ctx);
    const specViolations = [];
    const uncheckedConstraintIds = [];
    for (const spec of constraintSpecs){
        if (spec.kind === 'custom_dsl') {
            uncheckedConstraintIds.push(spec.id);
            continue;
        }
        const checker = checkerByKind[spec.kind];
        if (!checker) {
            uncheckedConstraintIds.push(spec.id);
            continue;
        }
        specViolations.push(...checker(spec, schedule, ctx));
    }
    const violations = [
        ...baseViolations,
        ...specViolations
    ];
    const hardConstraintIds = new Set(constraintSpecs.filter((spec)=>spec.severity === 'hard').map((spec)=>spec.id));
    const softConstraintIds = new Set(constraintSpecs.filter((spec)=>spec.severity === 'soft').map((spec)=>spec.id));
    const hardViolations = violations.filter((violation)=>violation.kind === 'base_constraint' || hardConstraintIds.has(violation.constraintId));
    const softViolations = violations.filter((violation)=>softConstraintIds.has(violation.constraintId));
    // FAIL-CLOSED: một hard constraint không có checker (custom_dsl / kind lạ)
    // KHÔNG được mặc nhiên coi là đạt. (fix bug #4)
    const hardUncheckedConstraintIds = uncheckedConstraintIds.filter((id)=>hardConstraintIds.has(id));
    const hardCoverageComplete = hardUncheckedConstraintIds.length === 0;
    return {
        ok: violations.length === 0 && hardCoverageComplete,
        baseConstraintPass: baseViolations.length === 0,
        hardConstraintPass: hardViolations.length === 0 && hardCoverageComplete,
        softConstraintPass: softViolations.length === 0,
        hardCoverageComplete,
        violations,
        hardViolations,
        softViolations,
        uncheckedConstraintIds,
        hardUncheckedConstraintIds
    };
}
}),
"[project]/src/features/timetable/ai/input-compressor.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "compressPayload",
    ()=>compressPayload,
    "digestError",
    ()=>digestError,
    "groupAssignments",
    ()=>groupAssignments
]);
function inferActivePeriods(input) {
    const byDay = {};
    // Không bật day-level cho tất cả days chỉ vì MỘT day có entry trong
    // periodCounts. Cần KIỂM TRA per-day: nếu day này không có entry hợp lệ
    // thì dùng session breakdown. (fix bug #11)
    const allDaysHaveDayLevelCount = input.days.every((day)=>{
        const value = Number(input.periodCounts[day.id]);
        return Number.isFinite(value) && value > 0;
    });
    for (const day of input.days){
        const activePeriods = [];
        const dayLevelValue = Number(input.periodCounts[day.id]);
        const dayHasOwnCount = Number.isFinite(dayLevelValue) && dayLevelValue > 0;
        if (allDaysHaveDayLevelCount || dayHasOwnCount) {
            const dayMax = dayHasOwnCount ? dayLevelValue : 0;
            const deletedPeriods = new Set();
            for (const [key, isDeleted] of Object.entries(input.deletedPeriods)){
                if (!isDeleted) continue;
                const [keyDay, , keyPeriodRaw] = key.split('-');
                const keyPeriod = Number(keyPeriodRaw);
                if (keyDay === day.id && Number.isFinite(keyPeriod)) {
                    deletedPeriods.add(keyPeriod);
                }
            }
            for(let period = 1; period <= dayMax; period += 1){
                if (!deletedPeriods.has(period)) activePeriods.push(period);
            }
            byDay[day.id] = activePeriods;
            continue;
        }
        let offset = 0;
        for (const session of input.sessions){
            const sessionMax = Number(input.periodCounts[session.id] ?? 0);
            for(let period = 1; period <= sessionMax; period += 1){
                const key = `${day.id}-${session.id}-${period}`;
                if (!input.deletedPeriods[key]) activePeriods.push(offset + period);
            }
            offset += sessionMax;
        }
        byDay[day.id] = activePeriods;
    }
    return byDay;
}
function compressPayload(input, constraintSpecs) {
    const assignments = input.assignments.map((assignment)=>({
            id: assignment.id,
            class: assignment.class.label,
            subject: assignment.subject.label,
            teacher: assignment.teacher.label,
            weeklyPeriods: assignment.weeklyPeriods
        }));
    const classes = [
        ...new Set(assignments.map((assignment)=>assignment.class))
    ].sort((a, b)=>a.localeCompare(b, 'vi'));
    const teachers = [
        ...new Set(assignments.map((assignment)=>assignment.teacher))
    ];
    const periodsByDay = inferActivePeriods(input);
    const merged = new Set();
    for (const periods of Object.values(periodsByDay)){
        for (const period of periods)merged.add(period);
    }
    const periods = [
        ...merged
    ].sort((a, b)=>a - b);
    const days = input.days.map((day)=>day.id);
    return {
        classes,
        days,
        periodsByDay,
        periods,
        assignments,
        constraints: constraintSpecs,
        datasetDigest: {
            classCount: classes.length,
            teacherCount: teachers.length,
            dayCount: days.length,
            periodCount: periods.length,
            totalAssignments: assignments.length
        }
    };
}
function groupAssignments(assignments) {
    const grouped = {};
    for (const assignment of assignments){
        if (!grouped[assignment.class]) grouped[assignment.class] = [];
        grouped[assignment.class].push(assignment);
    }
    return grouped;
}
function digestError(raw, maxLength = 800) {
    const lines = raw.split('\n').map((line)=>line.trim()).filter(Boolean);
    const focused = lines.slice(-12).join('\n');
    if (focused.length <= maxLength) return focused;
    // fix bug #28 — cắt ở ranh giới dòng gần nhất trước maxLength để
    // tránh rách tracebacks giữa dòng/ký tự.
    const cutAt = focused.lastIndexOf('\n', maxLength - 4);
    const safeCut = cutAt > 0 ? cutAt : maxLength - 3;
    return `${focused.slice(0, safeCut)}\n...`;
}
}),
"[project]/src/features/timetable/ai/planner.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "runPlannerTurn",
    ()=>runPlannerTurn
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__ = __turbopack_context__.i("[project]/node_modules/zod/v4/classic/external.js [app-ssr] (ecmascript) <export * as z>");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$ai$2f$parse$2d$model$2d$json$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/features/timetable/ai/parse-model-json.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$ai$2f$chat$2d$client$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/features/timetable/ai/chat-client.ts [app-ssr] (ecmascript)");
;
;
;
const planSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].object({
    decisionVars: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string(),
    domainSize: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].object({
        classes: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].number(),
        days: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].number(),
        periods: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].number(),
        estimated: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].number().optional(),
        estimatedVars: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].number().optional()
    }),
    constraintOrder: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].array(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string()),
    reifiedNeeded: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].array(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string()),
    objective: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].enum([
        'none',
        'maximize_soft',
        'minimize_gaps'
    ]),
    templatesUsed: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].array(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string()),
    objectiveFunction: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string().optional(),
    provenPatterns: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].array(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string()).optional(),
    risks: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].array(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string())
});
const defaultInvokeChat = (payload)=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$ai$2f$chat$2d$client$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["invokeChat"])(payload);
function loadPlannerSystemPrompt() {
    return fetch('/prompts/planner.system.md').then(async (response)=>{
        if (!response.ok) {
            return 'You are a CP-SAT planner. Output strict JSON plan.';
        }
        return response.text();
    }).catch(()=>'You are a CP-SAT planner. Output strict JSON plan.');
}
function fallbackPlan(datasetDigest, constraints) {
    return {
        decisionVars: 'slots[(assignment_id, day, period)] = BoolVar',
        domainSize: datasetDigest,
        constraintOrder: constraints.map((constraint)=>constraint.id),
        reifiedNeeded: constraints.filter((constraint)=>constraint.kind === 'if_then' || constraint.severity === 'soft').map((constraint)=>constraint.id),
        objective: 'none',
        templatesUsed: [
            'teacher_slot_capacity',
            'class_slot_capacity',
            'implication_reified'
        ],
        objectiveFunction: 'satisfy_all_hard_then_minimize_soft_violations',
        provenPatterns: [
            'teacher_slot_capacity',
            'class_slot_capacity',
            'implication_reified'
        ],
        risks: []
    };
}
function validatePlanCoverage(plan, constraints) {
    const hardIds = new Set(constraints.filter((constraint)=>constraint.severity === 'hard').map((c)=>c.id));
    const providedIds = new Set(plan.constraintOrder);
    const missing = [
        ...hardIds
    ].filter((id)=>!providedIds.has(id));
    if (!missing.length) return plan;
    return {
        ...plan,
        constraintOrder: [
            ...plan.constraintOrder,
            ...missing
        ],
        risks: [
            ...plan.risks,
            `missing_hard_constraints:${missing.join(',')}`
        ]
    };
}
async function runPlannerTurn(config, input, invokeChat = defaultInvokeChat) {
    const systemPrompt = await loadPlannerSystemPrompt();
    const payload = {
        baseURL: config.baseURL || 'https://openrouter.ai/api/v1',
        apiKey: config.apiKey,
        model: config.model,
        messages: [
            {
                role: 'system',
                content: systemPrompt
            },
            {
                role: 'user',
                content: JSON.stringify(input)
            }
        ],
        temperature: 0,
        max_tokens: 2500,
        response_format: {
            type: 'json_schema',
            json_schema: {
                name: 'solver_plan',
                schema: {
                    type: 'object',
                    properties: {
                        decisionVars: {
                            type: 'string'
                        },
                        domainSize: {
                            type: 'object',
                            properties: {
                                classes: {
                                    type: 'number'
                                },
                                days: {
                                    type: 'number'
                                },
                                periods: {
                                    type: 'number'
                                },
                                estimated: {
                                    type: 'number'
                                },
                                estimatedVars: {
                                    type: 'number'
                                }
                            },
                            required: [
                                'classes',
                                'days',
                                'periods'
                            ]
                        },
                        constraintOrder: {
                            type: 'array',
                            items: {
                                type: 'string'
                            }
                        },
                        reifiedNeeded: {
                            type: 'array',
                            items: {
                                type: 'string'
                            }
                        },
                        objective: {
                            type: 'string',
                            enum: [
                                'none',
                                'maximize_soft',
                                'minimize_gaps'
                            ]
                        },
                        templatesUsed: {
                            type: 'array',
                            items: {
                                type: 'string'
                            }
                        },
                        objectiveFunction: {
                            type: 'string'
                        },
                        provenPatterns: {
                            type: 'array',
                            items: {
                                type: 'string'
                            }
                        },
                        risks: {
                            type: 'array',
                            items: {
                                type: 'string'
                            }
                        }
                    },
                    required: [
                        'decisionVars',
                        'domainSize',
                        'constraintOrder',
                        'reifiedNeeded',
                        'objective',
                        'templatesUsed',
                        'risks'
                    ]
                }
            }
        }
    };
    try {
        const response = await invokeChat(payload);
        const candidate = planSchema.parse((0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$ai$2f$parse$2d$model$2d$json$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["parseModelJson"])(response.content));
        return {
            plan: validatePlanCoverage(candidate, input.constraintSpecs),
            rawResponse: response.content,
            usageTokens: response.usage?.total_tokens
        };
    } catch  {
        return {
            plan: fallbackPlan(input.datasetDigest, input.constraintSpecs),
            rawResponse: '',
            usageTokens: 0
        };
    }
}
}),
"[project]/src/features/timetable/ai/python-bridge.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * python-bridge.ts
 * High-level bridge between the local AI agent and the Python execution host.
 *
 * In the final implementation this talks to the main process via IPC.
 * For now it contains the interface + a dev stub.
 */ __turbopack_context__.s([
    "executeGeneratedCode",
    ()=>executeGeneratedCode
]);
async function executeGeneratedCode(code, input, options = {}) {
    const timeout = options.timeoutMs ?? 360_000;
    // In production this will be an IPC call to the main process
    // which actually spawns the bundled binary.
    if (("TURBOPACK compile-time value", "undefined") !== 'undefined' && window.electron?.python?.executeCode) //TURBOPACK unreachable
    ;
    // Web fallback: call server-side executor route.
    if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
    ;
    throw new Error('[python-bridge] Python executor IPC is not available. Please run inside Electron app (with preload exposing window.electron.python.executeCode) or wire a server execution route.');
}
}),
"[project]/src/features/timetable/ai/repair.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "applyRepairPatches",
    ()=>applyRepairPatches,
    "runRepairTurn",
    ()=>runRepairTurn
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__ = __turbopack_context__.i("[project]/node_modules/zod/v4/classic/external.js [app-ssr] (ecmascript) <export * as z>");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$ai$2f$parse$2d$model$2d$json$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/features/timetable/ai/parse-model-json.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$ai$2f$chat$2d$client$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/features/timetable/ai/chat-client.ts [app-ssr] (ecmascript)");
;
;
;
const repairResponseSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].object({
    summary: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string(),
    patches: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].array(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].object({
        oldStr: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string(),
        newStr: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string(),
        reason: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string(),
        replaceAll: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].boolean().optional()
    })),
    assumptions: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].array(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string())
});
const defaultInvokeChat = (payload)=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$ai$2f$chat$2d$client$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["invokeChat"])(payload);
function loadRepairSystemPrompt() {
    return fetch('/prompts/repair.system.md').then(async (response)=>{
        if (!response.ok) {
            return 'You are a repair agent. Return strict JSON patches.';
        }
        return response.text();
    }).catch(()=>'You are a repair agent. Return strict JSON patches.');
}
async function runRepairTurn(config, payload, invokeChat = defaultInvokeChat) {
    const systemPrompt = await loadRepairSystemPrompt();
    const chatPayload = {
        baseURL: config.baseURL || 'https://openrouter.ai/api/v1',
        apiKey: config.apiKey,
        model: config.model,
        messages: [
            {
                role: 'system',
                content: systemPrompt
            },
            {
                role: 'user',
                content: JSON.stringify({
                    plan: payload.plan,
                    currentCode: payload.constraintCode,
                    constraintCode: payload.constraintCode,
                    violations: payload.violations.map((violation)=>({
                            constraintId: violation.constraintId,
                            kind: violation.kind,
                            message: violation.message,
                            count: violation.offendingEntries.length,
                            sample: violation.offendingEntries.slice(0, 3)
                        })),
                    compileOrRunError: payload.compileOrRunError ?? ''
                })
            }
        ],
        temperature: 0.1,
        max_tokens: 2200,
        cache_control: {
            enable: true
        },
        response_format: {
            type: 'json_schema',
            json_schema: {
                name: 'repair_output',
                schema: {
                    type: 'object',
                    properties: {
                        summary: {
                            type: 'string'
                        },
                        patches: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    oldStr: {
                                        type: 'string'
                                    },
                                    newStr: {
                                        type: 'string'
                                    },
                                    reason: {
                                        type: 'string'
                                    },
                                    replaceAll: {
                                        type: 'boolean'
                                    }
                                },
                                required: [
                                    'oldStr',
                                    'newStr',
                                    'reason'
                                ],
                                additionalProperties: false
                            }
                        },
                        assumptions: {
                            type: 'array',
                            items: {
                                type: 'string'
                            }
                        }
                    },
                    required: [
                        'summary',
                        'patches',
                        'assumptions'
                    ],
                    additionalProperties: false
                }
            }
        }
    };
    const response = await invokeChat(chatPayload);
    const parsed = repairResponseSchema.parse((0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$ai$2f$parse$2d$model$2d$json$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["parseModelJson"])(response.content));
    return {
        ...parsed,
        rawResponse: response.content,
        usageTokens: response.usage?.total_tokens
    };
}
function applyRepairPatches(source, patches) {
    // Atomic apply thật sự (fix bug #8):
    //   1) Validate TẤT CẢ patches trên source GỐC: tìm vị trí và kiểm duplicate.
    //   2) Sort theo vị trí tăng dần, kiểm tra KHÔNG overlap.
    //   3) Stitch ra string mới bằng slice + concat — mỗi patch gắn 1 lần
    //      đúng tại vị trí nó đã được validate, tránh trường hợp patch trước
    //      làm oldStr của patch sau xuất hiện nhiều hơn.
    const plan = [];
    for (const patch of patches){
        if (!patch.oldStr) continue;
        const occurrences = [];
        let from = 0;
        while(from <= source.length){
            const idx = source.indexOf(patch.oldStr, from);
            if (idx === -1) break;
            occurrences.push(idx);
            from = idx + Math.max(1, patch.oldStr.length);
        }
        if (occurrences.length === 0) {
            throw new Error(`Repair patch oldStr not found in source. Preview: ${patch.oldStr.slice(0, 120)}`);
        }
        if (occurrences.length > 1 && !patch.replaceAll) {
            throw new Error(`Repair patch ambiguous: oldStr xuất hiện ${occurrences.length} lần. Mở rộng context hoặc set replaceAll=true. Preview: ${patch.oldStr.slice(0, 120)}`);
        }
        if (patch.replaceAll) {
            for (const idx of occurrences){
                plan.push({
                    start: idx,
                    end: idx + patch.oldStr.length,
                    patch
                });
            }
        } else {
            const idx = occurrences[0];
            plan.push({
                start: idx,
                end: idx + patch.oldStr.length,
                patch
            });
        }
    }
    plan.sort((a, b)=>a.start - b.start);
    // Detect overlap.
    for(let i = 1; i < plan.length; i += 1){
        if (plan[i].start < plan[i - 1].end) {
            throw new Error(`Repair patches overlap at offset ${plan[i].start}. Tránh đề các patch chồng nhau.`);
        }
    }
    // Stitch.
    let cursor = 0;
    const out = [];
    for (const segment of plan){
        out.push(source.slice(cursor, segment.start));
        out.push(segment.patch.newStr);
        cursor = segment.end;
    }
    out.push(source.slice(cursor));
    return out.join('');
}
}),
"[project]/src/features/timetable/ai/skeleton-injector.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "astCheckPython",
    ()=>astCheckPython,
    "injectConstraintCode",
    ()=>injectConstraintCode,
    "loadSolverSkeleton",
    ()=>loadSolverSkeleton,
    "syntaxCheckPython",
    ()=>syntaxCheckPython
]);
const MARKER_LINE = /^[ \t]*#\s*<<<\s*AI_FILL_HERE\s*>>>\s*$/m;
async function loadSolverSkeleton() {
    const publicResponse = await fetch('/templates/solver_skeleton.py').catch(()=>null);
    if (publicResponse?.ok) {
        return publicResponse.text();
    }
    const routeResponse = await fetch('/api/ai/solver-skeleton').catch(()=>null);
    if (!routeResponse?.ok) {
        throw new Error('Unable to load solver skeleton template.');
    }
    return routeResponse.text();
}
function injectConstraintCode(skeleton, constraintCode) {
    const markerMatch = skeleton.match(MARKER_LINE);
    if (!markerMatch) return {
        solverCode: skeleton,
        injected: false
    };
    const baseIndent = markerMatch[0].match(/^[ \t]*/)?.[0] ?? '';
    const normalized = constraintCode.replace(/\r\n/g, '\n').replace(/\t/g, '    ');
    // Detect minimum non-empty leading indent of source to strip it uniformly,
    // preserving ALL relative nested indentation (fix bug #4).
    const sourceLines = normalized.split('\n');
    let minLeading = Infinity;
    for (const line of sourceLines){
        if (!line.trim().length) continue;
        const leading = (line.match(/^[ \t]*/)?.[0] ?? '').length;
        if (leading < minLeading) minLeading = leading;
    }
    if (!Number.isFinite(minLeading)) minLeading = 0;
    const indented = sourceLines.map((line)=>{
        if (!line.trim().length) return '';
        const stripped = line.slice(minLeading);
        return `${baseIndent}${stripped.replace(/\s+$/, '')}`;
    }).join('\n');
    // Use function form of replace to avoid '$1', '$', '$$' etc being treated
    // as special replacement patterns in the generated code (fix bug #3).
    return {
        solverCode: skeleton.replace(MARKER_LINE, ()=>indented),
        injected: true
    };
}
async function syntaxCheckPython(code) {
    try {
        const response = await fetch('/api/ai/python-syntax-check', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                code
            })
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok || !payload.result) {
            return {
                ok: false,
                error: payload.error || 'Python syntax check API failed.'
            };
        }
        return {
            ok: Boolean(payload.result.ok),
            error: payload.result.error
        };
    } catch (error) {
        return {
            ok: false,
            error: error instanceof Error ? error.message : 'Unable to run Python syntax check.'
        };
    }
}
async function astCheckPython(code) {
    try {
        const response = await fetch('/api/ai/python-ast-check', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                code
            })
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok || !payload.result) {
            return {
                ok: false,
                error: payload.error || 'AST check API failed.'
            };
        }
        return {
            ok: Boolean(payload.result.ok),
            error: payload.result.error
        };
    } catch (error) {
        return {
            ok: false,
            error: error instanceof Error ? error.message : 'AST check failed.'
        };
    }
}
}),
"[project]/src/lib/constraint-parser.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "parseConstraint",
    ()=>parseConstraint
]);
const VN_DAY_ALIASES = [
    [
        /\bthứ\s*(?:2|hai)\b/u,
        'monday'
    ],
    [
        /\bthứ\s*(?:3|ba)\b/u,
        'tuesday'
    ],
    [
        /\bthứ\s*(?:4|tư|tu)\b/u,
        'wednesday'
    ],
    [
        /\bthứ\s*(?:5|năm|nam)\b/u,
        'thursday'
    ],
    [
        /\bthứ\s*(?:6|sáu|sau)\b/u,
        'friday'
    ],
    [
        /\bthứ\s*(?:7|bảy|bay)\b/u,
        'saturday'
    ],
    [
        /\b(?:chủ\s*nhật|chu\s*nhat|cn)\b/u,
        'sunday'
    ]
];
const SESSION_ALIASES = [
    [
        /\b(?:buổi\s*)?(?:sáng|sang|sáng\s*sớm|sang\s*som)\b/u,
        'morning'
    ],
    [
        /\b(?:buổi\s*)?(?:chiều|chieu)\b/u,
        'afternoon'
    ],
    [
        /\b(?:buổi\s*)?(?:tối|toi)\b/u,
        'night'
    ]
];
function normalize(value) {
    return value.normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
}
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function boundaryPattern(label) {
    return new RegExp(`(^|[\\s,.;:()\\[\\]{}"'/-])${escapeRegExp(normalize(label))}(?=$|[\\s,.;:()\\[\\]{}"'/-])`, 'u');
}
function matchLabels(text, labels) {
    return [
        ...labels
    ].filter(Boolean).sort((a, b)=>b.length - a.length).filter((label)=>boundaryPattern(label).test(text));
}
function unique(values) {
    return [
        ...new Set(values)
    ];
}
function extractDays(text) {
    const days = [];
    const compact = text.match(/\bthứ\s*([2-7](?:\s+[2-7])+)\b/u);
    if (compact) {
        for (const n of compact[1].split(/\s+/)){
            const map = {
                '2': 'monday',
                '3': 'tuesday',
                '4': 'wednesday',
                '5': 'thursday',
                '6': 'friday',
                '7': 'saturday'
            };
            if (map[n]) days.push(map[n]);
        }
        return unique(days);
    }
    for (const [pattern, dayId] of VN_DAY_ALIASES){
        if (pattern.test(text)) {
            days.push(dayId);
            break;
        }
    }
    return unique(days);
}
function extractSessions(text) {
    const sessions = [];
    for (const [pattern, sessionId] of SESSION_ALIASES){
        if (pattern.test(text)) sessions.push(sessionId);
    }
    return unique(sessions);
}
function extractPeriods(text) {
    const periods = [];
    const range = text.match(/\btiết\s*(\d+)\s*[-–]\s*(\d+)\b/u);
    if (range) {
        const lo = Number(range[1]);
        const hi = Number(range[2]);
        for(let n = Math.min(lo, hi); n <= Math.max(lo, hi); n++)periods.push(n);
    }
    const singles = text.matchAll(/\btiết\s*(\d+)\b/gu);
    for (const match of singles)periods.push(Number(match[1]));
    return unique(periods.map(String)).map(Number).filter((n)=>Number.isInteger(n) && n > 0);
}
function extractFirstNumber(text) {
    const match = text.match(/\b(\d+)\b/u);
    if (!match) return null;
    const n = Number(match[1]);
    return Number.isInteger(n) && n > 0 ? n : null;
}
function classFilterFromText(text, classLabels) {
    const exact = matchLabels(text, classLabels);
    if (exact.length > 0) return exact;
    const grade = text.match(/\blớp\s*(\d{1,2})\b/u);
    if (!grade) return undefined;
    const filtered = classLabels.filter((label)=>normalize(label).startsWith(grade[1]));
    return filtered.length > 0 ? filtered : undefined;
}
function allTeacherToken(text) {
    return /\b(?:mỗi|moi)\s*(?:giáo\s*viên|giao\s*vien|gv)\b/u.test(text);
}
function allClassToken(text) {
    return /\b(?:mỗi|moi)\s*(?:lớp|lop)\b/u.test(text);
}
function parseConstraint(text, ctx) {
    const raw = normalize(text);
    if (!raw) return {
        kind: 'unparsed',
        reason: 'Constraint rỗng.'
    };
    const teachers = matchLabels(raw, ctx.teacherLabels);
    const classes = matchLabels(raw, ctx.classLabels);
    const subjects = matchLabels(raw, ctx.subjectLabels);
    const days = extractDays(raw);
    const sessions = extractSessions(raw);
    const periods = extractPeriods(raw);
    if ((/không\s*dạy\s*quá|khong\s*day\s*qua/u.test(raw) || /không\s*quá|khong\s*qua/u.test(raw)) && /liên\s*tiếp|lien\s*tiep/u.test(raw)) {
        const max = extractFirstNumber(raw);
        if (max !== null) return {
            kind: 'teacher_max_consecutive',
            teacherLabels: allTeacherToken(raw) ? '*' : teachers,
            max
        };
    }
    if (/ngày\s*nghỉ\s*tối\s*thiểu|ngay\s*nghi\s*toi\s*thieu/u.test(raw)) {
        const min = extractFirstNumber(raw) ?? 1;
        return {
            kind: 'teacher_min_off_days',
            teacherLabels: allTeacherToken(raw) || teachers.length === 0 ? '*' : teachers,
            min
        };
    }
    if (/mỗi\s*ngày\s*mỗi\s*lớp|moi\s*ngay\s*moi\s*lop/u.test(raw) && subjects.length > 0) {
        return {
            kind: 'class_daily_subject_any',
            classLabels: allClassToken(raw) ? '*' : classes,
            subjectLabels: subjects
        };
    }
    if (/không\s*liên\s*tiếp|khong\s*lien\s*tiep/u.test(raw) && subjects.length >= 2) {
        return {
            kind: 'subjects_not_consecutive',
            subjectLabels: subjects
        };
    }
    if (/không\s*dạy|khong\s*day|không\s*có\s*lịch|khong\s*co\s*lich/u.test(raw) && teachers.length > 0) {
        if (days.length > 0 && periods.length > 0) return {
            kind: 'teacher_block_day_period',
            teacherLabels: teachers,
            dayIds: days,
            periods
        };
        if (sessions.length > 0 && days.length > 0) return {
            kind: 'teacher_block_session_day',
            teacherLabels: teachers,
            sessionIds: sessions,
            dayIds: days
        };
        if (days.length > 0) return {
            kind: 'teacher_block_days',
            teacherLabels: teachers,
            dayIds: days
        };
        if (periods.length > 0) return {
            kind: 'teacher_block_periods',
            teacherLabels: teachers,
            periods
        };
        if (sessions.length > 0) return {
            kind: 'teacher_block_sessions',
            teacherLabels: teachers,
            sessionIds: sessions
        };
    }
    if ((/chỉ\s*dạy|chi\s*day/u.test(raw) || /\bchỉ|chi\b/u.test(raw)) && teachers.length > 0) {
        if (days.length > 0) return {
            kind: 'teacher_allow_only_days',
            teacherLabels: teachers,
            dayIds: days
        };
        if (sessions.length > 0) return {
            kind: 'teacher_allow_only_sessions',
            teacherLabels: teachers,
            sessionIds: sessions
        };
    }
    if (/không\s*học|khong\s*hoc/u.test(raw) && classes.length > 0) {
        if (days.length > 0) return {
            kind: 'class_block_days',
            classLabels: classes,
            dayIds: days
        };
    }
    if ((/không\s*xếp|khong\s*xep|không\s*được\s*xếp|khong\s*duoc\s*xep/u.test(raw) || /không|khong/u.test(raw) && subjects.length > 0) && subjects.length > 0) {
        if (periods.length > 0) return {
            kind: 'subject_block_periods',
            subjectLabels: subjects,
            periods
        };
        if (sessions.length > 0) return {
            kind: 'subject_only_sessions',
            subjectLabels: subjects,
            sessionIds: sessions
        };
    }
    if (/chỉ\s*tiết|chi\s*tiet|bắt\s*buộc\s*tiết|bat\s*buoc\s*tiet|luôn\s*tiết|luon\s*tiet/u.test(raw) && subjects.length > 0 && periods.length > 0) {
        return {
            kind: 'subject_pin_periods',
            subjectLabels: subjects,
            periods
        };
    }
    if (subjects.length > 0 && /phải\s*block|phai\s*block|liên\s*tiếp|lien\s*tiep/u.test(raw)) {
        const blockSize = extractFirstNumber(raw) ?? 2;
        return {
            kind: 'subject_block_consecutive',
            subjectLabels: subjects,
            blockSize
        };
    }
    if (subjects.length > 0 && sessions.length > 0 && !/không|khong/u.test(raw)) {
        if (/nên|nen/u.test(raw)) return {
            kind: 'subject_prefer_sessions',
            subjectLabels: subjects,
            sessionIds: sessions
        };
        return {
            kind: 'subject_only_sessions',
            subjectLabels: subjects,
            sessionIds: sessions
        };
    }
    if (subjects.length > 0 && periods.length > 0 && /nên|nen|xếp|xep|tiết|tiet/u.test(raw)) {
        const classFilter = classFilterFromText(raw, ctx.classLabels);
        return classFilter ? {
            kind: 'subject_prefer_periods',
            subjectLabels: subjects,
            periods,
            classFilter
        } : {
            kind: 'subject_prefer_periods',
            subjectLabels: subjects,
            periods
        };
    }
    return {
        kind: 'unparsed',
        reason: 'Không khớp pattern chuẩn hoặc thiếu entity/ngày/tiết/buổi.'
    };
}
}),
"[project]/src/features/timetable/ai/translator.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "__translatorInternal",
    ()=>__translatorInternal,
    "runTranslatorTurn",
    ()=>runTranslatorTurn
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__ = __turbopack_context__.i("[project]/node_modules/zod/v4/classic/external.js [app-ssr] (ecmascript) <export * as z>");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$constraint$2d$parser$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/constraint-parser.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$ai$2f$parse$2d$model$2d$json$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/features/timetable/ai/parse-model-json.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$ai$2f$chat$2d$client$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/features/timetable/ai/chat-client.ts [app-ssr] (ecmascript)");
;
;
;
;
const constraintSpecSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].object({
    id: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string(),
    original: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string(),
    severity: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].enum([
        'hard',
        'soft',
        'info'
    ]),
    kind: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].enum([
        'teacher_block_day',
        'teacher_block_period',
        'teacher_block_slot',
        'teacher_max_per_day',
        'teacher_max_consecutive',
        'subject_pin_period',
        'subject_consecutive',
        'class_no_double_subject_day',
        'weekly_periods_exact',
        'if_then',
        'pair_not_same_slot',
        'resource_capacity',
        'session_limit',
        'subject_group',
        'subject_group_daily_limit',
        'custom_dsl'
    ]),
    params: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].record(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string(), __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].unknown()),
    tags: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].array(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].enum([
        'auto_base',
        'user_required',
        'user_preferred'
    ])).optional(),
    notes: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string().optional()
});
const translatorResponseSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].object({
    constraintSpecs: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].array(constraintSpecSchema)
});
const defaultInvokeChat = (payload)=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$ai$2f$chat$2d$client$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["invokeChat"])(payload);
function includesLabel(text, label) {
    return text.toLocaleLowerCase('vi').includes(label.toLocaleLowerCase('vi'));
}
function extractFirstNumber(text) {
    const matched = text.match(/\b(\d+)\b/u);
    if (!matched) return null;
    const value = Number(matched[1]);
    return Number.isFinite(value) ? value : null;
}
// Trích số đứng ngay sau từ "tiết" / "tiet" / "period" — dùng cho
// parsing câu như "thứ 6 tiết 5" để tránh nhầm số "6" (thứ 6) thành
// period. (fix bug #14)
function extractPeriodNumber(text) {
    const matched = text.match(/(?:tiết|tiet|period)\s*(\d+)/iu);
    if (matched) {
        const value = Number(matched[1]);
        if (Number.isFinite(value)) return value;
    }
    return null;
}
function extractDayId(text, days) {
    for (const day of days){
        if (includesLabel(text, day.id) || includesLabel(text, day.label)) return day.id;
    }
    if (/thứ\s*2|thu\s*2/u.test(text)) return 'mon';
    if (/thứ\s*3|thu\s*3/u.test(text)) return 'tue';
    if (/thứ\s*4|thu\s*4/u.test(text)) return 'wed';
    if (/thứ\s*5|thu\s*5/u.test(text)) return 'thu';
    if (/thứ\s*6|thu\s*6/u.test(text)) return 'fri';
    if (/thứ\s*7|thu\s*7/u.test(text)) return 'sat';
    if (/chủ\s*nhật|chu\s*nhat|cn/u.test(text)) return 'sun';
    return null;
}
function buildTranslatorPeriods(input) {
    const periodSet = new Set();
    const periodsByDay = buildTranslatorPeriodsByDay(input);
    for (const periods of Object.values(periodsByDay)){
        for (const period of periods){
            if (Number.isFinite(period) && period > 0) periodSet.add(period);
        }
    }
    return [
        ...periodSet
    ].sort((a, b)=>a - b);
}
function buildTranslatorPeriodsByDay(input) {
    const periodsByDay = {};
    const allDaysHaveDayLevelCount = input.days.every((day)=>{
        const value = Number(input.periodCounts[day.id]);
        return Number.isFinite(value) && value > 0;
    });
    const hasSessionCounts = input.sessions.some((session)=>{
        const value = Number(input.periodCounts[session.id]);
        return Number.isFinite(value) && value > 0;
    });
    for (const day of input.days){
        const activePeriods = [];
        const dayLevelValue = Number(input.periodCounts[day.id]);
        const dayHasOwnCount = Number.isFinite(dayLevelValue) && dayLevelValue > 0;
        if ((allDaysHaveDayLevelCount || dayHasOwnCount) && !hasSessionCounts) {
            const deletedPeriods = new Set();
            for (const [key, isDeleted] of Object.entries(input.deletedPeriods)){
                if (!isDeleted) continue;
                const [keyDay, , keyPeriodRaw] = key.split('-');
                const keyPeriod = Number(keyPeriodRaw);
                if (keyDay === day.id && Number.isFinite(keyPeriod)) deletedPeriods.add(keyPeriod);
            }
            for(let period = 1; period <= dayLevelValue; period += 1){
                if (!deletedPeriods.has(period)) activePeriods.push(period);
            }
            periodsByDay[day.id] = activePeriods;
            continue;
        }
        let offset = 0;
        for (const session of input.sessions){
            const sessionMax = Number(input.periodCounts[session.id] ?? 0);
            for(let period = 1; period <= sessionMax; period += 1){
                const key = `${day.id}-${session.id}-${period}`;
                if (!input.deletedPeriods[key]) activePeriods.push(offset + period);
            }
            offset += sessionMax;
        }
        periodsByDay[day.id] = activePeriods;
    }
    return periodsByDay;
}
function periodsForSession(input, sessionId) {
    let offset = 0;
    for (const session of input.sessions){
        const count = Number(input.periodCounts[session.id] ?? 0);
        const periods = Array.from({
            length: Math.max(0, count)
        }, (_, index)=>offset + index + 1);
        if (session.id === sessionId) return periods;
        offset += count;
    }
    return [];
}
function normalizeConstraintText(text) {
    return text.toLocaleLowerCase('vi').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/\s+/g, ' ').trim();
}
function isAutoBaseConstraintText(text) {
    const normalized = normalizeConstraintText(text);
    const mentionsEvery = /\b(moi|tat ca|all|each)\b/u.test(normalized);
    const mentionsSlot = /\b(slot|tiet|period)\b/u.test(normalized);
    if (mentionsEvery && /\blop\b/u.test(normalized) && /\b(mon|mon hoc)\b/u.test(normalized) && mentionsSlot) {
        return true;
    }
    if (mentionsEvery && /\bgiao vien\b/u.test(normalized) && /\b(day|lop)\b/u.test(normalized) && /(qua 1|hon 1|toi da 1|1 lop)/u.test(normalized) && mentionsSlot) {
        return true;
    }
    if (mentionsEvery && /\bassignment\b/u.test(normalized) && /(dung|du|chinh xac|phai xep)/u.test(normalized) && /(so tiet|tiet\/tuan|tiet moi tuan)/u.test(normalized)) {
        return true;
    }
    return false;
}
function parseGlobalClassSubjectDailyLimit(text) {
    const normalized = normalizeConstraintText(text);
    const mentionsEvery = /\b(moi|tat ca|all|each)\b/u.test(normalized);
    const mentionsClass = /\blop\b/u.test(normalized);
    const mentionsSameSubject = /\bcung\s*(1|mot)?\s*mon\b/u.test(normalized);
    const mentionsDay = /\bngay\b/u.test(normalized);
    if (!(mentionsEvery && mentionsClass && mentionsSameSubject && mentionsDay)) {
        return null;
    }
    const m = normalized.match(/(?:khong qua|toi da|hon|qua)\s*(\d+)/u);
    const maxPerDay = m ? Number(m[1]) : 1;
    if (!Number.isFinite(maxPerDay) || maxPerDay < 1) return null;
    return {
        maxPerDay
    };
}
function markAutoBaseSpec(spec) {
    const tags = new Set(spec.tags ?? []);
    tags.add('auto_base');
    return {
        ...spec,
        severity: 'info',
        tags: [
            ...tags
        ]
    };
}
function isResourceCapacityText(text) {
    const normalized = normalizeConstraintText(text);
    const match = normalized.match(/(.+?)\s+toi\s+da\s+(\d+)\s+lop\s+cung\s+slot/iu);
    if (match) {
        const subject = match[1].trim();
        const capacity = Number(match[2]);
        if (subject && Number.isFinite(capacity) && capacity > 0) return {
            subject,
            capacity
        };
    }
    return null;
}
function isSessionLimitText(text) {
    const normalized = normalizeConstraintText(text);
    const match = normalized.match(/(?:moi|tat ca|all|each)\s+giao vien\s+khong\s+day\s+qua\s+(\d+)\s+tiet\s+trong\s+cung\s+1\s+buoi\s+(sang|chieu)/iu);
    if (match) {
        const maxPeriods = Number(match[1]);
        const session = match[2].toLowerCase().includes('sang') ? 'morning' : 'afternoon';
        if (Number.isFinite(maxPeriods) && maxPeriods > 0) return {
            teacher: '',
            maxPeriods,
            session
        };
    }
    return null;
}
function isSubjectGroupText(text) {
    const normalized = normalizeConstraintText(text);
    const match = normalized.match(/mon\s+(.+?)\s+gom\s*:\s*(.+)/iu);
    if (match) {
        const name = match[1].trim();
        const subjects = match[2].split(/[,;]/u).map((s)=>s.trim()).filter(Boolean);
        if (name && subjects.length > 0) return {
            name,
            subjects
        };
    }
    return null;
}
function isSubjectGroupDailyLimitText(text) {
    const normalized = normalizeConstraintText(text);
    const match = normalized.match(/(?:moi|tat ca|all|each)\s+lop\s+khong\s+duoc\s+co\s+qua\s+(\d+)\s+mon\s+(.+?)\s+trong\s+cung\s+1\s+ngay/iu);
    if (match) {
        const maxPerDay = Number(match[1]);
        const groupName = match[2].trim();
        if (groupName && Number.isFinite(maxPerDay) && maxPerDay > 0) return {
            groupName,
            maxPerDay
        };
    }
    return null;
}
function splitFallbackConstraintText(text) {
    if (/(nếu|neu)[\s\S]*(thì|thi)/iu.test(text)) {
        return [
            text.trim()
        ].filter(Boolean);
    }
    const hasPredicate = (clause)=>/(không|khong|chỉ|chi|phải|phai|tối\s*đa|toi\s*da|max|đúng|dung|chính\s*xác|chinh\s*xac|liên\s*tiếp|lien\s*tiep|cùng|trùng|cung|trung)/iu.test(clause);
    return text.split(/(?:;|\n|\r|\s+(?:đồng\s+thời|dong\s+thoi)\s+)/iu).flatMap((segment)=>{
        const clauses = [];
        let remainder = segment.trim();
        while(remainder){
            const match = /\s+(?:và)\s+/iu.exec(remainder);
            if (!match) {
                clauses.push(remainder);
                break;
            }
            const before = remainder.slice(0, match.index).trim();
            const after = remainder.slice(match.index + match[0].length).trim();
            if (!hasPredicate(before) || !hasPredicate(after)) {
                clauses.push(remainder);
                break;
            }
            clauses.push(before);
            remainder = after;
        }
        return clauses;
    }).map((clause)=>clause.trim()).filter(Boolean);
}
function fallbackFromRuleParser(input) {
    const teacherLabels = [
        ...new Set(input.assignments.map((assignment)=>assignment.teacher.label))
    ];
    const classLabels = [
        ...new Set(input.assignments.map((assignment)=>assignment.class.label))
    ];
    const subjectLabels = [
        ...new Set(input.assignments.map((assignment)=>assignment.subject.label))
    ];
    const dayIds = Object.fromEntries(input.days.map((day)=>[
            day.id,
            day.id
        ]));
    const sessionIds = Object.fromEntries(input.sessions.map((session)=>[
            session.id,
            session.id
        ]));
    let nextId = 1;
    return input.constraints.flatMap((rawConstraint)=>{
        const clauses = splitFallbackConstraintText(rawConstraint.text);
        return clauses.flatMap((clause)=>{
            const constraint = {
                ...rawConstraint,
                text: clause
            };
            const id = `c${nextId++}`;
            const parsed = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$constraint$2d$parser$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["parseConstraint"])(constraint.text, {
                teacherLabels,
                classLabels,
                subjectLabels,
                dayIds,
                sessionIds
            });
            const severity = constraint.type === 'required' ? 'hard' : 'soft';
            if (/nếu|neu/iu.test(constraint.text) && /thì|thi/iu.test(constraint.text)) {
                const [ifClauseRaw, thenClauseRaw = ''] = constraint.text.split(/thì|thi/iu);
                const ifTeachers = teacherLabels.filter((label)=>includesLabel(ifClauseRaw, label));
                const ifDay = extractDayId(ifClauseRaw, input.days);
                const condition = ifTeachers.length >= 2 && ifDay ? {
                    op: 'and',
                    args: ifTeachers.slice(0, 2).map((teacher)=>({
                            op: 'teacher_teaches_on_day',
                            teacher,
                            day: ifDay
                        }))
                } : ifTeachers[0] && ifDay ? {
                    op: 'teacher_teaches_on_day',
                    teacher: ifTeachers[0],
                    day: ifDay
                } : null;
                const thenTeachers = teacherLabels.filter((label)=>includesLabel(thenClauseRaw, label));
                const thenDay = extractDayId(thenClauseRaw, input.days);
                const thenPeriod = extractFirstNumber(thenClauseRaw);
                const thenSpecs = [];
                if (/(không|khong).*(cùng|trùng).*(tiết|tiet)/iu.test(thenClauseRaw) && thenTeachers.length >= 2) {
                    thenSpecs.push({
                        kind: 'pair_not_same_slot',
                        params: {
                            teachers: thenTeachers.slice(0, 2),
                            ...thenDay ? {
                                scope: {
                                    day: thenDay
                                }
                            } : {}
                        }
                    });
                } else if (/(không|khong).*(dạy|day)/iu.test(thenClauseRaw) && thenTeachers[0] && thenDay && (extractPeriodNumber(thenClauseRaw) ?? thenPeriod) !== null) {
                    thenSpecs.push({
                        kind: 'teacher_block_slot',
                        params: {
                            teacher: thenTeachers[0],
                            day: thenDay,
                            period: extractPeriodNumber(thenClauseRaw) ?? thenPeriod
                        }
                    });
                } else if (/(không|khong).*(dạy|day)/iu.test(thenClauseRaw) && thenTeachers[0] && thenDay) {
                    thenSpecs.push({
                        kind: 'teacher_block_day',
                        params: {
                            teacher: thenTeachers[0],
                            day: thenDay
                        }
                    });
                }
                if (condition && thenSpecs.length > 0) {
                    return {
                        id,
                        original: constraint.text,
                        severity,
                        kind: 'if_then',
                        params: {
                            if: condition,
                            then: thenSpecs
                        }
                    };
                }
            }
            if (parsed.kind === 'teacher_block_days' && parsed.teacherLabels[0] && parsed.dayIds[0]) {
                return {
                    id,
                    original: constraint.text,
                    severity,
                    kind: 'teacher_block_day',
                    params: {
                        teacher: parsed.teacherLabels[0],
                        day: parsed.dayIds[0]
                    }
                };
            }
            if (parsed.kind === 'teacher_block_periods' && parsed.teacherLabels[0] && parsed.periods[0]) {
                return {
                    id,
                    original: constraint.text,
                    severity,
                    kind: 'teacher_block_period',
                    params: {
                        teacher: parsed.teacherLabels[0],
                        period: parsed.periods[0]
                    }
                };
            }
            if (parsed.kind === 'teacher_block_day_period' && parsed.teacherLabels[0] && parsed.dayIds[0] && parsed.periods[0]) {
                return {
                    id,
                    original: constraint.text,
                    severity,
                    kind: 'teacher_block_slot',
                    params: {
                        teacher: parsed.teacherLabels[0],
                        day: parsed.dayIds[0],
                        period: parsed.periods[0]
                    }
                };
            }
            if (parsed.kind === 'teacher_block_session_day' && parsed.teacherLabels[0] && parsed.sessionIds[0]) {
                const day = parsed.dayIds[0];
                return periodsForSession(input, parsed.sessionIds[0]).map((period)=>({
                        id,
                        original: constraint.text,
                        severity,
                        kind: day ? 'teacher_block_slot' : 'teacher_block_period',
                        params: day ? {
                            teacher: parsed.teacherLabels[0],
                            day,
                            period
                        } : {
                            teacher: parsed.teacherLabels[0],
                            period
                        }
                    }));
            }
            if (parsed.kind === 'teacher_block_sessions' && parsed.teacherLabels[0] && parsed.sessionIds[0]) {
                return periodsForSession(input, parsed.sessionIds[0]).map((period)=>({
                        id,
                        original: constraint.text,
                        severity,
                        kind: 'teacher_block_period',
                        params: {
                            teacher: parsed.teacherLabels[0],
                            period
                        }
                    }));
            }
            if (parsed.kind === 'teacher_allow_only_days' && parsed.teacherLabels[0] && parsed.dayIds.length > 0) {
                const allowedDays = new Set(parsed.dayIds);
                return input.days.map((day)=>day.id).filter((day)=>!allowedDays.has(day)).map((day)=>({
                        id,
                        original: constraint.text,
                        severity,
                        kind: 'teacher_block_day',
                        params: {
                            teacher: parsed.teacherLabels[0],
                            day
                        }
                    }));
            }
            if (parsed.kind === 'teacher_allow_only_sessions' && parsed.teacherLabels[0] && parsed.sessionIds.length > 0) {
                const allowedPeriods = new Set(parsed.sessionIds.flatMap((sessionId)=>periodsForSession(input, sessionId)));
                return buildTranslatorPeriods(input).filter((period)=>!allowedPeriods.has(period)).map((period)=>({
                        id,
                        original: constraint.text,
                        severity,
                        kind: 'teacher_block_period',
                        params: {
                            teacher: parsed.teacherLabels[0],
                            period
                        }
                    }));
            }
            if (parsed.kind === 'teacher_max_consecutive') {
                const teacher = parsed.teacherLabels === '*' ? '' : parsed.teacherLabels[0];
                if (teacher) {
                    return {
                        id,
                        original: constraint.text,
                        severity,
                        kind: 'teacher_max_consecutive',
                        params: {
                            teacher,
                            maxConsecutive: parsed.max
                        }
                    };
                }
            }
            if (parsed.kind === 'subject_pin_periods' && parsed.subjectLabels[0] && parsed.periods.length > 0) {
                const classes = classLabels.filter((label)=>includesLabel(constraint.text, label));
                return {
                    id,
                    original: constraint.text,
                    severity,
                    kind: 'subject_pin_period',
                    params: {
                        subject: parsed.subjectLabels[0],
                        periods: parsed.periods,
                        ...classes.length ? {
                            classes
                        } : {}
                    }
                };
            }
            if (parsed.kind === 'subject_block_periods' && parsed.subjectLabels[0] && parsed.periods.length > 0) {
                const blockedPeriods = new Set(parsed.periods);
                const allowedPeriods = buildTranslatorPeriods(input).filter((period)=>!blockedPeriods.has(period));
                if (allowedPeriods.length > 0) {
                    const classes = classLabels.filter((label)=>includesLabel(constraint.text, label));
                    return {
                        id,
                        original: constraint.text,
                        severity,
                        kind: 'subject_pin_period',
                        params: {
                            subject: parsed.subjectLabels[0],
                            periods: allowedPeriods,
                            ...classes.length ? {
                                classes
                            } : {}
                        }
                    };
                }
            }
            if (parsed.kind === 'subject_only_sessions' && parsed.subjectLabels[0] && parsed.sessionIds.length > 0) {
                const allowedPeriods = parsed.sessionIds.flatMap((sessionId)=>periodsForSession(input, sessionId));
                if (allowedPeriods.length > 0) {
                    const classes = classLabels.filter((label)=>includesLabel(constraint.text, label));
                    return {
                        id,
                        original: constraint.text,
                        severity,
                        kind: 'subject_pin_period',
                        params: {
                            subject: parsed.subjectLabels[0],
                            periods: allowedPeriods,
                            ...classes.length ? {
                                classes
                            } : {}
                        }
                    };
                }
            }
            if (parsed.kind === 'subject_prefer_periods' && parsed.subjectLabels[0] && parsed.periods.length > 0) {
                const classes = classLabels.filter((label)=>includesLabel(constraint.text, label));
                const isPinned = /(chỉ|chi|duy\s*nhất|duy\s*nhat)/u.test(constraint.text);
                if (isPinned) {
                    return {
                        id,
                        original: constraint.text,
                        severity,
                        kind: 'subject_pin_period',
                        params: {
                            subject: parsed.subjectLabels[0],
                            periods: parsed.periods,
                            ...classes.length ? {
                                classes
                            } : {}
                        }
                    };
                }
            }
            if (parsed.kind === 'subject_block_consecutive' && parsed.subjectLabels[0]) {
                const classes = classLabels.filter((label)=>includesLabel(constraint.text, label));
                return {
                    id,
                    original: constraint.text,
                    severity,
                    kind: 'subject_consecutive',
                    params: {
                        subject: parsed.subjectLabels[0],
                        length: parsed.blockSize || 2,
                        ...classes.length ? {
                            classes
                        } : {}
                    }
                };
            }
            const mentionsLegacyNoDouble = /không\s*học|khong\s*hoc/u.test(constraint.text) && /(2|hai).*(lần|lan|tiết|tiet).*(ngày|ngay)/u.test(constraint.text);
            const mentionsDailyLimitText = /(không\s*quá|khong\s*qua|không\s*học|khong\s*hoc|tối\s*đa|toi\s*da)/u.test(constraint.text) && /(cùng|cung).*(môn|mon)/u.test(constraint.text) && /(ngày|ngay)/u.test(constraint.text);
            if (mentionsLegacyNoDouble || mentionsDailyLimitText) {
                const klass = classLabels.find((label)=>includesLabel(constraint.text, label));
                if (klass) {
                    const subject = subjectLabels.find((label)=>includesLabel(constraint.text, label));
                    const limitMatch = normalizeConstraintText(constraint.text).match(/(?:khong qua|toi da|hon|qua)\s*(\d+)/u);
                    const parsedLimit = limitMatch ? Number(limitMatch[1]) : 1;
                    const maxPerDay = Number.isFinite(parsedLimit) && parsedLimit >= 1 ? parsedLimit : 1;
                    return {
                        id,
                        original: constraint.text,
                        severity,
                        kind: 'class_no_double_subject_day',
                        params: {
                            class: klass,
                            ...subject ? {
                                subject
                            } : {},
                            maxPerDay
                        }
                    };
                }
            }
            const globalDailyLimit = parseGlobalClassSubjectDailyLimit(constraint.text);
            if (globalDailyLimit) {
                const classSubjectPairs = [
                    ...new Map(input.assignments.map((assignment)=>[
                            `${assignment.class.label}::${assignment.subject.label}`,
                            {
                                class: assignment.class.label,
                                subject: assignment.subject.label
                            }
                        ])).values()
                ];
                return classSubjectPairs.map((pair, pairIndex)=>({
                        id: classSubjectPairs.length === 1 ? id : `${id}_${pairIndex + 1}`,
                        original: constraint.text,
                        severity,
                        kind: 'class_no_double_subject_day',
                        params: {
                            ...pair,
                            maxPerDay: globalDailyLimit.maxPerDay
                        }
                    }));
            }
            if (/(tối\s*đa|max).*(tiết|tiet).*(ngày|ngay)/u.test(constraint.text)) {
                const teacher = teacherLabels.find((label)=>includesLabel(constraint.text, label));
                const maxPerDay = extractFirstNumber(constraint.text);
                if (teacher && maxPerDay !== null) {
                    return {
                        id,
                        original: constraint.text,
                        severity,
                        kind: 'teacher_max_per_day',
                        params: {
                            teacher,
                            maxPerDay
                        }
                    };
                }
            }
            if (/(không|khong).*(cùng|trùng).*(tiết|tiet)/u.test(constraint.text)) {
                const teachers = teacherLabels.filter((label)=>includesLabel(constraint.text, label)).slice(0, 2);
                if (teachers.length === 2) {
                    const day = extractDayId(constraint.text, input.days);
                    return {
                        id,
                        original: constraint.text,
                        severity,
                        kind: 'pair_not_same_slot',
                        params: {
                            teachers,
                            ...day ? {
                                scope: {
                                    day
                                }
                            } : {}
                        }
                    };
                }
            }
            if (/(đúng|dung|chính\s*xác).*(tiết|tiet)/u.test(constraint.text)) {
                const weeklyPeriods = extractFirstNumber(constraint.text);
                if (weeklyPeriods !== null) {
                    const teacher = teacherLabels.find((label)=>includesLabel(constraint.text, label));
                    const subject = subjectLabels.find((label)=>includesLabel(constraint.text, label));
                    const klass = classLabels.find((label)=>includesLabel(constraint.text, label));
                    const matchedAssignments = input.assignments.filter((assignment)=>{
                        if (teacher && assignment.teacher.label !== teacher) return false;
                        if (subject && assignment.subject.label !== subject) return false;
                        if (klass && assignment.class.label !== klass) return false;
                        return true;
                    });
                    const assignmentId = matchedAssignments.length === 1 ? matchedAssignments[0].id : undefined;
                    if (teacher || subject || klass) {
                        return {
                            id,
                            original: constraint.text,
                            severity,
                            kind: 'weekly_periods_exact',
                            params: {
                                ...teacher ? {
                                    teacher
                                } : {},
                                ...subject ? {
                                    subject
                                } : {},
                                ...klass ? {
                                    class: klass
                                } : {},
                                ...assignmentId ? {
                                    assignmentId
                                } : {},
                                weeklyPeriods
                            }
                        };
                    }
                }
            }
            const resourceCapacity = isResourceCapacityText(constraint.text);
            if (resourceCapacity) {
                return {
                    id,
                    original: constraint.text,
                    severity,
                    kind: 'resource_capacity',
                    params: resourceCapacity
                };
            }
            const sessionLimit = isSessionLimitText(constraint.text);
            if (sessionLimit) {
                return {
                    id,
                    original: constraint.text,
                    severity,
                    kind: 'session_limit',
                    params: sessionLimit
                };
            }
            const subjectGroup = isSubjectGroupText(constraint.text);
            if (subjectGroup) {
                return {
                    id,
                    original: constraint.text,
                    severity,
                    kind: 'subject_group',
                    params: subjectGroup
                };
            }
            const subjectGroupLimit = isSubjectGroupDailyLimitText(constraint.text);
            if (subjectGroupLimit) {
                return {
                    id,
                    original: constraint.text,
                    severity,
                    kind: 'subject_group_daily_limit',
                    params: subjectGroupLimit
                };
            }
            const fallbackSpec = {
                id,
                original: constraint.text,
                severity,
                kind: 'custom_dsl',
                params: {
                    naturalLanguage: constraint.text
                },
                notes: severity === 'hard' ? 'fallback_parser:UNPARSED_HARD' : 'fallback_parser'
            };
            return isAutoBaseConstraintText(constraint.text) ? markAutoBaseSpec(fallbackSpec) : fallbackSpec;
        });
    });
}
function sanitizeSpecs(input, specs) {
    const validTeachers = new Set(input.assignments.map((assignment)=>assignment.teacher.label));
    const validClasses = new Set(input.assignments.map((assignment)=>assignment.class.label));
    const validSubjects = new Set(input.assignments.map((assignment)=>assignment.subject.label));
    const validDays = new Set(input.days.map((day)=>day.id));
    return specs.flatMap((spec, index)=>{
        const base = {
            ...spec,
            id: `c${index + 1}`,
            original: spec.original || input.constraints[index]?.text || '',
            severity: spec.severity ?? (input.constraints[index]?.type === 'required' ? 'hard' : 'soft'),
            params: spec.params ?? {},
            tags: spec.tags ?? []
        };
        const teacher = typeof base.params.teacher === 'string' ? base.params.teacher : null;
        const klass = typeof base.params.class === 'string' ? base.params.class : null;
        const subject = typeof base.params.subject === 'string' ? base.params.subject : null;
        const day = typeof base.params.day === 'string' ? base.params.day : null;
        const weeklyPeriods = Number(base.params.weeklyPeriods ?? NaN);
        const period = Number(base.params.period ?? NaN);
        if (base.kind === 'custom_dsl' && base.original.trim() && isAutoBaseConstraintText(base.original)) {
            return markAutoBaseSpec(base);
        }
        if (base.kind === 'custom_dsl' && base.original.trim()) {
            const fallback = fallbackFromRuleParser({
                ...input,
                constraints: [
                    {
                        type: base.severity === 'hard' ? 'required' : 'preferred',
                        text: base.original
                    }
                ]
            });
            const reparsed = fallback.filter((item)=>item.kind !== 'custom_dsl');
            if (reparsed.length > 0) {
                return reparsed.map((item, itemIndex)=>({
                        ...item,
                        id: reparsed.length === 1 ? base.id : `${base.id}_${itemIndex + 1}`,
                        original: base.original,
                        severity: base.severity,
                        tags: base.tags
                    }));
            }
            if (fallback.length === 0) return [];
        }
        if (base.kind === 'teacher_block_day' && /(?:buổi|buoi|sáng|sang|chiều|chieu|tối|toi)/iu.test(base.original)) {
            const reparsed = fallbackFromRuleParser({
                ...input,
                constraints: [
                    {
                        type: base.severity === 'hard' ? 'required' : 'preferred',
                        text: base.original
                    }
                ]
            }).filter((item)=>item.kind !== 'custom_dsl');
            if (reparsed.length > 0) {
                return reparsed.map((item, itemIndex)=>({
                        ...item,
                        id: reparsed.length === 1 ? base.id : `${base.id}_${itemIndex + 1}`,
                        original: base.original,
                        severity: base.severity,
                        tags: base.tags
                    }));
            }
        }
        if ((base.kind === 'teacher_block_period' || base.kind === 'teacher_block_slot') && (!Number.isFinite(period) || period <= 0)) {
            const reparsed = fallbackFromRuleParser({
                ...input,
                constraints: [
                    {
                        type: base.severity === 'hard' ? 'required' : 'preferred',
                        text: base.original
                    }
                ]
            }).filter((item)=>item.kind !== 'custom_dsl');
            if (reparsed.length > 0) {
                return reparsed.map((item, itemIndex)=>({
                        ...item,
                        id: reparsed.length === 1 ? base.id : `${base.id}_${itemIndex + 1}`,
                        original: base.original,
                        severity: base.severity,
                        tags: base.tags
                    }));
            }
        }
        if (teacher && !validTeachers.has(teacher)) {
            return {
                ...base,
                kind: 'custom_dsl',
                params: {
                    naturalLanguage: base.original
                },
                notes: `unknown_teacher:${teacher}`
            };
        }
        if (klass && !validClasses.has(klass)) {
            return {
                ...base,
                kind: 'custom_dsl',
                params: {
                    naturalLanguage: base.original
                },
                notes: `unknown_class:${klass}`
            };
        }
        if (subject && !validSubjects.has(subject)) {
            return {
                ...base,
                kind: 'custom_dsl',
                params: {
                    naturalLanguage: base.original
                },
                notes: `unknown_subject:${subject}`
            };
        }
        if (day && !validDays.has(day)) {
            return {
                ...base,
                kind: 'custom_dsl',
                params: {
                    naturalLanguage: base.original
                },
                notes: `unknown_day:${day}`
            };
        }
        let weeklySpec = base;
        if (base.kind === 'weekly_periods_exact') {
            const currentAssignmentId = typeof base.params.assignmentId === 'string' ? base.params.assignmentId : '';
            if (!currentAssignmentId && Number.isFinite(weeklyPeriods)) {
                const inferred = inferWeeklyAssignmentId(input.assignments, teacher, subject, klass, weeklyPeriods);
                if (inferred) {
                    weeklySpec = {
                        ...weeklySpec,
                        params: {
                            ...weeklySpec.params,
                            assignmentId: inferred
                        }
                    };
                }
            }
        }
        if (weeklySpec.kind === 'weekly_periods_exact' && shouldMarkWeeklyAutoBase(weeklySpec, input.assignments)) {
            const mergedTags = new Set(base.tags ?? []);
            mergedTags.add('auto_base');
            return {
                ...weeklySpec,
                severity: 'info',
                tags: [
                    ...mergedTags
                ]
            };
        }
        return weeklySpec;
    });
}
function inferWeeklyAssignmentId(assignments, teacher, subject, klass, weeklyPeriods) {
    const matched = assignments.filter((assignment)=>{
        if (teacher && assignment.teacher.label !== teacher) return false;
        if (subject && assignment.subject.label !== subject) return false;
        if (klass && assignment.class.label !== klass) return false;
        return assignment.weeklyPeriods === weeklyPeriods;
    });
    return matched.length === 1 ? matched[0].id : null;
}
function shouldMarkWeeklyAutoBase(spec, assignments) {
    if (spec.kind !== 'weekly_periods_exact') return false;
    const assignmentId = typeof spec.params.assignmentId === 'string' ? spec.params.assignmentId : '';
    if (!assignmentId) return false;
    const weeklyPeriods = Number(spec.params.weeklyPeriods ?? NaN);
    if (!Number.isFinite(weeklyPeriods)) return false;
    const assignment = assignments.find((item)=>item.id === assignmentId);
    if (!assignment) return false;
    return assignment.weeklyPeriods === weeklyPeriods;
}
function loadTranslatorSystemPrompt() {
    return fetch('/prompts/translator.system.md').then(async (response)=>{
        if (!response.ok) {
            return 'You are a Constraint Translator. Output strict JSON.';
        }
        return response.text();
    }).catch(()=>'You are a Constraint Translator. Output strict JSON.');
}
async function runTranslatorTurn(config, input, invokeChat = defaultInvokeChat) {
    const systemPrompt = await loadTranslatorSystemPrompt();
    const periods = buildTranslatorPeriods(input);
    const context = {
        teachers: [
            ...new Set(input.assignments.map((assignment)=>assignment.teacher.label))
        ],
        classes: [
            ...new Set(input.assignments.map((assignment)=>assignment.class.label))
        ],
        subjects: [
            ...new Set(input.assignments.map((assignment)=>assignment.subject.label))
        ],
        days: input.days,
        periods,
        periodsByDay: buildTranslatorPeriodsByDay(input)
    };
    const payload = {
        baseURL: config.baseURL || 'https://openrouter.ai/api/v1',
        apiKey: config.apiKey,
        model: config.model,
        messages: [
            {
                role: 'system',
                content: systemPrompt
            },
            {
                role: 'user',
                content: JSON.stringify({
                    context,
                    raw_constraints: input.constraints.map((constraint)=>({
                            text: constraint.text,
                            severity_hint: constraint.type === 'required' ? 'hard' : 'soft'
                        }))
                }, null, 0)
            }
        ],
        temperature: 0,
        max_tokens: 3500,
        response_format: {
            type: 'json_schema',
            json_schema: {
                name: 'translator_specs',
                schema: {
                    type: 'object',
                    properties: {
                        constraintSpecs: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    id: {
                                        type: 'string'
                                    },
                                    original: {
                                        type: 'string'
                                    },
                                    severity: {
                                        type: 'string',
                                        enum: [
                                            'hard',
                                            'soft',
                                            'info'
                                        ]
                                    },
                                    kind: {
                                        type: 'string',
                                        enum: [
                                            'teacher_block_day',
                                            'teacher_block_period',
                                            'teacher_block_slot',
                                            'teacher_max_per_day',
                                            'teacher_max_consecutive',
                                            'subject_pin_period',
                                            'subject_consecutive',
                                            'class_no_double_subject_day',
                                            'weekly_periods_exact',
                                            'if_then',
                                            'pair_not_same_slot',
                                            'resource_capacity',
                                            'session_limit',
                                            'subject_group',
                                            'subject_group_daily_limit',
                                            'custom_dsl'
                                        ]
                                    },
                                    params: {
                                        type: 'object',
                                        additionalProperties: true
                                    },
                                    tags: {
                                        type: 'array',
                                        items: {
                                            type: 'string',
                                            enum: [
                                                'auto_base',
                                                'user_required',
                                                'user_preferred'
                                            ]
                                        }
                                    },
                                    notes: {
                                        type: 'string'
                                    }
                                },
                                required: [
                                    'id',
                                    'original',
                                    'severity',
                                    'kind',
                                    'params'
                                ],
                                additionalProperties: false
                            }
                        }
                    },
                    required: [
                        'constraintSpecs'
                    ],
                    additionalProperties: false
                }
            }
        }
    };
    try {
        const response = await invokeChat(payload);
        const parsedJson = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$ai$2f$parse$2d$model$2d$json$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["parseModelJson"])(response.content);
        const validated = translatorResponseSchema.parse(parsedJson);
        const sanitized = sanitizeSpecs(input, validated.constraintSpecs);
        return {
            constraintSpecs: sanitized,
            rawResponse: response.content,
            usageTokens: response.usage?.total_tokens
        };
    } catch  {
        return {
            constraintSpecs: fallbackFromRuleParser(input),
            rawResponse: '',
            usageTokens: 0
        };
    }
}
const __translatorInternal = {
    sanitizeSpecs,
    buildTranslatorPeriods,
    buildTranslatorPeriodsByDay,
    splitFallbackConstraintText,
    fallbackFromRuleParser
};
}),
"[project]/src/features/timetable/ai/workspace.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "WorkspaceBoard",
    ()=>WorkspaceBoard
]);
class WorkspaceBoard {
    state = {
        attempts: []
    };
    setDataset(dataset) {
        this.state.dataset = dataset;
    }
    setConstraintSpecs(constraintSpecs) {
        this.state.constraintSpecs = constraintSpecs;
    }
    setPlan(plan) {
        this.state.plan = plan;
    }
    setLatestConstraintCode(latestConstraintCode) {
        this.state.latestConstraintCode = latestConstraintCode;
    }
    setLatestGeneratedSolver(latestGeneratedSolver) {
        this.state.latestGeneratedSolver = latestGeneratedSolver;
    }
    setViolations(violations) {
        this.state.violations = violations;
    }
    setErrorDigest(errorDigest) {
        this.state.errorDigest = errorDigest;
    }
    addAttempt(stage, summary) {
        this.state.attempts.push({
            stage,
            summary,
            at: new Date().toISOString()
        });
    }
    snapshot() {
        return structuredClone(this.state);
    }
}
}),
"[project]/src/features/timetable/ai/local-agent.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "__localAgentInternal",
    ()=>__localAgentInternal,
    "runLocalAgent",
    ()=>runLocalAgent
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$ai$2f$budget$2d$guard$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/features/timetable/ai/budget-guard.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$ai$2f$coder$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/features/timetable/ai/coder.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$ai$2f$cp$2d$sat$2d$roundtrip$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/features/timetable/ai/cp-sat-roundtrip.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$ai$2f$deterministic$2d$validator$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/features/timetable/ai/deterministic-validator.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$ai$2f$input$2d$compressor$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/features/timetable/ai/input-compressor.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$ai$2f$planner$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/features/timetable/ai/planner.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$ai$2f$python$2d$bridge$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/features/timetable/ai/python-bridge.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$ai$2f$repair$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/features/timetable/ai/repair.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$ai$2f$skeleton$2d$injector$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/features/timetable/ai/skeleton-injector.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$ai$2f$translator$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/features/timetable/ai/translator.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$ai$2f$workspace$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/features/timetable/ai/workspace.ts [app-ssr] (ecmascript)");
;
;
;
;
;
;
;
;
;
;
;
const MAX_CODER_RETRIES = 3;
const MAX_RUNTIME_REPAIR_ROUNDS = 1;
const MAX_VIOLATION_REPAIR_ROUNDS = 2;
const MAX_TOTAL_TOOL_CALLS = 15;
const TOKEN_CAP_PER_RUN = 80_000;
function emit(config, event) {
    config.onEvent?.(event);
}
function pickStageConfig(config, stage) {
    const model = stage === 'translator' ? config.modelTranslator : stage === 'planner' ? config.modelPlanner : stage === 'coder' ? config.modelCoder : config.modelRepair;
    return {
        ...config,
        model: model || config.model
    };
}
function consumeBudget(budget, usageTokens, ...fallbackChunks) {
    if (typeof usageTokens === 'number' && Number.isFinite(usageTokens) && usageTokens > 0) {
        budget.consumeUsage(usageTokens);
    } else {
        budget.consumeText(...fallbackChunks);
    }
    budget.ensureWithinLimit();
}
function buildViolationSignature(hardViolations, roundTripOk, roundTripMessage) {
    const signature = hardViolations.map((violation)=>`${violation.constraintId}:${violation.kind}`).sort().join('|');
    const roundTripSignature = roundTripOk ? 'rt:ok' : `rt:fail:${normalizeRoundTripMessage(roundTripMessage)}`;
    return `${signature}||${roundTripSignature}`;
}
function normalizeRoundTripMessage(message) {
    return message.replace(/asg_\d+/g, 'ASG').replace(/\b\d{3,}\b/g, 'N').trim();
}
function buildCoderExhaustedMessage(lastFailureSummary) {
    const detail = lastFailureSummary.trim();
    if (!detail) return 'Coder could not produce an executable schedule.';
    return `Coder could not produce an executable schedule. Last failure: ${detail}`;
}
function buildRepeatedViolationMessage(sampleMessages) {
    const detail = sampleMessages.filter(Boolean).slice(0, 3).join(' | ');
    if (!detail) {
        return 'Không tạo được thời khóa biểu sau khi agent sửa lặp lại cùng một lỗi.';
    }
    return `Không tạo được thời khóa biểu sau khi agent sửa lặp lại cùng một lỗi: ${detail}`;
}
function shouldRepairExecutableFailure(latestConstraintCode, lastFailureSummary, repairRound) {
    return Boolean(latestConstraintCode.trim() && lastFailureSummary.trim() && repairRound < MAX_RUNTIME_REPAIR_ROUNDS);
}
async function runLocalAgent(input, config) {
    const timeoutMs = config.timeoutMs ?? 360_000;
    const startedAt = Date.now();
    const deadlineAt = startedAt + timeoutMs;
    const budget = new __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$ai$2f$budget$2d$guard$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["TokenBudgetGuard"](TOKEN_CAP_PER_RUN);
    const board = new __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$ai$2f$workspace$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["WorkspaceBoard"]();
    let totalToolCalls = 0;
    try {
        emit(config, {
            type: 'status',
            message: 'Khởi tạo pipeline v2...',
            iteration: 0,
            maxIterations: MAX_CODER_RETRIES
        });
        emit(config, {
            type: 'phase',
            phase: 'translator',
            message: 'Đang dịch constraints',
            iteration: 0
        });
        emit(config, {
            type: 'stage_started',
            stage: 'translator',
            message: 'Translator started'
        });
        const translator = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$ai$2f$translator$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["runTranslatorTurn"])(pickStageConfig(config, 'translator'), input);
        consumeBudget(budget, translator.usageTokens, JSON.stringify(input.constraints), translator.rawResponse ?? '');
        totalToolCalls += 1;
        emit(config, {
            type: 'stage_completed',
            stage: 'translator',
            message: `Translator done (${translator.constraintSpecs.length} specs)`
        });
        const compressed = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$ai$2f$input$2d$compressor$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["compressPayload"])(input, translator.constraintSpecs);
        const solverConstraintSpecs = translator.constraintSpecs.filter((spec)=>!(spec.kind === 'weekly_periods_exact' && spec.tags?.includes('auto_base')));
        const hasCustomConstraintSpecs = solverConstraintSpecs.some((spec)=>spec.kind === 'custom_dsl' && spec.severity === 'hard');
        board.setConstraintSpecs(translator.constraintSpecs);
        board.setDataset(compressed);
        emit(config, {
            type: 'phase',
            phase: 'planner',
            message: 'Đang tạo kế hoạch solver',
            iteration: 0
        });
        emit(config, {
            type: 'stage_started',
            stage: 'planner',
            message: 'Planner started'
        });
        const planner = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$ai$2f$planner$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["runPlannerTurn"])(pickStageConfig(config, 'planner'), {
            datasetDigest: {
                classes: compressed.datasetDigest.classCount,
                days: compressed.datasetDigest.dayCount,
                periods: compressed.datasetDigest.periodCount,
                estimated: compressed.datasetDigest.classCount * compressed.datasetDigest.dayCount * Math.max(1, compressed.datasetDigest.periodCount) * Math.max(1, compressed.datasetDigest.totalAssignments)
            },
            constraintSpecs: translator.constraintSpecs
        });
        consumeBudget(budget, planner.usageTokens, JSON.stringify(planner.plan), planner.rawResponse ?? '');
        totalToolCalls += 1;
        board.setPlan(planner.plan);
        emit(config, {
            type: 'stage_completed',
            stage: 'planner',
            message: 'Planner done'
        });
        const skeleton = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$ai$2f$skeleton$2d$injector$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["loadSolverSkeleton"])();
        let previousAttemptSummary = '';
        // Tách rõ 2 vòng repair: runtime/compile error tối đa 1 round,
        // violations tối đa 2 round để tránh tổng token repair phình lên 2+2.
        let runtimeRepairRound = 0;
        let violationRepairRound = 0;
        let previousViolationSignature = '';
        let repeatedViolationCount = 0;
        let latestConstraintCode = '';
        let latestCoveredConstraintIds = new Set();
        let pendingRepairPatches = null;
        while(true){
            let coderRetry = 0;
            let lastReport = null;
            let lastRoundTrip = null;
            while(coderRetry < MAX_CODER_RETRIES){
                if (Date.now() > deadlineAt) {
                    throw new Error(`Agent timeout after ${Math.ceil((Date.now() - startedAt) / 1000)}s.`);
                }
                if (totalToolCalls >= MAX_TOTAL_TOOL_CALLS) {
                    throw new Error(`Stopped by MAX_TOTAL_TOOL_CALLS=${MAX_TOTAL_TOOL_CALLS}.`);
                }
                const attempt = coderRetry + 1;
                emit(config, {
                    type: 'phase',
                    phase: 'coding',
                    message: `Coder attempt ${attempt}`,
                    iteration: attempt
                });
                if (pendingRepairPatches?.length && latestConstraintCode) {
                    try {
                        latestConstraintCode = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$ai$2f$repair$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["applyRepairPatches"])(latestConstraintCode, pendingRepairPatches);
                        // Sau repair, có thể có constraint IDs mới được cover. Cập nhật
                        // covered set dựa trên các comment id còn lại trong code.
                        // (fix bug #1 — trước đây giữ nguyên covered cũ, dễ false-positive.)
                        const refreshed = new Set(latestCoveredConstraintIds);
                        for (const spec of translator.constraintSpecs){
                            if (spec.kind !== 'custom_dsl') continue;
                            const re = new RegExp(`(^|[^A-Za-z0-9_])${spec.id}([^A-Za-z0-9_]|$)`, 'm');
                            if (re.test(latestConstraintCode)) refreshed.add(spec.id);
                        }
                        latestCoveredConstraintIds = refreshed;
                        board.addAttempt('repair_patch_applied', `round=${Math.max(runtimeRepairRound, violationRepairRound)} patches=${pendingRepairPatches.length}`);
                        pendingRepairPatches = null;
                        emit(config, {
                            type: 'stage_completed',
                            stage: 'coder',
                            attempt,
                            message: 'Applied repair patches from previous round'
                        });
                    } catch (err) {
                        const message = err instanceof Error ? err.message : 'Repair patch failed';
                        previousAttemptSummary = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$ai$2f$input$2d$compressor$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["digestError"])(`Repair patch apply failed: ${message}`);
                        board.setErrorDigest(previousAttemptSummary);
                        pendingRepairPatches = null;
                        coderRetry += 1;
                        emit(config, {
                            type: 'error',
                            message: `Repair patch apply failed at attempt ${attempt}: ${message}`,
                            fatal: false
                        });
                        continue;
                    }
                } else {
                    emit(config, {
                        type: 'stage_started',
                        stage: 'coder',
                        attempt,
                        message: 'Coder started'
                    });
                    let coder;
                    try {
                        coder = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$ai$2f$coder$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["runCoderTurn"])(pickStageConfig(config, 'coder'), {
                            dataset: compressed,
                            plan: planner.plan,
                            previousAttemptSummary
                        });
                    } catch (error) {
                        const message = error instanceof Error ? error.message : 'Coder returned an invalid model response.';
                        previousAttemptSummary = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$ai$2f$input$2d$compressor$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["digestError"])(message);
                        board.setErrorDigest(previousAttemptSummary);
                        totalToolCalls += 1;
                        coderRetry += 1;
                        emit(config, {
                            type: 'error',
                            message: `Coder attempt ${attempt} failed: ${previousAttemptSummary}`,
                            fatal: false
                        });
                        continue;
                    }
                    totalToolCalls += 1;
                    consumeBudget(budget, coder.usageTokens, JSON.stringify(compressed.datasetDigest), coder.rawResponse ?? '');
                    latestConstraintCode = coder.constraint_code;
                    latestCoveredConstraintIds = new Set(coder.covered_constraint_ids);
                    emit(config, {
                        type: 'stage_completed',
                        stage: 'coder',
                        attempt,
                        message: 'Coder output received'
                    });
                }
                board.setLatestConstraintCode(latestConstraintCode);
                const injected = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$ai$2f$skeleton$2d$injector$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["injectConstraintCode"])(skeleton, latestConstraintCode);
                if (!injected.injected) {
                    throw new Error('Solver skeleton marker not found.');
                }
                const syntax = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$ai$2f$skeleton$2d$injector$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["syntaxCheckPython"])(injected.solverCode);
                if (!syntax.ok) {
                    previousAttemptSummary = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$ai$2f$input$2d$compressor$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["digestError"])(syntax.error || 'Python syntax error');
                    board.setErrorDigest(previousAttemptSummary);
                    coderRetry += 1;
                    continue;
                }
                const astCheck = hasCustomConstraintSpecs && latestConstraintCode.trim() ? await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$ai$2f$skeleton$2d$injector$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["astCheckPython"])(latestConstraintCode) : {
                    ok: true
                };
                if (!astCheck.ok) {
                    previousAttemptSummary = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$ai$2f$input$2d$compressor$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["digestError"])(astCheck.error || 'AST check rejected the generated code.');
                    board.setErrorDigest(previousAttemptSummary);
                    coderRetry += 1;
                    emit(config, {
                        type: 'error',
                        message: `AST check failed at attempt ${attempt}: ${previousAttemptSummary}`,
                        fatal: false
                    });
                    continue;
                }
                board.setLatestGeneratedSolver(injected.solverCode);
                emit(config, {
                    type: 'phase',
                    phase: 'running',
                    message: 'Đang chạy solver',
                    iteration: attempt
                });
                const executePayload = {
                    classes: compressed.classes,
                    days: compressed.days,
                    periodsByDay: compressed.periodsByDay,
                    periods: compressed.periods,
                    assignments: compressed.assignments,
                    constraints: solverConstraintSpecs
                };
                let execResult;
                try {
                    execResult = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$ai$2f$python$2d$bridge$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["executeGeneratedCode"])(injected.solverCode, executePayload, {
                        timeoutMs
                    });
                } catch (error) {
                    previousAttemptSummary = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$ai$2f$input$2d$compressor$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["digestError"])(error instanceof Error ? error.message : 'Solver execution failed.');
                    board.setErrorDigest(previousAttemptSummary);
                    coderRetry += 1;
                    emit(config, {
                        type: 'error',
                        message: `Solver execution attempt ${attempt} failed: ${previousAttemptSummary}`,
                        fatal: false
                    });
                    continue;
                }
                totalToolCalls += 1;
                emit(config, {
                    type: 'execution_result',
                    attempt,
                    result: execResult
                });
                if (!execResult.ok || !execResult.resultData) {
                    previousAttemptSummary = execResult.errorDigest || 'Solver execution failed.';
                    board.setErrorDigest(previousAttemptSummary);
                    coderRetry += 1;
                    continue;
                }
                emit(config, {
                    type: 'phase',
                    phase: 'checking',
                    message: 'Đang deterministic validate',
                    iteration: attempt
                });
                const scheduleWithAssignmentIds = execResult.resultData.schedule.map((entry)=>{
                    if (entry.assignmentId) return entry;
                    const matchingAssignments = compressed.assignments.filter((assignment)=>assignment.class === entry.class && assignment.subject === entry.subject && assignment.teacher === entry.teacher);
                    if (matchingAssignments.length !== 1) return entry;
                    return {
                        ...entry,
                        assignmentId: matchingAssignments[0].id
                    };
                });
                const report = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$ai$2f$deterministic$2d$validator$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["validateSchedule"])(scheduleWithAssignmentIds, translator.constraintSpecs, {
                    assignments: compressed.assignments
                });
                const roundTrip = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$ai$2f$cp$2d$sat$2d$roundtrip$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["verifyCpSatRoundTrip"])(scheduleWithAssignmentIds, compressed.assignments, {
                    days: compressed.days,
                    periodsByDay: compressed.periodsByDay,
                    periods: compressed.periods
                });
                const hardUncheckedIds = report.uncheckedConstraintIds.filter((id)=>{
                    const spec = translator.constraintSpecs.find((item)=>item.id === id);
                    return spec?.severity === 'hard';
                });
                // (fix bug #1) Coverage do coder TỰ KHAI không còn là điều kiện duyệt.
                // Chỉ duyệt khi mọi hard constraint đều được deterministic check thực sự
                // (hardUncheckedIds rỗng). Self-claim chỉ dùng để gợi ý repair bên dưới.
                if (report.hardConstraintPass && report.baseConstraintPass && report.hardCoverageComplete && roundTrip.ok && hardUncheckedIds.length === 0) {
                    const finalResult = {
                        ...execResult.resultData,
                        schedule: scheduleWithAssignmentIds,
                        status: 'solved',
                        message: 'Đã tạo thời khóa biểu thành công.',
                        deterministicReport: report,
                        checkerReport: report,
                        violations: [],
                        diagnostics: [],
                        executionErrors: [],
                        validationErrors: [],
                        iisConstraintIds: [],
                        conflictingConstraints: [],
                        attemptHistorySummary: board.snapshot().attempts
                    };
                    emit(config, {
                        type: 'final_result',
                        result: finalResult
                    });
                    return {
                        success: true,
                        finalResult
                    };
                }
                lastReport = report;
                lastRoundTrip = roundTrip;
                break;
            }
            if (!lastReport || !lastRoundTrip) {
                if (shouldRepairExecutableFailure(latestConstraintCode, previousAttemptSummary, runtimeRepairRound)) {
                    if (totalToolCalls >= MAX_TOTAL_TOOL_CALLS) {
                        throw new Error(`Stopped by MAX_TOTAL_TOOL_CALLS=${MAX_TOTAL_TOOL_CALLS}.`);
                    }
                    runtimeRepairRound += 1;
                    emit(config, {
                        type: 'phase',
                        phase: 'fixing',
                        message: `Đang repair lỗi chạy code ${runtimeRepairRound}/${MAX_RUNTIME_REPAIR_ROUNDS}`,
                        iteration: runtimeRepairRound
                    });
                    const repair = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$ai$2f$repair$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["runRepairTurn"])(pickStageConfig(config, 'repair'), {
                        plan: planner.plan,
                        constraintCode: latestConstraintCode,
                        violations: [],
                        compileOrRunError: previousAttemptSummary
                    });
                    totalToolCalls += 1;
                    consumeBudget(budget, repair.usageTokens, previousAttemptSummary, repair.rawResponse ?? '');
                    if (!repair.patches.length) {
                        return {
                            success: false,
                            error: buildCoderExhaustedMessage(previousAttemptSummary)
                        };
                    }
                    pendingRepairPatches = repair.patches;
                    continue;
                }
                return {
                    success: false,
                    error: buildCoderExhaustedMessage(previousAttemptSummary)
                };
            }
            const sampleMessages = lastReport.hardViolations.slice(0, 3).map((violation)=>violation.message);
            if (!lastRoundTrip.ok) {
                sampleMessages.unshift(lastRoundTrip.message);
            }
            // (fix bug #1) Báo cho repair MỌI hard constraint chưa có deterministic
            // checker, bất kể coder khai đã cover hay chưa — vì self-claim không đáng tin.
            const uncoveredHardUncheckedIds = lastReport.hardUncheckedConstraintIds;
            if (uncoveredHardUncheckedIds.length > 0) {
                sampleMessages.unshift(`Hard constraints chưa được deterministic check (cần code/sửa parser): ${uncoveredHardUncheckedIds.join(', ')}`);
            }
            const violationSignature = buildViolationSignature(lastReport.hardViolations.map((violation)=>({
                    constraintId: violation.constraintId,
                    kind: violation.kind
                })), lastRoundTrip.ok, lastRoundTrip.message);
            if (violationSignature === previousViolationSignature) {
                repeatedViolationCount += 1;
            } else {
                previousViolationSignature = violationSignature;
                repeatedViolationCount = 1;
            }
            if (repeatedViolationCount >= 2 && violationRepairRound >= MAX_VIOLATION_REPAIR_ROUNDS) {
                return {
                    success: false,
                    error: buildRepeatedViolationMessage(sampleMessages)
                };
            }
            emit(config, {
                type: 'violations_found',
                count: lastReport.hardViolations.length,
                sample: sampleMessages
            });
            previousAttemptSummary = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$ai$2f$input$2d$compressor$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["digestError"])(sampleMessages.join('\n'));
            board.setViolations(lastReport.hardViolations);
            violationRepairRound += 1;
            if (violationRepairRound > MAX_VIOLATION_REPAIR_ROUNDS) {
                return {
                    success: false,
                    error: `Repair exhausted: ${lastReport.hardViolations.length} hard violations remain.`
                };
            }
            emit(config, {
                type: 'phase',
                phase: 'fixing',
                message: `Đang repair round ${violationRepairRound}/${MAX_VIOLATION_REPAIR_ROUNDS}`,
                iteration: violationRepairRound
            });
            // Khi vẫn còn uncovered hard constraints, build pseudo-violations để
            // repair LLM biết rõ thiếu coverage thay vì nhận empty violations.
            // (fix bug #1 / #10)
            const repairViolations = [
                ...lastReport.hardViolations
            ];
            for (const id of uncoveredHardUncheckedIds){
                const spec = translator.constraintSpecs.find((item)=>item.id === id);
                repairViolations.push({
                    constraintId: id,
                    kind: 'base_constraint',
                    message: `Hard constraint ${id} (${spec?.kind ?? 'custom_dsl'}) chưa có code coverage. Vui lòng bổ sung block code cho ${id}: ${spec?.original ?? ''}`,
                    offendingEntries: []
                });
            }
            const repair = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$ai$2f$repair$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["runRepairTurn"])(pickStageConfig(config, 'repair'), {
                plan: planner.plan,
                constraintCode: latestConstraintCode,
                violations: repairViolations,
                compileOrRunError: ''
            });
            totalToolCalls += 1;
            consumeBudget(budget, repair.usageTokens, previousAttemptSummary, repair.rawResponse ?? '');
            pendingRepairPatches = repair.patches;
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown local-agent error';
        emit(config, {
            type: 'error',
            message,
            fatal: true
        });
        return {
            success: false,
            error: message
        };
    }
}
const __localAgentInternal = {
    buildViolationSignature,
    buildCoderExhaustedMessage,
    buildRepeatedViolationMessage,
    normalizeRoundTripMessage,
    shouldRepairExecutableFailure
};
}),
"[project]/src/lib/utils.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "cn",
    ()=>cn
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$clsx$2f$dist$2f$clsx$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/clsx/dist/clsx.mjs [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$tailwind$2d$merge$2f$dist$2f$bundle$2d$mjs$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/tailwind-merge/dist/bundle-mjs.mjs [app-ssr] (ecmascript)");
;
;
function cn(...inputs) {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$tailwind$2d$merge$2f$dist$2f$bundle$2d$mjs$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["twMerge"])((0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$clsx$2f$dist$2f$clsx$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["clsx"])(inputs));
}
}),
"[project]/src/components/ui/dialog.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "Dialog",
    ()=>Dialog,
    "DialogClose",
    ()=>DialogClose,
    "DialogContent",
    ()=>DialogContent,
    "DialogDescription",
    ()=>DialogDescription,
    "DialogFooter",
    ()=>DialogFooter,
    "DialogHeader",
    ()=>DialogHeader,
    "DialogOverlay",
    ()=>DialogOverlay,
    "DialogPortal",
    ()=>DialogPortal,
    "DialogTitle",
    ()=>DialogTitle,
    "DialogTrigger",
    ()=>DialogTrigger
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dialog$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/@radix-ui/react-dialog/dist/index.mjs [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$x$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__XIcon$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/x.js [app-ssr] (ecmascript) <export default as XIcon>");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/utils.ts [app-ssr] (ecmascript)");
"use client";
;
;
;
;
function Dialog({ ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dialog$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Root"], {
        "data-slot": "dialog",
        ...props
    }, void 0, false, {
        fileName: "[project]/src/components/ui/dialog.tsx",
        lineNumber: 12,
        columnNumber: 10
    }, this);
}
function DialogTrigger({ ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dialog$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Trigger"], {
        "data-slot": "dialog-trigger",
        ...props
    }, void 0, false, {
        fileName: "[project]/src/components/ui/dialog.tsx",
        lineNumber: 18,
        columnNumber: 10
    }, this);
}
function DialogPortal({ ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dialog$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Portal"], {
        "data-slot": "dialog-portal",
        ...props
    }, void 0, false, {
        fileName: "[project]/src/components/ui/dialog.tsx",
        lineNumber: 24,
        columnNumber: 10
    }, this);
}
function DialogClose({ ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dialog$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Close"], {
        "data-slot": "dialog-close",
        ...props
    }, void 0, false, {
        fileName: "[project]/src/components/ui/dialog.tsx",
        lineNumber: 30,
        columnNumber: 10
    }, this);
}
function DialogOverlay({ className, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dialog$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Overlay"], {
        "data-slot": "dialog-overlay",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])("data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/src/components/ui/dialog.tsx",
        lineNumber: 38,
        columnNumber: 5
    }, this);
}
function DialogContent({ className, children, showCloseButton = true, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(DialogPortal, {
        "data-slot": "dialog-portal",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(DialogOverlay, {}, void 0, false, {
                fileName: "[project]/src/components/ui/dialog.tsx",
                lineNumber: 59,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dialog$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Content"], {
                "data-slot": "dialog-content",
                className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])("bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-lg", className),
                ...props,
                children: [
                    children,
                    showCloseButton && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dialog$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Close"], {
                        "data-slot": "dialog-close",
                        className: "ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$x$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__XIcon$3e$__["XIcon"], {}, void 0, false, {
                                fileName: "[project]/src/components/ui/dialog.tsx",
                                lineNumber: 74,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "sr-only",
                                children: "Close"
                            }, void 0, false, {
                                fileName: "[project]/src/components/ui/dialog.tsx",
                                lineNumber: 75,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/ui/dialog.tsx",
                        lineNumber: 70,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/components/ui/dialog.tsx",
                lineNumber: 60,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/components/ui/dialog.tsx",
        lineNumber: 58,
        columnNumber: 5
    }, this);
}
function DialogHeader({ className, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        "data-slot": "dialog-header",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])("flex flex-col gap-2 text-center sm:text-left", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/src/components/ui/dialog.tsx",
        lineNumber: 85,
        columnNumber: 5
    }, this);
}
function DialogFooter({ className, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        "data-slot": "dialog-footer",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/src/components/ui/dialog.tsx",
        lineNumber: 95,
        columnNumber: 5
    }, this);
}
function DialogTitle({ className, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dialog$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Title"], {
        "data-slot": "dialog-title",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])("text-lg leading-none font-semibold", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/src/components/ui/dialog.tsx",
        lineNumber: 111,
        columnNumber: 5
    }, this);
}
function DialogDescription({ className, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$dialog$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Description"], {
        "data-slot": "dialog-description",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])("text-muted-foreground text-sm", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/src/components/ui/dialog.tsx",
        lineNumber: 124,
        columnNumber: 5
    }, this);
}
;
}),
"[project]/src/components/ui/button.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "Button",
    ()=>Button,
    "buttonVariants",
    ()=>buttonVariants
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$slot$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/@radix-ui/react-slot/dist/index.mjs [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$class$2d$variance$2d$authority$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/class-variance-authority/dist/index.mjs [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/utils.ts [app-ssr] (ecmascript)");
;
;
;
;
const buttonVariants = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$class$2d$variance$2d$authority$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cva"])("inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive", {
    variants: {
        variant: {
            default: "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90",
            destructive: "bg-destructive text-white shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
            outline: "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50",
            secondary: "bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80",
            ghost: "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
            link: "text-primary underline-offset-4 hover:underline"
        },
        size: {
            default: "h-9 px-4 py-2 has-[>svg]:px-3",
            sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
            lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
            icon: "size-9"
        }
    },
    defaultVariants: {
        variant: "default",
        size: "default"
    }
});
function Button({ className, variant, size, asChild = false, ...props }) {
    const Comp = asChild ? __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$slot$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Slot"] : "button";
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Comp, {
        "data-slot": "button",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])(buttonVariants({
            variant,
            size,
            className
        })),
        ...props
    }, void 0, false, {
        fileName: "[project]/src/components/ui/button.tsx",
        lineNumber: 51,
        columnNumber: 5
    }, this);
}
;
}),
"[project]/src/components/ui/input.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "Input",
    ()=>Input
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/utils.ts [app-ssr] (ecmascript)");
;
;
function Input({ className, type, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
        type: type,
        "data-slot": "input",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])("file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input flex h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm", "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]", "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/src/components/ui/input.tsx",
        lineNumber: 7,
        columnNumber: 5
    }, this);
}
;
}),
"[project]/src/components/ui/label.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "Label",
    ()=>Label
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$label$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/@radix-ui/react-label/dist/index.mjs [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/utils.ts [app-ssr] (ecmascript)");
"use client";
;
;
;
function Label({ className, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$label$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Root"], {
        "data-slot": "label",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])("flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/src/components/ui/label.tsx",
        lineNumber: 13,
        columnNumber: 5
    }, this);
}
;
}),
"[project]/src/hooks/use-toast.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "reducer",
    ()=>reducer,
    "toast",
    ()=>toast,
    "useToast",
    ()=>useToast
]);
// Inspired by react-hot-toast library
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
"use client";
;
const TOAST_LIMIT = 1;
const TOAST_REMOVE_DELAY = 1000000;
const actionTypes = {
    ADD_TOAST: "ADD_TOAST",
    UPDATE_TOAST: "UPDATE_TOAST",
    DISMISS_TOAST: "DISMISS_TOAST",
    REMOVE_TOAST: "REMOVE_TOAST"
};
let count = 0;
function genId() {
    count = (count + 1) % Number.MAX_SAFE_INTEGER;
    return count.toString();
}
const toastTimeouts = new Map();
const addToRemoveQueue = (toastId)=>{
    if (toastTimeouts.has(toastId)) {
        return;
    }
    const timeout = setTimeout(()=>{
        toastTimeouts.delete(toastId);
        dispatch({
            type: "REMOVE_TOAST",
            toastId: toastId
        });
    }, TOAST_REMOVE_DELAY);
    toastTimeouts.set(toastId, timeout);
};
const reducer = (state, action)=>{
    switch(action.type){
        case "ADD_TOAST":
            return {
                ...state,
                toasts: [
                    action.toast,
                    ...state.toasts
                ].slice(0, TOAST_LIMIT)
            };
        case "UPDATE_TOAST":
            return {
                ...state,
                toasts: state.toasts.map((t)=>t.id === action.toast.id ? {
                        ...t,
                        ...action.toast
                    } : t)
            };
        case "DISMISS_TOAST":
            {
                const { toastId } = action;
                // ! Side effects ! - This could be extracted into a dismissToast() action,
                // but I'll keep it here for simplicity
                if (toastId) {
                    addToRemoveQueue(toastId);
                } else {
                    state.toasts.forEach((toast)=>{
                        addToRemoveQueue(toast.id);
                    });
                }
                return {
                    ...state,
                    toasts: state.toasts.map((t)=>t.id === toastId || toastId === undefined ? {
                            ...t,
                            open: false
                        } : t)
                };
            }
        case "REMOVE_TOAST":
            if (action.toastId === undefined) {
                return {
                    ...state,
                    toasts: []
                };
            }
            return {
                ...state,
                toasts: state.toasts.filter((t)=>t.id !== action.toastId)
            };
    }
};
const listeners = [];
let memoryState = {
    toasts: []
};
function dispatch(action) {
    memoryState = reducer(memoryState, action);
    listeners.forEach((listener)=>{
        listener(memoryState);
    });
}
function toast({ ...props }) {
    const id = genId();
    const update = (props)=>dispatch({
            type: "UPDATE_TOAST",
            toast: {
                ...props,
                id
            }
        });
    const dismiss = ()=>dispatch({
            type: "DISMISS_TOAST",
            toastId: id
        });
    dispatch({
        type: "ADD_TOAST",
        toast: {
            ...props,
            id,
            open: true,
            onOpenChange: (open)=>{
                if (!open) dismiss();
            }
        }
    });
    return {
        id: id,
        dismiss,
        update
    };
}
function useToast() {
    const [state, setState] = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"](memoryState);
    __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"](()=>{
        listeners.push(setState);
        return ()=>{
            const index = listeners.indexOf(setState);
            if (index > -1) {
                listeners.splice(index, 1);
            }
        };
    }, [
        state
    ]);
    return {
        ...state,
        toast,
        dismiss: (toastId)=>dispatch({
                type: "DISMISS_TOAST",
                toastId
            })
    };
}
;
}),
"[project]/src/features/timetable/SettingsModal.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "SettingsModal",
    ()=>SettingsModal
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/ui/dialog.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$button$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/ui/button.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$input$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/ui/input.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$label$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/ui/label.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$hooks$2f$use$2d$toast$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/hooks/use-toast.ts [app-ssr] (ecmascript)");
'use client';
;
;
;
;
;
;
;
const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';
function SettingsModal({ open, onOpenChange, initialConfig, onSave, requireValid = false }) {
    const [baseURL, setBaseURL] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(initialConfig?.baseURL || DEFAULT_BASE_URL);
    const [apiKey, setApiKey] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(initialConfig?.apiKey || '');
    const [model, setModel] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(initialConfig?.model || 'deepseek/deepseek-chat');
    const [isTesting, setIsTesting] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [testResult, setTestResult] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const { toast } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$hooks$2f$use$2d$toast$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useToast"])();
    const handleTest = async ()=>{
        if (!baseURL.trim()) {
            setTestResult('Vui lòng nhập Base URL trước khi test.');
            return;
        }
        if (!apiKey.trim()) {
            setTestResult('Vui lòng nhập API Key trước khi test.');
            return;
        }
        setIsTesting(true);
        setTestResult(null);
        try {
            const res = await fetch('/api/provider/test', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    baseURL: baseURL.trim(),
                    apiKey: apiKey.trim(),
                    model: model.trim()
                })
            });
            const payload = await res.json().catch(()=>null);
            const message = payload?.message;
            const details = payload?.details;
            if (payload?.ok) {
                setTestResult(message ?? '✅ Kết nối thành công!');
                toast({
                    title: 'Kết nối thành công',
                    description: 'Bạn có thể lưu cấu hình.'
                });
            } else {
                const composed = [
                    message ?? '❌ Test thất bại.',
                    details
                ].filter(Boolean).join('\n');
                setTestResult(composed);
            }
        } catch (e) {
            setTestResult(`❌ Không kết nối được: ${e.message}`);
        } finally{
            setIsTesting(false);
        }
    };
    const handleSave = ()=>{
        const trimmedBaseURL = baseURL.trim().replace(/\/$/, '');
        const trimmedKey = apiKey.trim();
        const trimmedModel = model.trim();
        if (!trimmedBaseURL) {
            toast({
                title: 'Lỗi',
                description: 'Base URL không được để trống',
                variant: 'destructive'
            });
            return;
        }
        if (!/^https?:\/\//i.test(trimmedBaseURL)) {
            toast({
                title: 'Lỗi',
                description: 'Base URL phải bắt đầu bằng http:// hoặc https://',
                variant: 'destructive'
            });
            return;
        }
        if (!trimmedKey) {
            toast({
                title: 'Lỗi',
                description: 'API Key không được để trống',
                variant: 'destructive'
            });
            return;
        }
        if (!trimmedModel) {
            toast({
                title: 'Lỗi',
                description: 'Model không được để trống',
                variant: 'destructive'
            });
            return;
        }
        onSave({
            baseURL: trimmedBaseURL,
            apiKey: trimmedKey,
            model: trimmedModel
        });
        onOpenChange(false);
    };
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Dialog"], {
        open: open,
        onOpenChange: onOpenChange,
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["DialogContent"], {
            className: "sm:max-w-[480px]",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["DialogHeader"], {
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["DialogTitle"], {
                            children: "Cấu hình AI Provider"
                        }, void 0, false, {
                            fileName: "[project]/src/features/timetable/SettingsModal.tsx",
                            lineNumber: 117,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["DialogDescription"], {
                            children: "Nhập thông tin OpenAI-compatible provider của bạn. Dữ liệu chỉ lưu trên máy này."
                        }, void 0, false, {
                            fileName: "[project]/src/features/timetable/SettingsModal.tsx",
                            lineNumber: 118,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/features/timetable/SettingsModal.tsx",
                    lineNumber: 116,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "space-y-4 py-4",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "space-y-2",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$label$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Label"], {
                                    children: "Base URL"
                                }, void 0, false, {
                                    fileName: "[project]/src/features/timetable/SettingsModal.tsx",
                                    lineNumber: 125,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$input$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Input"], {
                                    value: baseURL,
                                    onChange: (e)=>setBaseURL(e.target.value),
                                    placeholder: "https://openrouter.ai/api/v1"
                                }, void 0, false, {
                                    fileName: "[project]/src/features/timetable/SettingsModal.tsx",
                                    lineNumber: 126,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/features/timetable/SettingsModal.tsx",
                            lineNumber: 124,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "space-y-2",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$label$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Label"], {
                                    children: "API Key"
                                }, void 0, false, {
                                    fileName: "[project]/src/features/timetable/SettingsModal.tsx",
                                    lineNumber: 134,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$input$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Input"], {
                                    type: "password",
                                    value: apiKey,
                                    onChange: (e)=>setApiKey(e.target.value),
                                    placeholder: "sk-or-..."
                                }, void 0, false, {
                                    fileName: "[project]/src/features/timetable/SettingsModal.tsx",
                                    lineNumber: 135,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/features/timetable/SettingsModal.tsx",
                            lineNumber: 133,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "space-y-2",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$label$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Label"], {
                                    children: "Model"
                                }, void 0, false, {
                                    fileName: "[project]/src/features/timetable/SettingsModal.tsx",
                                    lineNumber: 144,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$input$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Input"], {
                                    value: model,
                                    onChange: (e)=>setModel(e.target.value),
                                    placeholder: "deepseek/deepseek-chat"
                                }, void 0, false, {
                                    fileName: "[project]/src/features/timetable/SettingsModal.tsx",
                                    lineNumber: 145,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                    className: "text-xs text-muted-foreground",
                                    children: "Ví dụ: deepseek/deepseek-chat, gpt-4o-mini, gemini-1.5-flash"
                                }, void 0, false, {
                                    fileName: "[project]/src/features/timetable/SettingsModal.tsx",
                                    lineNumber: 150,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/features/timetable/SettingsModal.tsx",
                            lineNumber: 143,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$button$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Button"], {
                            onClick: handleTest,
                            disabled: isTesting,
                            variant: "outline",
                            className: "w-full",
                            children: isTesting ? 'Đang test...' : 'Test Connection'
                        }, void 0, false, {
                            fileName: "[project]/src/features/timetable/SettingsModal.tsx",
                            lineNumber: 155,
                            columnNumber: 11
                        }, this),
                        testResult && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "rounded-md border p-3 text-sm whitespace-pre-wrap",
                            children: testResult
                        }, void 0, false, {
                            fileName: "[project]/src/features/timetable/SettingsModal.tsx",
                            lineNumber: 160,
                            columnNumber: 13
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/features/timetable/SettingsModal.tsx",
                    lineNumber: 123,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "flex justify-end gap-2",
                    children: [
                        !requireValid && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$button$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Button"], {
                            variant: "ghost",
                            onClick: ()=>onOpenChange(false),
                            children: "Hủy"
                        }, void 0, false, {
                            fileName: "[project]/src/features/timetable/SettingsModal.tsx",
                            lineNumber: 168,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$button$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Button"], {
                            onClick: handleSave,
                            children: "Lưu cấu hình"
                        }, void 0, false, {
                            fileName: "[project]/src/features/timetable/SettingsModal.tsx",
                            lineNumber: 172,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/features/timetable/SettingsModal.tsx",
                    lineNumber: 166,
                    columnNumber: 9
                }, this),
                requireValid && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                    className: "text-center text-xs text-amber-600",
                    children: "Lần đầu sử dụng bạn phải cấu hình AI Provider hợp lệ trước khi tiếp tục."
                }, void 0, false, {
                    fileName: "[project]/src/features/timetable/SettingsModal.tsx",
                    lineNumber: 178,
                    columnNumber: 11
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/src/features/timetable/SettingsModal.tsx",
            lineNumber: 115,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/src/features/timetable/SettingsModal.tsx",
        lineNumber: 114,
        columnNumber: 5
    }, this);
}
}),
"[project]/src/features/timetable/constants.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "classPresetGroups",
    ()=>classPresetGroups,
    "constraintTypeList",
    ()=>constraintTypeList,
    "constraintTypes",
    ()=>constraintTypes,
    "days",
    ()=>days,
    "defaultPeriods",
    ()=>defaultPeriods,
    "disabledPrimaryButtonClass",
    ()=>disabledPrimaryButtonClass,
    "ghostButtonClass",
    ()=>ghostButtonClass,
    "iconShellClass",
    ()=>iconShellClass,
    "inputClass",
    ()=>inputClass,
    "navBackClass",
    ()=>navBackClass,
    "navBarClass",
    ()=>navBarClass,
    "navDisabledClass",
    ()=>navDisabledClass,
    "navNextClass",
    ()=>navNextClass,
    "panelClass",
    ()=>panelClass,
    "panelMutedClass",
    ()=>panelMutedClass,
    "primaryButtonClass",
    ()=>primaryButtonClass,
    "sessions",
    ()=>sessions,
    "subjectPresets",
    ()=>subjectPresets,
    "teacherColors",
    ()=>teacherColors
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$moon$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Moon$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/moon.js [app-ssr] (ecmascript) <export default as Moon>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$sun$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Sun$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/sun.js [app-ssr] (ecmascript) <export default as Sun>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$sunrise$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Sunrise$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/sunrise.js [app-ssr] (ecmascript) <export default as Sunrise>");
;
const days = [
    {
        id: 'monday',
        label: 'Thứ hai',
        short: 'T2',
        tableLabel: 'Thứ 2'
    },
    {
        id: 'tuesday',
        label: 'Thứ ba',
        short: 'T3',
        tableLabel: 'Thứ 3'
    },
    {
        id: 'wednesday',
        label: 'Thứ tư',
        short: 'T4',
        tableLabel: 'Thứ 4'
    },
    {
        id: 'thursday',
        label: 'Thứ năm',
        short: 'T5',
        tableLabel: 'Thứ 5'
    },
    {
        id: 'friday',
        label: 'Thứ sáu',
        short: 'T6',
        tableLabel: 'Thứ 6'
    },
    {
        id: 'saturday',
        label: 'Thứ bảy',
        short: 'T7',
        tableLabel: 'Thứ 7'
    },
    {
        id: 'sunday',
        label: 'Chủ nhật',
        short: 'CN',
        tableLabel: 'CN'
    }
];
const sessions = [
    {
        id: 'morning',
        label: 'Sáng',
        icon: '🌤️',
        periodIcon: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$sunrise$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Sunrise$3e$__["Sunrise"]
    },
    {
        id: 'afternoon',
        label: 'Chiều',
        icon: '☀️',
        periodIcon: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$sun$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Sun$3e$__["Sun"]
    },
    {
        id: 'night',
        label: 'Tối',
        icon: '🌙',
        periodIcon: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$moon$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Moon$3e$__["Moon"]
    }
];
const defaultPeriods = {
    morning: 4,
    afternoon: 4,
    night: 3
};
const classPresetGroups = [
    {
        label: '6A-D',
        classes: [
            '6A',
            '6B',
            '6C',
            '6D'
        ]
    },
    {
        label: '7A-D',
        classes: [
            '7A',
            '7B',
            '7C',
            '7D'
        ]
    },
    {
        label: '8A-D',
        classes: [
            '8A',
            '8B',
            '8C',
            '8D'
        ]
    },
    {
        label: '9A-D',
        classes: [
            '9A',
            '9B',
            '9C',
            '9D'
        ]
    }
];
const subjectPresets = [
    {
        label: 'Văn',
        value: 'Văn'
    },
    {
        label: 'Toán',
        value: 'Toán'
    },
    {
        label: 'Tiếng Anh',
        value: 'Tiếng Anh'
    },
    {
        label: 'Giáo dục công dân',
        value: 'GDCD'
    },
    {
        label: 'Lịch sử và Địa lí',
        value: 'LS&ĐL'
    },
    {
        label: 'Khoa học tự nhiên',
        value: 'KHTN'
    },
    {
        label: 'Công nghệ',
        value: 'CN'
    },
    {
        label: 'Tin học',
        value: 'Tin'
    },
    {
        label: 'Giáo dục thể chất',
        value: 'GDTC'
    },
    {
        label: 'Nghệ thuật 1 - Âm nhạc',
        value: 'NT 1'
    },
    {
        label: 'Nghệ thuật 2 - Mỹ thuật',
        value: 'NT 2'
    },
    {
        label: 'Hoạt động trải nghiệm, hướng nghiệp',
        value: 'HĐTN'
    },
    {
        label: 'Nội dung giáo dục của địa phương',
        value: 'GDĐP'
    }
];
const teacherColors = [
    {
        border: 'rgba(255,255,255,0.06)',
        bg: '#141414',
        text: '#4DB848',
        softText: '#ffffff80'
    },
    {
        border: 'rgba(255,255,255,0.06)',
        bg: '#141414',
        text: '#7dd3fc',
        softText: '#ffffff80'
    },
    {
        border: 'rgba(255,255,255,0.06)',
        bg: '#141414',
        text: '#a78bfa',
        softText: '#ffffff80'
    },
    {
        border: 'rgba(255,255,255,0.06)',
        bg: '#141414',
        text: '#fb923c',
        softText: '#ffffff80'
    }
];
const panelClass = 'rounded-md border border-white/[0.06] bg-[#141414]';
const panelMutedClass = 'rounded-md border border-white/[0.06] bg-[#111]';
const inputClass = 'h-10 w-full rounded-md border border-white/[0.08] bg-[#0a0a0a] px-3 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-white/20';
const iconShellClass = 'flex h-8 w-8 items-center justify-center rounded border border-white/[0.06] text-white/50';
const navBarClass = 'flex w-full items-center justify-between py-4';
const navBackClass = 'inline-flex h-10 items-center justify-center gap-2 rounded-md border border-white/[0.08] bg-transparent px-5 text-sm text-white/70 transition hover:bg-white/[0.04] hover:text-white';
const navNextClass = 'inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#4DB848] px-5 text-sm font-medium text-[#0a0a0a] transition hover:bg-[#40993C]';
const navDisabledClass = 'disabled:cursor-not-allowed disabled:bg-white/[0.06] disabled:text-white/30 disabled:border-white/[0.04]';
const ghostButtonClass = 'inline-flex items-center justify-center gap-2 rounded-md border border-white/[0.08] bg-transparent px-4 py-2 text-sm text-white/70 transition hover:bg-white/[0.04] hover:text-white';
const primaryButtonClass = 'inline-flex items-center justify-center gap-2 rounded-md bg-[#4DB848] px-4 py-2 text-sm font-medium text-[#0a0a0a] transition hover:bg-[#40993C]';
const disabledPrimaryButtonClass = 'disabled:cursor-not-allowed disabled:bg-white/[0.06] disabled:text-white/30 disabled:border-white/[0.04]';
const constraintTypes = {
    required: {
        id: 'required',
        label: 'Bắt buộc',
        description: 'Ràng buộc cứng khi sắp xếp thời khóa biểu',
        color: 'red',
        boxClass: 'border-red-500/30 bg-red-500/[0.06] text-white',
        iconClass: 'text-red-400',
        badgeClass: 'border-red-500/30 bg-red-500/10 text-red-400'
    },
    preferred: {
        id: 'preferred',
        label: 'Nên có',
        description: 'Ràng buộc ưu tiên, có thể linh hoạt khi cần',
        color: 'green',
        boxClass: 'border-green-500/30 bg-green-500/[0.06] text-white',
        iconClass: 'text-green-400',
        badgeClass: 'border-green-500/30 bg-green-500/10 text-green-400'
    }
};
const constraintTypeList = Object.values(constraintTypes);
}),
"[project]/src/features/timetable/utils.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "getAssignmentSlotKey",
    ()=>getAssignmentSlotKey,
    "getCellKey",
    ()=>getCellKey,
    "makeAssignmentKey",
    ()=>makeAssignmentKey,
    "normalizeAssignments",
    ()=>normalizeAssignments,
    "normalizeSubjectName",
    ()=>normalizeSubjectName,
    "sortAlphabetically",
    ()=>sortAlphabetically
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/features/timetable/constants.ts [app-ssr] (ecmascript)");
;
const subjectAliases = new Map(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["subjectPresets"].map((subject)=>[
        subject.label.toLocaleLowerCase('vi'),
        subject.value
    ]));
const normalizeSubjectName = (name)=>subjectAliases.get(name.trim().toLocaleLowerCase('vi')) ?? name.trim();
const makeAssignmentKey = (teacher, subject, className, weeklyPeriods)=>`${teacher}__${subject}__${className}__${weeklyPeriods}`;
const sortAlphabetically = (items)=>[
        ...items
    ].sort((first, second)=>first.localeCompare(second, 'vi', {
            numeric: true,
            sensitivity: 'base'
        }));
const getCellKey = (dayId, sessionId, period)=>`${dayId}-${sessionId}-${period}`;
const getAssignmentSlotKey = (teacher, className, slotId)=>`${teacher}__${className}__${slotId}`;
function normalizeAssignments(assignments) {
    const teacherToId = new Map();
    const subjectToId = new Map();
    const classToId = new Map();
    return assignments.map((assignment, index)=>{
        const teacherLabel = assignment.teacher.trim();
        const subjectLabel = assignment.subject.trim();
        const classLabel = assignment.className.trim();
        if (!teacherToId.has(teacherLabel)) teacherToId.set(teacherLabel, `T${teacherToId.size + 1}`);
        if (!subjectToId.has(subjectLabel)) subjectToId.set(subjectLabel, `S${subjectToId.size + 1}`);
        if (!classToId.has(classLabel)) classToId.set(classLabel, `C${classToId.size + 1}`);
        return {
            id: `asg_${index}`,
            teacher: {
                id: teacherToId.get(teacherLabel),
                label: teacherLabel
            },
            subject: {
                id: subjectToId.get(subjectLabel),
                label: subjectLabel
            },
            class: {
                id: classToId.get(classLabel),
                label: classLabel
            },
            weeklyPeriods: Number(assignment.weeklyPeriods)
        };
    });
}
}),
"[project]/src/features/timetable/quick-import.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "QUICK_IMPORT_SAMPLE_TEXT",
    ()=>QUICK_IMPORT_SAMPLE_TEXT,
    "parseQuickImportText",
    ()=>parseQuickImportText
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/features/timetable/constants.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/features/timetable/utils.ts [app-ssr] (ecmascript)");
;
;
const QUICK_IMPORT_SAMPLE_TEXT = `DATASET 1
Days: Mon-Fri
Time: Morning
Max periods: 4
Teachers:
Sơn
Dung
Hương
Thủy
Hiếu
Lan
Thắng
Phương
Subjects:
Toán
Văn
Tiếng Anh
GDTC
KHTN
LS&ĐL
CN
GDCD
Classes:
6A
6B
Assignments:
Sơn-Toán-6A-4
Sơn-Toán-6B-4
Dung-Văn-6A-4
Dung-Văn-6B-4
Hương-Tiếng Anh-6A-3
Hương-Tiếng Anh-6B-3
Thủy-GDTC-6A-2
Thủy-GDTC-6B-2
Hiếu-KHTN-6A-3
Hiếu-KHTN-6B-3
Lan-LS&ĐL-6A-2
Lan-LS&ĐL-6B-2
Thắng-CN-6A-1
Thắng-CN-6B-1
Phương-GDCD-6A-1
Phương-GDCD-6B-1
Hard constraints:
Sơn không dạy thứ 2
Hương không dạy tiết 1
Soft constraints:
Toán nên xếp tiết 1-2
Văn nên liên tiếp 2 tiết`;
const DAY_ORDER = [
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
    'sunday'
];
const MONDAY_TO_FRIDAY = DAY_ORDER.slice(0, 5);
const dayAliasMap = new Map([
    [
        'mon',
        'monday'
    ],
    [
        'monday',
        'monday'
    ],
    [
        't2',
        'monday'
    ],
    [
        'thu2',
        'monday'
    ],
    [
        'thuhai',
        'monday'
    ],
    [
        'tue',
        'tuesday'
    ],
    [
        'tuesday',
        'tuesday'
    ],
    [
        't3',
        'tuesday'
    ],
    [
        'thu3',
        'tuesday'
    ],
    [
        'thuba',
        'tuesday'
    ],
    [
        'wed',
        'wednesday'
    ],
    [
        'wednesday',
        'wednesday'
    ],
    [
        't4',
        'wednesday'
    ],
    [
        'thu4',
        'wednesday'
    ],
    [
        'thutu',
        'wednesday'
    ],
    [
        'thu',
        'thursday'
    ],
    [
        'thursday',
        'thursday'
    ],
    [
        't5',
        'thursday'
    ],
    [
        'thu5',
        'thursday'
    ],
    [
        'thunam',
        'thursday'
    ],
    [
        'fri',
        'friday'
    ],
    [
        'friday',
        'friday'
    ],
    [
        't6',
        'friday'
    ],
    [
        'thu6',
        'friday'
    ],
    [
        'thusau',
        'friday'
    ],
    [
        'sat',
        'saturday'
    ],
    [
        'saturday',
        'saturday'
    ],
    [
        't7',
        'saturday'
    ],
    [
        'thu7',
        'saturday'
    ],
    [
        'thubay',
        'saturday'
    ],
    [
        'sun',
        'sunday'
    ],
    [
        'sunday',
        'sunday'
    ],
    [
        'cn',
        'sunday'
    ],
    [
        'chunhat',
        'sunday'
    ]
]);
const sessionAliasMap = new Map([
    [
        'morning',
        'morning'
    ],
    [
        'sang',
        'morning'
    ],
    [
        'buoisang',
        'morning'
    ],
    [
        'casang',
        'morning'
    ],
    [
        'afternoon',
        'afternoon'
    ],
    [
        'chieu',
        'afternoon'
    ],
    [
        'buoichieu',
        'afternoon'
    ],
    [
        'cachieu',
        'afternoon'
    ],
    [
        'night',
        'night'
    ],
    [
        'toi',
        'night'
    ],
    [
        'buoitoi',
        'night'
    ],
    [
        'catoi',
        'night'
    ]
]);
const stripDiacritics = (value)=>value.normalize('NFD').replace(/\p{M}/gu, '');
const normalizeToken = (value)=>stripDiacritics(value).toLowerCase().replace(/[^a-z0-9]/g, '');
const pushUnique = (list, value)=>{
    if (!list.includes(value)) list.push(value);
};
const parseDayList = (raw)=>{
    if (!raw.trim()) return MONDAY_TO_FRIDAY;
    const resolved = [];
    raw.split(/[,;]+/).map((token)=>token.trim()).filter(Boolean).forEach((token)=>{
        const rangeTokens = token.split('-').map((part)=>part.trim()).filter(Boolean);
        if (rangeTokens.length === 2) {
            const start = dayAliasMap.get(normalizeToken(rangeTokens[0]));
            const end = dayAliasMap.get(normalizeToken(rangeTokens[1]));
            if (!start || !end) {
                throw new Error(`Không nhận diện được ngày trong khoảng: "${token}"`);
            }
            const startIndex = DAY_ORDER.indexOf(start);
            const endIndex = DAY_ORDER.indexOf(end);
            if (startIndex > endIndex) {
                throw new Error(`Khoảng ngày không hợp lệ: "${token}"`);
            }
            DAY_ORDER.slice(startIndex, endIndex + 1).forEach((day)=>{
                if (!resolved.includes(day)) resolved.push(day);
            });
            return;
        }
        const day = dayAliasMap.get(normalizeToken(token));
        if (!day) {
            throw new Error(`Không nhận diện được ngày: "${token}"`);
        }
        if (!resolved.includes(day)) resolved.push(day);
    });
    return resolved.length ? resolved : MONDAY_TO_FRIDAY;
};
const parseSessionList = (raw)=>{
    if (!raw.trim()) return [
        'morning'
    ];
    const resolved = [];
    raw.replace(/[–—]/g, '-').split(/\s*(?:[,;/+&-]|\b(?:and|to|va|và)\b)\s*/iu).map((token)=>token.trim()).filter(Boolean).forEach((token)=>{
        const session = sessionAliasMap.get(normalizeToken(token));
        if (!session) {
            throw new Error(`Không nhận diện được buổi học: "${token}"`);
        }
        if (!resolved.includes(session)) resolved.push(session);
    });
    return resolved.length ? resolved : [
        'morning'
    ];
};
const distributePeriods = (selectedSessions, maxPeriods)=>{
    const periods = {
        morning: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["defaultPeriods"].morning,
        afternoon: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["defaultPeriods"].afternoon,
        night: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["defaultPeriods"].night
    };
    if (selectedSessions.length === 0) return periods;
    if (selectedSessions.length === 1) {
        periods[selectedSessions[0]] = Math.min(12, Math.max(1, maxPeriods));
        return periods;
    }
    let remaining = maxPeriods;
    selectedSessions.forEach((sessionId, index)=>{
        const remainingSessions = selectedSessions.length - index - 1;
        const defaultCapacity = __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["defaultPeriods"][sessionId];
        const periodCount = Math.min(defaultCapacity, Math.max(1, remaining - remainingSessions));
        periods[sessionId] = periodCount;
        remaining -= periodCount;
    });
    return periods;
};
function parseQuickImportText(rawText) {
    const text = rawText.replace(/\r\n?/g, '\n');
    const lines = text.split('\n').map((line)=>line.trim());
    const sections = {
        teachers: [],
        subjects: [],
        classes: [],
        assignments: [],
        hard: [],
        soft: []
    };
    let section = null;
    let dayRaw = 'Mon-Fri';
    let timeRaw = 'Morning';
    let maxPeriodsRaw = '4';
    lines.forEach((line)=>{
        if (!line) return;
        const lower = line.toLowerCase();
        if (lower.startsWith('dataset')) return;
        if (/^days\s*:/.test(lower)) {
            dayRaw = line.slice(line.indexOf(':') + 1).trim();
            section = null;
            return;
        }
        if (/^time\s*:/.test(lower)) {
            timeRaw = line.slice(line.indexOf(':') + 1).trim();
            section = null;
            return;
        }
        if (/^max periods?\s*:/.test(lower)) {
            maxPeriodsRaw = line.slice(line.indexOf(':') + 1).trim();
            section = null;
            return;
        }
        if (/^teachers\s*:/.test(lower)) {
            section = 'teachers';
            return;
        }
        if (/^subjects\s*:/.test(lower)) {
            section = 'subjects';
            return;
        }
        if (/^classes\s*:/.test(lower)) {
            section = 'classes';
            return;
        }
        if (/^assignments\s*:/.test(lower)) {
            section = 'assignments';
            return;
        }
        if (/^hard constraints\s*:/.test(lower)) {
            section = 'hard';
            return;
        }
        if (/^soft constraints\s*:/.test(lower)) {
            section = 'soft';
            return;
        }
        if (!section) return;
        sections[section].push(line);
    });
    const selectedDays = parseDayList(dayRaw);
    const selectedSessions = parseSessionList(timeRaw);
    const maxPeriods = Number.parseInt(maxPeriodsRaw, 10);
    if (!Number.isFinite(maxPeriods) || maxPeriods <= 0) {
        throw new Error('Max periods phải là số nguyên dương.');
    }
    const teacherList = [];
    const subjectList = [];
    const classList = [];
    sections.teachers.forEach((teacher)=>pushUnique(teacherList, teacher));
    sections.subjects.forEach((subject)=>pushUnique(subjectList, (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["normalizeSubjectName"])(subject)));
    sections.classes.forEach((className)=>pushUnique(classList, className.toUpperCase()));
    const assignments = sections.assignments.map((line, index)=>{
        const parts = line.split('-').map((part)=>part.trim());
        if (parts.length < 4) {
            throw new Error(`Dòng phân công ${index + 1} sai format: "${line}"`);
        }
        const weeklyPeriods = parts.at(-1) ?? '';
        const className = (parts.at(-2) ?? '').toUpperCase();
        const teacher = parts[0] ?? '';
        const subject = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["normalizeSubjectName"])(parts.slice(1, -2).join('-'));
        if (!teacher || !subject || !className) {
            throw new Error(`Dòng phân công ${index + 1} thiếu dữ liệu: "${line}"`);
        }
        if (!/^\d+$/.test(weeklyPeriods) || Number(weeklyPeriods) <= 0) {
            throw new Error(`Số tiết không hợp lệ ở dòng phân công ${index + 1}: "${line}"`);
        }
        pushUnique(teacherList, teacher);
        pushUnique(subjectList, subject);
        pushUnique(classList, className);
        return {
            key: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["makeAssignmentKey"])(teacher, subject, className, weeklyPeriods),
            teacher,
            subject,
            className,
            weeklyPeriods
        };
    });
    const periods = distributePeriods(selectedSessions, maxPeriods);
    return {
        selectedDays,
        selectedSessions,
        periods,
        teachers: teacherList,
        subjects: subjectList,
        classes: classList,
        assignments,
        hardConstraints: sections.hard,
        softConstraints: sections.soft
    };
}
}),
"[project]/src/features/timetable/TimetableApp.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>App
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$arrow$2d$left$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__ArrowLeft$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/arrow-left.js [app-ssr] (ecmascript) <export default as ArrowLeft>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$book$2d$open$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__BookOpen$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/book-open.js [app-ssr] (ecmascript) <export default as BookOpen>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$calendar$2d$days$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__CalendarDays$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/calendar-days.js [app-ssr] (ecmascript) <export default as CalendarDays>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$check$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Check$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/check.js [app-ssr] (ecmascript) <export default as Check>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$down$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronDown$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/chevron-down.js [app-ssr] (ecmascript) <export default as ChevronDown>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$right$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronRight$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/chevron-right.js [app-ssr] (ecmascript) <export default as ChevronRight>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$circle$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Circle$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/circle.js [app-ssr] (ecmascript) <export default as Circle>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$download$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Download$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/download.js [app-ssr] (ecmascript) <export default as Download>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$hash$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Hash$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/hash.js [app-ssr] (ecmascript) <export default as Hash>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$loader$2d$circle$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Loader2$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/loader-circle.js [app-ssr] (ecmascript) <export default as Loader2>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$minus$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Minus$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/minus.js [app-ssr] (ecmascript) <export default as Minus>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$plus$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Plus$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/plus.js [app-ssr] (ecmascript) <export default as Plus>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$radio$2d$tower$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__RadioTower$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/radio-tower.js [app-ssr] (ecmascript) <export default as RadioTower>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$rotate$2d$ccw$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__RotateCcw$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/rotate-ccw.js [app-ssr] (ecmascript) <export default as RotateCcw>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$clipboard$2d$list$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__ClipboardList$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/clipboard-list.js [app-ssr] (ecmascript) <export default as ClipboardList>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$sparkles$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Sparkles$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/sparkles.js [app-ssr] (ecmascript) <export default as Sparkles>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$sun$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Sun$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/sun.js [app-ssr] (ecmascript) <export default as Sun>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$trash$2d$2$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Trash2$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/trash-2.js [app-ssr] (ecmascript) <export default as Trash2>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$user$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__User$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/user.js [app-ssr] (ecmascript) <export default as User>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$xlsx$2f$xlsx$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/xlsx/xlsx.mjs [app-ssr] (ecmascript)");
// Local AI Agent (new implementation following the approved architecture plan)
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$ai$2f$local$2d$agent$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/features/timetable/ai/local-agent.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$SettingsModal$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/features/timetable/SettingsModal.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$settings$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Settings$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/settings.js [app-ssr] (ecmascript) <export default as Settings>");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/features/timetable/constants.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/features/timetable/utils.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$quick$2d$import$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/features/timetable/quick-import.ts [app-ssr] (ecmascript)");
'use client';
;
;
;
;
;
;
;
;
;
;
;
const RESULT_NOT_FOUND_MESSAGE = 'Couldnt Find the Solution';
const NO_ACTIVE_PERIOD_MESSAGE = 'Không còn ô tiết nào để xếp lịch. Vui lòng khôi phục ít nhất một ô tiết ở trang xem trước.';
const STEP_ORDER = [
    'thinking',
    'coding',
    'running',
    'checking',
    'fixing'
];
const STEP_LABELS = {
    thinking: 'Suy nghi',
    coding: 'Viet code',
    running: 'Chay thu',
    checking: 'Kiem tra',
    fixing: 'Sua loi',
    idle: 'Idle'
};
function toProgressStep(phase) {
    switch(phase){
        case 'coding':
        case 'running':
        case 'checking':
        case 'fixing':
            return phase;
        case 'translator':
        case 'planner':
        case 'thinking':
            return 'thinking';
        case 'idle':
            return 'idle';
        default:
            return 'thinking';
    }
}
function buildReportRows(title, report) {
    if (!report) return [
        [
            title,
            'Không có dữ liệu'
        ]
    ];
    const rows = [
        [
            title,
            ''
        ],
        [
            'Base constraint pass',
            report.baseConstraintPass ? 'Yes' : 'No'
        ],
        [
            'Hard constraint pass',
            report.hardConstraintPass ? 'Yes' : 'No'
        ],
        [
            'Soft constraint pass',
            report.softConstraintPass ? 'Yes' : 'No'
        ],
        [
            'Unchecked constraints',
            report.uncheckedConstraintIds?.join(' | ') || 'None'
        ]
    ];
    rows.push([]);
    rows.push([
        'constraintId',
        'kind',
        'message',
        'offending entries'
    ]);
    report.violations.forEach((check)=>{
        rows.push([
            check.constraintId,
            check.kind,
            check.message,
            String(check.offendingEntries?.length ?? 0)
        ]);
    });
    return rows;
}
function MetricCard({ label, value }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["panelMutedClass"]} p-3`,
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                className: "text-[10px] uppercase tracking-widest text-white/35",
                children: label
            }, void 0, false, {
                fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                lineNumber: 132,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "mt-1 text-sm text-white/70",
                children: value
            }, void 0, false, {
                fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                lineNumber: 133,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/features/timetable/TimetableApp.tsx",
        lineNumber: 131,
        columnNumber: 5
    }, this);
}
function SelectField({ icon: Icon, label, placeholder, value, options, onChange }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
        className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["panelClass"]} block p-4`,
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "mb-3 flex items-center gap-2.5",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["iconShellClass"],
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Icon, {
                            size: 16,
                            strokeWidth: 1.5
                        }, void 0, false, {
                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                            lineNumber: 170,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                        lineNumber: 169,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "text-sm font-medium text-white",
                        children: label
                    }, void 0, false, {
                        fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                        lineNumber: 172,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                lineNumber: 168,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("select", {
                value: value,
                onChange: (event)=>onChange(event.target.value),
                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["inputClass"],
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                        value: "",
                        children: placeholder
                    }, void 0, false, {
                        fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                        lineNumber: 179,
                        columnNumber: 9
                    }, this),
                    options.map((option)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                            value: option,
                            children: option
                        }, option, false, {
                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                            lineNumber: 181,
                            columnNumber: 11
                        }, this))
                ]
            }, void 0, true, {
                fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                lineNumber: 174,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/features/timetable/TimetableApp.tsx",
        lineNumber: 167,
        columnNumber: 5
    }, this);
}
function DayTile({ selected, title, subtitle, onClick }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
        type: "button",
        onClick: onClick,
        className: `group flex flex-col items-center justify-center rounded-md px-2 py-3 transition-all duration-200 ${selected ? 'bg-[#4DB848] text-[#0a0a0a]' : 'border border-white/[0.06] bg-[#141414] text-white hover:border-white/[0.12] hover:bg-white/[0.04]'}`,
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                className: `text-sm font-semibold leading-none ${selected ? 'text-[#0a0a0a]' : 'text-white'}`,
                children: subtitle
            }, void 0, false, {
                fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                lineNumber: 201,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                className: `mt-1 text-[10px] leading-none ${selected ? 'text-[#0a0a0a]/50' : 'text-white/30'}`,
                children: title.replace('Thứ ', '')
            }, void 0, false, {
                fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                lineNumber: 202,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/features/timetable/TimetableApp.tsx",
        lineNumber: 192,
        columnNumber: 5
    }, this);
}
function SessionTile({ selected, icon, title, onClick }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
        type: "button",
        onClick: onClick,
        className: `group flex flex-col items-center justify-center gap-2 rounded-md px-4 py-4 transition-all duration-200 ${selected ? 'bg-[#4DB848] text-[#0a0a0a]' : 'border border-white/[0.06] bg-[#141414] text-white hover:border-white/[0.12] hover:bg-white/[0.04]'}`,
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                className: `flex h-11 w-11 items-center justify-center rounded-full border transition ${selected ? 'border-[#0a0a0a]/10 bg-[#0a0a0a]/10 text-[#0a0a0a]' : 'border-white/[0.08] bg-white/[0.03] text-[#4DB848] group-hover:bg-white/[0.06]'}`,
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                    className: "text-xl",
                    children: icon
                }, void 0, false, {
                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                    lineNumber: 225,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                lineNumber: 218,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                className: `text-sm font-semibold ${selected ? 'text-[#0a0a0a]' : 'text-white'}`,
                children: title
            }, void 0, false, {
                fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                lineNumber: 227,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/features/timetable/TimetableApp.tsx",
        lineNumber: 209,
        columnNumber: 5
    }, this);
}
function PeriodControl({ session, value, onChange }) {
    const [rawInput, setRawInput] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const clampValue = (nextValue)=>Math.min(12, Math.max(1, nextValue));
    const displayValue = rawInput ?? String(value);
    const parsedRawValue = rawInput === null || rawInput === '' ? null : Number(rawInput);
    const isInvalid = rawInput !== null && (rawInput === '' || parsedRawValue === null || Number.isNaN(parsedRawValue) || parsedRawValue < 1 || parsedRawValue > 12 || !Number.isInteger(parsedRawValue));
    const commitValue = (nextValue)=>{
        const cleanValue = Number.isNaN(nextValue) ? value : clampValue(nextValue);
        onChange(session.id, cleanValue);
        setRawInput(null);
    };
    const handleInputChange = (event)=>{
        const raw = event.target.value;
        setRawInput(raw);
        if (raw === '') {
            return;
        }
        const num = Number(raw);
        if (!Number.isNaN(num) && num >= 1 && num <= 12 && Number.isInteger(num)) {
            onChange(session.id, num);
        }
    };
    const handleBlur = ()=>{
        if (rawInput === null) {
            return;
        }
        if (isInvalid) {
            setRawInput(null);
            return;
        }
        commitValue(Number(rawInput));
    };
    const handleKeyDown = (event)=>{
        if (event.key === 'Enter') {
            event.preventDefault();
            handleBlur();
        }
    };
    const handleStep = (delta)=>{
        const baseValue = rawInput !== null && !isInvalid && rawInput !== '' ? Number(rawInput) : value;
        commitValue(baseValue + delta);
    };
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["panelClass"]} p-4`,
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "flex items-center gap-2.5",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.03] text-[#4DB848] transition",
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "text-xl",
                                children: session.icon
                            }, void 0, false, {
                                fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                lineNumber: 297,
                                columnNumber: 13
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                            lineNumber: 296,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                    className: "text-sm font-semibold text-white",
                                    children: session.label
                                }, void 0, false, {
                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                    lineNumber: 300,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                    className: "text-xs text-white/40",
                                    children: "Số tiết tối đa cho buổi này"
                                }, void 0, false, {
                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                    lineNumber: 301,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                            lineNumber: 299,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                    lineNumber: 295,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["panelMutedClass"]} flex items-center gap-2 p-1.5`,
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                            type: "button",
                            onClick: ()=>handleStep(-1),
                            className: "flex h-8 w-8 items-center justify-center rounded border border-white/[0.08] bg-transparent text-white/50 transition hover:bg-white/[0.04]",
                            "aria-label": `Giảm số tiết buổi ${session.label}`,
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$minus$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Minus$3e$__["Minus"], {
                                size: 14,
                                strokeWidth: 1.5
                            }, void 0, false, {
                                fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                lineNumber: 312,
                                columnNumber: 13
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                            lineNumber: 306,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                            className: "sr-only",
                            htmlFor: `${session.id}-periods`,
                            children: [
                                "Số tiết tối đa buổi ",
                                session.label
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                            lineNumber: 314,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                            id: `${session.id}-periods`,
                            type: "number",
                            min: "1",
                            max: "12",
                            value: displayValue,
                            onChange: handleInputChange,
                            onBlur: handleBlur,
                            onKeyDown: handleKeyDown,
                            className: `h-8 w-16 rounded border text-center text-sm outline-none transition ${isInvalid ? 'border-red-500/60 bg-red-500/[0.06] text-red-400 focus:border-red-400' : 'border-white/[0.08] bg-[#0a0a0a] text-white focus:border-white/20'}`
                        }, void 0, false, {
                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                            lineNumber: 317,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                            type: "button",
                            onClick: ()=>handleStep(1),
                            className: "flex h-8 w-8 items-center justify-center rounded border border-white/[0.08] bg-transparent text-white/50 transition hover:bg-white/[0.04]",
                            "aria-label": `Tăng số tiết buổi ${session.label}`,
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$plus$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Plus$3e$__["Plus"], {
                                size: 14,
                                strokeWidth: 1.5
                            }, void 0, false, {
                                fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                lineNumber: 338,
                                columnNumber: 13
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                            lineNumber: 332,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                    lineNumber: 305,
                    columnNumber: 9
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
            lineNumber: 294,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/src/features/timetable/TimetableApp.tsx",
        lineNumber: 293,
        columnNumber: 5
    }, this);
}
function InfoField({ icon: Icon, label, placeholder, value, onChange }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
        className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["panelClass"]} block p-4`,
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "mb-3 flex items-center gap-2.5",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["iconShellClass"],
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Icon, {
                            size: 16,
                            strokeWidth: 1.5
                        }, void 0, false, {
                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                            lineNumber: 351,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                        lineNumber: 350,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "text-sm font-medium text-white",
                        children: label
                    }, void 0, false, {
                        fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                        lineNumber: 353,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                lineNumber: 349,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                type: "text",
                value: value,
                onChange: (event)=>onChange(event.target.value),
                placeholder: placeholder,
                className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["inputClass"]
            }, void 0, false, {
                fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                lineNumber: 355,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/features/timetable/TimetableApp.tsx",
        lineNumber: 348,
        columnNumber: 5
    }, this);
}
function App({ onBackToLanding, quickDatasetText }) {
    const [page, setPage] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])('select');
    const [selectedDays, setSelectedDays] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])([
        'monday',
        'tuesday',
        'wednesday',
        'thursday',
        'friday'
    ]);
    const [selectedSessions, setSelectedSessions] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])([
        'morning'
    ]);
    const [periods, setPeriods] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["defaultPeriods"]);
    const [deletedPeriods, setDeletedPeriods] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])({});
    const [teacherInput, setTeacherInput] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])('');
    const [teacherImportMode, setTeacherImportMode] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])('update');
    const teacherInputRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const [teacherList, setTeacherList] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])([]);
    const [subjectImportMode, setSubjectImportMode] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])('update');
    const [subjectInput, setSubjectInput] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])('');
    const [subjectList, setSubjectList] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])([]);
    const [classInput, setClassInput] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])('');
    const [classList, setClassList] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])([]);
    const [assignmentDraft, setAssignmentDraft] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])({
        teacher: '',
        subject: '',
        className: '',
        weeklyPeriods: ''
    });
    const [assignmentImportMode, setAssignmentImportMode] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])('update');
    const [bulkAssignmentText, setBulkAssignmentText] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])('');
    const [bulkAssignmentErrors, setBulkAssignmentErrors] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])([]);
    const [assignmentList, setAssignmentList] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])([]);
    const [assignmentValidationMessage, setAssignmentValidationMessage] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [constraintDraft, setConstraintDraft] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])({
        type: 'required',
        text: '',
        weight: 5
    });
    const [constraintList, setConstraintList] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])([]);
    const [aiResult, setAiResult] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [aiLoading, setAiLoading] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [aiError, setAiError] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [agentStatus, setAgentStatus] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [agentStep, setAgentStep] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])('idle');
    const [agentIteration, setAgentIteration] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(0);
    const [agentMaxIterations, setAgentMaxIterations] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(5);
    const [agentElapsed, setAgentElapsed] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(0);
    const [agentTimeline, setAgentTimeline] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])([]);
    const agentTimerRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const [showTechnicalErrors, setShowTechnicalErrors] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [quickImportError, setQuickImportError] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    // === NEW: Local AI Provider Settings (Base URL + Key + Model) ===
    const [aiProvider, setAiProvider] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [showSettingsModal, setShowSettingsModal] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [isFirstRun, setIsFirstRun] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const AI_PROVIDER_STORAGE_KEY = 'tack_ai_provider_config';
    const encodeProviderConfig = (config)=>btoa(unescape(encodeURIComponent(JSON.stringify(config))));
    const decodeProviderConfig = (raw)=>{
        try {
            return JSON.parse(decodeURIComponent(escape(atob(raw))));
        } catch  {
            return JSON.parse(raw);
        }
    };
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        // Load local AI provider config
        try {
            const saved = localStorage.getItem(AI_PROVIDER_STORAGE_KEY);
            if (saved) {
                setAiProvider(decodeProviderConfig(saved));
            } else {
                setIsFirstRun(true);
            }
        } catch  {}
    }, []);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (!quickDatasetText) return;
        try {
            const quickData = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$quick$2d$import$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["parseQuickImportText"])(quickDatasetText);
            const now = Date.now();
            const nextConstraints = [
                ...quickData.hardConstraints.map((text, index)=>({
                        id: `quick-hard-${now}-${index}`,
                        type: 'required',
                        text
                    })),
                ...quickData.softConstraints.map((text, index)=>({
                        id: `quick-soft-${now}-${index}`,
                        type: 'preferred',
                        text,
                        weight: 5
                    }))
            ];
            setSelectedDays(quickData.selectedDays);
            setSelectedSessions(quickData.selectedSessions);
            setPeriods(quickData.periods);
            setDeletedPeriods({});
            setTeacherList(quickData.teachers);
            setSubjectList(quickData.subjects);
            setClassList(quickData.classes);
            setAssignmentList(quickData.assignments);
            setConstraintList(nextConstraints);
            setAssignmentValidationMessage(null);
            setAiError(null);
            setAiResult(null);
            setShowTechnicalErrors(false);
            setQuickImportError(null);
            setPage('select');
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Không đọc được dữ liệu nhập nhanh.';
            setQuickImportError(message);
            setPage('select');
        }
    }, [
        quickDatasetText
    ]);
    const sortedTeacherList = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["sortAlphabetically"])(teacherList), [
        teacherList
    ]);
    const sortedSubjectList = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["sortAlphabetically"])(subjectList), [
        subjectList
    ]);
    const sortedClassList = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["sortAlphabetically"])(classList), [
        classList
    ]);
    const sortedAssignmentList = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>[
            ...assignmentList
        ].sort((first, second)=>{
            const teacherOrder = first.teacher.localeCompare(second.teacher, 'vi', {
                numeric: true,
                sensitivity: 'base'
            });
            if (teacherOrder !== 0) return teacherOrder;
            const subjectOrder = first.subject.localeCompare(second.subject, 'vi', {
                numeric: true,
                sensitivity: 'base'
            });
            if (subjectOrder !== 0) return subjectOrder;
            return first.className.localeCompare(second.className, 'vi', {
                numeric: true,
                sensitivity: 'base'
            });
        }), [
        assignmentList
    ]);
    const sortedConstraintList = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>[
            ...constraintList
        ].sort((first, second)=>first.type === second.type ? 0 : first.type === 'required' ? -1 : 1), [
        constraintList
    ]);
    const teacherColorMap = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>Object.fromEntries(sortedTeacherList.map((teacher, index)=>[
                teacher,
                __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["teacherColors"][index % __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["teacherColors"].length]
            ])), [
        sortedTeacherList
    ]);
    const selectedDayNames = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["days"].filter((day)=>selectedDays.includes(day.id)).map((day)=>day.label), [
        selectedDays
    ]);
    const selectedSessionData = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["sessions"].filter((session)=>selectedSessions.includes(session.id)), [
        selectedSessions
    ]);
    const selectedSessionNames = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>selectedSessionData.map((session)=>session.label), [
        selectedSessionData
    ]);
    const selectedSpreadsheetDays = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["days"].filter((day)=>selectedDays.includes(day.id)), [
        selectedDays
    ]);
    const timetableRows = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>selectedSessionData.flatMap((session)=>{
            const sessionPeriodCount = periods[session.id] ?? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["defaultPeriods"][session.id];
            return Array.from({
                length: sessionPeriodCount
            }, (_, index)=>({
                    id: `${session.id}-${index + 1}`,
                    sessionId: session.id,
                    sessionLabel: session.label,
                    sessionPeriodCount,
                    period: index + 1,
                    firstInSession: index === 0
                }));
        }), [
        periods,
        selectedSessionData
    ]);
    const summaryTimetableRows = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
        const visibleRows = timetableRows.filter((row)=>selectedSpreadsheetDays.some((day)=>!deletedPeriods[`${day.id}-${row.sessionId}-${row.period}`]));
        const visibleCountBySession = visibleRows.reduce((counts, row)=>({
                ...counts,
                [row.sessionId]: (counts[row.sessionId] ?? 0) + 1
            }), {});
        const seenSessions = new Set();
        return visibleRows.map((row)=>{
            const firstVisibleInSession = !seenSessions.has(row.sessionId);
            seenSessions.add(row.sessionId);
            return {
                ...row,
                firstInSession: firstVisibleInSession,
                sessionPeriodCount: visibleCountBySession[row.sessionId] ?? 1
            };
        });
    }, [
        deletedPeriods,
        selectedSpreadsheetDays,
        timetableRows
    ]);
    const solvedCellMap = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
        const directCells = Array.isArray(aiResult?.cells) ? aiResult.cells : [];
        if (directCells.length > 0) {
            return new Map(directCells.map((cell)=>[
                    cell.slotId,
                    cell
                ]));
        }
        const scheduleRows = Array.isArray(aiResult?.schedule) ? aiResult.schedule : [];
        if (scheduleRows.length === 0) {
            return new Map();
        }
        const dayAliasToId = new Map();
        selectedSpreadsheetDays.forEach((day)=>{
            dayAliasToId.set(String(day.id).toLowerCase(), day.id);
            dayAliasToId.set(String(day.label).toLowerCase(), day.id);
            dayAliasToId.set(String(day.tableLabel).toLowerCase(), day.id);
        });
        const resolveSessionAndPeriod = (globalPeriod)=>{
            let cursor = 0;
            for (const session of selectedSessionData){
                const count = periods[session.id] ?? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["defaultPeriods"][session.id];
                if (globalPeriod <= cursor + count) {
                    return {
                        sessionId: session.id,
                        period: globalPeriod - cursor
                    };
                }
                cursor += count;
            }
            return null;
        };
        const bySlot = new Map();
        scheduleRows.forEach((row)=>{
            const dayRaw = String(row?.day ?? '').trim().toLowerCase();
            const dayId = dayAliasToId.get(dayRaw);
            const className = String(row?.class ?? row?.className ?? '').trim();
            const subject = String(row?.subject ?? '').trim();
            const teacher = String(row?.teacher ?? '').trim();
            const periodRaw = Number(row?.period);
            if (!dayId || !className || !Number.isFinite(periodRaw) || periodRaw <= 0) return;
            const slot = resolveSessionAndPeriod(periodRaw);
            if (!slot) return;
            const slotId = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getCellKey"])(dayId, slot.sessionId, slot.period);
            const existing = bySlot.get(slotId) ?? {
                slotId,
                entries: []
            };
            existing.entries.push({
                className,
                subject,
                teacher
            });
            bySlot.set(slotId, existing);
        });
        return new Map(Array.from(bySlot.values()).map((cell)=>[
                cell.slotId,
                cell
            ]));
    }, [
        aiResult,
        periods,
        selectedSessionData,
        selectedSpreadsheetDays
    ]);
    const resultClassColumns = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
        const defaultClassOrder = [
            '6A',
            '6B',
            '7A',
            '7B',
            '8A',
            '8B',
            '9A',
            '9B'
        ];
        const knownClasses = defaultClassOrder.filter((className)=>classList.includes(className));
        const customClasses = sortedClassList.filter((className)=>!defaultClassOrder.includes(className));
        return [
            ...knownClasses,
            ...customClasses
        ];
    }, [
        classList,
        sortedClassList
    ]);
    const resultSessionGroups = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>selectedSessionData.map((session)=>{
            const sessionRows = selectedSpreadsheetDays.map((day)=>{
                const periodsInDay = summaryTimetableRows.filter((row)=>row.sessionId === session.id && !deletedPeriods[(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getCellKey"])(day.id, row.sessionId, row.period)]);
                return {
                    day,
                    rows: periodsInDay.map((row, index)=>({
                            ...row,
                            firstInDay: index === 0,
                            dayPeriodCount: periodsInDay.length
                        }))
                };
            }).filter((group)=>group.rows.length > 0);
            return {
                ...session,
                rows: sessionRows.flatMap((group)=>group.rows.map((row)=>({
                            ...row,
                            day: group.day
                        })))
            };
        }).filter((session)=>session.rows.length > 0), [
        deletedPeriods,
        selectedSessionData,
        selectedSpreadsheetDays,
        summaryTimetableRows
    ]);
    const resultTableClassColumns = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
        const columns = resultClassColumns.slice(0, 8);
        while(columns.length < 8)columns.push('');
        return columns;
    }, [
        resultClassColumns
    ]);
    const fixedResultTableSections = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
        return selectedSessionData.map((session, sectionIndex)=>{
            const sessionPeriodCount = periods[session.id] ?? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["defaultPeriods"][session.id];
            const dayGroups = selectedSpreadsheetDays.map((day)=>{
                // Count active (non-deleted) periods for this day+session
                const activeRows = [];
                for(let p = 1; p <= sessionPeriodCount; p++){
                    const cellKey = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getCellKey"])(day.id, session.id, p);
                    if (!deletedPeriods[cellKey]) {
                        activeRows.push({
                            day,
                            session,
                            period: p
                        });
                    }
                }
                return {
                    key: `${session.id}-${day.id}`,
                    label: day.tableLabel,
                    rows: activeRows
                };
            }).filter((group)=>group.rows.length > 0);
            return {
                key: session.id,
                ...sectionIndex > 0 ? {
                    divider: `THỜI KHÓA BIỂU BUỔI ${session.label.toUpperCase()}`
                } : {},
                rows: dayGroups
            };
        });
    }, [
        selectedSessionData,
        selectedSpreadsheetDays,
        periods,
        deletedPeriods
    ]);
    const canContinue = selectedDays.length > 0 && selectedSessions.length > 0;
    const toggleItem = (id, setter)=>{
        setter((current)=>current.includes(id) ? current.filter((item)=>item !== id) : [
                ...current,
                id
            ]);
    };
    const updatePeriod = (sessionId, value)=>{
        setPeriods((current)=>({
                ...current,
                [sessionId]: value
            }));
    };
    const restoreDeletedPeriods = ()=>{
        setDeletedPeriods({});
    };
    const toggleDeletedPeriod = (dayId, sessionId, period)=>{
        const cellKey = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getCellKey"])(dayId, sessionId, period);
        const dayLabel = __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["days"].find((day)=>day.id === dayId)?.label ?? dayId;
        const sessionLabel = __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["sessions"].find((session)=>session.id === sessionId)?.label ?? sessionId;
        const willRestore = Boolean(deletedPeriods[cellKey]);
        setDeletedPeriods((current)=>{
            const next = {
                ...current
            };
            if (next[cellKey]) {
                delete next[cellKey];
            } else {
                next[cellKey] = true;
            }
            return next;
        });
        window.alert(willRestore ? `Đã khôi phục tiết ${period} - ${sessionLabel} - ${dayLabel}.` : `Đã xóa tiết ${period} - ${sessionLabel} - ${dayLabel} khỏi khung thời khóa biểu.`);
    };
    const parseLines = (input)=>input.split(/\r?\n/).map((line)=>line.trim()).filter(Boolean);
    const importTeacher = ()=>{
        const teacherInputElement = document.getElementById('teacher-input');
        const rawInput = teacherInputRef.current?.value ?? teacherInputElement?.value ?? teacherInput;
        const normalizedInput = rawInput.replace(/\r\n?/g, '\n');
        const names = teacherImportMode === 'bulk' ? parseLines(normalizedInput) : [
            normalizedInput.trim()
        ].filter(Boolean);
        if (!names.length) return;
        setTeacherList((current)=>{
            const next = [
                ...current
            ];
            names.forEach((name)=>{
                if (!next.includes(name)) next.push(name);
            });
            return next;
        });
        setTeacherInput('');
    };
    const deleteTeacher = (name)=>{
        setTeacherList((current)=>current.filter((teacher)=>teacher !== name));
        window.alert(`Đã xóa giáo viên ${name}.`);
    };
    const importSubject = (presetValue)=>{
        const rawInput = presetValue ?? subjectInput;
        const names = presetValue || subjectImportMode !== 'bulk' ? [
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["normalizeSubjectName"])(rawInput)
        ].filter(Boolean) : parseLines(rawInput).map((name)=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["normalizeSubjectName"])(name)).filter(Boolean);
        if (!names.length) return;
        setSubjectList((current)=>{
            const next = [
                ...current
            ];
            names.forEach((name)=>{
                if (!next.includes(name)) next.push(name);
            });
            return next;
        });
        setSubjectInput('');
    };
    const deleteSubject = (name)=>{
        setSubjectList((current)=>current.filter((subject)=>subject !== name));
        window.alert(`Đã xóa môn ${name}.`);
    };
    const importClass = ()=>{
        const name = classInput.trim().toUpperCase();
        if (!name) return;
        setClassList((current)=>current.includes(name) ? current : [
                ...current,
                name
            ]);
        setClassInput('');
    };
    const deleteClass = (name)=>{
        const removedAssignmentCount = assignmentList.filter((assignment)=>assignment.className === name).length;
        setClassList((current)=>current.filter((className)=>className !== name));
        setAssignmentList((current)=>current.filter((assignment)=>assignment.className !== name));
        window.alert(removedAssignmentCount > 0 ? `Đã xóa lớp ${name} và ${removedAssignmentCount} phân công chuyên môn liên quan.` : `Đã xóa lớp ${name}.`);
    };
    const addClass = (name)=>{
        const cleanName = name.trim().toUpperCase();
        if (!cleanName) return;
        setClassList((current)=>current.includes(cleanName) ? current : [
                ...current,
                cleanName
            ]);
    };
    const addClassPresetGroup = (classes)=>{
        setClassList((current)=>{
            const next = [
                ...current
            ];
            classes.forEach((className)=>{
                const normalizedClassName = String(className).trim().toUpperCase();
                if (normalizedClassName && !next.includes(normalizedClassName)) {
                    next.push(normalizedClassName);
                }
            });
            return next;
        });
    };
    const parseBulkAssignments = (text)=>{
        const parsed = [];
        const errors = [];
        text.split(/\r?\n/).forEach((rawLine, index)=>{
            if (!rawLine.trim()) return;
            const parts = rawLine.split('-').map((part)=>part.trim());
            if (parts.length !== 4) {
                errors.push({
                    line: index + 1,
                    rawLine,
                    segmentIndex: -1
                });
                return;
            }
            const [teacher, subject, className, weeklyPeriods] = parts;
            const normalizedClassName = className.toUpperCase();
            const checks = [
                {
                    value: teacher,
                    valid: Boolean(teacher) && teacherList.includes(teacher)
                },
                {
                    value: subject,
                    valid: Boolean(subject) && subjectList.includes(subject)
                },
                {
                    value: className,
                    valid: Boolean(className) && classList.includes(normalizedClassName)
                },
                {
                    value: weeklyPeriods,
                    valid: /^\d+$/.test(weeklyPeriods) && Number(weeklyPeriods) > 0
                }
            ];
            const badIndex = checks.findIndex((check)=>!check.valid);
            if (badIndex !== -1) {
                errors.push({
                    line: index + 1,
                    rawLine,
                    parts,
                    segmentIndex: badIndex
                });
                return;
            }
            parsed.push({
                key: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["makeAssignmentKey"])(teacher, subject, normalizedClassName, weeklyPeriods),
                teacher,
                subject,
                className: normalizedClassName,
                weeklyPeriods
            });
        });
        return {
            parsed,
            errors
        };
    };
    const getBulkAssignmentErrorMessage = (error)=>{
        if (!error.parts || error.segmentIndex === -1) return 'Sai format. Đúng: Teacher-Subject-Class-Number.';
        const value = error.parts[error.segmentIndex]?.trim() || 'trống';
        if (error.segmentIndex === 0) return `Giáo viên ${value} không được nhập ở bước trước, vui lòng nhập lại.`;
        if (error.segmentIndex === 1) return `Môn ${value} không được nhập ở bước trước, vui lòng nhập lại.`;
        if (error.segmentIndex === 2) return `Lớp ${value} không được nhập ở bước trước, vui lòng nhập lại.`;
        return `Số tiết ${value} không hợp lệ, vui lòng nhập số nguyên lớn hơn 0.`;
    };
    const renderBulkAssignmentErrorLine = (error)=>{
        if (!error.parts || error.segmentIndex === -1) {
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                className: "text-red-300 underline decoration-red-400 decoration-2 underline-offset-2",
                children: error.rawLine
            }, void 0, false, {
                fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                lineNumber: 844,
                columnNumber: 16
            }, this);
        }
        return error.parts.map((part, index)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Fragment"], {
                children: [
                    index > 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "text-white/30",
                        children: "-"
                    }, void 0, false, {
                        fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                        lineNumber: 849,
                        columnNumber: 22
                    }, this) : null,
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: index === error.segmentIndex ? 'text-red-300 underline decoration-red-400 decoration-2 underline-offset-2' : 'text-white/60',
                        children: part || 'trống'
                    }, void 0, false, {
                        fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                        lineNumber: 850,
                        columnNumber: 9
                    }, this)
                ]
            }, `${error.line}-${index}`, true, {
                fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                lineNumber: 848,
                columnNumber: 7
            }, this));
    };
    const importBulkAssignments = ()=>{
        const { parsed, errors } = parseBulkAssignments(bulkAssignmentText);
        setBulkAssignmentErrors(errors);
        setAssignmentValidationMessage(null);
        if (!parsed.length || errors.length) return;
        setAssignmentList((current)=>{
            const next = [
                ...current
            ];
            parsed.forEach((assignment)=>{
                if (!next.some((existing)=>existing.key === assignment.key)) next.push(assignment);
            });
            return next;
        });
        setBulkAssignmentText('');
    };
    const importAssignment = ()=>{
        const { teacher, subject, className, weeklyPeriods } = assignmentDraft;
        const cleanPeriods = weeklyPeriods.trim();
        if (!teacher || !subject || !className || !cleanPeriods) return;
        if (!teacherList.includes(teacher)) {
            setAssignmentValidationMessage(`Giáo viên ${teacher} không được nhập ở bước trước, vui lòng nhập lại.`);
            return;
        }
        if (!subjectList.includes(subject)) {
            setAssignmentValidationMessage(`Môn ${subject} không được nhập ở bước trước, vui lòng nhập lại.`);
            return;
        }
        if (!classList.includes(className)) {
            setAssignmentValidationMessage(`Lớp ${className} không được nhập ở bước trước, vui lòng nhập lại.`);
            return;
        }
        setAssignmentValidationMessage(null);
        const nextAssignment = {
            key: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["makeAssignmentKey"])(teacher, subject, className, cleanPeriods),
            teacher,
            subject,
            className,
            weeklyPeriods: cleanPeriods
        };
        setAssignmentList((current)=>current.some((assignment)=>assignment.key === nextAssignment.key) ? current : [
                ...current,
                nextAssignment
            ]);
        setAssignmentDraft((current)=>({
                ...current,
                weeklyPeriods: ''
            }));
    };
    const deleteAssignment = (key)=>{
        const deletedAssignment = assignmentList.find((assignment)=>assignment.key === key);
        setAssignmentList((current)=>current.filter((assignment)=>assignment.key !== key));
        if (deletedAssignment) {
            window.alert(`Đã xóa phân công: ${deletedAssignment.teacher} - ${deletedAssignment.subject} - ${deletedAssignment.className} - ${deletedAssignment.weeklyPeriods} tiết.`);
        }
    };
    const validateAssignmentsBeforeNext = ()=>{
        const invalidAssignment = assignmentList.find((assignment)=>!teacherList.includes(assignment.teacher) || !subjectList.includes(assignment.subject) || !classList.includes(assignment.className));
        if (invalidAssignment) {
            const message = !teacherList.includes(invalidAssignment.teacher) ? `Giáo viên ${invalidAssignment.teacher} không được nhập ở bước trước, vui lòng nhập lại.` : !subjectList.includes(invalidAssignment.subject) ? `Môn ${invalidAssignment.subject} không được nhập ở bước trước, vui lòng nhập lại.` : `Lớp ${invalidAssignment.className} không được nhập ở bước trước, vui lòng nhập lại.`;
            setAssignmentValidationMessage(message);
            return false;
        }
        if (assignmentList.length === 0) {
            setAssignmentValidationMessage('Vui lòng tạo ít nhất một phân công chuyên môn trước khi tiếp tục.');
            return false;
        }
        if (totalAssignedPeriods !== totalRequiredClassPeriods) {
            setAssignmentValidationMessage(`Tổng số tiết trong phân công chuyên môn là ${totalAssignedPeriods}, tổng số tiết cần xếp của tất cả các lớp là ${totalRequiredClassPeriods}.`);
            return false;
        }
        setAssignmentValidationMessage(null);
        setPage('constraints');
        return true;
    };
    const importConstraint = ()=>{
        const lines = parseLines(constraintDraft.text);
        if (!lines.length) return;
        const now = Date.now();
        const newItems = lines.map((text, i)=>({
                id: `${now}-${i}-${text}`,
                type: constraintDraft.type,
                text,
                weight: constraintDraft.type === 'preferred' ? constraintDraft.weight : undefined
            }));
        setConstraintList((current)=>[
                ...current,
                ...newItems
            ]);
        setConstraintDraft((current)=>({
                ...current,
                text: ''
            }));
    };
    const deleteConstraint = (id)=>{
        const deletedConstraint = constraintList.find((constraint)=>constraint.id === id);
        setConstraintList((current)=>current.filter((constraint)=>constraint.id !== id));
        if (deletedConstraint) {
            window.alert(`Đã xóa ràng buộc: ${deletedConstraint.text}`);
        }
    };
    const pushTimelineEvent = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])((event)=>{
        setAgentTimeline((current)=>[
                ...current,
                event
            ]);
    }, []);
    const handleGenerate = async (options)=>{
        if (activePeriodCount <= 0) {
            setAiError(NO_ACTIVE_PERIOD_MESSAGE);
            setAiResult(null);
            return;
        }
        const constraintConfirmations = constraintList.map((c)=>({
                id: c.id,
                original: c.text,
                interpreted: c.type === 'preferred' && c.weight != null ? `${c.text} [preferred:${c.weight}]` : `${c.text} [required]`,
                accepted: true
            }));
        const requestConstraints = constraintList.map((constraint)=>constraint.type === 'required' ? {
                type: 'required',
                text: constraint.text
            } : {
                type: 'preferred',
                text: constraint.text,
                weight: constraint.weight === 8 || constraint.weight === 5 || constraint.weight === 3 ? constraint.weight : 5
            });
        const normalizedAssignments = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["normalizeAssignments"])(assignmentList);
        const needConfirm = constraintConfirmations.length > 0;
        if (needConfirm && !options?.skipConstraintConfirm) {
            const ok = window.confirm('Vui lòng xác nhận: hệ thống đang hiểu ràng buộc đúng như bạn đã nhập. Nhấn OK để tiếp tục xếp lịch.');
            if (!ok) {
                setAiError('Bạn đã hủy để chỉnh lại ràng buộc trước khi xếp lịch.');
                return;
            }
        }
        setAiLoading(true);
        setAiError(null);
        setAiResult(null);
        setShowTechnicalErrors(false);
        setAgentStatus('Đang khởi tạo...');
        setAgentStep('thinking');
        setAgentIteration(0);
        setAgentMaxIterations(6);
        setAgentElapsed(0);
        setAgentTimeline([
            {
                id: crypto.randomUUID(),
                phase: 'thinking',
                title: 'Request queued',
                detail: 'Da nhan input va bat dau chuan bi pipeline agent.',
                status: 'active',
                timestamp: new Date().toISOString(),
                tags: [
                    'request'
                ]
            }
        ]);
        if (agentTimerRef.current) clearInterval(agentTimerRef.current);
        agentTimerRef.current = setInterval(()=>{
            setAgentElapsed((prev)=>prev + 1);
        }, 1000);
        // === NEW LOCAL AGENT INTEGRATION ===
        if (!aiProvider) {
            setAiError('Vui lòng cấu hình AI Provider (Base URL + API Key + Model) trước khi dùng tính năng AI.');
            setShowSettingsModal(true);
            setAiLoading(false);
            return;
        }
        try {
            const agentResult = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$ai$2f$local$2d$agent$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["runLocalAgent"])({
                days: selectedSpreadsheetDays,
                sessions: selectedSessionData,
                periodCounts: periods,
                deletedPeriods,
                assignments: normalizedAssignments,
                constraints: requestConstraints
            }, {
                ...aiProvider,
                onEvent: (event)=>{
                    // Map new local agent events to existing UI state (reusing all the beautiful timeline UI)
                    if (event.type === 'status' || event.type === 'phase') {
                        setAgentStatus(event.message);
                        setAgentStep(event.type === 'phase' ? toProgressStep(event.phase) : 'thinking');
                    }
                    pushTimelineEvent({
                        id: crypto.randomUUID(),
                        phase: event.phase || 'coding',
                        title: event.message || event.type,
                        detail: JSON.stringify(event).slice(0, 200),
                        status: 'active',
                        timestamp: new Date().toISOString()
                    });
                }
            });
            if (agentResult && agentResult.success && agentResult.finalResult) {
                setAiResult(agentResult.finalResult);
                setAgentStatus("Hoàn thành!");
                setAgentStep("idle");
            } else if (agentResult?.error) {
                setAiError(agentResult.error);
            }
        } catch (err) {
            setAiError(err instanceof Error ? err.message : "Lỗi khi chạy AI Agent");
        } finally{
            setAiLoading(false);
            if (agentTimerRef.current) {
                clearInterval(agentTimerRef.current);
                agentTimerRef.current = null;
            }
        }
    };
    const handleDownloadExcel = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(()=>{
        if (!aiResult || aiResult.status !== 'solved') return;
        const headerRow = [
            'Thứ',
            'Tiết'
        ];
        resultTableClassColumns.forEach((className, index)=>{
            headerRow.push(className || `Lớp ${index + 1}`);
            headerRow.push('GV Dạy');
        });
        const rows = [
            headerRow
        ];
        fixedResultTableSections.forEach((section, sectionIndex)=>{
            if (sectionIndex > 0 && section.divider) {
                const dividerRow = [
                    section.divider,
                    ...Array(headerRow.length - 1).fill('')
                ];
                rows.push(dividerRow);
            }
            section.rows.forEach((group)=>{
                group.rows.forEach((row, rowIndex)=>{
                    const cellKey = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getCellKey"])(row.day.id, row.session.id, row.period);
                    const dataRow = [];
                    dataRow.push(rowIndex === 0 ? group.label : '');
                    dataRow.push(String(row.period));
                    resultTableClassColumns.forEach((className)=>{
                        const entry = className ? solvedCellMap.get(cellKey)?.entries?.find((item)=>item.className === className) : null;
                        dataRow.push(entry?.subject ?? '');
                        dataRow.push(entry?.teacher ?? '');
                    });
                    rows.push(dataRow);
                });
            });
        });
        const wb = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$xlsx$2f$xlsx$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["utils"].book_new();
        const timetableSheet = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$xlsx$2f$xlsx$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["utils"].aoa_to_sheet(rows);
        timetableSheet['!cols'] = [
            {
                wch: 12
            },
            {
                wch: 6
            },
            ...resultTableClassColumns.flatMap(()=>[
                    {
                        wch: 18
                    },
                    {
                        wch: 18
                    }
                ])
        ];
        const checkerRows = buildReportRows('Checker report', aiResult.checkerReport);
        const deterministicRows = buildReportRows('Deterministic validation', aiResult.deterministicReport);
        const diagnosticsRows = [
            [
                'Field',
                'Value'
            ],
            [
                'Status',
                aiResult.status
            ],
            [
                'Message',
                aiResult.message
            ],
            [
                'Diagnostics',
                aiResult.diagnostics.join(' | ') || ''
            ],
            [
                'Execution errors',
                aiResult.executionErrors.map((item)=>`${item.constraintId}: ${item.error}`).join(' | ')
            ],
            [
                'Validation errors',
                aiResult.validationErrors.map((item)=>`${item.constraintId}: ${item.error}`).join(' | ')
            ],
            [
                'IIS constraint ids',
                aiResult.iisConstraintIds.join(' | ')
            ],
            [
                'Conflicting constraints',
                aiResult.conflictingConstraints.map((item)=>`${item.id}: ${item.text}`).join(' | ')
            ],
            [],
            [
                'Stage',
                'Summary',
                'At'
            ],
            ...(aiResult.attemptHistorySummary ?? []).map((attempt)=>[
                    attempt.stage,
                    attempt.summary,
                    attempt.at
                ])
        ];
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$xlsx$2f$xlsx$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["utils"].book_append_sheet(wb, timetableSheet, 'Thời khóa biểu');
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$xlsx$2f$xlsx$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["utils"].book_append_sheet(wb, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$xlsx$2f$xlsx$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["utils"].aoa_to_sheet(checkerRows), 'Checker report');
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$xlsx$2f$xlsx$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["utils"].book_append_sheet(wb, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$xlsx$2f$xlsx$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["utils"].aoa_to_sheet(deterministicRows), 'Validation report');
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$xlsx$2f$xlsx$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["utils"].book_append_sheet(wb, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$xlsx$2f$xlsx$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["utils"].aoa_to_sheet(diagnosticsRows), 'Diagnostics');
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$xlsx$2f$xlsx$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["writeFile"](wb, 'thoi-khoa-bieu.xlsx');
    }, [
        aiResult,
        fixedResultTableSections,
        resultTableClassColumns,
        solvedCellMap
    ]);
    const activePeriodCount = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>selectedSpreadsheetDays.reduce((total, day)=>total + timetableRows.filter((row)=>!deletedPeriods[(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getCellKey"])(day.id, row.sessionId, row.period)]).length, 0), [
        deletedPeriods,
        selectedSpreadsheetDays,
        timetableRows
    ]);
    const totalRequiredClassPeriods = activePeriodCount * classList.length;
    const totalAssignedPeriods = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>assignmentList.reduce((total, assignment)=>total + Number(assignment.weeklyPeriods || 0), 0), [
        assignmentList
    ]);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Fragment"], {
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("main", {
                className: "w-full overflow-x-hidden bg-[#0A0A0A] font-normal text-white",
                children: page === 'select' ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                    className: "relative flex min-h-screen w-full flex-col px-4 py-6 sm:px-8 lg:px-12 xl:px-16",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["navBarClass"],
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    type: "button",
                                    onClick: onBackToLanding,
                                    className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["navBackClass"]} ${!onBackToLanding ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["navDisabledClass"] : ''}`,
                                    disabled: !onBackToLanding,
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$arrow$2d$left$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__ArrowLeft$3e$__["ArrowLeft"], {
                                            size: 14,
                                            strokeWidth: 1.5
                                        }, void 0, false, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 1202,
                                            columnNumber: 17
                                        }, this),
                                        "Quay lại"
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                    lineNumber: 1196,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    type: "button",
                                    onClick: ()=>canContinue && setPage('periods'),
                                    disabled: !canContinue,
                                    className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["navNextClass"]} ${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["navDisabledClass"]}`,
                                    children: [
                                        "Tiếp tục",
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$right$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronRight$3e$__["ChevronRight"], {
                                            size: 14,
                                            strokeWidth: 1.5
                                        }, void 0, false, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 1212,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                    lineNumber: 1205,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                            lineNumber: 1195,
                            columnNumber: 13
                        }, this),
                        quickImportError ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "mb-4 rounded-md border border-red-400/30 bg-red-500/[0.08] px-4 py-3 text-sm text-red-200",
                            children: [
                                "Nhập dữ liệu nhanh thất bại: ",
                                quickImportError
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                            lineNumber: 1217,
                            columnNumber: 15
                        }, this) : null,
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("header", {
                            className: "mb-6 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between",
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "mb-4 flex items-center gap-2 text-[11px] font-medium uppercase tracking-widest text-white/30",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$radio$2d$tower$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__RadioTower$3e$__["RadioTower"], {
                                                size: 14,
                                                strokeWidth: 1.5
                                            }, void 0, false, {
                                                fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                lineNumber: 1225,
                                                columnNumber: 19
                                            }, this),
                                            "Thiết lập giảng dạy điện tử"
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                        lineNumber: 1224,
                                        columnNumber: 17
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h1", {
                                        className: "max-w-4xl text-4xl font-semibold tracking-tight text-white sm:text-5xl",
                                        children: "Chọn ngày dạy và buổi dạy"
                                    }, void 0, false, {
                                        fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                        lineNumber: 1228,
                                        columnNumber: 17
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: "mt-4 max-w-2xl text-sm text-white/40",
                                        children: "Tích vào các lựa chọn bạn muốn sử dụng. Bỏ tích những mục không cần."
                                    }, void 0, false, {
                                        fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                        lineNumber: 1231,
                                        columnNumber: 17
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                lineNumber: 1223,
                                columnNumber: 15
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                            lineNumber: 1222,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "mb-6 rounded-lg border border-white/10 bg-[#111] p-5",
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "flex items-center gap-2 text-sm font-medium text-white/80",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$settings$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Settings$3e$__["Settings"], {
                                                        size: 16
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                        lineNumber: 1242,
                                                        columnNumber: 21
                                                    }, this),
                                                    "Cấu hình AI Provider"
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                lineNumber: 1241,
                                                columnNumber: 19
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                className: "mt-1 text-xs text-white/50",
                                                children: "Cần thiết để sử dụng tính năng xếp lịch tự động bằng AI (LLM + OR-Tools)"
                                            }, void 0, false, {
                                                fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                lineNumber: 1245,
                                                columnNumber: 19
                                            }, this),
                                            aiProvider ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "mt-2 text-xs text-emerald-400",
                                                children: [
                                                    "Đã cấu hình: ",
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                        className: "font-mono",
                                                        children: aiProvider.model
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                        lineNumber: 1250,
                                                        columnNumber: 36
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                lineNumber: 1249,
                                                columnNumber: 21
                                            }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "mt-2 text-xs text-amber-400",
                                                children: "Chưa cấu hình — Bắt buộc phải thiết lập trước khi dùng AI"
                                            }, void 0, false, {
                                                fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                lineNumber: 1253,
                                                columnNumber: 21
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                        lineNumber: 1240,
                                        columnNumber: 17
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                        onClick: ()=>setShowSettingsModal(true),
                                        className: "mt-2 w-full rounded-md bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/15 active:bg-white/20 sm:mt-0 sm:w-auto",
                                        children: aiProvider ? 'Thay đổi cấu hình' : 'Cấu hình ngay'
                                    }, void 0, false, {
                                        fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                        lineNumber: 1259,
                                        columnNumber: 17
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                lineNumber: 1239,
                                columnNumber: 15
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                            lineNumber: 1238,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "flex flex-col gap-3",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                                    className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["panelClass"]} p-4`,
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "mb-4 flex items-center gap-2.5",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["iconShellClass"],
                                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$calendar$2d$days$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__CalendarDays$3e$__["CalendarDays"], {
                                                        size: 16,
                                                        strokeWidth: 1.5
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                        lineNumber: 1272,
                                                        columnNumber: 21
                                                    }, this)
                                                }, void 0, false, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 1271,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                                                            className: "text-sm font-semibold text-white",
                                                            children: "Ngày dạy trong tuần"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                            lineNumber: 1275,
                                                            columnNumber: 21
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                            className: "text-xs text-white/40",
                                                            children: "Từ thứ hai đến chủ nhật"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                            lineNumber: 1276,
                                                            columnNumber: 21
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 1274,
                                                    columnNumber: 19
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 1270,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "grid grid-cols-7 gap-2",
                                            children: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["days"].map((day)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(DayTile, {
                                                    selected: selectedDays.includes(day.id),
                                                    title: day.label,
                                                    subtitle: day.short,
                                                    onClick: ()=>toggleItem(day.id, setSelectedDays)
                                                }, day.id, false, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 1281,
                                                    columnNumber: 21
                                                }, this))
                                        }, void 0, false, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 1279,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                    lineNumber: 1269,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                                    className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["panelClass"]} p-4`,
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "mb-4 flex items-center gap-2.5",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["iconShellClass"],
                                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$sun$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Sun$3e$__["Sun"], {
                                                        size: 16,
                                                        strokeWidth: 1.5
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                        lineNumber: 1295,
                                                        columnNumber: 21
                                                    }, this)
                                                }, void 0, false, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 1294,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                                                            className: "text-sm font-semibold text-white",
                                                            children: "Chọn buổi học"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                            lineNumber: 1298,
                                                            columnNumber: 21
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                            className: "text-xs text-white/40",
                                                            children: "Sáng, chiều, tối"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                            lineNumber: 1299,
                                                            columnNumber: 21
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 1297,
                                                    columnNumber: 19
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 1293,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "grid grid-cols-3 gap-2",
                                            children: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["sessions"].map((session)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(SessionTile, {
                                                    selected: selectedSessions.includes(session.id),
                                                    icon: session.icon,
                                                    title: session.label,
                                                    onClick: ()=>toggleItem(session.id, setSelectedSessions)
                                                }, session.id, false, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 1304,
                                                    columnNumber: 21
                                                }, this))
                                        }, void 0, false, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 1302,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                    lineNumber: 1292,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["panelClass"]} p-4`,
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            className: "text-[11px] font-medium uppercase tracking-widest text-[#4DB848]",
                                            children: "Đã chọn"
                                        }, void 0, false, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 1316,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            className: "mt-3 text-sm text-white/70",
                                            children: selectedDayNames.length ? selectedDayNames.join(', ') : 'Chưa chọn ngày dạy'
                                        }, void 0, false, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 1317,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "my-3 h-px bg-white/[0.06]"
                                        }, void 0, false, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 1320,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            className: "text-sm text-white/70",
                                            children: selectedSessionNames.length ? selectedSessionNames.join(', ') : 'Chưa chọn buổi học'
                                        }, void 0, false, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 1321,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                    lineNumber: 1315,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                            lineNumber: 1268,
                            columnNumber: 13
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                    lineNumber: 1194,
                    columnNumber: 9
                }, this) : page === 'periods' ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                    className: "relative flex min-h-screen w-full flex-col px-4 py-6 sm:px-8 lg:px-12 xl:px-16",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["navBarClass"],
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    type: "button",
                                    onClick: ()=>setPage('select'),
                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["navBackClass"],
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$arrow$2d$left$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__ArrowLeft$3e$__["ArrowLeft"], {
                                            size: 14,
                                            strokeWidth: 1.5
                                        }, void 0, false, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 1336,
                                            columnNumber: 15
                                        }, this),
                                        "Quay lại"
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                    lineNumber: 1331,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    type: "button",
                                    onClick: ()=>setPage('final'),
                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["navNextClass"],
                                    children: [
                                        "Tiếp tục",
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$right$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronRight$3e$__["ChevronRight"], {
                                            size: 14,
                                            strokeWidth: 1.5
                                        }, void 0, false, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 1345,
                                            columnNumber: 15
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                    lineNumber: 1339,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                            lineNumber: 1330,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("header", {
                            className: "mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "mb-4 flex items-center gap-2 text-[11px] font-medium uppercase tracking-widest text-white/30",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$hash$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Hash$3e$__["Hash"], {
                                                    size: 14,
                                                    strokeWidth: 1.5
                                                }, void 0, false, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 1351,
                                                    columnNumber: 17
                                                }, this),
                                                "Thiết lập số tiết tối đa"
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 1350,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h1", {
                                            className: "max-w-4xl text-4xl font-semibold tracking-tight text-white sm:text-5xl",
                                            children: "Chọn số tiết tối đa"
                                        }, void 0, false, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 1354,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            className: "mt-4 max-w-2xl text-sm text-white/40",
                                            children: "Những ngày và buổi bạn đã chọn được giữ lại. Chỉ các buổi đã chọn mới xuất hiện ở đây."
                                        }, void 0, false, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 1357,
                                            columnNumber: 15
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                    lineNumber: 1349,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["panelClass"]} p-4 text-sm text-white/50 lg:max-w-md`,
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            className: "font-medium text-white",
                                            children: "Ngày giảng dạy"
                                        }, void 0, false, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 1362,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            className: "mt-2 leading-6",
                                            children: selectedDayNames.join(', ')
                                        }, void 0, false, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 1363,
                                            columnNumber: 15
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                    lineNumber: 1361,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                            lineNumber: 1348,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "grid flex-1 gap-4 lg:grid-cols-[1fr_0.55fr]",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                                    className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["panelClass"]} p-4`,
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "mb-4 flex items-center gap-2.5",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["iconShellClass"],
                                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$hash$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Hash$3e$__["Hash"], {
                                                        size: 16,
                                                        strokeWidth: 1.5
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                        lineNumber: 1371,
                                                        columnNumber: 19
                                                    }, this)
                                                }, void 0, false, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 1370,
                                                    columnNumber: 17
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                                                            className: "text-sm font-semibold text-white",
                                                            children: "Các buổi đã chọn"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                            lineNumber: 1374,
                                                            columnNumber: 19
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                            className: "text-xs text-white/40",
                                                            children: "Thiết lập một số tiết tối đa cho mỗi buổi"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                            lineNumber: 1375,
                                                            columnNumber: 19
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 1373,
                                                    columnNumber: 17
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 1369,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "grid gap-3",
                                            children: selectedSessionData.map((session)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(PeriodControl, {
                                                    session: session,
                                                    value: periods[session.id] ?? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["defaultPeriods"][session.id],
                                                    onChange: updatePeriod
                                                }, session.id, false, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 1381,
                                                    columnNumber: 19
                                                }, this))
                                        }, void 0, false, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 1379,
                                            columnNumber: 15
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                    lineNumber: 1368,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("aside", {
                                    className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["panelClass"]} p-4`,
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "mb-4 flex items-center gap-2.5",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["iconShellClass"],
                                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$check$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Check$3e$__["Check"], {
                                                        size: 16,
                                                        strokeWidth: 1.5
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                        lineNumber: 1394,
                                                        columnNumber: 19
                                                    }, this)
                                                }, void 0, false, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 1393,
                                                    columnNumber: 17
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                                                            className: "text-sm font-semibold text-white",
                                                            children: "Thiết lập của bạn"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                            lineNumber: 1397,
                                                            columnNumber: 19
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                            className: "text-xs text-white/40",
                                                            children: "Được lưu từ trang đầu tiên"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                            lineNumber: 1398,
                                                            columnNumber: 19
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 1396,
                                                    columnNumber: 17
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 1392,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "space-y-3",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["panelMutedClass"]} p-4`,
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                            className: "text-[11px] font-medium uppercase tracking-widest text-white/50",
                                                            children: "Ngày học"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                            lineNumber: 1404,
                                                            columnNumber: 19
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                            className: "mt-2 text-sm text-white/70",
                                                            children: selectedDayNames.join(', ')
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                            lineNumber: 1405,
                                                            columnNumber: 19
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 1403,
                                                    columnNumber: 17
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["panelMutedClass"]} p-4`,
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                            className: "text-[11px] font-medium uppercase tracking-widest text-white/50",
                                                            children: "Số tiết tối đa"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                            lineNumber: 1409,
                                                            columnNumber: 19
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            className: "mt-3 space-y-2",
                                                            children: selectedSessionData.map((session)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                    className: "flex items-center justify-between gap-3 text-sm text-white/70",
                                                                    children: [
                                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                            children: session.label
                                                                        }, void 0, false, {
                                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                            lineNumber: 1413,
                                                                            columnNumber: 25
                                                                        }, this),
                                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                            className: "rounded bg-[#4DB848]/10 border border-[#4DB848]/20 px-2 py-0.5 text-xs font-medium text-[#4DB848]",
                                                                            children: periods[session.id] ?? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["defaultPeriods"][session.id]
                                                                        }, void 0, false, {
                                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                            lineNumber: 1414,
                                                                            columnNumber: 25
                                                                        }, this)
                                                                    ]
                                                                }, session.id, true, {
                                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                    lineNumber: 1412,
                                                                    columnNumber: 23
                                                                }, this))
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                            lineNumber: 1410,
                                                            columnNumber: 19
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 1408,
                                                    columnNumber: 17
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 1402,
                                            columnNumber: 15
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                    lineNumber: 1391,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                            lineNumber: 1367,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                    lineNumber: 1329,
                    columnNumber: 9
                }, this) : page === 'final' ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                    className: "relative flex min-h-screen w-full flex-col px-4 py-6 sm:px-8 lg:px-12 xl:px-16",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["navBarClass"],
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    type: "button",
                                    onClick: ()=>setPage('periods'),
                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["navBackClass"],
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$arrow$2d$left$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__ArrowLeft$3e$__["ArrowLeft"], {
                                            size: 14,
                                            strokeWidth: 1.5
                                        }, void 0, false, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 1434,
                                            columnNumber: 15
                                        }, this),
                                        "Quay lại"
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                    lineNumber: 1429,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    type: "button",
                                    onClick: ()=>activePeriodCount > 0 && setPage('details'),
                                    disabled: activePeriodCount <= 0,
                                    className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["navNextClass"]} ${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["navDisabledClass"]}`,
                                    children: [
                                        "Tiếp tục",
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$right$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronRight$3e$__["ChevronRight"], {
                                            size: 14,
                                            strokeWidth: 1.5
                                        }, void 0, false, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 1444,
                                            columnNumber: 15
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                    lineNumber: 1437,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                            lineNumber: 1428,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("header", {
                            className: "mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            className: "mb-4 flex items-center gap-2 text-[11px] font-medium uppercase tracking-widest text-white/30",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$calendar$2d$days$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__CalendarDays$3e$__["CalendarDays"], {
                                                    size: 14,
                                                    strokeWidth: 1.5
                                                }, void 0, false, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 1450,
                                                    columnNumber: 17
                                                }, this),
                                                "Bảng thời khóa biểu mẫu"
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 1449,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h1", {
                                            className: "text-4xl font-semibold tracking-tight text-white sm:text-5xl",
                                            children: "Xem trước thời khóa biểu điện tử"
                                        }, void 0, false, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 1453,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            className: "mt-3 max-w-3xl text-sm text-white/40",
                                            children: "Nhấn vào từng ô tiết học để xóa riêng ô đó theo từng ngày. Nhấn lại để khôi phục."
                                        }, void 0, false, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 1454,
                                            columnNumber: 15
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                    lineNumber: 1448,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "flex flex-col gap-3 sm:flex-row lg:items-center",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["panelClass"]} px-4 py-2.5 text-sm text-white/50`,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "font-medium text-white",
                                                    children: "Số tiết đang hoạt động:"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 1460,
                                                    columnNumber: 17
                                                }, this),
                                                " ",
                                                activePeriodCount
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 1459,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                            type: "button",
                                            onClick: restoreDeletedPeriods,
                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ghostButtonClass"],
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$rotate$2d$ccw$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__RotateCcw$3e$__["RotateCcw"], {
                                                    size: 14,
                                                    strokeWidth: 1.5
                                                }, void 0, false, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 1468,
                                                    columnNumber: 17
                                                }, this),
                                                "Khôi phục tất cả"
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 1462,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                    lineNumber: 1458,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                            lineNumber: 1447,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["panelClass"]} flex-1 overflow-hidden p-3 sm:p-4`,
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "mb-4 grid gap-3 md:grid-cols-3",
                                    children: selectedSessionData.map((session)=>{
                                        const sessionTotal = selectedSpreadsheetDays.reduce((total, day)=>total + Array.from({
                                                length: periods[session.id] ?? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["defaultPeriods"][session.id]
                                            }, (_, index)=>index + 1).filter((period)=>!deletedPeriods[(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getCellKey"])(day.id, session.id, period)]).length, 0);
                                        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["panelMutedClass"]} p-4`,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                    className: "text-[11px] font-medium uppercase tracking-widest text-white/50",
                                                    children: session.label
                                                }, void 0, false, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 1488,
                                                    columnNumber: 21
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                    className: "mt-2 text-2xl font-semibold text-white",
                                                    children: sessionTotal
                                                }, void 0, false, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 1489,
                                                    columnNumber: 21
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                    className: "text-xs text-white/30",
                                                    children: "ô tiết vẫn đang bật"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 1490,
                                                    columnNumber: 21
                                                }, this)
                                            ]
                                        }, session.id, true, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 1487,
                                            columnNumber: 19
                                        }, this);
                                    })
                                }, void 0, false, {
                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                    lineNumber: 1475,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "h-full overflow-auto rounded-md border border-white/[0.06] bg-[#141414] text-white",
                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("table", {
                                        className: "min-w-[900px] w-full border-separate border-spacing-0 table-fixed text-left text-sm",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("thead", {
                                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("tr", {
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("th", {
                                                            className: "sticky left-0 top-0 z-20 h-10 w-24 border-b border-r border-white/[0.06] bg-[#141414] px-3 text-[11px] font-semibold uppercase tracking-widest text-white/90",
                                                            children: "Buổi"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                            lineNumber: 1500,
                                                            columnNumber: 23
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("th", {
                                                            className: "sticky left-24 top-0 z-20 h-10 w-16 border-b border-r border-white/[0.06] bg-[#141414] px-2 text-center text-[11px] font-semibold uppercase tracking-widest text-white/90",
                                                            children: "Tiết"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                            lineNumber: 1503,
                                                            columnNumber: 23
                                                        }, this),
                                                        selectedSpreadsheetDays.map((day)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("th", {
                                                                className: "sticky top-0 z-10 h-12 border-b border-r border-white/[0.06] bg-[#141414] px-3 text-center text-sm font-semibold text-white",
                                                                children: day.tableLabel
                                                            }, day.id, false, {
                                                                fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                lineNumber: 1507,
                                                                columnNumber: 23
                                                            }, this))
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 1499,
                                                    columnNumber: 19
                                                }, this)
                                            }, void 0, false, {
                                                fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                lineNumber: 1498,
                                                columnNumber: 17
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("tbody", {
                                                children: timetableRows.map((row)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("tr", {
                                                        className: "h-10",
                                                        children: [
                                                            row.firstInSession ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("td", {
                                                                rowSpan: row.sessionPeriodCount,
                                                                className: "sticky left-0 z-10 w-24 border-b border-r border-white/[0.06] bg-[#141414] px-3 text-center align-middle",
                                                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                    className: "text-xs font-semibold text-white",
                                                                    children: row.sessionLabel
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                    lineNumber: 1521,
                                                                    columnNumber: 29
                                                                }, this)
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                lineNumber: 1520,
                                                                columnNumber: 27
                                                            }, this) : null,
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("td", {
                                                                className: "sticky left-24 z-10 w-16 border-b border-r border-white/[0.06] bg-[#141414] px-2 text-center align-middle",
                                                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                    className: "text-xs font-semibold text-white",
                                                                    children: row.period
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                    lineNumber: 1525,
                                                                    columnNumber: 27
                                                                }, this)
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                lineNumber: 1524,
                                                                columnNumber: 25
                                                            }, this),
                                                            selectedSpreadsheetDays.map((day)=>{
                                                                const cellKey = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getCellKey"])(day.id, row.sessionId, row.period);
                                                                const isDeleted = deletedPeriods[cellKey];
                                                                return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("td", {
                                                                    className: "border-b border-r border-white/[0.04] p-1.5",
                                                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                        type: "button",
                                                                        onClick: ()=>toggleDeletedPeriod(day.id, row.sessionId, row.period),
                                                                        className: `group flex h-7 w-full items-center justify-between gap-2 rounded border px-2 text-center text-xs font-medium transition ${isDeleted ? 'border-green-500/25 bg-green-500/[0.08] text-green-400 hover:bg-green-500/[0.14] hover:border-green-500/35' : 'border-white/[0.06] bg-[#141414] text-white/50 hover:border-white/[0.12]'}`,
                                                                        "aria-label": `${isDeleted ? 'Khôi phục' : 'Xóa'} ${day.label} ${row.sessionLabel} tiết ${row.period}`,
                                                                        children: [
                                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                                className: isDeleted ? 'mx-auto inline-flex items-center gap-1.5' : 'min-w-0 flex-1',
                                                                                children: isDeleted ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Fragment"], {
                                                                                    children: [
                                                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$rotate$2d$ccw$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__RotateCcw$3e$__["RotateCcw"], {
                                                                                            size: 11,
                                                                                            strokeWidth: 1.5
                                                                                        }, void 0, false, {
                                                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                                            lineNumber: 1547,
                                                                                            columnNumber: 39
                                                                                        }, this),
                                                                                        "Restore"
                                                                                    ]
                                                                                }, void 0, true) : row.period
                                                                            }, void 0, false, {
                                                                                fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                                lineNumber: 1544,
                                                                                columnNumber: 33
                                                                            }, this),
                                                                            !isDeleted && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                                className: "flex h-4 w-4 shrink-0 items-center justify-center text-red-400/60 group-hover:text-red-400",
                                                                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$trash$2d$2$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Trash2$3e$__["Trash2"], {
                                                                                    size: 11,
                                                                                    strokeWidth: 1.5
                                                                                }, void 0, false, {
                                                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                                    lineNumber: 1556,
                                                                                    columnNumber: 39
                                                                                }, this)
                                                                            }, void 0, false, {
                                                                                fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                                lineNumber: 1555,
                                                                                columnNumber: 37
                                                                            }, this)
                                                                        ]
                                                                    }, void 0, true, {
                                                                        fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                        lineNumber: 1533,
                                                                        columnNumber: 31
                                                                    }, this)
                                                                }, cellKey, false, {
                                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                    lineNumber: 1532,
                                                                    columnNumber: 29
                                                                }, this);
                                                            })
                                                        ]
                                                    }, row.id, true, {
                                                        fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                        lineNumber: 1518,
                                                        columnNumber: 23
                                                    }, this))
                                            }, void 0, false, {
                                                fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                lineNumber: 1516,
                                                columnNumber: 29
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                        lineNumber: 1497,
                                        columnNumber: 15
                                    }, this)
                                }, void 0, false, {
                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                    lineNumber: 1496,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                            lineNumber: 1474,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                    lineNumber: 1427,
                    columnNumber: 9
                }, this) : page === 'details' ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                    className: "relative flex min-h-screen w-full flex-col px-4 py-6 sm:px-8 lg:px-12 xl:px-16",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["navBarClass"],
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    type: "button",
                                    onClick: ()=>setPage('final'),
                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["navBackClass"],
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$arrow$2d$left$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__ArrowLeft$3e$__["ArrowLeft"], {
                                            size: 14,
                                            strokeWidth: 1.5
                                        }, void 0, false, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 1580,
                                            columnNumber: 17
                                        }, this),
                                        "Quay lại"
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                    lineNumber: 1575,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    type: "button",
                                    onClick: ()=>setPage('subjects'),
                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["navNextClass"],
                                    children: [
                                        "Tiếp tục",
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$right$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronRight$3e$__["ChevronRight"], {
                                            size: 14,
                                            strokeWidth: 1.5
                                        }, void 0, false, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 1589,
                                            columnNumber: 19
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                    lineNumber: 1583,
                                    columnNumber: 17
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                            lineNumber: 1574,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("header", {
                            className: "mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "mb-4 flex items-center gap-2 text-[11px] font-medium uppercase tracking-widest text-white/30",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$user$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__User$3e$__["User"], {
                                                    size: 14,
                                                    strokeWidth: 1.5
                                                }, void 0, false, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 1595,
                                                    columnNumber: 19
                                                }, this),
                                                "Danh sách giáo viên"
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 1594,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h1", {
                                            className: "max-w-4xl text-4xl font-semibold tracking-tight text-white sm:text-5xl",
                                            children: "Nhập tên giáo viên"
                                        }, void 0, false, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 1598,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            className: "mt-4 max-w-3xl text-sm text-white/40",
                                            children: "Trang này chỉ dùng để nhập và quản lý danh sách giáo viên. Nhập tên giáo viên rồi nhấn Import để thêm vào danh sách."
                                        }, void 0, false, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 1601,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                    lineNumber: 1593,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["panelClass"]} p-4 text-sm text-white/50 lg:max-w-md`,
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            className: "font-medium text-white",
                                            children: "Tổng giáo viên"
                                        }, void 0, false, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 1606,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            className: "mt-2 text-3xl font-semibold text-white",
                                            children: teacherList.length
                                        }, void 0, false, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 1607,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                    lineNumber: 1605,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                            lineNumber: 1592,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "grid flex-1 gap-4 lg:grid-cols-[0.9fr_1.1fr]",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                                    className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["panelClass"]} p-4`,
                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("form", {
                                        onSubmit: (event)=>{
                                            event.preventDefault();
                                            importTeacher();
                                        },
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "mb-4 flex items-center gap-2.5",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["iconShellClass"],
                                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$user$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__User$3e$__["User"], {
                                                            size: 16,
                                                            strokeWidth: 1.5
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                            lineNumber: 1621,
                                                            columnNumber: 23
                                                        }, this)
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                        lineNumber: 1620,
                                                        columnNumber: 21
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                                                                className: "text-sm font-semibold text-white",
                                                                children: "Nhập giáo viên"
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                lineNumber: 1624,
                                                                columnNumber: 23
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                                className: "text-xs text-white/40",
                                                                children: "Thêm từng giáo viên vào danh sách"
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                lineNumber: 1625,
                                                                columnNumber: 23
                                                            }, this)
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                        lineNumber: 1623,
                                                        columnNumber: 21
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                lineNumber: 1619,
                                                columnNumber: 19
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "mb-4 grid grid-cols-2 gap-2",
                                                children: [
                                                    {
                                                        id: 'bulk',
                                                        label: 'Bulk Update',
                                                        color: '#6699FF'
                                                    },
                                                    {
                                                        id: 'update',
                                                        label: 'Update',
                                                        color: '#FFCC00'
                                                    }
                                                ].map((option)=>{
                                                    const isActive = teacherImportMode === option.id;
                                                    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                        type: "button",
                                                        onClick: ()=>setTeacherImportMode(option.id),
                                                        className: `rounded px-3 py-2 text-sm font-medium transition ${isActive ? 'text-black' : 'border border-white/[0.08] text-white/60 hover:text-white'}`,
                                                        style: {
                                                            backgroundColor: isActive ? option.color : 'transparent'
                                                        },
                                                        children: option.label
                                                    }, option.id, false, {
                                                        fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                        lineNumber: 1637,
                                                        columnNumber: 25
                                                    }, this);
                                                })
                                            }, void 0, false, {
                                                fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                lineNumber: 1629,
                                                columnNumber: 19
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                                className: "block",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                        className: "mb-2 block text-xs font-medium text-white/50",
                                                        children: "Nhập tên giáo viên"
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                        lineNumber: 1651,
                                                        columnNumber: 21
                                                    }, this),
                                                    teacherImportMode === 'bulk' ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("textarea", {
                                                        id: "teacher-input",
                                                        ref: teacherInputRef,
                                                        value: teacherInput,
                                                        onChange: (event)=>setTeacherInput(event.target.value),
                                                        onInput: (event)=>setTeacherInput(event.currentTarget.value),
                                                        placeholder: `Nguyễn Văn A\nTrần Thị B\nLê Văn C`,
                                                        rows: 6,
                                                        className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["inputClass"]} min-h-36 resize-y`
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                        lineNumber: 1653,
                                                        columnNumber: 23
                                                    }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                        id: "teacher-input",
                                                        ref: teacherInputRef,
                                                        type: "text",
                                                        value: teacherInput,
                                                        onChange: (event)=>setTeacherInput(event.target.value),
                                                        onInput: (event)=>setTeacherInput(event.currentTarget.value),
                                                        onKeyDown: (event)=>{
                                                            if (event.key === 'Enter') {
                                                                event.preventDefault();
                                                                importTeacher();
                                                            }
                                                        },
                                                        placeholder: "Ví dụ: Nguyễn Văn A",
                                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["inputClass"]
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                        lineNumber: 1664,
                                                        columnNumber: 23
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                lineNumber: 1650,
                                                columnNumber: 19
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                type: "submit",
                                                disabled: !teacherInput.trim(),
                                                className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["primaryButtonClass"]} ${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["disabledPrimaryButtonClass"]} mt-4 w-full`,
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$plus$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Plus$3e$__["Plus"], {
                                                        size: 14,
                                                        strokeWidth: 1.5
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                        lineNumber: 1688,
                                                        columnNumber: 21
                                                    }, this),
                                                    "Import"
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                lineNumber: 1683,
                                                columnNumber: 19
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                        lineNumber: 1613,
                                        columnNumber: 17
                                    }, this)
                                }, void 0, false, {
                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                    lineNumber: 1612,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("aside", {
                                    className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["panelClass"]} p-4`,
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "mb-4 flex items-center gap-2.5",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["iconShellClass"],
                                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$check$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Check$3e$__["Check"], {
                                                        size: 16,
                                                        strokeWidth: 1.5
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                        lineNumber: 1697,
                                                        columnNumber: 21
                                                    }, this)
                                                }, void 0, false, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 1696,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                                                            className: "text-sm font-semibold text-white",
                                                            children: "Teacher list"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                            lineNumber: 1700,
                                                            columnNumber: 21
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                            className: "text-xs text-white/40",
                                                            children: "Có thể xóa từng giáo viên bằng nút bên cạnh"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                            lineNumber: 1701,
                                                            columnNumber: 21
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 1699,
                                                    columnNumber: 19
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 1695,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "space-y-0",
                                            children: teacherList.length ? sortedTeacherList.map((teacher, index)=>{
                                                const teacherColor = __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["teacherColors"][index % __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["teacherColors"].length];
                                                return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "flex items-center justify-between gap-3 border-b border-white/[0.04] py-3 last:border-b-0",
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            className: "flex items-center gap-2.5",
                                                            children: [
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                    className: "flex h-6 w-6 items-center justify-center rounded text-[10px] font-medium",
                                                                    style: {
                                                                        backgroundColor: teacherColor.bg,
                                                                        color: teacherColor.text,
                                                                        border: `1px solid ${teacherColor.border}`
                                                                    },
                                                                    children: index + 1
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                    lineNumber: 1716,
                                                                    columnNumber: 31
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                    className: "text-sm text-white",
                                                                    children: teacher
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                    lineNumber: 1722,
                                                                    columnNumber: 31
                                                                }, this)
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                            lineNumber: 1715,
                                                            columnNumber: 29
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                            type: "button",
                                                            onClick: ()=>deleteTeacher(teacher),
                                                            className: "p-1 transition hover:bg-white/[0.04]",
                                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$trash$2d$2$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Trash2$3e$__["Trash2"], {
                                                                size: 14,
                                                                className: "text-red-400/60 hover:text-red-400",
                                                                strokeWidth: 1.5
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                lineNumber: 1729,
                                                                columnNumber: 31
                                                            }, this)
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                            lineNumber: 1724,
                                                            columnNumber: 29
                                                        }, this)
                                                    ]
                                                }, teacher, true, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 1711,
                                                    columnNumber: 27
                                                }, this);
                                            }) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["panelMutedClass"]} p-4 text-sm text-white/30`,
                                                children: "Chưa có giáo viên nào. Hãy nhập tên giáo viên và nhấn Import."
                                            }, void 0, false, {
                                                fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                lineNumber: 1735,
                                                columnNumber: 21
                                            }, this)
                                        }, void 0, false, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 1705,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                    lineNumber: 1694,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                            lineNumber: 1611,
                            columnNumber: 13
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                    lineNumber: 1573,
                    columnNumber: 13
                }, this) : page === 'subjects' ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                    className: "relative flex min-h-screen w-full flex-col px-4 py-6 sm:px-8 lg:px-12 xl:px-16",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["navBarClass"],
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    type: "button",
                                    onClick: ()=>setPage('details'),
                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["navBackClass"],
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$arrow$2d$left$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__ArrowLeft$3e$__["ArrowLeft"], {
                                            size: 14,
                                            strokeWidth: 1.5
                                        }, void 0, false, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 1752,
                                            columnNumber: 19
                                        }, this),
                                        "Quay lại"
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                    lineNumber: 1747,
                                    columnNumber: 17
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    type: "button",
                                    onClick: ()=>setPage('classes'),
                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["navNextClass"],
                                    children: [
                                        "Tiếp tục",
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$right$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronRight$3e$__["ChevronRight"], {
                                            size: 14,
                                            strokeWidth: 1.5
                                        }, void 0, false, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 1761,
                                            columnNumber: 21
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                    lineNumber: 1755,
                                    columnNumber: 19
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                            lineNumber: 1746,
                            columnNumber: 17
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("header", {
                            className: "mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "mb-4 flex items-center gap-2 text-[11px] font-medium uppercase tracking-widest text-white/30",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$book$2d$open$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__BookOpen$3e$__["BookOpen"], {
                                                    size: 14,
                                                    strokeWidth: 1.5
                                                }, void 0, false, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 1767,
                                                    columnNumber: 23
                                                }, this),
                                                "Danh sách môn học"
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 1766,
                                            columnNumber: 21
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h1", {
                                            className: "max-w-4xl text-4xl font-semibold tracking-tight text-white sm:text-5xl",
                                            children: "Nhập tên môn học"
                                        }, void 0, false, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 1770,
                                            columnNumber: 19
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            className: "mt-4 max-w-3xl text-sm text-white/40",
                                            children: "Trang này dùng để nhập và quản lý danh sách môn học. Nhập tên môn học rồi nhấn Import để thêm vào danh sách."
                                        }, void 0, false, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 1773,
                                            columnNumber: 19
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                    lineNumber: 1765,
                                    columnNumber: 19
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["panelClass"]} p-4 text-sm text-white/50 lg:max-w-md`,
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            className: "font-medium text-white",
                                            children: "Tổng môn học"
                                        }, void 0, false, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 1778,
                                            columnNumber: 19
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            className: "mt-2 text-3xl font-semibold text-white",
                                            children: subjectList.length
                                        }, void 0, false, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 1779,
                                            columnNumber: 19
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                    lineNumber: 1777,
                                    columnNumber: 17
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                            lineNumber: 1764,
                            columnNumber: 17
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "grid flex-1 gap-4 lg:grid-cols-[0.9fr_1.1fr]",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                                    className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["panelClass"]} p-4`,
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "mb-4 flex items-center gap-2.5",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["iconShellClass"],
                                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$book$2d$open$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__BookOpen$3e$__["BookOpen"], {
                                                        size: 16,
                                                        strokeWidth: 1.5
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                        lineNumber: 1787,
                                                        columnNumber: 23
                                                    }, this)
                                                }, void 0, false, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 1786,
                                                    columnNumber: 21
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                                                            className: "text-sm font-semibold text-white",
                                                            children: "Nhập môn học"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                            lineNumber: 1790,
                                                            columnNumber: 23
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                            className: "text-xs text-white/40",
                                                            children: "Thêm từng môn học vào danh sách"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                            lineNumber: 1791,
                                                            columnNumber: 23
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 1789,
                                                    columnNumber: 21
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 1785,
                                            columnNumber: 19
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "mb-4 grid grid-cols-2 gap-2",
                                            children: [
                                                {
                                                    id: 'bulk',
                                                    label: 'Bulk Update',
                                                    color: '#6699FF'
                                                },
                                                {
                                                    id: 'update',
                                                    label: 'Update',
                                                    color: '#FFCC00'
                                                }
                                            ].map((option)=>{
                                                const isActive = subjectImportMode === option.id;
                                                return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                    type: "button",
                                                    onClick: ()=>setSubjectImportMode(option.id),
                                                    className: `rounded px-3 py-2 text-sm font-medium transition ${isActive ? 'text-black' : 'border border-white/[0.08] text-white/60 hover:text-white'}`,
                                                    style: {
                                                        backgroundColor: isActive ? option.color : 'transparent'
                                                    },
                                                    children: option.label
                                                }, option.id, false, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 1803,
                                                    columnNumber: 25
                                                }, this);
                                            })
                                        }, void 0, false, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 1795,
                                            columnNumber: 19
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                            className: "block",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "mb-2 block text-xs font-medium text-white/50",
                                                    children: "Nhập tên môn học"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 1817,
                                                    columnNumber: 21
                                                }, this),
                                                subjectImportMode === 'bulk' ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("textarea", {
                                                    value: subjectInput,
                                                    onChange: (event)=>setSubjectInput(event.target.value),
                                                    placeholder: `Toán\nNgữ văn\nTiếng Anh`,
                                                    rows: 6,
                                                    className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["inputClass"]} min-h-36 resize-y`
                                                }, void 0, false, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 1819,
                                                    columnNumber: 23
                                                }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                    type: "text",
                                                    value: subjectInput,
                                                    onChange: (event)=>setSubjectInput(event.target.value),
                                                    onKeyDown: (event)=>{
                                                        if (event.key === 'Enter') {
                                                            event.preventDefault();
                                                            importSubject();
                                                        }
                                                    },
                                                    placeholder: "Ví dụ: Toán",
                                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["inputClass"]
                                                }, void 0, false, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 1827,
                                                    columnNumber: 23
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 1816,
                                            columnNumber: 19
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                            type: "button",
                                            onClick: ()=>importSubject(),
                                            disabled: !subjectInput.trim(),
                                            className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["primaryButtonClass"]} ${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["disabledPrimaryButtonClass"]} mt-4 w-full`,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$plus$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Plus$3e$__["Plus"], {
                                                    size: 14,
                                                    strokeWidth: 1.5
                                                }, void 0, false, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 1849,
                                                    columnNumber: 23
                                                }, this),
                                                "Import"
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 1843,
                                            columnNumber: 21
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["panelMutedClass"]} mt-4 p-4`,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                    className: "text-xs font-medium text-white/70",
                                                    children: "Môn học cấp 2"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 1854,
                                                    columnNumber: 23
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                    className: "mt-1 text-[11px] leading-5 text-white/30",
                                                    children: "Bấm vào môn để import nhanh. Môn có viết tắt sẽ được lưu bằng mã viết tắt."
                                                }, void 0, false, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 1855,
                                                    columnNumber: 23
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "mt-3 flex flex-wrap gap-1.5",
                                                    children: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["subjectPresets"].map((subject)=>{
                                                        const isAdded = subjectList.includes(subject.value);
                                                        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                            type: "button",
                                                            onClick: ()=>importSubject(subject.value),
                                                            className: `rounded-full border px-3 py-1.5 text-xs transition active:scale-95 active:transition-transform ${isAdded ? 'border-white/[0.04] bg-white/[0.02] text-white/25 cursor-default' : 'border-white/[0.12] bg-white/[0.04] text-white/80 hover:bg-white/[0.08] hover:border-white/[0.18] hover:text-white'}`,
                                                            title: isAdded ? `Đã thêm: ${subject.value}` : `Import: ${subject.value}`,
                                                            children: [
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                    children: subject.label
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                    lineNumber: 1873,
                                                                    columnNumber: 29
                                                                }, this),
                                                                subject.value !== subject.label && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                    className: `ml-1.5 rounded border px-1.5 py-0.5 text-[10px] font-medium ${isAdded ? 'border-white/[0.06] bg-white/[0.02] text-white/20' : 'border-[#4DB848]/25 bg-[#4DB848]/10 text-[#4DB848]'}`,
                                                                    children: subject.value
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                    lineNumber: 1875,
                                                                    columnNumber: 31
                                                                }, this)
                                                            ]
                                                        }, subject.value, true, {
                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                            lineNumber: 1862,
                                                            columnNumber: 27
                                                        }, this);
                                                    })
                                                }, void 0, false, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 1858,
                                                    columnNumber: 23
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 1853,
                                            columnNumber: 21
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                    lineNumber: 1784,
                                    columnNumber: 17
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("aside", {
                                    className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["panelClass"]} p-4`,
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "mb-4 flex items-center gap-2.5",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["iconShellClass"],
                                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$check$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Check$3e$__["Check"], {
                                                        size: 16,
                                                        strokeWidth: 1.5
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                        lineNumber: 1892,
                                                        columnNumber: 23
                                                    }, this)
                                                }, void 0, false, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 1891,
                                                    columnNumber: 21
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                                                            className: "text-sm font-semibold text-white",
                                                            children: "Subject list"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                            lineNumber: 1895,
                                                            columnNumber: 23
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                            className: "text-xs text-white/40",
                                                            children: "Có thể xóa từng môn học bằng nút bên cạnh"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                            lineNumber: 1896,
                                                            columnNumber: 23
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 1894,
                                                    columnNumber: 21
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 1890,
                                            columnNumber: 19
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "space-y-0",
                                            children: subjectList.length ? sortedSubjectList.map((subject, index)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "flex items-center justify-between gap-3 border-b border-white/[0.04] py-3 last:border-b-0",
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            className: "flex items-center gap-2.5",
                                                            children: [
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                    className: "flex h-6 w-6 items-center justify-center rounded border border-white/[0.06] bg-[#141414] text-[10px] font-medium text-white/50",
                                                                    children: index + 1
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                    lineNumber: 1908,
                                                                    columnNumber: 29
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                    className: "text-sm text-white",
                                                                    children: subject
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                    lineNumber: 1911,
                                                                    columnNumber: 29
                                                                }, this)
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                            lineNumber: 1907,
                                                            columnNumber: 27
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                            type: "button",
                                                            onClick: ()=>deleteSubject(subject),
                                                            className: "p-1 transition hover:bg-white/[0.04]",
                                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$trash$2d$2$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Trash2$3e$__["Trash2"], {
                                                                size: 14,
                                                                className: "text-red-400/60 hover:text-red-400",
                                                                strokeWidth: 1.5
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                lineNumber: 1918,
                                                                columnNumber: 29
                                                            }, this)
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                            lineNumber: 1913,
                                                            columnNumber: 27
                                                        }, this)
                                                    ]
                                                }, subject, true, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 1903,
                                                    columnNumber: 25
                                                }, this)) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["panelMutedClass"]} p-4 text-sm text-white/30`,
                                                children: "Chưa có môn học nào. Hãy nhập tên môn học và nhấn Import."
                                            }, void 0, false, {
                                                fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                lineNumber: 1923,
                                                columnNumber: 23
                                            }, this)
                                        }, void 0, false, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 1900,
                                            columnNumber: 19
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                    lineNumber: 1889,
                                    columnNumber: 17
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                            lineNumber: 1783,
                            columnNumber: 15
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                    lineNumber: 1745,
                    columnNumber: 15
                }, this) : page === 'classes' ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                    className: "relative flex min-h-screen w-full flex-col px-4 py-6 sm:px-8 lg:px-12 xl:px-16",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["navBarClass"],
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    type: "button",
                                    onClick: ()=>setPage('subjects'),
                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["navBackClass"],
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$arrow$2d$left$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__ArrowLeft$3e$__["ArrowLeft"], {
                                            size: 14,
                                            strokeWidth: 1.5
                                        }, void 0, false, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 1940,
                                            columnNumber: 21
                                        }, this),
                                        "Quay lại"
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                    lineNumber: 1935,
                                    columnNumber: 19
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    type: "button",
                                    onClick: ()=>setPage('assignments'),
                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["navNextClass"],
                                    children: [
                                        "Tiếp tục",
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$right$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronRight$3e$__["ChevronRight"], {
                                            size: 14,
                                            strokeWidth: 1.5
                                        }, void 0, false, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 1949,
                                            columnNumber: 23
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                    lineNumber: 1943,
                                    columnNumber: 21
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                            lineNumber: 1934,
                            columnNumber: 17
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("header", {
                            className: "mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "mb-4 flex items-center gap-2 text-[11px] font-medium uppercase tracking-widest text-white/30",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$hash$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Hash$3e$__["Hash"], {
                                                    size: 14,
                                                    strokeWidth: 1.5
                                                }, void 0, false, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 1956,
                                                    columnNumber: 23
                                                }, this),
                                                "Danh sách lớp học"
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 1955,
                                            columnNumber: 21
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h1", {
                                            className: "max-w-4xl text-4xl font-semibold tracking-tight text-white sm:text-5xl",
                                            children: "Nhập lớp học"
                                        }, void 0, false, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 1959,
                                            columnNumber: 21
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            className: "mt-4 max-w-3xl text-sm text-white/40",
                                            children: "Nhập từng lớp một. Ví dụ nhập 6A rồi bấm Enter hoặc Import, sau đó nhập tiếp 6B."
                                        }, void 0, false, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 1962,
                                            columnNumber: 21
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                    lineNumber: 1954,
                                    columnNumber: 19
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["panelClass"]} p-4 text-sm text-white/50 lg:max-w-md`,
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            className: "font-medium text-white",
                                            children: "Tổng lớp học"
                                        }, void 0, false, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 1967,
                                            columnNumber: 21
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            className: "mt-2 text-3xl font-semibold text-white",
                                            children: classList.length
                                        }, void 0, false, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 1968,
                                            columnNumber: 21
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                    lineNumber: 1966,
                                    columnNumber: 19
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                            lineNumber: 1953,
                            columnNumber: 17
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "grid flex-1 gap-4 lg:grid-cols-[0.9fr_1.1fr]",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                                    className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["panelClass"]} p-4`,
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "mb-4 flex items-center gap-2.5",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["iconShellClass"],
                                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$hash$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Hash$3e$__["Hash"], {
                                                        size: 16,
                                                        strokeWidth: 1.5
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                        lineNumber: 1976,
                                                        columnNumber: 25
                                                    }, this)
                                                }, void 0, false, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 1975,
                                                    columnNumber: 23
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                                                            className: "text-sm font-semibold text-white",
                                                            children: "Nhập lớp học"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                            lineNumber: 1979,
                                                            columnNumber: 27
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                            className: "text-xs text-white/40",
                                                            children: "Nhập từng lớp một, ví dụ 6A rồi Enter"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                            lineNumber: 1980,
                                                            columnNumber: 27
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 1978,
                                                    columnNumber: 25
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 1974,
                                            columnNumber: 21
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                            className: "block",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "mb-2 block text-xs font-medium text-white/50",
                                                    children: "Nhập tên lớp học"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 1985,
                                                    columnNumber: 25
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                    type: "text",
                                                    value: classInput,
                                                    onChange: (event)=>setClassInput(event.target.value.toUpperCase()),
                                                    onKeyDown: (event)=>{
                                                        if (event.key === 'Enter') {
                                                            event.preventDefault();
                                                            importClass();
                                                        }
                                                    },
                                                    placeholder: "Ví dụ: 6A",
                                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["inputClass"]
                                                }, void 0, false, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 1986,
                                                    columnNumber: 25
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 1984,
                                            columnNumber: 23
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["panelMutedClass"]} mt-3 p-3 text-xs text-white/30`,
                                            children: "Nhập một lớp duy nhất mỗi lần hoặc bấm nhanh các lớp mẫu bên dưới. Sau khi thêm, ô nhập sẽ tự xóa để bạn nhập lớp tiếp theo."
                                        }, void 0, false, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 2001,
                                            columnNumber: 25
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["panelMutedClass"]} mt-3 p-4`,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                    className: "mb-3 text-xs font-medium text-white/70",
                                                    children: "Thêm nhanh lớp mẫu"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 2006,
                                                    columnNumber: 29
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "grid grid-cols-2 gap-2 sm:grid-cols-4",
                                                    children: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["classPresetGroups"].map((presetGroup)=>{
                                                        const allAdded = presetGroup.classes.every((className)=>classList.includes(className));
                                                        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                            type: "button",
                                                            onClick: ()=>addClassPresetGroup(presetGroup.classes),
                                                            disabled: allAdded,
                                                            className: `rounded-md border px-3 py-2 text-xs font-medium transition active:scale-95 active:transition-transform ${allAdded ? 'border-white/[0.04] bg-white/[0.02] text-white/20 cursor-not-allowed' : 'border-white/[0.12] bg-white/[0.04] text-white/80 hover:bg-white/[0.08] hover:border-white/[0.18] hover:text-white'}`,
                                                            children: allAdded ? `${presetGroup.label} ✓` : presetGroup.label
                                                        }, presetGroup.label, false, {
                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                            lineNumber: 2012,
                                                            columnNumber: 35
                                                        }, this);
                                                    })
                                                }, void 0, false, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 2007,
                                                    columnNumber: 29
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 2005,
                                            columnNumber: 27
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                            type: "button",
                                            onClick: importClass,
                                            disabled: !classInput.trim(),
                                            className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["primaryButtonClass"]} ${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["disabledPrimaryButtonClass"]} mt-4 w-full`,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$plus$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Plus$3e$__["Plus"], {
                                                    size: 14,
                                                    strokeWidth: 1.5
                                                }, void 0, false, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 2036,
                                                    columnNumber: 27
                                                }, this),
                                                "Import"
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 2030,
                                            columnNumber: 25
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                    lineNumber: 1973,
                                    columnNumber: 19
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("aside", {
                                    className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["panelClass"]} p-4`,
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "mb-4 flex items-center gap-2.5",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["iconShellClass"],
                                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$check$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Check$3e$__["Check"], {
                                                        size: 16,
                                                        strokeWidth: 1.5
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                        lineNumber: 2045,
                                                        columnNumber: 25
                                                    }, this)
                                                }, void 0, false, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 2044,
                                                    columnNumber: 23
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                                                            className: "text-sm font-semibold text-white",
                                                            children: "Class list"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                            lineNumber: 2048,
                                                            columnNumber: 25
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                            className: "text-xs text-white/40",
                                                            children: "Có thể xóa từng lớp bằng nút bên cạnh"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                            lineNumber: 2049,
                                                            columnNumber: 25
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 2047,
                                                    columnNumber: 23
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 2043,
                                            columnNumber: 21
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "grid gap-0 sm:grid-cols-2",
                                            children: classList.length ? sortedClassList.map((className, index)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "flex items-center justify-between gap-3 border-b border-white/[0.04] py-3 px-1",
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            className: "flex items-center gap-2.5",
                                                            children: [
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                    className: "flex h-6 w-6 items-center justify-center rounded border border-white/[0.06] bg-[#141414] text-[10px] font-medium text-white/50",
                                                                    children: index + 1
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                    lineNumber: 2061,
                                                                    columnNumber: 31
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                    className: "text-sm text-white",
                                                                    children: className
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                    lineNumber: 2064,
                                                                    columnNumber: 31
                                                                }, this)
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                            lineNumber: 2060,
                                                            columnNumber: 29
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                            type: "button",
                                                            onClick: ()=>deleteClass(className),
                                                            className: "p-1 transition hover:bg-white/[0.04]",
                                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$trash$2d$2$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Trash2$3e$__["Trash2"], {
                                                                size: 14,
                                                                className: "text-red-400/60 hover:text-red-400",
                                                                strokeWidth: 1.5
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                lineNumber: 2071,
                                                                columnNumber: 31
                                                            }, this)
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                            lineNumber: 2066,
                                                            columnNumber: 29
                                                        }, this)
                                                    ]
                                                }, className, true, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 2056,
                                                    columnNumber: 27
                                                }, this)) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["panelMutedClass"]} p-4 text-sm text-white/30 sm:col-span-2`,
                                                children: "Chưa có lớp học nào. Nhập 6A rồi nhấn Enter hoặc Import để thêm lớp đầu tiên."
                                            }, void 0, false, {
                                                fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                lineNumber: 2076,
                                                columnNumber: 27
                                            }, this)
                                        }, void 0, false, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 2053,
                                            columnNumber: 21
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                    lineNumber: 2042,
                                    columnNumber: 19
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                            lineNumber: 1972,
                            columnNumber: 17
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                    lineNumber: 1933,
                    columnNumber: 17
                }, this) : page === 'assignments' ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                    className: "relative flex min-h-screen w-full flex-col px-4 py-6 sm:px-8 lg:px-12 xl:px-16",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["navBarClass"],
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    type: "button",
                                    onClick: ()=>setPage('classes'),
                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["navBackClass"],
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$arrow$2d$left$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__ArrowLeft$3e$__["ArrowLeft"], {
                                            size: 14,
                                            strokeWidth: 1.5
                                        }, void 0, false, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 2089,
                                            columnNumber: 23
                                        }, this),
                                        "Quay lại"
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                    lineNumber: 2088,
                                    columnNumber: 21
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    type: "button",
                                    onClick: validateAssignmentsBeforeNext,
                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["navNextClass"],
                                    children: [
                                        "Tiếp tục",
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$right$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronRight$3e$__["ChevronRight"], {
                                            size: 14,
                                            strokeWidth: 1.5
                                        }, void 0, false, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 2094,
                                            columnNumber: 29
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                    lineNumber: 2092,
                                    columnNumber: 27
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                            lineNumber: 2087,
                            columnNumber: 19
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("header", {
                            className: "mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "mb-4 flex items-center gap-2 text-[11px] font-medium uppercase tracking-widest text-white/30",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$book$2d$open$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__BookOpen$3e$__["BookOpen"], {
                                                    size: 14,
                                                    strokeWidth: 1.5
                                                }, void 0, false, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 2100,
                                                    columnNumber: 25
                                                }, this),
                                                "Phân công chuyên môn"
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 2099,
                                            columnNumber: 23
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h1", {
                                            className: "max-w-4xl text-4xl font-semibold tracking-tight text-white sm:text-5xl",
                                            children: "Gán giáo viên, môn học và lớp"
                                        }, void 0, false, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 2103,
                                            columnNumber: 23
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            className: "mt-4 max-w-3xl text-sm text-white/40",
                                            children: "Chọn từ danh sách đã nhập ở các trang trước để tạo từng phân công chuyên môn."
                                        }, void 0, false, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 2106,
                                            columnNumber: 23
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                    lineNumber: 2098,
                                    columnNumber: 21
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["panelClass"]} p-4 text-sm text-white/50 lg:max-w-md`,
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            className: "font-medium text-white",
                                            children: "Tổng phân công"
                                        }, void 0, false, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 2111,
                                            columnNumber: 23
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            className: "mt-2 text-3xl font-semibold text-white",
                                            children: assignmentList.length
                                        }, void 0, false, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 2112,
                                            columnNumber: 23
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                    lineNumber: 2110,
                                    columnNumber: 21
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                            lineNumber: 2097,
                            columnNumber: 19
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "grid flex-1 gap-4 lg:grid-cols-[minmax(300px,0.55fr)_minmax(0,1.45fr)]",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                                    className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["panelClass"]} p-4`,
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "mb-4 flex items-center gap-2.5",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["iconShellClass"],
                                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$plus$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Plus$3e$__["Plus"], {
                                                        size: 16,
                                                        strokeWidth: 1.5
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                        lineNumber: 2120,
                                                        columnNumber: 27
                                                    }, this)
                                                }, void 0, false, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 2119,
                                                    columnNumber: 25
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                                                            className: "text-sm font-semibold text-white",
                                                            children: "Tạo phân công"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                            lineNumber: 2123,
                                                            columnNumber: 29
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                            className: "text-xs text-white/40",
                                                            children: "Dùng giáo viên, môn học, lớp đã nhập và số tiết/tuần"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                            lineNumber: 2124,
                                                            columnNumber: 29
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 2122,
                                                    columnNumber: 27
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 2118,
                                            columnNumber: 23
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "mb-4 grid grid-cols-2 gap-2",
                                            children: [
                                                {
                                                    id: 'bulk',
                                                    label: 'Bulk Update',
                                                    color: '#6699FF'
                                                },
                                                {
                                                    id: 'update',
                                                    label: 'Update',
                                                    color: '#FFCC00'
                                                }
                                            ].map((option)=>{
                                                const isActive = assignmentImportMode === option.id;
                                                return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                    type: "button",
                                                    onClick: ()=>setAssignmentImportMode(option.id),
                                                    className: `rounded px-3 py-2 text-sm font-medium transition ${isActive ? 'text-black' : 'border border-white/[0.08] text-white/60 hover:text-white'}`,
                                                    style: {
                                                        backgroundColor: isActive ? option.color : 'transparent'
                                                    },
                                                    children: option.label
                                                }, option.id, false, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 2136,
                                                    columnNumber: 31
                                                }, this);
                                            })
                                        }, void 0, false, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 2128,
                                            columnNumber: 25
                                        }, this),
                                        assignmentValidationMessage ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "mb-4 rounded border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-200",
                                            children: assignmentValidationMessage
                                        }, void 0, false, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 2150,
                                            columnNumber: 29
                                        }, this) : null,
                                        assignmentImportMode === 'bulk' ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                                    className: "block",
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                            className: "mb-2 block text-xs font-medium text-white/50",
                                                            children: "Teacher-Subject-Class-Number"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                            lineNumber: 2158,
                                                            columnNumber: 33
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("textarea", {
                                                            value: bulkAssignmentText,
                                                            onChange: (event)=>{
                                                                setBulkAssignmentText(event.target.value);
                                                                setBulkAssignmentErrors([]);
                                                                setAssignmentValidationMessage(null);
                                                            },
                                                            placeholder: "Huy-Toán-8A-4",
                                                            rows: 7,
                                                            className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["inputClass"]} min-h-40 resize-y ${bulkAssignmentErrors.length ? 'border-red-400/60 decoration-red-400' : ''}`
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                            lineNumber: 2159,
                                                            columnNumber: 31
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 2157,
                                                    columnNumber: 31
                                                }, this),
                                                bulkAssignmentErrors.length ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "mt-3 space-y-2 rounded border border-red-400/20 bg-red-500/10 p-3 text-xs text-red-200",
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                            children: "Sai format. Đúng: Teacher-Subject-Class-Number."
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                            lineNumber: 2174,
                                                            columnNumber: 33
                                                        }, this),
                                                        bulkAssignmentErrors.map((error)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                className: "space-y-1",
                                                                children: [
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                                        children: [
                                                                            "Dòng ",
                                                                            error.line,
                                                                            ": ",
                                                                            renderBulkAssignmentErrorLine(error)
                                                                        ]
                                                                    }, void 0, true, {
                                                                        fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                        lineNumber: 2177,
                                                                        columnNumber: 39
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                                        children: getBulkAssignmentErrorMessage(error)
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                        lineNumber: 2178,
                                                                        columnNumber: 39
                                                                    }, this)
                                                                ]
                                                            }, error.line, true, {
                                                                fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                lineNumber: 2176,
                                                                columnNumber: 37
                                                            }, this))
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 2173,
                                                    columnNumber: 31
                                                }, this) : null
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 2156,
                                            columnNumber: 29
                                        }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "grid gap-3",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(SelectField, {
                                                    icon: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$user$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__User$3e$__["User"],
                                                    label: "Giáo viên",
                                                    placeholder: "Chọn giáo viên đã nhập",
                                                    value: assignmentDraft.teacher,
                                                    options: sortedTeacherList,
                                                    onChange: (value)=>{
                                                        setAssignmentDraft((current)=>({
                                                                ...current,
                                                                teacher: value
                                                            }));
                                                        setAssignmentValidationMessage(null);
                                                    }
                                                }, void 0, false, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 2186,
                                                    columnNumber: 29
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(SelectField, {
                                                    icon: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$book$2d$open$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__BookOpen$3e$__["BookOpen"],
                                                    label: "Môn học",
                                                    placeholder: "Chọn môn học đã nhập",
                                                    value: assignmentDraft.subject,
                                                    options: sortedSubjectList,
                                                    onChange: (value)=>{
                                                        setAssignmentDraft((current)=>({
                                                                ...current,
                                                                subject: value
                                                            }));
                                                        setAssignmentValidationMessage(null);
                                                    }
                                                }, void 0, false, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 2197,
                                                    columnNumber: 29
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(SelectField, {
                                                    icon: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$hash$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Hash$3e$__["Hash"],
                                                    label: "Lớp",
                                                    placeholder: "Chọn lớp đã nhập",
                                                    value: assignmentDraft.className,
                                                    options: sortedClassList,
                                                    onChange: (value)=>{
                                                        setAssignmentDraft((current)=>({
                                                                ...current,
                                                                className: value
                                                            }));
                                                        setAssignmentValidationMessage(null);
                                                    }
                                                }, void 0, false, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 2208,
                                                    columnNumber: 29
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                                    className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["panelClass"]} block p-4`,
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            className: "mb-3 flex items-center gap-2.5",
                                                            children: [
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["iconShellClass"],
                                                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$calendar$2d$days$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__CalendarDays$3e$__["CalendarDays"], {
                                                                        size: 16,
                                                                        strokeWidth: 1.5
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                        lineNumber: 2222,
                                                                        columnNumber: 35
                                                                    }, this)
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                    lineNumber: 2221,
                                                                    columnNumber: 33
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                    className: "text-sm font-medium text-white",
                                                                    children: "Số tiết cần dạy trong tuần"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                    lineNumber: 2224,
                                                                    columnNumber: 33
                                                                }, this)
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                            lineNumber: 2220,
                                                            columnNumber: 31
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                            type: "number",
                                                            min: "1",
                                                            max: "60",
                                                            value: assignmentDraft.weeklyPeriods,
                                                            onChange: (event)=>{
                                                                setAssignmentDraft((current)=>({
                                                                        ...current,
                                                                        weeklyPeriods: event.target.value
                                                                    }));
                                                                setAssignmentValidationMessage(null);
                                                            },
                                                            placeholder: "Ví dụ: 6",
                                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["inputClass"]
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                            lineNumber: 2226,
                                                            columnNumber: 31
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 2219,
                                                    columnNumber: 29
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 2185,
                                            columnNumber: 27
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                            type: "button",
                                            onClick: assignmentImportMode === 'bulk' ? importBulkAssignments : importAssignment,
                                            disabled: assignmentImportMode === 'bulk' ? !bulkAssignmentText.trim() : !assignmentDraft.teacher || !assignmentDraft.subject || !assignmentDraft.className || !assignmentDraft.weeklyPeriods.trim(),
                                            className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["primaryButtonClass"]} ${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["disabledPrimaryButtonClass"]} mt-4 w-full`,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$plus$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Plus$3e$__["Plus"], {
                                                    size: 14,
                                                    strokeWidth: 1.5
                                                }, void 0, false, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 2248,
                                                    columnNumber: 27
                                                }, this),
                                                assignmentImportMode === 'bulk' ? 'Import' : 'Thêm phân công'
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 2242,
                                            columnNumber: 25
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                    lineNumber: 2117,
                                    columnNumber: 23
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("aside", {
                                    className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["panelClass"]} p-4`,
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "mb-4 flex items-center gap-2.5",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["iconShellClass"],
                                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$check$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Check$3e$__["Check"], {
                                                        size: 16,
                                                        strokeWidth: 1.5
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                        lineNumber: 2256,
                                                        columnNumber: 29
                                                    }, this)
                                                }, void 0, false, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 2255,
                                                    columnNumber: 27
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                                                            className: "text-sm font-semibold text-white",
                                                            children: "Danh sách phân công"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                            lineNumber: 2259,
                                                            columnNumber: 29
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                            className: "text-xs text-white/40",
                                                            children: "Mỗi dòng là một giáo viên - môn - lớp"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                            lineNumber: 2260,
                                                            columnNumber: 29
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 2258,
                                                    columnNumber: 27
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 2254,
                                            columnNumber: 27
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: `${totalAssignedPeriods === totalRequiredClassPeriods ? 'border-emerald-400/20 bg-emerald-500/10 text-emerald-200' : 'border-amber-400/20 bg-amber-500/10 text-amber-200'} mb-4 rounded border p-3 text-xs`,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                    children: [
                                                        "Tổng số tiết cần xếp của tất cả các lớp: ",
                                                        totalRequiredClassPeriods
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 2265,
                                                    columnNumber: 27
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                    children: [
                                                        "Tổng số tiết được phân công chuyên môn: ",
                                                        totalAssignedPeriods
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 2266,
                                                    columnNumber: 27
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 2264,
                                            columnNumber: 25
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "space-y-0",
                                            children: assignmentList.length ? sortedAssignmentList.map((assignment, index)=>{
                                                const teacherColor = teacherColorMap[assignment.teacher] ?? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["teacherColors"][0];
                                                return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "border-b border-white/[0.04] py-3 last:border-b-0",
                                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: "flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between",
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                className: "min-w-0 flex-1",
                                                                children: [
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                        className: "flex flex-wrap items-center gap-2",
                                                                        children: [
                                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                                                className: "text-[11px] font-medium uppercase tracking-widest",
                                                                                style: {
                                                                                    color: teacherColor.text
                                                                                },
                                                                                children: [
                                                                                    "Phân công ",
                                                                                    index + 1
                                                                                ]
                                                                            }, void 0, true, {
                                                                                fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                                lineNumber: 2282,
                                                                                columnNumber: 43
                                                                            }, this),
                                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                                className: "rounded-full border px-2 py-0.5 text-[11px] font-medium",
                                                                                style: {
                                                                                    borderColor: teacherColor.text,
                                                                                    color: teacherColor.text,
                                                                                    backgroundColor: 'rgba(0,0,0,0.3)'
                                                                                },
                                                                                children: assignment.teacher
                                                                            }, void 0, false, {
                                                                                fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                                lineNumber: 2283,
                                                                                columnNumber: 43
                                                                            }, this)
                                                                        ]
                                                                    }, void 0, true, {
                                                                        fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                        lineNumber: 2281,
                                                                        columnNumber: 41
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                        className: "mt-2 grid gap-2 sm:grid-cols-4",
                                                                        children: [
                                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                                className: "rounded border border-white/[0.06] bg-[#0a0a0a] p-2.5",
                                                                                children: [
                                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                                                        className: "text-[10px] font-medium uppercase tracking-widest text-white/30",
                                                                                        children: "Giáo viên"
                                                                                    }, void 0, false, {
                                                                                        fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                                        lineNumber: 2292,
                                                                                        columnNumber: 45
                                                                                    }, this),
                                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                                                        className: "mt-0.5 truncate text-xs text-white/60",
                                                                                        children: assignment.teacher
                                                                                    }, void 0, false, {
                                                                                        fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                                        lineNumber: 2293,
                                                                                        columnNumber: 45
                                                                                    }, this)
                                                                                ]
                                                                            }, void 0, true, {
                                                                                fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                                lineNumber: 2291,
                                                                                columnNumber: 43
                                                                            }, this),
                                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                                className: "rounded border border-white/[0.06] bg-[#0a0a0a] p-2.5",
                                                                                children: [
                                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                                                        className: "text-[10px] font-medium uppercase tracking-widest text-white/30",
                                                                                        children: "Môn học"
                                                                                    }, void 0, false, {
                                                                                        fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                                        lineNumber: 2296,
                                                                                        columnNumber: 45
                                                                                    }, this),
                                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                                                        className: "mt-0.5 truncate text-xs text-white/60",
                                                                                        children: assignment.subject
                                                                                    }, void 0, false, {
                                                                                        fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                                        lineNumber: 2297,
                                                                                        columnNumber: 45
                                                                                    }, this)
                                                                                ]
                                                                            }, void 0, true, {
                                                                                fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                                lineNumber: 2295,
                                                                                columnNumber: 43
                                                                            }, this),
                                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                                className: "rounded border border-white/[0.06] bg-[#0a0a0a] p-2.5",
                                                                                children: [
                                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                                                        className: "text-[10px] font-medium uppercase tracking-widest text-white/30",
                                                                                        children: "Lớp"
                                                                                    }, void 0, false, {
                                                                                        fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                                        lineNumber: 2300,
                                                                                        columnNumber: 45
                                                                                    }, this),
                                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                                                        className: "mt-0.5 truncate text-xs text-white/60",
                                                                                        children: assignment.className
                                                                                    }, void 0, false, {
                                                                                        fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                                        lineNumber: 2301,
                                                                                        columnNumber: 45
                                                                                    }, this)
                                                                                ]
                                                                            }, void 0, true, {
                                                                                fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                                lineNumber: 2299,
                                                                                columnNumber: 43
                                                                            }, this),
                                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                                className: "rounded border border-white/[0.06] bg-[#0a0a0a] p-2.5",
                                                                                children: [
                                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                                                        className: "text-[10px] font-medium uppercase tracking-widest text-white/30",
                                                                                        children: "Số tiết/tuần"
                                                                                    }, void 0, false, {
                                                                                        fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                                        lineNumber: 2304,
                                                                                        columnNumber: 45
                                                                                    }, this),
                                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                                                        className: "mt-0.5 truncate text-xs text-white/60",
                                                                                        children: assignment.weeklyPeriods
                                                                                    }, void 0, false, {
                                                                                        fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                                        lineNumber: 2305,
                                                                                        columnNumber: 45
                                                                                    }, this)
                                                                                ]
                                                                            }, void 0, true, {
                                                                                fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                                lineNumber: 2303,
                                                                                columnNumber: 43
                                                                            }, this)
                                                                        ]
                                                                    }, void 0, true, {
                                                                        fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                        lineNumber: 2290,
                                                                        columnNumber: 41
                                                                    }, this)
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                lineNumber: 2280,
                                                                columnNumber: 39
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                type: "button",
                                                                onClick: ()=>deleteAssignment(assignment.key),
                                                                className: "mt-2 p-1 transition hover:bg-white/[0.04] xl:mt-0",
                                                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$trash$2d$2$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Trash2$3e$__["Trash2"], {
                                                                    size: 14,
                                                                    className: "text-red-400/60 hover:text-red-400",
                                                                    strokeWidth: 1.5
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                    lineNumber: 2310,
                                                                    columnNumber: 41
                                                                }, this)
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                lineNumber: 2309,
                                                                columnNumber: 39
                                                            }, this)
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                        lineNumber: 2279,
                                                        columnNumber: 37
                                                    }, this)
                                                }, assignment.key, false, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 2275,
                                                    columnNumber: 35
                                                }, this);
                                            }) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["panelMutedClass"]} p-4 text-sm text-white/30`,
                                                children: "Chưa có phân công nào. Hãy chọn giáo viên, môn học, lớp rồi bấm Thêm phân công."
                                            }, void 0, false, {
                                                fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                lineNumber: 2318,
                                                columnNumber: 27
                                            }, this)
                                        }, void 0, false, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 2269,
                                            columnNumber: 25
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                    lineNumber: 2253,
                                    columnNumber: 21
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                            lineNumber: 2116,
                            columnNumber: 21
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                    lineNumber: 2086,
                    columnNumber: 19
                }, this) : page === 'constraints' ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                    className: "relative flex min-h-screen w-full flex-col px-4 py-6 sm:px-8 lg:px-12 xl:px-16",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["navBarClass"],
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    type: "button",
                                    onClick: ()=>setPage('assignments'),
                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["navBackClass"],
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$arrow$2d$left$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__ArrowLeft$3e$__["ArrowLeft"], {
                                            size: 14,
                                            strokeWidth: 1.5
                                        }, void 0, false, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 2331,
                                            columnNumber: 23
                                        }, this),
                                        "Quay lại"
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                    lineNumber: 2330,
                                    columnNumber: 21
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    type: "button",
                                    onClick: ()=>setPage('summary'),
                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["navNextClass"],
                                    children: [
                                        "Tiếp tục",
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$right$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronRight$3e$__["ChevronRight"], {
                                            size: 14,
                                            strokeWidth: 1.5
                                        }, void 0, false, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 2336,
                                            columnNumber: 23
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                    lineNumber: 2334,
                                    columnNumber: 21
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                            lineNumber: 2329,
                            columnNumber: 19
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("header", {
                            className: "mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "mb-4 flex items-center gap-2 text-[11px] font-medium uppercase tracking-widest text-white/30",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$clipboard$2d$list$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__ClipboardList$3e$__["ClipboardList"], {
                                                    size: 14,
                                                    strokeWidth: 1.5
                                                }, void 0, false, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 2342,
                                                    columnNumber: 25
                                                }, this),
                                                "Ràng buộc xếp lịch"
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 2341,
                                            columnNumber: 23
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h1", {
                                            className: "max-w-4xl text-4xl font-semibold tracking-tight text-white sm:text-5xl",
                                            children: "Nhập constraints cho thời khóa biểu"
                                        }, void 0, false, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 2345,
                                            columnNumber: 23
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            className: "mt-4 max-w-3xl text-sm text-white/40",
                                            children: "Chọn loại ràng buộc, nhập mỗi ràng buộc một dòng, rồi bấm Import để thêm tất cả vào bảng."
                                        }, void 0, false, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 2348,
                                            columnNumber: 23
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                    lineNumber: 2340,
                                    columnNumber: 21
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["panelClass"]} p-4 text-sm text-white/50 lg:max-w-md`,
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            className: "font-medium text-white",
                                            children: "Tổng ràng buộc"
                                        }, void 0, false, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 2353,
                                            columnNumber: 23
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            className: "mt-2 text-3xl font-semibold text-white",
                                            children: constraintList.length
                                        }, void 0, false, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 2354,
                                            columnNumber: 23
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                    lineNumber: 2352,
                                    columnNumber: 21
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                            lineNumber: 2339,
                            columnNumber: 19
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "grid flex-1 gap-4 lg:grid-cols-[minmax(330px,0.7fr)_minmax(0,1.3fr)]",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                                    className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["panelClass"]} p-4`,
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "mb-4 flex items-center gap-2.5",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["iconShellClass"],
                                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$plus$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Plus$3e$__["Plus"], {
                                                        size: 16,
                                                        strokeWidth: 1.5
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                        lineNumber: 2362,
                                                        columnNumber: 27
                                                    }, this)
                                                }, void 0, false, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 2361,
                                                    columnNumber: 25
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                                                            className: "text-sm font-semibold text-white",
                                                            children: "Tạo ràng buộc"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                            lineNumber: 2365,
                                                            columnNumber: 27
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                            className: "text-xs text-white/40",
                                                            children: "Vàng là bắt buộc, xám là nên có"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                            lineNumber: 2366,
                                                            columnNumber: 27
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 2364,
                                                    columnNumber: 25
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 2360,
                                            columnNumber: 23
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "grid gap-2 sm:grid-cols-2",
                                            children: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["constraintTypeList"].map((constraintType)=>{
                                                const selected = constraintDraft.type === constraintType.id;
                                                return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                    type: "button",
                                                    onClick: ()=>setConstraintDraft((current)=>({
                                                                ...current,
                                                                type: constraintType.id
                                                            })),
                                                    className: `rounded-md border p-3 text-left transition ${selected ? constraintType.boxClass : 'border-white/[0.06] bg-[#141414] text-white hover:border-white/[0.12] hover:bg-white/[0.04]'}`,
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            className: "flex items-center gap-2.5",
                                                            children: [
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$circle$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Circle$3e$__["Circle"], {
                                                                    className: selected ? constraintType.iconClass : 'text-white/30',
                                                                    size: 16,
                                                                    strokeWidth: 1.5
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                    lineNumber: 2386,
                                                                    columnNumber: 33
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                    className: "text-sm font-medium",
                                                                    children: constraintType.label
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                    lineNumber: 2387,
                                                                    columnNumber: 33
                                                                }, this)
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                            lineNumber: 2385,
                                                            columnNumber: 31
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                            className: `mt-2 text-xs leading-4 ${selected ? 'text-white/70' : 'text-white/30'}`,
                                                            children: constraintType.description
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                            lineNumber: 2389,
                                                            columnNumber: 31
                                                        }, this)
                                                    ]
                                                }, constraintType.id, true, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 2375,
                                                    columnNumber: 29
                                                }, this);
                                            })
                                        }, void 0, false, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 2370,
                                            columnNumber: 23
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                            className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["panelClass"]} mt-4 block p-4`,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "mb-3 flex items-center gap-2.5",
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["iconShellClass"],
                                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$clipboard$2d$list$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__ClipboardList$3e$__["ClipboardList"], {
                                                                size: 16,
                                                                strokeWidth: 1.5
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                lineNumber: 2398,
                                                                columnNumber: 29
                                                            }, this)
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                            lineNumber: 2397,
                                                            columnNumber: 27
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                            className: "text-sm font-medium text-white",
                                                            children: "Nội dung ràng buộc"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                            lineNumber: 2400,
                                                            columnNumber: 27
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 2396,
                                                    columnNumber: 25
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("textarea", {
                                                    value: constraintDraft.text,
                                                    onChange: (event)=>setConstraintDraft((current)=>({
                                                                ...current,
                                                                text: event.target.value
                                                            })),
                                                    onKeyDown: (event)=>{
                                                        if (event.key !== 'Enter' || event.shiftKey) return;
                                                        event.preventDefault();
                                                        importConstraint();
                                                    },
                                                    placeholder: "Ví dụ:\nSơn không dạy thứ 2\nHương không dạy tiết 1\n(mỗi dòng là một ràng buộc)",
                                                    rows: 5,
                                                    className: "w-full resize-none rounded-md border border-white/[0.08] bg-[#0a0a0a] px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-white/20"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 2402,
                                                    columnNumber: 27
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 2395,
                                            columnNumber: 23
                                        }, this),
                                        constraintDraft.type === 'preferred' && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "mt-3 flex items-center gap-2",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "text-xs text-white/40",
                                                    children: "Độ ưu tiên:"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 2418,
                                                    columnNumber: 27
                                                }, this),
                                                [
                                                    [
                                                        'Thấp',
                                                        3
                                                    ],
                                                    [
                                                        'TB',
                                                        5
                                                    ],
                                                    [
                                                        'Cao',
                                                        8
                                                    ]
                                                ].map(([label, val])=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                        type: "button",
                                                        onClick: ()=>setConstraintDraft((c)=>({
                                                                    ...c,
                                                                    weight: val
                                                                })),
                                                        className: `rounded px-2.5 py-1 text-xs font-medium transition ${constraintDraft.weight === val ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'}`,
                                                        children: label
                                                    }, val, false, {
                                                        fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                        lineNumber: 2420,
                                                        columnNumber: 29
                                                    }, this)),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "ml-1 text-xs text-white/25",
                                                    children: [
                                                        constraintDraft.weight,
                                                        "/10"
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 2433,
                                                    columnNumber: 27
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 2417,
                                            columnNumber: 25
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                            type: "button",
                                            onClick: importConstraint,
                                            disabled: !constraintDraft.text.trim(),
                                            className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["primaryButtonClass"]} ${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["disabledPrimaryButtonClass"]} mt-4 w-full`,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$plus$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Plus$3e$__["Plus"], {
                                                    size: 14,
                                                    strokeWidth: 1.5
                                                }, void 0, false, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 2443,
                                                    columnNumber: 25
                                                }, this),
                                                "Import"
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 2437,
                                            columnNumber: 23
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                    lineNumber: 2359,
                                    columnNumber: 21
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("aside", {
                                    className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["panelClass"]} p-4`,
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "mb-4 flex items-center gap-2.5",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["iconShellClass"],
                                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$check$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Check$3e$__["Check"], {
                                                        size: 16,
                                                        strokeWidth: 1.5
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                        lineNumber: 2451,
                                                        columnNumber: 27
                                                    }, this)
                                                }, void 0, false, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 2450,
                                                    columnNumber: 25
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                                                            className: "text-sm font-semibold text-white",
                                                            children: "Bảng constraints"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                            lineNumber: 2454,
                                                            columnNumber: 27
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                            className: "text-xs text-white/40",
                                                            children: "Màu vàng hiển thị Bắt buộc, màu xám hiển thị Nên có"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                            lineNumber: 2455,
                                                            columnNumber: 27
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 2453,
                                                    columnNumber: 25
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 2449,
                                            columnNumber: 23
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "space-y-0",
                                            children: constraintList.length ? sortedConstraintList.map((constraint)=>{
                                                const constraintType = __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["constraintTypes"][constraint.type] ?? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["constraintTypes"].required;
                                                return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: `rounded-md border p-3 ${constraintType.boxClass}`,
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            className: "mb-2 flex flex-wrap items-center justify-between gap-2",
                                                            children: [
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                    className: `inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${constraintType.badgeClass}`,
                                                                    children: [
                                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$circle$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Circle$3e$__["Circle"], {
                                                                            className: constraintType.iconClass,
                                                                            size: 10,
                                                                            fill: "currentColor",
                                                                            strokeWidth: 0
                                                                        }, void 0, false, {
                                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                            lineNumber: 2469,
                                                                            columnNumber: 39
                                                                        }, this),
                                                                        constraintType.label
                                                                    ]
                                                                }, void 0, true, {
                                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                    lineNumber: 2468,
                                                                    columnNumber: 37
                                                                }, this),
                                                                constraint.type === 'preferred' && constraint.weight != null && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                    className: "rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-white/40",
                                                                    children: [
                                                                        "w=",
                                                                        constraint.weight
                                                                    ]
                                                                }, void 0, true, {
                                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                    lineNumber: 2473,
                                                                    columnNumber: 39
                                                                }, this)
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                            lineNumber: 2467,
                                                            columnNumber: 35
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            className: "flex flex-col gap-2 md:flex-row md:items-start md:justify-between",
                                                            children: [
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                                    className: "min-w-0 flex-1 rounded border border-white/[0.06] bg-[#0a0a0a] p-2.5 text-sm text-white/60",
                                                                    children: constraint.text
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                    lineNumber: 2479,
                                                                    columnNumber: 35
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                    type: "button",
                                                                    onClick: ()=>deleteConstraint(constraint.id),
                                                                    className: "p-1 transition hover:bg-white/[0.04]",
                                                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$trash$2d$2$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Trash2$3e$__["Trash2"], {
                                                                        size: 14,
                                                                        className: "text-red-400/60 hover:text-red-400",
                                                                        strokeWidth: 1.5
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                        lineNumber: 2483,
                                                                        columnNumber: 39
                                                                    }, this)
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                    lineNumber: 2482,
                                                                    columnNumber: 37
                                                                }, this)
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                            lineNumber: 2478,
                                                            columnNumber: 33
                                                        }, this)
                                                    ]
                                                }, constraint.id, true, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 2465,
                                                    columnNumber: 35
                                                }, this);
                                            }) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["panelMutedClass"]} p-4 text-sm text-white/30`,
                                                children: "Chưa có ràng buộc nào. Chọn loại, nhập mỗi ràng buộc một dòng rồi bấm Import."
                                            }, void 0, false, {
                                                fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                lineNumber: 2490,
                                                columnNumber: 27
                                            }, this)
                                        }, void 0, false, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 2459,
                                            columnNumber: 23
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                    lineNumber: 2448,
                                    columnNumber: 21
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                            lineNumber: 2358,
                            columnNumber: 19
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                    lineNumber: 2328,
                    columnNumber: 17
                }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                    className: "relative flex min-h-screen w-full flex-col px-4 py-6 sm:px-8 lg:px-12 xl:px-16",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["navBarClass"],
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    type: "button",
                                    onClick: ()=>setPage('constraints'),
                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["navBackClass"],
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$arrow$2d$left$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__ArrowLeft$3e$__["ArrowLeft"], {
                                            size: 14,
                                            strokeWidth: 1.5
                                        }, void 0, false, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 2503,
                                            columnNumber: 23
                                        }, this),
                                        "Quay lại"
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                    lineNumber: 2502,
                                    columnNumber: 21
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    type: "button",
                                    onClick: ()=>handleGenerate(),
                                    disabled: aiLoading || !aiProvider || activePeriodCount <= 0,
                                    className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["navNextClass"]} disabled:cursor-not-allowed disabled:opacity-60`,
                                    children: aiLoading ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Fragment"], {
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$loader$2d$circle$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Loader2$3e$__["Loader2"], {
                                                size: 14,
                                                className: "animate-spin",
                                                strokeWidth: 1.5
                                            }, void 0, false, {
                                                fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                lineNumber: 2514,
                                                columnNumber: 27
                                            }, this),
                                            "Đang xếp lịch..."
                                        ]
                                    }, void 0, true) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Fragment"], {
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$sparkles$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Sparkles$3e$__["Sparkles"], {
                                                size: 14,
                                                strokeWidth: 1.5
                                            }, void 0, false, {
                                                fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                lineNumber: 2519,
                                                columnNumber: 27
                                            }, this),
                                            "Xếp lịch"
                                        ]
                                    }, void 0, true)
                                }, void 0, false, {
                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                    lineNumber: 2506,
                                    columnNumber: 21
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                            lineNumber: 2501,
                            columnNumber: 19
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("header", {
                            className: "mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "mb-4 flex items-center gap-2 text-[11px] font-medium uppercase tracking-widest text-white/30",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$clipboard$2d$list$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__ClipboardList$3e$__["ClipboardList"], {
                                                    size: 14,
                                                    strokeWidth: 1.5
                                                }, void 0, false, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 2528,
                                                    columnNumber: 25
                                                }, this),
                                                "Tổng hợp thông tin"
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 2527,
                                            columnNumber: 23
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h1", {
                                            className: "max-w-4xl text-4xl font-semibold tracking-tight text-white sm:text-5xl",
                                            children: "Xem lại toàn bộ thiết lập"
                                        }, void 0, false, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 2531,
                                            columnNumber: 23
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            className: "mt-4 max-w-3xl text-sm text-white/40",
                                            children: "Trang cuối tổng hợp bảng thời khóa biểu theo ngày học đã chọn, phân công chuyên môn và constraints xếp lịch."
                                        }, void 0, false, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 2534,
                                            columnNumber: 25
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                    lineNumber: 2526,
                                    columnNumber: 21
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "grid gap-2 sm:grid-cols-3 lg:max-w-2xl",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["panelClass"]} p-4 text-sm text-white/50`,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                    className: "font-medium text-white",
                                                    children: "Số ngày học"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 2540,
                                                    columnNumber: 25
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                    className: "mt-2 text-3xl font-semibold text-white",
                                                    children: selectedSpreadsheetDays.length
                                                }, void 0, false, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 2541,
                                                    columnNumber: 25
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 2539,
                                            columnNumber: 23
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["panelClass"]} p-4 text-sm text-white/50`,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                    className: "font-medium text-white",
                                                    children: "Phân công"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 2544,
                                                    columnNumber: 25
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                    className: "mt-2 text-3xl font-semibold text-white",
                                                    children: assignmentList.length
                                                }, void 0, false, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 2545,
                                                    columnNumber: 25
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 2543,
                                            columnNumber: 23
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["panelClass"]} p-4 text-sm text-white/50`,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                    className: "font-medium text-white",
                                                    children: "Ràng buộc"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 2548,
                                                    columnNumber: 25
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                    className: "mt-2 text-3xl font-semibold text-white",
                                                    children: constraintList.length
                                                }, void 0, false, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 2549,
                                                    columnNumber: 25
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 2547,
                                            columnNumber: 23
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                    lineNumber: 2538,
                                    columnNumber: 21
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                            lineNumber: 2525,
                            columnNumber: 19
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "grid flex-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "space-y-4",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                                            className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["panelClass"]} overflow-hidden p-4`,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "mb-4 flex items-center gap-2.5",
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["iconShellClass"],
                                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$calendar$2d$days$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__CalendarDays$3e$__["CalendarDays"], {
                                                                size: 16,
                                                                strokeWidth: 1.5
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                lineNumber: 2559,
                                                                columnNumber: 27
                                                            }, this)
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                            lineNumber: 2558,
                                                            columnNumber: 25
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            children: [
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                                                                    className: "text-sm font-semibold text-white",
                                                                    children: "Bảng thời khóa biểu mẫu"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                    lineNumber: 2562,
                                                                    columnNumber: 27
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                                    className: "text-xs text-white/40",
                                                                    children: "Chỉ hiển thị những ô tiết đã chọn ở trang chỉnh thời khóa biểu."
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                    lineNumber: 2563,
                                                                    columnNumber: 27
                                                                }, this)
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                            lineNumber: 2561,
                                                            columnNumber: 25
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 2557,
                                                    columnNumber: 23
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "mb-4 rounded-md border border-dashed border-white/[0.06] bg-[#0a0a0a] px-4 py-3 text-sm text-white/45",
                                                    children: "AI sẽ xử lý phần xếp lịch trong nền và chỉ trả ra kết quả cuối cùng ở bảng bên dưới."
                                                }, void 0, false, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 2567,
                                                    columnNumber: 23
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "mb-4 rounded-md border border-white/[0.06] bg-[#0a0a0a] p-4",
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            className: "mb-2 flex items-center justify-between",
                                                            children: [
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                    className: "block text-xs font-medium text-white/50",
                                                                    children: "AI Provider (Local)"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                    lineNumber: 2574,
                                                                    columnNumber: 27
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                    type: "button",
                                                                    onClick: ()=>setShowSettingsModal(true),
                                                                    className: "flex items-center gap-1 text-xs text-white/60 hover:text-white",
                                                                    children: [
                                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$settings$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Settings$3e$__["Settings"], {
                                                                            size: 14
                                                                        }, void 0, false, {
                                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                            lineNumber: 2580,
                                                                            columnNumber: 29
                                                                        }, this),
                                                                        " Cấu hình"
                                                                    ]
                                                                }, void 0, true, {
                                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                    lineNumber: 2575,
                                                                    columnNumber: 27
                                                                }, this)
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                            lineNumber: 2573,
                                                            columnNumber: 25
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            className: "text-sm text-white/80",
                                                            children: aiProvider ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                children: [
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                        children: [
                                                                            "Model: ",
                                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                                className: "font-mono text-xs",
                                                                                children: aiProvider.model
                                                                            }, void 0, false, {
                                                                                fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                                lineNumber: 2587,
                                                                                columnNumber: 43
                                                                            }, this)
                                                                        ]
                                                                    }, void 0, true, {
                                                                        fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                        lineNumber: 2587,
                                                                        columnNumber: 31
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                        className: "text-[10px] text-emerald-400",
                                                                        children: 'Đã cấu hình • Click "Cấu hình" để thay đổi'
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                        lineNumber: 2588,
                                                                        columnNumber: 31
                                                                    }, this)
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                lineNumber: 2586,
                                                                columnNumber: 29
                                                            }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                className: "text-amber-400",
                                                                children: "Chưa cấu hình AI Provider"
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                lineNumber: 2591,
                                                                columnNumber: 29
                                                            }, this)
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                            lineNumber: 2584,
                                                            columnNumber: 25
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 2572,
                                                    columnNumber: 23
                                                }, this),
                                                aiLoading && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "mb-4 rounded-md border border-white/[0.08] bg-[#0a0a0a] p-4",
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            className: "mb-3 flex items-center justify-between",
                                                            children: [
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                    className: "flex items-center gap-2 text-sm font-medium text-white/70",
                                                                    children: [
                                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$loader$2d$circle$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Loader2$3e$__["Loader2"], {
                                                                            size: 14,
                                                                            className: "animate-spin text-blue-400",
                                                                            strokeWidth: 2
                                                                        }, void 0, false, {
                                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                            lineNumber: 2601,
                                                                            columnNumber: 31
                                                                        }, this),
                                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                            children: "Coding Agent đang hoạt động"
                                                                        }, void 0, false, {
                                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                            lineNumber: 2602,
                                                                            columnNumber: 31
                                                                        }, this)
                                                                    ]
                                                                }, void 0, true, {
                                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                    lineNumber: 2600,
                                                                    columnNumber: 29
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                    className: "text-xs tabular-nums text-white/30",
                                                                    children: [
                                                                        Math.floor(agentElapsed / 60),
                                                                        ":",
                                                                        String(agentElapsed % 60).padStart(2, '0')
                                                                    ]
                                                                }, void 0, true, {
                                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                    lineNumber: 2604,
                                                                    columnNumber: 29
                                                                }, this)
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                            lineNumber: 2599,
                                                            columnNumber: 27
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            className: "mb-3 flex items-center gap-1",
                                                            children: STEP_ORDER.map((step)=>{
                                                                const isActive = agentStep === step;
                                                                const currentStepIndex = agentStep === 'idle' ? -1 : STEP_ORDER.indexOf(agentStep);
                                                                const isPast = currentStepIndex > STEP_ORDER.indexOf(step);
                                                                return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                    className: `flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium transition-all ${isActive ? 'bg-blue-500/20 text-blue-400' : isPast ? 'bg-white/[0.04] text-white/30' : 'bg-white/[0.02] text-white/15'}`,
                                                                    children: [
                                                                        isPast ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$check$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Check$3e$__["Check"], {
                                                                            size: 9,
                                                                            strokeWidth: 2.5
                                                                        }, void 0, false, {
                                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                            lineNumber: 2618,
                                                                            columnNumber: 47
                                                                        }, this) : isActive ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$circle$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Circle$3e$__["Circle"], {
                                                                            size: 7,
                                                                            className: "animate-pulse fill-current"
                                                                        }, void 0, false, {
                                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                            lineNumber: 2618,
                                                                            columnNumber: 97
                                                                        }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$circle$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Circle$3e$__["Circle"], {
                                                                            size: 7
                                                                        }, void 0, false, {
                                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                            lineNumber: 2618,
                                                                            columnNumber: 158
                                                                        }, this),
                                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                            children: STEP_LABELS[step]
                                                                        }, void 0, false, {
                                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                            lineNumber: 2619,
                                                                            columnNumber: 37
                                                                        }, this)
                                                                    ]
                                                                }, step, true, {
                                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                    lineNumber: 2617,
                                                                    columnNumber: 35
                                                                }, this);
                                                            })
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                            lineNumber: 2610,
                                                            columnNumber: 29
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            className: "mb-2 h-1 w-full overflow-hidden rounded-full bg-white/[0.06]",
                                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                className: "h-full rounded-full bg-blue-500/60 transition-all duration-500",
                                                                style: {
                                                                    width: `${agentIteration > 0 ? Math.min(agentIteration / agentMaxIterations * 100, 100) : 5}%`
                                                                }
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                lineNumber: 2628,
                                                                columnNumber: 29
                                                            }, this)
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                            lineNumber: 2627,
                                                            columnNumber: 27
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            className: "flex items-center justify-between",
                                                            children: [
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                    className: "text-xs text-white/40",
                                                                    children: agentStatus || 'Đang khởi tạo...'
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                    lineNumber: 2636,
                                                                    columnNumber: 29
                                                                }, this),
                                                                agentIteration > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                    className: "text-[10px] text-white/25",
                                                                    children: [
                                                                        "Lần ",
                                                                        agentIteration,
                                                                        "/",
                                                                        agentMaxIterations
                                                                    ]
                                                                }, void 0, true, {
                                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                    lineNumber: 2638,
                                                                    columnNumber: 31
                                                                }, this)
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                            lineNumber: 2635,
                                                            columnNumber: 27
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 2597,
                                                    columnNumber: 25
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "mb-4 flex items-center gap-2.5",
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["iconShellClass"],
                                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$sparkles$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Sparkles$3e$__["Sparkles"], {
                                                                size: 16,
                                                                strokeWidth: 1.5
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                lineNumber: 2646,
                                                                columnNumber: 27
                                                            }, this)
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                            lineNumber: 2645,
                                                            columnNumber: 25
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            children: [
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                                                                    className: "text-sm font-semibold text-white",
                                                                    children: "Thời khóa biểu đã xếp"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                    lineNumber: 2649,
                                                                    columnNumber: 27
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                                    className: "text-xs text-white/40",
                                                                    children: "Kết quả cuối cùng theo giáo viên và môn học"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                    lineNumber: 2650,
                                                                    columnNumber: 27
                                                                }, this)
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                            lineNumber: 2648,
                                                            columnNumber: 25
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 2644,
                                                    columnNumber: 23
                                                }, this),
                                                aiResult && !aiLoading && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "mb-4 space-y-4",
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                                                            className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["panelClass"]} p-4`,
                                                            children: [
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                    className: "mb-3 flex items-center justify-between gap-3",
                                                                    children: [
                                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                                                            className: "text-sm font-semibold text-white",
                                                                            children: "Kết quả pipeline"
                                                                        }, void 0, false, {
                                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                            lineNumber: 2658,
                                                                            columnNumber: 31
                                                                        }, this),
                                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                            className: "rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-medium text-emerald-300",
                                                                            children: aiResult.status
                                                                        }, void 0, false, {
                                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                            lineNumber: 2659,
                                                                            columnNumber: 31
                                                                        }, this)
                                                                    ]
                                                                }, void 0, true, {
                                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                    lineNumber: 2657,
                                                                    columnNumber: 29
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                                    className: "mb-3 text-xs text-white/55",
                                                                    children: aiResult.message
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                    lineNumber: 2663,
                                                                    columnNumber: 29
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                    className: "grid gap-2 sm:grid-cols-2 xl:grid-cols-4",
                                                                    children: [
                                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(MetricCard, {
                                                                            label: "Base constraints",
                                                                            value: aiResult.deterministicReport.baseConstraintPass ? 'Pass' : 'Fail'
                                                                        }, void 0, false, {
                                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                            lineNumber: 2665,
                                                                            columnNumber: 31
                                                                        }, this),
                                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(MetricCard, {
                                                                            label: "Hard constraints",
                                                                            value: aiResult.deterministicReport.hardConstraintPass ? 'Pass' : 'Fail'
                                                                        }, void 0, false, {
                                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                            lineNumber: 2666,
                                                                            columnNumber: 31
                                                                        }, this),
                                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(MetricCard, {
                                                                            label: "Soft constraints",
                                                                            value: aiResult.deterministicReport.softConstraintPass ? 'Pass' : 'Fail'
                                                                        }, void 0, false, {
                                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                            lineNumber: 2667,
                                                                            columnNumber: 31
                                                                        }, this),
                                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(MetricCard, {
                                                                            label: "Violations",
                                                                            value: aiResult.deterministicReport.violations.length
                                                                        }, void 0, false, {
                                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                            lineNumber: 2668,
                                                                            columnNumber: 31
                                                                        }, this)
                                                                    ]
                                                                }, void 0, true, {
                                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                    lineNumber: 2664,
                                                                    columnNumber: 29
                                                                }, this)
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                            lineNumber: 2656,
                                                            columnNumber: 27
                                                        }, this),
                                                        aiResult.deterministicReport.hardViolations.length > 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                                                            className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["panelClass"]} p-4`,
                                                            children: [
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                                                    className: "mb-3 text-sm font-semibold text-white",
                                                                    children: "Hard violations"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                    lineNumber: 2674,
                                                                    columnNumber: 31
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                    className: "space-y-2",
                                                                    children: aiResult.deterministicReport.hardViolations.map((violation, index)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                            className: "rounded-md border border-red-400/20 bg-red-400/[0.04] p-3",
                                                                            children: [
                                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                                                    className: "text-xs font-medium text-red-300/80",
                                                                                    children: violation.constraintId
                                                                                }, void 0, false, {
                                                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                                    lineNumber: 2678,
                                                                                    columnNumber: 37
                                                                                }, this),
                                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                                                    className: "mt-1 text-sm text-white/75",
                                                                                    children: violation.message
                                                                                }, void 0, false, {
                                                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                                    lineNumber: 2679,
                                                                                    columnNumber: 37
                                                                                }, this)
                                                                            ]
                                                                        }, `${violation.constraintId}-${index}`, true, {
                                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                            lineNumber: 2677,
                                                                            columnNumber: 35
                                                                        }, this))
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                    lineNumber: 2675,
                                                                    columnNumber: 31
                                                                }, this)
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                            lineNumber: 2673,
                                                            columnNumber: 29
                                                        }, this) : null,
                                                        aiResult.deterministicReport.uncheckedConstraintIds.length > 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                                                            className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["panelClass"]} p-4`,
                                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                                className: "text-xs text-amber-200/80",
                                                                children: [
                                                                    "Chưa kiểm tra được: ",
                                                                    aiResult.deterministicReport.uncheckedConstraintIds.join(', ')
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                lineNumber: 2688,
                                                                columnNumber: 31
                                                            }, this)
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                            lineNumber: 2687,
                                                            columnNumber: 29
                                                        }, this) : null,
                                                        (agentTimeline.length > 0 || (aiResult.attemptHistorySummary?.length ?? 0) > 0) && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                                                            className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["panelClass"]} p-4`,
                                                            children: [
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                                                    className: "mb-3 text-sm font-semibold text-white",
                                                                    children: "Timeline"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                    lineNumber: 2696,
                                                                    columnNumber: 31
                                                                }, this),
                                                                agentTimeline.length > 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                    className: "space-y-2",
                                                                    children: agentTimeline.map((event)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                            className: "rounded-md border border-white/[0.06] bg-[#141414] p-3",
                                                                            children: [
                                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                                                    className: "text-xs text-white/35",
                                                                                    children: new Date(event.timestamp).toLocaleTimeString('vi-VN')
                                                                                }, void 0, false, {
                                                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                                    lineNumber: 2701,
                                                                                    columnNumber: 39
                                                                                }, this),
                                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                                                    className: "text-sm font-medium text-white/80",
                                                                                    children: event.title
                                                                                }, void 0, false, {
                                                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                                    lineNumber: 2702,
                                                                                    columnNumber: 39
                                                                                }, this),
                                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                                                    className: "text-xs text-white/45",
                                                                                    children: event.detail
                                                                                }, void 0, false, {
                                                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                                    lineNumber: 2703,
                                                                                    columnNumber: 39
                                                                                }, this)
                                                                            ]
                                                                        }, event.id, true, {
                                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                            lineNumber: 2700,
                                                                            columnNumber: 37
                                                                        }, this))
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                    lineNumber: 2698,
                                                                    columnNumber: 33
                                                                }, this) : null,
                                                                (aiResult.attemptHistorySummary?.length ?? 0) > 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                    className: "mt-3 space-y-2",
                                                                    children: aiResult.attemptHistorySummary.map((attempt, index)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                            className: "rounded-md border border-white/[0.06] bg-[#101010] p-3",
                                                                            children: [
                                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                                                    className: "text-xs text-white/35",
                                                                                    children: attempt.at
                                                                                }, void 0, false, {
                                                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                                    lineNumber: 2712,
                                                                                    columnNumber: 39
                                                                                }, this),
                                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                                                    className: "text-sm text-white/75",
                                                                                    children: [
                                                                                        attempt.stage,
                                                                                        ": ",
                                                                                        attempt.summary
                                                                                    ]
                                                                                }, void 0, true, {
                                                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                                    lineNumber: 2713,
                                                                                    columnNumber: 39
                                                                                }, this)
                                                                            ]
                                                                        }, `${attempt.stage}-${index}`, true, {
                                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                            lineNumber: 2711,
                                                                            columnNumber: 37
                                                                        }, this))
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                    lineNumber: 2709,
                                                                    columnNumber: 33
                                                                }, this) : null
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                            lineNumber: 2695,
                                                            columnNumber: 29
                                                        }, this),
                                                        (aiResult.executionErrors && aiResult.executionErrors.length > 0 || aiResult.validationErrors && aiResult.validationErrors.length > 0) && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                                                            className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["panelClass"]} p-4`,
                                                            children: [
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                    type: "button",
                                                                    onClick: ()=>setShowTechnicalErrors(!showTechnicalErrors),
                                                                    className: "mb-3 flex w-full items-center gap-2 text-left text-sm text-white/50 hover:text-white/70 transition-colors",
                                                                    children: [
                                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$down$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronDown$3e$__["ChevronDown"], {
                                                                            size: 14,
                                                                            className: `transition-transform ${showTechnicalErrors ? 'rotate-180' : ''}`,
                                                                            strokeWidth: 1.5
                                                                        }, void 0, false, {
                                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                            lineNumber: 2729,
                                                                            columnNumber: 33
                                                                        }, this),
                                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                            children: "Lỗi kỹ thuật"
                                                                        }, void 0, false, {
                                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                            lineNumber: 2734,
                                                                            columnNumber: 33
                                                                        }, this),
                                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                            className: "rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px]",
                                                                            children: (aiResult.executionErrors?.length || 0) + (aiResult.validationErrors?.length || 0)
                                                                        }, void 0, false, {
                                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                            lineNumber: 2735,
                                                                            columnNumber: 33
                                                                        }, this)
                                                                    ]
                                                                }, void 0, true, {
                                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                    lineNumber: 2724,
                                                                    columnNumber: 31
                                                                }, this),
                                                                showTechnicalErrors && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                    className: "space-y-2",
                                                                    children: [
                                                                        aiResult.validationErrors?.map((e, idx)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                                className: "rounded border border-red-400/15 bg-red-400/[0.03] p-2.5",
                                                                                children: [
                                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                                                        className: "text-xs font-medium text-red-300/70",
                                                                                        children: [
                                                                                            "Validation Error — ",
                                                                                            e.constraintId
                                                                                        ]
                                                                                    }, void 0, true, {
                                                                                        fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                                        lineNumber: 2743,
                                                                                        columnNumber: 39
                                                                                    }, this),
                                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                                                        className: "mt-0.5 text-xs text-white/40",
                                                                                        children: e.error
                                                                                    }, void 0, false, {
                                                                                        fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                                        lineNumber: 2744,
                                                                                        columnNumber: 39
                                                                                    }, this)
                                                                                ]
                                                                            }, `val-${e.constraintId}-${idx}`, true, {
                                                                                fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                                lineNumber: 2742,
                                                                                columnNumber: 37
                                                                            }, this)),
                                                                        aiResult.executionErrors?.map((e, idx)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                                className: "rounded border border-amber-400/15 bg-amber-400/[0.03] p-2.5",
                                                                                children: [
                                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                                                        className: "text-xs font-medium text-amber-300/70",
                                                                                        children: [
                                                                                            "Execution Error — ",
                                                                                            e.constraintId
                                                                                        ]
                                                                                    }, void 0, true, {
                                                                                        fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                                        lineNumber: 2749,
                                                                                        columnNumber: 39
                                                                                    }, this),
                                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                                                        className: "mt-0.5 text-xs text-white/40 font-mono",
                                                                                        children: e.error
                                                                                    }, void 0, false, {
                                                                                        fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                                        lineNumber: 2750,
                                                                                        columnNumber: 39
                                                                                    }, this)
                                                                                ]
                                                                            }, `exec-${e.constraintId}-${idx}`, true, {
                                                                                fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                                lineNumber: 2748,
                                                                                columnNumber: 37
                                                                            }, this))
                                                                    ]
                                                                }, void 0, true, {
                                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                    lineNumber: 2740,
                                                                    columnNumber: 33
                                                                }, this)
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                            lineNumber: 2723,
                                                            columnNumber: 29
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 2655,
                                                    columnNumber: 25
                                                }, this),
                                                aiResult?.status === 'solved' && aiResult.deterministicReport.hardConstraintPass && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "mb-4 flex items-center gap-2 rounded-md border border-green-500/20 bg-green-500/[0.04] px-4 py-2.5 text-xs text-green-400",
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$check$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Check$3e$__["Check"], {
                                                            size: 14,
                                                            strokeWidth: 2
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                            lineNumber: 2762,
                                                            columnNumber: 27
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                            children: "Tất cả ràng buộc cứng thỏa mãn"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                            lineNumber: 2763,
                                                            columnNumber: 27
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 2761,
                                                    columnNumber: 25
                                                }, this),
                                                aiResult?.status === 'solved' ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Fragment"], {
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            className: "overflow-auto rounded-md border border-white/[0.12] bg-white text-black",
                                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("table", {
                                                                className: "min-w-[1540px] w-full border-collapse border-2 border-black text-[11px] font-normal leading-4 text-black [font-family:Arial,Helvetica,sans-serif]",
                                                                children: [
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("thead", {
                                                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("tr", {
                                                                            children: [
                                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("th", {
                                                                                    className: "w-20 border-2 border-black bg-white px-2 py-1.5 text-center align-middle font-bold uppercase",
                                                                                    children: "Thứ"
                                                                                }, void 0, false, {
                                                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                                    lineNumber: 2773,
                                                                                    columnNumber: 33
                                                                                }, this),
                                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("th", {
                                                                                    className: "w-12 border-2 border-black bg-white px-2 py-1.5 text-center align-middle font-bold uppercase",
                                                                                    children: "Tiết"
                                                                                }, void 0, false, {
                                                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                                    lineNumber: 2774,
                                                                                    columnNumber: 33
                                                                                }, this),
                                                                                resultTableClassColumns.map((className, index)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Fragment"], {
                                                                                        children: [
                                                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("th", {
                                                                                                className: "w-24 border-2 border-black bg-white px-2 py-1.5 text-center align-middle font-bold uppercase",
                                                                                                children: className || `Lớp ${index + 1}`
                                                                                            }, void 0, false, {
                                                                                                fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                                                lineNumber: 2777,
                                                                                                columnNumber: 37
                                                                                            }, this),
                                                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("th", {
                                                                                                className: "w-24 border-2 border-black bg-white px-2 py-1.5 text-center align-middle font-bold uppercase",
                                                                                                children: "GV Dạy"
                                                                                            }, void 0, false, {
                                                                                                fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                                                lineNumber: 2780,
                                                                                                columnNumber: 37
                                                                                            }, this)
                                                                                        ]
                                                                                    }, `class-pair-head-${index}`, true, {
                                                                                        fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                                        lineNumber: 2776,
                                                                                        columnNumber: 35
                                                                                    }, this))
                                                                            ]
                                                                        }, void 0, true, {
                                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                            lineNumber: 2772,
                                                                            columnNumber: 31
                                                                        }, this)
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                        lineNumber: 2771,
                                                                        columnNumber: 29
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("tbody", {
                                                                        children: fixedResultTableSections.map((section, sectionIndex)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Fragment"], {
                                                                                children: [
                                                                                    sectionIndex > 0 && section.divider && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("tr", {
                                                                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("td", {
                                                                                            colSpan: 18,
                                                                                            className: "border-2 border-black bg-white px-2 py-2 text-center text-sm font-bold uppercase tracking-wide",
                                                                                            children: section.divider
                                                                                        }, void 0, false, {
                                                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                                            lineNumber: 2792,
                                                                                            columnNumber: 39
                                                                                        }, this)
                                                                                    }, void 0, false, {
                                                                                        fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                                        lineNumber: 2791,
                                                                                        columnNumber: 37
                                                                                    }, this),
                                                                                    section.rows.map((group)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Fragment"], {
                                                                                            children: group.rows.map((row, rowIndex)=>{
                                                                                                const cellKey = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getCellKey"])(row.day.id, row.session.id, row.period);
                                                                                                const isLastGroupRow = rowIndex === group.rows.length - 1;
                                                                                                return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("tr", {
                                                                                                    children: [
                                                                                                        rowIndex === 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("td", {
                                                                                                            rowSpan: group.rows.length,
                                                                                                            className: "border-2 border-black bg-white px-2 py-1 text-center align-middle font-bold",
                                                                                                            children: group.label
                                                                                                        }, void 0, false, {
                                                                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                                                            lineNumber: 2806,
                                                                                                            columnNumber: 47
                                                                                                        }, this) : null,
                                                                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("td", {
                                                                                                            className: `border border-black bg-white px-2 py-1 text-center align-middle ${isLastGroupRow ? 'border-b-2' : ''}`,
                                                                                                            children: row.period
                                                                                                        }, void 0, false, {
                                                                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                                                            lineNumber: 2810,
                                                                                                            columnNumber: 45
                                                                                                        }, this),
                                                                                                        resultTableClassColumns.map((className, classIndex)=>{
                                                                                                            const entry = className ? solvedCellMap.get(cellKey)?.entries?.find((item)=>item.className === className) : null;
                                                                                                            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Fragment"], {
                                                                                                                children: [
                                                                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("td", {
                                                                                                                        className: `border border-black bg-white px-2 py-1 text-left align-middle ${isLastGroupRow ? 'border-b-2' : ''}`,
                                                                                                                        children: entry?.subject ?? ''
                                                                                                                    }, void 0, false, {
                                                                                                                        fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                                                                        lineNumber: 2818,
                                                                                                                        columnNumber: 51
                                                                                                                    }, this),
                                                                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("td", {
                                                                                                                        className: `border border-black bg-white px-2 py-1 text-left align-middle ${isLastGroupRow ? 'border-b-2' : ''}`,
                                                                                                                        children: entry?.teacher ?? ''
                                                                                                                    }, void 0, false, {
                                                                                                                        fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                                                                        lineNumber: 2821,
                                                                                                                        columnNumber: 51
                                                                                                                    }, this)
                                                                                                                ]
                                                                                                            }, `${cellKey}-${classIndex}-${className || 'blank'}`, true, {
                                                                                                                fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                                                                lineNumber: 2817,
                                                                                                                columnNumber: 49
                                                                                                            }, this);
                                                                                                        })
                                                                                                    ]
                                                                                                }, `${group.key}-${row.period}`, true, {
                                                                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                                                    lineNumber: 2804,
                                                                                                    columnNumber: 43
                                                                                                }, this);
                                                                                            })
                                                                                        }, group.key, false, {
                                                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                                            lineNumber: 2798,
                                                                                            columnNumber: 37
                                                                                        }, this))
                                                                                ]
                                                                            }, section.key, true, {
                                                                                fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                                lineNumber: 2789,
                                                                                columnNumber: 33
                                                                            }, this))
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                        lineNumber: 2787,
                                                                        columnNumber: 29
                                                                    }, this)
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                lineNumber: 2770,
                                                                columnNumber: 27
                                                            }, this)
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                            lineNumber: 2769,
                                                            columnNumber: 27
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            className: "mt-4 flex justify-end",
                                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                type: "button",
                                                                onClick: handleDownloadExcel,
                                                                className: "inline-flex items-center gap-2 rounded-md border border-white/[0.12] bg-[#4DB848]/10 px-4 py-2 text-sm font-medium text-[#4DB848] transition-colors hover:bg-[#4DB848]/20",
                                                                children: [
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$download$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Download$3e$__["Download"], {
                                                                        size: 16,
                                                                        strokeWidth: 1.5
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                        lineNumber: 2843,
                                                                        columnNumber: 33
                                                                    }, this),
                                                                    "Tải về Excel"
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                lineNumber: 2838,
                                                                columnNumber: 31
                                                            }, this)
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                            lineNumber: 2837,
                                                            columnNumber: 29
                                                        }, this)
                                                    ]
                                                }, void 0, true) : !aiLoading && !aiError ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "rounded-md border border-dashed border-white/[0.06] bg-[#0a0a0a] py-12 text-center text-sm text-white/30",
                                                    children: "Nhấn Xếp lịch để tạo bảng kết quả cuối."
                                                }, void 0, false, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 2849,
                                                    columnNumber: 25
                                                }, this) : aiResult || aiError ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "rounded-md border border-white/[0.06] bg-[#0a0a0a] px-4 py-12 text-center text-sm font-semibold text-white",
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            children: aiError || aiResult?.message || RESULT_NOT_FOUND_MESSAGE
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                            lineNumber: 2854,
                                                            columnNumber: 29
                                                        }, this),
                                                        aiResult?.diagnostics?.length ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            className: "mx-auto mt-3 max-w-2xl text-xs font-normal text-white/45",
                                                            children: aiResult.diagnostics.slice(0, 3).join(' · ')
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                            lineNumber: 2856,
                                                            columnNumber: 31
                                                        }, this) : null
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 2853,
                                                    columnNumber: 27
                                                }, this) : null
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 2556,
                                            columnNumber: 23
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                                            className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["panelClass"]} p-4`,
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "mb-4 flex items-center gap-2.5",
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                            className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["iconShellClass"],
                                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$clipboard$2d$list$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__ClipboardList$3e$__["ClipboardList"], {
                                                                size: 16,
                                                                strokeWidth: 1.5
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                lineNumber: 2868,
                                                                columnNumber: 29
                                                            }, this)
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                            lineNumber: 2867,
                                                            columnNumber: 27
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            children: [
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                                                                    className: "text-sm font-semibold text-white",
                                                                    children: "Ràng buộc xếp lịch"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                    lineNumber: 2871,
                                                                    columnNumber: 29
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                                    className: "text-xs text-white/40",
                                                                    children: "Bắt buộc và Nên có"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                    lineNumber: 2872,
                                                                    columnNumber: 29
                                                                }, this)
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                            lineNumber: 2870,
                                                            columnNumber: 27
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 2866,
                                                    columnNumber: 25
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "space-y-0",
                                                    children: constraintList.length ? sortedConstraintList.map((constraint)=>{
                                                        const constraintType = __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["constraintTypes"][constraint.type] ?? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["constraintTypes"].required;
                                                        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            className: `rounded-md border p-3 ${constraintType.boxClass}`,
                                                            children: [
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                    className: "mb-2 flex flex-wrap items-center justify-between gap-2",
                                                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                        className: `inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${constraintType.badgeClass}`,
                                                                        children: [
                                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$circle$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Circle$3e$__["Circle"], {
                                                                                className: constraintType.iconClass,
                                                                                size: 10,
                                                                                fill: "currentColor",
                                                                                strokeWidth: 0
                                                                            }, void 0, false, {
                                                                                fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                                lineNumber: 2886,
                                                                                columnNumber: 41
                                                                            }, this),
                                                                            constraintType.label
                                                                        ]
                                                                    }, void 0, true, {
                                                                        fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                        lineNumber: 2885,
                                                                        columnNumber: 39
                                                                    }, this)
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                    lineNumber: 2884,
                                                                    columnNumber: 37
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                                    className: "rounded border border-white/[0.06] bg-[#0a0a0a] p-2.5 text-sm text-white/60",
                                                                    children: constraint.text
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                    lineNumber: 2890,
                                                                    columnNumber: 35
                                                                }, this)
                                                            ]
                                                        }, constraint.id, true, {
                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                            lineNumber: 2882,
                                                            columnNumber: 37
                                                        }, this);
                                                    }) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["panelMutedClass"]} p-4 text-sm text-white/30`,
                                                        children: "Chưa có ràng buộc xếp lịch nào."
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                        lineNumber: 2897,
                                                        columnNumber: 29
                                                    }, this)
                                                }, void 0, false, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 2876,
                                                    columnNumber: 25
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 2865,
                                            columnNumber: 23
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                    lineNumber: 2555,
                                    columnNumber: 21
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("aside", {
                                    className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["panelClass"]} p-4`,
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "mb-4 flex items-center gap-2.5",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["iconShellClass"],
                                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$book$2d$open$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__BookOpen$3e$__["BookOpen"], {
                                                        size: 16,
                                                        strokeWidth: 1.5
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                        lineNumber: 2908,
                                                        columnNumber: 27
                                                    }, this)
                                                }, void 0, false, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 2907,
                                                    columnNumber: 25
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                                                            className: "text-sm font-semibold text-white",
                                                            children: "Phân công chuyên môn"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                            lineNumber: 2911,
                                                            columnNumber: 27
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                            className: "text-xs text-white/40",
                                                            children: "Tổng hợp giáo viên - môn - lớp - số tiết/tuần"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                            lineNumber: 2912,
                                                            columnNumber: 27
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 2910,
                                                    columnNumber: 25
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 2906,
                                            columnNumber: 23
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "space-y-0",
                                            children: assignmentList.length ? sortedAssignmentList.map((assignment, index)=>{
                                                const teacherColor = teacherColorMap[assignment.teacher] ?? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["teacherColors"][0];
                                                return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "border-b border-white/[0.04] py-3 last:border-b-0",
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            className: "mb-2 flex items-center justify-between gap-3",
                                                            children: [
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                                    className: "text-[11px] font-medium uppercase tracking-widest",
                                                                    style: {
                                                                        color: teacherColor.text
                                                                    },
                                                                    children: [
                                                                        "Phân công ",
                                                                        index + 1
                                                                    ]
                                                                }, void 0, true, {
                                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                    lineNumber: 2924,
                                                                    columnNumber: 35
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                    className: "rounded-full border px-2 py-0.5 text-[11px] font-medium",
                                                                    style: {
                                                                        borderColor: teacherColor.text,
                                                                        color: teacherColor.text,
                                                                        backgroundColor: 'rgba(0,0,0,0.3)'
                                                                    },
                                                                    children: assignment.teacher
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                    lineNumber: 2925,
                                                                    columnNumber: 35
                                                                }, this)
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                            lineNumber: 2923,
                                                            columnNumber: 33
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            className: "grid gap-2 sm:grid-cols-2",
                                                            children: [
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                    className: "rounded border border-white/[0.06] bg-[#0a0a0a] p-2.5",
                                                                    children: [
                                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                                            className: "text-[10px] font-medium uppercase tracking-widest text-white/30",
                                                                            children: "Giáo viên"
                                                                        }, void 0, false, {
                                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                            lineNumber: 2931,
                                                                            columnNumber: 37
                                                                        }, this),
                                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                                            className: "mt-0.5 truncate text-xs text-white/60",
                                                                            children: assignment.teacher
                                                                        }, void 0, false, {
                                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                            lineNumber: 2932,
                                                                            columnNumber: 37
                                                                        }, this)
                                                                    ]
                                                                }, void 0, true, {
                                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                    lineNumber: 2930,
                                                                    columnNumber: 35
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                    className: "rounded border border-white/[0.06] bg-[#0a0a0a] p-2.5",
                                                                    children: [
                                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                                            className: "text-[10px] font-medium uppercase tracking-widest text-white/30",
                                                                            children: "Môn học"
                                                                        }, void 0, false, {
                                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                            lineNumber: 2935,
                                                                            columnNumber: 37
                                                                        }, this),
                                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                                            className: "mt-0.5 truncate text-xs text-white/60",
                                                                            children: assignment.subject
                                                                        }, void 0, false, {
                                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                            lineNumber: 2936,
                                                                            columnNumber: 37
                                                                        }, this)
                                                                    ]
                                                                }, void 0, true, {
                                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                    lineNumber: 2934,
                                                                    columnNumber: 35
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                    className: "rounded border border-white/[0.06] bg-[#0a0a0a] p-2.5",
                                                                    children: [
                                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                                            className: "text-[10px] font-medium uppercase tracking-widest text-white/30",
                                                                            children: "Lớp"
                                                                        }, void 0, false, {
                                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                            lineNumber: 2939,
                                                                            columnNumber: 37
                                                                        }, this),
                                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                                            className: "mt-0.5 truncate text-xs text-white/60",
                                                                            children: assignment.className
                                                                        }, void 0, false, {
                                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                            lineNumber: 2940,
                                                                            columnNumber: 37
                                                                        }, this)
                                                                    ]
                                                                }, void 0, true, {
                                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                    lineNumber: 2938,
                                                                    columnNumber: 35
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                    className: "rounded border border-white/[0.06] bg-[#0a0a0a] p-2.5",
                                                                    children: [
                                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                                            className: "text-[10px] font-medium uppercase tracking-widest text-white/30",
                                                                            children: "Số tiết/tuần"
                                                                        }, void 0, false, {
                                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                            lineNumber: 2943,
                                                                            columnNumber: 37
                                                                        }, this),
                                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                                            className: "mt-0.5 truncate text-xs text-white/60",
                                                                            children: assignment.weeklyPeriods
                                                                        }, void 0, false, {
                                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                            lineNumber: 2944,
                                                                            columnNumber: 37
                                                                        }, this)
                                                                    ]
                                                                }, void 0, true, {
                                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                                    lineNumber: 2942,
                                                                    columnNumber: 35
                                                                }, this)
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                            lineNumber: 2929,
                                                            columnNumber: 33
                                                        }, this)
                                                    ]
                                                }, assignment.key, true, {
                                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                    lineNumber: 2922,
                                                    columnNumber: 31
                                                }, this);
                                            }) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: `${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$constants$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["panelMutedClass"]} p-4 text-sm text-white/30`,
                                                children: "Chưa có phân công chuyên môn nào."
                                            }, void 0, false, {
                                                fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                                lineNumber: 2951,
                                                columnNumber: 29
                                            }, this)
                                        }, void 0, false, {
                                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                            lineNumber: 2916,
                                            columnNumber: 23
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                                    lineNumber: 2905,
                                    columnNumber: 23
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                            lineNumber: 2554,
                            columnNumber: 19
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                    lineNumber: 2500,
                    columnNumber: 17
                }, this)
            }, void 0, false, {
                fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                lineNumber: 1192,
                columnNumber: 5
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$SettingsModal$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["SettingsModal"], {
                open: showSettingsModal,
                onOpenChange: (open)=>{
                    setShowSettingsModal(open);
                    if (!open && isFirstRun && !aiProvider) setShowSettingsModal(true);
                },
                initialConfig: aiProvider || undefined,
                onSave: (config)=>{
                    setAiProvider(config);
                    try {
                        localStorage.setItem(AI_PROVIDER_STORAGE_KEY, encodeProviderConfig(config));
                    } catch  {}
                    setIsFirstRun(false);
                },
                requireValid: isFirstRun
            }, void 0, false, {
                fileName: "[project]/src/features/timetable/TimetableApp.tsx",
                lineNumber: 2966,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true);
}
}),
"[project]/src/app/page.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>Home
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$TimetableApp$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/features/timetable/TimetableApp.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$quick$2d$import$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/features/timetable/quick-import.ts [app-ssr] (ecmascript)");
'use client';
;
;
;
;
function Home() {
    const [showTimetable, setShowTimetable] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [showQuickImport, setShowQuickImport] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [quickDatasetText, setQuickDatasetText] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$quick$2d$import$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["QUICK_IMPORT_SAMPLE_TEXT"]);
    const [quickImportPayload, setQuickImportPayload] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    if (showTimetable) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "flex min-h-screen items-center justify-center bg-[#0a0a0a]",
            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$timetable$2f$TimetableApp$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                onBackToLanding: ()=>setShowTimetable(false),
                quickDatasetText: quickImportPayload
            }, void 0, false, {
                fileName: "[project]/src/app/page.tsx",
                lineNumber: 16,
                columnNumber: 9
            }, this)
        }, void 0, false, {
            fileName: "[project]/src/app/page.tsx",
            lineNumber: 15,
            columnNumber: 7
        }, this);
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("main", {
        className: "flex min-h-screen flex-col items-center justify-center bg-[#050505] px-6 text-white",
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "text-center max-w-xl",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "mb-3 text-[11px] uppercase tracking-[0.24em] text-[#4DB848]",
                    children: "Data entry workspace"
                }, void 0, false, {
                    fileName: "[project]/src/app/page.tsx",
                    lineNumber: 27,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h1", {
                    className: "text-6xl font-semibold tracking-tighter",
                    children: "Tack Timetable"
                }, void 0, false, {
                    fileName: "[project]/src/app/page.tsx",
                    lineNumber: 30,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                    className: "mt-4 text-lg text-white/70",
                    children: [
                        "Nhập dữ liệu giáo viên, môn, lớp, phân công và ràng buộc.",
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("br", {}, void 0, false, {
                            fileName: "[project]/src/app/page.tsx",
                            lineNumber: 34,
                            columnNumber: 68
                        }, this),
                        "Payload đã chuẩn bị sẵn sàng để gửi vào backend mới."
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/app/page.tsx",
                    lineNumber: 33,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                    type: "button",
                    onClick: ()=>{
                        setQuickImportPayload(null);
                        setShowTimetable(true);
                    },
                    className: "mt-8 inline-flex h-12 items-center justify-center gap-2 rounded-md bg-[#4DB848] px-8 text-base font-medium text-[#0a0a0a] transition hover:bg-[#40993C]",
                    children: "+ Bắt đầu nhập dữ liệu"
                }, void 0, false, {
                    fileName: "[project]/src/app/page.tsx",
                    lineNumber: 38,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "mt-3",
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        type: "button",
                        onClick: ()=>setShowQuickImport((current)=>!current),
                        className: "inline-flex h-10 items-center justify-center rounded-md border border-white/[0.12] bg-white/[0.03] px-5 text-sm font-medium text-white/80 transition hover:bg-white/[0.08]",
                        children: "Nhập dữ liệu nhanh"
                    }, void 0, false, {
                        fileName: "[project]/src/app/page.tsx",
                        lineNumber: 50,
                        columnNumber: 11
                    }, this)
                }, void 0, false, {
                    fileName: "[project]/src/app/page.tsx",
                    lineNumber: 49,
                    columnNumber: 9
                }, this),
                showQuickImport ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                    className: "mt-4 rounded-md border border-white/[0.1] bg-[#101010] p-4 text-left",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                            className: "mb-2 text-xs text-white/55",
                            children: "Dán dataset theo format mẫu, hệ thống chỉ điền dữ liệu để bạn kiểm tra rồi tự bấm xếp lịch."
                        }, void 0, false, {
                            fileName: "[project]/src/app/page.tsx",
                            lineNumber: 61,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("textarea", {
                            value: quickDatasetText,
                            onChange: (event)=>setQuickDatasetText(event.target.value),
                            rows: 18,
                            className: "min-h-72 w-full rounded-md border border-white/[0.1] bg-[#0a0a0a] px-3 py-2 text-xs text-white outline-none transition focus:border-white/25"
                        }, void 0, false, {
                            fileName: "[project]/src/app/page.tsx",
                            lineNumber: 64,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                            type: "button",
                            onClick: ()=>{
                                if (!quickDatasetText.trim()) return;
                                setQuickImportPayload(quickDatasetText);
                                setShowTimetable(true);
                            },
                            className: "mt-3 inline-flex h-10 items-center justify-center rounded-md bg-[#4DB848] px-5 text-sm font-medium text-[#0a0a0a] transition hover:bg-[#40993C]",
                            children: "Dùng dữ liệu này"
                        }, void 0, false, {
                            fileName: "[project]/src/app/page.tsx",
                            lineNumber: 70,
                            columnNumber: 13
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/app/page.tsx",
                    lineNumber: 60,
                    columnNumber: 11
                }, this) : null,
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "mt-6 text-xs text-white/40",
                    children: "Toàn bộ phần AI / solver cũ đã được gỡ bỏ. Chỉ còn luồng nhập liệu + xuất payload."
                }, void 0, false, {
                    fileName: "[project]/src/app/page.tsx",
                    lineNumber: 84,
                    columnNumber: 9
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/src/app/page.tsx",
            lineNumber: 26,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/src/app/page.tsx",
        lineNumber: 25,
        columnNumber: 5
    }, this);
}
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__805b99f7._.js.map