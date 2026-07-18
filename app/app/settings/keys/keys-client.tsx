"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { KeyRound, ListRestart, Loader2, Pencil, Trash2, X } from "lucide-react";

import { deleteProviderKey, saveProviderKey } from "@/app/app/settings/keys/actions";
import { InterfaceNotice } from "@/components/interface-notice";
import { ProviderMark, providerName } from "@/components/provider-mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parseJsonResponse } from "@/lib/http";
import {
  getDefaultBaseUrl,
  getDefaultModel,
  getModelsForProvider,
  getProviderApiFormat,
  PROVIDER_API_FORMATS,
  type ProviderApiFormat,
  type ProviderId,
} from "@/lib/models";

type ProviderKeyRow = {
  id: string;
  provider: ProviderId;
  api_format: ProviderApiFormat;
  label: string;
  base_url: string | null;
  key_last4: string;
  default_model: string;
  created_at: string;
};

type FormStatus = { message: string; tone: "error" | "success" | "info" };
type AvailableModel = { id: string; label: string; releasedAt?: string | null };

const PROVIDERS: Array<{ value: ProviderId; label: string }> = [
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic (Claude)" },
  { value: "google", label: "Google Gemini" },
  { value: "kimi", label: "Kimi (Moonshot)" },
  { value: "openai_compatible", label: "Custom endpoint" },
];

function connectionError(status: number) {
  if (status === 401) return "Your session ended. Sign in again, then test the key.";
  if (status === 400) return "Enter the key and required provider details before testing.";
  if (status === 502) return "The provider rejected or couldn’t complete the test. Check the key, model, and base URL.";
  return "We couldn’t test this connection. Check the details and try again.";
}

function ProviderForm({ existing }: { existing?: ProviderKeyRow }) {
  const [provider, setProvider] = useState<ProviderId>(existing?.provider ?? "openai");
  const [apiFormat, setApiFormat] = useState<ProviderApiFormat>(
    getProviderApiFormat(existing?.provider ?? "openai", existing?.api_format),
  );
  const [baseUrl, setBaseUrl] = useState(existing?.base_url ?? getDefaultBaseUrl(existing?.provider ?? "openai"));
  const [model, setModel] = useState(existing?.default_model ?? getDefaultModel(existing?.provider ?? "openai"));
  const [label, setLabel] = useState(existing?.label ?? `${providerName(existing?.provider ?? "openai")} key`);
  const [apiKey, setApiKey] = useState("");
  const [loadedModels, setLoadedModels] = useState<AvailableModel[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [status, setStatus] = useState<FormStatus | null>(null);
  const [isPending, startTransition] = useTransition();
  const hasLoadedInitialModels = useRef(false);
  const modelOptions = useMemo(() => {
    const models = new Map<string, AvailableModel>();
    loadedModels.forEach((item) => models.set(item.id, item));
    getModelsForProvider(provider).forEach((item) => {
      if (!models.has(item.modelId)) {
        models.set(item.modelId, { id: item.modelId, label: item.label });
      }
    });
    return [...models.values()];
  }, [loadedModels, provider]);

  function onProviderChange(value: ProviderId) {
    setProvider(value);
    if (!existing) setLabel(`${providerName(value)} key`);
    setApiFormat(
      existing?.provider === value
        ? getProviderApiFormat(value, existing.api_format)
        : getProviderApiFormat(value),
    );
    setBaseUrl(existing?.provider === value ? existing.base_url ?? getDefaultBaseUrl(value) : getDefaultBaseUrl(value));
    setModel(existing?.provider === value ? existing.default_model : getDefaultModel(value));
    setLoadedModels([]);
    setStatus(null);
  }

  const loadModels = useCallback(async (silent = false) => {
    setIsLoadingModels(true);
    if (!silent) setStatus({ message: "Loading every model available to this key…", tone: "info" });

    try {
      const response = await fetch("/api/provider-models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          apiFormat,
          apiKey,
          baseUrl,
          providerKeyId: existing?.id,
        }),
      });
      const payload = await parseJsonResponse<{ models?: AvailableModel[]; error?: string }>(response);
      if (!response.ok || !payload?.models) {
        setStatus({ message: payload?.error ?? "The provider couldn’t list models.", tone: "error" });
        return;
      }
      setLoadedModels(payload.models);
      setModel((current) => current || payload.models?.[0]?.id || "");
      setStatus({
        message: `Loaded ${payload.models.length} ${payload.models.length === 1 ? "model" : "models"}, newest releases first.`,
        tone: "success",
      });
    } catch {
      setStatus({ message: "We couldn’t reach the model catalog. Check the key and try again.", tone: "error" });
    } finally {
      setIsLoadingModels(false);
    }
  }, [apiFormat, apiKey, baseUrl, existing?.id, provider]);

  useEffect(() => {
    if (!existing || hasLoadedInitialModels.current) return;
    hasLoadedInitialModels.current = true;
    void loadModels(true);
  }, [existing, loadModels]);

  async function testConnection() {
    setStatus({ message: "Testing the provider connection…", tone: "info" });
    try {
      const response = await fetch("/api/provider-keys/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, apiKey, baseUrl, model, apiFormat }),
      });

      if (!response.ok) {
        setStatus({ message: connectionError(response.status), tone: "error" });
        return;
      }

      const payload = await parseJsonResponse<{ ok?: boolean }>(response);
      setStatus(payload?.ok
        ? { message: "Connection verified. This key is ready to use.", tone: "success" }
        : { message: "The provider didn’t confirm the connection. Check the details and retry.", tone: "error" },
      );
    } catch {
      setStatus({ message: "We couldn’t reach the provider. Check your connection and try again.", tone: "error" });
    }
  }

  return (
    <form
      action={(formData) => {
        startTransition(async () => {
          setStatus(null);
          const result = await saveProviderKey(formData);
          if (result.error) {
            setStatus({ message: result.error, tone: "error" });
            return;
          }
          setStatus({
            message: existing ? "Provider key updated." : "Provider key added. Start a new chat when you’re ready.",
            tone: "success",
          });
          if (!existing && result.ok) setApiKey("");
        });
      }}
      className={existing ? "border-t border-ink/15 pt-5" : "border border-ink/20 bg-paper-surface p-5 sm:p-6"}
    >
      {existing ? <input name="id" type="hidden" value={existing.id} /> : null}
      <input name="provider" type="hidden" value={provider} />
      <input name="apiFormat" type="hidden" value={apiFormat} />

      {!existing ? (
        <div className="mb-6">
          <p className="utility-label">Add provider</p>
          <h2 className="mt-2 text-2xl font-semibold">Connect a research model</h2>
        </div>
      ) : null}

      <fieldset>
        <legend className="mb-2 text-sm font-semibold">Provider</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {PROVIDERS.map((item) => (
            <button
              key={item.value}
              aria-pressed={provider === item.value}
              className={`flex h-10 items-center justify-center border px-2 text-xs font-semibold transition-colors ${
                provider === item.value
                  ? "border-ink bg-paper-deep text-ink"
                  : "border-ink/20 bg-transparent text-ink-muted hover:border-ink/50"
              }`}
              onClick={() => onProviderChange(item.value)}
              title={item.label}
              type="button"
            >
              <ProviderMark provider={item.value} />
            </button>
          ))}
        </div>
      </fieldset>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="block space-y-2 text-sm">
          <span className="font-semibold">Label</span>
          <Input
            name="label"
            placeholder="Personal research key"
            required
            value={label}
            onChange={(event) => setLabel(event.target.value)}
          />
        </label>
        <label className="block space-y-2 text-sm">
          <span className="font-semibold">API key</span>
          <Input
            className="font-mono"
            name="apiKey"
            type="password"
            placeholder={existing ? `Leave blank to keep ••••${existing.key_last4}` : "Paste API key"}
            required={!existing}
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
          />
        </label>
      </div>

      {provider === "openai_compatible" ? (
        <fieldset className="mt-4">
          <legend className="mb-2 text-sm font-semibold">API compatibility</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {PROVIDER_API_FORMATS.map((format) => (
              <button
                key={format.value}
                aria-pressed={apiFormat === format.value}
                className={`border px-3 py-3 text-left transition-colors ${
                  apiFormat === format.value
                    ? "border-ink bg-paper-deep text-ink"
                    : "border-ink/20 text-ink-muted hover:border-ink/50"
                }`}
                onClick={() => {
                  setApiFormat(format.value);
                  setLoadedModels([]);
                }}
                type="button"
              >
                <span className="block text-xs font-semibold">{format.label}</span>
                <span className="mt-1 block text-[0.68rem] leading-4">{format.description}</span>
              </button>
            ))}
          </div>
        </fieldset>
      ) : (
        <p className="mt-4 text-xs leading-5 text-ink-muted">
          Endpoint and API format are configured automatically. Paste the provider key and choose a model.
        </p>
      )}

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="block space-y-2 text-sm">
          <span className="font-semibold">Base URL</span>
          <Input
            className="font-mono text-xs"
            name="baseUrl"
            placeholder={provider === "openai_compatible" ? "https://provider.example/v1" : "Provider default"}
            required={provider === "openai_compatible"}
            disabled={provider !== "openai_compatible"}
            value={baseUrl}
            onChange={(event) => {
              setBaseUrl(event.target.value);
              setLoadedModels([]);
            }}
          />
        </label>
        <label className="block space-y-2 text-sm">
          <span className="font-semibold">Default model</span>
          <Input
            className="font-mono"
            name="defaultModel"
            list={`models-${existing?.id ?? "new"}`}
            value={model}
            onChange={(event) => setModel(event.target.value)}
            placeholder={provider === "openai_compatible" ? "Provider model ID" : "Choose or enter a model ID"}
            required
          />
          <datalist id={`models-${existing?.id ?? "new"}`}>
            {modelOptions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}{item.releasedAt ? ` · ${item.releasedAt.slice(0, 10)}` : ""}
              </option>
            ))}
          </datalist>
          <p className="text-[0.68rem] leading-4 text-ink-muted">
            Choose a loaded model or enter any model ID supported by this endpoint.
          </p>
        </label>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-3">
        <Button disabled={isPending} type="submit">
          {isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <KeyRound aria-hidden="true" />}
          {existing ? "Save changes" : "Add key"}
        </Button>
        <Button
          disabled={isLoadingModels || (!existing && !apiKey)}
          onClick={() => void loadModels()}
          type="button"
          variant="outline"
        >
          {isLoadingModels ? <Loader2 className="animate-spin" aria-hidden="true" /> : <ListRestart aria-hidden="true" />}
          {loadedModels.length > 0 ? "Refresh models" : "Load all models"}
        </Button>
        <Button disabled={!apiKey} type="button" variant="text" onClick={testConnection}>Test connection</Button>
      </div>
      {status ? <InterfaceNotice className="mt-4" tone={status.tone}>{status.message}</InterfaceNotice> : null}
    </form>
  );
}

function DeleteKeyForm({ id, label }: { id: string; label: string }) {
  const [confirming, setConfirming] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <Button aria-label={`Delete ${label}`} onClick={() => setConfirming(true)} size="icon" type="button" variant="ghost">
        <Trash2 aria-hidden="true" />
      </Button>
    );
  }

  return (
    <form
      action={(formData) => {
        startTransition(async () => {
          setStatus(null);
          const result = await deleteProviderKey(formData);
          if (result.error) setStatus(result.error);
        });
      }}
      className="flex flex-wrap items-center justify-end gap-2"
    >
      <input name="id" type="hidden" value={id} />
      <span className="text-xs text-brick">Delete this key?</span>
      <Button disabled={isPending} type="submit" size="sm" variant="destructive">
        {isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Trash2 aria-hidden="true" />}Delete
      </Button>
      <Button aria-label="Cancel delete" onClick={() => setConfirming(false)} size="icon" type="button" variant="ghost">
        <X aria-hidden="true" />
      </Button>
      {status ? <InterfaceNotice className="w-full text-left" tone="error">{status}</InterfaceNotice> : null}
    </form>
  );
}

function SavedKeyRow({ keyRow }: { keyRow: ProviderKeyRow }) {
  const [editing, setEditing] = useState(false);

  return (
    <div className="border-b border-ink/20 py-5">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <ProviderMark provider={keyRow.provider} showLabel={false} />
            <h3 className="truncate text-xl font-semibold">{keyRow.label}</h3>
            <span className="text-xs text-ink-muted">{providerName(keyRow.provider)}</span>
          </div>
          <p className="mt-2 break-words font-mono text-xs leading-5 text-ink-muted">
            ••••{keyRow.key_last4} · {keyRow.default_model}
          </p>
          {keyRow.provider === "openai_compatible" ? (
            <p className="mt-1 text-[0.68rem] text-ink-muted">
              {PROVIDER_API_FORMATS.find((format) => format.value === keyRow.api_format)?.label ?? "Custom API"}
            </p>
          ) : null}
          {keyRow.base_url ? <p className="mt-1 break-all font-mono text-[0.68rem] text-ink-muted">{keyRow.base_url}</p> : null}
        </div>
        <div className="flex items-center justify-between gap-2 sm:justify-end">
          <Button onClick={() => setEditing((value) => !value)} size="sm" type="button" variant="text">
            <Pencil aria-hidden="true" />{editing ? "Close editor" : "Edit or test"}
          </Button>
          <DeleteKeyForm id={keyRow.id} label={keyRow.label} />
        </div>
      </div>
      {editing ? <div className="pt-5"><ProviderForm existing={keyRow} /></div> : null}
    </div>
  );
}

export function KeysClient({ keys }: { keys: ProviderKeyRow[] }) {
  return (
    <div className="space-y-9">
      <ProviderForm />

      <section aria-labelledby="saved-keys-heading">
        <div className="flex items-end justify-between border-b border-ink/25 pb-3">
          <div>
            <p className="utility-label">Key registry</p>
            <h2 id="saved-keys-heading" className="mt-1 text-2xl font-semibold">Saved keys</h2>
          </div>
          <span className="font-mono text-xs text-ink-muted">{keys.length}</span>
        </div>

        {keys.length === 0 ? (
          <div className="border-b border-ink/20 py-7">
            <p className="text-sm text-ink-muted">No keys are ready yet. Add one above to start a research chat.</p>
          </div>
        ) : keys.map((keyRow) => <SavedKeyRow key={keyRow.id} keyRow={keyRow} />)}
      </section>
    </div>
  );
}
