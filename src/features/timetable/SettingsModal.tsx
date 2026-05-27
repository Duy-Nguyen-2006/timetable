'use client';

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import type { AIProviderConfig } from './ai/types';

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialConfig?: Partial<AIProviderConfig>;
  onSave: (config: AIProviderConfig) => void;
  requireValid?: boolean; // first-run mode
}

const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';

export function SettingsModal({
  open,
  onOpenChange,
  initialConfig,
  onSave,
  requireValid = false,
}: SettingsModalProps) {
  const [baseURL, setBaseURL] = useState(initialConfig?.baseURL || DEFAULT_BASE_URL);
  const [apiKey, setApiKey] = useState(initialConfig?.apiKey || '');
  const [model, setModel] = useState(initialConfig?.model || 'deepseek/deepseek-chat');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const { toast } = useToast();

  const handleTest = async () => {
    if (!apiKey.trim()) {
      setTestResult('Vui lòng nhập API Key trước khi test.');
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      const res = await fetch(`${baseURL.replace(/\/$/, '')}/models`, {
        headers: {
          Authorization: `Bearer ${apiKey.trim()}`,
        },
      });

      if (res.ok) {
        setTestResult('✅ Kết nối thành công! Key và Base URL hợp lệ.');
        toast({ title: 'Kết nối thành công', description: 'Bạn có thể lưu cấu hình.' });
      } else if (res.status === 401) {
        setTestResult('❌ API Key không hợp lệ hoặc hết hạn (401).');
      } else {
        setTestResult(`❌ Lỗi kết nối: ${res.status} ${res.statusText}`);
      }
    } catch (e: any) {
      setTestResult(`❌ Không kết nối được: ${e.message}`);
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = () => {
    const trimmedKey = apiKey.trim();
    if (!trimmedKey) {
      toast({ title: 'Lỗi', description: 'API Key không được để trống', variant: 'destructive' });
      return;
    }
    if (!model.trim()) {
      toast({ title: 'Lỗi', description: 'Model không được để trống', variant: 'destructive' });
      return;
    }

    onSave({
      baseURL: baseURL.trim() || DEFAULT_BASE_URL,
      apiKey: trimmedKey,
      model: model.trim(),
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Cấu hình AI Provider</DialogTitle>
          <DialogDescription>
            Nhập thông tin OpenAI-compatible provider của bạn. Dữ liệu chỉ lưu trên máy này.
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
              Ví dụ: deepseek/deepseek-chat, gpt-4o-mini, gemini-1.5-flash
            </p>
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
