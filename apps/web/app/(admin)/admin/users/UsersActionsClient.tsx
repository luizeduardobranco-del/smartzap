'use client'

import { useState } from 'react'
import { Loader2, Ban, CheckCircle, KeyRound, Trash2, UserPlus, X } from 'lucide-react'

interface UserActionsProps {
  userId: string
  email: string
  isBanned: boolean
}

export function UserActionsClient({ userId, email, isBanned }: UserActionsProps) {
  const [loading, setLoading] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  async function doAction(action: string) {
    setLoading(action)
    setDone(null)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, email, action }),
      })
      const json = await res.json()
      if (action === 'reset_password') {
        setDone('Email de redefinição enviado!')
        setTimeout(() => setDone(null), 3000)
      } else {
        window.location.reload()
      }
    } finally {
      setLoading(null)
    }
  }

  async function deleteUser() {
    if (!confirm(`Tem certeza que deseja excluir o usuário ${email}? Esta ação não pode ser desfeita.`)) return
    setLoading('delete')
    await fetch('/api/admin/users', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    })
    setLoading(null)
    window.location.reload()
  }

  return (
    <div className="flex items-center gap-1">
      {done && (
        <span className="text-xs text-green-600 font-medium mr-1">{done}</span>
      )}
      {isBanned ? (
        <button
          onClick={() => doAction('unblock')}
          disabled={!!loading}
          title="Desbloquear usuário"
          className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-green-600 disabled:opacity-50"
        >
          {loading === 'unblock' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
        </button>
      ) : (
        <button
          onClick={() => doAction('block')}
          disabled={!!loading}
          title="Bloquear usuário"
          className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-red-600 disabled:opacity-50"
        >
          {loading === 'block' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}
        </button>
      )}
      <button
        onClick={() => doAction('reset_password')}
        disabled={!!loading}
        title="Redefinir senha"
        className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-blue-600 disabled:opacity-50"
      >
        {loading === 'reset_password' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
      </button>
      <button
        onClick={deleteUser}
        disabled={!!loading}
        title="Excluir usuário"
        className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-red-600 disabled:opacity-50"
      >
        {loading === 'delete' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
      </button>
    </div>
  )
}

interface CreateUserModalProps {
  onClose: () => void
}

function CreateUserModal({ onClose }: CreateUserModalProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!email || !password) { setError('Preencha todos os campos.'); return }
    setLoading(true)
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create', email, password }),
    })
    const json = await res.json()
    setLoading(false)
    if (!res.ok) { setError(json.error ?? 'Erro ao criar usuário.'); return }
    window.location.reload()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl border bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="font-semibold">Criar novo usuário</h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleCreate} className="space-y-4 p-5">
          <div>
            <label className="mb-1 block text-sm font-medium">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
              placeholder="usuario@exemplo.com"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Senha temporária</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
              placeholder="Mínimo 8 caracteres"
              minLength={8}
              required
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60"
            >
              {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Criar usuário
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export function CreateUserButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
      >
        <UserPlus className="h-4 w-4" />
        Criar usuário
      </button>
      {open && <CreateUserModal onClose={() => setOpen(false)} />}
    </>
  )
}
