import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Lock } from 'lucide-react';
import { Card, Checkbox, toast } from '@helix/ui';
import { adminKeys, useAdminSource, useRolePermissions, type RolePermissions } from '../../api/admin';
import { QueryError } from '../files/QueryError';

/**
 * What each role may do in the platform (the GWT "System Roles" panel): a roles × permissions
 * matrix. Each tick saves that one role. Roles the server marks immutable are read-only.
 */
export function PermissionsTab() {
  const source = useAdminSource();
  const queryClient = useQueryClient();
  const data = useRolePermissions();

  const save = useMutation({
    mutationFn: ({ role, granted }: { role: string; granted: string[] }) => source.setRolePermissions(role, granted),
    onMutate: async ({ role, granted }) => {
      await queryClient.cancelQueries({ queryKey: adminKeys.permissions });
      const previous = queryClient.getQueryData<RolePermissions>(adminKeys.permissions);
      if (previous) {
        queryClient.setQueryData<RolePermissions>(adminKeys.permissions, {
          ...previous,
          roles: previous.roles.map((r) => (r.name === role ? { ...r, granted } : r)),
        });
      }
      return { previous };
    },
    onSuccess: (_, { role }) => toast(`Saved permissions for ${role}`),
    onError: (e: Error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(adminKeys.permissions, context.previous);
      toast(`Couldn't save: ${e.message}`, { tone: 'danger' });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: adminKeys.permissions }),
  });

  if (data.isError) return <QueryError error={data.error} onRetry={() => void data.refetch()} />;
  if (data.isPending) return <p className="m-0 text-fg-muted">Loading permissions…</p>;
  const { permissions, roles } = data.data;

  return (
    <Card className="overflow-hidden">
      <p className="m-0 border-b border-divider px-[18px] py-3.5 text-fg-muted">
        What members of each role may do. Changes apply the next time a user signs in.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-left">
          <caption className="sr-only">Permissions by role</caption>
          <thead>
            <tr className="text-[12px] text-fg-muted">
              <th scope="col" className="px-[18px] py-2.5 font-semibold">
                Role
              </th>
              {permissions.map((p) => (
                <th key={p.id} scope="col" className="px-2 py-2.5 text-center font-semibold">
                  {p.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {roles.map((role) => (
              <tr key={role.name} className="border-t border-divider hover:bg-bg">
                <th scope="row" className="px-[18px] py-2.5 text-left font-semibold">
                  <span className="flex items-center gap-2">
                    {role.immutable && <Lock size={13} className="text-fg-muted" aria-label="Can't be changed" />}
                    {role.name}
                  </span>
                </th>
                {permissions.map((p) => {
                  const on = role.granted.includes(p.id);
                  return (
                    <td key={p.id} className="px-2 py-2.5 text-center">
                      <Checkbox
                        aria-label={`${p.label} for ${role.name}`}
                        checked={on}
                        disabled={role.immutable || save.isPending}
                        onChange={(checked) =>
                          save.mutate({
                            role: role.name,
                            granted: checked ? [...role.granted, p.id] : role.granted.filter((g) => g !== p.id),
                          })
                        }
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
