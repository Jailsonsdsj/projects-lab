// The Profile tab (docs/prd/20-career-profile.md § Screens): the photo and the
// copy panel from the bundle's "Profile copy panel" screens. One read loads
// everything it copies.
import {
  EmptyState,
  ImageTile,
  Skeleton,
  useMinWidth,
} from "../../components/ui";
import { ReadView } from "../../core/ReadView";
import { CopyPanel } from "./CopyPanel";
import { fetchProfileData, isEmptyProfile, type ProfileData } from "./data";

/** The photo route reads the session cookie, so a plain <img> can load it. */
export const PHOTO_URL = "/api/career/photo";

async function load(signal: AbortSignal): Promise<ProfileData | null> {
  const data = await fetchProfileData(signal);
  return isEmptyProfile(data) ? null : data;
}

function Header({ data }: { data: ProfileData | null }) {
  const tablet = useMinWidth("--breakpoint-tablet");
  const person = data?.profile.person;
  return (
    <div className="flex items-center gap-4 px-4 pt-1 pb-2 tablet:gap-5 tablet:px-8 tablet:pt-12">
      <ImageTile
        round
        size={tablet ? "lg" : "md"}
        name={person?.fullName || "Profile"}
        src={person?.photo ? PHOTO_URL : undefined}
      />
      <div className="phead__large p-0">
        <h1>Profile</h1>
        <span className="phead__sub">
          {tablet
            ? "Tap Copy, then paste into the application form"
            : "Tap Copy, then paste into the form"}
        </span>
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
  return (
    <ReadView
      load={load}
      skeleton={
        <>
          <Header data={null} />
          {SKELETON}
        </>
      }
      empty={
        <>
          <Header data={null} />
          <EmptyState icon="user" title="Your profile is empty">
            Ask Claude to import your master resume, or to add your details.
          </EmptyState>
        </>
      }
    >
      {(data) => (
        <>
          <Header data={data} />
          <div className="flex flex-col gap-3 px-4 pb-6 tablet:gap-5 tablet:px-8">
            <CopyPanel data={data} />
          </div>
        </>
      )}
    </ReadView>
  );
}
