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
"[project]/src/app/api/ai/chat/route.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "POST",
    ()=>POST,
    "__chatInternal",
    ()=>__chatInternal
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/server.js [app-route] (ecmascript)");
;
function isAnthropicModel(model) {
    return model.toLowerCase().startsWith('anthropic/');
}
function applyProviderSpecificCaching(model, messages, cacheEnabled) {
    if (!cacheEnabled || !isAnthropicModel(model)) return messages;
    return messages.map((message, index)=>index <= 1 ? {
            ...message,
            cache_control: {
                type: 'ephemeral'
            }
        } : message);
}
function providerHeaders(model, cacheEnabled) {
    if (!cacheEnabled || !isAnthropicModel(model)) return undefined;
    return {
        'anthropic-beta': 'prompt-caching-2024-07-31'
    };
}
function normalizeContent(content) {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
        return content.map((item)=>{
            if (typeof item === 'string') return item;
            if (item && typeof item === 'object' && 'text' in item && typeof item.text === 'string') {
                return item.text;
            }
            return '';
        }).join('\n').trim();
    }
    return '';
}
function normalizeBaseURL(baseURL) {
    return baseURL.replace(/\/+$/u, '');
}
function asRecord(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}
function extractErrorMessage(payload) {
    const record = asRecord(payload);
    if (!record) return null;
    if (typeof record.error === 'string' && record.error.trim()) {
        return record.error.trim();
    }
    const errorRecord = asRecord(record.error);
    if (errorRecord && typeof errorRecord.message === 'string' && errorRecord.message.trim()) {
        return errorRecord.message.trim();
    }
    return null;
}
function extractResponseContent(payload) {
    const record = asRecord(payload);
    if (!record) return {
        content: '',
        usage: null
    };
    const choices = Array.isArray(record.choices) ? record.choices : [];
    let content = '';
    for (const choice of choices){
        const choiceRecord = asRecord(choice);
        if (!choiceRecord) continue;
        const message = asRecord(choiceRecord.message);
        const normalizedMessage = normalizeContent(message?.content);
        if (normalizedMessage) {
            content = normalizedMessage;
            break;
        }
        const delta = asRecord(choiceRecord.delta);
        const deltaText = typeof delta?.content === 'string' ? delta.content : '';
        if (deltaText) content += deltaText;
        if (!content && typeof choiceRecord.text === 'string') {
            content = choiceRecord.text;
        }
    }
    const usage = asRecord(record.usage);
    return {
        content,
        usage
    };
}
function parseSsePayload(raw) {
    const lines = raw.split(/\r?\n/u);
    let sawDataLine = false;
    let content = '';
    let usage = null;
    for (const line of lines){
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        sawDataLine = true;
        const data = trimmed.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        let parsed = null;
        try {
            parsed = JSON.parse(data);
        } catch  {
            continue;
        }
        const providerError = extractErrorMessage(parsed);
        if (providerError) {
            throw new Error(providerError);
        }
        const extracted = extractResponseContent(parsed);
        if (extracted.content) content += extracted.content;
        if (extracted.usage) usage = extracted.usage;
    }
    if (!sawDataLine) return null;
    return {
        content,
        usage
    };
}
function parseProviderResponse(raw) {
    const trimmed = raw.trim();
    if (!trimmed) return {
        content: '',
        usage: null
    };
    try {
        const parsed = JSON.parse(trimmed);
        const providerError = extractErrorMessage(parsed);
        if (providerError) throw new Error(providerError);
        return extractResponseContent(parsed);
    } catch (error) {
        const sseParsed = parseSsePayload(trimmed);
        if (sseParsed) return sseParsed;
        if (error instanceof Error) throw error;
        throw new Error('Provider response is not valid JSON.');
    }
}
async function POST(request) {
    try {
        const body = await request.json();
        const baseURL = normalizeBaseURL(String(body.baseURL ?? '').trim());
        const apiKey = request.headers.get('x-provider-key')?.trim() || String(body.apiKey ?? '').trim();
        const model = String(body.model ?? '').trim();
        const messages = Array.isArray(body.messages) ? body.messages : [];
        if (!baseURL || !apiKey || !model || messages.length === 0) {
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                ok: false,
                error: 'Missing baseURL/apiKey/model/messages'
            }, {
                status: 400
            });
        }
        const cacheEnabled = Boolean(body.cache_control?.enable);
        const messagesWithCache = applyProviderSpecificCaching(model, messages, cacheEnabled);
        const requestedTimeoutMs = Number(body.timeoutMs ?? 45_000);
        const timeoutMs = Math.max(1_000, Math.min(Number.isFinite(requestedTimeoutMs) ? requestedTimeoutMs : 45_000, 180_000));
        const controller = new AbortController();
        const timeout = setTimeout(()=>controller.abort(), timeoutMs);
        let response;
        try {
            response = await fetch(`${baseURL}/chat/completions`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                    ...providerHeaders(model, cacheEnabled) ?? {}
                },
                cache: 'no-store',
                signal: controller.signal,
                body: JSON.stringify({
                    model,
                    messages: messagesWithCache,
                    temperature: body.temperature ?? 0.2,
                    max_tokens: body.max_tokens ?? 4000,
                    response_format: body.response_format,
                    stream: false
                })
            });
        } catch (error) {
            if (controller.signal.aborted) {
                return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                    ok: false,
                    error: `Provider request timed out after ${Math.ceil(timeoutMs / 1000)}s`
                }, {
                    status: 504
                });
            }
            throw error;
        } finally{
            clearTimeout(timeout);
        }
        const raw = await response.text();
        if (!response.ok) {
            let details = '';
            try {
                const parsed = JSON.parse(raw);
                details = extractErrorMessage(parsed) || raw;
            } catch  {
                details = raw;
            }
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                ok: false,
                error: `Provider HTTP ${response.status} ${response.statusText}: ${details.slice(0, 400)}`
            }, {
                status: 500
            });
        }
        const parsed = parseProviderResponse(raw);
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            ok: true,
            content: parsed.content,
            usage: parsed.usage
        });
    } catch (error) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            ok: false,
            error: error instanceof Error ? error.message : 'Unknown server error'
        }, {
            status: 500
        });
    }
}
const __chatInternal = {
    applyProviderSpecificCaching,
    providerHeaders,
    parseProviderResponse
};
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__ff092d94._.js.map