// The copy panel (docs/prd/22-career-documents.md § Copy panel), markup from
// the bundle's "Profile copy panel" phone and tablet screens: the profile's
// standard fields and answers, then one job's answers, each with Copy. It
// reads only what's already loaded, so copying works offline.
import { formatSalaryRange } from "@projects-lab/shared/career";
import { useState } from "react";
import {
  CopyField,
  Select,
  type ToastInput,
  useToast,
} from "../../components/ui";
import type { ProfileData } from "./data";

const COPY_FAILED: ToastInput = {
  tone: "danger",
  message: "Couldn't copy: select the text instead.",
};

export function CopyPanel({ data }: { data: ProfileData }) {
  const toast = useToast();
  const failed = () => toast.show(COPY_FAILED);
  const { person, links } = data.profile;
  const [jobId, setJobId] = useState(data.jobs[0]?.id ?? "");
  const kit = data.kits[jobId];

  const standard = [
    { key: "name", label: "Name", value: person.fullName },
    { key: "email", label: "Email", value: person.email },
    { key: "phone", label: "Phone", value: person.phone },
    ...links.map((link) => ({
      key: `link:${link.id}`,
      label: link.label,
      value: link.url,
      mono: true,
    })),
    // Labels are unique ignoring case (K-18).
    ...data.answers.map((a) => ({ key: `answer:${a.label}`, ...a })),
  ].filter((field) => field.value !== "");

  return (
    <>
      {standard.length > 0 && (
        <div className="grid gap-3 tablet:grid-cols-2">
          {standard.map(({ key, ...field }) => (
            <CopyField key={key} {...field} onCopyFailed={failed} />
          ))}
        </div>
      )}
      {data.jobs.length > 0 && (
        <div className="flex flex-col gap-3 pt-3 tablet:pt-2">
          <div className="tablet:max-w-(--size-form)">
            <Select
              label="Answers for"
              value={jobId}
              options={data.jobs.map((job) => [
                job.id,
                `${job.company} · ${job.role}`,
              ])}
              onChange={setJobId}
            />
          </div>
          {kit && <JobAnswers kit={kit} onCopyFailed={failed} />}
        </div>
      )}
    </>
  );
}

function JobAnswers({
  kit,
  onCopyFailed,
}: {
  kit: ProfileData["kits"][string];
  onCopyFailed: () => void;
}) {
  const fields = [
    { key: "intro", label: "Tell me about yourself", value: kit.intro },
    {
      key: "salary",
      label: "Salary range",
      value: kit.salary ? formatSalaryRange(kit.salary) : "",
    },
    ...kit.answers.map((a) => ({
      key: `q:${a.question}`,
      label: a.question,
      value: a.answer,
    })),
  ].filter((field) => field.value !== "");
  if (fields.length === 0)
    return (
      <p className="text-sm text-ink-muted">
        No answers for this job yet: ask Claude to prepare them.
      </p>
    );
  return fields.map(({ key, ...field }) => (
    <CopyField
      key={key}
      {...field}
      long={field.label !== "Salary range"}
      onCopyFailed={onCopyFailed}
    />
  ));
}
