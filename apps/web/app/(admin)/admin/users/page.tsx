import { getAllUsers } from '@/lib/admin'
import { UserActionsClient, CreateUserButton } from './UsersActionsClient'
import { Users } from 'lucide-react'

export const metadata = { title: 'Usuários — Admin' }

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export default async function UsersPage() {
  const users = await getAllUsers()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Usuários</h1>
          <p className="text-sm text-muted-foreground">{users.length} usuários cadastrados na plataforma</p>
        </div>
        <CreateUserButton />
      </div>

      <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/30">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Email</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Organização</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Criado em</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Último acesso</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {users.map((user: any) => {
              const isBanned = !!user.banned_until && new Date(user.banned_until) > new Date()
              const org = user.member?.organizations
              const orgName = Array.isArray(org) ? org[0]?.name : org?.name
              const orgSlug = Array.isArray(org) ? org[0]?.slug : org?.slug

              return (
                <tr key={user.id} className="hover:bg-muted/20">
                  <td className="px-4 py-3">
                    <p className="font-medium">{user.email}</p>
                    <p className="text-xs text-muted-foreground font-mono">{user.id.slice(0, 8)}…</p>
                  </td>
                  <td className="px-4 py-3">
                    {orgName ? (
                      <div>
                        <p className="text-sm">{orgName}</p>
                        <p className="text-xs text-muted-foreground">{orgSlug}</p>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(user.created_at)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(user.last_sign_in_at)}</td>
                  <td className="px-4 py-3">
                    {isBanned ? (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                        Bloqueado
                      </span>
                    ) : (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                        Ativo
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <UserActionsClient
                      userId={user.id}
                      email={user.email ?? ''}
                      isBanned={isBanned}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {users.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
            <Users className="h-8 w-8 opacity-40" />
            <p className="text-sm">Nenhum usuário encontrado.</p>
          </div>
        )}
      </div>
    </div>
  )
}
