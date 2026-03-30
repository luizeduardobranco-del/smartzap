'use client'

import { useState } from 'react'
import { Shield, Info, Users, Loader2, UserPlus, CheckCircle2, Lock } from 'lucide-react'

interface Admin {
  id: string
  user_id: string
  created_at: string
  email: string
}

interface Props {
  admins: Admin[]
}

type Tab = 'sistema' | 'administradores' | 'seguranca'

export function SettingsClient({ admins }: Props) {
  const [tab, setTab] = useState<Tab>('sistema')
  const [newAdminEmail, setNewAdminEmail] = useState('')
  const [addLoading, setAddLoading] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [addSuccess, setAddSuccess] = useState(false)

  const tabs: { key: Tab; label: string }[] = [
    { key: 'sistema', label: 'Sistema' },
    { key: 'administradores', label: 'Administradores' },
    { key: 'seguranca', label: 'Segurança' },
  ]

  async function handleAddAdmin(e: React.FormEvent) {
    e.preventDefault()
    setAddError(null)
    setAddSuccess(false)
    if (!newAdminEmail) { setAddError('Digite um email.'); return }
    setAddLoading(true)
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'add_platform_admin', email: newAdminEmail }),
    })
    const json = await res.json()
    setAddLoading(false)
    if (!res.ok) {
      setAddError(json.error ?? 'Erro ao adicionar administrador.')
      return
    }
    setAddSuccess(true)
    setNewAdminEmail('')
    setTimeout(() => window.location.reload(), 1000)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Configurações do sistema</h1>
        <p className="text-sm text-muted-foreground">Configurações gerais e de segurança da plataforma</p>
      </div>

      {/* Tabs */}
      <div className="border-b flex gap-0">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Sistema */}
      {tab === 'sistema' && (
        <div className="space-y-4">
          <div className="rounded-xl border bg-white shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <Info className="h-5 w-5 text-primary" />
              <h2 className="font-semibold">Informações da plataforma</h2>
            </div>
            <div className="space-y-3">
              <InfoRow label="Nome da plataforma" value="White Zap" />
              <InfoRow label="URL do sistema" value="atendente.whiteerp.com" />
              <InfoRow label="Versão" value="1.0.0" />
              <InfoRow label="Ambiente" value={process.env.NODE_ENV === 'production' ? 'Produção' : 'Desenvolvimento'} />
              <InfoRow label="Banco de dados" value="Supabase (PostgreSQL)" />
              <InfoRow label="Autenticação" value="Supabase Auth" />
            </div>
          </div>

          <div className="rounded-xl border bg-amber-50 border-amber-200 p-5">
            <div className="flex items-start gap-3">
              <Info className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-amber-800">Configurações somente leitura</p>
                <p className="text-xs text-amber-700 mt-1">
                  As configurações acima são definidas via variáveis de ambiente. Para alterá-las, atualize as variáveis no painel do Vercel e faça um novo deploy.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Administradores */}
      {tab === 'administradores' && (
        <div className="space-y-4">
          <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
            <div className="border-b px-5 py-4 flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              <h2 className="font-semibold">Administradores da plataforma</h2>
              <span className="ml-auto rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">{admins.length}</span>
            </div>
            <div className="divide-y">
              {admins.map((admin) => (
                <div key={admin.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className="text-sm font-medium">{admin.email}</p>
                    <p className="text-xs text-muted-foreground">
                      ID: {admin.user_id.slice(0, 12)}… · Adicionado em {new Date(admin.created_at).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                  <span className="rounded-full bg-primary/10 text-primary px-2.5 py-0.5 text-xs font-medium">
                    Super Admin
                  </span>
                </div>
              ))}
              {admins.length === 0 && (
                <p className="px-5 py-8 text-center text-sm text-muted-foreground">Nenhum administrador encontrado.</p>
              )}
            </div>
          </div>

          {/* Add admin */}
          <div className="rounded-xl border bg-white shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <UserPlus className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">Adicionar administrador</h3>
            </div>
            <form onSubmit={handleAddAdmin} className="flex gap-3">
              <input
                type="email"
                value={newAdminEmail}
                onChange={(e) => setNewAdminEmail(e.target.value)}
                placeholder="email@exemplo.com"
                className="flex-1 rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
              />
              <button
                type="submit"
                disabled={addLoading}
                className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60"
              >
                {addLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Adicionar
              </button>
            </form>
            {addError && <p className="mt-2 text-sm text-red-600">{addError}</p>}
            {addSuccess && (
              <div className="mt-2 flex items-center gap-1.5 text-sm text-green-700">
                <CheckCircle2 className="h-4 w-4" />
                Administrador adicionado com sucesso!
              </div>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              O usuário precisa já ter uma conta na plataforma. Adicionar um administrador concede acesso total ao painel admin.
            </p>
          </div>
        </div>
      )}

      {/* Segurança */}
      {tab === 'seguranca' && (
        <div className="space-y-4">
          <div className="rounded-xl border bg-white shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <Shield className="h-5 w-5 text-green-600" />
              <h2 className="font-semibold">Configurações de segurança</h2>
            </div>
            <div className="space-y-3">
              <SecurityRow
                title="Row Level Security (RLS)"
                description="Todas as tabelas do banco de dados têm RLS ativado. Os dados são isolados por organização."
                status="ativo"
              />
              <SecurityRow
                title="Service Role Key"
                description="A chave de serviço do Supabase é usada apenas no servidor para operações administrativas que bypassam o RLS. Nunca exposta ao cliente."
                status="seguro"
              />
              <SecurityRow
                title="Verificação de admin"
                description="Todas as rotas da API admin verificam se o usuário autenticado está na tabela platform_admins antes de executar qualquer operação."
                status="ativo"
              />
              <SecurityRow
                title="Autenticação"
                description="Sessões gerenciadas pelo Supabase Auth com tokens JWT de curta duração. Refresh automático via middleware."
                status="ativo"
              />
              <SecurityRow
                title="Tabela platform_admins"
                description="A tabela de administradores tem RLS bloqueando acesso direto. Somente o service role pode ler/escrever nela, garantindo que usuários comuns não podem verificar quem é admin."
                status="protegido"
              />
            </div>
          </div>

          <div className="rounded-xl border border-blue-200 bg-blue-50 p-5">
            <div className="flex items-start gap-3">
              <Lock className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-blue-800">Boas práticas de segurança ativas</p>
                <ul className="mt-2 space-y-1 text-xs text-blue-700 list-disc list-inside">
                  <li>Service role key armazenada apenas como variável de ambiente servidor</li>
                  <li>Nenhum dado sensível exposto ao cliente</li>
                  <li>Todas as mutações requerem autenticação e verificação de admin</li>
                  <li>Senhas hasheadas pelo Supabase Auth (bcrypt)</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  )
}

function SecurityRow({ title, description, status }: { title: string; description: string; status: string }) {
  const colors: Record<string, string> = {
    ativo: 'bg-green-100 text-green-700',
    seguro: 'bg-blue-100 text-blue-700',
    protegido: 'bg-purple-100 text-purple-700',
  }
  return (
    <div className="flex items-start gap-4 rounded-lg border bg-muted/20 p-4">
      <Shield className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium">{title}</p>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${colors[status] ?? 'bg-gray-100 text-gray-600'}`}>
            {status}
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      </div>
    </div>
  )
}
