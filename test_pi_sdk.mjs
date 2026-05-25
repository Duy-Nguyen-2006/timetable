import { createAgentSession, AuthStorage, ModelRegistry, SessionManager, SettingsManager } from "@earendil-works/pi-coding-agent";
import fs from "fs";
import path from "path";
import os from "os";

const API_KEY = "lpr_4sGk0witr0lgsG1Ahh8ivzVVBB8Go1GGF6BF5OUc9OE";
const BASE_URL = "https://api.lowprizo.com/v1";
const MODEL_ID = "devstral-latest";

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-test-"));
const authStorage = AuthStorage.create(path.join(workDir, "auth.json"));
const modelRegistry = ModelRegistry.inMemory(authStorage);

modelRegistry.registerProvider("lowprizo", {
    name: "LowPrizo",
    baseUrl: BASE_URL,
    apiKey: API_KEY,
    models: [{
        id: MODEL_ID,
        name: "Devstral",
        api: "openai-completions",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 32000,
    }]
});

const model = modelRegistry.find("lowprizo", MODEL_ID);

// Test 1: No tools at all
console.log("Test 1: No tools (noTools='all')...");
try {
    const { session } = await createAgentSession({
        model,
        noTools: "all",
        cwd: workDir,
        sessionManager: SessionManager.inMemory(workDir),
        settingsManager: SettingsManager.inMemory({ compaction: { enabled: false } }),
        authStorage,
        modelRegistry,
        thinkingLevel: "off",
    });
    
    let text = "";
    let allEvents = [];
    session.subscribe((event) => {
        allEvents.push(event.type);
        if (event.type === "message_update" && event.assistantMessageEvent?.type === "text_delta") {
            text += event.assistantMessageEvent.delta;
        }
    });
    
    const t = setTimeout(() => session.abort(), 20000);
    await session.prompt("Say hello world");
    clearTimeout(t);
    
    console.log(`  Text: "${text.slice(0,200)}"`);
    console.log(`  Events: ${allEvents.join(", ")}`);
    session.dispose();
} catch (err) {
    console.log(`  ERROR: ${err.message?.slice(0,300)}`);
    console.log(`  Stack: ${err.stack?.slice(0,300)}`);
}

process.exit(0);
