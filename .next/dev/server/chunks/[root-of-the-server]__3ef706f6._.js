module.exports = [
"[externals]/next/dist/compiled/next-server/app-route-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-route-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/@opentelemetry/api [external] (next/dist/compiled/@opentelemetry/api, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/@opentelemetry/api", () => require("next/dist/compiled/@opentelemetry/api"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/next-server/app-page-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-page-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-unit-async-storage.external.js [external] (next/dist/server/app-render/work-unit-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/work-unit-async-storage.external.js", () => require("next/dist/server/app-render/work-unit-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-async-storage.external.js [external] (next/dist/server/app-render/work-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/work-async-storage.external.js", () => require("next/dist/server/app-render/work-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/shared/lib/no-fallback-error.external.js [external] (next/dist/shared/lib/no-fallback-error.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/shared/lib/no-fallback-error.external.js", () => require("next/dist/shared/lib/no-fallback-error.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/after-task-async-storage.external.js [external] (next/dist/server/app-render/after-task-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/after-task-async-storage.external.js", () => require("next/dist/server/app-render/after-task-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/node:child_process [external] (node:child_process, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("node:child_process", () => require("node:child_process"));

module.exports = mod;
}),
"[externals]/node:crypto [external] (node:crypto, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("node:crypto", () => require("node:crypto"));

module.exports = mod;
}),
"[externals]/node:fs [external] (node:fs, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("node:fs", () => require("node:fs"));

module.exports = mod;
}),
"[externals]/node:os [external] (node:os, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("node:os", () => require("node:os"));

module.exports = mod;
}),
"[externals]/node:path [external] (node:path, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("node:path", () => require("node:path"));

module.exports = mod;
}),
"[project]/src/app/api/ai/python-execute/route.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "POST",
    ()=>POST
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/server.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$child_process__$5b$external$5d$__$28$node$3a$child_process$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/node:child_process [external] (node:child_process, cjs)");
var __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$crypto__$5b$external$5d$__$28$node$3a$crypto$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/node:crypto [external] (node:crypto, cjs)");
var __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$fs__$5b$external$5d$__$28$node$3a$fs$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/node:fs [external] (node:fs, cjs)");
var __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$os__$5b$external$5d$__$28$node$3a$os$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/node:os [external] (node:os, cjs)");
var __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$path__$5b$external$5d$__$28$node$3a$path$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/node:path [external] (node:path, cjs)");
;
;
;
;
;
;
function digestError(raw, maxLen = 800) {
    const lines = raw.split('\n').map((line)=>line.trim()).filter(Boolean);
    const focused = lines.slice(-12).join('\n');
    if (focused.length <= maxLen) return focused;
    return `${focused.slice(0, maxLen - 3)}...`;
}
function truncateOutput(raw, maxLines = 100) {
    const lines = raw.split('\n');
    if (lines.length <= maxLines) return raw;
    return `${lines.slice(0, maxLines).join('\n')}\n...[truncated ${lines.length - maxLines} lines]`;
}
function runExecutor(code, input, timeoutMs) {
    return new Promise((resolve, reject)=>{
        const repoRoot = process.cwd();
        const jobDir = __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$path__$5b$external$5d$__$28$node$3a$path$2c$__cjs$29$__["default"].join(__TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$os__$5b$external$5d$__$28$node$3a$os$2c$__cjs$29$__["default"].tmpdir(), `tack-exec-${Date.now()}-${__TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$crypto__$5b$external$5d$__$28$node$3a$crypto$2c$__cjs$29$__["default"].randomBytes(4).toString('hex')}`);
        const executorPath = __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$path__$5b$external$5d$__$28$node$3a$path$2c$__cjs$29$__["default"].join(repoRoot, 'python', 'code_executor.py');
        __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$fs__$5b$external$5d$__$28$node$3a$fs$2c$__cjs$29$__["default"].mkdirSync(jobDir, {
            recursive: true
        });
        // Stringify không pretty-print để tiết kiệm băng thông disk I/O.
        __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$fs__$5b$external$5d$__$28$node$3a$fs$2c$__cjs$29$__["default"].writeFileSync(__TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$path__$5b$external$5d$__$28$node$3a$path$2c$__cjs$29$__["default"].join(jobDir, 'input.json'), JSON.stringify(input ?? {}), 'utf8');
        let cleanedUp = false;
        const cleanupJobDir = ()=>{
            if (cleanedUp) return; // fix bug #25 — idempotent cleanup
            cleanedUp = true;
            try {
                __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$fs__$5b$external$5d$__$28$node$3a$fs$2c$__cjs$29$__["default"].rmSync(jobDir, {
                    recursive: true,
                    force: true
                });
            } catch  {
            /* ignore */ }
        };
        const timeoutSeconds = Math.max(1, Math.ceil(timeoutMs / 1000));
        const child = (0, __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$child_process__$5b$external$5d$__$28$node$3a$child_process$2c$__cjs$29$__["spawn"])('python3', [
            executorPath,
            String(timeoutSeconds)
        ], {
            cwd: jobDir,
            stdio: [
                'pipe',
                'pipe',
                'pipe'
            ],
            env: {
                ...process.env,
                PYTHONUNBUFFERED: '1',
                // fix bug #6 — chuyển timeout xuống Python qua env nữa cho chắc.
                EXECUTOR_TIMEOUT_SECONDS: String(timeoutSeconds),
                // fix bug #29 — đồng bộ max time của CP-SAT solver với timeoutMs.
                SOLVER_MAX_SECONDS: String(Math.max(5, timeoutSeconds - 5))
            },
            detached: true
        });
        let stdout = '';
        let stderr = '';
        let timedOut = false;
        const killTree = ()=>{
            // Tìm cách kill cả process group (bỏ qua nếu không hỗ trợ, ví dụ Windows).
            try {
                if (typeof child.pid === 'number') {
                    process.kill(-child.pid, 'SIGKILL');
                    return;
                }
            } catch  {
            /* ignore */ }
            try {
                child.kill('SIGKILL');
            } catch  {
            /* ignore */ }
        };
        const timer = setTimeout(()=>{
            timedOut = true;
            killTree();
        }, Math.max(1_000, timeoutMs));
        child.stdout.on('data', (chunk)=>{
            stdout += String(chunk);
        });
        child.stderr.on('data', (chunk)=>{
            stderr += String(chunk);
        });
        child.on('error', (err)=>{
            clearTimeout(timer);
            cleanupJobDir();
            reject(err);
        });
        child.on('close', ()=>{
            clearTimeout(timer);
            if (timedOut) {
                cleanupJobDir();
                reject(new Error('Python execution timed out.'));
                return;
            }
            const lines = stdout.split('\n').map((line)=>line.trim()).filter(Boolean);
            const lastLine = lines[lines.length - 1];
            if (!lastLine) {
                cleanupJobDir();
                reject(new Error(`Executor returned empty output. Stderr: ${stderr.slice(0, 400)}`));
                return;
            }
            // fix bug #28 — dùng line-boundary slice an toàn hơn cho stderr.
            try {
                const parsed = JSON.parse(lastLine);
                const resultPath = typeof parsed.resultPath === 'string' && parsed.resultPath ? parsed.resultPath : '';
                let resultData;
                if (resultPath && __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$fs__$5b$external$5d$__$28$node$3a$fs$2c$__cjs$29$__["default"].existsSync(resultPath)) {
                    try {
                        resultData = JSON.parse(__TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$fs__$5b$external$5d$__$28$node$3a$fs$2c$__cjs$29$__["default"].readFileSync(resultPath, 'utf8'));
                    } catch  {
                        resultData = undefined;
                    }
                }
                // Validate resultPath: phải nằm trong os.tmpdir() hoặc jobDir,
                // tránh path traversal khi Python emit đường dẫn độc hại. (fix bug #26)
                const resolvedResultPath = resultPath && __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$path__$5b$external$5d$__$28$node$3a$path$2c$__cjs$29$__["default"].isAbsolute(resultPath) ? __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$path__$5b$external$5d$__$28$node$3a$path$2c$__cjs$29$__["default"].resolve(resultPath) : '';
                const tmpRoot = __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$path__$5b$external$5d$__$28$node$3a$path$2c$__cjs$29$__["default"].resolve(__TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$os__$5b$external$5d$__$28$node$3a$os$2c$__cjs$29$__["default"].tmpdir());
                const cwdRoot = __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$path__$5b$external$5d$__$28$node$3a$path$2c$__cjs$29$__["default"].resolve(process.cwd());
                const safeResultPath = resolvedResultPath && (resolvedResultPath.startsWith(tmpRoot + __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$path__$5b$external$5d$__$28$node$3a$path$2c$__cjs$29$__["default"].sep) || resolvedResultPath.startsWith(cwdRoot + __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$path__$5b$external$5d$__$28$node$3a$path$2c$__cjs$29$__["default"].sep)) ? resolvedResultPath : '';
                if (resolvedResultPath && !safeResultPath) {
                    // Reject mặc không load file ngoài whitelist.
                    resultData = undefined;
                } else if (safeResultPath && __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$fs__$5b$external$5d$__$28$node$3a$fs$2c$__cjs$29$__["default"].existsSync(safeResultPath)) {
                    try {
                        resultData = JSON.parse(__TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$fs__$5b$external$5d$__$28$node$3a$fs$2c$__cjs$29$__["default"].readFileSync(safeResultPath, 'utf8'));
                    } catch  {
                        resultData = undefined;
                    }
                }
                resolve({
                    ...parsed,
                    ...resultData ? {
                        resultData
                    } : {},
                    // fix bug #27 — KHÔNG gửi stdout/stderr gốc (đã có errorDigest).
                    // Chỉ giữ stdout/stderr của Python wrapper dưới dạng truncated
                    // để debug khi ok=false.
                    stdout: typeof parsed.stdout === 'string' ? truncateOutput(parsed.stdout, 40) : '',
                    stderr: typeof parsed.stderr === 'string' ? truncateOutput(parsed.stderr, 40) : '',
                    errorDigest: typeof parsed.errorDigest === 'string' ? digestError(parsed.errorDigest) : digestError(stderr || stdout)
                });
            } catch  {
                reject(new Error(`Executor output is not valid JSON. Last line: ${lastLine.slice(0, 300)}. Stderr: ${stderr.slice(0, 300)}`));
            } finally{
                cleanupJobDir(); // idempotent
            }
        });
        child.stdin.write(code);
        child.stdin.end();
    });
}
async function POST(request) {
    try {
        const body = await request.json();
        const code = String(body.code ?? '');
        const timeoutMs = Number(body.timeoutMs ?? 360_000);
        if (!code.trim()) {
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                ok: false,
                error: 'Missing python code.'
            }, {
                status: 400
            });
        }
        const result = await runExecutor(code, body.input, timeoutMs);
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            ok: true,
            result
        });
    } catch (error) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            ok: false,
            error: error instanceof Error ? error.message : 'Unknown execution error'
        }, {
            status: 500
        });
    }
}
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__3ef706f6._.js.map