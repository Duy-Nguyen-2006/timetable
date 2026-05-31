'use client';

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import type { AIProviderConfig, AIProviderType, SolverProfile, SolverRuntimeMode } from './ai/types';
import { resolveProvider, normalizeBaseURL } from '@/lib/provider';

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialConfig?: Partial<AIProviderConfig>;
  onSave: (config: AIProviderConfig) => void;
  requireValid?: boolean; // first-run mode
}

const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';
const SOLVER_PROFILES: Array<{ value: SolverProfile; label: string; description: string }> = [
  { value: 'fast', label: 'Nhanh', description: '20s, dùng khoảng nửa CPU' },
  { value: 'balanced', label: 'Cân bằng', description: '60s, dùng CPU - 1 worker' },
  { value: 'deep', label: 'Sâu', description: '180s, ưu tiên chất lượng nghiệm' },
];
const RUNTIME_MODES: Array<{ value: SolverRuntimeMode; label: string; description: string }> = [
  { value: 'bundled', label: 'Bundled', description: 'Mặc định, không cần cài Python' },
  { value: 'docker', label: 'Docker', description: 'Nâng cao, cách ly bằng container' },
  { value: 'system', label: 'System Python', description: 'Cho dev, dùng python3 hệ thống' },
];

function inferProvider(baseURL: string, model: string): AIProviderType {
  return resolveProvider(undefined, baseURL, model);
}

export function SettingsModal({
  open,
  onOpenChange,
  initialConfig,
  onSave,
  requireValid = false,
}: SettingsModalProps) {
  const [baseURL, setBaseURL] = useState(initialConfig?.baseURL || DEFAULT_BASE_URL);
  const [apiKey, setApiKey] = useState(initialConfig?.apiKey || '');
  const [model, setModel] = useState(initialConfig?.model || 'deepseek/deepseek-v4-flash');
  const [modelTranslator, setModelTranslator] = useState(initialConfig?.modelTranslator || '');
  const [modelPlanner, setModelPlanner] = useState(initialConfig?.modelPlanner || '');
  const [modelCoder, setModelCoder] = useState(initialConfig?.modelCoder || '');
  const [modelRepair, setModelRepair] = useState(initialConfig?.modelRepair || '');
  const [showAdvancedModels, setShowAdvancedModels] = useState(
    Boolean(
      initialConfig?.modelTranslator ||
        initialConfig?.modelPlanner ||
        initialConfig?.modelCoder ||
        initialConfig?.modelRepair,
    ),
  );
  const [solverProfile, setSolverProfile] = useState<SolverProfile>(initialConfig?.solverProfile || 'balanced');
  const [solverRuntimeMode, setSolverRuntimeMode] = useState<SolverRuntimeMode>(initialConfig?.solverRuntimeMode || 'bundled');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const { toast } = useToast();

  const handleTest = async () => {
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
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          provider: inferProvider(baseURL.trim(), model.trim()),
          baseURL: baseURL.trim(),
          apiKey: apiKey.trim(),
          model: model.trim(),
        }),
      });

      const payload = await res.json().catch(() => null);
      const message = payload?.message as string | undefined;
      const details = payload?.details as string | undefined;

      if (payload?.ok) {
        setTestResult(message ?? '✅ Kết nối thành công!');
        toast({ title: 'Kết nối thành công', description: 'Bạn có thể lưu cấu hình.' });
      } else {
        const composed = [message ?? '❌ Test thất bại.', details].filter(Boolean).join('\n');
        setTestResult(composed);
      }
    } catch (e: any) {
      setTestResult(`❌ Không kết nối được: ${e.message}`);
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = () => {
    const trimmedBaseURL = normalizeBaseURL(baseURL.trim());
    const trimmedKey = apiKey.trim();
    const trimmedModel = model.trim();

    if (!trimmedBaseURL) {
      toast({ title: 'Lỗi', description: 'Base URL không được để trống', variant: 'destructive' });
      return;
    }

    if (!/^https?:\/\//i.test(trimmedBaseURL)) {
      toast({ title: 'Lỗi', description: 'Base URL phải bắt đầu bằng http:// hoặc https://', variant: 'destructive' });
      return;
    }

    if (!trimmedKey) {
      toast({ title: 'Lỗi', description: 'API Key không được để trống', variant: 'destructive' });
      return;
    }

    if (!trimmedModel) {
      toast({ title: 'Lỗi', description: 'Model không được để trống', variant: 'destructive' });
      return;
    }

    onSave({
      provider: inferProvider(trimmedBaseURL, trimmedModel),
      baseURL: trimmedBaseURL,
      apiKey: trimmedKey,
      model: trimmedModel,
      modelTranslator: modelTranslator.trim() || undefined,
      modelPlanner: modelPlanner.trim() || undefined,
      modelCoder: modelCoder.trim() || undefined,
      modelRepair: modelRepair.trim() || undefined,
      solverProfile,
      solverRuntimeMode,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Cấu hình AI Provider</DialogTitle>
          <DialogDescription>
            Nhập provider AI. OpenRouter/generic dùng Chat Completions; GPT-5+/GPT-4o/o-series dùng OpenAI Responses API.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Base URL</Label>
            <Input
              value={baseURL}
              onChange={(e) => setBaseURL(e.target.value)}
              placeholder="https://openrouter.ai/api/v1"
            />
          </div>

          <div className="space-y-2">
            <Label>API Key</Label>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-or-..."
            />
          </div>

          <div className="space-y-2">
            <Label>Model</Label>
            <Input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="deepseek/deepseek-chat"
            />
            <p className="text-xs text-muted-foreground">
              Ví dụ: deepseek/deepseek-v4-flash, gpt-5, gpt-4o-mini
            </p>
            <p className="text-xs text-muted-foreground">
              Provider tự nhận diện: {inferProvider(baseURL, model)}
            </p>
            <button
              type="button"
              onClick={() => setShowAdvancedModels((v) => !v)}
              className="text-xs underline text-muted-foreground hover:text-foreground"
            >
              {showAdvancedModels ? 'Ẩn model nâng cao' : 'Cấu hình model riêng cho từng stage'}
            </button>
            {showAdvancedModels ? (
              <div className="grid gap-2 pt-2">
                {(
                  [
                    { label: 'Translator model', value: modelTranslator, set: setModelTranslator },
                    { label: 'Planner model', value: modelPlanner, set: setModelPlanner },
                    { label: 'Coder model', value: modelCoder, set: setModelCoder },
                    { label: 'Repair model', value: modelRepair, set: setModelRepair },
                  ] as const
                ).map(({ label, value, set }) => (
                  <div className="space-y-1" key={label}>
                    <Label className="text-xs">{label}</Label>
                    <Input
                      value={value}
                      onChange={(e) => set(e.target.value)}
                      placeholder="(mặc định: dùng model chính)"
                    />
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">
                  Để trống ô nào sẽ fallback về model chính. Hữu ích khi muốn dùng model rẻ cho translator và model mạnh cho coder.
                </p>
              </div>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label>Mức hiệu năng solver</Label>
            <div className="grid gap-2 sm:grid-cols-3">
              {SOLVER_PROFILES.map((profile) => (
                <button
                  key={profile.value}
                  type="button"
                  onClick={() => setSolverProfile(profile.value)}
                  className={`rounded-md border p-2 text-left text-xs transition ${
                    solverProfile === profile.value
                      ? 'border-primary bg-primary/10 text-foreground'
                      : 'border-border text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <span className="block font-medium">{profile.label}</span>
                  <span className="mt-1 block">{profile.description}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Chế độ chạy solver</Label>
            <div className="grid gap-2 sm:grid-cols-3">
              {RUNTIME_MODES.map((runtime) => (
                <button
                  key={runtime.value}
                  type="button"
                  onClick={() => setSolverRuntimeMode(runtime.value)}
                  className={`rounded-md border p-2 text-left text-xs transition ${
                    solverRuntimeMode === runtime.value
                      ? 'border-primary bg-primary/10 text-foreground'
                      : 'border-border text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <span className="block font-medium">{runtime.label}</span>
                  <span className="mt-1 block">{runtime.description}</span>
                </button>
              ))}
            </div>
          </div>

          <Button onClick={handleTest} disabled={isTesting} variant="outline" className="w-full">
            {isTesting ? 'Đang test...' : 'Test Connection'}
          </Button>

          {testResult && (
            <div className="rounded-md border p-3 text-sm whitespace-pre-wrap">
              {testResult}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          {!requireValid && (
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Hủy
            </Button>
          )}
          <Button onClick={handleSave}>
            Lưu cấu hình
          </Button>
        </div>

        {requireValid && (
          <p className="text-center text-xs text-amber-600">
            Lần đầu sử dụng bạn phải cấu hình AI Provider hợp lệ trước khi tiếp tục.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
