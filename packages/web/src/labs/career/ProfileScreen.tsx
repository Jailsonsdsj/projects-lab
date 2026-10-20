// The Profile tab (docs/prd/20-career-profile.md § Screens): the photo and the
// copy panel from the bundle's "Profile copy panel" screens, then the records
// they come from, each editable in a sheet. One read loads everything it
// copies; a write reads again in the background.
import {
  isPhotoType,
  PHOTO_MAX_BYTES,
  type ProfilePerson,
} from "@projects-lab/shared/career";
import { useRef, useState } from "react";
import {
  Button,
  Dialog,
  EmptyState,
  ImageTile,
  Skeleton,
  useMinWidth,
  useToast,
} from "../../components/ui";
import { failureKind } from "../../core/failure";
import { ReadView } from "../../core/ReadView";
import { CopyPanel } from "./CopyPanel";
import { fetchProfileData, isEmptyProfile, type ProfileData } from "./data";
import { send } from "./FormSheet";
import { type Editing, EditSheets, ProfileRecords } from "./ProfileRecords";

/** The photo route reads the session cookie, so a plain <img> can load it. */
export const PHOTO_URL = "/api/career/photo";

/** A new upload changes the person's updatedAt, so the <img> reloads. */
const photoSrc = (person: ProfilePerson | undefined) =>
  person?.photo
    ? `${PHOTO_URL}?v=${encodeURIComponent(person.updatedAt ?? "")}`
    : undefined;

function PhotoControls({
  hasPhoto,
  onChanged,
}: {
  hasPhoto: boolean;
  onChanged: (message: string) => void;
}) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function write(run: () => Promise<Response>, done: string) {
    setBusy(true);
    try {
      const response = await run();
      if (response.ok) return onChanged(done);
      const body = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;
      toast.show({
        tone: "danger",
        message: body?.message ?? "Couldn't change the photo. Try again.",
      });
    } catch (error) {
      toast.show({
        tone: failureKind(error) === "offline" ? "warning" : "danger",
        message:
          failureKind(error) === "offline"
            ? "You're offline: change the photo once you're back online."
            : "Couldn't change the photo. Try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-2 pt-2">
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        tabIndex={-1}
        aria-label="Photo file"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          if (!isPhotoType(file.type))
            return toast.show({
              tone: "danger",
              message: "A photo is JPEG, PNG or WebP.",
            });
          if (file.size > PHOTO_MAX_BYTES)
            return toast.show({
              tone: "danger",
              message: "A photo is at most 2 MB.",
            });
          void write(
            () => send("PUT", PHOTO_URL, file, file.type),
            "Photo updated",
          );
        }}
      />
      <Button
        size="sm"
        variant="soft"
        tone="neutral"
        loading={busy}
        onClick={() => input.current?.click()}
      >
        {hasPhoto ? "Change photo" : "Add a photo"}
      </Button>
      {hasPhoto && (
        <Button
          size="sm"
          variant="ghost"
          tone="danger"
          disabled={busy}
          onClick={() => setConfirming(true)}
        >
          Remove photo
        </Button>
      )}
      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        tone="danger"
        icon="trash"
        title="Remove your photo?"
        actions={
          <>
            <Button
              variant="outline"
              tone="neutral"
              onClick={() => setConfirming(false)}
            >
              Keep it
            </Button>
            <Button
              tone="danger"
              onClick={() => {
                setConfirming(false);
                void write(() => send("DELETE", PHOTO_URL), "Photo removed");
              }}
            >
              Remove
            </Button>
          </>
        }
      >
        Your initials show instead.
      </Dialog>
    </div>
  );
}

function Header({
  data,
  onChanged,
}: {
  data: ProfileData | null;
  onChanged?: (message: string) => void;
}) {
  const tablet = useMinWidth("--breakpoint-tablet");
  const person = data?.profile.person;
  return (
    <div className="flex items-center gap-4 px-4 pt-1 pb-2 tablet:gap-5 tablet:px-8 tablet:pt-12">
      <ImageTile
        round
        size={tablet ? "lg" : "md"}
        name={person?.fullName || "Profile"}
        src={photoSrc(person)}
      />
      <div className="phead__large p-0">
        <h1>Profile</h1>
        <span className="phead__sub">
          {tablet
            ? "Tap Copy, then paste into the application form"
            : "Tap Copy, then paste into the form"}
        </span>
        {data && onChanged && (
          <PhotoControls
            hasPhoto={Boolean(person?.photo)}
            onChanged={onChanged}
          />
        )}
      </div>
    </div>
  );
}

const SKELETON = (
  <div className="flex flex-col gap-3 px-4 tablet:px-8">
    <Skeleton shape="title" width="40%" />
    <Skeleton shape="block" />
    <Skeleton shape="block" />
    <Skeleton shape="block" />
  </div>
);

export function ProfileScreen() {
  const toast = useToast();
  const [refresh, setRefresh] = useState(0);
  const [editing, setEditing] = useState<(Editing & { opened: number }) | null>(
    null,
  );
  const edit = (next: Editing) =>
    setEditing({ ...next, opened: (editing?.opened ?? 0) + 1 });
  const changed = (message: string) => {
    setEditing(null);
    setRefresh((n) => n + 1);
    toast.show({ tone: "success", message });
  };

  return (
    <ReadView
      load={fetchProfileData}
      refresh={refresh}
      skeleton={
        <>
          <Header data={null} />
          {SKELETON}
        </>
      }
      empty={null}
    >
      {(data) => {
        if (isEmptyProfile(data))
          return (
            <>
              <Header data={null} />
              <EmptyState
                icon="user"
                title="Your profile is empty"
                actions={
                  <Button onClick={() => edit({ kind: "person" })}>
                    Add your details
                  </Button>
                }
              >
                Ask Claude to import your master resume, or add your details
                here.
              </EmptyState>
              <EditSheets
                editing={editing}
                profile={data.profile}
                onClose={() => setEditing(null)}
                onDone={changed}
              />
            </>
          );
        return (
          <>
            <Header data={data} onChanged={changed} />
            <div className="flex flex-col gap-3 px-4 pb-6 tablet:gap-5 tablet:px-8">
              <CopyPanel data={data} />
              <ProfileRecords profile={data.profile} edit={edit} />
            </div>
            <EditSheets
              editing={editing}
              profile={data.profile}
              onClose={() => setEditing(null)}
              onDone={changed}
            />
          </>
        );
      }}
    </ReadView>
  );
}
