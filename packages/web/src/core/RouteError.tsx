import { isRouteErrorResponse, useNavigate, useRouteError } from "react-router";
import { Button } from "../components/ui";
import { Failure, failureKind } from "./failure";

/**
 * Replaces React Router's default error page. Inside the shell it stands in for
 * the screen that failed, so navigation still works; `bare` is for a failure
 * in the shell itself. A render error can't be retried in place: Reload.
 */
export function RouteError({ bare }: { bare?: boolean }) {
  const error = useRouteError();
  const navigate = useNavigate();
  const kind = failureKind(error);
  const code = isRouteErrorResponse(error) ? String(error.status) : undefined;

  const failure = (
    <Failure
      kind={kind}
      title={kind === "error" ? "This screen hit a problem" : undefined}
      code={code}
      actions={
        <>
          <Button onClick={() => window.location.reload()}>Reload</Button>
          <Button
            variant="outline"
            tone="neutral"
            onClick={() => navigate("/")}
          >
            Go to Home
          </Button>
        </>
      }
    >
      {kind === "error" ? "Reloading usually fixes it." : undefined}
    </Failure>
  );

  return bare ? <main className="p-4">{failure}</main> : failure;
}
