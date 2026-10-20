// Jobs → Search criteria (docs/prd/23-career-job-search.md): the one record the
// weekly routine reads at every run. Only this form writes it (Claude only
// reads it). Lists are one item per line; lanes in priority order.
import {
  CURRENCIES,
  PAY_PERIODS,
  type SearchCriteria,
  searchCriteriaResponseSchema,
} from "@projects-lab/shared/career";
import { useState } from "react";
import {
  Banner,
  Button,
  Input,
  Select,
  Skeleton,
  Textarea,
  useToast,
} from "../../components/ui";
import { apiFetch } from "../../core/api";
import { type FailureKind, failureKind } from "../../core/failure";
import { ReadView } from "../../core/ReadView";
import { send } from "./FormSheet";

async function fetchCriteria(signal: AbortSignal) {
  const response = await apiFetch("/api/career/search-criteria", { signal });
  if (!response.ok)
    throw new Error(`GET /api/career/search-criteria: ${response.status}`);
  // Null criteria still render: an empty form to fill in.
  return {
    criteria: searchCriteriaResponseSchema.parse(await response.json())
      .criteria,
  };
}

const lines = (text: string) =>
  text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
const whole = (text: string) => /^\d+$/.test(text.trim());

function Form({ criteria }: { criteria: SearchCriteria | null }) {
  const toast = useToast();
  const [form, setForm] = useState({
    queries: criteria?.queries.join("\n") ?? "",
    lanes: criteria?.lanes.join("\n") ?? "",
    shapes: criteria?.shapes.join("\n") ?? "",
    maxHours: criteria ? String(criteria.maxHours) : "",
    timezoneNote: criteria?.timezoneNote ?? "",
    rateAmount: criteria?.rateFloor ? String(criteria.rateFloor.amount) : "",
    rateCurrency: criteria?.rateFloor?.currency ?? "USD",
    ratePeriod: criteria?.rateFloor?.period ?? "hour",
    autoReject: criteria?.autoReject.join("\n") ?? "",
    maxAgeDays: criteria ? String(criteria.maxAgeDays) : "",
    sources: criteria?.sources.join("\n") ?? "",
  });
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<FailureKind | null>(null);
  const [refused, setRefused] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState(criteria?.updatedAt ?? null);
  const set =
    (key: keyof typeof form) => (event: { target: { value: string } }) =>
      setForm({ ...form, [key]: event.target.value });

  const errors = {
    lanes: lines(form.lanes).length === 0 ? "At least one lane." : undefined,
    maxHours: whole(form.maxHours) ? undefined : "Whole hours a week, e.g. 20.",
    maxAgeDays:
      whole(form.maxAgeDays) && Number(form.maxAgeDays) >= 1
        ? undefined
        : "Whole days, 1 or more, e.g. 14.",
    rateAmount:
      form.rateAmount.trim() === "" || whole(form.rateAmount)
        ? undefined
        : "A whole amount, or leave empty.",
  };
  const shown = (key: keyof typeof errors) => (tried ? errors[key] : undefined);

  async function save() {
    setTried(true);
    setFailed(null);
    setRefused(null);
    if (Object.values(errors).some(Boolean)) return;
    setBusy(true);
    try {
      const response = await send("PUT", "/api/career/search-criteria", {
        queries: lines(form.queries),
        lanes: lines(form.lanes),
        shapes: lines(form.shapes),
        maxHours: Number(form.maxHours),
        timezoneNote: form.timezoneNote.trim(),
        rateFloor:
          form.rateAmount.trim() === ""
            ? null
            : {
                amount: Number(form.rateAmount),
                currency: form.rateCurrency,
                period: form.ratePeriod,
              },
        autoReject: lines(form.autoReject),
        maxAgeDays: Number(form.maxAgeDays),
        sources: lines(form.sources),
      });
      if (response.status === 400) {
        const body = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        return setRefused(body?.message ?? "Check the fields above.");
      }
      if (!response.ok) return setFailed("error");
      const { criteria: saved } = searchCriteriaResponseSchema.parse(
        await response.json(),
      );
      setSavedAt(saved?.updatedAt ?? null);
      toast.show({ tone: "success", message: "Search criteria saved" });
    } catch (error) {
      setFailed(failureKind(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 tablet:max-w-(--size-sheet-max)">
      <p className="text-sm text-ink-muted">
        The weekly job search reads these at every run and keeps an opening only
        if every one holds.
        {savedAt ? ` Last saved ${savedAt.slice(0, 10)}.` : " Not saved yet."}
      </p>
      {refused && (
        <Banner tone="danger" title="Not saved.">
          {refused}
        </Banner>
      )}
      {failed === "error" && (
        <Banner tone="danger" title="Couldn't save them.">
          What you typed is still here. Try again in a moment.
        </Banner>
      )}
      {failed === "offline" && (
        <Banner tone="offline" title="You're offline.">
          What you typed is still here. Save once you're back online.
        </Banner>
      )}
      <Textarea
        label="Queries"
        optional
        value={form.queries}
        onChange={set("queries")}
        hint={'One per line, e.g. "AI engineer" contract remote'}
      />
      <Textarea
        label="Lanes"
        value={form.lanes}
        onChange={set("lanes")}
        error={shown("lanes")}
        hint="One per line, in priority order."
      />
      <Textarea
        label="Work shapes"
        optional
        value={form.shapes}
        onChange={set("shapes")}
        hint="One per line: contract, part-time, freelance…"
      />
      <div className="grid gap-3 tablet:grid-cols-2">
        <Input
          label="Max hours a week"
          inputMode="numeric"
          value={form.maxHours}
          onChange={set("maxHours")}
          error={shown("maxHours")}
        />
        <Input
          label="Max posting age (days)"
          inputMode="numeric"
          value={form.maxAgeDays}
          onChange={set("maxAgeDays")}
          error={shown("maxAgeDays")}
        />
      </div>
      <Input
        label="Time zone"
        optional
        value={form.timezoneNote}
        onChange={set("timezoneNote")}
        hint="e.g. overlap with UTC−3, async-friendly"
      />
      <div className="grid grid-cols-3 gap-3">
        <Input
          label="Rate floor"
          optional
          inputMode="numeric"
          value={form.rateAmount}
          onChange={set("rateAmount")}
          error={shown("rateAmount")}
        />
        <Select
          label="Currency"
          value={form.rateCurrency}
          options={CURRENCIES.map((c) => [c, c])}
          onChange={(rateCurrency) => setForm({ ...form, rateCurrency })}
        />
        <Select
          label="Per"
          value={form.ratePeriod}
          options={PAY_PERIODS.map((p) => [p, p])}
          onChange={(ratePeriod) => setForm({ ...form, ratePeriod })}
        />
      </div>
      <Textarea
        label="Auto-reject"
        optional
        value={form.autoReject}
        onChange={set("autoReject")}
        hint="Keywords and companies, one per line. Any match is rejected."
      />
      <Textarea
        label="Sources"
        optional
        value={form.sources}
        onChange={set("sources")}
        hint="Public boards and careers pages, one per line. Never LinkedIn."
      />
      <div>
        <Button loading={busy} onClick={save}>
          {busy ? "Saving" : "Save criteria"}
        </Button>
      </div>
    </div>
  );
}

export function CriteriaForm() {
  return (
    <ReadView
      load={fetchCriteria}
      skeleton={
        <div className="flex flex-col gap-3">
          <Skeleton shape="block" />
          <Skeleton shape="block" />
        </div>
      }
      empty={null}
    >
      {({ criteria }) => <Form criteria={criteria} />}
    </ReadView>
  );
}
