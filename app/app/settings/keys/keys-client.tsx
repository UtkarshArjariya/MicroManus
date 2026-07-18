"use client";

import { useMemo, useState, useTransition } from "react";
import { KeyRound, Loader2, Trash2 } from "lucide-react";

import { deleteProviderKey, saveProviderKey } from "@/app/app/settings/keys/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getDefaultBaseUrl, getDefaultModel, getModelsForProvider, type ProviderId } from "@/lib/models";

type ProviderKeyRow = {
  id: string;
  provider: ProviderId;
  label: string;
  base_url: string | null;
  key_last4: string;
  default_model: string;
  created_at: string;
};

const PROVIDERS: Array<{ value: ProviderId; label: string }> = [
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic (Claude)" },
  { value: "kimi", label: "Kimi (Moonshot)" },
  { value: "openai_compatible", label: "Custom OpenAI-compatible" },
];

function ProviderForm({ existing }: { existing?: ProviderKeyRow }) {
  const [provider, setProvider] = useState<ProviderId>(existing?.provider ?? "openai");
  const [baseUrl, setBaseUrl] = useState(existing?.base_url ?? getDefaultBaseUrl(existing?.provider ?? "openai"));
  const [model, setModel] = useState(existing?.default_model ?? getDefaultModel(existing?.provider ?? "openai"));
  const [apiKey, setApiKey] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const modelOptions = useMemo(() => getModelsForProvider(provider), [provider]);

  function onProviderChange(value: ProviderId) {
    setProvider(value);
    setBaseUrl(existing?.provider === value ? existing.base_url ?? getDefaultBaseUrl(value) : getDefaultBaseUrl(value));
    setModel(existing?.provider === value ? existing.default_model : getDefaultModel(value));
  }

  async function testConnection() {
    setStatus("Testing connection...");
    const response = await fetch("/api/provider-keys/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, apiKey, baseUrl, model }),
    });
    const payload = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    setStatus(payload?.ok ? "Connection succeeded." : payload?.error ?? "Connection failed.");
  }

  return (
    <form
      action={(formData) => {
        startTransition(async () => {
          setStatus(null);
          await saveProviderKey(formData);
          if (!existing) {
            setApiKey("");
          }
        });
      }}
      className="space-y-4 rounded-lg border bg-background p-4"
    >
      {existing ? <input name="id" type="hidden" value={existing.id} /> : null}
      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="font-medium">Label</span>
          <Input name="label" placeholder="Personal OpenAI key" required defaultValue={existing?.label} />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">Provider</span>
          <select
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            name="provider"
            value={provider}
            onChange={(event) => onProviderChange(event.target.value as ProviderId)}
          >
            {PROVIDERS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="font-medium">API key</span>
          <Input
            name="apiKey"
            type="password"
            placeholder={existing ? `Leave blank to keep sk-...${existing.key_last4}` : "sk-..."}
            required={!existing}
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">Base URL</span>
          <Input
            name="baseUrl"
            placeholder={provider === "openai_compatible" ? "https://provider.example/v1" : "Provider default"}
            required={provider === "openai_compatible"}
            disabled={provider === "anthropic"}
            value={baseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
          />
        </label>
      </div>

      <label className="space-y-1 text-sm">
        <span className="font-medium">Default model</span>
        <Input
          name="defaultModel"
          list={`models-${existing?.id ?? "new"}`}
          value={model}
          onChange={(event) => setModel(event.target.value)}
          placeholder={provider === "openai_compatible" ? "model-id" : "Choose or type a model id"}
          required
        />
        <datalist id={`models-${existing?.id ?? "new"}`}>
          {modelOptions.map((item) => (
            <option key={item.modelId} value={item.modelId}>
              {item.label}
            </option>
          ))}
        </datalist>
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={isPending} type="submit">
          {isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <KeyRound aria-hidden="true" />}
          {existing ? "Save key" : "Add key"}
        </Button>
        <Button disabled={!apiKey} type="button" variant="outline" onClick={testConnection}>
          Test connection
        </Button>
        {status ? <p className="text-sm text-muted-foreground">{status}</p> : null}
      </div>
    </form>
  );
}

export function KeysClient({ keys }: { keys: ProviderKeyRow[] }) {
  return (
    <div className="space-y-6">
      <ProviderForm />

      <div className="space-y-3">
        {keys.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
            No provider keys saved yet. Add one to start a chat.
          </div>
        ) : (
          keys.map((key) => (
            <div key={key.id} className="space-y-3 rounded-lg border bg-muted/20 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{key.label}</p>
                  <p className="text-sm text-muted-foreground">
                    {key.provider} · sk-...{key.key_last4} · {key.default_model}
                  </p>
                  {key.base_url ? <p className="break-all text-xs text-muted-foreground">{key.base_url}</p> : null}
                </div>
                <form action={deleteProviderKey}>
                  <input name="id" type="hidden" value={key.id} />
                  <Button type="submit" size="sm" variant="destructive">
                    <Trash2 aria-hidden="true" />
                    Delete
                  </Button>
                </form>
              </div>
              <details>
                <summary className="cursor-pointer text-sm font-medium">Edit</summary>
                <div className="pt-3">
                  <ProviderForm existing={key} />
                </div>
              </details>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
