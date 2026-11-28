import { useEffect, useId, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { Button, Dialog, toast } from "@helix/ui";
import {
  datasetKeys,
  describeError,
  useDatasetSource,
  useSharing,
  type DatasetSummary,
  type Sharing,
  type SharingEntry,
} from "../../api/datasets";
import { useRoles, useUsers } from "../../api/admin";
import { t } from "../../i18n";

const controlClass =
  "h-9 rounded-control border border-border-strong bg-surface px-2.5 text-fg";

/** Who a dataset is shared with: everyone who can use datasets, or only the users and roles listed. */
export function ShareDialog({
  dataset,
  onClose,
}: {
  dataset: DatasetSummary | null;
  onClose: () => void;
}) {
  const api = useDatasetSource();
  const queryClient = useQueryClient();
  const current = useSharing(dataset?.id ?? null);
  const users = useUsers();
  const roles = useRoles();
  const [sharing, setSharing] = useState<Sharing | null>(null);
  const [draft, setDraft] = useState<SharingEntry>({
    recipient: "",
    type: "USER",
    access: "READ",
  });
  const id = useId();

  useEffect(() => {
    setSharing(current.data ? structuredClone(current.data.sharing) : null);
  }, [current.data]);
  useEffect(() => {
    setDraft({ recipient: "", type: "USER", access: "READ" });
  }, [dataset?.id]);

  const save = useMutation({
    // Shared with everyone, nobody needs listing (the server refuses entries then).
    mutationFn: () =>
      api.setSharing(
        dataset!.id,
        sharing!.restricted ? sharing! : { restricted: false, entries: [] },
        current.data!.version,
      ),
    onSuccess: () => {
      toast(t("datasets.share.saved", { name: dataset!.name }));
      void queryClient.invalidateQueries({
        queryKey: datasetKeys.sharing(dataset!.id),
      });
      onClose();
    },
    onError: (e: Error) =>
      toast(t("datasets.share.failed", { message: describeError(e) }), {
        tone: "danger",
      }),
  });

  const add = () => {
    const recipient = draft.recipient.trim();
    if (!sharing || !recipient) return;
    const others = sharing.entries.filter(
      (e) => !(e.recipient === recipient && e.type === draft.type),
    );
    setSharing({ ...sharing, entries: [...others, { ...draft, recipient }] });
    setDraft({ ...draft, recipient: "" });
  };
  const suggestions =
    draft.type === "USER" ? (users.data ?? []) : (roles.data ?? []);

  return (
    <Dialog
      open={dataset !== null}
      onClose={() => !save.isPending && onClose()}
      title={t("datasets.share.title", { name: dataset?.name ?? "" })}
      description={t("datasets.share.ownerNote")}
      actions={
        <>
          <Button size="sm" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            size="sm"
            variant="primary"
            disabled={!sharing || save.isPending}
            onClick={() => save.mutate()}
          >
            {t("datasets.share.save")}
          </Button>
        </>
      }
    >
      {current.isPending || !sharing ? (
        <p className="m-0 text-fg-muted">
          {current.isError
            ? describeError(current.error)
            : t("datasets.loading")}
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
            <legend className="mb-1.5 p-0 font-semibold">
              {t("datasets.share.who")}
            </legend>
            {[false, true].map((restricted) => (
              <label
                key={String(restricted)}
                className="flex items-center gap-2"
              >
                <input
                  type="radio"
                  name={`${id}-who`}
                  checked={sharing.restricted === restricted}
                  onChange={() => setSharing({ ...sharing, restricted })}
                  className="accent-[var(--hx-accent)]"
                />
                {restricted
                  ? t("datasets.share.restricted")
                  : t("datasets.share.everyone")}
              </label>
            ))}
          </fieldset>

          {sharing.restricted && (
            <>
              <div className="flex flex-col gap-2">
                <p className="m-0 font-semibold">
                  {t("datasets.share.listedRestricted")}
                </p>
                {sharing.entries.length === 0 ? (
                  <p className="m-0 text-[13px] text-fg-muted">
                    {t("datasets.share.none")}
                  </p>
                ) : (
                  <ul
                    aria-label={t("datasets.share.entries")}
                    className="m-0 flex list-none flex-col gap-1 p-0"
                  >
                    {sharing.entries.map((e, i) => (
                      <li
                        key={`${e.type}:${e.recipient}`}
                        className="flex items-center gap-2 rounded-control bg-divider/50 px-2.5 py-1.5 text-[13.5px]"
                      >
                        <span className="min-w-0 flex-1 truncate">
                          <span className="font-semibold">{e.recipient}</span>{" "}
                          <span className="text-fg-muted">
                            {t(`datasets.share.types.${e.type}`)}
                          </span>
                        </span>
                        <select
                          aria-label={t("datasets.share.accessOf", {
                            name: e.recipient,
                          })}
                          value={e.access}
                          onChange={(ev) =>
                            setSharing({
                              ...sharing,
                              entries: sharing.entries.map((x, j) =>
                                j === i
                                  ? {
                                      ...x,
                                      access: ev.target
                                        .value as SharingEntry["access"],
                                    }
                                  : x,
                              ),
                            })
                          }
                          className="h-8 rounded-control border border-border bg-surface px-2 text-fg"
                        >
                          <option value="READ">
                            {t("datasets.share.access.READ")}
                          </option>
                          <option value="WRITE">
                            {t("datasets.share.access.WRITE")}
                          </option>
                        </select>
                        <button
                          type="button"
                          aria-label={t("datasets.share.remove", {
                            name: e.recipient,
                          })}
                          title={t("datasets.share.remove", {
                            name: e.recipient,
                          })}
                          onClick={() =>
                            setSharing({
                              ...sharing,
                              entries: sharing.entries.filter(
                                (_, j) => j !== i,
                              ),
                            })
                          }
                          className="grid size-8 place-items-center rounded-control text-fg-muted hover:bg-divider hover:text-fg"
                        >
                          <X size={15} aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="flex flex-wrap items-end gap-2 border-t border-divider pt-3">
                <select
                  aria-label={t("datasets.share.type")}
                  value={draft.type}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      type: e.target.value as SharingEntry["type"],
                    })
                  }
                  className={controlClass}
                >
                  <option value="USER">{t("datasets.share.types.USER")}</option>
                  <option value="ROLE">{t("datasets.share.types.ROLE")}</option>
                </select>
                <input
                  aria-label={t("datasets.share.recipient")}
                  placeholder={t("datasets.share.recipient")}
                  list={`${id}-names`}
                  value={draft.recipient}
                  onChange={(e) =>
                    setDraft({ ...draft, recipient: e.target.value })
                  }
                  onKeyDown={(e) =>
                    e.key === "Enter" && (e.preventDefault(), add())
                  }
                  className={`${controlClass} min-w-[160px] flex-1`}
                />
                <datalist id={`${id}-names`}>
                  {suggestions.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
                <select
                  aria-label={t("datasets.share.access.label")}
                  value={draft.access}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      access: e.target.value as SharingEntry["access"],
                    })
                  }
                  className={controlClass}
                >
                  <option value="READ">
                    {t("datasets.share.access.READ")}
                  </option>
                  <option value="WRITE">
                    {t("datasets.share.access.WRITE")}
                  </option>
                </select>
                <Button
                  size="sm"
                  onClick={add}
                  disabled={!draft.recipient.trim()}
                >
                  {t("datasets.share.add")}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </Dialog>
  );
}
